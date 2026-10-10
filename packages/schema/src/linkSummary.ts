// 11 v3-8 볼 것 링크 요약(2026-10-10): 페이지 글 뽑기 · AI 지시문 · 결과 읽기/저장 — 데스크톱(만듦)·휴대폰(보임)이 같이 쓴다.
// 저장 = notes.suggestion JSON의 linkSummary 키(링크 항목은 할 일 제안을 쓰지 않는다 — 스키마 변경 없음).

export type LinkSummary =
  | { lines: string[]; head?: string; from: 'page' | 'youtube'; at: string; url?: string }
  | { none: 'empty' | 'blocked'; at: string; url?: string }
export type LinkPage = { from: 'page' | 'youtube'; title: string; description: string; text: string }

/** 이 정도 글도 없으면 요약하지 않는다(로그인 벽·빈 페이지) */
export const SUMMARY_MIN_CHARS = 120
/** AI에 넘기는 본문 길이 */
export const SUMMARY_MAX_CHARS = 4000
/** 자동 요약 하루 상한(이 기기) */
export const SUMMARY_DAILY_AUTO = 20

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m)
const squash = (s: string) => decodeEntities(s).replace(/\s+/g, ' ').trim()

function meta(html: string, key: string): string {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html)
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i').exec(html)
  return squash((a ?? b)?.[1] ?? '')
}

/** 일반 페이지: 제목 · 설명 · 본문 글(제목·문단·목록 줄, 스크립트·메뉴·머리·바닥 뺌) */
export function pageFromHtml(html: string): LinkPage {
  const title = meta(html, 'og:title') || squash(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
  const description = meta(html, 'og:description') || meta(html, 'description')
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const main = /<(article|main)[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2] ?? body
  const parts: string[] = []
  const re = /<(h1|h2|h3|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(main)) && n < SUMMARY_MAX_CHARS) {
    const line = squash(m[2].replace(/<[^>]+>/g, ' '))
    if (line.length < 2) continue
    parts.push(line)
    n += line.length
  }
  return { from: 'page', title, description, text: parts.join('\n').slice(0, SUMMARY_MAX_CHARS) }
}

/** 유튜브: 영상 제목 + 설명란(페이지 안 shortDescription — 자막은 읽지 않는다, 사용자 결정) */
export function youtubeFromHtml(html: string): LinkPage {
  const title = meta(html, 'og:title') || squash(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/ - YouTube$/, '')
  let description = ''
  const raw = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1]
  if (raw) { try { description = JSON.parse(`"${raw}"`) } catch { description = raw } }
  if (!description) description = meta(html, 'og:description') || meta(html, 'description')
  return { from: 'youtube', title, description: description.trim().slice(0, SUMMARY_MAX_CHARS), text: '' }
}

/** 요약할 만큼 글이 있나 */
export const pageHasText = (p: LinkPage) => (p.text.length + p.description.length) >= SUMMARY_MIN_CHARS || (p.from === 'youtube' && p.description.length >= 40)

/** Ollama format(JSON 스키마) */
export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { head: { type: 'string' }, lines: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 } },
  required: ['head', 'lines']
} as const

export function summaryPrompt(p: LinkPage): string {
  const src = p.from === 'youtube' ? '유튜브 영상의 제목과 설명란' : '웹 페이지'
  return `다음은 ${src}이다. 이 링크를 나중에 볼 사람이 열어 보지 않아도 내용을 알 수 있게 한국어로 정리하라.
- head: 전체를 한 문장으로(50자 안).
- lines: 핵심 요점 4~5줄. 각 줄은 100자 안의 완결된 문장. 수치·이름·방법·결론처럼 구체적인 내용을 담고, 줄끼리 겹치지 않게.
규칙: 글에 있는 사실만(지어내지 말 것). 광고·구독 권유·링크 목록·사이트 메뉴는 빼라. 영어 글도 한국어로.
${p.from === 'youtube' ? '설명란 글만 보고 쓴다. 설명이 짧으면 요점을 1~3줄만 써도 된다. 영상을 본 것처럼 말하지 말 것.' : ''}
JSON {"head": "...", "lines": [...]}로만 답하라.

<title>${p.title.slice(0, 200)}</title>
<description>${p.description.slice(0, 1200)}</description>
<text>${p.text}</text>`
}

const clean = (x: string, max: number) => { const y = x.replace(/^[-•·*\d.\s]+/, '').replace(/\s+/g, ' ').trim(); return y.length > max ? y.slice(0, max - 1) + '…' : y }
/** AI 답 → 한 줄(head, 목록) + 요점(lines, 상세 — 빈 줄·겹침 빼고 최대 5줄, 줄당 120자) */
export function parseSummary(raw: string): { head: string; lines: string[] } {
  let v: unknown
  try { v = JSON.parse(raw) } catch { const m = /\{[\s\S]*\}/.exec(raw); try { v = m ? JSON.parse(m[0]) : null } catch { v = null } }
  const o = (v && typeof v === 'object' ? v : {}) as { head?: unknown; lines?: unknown }
  const lines = (Array.isArray(o.lines) ? o.lines : []).filter((x): x is string => typeof x === 'string').map((x) => clean(x, 120)).filter(Boolean)
  const uniq = [...new Set(lines)].slice(0, 5)
  const head = typeof o.head === 'string' ? clean(o.head, 70) : ''
  return { head: head || uniq[0] || '', lines: uniq }
}

function obj(suggestion: string | null | undefined): Record<string, unknown> {
  if (!suggestion) return {}
  try { const v = JSON.parse(suggestion); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { return {} }
}
/** 저장된 요약 읽기. url을 주면 그 주소로 만든 요약만(주소를 고치면 다시 요약) */
export function readLinkSummary(suggestion: string | null | undefined, url?: string | null): LinkSummary | null {
  const s = obj(suggestion).linkSummary as LinkSummary | undefined
  if (!s || typeof s !== 'object' || typeof s.at !== 'string') return null
  if (url && s.url && s.url !== url) return null
  if ('lines' in s && Array.isArray(s.lines) && s.lines.length) return { lines: s.lines.filter((x) => typeof x === 'string').slice(0, 5), ...(typeof s.head === 'string' && s.head ? { head: s.head } : {}), from: s.from === 'youtube' ? 'youtube' : 'page', at: s.at }
  if ('none' in s) return { none: s.none === 'blocked' ? 'blocked' : 'empty', at: s.at }
  return null
}
/** 요약 넣은 새 suggestion 글(다른 키는 그대로) */
export const withLinkSummary = (suggestion: string | null | undefined, s: LinkSummary) => JSON.stringify({ ...obj(suggestion), linkSummary: s })
/** 목록 둘째 줄에 쓸 첫 줄 */
export const summaryFirstLine = (suggestion: string | null | undefined, url?: string | null) => { const s = readLinkSummary(suggestion, url); return s && 'lines' in s ? s.head ?? s.lines[0] : null }
/** 상세 아래 출처 글 */
export const summarySourceLabel = (s: LinkSummary) => ('lines' in s ? (s.from === 'youtube' ? '영상 설명 기준 · 꿈틀 AI' : '페이지 기준 · 꿈틀 AI') : '')

/** 열어도 되는 주소인가(http·https, 계정 정보 없음, 이 기기·내부망 아님 — 가져온 링크가 공유기 관리 화면 등을 건드리지 않게). 휴대폰용(데스크톱 메인은 node:net으로 같은 규칙) */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return false
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  if (host.includes(':')) return !/^(::1?$|f[cd]|fe80)/i.test(host)
  return true
}
