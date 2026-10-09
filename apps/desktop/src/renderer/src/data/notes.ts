import { getDb } from './db'
import { insert, remove, run, update, uuid } from './mutations'
export interface Note { id: string; content: string; created_at: string; modified_at: string; task_id: string | null; task_title: string | null; task_deleted: string | null; task_scheduled?: number }
export async function saveNote(content: string, id?: string) {
  if (!content.trim()) throw new Error('메모를 입력해 주세요.')
  const noteId = id ?? uuid()
  await run(id ? update('notes', id, { content: content.trim() }) : insert('notes', { id: noteId, content: content.trim(), task_id: null }))
  return noteId
}
/** 11 v2 §5: 행을 지운다(스키마 변경 없음). 전환으로 만든 할 일은 그대로 둔다 */
export const deleteNote = (id: string) => run(remove('notes', id))
/** 삭제 실행 취소: 같은 id·작성 시각으로 다시 넣는다 */
export const restoreNote = (n: Pick<Note, 'id' | 'content' | 'created_at' | 'task_id'>) => run(insert('notes', { id: n.id, content: n.content, task_id: n.task_id, created_at: n.created_at }))

export async function convertNote(id: string, input: {title: string; listId: string; due?: string; start?: string}) {
  const db = await getDb()
  const note = await db.get<Note>('SELECT * FROM notes WHERE id=?', [id])
  if (!note) throw new Error('메모를 찾을 수 없어요.')
  if (note.task_id) return note.task_id
  if (!input.title.trim()) throw new Error('제목을 입력해 주세요.')
  if (!await db.get('SELECT id FROM lists WHERE id=? AND archived_at IS NULL', [input.listId])) throw new Error('리스트를 선택해 주세요.')
  for (const value of [input.start, input.due]) {
    if (!value) continue
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) throw new Error('날짜를 확인해 주세요.')
    const parsed = new Date(value.includes('T') ? `${value}:00Z` : `${value}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,value.length) !== value) throw new Error('날짜를 확인해 주세요.')
  }
  if (input.start && (!input.due || input.start.length !== input.due.length || input.start >= input.due)) throw new Error('종료 시각은 시작 이후여야 해요.')
  const taskId = `note-${id}`
  const stmt = insert('tasks', {id: taskId, list_id: input.listId, title: input.title.trim(), content: note.content, content_mode:'text', status:0, priority:0, start_at:input.start ?? null, due_at:input.due ?? null, is_all_day:input.due?.includes('T') ? 0 : 1, time_zone:'floating', sort_order:-Date.now()})
  // Stable ID makes repeated conversion converge instead of creating extra tasks.
  stmt.sql = stmt.sql.replace('INSERT INTO', 'INSERT OR IGNORE INTO')
  await run(stmt, update('notes', id, {task_id:taskId}))
  return taskId
}

// 47 §19.1 AI 비서 메모 카드 → 그 메모 바로 열기: 수집함 보기가 (지금 또는 그려질 때) 받아 그 행을 고르고 상세를 연다
export const OPEN_NOTE = 'sprout:open-note'
let pendingNote: string | undefined
export function requestOpenNote(id: string) {
  pendingNote = id
  window.dispatchEvent(new CustomEvent(OPEN_NOTE))
}
export function takeOpenNote(): string | undefined { const id = pendingNote; pendingNote = undefined; return id }
