// 이름 앞 이모지 떼기(30 §A.4 · A.5) — 데스크톱 src/shared/emoji.ts splitEmoji와 같은 규칙. 순수 함수(시험·화면 공용), 저장 값은 그대로.
const EMOJI_HEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic})|\p{Emoji_Modifier}|\p{Regional_Indicator})*)\s*/u

/** 이름 앞 이모지를 뗀다. 이모지뿐인 이름은 이름으로 둔다(emoji = null) */
export function splitLead(name: string): { emoji: string | null; name: string } {
  const m = name.match(EMOJI_HEAD)
  if (!m || !name.slice(m[0].length).trim()) return { emoji: null, name: name.trim() }
  return { emoji: m[1], name: name.slice(m[0].length).trim() }
}

/** 리스트 표시: 이모지 칸이 비었으면 이름 앞 이모지를 아이콘으로 */
export function listShow(l: { name: string; emoji: string | null }): { emoji: string | null; name: string } {
  if (l.emoji) return { emoji: l.emoji, name: l.name }
  return splitLead(l.name)
}

/** 태그 종류 기본 아이콘(33 §4.1) — 주제는 없음(#) */
export const TAG_KIND_EMOJI: Record<string, string> = { person: '👤', project: '🚀', place: '📍' }

/**
 * 태그 표시(30 §A.5 · 33 §4.1): 리스트·폴더와 같은 규칙 — 이름 앞 이모지가 있으면 그 하나를 아이콘으로 쓰고 이름에서 뗀다.
 * 이름 앞에 이모지가 여럿이면(`🚀🎓 졸업 프로젝트`) 앞 이모지를 모두 떼고, 종류 기본 아이콘(👤🚀📍)이 아닌 것을 우선 하나만 고른다 → `🎓` + `졸업 프로젝트`.
 * 이름 앞 이모지가 없으면 emoji = 종류 기본 아이콘(주제는 null = `#`). 이모지뿐인 이름은 그대로 이름으로 둔다. 저장 값은 그대로.
 */
export function tagShow(t: { name: string; kind?: string | null }): { emoji: string | null; name: string } {
  const run: string[] = []
  let rest = t.name.trim()
  for (let s = splitLead(rest); s.emoji; s = splitLead(rest)) { run.push(s.emoji); rest = s.name }
  const kindIcon = t.kind ? TAG_KIND_EMOJI[t.kind] ?? null : null
  if (!run.length) return { emoji: kindIcon, name: rest }
  const generic = new Set(Object.values(TAG_KIND_EMOJI))
  return { emoji: run.find((e) => !generic.has(e)) ?? run[0], name: rest }
}

/** 아이콘 칸이 없는 태그 글(데스크톱 알약 등): 이름 앞 이모지가 있을 때만 하나 + 이름 */
export function tagText(t: { name: string }): string {
  const v = tagShow({ name: t.name })
  return v.emoji ? `${v.emoji} ${v.name}` : v.name
}
