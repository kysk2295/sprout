import { LOCAL_OWNER } from '@sprout/schema'
import { getDb, type Row, type Stmt } from './db'

// 쓰기는 모두 로컬 DB에 바로 기록한다(저장 버튼 없음 — 02 §13.4). M3부터 PowerSync가 서버로 올린다.
export const now = () => new Date().toISOString()
export const uuid = () => crypto.randomUUID()
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')

export function insert(table: string, row: Record<string, unknown>): Stmt {
  const full = { owner_id: LOCAL_OWNER, created_at: now(), modified_at: now(), ...row }
  const cols = Object.keys(full)
  return { sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${marks(cols.length)})`, params: Object.values(full) }
}
export function update(table: string, id: string, patch: Record<string, unknown>): Stmt {
  const full = { ...patch, modified_at: now() }
  const cols = Object.keys(full)
  return { sql: `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, params: [...Object.values(full), id] }
}
export const remove = (table: string, id: string): Stmt => ({ sql: `DELETE FROM ${table} WHERE id = ?`, params: [id] })
export const run = async (...stmts: Stmt[]) => (stmts.length ? (await getDb()).transaction(stmts) : undefined)

/** ids와 그 하위 태스크 전부(02 §6: 부모와 함께 완료·삭제·이동) */
export async function withDescendants(ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const rows = await (await getDb()).getAll<{ id: string }>(
    `WITH RECURSIVE d(id) AS (SELECT id FROM tasks WHERE id IN (${marks(ids.length)})
       UNION SELECT t.id FROM tasks t JOIN d ON t.parent_id = d.id)
     SELECT id FROM d`,
    ids
  )
  return rows.map((r) => r.id)
}

/** 되돌리기용: 지금 값을 떠 두고, 되돌릴 때 그대로 다시 쓴다 */
export async function snapshot(ids: string[], fields: string[]): Promise<() => Promise<void>> {
  if (!ids.length) return async () => {}
  const rows = await (await getDb()).getAll<Row>(`SELECT id, ${fields.join(', ')} FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
  return () => run(...rows.map(({ id, ...rest }) => update('tasks', id as string, rest)))
}

export async function createTask(input: { title: string; list_id: string; due_at?: string | null; priority?: number; tag_id?: string; parent_id?: string | null; sort_order?: number }) {
  const id = uuid()
  const due = input.due_at ?? null
  const stmts = [
    insert('tasks', {
      id, list_id: input.list_id, parent_id: input.parent_id ?? null, title: input.title, content: '', content_mode: 'text', status: 0,
      priority: input.priority ?? 0, due_at: due, is_all_day: due && due.includes('T') ? 0 : 1, time_zone: 'floating',
      sort_order: input.sort_order ?? -Date.now() // 새 태스크는 그룹 맨 위(02 §4)
    })
  ]
  if (input.tag_id) stmts.push(insert('task_tags', { id: uuid(), task_id: id, tag_id: input.tag_id }))
  await run(...stmts)
  return id
}
export const updateTask = (id: string, patch: Record<string, unknown>) => run(update('tasks', id, patch))
export const updateTasks = (ids: string[], patch: Record<string, unknown>) => run(...ids.map((id) => update('tasks', id, patch)))

/** 휴지통 영구 삭제, 또는 만들다 만 빈 태스크 지우기 */
export async function deleteTasksHard(ids: string[]) {
  const all = await withDescendants(ids)
  const db = await getDb()
  const stmts: Stmt[] = []
  for (const id of all) {
    for (const table of ['task_tags', 'reminders', 'check_items']) {
      const rows = await db.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE task_id = ?`, [id])
      rows.forEach((r) => stmts.push(remove(table, r.id)))
    }
    stmts.push(remove('tasks', id))
  }
  await run(...stmts)
}

// ── 태그 연결 ──
export async function setTag(ids: string[], tagId: string, on: boolean) {
  const db = await getDb()
  const rows = await db.getAll<{ id: string; task_id: string }>(
    `SELECT id, task_id FROM task_tags WHERE tag_id = ? AND task_id IN (${marks(ids.length)})`, [tagId, ...ids]
  )
  if (on) {
    const has = new Set(rows.map((r) => r.task_id))
    await run(...ids.filter((id) => !has.has(id)).map((id) => insert('task_tags', { id: uuid(), task_id: id, tag_id: tagId })))
  } else await run(...rows.map((r) => remove('task_tags', r.id)))
}

// ── 체크 항목(02 §13.2) ──
export const addCheckItem = (taskId: string, title: string, sort_order: number) => {
  const id = uuid()
  return run(insert('check_items', { id, task_id: taskId, title, done: 0, sort_order })).then(() => id)
}
export const updateCheckItem = (id: string, patch: Record<string, unknown>) => run(update('check_items', id, patch))
export const removeCheckItem = (id: string) => run(remove('check_items', id))

/** 본문 ↔ 체크 항목 전환 (02 §13.2 [임시] 규칙) */
export async function toggleContentMode(taskId: string) {
  const db = await getDb()
  const t = await db.get<{ content: string | null; content_mode: string | null }>('SELECT content, content_mode FROM tasks WHERE id = ?', [taskId])
  if (!t) return
  if (t.content_mode === 'checklist') {
    const items = await db.getAll<{ id: string; title: string }>('SELECT id, title FROM check_items WHERE task_id = ? ORDER BY sort_order', [taskId])
    await run(update('tasks', taskId, { content_mode: 'text', content: items.map((i) => i.title).join('\n') }), ...items.map((i) => remove('check_items', i.id)))
  } else {
    const lines = (t.content ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    await run(
      update('tasks', taskId, { content_mode: 'checklist', content: '' }),
      ...(lines.length ? lines : ['']).map((title, i) => insert('check_items', { id: uuid(), task_id: taskId, title, done: 0, sort_order: i }))
    )
  }
}

// ── 리스트 ──
export async function createList(name: string) {
  const db = await getDb()
  const max = await db.get<{ m: number | null }>('SELECT max(sort_order) AS m FROM lists')
  const id = uuid()
  await run(insert('lists', { id, name, kind: 'normal', sort_order: (max?.m ?? 0) + 1, pinned: 0, show_in_smart: 'all' }))
  return id
}
export const renameList = (id: string, name: string) => run(update('lists', id, { name }))
export const deleteListRow = (id: string) => run(remove('lists', id))

// ── 보기 설정(02 §3, 리스트마다 동기화) ──
export async function setViewSetting(viewKey: string, patch: Record<string, unknown>) {
  const db = await getDb()
  const row = await db.get<{ id: string }>('SELECT id FROM view_settings WHERE view_key = ?', [viewKey])
  await run(row ? update('view_settings', row.id, patch) : insert('view_settings', { id: uuid(), view_key: viewKey, ...patch }))
}
