// 31 §12.2~12.5 계획 화면 계산 — 프로젝트(태그 kind project) · 구성원 · 일의 종류 · 기간·마감 · 다음 · 옆 칸 · 제안 · ⚡ 지금 할 일.
// 행(로컬 DB 질의 결과)을 받아 화면 값을 만든다(데스크톱 useProjects · 모바일 src/map/plan 공용). 제안 카드는 suggest=true일 때만(모바일은 끔 — 29 §9.1).
import { parseAliases } from './wikiLink.ts'
import { tagKey } from './autoTag.ts'
import {
  blockedSet, categoryOf, daysBetween, findProjectClusters, specificName, EXAM_CATEGORY, nextSteps, projectDeadline, projectEmoji, projectMembers, projectSpan, projectTitle, taskDay, workKind,
  WORK_KINDS, type Proposal, type PTask, type WorkKind
} from './projects.ts'

export type PTaskRow = PTask & { status: number; priority: number | null; list_id: string | null }
export type TagRow = { id: string; name: string; kind: string | null; aliases: string | null; source: string | null; home_type: string | null; home_id: string | null; topic_id: string | null }
export type LinkRow = { id: string; task_id: string; tag_id: string; source: string | null; state: string | null }
export type ListRow = { id: string; name: string; emoji: string | null; folder_id: string | null; kind: string | null }
export type SeqRow = { id: string; from_id: string; to_id: string; kind: string; state: string }

export type ProjectView = {
  tag: TagRow
  title: string
  emoji: string
  /** ✦ 자동으로 묶었어요 */
  auto: boolean
  /** 별칭 중 짧은 낱말(말풍선 `공모전 관련 일`) */
  short: string
  members: PTaskRow[]
  done: number
  open: number
  kindOf: Map<string, WorkKind>
  kinds: [WorkKind, number][]
  span: { from: string; to: string } | null
  deadline: { day: string; word: string; taskId: string } | null
  next: PTaskRow[]
  lists: { id: string; name: string; emoji: string | null; count: number }[]
  people: { id: string; name: string; label: string }[]
  memos: { kind: 'topic' | 'note'; id: string; title: string }[]
  seq: SeqRow[]
  /** 다 끝났고 마감 7일 지남 */
  finished: boolean
  /** 집 리스트가 보관됨(보관 리스트는 lists 질의에 없다) */
  archived: boolean
  /** 빠진 거 없어 이후 그대로면 말풍선 숨김 */
  confirmed: boolean
  /** 31 §12.9.2 구성원이 들어온 길: user = 사람이 넣음 · auto = AI·규칙(✦, 확인 전) · home = 집(리스트·폴더)·하위 할 일 */
  via: Map<string, MemberVia>
  /** AI·규칙이 넣고 아직 확인 안 한 구성원 수 */
  autoCount: number
  /** 일의 종류를 사람이 정한 할 일(relations work_kind) */
  kindSet: Set<string>
  /** 주 리스트(구성원이 가장 많은 리스트 — 새 할 일이 들어갈 곳). 없으면 null(기본함) */
  mainList: string | null
  /** 31 §12.10 분류(사람이 고른 것 → 이름 안 분류 낱말 → null) */
  category: string | null
  /** 31 §12.13.7 지금 집중(끝난 프로젝트는 false) */
  focus: boolean
}
/** §12.10.3 막연한 할 일(분류 낱말만 있고 아직 그 분류 프로젝트에 없음) — 고르기 알약은 가까운 순 */
export type LooseItem = { task: PTaskRow; choices: string[] }
export type CategoryGroup = { word: string; projects: ProjectView[]; loose: LooseItem[] }
export type MemberVia = 'user' | 'auto' | 'home'
export type TodayItem = { task: PTaskRow; why: 'today' | 'step'; project?: string }
/**
 * 31 §12.10.4 "끝난 프로젝트"(빠른 추가 알약에 안 띄움): 보드의 끝남(finished) · 집 리스트 보관 · 구성원이 다 끝남 ·
 * 마감 지남 · 남은 열린 일이 모두 날짜가 지남(앞으로 할 일이 없음). 날짜 없는 열린 일이 있으면 아직 진행 중으로 본다.
 */
export function projectEnded(p: Pick<ProjectView, 'finished' | 'archived' | 'members' | 'open' | 'deadline'>, today: string): boolean {
  if (p.finished || p.archived) return true
  if (p.members.length > 0 && p.open === 0) return true
  if (p.deadline && p.deadline.day < today) return true
  const open = p.members.filter((m) => m.status === 0)
  return open.length > 0 && open.every((m) => { const d = taskDay(m); return !!d && d < today })
}
export type PlanData = {
  loaded: boolean
  projects: ProjectView[]
  suggestion: Proposal | null
  /** ⚡ 지금 할 일(최대 3) · 오늘 관련 전체 수 · 기한 지난 열린 일 수 */
  today: TodayItem[]
  todayTotal: number
  overdue: number
  /** 같이 계획 짜기·＋ 더 넣기에서 쓰는 열린 할 일 */
  openTasks: PTaskRow[]
  byId: Map<string, PTaskRow>
  listName: (id: string | null) => string
  /** §12.10 보드 분류 묶음(분류 있는 프로젝트) — 분류 없는 프로젝트는 projects에서 category null */
  categories: CategoryGroup[]
}

export type PlanInput = {
  tasks: PTaskRow[] | null | undefined
  tags: TagRow[] | null | undefined
  links: LinkRow[] | null | undefined
  lists: ListRow[] | null | undefined
  folders: { id: string; name: string }[] | null | undefined
  seq: SeqRow[] | null | undefined
  topics?: { id: string; name: string }[] | null
  notes?: { tag_id: string; id: string; content: string | null; link_title: string | null }[] | null
  /** sprout.map.projects.v1 */
  pstore: { dismissed: string[]; confirmed: Record<string, number> }
  /** 자동 태그 막은 이름(33) */
  blocked?: Record<string, unknown>
  today: string
  /** 제안 카드 계산(데스크톱만) */
  suggest?: boolean
  /** 31 §12.9.2 사람이 정한 일의 종류(relations from_type task · to_type work_kind) — 결정적 분류보다 먼저 */
  kindOverrides?: { task_id: string; kind: string }[] | null
  /** §12.10 사람이 고른 분류(relations tag → category) */
  categoryOverrides?: { tag_id: string; word: string }[] | null
  /** §12.10.3 고르기에서 `아니`한 할 일 */
  skip?: string[]
  /** §12.13.7 지금 집중 프로젝트 태그 id(relations tag → focus) */
  focus?: string | null
}
export function buildPlanView(i: PlanInput): PlanData {
  const { tasks, tags, links, lists, folders, seq, topics, notes, pstore, today } = i
  const astore = { blocked: i.blocked ?? {} }
  const byId = new Map((tasks ?? []).map((t) => [t.id, t]))
  const listOf = new Map((lists ?? []).map((l) => [l.id, l]))
  const listName = (id: string | null) => { const l = id ? listOf.get(id) : undefined; return l ? (l.kind === 'inbox' ? '기본함' : l.name) : '' }
  const empty: PlanData = { loaded: false, projects: [], suggestion: null, today: [], todayTotal: 0, overdue: 0, openTasks: [], byId, listName, categories: [] }
  const catOver = new Map((i.categoryOverrides ?? []).map((c) => [c.tag_id, c.word]))
  if (!tasks || !tags || !links || !lists || !folders || !seq) return empty
  const accepted = (l: LinkRow) => (l.state ?? 'accepted') === 'accepted'
  const tagById = new Map(tags.map((t) => [t.id, t]))
  const openIds = new Set(tasks.filter((t) => t.status === 0).map((t) => t.id))
  const blocked = blockedSet(seq, openIds)
  const projectOf = new Map<string, string>() // 할 일 → 첫 프로젝트 이름(⚡ 칩)
  const overrides = new Map<string, WorkKind>()
  for (const o of i.kindOverrides ?? []) if ((WORK_KINDS as string[]).includes(o.kind)) overrides.set(o.task_id, o.kind as WorkKind)
  const linkOf = new Map(links.map((l) => [`${l.task_id}|${l.tag_id}`, l]))

  const projects: ProjectView[] = []
  for (const tag of tags.filter((t) => t.kind === 'project')) {
    const ids = projectMembers(tag, tasks, links, lists)
    const members = [...ids].map((id) => byId.get(id)!).filter(Boolean)
    const title = projectTitle(tag.name)
    for (const m of members) if (!projectOf.has(m.id)) projectOf.set(m.id, title)
    const kindOf = new Map(members.map((m) => [m.id, overrides.get(m.id) ?? workKind(m.title)]))
    const via = new Map<string, MemberVia>()
    for (const m of members) {
      const l = linkOf.get(`${m.id}|${tag.id}`)
      via.set(m.id, l && accepted(l) ? ((l.source ?? 'user') === 'user' ? 'user' : 'auto') : 'home')
    }
    const count = new Map<WorkKind, number>()
    for (const k of kindOf.values()) count.set(k, (count.get(k) ?? 0) + 1)
    const deadline = projectDeadline(members)
    const span = projectSpan(members, deadline?.day)
    const done = members.filter((m) => m.status !== 0).length
    const perList = new Map<string, number>()
    for (const m of members) if (m.list_id) perList.set(m.list_id, (perList.get(m.list_id) ?? 0) + 1)
    // 관련 사람: 구성원에 함께 붙은 사람 태그(종류별 수)
    const people = new Map<string, Map<WorkKind, number>>()
    for (const l of links) {
      if (!accepted(l) || !ids.has(l.task_id)) continue
      const g = tagById.get(l.tag_id)
      if (g?.kind !== 'person') continue
      const m = people.get(g.id) ?? new Map()
      const k = kindOf.get(l.task_id) ?? 'other'
      m.set(k, (m.get(k) ?? 0) + 1)
      people.set(g.id, m)
    }
    // 관련 메모: 태그의 위키 주제(topic_id 또는 같은 이름·별칭) + 그 태그로 이은 수집함 메모
    const names = new Set([tag.name, ...parseAliases(tag.aliases)].map(tagKey))
    const memos: ProjectView['memos'] = []
    for (const tp of topics ?? []) if (tp.id === tag.topic_id || names.has(tagKey(tp.name))) memos.push({ kind: 'topic', id: tp.id, title: tp.name })
    for (const n of notes ?? []) if (n.tag_id === tag.id) memos.push({ kind: 'note', id: n.id, title: (n.link_title || (n.content ?? '').split('\n')[0] || '메모').slice(0, 40) })
    const finished = members.length > 0 && done === members.length && (!span || span.to < addDays(today, -7))
    const aliases = parseAliases(tag.aliases)
    projects.push({
      tag, title, emoji: projectEmoji(tag.name), auto: tag.source === 'ai', short: [...aliases].sort((a, b) => a.length - b.length)[0] ?? title,
      members: members.sort((a, b) => (taskDay(a) ?? '9999').localeCompare(taskDay(b) ?? '9999')),
      done, open: members.length - done, kindOf,
      kinds: WORK_KINDS.map((k) => [k, count.get(k) ?? 0] as [WorkKind, number]).filter(([, n]) => n > 0),
      span, deadline,
      next: nextSteps(members, blocked, today),
      lists: [...perList].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, name: listName(id), emoji: listOf.get(id)?.emoji ?? null, count: n })),
      people: [...people].map(([id, m]) => ({ id, name: tagById.get(id)!.name, label: [...m].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${KIND_SHORT[k]} ${n}`).join(' · ') })),
      memos, seq: seq.filter((l) => ids.has(l.from_id) && ids.has(l.to_id)), finished,
      archived: tag.home_type === 'list' && !!tag.home_id && !listOf.has(tag.home_id),
      confirmed: pstore.confirmed[tag.id] !== undefined && pstore.confirmed[tag.id] >= members.length,
      via, autoCount: [...via.values()].filter((v) => v === 'auto').length,
      kindSet: new Set(members.filter((m) => overrides.has(m.id)).map((m) => m.id)),
      mainList: mainListOf(members, (id) => listOf.get(id) ?? null),
      category: (catOver.has(tag.id) ? catOver.get(tag.id) || null : categoryOf(tag.name)),
      focus: false
    })
  }
  for (const p of projects) p.focus = !!i.focus && p.tag.id === i.focus && !projectEnded(p, today)
  // 순서: 끝난 것 맨 뒤 → 마감 가까운 순 → 열린 일 많은 순
  projects.sort((a, b) => Number(a.finished) - Number(b.finished) || (a.deadline?.day ?? '9999').localeCompare(b.deadline?.day ?? '9999') || b.open - a.open)

  // 제안 카드: 한 장(할 일 많은 것). §12.13.1 자동으로 만들지 않으니 예전 '자동' 덩어리도 제안으로 — 이미 있는 태그 이름·별칭이면 뺀다
  const blockedKeys = new Set([...Object.keys(astore.blocked), ...pstore.dismissed])
  const taken = new Set(projects.flatMap((p) => p.members.map((m) => m.id)))
  const tagKeys = new Set(tags.flatMap((t) => [t.name, ...parseAliases(t.aliases)].map(tagKey)))
  const clusters = i.suggest === false ? null : findProjectClusters({ tags, lists, folders, tasks, links }, blockedKeys, taken)
  const suggestion = !clusters ? null : [...clusters.auto, ...clusters.suggest]
    .filter((p) => (p.reason === 'tag' || (!tagKeys.has(p.key) && !tagKeys.has(tagKey(p.name)))) && p.taskIds.some((id) => !taken.has(id)))
    .sort((a, b) => b.taskIds.length - a.taskIds.length)[0] ?? null

  // ⚡ 지금 할 일(§12.5): 오늘 마감·시작 + 지금 할 수 있는 계획 단계(순서 선이 있는 열린 일, 막히지 않음, 기한 안 지남). 기한 지난 일은 넣지 않는다
  const stepIds = new Set(seq.flatMap((l) => [l.from_id, l.to_id]))
  const day = (s: string | null | undefined) => s?.slice(0, 10) ?? null
  const open = tasks.filter((t) => t.status === 0)
  const todayItems: TodayItem[] = []
  for (const t of open) {
    const due = day(t.due_at), start = day(t.start_at)
    if (due && due < today) continue
    if (due === today || start === today) todayItems.push({ task: t, why: 'today', project: projectOf.get(t.id) })
    else if (stepIds.has(t.id) && !blocked.has(t.id)) todayItems.push({ task: t, why: 'step', project: projectOf.get(t.id) })
  }
  todayItems.sort((a, b) => (a.why === 'today' ? 0 : 1) - (b.why === 'today' ? 0 : 1) || (a.task.due_at ?? '9999').localeCompare(b.task.due_at ?? '9999') || (b.task.priority ?? 0) - (a.task.priority ?? 0))
  const overdue = open.filter((t) => { const d = day(t.due_at); return !!d && d < today }).length

  // §12.10 분류 묶음 + 막연한 할 일 고르기
  const skip = new Set(i.skip ?? [])
  const groups = new Map<string, CategoryGroup>()
  for (const p of projects) if (p.category) (groups.get(p.category) ?? groups.set(p.category, { word: p.category, projects: [], loose: [] }).get(p.category)!).projects.push(p)
  for (const t of open) {
    if (skip.has(t.id)) continue
    const cat = categoryOf(t.title)
    if (!cat || cat === EXAM_CATEGORY || specificName(t.title, cat)) continue
    const g = groups.get(cat)
    if (!g || g.projects.some((p) => p.members.some((m) => m.id === t.id))) continue
    const d = day(t.due_at) ?? day(t.start_at) ?? day(t.created_at)
    const dist = (p: ProjectView) => { const ds = p.members.map((m) => taskDay(m)).filter((x): x is string => !!x); return d && ds.length ? Math.min(...ds.map((x) => Math.abs(daysBetween(x, d)))) : 9999 }
    g.loose.push({ task: t, choices: [...g.projects].sort((a, b) => dist(a) - dist(b)).map((p) => p.tag.id) })
  }
  const categories = [...groups.values()].sort((a, b) => (a.projects[0]?.deadline?.day ?? '9999').localeCompare(b.projects[0]?.deadline?.day ?? '9999') || a.word.localeCompare(b.word))

  return { loaded: true, projects, suggestion, today: todayItems.slice(0, 3), todayTotal: todayItems.length, overdue, openTasks: open, byId, listName, categories }
}

const KIND_SHORT: Record<WorkKind, string> = { research: '분석', meeting: '미팅', dev: '개발', admin: '제출', other: '일' }
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

/** 31 §12.9.0 차분한 카드 한 줄(데스크톱·모바일 같은 글): `14개 중 5개 완료 · 제출 10/10`. hot = 마감이 지났거나 3일 안(빨강) */
export function projectCardLine(p: Pick<ProjectView, 'members' | 'done' | 'deadline'>, today: string): { text: string; deadline: string | null; hot: boolean; progress: number } {
  const n = p.members.length
  const base = `${n}개 중 ${p.done}개 완료`
  const dl = p.deadline ? `${p.deadline.word} ${Number(p.deadline.day.slice(5, 7))}/${Number(p.deadline.day.slice(8, 10))}` : null
  const left = p.deadline ? Math.round((Date.parse(`${p.deadline.day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null
  return { text: dl ? `${base} · ${dl}` : base, deadline: dl, hot: left !== null && left <= 3 && p.done < n, progress: n ? p.done / n : 0 }
}

// ── 31 §12.12 프로젝트 안에서 새 할 일 ──
/** 주 리스트: 구성원이 가장 많은 일반 리스트(기본함·없는 리스트 제외) → 같으면 열린 구성원이 많은 쪽 → 이름 순. 없으면 null(기본함) */
export function mainListOf(members: Pick<PTaskRow, 'list_id' | 'status'>[], listOf: (id: string) => Pick<ListRow, 'kind' | 'name'> | null): string | null {
  const n = new Map<string, { all: number; open: number }>()
  for (const m of members) {
    if (!m.list_id) continue
    const l = listOf(m.list_id)
    if (!l || l.kind === 'inbox') continue
    const c = n.get(m.list_id) ?? { all: 0, open: 0 }
    c.all++; if (m.status === 0) c.open++
    n.set(m.list_id, c)
  }
  const name = (id: string) => listOf(id)?.name ?? ''
  return [...n].sort((a, b) => b[1].all - a[1].all || b[1].open - a[1].open || name(a[0]).localeCompare(name(b[0])) || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

/** 빠른 추가 인식 결과(데스크톱 parseAdd · 모바일 recognizeWith 공통 부분) */
export type QuickParsed = { title: string; due_at: string | null; priority?: number; list_id?: string; repeat_rule?: string | null; tag_ids?: string[] }
export type ProjectTaskInput = { title: string; due_at: string | null; list_id: string | null; priority: number; repeat_rule: string | null; tag_ids: string[]; kind: WorkKind | null }
/** 인식 결과 + 넣은 자리의 기본값 → 새 할 일 값. 인식한 날짜·리스트가 자리 기본값을 이긴다.
 * kind는 자리(줄·묶음)의 종류가 제목 분류와 다를 때만(덮어쓰기 행). 제목이 비면 null */
export function projectTaskInput(r: QuickParsed, at: { day?: string | null; kind?: WorkKind | null; mainList: string | null }): ProjectTaskInput | null {
  const title = r.title.replace(/\s+/g, ' ').trim()
  if (!title) return null
  return {
    title,
    due_at: r.due_at ?? at.day ?? null,
    list_id: r.list_id || at.mainList || null,
    priority: r.priority ?? 0,
    repeat_rule: r.due_at ? (r.repeat_rule ?? null) : null,
    tag_ids: r.tag_ids ?? [],
    kind: at.kind && workKind(title) !== at.kind ? at.kind : null
  }
}
