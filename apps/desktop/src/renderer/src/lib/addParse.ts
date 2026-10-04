import { recognize } from '@sprout/schema/recognition'

// 02 §4 · 04 빠른 추가: 추가 입력의 자연어 인식을 한곳에서.
// recognize(@sprout/schema)가 날짜·시각·반복·!우선순위·#있는 태그·~있는 리스트를 읽고,
// 여기서 #없는 태그(새로 만들 이름)를 더한다(research 12: `#` 입력으로 새 태그 만들기).
export interface AddParse {
  /** keepDate면 날짜 문구를 남긴 제목(02 §0 "인식 문자열 삭제" 기본 끔), 아니면 날짜 문구도 뺀 제목 */
  title: string
  due_at: string | null
  repeat_rule: string | null
  priority?: number
  list_id?: string
  tag_ids: string[]
  /** 아직 없는 태그 이름(저장할 때 만든다) */
  newTags: string[]
  /** 입력에서 강조할 문자열(날짜·기호 모두) */
  tokens: string[]
}

const isSymbol = (t: string) => /^[#~!]/.test(t)
/** 공백으로 둘러싸인 토큰을 처음 한 번만 지운다 */
function removeToken(text: string, token: string): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`), ' ')
}

export function parseAdd(
  raw: string,
  lists: { id: string; name: string }[],
  tags: { id: string; name: string }[],
  opts: { keepDate: boolean; now?: Date } = { keepDate: false }
): AddParse {
  const r = recognize(raw, lists, tags, opts.now)
  const newTags: string[] = []
  const newTokens: string[] = []
  for (const m of r.title.matchAll(/(?:^|\s)#([^\s#]+)/g)) {
    const name = m[1]
    if (tags.some((t) => t.name === name)) continue
    if (!newTags.includes(name)) newTags.push(name)
    newTokens.push(`#${name}`)
  }
  let title: string
  if (opts.keepDate) {
    title = raw
    for (const t of [...r.recognized.filter(isSymbol), ...newTokens]) title = removeToken(title, t)
  } else {
    title = r.title
    for (const t of newTokens) title = removeToken(title, t)
  }
  return {
    title: title.replace(/\s+/g, ' ').trim(),
    due_at: r.due_at,
    repeat_rule: r.repeat_rule,
    priority: r.priority,
    list_id: r.list_id,
    tag_ids: r.tag_ids,
    newTags,
    tokens: [...r.recognized, ...newTokens]
  }
}
