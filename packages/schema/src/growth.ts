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
