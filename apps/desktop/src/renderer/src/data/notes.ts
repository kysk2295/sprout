import { getDb } from './db'
import { insert, run, update, uuid } from './mutations'
export interface Note { id: string; content: string; created_at: string; task_id: string | null; task_title: string | null; task_deleted: string | null }
export async function saveNote(content: string, id?: string) {
  if (!content.trim()) throw new Error('메모를 입력해 주세요.')
  const noteId = id ?? uuid()
  await run(id ? update('notes', id, { content: content.trim() }) : insert('notes', { id: noteId, content: content.trim(), task_id: null }))
  return noteId
}
export async function convertNote(id: string, input: {title: string; listId: string; due?: string; start?: string}) {
  const db = await getDb()
  const note = await db.get<Note>('SELECT * FROM notes WHERE id=?', [id])
  if (!note) throw new Error('메모를 찾을 수 없어요.')
  if (note.task_id) return note.task_id
  if (!input.title.trim()) throw new Error('제목을 입력해 주세요.')
  if (!await db.get('SELECT id FROM lists WHERE id=? AND archived_at IS NULL', [input.listId])) throw new Error('리스트를 선택해 주세요.')
  for (const value of [input.start, input.due]) if (value && (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value) || Number.isNaN(Date.parse(value)))) throw new Error('날짜를 확인해 주세요.')
  if (input.start && (!input.due || input.start >= input.due)) throw new Error('종료 시각은 시작 이후여야 해요.')
  const taskId = `note-${id}`
  const stmt = insert('tasks', {id: taskId, list_id: input.listId, title: input.title.trim(), content: note.content, content_mode:'text', status:0, priority:0, start_at:input.start ?? null, due_at:input.due ?? null, is_all_day:input.due?.includes('T') ? 0 : 1, time_zone:'floating', sort_order:-Date.now()})
  // Stable ID makes repeated conversion converge instead of creating extra tasks.
  stmt.sql = stmt.sql.replace('INSERT INTO', 'INSERT OR IGNORE INTO')
  await run(stmt, update('notes', id, {task_id:taskId}))
  return taskId
}
