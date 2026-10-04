// 14 작업 지도 v2.0 — 화면이 읽는 데이터(폴더·리스트·할 일·연결선·이번 주 목표·메모)와 보기 설정(기기 기억 sprout.map.*)
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '../../data/useQuery'
import { buildMapTree, filterTasks, type MapFilter, type MapFolder, type MapGoal, type MapLink, type MapList, type MapTask } from '../../data/map'
import { groupMap, type GroupBy } from '../../data/mapGrouping'
import { nowStrip, remainingPath, taskStates, unlockCounts, type RemainingPath } from '../../data/mapNow'
import { nextWeek, thisWeek } from '../../data/growth'
import { chipFor } from '../../data/listSuggest'
import { useSuggestState } from '../listSuggest/ListSuggest'
import { addDays } from '@sprout/schema/time'
import { dayKey } from '../../lib/dates'

export type LinkRow = MapLink & { from_status: number | null; from_title: string | null; from_deleted: string | null; to_title: string | null; to_status: number | null }
const LINKS_SQL = `SELECT ml.id, ml.kind, ml.from_type, ml.from_id, ml.to_id, ml.source, ml.state, ml.created_at,
  f.status AS from_status, f.title AS from_title, f.deleted_at AS from_deleted, t.title AS to_title, t.status AS to_status
  FROM map_links ml LEFT JOIN tasks f ON f.id = ml.from_id LEFT JOIN tasks t ON t.id = ml.to_id WHERE t.deleted_at IS NULL`
const TASKS_SQL = `SELECT id, title, status, due_at, start_at, priority, list_id, completed_at, created_at, parent_id FROM tasks
  WHERE deleted_at IS NULL AND (status = 0 OR (status = 1 AND completed_at >= ?)) ORDER BY sort_order, created_at`
const PROGRESS_SQL = `SELECT list_id AS id, sum(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS done, count(*) AS total
  FROM tasks WHERE deleted_at IS NULL AND status IN (0, 1) AND list_id IS NOT NULL GROUP BY list_id`
const FOLDERS_SQL = 'SELECT id, name, sort_order FROM folders ORDER BY sort_order'
const LISTS_SQL = 'SELECT id, name, emoji, color, folder_id, kind, sort_order, archived_at FROM lists ORDER BY sort_order'
const GOALS_SQL = 'SELECT id, title, target, progress, status, week_start, achieved_at, source, sort_order FROM kpis WHERE week_start = ? ORDER BY sort_order'
const MEMOS_SQL = "SELECT id, content, task_id FROM notes WHERE task_id IS NOT NULL AND task_id != ''"

// ── 기기 기억 ──
export function useStored<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const s = localStorage.getItem(`sprout.map.${key}`); return s ? { ...initial as object, ...JSON.parse(s) } as T : initial } catch { return initial }
  })
  const set = useCallback((v: T | ((p: T) => T)) => setValue((prev) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
    try { localStorage.setItem(`sprout.map.${key}`, JSON.stringify(next)) } catch { /* 기억만 못 한다 */ }
    return next
  }), [key])
  return [value, set]
}
export function useStoredValue<T extends string | number>(key: string, initial: T): [T, (v: T) => void] {
  const [box, set] = useStored<{ v: T }>(key, { v: initial })
  return [box.v, useCallback((v: T) => set({ v }), [set])]
}

/** groupBy = 31 §3 묶기(기기 기억) · goalWeek = 목표 묶기일 때 기간 세그먼트(이번 주 · 다음 주) */
export type MapOptions = MapFilter & { showMemos: boolean; groupBy: GroupBy; goalWeek: 'this' | 'next' }
export const DEFAULT_OPTIONS: MapOptions = { period: 'week', showDone: false, showNoDate: true, lists: null, showMemos: false, groupBy: 'list', goalWeek: 'this' }
const XP_SQL = 'SELECT x.ref_id FROM xp_events x JOIN kpis k ON k.id = x.ref_id WHERE k.week_start = ? GROUP BY x.ref_id HAVING sum(x.amount) > 0'

export function useMapData(opts: MapOptions, view: 'graph' | 'board' | 'timeline') {
  const today = dayKey()
  const week = thisWeek()
  const goalWeek = opts.groupBy === 'goal' && opts.goalWeek === 'next' ? nextWeek() : week
  // 완료한 것: 이번 주(그래프 이번 주) 또는 최근 30일(완료 보이기)
  const doneSince = new Date(`${opts.showDone ? addDays(today, -30) : week}T00:00`).toISOString()
  const folders = useQuery<MapFolder>(FOLDERS_SQL)
  const lists = useQuery<MapList>(LISTS_SQL)
  const links = useQuery<LinkRow>(LINKS_SQL)
  const rawTasks = useQuery<MapTask>(TASKS_SQL, [doneSince])
  const goals = useQuery<MapGoal>(GOALS_SQL, [goalWeek])
  const earned = useQuery<{ ref_id: string }>(XP_SQL, [goalWeek])
  const memoRows = useQuery<{ id: string; content: string | null; task_id: string }>(MEMOS_SQL)
  const progressRows = useQuery<{ id: string; done: number; total: number }>(PROGRESS_SQL)
  const suggest = useSuggestState()
  const loaded = !!(folders && lists && links && rawTasks && goals)

  return useMemo(() => {
    // 보드·타임라인은 기간 없이 "전체", 그래프는 기간 세그먼트를 따른다(목표 묶기면 기간 = 목표 주, 할 일은 전체)
    const filter: MapFilter = { ...opts, period: view !== 'graph' || opts.groupBy === 'goal' ? 'all' : opts.period }
    const tasks = filterTasks(rawTasks ?? [], filter, today)
    const tree = buildMapTree(folders ?? [], lists ?? [], tasks, { only: opts.lists })
    const grouped = groupMap(opts.groupBy, { folders: folders ?? [], lists: lists ?? [], tasks, links: links ?? [], goals: goals ?? [], only: opts.lists })
    const goalOf = new Set<string>()
    const goalIds = new Set((goals ?? []).map((g) => g.id))
    const goalCount = new Map<string, number>() // 할 일 → 이번 주(보는 주) 목표 연결 수
    const goalLinks = new Map<string, { done: number; total: number }>() // 목표 → 연결 할 일 완료/전체
    for (const l of links ?? []) {
      if (l.state !== 'accepted' || l.kind !== 'goal') continue
      goalOf.add(l.to_id)
      if (!goalIds.has(l.from_id) || l.to_status === null || l.to_status === 2) continue
      goalCount.set(l.to_id, (goalCount.get(l.to_id) ?? 0) + 1)
      const c = goalLinks.get(l.from_id) ?? { done: 0, total: 0 }
      goalLinks.set(l.from_id, { done: c.done + (l.to_status === 1 ? 1 : 0), total: c.total + 1 })
    }
    // 31 §1 지금 할 일: 열린 할 일 전체(보이지 않는 앞 할 일도)로 지금·막힘·나중
    const open = new Set((rawTasks ?? []).filter((t) => t.status === 0).map((t) => t.id))
    const { state, wait } = taskStates(tasks, links ?? [], today, open)
    const unlock = unlockCounts(links ?? [], open)
    const hasSeq = (links ?? []).some((l) => l.kind === 'sequence' && l.state === 'accepted')
    const thisGoalLinked = new Set([...goalCount.keys()])
    // 띠는 기간과 상관없이 범위(고른 리스트) 안 열린 할 일 전부에서 고른다 — 지난주 마감(기한 지남)이 맨 앞에 와야 해서
    const scope = opts.lists ? new Set(opts.lists) : null
    const stripTasks = filterTasks(rawTasks ?? [], { ...opts, period: 'all', showDone: false }, today).filter((t) => !scope || (t.list_id && scope.has(t.list_id)))
    const stripState = taskStates(stripTasks, links ?? [], today, open).state
    const strip = nowStrip(stripTasks, stripState, { unlock, goalLinked: thisGoalLinked, today, hasSeq })
    const byIdAll = new Map((rawTasks ?? []).map((t) => [t.id, t]))
    const dueOf = (id: string) => byIdAll.get(id)?.due_at?.slice(0, 10) ?? null
    const paths = new Map<string, RemainingPath>()
    for (const g of goals ?? []) if (goalLinks.has(g.id)) paths.set(g.id, remainingPath(g.id, links ?? [], open, state, dueOf))
    const progress = new Map((progressRows ?? []).map((p) => [p.id, { done: p.done, total: p.total }]))
    const inbox = (lists ?? []).find((l) => l.kind === 'inbox')
    // 기본함 할 일 중 AI 제안 칩이 붙은 것(카드 높이·칩)
    const suggested = new Set(inbox ? tasks.filter((t) => t.list_id === inbox.id && chipFor(suggest, t.id, lists ?? [])).map((t) => t.id) : [])
    const memos = opts.showMemos ? (memoRows ?? []).map((m) => ({ id: m.id, task_id: m.task_id, title: (m.content ?? '').split('\n').find((s) => s.trim())?.trim().slice(0, 40) || '메모' })) : []
    return {
      loaded, tasks, tree, grouped, inbox, suggested, wait, goalOf, progress, memos,
      folders: folders ?? [], lists: lists ?? [], links: links ?? [], goals: goals ?? [],
      allOpen: (rawTasks ?? []).filter((t) => t.status === 0 && t.title.trim()).length,
      byId: byIdAll,
      // 31 v3
      state, unlock, strip, paths, goalCount, goalLinks, goalWeek, xpIds: new Set((earned ?? []).map((e) => e.ref_id))
    }
  }, [loaded, suggest, rawTasks, folders, lists, links, goals, earned, memoRows, progressRows, opts, view, today, goalWeek])
}
export type MapData = ReturnType<typeof useMapData>
