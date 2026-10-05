// 30 §B.3 (가) 낱말 검사 — AI 없이 제목의 뚜렷한 낱말로 리스트·프로젝트를 고른다(데스크톱 listSuggest·정리 모드, 모바일 정리 모드 공용).
/** 어느 리스트에나 나올 흔한 낱말 — 이것만으로는 주제를 알 수 없다 */
const STOP = new Set(['정리', '확인', '준비', '메모', '연락', '통화', '전화', '사기', '하기', '오늘', '내일', '모레', '이번', '다음', '오전', '오후', '아침', '점심', '저녁', '주말', '작성', '검토', '신청', '등록', '예약', '보내기', '처리', '시작', '마무리', '생각', '체크', '할일', '해야', '하자', '아이디어', '자료', '조사', '관련', '내용', '다시', '그냥', '중요'])
const VERB_END = /(하기로|합니다|해야함|해야|하기|하자|했다|하는|하고|할것|할|한|해)$/
const JOSA_END = /(에서|으로|에게|께서|까지|부터|이랑|랑|을|를|이|가|은|는|에|로|와|과|도|의|께)$/
const strip = (w: string) => {
  let x = w
  for (const re of [VERB_END, JOSA_END]) { const y = x.replace(re, ''); if ([...y].length >= 2) x = y }
  return x
}
/** 제목의 뚜렷한 낱말(조사·끝말 뗌, 2글자 이상, 숫자·흔한 낱말 뺌) */
export function keywords(title: string): string[] {
  const out = new Set<string>()
  for (const raw of title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    if (!raw || /^\d/.test(raw)) continue
    const w = strip(raw)
    if ([...w].length >= 2 && !STOP.has(w)) out.add(w)
  }
  return [...out]
}
/** 주제 낱말이 하나도 없는 제목("정리하기", "오후 3시 통화")은 바로 옮기지 않는다 */
export const isVague = (title: string) => keywords(title).length === 0
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 2 && (a.startsWith(b) || b.startsWith(a)))
/** 리스트별로 제목과 뚜렷한 낱말이 겹치는 최근 할 일 수. 두 리스트 이상에 나오는 낱말은 뚜렷하지 않아 뺀다 */
export function keywordVotes(title: string, recent: Record<string, string[]>): Map<string, number> {
  const mine = keywords(title)
  const per = Object.entries(recent).map(([listId, titles]) => ({ listId, words: titles.map(keywords) }))
  const distinct = mine.filter((w) => per.filter((l) => l.words.some((ws) => ws.some((x) => sameWord(w, x)))).length === 1)
  const votes = new Map<string, number>()
  if (!distinct.length) return votes
  for (const l of per) {
    const n = l.words.filter((ws) => ws.some((x) => distinct.some((w) => sameWord(w, x)))).length
    if (n) votes.set(l.listId, n)
  }
  return votes
}
const EMOJI_HEAD = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator})*\s*/u
/** 이름 비교: 앞 이모지·공백·대소문자 무시 */
export const plainNameKey = (s: string) => s.trim().replace(EMOJI_HEAD, '').replace(/\s+/g, '').toLowerCase()
/**
 * 확실한 리스트 하나(30 §B.3 (가)): 딱 한 리스트의 최근 할 일 min개 이상과 겹치고, 제목에 다른 리스트 이름이 없을 때. 아니면 null.
 * lists = 고를 수 있는 리스트(기본함·보관 뺌), recent = 리스트 id → 최근 할 일 제목
 */
export function keywordPick(title: string, lists: { id: string; name: string }[], recent: Record<string, string[]>, min = 3): string | null {
  const ok = new Set(lists.map((l) => l.id))
  const usable = Object.fromEntries(Object.entries(recent).filter(([id]) => ok.has(id)))
  const strong = [...keywordVotes(title, usable)].filter(([, n]) => n >= min)
  if (strong.length !== 1) return null
  const words = keywords(title)
  const names = lists.map((l) => ({ id: l.id, key: plainNameKey(l.name) })).filter((n) => [...n.key].length >= 2)
  if (names.some((n) => n.id !== strong[0][0] && words.some((w) => sameWord(w, n.key)))) return null
  return strong[0][0]
}
