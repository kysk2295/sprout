// 32 푸시 알림 — 휴대폰·데스크톱·서버가 같이 쓰는 순수 함수: 알림 설정(user_prefs.notify_json), 알림 id, 문구.
// 문구는 명세 32 §4.4·§5·§7.2·§8 그대로. AI가 쓴 글은 어떤 문구에도 넣지 않는다(숫자·정해진 문구·캐릭터 이름만).
import { datePart, formatTimeKo, hasTime, timePart, dayKeyIn } from './time.ts'

// ── 설정: user_prefs.notify_json (32 §9.2) — 없거나 깨진 칸은 기본값 ──
export type NotifyPrefs = {
  reminders: boolean
  hideTitles: boolean
  daily: { on: boolean; time: string; skipWeekends: boolean }
  growth: { evolve: boolean; report: boolean; goalDue: boolean; inboxCleanup: boolean }
  /** 알림 `다시 알림` 버튼이 미루는 분(32 §4.4 — 틱틱 설정 › Sounds & Notifications의 다시 알림 시간, research 30 §6) */
  snoozeMinutes: number
}
/** 다시 알림 시간 고르기 = 틱틱 앱 안 다시 알림 시트의 시간 칸(research 24 §11: 15분·30분·1시간·3시간). 기본 15분 [추정 — 시트 첫 칸, 공식 기본값 미확인] */
export const SNOOZE_MINUTES = [15, 30, 60, 180] as const
export const DEFAULT_SNOOZE_MINUTES = 15
export const snoozeLabel = (m: number) => (m % 60 === 0 ? `${m / 60}시간` : `${m}분`)
export const DEFAULT_NOTIFY: NotifyPrefs = {
  reminders: true,
  hideTitles: false,
  daily: { on: false, time: '08:00', skipWeekends: false },
  growth: { evolve: true, report: true, goalDue: true, inboxCleanup: false },
  snoozeMinutes: DEFAULT_SNOOZE_MINUTES
}
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
export function parseNotifyPrefs(raw: string | null | undefined): NotifyPrefs {
  let v: any = {}
  if (raw) try { v = JSON.parse(raw) } catch { v = {} }
  if (!v || typeof v !== 'object' || Array.isArray(v)) v = {}
  const d = v.daily && typeof v.daily === 'object' ? v.daily : {}
  const g = v.growth && typeof v.growth === 'object' ? v.growth : {}
  return {
    reminders: bool(v.reminders, DEFAULT_NOTIFY.reminders),
    hideTitles: bool(v.hideTitles, DEFAULT_NOTIFY.hideTitles),
    daily: { on: bool(d.on, false), time: typeof d.time === 'string' && TIME_RE.test(d.time) ? d.time : '08:00', skipWeekends: bool(d.skipWeekends, false) },
    growth: { evolve: bool(g.evolve, true), report: bool(g.report, true), goalDue: bool(g.goalDue, true), inboxCleanup: bool(g.inboxCleanup, false) },
    snoozeMinutes: (SNOOZE_MINUTES as readonly number[]).includes(v.snoozeMinutes) ? v.snoozeMinutes : DEFAULT_SNOOZE_MINUTES
  }
}

// ── 알림 id·채널·카테고리 (로컬 알림과 같다 — apps/mobile/src/notifications/plan.ts) ──
export const reminderKey = (rid: string, at: number) => `r:${rid}@${at}`
export const CHANNELS = { tasks: 'tasks', daily: 'daily', growth: 'growth' } as const
export const TASK_CATEGORY = 'sprout-task'
/** 기기가 열 수 있는 알림 종류(device_tokens.caps). 서버는 caps에 없는 종류를 보내지 않는다 */
export const PUSH_CAPS = ['reminder', 'daily', 'sync', 'growth', 'inbox-cleanup'] as const
export type PushCap = (typeof PUSH_CAPS)[number]

// ── 한국어 조사: 받침으로 고른다 ──
type JosaPair = '이/가' | '은/는' | '을/를' | '과/와' | '으로/로' | '아/야'
/** josa('거북이', '이/가') → '거북이가', josa('단짝', '으로/로') → '단짝으로'. 한글이 아니면 숫자·영문 끝소리를 어림한다 */
export function josa(word: string, pair: JosaPair): string {
  const [withB, withoutB] = pair.split('/')
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  let batchim: number | null = null // 0 = 받침 없음, 8 = ㄹ
  if (code >= 0xac00 && code <= 0xd7a3) batchim = (code - 0xac00) % 28
  else if (/[0-9]/.test(last)) batchim = { '0': 21, '1': 8, '3': 16, '6': 1, '7': 8, '8': 8 }[last] ?? 0 // 영·일·삼·육·칠·팔
  else if (/[a-z]/i.test(last)) batchim = /[lmnr]/i.test(last) ? (/[lr]/i.test(last) ? 8 : 4) : 0
  else batchim = 0
  if (pair === '으로/로') return word + (batchim === 0 || batchim === 8 ? withoutB : withB)
  return word + (batchim === 0 ? withoutB : withB)
}

// ── 할 일 알림 본문 (32 §4.4, plan.ts bodyOf와 같은 문구) ──
const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone
export type ReminderBodyRow = { start_at: string | null; due_at: string | null; list_name: string | null; list_kind: string | null }
/** "오늘 오후 3:00 · 업무" — 날짜는 알림이 울리는 날(그 시간대) 기준. withList=false면 리스트 이름을 뺀다(제목 숨기기) */
export function reminderBody(row: ReminderBodyRow, fireAt: number, timeZone = localTz(), withList = true): string {
  const start = row.start_at ?? row.due_at
  if (!start) return ''
  const day = datePart(start)
  const fireDay = dayKeyIn(fireAt, timeZone)
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${fireDay}T00:00:00Z`)) / 86400000)
  const head = diff === 0 ? '오늘' : diff === 1 ? '내일' : `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`
  const time = hasTime(start) ? ` ${formatTimeKo(timePart(start)!)}` : ''
  const list = row.list_kind === 'inbox' ? '기본함' : row.list_name
  return `${head}${time}${withList && list ? ` · ${list}` : ''}`
}
export const HIDDEN_REMINDER_TITLE = '할 일 알림'
export const UNTITLED = '제목 없음'
/** 페이로드 크기(4KB) 안: 제목은 100자에서 자른다 */
export const clip = (s: string, n = 100) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// ── 하루 요약 (32 §5) ──
export type DailyTask = { title: string | null; status: number; start_at: string | null; due_at: string | null; priority: number | null; sort_order?: number | null }
/** 오늘(그 기기 날짜)에 걸친 할 일 = 시작(없으면 마감)이 오늘 이전·마감이 오늘 이후. 만료 = 미완료이고 마감이 오늘 전 */
export function dailySummary(tasks: DailyTask[], today: string, hideTitles: boolean): { title: string; body: string } | null {
  const s = (t: DailyTask) => datePart(t.start_at ?? t.due_at ?? '')
  const e = (t: DailyTask) => datePart(t.due_at ?? '')
  const todays = tasks.filter((t) => t.due_at && (t.status === 0 || t.status === 1) && s(t) <= today && e(t) >= today)
  const overdue = tasks.filter((t) => t.due_at && t.status === 0 && e(t) < today).length
  const open = todays.filter((t) => t.status === 0).sort(dailyOrder)
  const done = todays.length - open.length
  const late = overdue ? ` · 밀린 할 일 ${overdue}개` : ''
  if (todays.length) {
    const title = done ? `오늘 할 일 ${todays.length}개 중 ${done}개 완료` : `오늘 할 일 ${todays.length}개`
    if (hideTitles) return { title, body: `눌러서 오늘 목록 보기${late}` }
    const names = open.slice(0, 3).map((t) => clip(t.title?.trim() || UNTITLED, 40))
    const more = open.length - names.length
    const list = names.length ? `${names.join(' · ')}${more > 0 ? ` 외 ${more}개` : ''}` : '오늘 할 일을 모두 끝냈어요'
    return { title, body: `${list}${late}` }
  }
  if (overdue) return { title: `밀린 할 일 ${overdue}개가 있어요`, body: '오늘 정리해 볼까요?' }
  return null
}
/** 시각 있는 것 시각순 → 우선순위 높은 순 → 나머지(정렬값) */
function dailyOrder(a: DailyTask, b: DailyTask): number {
  const ta = hasTime(a.start_at ?? a.due_at) ? (a.start_at ?? a.due_at)! : null
  const tb = hasTime(b.start_at ?? b.due_at) ? (b.start_at ?? b.due_at)! : null
  if (ta && tb) return ta.localeCompare(tb)
  if (ta) return -1
  if (tb) return 1
  return (b.priority ?? 0) - (a.priority ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0)
}

// ── 성장·AI 소식 (32 §8) — 숫자·정해진 문구·캐릭터 이름만 ──
export type GrowthKind = 'growth_evolve' | 'weekly_report' | 'weekly_draft' | 'weekly_goal_due' | 'inbox_cleanup'
export type Notice = { kind: GrowthKind | 'daily' | 'test'; title: string; body: string; url?: string }
export const growthCopy = {
  evolve: (name: string, stageName: string): Notice => ({
    kind: 'growth_evolve', title: `${josa(name, '이/가')} ${josa(stageName, '으로/로')} 자랐어요!`, body: '할 일을 끝낸 덕분이에요. 새 모습을 보러 갈까요?', url: 'sprout://growth'
  }),
  report: (weekStart: string, completed: number, goals: number, achieved: number, drafts: number): Notice => ({
    kind: 'weekly_report',
    title: '지난주 리포트가 도착했어요',
    body: [`할 일 ${completed}개 완료`, goals ? `목표 ${goals}개 중 ${achieved}개 달성` : null, drafts ? `이번 주 목표 초안 ${drafts}개` : null].filter(Boolean).join(' · '),
    url: `sprout://growth?report=${weekStart}`
  }),
  draft: (name: string, drafts: number): Notice => ({
    kind: 'weekly_draft', title: '이번 주 목표 초안이 준비됐어요', body: `${josa(name, '이/가')} 목표 ${drafts}개를 제안했어요. 골라서 정해 볼까요?`, url: 'sprout://growth'
  }),
  goalDue: (left: number): Notice => ({
    kind: 'weekly_goal_due', title: `이번 주 목표가 ${left}개 남았어요`, body: '오늘 자정에 마감돼요. 하나만 더 해 볼까요?', url: 'sprout://growth'
  }),
  inboxCleanup: (count: number): Notice => ({
    kind: 'inbox_cleanup', title: `기본함에 할 일이 ${count}개 쌓였어요`, body: 'AI가 리스트로 나눠 드릴게요. 눌러서 정리를 시작해요.', url: 'sprout://lists/inbox?cleanup=1'
  })
}
export const TEST_NOTICE: Notice = { kind: 'test', title: 'sprout 알림이 잘 와요', body: '이 휴대폰에서 서버 알림을 받을 수 있어요' }
/** 기본함 정리 제안 기준(32 §8, 30 B.1 ①): 미완료 20개 초과 · 마지막 제안 7일 이상 */
export const INBOX_NUDGE = { over: 20, everyDays: 7 } as const
