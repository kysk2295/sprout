// 29 모바일 작업 지도 — 순수 계산(시험: logic.test.ts).
// 2026-10-05 사용자 결정: "리스트"와 "AI 영역"을 하나로 — 지도 = 내 폴더 › 리스트 › 할 일(틱틱처럼 사용자가 직접 고치는 구조).
// map_areas·task_areas(영역·주제)는 더 이상 쓰지 않는다. 순서·목표 선(map_links)은 그대로(데스크톱 data/map.ts와 같은 규칙).
// TODO(공용화): MapLink 타입, wouldCycle·filterTasks·connect/accept/drop 판단·buildListTree는 packages/schema/src/map.ts로 옮겨 두 앱이 같이 쓴다.
import { addDays } from '@sprout/schema/time'
import { deleteStmt, insertStmt, updateStmt, type Stmt } from '@sprout/schema/taskCore'

export type MapLink = { id: string; kind: 'sequence' | 'goal'; from_type: 'task' | 'kpi'; from_id: string; to_id: string; source: string; state: 'suggested' | 'accepted' | 'dismissed'; created_at?: string | null }
export type MapTask = { id: string; title: string; status: number; due_at: string | null; start_at: string | null; priority: number; list_id: string | null; completed_at: string | null; created_at: string | null; is_all_day?: number | null }
export type MapGoal = { id: string; title: string; target: number; progress: number; status: string; week_start: string; achieved_at: string | null; source: string; sort_order: number }
export type MapList = { id: string; name: string; emoji: string | null; color: string | null; kind: string; folder_id: string | null; sort_order: number; archived_at?: string | null }
export type MapFolder = { id: string; name: string; sort_order: number }

export const NAME_MAX = 64
export function cleanName(raw: unknown, max = NAME_MAX): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/\s+/g, ' ').trim()
  return s && [...s].length <= max ? s : null
}

// ── 순서 선: 고리 검사(데스크톱 그대로) ──
export function wouldCycle(links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], from: string, to: string): boolean {
  if (from === to) return true
  const next = new Map<string, string[]>()
  for (const l of links) {
    if (l.kind !== 'sequence' || l.state === 'dismissed') continue
    next.set(l.from_id, [...(next.get(l.from_id) ?? []), l.to_id])
  }
  const seen = new Set<string>()
  const stack = [to]
  while (stack.length) {
    const id = stack.pop()!
    if (id === from) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(next.get(id) ?? []))
  }
  return false
}

// ── 폴더 › 리스트 › 할 일 ──
export type ListNode = { list: MapList; tasks: MapTask[]; open: number }
export type FolderNode = { folder: MapFolder | null; lists: ListNode[]; open: number }
export type ListTree = { folders: FolderNode[]; inbox: ListNode | null }
/**
 * 폴더(정렬 순) → 리스트(정렬 순). 폴더 없는 리스트는 맨 앞 묶음(folder=null, 틱틱 서랍처럼 위에), 기본함은 따로(맨 아래 "정리할 것").
 * 보관한 리스트·모르는 리스트의 할 일은 빠진다. 지워진 폴더를 가리키는 리스트는 폴더 없는 묶음으로.
 */
export function buildListTree(folders: MapFolder[], lists: MapList[], tasks: MapTask[]): ListTree {
  const live = lists.filter((l) => !l.archived_at)
  const byList = new Map<string, MapTask[]>()
  for (const t of tasks) if (t.list_id) byList.set(t.list_id, [...(byList.get(t.list_id) ?? []), t])
  const node = (l: MapList): ListNode => { const ts = byList.get(l.id) ?? []; return { list: l, tasks: ts, open: ts.filter((t) => t.status === 0).length } }
  const inboxRow = live.find((l) => l.kind === 'inbox')
  const known = new Set(folders.map((f) => f.id))
  const normal = live.filter((l) => l.kind !== 'inbox').sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const loose = normal.filter((l) => !l.folder_id || !known.has(l.folder_id)).map(node)
  const out: FolderNode[] = []
  if (loose.length) out.push({ folder: null, lists: loose, open: loose.reduce((n, x) => n + x.open, 0) })
  for (const f of [...folders].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))) {
    const ls = normal.filter((l) => l.folder_id === f.id).map(node)
    out.push({ folder: f, lists: ls, open: ls.reduce((n, x) => n + x.open, 0) })
  }
  return { folders: out, inbox: inboxRow ? node(inboxRow) : null }
}
/** 옮기기 시트: 기본함 → 폴더 없는 리스트 → 폴더별 리스트 */
export function moveTargets(tree: ListTree): { folder: MapFolder | null; lists: MapList[] }[] {
  return tree.folders.filter((f) => f.lists.length).map((f) => ({ folder: f.folder, lists: f.lists.map((l) => l.list) }))
}
/** `폴더 › 리스트` */
export function pathOf(folders: MapFolder[], lists: MapList[], listId: string | null | undefined): string | null {
  const l = listId ? lists.find((x) => x.id === listId) : undefined
  if (!l) return null
  if (l.kind === 'inbox') return '기본함'
  const f = l.folder_id ? folders.find((x) => x.id === l.folder_id) : undefined
  return f ? `${f.name} › ${l.name}` : l.name
}

// ── 기간·거름틀(주 = 월요일 시작, 데스크톱 filterTasks 그대로) ──
export type MapFilter = { period: 'week' | 'all'; showDone: boolean; showNoDate: boolean; lists: string[] | null }
export const DEFAULT_FILTER: MapFilter = { period: 'week', showDone: false, showNoDate: true, lists: null }
export const weekStartOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00`).getDay() + 6) % 7))
export function filterTasks(tasks: MapTask[], f: MapFilter, today: string): MapTask[] {
  const ws = weekStartOf(today)
  const we = addDays(ws, 7)
  const wsIso = new Date(`${ws}T00:00`).toISOString()
  return tasks.filter((t) => {
    if (!t.title.trim()) return false
    if (f.lists && !f.lists.includes(t.list_id ?? '')) return false
    if (!t.due_at && !f.showNoDate) return false
    if (t.status === 1) {
      if (f.period === 'week') return !!t.completed_at && t.completed_at >= wsIso
      return f.showDone
    }
    if (t.status !== 0) return false
    if (f.period === 'all' || !t.due_at) return true
    const start = (t.start_at ?? t.due_at).slice(0, 10)
    const end = t.due_at.slice(0, 10)
    return start < we && end >= ws
  })
}

// ── 선 쓰기(사람이 이은 선 = source 'user') ──
export type WriteEnv = { owner: string; uuid: () => string; now?: string }
const ins = (env: WriteEnv, table: string, row: Record<string, unknown>) => insertStmt(table, { owner_id: env.owner, ...row }, env.now)
const upd = (env: WriteEnv, table: string, id: string, patch: Record<string, unknown>) => updateStmt(table, id, patch, env.now)
/** 순서·목표 잇기 — 데스크톱 connect와 같은 판단. 고리면 'cycle' */
export function connectStmts(env: WriteEnv, links: MapLink[], kind: 'sequence' | 'goal', from: string, to: string): Stmt[] | 'cycle' | 'exists' {
  const same = links.find((l) => l.kind === kind && l.from_id === from && l.to_id === to)
  if (same?.state === 'accepted') return 'exists'
  if (kind === 'sequence' && wouldCycle(links.filter((l) => l !== same && l.state === 'accepted'), from, to)) return 'cycle'
  return [same ? upd(env, 'map_links', same.id, { state: 'accepted', source: 'user' }) : ins(env, 'map_links', { id: env.uuid(), kind, from_type: kind === 'goal' ? 'kpi' : 'task', from_id: from, to_id: to, source: 'user', state: 'accepted' })]
}
/** AI 제안 ✓ — 순서 선은 받아들일 때 다시 고리 검사 */
export function acceptStmts(env: WriteEnv, links: MapLink[], id: string): Stmt[] | 'cycle' {
  const l = links.find((x) => x.id === id)
  if (!l) return []
  if (l.kind === 'sequence' && wouldCycle(links.filter((x) => x.id !== id && x.state === 'accepted'), l.from_id, l.to_id)) return 'cycle'
  return [upd(env, 'map_links', id, { state: 'accepted' })]
}
/** ✕ 무시 = dismissed(다시 제안 안 함). 받아들인 선 끊기 = 지움 */
export const dropStmts = (env: WriteEnv, l: Pick<MapLink, 'id' | 'state'>): Stmt[] => [l.state === 'suggested' ? upd(env, 'map_links', l.id, { state: 'dismissed' }) : deleteStmt('map_links', l.id)]

// ── 리스트 화면(29 §2.2) ──
/** 순서 사슬(번호) + 나머지. 사슬 = 이 리스트 안 할 일끼리 받아들인 순서 선, 위상 순서(같은 층은 원래 순서) */
export type ChainItem = { task: MapTask; n: number; waiting: number }
export function chainView(tasks: MapTask[], links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[]): { chain: ChainItem[]; rest: MapTask[] } {
  const ids = new Set(tasks.map((t) => t.id))
  const seq = links.filter((l) => l.kind === 'sequence' && l.state === 'accepted' && ids.has(l.from_id) && ids.has(l.to_id))
  const inChain = new Set(seq.flatMap((l) => [l.from_id, l.to_id]))
  const order = new Map(tasks.map((t, i) => [t.id, i]))
  const indeg = new Map([...inChain].map((id) => [id, 0]))
  for (const l of seq) indeg.set(l.to_id, (indeg.get(l.to_id) ?? 0) + 1)
  const ready = [...inChain].filter((id) => !indeg.get(id)).sort((a, b) => order.get(a)! - order.get(b)!)
  const out: string[] = []
  while (ready.length) {
    const id = ready.shift()!
    out.push(id)
    for (const l of seq.filter((x) => x.from_id === id)) {
      indeg.set(l.to_id, indeg.get(l.to_id)! - 1)
      if (indeg.get(l.to_id) === 0) { ready.push(l.to_id); ready.sort((a, b) => order.get(a)! - order.get(b)!) }
    }
  }
  for (const id of inChain) if (!out.includes(id)) out.push(id)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const w = waitingMap(links, new Map(tasks.map((t) => [t.id, t.status])))
  return { chain: out.map((id, i) => ({ task: byId.get(id)!, n: i + 1, waiting: w.get(id) ?? 0 })), rest: tasks.filter((t) => !inChain.has(t.id)) }
}
/** 아직 안 끝난 앞 할 일 수(꼬리표 `⛓ 먼저 N`) */
export function waitingMap(links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], statusOf: Map<string, number>): Map<string, number> {
  const w = new Map<string, number>()
  for (const l of links) if (l.kind === 'sequence' && l.state === 'accepted' && statusOf.get(l.from_id) === 0) w.set(l.to_id, (w.get(l.to_id) ?? 0) + 1)
  return w
}
/** 앞 할 일을 끝냈을 때 이제 시작할 수 있는 뒤 할 일 */
export function unlockedBy(doneId: string, links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], statusOf: Map<string, number>): string | null {
  for (const l of links.filter((x) => x.kind === 'sequence' && x.state === 'accepted' && x.from_id === doneId)) {
    const others = links.filter((x) => x.kind === 'sequence' && x.state === 'accepted' && x.to_id === l.to_id && x.from_id !== doneId && statusOf.get(x.from_id) === 0)
    if (statusOf.get(l.to_id) === 0 && !others.length) return l.to_id
  }
  return null
}
export function goalTags(taskId: string, links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], goals: Pick<MapGoal, 'id' | 'title'>[]): string[] {
  return links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.to_id === taskId).map((l) => goals.find((g) => g.id === l.from_id)?.title).filter((t): t is string => !!t)
}
export function goalsAllDone(goals: Pick<MapGoal, 'id' | 'status'>[], links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], statusOf: Map<string, number>): string[] {
  return goals.filter((g) => g.status !== 'achieved').filter((g) => {
    const linked = links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.from_id === g.id)
    return linked.length > 0 && linked.every((l) => statusOf.get(l.to_id) === 1)
  }).map((g) => g.id)
}
export function suggestionsFor(ids: Set<string>, links: MapLink[]): MapLink[] {
  return links.filter((l) => l.state === 'suggested' && (ids.has(l.to_id) || (l.kind === 'sequence' && ids.has(l.from_id))))
}
export const progressOf = (tasks: Pick<MapTask, 'status'>[]) => ({ done: tasks.filter((t) => t.status === 1).length, total: tasks.length })
export function goalLinkedCount(goals: Pick<MapGoal, 'id'>[], links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], statusOf: Map<string, number>): number {
  const g = new Set(goals.map((x) => x.id))
  return new Set(links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && g.has(l.from_id) && statusOf.get(l.to_id) === 0).map((l) => l.to_id)).size
}
