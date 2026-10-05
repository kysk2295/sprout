// 31 작업 지도 v3 §4 AI로 큰 일 쪼개기 — 할 일 하나를 AI가 단계 2~8개 + 순서로 제안 → 사용자가 미리 보기에서 고쳐 승인 →
// 하위 할 일(D2 (가): parent_id = 큰 할 일) + 순서 선(sequence·ai·accepted)을 한 트랜잭션으로. 24시간 되돌리기(30 §B.3 규칙).
// AI 답은 저장하지 않는다(창을 닫으면 사라짐). 되돌리기 기록은 id만. 서버 용도 `breakdown`(하루 상한).
import { aiChat } from './ai'
import { getDb, type Stmt } from './db'
import { deleteTasksHard, insert, now, remove, run, uuid } from './mutations'
import { BREAKDOWN, breakdownPayload, breakdownSchema, BREAKDOWN_SYSTEM, bridgedAfter, validateBreakdown, type BreakdownTask, type Step } from '@sprout/schema/breakdown'
export { BREAKDOWN, breakdownPayload, breakdownSchema, BREAKDOWN_SYSTEM, bridgedAfter, validateBreakdown, type BreakdownTask, type Step }
import { wouldCycle } from './map'

/** AI에 묻는다. onQueue = 서버 대기열 위치(0 = 내 차례) */
export async function askBreakdown(task: BreakdownTask, ctx: { list: string | null; existing: string[]; hint: string; memo: boolean; today: string }, opts: { signal: AbortSignal; onQueue?: (position: number) => void; chat?: typeof aiChat }) {
  const payload = breakdownPayload(task, ctx)
  const raw = await (opts.chat ?? aiChat)({ purpose: 'breakdown', format: breakdownSchema, messages: [{ role: 'system', content: BREAKDOWN_SYSTEM }, { role: 'user', content: JSON.stringify(payload) }] }, opts.signal, undefined, opts.onQueue)
  opts.signal.throwIfAborted()
  return validateBreakdown(raw, ctx.existing)
}

/** 앞 단계 고르기 메뉴: key를 after에 넣으면 고리가 되는가 */
export function stepWouldCycle(steps: Step[], key: string, before: string): boolean {
  const links = steps.flatMap((s) => s.after.map((a) => ({ kind: 'sequence' as const, from_id: a, to_id: s.key, state: 'accepted' as const })))
  return wouldCycle(links, before, key)
}
/** 끌어 순서 바꾸기: 앞뒤가 뒤집혀 `먼저`가 뒤를 가리키게 되면 거부(null) */
export function reorderSteps(steps: Step[], from: number, to: number): Step[] | null {
  const next = [...steps]
  const [m] = next.splice(from, 1)
  next.splice(to, 0, m)
  const pos = new Map(next.map((s, i) => [s.key, i]))
  return next.every((s) => s.after.every((a) => (pos.get(a) ?? -1) < pos.get(s.key)!)) ? next : null
}
export const stepsInvalid = (steps: Step[]) => steps.some((s) => s.on && !s.title.trim())
export const countNew = (steps: Step[]) => {
  const on = steps.filter((s) => s.on).length
  const lines = [...bridgedAfter(steps).values()].reduce((n, a) => n + a.length, 0)
  return { tasks: on, links: lines }
}

// ── 만들기 · 되돌리기 ──
export type BreakdownSnapshot = { at: string; parentId: string; parentTitle: string; tasks: string[]; links: string[] }
/** [N개 만들기] → 한 트랜잭션: 하위 할 일 N개(같은 list_id, 기존 하위 할 일 뒤) + 순서 선(ai·accepted) */
export function breakdownStmts(parent: Pick<BreakdownTask, 'id' | 'title' | 'list_id'>, steps: Step[], opts: { mode?: 'subtask' | 'sibling'; sortBase: number; at?: string; newId?: () => string; source?: 'ai' | 'user' }): { stmts: Stmt[]; snapshot: BreakdownSnapshot } {
  const at = opts.at ?? now()
  const newId = opts.newId ?? uuid
  const ids = new Map<string, string>()
  const stmts: Stmt[] = []
  const on = steps.filter((s) => s.on && s.title.trim())
  on.forEach((s, i) => {
    const id = newId()
    ids.set(s.key, id)
    stmts.push(insert('tasks', {
      id, list_id: parent.list_id, parent_id: opts.mode === 'sibling' ? null : parent.id, title: s.title.trim().slice(0, BREAKDOWN.title), content: '', content_mode: 'text',
      status: 0, priority: 0, due_at: null, start_at: null, is_all_day: 1, time_zone: 'floating', sort_order: opts.sortBase + i + 1, created_at: at, modified_at: at
    }))
  })
  const links: string[] = []
  for (const [key, pre] of bridgedAfter(on.length === steps.length ? steps : steps.map((s) => (s.on && !s.title.trim() ? { ...s, on: false } : s)))) {
    for (const p of pre) {
      const from = ids.get(p), to = ids.get(key)
      if (!from || !to) continue
      const id = newId()
      links.push(id)
      stmts.push(insert('map_links', { id, kind: 'sequence', from_type: 'task', from_id: from, to_id: to, source: opts.source ?? 'ai', state: 'accepted', created_at: at, modified_at: at }))
    }
  }
  return { stmts, snapshot: { at, parentId: parent.id, parentTitle: parent.title, tasks: [...ids.values()], links } }
}

const UNDO_KEY = 'sprout.map.breakdownUndo'
export function saveBreakdownUndo(s: BreakdownSnapshot) { try { localStorage.setItem(UNDO_KEY, JSON.stringify(s)) } catch { /* 기억만 못 한다 */ } }
export function loadBreakdownUndo(at = Date.now()): BreakdownSnapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(UNDO_KEY) ?? 'null') as BreakdownSnapshot | null
    return s && at - Date.parse(s.at) < BREAKDOWN.undoHours * 3600_000 ? s : null
  } catch { return null }
}
export function clearBreakdownUndo() { try { localStorage.removeItem(UNDO_KEY) } catch { /* */ } }

/** 되돌리기 고르기: 만든 선은 모두 지우고, 만든 할 일 중 그 뒤 손대지 않은 것(status 0 · 지우지 않음 · modified_at = 만든 때 · 자기 하위 없음)만 지운다 */
export function undoPlan(snap: BreakdownSnapshot, rows: { id: string; status: number; modified_at: string | null; deleted_at: string | null }[], childOf: Set<string>): { remove: string[]; kept: number } {
  const remove: string[] = []
  let kept = 0
  for (const id of snap.tasks) {
    const r = rows.find((x) => x.id === id)
    if (!r) continue
    if (r.status === 0 && !r.deleted_at && r.modified_at === snap.at && !childOf.has(id)) remove.push(id)
    else kept++
  }
  return { remove, kept }
}

/** 미리 보기 승인 → 만들기 + 되돌리기 스냅숏(마지막 1회) */
export async function applyBreakdown(parent: BreakdownTask, steps: Step[], mode: 'subtask' | 'sibling' = 'subtask'): Promise<BreakdownSnapshot> {
  const db = await getDb()
  const base = mode === 'subtask'
    ? (await db.get<{ n: number | null }>('SELECT max(sort_order) n FROM tasks WHERE parent_id = ? AND deleted_at IS NULL', [parent.id]))?.n ?? 0
    : (await db.get<{ n: number | null }>('SELECT sort_order n FROM tasks WHERE id = ?', [parent.id]))?.n ?? 0
  const { stmts, snapshot } = breakdownStmts(parent, steps, { mode, sortBase: Number(base) || 0 })
  await run(...stmts)
  saveBreakdownUndo(snapshot)
  return snapshot
}
export async function undoBreakdown(snap = loadBreakdownUndo()): Promise<{ removed: number; kept: number } | null> {
  if (!snap) return null
  const db = await getDb()
  const marks = (n: number) => Array.from({ length: n }, () => '?').join(',') || 'NULL'
  const rows = await db.getAll<{ id: string; status: number; modified_at: string | null; deleted_at: string | null }>(`SELECT id, status, modified_at, deleted_at FROM tasks WHERE id IN (${marks(snap.tasks.length)})`, snap.tasks)
  const kids = await db.getAll<{ parent_id: string }>(`SELECT parent_id FROM tasks WHERE deleted_at IS NULL AND parent_id IN (${marks(snap.tasks.length)})`, snap.tasks)
  const plan = undoPlan(snap, rows, new Set(kids.map((k) => k.parent_id)))
  await run(...snap.links.map((id) => remove('map_links', id)))
  if (plan.remove.length) await deleteTasksHard(plan.remove)
  clearBreakdownUndo()
  return { removed: plan.remove.length, kept: plan.kept }
}

/** ✕ 지우기: 그 단계를 가리키던 뒤 단계의 `먼저`는 지운 단계의 앞으로 이어 붙인다(끄기와 같은 규칙) */
export function removeStep(steps: Step[], key: string): Step[] {
  const gone = steps.find((s) => s.key === key)
  if (!gone) return steps
  return steps.filter((s) => s.key !== key).map((s) => (s.after.includes(key) ? { ...s, after: [...new Set(s.after.flatMap((a) => (a === key ? gone.after : [a])))] } : s))
}
/** + 단계 추가: 새 key(겹치지 않게), 맨 끝 */
export function addStep(steps: Step[]): Step[] {
  let n = steps.length + 1
  while (steps.some((s) => s.key === `s${n}`)) n++
  return [...steps, { key: `s${n}`, title: '', days: null, after: [], on: true }]
}
