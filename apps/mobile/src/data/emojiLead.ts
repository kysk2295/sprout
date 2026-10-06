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
