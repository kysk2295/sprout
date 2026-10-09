// 23 모바일 성장 — 화면이 쓰는 계산(순수 함수, 시험: logic.test.ts).
// 대부분은 데스크톱 apps/desktop/src/renderer/src/data/growth.ts(10 §3.2 v3 무대 계산)와
// components/growth/{Interactive,GrowthBits,SurveyDialog}.tsx에서 옮겨 왔다(같은 규칙·같은 문장).
// TODO(공용화): DECOR·stageLines·greetingLine·catchUpOf·levelOfTotal·streakOf·gainedSince·SURVEY_DESC·surveyQueue·typeCodeOf
//   는 두 앱이 똑같이 쓰므로 packages/schema/src/growth.ts로 옮긴다(이 작업은 packages/를 고치지 않는 범위라 여기 둔다).
import { addDays } from '@sprout/schema/time'
import {
  cumulativeXp, levelsToNextStage, QUESTIONS, readTextJson, scoreSurvey, SPECIES, STAGES, stageOf, XP, xpToNext,
  type GoalDraft, type Pick2, type Species, type WeeklyStats
} from '@sprout/schema/growth'

export type XpRow = { id: string; kind: string; amount: number; ref_id: string; day: string; created_at: string }
export type GoalRow = { id: string; week_start: string; title: string; target: number; progress: number; status: string; source: string; achieved_at: string | null; sort_order: number }
export type ReportRow = { id: string; week_start: string; stats_json: string; text_json: string | null; xp_total: number; seen_at: string | null }
export type CharacterRow = { id: string; name: string | null; species: Species | null; type_code: string | null; assessed_at: string | null }

// ── 주(월요일 시작 — 2026-10-05 사용자 결정, 데스크톱 lib/calendar weekStart와 같음) ──
const dow = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
export const weekStartOf = (day: string) => addDays(day, -((dow(day) + 6) % 7))
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`
/** "10월 5일 – 11일"(달이 바뀌면 "9월 28일 – 10월 4일") */
export function weekRange(weekStart: string): string {
  const end = addDays(weekStart, 6)
  return `${md(weekStart)} – ${end.slice(5, 7) === weekStart.slice(5, 7) ? `${Number(end.slice(8, 10))}일` : md(end)}`
}
export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
export const weekdayOf = (day: string) => WEEKDAY_KO[dow(day)]

// ── 한국어 조사 ──
const hasBatchim = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  if (c >= 0 && c < 11172) return c % 28 !== 0
  return /[0136-8LMNRlmnr]$/.test(w) // 숫자·영문 끝소리 대략
}
export const iGa = (w: string) => w + (hasBatchim(w) ? '이' : '가')
export const eulReul = (w: string) => w + (hasBatchim(w) ? '을' : '를')
/** 으로/로(ㄹ 받침은 '로') */
export const ro = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  const jong = c >= 0 && c < 11172 ? c % 28 : hasBatchim(w) ? 1 : 0
  return w + (jong && jong !== 8 ? '으로' : '로')
}

// ── 10 §3.2.7 레벨로 열리는 장식(자리는 고정, 기기에만 저장) ──
export const DECOR = [
  { id: 'sign', lv: 1, name: '이름 팻말' }, { id: 'flowers', lv: 2, name: '꽃 화분' }, { id: 'fence', lv: 3, name: '나무 울타리' },
  { id: 'lamp', lv: 4, name: '버섯 등' }, { id: 'butterfly', lv: 5, name: '나비' }, { id: 'ball', lv: 6, name: '공' },
  { id: 'bunting', lv: 8, name: '깃발 줄' }, { id: 'tent', lv: 10, name: '작은 텐트' }, { id: 'fireflies', lv: 12, name: '반딧불' }, { id: 'arch', lv: 15, name: '꽃 아치' }
] as const
export type DecorId = (typeof DECOR)[number]['id']
export const newlyUnlocked = (prev: number, now: number) => DECOR.filter((d) => d.lv > prev && d.lv <= now)
export const nextDecor = (level: number) => DECOR.find((d) => d.lv > level)
/** 무대에 놓인 장식(열린 것 − 치운 것). 알(조사 전)이면 없음 */
export const placedDecor = (level: number, off: Set<string>, hasSpecies: boolean) =>
  new Set<string>(hasSpecies ? DECOR.filter((d) => d.lv <= level && !off.has(d.id)).map((d) => d.id) : [])

// ── 시간대 · 기분 (10 §3.2.2·§3.2.3) ──
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
/** 아침 6–11 · 낮 11–17 · 저녁 17–20 · 밤 20–6 */
export const timeOfDay = (h: number): TimeOfDay => (h < 6 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 20 ? 'evening' : 'night')
export const TOD_LABEL: Record<TimeOfDay, string> = { morning: '아침', day: '낮', evening: '저녁', night: '밤' }
/** 졸림: 밤 23–6시 또는 이틀 넘게 XP 없음 */
export const isSleepy = (h: number, idleDays: number) => h >= 23 || h < 6 || idleDays >= 2
export type Mood = 'default' | 'smile' | 'happy' | 'content' | 'eat' | 'sleepy' | 'think' | 'puzzled' // think·puzzled = 40 §6(AI 비서·상태 화면)
/** 얼굴: 졸림 > 배부름(오늘 할 일 XP 10/10) > 웃음(오늘 완료) > 보통 */
export const baseMoodOf = (s: { sleepy: boolean; todayTaskXp: number; todayDone: number }): Mood =>
  s.sleepy ? 'sleepy' : s.todayTaskXp >= XP.taskDailyCap ? 'content' : s.todayDone > 0 ? 'smile' : 'default'
/** 23 §2 ① 오른쪽 위 알약의 기분 글자(23 §4: 오늘 XP 있음 = 기쁨, 이틀 넘게 없음 = 졸림, 그 밖 보통) */
export const moodLabel = (m: Mood) => (m === 'sleepy' ? '졸려요' : m === 'content' ? '배불러요' : m === 'default' ? '평온해요' : '기분 좋아요')

// ── 원장에서 뽑는 숫자 ──
/** 그날 할 일로 받은 XP(되돌림 반영) — 밥그릇 칸 수 */
export const taskXpOfDay = (events: Pick<XpRow, 'kind' | 'amount' | 'day'>[], day: string) =>
  events.filter((e) => e.day === day && (e.kind === 'task' || e.kind === 'task_revoke')).reduce((s, e) => s + e.amount, 0)
/** 밥그릇(10 §3.2.2): 10칸, 가득이면 배부름 + 누르면 하는 말 */
export function bowlOf(todayTaskXp: number) {
  const filled = Math.max(0, Math.min(XP.taskDailyCap, todayTaskXp))
  const full = filled >= XP.taskDailyCap
  return {
    filled, full, cap: XP.taskDailyCap,
    line: full ? '오늘은 배불러! 남은 건 내일 먹을게' : `오늘 할 일로 ${filled} XP 먹었어. ${XP.taskDailyCap - filled} 더 먹을 수 있어`
  }
}
/** 연속 일수: 오늘(없으면 어제)부터 거꾸로 할 일 XP가 있는 날이 이어진 수 */
export function streakOf(events: Pick<XpRow, 'kind' | 'amount' | 'day'>[], today: string): number {
  const days = new Set(events.filter((e) => e.kind === 'task' && e.amount > 0).map((e) => e.day))
  let d = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(d)) { n++; d = addDays(d, -1) }
  return n
}
/** 마지막으로 +XP를 받은 날부터 오늘까지 며칠(없으면 0 — 처음 쓰는 사람은 졸지 않는다) */
export function idleDaysOf(events: Pick<XpRow, 'amount' | 'day'>[], today: string): number {
  const last = events.filter((e) => e.amount > 0).map((e) => e.day).sort().pop()
  if (!last) return 0
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86400000)
}
/** 누적 XP → 그 레벨 안의 진행(방울이 닿을 때마다 막대를 채우는 표시용) */
export function levelOfTotal(total: number) {
  let level = 1
  let rest = Math.max(0, total)
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++ }
  return { level, into: rest, toNext: xpToNext(level) }
}
/** 23 §2 ② "친구까지 2레벨"(마지막 단계면 null) */
export function nextStageHint(level: number): string | null {
  const n = levelsToNextStage(level)
  if (n === null) return null
  const next = STAGES.find((s) => s.from > level)!
  return `${next.name}까지 ${n}레벨`
}
export const stageName = (stage: number) => STAGES.find((s) => s.stage === stage)!.name

// ── 말풍선 (10 §3.2.4 — 실제 숫자로 채운다, 우선순위 순) ──
export type StageStats = {
  todayDone: number; todayOpen: number; todayTaskXp: number; streak: number; idleDays: number
  level: number; into: number; toNext: number; diaryUnseen: boolean
  goals: { title: string; target: number; progress: number; achieved: boolean }[]
}
export function stageLines(s: StageStats): string[] {
  const out: string[] = []
  if (s.diaryUnseen) out.push('일기 썼어! 읽어 줄래?')
  if (s.todayDone >= 3) out.push(`오늘 ${s.todayDone}개나 했어, 최고야`)
  else if (s.todayDone > 0) out.push(`오늘 ${s.todayDone}개 했어!`)
  else if (s.todayOpen > 0) out.push(`오늘 할 일 ${s.todayOpen}개 있어. 하나만 같이 해 볼까?`)
  const left = s.goals.filter((g) => !g.achieved)
  if (s.goals.length && !left.length) out.push(`이번 주 목표 다 했다!${s.goals.length >= 2 ? ` 보너스 +${XP.kpiAll}` : ''}`)
  else if (left.length) {
    const near = left.filter((g) => g.target > 1).sort((a, b) => a.target - a.progress - (b.target - b.progress))[0]
    out.push(near ? `'${near.title}' ${near.target - near.progress}번 남았어!` : `이번 주 목표 ${left.length}개 남았어, 응원할게`)
  }
  const gap = s.toNext - s.into
  if (gap <= 10) out.push(`레벨업까지 ${gap} XP! 거의 다 왔어`)
  const nd = nextDecor(s.level)
  if (nd) out.push(`Lv ${nd.lv}${'이이가이가가이이이가'[nd.lv % 10]} 되면 ${iGa(nd.name)} 생겨`)
  if (s.streak >= 2) out.push(`${s.streak}일 연속이야!`)
  if (s.todayTaskXp >= XP.taskDailyCap) out.push('오늘은 배불러! 남은 건 내일 먹을게')
  out.push('네가 끝낸 일만큼 자라', '잠깐 쉬어도 괜찮아')
  return out
}
/** 하루 첫 인사 */
export function greetingLine(t: TimeOfDay, s: Pick<StageStats, 'todayDone' | 'todayOpen'>): string {
  if (t === 'morning') return s.todayOpen ? `좋은 아침! 오늘 할 일 ${s.todayOpen}개 있어` : '좋은 아침! 오늘도 같이 자라자'
  if (t === 'day') return s.todayDone ? `오늘 벌써 ${s.todayDone}개 했어!` : '안녕! 오늘 첫 할 일, 같이 해 볼까?'
  if (t === 'evening') return s.todayDone ? `오늘 ${s.todayDone}개 했네, 수고했어` : '오늘도 수고했어'
  return '늦었네… 오늘은 이만 쉬자'
}
export const EGG_LINES = ['톡톡… 누가 날 깨워 줄래?', '성향 조사를 하면 내가 깨어나!']
/** 처음(조사 후, XP 0) 말풍선 — 23 §3 */
export const firstLine = (name: string) => `할 일을 끝내면 ${iGa(name)} 자라요`
/** 바로 전 문장은 다시 안 고른다 */
export function pickLine(lines: string[], idx: number, last: string): { line: string; idx: number } {
  let i = idx
  let l = lines[i++ % lines.length]
  if (l === last && lines.length > 1) l = lines[i++ % lines.length]
  return { line: l, idx: i }
}

// ── 먹이(XP 방울, 10 §3.2.5) ──
/** 자리 비운 사이 받은 XP: since 뒤에 들어온 +XP 사건. since가 없으면(처음 쓰는 기기) 없음. 방울 최대 10개(넘으면 마지막에 모음) */
export function catchUpOf(events: Pick<XpRow, 'kind' | 'amount' | 'created_at'>[], since: string | null) {
  if (!since) return { tasks: 0, xp: 0, orbs: [] as number[] }
  const got = events.filter((e) => e.amount > 0 && e.created_at > since)
  const tasks = got.filter((e) => e.kind === 'task').length
  const xp = got.reduce((s, e) => s + e.amount, 0)
  const all = got.map((e) => e.amount)
  const orbs = all.length > 10 ? [...all.slice(0, 9), all.slice(9).reduce((a, b) => a + b, 0)] : all
  return { tasks, xp, orbs }
}
/** 성장 탭을 보는 중에 들어온 XP → 방울(할 일 +1은 1개씩, 10 넘게 한 번에 오면 큰 방울 하나) */
export const orbsOf = (amount: number) => (amount <= 0 ? [] : amount > 10 ? [amount] : Array.from({ length: amount }, () => 1))

// ── 레벨업 · 진화 (23 §4, 10 §2.4) — 본 레벨은 기기에 기억 ──
export type LevelChange =
  | { kind: 'baseline'; level: number }
  | { kind: 'none' }
  | { kind: 'levelup' | 'evolve'; prev: number; level: number; prevStage: number; stage: number }
/** seen = 이 기기에서 마지막으로 보여 준 레벨(없으면 처음 — 기준만 잡고 보여 주지 않는다). 레벨은 내려가지 않는다 */
export function levelChange(seen: number | null, level: number): LevelChange {
  if (!seen) return { kind: 'baseline', level }
  if (level <= seen) return { kind: 'none' }
  const prevStage = stageOf(seen)
  const stage = stageOf(level)
  return { kind: stage > prevStage ? 'evolve' : 'levelup', prev: seen, level, prevStage, stage }
}
/** "이번에 받은 XP 내역": since(지난번 레벨 화면을 본 때) 뒤 사건을 종류별 순합. since가 없으면 본 레벨이 시작된 뒤부터 */
export function gainedSince(events: Pick<XpRow, 'kind' | 'amount' | 'created_at'>[], seenLevel: number, since: string | null) {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  let rows: typeof sorted
  if (since) rows = sorted.filter((e) => e.created_at > since)
  else {
    const from = cumulativeXp(seenLevel)
    let total = 0
    let start = 0
    sorted.forEach((e, i) => { if (total < from) start = i + 1; total += e.amount })
    rows = sorted.slice(Math.max(0, start - 1))
  }
  const label = (k: string) => (k.startsWith('task') ? '할 일 완료' : k === 'kpi_all' ? '모두 달성 보너스' : k === 'review' ? '주간 점검' : k === 'tidy' ? '정리 보너스' : '목표 달성')
  const sums = new Map<string, number>()
  for (const e of rows) sums.set(label(e.kind), (sums.get(label(e.kind)) ?? 0) + e.amount)
  return [...sums].filter(([, n]) => n > 0).map(([l, n]) => ({ label: l, amount: n }))
}
/** 진화 문구(B4): "아기 다람쥐가 꼬마로 자랐어요" · "떡잎이 한 장 더 났어요. 다음 모습은 Lv 6!" */
export function evolveText(species: Species | null, prevStage: number, stage: number, level: number) {
  const animal = species ? SPECIES[species].name.split(' ').pop()! : '알'
  const title = `${stageName(prevStage)} ${iGa(animal)} ${ro(stageName(stage))} 자랐어요`
  const sprout = ['', '', '떡잎이 한 장 더 났어요.', '새싹에 잎이 셋이 됐어요.', '머리에 작은 나무가 자랐어요.', '나무에 꽃이 피었어요.'][stage] ?? ''
  const next = STAGES.find((s) => s.from > level)
  return { title, sub: `${sprout}${next ? ` 다음 모습은 Lv ${next.from}!` : ' 이제 전설이에요!'}`.trim() }
}

// ── 이번 주 XP 카드(23 §2 ⑥) ──
/** 7일 막대(월~일): 그날 XP 순합(음수는 0) */
export function weekBars(events: Pick<XpRow, 'amount' | 'day'>[], weekStart: string, today: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const totals = days.map((d) => Math.max(0, events.filter((e) => e.day === d).reduce((s, e) => s + e.amount, 0)))
  const max = Math.max(10, ...totals)
  return days.map((d, i) => ({ day: d, label: weekdayOf(d), xp: totals[i], ratio: totals[i] / max, today: d === today, future: d > today }))
}
export function xpLabel(e: Pick<XpRow, 'kind' | 'amount'>, title: string | undefined): string {
  const of = (what: string) => (title ? `${what} · ${title}` : what)
  if (e.kind === 'task') return of('할 일 완료')
  if (e.kind === 'task_revoke') return of('완료 취소')
  if (e.kind === 'kpi') return of('목표 달성')
  if (e.kind === 'kpi_revoke') return of('목표 취소')
  if (e.kind === 'review') return '주간 점검 완료'
  if (e.kind === 'tidy') return '정리 보너스'
  return e.amount > 0 ? '이번 주 목표 모두 달성' : '모두 달성 취소'
}
/** 날짜 묶음(오늘·어제·요일), 최근 날부터. 상한 날은 머리 문구 */
export function xpDayGroups(events: XpRow[], weekStart: string, today: string) {
  const mine = events.filter((e) => e.day >= weekStart && e.day <= addDays(weekStart, 6))
  const days = [...new Set(mine.map((e) => e.day))].sort().reverse()
  return days.map((d) => {
    const items = mine.filter((e) => e.day === d).sort((a, b) => b.created_at.localeCompare(a.created_at))
    const taskXp = taskXpOfDay(items, d)
    const capped = taskXp >= XP.taskDailyCap
    return {
      day: d,
      label: d === today ? '오늘' : d === addDays(today, -1) ? '어제' : `${weekdayOf(d)}요일`,
      note: capped ? `${d === today ? '오늘 ' : ''}할 일 XP 다 받았어요(${XP.taskDailyCap}/${XP.taskDailyCap})` : '',
      total: items.reduce((s, e) => s + e.amount, 0),
      items
    }
  })
}
export const weekTotal = (events: Pick<XpRow, 'amount' | 'day'>[], weekStart: string) =>
  events.filter((e) => e.day >= weekStart && e.day <= addDays(weekStart, 6)).reduce((s, e) => s + e.amount, 0)
export const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`

// ── 목표(23 §2 ⑤, 10 §4) ──
/** 오른쪽 표시: 달성 + XP 받음 = "+30", 달성인데 XP 없음·3개 넘음 = 둘째 줄 "XP는 3개까지" */
export function goalBadge(g: Pick<GoalRow, 'id' | 'status'>, xpIds: Set<string>) {
  const achieved = g.status === 'achieved'
  const slotsLeft = xpIds.size < XP.kpiXpLimit
  if (achieved) return xpIds.has(g.id) ? { reward: `+${XP.kpi}`, note: '' } : { reward: '', note: `XP는 ${XP.kpiXpLimit}개까지` }
  return { reward: '', note: slotsLeft ? '' : `XP는 ${XP.kpiXpLimit}개까지` }
}
/** 횟수 점을 눌렀을 때 맞출 수: 이미 그 점까지 찼으면 하나 뺀다(데스크톱과 같음) */
export const dotTarget = (progress: number, k: number) => (k + 1 === progress ? k : k + 1)
/** 체크를 눌렀을 때: 달성이면 풀기(횟수 목표는 하나 아래로), 아니면 목표 수로 */
export const checkTarget = (g: Pick<GoalRow, 'status' | 'target'>) => (g.status === 'achieved' ? (g.target > 1 ? g.target - 1 : 0) : g.target)
const titleKey = (t: string) => t.replace(/\s+/g, '').toLowerCase()
/** AI 초안 줄(10 §4.3): 지난주 리포트 text_json.draft 중 이번 주 것, 숨긴 것·이미 있는 목표 빼고. 5개가 차면 없음 */
export function visibleDrafts(textJson: string | null | undefined, week: string, goals: Pick<GoalRow, 'title'>[]): GoalDraft[] {
  if (goals.length >= XP.goalsPerWeek) return []
  const t = readTextJson(textJson)
  if (t.draftWeek !== week) return []
  const dismissed = t.dismissed ?? []
  return (t.draft ?? []).filter((d) => !dismissed.includes(d.title) && !goals.some((g) => titleKey(g.title) === titleKey(d.title)))
}
export const sameTitle = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '')

// ── 주간 리포트(23 §2.1, 10 §5) ──
export const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`)
export function parseStats(raw: string): WeeklyStats | null {
  try { return JSON.parse(raw) as WeeklyStats } catch { return null }
}
/** 리포트 한마디: AI 문장 '해낸 것'의 첫 문장, 없으면 숫자 요약 */
export function reportHeadline(textJson: string | null | undefined, stats: Pick<WeeklyStats, 'completed'>): string {
  const done = readTextJson(textJson).report?.done
  if (done) {
    const m = done.match(/^.*?[.!?…](?=\s|$)/)
    return (m ? m[0] : done).trim()
  }
  return `이번 주 ${stats.completed}개를 끝냈어!`
}
/** "많이 한 태그 #운동 4 · 리스트 업무 6" */
export function reportLead(stats: Pick<WeeklyStats, 'topTags' | 'topLists'>): string {
  const parts: string[] = []
  if (stats.topTags.length) parts.push(`많이 한 태그 ${stats.topTags.map((t) => `#${t.name} ${t.count}`).join(' ')}`)
  if (stats.topLists.length) parts.push(`리스트 ${stats.topLists.map((l) => `${l.name} ${l.count}`).join(' ')}`)
  return parts.join(' · ')
}
/** 주마다 한 행(두 기기가 따로 만든 경우 첫 행) */
export const uniqueWeeks = (rows: ReportRow[]) => rows.filter((r, i) => rows.findIndex((x) => x.week_start === r.week_start) === i)

// ── 성향 조사(10 §2.2, 데스크톱 SurveyDialog와 같은 흐름) ──
export const MAIN_QUESTIONS = QUESTIONS.filter((q) => !q.tiebreak)
export const SURVEY_DESC: Record<Species, string[]> = {
  snail: ['정한 일을 끝까지 해내는 힘이 있어요.', '큰 일도 차근차근 나누면 반드시 끝내요.', '꿈틀이 큰 목표를 작은 단계로 나눠 드릴게요.'],
  bee: ['여러 일을 빠짐없이 챙기는 정리왕이에요.', '목록이 깔끔할수록 마음이 편해요.', '꿈틀이 리스트마다 균형 있게 목표를 제안할게요.'],
  worm: ['꽂힌 일에는 누구보다 깊이 빠져들어요.', '흐름을 탈 때 가장 큰 성과를 내요.', '꿈틀이 몰입한 시간을 성장으로 바꿔 드릴게요.'],
  frog: ['아이디어가 많고 손이 빨라요.', '작은 완료를 자주 쌓을 때 신나요.', '꿈틀이 작은 성공을 자주 모을 수 있게 도울게요.']
}
/** 8문항 뒤 동점인 축이 있으면 그 축의 동점 문항을 더 묻는다 */
export function surveyQueue(answers: Record<string, Pick2>) {
  const score = scoreSurvey(answers)
  const done = MAIN_QUESTIONS.every((q) => answers[q.id])
  const extra = done ? QUESTIONS.filter((q) => q.tiebreak && score[q.axis].tie) : []
  return [...MAIN_QUESTIONS, ...extra]
}
export const typeCodeOf = (score: ReturnType<typeof scoreSurvey>) => `${score.plan.leanA ? 'plan' : 'flow'}-${score.focus.leanA ? 'deep' : 'multi'}`
/** 이름 칸 기본값: 다시 조사면 지어 둔 이름, 아니면 종 이름 끝말("다람쥐") */
export const defaultName = (species: Species, current?: string | null) => current?.trim() || (SPECIES[species].name.split(' ').pop() ?? '')
/** 축 막대: A쪽 비율과 굵게 할 쪽(동점은 동점 문항으로 정한 쪽) */
export function axisView(ax: { ratioA: number; leanA: boolean | null }) {
  const pct = Math.round(ax.ratioA * 100)
  return { pctA: pct, pctB: 100 - pct, strongA: ax.leanA ?? pct >= 50 }
}
