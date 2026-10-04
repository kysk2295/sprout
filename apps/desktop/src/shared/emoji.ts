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
