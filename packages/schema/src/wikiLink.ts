// 33 §6 `[[링크]]`: 파서·표시 글·자연어 인식 보호·이름 바꾸기·자동 완성 맞추기. 데스크톱·모바일 공용(순수 함수).

/** `[[이름]]` — 이름은 1~80자, 대괄호·줄바꿈 없음. 닫히지 않은 `[[`는 글(§6.3-5) */
const LINK_RE = /\[\[([^[\]\n]{1,80}?)\]\]/g

export type LinkSeg = { text: string; link?: undefined } | { link: string; raw: string; text?: undefined }

/** 글을 일반 글·링크 조각으로 나눈다(행 표시용) */
export function linkSegments(text: string): LinkSeg[] {
  const out: LinkSeg[] = []
  let from = 0
  for (const m of text.matchAll(LINK_RE)) {
    const name = m[1].trim()
    if (!name) continue
    if (m.index! > from) out.push({ text: text.slice(from, m.index) })
    out.push({ link: name, raw: m[0] })
    from = m.index! + m[0].length
  }
  if (from < text.length) out.push({ text: text.slice(from) })
  return out
}

/** 글 속 링크 이름(겹침 없이, 나온 순서) */
export function linkNames(text: string | null | undefined): string[] {
  if (!text) return []
  const names: string[] = []
  for (const s of linkSegments(text)) if (s.link && !names.includes(s.link)) names.push(s.link)
  return names
}

/** 위젯·알림·메뉴바·AI 입력·지도 카드 등: 괄호를 뺀 글(§6.6) */
export const displayTitle = (text: string | null | undefined) => (text ?? '').replace(LINK_RE, (_, n: string) => n.trim())

/**
 * §6.3-1: `[[ … ]]`를 먼저 떼어 보호한다. 날짜·`#`·`~`·`!` 인식이 링크 안 글자를 보지 못하게
 * 사용자 영역 문자 자리표시로 바꾸고, 인식이 끝난 글에서 restore로 되돌린다.
 */
export function maskLinks(raw: string): { masked: string; links: string[]; tokens: string[]; restore: (s: string) => string } {
  const tokens: string[] = []
  const masked = raw.replace(LINK_RE, (whole: string) => {
    const i = tokens.push(whole) - 1
    return `${String.fromCharCode(0xe010 + i)}`
  })
  const restore = (s: string) => s.replace(/([-])/g, (_, c: string) => tokens[c.charCodeAt(0) - 0xe010] ?? '')
  return { masked, links: linkNames(raw), tokens, restore }
}

/** §6.5 이름 바꾸기: `[[옛이름]]` → `[[새이름]]`. 바뀐 곳 수도 돌려준다 */
export function renameLinks(text: string, oldName: string, newName: string): { text: string; count: number } {
  let count = 0
  const out = text.replace(LINK_RE, (whole: string, n: string) => {
    if (sameName(n, oldName)) { count++; return `[[${newName}]]` }
    return whole
  })
  return { text: out, count }
}

/** 연결 안 된 언급 `링크로`(§3.4): 링크 밖 첫 그대로 나온 이름을 `[[이름]]`으로 감싼다 */
export function wrapMention(text: string, name: string): string {
  const segs = linkSegments(text)
  let done = false
  return segs.map((s) => {
    if (s.link !== undefined || done) return s.link !== undefined ? s.raw : s.text
    const at = s.text.indexOf(name)
    if (at < 0) return s.text
    done = true
    return `${s.text.slice(0, at)}[[${name}]]${s.text.slice(at + name.length)}`
  }).join('')
}

/** 링크 밖 글에 이름이 그대로 있는가(연결 안 된 언급) */
export const mentionsPlain = (text: string, name: string) =>
  name.length >= 2 && linkSegments(text).some((s) => s.link === undefined && s.text.includes(name))

// ── 이름 맞추기 ──
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu
/** 이모지·공백·대소문자 무시 */
export const normName = (s: string) => s.replace(EMOJI_RE, '').replace(/\s+/g, '').toLowerCase()
export const sameName = (a: string, b: string) => normName(a) === normName(b) && normName(a) !== ''

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
/** 한글 초성(`교수님` → `ㄱㅅㄴ`), 한글 아닌 글자는 그대로 */
export function chosung(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00
    out += code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch
  }
  return out
}
/**
 * §6.2 맞추기 순위: 앞부분 3 > 포함 2 > 한글 초성 1 > 없음 0. 빈 질의는 1(전부 후보).
 * via = 별칭으로 맞았으면 그 별칭
 */
export function matchRank(query: string, name: string, aliases: string[] = []): { rank: number; via?: string } {
  const q = normName(query)
  if (!q) return { rank: 1 }
  let best: { rank: number; via?: string } = { rank: 0 }
  const isCho = /^[ㄱ-ㅎ]+$/.test(q)
  for (const [i, cand] of [name, ...aliases].entries()) {
    const n = normName(cand)
    const r = n.startsWith(q) ? 3 : n.includes(q) ? 2 : isCho && chosung(n).includes(q) ? 1 : 0
    if (r > best.rank) best = { rank: r, via: i === 0 ? undefined : cand }
  }
  return best
}

/** tags.aliases(JSON 글 배열) 읽기 — 깨졌으면 빈 배열 */
export function parseAliases(raw: string | null | undefined): string[] {
  if (!raw) return []
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [] } catch { return [] }
}

// ── 결정적 id ──
/** relations id = `rel-` + sha1(from_id + '>' + to_id + '>' + field) 앞 24자(§8.1) — 두 기기가 오프라인에서 같은 링크를 만들어도 한 행 */
export const relationId = (fromId: string, toId: string, field: string) => `rel-${sha1(`${fromId}>${toId}>${field}`).slice(0, 24)}`
/** `[[태그]]`로 붙는 task_tags 행 id — 같은 이유로 결정적 */
export const linkTagId = (taskId: string, tagId: string) => `ttl-${sha1(`${taskId}>${tagId}`).slice(0, 24)}`

/** 작은 동기 SHA-1(UTF-8). 보안용 아님 — 결정적 id용 */
export function sha1(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const len = bytes.length
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16)
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8)
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8)
  words[words.length - 1] = len * 8
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n))
  for (let off = 0; off < words.length; off += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[off + i]
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('')
}
