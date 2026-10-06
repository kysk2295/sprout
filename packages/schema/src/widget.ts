// 위젯 저장 파일(snapshot.json schema 1) 공용 계약 + 월 캘린더 칸 만들기 — 25 맥 위젯 §8.3 · 36 모바일 위젯 §7.2.
// - 모양은 맥 위젯(apps/desktop/src/main/widgetSnapshot.ts)과 같다. 모바일이 `calendar`를 더한다(맥 위젯은 모르는 필드를 무시).
// - 순수 함수만(시험: widget.test.ts). DB 읽기는 앱 쪽(모바일 src/widgets/snapshot.ts).
// - Swift(plugins/widgets/ios/Snapshot.swift)·Kotlin(modules/sprout-widgets/android …/Snapshot.kt)이 같은 필드를 읽는다.
import { addDays, daysBetween, toDate } from './time.ts'
import { holidayMap } from './holidays.ts'

export const WIDGET_SCHEMA = 1
/** 위젯에 넘기는 오늘 할 일 최대 수(크게 13행 + 여유, 25 §8.3) */
export const WIDGET_MAX_TASKS = 20
/** 반영한 대기열 id를 기억하는 수 */
export const WIDGET_MAX_APPLIED = 50
/** 이보다 오래된 대기열 항목은 반영하지 않고 버린다(25 §8.5 [임시]) */
export const WIDGET_ACTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** 월 칸 하나에 넘기는 항목 최대 수(위젯이 높이에 맞춰 2~3개 보이고 나머지는 +N) */
export const WIDGET_CELL_ITEMS = 4
/** 월 위젯이 받는 달: 지난달 ~ 두 달 뒤(36 W3 [임시]) */
export const WIDGET_MONTH_OFFSETS = [-1, 0, 1, 2] as const
const TITLE_MAX = 40

export type WidgetTask = {
  id: string
  title: string
  priority: number
  depth: 0 | 1
  label: string | null
  labelTone: 'accent' | 'danger'
  overdueAt: string | null
  repeat: boolean
}
export type WidgetMood = 'default' | 'happy' | 'sleepy'
export type WidgetGrowth = {
  hasCharacter: boolean
  name: string | null
  species: string | null
  level: number
  stage: number
  stageName: string
  xpInto: number
  xpToNext: number
  todayTaskXp: number
  todayTaskXpCap: number
  mood: WidgetMood
  art: string
}

// ── 월 캘린더(36 §3.1) ──
export type WidgetCalItem = { id: string; kind: 'task' | 'event'; title: string; color: string | null; faded: boolean }
export type WidgetDayTone = 'sun' | 'sat' | 'holiday' | null
export type WidgetCalDay = {
  date: string
  n: number
  inMonth: boolean
  today: boolean
  tone: WidgetDayTone
  holiday: string | null
  /** 그날 전체 항목 수 — 위젯이 보이는 막대 수를 빼서 +N */
  total: number
  items: WidgetCalItem[]
}
export type WidgetMonth = { month: string; title: string; weeks: WidgetCalDay[][] }
export type WidgetCalendar = { weekStart: 0; weekHead: string[]; current: number; months: WidgetMonth[] }

export type WidgetSnapshot = {
  schema: 1
  generatedAt: string
  day?: string
  account: { signedIn: boolean }
  prefs?: { clock24h: boolean }
  theme?: { accentLight: string; accentDark: string }
  today?: { count: number; tasks: WidgetTask[] }
  growth?: WidgetGrowth
  calendar?: WidgetCalendar
  appliedActions?: string[]
}

/** 주 시작 = 일요일(2026-10-06 사용자 결정, 앱 캘린더와 같음). weekStart 0 = 일요일 */
export const WIDGET_WEEK_HEAD = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM' 달의 칸(일요일 시작, 그 달에 필요한 5줄 또는 6줄) — 모바일 캘린더 monthDays와 같은 규칙 */
export function widgetMonthDays(month: string): string[] {
  const first = `${month}-01`
  const from = addDays(first, -toDate(first).getDay())
  const last = addDays(shiftMonth(month, 1) + '-01', -1)
  const weeks = Math.ceil((daysBetween(from, last) + 1) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i))
}
/** 'YYYY-MM' + n달 */
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}`
}
/** 머리 글자: 올해면 "10월", 다른 해면 "2027년 1월"(앱 캘린더 monthTitle과 같다) */
export function widgetMonthTitle(month: string, today: string): string {
  const m = Number(month.slice(5, 7))
  return month.slice(0, 4) === today.slice(0, 4) ? `${m}월` : `${Number(month.slice(0, 4))}년 ${m}월`
}
/** 06 §16 색: 공휴일·일요일 빨강, 토요일 파랑(공휴일이 우선) */
export function widgetDayTone(date: string, holiday: string | null): WidgetDayTone {
  if (holiday) return 'holiday'
  const w = toDate(date).getDay()
  return w === 0 ? 'sun' : w === 6 ? 'sat' : null
}
const clip = (s: string) => (s.length > TITLE_MAX ? s.slice(0, TITLE_MAX) : s)

/**
 * 한 달 칸. dayItems(day)는 그날 항목을 **화면 순서대로**(앱 월 칸 itemsOnDay와 같은 순서) 돌려준다.
 * holidays = 휴일 표시가 켜져 있을 때만 넘긴다(꺼져 있으면 이름도 빨강도 없음 — 일요일 빨강·토요일 파랑은 그대로).
 */
export function buildWidgetMonth(input: {
  month: string
  today: string
  dayItems: (day: string) => WidgetCalItem[]
  holidays?: Map<string, string> | null
  maxItems?: number
}): WidgetMonth {
  const max = input.maxItems ?? WIDGET_CELL_ITEMS
  const days = widgetMonthDays(input.month)
  const cells = days.map((date): WidgetCalDay => {
    const all = input.dayItems(date)
    const holiday = input.holidays?.get(date) ?? null
    return {
      date,
      n: Number(date.slice(8)),
      inMonth: date.slice(0, 7) === input.month,
      today: date === input.today,
      tone: widgetDayTone(date, holiday),
      holiday,
      total: all.length,
      items: all.slice(0, max).map((it) => ({ ...it, title: clip(it.title || '제목 없음') }))
    }
  })
  const weeks: WidgetCalDay[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return { month: input.month, title: widgetMonthTitle(input.month, input.today), weeks }
}

/** 위젯이 받는 달 범위 전체의 첫날·끝날(쿼리 한 번으로 읽으려고) */
export function widgetCalendarRange(today: string, offsets: readonly number[] = WIDGET_MONTH_OFFSETS): { from: string; to: string; months: string[] } {
  const base = today.slice(0, 7)
  const months = offsets.map((n) => shiftMonth(base, n))
  const firstDays = widgetMonthDays(months[0])
  const lastDays = widgetMonthDays(months[months.length - 1])
  return { from: firstDays[0], to: lastDays[lastDays.length - 1], months }
}

export function buildWidgetCalendar(input: {
  today: string
  dayItems: (day: string) => WidgetCalItem[]
  showHolidays: boolean
  offsets?: readonly number[]
}): WidgetCalendar {
  const offsets = input.offsets ?? WIDGET_MONTH_OFFSETS
  const r = widgetCalendarRange(input.today, offsets)
  const holidays = input.showHolidays ? holidayMap(r.from, r.to) : null
  return {
    weekStart: 0,
    weekHead: WIDGET_WEEK_HEAD,
    current: Math.max(0, offsets.indexOf(0)),
    months: r.months.map((month) => buildWidgetMonth({ month, today: input.today, dayItems: input.dayItems, holidays }))
  }
}

// ── 테마 강조색(25 §5.2) — packages/tokens의 --color-accent ──
export const WIDGET_THEME_ACCENT: Record<string, string> = {
  default: '#4E75F2', sky: '#4E75F2', turquoise: '#117B58', teal: '#237973', matcha: '#55793D', sunshine: '#AB5C00',
  peach: '#C4286A', lilac: '#775DBE', ebony: '#87634A', navy: '#2B3455', gray: '#363B41', dark: '#545DFA', black: '#5A62FA'
}
const DARK_IDS = new Set(['dark', 'black'])
/** user_prefs.theme("<테마>" 또는 "<테마>|<다크일 때 테마>") → 밝게·어둡게 강조색 */
export function widgetAccents(stored: string | null | undefined): { accentLight: string; accentDark: string } {
  const [rawMain, rawDark] = (stored ?? '').split('|')
  const main = rawMain && rawMain in WIDGET_THEME_ACCENT ? rawMain : 'default'
  const dark = rawDark && DARK_IDS.has(rawDark) ? rawDark : 'dark'
  return { accentLight: DARK_IDS.has(main) ? WIDGET_THEME_ACCENT.default : WIDGET_THEME_ACCENT[main], accentDark: WIDGET_THEME_ACCENT[dark] }
}

/** 저장 칸 안 캐릭터 그림 경로(25 §8.4) — 조합마다 한 장 */
export const widgetArtPath = (species: string | null, stage: number, mood: WidgetMood) => (species ? `art/${species}-${stage}-${mood}@2x.png` : 'art/egg@2x.png')

/** "2026-10-04T09:12:03+09:00" — 로컬 시각 + 오프셋 */
export function isoLocal(d: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`
}
/** 내용 비교(generatedAt 빼고) — 바뀌었을 때만 위젯 새로 고침 */
export const widgetSnapshotKey = (s: WidgetSnapshot) => JSON.stringify({ ...s, generatedAt: undefined })
export const signedOutSnapshot = (now: Date): WidgetSnapshot => ({ schema: 1, generatedAt: isoLocal(now), account: { signedIn: false } })

// ── 대기열(위젯 → 앱, 25 §8.5) ──
export type WidgetAction = { schema: 1; id: string; kind: 'complete' | 'uncomplete'; taskId: string; at: string; day?: string }
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const TASK_RE = /^[A-Za-z0-9_-]{1,100}$/
/** 파일·저장값 내용 검사. 깨졌거나 모르는 형식이면 null */
export function parseWidgetAction(raw: string | unknown): WidgetAction | null {
  try {
    const a = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<WidgetAction>
    if (!a || a.schema !== 1 || typeof a.id !== 'string' || !ID_RE.test(a.id)) return null
    if (a.kind !== 'complete' && a.kind !== 'uncomplete') return null
    if (typeof a.taskId !== 'string' || !TASK_RE.test(a.taskId)) return null
    if (typeof a.at !== 'string' || Number.isNaN(Date.parse(a.at))) return null
    return { schema: 1, id: a.id, kind: a.kind, taskId: a.taskId, at: a.at, day: typeof a.day === 'string' ? a.day : undefined }
  } catch {
    return null
  }
}
export const widgetActionTooOld = (a: WidgetAction, now: Date) => now.getTime() - Date.parse(a.at) > WIDGET_ACTION_MAX_AGE_MS

/**
 * 대기열 정리: 형식 검사 → 7일 넘은 것·이미 반영한 id 버림 → 같은 할 일은 마지막 것만(완료 후 취소 = 아무것도 안 함) → 시각 순.
 * 반환 complete = 완료할 taskId(앱이 내 DB에 있는지 다시 본다), drop = 반영 없이 지울 id.
 */
export function planWidgetActions(raws: unknown[], applied: readonly string[], now: Date): { complete: { id: string; taskId: string }[]; uncomplete: { id: string; taskId: string }[]; ids: string[] } {
  const seen = new Set(applied)
  const ok = raws.map((r) => parseWidgetAction(r)).filter((a): a is WidgetAction => !!a && !seen.has(a.id) && !widgetActionTooOld(a, now))
  ok.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const last = new Map<string, WidgetAction>()
  for (const a of ok) last.set(a.taskId, a)
  const pick = (k: WidgetAction['kind']) => [...last.values()].filter((a) => a.kind === k).map((a) => ({ id: a.id, taskId: a.taskId }))
  return { complete: pick('complete'), uncomplete: pick('uncomplete'), ids: ok.map((a) => a.id) }
}

// ── 딥 링크 검사(36 §6) ──
export const isWidgetDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime())
export const isWidgetId = (s: unknown): s is string => typeof s === 'string' && TASK_RE.test(s)
