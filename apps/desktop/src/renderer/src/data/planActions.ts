// 31 §11 같이 계획 짜기 — 대화 효과를 로컬 DB에 쓰는 곳(보통 편집: tasks·map_links 행) + 대화 하나 단위 되돌리기 기록.
// 단계 만들기는 쪼개기 데이터 계층(breakdown.ts: /ai/breakdown 요청·검증·breakdownStmts)을 그대로 쓴다. 대화 글은 저장하지 않는다.
import { askBreakdown, breakdownStmts, type BreakdownTask, type Step } from './breakdown'
import { getDb } from './db'
import { deleteTasksHard, insert, now, remove, run, update, uuid } from './mutations'
import { bigTaskKind, type BigTaskInput } from './mapMoments'
import { listTitle, type MapList } from './map'
import { moveToDate } from '../lib/dates'
import type { PlanGoal, PlanStep } from './planChat'

/** 대화 하나에서 바꾼 것(되돌리기용 — id와 이전 값만). stamps = 대화가 마지막으로 쓴 뒤의 modified_at(그 뒤 손대면 남긴다) */
export type PlanJournal = {
  at: string
  title: string
  tasks: string[]
  links: string[]
  stamps: Record<string, string>
  dues: { id: string; start_at: string | null; due_at: string | null; is_all_day: number | null }[]
  completed: string[]
  /** 마지막 단계 만들기(다시 나눠 줘가 지운다) */
  lastSplit: { tasks: string[]; links: string[] } | null
}
export const PLAN_UNDO = { key: 'sprout.map.planUndo', hours: 24 }
export const newJournal = (at = now()): PlanJournal => ({ at, title: '', tasks: [], links: [], stamps: {}, dues: [], completed: [], lastSplit: null })
export const journalChanged = (j: PlanJournal) => !!(j.tasks.length || j.links.length || j.dues.length || j.completed.length)

export function savePlanUndo(j: PlanJournal) { try { if (journalChanged(j)) localStorage.setItem(PLAN_UNDO.key, JSON.stringify(j)) } catch { /* 기억만 못 한다 */ } }
export function loadPlanUndo(at = Date.now()): PlanJournal | null {
  try {
    const j = JSON.parse(localStorage.getItem(PLAN_UNDO.key) ?? 'null') as PlanJournal | null
    return j && at - Date.parse(j.at) < PLAN_UNDO.hours * 3600_000 ? j : null
  } catch { return null }
}
export function clearPlanUndo() { try { localStorage.removeItem(PLAN_UNDO.key) } catch { /* */ } }

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',') || 'NULL'
type Row = { id: string; title: string; status: number; due_at: string | null; deleted_at: string | null; parent_id: string | null; modified_at: string | null }

/** 큰 할 일 + 하위 할 일(단계) 읽기. 지운 것·없는 것은 null */
export async function loadPlanTask(id: string): Promise<{ goal: PlanGoal; steps: PlanStep[] } | null> {
  const db = await getDb()
  const g = await db.get<Row>('SELECT id, title, status, due_at, deleted_at FROM tasks WHERE id = ?', [id])
  if (!g || g.deleted_at) return null
  const kids = await db.getAll<Row>("SELECT id, title, status FROM tasks WHERE parent_id = ? AND deleted_at IS NULL AND title != '' AND status IN (0, 1) ORDER BY sort_order, created_at", [id])
  return { goal: toGoal(g), steps: kids.map(toStep) }
}
export const toGoal = (g: Pick<Row, 'id' | 'title' | 'due_at' | 'status'>): PlanGoal => ({ id: g.id, title: g.title, due: g.due_at?.slice(0, 10) ?? null, done: g.status === 1 })
export const toStep = (r: Pick<Row, 'id' | 'title' | 'status'>): PlanStep => ({ id: r.id, title: r.title, done: r.status === 1 })

/** ① 답 칩 후보: 열린 최상위 큰 일(§10.3 큰 일 규칙 split) — 마감 가까운 것 먼저, 최대 n개 */
export async function planCandidates(today: string, n = 3): Promise<{ id: string; title: string }[]> {
  const db = await getDb()
  const rows = await db.getAll<BigTaskInput & { kids: number }>(`SELECT t.id, t.title, t.status, t.parent_id, t.due_at, t.deleted_at,
      (SELECT count(*) FROM tasks c WHERE c.parent_id = t.id AND c.status = 0 AND c.deleted_at IS NULL) AS kids
    FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
    WHERE t.deleted_at IS NULL AND t.status = 0 AND t.parent_id IS NULL AND t.title != '' AND (l.archived_at IS NULL)
    ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.created_at DESC LIMIT 300`)
  return rows.filter((r) => bigTaskKind(r, Number(r.kids) || 0, today) === 'split').slice(0, n).map((r) => ({ id: r.id, title: r.title }))
}

async function stamp(j: PlanJournal, ids: string[]) {
  const own = ids.filter((id) => j.tasks.includes(id))
  if (!own.length) return
  const rows = await (await getDb()).getAll<{ id: string; modified_at: string | null }>(`SELECT id, modified_at FROM tasks WHERE id IN (${marks(own.length)})`, own)
  for (const r of rows) if (r.modified_at) j.stamps[r.id] = r.modified_at
}

/** ① 새 큰 할 일(기본함, 맨 위) */
export async function createGoalTask(j: PlanJournal, title: string, due: string | null): Promise<PlanGoal> {
  const db = await getDb()
  const inbox = await db.get<{ id: string }>("SELECT id FROM lists WHERE kind = 'inbox' ORDER BY created_at LIMIT 1")
  if (!inbox) throw new Error('기본함이 없어요')
  const id = uuid()
  const at = now()
  await run(insert('tasks', {
    id, list_id: inbox.id, parent_id: null, title, content: '', content_mode: 'text', status: 0, priority: 0,
    due_at: due, start_at: null, is_all_day: 1, time_zone: 'floating', sort_order: -Date.now(), created_at: at, modified_at: at
  }))
  j.tasks.push(id)
  j.stamps[id] = at
  j.title ||= title
  return { id, title, due, done: false }
}

/** 마감 바꾸기(종일, 시각·기간은 유지) — 대화 전부터 있던 할 일은 이전 값을 기록 */
export async function setPlanDue(j: PlanJournal, taskId: string, due: string | null) {
  const db = await getDb()
  const r = await db.get<{ id: string; start_at: string | null; due_at: string | null; is_all_day: number | null }>('SELECT id, start_at, due_at, is_all_day FROM tasks WHERE id = ?', [taskId])
  if (!r) return
  if (!j.tasks.includes(taskId) && !j.dues.some((d) => d.id === taskId)) j.dues.push({ id: r.id, start_at: r.start_at, due_at: r.due_at, is_all_day: r.is_all_day })
  await run(update('tasks', taskId, moveToDate(r, due)))
  await stamp(j, [taskId])
}

/** 만든 단계 읽기(순서 = 만든 순서) */
const stepsOf = async (ids: string[]) => {
  if (!ids.length) return []
  const rows = await (await getDb()).getAll<Row>(`SELECT id, title, status FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is Row => !!r).map(toStep)
}
async function applySteps(j: PlanJournal, parentId: string, steps: Step[], source: 'ai' | 'user'): Promise<PlanStep[]> {
  const db = await getDb()
  const parent = await db.get<BreakdownTask>('SELECT id, title, list_id, due_at, start_at FROM tasks WHERE id = ?', [parentId])
  if (!parent) throw new Error('큰 할 일이 없어요')
  const base = (await db.get<{ n: number | null }>('SELECT max(sort_order) n FROM tasks WHERE parent_id = ? AND deleted_at IS NULL', [parentId]))?.n ?? 0
  const { stmts, snapshot } = breakdownStmts(parent, steps, { mode: 'subtask', sortBase: Number(base) || 0, source })
  await run(...stmts)
  j.tasks.push(...snapshot.tasks)
  j.links.push(...snapshot.links)
  for (const id of snapshot.tasks) j.stamps[id] = snapshot.at
  j.title ||= parent.title
  j.lastSplit = { tasks: snapshot.tasks, links: snapshot.links }
  return stepsOf(snapshot.tasks)
}

/** AI로 나누기(/ai/breakdown, interactive) → 바로 만들기. 보내는 것 = 제목·리스트 이름·마감·이미 있는 하위 할 일 제목뿐(31 §11.8) */
export async function splitWithAi(j: PlanJournal, taskId: string, lists: MapList[], today: string, opts: { signal: AbortSignal; onQueue?: (n: number) => void; chat?: Parameters<typeof askBreakdown>[2]['chat'] }): Promise<PlanStep[]> {
  const db = await getDb()
  const task = await db.get<BreakdownTask>('SELECT id, title, list_id, due_at, start_at FROM tasks WHERE id = ?', [taskId])
  if (!task) throw new Error('큰 할 일이 없어요')
  const kids = await db.getAll<{ title: string }>("SELECT title FROM tasks WHERE parent_id = ? AND deleted_at IS NULL AND title != '' ORDER BY sort_order", [taskId])
  const list = lists.find((l) => l.id === task.list_id)
  const r = await askBreakdown(task, { list: list ? listTitle(list) : null, existing: kids.map((k) => k.title), hint: '', memo: false, today }, opts)
  opts.signal.throwIfAborted()
  if (!r.steps.length) return []
  return applySteps(j, taskId, r.steps, 'ai')
}
/** 직접 적은 단계: 적은 순서대로 사슬(source='user') */
export function manualSteps(titles: string[]): Step[] {
  return titles.map((title, i) => ({ key: `s${i + 1}`, title, days: null, after: i ? [`s${i}`] : [], on: true }))
}
export const applyManualSteps = (j: PlanJournal, taskId: string, titles: string[]) => applySteps(j, taskId, manualSteps(titles), 'user')

/** 완료 기록(완료 자체는 화면이 taskActions.complete로 — XP·목표 규칙 그대로) */
export async function recordComplete(j: PlanJournal, ids: string[]) {
  for (const id of ids) if (!j.completed.includes(id)) j.completed.push(id)
  await stamp(j, ids)
}

/**
 * 되돌릴 때 지울 것 고르기: 대화가 만든 할 일 중 대화가 마지막으로 쓴 뒤 손대지 않은 것(지우지 않음 · modified_at = 기록).
 * 남는 하위(손댄 것·대화 밖에서 단 것)가 있는 부모는 지우지 않는다(지우면 하위도 같이 사라지므로). kids = 살아 있는 하위 전부
 */
export function planUndoPick(j: Pick<PlanJournal, 'tasks' | 'stamps'>, rows: Pick<Row, 'id' | 'modified_at' | 'deleted_at'>[], kids: { id: string; parent_id: string }[]): { remove: string[]; kept: number } {
  const live = j.tasks.filter((id) => rows.some((r) => r.id === id))
  const out = new Set(live.filter((id) => { const r = rows.find((x) => x.id === id)!; return !r.deleted_at && r.modified_at === j.stamps[id] }))
  let grew = true
  while (grew) {
    grew = false
    for (const k of kids) if (out.has(k.parent_id) && !out.has(k.id)) { out.delete(k.parent_id); grew = true }
  }
  const remove = live.filter((id) => out.has(id))
  return { remove, kept: live.length - remove.length }
}
/** 다시 나눠 줘: 마지막으로 만든 단계·선만 지운다(손대지 않은 것만) */
export async function undoLastSplit(j: PlanJournal) {
  const last = j.lastSplit
  if (!last) return
  const part = { tasks: last.tasks, stamps: j.stamps }
  const { remove: ids } = await pickRemovable(part)
  await run(...last.links.map((id) => remove('map_links', id)))
  if (ids.length) await deleteTasksHard(ids)
  j.tasks = j.tasks.filter((id) => !ids.includes(id))
  j.links = j.links.filter((id) => !last.links.includes(id))
  j.completed = j.completed.filter((id) => !ids.includes(id))
  j.lastSplit = null
}
async function pickRemovable(j: Pick<PlanJournal, 'tasks' | 'stamps'>) {
  const db = await getDb()
  const rows = await db.getAll<Row>(`SELECT id, modified_at, deleted_at FROM tasks WHERE id IN (${marks(j.tasks.length)})`, j.tasks)
  const kids = await db.getAll<{ id: string; parent_id: string }>(`SELECT id, parent_id FROM tasks WHERE deleted_at IS NULL AND parent_id IN (${marks(j.tasks.length)})`, j.tasks)
  return planUndoPick(j, rows, kids)
}

/**
 * 대화 하나 한 번에 되돌리기(§11.5): 고르기는 먼저(다시 열기가 modified_at을 바꾸므로) →
 * 대화가 끝낸 것 다시 열기(XP·목표 수 되돌림) → 기존 할 일 마감 이전 값 → 만든 선 삭제 → 손대지 않은 만든 할 일 삭제
 */
export async function undoPlanSession(j: PlanJournal, reopen: (ids: string[]) => Promise<void>): Promise<{ removed: number; kept: number }> {
  const pick = await pickRemovable(j)
  const db = await getDb()
  const done = j.completed.length ? await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE status = 1 AND id IN (${marks(j.completed.length)})`, j.completed) : []
  if (done.length) await reopen(done.map((d) => d.id))
  await run(
    ...j.dues.map((d) => update('tasks', d.id, { start_at: d.start_at, due_at: d.due_at, is_all_day: d.is_all_day ?? 1 })),
    ...j.links.map((id) => remove('map_links', id))
  )
  if (pick.remove.length) await deleteTasksHard(pick.remove)
  clearPlanUndo()
  return { removed: pick.remove.length, kept: pick.kept }
}
