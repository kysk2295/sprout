// 10 성장 — XP·레벨·진화 단계·성향 조사 계산. 앱(데스크톱·모바일)과 서버가 같이 쓴다.
// 레벨은 저장하지 않고 XP 원장에서 계산한다(규칙을 바꿔도 다시 계산된다, PRD §7.3).

// ── XP 규칙 (10 §6) ──
export const XP = { task: 1, taskDailyCap: 10, kpi: 30, kpiAll: 20, kpiXpLimit: 3, goalsPerWeek: 5 } as const

export type XpKind = 'task' | 'task_revoke' | 'kpi' | 'kpi_revoke' | 'kpi_all'
export type XpEvent = { id: string; kind: XpKind; amount: number; ref_id: string; day: string; created_at: string }

/** 사건에서 id를 만든다 — 두 기기가 같은 사건으로 XP를 두 번 주지 않게(같은 id로 합쳐진다) */
export const xpEventId = {
  task: (taskId: string, day: string) => `task:${taskId}:${day}`,
  taskRevoke: (taskId: string, day: string) => `task-revoke:${taskId}:${day}`,
  /** 목표 XP는 달성·취소를 오갈 수 있어 순번을 붙인다(0 = 첫 지급) */
  kpi: (kpiId: string, seq = 0) => (seq ? `kpi:${kpiId}:${seq}` : `kpi:${kpiId}`),
  // 주 단위 사건은 사용자마다 겹치지 않게 캐릭터 id(uuid)를 붙인다(서버는 남의 행을 덮어쓰지 않는다)
  kpiAll: (characterId: string, weekStart: string) => `kpi-all:${characterId}:${weekStart}`,
  report: (characterId: string, weekStart: string) => `report:${characterId}:${weekStart}`
}

/** 오늘 할 일로 받은 XP(되돌림 반영)가 상한 아래면 +1을 줄 수 있다 */
export function canGrantTaskXp(eventsOfDay: { kind: string; amount: number }[]): boolean {
  const got = eventsOfDay.filter((e) => e.kind === 'task' || e.kind === 'task_revoke').reduce((sum, e) => sum + e.amount, 0)
  return got < XP.taskDailyCap
}

// ── 레벨 곡선 (10 §2.1) ──
/** 지금 레벨에서 다음 레벨까지 필요한 XP: 40 + 20 × (레벨 − 1) */
export const xpToNext = (level: number) => 40 + 20 * (level - 1)

/** 누적 XP → 레벨과 그 레벨 안에서의 진행 */
export function levelFromXp(total: number): { level: number; into: number; toNext: number } {
  let level = 1
  let rest = Math.max(0, Math.floor(total))
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level)
    level++
  }
  return { level, into: rest, toNext: xpToNext(level) }
}

/**
 * 원장 → 레벨. 되돌림으로 XP가 줄어도 **레벨은 내려가지 않는다**(10 §6):
 * 지금까지 도달한 가장 높은 누적값으로 레벨을 정하고, 진행 막대는 지금 XP로 보여준다(최소 0).
 */
export function progressFromEvents(events: Pick<XpEvent, 'amount' | 'created_at'>[]) {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  let total = 0
  let peak = 0
  for (const e of sorted) {
    total += e.amount
    peak = Math.max(peak, total)
  }
  const { level } = levelFromXp(peak)
  const levelStart = cumulativeXp(level)
  const into = Math.max(0, total - levelStart)
  return { total, level, into, toNext: xpToNext(level), stage: stageOf(level) }
}

/** 그 레벨이 시작하는 누적 XP */
export function cumulativeXp(level: number): number {
  let sum = 0
  for (let l = 1; l < level; l++) sum += xpToNext(l)
  return sum
}

// ── 진화 단계 (10 §2.2.1) ──
export const STAGES = [
  { stage: 1, from: 1, name: '아기' },
  { stage: 2, from: 3, name: '꼬마' },
  { stage: 3, from: 6, name: '친구' },
  { stage: 4, from: 10, name: '단짝' },
  { stage: 5, from: 15, name: '전설' }
] as const
export const stageOf = (level: number) => [...STAGES].reverse().find((s) => level >= s.from)!.stage
/** 다음 단계까지 남은 레벨(마지막 단계면 null) */
export function levelsToNextStage(level: number): number | null {
  const next = STAGES.find((s) => s.from > level)
  return next ? next.from - level : null
}

// ── 주간 목표 XP (10 §4.2) ──
/** 이번 주에 이룬 순서대로, 앞의 3개만 XP를 준다 */
export const kpiEarnsXp = (achievedIndexInWeek: number) => achievedIndexInWeek < XP.kpiXpLimit

// ── 성향 조사 (10 §2.2) ──
export type Axis = 'plan' | 'focus'
export type Pick2 = 'A' | 'B'
export type Species = 'turtle' | 'squirrel' | 'cat' | 'otter'
export const QUESTIONS: { id: string; axis: Axis; tiebreak?: boolean; text: string; a: string; b: string }[] = [
  { id: 'q1', axis: 'plan', text: '월요일 아침, 이번 주 할 일은?', a: '미리 다 적어 둔다', b: '그날그날 떠오르는 대로' },
  { id: 'q2', axis: 'focus', text: '보고서를 쓰다 메시지가 오면?', a: '다 쓰고 나서 확인한다', b: '바로 답하고 돌아온다' },
  { id: 'q3', axis: 'plan', text: '여행을 간다면?', a: '시간표처럼 일정을 짠다', b: '숙소만 정하고 가서 정한다' },
  { id: 'q4', axis: 'focus', text: '일이 제일 잘되는 순간은?', a: '알림을 끄고 한 가지만 할 때', b: '창을 여러 개 켜 두고 오갈 때' },
  { id: 'q5', axis: 'plan', text: '마감이 2주 남은 과제는?', a: '오늘부터 조금씩 나눠 한다', b: '감이 올 때 몰아서 한다' },
  { id: 'q6', axis: 'focus', text: '할 일 목록에 10개가 있으면?', a: '가장 중요한 하나부터 끝낸다', b: '금방 끝나는 것부터 여러 개 지운다' },
  { id: 'q7', axis: 'plan', text: '하루를 마칠 때 나는?', a: '내일 할 일을 적어 두고 잔다', b: '내일 일은 내일 생각한다' },
  { id: 'q8', axis: 'focus', text: '새 취미가 생기면?', a: '하나를 깊게 파고든다', b: '이것저것 조금씩 해 본다' },
  { id: 't-plan', axis: 'plan', tiebreak: true, text: '갑자기 한가한 오후가 생기면?', a: '미뤄 둔 할 일 목록을 연다', b: '그때 끌리는 걸 한다' },
  { id: 't-focus', axis: 'focus', tiebreak: true, text: '3시간이 주어지면?', a: '한 가지 일에 3시간', b: '세 가지 일을 1시간씩' }
]

/** A = 계획형/몰입형 쪽. 축마다 A 비율(0~1)과 동점 여부 */
export function scoreSurvey(answers: Record<string, Pick2>) {
  const axis = (ax: Axis) => {
    const main = QUESTIONS.filter((q) => q.axis === ax && !q.tiebreak)
    const a = main.filter((q) => answers[q.id] === 'A').length
    const tie = a * 2 === main.length
    const tb = QUESTIONS.find((q) => q.axis === ax && q.tiebreak)!
    const leanA = tie ? (answers[tb.id] ? answers[tb.id] === 'A' : null) : a * 2 > main.length
    return { ratioA: a / main.length, tie, leanA }
  }
  return { plan: axis('plan'), focus: axis('focus') }
}

/** 동점 문항까지 답했으면 유형·캐릭터를 정한다. 아직 동점이 남았으면 null */
export function speciesFrom(score: ReturnType<typeof scoreSurvey>): Species | null {
  const { plan, focus } = score
  if (plan.leanA === null || focus.leanA === null) return null
  if (plan.leanA) return focus.leanA ? 'turtle' : 'squirrel'
  return focus.leanA ? 'cat' : 'otter'
}

export const SPECIES: Record<Species, { name: string; type: string; line: string }> = {
  turtle: { name: '꾸준한 거북이', type: '계획·몰입', line: '정한 일을 끝까지 차근차근' },
  squirrel: { name: '차곡차곡 다람쥐', type: '계획·멀티', line: '여러 일을 빠짐없이 챙겨요' },
  cat: { name: '몰두하는 고양이', type: '즉흥·몰입', line: '꽂히면 깊게 빠져요' },
  otter: { name: '재주 많은 수달', type: '즉흥·멀티', line: '아이디어가 많고 빨라요' }
}

// ── 주간 마감 · AI 주간 리포트 · KPI 초안 (10 §4.3, §5) ──
// 숫자는 앱이 계산하고(결정적), AI는 문장·초안만 쓴다. 서버 프록시도 같은 검사를 쓸 수 있게 여기 둔다.

/** 'YYYY-MM-DD' + n일 (UTC 계산이라 시간대와 무관) */
const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const minutesOf = (a: string, b: string) => Math.round((Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60000)

/** 마감에 쓰는 완료 할 일 — day는 완료한 로컬 날짜 */
export type WeekTask = { title: string; list: string | null; tags: string[]; day: string; start_at?: string | null; due_at?: string | null }
export type WeekGoal = { id: string; title: string; target: number; progress: number; status: string }
export type WeeklyStats = {
  v: 1
  week_start: string
  completed: number
  perDay: number[] // 일~토
  topTags: { name: string; count: number }[]
  topLists: { name: string; count: number }[]
  scheduledMinutes: number
  goals: { id: string; title: string; target: number; progress: number; achieved: boolean }[]
  goalsAchieved: number
  xp: { total: number; task: number; kpi: number }
}

const top3 = (names: string[]) => {
  const m = new Map<string, number>()
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1)
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3)
}

/** 한 주의 숫자(10 §5). 같은 입력이면 늘 같은 결과 */
export function weeklyStats(weekStart: string, tasks: WeekTask[], goals: WeekGoal[], xp: { kind: string; amount: number; day: string }[]): WeeklyStats {
  const days = Array.from({ length: 7 }, (_, i) => plusDays(weekStart, i))
  const inWeek = <T extends { day: string }>(rows: T[]) => rows.filter((r) => days.includes(r.day))
  const done = inWeek(tasks)
  const ev = inWeek(xp)
  const sum = (rows: { amount: number }[]) => rows.reduce((s, e) => s + e.amount, 0)
  const scheduledMinutes = done.reduce((s, t) => {
    if (!t.start_at?.includes('T') || !t.due_at?.includes('T')) return s
    const m = minutesOf(t.start_at, t.due_at)
    return m > 0 ? s + Math.min(m, 24 * 60) : s
  }, 0)
  const g = goals.map((x) => ({ id: x.id, title: x.title, target: x.target, progress: x.progress, achieved: x.status === 'achieved' }))
  return {
    v: 1,
    week_start: weekStart,
    completed: done.length,
    perDay: days.map((d) => done.filter((t) => t.day === d).length),
    topTags: top3(done.flatMap((t) => t.tags)),
    topLists: top3(done.flatMap((t) => (t.list ? [t.list] : []))),
    scheduledMinutes,
    goals: g,
    goalsAchieved: g.filter((x) => x.achieved).length,
    xp: { total: sum(ev), task: sum(ev.filter((e) => e.kind.startsWith('task'))), kpi: sum(ev.filter((e) => !e.kind.startsWith('task'))) }
  }
}
/** 마감할 거리가 있는 주인가(빈 주는 리포트를 만들지 않는다) */
export const weekHasActivity = (s: WeeklyStats) => s.completed > 0 || s.goals.length > 0 || s.xp.total !== 0

/** "10월 첫째 주" — 그 주 수요일의 달·주차 */
export function weekLabel(weekStart: string) {
  const mid = plusDays(weekStart, 3)
  const nth = Math.ceil(Number(mid.slice(8, 10)) / 7)
  return `${Number(mid.slice(5, 7))}월 ${['첫째', '둘째', '셋째', '넷째', '다섯째'][nth - 1]} 주`
}

// ── AI 답 검사 (shared/assistant parseIntent와 같은 방식: JSON 형식을 강제하고, 받은 뒤 다시 검사) ──
export type ReportText = { done: string; goals: string; next: string[] }
export type GoalDraft = { title: string; target: number }
export const REPORT_FORMAT = {
  type: 'object',
  properties: {
    done: { type: 'string', description: '이번 주 해낸 것 1~2문장' },
    goals: { type: 'string', description: '목표 결과 1문장' },
    next: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: '다음 주 목표 제안 2~3개, 짧게' }
  },
  required: ['done', 'goals', 'next'],
  additionalProperties: false
}
export const DRAFT_FORMAT = {
  type: 'object',
  properties: {
    goals: {
      type: 'array', minItems: 2, maxItems: 3,
      items: { type: 'object', properties: { title: { type: 'string' }, target: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['title', 'target'], additionalProperties: false }
    }
  },
  required: ['goals'],
  additionalProperties: false
}
const BAD = 'AI 응답 형식을 확인할 수 없어요.'
const parseJson = (raw: string): Record<string, unknown> => {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')
  let data: unknown
  try { data = JSON.parse(cleaned) } catch { throw new Error(BAD) }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(BAD)
  return data as Record<string, unknown>
}
const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, max)

/** 리포트 문장 검사: 빈 문장·형식 오류면 throw, 길면 자른다 */
export function parseReportText(raw: string): ReportText {
  const d = parseJson(raw)
  const done = line(d.done, 300)
  const goals = line(d.goals, 300)
  const next = Array.isArray(d.next) ? [...new Set(d.next.map((x) => line(x, 60)).filter(Boolean))].slice(0, 3) : []
  if (!done || !goals || !next.length) throw new Error(BAD)
  return { done, goals, next }
}

/** 초안 검사: 제목 1~40자, 횟수 1~10, 이미 있는 목표·서로 겹치는 것은 뺀다. 남는 게 없으면 throw */
export function parseGoalDraft(raw: string, existing: string[] = []): GoalDraft[] {
  const d = parseJson(raw)
  if (!Array.isArray(d.goals)) throw new Error(BAD)
  const key = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const seen = new Set(existing.map(key))
  const out: GoalDraft[] = []
  for (const g of d.goals as unknown[]) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    let title = line(o.title, 40)
    if (!title) continue
    const counted = title.match(/(\d{1,2})\s*(번|회)$/)
    let target = Number.isInteger(o.target) ? Math.max(1, Math.min(10, o.target as number)) : 1
    if (counted) target = Math.max(1, Math.min(10, Number(counted[1])))
    // 횟수 목표는 제목 끝에 "N번"을 붙여 둔다(직접 적을 때와 같은 규칙, 10 §4.1)
    else if (target > 1) title = `${title} ${target}번`
    if (seen.has(key(title))) continue
    seen.add(key(title))
    out.push({ title, target })
    if (out.length === 3) break
  }
  if (!out.length) throw new Error(BAD)
  return out
}

// ── 주 2회 AI 한도(리포트 1 · 초안 1) — 서버가 강제하고, 기기도 그 주 리포트 행의 text_json에 시도를 적어 다시 부르지 않는다 ──
export type ReportTextJson = {
  report?: ReportText
  reportTried?: boolean
  draft?: GoalDraft[]
  draftTried?: boolean
  draftWeek?: string
  dismissed?: string[]
}
export function readTextJson(raw: string | null | undefined): ReportTextJson {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}
/** 이번 마감에서 아직 부를 수 있는 AI */
export const aiLeft = (t: ReportTextJson) => ({ report: !t.reportTried, draft: !t.draftTried })
