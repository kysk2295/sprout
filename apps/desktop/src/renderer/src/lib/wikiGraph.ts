import { linkNames, linkSegments, linkTagId, normName, relationId, sameName } from '@sprout/schema/wikiLink'
import { resolveLink, type LinkTarget } from './addParse'

// 33 관계 위키 — 화면이 쓰는 순수 계산(시험: tests/wiki.test.ts). DB 읽기·쓰기는 data/wiki.ts.

/** 리스트 머리 태그 줄(§3.2): 이 리스트 열린 할 일의 태그 수, 많은 순. aiOnly = 자동(ai·rule)으로만 붙은 태그(✦) */
export function tagPills(rows: { tag_id: string; source: string | null; c: number }[]): { tag_id: string; count: number; aiOnly: boolean }[] {
  const m = new Map<string, { tag_id: string; count: number; aiOnly: boolean }>()
  for (const r of rows) {
    const cur = m.get(r.tag_id) ?? { tag_id: r.tag_id, count: 0, aiOnly: true }
    cur.count += r.c
    if (!['ai', 'rule'].includes(r.source ?? 'user')) cur.aiOnly = false
    m.set(r.tag_id, cur)
  }
  return [...m.values()].sort((a, b) => b.count - a.count)
}

/**
 * §3.3 관련 리스트: 리스트 A·B 점수 = Σ 공유 태그마다 min(A에서 수, B에서 수) + 고정 10.
 * 열린 할 일 전체의 20% 넘게 붙은 태그(너무 넓음)는 뺀다. 2 이상, 높은 순 최대 5.
 */
export function relatedLists(
  listId: string,
  rows: { list_id: string; tag_id: string; c: number }[],
  totalOpen: number,
  opts: { pinned?: string[]; hidden?: string[]; max?: number; min?: number } = {}
): { list_id: string; score: number; tags: string[] }[] {
  const perTag = new Map<string, number>()
  for (const r of rows) perTag.set(r.tag_id, (perTag.get(r.tag_id) ?? 0) + r.c)
  const broad = new Set([...perTag].filter(([, n]) => totalOpen >= 50 && n / totalOpen > 0.2).map(([id]) => id))
  const mine = new Map(rows.filter((r) => r.list_id === listId && !broad.has(r.tag_id)).map((r) => [r.tag_id, r.c]))
  const score = new Map<string, { list_id: string; score: number; tags: { id: string; n: number }[] }>()
  for (const r of rows) {
    if (r.list_id === listId || !mine.has(r.tag_id) || opts.hidden?.includes(r.list_id)) continue
    const s = score.get(r.list_id) ?? { list_id: r.list_id, score: 0, tags: [] }
    const n = Math.min(mine.get(r.tag_id)!, r.c)
    s.score += n
    s.tags.push({ id: r.tag_id, n })
    score.set(r.list_id, s)
  }
  for (const p of opts.pinned ?? []) {
    const s = score.get(p) ?? { list_id: p, score: 0, tags: [] }
    s.score += 10
    score.set(p, s)
  }
  return [...score.values()]
    .filter((s) => s.score >= (opts.min ?? 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.max ?? 5)
    .map((s) => ({ list_id: s.list_id, score: s.score, tags: s.tags.sort((a, b) => b.n - a.n).slice(0, 2).map((t) => t.id) }))
}

/** §4.1 관련 태그: 같은 할 일에 함께 붙는 태그, 함께 붙은 수 2 이상, 최대 6 */
export function relatedTags(tagId: string, rows: { task_id: string; tag_id: string }[], max = 6): { tag_id: string; score: number }[] {
  const tasks = new Set(rows.filter((r) => r.tag_id === tagId).map((r) => r.task_id))
  const m = new Map<string, number>()
  for (const r of rows) if (r.tag_id !== tagId && tasks.has(r.task_id)) m.set(r.tag_id, (m.get(r.tag_id) ?? 0) + 1)
  return [...m].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, max).map(([tag_id, score]) => ({ tag_id, score }))
}

/** 리스트 안 태그 거르기(§3.4): 고른 태그 중 하나라도 붙은 할 일 + 그 하위(부모 아래에 보이도록) */
export function tagFilterIds(tasks: { id: string; parent_id: string | null; tag_ids: string | null }[], tagIds: string[]): Set<string> {
  const hit = new Set(tasks.filter((t) => (t.tag_ids?.split(',') ?? []).some((id) => tagIds.includes(id))).map((t) => t.id))
  const parent = new Map(tasks.map((t) => [t.id, t.parent_id]))
  const out = new Set<string>()
  for (const t of tasks) {
    let cur: string | null | undefined = t.id
    for (let i = 0; cur && i < 8; i++) {
      if (hit.has(cur)) { out.add(t.id); break }
      cur = parent.get(cur)
    }
  }
  return out
}

/** 행 태그 알약 순서(§6.6): 직접 붙인 것 → 링크 → 자동. 최대 max개 + 남은 수 */
export function rowTagIds(ids: string[], max = 2, hide?: string): { shown: string[]; more: number } {
  const all = ids.filter((id) => id !== hide)
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) }
}

// ── 링크 동기화(§6.4): 글 → relations·task_tags(link) ──
export type LinkSource = { type: 'task' | 'list' | 'tag'; id: string; field: 'title' | 'content' | 'description'; text: string | null }
export type RelRow = { id: string; from_type: string; from_id: string; to_type: string; to_id: string; field: string | null }
export type TaskTagRow = { id: string; task_id: string; tag_id: string; source: string | null; state: string | null }
export interface LinkPlan {
  insertRel: RelRow[]
  deleteRel: string[]
  insertTag: { id: string; task_id: string; tag_id: string }[]
  upgradeTag: string[]
  deleteTag: string[]
}
/**
 * 글 속 `[[ ]]`에서 원하는 관계를 만들고 지금 것과 비교한다.
 * - 관계 id는 결정적(relationId)이라 두 기기가 만들어도 한 행.
 * - 대상이 태그인 할 일 링크는 task_tags(source link)도: 행이 없으면 넣고, 자동(ai·rule)이면 link로 올린다.
 *   사용자가 붙였거나(user) 뗀(dismissed) 것은 그대로 둔다.
 * - 글에서 링크가 사라지면 그 link 관계·link 태그만 지운다(user·rule·ai 태그는 그대로).
 */
export function planLinkSync(
  sources: LinkSource[],
  existingRels: RelRow[],
  existingTags: TaskTagRow[],
  names: { tags: { id: string; name: string; aliases?: string | null }[]; lists: { id: string; name: string; kind?: string | null }[]; tasks: { id: string; title: string }[] }
): LinkPlan {
  const want = new Map<string, RelRow>()
  const wantTag = new Set<string>()
  for (const s of sources) {
    for (const name of linkNames(s.text)) {
      const t = resolveLink(name, names.tags, names.lists, names.tasks)
      if (!t || (t.type === s.type && t.id === s.id)) continue
      const id = relationId(s.id, t.id, s.field)
      want.set(id, { id, from_type: s.type, from_id: s.id, to_type: t.type, to_id: t.id, field: s.field })
      if (s.type === 'task' && t.type === 'tag') wantTag.add(`${s.id}>${t.id}`)
    }
  }
  const have = new Set(existingRels.map((r) => r.id))
  const plan: LinkPlan = { insertRel: [], deleteRel: [], insertTag: [], upgradeTag: [], deleteTag: [] }
  for (const [id, r] of want) if (!have.has(id)) plan.insertRel.push(r)
  for (const r of existingRels) if (!want.has(r.id)) plan.deleteRel.push(r.id)
  const byPair = new Map<string, TaskTagRow[]>()
  for (const r of existingTags) byPair.set(`${r.task_id}>${r.tag_id}`, [...(byPair.get(`${r.task_id}>${r.tag_id}`) ?? []), r])
  for (const pair of wantTag) {
    const rows = byPair.get(pair) ?? []
    if (!rows.length) {
      const [task_id, tag_id] = pair.split('>')
      plan.insertTag.push({ id: linkTagId(task_id, tag_id), task_id, tag_id })
    } else {
      const keep = rows.some((r) => (r.source ?? 'user') === 'user' || (r.source ?? 'user') === 'link' && (r.state ?? 'accepted') === 'accepted' || r.state === 'dismissed')
      if (!keep) plan.upgradeTag.push(rows[0].id)
    }
  }
  for (const r of existingTags) if (r.source === 'link' && !wantTag.has(`${r.task_id}>${r.tag_id}`)) plan.deleteTag.push(r.id)
  return plan
}

/** 행 제목 표시(§6.6): 링크 이름 → 대상. 표시는 id 기준 — 이름이 안 맞으면 그 할 일의 남은 link 관계를 차례로 쓴다(다른 기기가 이름을 바꾸고 글 고침이 아직 안 왔을 때) */
export type ResolvedSeg = { text: string; link?: boolean; target?: LinkTarget; missing?: boolean }
export function resolveSegments(
  text: string,
  rels: { to_type: string; to_id: string; name: string | null }[],
  fallback: (name: string) => LinkTarget | null
): ResolvedSeg[] {
  const free = [...rels]
  const toTarget = (r: (typeof rels)[number], name: string): LinkTarget => ({ type: r.to_type as LinkTarget['type'], id: r.to_id, name: r.name ?? name })
  const out: ResolvedSeg[] = linkSegments(text).map((s) => {
    if (s.link === undefined) return { text: s.text }
    const i = free.findIndex((r) => r.name && sameName(r.name, s.link))
    return i >= 0 ? { text: s.link, link: true, target: toTarget(free.splice(i, 1)[0], s.link) } : { text: s.link, link: true }
  })
  // 두 번째 차례: 이름이 안 맞은 링크 — 지금 이름으로 바로 풀리면 그것, 아니면 남은 관계(이름이 바뀐 대상)를 지금 이름으로
  for (const seg of out) {
    if (!seg.link || seg.target) continue
    const now = fallback(seg.text)
    if (now) { seg.target = now; continue }
    const r = free.shift()
    if (r) { seg.target = toTarget(r, seg.text); seg.text = r.name ?? seg.text }
    else seg.missing = true
  }
  return out
}

/** 연결 안 된 언급: 2글자 이상 이름이 정규화 뒤에도 비지 않을 때만 */
export const mentionable = (name: string) => normName(name).length >= 2
