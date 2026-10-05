// 31 §12 점검 — 주간 점검 3단계 순수 계산(데스크톱·모바일 공용). DB 효과는 각 앱(데스크톱 data/review.ts, 모바일 src/map/review).
// 밀린 일 처리는 XP 없음(19 §3.3). 목표는 성장 10 §4 주간 목표(kpis) 그대로. 진행 기억은 기기(Store를 넘긴다).
import { addDays, datePart, dateKey, WEEKDAY_KO } from './time.ts'
import { XP } from './growth.ts'
import { projectDeadline, projectEmoji, projectMembers, projectTitle } from './projects.ts'
import type { AtLink, AtTag } from './autoTag.ts'

// ── 주 ──
/** 월요일 시작 주 */
export const weekStartMon = (day: string) => addDays(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7))
/** 점검 카드 창(31 §10.3 ③): 일요일 20시 이후 = 이번 주, 월요일 12시 전 = 지난주, 그 밖 null */
export function reviewWindowWeek(now: Date): string | null {
  const today = dateKey(now)
  if (now.getDay() === 0 && now.getHours() >= 20) return weekStartMon(today)
  if (now.getDay() === 1 && now.getHours() < 12) return addDays(weekStartMon(today), -7)
  return null
}
/** 점검할 주(월요일)와 고를 주. 월요일 12시 전이면 지난주를 돌아보고 이번 주를 고른다(31 §10.3 ③ 창과 같음), 그 밖엔 이번 주 → 다음 주 */
export function reviewTarget(at: Date): { week: string; planWeek: string } {
  const week = reviewWindowWeek(at) ?? weekStartMon(dateKey(at))
  return { week, planWeek: addDays(week, 7) }
}
/** 로컬 날짜 'YYYY-MM-DD'의 0시를 ISO로(완료 시각 비교용) */
export const dayStartIso = (day: string) => new Date(`${day}T00:00`).toISOString()
const localDay = (iso: string) => dateKey(new Date(iso))
export const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`
export const weekRangeLabel = (week: string) => `${md(week)} – ${md(addDays(week, 6))}`

// ── 입력 모양 ──
export type RTask = {
  id: string; title: string; status: number; parent_id: string | null; due_at: string | null; start_at?: string | null
  completed_at?: string | null; list_id: string | null; repeat_rule?: string | null; priority?: number | null
}
export type RGoal = { id: string; week_start: string; title: string; target: number; progress: number; status: string }
export type RProject = { id: string; name: string; emoji?: string | null; inbox?: boolean }
export type Membership = Map<string, string[]> // 할 일 id → 프로젝트 id들

const due = (t: Pick<RTask, 'due_at'>) => (t.due_at ? datePart(t.due_at) : null)
const inWeek = (day: string | null, week: string) => !!day && day >= week && day < addDays(week, 7)
const doneInWeek = (t: RTask, week: string, skip?: ReadonlySet<string>) => t.status === 1 && !!t.completed_at && inWeek(localDay(t.completed_at), week) && !skip?.has(t.id)

/**
 * 한꺼번에 정리한 완료(XP 없음) — 점검 숫자·7칸·프로젝트 진행에서 뺀다(2026-10-05: 기한 지난 일 186개를 한꺼번에 끝내서 "이번 주 189개 끝냈어").
 * 표시가 따로 없어(planCompleteNoXp는 status·completed_at만 쓴다) 모양으로 가른다: 같은 completed_at(밀리초까지)을 가진 최상위 완료가
 * BULK_DONE_MIN개 이상이고 모두 끝낸 날보다 마감이 앞선 묶음 = 정리 묶음(19 applyCleanup·정리 책상 `기한 지난 일 한꺼번에`가 한 시각으로 쓴다).
 * 사람이 하나씩 끝낸 일은 시각이 서로 달라 걸리지 않는다.
 */
export const BULK_DONE_MIN = 5
export function bulkCleanupIds(tasks: RTask[]): Set<string> {
  const groups = new Map<string, RTask[]>()
  for (const t of tasks) if (t.status === 1 && t.completed_at && !t.parent_id) (groups.get(t.completed_at) ?? groups.set(t.completed_at, []).get(t.completed_at)!).push(t)
  const out = new Set<string>()
  for (const [at, g] of groups) {
    if (g.length < BULK_DONE_MIN) continue
    const day = localDay(at)
    if (g.every((t) => !!due(t) && due(t)! < day)) for (const t of g) out.add(t.id)
  }
  return out
}

/** 밀린 일 = 그 주에 마감이 있었던 열린 최상위 할 일 중 마감이 오늘 전(마감 순) */
export function missedOf<T extends RTask>(tasks: T[], week: string, today: string): T[] {
  const end = addDays(week, 7) < today ? addDays(week, 7) : today
  return tasks.filter((t) => t.status === 0 && !t.parent_id && !!due(t) && due(t)! >= week && due(t)! < end)
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
}

/** ① 큰 숫자 3개 */
export function weekNumbers(tasks: RTask[], goals: RGoal[], week: string, missed: number) {
  const bulk = bulkCleanupIds(tasks)
  const done = tasks.filter((t) => doneInWeek(t, week, bulk)).length
  const mine = goals.filter((g) => g.week_start === week)
  const achieved = mine.filter((g) => g.status === 'achieved' || g.progress >= g.target).length
  // 설명에 쓸 목표: 덜 찬 것 중 가장 많이 한 것, 없으면 첫 목표
  const lead = [...mine].filter((g) => g.status !== 'achieved' && g.progress < g.target).sort((a, b) => b.progress - a.progress)[0] ?? mine[0] ?? null
  return { done, missed, goals: { achieved, total: mine.length, lead } }
}

export type ProjectRow = { id: string; name: string; emoji: string | null; done: number; total: number }
/** ① 프로젝트별 이번 주 진행(최상위만 — 7칸과 같게): 그 주 마감(하지 않음 제외)이거나 그 주에 끝낸 할 일 — 끝낸 수/전체. 많은 순 4개 */
export function projectProgress(tasks: RTask[], projects: RProject[], member: Membership, week: string, max = 4): ProjectRow[] {
  const acc = new Map<string, ProjectRow>()
  const byId = new Map(projects.map((p) => [p.id, p]))
  const bulk = bulkCleanupIds(tasks)
  for (const t of tasks) {
    if (bulk.has(t.id)) continue
    const counts = (inWeek(due(t), week) && t.status !== 2) || doneInWeek(t, week)
    if (!counts || t.parent_id) continue
    for (const pid of member.get(t.id) ?? []) {
      const p = byId.get(pid)
      if (!p) continue
      const row = acc.get(pid) ?? { id: pid, name: p.name, emoji: p.emoji ?? null, done: 0, total: 0 }
      row.total++
      if (t.status === 1) row.done++
      acc.set(pid, row)
    }
  }
  return [...acc.values()].sort((a, b) => b.total - a.total || b.done - a.done || a.name.localeCompare(b.name)).slice(0, max)
}
/**
 * 프로젝트 = 종류가 project인 태그 — 구성원은 계획 모드와 같은 규칙(@sprout/schema/projects projectMembers: 붙은 태그 ∪ 집 안 할 일 ∪ 하위 − ✕).
 * 프로젝트가 없거나 구성원이 하나도 없으면 리스트로 묶는다(기본함 = '기본함').
 */
export type RList = { id: string; name: string; emoji: string | null; kind: string; folder_id?: string | null }
export function membershipOf(tasks: RTask[], tags: AtTag[], links: AtLink[], lists: RList[]): { projects: RProject[]; member: Membership; byTag: boolean } {
  const member: Membership = new Map()
  const projects = tags.filter((t) => t.kind === 'project')
  for (const p of projects) for (const id of projectMembers(p, tasks, links, lists)) member.set(id, [...(member.get(id) ?? []), p.id])
  if (member.size) return { projects: projects.map((p) => ({ id: p.id, name: projectTitle(p.name), emoji: projectEmoji(p.name) })), member, byTag: true }
  for (const t of tasks) if (t.list_id) member.set(t.id, [t.list_id])
  return { projects: lists.map((l) => ({ id: l.id, name: l.kind === 'inbox' ? '기본함' : l.name, emoji: l.kind === 'inbox' ? '📥' : l.emoji, inbox: l.kind === 'inbox' })), member, byTag: false }
}

/** 주 7칸(점검 띠 weekColumns와 같은 모양): 끝냄 ✓ · 못 함 ✕ · 남음 */
export type DayCell = { day: string; label: string; bars: { id: string; title: string; tone: 'done' | 'miss' | 'open' | 'goal' }[] }
const dayLabel = (day: string, i: number) => `${['월', '화', '수', '목', '금', '토', '일'][i]} ${md(day)}`
export function lookColumns(tasks: RTask[], week: string, today: string): DayCell[] {
  const bulk = bulkCleanupIds(tasks)
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(week, i)
    // 끝낸 일은 끝낸 날에(마감이 없거나 다른 날이어도), 열린 일은 마감 날에
    const bars = tasks.filter((t) => !t.parent_id && t.status !== 2 && !bulk.has(t.id) && (t.status === 1 ? (t.completed_at ? localDay(t.completed_at) : due(t)) === day : due(t) === day))
      .map((t) => ({ id: t.id, title: t.title, tone: t.status === 1 ? 'done' as const : day < today ? 'miss' as const : 'open' as const }))
    return { day, label: dayLabel(day, i), bars }
  })
}

// ── ③ 목표 고르기 ──
export type Suggestion = { key: string; kind: 'carry' | 'project' | 'deadline' | 'custom'; title: string; meta: string; target: number; taskIds: string[]; emoji?: string | null; due?: string | null; dueWord?: string | null }
export const PICK_MAX = 3
/** 고를 수 있는 개수: 3개까지, 그 주 목표 상한(5)에서 이미 있는 목표를 뺀 만큼 */
export const pickRoom = (existing: number) => Math.max(0, Math.min(PICK_MAX, XP.goalsPerWeek - existing))
const cut = (s: string, n = 18) => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s)

/**
 * 제안(최대 6): ㉠ 이번 주 못 채운 목표 이어서(같은 제목 열린 할 일이 있으면 딸림) ㉡ 진행 중 프로젝트(열린 할 일이 있고 이번 주 움직였거나 2주 안 마감)
 * ㉢ 2주 안 마감 할 일(반복 할 일 빼고, 중요도 → 마감 순). "2주" = 고를 주 월요일부터 14일. 한 할 일은 제안 하나에만 딸린다(앞 제안이 가져감).
 * 다음 주에 이미 있는 목표와 같은 제목은 뺀다. exclude = ②에서 다룬 밀린 일(제안이 그것들로 넘치지 않게).
 */
export function suggestGoals(s: {
  tasks: RTask[]; projects: RProject[]; member: Membership; goals: RGoal[]; week: string; planWeek: string; today: string; exclude?: ReadonlySet<string>
}): Suggestion[] {
  const { tasks, projects, member, goals, week, planWeek, today } = s
  const horizon = addDays(planWeek, 14) // 다음 주 + 그다음 주
  const from = planWeek > today ? planWeek : today
  const soon = (d: string | null) => !!d && d >= from && d < horizon
  const taken = new Set(goals.filter((g) => g.week_start === planWeek).map((g) => g.title.trim()))
  const out: Suggestion[] = []
  const push = (x: Suggestion) => { if (!taken.has(x.title.trim()) && !out.some((o) => o.title === x.title)) out.push(x) }
  const open = tasks.filter((t) => t.status === 0 && !t.parent_id && !s.exclude?.has(t.id))
  const used = new Set<string>()
  const bulk = bulkCleanupIds(tasks)
  for (const g of goals.filter((g) => g.week_start === week && g.status !== 'achieved' && g.progress < g.target)) {
    const same = open.filter((t) => t.title.trim() === g.title.trim()).map((t) => t.id)
    same.forEach((id) => used.add(id))
    push({ key: `carry:${g.id}`, kind: 'carry', title: g.title, meta: `이번 주 ${g.progress}/${g.target} 이어서`, target: g.target, taskIds: same })
  }
  const proj = projects.filter((p) => !p.inbox).map((p) => {
    const mine = open.filter((t) => !used.has(t.id) && (member.get(t.id) ?? []).includes(p.id))
    const moved = tasks.some((t) => doneInWeek(t, week, bulk) && (member.get(t.id) ?? []).includes(p.id))
    const dated = mine.filter((t) => soon(due(t))).sort((a, b) => due(a)!.localeCompare(due(b)!))
    return { p, mine, moved, dated }
  }).filter((x) => x.mine.length > 0 && (x.moved || x.dated.length > 0))
    .sort((a, b) => (a.dated[0] ? due(a.dated[0])! : '9999').localeCompare(b.dated[0] ? due(b.dated[0])! : '9999') || b.mine.length - a.mine.length)
  for (const { p, mine, dated } of proj.slice(0, 3)) {
    // 프로젝트 마감 = 계획 모드와 같은 projectDeadline(제출·시험·발표… 말이 든 일), 없으면 가장 가까운 마감
    const dl = projectDeadline(mine)
    // 딸릴 일: 가까운 것 2개 + 마감 일(2주 안이면) — 최대 3
    const base = (dated.length ? dated : mine).slice(0, 3)
    const dlTask = dl && soon(dl.day) ? mine.find((t) => t.id === dl.taskId) : undefined
    const pick = dlTask && !base.slice(0, 2).includes(dlTask) ? [...base.slice(0, 2), dlTask] : base
    pick.forEach((t) => used.add(t.id))
    const near = dl && soon(dl.day) ? dl.day : dated[0] ? due(dated[0]) : null
    const word = dl && near === dl.day ? dl.word : null
    push({
      key: `project:${p.id}`, kind: 'project', emoji: p.emoji ?? null, taskIds: pick.map((t) => t.id), target: pick.length, due: near, dueWord: word,
      title: `${p.name}: ${[...new Set(pick.map((t) => cut(shortTitle(t.title, p.name), 14)))].slice(0, 2).join(' · ')}`,
      meta: `프로젝트 · ${near ? `${word ?? '마감'} ${md(near)}` : `열린 ${mine.length}개`}`
    })
  }
  // 반복 할 일(매일 스트레칭 같은 것)은 목표감이 아니다 — 빼고, 중요도 높은 것 → 마감 가까운 것
  const deadlines = open.filter((t) => soon(due(t)) && !used.has(t.id) && !t.repeat_rule)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || due(a)!.localeCompare(due(b)!))
  for (const t of deadlines.slice(0, 4)) {
    push({ key: `deadline:${t.id}`, kind: 'deadline', title: t.title, meta: `마감 ${md(due(t)!)}`, target: 1, taskIds: [t.id], due: due(t) })
  }
  return out.slice(0, 6)
}

/** 프로젝트 제안 제목 안의 할 일 이름: 프로젝트 이름 낱말을 뺀다(`UniPort 베타 배포` → `베타 배포`). 다 빠지면 그대로 */
export function shortTitle(title: string, project: string): string {
  const words = project.split(/\s+/).filter((w) => [...w].length >= 2)
  let t = title
  for (const w of words) t = t.split(w).join(' ')
  t = t.replace(/\s+/g, ' ').trim()
  return [...t].length >= 2 ? t : title
}

/** 고르기 토글: 이미 골랐으면 빼고, 자리가 없으면 그대로 */
export function togglePick(picks: string[], key: string, room: number): string[] {
  if (picks.includes(key)) return picks.filter((k) => k !== key)
  return picks.length >= room ? picks : [...picks, key]
}

/** ③ 아래 다음 주 7칸: 다음 주 마감인 열린 최상위 할 일, 고른 목표에 연결된 것은 🎯(goal) */
export function planColumns(tasks: RTask[], planWeek: string, goalTasks: ReadonlySet<string>): DayCell[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(planWeek, i)
    const bars = tasks.filter((t) => t.status === 0 && !t.parent_id && due(t) === day)
      .map((t) => ({ id: t.id, title: t.title, tone: goalTasks.has(t.id) ? 'goal' as const : 'open' as const }))
      .sort((a, b) => (a.tone === 'goal' ? 0 : 1) - (b.tone === 'goal' ? 0 : 1))
    return { day, label: dayLabel(day, i), bars }
  })
}

// ── 진행 기억 ──
export type Decision = 'next' | 'someday' | 'done' | 'trash'
export const DECISION_LABEL: Record<Decision, string> = { next: '다음 주로', someday: '날짜 빼기 (언젠가)', done: '끝냄', trash: '지우기' }
export type Step = 1 | 2 | 3 | 4
export type SnapRow = { id: string; status?: unknown; due_at?: unknown; start_at?: unknown; is_all_day?: unknown; repeat_rule?: unknown; repeat_from?: unknown; completed_at?: unknown; deleted_at?: unknown }
export type LinkRow = { id: string; kind: 'goal'; from_id: string; to_id: string; state: 'accepted' | 'suggested' | 'dismissed' }
export type Created = { goalId: string; title: string; removed: LinkRow[] }
export type ReviewProgress = {
  week: string
  step: Step
  /** 가 본 가장 먼 단계 — 스테퍼에서 앞뒤로 다시 갈 수 있는 범위 */
  reached: Step
  /** ②에 보이는 밀린 일(처음 본 때 기억 — 처리해서 밀린 일이 아니게 돼도 카드는 남아 되돌릴 수 있다) */
  missed: { id: string; due: string }[]
  decisions: Record<string, Decision>
  snaps: Record<string, SnapRow[]>
  picks: string[]
  custom: { key: string; title: string }[]
  created: Created[]
  finishedAt: string | null
}
export const REVIEW_KEY = 'sprout.map.review'
export const freshProgress = (week: string): ReviewProgress => ({ week, step: 1, reached: 1, missed: [], decisions: {}, snaps: {}, picks: [], custom: [], created: [], finishedAt: null })
export type Store = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }
const storage = (): Store | null => { try { return ((globalThis as { localStorage?: Store }).localStorage) ?? null } catch { return null } }
/** 그 주 진행만 이어 간다 — 다른 주 기록이면 새로 */
export function loadProgress(week: string, s: Store | null = storage()): ReviewProgress {
  try {
    const o = JSON.parse(s?.getItem(REVIEW_KEY) ?? 'null') as Partial<ReviewProgress> | null
    if (!o || o.week !== week) return freshProgress(week)
    return { ...freshProgress(week), ...o, week }
  } catch { return freshProgress(week) }
}
export function saveProgress(p: ReviewProgress, s: Store | null = storage()) { try { s?.setItem(REVIEW_KEY, JSON.stringify(p)) } catch { /* 기억만 못 한다 */ } }

/** 단계 옮기기(가 본 범위를 넓힌다) */
export const goStep = (p: ReviewProgress, step: Step): ReviewProgress => ({ ...p, step, reached: Math.max(p.reached ?? 1, step) as Step })

/** ②에 보일 목록 = 기억한 것 + 새로 밀린 것(뒤에) */
export function mergeMissed(prev: { id: string; due: string }[], live: RTask[]): { id: string; due: string }[] {
  const seen = new Set(prev.map((m) => m.id))
  return [...prev, ...live.filter((t) => !seen.has(t.id) && t.due_at).map((t) => ({ id: t.id, due: datePart(t.due_at!) }))]
}
/** 아직 안 정한 카드(기본값 "다음 주로"가 될 것) */
export const undecided = (p: Pick<ReviewProgress, 'missed' | 'decisions'>, alive: ReadonlySet<string>) => p.missed.filter((m) => alive.has(m.id) && !p.decisions[m.id]).map((m) => m.id)

/** 끝 화면 요약 `주 목표 3개 · 다음 주로 2개 · 언젠가 1개 · 정리 1개`(0은 뺀다) */
export function finishSummary(p: Pick<ReviewProgress, 'decisions' | 'created'>): string {
  const d = Object.values(p.decisions)
  const n = (k: Decision[]) => d.filter((x) => k.includes(x)).length
  const parts: [string, number][] = [['주 목표', p.created.length], ['다음 주로', n(['next'])], ['언젠가', n(['someday'])], ['정리', n(['done', 'trash'])]]
  const s = parts.filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}개`).join(' · ')
  return s || '이번 주는 그대로 두었어요'
}

// ── 캐릭터 한마디(벌하지 않는 말투, 31 §11.9와 같은 목소리) ──
const batchim = (w: string) => { const c = w.trim().charCodeAt(w.trim().length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0 }
const eunNeun = (w: string) => `${w}${batchim(w) ? '은' : '는'}`
const iGa = (w: string) => `${w}${batchim(w) ? '이' : '가'}`
export function lookLine(n: ReturnType<typeof weekNumbers>): string {
  const g = n.goals.lead
  if (!n.done && !n.missed && !g) return '조용한 한 주였네. 다음 주를 같이 정해 보자.'
  const head = g ? `${eunNeun(cut(g.title, 14))} ${Math.min(g.progress, g.target)}/${g.target} 했네! ` : ''
  if (n.done) return `${head}이번 주 ${n.done}개${n.done >= 10 ? '나' : ''} 끝냈어.`
  return `${head}밀린 ${n.missed}개는 다음 단계에서 같이 정하자.`
}
export function missedLine(left: number, total: number): string {
  if (!total) return '밀린 일이 없어! 바로 다음으로 가자.'
  if (!left) return '다 정했어! 다음으로 가자.'
  return `밀린 건 ${left}개야. 하나씩 정하자. 귀찮으면 전부 다음 주로 넘겨도 돼.`
}
export function pickLine(sugs: Suggestion[], today: string, planWeek: string): string {
  // 프로젝트 마감이 먼저(작은 할 일보다 큰 그림), 없으면 가장 가까운 마감
  const dated = sugs.filter((x) => x.due).sort((a, b) => a.due!.localeCompare(b.due!))
  const d = dated.find((x) => x.kind === 'project') ?? dated[0]
  if (d) {
    const name = d.kind === 'project' ? `${d.title.split(':')[0]} ${d.dueWord ?? '마감'}` : `${cut(d.title, 14)} 마감`
    // 고를 주 안이면 요일만, 그다음 주면 "다음 주"(고를 주가 이번 주일 때) 또는 "다다음 주"
    const later = d.due! >= addDays(planWeek, 7)
    const day = `${WEEKDAY_KO[new Date(`${d.due}T00:00`).getDay()]}요일`
    const when = !later ? day : `${planWeek <= today ? '다음 주' : '다다음 주'} ${day}`
    return `${iGa(name)} ${when}이야. 이건 꼭 넣자!`
  }
  return sugs.length ? '다음 주에 꼭 할 걸 3개까지 골라 봐.' : `${iGa('다음 주 목표')} 아직 없네. 직접 적어 볼까?`
}

