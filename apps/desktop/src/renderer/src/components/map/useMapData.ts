// 14 작업 지도 — 화면이 읽는 데이터(영역·분류 행·연결선·할 일·이번 주 목표·메모)와 보기 설정(기기 기억 sprout.map.*)
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '../../data/useQuery'
import { buildTree, filterTasks, MAP_SQL, type MapArea, type MapFilter, type MapGoal, type MapLink, type MapTask, type TaskArea } from '../../data/map'
import { thisWeek } from '../../data/growth'
import { addDays } from '@sprout/schema/time'
import { dayKey } from '../../lib/dates'

export type LinkRow = MapLink & { from_status: number | null; from_title: string | null; from_deleted: string | null; to_title: string | null; to_status: number | null }
const LINKS_SQL = `SELECT ml.id, ml.kind, ml.from_type, ml.from_id, ml.to_id, ml.source, ml.state, ml.created_at,
  f.status AS from_status, f.title AS from_title, f.deleted_at AS from_deleted, t.title AS to_title, t.status AS to_status
  FROM map_links ml LEFT JOIN tasks f ON f.id = ml.from_id LEFT JOIN tasks t ON t.id = ml.to_id WHERE t.deleted_at IS NULL`
const TASKS_SQL = `SELECT id, title, status, due_at, start_at, priority, list_id, completed_at, created_at FROM tasks
  WHERE deleted_at IS NULL AND (status = 0 OR (status = 1 AND completed_at >= ?)) ORDER BY sort_order, created_at`
const PROGRESS_SQL = `SELECT ta.area_id AS id, sum(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) AS done, count(*) AS total
  FROM task_areas ta JOIN tasks t ON t.id = ta.task_id WHERE t.deleted_at IS NULL AND t.status IN (0, 1) AND ta.area_id IS NOT NULL GROUP BY ta.area_id`
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

export type MapOptions = MapFilter & { showMemos: boolean; showArchived: boolean }
export const DEFAULT_OPTIONS: MapOptions = { period: 'week', showDone: false, showNoDate: true, lists: null, showMemos: false, showArchived: false }

export function useMapData(opts: MapOptions, view: 'graph' | 'board') {
  const today = dayKey()
  const week = thisWeek()
  // 완료한 것: 이번 주(그래프 이번 주) 또는 최근 30일(완료 보이기)
  const doneSince = new Date(`${opts.showDone ? addDays(today, -30) : week}T00:00`).toISOString()
  const areas = useQuery<MapArea>(`${MAP_SQL.areas} ORDER BY sort_order`)
  const taskAreas = useQuery<TaskArea>(MAP_SQL.rows)
  const links = useQuery<LinkRow>(LINKS_SQL)
  const rawTasks = useQuery<MapTask>(TASKS_SQL, [doneSince])
  const goals = useQuery<MapGoal>(GOALS_SQL, [week])
  const memoRows = useQuery<{ id: string; content: string | null; task_id: string }>(MEMOS_SQL)
  const progressRows = useQuery<{ id: string; done: number; total: number }>(PROGRESS_SQL)
  const loaded = !!(areas && taskAreas && links && rawTasks && goals)

  return useMemo(() => {
    // 보드는 기간 없이 "전체", 그래프는 기간 세그먼트를 따른다
    const filter: MapFilter = { ...opts, period: view === 'board' ? 'all' : opts.period }
    const tasks = filterTasks(rawTasks ?? [], filter, today)
    const tree = buildTree(areas ?? [], taskAreas ?? [], tasks, { showArchived: opts.showArchived })
    const rowOf = new Map((taskAreas ?? []).map((r) => [r.task_id, r]))
    const wait = new Map<string, number>()
    const goalOf = new Set<string>()
    for (const l of links ?? []) {
      if (l.state !== 'accepted') continue
      if (l.kind === 'sequence' && l.from_status === 0 && !l.from_deleted) wait.set(l.to_id, (wait.get(l.to_id) ?? 0) + 1)
      if (l.kind === 'goal') goalOf.add(l.to_id)
    }
    const progress = new Map((progressRows ?? []).map((p) => [p.id, { done: p.done, total: p.total }]))
    const memos = opts.showMemos ? (memoRows ?? []).map((m) => ({ id: m.id, task_id: m.task_id, title: (m.content ?? '').split('\n').find((s) => s.trim())?.trim().slice(0, 40) || '메모' })) : []
    return {
      loaded, tasks, tree, rowOf, wait, goalOf, progress, memos,
      areas: areas ?? [], taskAreas: taskAreas ?? [], links: links ?? [], goals: goals ?? [],
      allOpen: (rawTasks ?? []).filter((t) => t.status === 0 && t.title.trim()).length,
      byId: new Map((rawTasks ?? []).map((t) => [t.id, t]))
    }
  }, [loaded, rawTasks, areas, taskAreas, links, goals, memoRows, progressRows, opts, view, today])
}
export type MapData = ReturnType<typeof useMapData>
