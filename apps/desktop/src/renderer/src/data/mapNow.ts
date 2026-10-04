// 31 작업 지도 v3 §1 지금 할 수 있는 일 — 순서 선(map_links sequence·accepted)으로 지금·막힘·나중을 가르고,
// 지금 띠 순서·열어 주는 수·목표까지 남은 길을 계산한다. 앱 계산만(서버·스키마 없음). 순수 함수 — tests/map-v3.test.ts.
import type { MapLink, MapTask } from './map'

export type NowState = 'now' | 'blocked' | 'later' | 'done'
type Link = Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'> & { from_type?: string }
type Task = Pick<MapTask, 'id' | 'status' | 'start_at' | 'due_at'>

const seqLinks = (links: Link[]) => links.filter((l) => l.kind === 'sequence' && l.state === 'accepted')

/**
 * 할 일 상태(§1.1): 열림 = status 0. 막힘 = 들어오는 순서 선의 앞 할 일이 하나라도 열림.
 * 나중 = 막히지 않았지만 start_at이 내일 이후. 지금 = 나머지 열린 할 일.
 * open = 열린 할 일 id 전체(지도에 보이지 않는 것도 — 앞 할 일이 다른 리스트에 있을 수 있다)
 */
export function taskStates(tasks: Task[], links: Link[], today: string, open: Set<string> = new Set(tasks.filter((t) => t.status === 0).map((t) => t.id))): { state: Map<string, NowState>; wait: Map<string, number> } {
  const wait = new Map<string, number>()
  for (const l of seqLinks(links)) if (open.has(l.from_id) && l.from_id !== l.to_id) wait.set(l.to_id, (wait.get(l.to_id) ?? 0) + 1)
  const state = new Map<string, NowState>()
  for (const t of tasks) {
    if (t.status !== 0) state.set(t.id, 'done')
    else if (wait.get(t.id)) state.set(t.id, 'blocked')
    else if (t.start_at && t.start_at.slice(0, 10) > today) state.set(t.id, 'later')
    else state.set(t.id, 'now')
  }
  return { state, wait }
}

/** 열어 주는 수: 이 할 일 뒤로 이어진 열린 할 일 사슬의 가장 긴 길이(단계 수). 늘 DAG지만 고리가 있어도 멈춘다 */
export function unlockCounts(links: Link[], open: Set<string>): Map<string, number> {
  const next = new Map<string, string[]>()
  for (const l of seqLinks(links)) if (open.has(l.to_id)) next.set(l.from_id, [...(next.get(l.from_id) ?? []), l.to_id])
  const memo = new Map<string, number>()
  const onStack = new Set<string>()
  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!
    if (onStack.has(id)) return 0
    onStack.add(id)
    let best = 0
    for (const n of next.get(id) ?? []) best = Math.max(best, 1 + depth(n))
    onStack.delete(id)
    memo.set(id, best)
    return best
  }
  const out = new Map<string, number>()
  for (const id of open) { const d = depth(id); if (d) out.set(id, d) }
  return out
}

export type StripReason = { kind: 'overdue' | 'today' | 'unlock' | 'goal' | 'none'; label: string }
export type StripItem<T> = { task: T; reason: StripReason }
const dueDay = (t: Pick<MapTask, 'due_at'>) => t.due_at?.slice(0, 10) ?? null

/**
 * 지금 띠(§1.1): 지금 할 일을 ① 기한 지남 → ② 오늘 마감 → ③ 열어 주는 수 많은 순(순서 선이 없으면 건너뜀) → ④ 이번 주 목표 연결
 * → ⑤ 우선순위 높은 순 → ⑥ 지도 순서(tasks 순서)로. 위에서 max개 + 전체 수.
 */
export function nowStrip<T extends Pick<MapTask, 'id' | 'status' | 'due_at' | 'priority'>>(
  tasks: T[], state: Map<string, NowState>, opts: { unlock: Map<string, number>; goalLinked: Set<string>; today: string; hasSeq: boolean; max?: number }
): { items: StripItem<T>[]; total: number; all: T[] } {
  const order = new Map(tasks.map((t, i) => [t.id, i]))
  const now = tasks.filter((t) => state.get(t.id) === 'now')
  const tier = (t: T) => { const d = dueDay(t); return d && d < opts.today ? 0 : d === opts.today ? 1 : 2 }
  const unlock = (t: T) => (opts.hasSeq ? opts.unlock.get(t.id) ?? 0 : 0)
  const goal = (t: T) => (opts.goalLinked.has(t.id) ? 1 : 0)
  const sorted = [...now].sort((a, b) =>
    tier(a) - tier(b) || unlock(b) - unlock(a) || goal(b) - goal(a) || (b.priority ?? 0) - (a.priority ?? 0) || order.get(a.id)! - order.get(b.id)!)
  const reason = (t: T): StripReason => {
    const k = tier(t)
    if (k === 0) return { kind: 'overdue', label: '기한 지남' }
    if (k === 1) return { kind: 'today', label: '오늘 마감' }
    if (unlock(t)) return { kind: 'unlock', label: `${unlock(t)}단계를 열어요` }
    if (goal(t)) return { kind: 'goal', label: '🎯' }
    return { kind: 'none', label: '' }
  }
  return { items: sorted.slice(0, opts.max ?? 5).map((task) => ({ task, reason: reason(task) })), total: sorted.length, all: sorted }
}

export type RemainingPath = { steps: number; chain: string[]; next: string | null } | null
/**
 * 목표까지 남은 길(§1.1): 목표 선이 닿는 열린 할 일 + 그 앞 할 일들(순서 선을 거꾸로, 열린 것만)로 작은 DAG를 만들고
 * 가장 긴 사슬(단계 수, 같으면 사슬 안 가장 이른 마감)을 고른다. next = 사슬의 첫 `지금` 할 일(없으면 null).
 * 연결된 열린 할 일이 없으면 null(= 다 끝냄 또는 연결 없음).
 */
export function remainingPath(goalId: string, links: Link[], open: Set<string>, state: Map<string, NowState>, dueOf: (id: string) => string | null): RemainingPath {
  const targets = links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.from_id === goalId && open.has(l.to_id)).map((l) => l.to_id)
  if (!targets.length) return null
  const seq = seqLinks(links).filter((l) => open.has(l.from_id) && open.has(l.to_id) && l.from_id !== l.to_id)
  const prev = new Map<string, string[]>()
  for (const l of seq) prev.set(l.to_id, [...(prev.get(l.to_id) ?? []), l.from_id])
  const pool = new Set<string>()
  const stack = [...targets]
  while (stack.length) {
    const id = stack.pop()!
    if (pool.has(id)) continue
    pool.add(id)
    stack.push(...(prev.get(id) ?? []))
  }
  const next = new Map<string, string[]>()
  for (const l of seq) if (pool.has(l.from_id) && pool.has(l.to_id)) next.set(l.from_id, [...(next.get(l.from_id) ?? []), l.to_id])
  const minDue = (ids: string[]) => ids.map(dueOf).filter(Boolean).sort()[0] ?? '9999'
  const better = (a: string[], b: string[]) => a.length !== b.length ? a.length > b.length : minDue(a) < minDue(b)
  const memo = new Map<string, string[]>()
  const onStack = new Set<string>()
  const best = (id: string): string[] => {
    if (memo.has(id)) return memo.get(id)!
    if (onStack.has(id)) return [id]
    onStack.add(id)
    let tail: string[] = []
    for (const n of next.get(id) ?? []) { const c = best(n); if (better(c, tail)) tail = c }
    onStack.delete(id)
    const r = [id, ...tail]
    memo.set(id, r)
    return r
  }
  let chain: string[] = []
  for (const id of [...pool].sort()) { const c = best(id); if (!chain.length || better(c, chain)) chain = c }
  return { steps: chain.length, chain, next: chain.find((id) => state.get(id) === 'now') ?? null }
}

/** 목표 노드 아래 글자: `남은 3단계 · 다음: 기획서 초안` */
export function pathLabel(p: RemainingPath, titleOf: (id: string) => string | undefined): string {
  if (!p) return '연결된 할 일을 다 끝냈어요'
  const next = p.next ? `다음: ${titleOf(p.next) ?? ''}` : '다음: 막힘 없음 — 날짜를 기다려요'
  return `남은 ${p.steps}단계 · ${next}`
}
