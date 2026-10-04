// 26 수집함(모바일) 순수 로직 — 데스크톱 apps/desktop/src/shared/collect.ts · renderer/data/collect.ts · notes.ts ·
// components/collect/shared.tsx의 규칙을 그대로 옮겼다(같은 행·같은 문구·같은 결정적 id).
// DB·화면 없이 시험한다(collect.test.ts). TODO(공용화): 이 파일 전체를 packages/schema/collect로 옮겨 두 앱이 같이 쓴다.
import { insertStmt, updateStmt, type Stmt } from '@sprout/schema/taskCore'
import { dayKey, rowDateLabel } from '../lib/dates.ts'
import { firstUrl, isBareLink } from '../share/link.ts'

export { firstUrl, isBareLink }

export type CollectKind = 'memo' | 'task' | 'link' | 'wiki'
export const KINDS: CollectKind[] = ['memo', 'task', 'link', 'wiki']
export const KIND_NAME: Record<CollectKind, string> = { task: '할 일', link: '볼 것', wiki: '위키', memo: '메모' }
export type WikiSection = 'overview' | 'key' | 'questions'
export const SECTIONS: WikiSection[] = ['overview', 'key', 'questions']
export const SECTION_NAME: Record<WikiSection, string> = { overview: '개요', key: '핵심 정리', questions: '열린 질문' }

export const isYoutube = (url: string) => { try { return /(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(url).hostname) } catch { return false } }
export const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

export interface CollectItem {
  id: string
  content: string
  created_at: string
  modified_at: string
  task_id: string | null
  task_title?: string | null
  task_deleted?: string | null
  task_scheduled?: number | null
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
}
export interface Suggestion { title: string; start?: string; due?: string; listId?: string }

export const suggestionOf = (n: Pick<CollectItem, 'suggestion'>): Suggestion | null => {
  if (!n.suggestion) return null
  try { const s = JSON.parse(n.suggestion); return typeof s?.title === 'string' ? s : null } catch { return null }
}

/** 새 항목 칸(owner_id 제외). 링크만이면 AI 없이 볼 것(v3-3).
 *  휴대폰은 분류기를 돌리지 않는다(26 M-C5) → 나머지는 'pending'으로 두면 데스크톱 수집기가 정리한다 */
export function itemRow(content: string) {
  const text = content.trim()
  const bare = isBareLink(text)
  return {
    content: text,
    task_id: null,
    url: firstUrl(text),
    kind: bare ? 'link' : null,
    kind_source: bare ? 'ai' : null,
    ai_state: bare ? 'done' : 'pending',
    source: 'app'
  }
}

// ── 표기 ──────────────────────────────────────────────────────────────
const p2 = (n: number) => String(n).padStart(2, '0')
export const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim() ?? ''
export const localDay = (iso: string) => dayKey(0, new Date(iso))
/** "오후 2:10" */
export function timeKo(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${p2(d.getMinutes())}`
}
export const monthDayKo = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일` }
export const fullKo = (iso: string) => `${monthDayKo(iso)} ${timeKo(iso)}`
/** 원래 보낸 시각(카톡·공유) 또는 작성 시각 */
export const sentAt = (n: Pick<CollectItem, 'captured_at' | 'created_at'>) => n.captured_at ?? n.created_at
export const isKakao = (n: Pick<CollectItem, 'source'>) => n.source === 'kakao_import' || n.source === 'kakao_channel'
/** "오늘" · "어제" · "10월 2일" */
export function shortDay(iso: string, today = dayKey()) {
  const d = localDay(iso)
  return d === today ? '오늘' : d === dayKey(-1, new Date(`${today}T12:00`)) ? '어제' : monthDayKo(iso)
}
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }
/** 위키 출처 꼬리표: 카톡 10/2 · 메모 9/30 · 오늘 */
export function sourceLabel(n: Pick<CollectItem, 'source' | 'captured_at' | 'created_at'>, today = dayKey()) {
  const at = sentAt(n)
  if (isKakao(n)) return `카톡 ${md(at)}`
  return localDay(at) === today ? '오늘' : `메모 ${md(at)}`
}
/** 행 제목: 링크만 있는 항목은 가져온 제목을 먼저 */
export function titleOf(n: Pick<CollectItem, 'url' | 'link_title' | 'content'>) {
  if (n.url && n.link_title && isBareLink(n.content)) return n.link_title
  return firstLine(n.content)
}
export const registeredGone = (n: CollectItem) => !!n.task_id && (!n.task_title || !!n.task_deleted)
export const scheduledWord = (n: CollectItem) => (n.task_scheduled ? '일정' : '할 일')

/** 행 둘째 줄 꼬리표(26 §2.2, 데스크톱 ItemRow와 같은 순서) */
export type Chip = { text: string; tone: 'plain' | 'accent' | 'wiki' | 'line' | 'muted' }
export function chipsOf(n: CollectItem, today = dayKey()): { chips: Chip[]; register: boolean; icon: 'task' | 'link' | 'wiki' | 'memo' | 'pending' } {
  const chips: Chip[] = []
  let register = false
  if (isKakao(n)) chips.push({ text: '카톡', tone: 'line' })
  if (n.task_id) {
    chips.push({ text: registeredGone(n) ? `${scheduledWord(n)} · 삭제됨` : scheduledWord(n) === '일정' ? '일정으로 등록됨' : '할 일로 등록됨', tone: 'accent' })
  } else if (n.ai_state === 'pending') {
    // 휴대폰은 분류기가 돌고 있는지 모른다 → 회전 대신 "정리 전"(데스크톱이 열리면 정리된다, 26 §3 결정)
    chips.push({ text: '정리 전', tone: 'muted' })
  } else if (n.kind === 'task' && n.ai_state !== 'failed') {
    const s = suggestionOf(n)
    const d = s?.due ? rowDateLabel({ start_at: s.start || null, due_at: s.due }, today) : null
    chips.push({ text: `할 일 제안${d ? ` · ${d.label}` : ''}`, tone: 'accent' })
    register = true
  } else if (n.kind === 'link') chips.push({ text: '볼 것', tone: 'plain' })
  else if (n.kind === 'wiki') chips.push({ text: `위키${n.topic_name ? ` · ${n.topic_name}` : ''}`, tone: 'wiki' })
  else if (n.kind === 'memo') chips.push({ text: '메모', tone: 'plain' })
  const icon = n.task_id || n.kind === 'task' ? 'task' : n.ai_state === 'pending' ? 'pending' : n.kind === 'link' ? 'link' : n.kind === 'wiki' ? 'wiki' : 'memo'
  return { chips, register, icon }
}

// ── 묶음(데스크톱 NotesView와 같은 규칙) ───────────────────────────────
export type Group = { id: string; name: string; items: CollectItem[]; closedByDefault: boolean; showTime: boolean }
const APP_GROUPS: [string, string][] = [['today', '오늘'], ['yesterday', '어제'], ['week', '이번 주'], ['older', '이전']]
export function appGroupOf(iso: string, today: string) {
  const day = localDay(iso)
  if (day === today) return 'today'
  const base = new Date(`${today}T12:00`)
  if (day === dayKey(-1, base)) return 'yesterday'
  const weekStart = dayKey(-((base.getDay() + 6) % 7), base) // 주 시작 = 월요일
  return day >= weekStart ? 'week' : 'older'
}
/** 앱에서 넣은 것 = 작성 날짜 묶음, 카톡에서 가져온 것 = 원래 날짜별 묶음(최근 하나만 펼침) */
export function groupItems(items: CollectItem[], today = dayKey()): Group[] {
  const app = new Map<string, CollectItem[]>()
  const kakao = new Map<string, CollectItem[]>()
  for (const n of items) {
    if (isKakao(n)) { const d = localDay(sentAt(n)); kakao.set(d, [...(kakao.get(d) ?? []), n]) }
    else { const g = appGroupOf(n.created_at, today); app.set(g, [...(app.get(g) ?? []), n]) }
  }
  const out: Group[] = APP_GROUPS.filter(([id]) => app.has(id)).map(([id, name]) => ({ id, name, items: app.get(id)!, closedByDefault: id === 'older', showTime: id === 'today' }))
  ;[...kakao.keys()].sort().reverse().forEach((d, i) => {
    const rows = kakao.get(d)!
    out.push({ id: `kakao:${d}`, name: `카카오톡에서 가져옴 · ${monthDayKo(sentAt(rows[0]))}`, items: rows, closedByDefault: i > 0, showTime: true })
  })
  return out
}
/** 볼 것: 링크가 있는 항목 전부. 안 본 것 먼저 */
export function watchGroups(items: CollectItem[]) {
  const links = items.filter((n) => n.url)
  return [
    { id: 'unseen' as const, name: '안 본 것', items: links.filter((n) => !n.seen_at) },
    { id: 'seen' as const, name: '다 본 것', items: links.filter((n) => n.seen_at) }
  ]
}
/** 목록 SQL — 검색은 글자 그대로 부분 일치(instr: `%`·`_`도 글자, 11 v2) */
export const ITEMS_SQL = `SELECT n.*, t.title AS task_title, t.deleted_at AS task_deleted, CASE WHEN t.start_at IS NOT NULL THEN 1 ELSE 0 END AS task_scheduled, w.name AS topic_name
  FROM notes n LEFT JOIN tasks t ON t.id = n.task_id LEFT JOIN wiki_topics w ON w.id = n.topic_id
  WHERE instr(lower(n.content || ' ' || COALESCE(n.link_title, '')), lower(?)) > 0
  ORDER BY COALESCE(n.captured_at, n.created_at) DESC, n.id DESC`

// ── 할 일로 만들기(데스크톱 convertNote와 같은 검사·같은 id) ─────────────
export type ConvertInput = { title: string; listId: string; due?: string; start?: string }
const validDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) return false
  const parsed = new Date(value.includes('T') ? `${value}:00Z` : `${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, value.length) === value
}
export function convertError(input: ConvertInput): string | null {
  if (!input.title.trim()) return '제목을 입력해 주세요.'
  for (const v of [input.start, input.due]) if (v && !validDay(v)) return '날짜를 확인해 주세요.'
  if (input.start && (!input.due || input.start.length !== input.due.length || input.start >= input.due)) return '종료 시각은 시작 이후여야 해요.'
  return null
}
export const noteTaskId = (noteId: string) => `note-${noteId}`
/** 결정적 id `note-<id>` + INSERT OR IGNORE → 두 기기가 같이 눌러도 할 일은 하나 */
export function convertStmts(note: Pick<CollectItem, 'id' | 'content'>, input: ConvertInput, owner: string, sortOrder = -Date.now()): Stmt[] {
  const taskId = noteTaskId(note.id)
  const stmt = insertStmt('tasks', { owner_id: owner, id: taskId, list_id: input.listId, title: input.title.trim(), content: note.content, content_mode: 'text', status: 0, priority: 0, start_at: input.start ?? null, due_at: input.due ?? null, is_all_day: input.due?.includes('T') ? 0 : 1, time_zone: 'floating', sort_order: sortOrder })
  stmt.sql = stmt.sql.replace('INSERT INTO', 'INSERT OR IGNORE INTO')
  return [stmt, updateStmt('notes', note.id, { task_id: taskId })]
}
/** `등록` = AI 제안 그대로(리스트 없으면 기본함) */
export function suggestionInput(n: CollectItem, lists: { id: string; kind: string | null }[]): ConvertInput | null {
  const s = suggestionOf(n)
  const listId = (s?.listId && lists.some((l) => l.id === s.listId) ? s.listId : lists.find((l) => l.kind === 'inbox')?.id) ?? lists[0]?.id
  if (!listId) return null
  return { title: (s?.title?.trim() || firstLine(n.content)).slice(0, 200), listId, due: s?.due || undefined, start: s?.start || undefined }
}

/** 종류 바꾸기(데스크톱 setKind와 같은 칸). 위키·제안 없는 할 일은 데스크톱이 다시 정리하도록 대기 */
export function kindPatch(n: Pick<CollectItem, 'suggestion'>, kind: CollectKind) {
  return { kind, kind_source: 'user', ai_state: kind === 'wiki' || (kind === 'task' && !n.suggestion) ? 'pending' : 'done', ...(kind !== 'wiki' ? { topic_id: null } : {}) }
}

// ── 위키 ──────────────────────────────────────────────────────────────
export interface WikiLine { text: string; src?: string; at: string; by: 'ai' | 'user' }
export interface WikiContent { sections: Record<WikiSection, WikiLine[]>; related: string[]; suggestions: (WikiLine & { section: WikiSection })[] }
export interface WikiTopic { id: string; name: string; source: string; content: string; locked: string; version: number; modified_at: string; created_at: string; count?: number }
export const emptyContent = (): WikiContent => ({ sections: { overview: [], key: [], questions: [] }, related: [], suggestions: [] })
export function contentOf(t: Pick<WikiTopic, 'content'> | null | undefined): WikiContent {
  try {
    const c = JSON.parse(t?.content ?? '')
    const base = emptyContent()
    for (const k of SECTIONS) if (Array.isArray(c?.sections?.[k])) base.sections[k] = c.sections[k]
    if (Array.isArray(c?.related)) base.related = c.related
    if (Array.isArray(c?.suggestions)) base.suggestions = c.suggestions
    return base
  } catch { return emptyContent() }
}
export const lockedOf = (t: Pick<WikiTopic, 'locked'> | null | undefined): WikiSection[] => { try { const l = JSON.parse(t?.locked ?? '[]'); return Array.isArray(l) ? l : [] } catch { return [] } }

/** 새 버전 = 주제 행 갱신 + 이력 한 줄(id `<주제>-v<버전>` — 데스크톱과 같다) */
export function versionStmts(topic: Pick<WikiTopic, 'id' | 'version'>, content: WikiContent, reason: string, owner: string, patch: Record<string, unknown> = {}): Stmt[] {
  const version = (topic.version ?? 0) + 1
  const json = JSON.stringify(content)
  return [
    updateStmt('wiki_topics', topic.id, { content: json, version, ...patch }),
    insertStmt('wiki_versions', { owner_id: owner, id: `${topic.id}-v${version}`, topic_id: topic.id, version, content: json, reason })
  ]
}
/** 자료 하나를 주제에서 뺀다(사용자가 직접 쓴 줄은 남김). 바뀐 것이 없으면 null */
export function dropSource(content: WikiContent, noteId: string): WikiContent | null {
  let changed = false
  const next: WikiContent = { ...content, sections: { ...content.sections } }
  for (const k of SECTIONS) {
    const kept = content.sections[k].filter((l) => l.src !== noteId || l.by === 'user')
    if (kept.length !== content.sections[k].length) { next.sections[k] = kept; changed = true }
  }
  const s = content.suggestions.filter((l) => l.src !== noteId)
  if (s.length !== content.suggestions.length) { next.suggestions = s; changed = true }
  return changed ? next : null
}
export const restoreReason = (version: number) => `${ro(`버전 ${version}`)} 되돌렸어요`

/** 띠(11 v3-5): 처음 열 때 본 버전 이후 바뀌었으면 이유 문구. 여러 번이면 "N번 바뀌었어요 — 마지막 이유" */
export function bandReason(topicVersion: number, baseline: number, latestReason: string | undefined) {
  if (topicVersion <= baseline) return ''
  return topicVersion - baseline > 1 ? `${topicVersion - baseline}번 바뀌었어요 — ${latestReason ?? ''}` : latestReason ?? '주제가 바뀌었어요'
}
/** "방금 고침" · "오후 2:10 고침" · "10월 2일 고침" */
export function changedAt(iso: string, now = Date.now(), today = dayKey()) {
  if (Math.abs(now - Date.parse(iso)) < 60_000) return '방금 고침'
  return localDay(iso) === today ? `${timeKo(iso)} 고침` : `${monthDayKo(iso)} 고침`
}

// ── 한국어 조사(데스크톱 lib/josa.ts와 같다 — 숫자는 읽는 소리로) ─────────
const DIGIT_BATCHIM = [true, true, false, true, false, false, true, true, true, false]
function lastSound(word: string) {
  const ch = word.trim().slice(-1)
  if (/\d/.test(ch)) return { batchim: DIGIT_BATCHIM[Number(ch)], rieul: ch === '1' || ch === '7' || ch === '8' }
  const code = ch.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return { batchim: false, rieul: false }
  const jong = code % 28
  return { batchim: jong !== 0, rieul: jong === 8 }
}
export const ro = (w: string) => { const s = lastSound(w); return `${w}${s.batchim && !s.rieul ? '으로' : '로'}` }
export const eulReul = (w: string) => `${w}${lastSound(w).batchim ? '을' : '를'}`
