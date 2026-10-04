// 30 §A.2 이모지 선택기 — 자료 읽기 · 검색(한국어·영어 이름과 태그) · 자주 쓰는(최근 고른 16개, 기기 저장)
export type Emoji = { e: string; ko: string; koTags: string; en: string; enTags: string; group: number }
export const EMOJI_GROUPS = ['사람', '자연', '음식', '활동', '여행', '사물', '기호', '깃발'] as const
export const GROUP_ICONS = ['😀', '🐻', '🍔', '⚽', '🚗', '💡', '🔣', '🏳️'] as const
export const RECENT_MAX = 16
const RECENT_KEY = 'sprout.emoji.recent'

/** 생성 자료(탭 구분 줄)를 읽는다 */
export function parseEmojiData(raw: string): Emoji[] {
  const out: Emoji[] = []
  for (const line of raw.split('\n')) {
    const [e, ko = '', koTags = '', en = '', enTags = '', g = '0'] = line.split('\t')
    if (e) out.push({ e, ko, koTags, en, enTags, group: Number(g) || 0 })
  }
  return out
}

let cache: Promise<Emoji[]> | undefined
/** 큰 자료라 처음 열 때 동적으로 불러온다 */
export function loadEmoji(): Promise<Emoji[]> {
  cache ??= import('./emojiData').then((m) => parseEmojiData(m.EMOJI_DATA))
  return cache
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
/**
 * 검색: 이름이 검색어로 시작하면 먼저, 이름에 들어 있으면 그다음, 태그에만 있으면 마지막.
 * 한국어는 띄어쓰기를 무시한다("웃는얼굴" = "웃는 얼굴"). 빈 검색어 = 전부
 */
export function searchEmoji(all: Emoji[], query: string): Emoji[] {
  const q = norm(query)
  if (!q) return all
  const scored: { x: Emoji; s: number; i: number }[] = []
  all.forEach((x, i) => {
    const ko = norm(x.ko)
    const en = norm(x.en)
    let s = -1
    if (x.e === query.trim()) s = 0
    else if (ko.startsWith(q) || en.startsWith(q)) s = 1
    else if (ko.includes(q) || en.includes(q)) s = 2
    else if (norm(x.koTags).includes(q) || x.enTags.toLowerCase().split(' ').some((t) => t.startsWith(q))) s = 3
    if (s >= 0) scored.push({ x, s, i })
  })
  return scored.sort((a, b) => a.s - b.s || a.i - b.i).map((r) => r.x)
}

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch { return [] }
}
/** 고른 이모지를 맨 앞으로(겹치면 옮김), 16개까지 */
export function pushRecent(list: string[], emoji: string): string[] {
  return [emoji, ...list.filter((x) => x !== emoji)].slice(0, RECENT_MAX)
}
export function saveRecent(emoji: string): string[] {
  const next = pushRecent(loadRecent(), emoji)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* 기억만 못 한다 */ }
  return next
}
