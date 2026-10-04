// 11 수집함 v3: 수집 항목(notes)·위키(wiki_topics·wiki_versions) 읽기·쓰기
import { firstUrl, isBareLink, type Classified, type CollectKind, type KakaoMessage, type WikiSection } from '../../../shared/collect'
import { getDb, type Stmt } from './db'
import { insert, now, remove, run, update, uuid } from './mutations'
import { convertNote, type Note } from './notes'
import { eulReul, eunNeun, ro } from '../lib/josa'
/** 따옴표 이름 + 받침에 맞는 조사: '핵심 정리'는 · '개요'를 */
const quoted = (name: string, josa: (w: string) => string) => `'${name}'${josa(name).slice(name.length)}`

export interface Suggestion { title: string; start?: string; due?: string; listId?: string }
export interface CollectItem extends Note {
  kind: CollectKind | null
  kind_source: 'ai' | 'user' | null
  ai_state: 'pending' | 'done' | 'failed' | null
  suggestion: string | null
  url: string | null
  link_title: string | null
  seen_at: string | null
  topic_id: string | null
  topic_name?: string | null
  source: 'app' | 'kakao_import' | 'kakao_channel' | null
  captured_at: string | null
  fingerprint: string | null
}
export const kindOf = (n: Pick<CollectItem, 'kind'>): CollectKind => n.kind ?? 'memo'
export const suggestionOf = (n: Pick<CollectItem, 'suggestion'>): Suggestion | null => {
  if (!n.suggestion) return null
  try { const s = JSON.parse(n.suggestion); return typeof s?.title === 'string' ? s : null } catch { return null }
}

// ── 자동 분류 설정(기기별) ────────────────────────────────────────────
const AUTO_KEY = 'sprout.collect.auto'
export const autoClassify = () => { try { return localStorage.getItem(AUTO_KEY) !== '0' } catch { return true } }
export const setAutoClassify = (on: boolean) => { try { localStorage.setItem(AUTO_KEY, on ? '1' : '0') } catch { /* 저장 못 해도 이번 실행엔 반영 */ } }

/** 새 항목: 바로 저장하고 AI는 뒤에서(v3-3). 링크만 있으면 AI 없이 볼 것 */
export function itemRow(content: string, extra: Record<string, unknown> = {}) {
  const text = content.trim()
  const url = firstUrl(text)
  const bare = isBareLink(text)
  return {
    content: text,
    task_id: null,
    url,
    kind: bare ? 'link' : null,
    kind_source: bare ? 'ai' : null,
    ai_state: bare ? 'done' : autoClassify() ? 'pending' : null,
    source: 'app',
    ...extra
  }
}
export async function saveItem(content: string) {
  if (!content.trim()) throw new Error('내용을 입력해 주세요.')
  const id = uuid()
  await run(insert('notes', { id, ...itemRow(content) }))
  return id
}
/** 상세에서 글을 고치면 링크 칸도 다시 맞춘다 */
export async function editItem(id: string, content: string) {
  if (!content.trim()) throw new Error('내용을 입력해 주세요.')
  const db = await getDb()
  const old = await db.get<CollectItem>('SELECT url FROM notes WHERE id=?', [id])
  const url = firstUrl(content)
  await run(update('notes', id, { content: content.trim(), url, ...(url !== old?.url ? { link_title: null } : {}) }))
}
export async function deleteItem(id: string) {
  const row = await (await getDb()).get<Record<string, unknown>>('SELECT * FROM notes WHERE id=?', [id])
  await run(remove('notes', id))
  return row ? () => run(insert('notes', row)) : async () => {}
}

/** 사용자가 종류를 바꾸면 AI가 다시 바꾸지 않는다(kind_source=user). 위키는 주제를 AI가 고르도록 다시 정리 대기 */
export async function setKind(item: CollectItem, kind: CollectKind) {
  const stmts: Stmt[] = []
  if (item.topic_id && kind !== 'wiki') stmts.push(...(await dropFromTopic(item.topic_id, item.id)))
  stmts.push(update('notes', item.id, { kind, kind_source: 'user', ai_state: kind === 'wiki' || (kind === 'task' && !item.suggestion) ? 'pending' : 'done', ...(kind !== 'wiki' ? { topic_id: null } : {}) }))
  await run(...stmts)
}
export const reclassify = (id: string) => run(update('notes', id, { ai_state: 'pending', kind_source: null }))
export const setSeen = (id: string, seen: boolean) => run(update('notes', id, { seen_at: seen ? now() : null }))

/** `등록` 한 번 = v2 전환과 같은 경로(결정적 id, 중복 생성 없음) */
export async function registerSuggestion(item: CollectItem, lists: { id: string; kind: string }[]) {
  const s = suggestionOf(item)
  const listId = (s?.listId && lists.some((l) => l.id === s.listId) ? s.listId : lists.find((l) => l.kind === 'inbox')?.id) ?? lists[0]?.id
  if (!listId) throw new Error('리스트를 선택해 주세요.')
  const title = s?.title?.trim() || item.content.split('\n')[0].slice(0, 200)
  return convertNote(item.id, { title, listId, due: s?.due || undefined, start: s?.start || undefined })
}

// ── 카카오톡 가져오기 ──────────────────────────────────────────────────
export async function knownFingerprints(prints: string[]) {
  const db = await getDb()
  const known = new Set<string>()
  for (let i = 0; i < prints.length; i += 500) {
    const part = prints.slice(i, i + 500)
    for (const r of await db.getAll<{ fingerprint: string }>(`SELECT fingerprint FROM notes WHERE fingerprint IN (${part.map(() => '?').join(',')})`, part)) known.add(r.fingerprint)
  }
  return known
}
/** 원래 보낸 시각을 작성 시각으로. 중복은 지문으로 거른다(같은 파일 안 같은 메시지도 한 번만).
 *  id는 새로 만든다 — 지문을 id로 쓰면 같은 단톡방을 내보낸 다른 사용자와 서버에서 id가 부딪친다 */
export async function importKakao(messages: KakaoMessage[]) {
  const known = await knownFingerprints(messages.map((m) => m.fingerprint))
  const fresh = messages.filter((m) => !known.has(m.fingerprint) && (known.add(m.fingerprint), true))
  const stmts = fresh.map((m) => insert('notes', { id: uuid(), ...itemRow(m.text, { source: 'kakao_import', captured_at: m.at, fingerprint: m.fingerprint, created_at: m.at, ai_state: isBareLink(m.text) ? 'done' : 'pending' }) }))
  for (let i = 0; i < stmts.length; i += 200) await run(...stmts.slice(i, i + 200))
  return fresh.length
}

// ── 위키 ──────────────────────────────────────────────────────────────
export interface WikiLine { text: string; src?: string; at: string; by: 'ai' | 'user' }
export interface WikiContent { sections: Record<WikiSection, WikiLine[]>; related: string[]; suggestions: (WikiLine & { section: WikiSection })[] }
export interface WikiTopic { id: string; name: string; source: string; content: string; locked: string; version: number; modified_at: string; created_at: string; count?: number }
export const SECTION_NAME: Record<WikiSection, string> = { overview: '개요', key: '핵심 정리', questions: '열린 질문' }
export const emptyContent = (): WikiContent => ({ sections: { overview: [], key: [], questions: [] }, related: [], suggestions: [] })
export function contentOf(t: Pick<WikiTopic, 'content'> | null | undefined): WikiContent {
  try {
    const c = JSON.parse(t?.content ?? '')
    const base = emptyContent()
    for (const k of Object.keys(base.sections) as WikiSection[]) if (Array.isArray(c?.sections?.[k])) base.sections[k] = c.sections[k]
    if (Array.isArray(c?.related)) base.related = c.related
    if (Array.isArray(c?.suggestions)) base.suggestions = c.suggestions
    return base
  } catch { return emptyContent() }
}
export const lockedOf = (t: Pick<WikiTopic, 'locked'> | null | undefined): WikiSection[] => { try { const l = JSON.parse(t?.locked ?? '[]'); return Array.isArray(l) ? l : [] } catch { return [] } }

/** 새 버전 = 주제 행 갱신 + 이력 한 줄. reason은 띠·이력에 그대로 보인다 */
function writeVersion(topic: Pick<WikiTopic, 'id' | 'version'>, content: WikiContent, reason: string, patch: Record<string, unknown> = {}): Stmt[] {
  const version = (topic.version ?? 0) + 1
  const json = JSON.stringify(content)
  return [
    update('wiki_topics', topic.id, { content: json, version, ...patch }),
    insert('wiki_versions', { id: `${topic.id}-v${version}`, topic_id: topic.id, version, content: json, reason })
  ]
}

async function topics() { return (await getDb()).getAll<WikiTopic>('SELECT * FROM wiki_topics ORDER BY name') }
const sameName = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase()

/** 위키로 분류된 자료를 주제 페이지에 반영한다(v3-5 자동 반영). 맞는 주제가 없으면 새로 만든다. 잠긴 구역은 제안으로만 */
export async function applyToWiki(item: Pick<CollectItem, 'id' | 'content' | 'topic_id'>, c: Pick<Classified, 'topic' | 'section' | 'point' | 'overview' | 'related'>, extra: Record<string, unknown> = {}) {
  const all = await topics()
  const name = c.topic || '기타'
  let topic = all.find((t) => sameName(t.name, name))
  const stmts: Stmt[] = []
  if (item.topic_id && item.topic_id !== topic?.id) stmts.push(...(await dropFromTopic(item.topic_id, item.id)))
  const at = now()
  if (!topic) {
    const content = emptyContent()
    if (c.overview) content.sections.overview.push({ text: c.overview, src: item.id, at, by: 'ai' })
    topic = { id: uuid(), name, source: 'ai', content: JSON.stringify(content), locked: '[]', version: 0, modified_at: at, created_at: at }
    stmts.push(insert('wiki_topics', { id: topic.id, name, source: 'ai', content: topic.content, locked: '[]', version: 0 }))
  }
  const content = contentOf(topic)
  const locked = lockedOf(topic)
  const line: WikiLine = { text: c.point || item.content.split('\n')[0].slice(0, 160), src: item.id, at, by: 'ai' }
  // 같은 자료를 다시 정리하면 줄을 바꿔 끼운다(중복 없음)
  for (const k of Object.keys(content.sections) as WikiSection[]) if (k !== 'overview' || c.section === 'overview') content.sections[k] = content.sections[k].filter((l) => l.src !== item.id || l.by === 'user')
  content.suggestions = content.suggestions.filter((s) => s.src !== item.id)
  let reason: string
  if (locked.includes(c.section)) {
    content.suggestions.push({ ...line, section: c.section })
    reason = `${quoted(SECTION_NAME[c.section], eunNeun)} 직접 고친 곳이라 제안 1개로 남겼어요`
  } else {
    content.sections[c.section].push(line)
    reason = `방금 들어온 자료 1개를 '${SECTION_NAME[c.section]}'에 반영했어요`
  }
  const related = c.related.map((r) => all.find((t) => sameName(t.name, r))?.id).filter((id): id is string => !!id && id !== topic!.id)
  content.related = Array.from(new Set([...content.related, ...related])).slice(0, 6)
  stmts.push(...writeVersion(topic, content, reason), update('notes', item.id, { topic_id: topic.id, kind: 'wiki', ai_state: 'done', ...extra }))
  await run(...stmts)
  return topic.id
}

async function dropFromTopic(topicId: string, noteId: string): Promise<Stmt[]> {
  const topic = await (await getDb()).get<WikiTopic>('SELECT * FROM wiki_topics WHERE id=?', [topicId])
  if (!topic) return []
  const content = contentOf(topic)
  let changed = false
  for (const k of Object.keys(content.sections) as WikiSection[]) {
    const kept = content.sections[k].filter((l) => l.src !== noteId || l.by === 'user')
    if (kept.length !== content.sections[k].length) { content.sections[k] = kept; changed = true }
  }
  const s = content.suggestions.filter((l) => l.src !== noteId)
  if (s.length !== content.suggestions.length) { content.suggestions = s; changed = true }
  return changed ? writeVersion(topic, content, '자료 1개를 뺐어요') : []
}

/** 구역을 직접 고치면 🔒 — 같은 글의 줄은 출처를 그대로 둔다 */
export async function editSection(topic: WikiTopic, section: WikiSection, text: string) {
  const content = contentOf(topic)
  const prev = content.sections[section]
  const at = now()
  content.sections[section] = text.split('\n').map((l) => l.replace(/^[-•·]\s*/, '').trim()).filter(Boolean).map((t) => prev.find((l) => l.text === t) ?? { text: t, at, by: 'user' as const })
  const locked = Array.from(new Set([...lockedOf(topic), section]))
  await run(...writeVersion(topic, content, `${quoted(SECTION_NAME[section], eulReul)} 직접 고쳤어요`, { locked: JSON.stringify(locked) }))
}
export async function unlockSection(topic: WikiTopic, section: WikiSection) {
  await run(update('wiki_topics', topic.id, { locked: JSON.stringify(lockedOf(topic).filter((s) => s !== section)) }))
}
export async function resolveSuggestion(topic: WikiTopic, index: number, accept: boolean) {
  const content = contentOf(topic)
  const [s] = content.suggestions.splice(index, 1)
  if (!s) return
  const { section, ...line } = s
  if (accept) content.sections[section].push({ ...line, at: now() })
  await run(...writeVersion(topic, content, accept ? `제안 1개를 '${SECTION_NAME[section]}'에 넣었어요` : '제안 1개를 버렸어요'))
}
export async function versionsOf(topicId: string) {
  return (await getDb()).getAll<{ id: string; version: number; content: string; reason: string; created_at: string }>('SELECT * FROM wiki_versions WHERE topic_id=? ORDER BY version DESC', [topicId])
}
export async function restoreVersion(topic: WikiTopic, version: number) {
  const row = await (await getDb()).get<{ content: string }>('SELECT content FROM wiki_versions WHERE topic_id=? AND version=?', [topic.id, version])
  if (!row) throw new Error('그 버전을 찾을 수 없어요.')
  await run(...writeVersion(topic, contentOf(row), `${ro(`버전 ${version}`)} 되돌렸어요`))
}
export async function addTopic(name: string) {
  const n = name.trim().slice(0, 20)
  if (!n) throw new Error('주제 이름을 입력해 주세요.')
  if ((await topics()).some((t) => sameName(t.name, n))) throw new Error('같은 이름의 주제가 있어요.')
  const id = uuid()
  const content = JSON.stringify(emptyContent())
  await run(insert('wiki_topics', { id, name: n, source: 'user', content, locked: '[]', version: 1 }), insert('wiki_versions', { id: `${id}-v1`, topic_id: id, version: 1, content, reason: '주제를 만들었어요' }))
  return id
}
export async function renameTopic(topic: WikiTopic, name: string) {
  const n = name.trim().slice(0, 20)
  if (!n || n === topic.name) return
  if ((await topics()).some((t) => t.id !== topic.id && sameName(t.name, n))) throw new Error('같은 이름의 주제가 있어요.')
  await run(update('wiki_topics', topic.id, { name: n, source: 'user' }))
}
/** 합치기: from의 줄·제안·관련 주제·자료를 into로 옮기고 from을 지운다 */
export async function mergeTopic(from: WikiTopic, into: WikiTopic) {
  const a = contentOf(from), b = contentOf(into)
  for (const k of Object.keys(b.sections) as WikiSection[]) b.sections[k].push(...a.sections[k])
  b.suggestions.push(...a.suggestions)
  b.related = Array.from(new Set([...b.related, ...a.related])).filter((id) => id !== into.id && id !== from.id)
  await run(
    ...writeVersion(into, b, `'${from.name}' 주제를 합쳤어요`),
    { sql: 'UPDATE notes SET topic_id=?, modified_at=? WHERE topic_id=?', params: [into.id, now(), from.id] },
    { sql: 'DELETE FROM wiki_versions WHERE topic_id=?', params: [from.id] },
    remove('wiki_topics', from.id)
  )
}
/** 삭제: 자료는 메모로 돌아간다. 되돌리기 함수를 돌려준다 */
export async function deleteTopic(topic: WikiTopic) {
  const db = await getDb()
  const versions = await db.getAll<Record<string, unknown>>('SELECT * FROM wiki_versions WHERE topic_id=?', [topic.id])
  const row = await db.get<Record<string, unknown>>('SELECT * FROM wiki_topics WHERE id=?', [topic.id])
  const notes = await db.getAll<{ id: string; kind: string | null; kind_source: string | null }>('SELECT id, kind, kind_source FROM notes WHERE topic_id=?', [topic.id])
  await run(
    { sql: "UPDATE notes SET topic_id=NULL, kind='memo', kind_source='user', modified_at=? WHERE topic_id=?", params: [now(), topic.id] },
    { sql: 'DELETE FROM wiki_versions WHERE topic_id=?', params: [topic.id] },
    remove('wiki_topics', topic.id)
  )
  return () => run(
    ...(row ? [insert('wiki_topics', row)] : []),
    ...versions.map((v) => insert('wiki_versions', v)),
    ...notes.map((n) => update('notes', n.id, { topic_id: topic.id, kind: n.kind, kind_source: n.kind_source }))
  )
}
