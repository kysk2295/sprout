// 11 수집함 v3: 화면·메인 프로세스가 같이 쓰는 순수 로직 — 링크 찾기, 카카오톡 내보내기 파싱, AI 분류 응답 검증
import { validDate } from './assistant'

export type CollectKind = 'memo' | 'task' | 'link' | 'wiki'
export const KINDS: CollectKind[] = ['memo', 'task', 'link', 'wiki']
export type WikiSection = 'overview' | 'key' | 'questions'

const URL_RE = /https?:\/\/[^\s<>"'）)\]]+/i
export const firstUrl = (text: string) => text.match(URL_RE)?.[0]?.replace(/[.,!?。]+$/, '') ?? null
// 링크 옆 짧은 글에 날짜·마감 말이 있으면 할 일일 수 있다("이 영상 보고 금요일까지 요약") → AI에게 맡긴다
const TASK_HINT = /(까지|해야|내일|오늘|모레|[월화수목금토일]요일|\d{1,2}\s*시|\d{1,2}\/\d{1,2}|\d{1,2}월\s*\d{1,2}일|요약|제출|예약|신청)/
/** 링크만 덩그러니 있으면(앞뒤 글 40자 이하, 날짜·마감 말 없음) AI 없이 바로 볼 것 */
export function isBareLink(text: string) {
  const url = firstUrl(text)
  if (!url) return false
  const rest = text.replace(url, '').trim()
  return rest.length <= 40 && !TASK_HINT.test(rest)
}
export const isYoutube = (url: string) => { try { return /(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(url).hostname) } catch { return false } }
export const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

/** 짧고 결정적인 지문(cyrb53) — 같은 메시지를 두 번 가져와도 같은 값 */
export function fingerprint(text: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// ── 카카오톡 대화 내보내기 ──────────────────────────────────────────────
export interface KakaoMessage { at: string; author: string; text: string; fingerprint: string }
export interface KakaoParse { messages: KakaoMessage[]; skipped: number; from: string | null; to: string | null; links: number }

const hour = (ampm: string | undefined, h: number) => (ampm === '오후' && h < 12 ? h + 12 : ampm === '오전' && h === 12 ? 0 : h)
const MEDIA = /^(사진|동영상|이모티콘|\(이모티콘\)|음성메시지|삭제된 메시지입니다\.?|사진 \d+장|파일: .+|보이스톡.*|페이스톡.*|라이브톡.*|지도: .+|연락처: .+|송금.*|선물.*)$/
// PC: --------------- 2026년 10월 4일 토요일 ---------------  /  모바일: 2026년 10월 4일 토요일
const DATE_LINE = /^-*\s*(\d{4})년 (\d{1,2})월 (\d{1,2})일 [월화수목금토일]요일\s*-*$/
// PC: [이름] [오후 3:12] 내용
const PC_LINE = /^\[(.+?)\] \[(오전|오후)? ?(\d{1,2}):(\d{2})\] ?(.*)$/
// iOS: 2026. 10. 4. 오후 3:12, 이름 : 내용  /  안드로이드: 2026년 10월 4일 오후 3:12, 이름 : 내용
const MOBILE_LINE = /^(\d{4})(?:\. |년 )(\d{1,2})(?:\. |월 )(\d{1,2})(?:\.|일) (오전|오후)? ?(\d{1,2}):(\d{2}),? (.+?) : (.*)$/
// macOS CSV: 2026-10-04 15:12:00,"이름","내용"
const CSV_HEAD = /^﻿?Date,User,Message/

function csvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/** PC·모바일·macOS 내보내기를 읽는다. 여러 줄 메시지는 이어 붙이고, 사진·이모티콘·파일은 뺀다. 시각은 기기 지역 시간으로 해석 */
export function parseKakao(raw: string): KakaoParse {
  const text = raw.replace(/^﻿/, '')
  const out: { at: Date; author: string; lines: string[] }[] = []
  if (CSV_HEAD.test(text)) {
    for (const [date, author, message] of csvRows(text).slice(1)) {
      const m = date?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/)
      if (m && message !== undefined) out.push({ at: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), author: author ?? '', lines: [message] })
    }
  } else {
    let day: [number, number, number] | null = null
    for (const line of text.split(/\r?\n/)) {
      const d = line.match(DATE_LINE)
      if (d) { day = [+d[1], +d[2], +d[3]]; continue }
      const pc = line.match(PC_LINE)
      if (pc && day) { out.push({ at: new Date(day[0], day[1] - 1, day[2], hour(pc[2], +pc[3]), +pc[4]), author: pc[1], lines: [pc[5]] }); continue }
      const mo = line.match(MOBILE_LINE)
      if (mo) { out.push({ at: new Date(+mo[1], +mo[2] - 1, +mo[3], hour(mo[4], +mo[5]), +mo[6]), author: mo[7], lines: [mo[8]] }); continue }
      // 날짜만 있는 시스템 줄(모바일 "2026. 10. 4. 오후 3:12: 님이 들어왔습니다")은 버린다
      if (/^\d{4}\. \d{1,2}\. \d{1,2}\. (오전|오후)? ?\d{1,2}:\d{2}[:,]/.test(line)) continue
      if (out.length) out[out.length - 1].lines.push(line)
    }
  }
  const messages: KakaoMessage[] = []
  let skipped = 0
  for (const m of out) {
    const body = m.lines.join('\n').replace(/^\(이모티콘\)\s*/, '').trim()
    if (!body || MEDIA.test(body) || Number.isNaN(m.at.getTime())) { skipped++; continue }
    const at = m.at.toISOString()
    messages.push({ at, author: m.author, text: body, fingerprint: `kakao:${fingerprint(`${at}|${body}`)}` })
  }
  const times = messages.map((m) => m.at).sort()
  return { messages, skipped, from: times[0] ?? null, to: times.at(-1) ?? null, links: messages.filter((m) => firstUrl(m.text)).length }
}

// ── AI 분류 ─────────────────────────────────────────────────────────────
export interface ClassifyItem { id: string; text: string; sent: string; sentIso?: string; linkTitle?: string | null; fixedKind?: CollectKind | null }
export interface Classified { id: string; kind: CollectKind; title: string; start: string; due: string; listId: string; topic: string; section: WikiSection; point: string; overview: string; related: string[] }

const dateField = { type: 'string', pattern: '^(|[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2})?)$' }
export const classifySchema = (ids: string[], listIds: string[]) => ({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ids },
          kind: { type: 'string', enum: KINDS },
          title: { type: 'string' },
          start: dateField,
          due: dateField,
          listId: { type: 'string', enum: ['', ...listIds] },
          topic: { type: 'string' },
          section: { type: 'string', enum: ['overview', 'key', 'questions'] },
          point: { type: 'string' },
          overview: { type: 'string' },
          related: { type: 'array', items: { type: 'string' } }
        },
        required: ['id', 'kind', 'title', 'start', 'due', 'listId', 'topic', 'section', 'point', 'overview', 'related'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
})

/** 서버가 스키마(format)를 강제하지 못할 때가 있다(Ollama: think=false면 format 무시) — 작은 모델이 흔히 내는 모양을 모두 받는다:
 *  {items:[…]} · 맨 배열 […] · 다른 이름의 배열 하나({results:[…]}) · 항목 하나({id,…}) · 코드 울타리·앞뒤 설명 글 */
function looseItems(raw: string): unknown[] | null {
  const text = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')
  let data: unknown
  try { data = JSON.parse(text) } catch {
    const a = text.indexOf('['), o = text.indexOf('{')
    const start = a >= 0 && (o < 0 || a < o) ? a : o
    const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
    if (start < 0 || end <= start) return null
    try { data = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  }
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  if (Array.isArray(obj.items)) return obj.items
  if (typeof obj.id === 'string') return [obj]
  const arrays = Object.values(obj).filter(Array.isArray)
  return arrays.length === 1 ? arrays[0] : null
}

/** 글에 날짜·시각 말이 있는가. 없으면 모델이 날짜를 지어내도 버린다(작은 모델이 "아이디어"에도 날짜를 붙인다) */
const DATE_WORDS = /(오늘|내일|낼|모레|글피|요일|주말|평일|이번\s*주|다음\s*주|담주|다음\s*달|이번\s*달|월말|월초|\d{1,2}\s*시|\d{1,2}:\d{2}|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s*월|\d{1,2}\s*일|아침|점심|저녁|밤|새벽|오전|오후|정오|자정|까지|마감|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})/i
export const hasDateWords = (text: string) => DATE_WORDS.test(text)
const TIME_WORDS = /(\d{1,2}\s*시|\d{1,2}:\d{2}|오전|오후|정오|자정|아침|점심|저녁|밤|새벽|tonight|\d{1,2}\s*(?:am|pm))/i

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const KO_DAY = ['일', '월', '화', '수', '목', '금', '토']
/** 보낸 시각 기준 날짜 표 — 작은 모델이 "내일·다음 주 월요일"을 셈하지 않고 고르기만 하게(기기 지역 시간).
 *  주는 월요일 시작(한국어 "다음 주 월요일" 말뜻) */
export function dateRef(iso: string) {
  const base = new Date(iso)
  const at = (days: number) => { const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days); return `${ymd(d)} ${KO_DAY[d.getDay()]}` }
  const monday = (base.getDay() + 6) % 7
  const week = (offset: number) => KO_DAY.slice(1).concat('일').map((k, i) => `${k} ${at(i - monday + offset * 7).slice(0, 10)}`).join(', ')
  return { 오늘: at(0), 내일: at(1), 모레: at(2), '이번 주': week(0), '다음 주': week(1) }
}

/** "금요일까지"·"다음 주 월요일"의 날짜는 앱이 정한다(작은 모델이 요일 셈을 자주 틀린다). 요일 말이 하나뿐일 때만 날짜 부분을 바꾼다 */
export function fixWeekday(text: string, value: string, sentIso: string | undefined) {
  if (!value || !sentIso) return value
  const days = [...text.matchAll(/([월화수목금토일])요일/g)].map((m) => m[1])
  if (new Set(days).size !== 1) return value
  const want = KO_DAY.indexOf(days[0])
  const sent = new Date(sentIso)
  const base = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate())
  let d: Date
  if (/(다음|담)\s*주/.test(text)) {
    const monday = (base.getDay() + 6) % 7
    d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - monday + 7 + ((want + 6) % 7))
  } else if (/(이번|이)\s*주/.test(text)) {
    const monday = (base.getDay() + 6) % 7
    d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - monday + ((want + 6) % 7))
  } else d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ((want - base.getDay() + 7) % 7))
  return ymd(d) + value.slice(10)
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
/** 모델 출력은 믿지 않는다: 요청한 id만, 종류는 4개 중 하나, 날짜는 전환 검사와 같게. 틀린 항목은 버린다(다음에 다시) */
export function parseClassified(raw: string, items: ClassifyItem[], listIds: string[]): Classified[] {
  const list = looseItems(raw)
  if (!list) throw new Error('AI 응답 형식을 확인할 수 없어요.')
  const byId = new Map(items.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const out: Classified[] = []
  for (const value of list) {
    const v = value as Record<string, unknown>
    const item = typeof v?.id === 'string' ? byId.get(v.id) : undefined
    if (!item || seen.has(item.id)) continue
    const kind = item.fixedKind ?? (KINDS.includes(v.kind as CollectKind) ? (v.kind as CollectKind) : null)
    if (!kind) continue
    let start = clip(v.start, 16), due = clip(v.due, 16)
    if ((start && !validDate(start)) || (due && !validDate(due)) || !hasDateWords(item.text)) start = due = ''
    if (!start) due = fixWeekday(item.text, due, item.sentIso)
    // 시각 말이 없는데 시각을 붙이면(작은 모델이 '금요일까지'를 T00:00으로 낸다) 날짜만 남긴다 — 2026-10-04 E2E
    if (!TIME_WORDS.test(item.text)) { start = start.slice(0, 10); due = due.slice(0, 10) }
    if (start && (!due || start.length !== due.length || start >= due)) { due = start; start = '' }
    const section: WikiSection = v.section === 'overview' || v.section === 'questions' ? v.section : 'key'
    seen.add(item.id)
    out.push({
      id: item.id,
      kind,
      title: clip(v.title, 200),
      start,
      due,
      listId: typeof v.listId === 'string' && listIds.includes(v.listId) ? v.listId : '',
      topic: clip(v.topic, 20),
      section,
      point: clip(v.point, 160),
      overview: clip(v.overview, 160),
      related: Array.isArray(v.related) ? v.related.filter((r): r is string => typeof r === 'string').map((r) => r.trim().slice(0, 20)).filter(Boolean).slice(0, 3) : []
    })
  }
  return out
}
