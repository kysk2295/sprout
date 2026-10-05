import { recognize } from '@sprout/schema/recognition'
import { maskLinks, normName, parseAliases, sameName } from '@sprout/schema/wikiLink'

// 02 §4 · 04 빠른 추가: 추가 입력의 자연어 인식을 한곳에서.
// recognize(@sprout/schema)가 날짜·시각·반복·!우선순위·#있는 태그·~있는 리스트를 읽고,
// 여기서 #없는 태그(새로 만들 이름)를 더한다(research 12: `#` 입력으로 새 태그 만들기).
// 33 §6.3: `[[ … ]]`를 먼저 떼어 보호하고(안의 글자는 날짜·#·~·! 인식에서 빠짐) 제목에 그대로 남긴다.
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
  /** 입력에서 강조할 문자열(날짜·기호·[[링크]] 모두) */
  tokens: string[]
  /** 제목 속 `[[링크]]` 이름(33 §6) */
  links: string[]
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
  const m = maskLinks(raw)
  const r = recognize(m.masked, lists, tags, opts.now)
  const newTags: string[] = []
  const newTokens: string[] = []
  for (const x of r.title.matchAll(/(?:^|\s)#([^\s#]+)/g)) {
    const name = x[1]
    if (name.includes('')) continue // 자리표시(링크)는 태그가 아니다
    if (tags.some((t) => t.name === name)) continue
    if (!newTags.includes(name)) newTags.push(name)
    newTokens.push(`#${name}`)
  }
  let title: string
  if (opts.keepDate) {
    title = m.masked
    for (const t of [...r.recognized.filter(isSymbol), ...newTokens]) title = removeToken(title, t)
  } else {
    title = r.title
    for (const t of newTokens) title = removeToken(title, t)
  }
  return {
    title: m.restore(title).replace(/\s+/g, ' ').trim(),
    due_at: r.due_at,
    repeat_rule: r.repeat_rule,
    priority: r.priority,
    list_id: r.list_id,
    tag_ids: r.tag_ids,
    newTags,
    tokens: [...r.recognized.map(m.restore), ...newTokens, ...m.tokens],
    links: m.links
  }
}

export type LinkTarget = { type: 'tag' | 'list' | 'task'; id: string; name: string }
type NamedTag = { id: string; name: string; aliases?: string | string[] | null }
type NamedList = { id: string; name: string; emoji?: string | null; kind?: string | null }
const aliasesOf = (t: NamedTag) => (Array.isArray(t.aliases) ? t.aliases : parseAliases(t.aliases))
const listName = (l: NamedList) => (l.kind === 'inbox' ? '기본함' : l.name)

/** 33 §6.4 이름 풀기: 태그 이름 → 리스트 이름 → 태그 별칭 → 할 일 제목(정확히 같을 때만) */
export function resolveLink(name: string, tags: NamedTag[], lists: NamedList[], tasks: { id: string; title: string }[] = []): LinkTarget | null {
  const tag = tags.find((t) => sameName(t.name, name))
  if (tag) return { type: 'tag', id: tag.id, name: tag.name }
  const list = lists.find((l) => sameName(listName(l), name))
  if (list) return { type: 'list', id: list.id, name: listName(list) }
  const alias = tags.find((t) => aliasesOf(t).some((a) => sameName(a, name)))
  if (alias) return { type: 'tag', id: alias.id, name: alias.name }
  const task = tasks.find((t) => t.title.trim() === name.trim() && normName(name) !== '')
  if (task) return { type: 'task', id: task.id, name: task.title }
  return null
}

/**
 * 33 §6.3-4: 기본함으로 가는 새 할 일에 `[[리스트]]` 링크가 하나만 있으면(그리고 `~리스트`가 없으면) 그 리스트로 옮긴다.
 * 링크가 둘 이상이거나 리스트가 아니면 옮기지 않는다.
 */
export function linkMoveTarget(p: Pick<AddParse, 'links' | 'list_id'>, tags: NamedTag[], lists: NamedList[]): string | undefined {
  if (p.list_id || p.links.length !== 1) return undefined
  const t = resolveLink(p.links[0], tags, lists)
  return t?.type === 'list' && lists.find((l) => l.id === t.id)?.kind !== 'inbox' ? t.id : undefined
}
