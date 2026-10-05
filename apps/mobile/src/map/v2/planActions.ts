// 29 §9.2 같이 계획 짜기 — 대화 효과를 휴대폰 DB에 쓰는 곳(데스크톱 data/planActions.ts와 같은 규칙) + 대화 하나 단위 되돌리기.
// 대화 규칙은 공용 @sprout/schema/planChat, AI 답 검증·순서 잇기는 공용 @sprout/schema/breakdown.
// AI는 단계 만들기 한 곳: 사용자가 대화에서 직접 부른 POST /ai/breakdown(stream false). 자동으로 부르는 AI는 없다(29 M-M5).
import {
  BREAKDOWN_SYSTEM, breakdownPayload, breakdownRows, breakdownSchema, manualSteps, planUndoPick, validateBreakdown, type BreakdownTask, type Step
} from '@sprout/schema/breakdown'
import type { PlanGoal, PlanStep, SplitFail } from '@sprout/schema/planChat'
import { deleteStmt } from '@sprout/schema/taskCore'
import { serverAccess } from '../../data/auth'
import { db, run } from '../../data/db'
import { insert, reopenTasks, update } from '../../data/tasks'
import { dayKey, moveToDate } from '../../lib/dates'

export type PlanJournal = { title: string; tasks: string[]; links: string[]; stamps: Record<string, string>; dues: { id: string; start_at: string | null; due_at: string | null; is_all_day: number | null }[]; completed: string[]; lastSplit: { tasks: string[]; links: string[] } | null }
export const newJournal = (): PlanJournal => ({ title: '', tasks: [], links: [], stamps: {}, dues: [], completed: [], lastSplit: null })
export const journalChanged = (j: PlanJournal) => !!(j.tasks.length || j.links.length || j.dues.length || j.completed.length)

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',') || 'NULL'
type Row = { id: string; title: string; status: number; due_at: string | null; deleted_at: string | null; modified_at: string | null }
const toGoal = (g: Pick<Row, 'id' | 'title' | 'due_at' | 'status'>): PlanGoal => ({ id: g.id, title: g.title, due: g.due_at?.slice(0, 10) ?? null, done: g.status === 1 })
const toStep = (r: Pick<Row, 'id' | 'title' | 'status'>): PlanStep => ({ id: r.id, title: r.title, done: r.status === 1 })

/** 큰 할 일 + 단계(하위 할 일). 지운 것은 null */
export async function loadPlanTask(id: string): Promise<{ goal: PlanGoal; steps: PlanStep[] } | null> {
  const g = await db.getOptional<Row>('SELECT id, title, status, due_at, deleted_at FROM tasks WHERE id = ?', [id])
  if (!g || g.deleted_at) return null
  const kids = await db.getAll<Row>("SELECT id, title, status FROM tasks WHERE parent_id = ? AND deleted_at IS NULL AND title != '' AND status IN (0, 1) ORDER BY sort_order, created_at", [id])
  return { goal: toGoal(g), steps: kids.map(toStep) }
}

/** ① 답 칩(프로젝트 밖에서 열 때): 열린 최상위 할 일 중 하위가 없는 것 — 다가오는 마감 → 날짜 없음 → 기한 지남 */
export async function planCandidates(n = 3): Promise<{ id: string; title: string }[]> {
  return db.getAll<{ id: string; title: string }>(`SELECT t.id, t.title FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
    WHERE t.deleted_at IS NULL AND t.status = 0 AND t.parent_id IS NULL AND t.title != '' AND l.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL AND c.status = 0)
    ORDER BY CASE WHEN t.due_at IS NULL THEN 1 WHEN substr(t.due_at, 1, 10) < ? THEN 2 ELSE 0 END, t.due_at, t.created_at DESC LIMIT ?`, [dayKey(), n])
}

async function stamp(j: PlanJournal, ids: string[]) {
  const own = ids.filter((id) => j.tasks.includes(id))
  if (!own.length) return
  const rows = await db.getAll<{ id: string; modified_at: string | null }>(`SELECT id, modified_at FROM tasks WHERE id IN (${marks(own.length)})`, own)
  for (const r of rows) if (r.modified_at) j.stamps[r.id] = r.modified_at
}

/** ① 새 큰 할 일(기본함, 맨 위) */
export async function createGoalTask(j: PlanJournal, title: string, due: string | null): Promise<PlanGoal> {
  const inbox = await db.getOptional<{ id: string }>("SELECT id FROM lists WHERE kind = 'inbox' ORDER BY created_at LIMIT 1")
  if (!inbox) throw new Error('기본함이 없어요')
  const id = crypto.randomUUID()
  await run([insert('tasks', { id, list_id: inbox.id, parent_id: null, title, content: '', content_mode: 'text', status: 0, priority: 0, due_at: due, start_at: null, is_all_day: 1, time_zone: 'floating', sort_order: -Date.now() })])
  j.tasks.push(id)
  await stamp(j, [id])
  j.title ||= title
  return { id, title, due, done: false }
}

/** 마감 바꾸기(종일, 시각·기간 유지) — 대화 전부터 있던 할 일은 이전 값을 기록 */
export async function setPlanDue(j: PlanJournal, taskId: string, due: string | null) {
  const r = await db.getOptional<{ id: string; start_at: string | null; due_at: string | null; is_all_day: number | null }>('SELECT id, start_at, due_at, is_all_day FROM tasks WHERE id = ?', [taskId])
  if (!r) return
  if (!j.tasks.includes(taskId) && !j.dues.some((d) => d.id === taskId)) j.dues.push(r)
  await run([update('tasks', taskId, moveToDate(r, due))])
  await stamp(j, [taskId])
}

async function applySteps(j: PlanJournal, parentId: string, steps: Step[], source: 'ai' | 'user'): Promise<PlanStep[]> {
  const parent = await db.getOptional<BreakdownTask>('SELECT id, title, list_id, due_at, start_at FROM tasks WHERE id = ?', [parentId])
  if (!parent) throw new Error('큰 할 일이 없어요')
  const base = (await db.getOptional<{ n: number | null }>('SELECT max(sort_order) n FROM tasks WHERE parent_id = ? AND deleted_at IS NULL', [parentId]))?.n ?? 0
  const rows = breakdownRows(parent, steps, { mode: 'subtask', sortBase: Number(base) || 0, at: new Date().toISOString(), newId: () => crypto.randomUUID(), source })
  await run([...rows.tasks.map((t) => insert('tasks', t)), ...rows.links.map((l) => insert('map_links', l))])
  j.tasks.push(...rows.ids)
  j.links.push(...rows.linkIds)
  await stamp(j, rows.ids)
  j.title ||= parent.title
  j.lastSplit = { tasks: rows.ids, links: rows.linkIds }
  const made = await db.getAll<Row>(`SELECT id, title, status FROM tasks WHERE id IN (${marks(rows.ids.length)})`, rows.ids)
  return rows.ids.map((id) => made.find((r) => r.id === id)).filter((r): r is Row => !!r).map(toStep)
}
export const applyManualSteps = (j: PlanJournal, taskId: string, titles: string[]) => applySteps(j, taskId, manualSteps(titles), 'user')

/** AI 실패 이유 → 대화 split-manual 사건 */
export class SplitError extends Error { reason: SplitFail; constructor(reason: SplitFail, message?: string) { super(message ?? reason); this.reason = reason } }

/** AI로 나누기(/ai/breakdown) → 바로 만들기. 보내는 것 = 제목·리스트 이름·마감·이미 있는 하위 할 일 제목뿐(31 §11.8) */
export async function splitWithAi(j: PlanJournal, taskId: string, today: string, signal: AbortSignal): Promise<PlanStep[]> {
  const task = await db.getOptional<BreakdownTask & { list: string | null; list_kind: string | null }>('SELECT t.id, t.title, t.list_id, t.due_at, t.start_at, l.name AS list, l.kind AS list_kind FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.id = ?', [taskId])
  if (!task) throw new Error('큰 할 일이 없어요')
  const kids = await db.getAll<{ title: string }>("SELECT title FROM tasks WHERE parent_id = ? AND deleted_at IS NULL AND title != '' ORDER BY sort_order", [taskId])
  const existing = kids.map((k) => k.title)
  const payload = breakdownPayload(task, { list: task.list_kind === 'inbox' ? '기본함' : task.list, existing, hint: '', memo: false, today })
  const { url, token } = await serverAccess()
  if (!token) throw new SplitError('down', '로그인하면 AI를 쓸 수 있어요.')
  let res: Response
  try {
    res = await fetch(`${url}/ai/breakdown`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [{ role: 'system', content: BREAKDOWN_SYSTEM }, { role: 'user', content: JSON.stringify(payload) }], format: breakdownSchema, stream: false })
    })
  } catch (e) {
    if (signal.aborted) throw new SplitError('stopped')
    throw new SplitError('offline')
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null
    throw new SplitError(res.status === 429 ? 'limit' : 'down', json?.error)
  }
  const body = (await res.json().catch(() => null)) as { message?: { content?: string } } | null
  let steps: Step[]
  try { steps = validateBreakdown(body?.message?.content ?? '', existing).steps } catch { throw new SplitError('format') }
  if (signal.aborted) throw new SplitError('stopped')
  if (!steps.length) return []
  return applySteps(j, taskId, steps, 'ai')
}

export async function recordComplete(j: PlanJournal, ids: string[]) {
  for (const id of ids) if (!j.completed.includes(id)) j.completed.push(id)
  await stamp(j, ids)
}

async function pickRemovable(j: Pick<PlanJournal, 'tasks' | 'stamps'>) {
  const rows = await db.getAll<{ id: string; modified_at: string | null; deleted_at: string | null }>(`SELECT id, modified_at, deleted_at FROM tasks WHERE id IN (${marks(j.tasks.length)})`, j.tasks)
  const kids = await db.getAll<{ id: string; parent_id: string }>(`SELECT id, parent_id FROM tasks WHERE deleted_at IS NULL AND parent_id IN (${marks(j.tasks.length)})`, j.tasks)
  return planUndoPick(j, rows, kids)
}
async function hardDelete(ids: string[]) {
  if (!ids.length) return
  const tt = await db.getAll<{ id: string }>(`SELECT id FROM task_tags WHERE task_id IN (${marks(ids.length)})`, ids)
  await run([...tt.map((r) => deleteStmt('task_tags', r.id)), ...ids.map((id) => deleteStmt('tasks', id))])
}
/** 다시 나눠 줘: 마지막으로 만든 단계·선만 지운다(손대지 않은 것만) */
export async function undoLastSplit(j: PlanJournal) {
  const last = j.lastSplit
  if (!last) return
  const { remove: ids } = await pickRemovable({ tasks: last.tasks, stamps: j.stamps })
  await run(last.links.map((id) => deleteStmt('map_links', id)))
  await hardDelete(ids)
  j.tasks = j.tasks.filter((id) => !ids.includes(id))
  j.links = j.links.filter((id) => !last.links.includes(id))
  j.completed = j.completed.filter((id) => !ids.includes(id))
  j.lastSplit = null
}
/** 대화 하나 한 번에 되돌리기(31 §11.5): 고르기 먼저 → 끝낸 것 다시 열기(XP 되돌림) → 마감 이전 값 → 만든 선 삭제 → 손대지 않은 만든 할 일 삭제 */
export async function undoPlanSession(j: PlanJournal): Promise<{ removed: number; kept: number }> {
  const pick = await pickRemovable(j)
  const done = j.completed.length ? await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE status = 1 AND id IN (${marks(j.completed.length)})`, j.completed) : []
  if (done.length) await reopenTasks(done.map((d) => d.id))
  await run([
    ...j.dues.map((d) => update('tasks', d.id, { start_at: d.start_at, due_at: d.due_at, is_all_day: d.is_all_day ?? 1 })),
    ...j.links.map((id) => deleteStmt('map_links', id))
  ])
  await hardDelete(pick.remove)
  return { removed: pick.remove.length, kept: pick.kept }
}
