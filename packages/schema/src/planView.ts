// 31 §12.2~12.5 계획 화면 계산 — 프로젝트(태그 kind project) · 구성원 · 일의 종류 · 기간·마감 · 다음 · 옆 칸 · 제안 · ⚡ 지금 할 일.
// 행(로컬 DB 질의 결과)을 받아 화면 값을 만든다(데스크톱 useProjects · 모바일 src/map/plan 공용). 제안 카드는 suggest=true일 때만(모바일은 끔 — 29 §9.1).
import { parseAliases, relationId, sha1 } from './wikiLink.ts'
import { tagKey } from './autoTag.ts'
import {
  blockedSet, categoryOf, daysBetween, deadlineWord, findProjectClusters, PROJECT, specificName, EXAM_CATEGORY, nextSteps, projectDeadline, membersEndedBy, type ProjectDeadline, projectEmoji, projectMembers, projectSpan, projectTitle, taskDay, workKind,
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
  deadline: ProjectDeadline | null
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
  /** 41 §3 ⚑ 핵심 날짜 할 일(relations deadline) — 없으면 null */
  keyTask: PTaskRow | null
  /** 41 §3 팀원(relations tag → tag field project) */
  team: { id: string; name: string }[]
  /** 41 §4 프로젝트 설정(view_settings project:<id>) */
  settings: ProjectSettings
  /** 41 §4.1 줄 기준 — 설정 → 없으면 일의 종류(원래 있던 프로젝트) */
  laneBy: LaneBy
  /** 41 §4.2 태그 줄(줄 기준과 상관없이 늘 계산 — 휴대폰 묶음·고른 띠 `태그 ›`) */
  tagLanes: TagLanes
}
/** §12.10.3 막연한 할 일(분류 낱말만 있고 아직 그 분류 프로젝트에 없음) — 고르기 알약은 가까운 순 */
export type LooseItem = { task: PTaskRow; choices: string[] }
export type CategoryGroup = { word: string; projects: ProjectView[]; loose: LooseItem[] }
export type MemberVia = 'user' | 'auto' | 'home'
export type TodayItem = { task: PTaskRow; why: 'today' | 'step'; project?: string }
/**
 * 31 §12.10.4 "끝난 프로젝트"(빠른 추가 알약·집중·점수에서 뺌): 보드의 끝남(finished) · 집 리스트 보관 ·
 * 그 밖엔 projects `membersEndedBy` — 앞으로 할 열린 일(오늘 이후·날짜 없음)이 없고, 다 끝났거나 마감(없으면 마지막 날짜)이 7일 넘게 지남.
 * 마감이 지났어도 오늘 이후·날짜 없는 열린 일이 있으면 진행 중.
 */
export function projectEnded(p: Pick<ProjectView, 'finished' | 'archived' | 'members' | 'deadline'>, today: string): boolean {
  if (p.finished || p.archived) return true
  return membersEndedBy(p.members, p.deadline?.day, today)
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
  /** 41 §9 ⚑ 핵심 날짜(relations tag → task field deadline) */
  deadlines?: { tag_id: string; task_id: string }[] | null
  /** 41 §9 이 프로젝트에서 만든 줄(relations tag → tag field lane) */
  lanes?: { project_id: string; tag_id: string; created_at?: string | null }[] | null
  /** 41 §9 프로젝트 설정 행(view_settings view_key project:*) */
  settings?: { view_key: string | null; options_json: string | null }[] | null
  /** 31 §12.13.2 팀원(relations tag → tag field project) */
  team?: { project_id: string; tag_id: string; name: string }[] | null
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
  const keyOf = new Map((i.deadlines ?? []).map((d) => [d.tag_id, d.task_id]))
  const settingsOf = projectSettingsMap(i.settings)
  const lanesOf = new Map<string, { tag_id: string; created_at?: string | null }[]>()
  for (const l of i.lanes ?? []) (lanesOf.get(l.project_id) ?? lanesOf.set(l.project_id, []).get(l.project_id)!).push(l)
  const teamOf = new Map<string, { id: string; name: string }[]>()
  for (const r of i.team ?? []) { const a = teamOf.get(r.project_id) ?? teamOf.set(r.project_id, []).get(r.project_id)!; if (!a.some((x) => x.id === r.tag_id)) a.push({ id: r.tag_id, name: r.name }) }

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
    // 41 §9 ⚑ 핵심 날짜 할 일이 있으면 그 날짜가 마감(사람이 정한 것이 먼저), 없으면 제목의 강한 마감 말
    const kt = keyOf.has(tag.id) ? byId.get(keyOf.get(tag.id)!) ?? null : null
    const keyTask = kt && kt.due_at && kt.status !== 2 ? kt : null
    const deadline = keyTask ? { day: keyTask.due_at!.slice(0, 10), word: keyWordOf(keyTask.title), taskId: keyTask.id } : projectDeadline(members)
    const settings = settingsOf.get(tag.id) ?? {}
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
      focus: false,
      keyTask, team: teamOf.get(tag.id) ?? [], settings, laneBy: settings.by ?? 'kind',
      tagLanes: projectLanes(members, { tags, links, manual: lanesOf.get(tag.id) ?? [], order: settings.order })
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
export type QuickParsed = { title: string; due_at: string | null; priority?: number; list_id?: string; repeat_rule?: string | null; tag_ids?: string[]; /** 41 §5 기간 시작(takeDayRange) */ start_at?: string | null }
export type ProjectTaskInput = { title: string; due_at: string | null; start_at: string | null; list_id: string | null; priority: number; repeat_rule: string | null; tag_ids: string[]; kind: WorkKind | null }
/** 인식 결과 + 넣은 자리의 기본값 → 새 할 일 값. 인식한 날짜·리스트가 자리 기본값을 이긴다.
 * kind는 자리(줄·묶음)의 종류가 제목 분류와 다를 때만(덮어쓰기 행). 제목이 비면 null */
export function projectTaskInput(r: QuickParsed, at: { day?: string | null; kind?: WorkKind | null; mainList: string | null; /** 41 §4.3 줄 태그 */ laneTag?: string | null }): ProjectTaskInput | null {
  const title = r.title.replace(/\s+/g, ' ').trim()
  if (!title) return null
  return {
    title,
    due_at: r.due_at ?? at.day ?? null,
    start_at: r.due_at && r.start_at && r.start_at.slice(0, 10) < r.due_at.slice(0, 10) ? r.start_at : null,
    list_id: r.list_id || at.mainList || null,
    priority: r.priority ?? 0,
    repeat_rule: r.due_at ? (r.repeat_rule ?? null) : null,
    tag_ids: [...new Set([...(r.tag_ids ?? []), ...(at.laneTag && !(r.tag_ids ?? []).length ? [at.laneTag] : [])])],
    kind: at.kind && workKind(title) !== at.kind ? at.kind : null
  }
}

// ── 41 (31 §12.14) 프로젝트 직접 고치기 — 한 줄 만들기 · ⚑ 핵심 날짜 · 줄 = 태그 · 미루기 · 칩 끝 끌기 · 줄 나누기 제안 ──
// 데스크톱(components/map/plan)·휴대폰(app/map/project)이 같은 결과를 내도록 순수 계산은 모두 여기. 저장은 동기화 표만 쓴다(41 §9):
//  · 핵심 날짜 = ⚑ 할 일(tasks) + relations tag(프로젝트) → task field `deadline` (id = keyDateRelId)
//  · 줄 목록 = relations tag(프로젝트) → tag(줄) field `lane` (id = laneRelId) — 줄 태그 자체는 tags kind topic + task_tags
//  · 줄 기준·줄 순서·줄 나누기 제안 본 것·마지막 보기·배율 = view_settings view_key `project:<태그 id>` options_json (id = projectSettingsId)
//  · 보드 공통 기억(제안 `아니`·`빠진 거 없어`·자동 만들기 켬/끔·고르기 `아니`) = view_settings view_key `projects` options_json
export type LaneBy = 'tag' | 'kind'
export type ProjectSettings = {
  /** 줄 기준(41 §4.1). 없으면 원래 있던 프로젝트 = 일의 종류 */
  by?: LaneBy
  /** 손으로 정한 줄 순서(태그 id) */
  order?: string[]
  /** 줄 나누기 제안(§2.4)을 보였거나 닫음 */
  starterSeen?: boolean
  /** 31 §12.11 마지막 보기 */
  view?: 'steps' | 'timeline' | 'graph'
  /** 타임라인 배율(41 §5 · 긴 프로젝트) */
  zoom?: 'week' | 'month'
}
export const PROJECTS_VIEW_KEY = 'projects'
export const projectViewKey = (tagId: string) => `project:${tagId}`
/** 프로젝트 설정 행 id — 두 기기가 오프라인에서 따로 만들어도 한 행(태그 id는 사용자마다 다르니 서버에서 남과 겹치지 않는다) */
export const projectSettingsId = (tagId: string) => `vsp-${sha1(projectViewKey(tagId)).slice(0, 24)}`
export const laneRelId = (projectTagId: string, laneTagId: string) => relationId(projectTagId, laneTagId, 'lane')
export const keyDateRelId = (projectTagId: string) => relationId(projectTagId, 'deadline', 'deadline')

const obj = (s: string | null | undefined): Record<string, unknown> => { try { const v = JSON.parse(s ?? 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { return {} } }
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
export function parseProjectSettings(json: string | null | undefined): ProjectSettings {
  const o = obj(json)
  const s: ProjectSettings = {}
  if (o.by === 'tag' || o.by === 'kind') s.by = o.by
  if (Array.isArray(o.order)) s.order = strs(o.order)
  if (o.starterSeen === true) s.starterSeen = true
  if (o.view === 'steps' || o.view === 'timeline' || o.view === 'graph') s.view = o.view
  if (o.zoom === 'week' || o.zoom === 'month') s.zoom = o.zoom
  return s
}
/** 지금 options_json + 바꿀 것 → 저장할 options_json(모르는 칸은 남긴다 — 새 앱이 더한 칸을 옛 앱이 지우지 않게) */
export function patchProjectSettings(json: string | null | undefined, patch: ProjectSettings): string {
  const o: Record<string, unknown> = { ...obj(json), ...patch }
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return JSON.stringify(o)
}
/** 설정 행들 → 프로젝트 id별 설정(같은 키 행이 둘이면 뒤 행이 앞 행을 덮는다) */
export function projectSettingsMap(rows: { view_key: string | null; options_json: string | null }[] | null | undefined): Map<string, ProjectSettings> {
  const m = new Map<string, ProjectSettings>()
  for (const r of rows ?? []) {
    if (!r.view_key?.startsWith('project:')) continue
    const id = r.view_key.slice('project:'.length)
    m.set(id, { ...(m.get(id) ?? {}), ...parseProjectSettings(r.options_json) })
  }
  return m
}
export type ProjectsShared = { dismissed: string[]; confirmed: Record<string, number>; auto?: boolean; skip: string[] }
/** 보드 공통 기억 행들(기기마다 따로 만든 행이 있을 수 있다) → 합친 값: 목록은 합집합, `빠진 거 없어`는 큰 수, 자동 만들기는 꺼 둔 쪽 */
export function mergeProjectsShared(rows: { options_json: string | null }[] | null | undefined): ProjectsShared {
  const out: ProjectsShared = { dismissed: [], confirmed: {}, skip: [] }
  for (const r of rows ?? []) {
    const o = obj(r.options_json)
    out.dismissed = [...new Set([...out.dismissed, ...strs(o.dismissed)])]
    out.skip = [...new Set([...out.skip, ...strs(o.skip)])]
    const c = obj(JSON.stringify(o.confirmed ?? {}))
    for (const [k, v] of Object.entries(c)) if (typeof v === 'number') out.confirmed[k] = Math.max(out.confirmed[k] ?? 0, v)
    if (o.auto === false) out.auto = false
    else if (o.auto === true && out.auto === undefined) out.auto = true
  }
  return out
}
export const encodeProjectsShared = (s: ProjectsShared) => JSON.stringify({ dismissed: s.dismissed, confirmed: s.confirmed, skip: s.skip, ...(s.auto !== undefined ? { auto: s.auto } : {}) })

// ── 날짜 한 줄 인식(M/D · M월 D일 · YYYY-MM-DD · 기간 ~ · 오늘·내일·모레) ──
export type DayRange = { start: string | null; end: string; token: string; index: number }
const pad2 = (n: number) => String(n).padStart(2, '0')
/** 연도 없는 날짜: 올해, 90일 넘게 지났으면 내년 */
function mdDay(m: number, d: number, today: string): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const y = Number(today.slice(0, 4))
  const mk = (yy: number) => { const s = `${yy}-${pad2(m)}-${pad2(d)}`; const t = new Date(`${s}T00:00:00Z`); return t.getUTCDate() === d ? s : null }
  const cur = mk(y)
  if (!cur) return null
  return cur < addDays(today, -90) ? mk(y + 1) : cur
}
const ONE = String.raw`(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\s*\/\s*(\d{1,2})|(\d{1,2})\s*월\s*(\d{1,2})\s*일`
const RANGE_RE = new RegExp(String.raw`(?:^|\s)((?:${ONE})(?:\s*[~～–-]\s*(?:(?:${ONE})|(\d{1,2})(?:\s*일)?))?)(?=\s|$|[,.)])`)
function oneDay(g: (string | undefined)[], at: number, today: string): string | null {
  if (g[at]) { const v = `${g[at]}-${pad2(Number(g[at + 1]))}-${pad2(Number(g[at + 2]))}`; const t = new Date(`${v}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v ? v : null }
  if (g[at + 3]) return mdDay(Number(g[at + 3]), Number(g[at + 4]), today)
  if (g[at + 5]) return mdDay(Number(g[at + 5]), Number(g[at + 6]), today)
  return null
}
/** 글에서 날짜(또는 기간) 하나를 찾는다. 기간이면 start·end, 하루면 start null */
export function findDayRange(raw: string, today: string): DayRange | null {
  const m = raw.match(RANGE_RE)
  if (m && m.index !== undefined) {
    const g = [...m] as (string | undefined)[]
    const a = oneDay(g, 2, today)
    if (a) {
      let b = oneDay(g, 9, today)
      if (!b && g[16]) { const d = Number(g[16]); const v = `${a.slice(0, 8)}${pad2(d)}`; b = d >= 1 && d <= 31 && new Date(`${v}T00:00:00Z`).getUTCDate() === d ? v : null }
      const token = m[1]
      const index = m.index + m[0].indexOf(token)
      return b && b > a ? { start: a, end: b, token, index } : { start: null, end: a, token, index }
    }
  }
  const rel = raw.match(/(?:^|\s)(오늘|내일|모레)(?=\s|$)/)
  if (rel && rel.index !== undefined) {
    const n = rel[1] === '내일' ? 1 : rel[1] === '모레' ? 2 : 0
    return { start: null, end: addDays(today, n), token: rel[1], index: rel.index + rel[0].indexOf(rel[1]) }
  }
  return null
}
/** 빠른 추가 앞에서 기간을 떼어 둔다: `1회독 10/12~10/18` → 남은 글 + 시작·끝(하루면 start null). 날짜가 없으면 null */
export function takeDayRange(raw: string, today: string): { rest: string; start: string | null; end: string } | null {
  const r = findDayRange(raw, today)
  if (!r || (!r.start && !/[\/월-]/.test(r.token))) return null // 오늘·내일은 빠른 추가 인식기에 맡긴다
  return { rest: `${raw.slice(0, r.index)} ${raw.slice(r.index + r.token.length)}`.replace(/\s+/g, ' ').trim(), start: r.start, end: r.end }
}

// ── 한 줄 만들기 (§2) ──
export const KEY_WORDS = ['시험', '제출', '마감', '발표'] as const
export type Starter = { icon: string; word: string; ask: { text: string; lanes?: string[]; add?: string } | null }
/** §2.4 이름 낱말 → 아이콘·날짜 이름·만든 직후 줄 나누기 제안(저장하지 않는 겉모습 기본값) */
export function starterFor(name: string): Starter {
  const k = tagKey(projectTitle(name)).replace(/\s+/g, '')
  if (categoryOf(name) === EXAM_CATEGORY || /시험|자격증|기사$|자격/.test(k)) return { icon: '📜', word: '시험', ask: { text: '줄을 과목별로 나눌까요?', add: '과목' } }
  if (/공모전|경진대회|대회|해커톤|챌린지|아이디어톤/.test(k)) return { icon: '🏆', word: '제출', ask: { text: '회의·조사·개발·제출로 나눌까요?', lanes: ['회의', '조사', '개발', '제출'] } }
  if (/창업|지원사업|장학금/.test(k)) return { icon: '🌱', word: '제출', ask: { text: '서류·면접·결과로 나눌까요?', lanes: ['서류', '면접', '결과'] } }
  if (/취업|채용|공채/.test(k)) return { icon: '🚀', word: '마감', ask: { text: '회사별로 나눌까요?', add: '회사' } }
  return { icon: '🚀', word: '마감', ask: null }
}
/** ⚑ 할 일 제목: 이름 + 날짜 이름 + `일`(이름이 그 말로 끝나면 이름 + `일`) */
export function keyTaskTitle(name: string, word: string): string {
  const n = projectTitle(name).trim()
  return n.endsWith(word) ? `${n}일` : `${n} ${word}일`
}
/** ⚑ 할 일 제목에서 날짜 이름(시험·제출·마감·발표 → 강한 마감 말 → 마감) */
export function keyWordOf(title: string): string {
  const t = displayTitleLite(title).replace(/\s+/g, '')
  for (const w of KEY_WORDS) if (t.endsWith(`${w}일`) || t.endsWith(w)) return w
  return deadlineWord(title) ?? '마감'
}
const displayTitleLite = (t: string) => t.replace(/\[\[|\]\]/g, '')
/** 날짜 이름을 바꾼 ⚑ 할 일 제목(끝의 `○○일`만 바꾼다. 사람이 고친 제목이면 그대로 둔다) */
export function retitleKeyTask(title: string, from: string, to: string): string {
  if (from === to) return title
  if (title.endsWith(`${from}일`)) return `${title.slice(0, title.length - from.length - 1)}${to}일`
  return title
}
export type ProjectLine = { name: string; emoji: string | null; icon: string; day: string | null; word: string; token: string | null; tokenAt: number; keyTitle: string | null; starter: Starter }
/** §2.2 입력 한 줄 → 이름(20자, 앞 이모지 = 아이콘) · 날짜 하나(기간이면 끝날) · 날짜 이름(골랐으면 그것, 아니면 이름에서) */
export function parseProjectLine(raw: string, today: string, pickedWord?: string | null): ProjectLine {
  const r = findDayRange(raw, today)
  const rest = r ? `${raw.slice(0, r.index)} ${raw.slice(r.index + r.token.length)}` : raw
  const t = rest.replace(/\s+/g, ' ').trim()
  const head = t.match(EMOJI_LEAD)?.[0] ?? null
  const name = [...projectTitle(t)].slice(0, PROJECT.nameMax).join('').trim()
  const starter = starterFor(name)
  const word = pickedWord || starter.word
  const day = r ? r.end : null
  return { name, emoji: head, icon: head ?? starter.icon, day, word, token: r?.token ?? null, tokenAt: r?.index ?? -1, keyTitle: day && name ? keyTaskTitle(name, word) : null, starter }
}
const EMOJI_LEAD = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u
/** 날짜 이름 칩: 시험·제출·마감·발표 + 이름에서 짐작한 말이 넷에 없으면 그 말 */
export const keyWordChips = (guess: string) => (KEY_WORDS as readonly string[]).includes(guess) ? [...KEY_WORDS] : [...KEY_WORDS, guess]
const WD = '일월화수목금토'
/** `11/23(월)` */
export const mdWeek = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WD[new Date(`${day}T00:00:00Z`).getUTCDay()]})`
/** D-48 · D-day · D+3 */
export const dDay = (day: string, today: string) => { const n = daysBetween(today, day); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}` }
/** D-day 빨강: 3일 안이거나 지남 */
export const dDayHot = (day: string, today: string) => daysBetween(today, day) <= 3

// ── 줄 = 태그 (§4) ──
export const NO_LANE = '∅'
export type TagLane = { id: string; tag: TagRow | null; name: string; items: PTaskRow[]; manual: boolean }
export type TagLanes = { lanes: TagLane[]; laneOf: Map<string, string>; more: Map<string, number>; tagsOf: Map<string, string[]> }
/** 줄이 되는 태그: 보통 태그(kind topic·없음). 사람·프로젝트·장소는 아니다 */
export const isLaneTag = (t: Pick<TagRow, 'kind'> | undefined) => !!t && (t.kind ?? 'topic') === 'topic'
/**
 * §4.2 줄 목록·칩 배정·`+1`(결정 3): 줄 = 이 프로젝트에서 만든 줄(빈 줄 포함) ∪ 구성원에 붙은 보통 태그(accepted).
 * 순서 = 손으로 정한 순서 → 만든 줄(만든 순) → 나머지(구성원 많은 순 → 이름). 한 할 일에 줄 태그가 여럿이면 앞 줄에만, more = 나머지 수.
 * 맨 끝은 늘 `태그 없음`(id NO_LANE) — 비었는지는 화면이 본다.
 */
export function projectLanes(
  members: PTaskRow[],
  ctx: { tags: TagRow[]; links: LinkRow[]; manual: { tag_id: string; created_at?: string | null }[]; order?: string[] }
): TagLanes {
  const tagById = new Map(ctx.tags.map((t) => [t.id, t]))
  const ids = new Set(members.map((m) => m.id))
  const tagsOfRaw = new Map<string, Set<string>>()
  for (const l of ctx.links) {
    if (!ids.has(l.task_id) || (l.state ?? 'accepted') !== 'accepted' || !isLaneTag(tagById.get(l.tag_id))) continue
    ;(tagsOfRaw.get(l.task_id) ?? tagsOfRaw.set(l.task_id, new Set()).get(l.task_id)!).add(l.tag_id)
  }
  const count = new Map<string, number>()
  for (const s of tagsOfRaw.values()) for (const t of s) count.set(t, (count.get(t) ?? 0) + 1)
  const manual = [...ctx.manual].filter((m) => isLaneTag(tagById.get(m.tag_id))).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const manualIds = new Set(manual.map((m) => m.tag_id))
  const all = new Set([...manualIds, ...count.keys()])
  const name = (id: string) => projectTitle(tagById.get(id)?.name ?? '')
  const order: string[] = []
  for (const id of ctx.order ?? []) if (all.has(id) && !order.includes(id)) order.push(id)
  for (const m of manual) if (!order.includes(m.tag_id)) order.push(m.tag_id)
  for (const id of [...count.keys()].filter((x) => !order.includes(x)).sort((a, b) => (count.get(b)! - count.get(a)!) || name(a).localeCompare(name(b)))) order.push(id)
  const rank = new Map(order.map((id, i) => [id, i]))
  const lanes: TagLane[] = order.map((id) => ({ id, tag: tagById.get(id)!, name: name(id), items: [], manual: manualIds.has(id) }))
  const none: TagLane = { id: NO_LANE, tag: null, name: '태그 없음', items: [], manual: false }
  const byLane = new Map(lanes.map((l) => [l.id, l]))
  const laneOf = new Map<string, string>(), more = new Map<string, number>(), tagsOf = new Map<string, string[]>()
  for (const m of members) {
    const ts = [...(tagsOfRaw.get(m.id) ?? [])].sort((a, b) => rank.get(a)! - rank.get(b)!)
    tagsOf.set(m.id, ts)
    const lane = ts.length ? byLane.get(ts[0])! : none
    lane.items.push(m)
    laneOf.set(m.id, lane.id)
    if (ts.length > 1) more.set(m.id, ts.length - 1)
  }
  return { lanes: [...lanes, none], laneOf, more, tagsOf }
}
/** §4.3 다른 줄로 옮기기: 뗄 태그·붙일 태그. 앞 줄 태그만 바뀐다. `태그 없음`에 놓으면 줄 태그를 모두 뗀다 */
export function laneMove(tagsOfTask: string[], from: string, to: string): { remove: string[]; add: string[] } {
  if (from === to) return { remove: [], add: [] }
  if (to === NO_LANE) return { remove: [...tagsOfTask], add: [] }
  return { remove: from !== NO_LANE && tagsOfTask.includes(from) ? [from] : [], add: tagsOfTask.includes(to) ? [] : [to] }
}
/** 같은 이름 태그(합치기 묻기 · ＋ 줄 추가에서 있는 태그 쓰기) */
export const findTagByName = (tags: Pick<TagRow, 'id' | 'name' | 'kind'>[], name: string) => {
  const k = tagKey(projectTitle(name.replace(/^#/, '')))
  return tags.find((t) => tagKey(projectTitle(t.name)) === k) ?? null
}
/** §4.3 `태그 없음` 줄 안내: 같은 뚜렷한 낱말이 든 할 일이 3개 이상이면 그 낱말(AI 없이) */
export function laneHint(items: Pick<PTaskRow, 'title'>[], taken: string[]): { word: string; n: number } | null {
  const seen = new Set(taken.map((t) => tagKey(t)))
  const n = new Map<string, number>()
  for (const it of items) for (const w of new Set(displayTitleLite(it.title).split(/[\s,.·/()]+/).map((x) => x.replace(/(을|를|이|가|은|는|에|의|와|과|도)$/, '')).filter((x) => [...x].length >= 2 && !/^\d/.test(x)))) n.set(w, (n.get(w) ?? 0) + 1)
  const best = [...n].filter(([w, c]) => c >= 3 && !seen.has(tagKey(w)) && !isWorkWordLite(w)).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]
  return best ? { word: best[0], n: best[1] } : null
}
const isWorkWordLite = (w: string) => /^(하기|정리|준비|완료|확인|공부|작성)$/.test(w)

// ── 날짜 바꾸기 (§5 · §6) ──
export type DateChange = { id: string; start_at: string | null; due_at: string | null }
const keepTime = (field: string, day: string) => (field.length > 10 ? `${day}${field.slice(10)}` : day)
const shiftField = (f: string | null | undefined, n: number) => (f ? keepTime(f, addDays(f.slice(0, 10), n)) : null)
/**
 * §6 미루기·날짜 고르기: 날짜가 있는 열린 일만 옮긴다(끝낸 일·날짜 없는 일은 그대로). 시작·끝이 함께 움직여 기간이 그대로.
 * `days` = 그만큼 · `anchor` = 가장 이른 일이 그날로, 나머지는 간격 그대로.
 */
export function shiftDates(ts: Pick<PTaskRow, 'id' | 'status' | 'start_at' | 'due_at'>[], how: { days: number } | { anchor: string }): DateChange[] {
  const open = ts.filter((t) => (t.status ?? 0) === 0 && (t.due_at || t.start_at))
  if (!open.length) return []
  const first = open.map((t) => (t.start_at ?? t.due_at)!.slice(0, 10)).sort()[0]
  const n = 'days' in how ? how.days : daysBetween(first, how.anchor)
  if (!n) return []
  return open.map((t) => ({ id: t.id, start_at: shiftField(t.start_at, n), due_at: shiftField(t.due_at, n) }))
}
/** §5 칩 끝 끌기: 끝날(오른쪽)·시작일(왼쪽). 점 칩의 오른쪽 끝 = 막대(시작 = 원래 날). 끝날은 시작 앞으로 안 가고, 같아지면 점으로 */
export function chipResize(t: Pick<PTaskRow, 'id' | 'start_at' | 'due_at'>, edge: 'start' | 'end', day: string): DateChange | null {
  const due = t.due_at ?? t.start_at
  if (!due) return null
  const start = t.start_at && t.due_at ? t.start_at : null
  const s = (start ?? due).slice(0, 10), e = due.slice(0, 10)
  let ns = s, ne = e
  if (edge === 'end') ne = day < s ? s : day
  else ns = day > e ? e : day
  if (ns === s && ne === e) return null
  const dueOut = keepTime(due, ne)
  return ns === ne ? { id: t.id, start_at: null, due_at: dueOut } : { id: t.id, start_at: keepTime(start ?? due, ns), due_at: dueOut }
}
/** 기간(시작·끝이 다른 날)인가 */
export const isSpan = (t: Pick<PTaskRow, 'start_at' | 'due_at'>) => !!t.start_at && !!t.due_at && t.start_at.slice(0, 10) < t.due_at.slice(0, 10)
