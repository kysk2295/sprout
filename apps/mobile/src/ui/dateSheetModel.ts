// 날짜 시트 계산(22 §3.3, 03 §3·§4) — 데스크톱 DatePicker.tsx와 같은 규칙을 순수 함수로.
// 순수 모듈(시험: dateSheetModel.test.ts). 화면은 src/ui/DateSheet.tsx.
import {
  ALL_DAY_PRESETS, END_TRIGGER, TIMED_PRESETS, addDays, addMinutes, datePart, hasTime, minutesBetween, minutesToDuration, nextWholeHour,
  parseRule, repeatPresets, stringifyRule, timePart, type Rule
} from '@sprout/schema/time'
import { dayKey, monthDay, moveToDate, WEEKDAY } from '../lib/dates.ts'

/** 날짜 시트가 저장하는 값(데스크톱 taskActions Schedule과 같은 꼴) */
export interface Schedule {
  start_at: string | null
  due_at: string | null
  is_all_day: number
  repeat_rule: string | null
  repeat_from: string | null
  reminders: string[]
}
export const EMPTY_SCHEDULE: Schedule = { start_at: null, due_at: null, is_all_day: 1, repeat_rule: null, repeat_from: null, reminders: [] }

/** 시각을 처음 넣을 때 붙는 기본 알림(03 §3.1 "정각에") */
export const ON_TIME = '-PT0M'

/** 달력에서 날짜 고르기: 시각·기간 길이는 유지(03 §5) */
export function pickDate(s: Schedule, date: string): Schedule {
  return { ...s, ...moveToDate(s, date), is_all_day: s.due_at ? s.is_all_day : 1 }
}

/** 시각 정하기/지우기. 종일 → 시각이면 알림 "정각에"이 자동으로 붙고, 시각을 지우면 알림도 지운다(데스크톱과 같음) */
export function setTime(s: Schedule, time: string | null, today: string): Schedule {
  const date = s.due_at ? datePart(s.due_at) : today
  if (time === null) return { ...s, start_at: null, due_at: date, is_all_day: 1, reminders: [] }
  const wasAllDay = !hasTime(s.due_at)
  return { ...s, start_at: null, due_at: `${date}T${time}`, is_all_day: 0, reminders: wasAllDay ? [ON_TIME] : s.reminders }
}

/** 빠른 날짜 줄(오늘·내일·다음 주 월·오늘 밤): 시각이 있으면 그 시각, 없으면 날짜만 옮긴다 */
export function quickSchedule(s: Schedule, date: string, time?: string): Schedule {
  if (time) return { ...s, start_at: null, due_at: `${date}T${time}`, is_all_day: 0, reminders: hasTime(s.due_at) ? s.reminders : [ON_TIME] }
  return pickDate(s, date)
}

/** 기간 탭으로: 시작 = 정한 시각(없으면 다음 정각), 끝 = +1시간(03 §4) */
export function toDuration(s: Schedule, today: string, now = new Date()): Schedule {
  if (s.start_at) return s
  const date = s.due_at ? datePart(s.due_at) : today
  const start = s.due_at && hasTime(s.due_at) ? s.due_at : `${date}T${timePart(nextWholeHour(now))}`
  return { ...s, start_at: start, due_at: addMinutes(start, 60), is_all_day: 0, reminders: s.reminders.length ? s.reminders : [ON_TIME] }
}
/** 날짜 탭으로: 기간을 시작 시각 하나로 접는다 */
export function toDateMode(s: Schedule): Schedule {
  return s.start_at ? { ...s, start_at: null, due_at: s.start_at, reminders: s.reminders.filter((r) => r !== END_TRIGGER) } : s
}
/** 기간 시작을 옮기면 길이를 유지한다 */
export function setStart(s: Schedule, start: string): Schedule {
  const len = s.start_at && s.due_at ? minutesBetween(s.start_at, s.due_at) : 60
  return { ...s, start_at: start, due_at: hasTime(start) ? addMinutes(start, len) : addDays(start, Math.max(0, Math.round(len / 1440))) }
}
/** 끝 < 시작이면 끝 = 시작 + 1시간(종일이면 같은 날) — 03 §4 */
export function setEnd(s: Schedule, end: string): Schedule {
  const start = s.start_at ?? end
  if (end < start) return { ...s, due_at: hasTime(start) ? addMinutes(start, 60) : start }
  return { ...s, due_at: end }
}
export function toggleAllDay(s: Schedule, now = new Date()): Schedule {
  const start = s.start_at ?? s.due_at ?? dayKey(0, now)
  const end = s.due_at ?? start
  if (hasTime(s.due_at)) return { ...s, start_at: datePart(start), due_at: datePart(end), is_all_day: 1, reminders: [] }
  const st = `${datePart(start)}T${timePart(nextWholeHour(now))}`
  return { ...s, start_at: st, due_at: datePart(end) > datePart(start) ? `${datePart(end)}T${timePart(st)}` : addMinutes(st, 60), is_all_day: 0, reminders: [ON_TIME] }
}

// ── 알림(03 §3.2) ──
export function reminderOptions(allDay: boolean, duration: boolean): [string, string][] {
  return [...(allDay ? ALL_DAY_PRESETS : TIMED_PRESETS), ...(duration && !allDay ? [[END_TRIGGER, '끝날 때'] as [string, string]] : [])]
}
export const toggleReminder = (list: string[], trigger: string) => (list.includes(trigger) ? list.filter((x) => x !== trigger) : [...list, trigger])
/** 직접 설정: 시각 할 일 = N분·시간·일 전, 종일 = N일 전 + 시각 */
export function customTrigger(n: number, unit: 'm' | 'h' | 'd', allDay: boolean, time = '09:00'): string {
  if (allDay) {
    const [h, m] = time.split(':').map(Number)
    return minutesToDuration(-n * 1440 + h * 60 + m)
  }
  return minutesToDuration(-n * (unit === 'm' ? 1 : unit === 'h' ? 60 : 1440))
}

// ── 반복(03 §3.3) — RRULE은 데스크톱과 같은 stringifyRule 꼴 ──
const MON_FIRST = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const RR_SUN_FIRST = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
export { repeatPresets }
/** 반복 정하기: 날짜가 없으면 오늘로(03 §3.3), 반복 종료(UNTIL·COUNT)는 그대로 둔다 */
export function setRepeat(s: Schedule, rule: string | null, today: string, from: 'due' | 'completion' = 'due'): Schedule {
  if (!rule) return { ...s, repeat_rule: null, repeat_from: null }
  const old = parseRule(s.repeat_rule)
  const next = parseRule(rule)!
  const kept = stringifyRule({ ...next, until: old?.until, count: old?.count })
  return { ...s, repeat_rule: kept, repeat_from: from, ...(!s.due_at ? { due_at: today, is_all_day: 1 } : {}) }
}
/** 요일 고르기(매주): 월요일 시작 순서로 BYDAY를 만든다. 비면 날짜의 요일 하나 */
export function weeklyRule(days: string[], anchor: string, prev?: string | null): string {
  const a = new Date(`${datePart(anchor)}T00:00`)
  const picked = MON_FIRST.filter((d) => days.includes(d))
  const old = parseRule(prev)
  const r: Rule = { freq: 'WEEKLY', interval: old?.freq === 'WEEKLY' ? old.interval : 1, byday: picked.length ? picked : [RR_SUN_FIRST[a.getDay()]], until: old?.until, count: old?.count }
  return stringifyRule(r)
}
/** 지금 규칙의 요일(매주일 때) */
export function weeklyDays(rule: string | null, anchor: string): string[] {
  const r = parseRule(rule)
  if (!r || r.freq !== 'WEEKLY') return []
  return r.byday?.length ? r.byday : [RR_SUN_FIRST[new Date(`${datePart(anchor)}T00:00`).getDay()]]
}
/** 프리셋과 비교할 때는 종료 조건을 뺀다 */
export function ruleBase(rule: string | null): string | null {
  const r = parseRule(rule)
  return r ? stringifyRule({ ...r, until: undefined, count: undefined }) : null
}

// ── 표기 ──
const pad = (n: number) => String(n).padStart(2, '0')
function dayHead(date: string, today: string): string {
  const d = Math.round((new Date(`${date}T00:00`).getTime() - new Date(`${today}T00:00`).getTime()) / 86400000)
  if (d === 0) return '오늘'
  if (d === 1) return '내일'
  if (d === -1) return '어제'
  if (d > 1 && d < 7) return `${WEEKDAY[new Date(`${date}T00:00`).getDay()]}요일`
  return monthDay(date, today)
}
/** 빠른 입력 날짜 칩 "내일, 15:00"(22 §2 — 틱틱 캡처는 24시간 표기) */
export function chipLabel(s: Pick<Schedule, 'start_at' | 'due_at'>, today: string): string | null {
  if (!s.due_at) return null
  const start = s.start_at ?? s.due_at
  const head = dayHead(datePart(start), today)
  if (s.start_at && datePart(s.start_at) !== datePart(s.due_at)) return `${head} - ${dayHead(datePart(s.due_at), today)}`
  const t = hasTime(start) ? timePart(start)! : null
  const end = s.start_at && hasTime(s.due_at) ? timePart(s.due_at) : null
  return t ? `${head}, ${t}${end ? ` - ${end}` : ''}` : head
}
/** 날짜 시트 "날짜" 칸 값: "10월 5일 (월) · 내일" */
export function dateCellLabel(date: string, today: string): string {
  const d = new Date(`${date}T00:00`)
  const head = dayHead(date, today)
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`
  return ['오늘', '내일', '어제'].includes(head) ? `${base} · ${head}` : base
}
/** 시간 휠 값 ↔ "HH:mm" (오전/오후 · 1~12 · 5분) */
export function toWheel(time: string): { pm: boolean; hour12: number; minute: number } {
  const [h, m] = time.split(':').map(Number)
  return { pm: h >= 12, hour12: h % 12 || 12, minute: Math.round(m / 5) * 5 === 60 ? 55 : Math.round(m / 5) * 5 }
}
export function fromWheel(w: { pm: boolean; hour12: number; minute: number }): string {
  const h = (w.hour12 % 12) + (w.pm ? 12 : 0)
  return `${pad(h)}:${pad(w.minute)}`
}
/** 달력 6주(일요일 시작) */
export function monthCells(month: string): string[] {
  const first = new Date(`${month}-01T00:00`)
  const lead = first.getDay()
  return Array.from({ length: 42 }, (_, i) => addDays(`${month}-01`, i - lead))
}
export function shiftMonth(month: string, n: number): string {
  const d = new Date(`${month}-01T00:00`)
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** 알림이 새로 생겼는가(첫 알림 때 권한을 묻는다 — 20 §4.4) */
export const addsReminder = (before: string[], after: string[]) => after.some((r) => !before.includes(r))
