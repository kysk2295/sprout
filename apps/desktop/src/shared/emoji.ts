// 이름 앞 이모지 떼기 — 틱틱 가져오기(리스트 이름)와 폴더 아이콘 표시(30 §A.4)가 같이 쓴다.
// 폴더에는 이모지 칸이 없어서 이름 앞 이모지를 아이콘으로 본다: `🥺Me` → 아이콘 🥺 + 이름 "Me".
const EMOJI_HEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|\p{Emoji_Modifier}|\p{Regional_Indicator})*)\s*/u

/** 이름 앞 이모지를 뗀다. 이모지뿐인 이름은 이름으로 둔다(emoji = null) */
export function splitEmoji(name: string): { emoji: string | null; name: string } {
  const m = name.match(EMOJI_HEAD)
  if (!m || !name.slice(m[0].length).trim()) return { emoji: null, name: name.trim() }
  return { emoji: m[1], name: name.slice(m[0].length).trim() }
}

/** 폴더 이름 저장 모양: 고른 이모지를 이름 앞에 붙인다(`🎓Study`). 이모지가 없으면 이름만 */
export function joinEmoji(emoji: string | null | undefined, name: string): string {
  const n = name.trim()
  const e = (emoji ?? '').trim()
  return e ? `${e}${n}` : n
}

/** 태그 종류 기본 아이콘(33 §4.1) — 주제는 없음(#) */
export const TAG_KIND_EMOJI: Record<string, string> = { person: '👤', project: '🚀', place: '📍' }

/**
 * 태그 표시(30 §A.5 · 33 §4.1): 리스트·폴더와 같은 규칙 — 이름 앞 이모지가 있으면 그 하나를 아이콘으로 쓰고 이름에서 뗀다.
 * 이름 앞에 이모지가 여럿이면(`🚀🎓 졸업 프로젝트`) 앞 이모지를 모두 떼고, 종류 기본 아이콘(👤🚀📍)이 아닌 것을 우선 하나만 고른다 → `🎓` + `졸업 프로젝트`.
 * 이름 앞 이모지가 없으면 emoji = 종류 기본 아이콘(주제는 null = `#`). 이모지뿐인 이름은 그대로 이름으로 둔다. 저장 값은 그대로.
 * 휴대폰 src/data/emojiLead.ts tagShow와 같은 규칙.
 */
export function tagShow(t: { name: string; kind?: string | null }): { emoji: string | null; name: string } {
  const run: string[] = []
  let rest = t.name.trim()
  for (let s = splitEmoji(rest); s.emoji; s = splitEmoji(rest)) { run.push(s.emoji); rest = s.name }
  const kindIcon = t.kind ? TAG_KIND_EMOJI[t.kind] ?? null : null
  if (!run.length) return { emoji: kindIcon, name: rest }
  const generic = new Set(Object.values(TAG_KIND_EMOJI))
  return { emoji: run.find((e) => !generic.has(e)) ?? run[0], name: rest }
}

/** 아이콘 칸이 없는 태그 글(행 알약·상세 알약): 이름 앞 이모지가 있을 때만 하나 + 이름 */
export function tagText(t: { name: string }): string {
  const v = tagShow({ name: t.name })
  return v.emoji ? `${v.emoji} ${v.name}` : v.name
}
