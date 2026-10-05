// 33 §11 관계 위키(모바일): 읽기·쓰기. 자동 태그 파이프라인은 돌리지 않는다 — 데스크톱이 붙인 결과(task_tags rule·ai)를 보여 주고 ✕로 떼기만.
// 순수 계산은 공용 @sprout/schema/wikiGraph·wikiLink(데스크톱과 같음).
import { useQuery } from '@powersync/react-native'
import { tagKind, type TagKind } from '@sprout/schema/autoTag'
import { deleteStmt, insertStmt, updateStmt, type Stmt } from '@sprout/schema/taskCore'
import { planLinkSync, type LinkSource, type RelRow, type TaskTagRow } from '@sprout/schema/wikiGraph'
import { linkNames, parseAliases } from '@sprout/schema/wikiLink'
import { db, run } from '../data/db'
import { currentUserId } from '../data/auth'

export type { TagKind }
/** 태그를 세는 곳은 state가 없거나 accepted인 행만(33 §8.1) */
export const ACCEPTED = (a = 'tt') => `COALESCE(${a}.state,'accepted')='accepted'`
export const DESC_MAX = 500
export const KIND_LABEL: Record<TagKind, string> = { topic: '주제', person: '사람', project: '프로젝트', place: '장소' }
/** 종류 아이콘(§4.1): 사람 👤 · 프로젝트 🚀 · 장소 📍 · 주제는 # (null) */
export const KIND_ICON: Record<TagKind, string | null> = { topic: null, person: '👤', project: '🚀', place: '📍' }
export const kindOf = (k: string | null | undefined): TagKind => tagKind(k)
export const isAuto = (source: string | null | undefined) => source === 'rule' || source === 'ai'

export interface TagMeta { id: string; name: string; color: string | null; kind: string | null; aliases: string | null; description: string | null; topic_id: string | null }
export const TAG_META_SQL = 'SELECT id, name, color, kind, aliases, description, topic_id FROM tags ORDER BY sort_order, name'
export function useTagMeta(): TagMeta[] {
  return useQuery<TagMeta>(TAG_META_SQL).data
}

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
const uuid = () => crypto.randomUUID()
// data/tasks.ts와 같은 쓰기(그 파일이 이 파일을 불러서 순환을 피해 여기 둔다)
const insert = (table: string, row: Record<string, unknown>): Stmt => insertStmt(table, { owner_id: currentUserId(), ...row })
const update = (table: string, id: string, patch: Record<string, unknown>): Stmt => updateStmt(table, id, patch)

// ── 쓰기 ──
export const setListDescription = (id: string, text: string) => run([update('lists', id, { description: text.slice(0, DESC_MAX) || null })])
export const setTagDescription = (id: string, text: string) => run([update('tags', id, { description: text.slice(0, DESC_MAX) || null })])

/** §4.1 `+ 위키 페이지 만들기`: 같은 이름 주제가 있으면 잇고, 없으면 만들고 잇는다(데스크톱 ensureTagTopic과 같음) */
export async function ensureTagTopic(tag: { id: string; name: string }): Promise<string> {
  const found = await db.getOptional<{ id: string }>('SELECT id FROM wiki_topics WHERE name = ? LIMIT 1', [tag.name])
  if (found) { await run([update('tags', tag.id, { topic_id: found.id })]); return found.id }
  const id = uuid()
  const content = JSON.stringify({ sections: { overview: [], key: [], questions: [] }, related: [], suggestions: [] })
  await run([
    insert('wiki_topics', { id, name: tag.name, source: 'user', content, locked: '[]', version: 1 }),
    insert('wiki_versions', { id: `${id}-v1`, topic_id: id, version: 1, content, reason: '태그 페이지에서 만들었어요' }),
    update('tags', tag.id, { topic_id: id })
  ])
  return id
}

/**
 * 상세 ✕(§6.6): 사용자가 붙인 태그는 연결을 지우고, 자동(ai·rule)·링크 태그는 dismissed로 남겨 다시 안 붙게 한다.
 * 돌려준 함수 = 되돌리기(데스크톱 removeTaskTag와 같은 규칙)
 */
export async function removeTaskTags(taskIds: string[], tagId: string): Promise<() => Promise<void>> {
  if (!taskIds.length) return async () => {}
  const rows = await db.getAll<TaskTagRow & Record<string, unknown>>(`SELECT * FROM task_tags WHERE tag_id = ? AND task_id IN (${marks(taskIds.length)})`, [tagId, ...taskIds])
  const stmts: Stmt[] = rows.map((r) => ((r.source ?? 'user') === 'user' ? deleteStmt('task_tags', r.id) : update('task_tags', r.id, { state: 'dismissed' })))
  await run(stmts)
  return async () => {
    await run(rows.map((r) => ((r.source ?? 'user') === 'user'
      ? insert('task_tags', Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'owner_id')))
      : update('task_tags', r.id, { state: r.state ?? 'accepted' }))))
  }
}
/** 태그 시트에서 켜기(§7.6 사람이 이긴다): 없으면 넣고, 뗀(dismissed)·제안 행은 user·accepted로 올린다 */
export async function addTaskTags(taskIds: string[], tagId: string): Promise<void> {
  if (!taskIds.length) return
  const rows = await db.getAll<TaskTagRow>(`SELECT id, task_id, tag_id, source, state FROM task_tags WHERE tag_id = ? AND task_id IN (${marks(taskIds.length)})`, [tagId, ...taskIds])
  const has = new Set(rows.filter((r) => (r.state ?? 'accepted') === 'accepted').map((r) => r.task_id))
  const stmts: Stmt[] = []
  for (const id of taskIds) {
    if (has.has(id)) continue
    const old = rows.find((r) => r.task_id === id)
    stmts.push(old ? update('task_tags', old.id, { state: 'accepted', source: 'user', confidence: null }) : insert('task_tags', { id: uuid(), task_id: id, tag_id: tagId }))
  }
  await run(stmts)
}

/**
 * §6.4 링크 관계 쓰기 — 모바일은 그 할 일 하나만 맞춘다(전체 훑기는 데스크톱 syncLinks). 결정적 id라 겹쳐도 한 행.
 * 글에 `[[`가 없고 지울 link 행도 없으면 아무것도 안 한다.
 */
export async function syncTaskLinks(taskId: string): Promise<number> {
  const t = await db.getOptional<{ title: string | null; content: string | null }>('SELECT title, content FROM tasks WHERE id = ?', [taskId])
  if (!t) return 0
  const rels = await db.getAll<RelRow>("SELECT id, from_type, from_id, to_type, to_id, field FROM relations WHERE source = 'link' AND from_type = 'task' AND from_id = ?", [taskId])
  const taskTags = await db.getAll<TaskTagRow>('SELECT id, task_id, tag_id, source, state FROM task_tags WHERE task_id = ?', [taskId])
  const names = [...new Set([...linkNames(t.title), ...linkNames(t.content)])]
  if (!names.length && !rels.length && !taskTags.some((r) => r.source === 'link')) return 0
  const tags = await db.getAll<{ id: string; name: string; aliases: string | null }>('SELECT id, name, aliases FROM tags')
  const lists = await db.getAll<{ id: string; name: string; kind: string | null }>('SELECT id, name, kind FROM lists WHERE archived_at IS NULL')
  const known = new Set([...tags.map((x) => x.name), ...lists.map((x) => x.name), ...tags.flatMap((x) => parseAliases(x.aliases))])
  const need = names.filter((n) => !known.has(n))
  const tasks = need.length ? await db.getAll<{ id: string; title: string }>(`SELECT id, title FROM tasks WHERE deleted_at IS NULL AND title IN (${marks(need.length)})`, need) : []
  const sources: LinkSource[] = [{ type: 'task', id: taskId, field: 'title', text: t.title }, { type: 'task', id: taskId, field: 'content', text: t.content }]
  const plan = planLinkSync(sources, rels, taskTags, { tags, lists, tasks })
  const exists = async (table: string, ids: string[]) =>
    new Set(ids.length ? (await db.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE id IN (${marks(ids.length)})`, ids)).map((r) => r.id) : [])
  const relHave = await exists('relations', plan.insertRel.map((r) => r.id))
  const tagHave = await exists('task_tags', plan.insertTag.map((r) => r.id))
  const stmts: Stmt[] = [
    ...plan.insertRel.filter((r) => !relHave.has(r.id)).map((r) => insert('relations', { ...r, source: 'link', state: 'accepted' })),
    ...plan.deleteRel.map((id) => deleteStmt('relations', id)),
    ...plan.insertTag.filter((r) => !tagHave.has(r.id)).map((r) => insert('task_tags', { ...r, source: 'link', state: 'accepted' })),
    ...plan.upgradeTag.map((id) => update('task_tags', id, { source: 'link', state: 'accepted', confidence: null })),
    ...plan.deleteTag.map((id) => deleteStmt('task_tags', id))
  ]
  await run(stmts)
  return stmts.length
}

/** `[[` 제안의 할 일 후보(§6.2: 제목·리스트, 최근 수정 순, 완료 제외, 5개) */
export function useLinkTaskCandidates(query: string | null): { id: string; title: string; list: string | null }[] {
  const q = (query ?? '').trim()
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : '\u0000'
  return useQuery<{ id: string; title: string; list: string | null }>(
    "SELECT t.id, t.title, CASE WHEN l.kind = 'inbox' THEN '기본함' ELSE l.name END AS list FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND t.title LIKE ? ESCAPE '\\' ORDER BY t.modified_at DESC LIMIT 5",
    [like]
  ).data
}
