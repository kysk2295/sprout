// 26 수집함 쓰기 — 로컬 DB에 바로 쓰고 PowerSync가 올린다(오프라인 그대로). 규칙은 core.ts(데스크톱과 같은 칸·같은 id).
// 휴대폰은 /ai/*를 부르지 않는다(26 M-C5): 새 항목은 ai_state 'pending'으로 두고 데스크톱 수집기가 정리한다.
import { deleteStmt, insertStmt, updateStmt, type Stmt } from '@sprout/schema/taskCore'
import { hx } from '../ui/haptics'
import { currentUserId } from '../data/auth'
import { db, run } from '../data/db'
import {
  contentOf, convertError, convertStmts, dropSource, firstUrl, itemRow, kindPatch, noteTaskId, restoreReason, suggestionInput, versionStmts,
  type CollectItem, type CollectKind, type ConvertInput, type WikiTopic
} from './core'

const uuid = () => crypto.randomUUID()
export type Undo = () => Promise<void>

export async function saveItem(content: string): Promise<string> {
  if (!content.trim()) throw new Error('내용을 입력해 주세요.')
  const id = uuid()
  await run([insertStmt('notes', { owner_id: currentUserId(), id, ...itemRow(content) })])
  return id
}

/** 상세에서 글을 고치면 링크 칸도 다시 맞춘다 */
export async function editItem(id: string, content: string) {
  if (!content.trim()) return
  const old = await db.getOptional<{ url: string | null }>('SELECT url FROM notes WHERE id = ?', [id])
  const url = firstUrl(content)
  await run([updateStmt('notes', id, { content: content.trim(), url, ...(url !== old?.url ? { link_title: null } : {}) })])
}

/** 삭제 → 되돌리기 = 같은 행(같은 id·작성 시각)을 다시 넣는다(11 v2). 할 일로 만든 것은 그대로 */
export async function deleteItem(id: string): Promise<Undo> {
  const row = await db.getOptional<Record<string, unknown>>('SELECT * FROM notes WHERE id = ?', [id])
  await run([deleteStmt('notes', id)])
  hx.tap()
  return row ? () => run([insertStmt('notes', row)]) : async () => {}
}

async function dropFromTopic(topicId: string, noteId: string): Promise<Stmt[]> {
  const topic = await db.getOptional<WikiTopic>('SELECT * FROM wiki_topics WHERE id = ?', [topicId])
  if (!topic) return []
  const next = dropSource(contentOf(topic), noteId)
  return next ? versionStmts(topic, next, '자료 1개를 뺐어요', currentUserId()) : []
}

/** 사용자가 고른 종류는 AI가 다시 바꾸지 않는다(kind_source=user) */
export async function setKind(item: CollectItem, kind: CollectKind) {
  const stmts: Stmt[] = []
  if (item.topic_id && kind !== 'wiki') stmts.push(...(await dropFromTopic(item.topic_id, item.id)))
  stmts.push(updateStmt('notes', item.id, kindPatch(item, kind)))
  await run(stmts)
}

export async function setSeen(id: string, seen: boolean): Promise<Undo> {
  const old = await db.getOptional<{ seen_at: string | null }>('SELECT seen_at FROM notes WHERE id = ?', [id])
  await run([updateStmt('notes', id, { seen_at: seen ? new Date().toISOString() : null })])
  return () => run([updateStmt('notes', id, { seen_at: old?.seen_at ?? null })])
}

/** 할 일로 만들기(데스크톱 convertNote와 같은 검사·결정적 id). 이미 만들었으면 그 id */
export async function convertItem(id: string, input: ConvertInput): Promise<string> {
  const note = await db.getOptional<CollectItem>('SELECT * FROM notes WHERE id = ?', [id])
  if (!note) throw new Error('메모를 찾을 수 없어요.')
  if (note.task_id) return note.task_id
  const error = convertError(input)
  if (error) throw new Error(error)
  if (!(await db.getOptional('SELECT id FROM lists WHERE id = ? AND archived_at IS NULL', [input.listId]))) throw new Error('리스트를 선택해 주세요.')
  const stmts = convertStmts(note, input, currentUserId())
  await run(stmts)
  hx.tap()
  return noteTaskId(id)
}

/** `등록` 한 번 = AI 제안 그대로 */
export async function registerSuggestion(item: CollectItem): Promise<string> {
  const lists = await db.getAll<{ id: string; kind: string | null }>('SELECT id, kind FROM lists WHERE archived_at IS NULL ORDER BY sort_order')
  const input = suggestionInput(item, lists)
  if (!input) throw new Error('리스트를 선택해 주세요.')
  return convertItem(item.id, input)
}

/** 위키 되돌리기 = 그 버전 내용으로 새 버전(데스크톱 restoreVersion과 같은 이유 문구) */
export async function restoreVersion(topicId: string, version: number) {
  const topic = await db.getOptional<WikiTopic>('SELECT * FROM wiki_topics WHERE id = ?', [topicId])
  const row = await db.getOptional<{ content: string }>('SELECT content FROM wiki_versions WHERE topic_id = ? AND version = ?', [topicId, version])
  if (!topic || !row) throw new Error('그 버전을 찾을 수 없어요.')
  await run(versionStmts(topic, contentOf(row), restoreReason(version), currentUserId()))
  const now = await db.getOptional<{ version: number }>('SELECT version FROM wiki_topics WHERE id = ?', [topicId])
  return now?.version ?? topic.version + 1
}
