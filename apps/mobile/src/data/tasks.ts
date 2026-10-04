// 할 일에 하는 동작(21 §4·§5·§6). 오늘 목록·스와이프·길게 누름·상세·빠른 입력이 모두 이것을 쓴다.
// - 완료·완료 취소·XP는 공용 @sprout/schema/taskCore(데스크톱·맥 위젯과 같은 규칙: 반복 다음 회차, 하위 함께 완료, XP 하루 10)
// - 되돌릴 수 있는 동작은 되돌리기 함수를 돌려준다 → 화면이 토스트 ⟲에 붙인다(21 §4.3)
import * as Haptics from 'expo-haptics'
import { deleteStmt, insertStmt, planComplete, planGrantTaskXp, planReopenWithXp, updateStmt, type Stmt } from '@sprout/schema/taskCore'
import { dayKey, moveToDate } from '../lib/dates'
import { currentUserId } from './auth'
import { coreDb, db, run } from './db'
import { taskDone, xpGained } from './events'

export type Undo = () => Promise<void>
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
const env = () => ({ today: dayKey(), uuid: () => crypto.randomUUID() })
const uuid = () => crypto.randomUUID()

/** 새 행 — owner_id는 지금 사용자(서버는 어차피 토큰 사용자로 강제) */
export const insert = (table: string, row: Record<string, unknown>): Stmt => insertStmt(table, { owner_id: currentUserId(), ...row })
export const update = (table: string, id: string, patch: Record<string, unknown>): Stmt => updateStmt(table, id, patch)

/** 지금 값을 떠 두고, 되돌릴 때 그대로 다시 쓴다 */
async function snapshot(ids: string[], fields: string[]): Promise<Undo> {
  if (!ids.length) return async () => {}
  const rows = await db.getAll<Record<string, unknown>>(`SELECT id, ${fields.join(', ')} FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
  return () => run(rows.map(({ id, ...rest }) => update('tasks', id as string, rest)))
}
async function descendants(ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const rows = await db.getAll<{ id: string }>(
    `WITH RECURSIVE d(id) AS (SELECT id FROM tasks WHERE id IN (${marks(ids.length)}) UNION SELECT t.id FROM tasks t JOIN d ON t.parent_id = d.id) SELECT id FROM d`,
    ids
  )
  return rows.map((r) => r.id)
}

/** 완료(체크·오른쪽 스와이프): 하위와 함께, 반복은 다음 회차로 + XP +1(하루 10). 되돌리기 = 완료 취소 + 같은 날 XP 회수 */
export async function completeTasks(ids: string[]): Promise<Undo | null> {
  if (!ids.length) return null
  const plan = await planComplete(coreDb, ids, env())
  if (!plan.stmts.length) return null
  const done = ids.filter((id) => plan.open.includes(id) || plan.repeating.includes(id))
  const xp = await planGrantTaskXp(coreDb, done, env())
  await run([...plan.stmts, ...xp.stmts])
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  taskDone.emit({ ids: [...plan.open, ...plan.repeating] })
  if (xp.granted) xpGained.emit(xp.granted)
  const undoIds = [...plan.open, ...plan.repeating, ...plan.created]
  return async () => run(await planReopenWithXp(coreDb, undoIds, env()))
}
/** 완료 취소(완료 묶음에서 체크를 다시 누름): 같은 날이면 XP도 되돌린다(10 §6) */
export async function reopenTasks(ids: string[]): Promise<void> {
  await run(await planReopenWithXp(coreDb, ids, env()))
}
export async function toggleDone(t: { id: string; status: number }): Promise<Undo | null> {
  if (t.status === 0) return completeTasks([t.id])
  await reopenTasks([t.id])
  return null
}

/** 휴지통으로(하위 포함) */
export async function trashTasks(ids: string[]): Promise<Undo> {
  const all = await descendants(ids)
  const undo = await snapshot(all, ['deleted_at'])
  const at = new Date().toISOString()
  await run(all.map((id) => update('tasks', id, { deleted_at: at })))
  return undo
}
export async function restoreTasks(ids: string[]) {
  const all = await descendants(ids)
  await run(all.map((id) => update('tasks', id, { deleted_at: null })))
}
/** 휴지통에서 영구 삭제 */
export async function deleteForever(ids: string[]) {
  const all = await descendants(ids)
  const stmts: Stmt[] = []
  for (const id of all) {
    for (const table of ['task_tags', 'reminders', 'check_items']) {
      for (const r of await db.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE task_id = ?`, [id])) stmts.push(deleteStmt(table, r.id))
    }
    stmts.push(deleteStmt('tasks', id))
  }
  await run(stmts)
}

/** 날짜만 바꾸기(미루기·빠른 날짜, 03 §5): 시각·기간 유지. null = 날짜·반복·알림 지움 */
export async function moveDates(ids: string[], date: string | null): Promise<Undo> {
  const undoTasks = await snapshot(ids, ['start_at', 'due_at', 'is_all_day', 'repeat_rule', 'repeat_from'])
  const rows = await db.getAll<{ id: string; start_at: string | null; due_at: string | null }>(`SELECT id, start_at, due_at FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
  const stmts: Stmt[] = rows.map((r) => update('tasks', r.id, { ...moveToDate(r, date), ...(date === null ? { repeat_rule: null, repeat_from: null } : {}) }))
  let removed: Record<string, unknown>[] = []
  if (date === null) {
    removed = await db.getAll(`SELECT id, task_id, trigger FROM reminders WHERE task_id IN (${marks(ids.length)})`, ids)
    removed.forEach((r) => stmts.push(deleteStmt('reminders', r.id as string)))
  }
  await run(stmts)
  return async () => {
    await undoTasks()
    await run(removed.map((r) => insert('reminders', { id: r.id, task_id: r.task_id, trigger: r.trigger })))
  }
}

export async function setPriority(ids: string[], priority: number): Promise<Undo> {
  const undo = await snapshot(ids, ['priority'])
  await run(ids.map((id) => update('tasks', id, { priority })))
  return undo
}
export async function setPinned(ids: string[], on: boolean): Promise<Undo> {
  const undo = await snapshot(ids, ['pinned_at'])
  await run(ids.map((id) => update('tasks', id, { pinned_at: on ? new Date().toISOString() : null })))
  return undo
}
/** 이동(21 §6): list_id, section_id=NULL. 하위 할 일도 같이 */
export async function moveToList(ids: string[], listId: string): Promise<Undo> {
  const all = await descendants(ids)
  const undo = await snapshot(all, ['list_id', 'section_id'])
  await run(all.map((id) => update('tasks', id, { list_id: listId, section_id: null })))
  return undo
}
export async function setWontDo(ids: string[]): Promise<Undo> {
  const undo = await snapshot(ids, ['status', 'completed_at'])
  await run(ids.map((id) => update('tasks', id, { status: 2, completed_at: new Date().toISOString() })))
  return undo
}
export const updateTask = (id: string, patch: Record<string, unknown>) => run([update('tasks', id, patch)])

/** 복사(상세 ⋯): 제목·본문·우선순위·날짜·리스트·태그·체크 항목 */
export async function duplicateTask(id: string): Promise<string | null> {
  const t = await db.getOptional<Record<string, unknown>>('SELECT * FROM tasks WHERE id = ?', [id])
  if (!t) return null
  const nid = uuid()
  const { id: _id, owner_id: _o, created_at: _c, modified_at: _m, completed_at: _d, pinned_at: _p, ...rest } = t
  const stmts: Stmt[] = [insert('tasks', { ...rest, id: nid, status: 0, sort_order: ((t.sort_order as number) ?? 0) + 0.5 })]
  for (const tag of await db.getAll<{ tag_id: string }>('SELECT tag_id FROM task_tags WHERE task_id = ?', [id])) stmts.push(insert('task_tags', { id: uuid(), task_id: nid, tag_id: tag.tag_id }))
  for (const c of await db.getAll<{ title: string; done: number; sort_order: number }>('SELECT title, done, sort_order FROM check_items WHERE task_id = ?', [id])) {
    stmts.push(insert('check_items', { id: uuid(), task_id: nid, title: c.title, done: c.done, sort_order: c.sort_order }))
  }
  await run(stmts)
  return nid
}

/** 새 할 일(빠른 입력): 그룹 맨 위(02 §4). 날짜 시트 값(기간·반복 기준·알림)과 설명도 한 트랜잭션에(22 §5) */
export async function createTask(input: {
  title: string; list_id: string; due_at?: string | null; priority?: number; tag_ids?: string[]; repeat_rule?: string | null; parent_id?: string | null
  content?: string; start_at?: string | null; repeat_from?: string | null; reminders?: string[]
}) {
  const id = uuid()
  const due = input.due_at ?? null
  const stmts: Stmt[] = [
    insert('tasks', {
      id, list_id: input.list_id, parent_id: input.parent_id ?? null, title: input.title, content: input.content ?? '', content_mode: 'text', status: 0,
      priority: input.priority ?? 0, start_at: due ? (input.start_at ?? null) : null, due_at: due, is_all_day: due && due.includes('T') ? 0 : 1, time_zone: 'floating',
      repeat_rule: input.repeat_rule ?? null, repeat_from: input.repeat_rule ? (input.repeat_from ?? 'due') : null, sort_order: -Date.now()
    })
  ]
  for (const tag of input.tag_ids ?? []) stmts.push(insert('task_tags', { id: uuid(), task_id: id, tag_id: tag }))
  if (due) for (const trigger of input.reminders ?? []) stmts.push(insert('reminders', { id: uuid(), task_id: id, trigger }))
  await run(stmts)
  return id
}

// ── 날짜 시트(22 §3.3, 03) — 데스크톱 applySchedule과 같은 쓰기 ──
export type ScheduleValue = { start_at: string | null; due_at: string | null; is_all_day: number; repeat_rule: string | null; repeat_from: string | null; reminders: string[] }
/** 첫 할 일의 지금 날짜·반복·알림(여러 개를 고쳐도 첫 것을 보여 준다 — 데스크톱과 같음) */
export async function getSchedule(id: string): Promise<ScheduleValue | null> {
  const t = await db.getOptional<Omit<ScheduleValue, 'reminders'>>('SELECT start_at, due_at, is_all_day, repeat_rule, repeat_from FROM tasks WHERE id = ?', [id])
  if (!t) return null
  const rs = await db.getAll<{ trigger: string }>('SELECT trigger FROM reminders WHERE task_id = ? ORDER BY created_at', [id])
  return { ...t, is_all_day: t.is_all_day ?? 1, reminders: rs.map((r) => r.trigger) }
}
/** 날짜·기간·시각·반복과 알림 목록을 통째로 저장. 되돌리기 = 이전 값과 알림 행 그대로 */
export async function applySchedule(ids: string[], v: ScheduleValue): Promise<Undo> {
  if (!ids.length) return async () => {}
  const undoTasks = await snapshot(ids, ['start_at', 'due_at', 'is_all_day', 'repeat_rule', 'repeat_from'])
  const old = await db.getAll<{ id: string; task_id: string; trigger: string }>(`SELECT id, task_id, trigger FROM reminders WHERE task_id IN (${marks(ids.length)})`, ids)
  const reminders = v.due_at ? v.reminders : []
  await run([
    ...ids.map((id) => update('tasks', id, { start_at: v.due_at ? v.start_at : null, due_at: v.due_at, is_all_day: v.due_at && v.due_at.includes('T') ? 0 : 1, repeat_rule: v.due_at ? v.repeat_rule : null, repeat_from: v.due_at && v.repeat_rule ? (v.repeat_from ?? 'due') : null })),
    ...old.map((r) => deleteStmt('reminders', r.id)),
    ...ids.flatMap((id) => reminders.map((trigger) => insert('reminders', { id: uuid(), task_id: id, trigger })))
  ])
  return async () => {
    await undoTasks()
    const now = await db.getAll<{ id: string }>(`SELECT id FROM reminders WHERE task_id IN (${marks(ids.length)})`, ids)
    await run([...now.map((r) => deleteStmt('reminders', r.id)), ...old.map((r) => insert('reminders', { id: r.id, task_id: r.task_id, trigger: r.trigger }))])
  }
}

// ── 체크리스트(21 §5, 20 M3: 체크·항목 추가는 v1) ──
export async function addCheckItem(taskId: string, title: string) {
  const max = await db.getOptional<{ m: number | null }>('SELECT max(sort_order) AS m FROM check_items WHERE task_id = ?', [taskId])
  await run([insert('check_items', { id: uuid(), task_id: taskId, title, done: 0, sort_order: (max?.m ?? -1) + 1 })])
}
export const toggleCheckItem = (id: string, done: boolean) => run([updateStmt('check_items', id, { done: done ? 1 : 0, completed_at: done ? new Date().toISOString() : null })])
export const renameCheckItem = (id: string, title: string) => run([updateStmt('check_items', id, { title })])
export const removeCheckItem = (id: string) => run([deleteStmt('check_items', id)])

/** 본문 ↔ 체크리스트 전환(02 §13.2 — 데스크톱 toggleContentMode와 같은 규칙) */
export async function toggleContentMode(taskId: string) {
  const t = await db.getOptional<{ content: string | null; content_mode: string | null }>('SELECT content, content_mode FROM tasks WHERE id = ?', [taskId])
  if (!t) return
  if (t.content_mode === 'checklist') {
    const items = await db.getAll<{ id: string; title: string }>('SELECT id, title FROM check_items WHERE task_id = ? ORDER BY sort_order', [taskId])
    await run([update('tasks', taskId, { content_mode: 'text', content: items.map((i) => i.title).join('\n') }), ...items.map((i) => deleteStmt('check_items', i.id))])
  } else {
    const lines = (t.content ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    await run([
      update('tasks', taskId, { content_mode: 'checklist', content: '' }),
      ...(lines.length ? lines : ['']).map((title, i) => insert('check_items', { id: uuid(), task_id: taskId, title, done: 0, sort_order: i }))
    ])
  }
}

// ── 태그(21 §5, 20 M3) ──
export async function setTag(ids: string[], tagId: string, on: boolean) {
  const rows = await db.getAll<{ id: string; task_id: string }>(`SELECT id, task_id FROM task_tags WHERE tag_id = ? AND task_id IN (${marks(ids.length)})`, [tagId, ...ids])
  if (on) {
    const has = new Set(rows.map((r) => r.task_id))
    await run(ids.filter((id) => !has.has(id)).map((id) => insert('task_tags', { id: uuid(), task_id: id, tag_id: tagId })))
  } else await run(rows.map((r) => deleteStmt('task_tags', r.id)))
}
export async function createTag(name: string): Promise<string> {
  const max = await db.getOptional<{ m: number | null }>('SELECT max(sort_order) AS m FROM tags')
  const id = uuid()
  await run([insert('tags', { id, name, color: null, parent_id: null, sort_order: (max?.m ?? 0) + 1, pinned: 0 })])
  return id
}
export async function createList(name: string): Promise<string> {
  const max = await db.getOptional<{ m: number | null }>('SELECT max(sort_order) AS m FROM lists')
  const id = uuid()
  await run([insert('lists', { id, name, kind: 'normal', sort_order: (max?.m ?? 0) + 1, pinned: 0, show_in_smart: 'all' })])
  return id
}
