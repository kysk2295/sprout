import { linkNames, parseAliases, renameLinks } from '@sprout/schema/wikiLink'
import { getDb, type Stmt } from './db'
import { insert, remove, run, update, uuid } from './mutations'
import { planLinkSync, type LinkSource, type RelRow, type TaskTagRow } from '../lib/wikiGraph'

// 33 관계 위키 — 태그 = 위키 페이지 · [[링크]] · 리스트/태그 페이지 머리. 읽기·쓰기 모음.

import { TAG_KINDS, tagAccepted, tagKind, type TagKind } from '@sprout/schema/autoTag'
export { TAG_KINDS, type TagKind }
export const KIND_LABEL: Record<TagKind, string> = { topic: '주제', person: '사람', project: '프로젝트', place: '장소' }
/** 종류 아이콘(§4.1): 사람 👤 · 프로젝트 🚀 · 장소 📍 · 주제는 태그 아이콘(null) */
export const KIND_ICON: Record<TagKind, string | null> = { topic: null, person: '👤', project: '🚀', place: '📍' }
export const kindOf = (k: string | null | undefined): TagKind => tagKind(k)

export interface TagMeta {
  id: string
  name: string
  color: string | null
  kind: string | null
  aliases: string | null
  description: string | null
  topic_id: string | null
  source: string | null
}
export const TAG_META_SQL = 'SELECT id, name, color, kind, aliases, description, topic_id, source FROM tags ORDER BY sort_order'

/** 태그를 세는 곳은 state가 없거나 accepted인 행만(§8.1 — 제안·뗀 것은 태그가 아니다) */
export const ACCEPTED = tagAccepted
export const DESC_MAX = 500

// ── 화면 이동(행 링크·알약 → 페이지) ──
export type OpenTarget = { view: string; tagFilter?: string; taskId?: string }
let pendingFilter: { view: string; tag: string } | undefined
/** App이 듣는다: 보기를 바꾸고(tasks 탭), tagFilter가 있으면 그 리스트 안 태그 거르기로 연다 */
export function openTarget(t: OpenTarget) {
  if (t.tagFilter) pendingFilter = { view: t.view, tag: t.tagFilter }
  window.dispatchEvent(new CustomEvent<OpenTarget>('sprout:open-target', { detail: t }))
}
export function takeTagFilter(view: string): string | undefined {
  if (pendingFilter?.view !== view) return undefined
  const tag = pendingFilter.tag
  pendingFilter = undefined
  return tag
}
export const openLink = (type: string, id: string, listId?: string | null) =>
  openTarget(type === 'task' ? { view: listId ? `list:${listId}` : 'smart:all', taskId: id } : { view: `${type}:${id}` })

let pendingTopic: string | undefined
/** 수집함 › 위키의 그 주제로(태그 페이지 위키 줄) */
export function openWikiTopic(topicId: string) {
  pendingTopic = topicId
  window.dispatchEvent(new CustomEvent('sprout:open-wiki', { detail: topicId }))
}
export function takeWikiTopic(): string | undefined { const t = pendingTopic; pendingTopic = undefined; return t }

// ── 쓰기 ──
export const setListDescription = (id: string, text: string) => run(update('lists', id, { description: text.slice(0, DESC_MAX) || null }))
export const setTagDescription = (id: string, text: string) => run(update('tags', id, { description: text.slice(0, DESC_MAX) || null }))

/** §4.1 `+ 위키 페이지 만들기`: 같은 이름 주제가 있으면 잇고, 없으면 만들고 잇는다 */
export async function ensureTagTopic(tag: { id: string; name: string }): Promise<string> {
  const db = await getDb()
  const found = await db.get<{ id: string }>('SELECT id FROM wiki_topics WHERE name = ? LIMIT 1', [tag.name])
  if (found) { await run(update('tags', tag.id, { topic_id: found.id })); return found.id }
  const id = uuid()
  const content = JSON.stringify({ sections: { overview: [], key: [], questions: [] }, related: [], suggestions: [] })
  await run(
    insert('wiki_topics', { id, name: tag.name, source: 'user', content, locked: '[]', version: 1 }),
    insert('wiki_versions', { id: `${id}-v1`, topic_id: id, version: 1, content, reason: '태그 페이지에서 만들었어요' }),
    update('tags', tag.id, { topic_id: id })
  )
  return id
}

/**
 * 상세 태그 ✕(§6.6): 사용자가 붙인 태그는 연결을 지우고, 자동(ai·rule)·링크 태그는 dismissed로 남겨 다시 안 붙게 한다.
 * 돌려준 함수 = 되돌리기
 */
export async function removeTaskTag(taskId: string, tagId: string): Promise<() => Promise<void>> {
  const db = await getDb()
  const rows = await db.getAll<TaskTagRow & Record<string, unknown>>('SELECT * FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, tagId])
  const stmts: Stmt[] = []
  for (const r of rows) {
    if ((r.source ?? 'user') === 'user') stmts.push(remove('task_tags', r.id))
    else stmts.push(update('task_tags', r.id, { state: 'dismissed' }))
  }
  await run(...stmts)
  return async () => {
    const restore: Stmt[] = []
    for (const r of rows) {
      if ((r.source ?? 'user') === 'user') restore.push(insert('task_tags', Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'owner_id'))))
      else restore.push(update('task_tags', r.id, { state: r.state ?? 'accepted' }))
    }
    await run(...restore)
  }
}

// ── [[링크]] 동기화(§6.4) ──
/**
 * 글 속 `[[ ]]`를 relations(source link)·task_tags(source link)와 맞춘다. 화면 어디서 고쳐도(행·상세·추가 바·모바일 동기화)
 * 같은 결과가 되도록 앱이 뒤에서 한 번에 돌린다(useLinkSync). 결과가 같으면 아무것도 쓰지 않는다.
 */
export async function syncLinks(): Promise<number> {
  const db = await getDb()
  const texts = await db.getAll<{ id: string; title: string | null; content: string | null }>(
    "SELECT id, title, content FROM tasks WHERE deleted_at IS NULL AND (title LIKE '%[[%' OR content LIKE '%[[%')"
  )
  const descs = await db.getAll<{ type: 'list' | 'tag'; id: string; description: string | null }>(
    "SELECT 'list' AS type, id, description FROM lists WHERE description LIKE '%[[%' UNION ALL SELECT 'tag', id, description FROM tags WHERE description LIKE '%[[%'"
  )
  const sources: LinkSource[] = [
    ...texts.flatMap((t) => [{ type: 'task' as const, id: t.id, field: 'title' as const, text: t.title }, { type: 'task' as const, id: t.id, field: 'content' as const, text: t.content }]),
    ...descs.map((d) => ({ type: d.type, id: d.id, field: 'description' as const, text: d.description }))
  ]
  const rels = await db.getAll<RelRow>("SELECT id, from_type, from_id, to_type, to_id, field FROM relations WHERE source = 'link' AND from_type IN ('task','list','tag')")
  if (!sources.length && !rels.length) return 0
  const tags = await db.getAll<{ id: string; name: string; aliases: string | null }>('SELECT id, name, aliases FROM tags')
  const lists = await db.getAll<{ id: string; name: string; kind: string | null }>('SELECT id, name, kind FROM lists WHERE archived_at IS NULL')
  const names = new Set(sources.flatMap((s) => linkNames(s.text)))
  const lower = new Set([...tags.map((t) => t.name), ...lists.map((l) => l.name), ...tags.flatMap((t) => parseAliases(t.aliases))])
  const needTasks = [...names].filter((n) => !lower.has(n))
  const tasks = needTasks.length
    ? await db.getAll<{ id: string; title: string }>(`SELECT id, title FROM tasks WHERE deleted_at IS NULL AND title IN (${needTasks.map(() => '?').join(',')})`, needTasks)
    : []
  const taskTags = await db.getAll<TaskTagRow>(
    `SELECT id, task_id, tag_id, source, state FROM task_tags WHERE source = 'link' OR task_id IN (${texts.map(() => '?').join(',') || 'NULL'})`,
    texts.map((t) => t.id)
  )
  const plan = planLinkSync(sources, rels, taskTags, { tags, lists, tasks })
  // 다른 기기가 같은 결정적 id로 먼저 넣었을 수 있다 → 이미 있는 id는 넣지 않는다
  const exists = async (table: string, ids: string[]) =>
    new Set(ids.length ? (await db.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map((r) => r.id) : [])
  const relHave = await exists('relations', plan.insertRel.map((r) => r.id))
  const tagHave = await exists('task_tags', plan.insertTag.map((r) => r.id))
  const stmts: Stmt[] = [
    ...plan.insertRel.filter((r) => !relHave.has(r.id)).map((r) => insert('relations', { ...r, source: 'link', state: 'accepted' })),
    ...plan.deleteRel.map((id) => remove('relations', id)),
    ...plan.insertTag.filter((r) => !tagHave.has(r.id)).map((r) => insert('task_tags', { ...r, source: 'link', state: 'accepted' })),
    ...plan.upgradeTag.map((id) => update('task_tags', id, { source: 'link', state: 'accepted', confidence: null })),
    ...plan.deleteTag.map((id) => remove('task_tags', id))
  ]
  await run(...stmts)
  return stmts.length
}

/** §6.5 이름 바꾸기: 이 대상을 link로 가리키는 할 일 제목·본문·설명의 `[[옛이름]]` → `[[새이름]]` 문장들과 고친 곳 수 */
export async function linkRenameStmts(type: 'list' | 'tag', id: string, oldName: string, newName: string): Promise<{ stmts: Stmt[]; count: number }> {
  if (!oldName || oldName === newName) return { stmts: [], count: 0 }
  const db = await getDb()
  const rels = await db.getAll<{ from_type: string; from_id: string; field: string }>(
    "SELECT DISTINCT from_type, from_id, field FROM relations WHERE source = 'link' AND to_type = ? AND to_id = ?", [type, id]
  )
  const stmts: Stmt[] = []
  let count = 0
  const seen = new Set<string>()
  for (const r of rels) {
    const key = `${r.from_type}:${r.from_id}`
    if (seen.has(key)) continue
    seen.add(key)
    const table = r.from_type === 'task' ? 'tasks' : r.from_type === 'list' ? 'lists' : r.from_type === 'tag' ? 'tags' : null
    if (!table) continue
    const fields = r.from_type === 'task' ? ['title', 'content'] : ['description']
    const row = await db.get<Record<string, string | null>>(`SELECT ${fields.join(', ')} FROM ${table} WHERE id = ?`, [r.from_id])
    if (!row) continue
    const patch: Record<string, string> = {}
    for (const f of fields) {
      const out = renameLinks(row[f] ?? '', oldName, newName)
      if (out.count) { patch[f] = out.text; count += out.count }
    }
    if (Object.keys(patch).length) stmts.push(update(table, r.from_id, patch))
  }
  return { stmts, count }
}

/** 이름 바꾸기 + 링크 고침을 한 트랜잭션에서(OrganizationEditor). 고친 링크 수 */
export async function renameWithLinks(type: 'list' | 'tag', id: string, oldName: string, newName: string, extra: Record<string, unknown> = {}): Promise<number> {
  const { stmts, count } = await linkRenameStmts(type, id, oldName, newName)
  await run(update(type === 'list' ? 'lists' : 'tags', id, { ...extra, name: newName }), ...stmts)
  return count
}

/** 연결 안 된 언급 `링크로`: 그 할 일 제목의 이름을 `[[이름]]`으로 감싼다. 돌려준 함수 = 되돌리기 */
export async function linkMention(taskId: string, name: string, wrap: (text: string, name: string) => string): Promise<() => Promise<void>> {
  const db = await getDb()
  const row = await db.get<{ title: string }>('SELECT title FROM tasks WHERE id = ?', [taskId])
  if (!row) return async () => {}
  await run(update('tasks', taskId, { title: wrap(row.title, name) }))
  return () => run(update('tasks', taskId, { title: row.title }))
}

// ── ✦ AI가 붙인 태그 요약·되돌리기 ──
/**
 * 자동 태그 파이프라인(다른 담당)과의 경계. 파이프라인이 자기 함수를 내보내면 setAutoTagApi로 바꿔 끼운다.
 * 기본 구현은 로컬 DB만으로 계산한다(source ai·rule, run_id 묶음, 24시간 되돌리기 — 31 §4.3·30 §B.3 규칙).
 */
export interface AutoTagApi {
  /** at: 기준 시각(시험용 고정 시계, 기본은 지금) */
  summary(at?: string): Promise<{ count: number; tasks: number; lastRun?: { id: string; at: string; count: number } }>
  undoLastRun(): Promise<number>
}
const DAY = 24 * 60 * 60 * 1000
const localAutoTag: AutoTagApi = {
  async summary() {
    const db = await getDb()
    const s = await db.get<{ c: number; t: number }>(
      `SELECT count(*) AS c, count(DISTINCT tt.task_id) AS t FROM task_tags tt JOIN tasks k ON k.id = tt.task_id
       WHERE tt.source IN ('ai','rule') AND ${ACCEPTED()} AND k.deleted_at IS NULL`
    )
    const since = new Date(Date.now() - DAY).toISOString()
    const run_ = await db.get<{ id: string; at: string; c: number }>(
      `SELECT run_id AS id, max(created_at) AS at, count(*) AS c FROM task_tags WHERE run_id IS NOT NULL AND source IN ('ai','rule') AND created_at >= ?
       GROUP BY run_id ORDER BY at DESC LIMIT 1`, [since]
    )
    return { count: s?.c ?? 0, tasks: s?.t ?? 0, lastRun: run_ ? { id: run_.id, at: run_.at, count: run_.c } : undefined }
  },
  async undoLastRun() {
    const last = (await this.summary()).lastRun
    if (!last) return 0
    const db = await getDb()
    // 그 뒤 사용자가 손대지 않은 것(아직 자동·accepted)만 지운다
    const rows = await db.getAll<{ id: string }>(`SELECT id FROM task_tags tt WHERE run_id = ? AND source IN ('ai','rule') AND ${ACCEPTED()}`, [last.id])
    const madeTags = await db.getAll<{ id: string }>("SELECT id FROM tags WHERE run_id = ? AND source = 'ai'", [last.id])
    const stmts: Stmt[] = rows.map((r) => remove('task_tags', r.id))
    for (const t of madeTags) {
      const left = await db.get<{ c: number }>(`SELECT count(*) AS c FROM task_tags WHERE tag_id = ? AND (run_id IS NULL OR run_id != ?)`, [t.id, last.id])
      if (!left?.c) stmts.push(remove('tags', t.id))
    }
    await run(...stmts)
    return rows.length
  }
}
let autoTagApi: AutoTagApi = localAutoTag
export const setAutoTagApi = (api: AutoTagApi) => { autoTagApi = api }
export const autoTag = () => autoTagApi
