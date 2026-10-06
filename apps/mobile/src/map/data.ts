// 29 모바일 작업 지도 — 읽기(useQuery)와 손으로 고치기. 구조 = 내 폴더 › 리스트 › 할 일(2026-10-05 사용자 결정, 영역·주제 모델 폐기).
// 할 일 옮기기 = tasks.list_id(기존 moveToList, 되돌리기 포함), 리스트·폴더 만들기/이름 = 공용 organization.ts. 순서·목표 선은 map_links.
// 휴대폰은 AI를 부르지 않는다(M-M5).
import { useLiveQuery } from '../data/rows'
import * as SecureStore from 'expo-secure-store'
import { addDays } from '@sprout/schema/time'
import { useEffect, useMemo, useState } from 'react'
import { currentUserId } from '../data/auth'
import { db, run } from '../data/db'
import { dayKey } from '../lib/dates'
import {
  acceptStmts, buildListTree, connectStmts, dropStmts, filterTasks, waitingMap, weekStartOf,
  type MapFilter, type MapFolder, type MapGoal, type MapLink, type MapList, type MapTask, type WriteEnv
} from './logic'

export type LinkRow = MapLink & { from_status: number | null; from_title: string | null; to_title: string | null; to_status: number | null }
const LISTS_SQL = 'SELECT id, name, emoji, color, kind, folder_id, sort_order, archived_at FROM lists ORDER BY sort_order, name'
const FOLDERS_SQL = 'SELECT id, name, sort_order FROM folders ORDER BY sort_order, name'
const LINKS_SQL = `SELECT ml.id, ml.kind, ml.from_type, ml.from_id, ml.to_id, ml.source, ml.state, ml.created_at,
  f.status AS from_status, f.title AS from_title, t.title AS to_title, t.status AS to_status
  FROM map_links ml LEFT JOIN tasks f ON f.id = ml.from_id LEFT JOIN tasks t ON t.id = ml.to_id WHERE t.deleted_at IS NULL`
const TASKS_SQL = `SELECT id, title, status, due_at, start_at, priority, list_id, completed_at, created_at, is_all_day FROM tasks
  WHERE deleted_at IS NULL AND (status = 0 OR (status = 1 AND completed_at >= ?)) ORDER BY sort_order, created_at`
/** 진행 고리: 리스트별 완료/전체(기간과 무관, 최근 30일 완료 + 미완료) */
const PROGRESS_SQL = `SELECT list_id AS id, sum(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS done, count(*) AS total
  FROM tasks WHERE deleted_at IS NULL AND (status = 0 OR (status = 1 AND completed_at >= ?)) GROUP BY list_id`
const GOALS_SQL = 'SELECT id, title, target, progress, status, week_start, achieved_at, source, sort_order FROM kpis WHERE week_start = ? ORDER BY sort_order'

// ── 보기 설정(기기 기억) ──
/** whole = ⧉ 전체 지도(폴더 › 리스트 목록·보드). 꺼져 있으면 프로젝트 화면(29 §9) */
export type MapOptions = MapFilter & { view: 'list' | 'board'; whole: boolean }
export const DEFAULT_OPTIONS: MapOptions = { period: 'week', showDone: false, showNoDate: true, lists: null, view: 'list', whole: false }
const OPT_KEY = 'sprout.map.mobile'
let opts: MapOptions = DEFAULT_OPTIONS
let loaded = false
const subs = new Set<(o: MapOptions) => void>()
export function useMapOptions(): [MapOptions, (patch: Partial<MapOptions>) => void] {
  const [v, setV] = useState(opts)
  useEffect(() => {
    subs.add(setV)
    if (!loaded) {
      loaded = true
      void SecureStore.getItemAsync(OPT_KEY).then((s) => { if (s) { opts = { ...DEFAULT_OPTIONS, ...JSON.parse(s) }; subs.forEach((f) => f(opts)) } }).catch(() => {})
    }
    return () => { subs.delete(setV) }
  }, [])
  const set = (patch: Partial<MapOptions>) => {
    opts = { ...opts, ...patch }
    subs.forEach((f) => f(opts))
    void SecureStore.setItemAsync(OPT_KEY, JSON.stringify(opts)).catch(() => {})
  }
  return [v, set]
}

/** 화면이 읽는 것 전부. 보드는 기간 없이 "전체"(데스크톱과 같음) */
export function useMapData(o: MapOptions) {
  const today = dayKey()
  const week = weekStartOf(today)
  const doneSince = new Date(`${o.showDone ? addDays(today, -30) : week}T00:00`).toISOString()
  const listsQ = useLiveQuery<MapList>(LISTS_SQL)
  const foldersQ = useLiveQuery<MapFolder>(FOLDERS_SQL)
  const linksQ = useLiveQuery<LinkRow>(LINKS_SQL)
  const tasksQ = useLiveQuery<MapTask>(TASKS_SQL, [doneSince])
  const goalsQ = useLiveQuery<MapGoal>(GOALS_SQL, [week])
  const progressQ = useLiveQuery<{ id: string; done: number; total: number }>(PROGRESS_SQL, [new Date(`${addDays(today, -30)}T00:00`).toISOString()])
  const lists = listsQ.data, folders = foldersQ.data, links = linksQ.data, rawTasks = tasksQ.data, goals = goalsQ.data, progressRows = progressQ.data
  return useMemo(() => {
    const filter: MapFilter = { ...o, period: o.view === 'board' ? 'all' : o.period }
    const tasks = filterTasks(rawTasks, filter, today)
    const tree = buildListTree(folders, lists, tasks)
    const statusOf = new Map(rawTasks.map((t) => [t.id, t.status]))
    for (const l of links) if (l.from_status !== null && !statusOf.has(l.from_id)) statusOf.set(l.from_id, l.from_status)
    for (const l of links) if (l.to_status !== null && !statusOf.has(l.to_id)) statusOf.set(l.to_id, l.to_status)
    return {
      loaded: !listsQ.isLoading && !tasksQ.isLoading,
      today, tasks, tree, lists, folders, links, goals, statusOf,
      wait: waitingMap(links, statusOf),
      progress: new Map(progressRows.map((p) => [p.id, { done: p.done, total: p.total }])),
      byId: new Map(rawTasks.map((t) => [t.id, t]))
    }
  }, [lists, folders, links, rawTasks, goals, progressRows, o, today, listsQ.isLoading, tasksQ.isLoading])
}
export type MapData = ReturnType<typeof useMapData>

// ── 선 쓰기 ──
const env = (): WriteEnv => ({ owner: currentUserId(), uuid: () => crypto.randomUUID() })
const readLinks = () => db.getAll<MapLink>('SELECT id, kind, from_type, from_id, to_id, source, state, created_at FROM map_links')
export async function connect(kind: 'sequence' | 'goal', from: string, to: string): Promise<'ok' | 'cycle' | 'exists'> {
  const r = connectStmts(env(), await readLinks(), kind, from, to)
  if (typeof r === 'string') return r
  await run(r)
  return 'ok'
}
export async function acceptLink(id: string): Promise<'ok' | 'cycle'> {
  const r = acceptStmts(env(), await readLinks(), id)
  if (r === 'cycle') return r
  await run(r)
  return 'ok'
}
export const dropLink = (l: Pick<MapLink, 'id' | 'state'>) => run(dropStmts(env(), l))
/** 순서 끊기: 이 할 일에 걸린 받아들인 순서 선 전부 */
export async function cutSequence(taskId: string) {
  const links = await readLinks()
  await run(links.filter((l) => l.kind === 'sequence' && l.state === 'accepted' && (l.from_id === taskId || l.to_id === taskId)).flatMap((l) => dropStmts(env(), l)))
}
