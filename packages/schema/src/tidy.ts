// 31 §12 v2 정리 모드 = 분류 책상 — 순수 계산(데스크톱·모바일 공용). DB 동작은 각 앱(데스크톱 data/tidy.ts, 모바일 src/map/tidy).
// 제안의 출처는 이미 있는 것만: 리스트 = 30 §B.3 제안(데스크톱 칩·모바일 낱말 검사), 프로젝트 = 31 §12.1 구성원·넓히기 + 이름이 제목에 나옴 + 낱말 겹침.
import { nameInTitle, tagKey } from './autoTag.ts'
import { expandProject, projectMembers } from './projects.ts'
import { parseAliases } from './wikiLink.ts'
import { addDays, datePart, daysBetween } from './time.ts'
import { keywordVotes } from './keywords.ts'

export const TIDY = {
  /** 프로젝트 제안: 그 프로젝트 할 일 몇 개와 낱말이 겹쳐야 하나(이름이 제목에 나오면 바로) */
  projectVotes: 2,
  /** 프로젝트마다 낱말 비교에 쓰는 할 일 제목 수 */
  projectExamples: 30,
  /** 기한 지난 일 묶음 경계(일) */
  oldDays: 30,
  weekDays: 7,
  /** 화살표를 그리는 제안 수(더미에 보이는 것 중) */
  maxArrows: 8
}

export type TidyTab = 'inbox' | 'overdue' | 'outside' | 'untagged'
export const TIDY_TABS: TidyTab[] = ['inbox', 'overdue', 'outside', 'untagged']
export const TAB_LABEL: Record<TidyTab, string> = { inbox: '기본함', overdue: '기한 지난 일', outside: '프로젝트 밖', untagged: '태그 없음' }

export type TidyTask = {
  id: string; title: string; list_id: string | null; parent_id: string | null
  due_at: string | null; start_at: string | null; is_all_day: number | null; created_at: string | null
}
export type TidyList = { id: string; name: string; emoji: string | null; folder_id: string | null; kind: string; sort_order: number; archived_at?: string | null }
export type TidyFolder = { id: string; name: string; sort_order: number }
export type TidyTag = { id: string; name: string; kind: string | null; aliases: string | null; home_type: string | null; home_id: string | null; sort_order?: number | null }
/** task_tags 한 줄(state 없음 = accepted) */
export type TidyLink = { id?: string; task_id: string; tag_id: string; state: string | null }

const accepted = (l: TidyLink) => (l.state ?? 'accepted') === 'accepted'
export const isProject = (t: Pick<TidyTag, 'kind'>) => t.kind === 'project'

// ── 상자(오른쪽) ──
export type ListBox = { list: TidyList; count: number }
export type Bucket = { kind: 'folder'; id: string; name: string; lists: ListBox[]; count: number } | { kind: 'list'; id: string; box: ListBox }
/** 사용자의 실제 구조 그대로: 폴더 › 리스트(폴더 순서), 폴더 밖 리스트는 각자 상자. 기본함·보관 리스트는 빼고, 숫자 = 열린 최상위 할 일 */
export function buildBuckets(folders: TidyFolder[], lists: TidyList[], openByList: Map<string, number>): Bucket[] {
  const live = lists.filter((l) => l.kind !== 'inbox' && !l.archived_at).sort((a, b) => a.sort_order - b.sort_order)
  const box = (l: TidyList): ListBox => ({ list: l, count: openByList.get(l.id) ?? 0 })
  const folderIds = new Set(folders.map((f) => f.id))
  const out: Bucket[] = []
  for (const f of [...folders].sort((a, b) => a.sort_order - b.sort_order)) {
    const inside = live.filter((l) => l.folder_id === f.id).map(box)
    if (!inside.length) continue // 빈 폴더엔 놓을 리스트가 없다
    out.push({ kind: 'folder', id: f.id, name: f.name, lists: inside, count: inside.reduce((n, b) => n + b.count, 0) })
  }
  for (const l of live) if (!l.folder_id || !folderIds.has(l.folder_id)) out.push({ kind: 'list', id: l.id, box: box(l) })
  return out
}

/** 프로젝트 → 구성원(31 §12.1 projectMembers: 붙은 태그 ∪ 집 안 ∪ 하위 − ✕). tasks = 열린 할 일 */
export function membersOf(tags: TidyTag[], tasks: TidyTask[], links: TidyLink[], lists: TidyList[]): Map<string, Set<string>> {
  const L = links.map((l, i) => ({ id: l.id ?? `l${i}`, ...l }))
  return new Map(tags.filter(isProject).map((t) => [t.id, projectMembers(t, tasks, L, lists)]))
}
/** 프로젝트 상자: 프로젝트 종류 태그, 열린 구성원 많은 순 */
export function projectTargets(tags: TidyTag[], members: Map<string, Set<string>>): { tag: TidyTag; count: number }[] {
  return tags.filter(isProject).map((tag) => ({ tag, count: members.get(tag.id)?.size ?? 0 }))
    .sort((a, b) => b.count - a.count || (a.tag.sort_order ?? 0) - (b.tag.sort_order ?? 0) || a.tag.name.localeCompare(b.tag.name))
}

// ── 프로젝트 제안 ──
/**
 * 할 일 → 어울리는 프로젝트 태그 하나. 이미 어느 프로젝트의 구성원이거나(태그·집·하위), 그 태그를 뗀 적이 있으면(dismissed 행) 없음.
 * ① 프로젝트 이름·별칭이 제목에 나옴(33 사전 검사와 같은 nameInTitle, 두 프로젝트에 걸치면 애매 → 없음)
 * ② 그 프로젝트 할 일 제목들과 뚜렷한 낱말이 projectVotes개 이상 겹치는 프로젝트가 딱 하나
 * ③ 31 §12.1 넓히기(expandProject — 같은 리스트·기간 안·단계로 보이는 일)가 고른 프로젝트가 딱 하나(자동 태그가 꺼져 있으면 여기서만 보인다)
 * no = 정리에서 "아니"라고 한 짝(할 일 → 태그)
 */
export function suggestProjects(
  tasks: TidyTask[], tags: TidyTag[], links: TidyLink[], lists: TidyList[],
  examples: Record<string, string[]>, no: Record<string, string> = {}, folders: TidyFolder[] = []
): Map<string, string> {
  const projects = tags.filter(isProject)
  const out = new Map<string, string>()
  if (!projects.length) return out
  const members = membersOf(tags, tasks, links, lists)
  const inSome = new Set([...members.values()].flatMap((m) => [...m]))
  const touched = new Set(links.map((l) => `${l.task_id}>${l.tag_id}`))
  const names = projects.map((p) => ({ id: p.id, names: [p.name, ...parseAliases(p.aliases)].filter((n) => [...tagKey(n)].length >= 2) }))
  const usable = Object.fromEntries(projects.map((p) => [p.id, (examples[p.id] ?? []).slice(0, TIDY.projectExamples)]).filter(([, ts]) => (ts as string[]).length > 0))
  const ok = (t: Pick<TidyTask, 'id'>, id: string) => !touched.has(`${t.id}>${id}`) && no[t.id] !== id
  const ctx = { tags, lists, folders, tasks, links: links.map((l, i) => ({ id: l.id ?? `l${i}`, ...l })) }
  const expanded = new Map<string, string[]>()
  for (const p of projects) for (const id of expandProject(p, members.get(p.id)!, ctx)) expanded.set(id, [...(expanded.get(id) ?? []), p.id])
  for (const t of tasks) {
    if (t.parent_id || inSome.has(t.id) || !t.title.trim()) continue
    const byName = names.filter((p) => p.names.some((n) => nameInTitle(n, t.title))).map((p) => p.id)
    if (byName.length === 1) { if (ok(t, byName[0])) out.set(t.id, byName[0]); continue }
    if (byName.length > 1) continue
    const strong = [...keywordVotes(t.title, usable)].filter(([, n]) => n >= TIDY.projectVotes)
    if (strong.length === 1) { if (ok(t, strong[0][0])) out.set(t.id, strong[0][0]); continue }
    if (strong.length > 1) continue
    const ex = expanded.get(t.id)
    if (ex?.length === 1 && ok(t, ex[0])) out.set(t.id, ex[0])
  }
  return out
}

// ── 더미(왼쪽) ──
export type PileInput = {
  tasks: TidyTask[]
  links: TidyLink[]
  inboxId: string | null
  today: string
  /** 프로젝트 제안(suggestProjects) */
  projects: Map<string, string>
}
/** 탭마다 할 일: 모두 열린 최상위 할 일(하위는 부모와 함께 움직인다). 기한 지난 일은 하위라도 부모가 기한 지나지 않았으면 따로 보인다(19 planOverdue와 같음) */
export function buildPiles(i: PileInput): Record<TidyTab, TidyTask[]> {
  const tagged = new Set(i.links.filter(accepted).map((l) => l.task_id))
  const top = i.tasks.filter((t) => !t.parent_id && t.title.trim())
  const over = i.tasks.filter((t) => t.title.trim() && isLate(t, i.today))
  const overIds = new Set(over.map((t) => t.id))
  const byNew = (a: TidyTask, b: TidyTask) => (b.created_at ?? '').localeCompare(a.created_at ?? '')
  return {
    inbox: top.filter((t) => i.inboxId && t.list_id === i.inboxId).sort(byNew),
    overdue: over.filter((t) => !t.parent_id || !overIds.has(t.parent_id)).sort((a, b) => (a.due_at! < b.due_at! ? -1 : a.due_at! > b.due_at! ? 1 : 0)),
    outside: top.filter((t) => t.list_id !== i.inboxId && i.projects.has(t.id)).sort(byNew),
    untagged: top.filter((t) => t.list_id !== i.inboxId && !tagged.has(t.id)).sort(byNew)
  }
}
export const isLate = (t: Pick<TidyTask, 'due_at'>, today: string) => !!t.due_at && datePart(t.due_at) < today
export const lateDays = (t: Pick<TidyTask, 'due_at'>, today: string) => (t.due_at ? daysBetween(datePart(t.due_at), today) : 0)

export type LateGroup = { key: 'old' | 'month' | 'week'; label: string; tasks: TidyTask[] }
/** 기한 지난 일 묶음: 한 달 넘음 · 1주~1달 · 최근 7일(시안 ②) — 오래된 것 먼저 */
export function lateGroups(tasks: TidyTask[], today: string): LateGroup[] {
  const g: LateGroup[] = [
    { key: 'old', label: '한 달 넘음', tasks: [] },
    { key: 'month', label: '1주~1달', tasks: [] },
    { key: 'week', label: '최근 7일', tasks: [] }
  ]
  for (const t of tasks) {
    const d = lateDays(t, today)
    g[d > TIDY.oldDays ? 0 : d > TIDY.weekDays ? 1 : 2].tasks.push(t)
  }
  return g.filter((x) => x.tasks.length)
}

// ── 제안(화살표) ──
export type Target = { kind: 'list'; id: string } | { kind: 'project'; id: string }
export const targetKey = (t: Target) => `${t.kind}:${t.id}`
export type Proposal = { taskId: string; to: Target }
/**
 * 탭의 할 일마다 제안 하나: 기본함 = 리스트 제안(30 칩) 먼저, 없으면 프로젝트. 프로젝트 밖·태그 없음 = 프로젝트. 기한 지난 일 = 없음(날짜를 정하는 탭).
 * listOf = 기본함 할 일 → 이미 있는 리스트 id(chipFor). 리스트 상자에 없는 리스트(보관 등)는 뺀다.
 */
export function proposalsFor(tab: TidyTab, pile: TidyTask[], listOf: (taskId: string) => string | null, projects: Map<string, string>, liveLists: Set<string>): Proposal[] {
  if (tab === 'overdue') return []
  const out: Proposal[] = []
  for (const t of pile) {
    const l = tab === 'inbox' ? listOf(t.id) : null
    if (l && liveLists.has(l)) { out.push({ taskId: t.id, to: { kind: 'list', id: l } }); continue }
    const p = projects.get(t.id)
    if (p) out.push({ taskId: t.id, to: { kind: 'project', id: p } })
  }
  return out
}

// ── 고르기(여러 개) ──
/** 클릭 = 그것만(이미 그것만 골랐으면 해제), ⌘/Ctrl = 하나 더하기·빼기, ⇧ = 마지막으로 누른 것부터 범위(틱틱 목록 다중 선택과 같음) */
export function nextSelection(order: string[], sel: string[], anchor: string | null, id: string, mods: { meta?: boolean; shift?: boolean; toggle?: boolean }): { sel: string[]; anchor: string } {
  if (mods.shift && anchor && order.includes(anchor)) {
    const a = order.indexOf(anchor), b = order.indexOf(id)
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1)
    return { sel: [...new Set([...sel, ...range])], anchor }
  }
  if (mods.meta || mods.toggle) return { sel: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id], anchor: id }
  return { sel: sel.length === 1 && sel[0] === id ? [] : [id], anchor: id }
}
/** 끌기 시작: 고른 것 안에서 끌면 고른 것 전부(목록 순서), 아니면 그 하나 */
export const dragSet = (order: string[], sel: string[], id: string) => (sel.includes(id) ? order.filter((x) => sel.includes(x)) : [id])

// ── 캐릭터 말 ──
const EMPTY_LINE: Record<TidyTab, string> = { inbox: '기본함이 깨끗해! ✓', overdue: '밀린 일이 없어 ✓', outside: '프로젝트 밖에 남은 일이 없어 ✓', untagged: '태그 없는 일이 없어 ✓' }
export type Bubble = { text: string; chips: ('apply' | 'one' | 'ask' | 'pickOld' | 'today')[] }
/** 31 §11.9 정리 줄을 탭마다(같은 목소리, 한 문장). chips는 화면 아래 컨트롤과 같은 동작 이름 */
export function bubbleFor(tab: TidyTab, n: number, sure: number, opts: { old?: number; aiOk?: boolean } = {}): Bubble {
  if (!n) return { text: EMPTY_LINE[tab], chips: [] }
  if (tab === 'overdue') return (opts.old ?? 0) > 0
    ? { text: `밀린 게 ${n}개야. 한 달 넘은 건 정리해도 괜찮아.`, chips: ['pickOld'] }
    : { text: `밀린 게 ${n}개야. 오늘이나 다음 주로 옮겨 볼까?`, chips: ['today'] }
  if (tab === 'inbox') return sure
    ? { text: `기본함 ${n}개, 이렇게 나눠 볼게. 괜찮아?`, chips: ['apply', 'one'] }
    : { text: '어디에 둘지 같이 정해 볼까?', chips: opts.aiOk === false ? [] : ['ask'] }
  if (tab === 'outside') return { text: `프로젝트랑 이어질 것 같은 일 ${n}개를 찾았어. 묶어 볼까?`, chips: sure ? ['apply', 'one'] : [] }
  return sure
    ? { text: `태그 없는 일이 ${n}개야. ${sure}개는 프로젝트에 묶어 볼게.`, chips: ['apply', 'one'] }
    : { text: `태그 없는 일이 ${n}개야. 프로젝트 상자에 끌어다 놓으면 묶여.`, chips: [] }
}

/** 행 아래 회색 줄: `기본함 · 10/4 추가` · `🎓 학교 › 수업·과제 · 8/12 (54일 지남)` */
export const shortDate = (iso: string) => { const d = datePart(iso); return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` }
export function rowMeta(tab: TidyTab, t: TidyTask, place: string, today: string): string {
  if (tab === 'overdue' && t.due_at) return `${place} · ${shortDate(t.due_at)} (${lateDays(t, today)}일 지남)`
  if (tab === 'inbox' && t.created_at) {
    const d = localDay(t.created_at)
    return `${place} · ${d === today ? '오늘' : d === addDays(today, -1) ? '어제' : shortDate(d)} 추가`
  }
  return place
}
/** ISO(UTC) → 로컬 날짜 키 */
export const localDay = (iso: string) => {
  if (!iso.includes('T') || !/Z|[+-]\d\d:?\d\d$/.test(iso)) return datePart(iso)
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

