// 날짜 규칙 — 02-task-list §6(행 날짜 표기), §13.1(상세 머리), 03-date-picker §4(기간 태스크)·§9(floating 저장 형식)
import { addDays, addMinutes, datePart, daysBetween, formatTimeKo, hasTime, minutesBetween, timePart, withDate } from '@sprout/schema/time'

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 태스크의 날짜 범위. 기간 태스크면 start_at~due_at, 아니면 due_at 하나 */
export type Span = { start_at?: string | null; due_at: string | null }

export function dayKey(offset = 0, from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const diffDays = (a: string, b: string) => daysBetween(b, a)
export const formatTime = formatTimeKo
function monthDay(date: string, today: string): string {
  const d = new Date(`${date}T00:00`)
  // 02 §0 실측: 같은 해 "10월 2일", 다른 해 "2027. 10. 2."
  return date.slice(0, 4) === today.slice(0, 4) ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}
const startOf = (s: Span) => s.start_at ?? s.due_at
const shortTime = (f: string) => timePart(f)!

export type DateTone = 'overdue' | 'today' | 'future'
const toneOf = (s: Span, today: string): DateTone => {
  const end = datePart(s.due_at!)
  const start = datePart(startOf(s)!)
  if (end < today) return 'overdue'
  if (start <= datePart(dayKey(1, new Date(`${today}T00:00`)))) return 'today'
  return 'future'
}

/** "오후 9:00 - 10:00": 오전/오후가 같으면 끝 시각의 오전/오후를 뺀다. 시각이 없으면 '' */
function timeLabel(s: Span): string {
  const start = startOf(s)!
  if (!hasTime(start)) return ''
  const endTime = s.start_at && hasTime(s.due_at!)
    ? ` - ${formatTime(shortTime(s.due_at!)).slice(0, 2) === formatTime(shortTime(start)).slice(0, 2) ? formatTime(shortTime(s.due_at!)).slice(3) : formatTime(shortTime(s.due_at!))}`
    : ''
  return formatTime(shortTime(start)) + endTime
}

/** 행 오른쪽 날짜 (02 §6, 03 §4 목록 행 표기) */
export function rowDateLabel(s: Span, today: string): { label: string; tone: DateTone } | null {
  if (!s.due_at) return null
  const start = startOf(s)!
  const date = datePart(start)
  const d = diffDays(date, today)
  const tone = toneOf(s, today)
  // 여러 날 기간: "10월 3일 - 10월 5일"
  if (s.start_at && datePart(s.start_at) !== datePart(s.due_at)) return { label: `${monthDay(date, today)} - ${monthDay(datePart(s.due_at), today)}`, tone }
  const time = timeLabel(s)
  if (d < 0 && !s.start_at) return { label: d === -1 ? '어제' : monthDay(date, today), tone }
  if (d === 0) return { label: time || '오늘', tone }
  if (d === 1) return { label: time ? `내일 ${time}` : '내일', tone }
  if (d > 1 && d < 7) return { label: `${WEEKDAY[new Date(`${date}T00:00`).getDay()]}${time ? ` ${time}` : ''}`, tone }
  return { label: `${d === -1 ? '어제' : monthDay(date, today)}${time ? ` ${time}` : ''}`, tone }
}

/** 상세 머리 날짜 (02 §13.1, 03 §4 날짜 표기) */
export function detailDateLabel(s: Span, today: string): { label: string; tone: DateTone | 'none' } {
  if (!s.due_at) return { label: '기한', tone: 'none' } // 02 §0 실측
  const start = startOf(s)!
  const date = datePart(start)
  const tone = toneOf(s, today)
  if (s.start_at && datePart(s.start_at) !== datePart(s.due_at)) {
    const t = hasTime(s.start_at) ? ` ${shortTime(s.start_at)}` : ''
    const te = hasTime(s.due_at) ? ` ${shortTime(s.due_at)}` : ''
    return { label: `${monthDay(date, today)}${t} - ${monthDay(datePart(s.due_at), today)}${te}`, tone }
  }
  const time = timeLabel(s)
  const range = time ? `, ${time}` : ''
  const d = diffDays(date, today)
  if (d === 0) return { label: `오늘, ${monthDay(date, today)}${range}`, tone }
  if (d === 1) return { label: `내일, ${monthDay(date, today)}${range}`, tone }
  if (d < 0) return { label: `${monthDay(date, today)}${range}, ${-d}일 지남`, tone }
  return { label: `${monthDay(date, today)}${range}, ${d}일 남음`, tone }
}

export type TimeGroup = 'overdue' | 'today' | 'tomorrow' | 'next7' | 'later' | 'nodate'
/** 날짜 묶음 순서 — 만료됨은 늘 맨 아래(완료 묶음 바로 위, 2026-10-06 사용자 결정 · 02 §그룹) */
export const TIME_GROUPS: [TimeGroup, string][] = [
  ['today', '오늘'], ['tomorrow', '내일'], ['next7', '다음 7일'], ['later', '나중'], ['nodate', '날짜 없음'], ['overdue', '만료됨']
]
/** 03 §4: 끝 < 오늘이면 만료됨, 진행 중이면 오늘, 아니면 시작 날짜 기준 */
export function timeGroup(s: Span, today: string): TimeGroup {
  if (!s.due_at) return 'nodate'
  if (datePart(s.due_at) < today) return 'overdue'
  const start = datePart(startOf(s)!)
  const d = start < today ? 0 : diffDays(start, today)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d <= 6) return 'next7'
  return 'later'
}

/** 날짜만 바꾼다: 시각·기간 길이는 유지(03 §5) */
export function moveToDate(s: Span, date: string | null): { start_at: string | null; due_at: string | null; is_all_day?: number } {
  if (date === null) return { start_at: null, due_at: null, is_all_day: 1 }
  if (!s.due_at) return { start_at: null, due_at: date, is_all_day: 1 }
  if (!s.start_at) return { start_at: null, due_at: withDate(s.due_at, date) }
  const days = daysBetween(datePart(s.start_at), date)
  return { start_at: addDays(s.start_at, days), due_at: addDays(s.due_at, days) }
}
/** 미루기(03 §5): 분 단위는 시각 있는 태스크에만, 날짜 없는 태스크는 오늘 기준 */
export function shiftSpan(s: Span, opt: { minutes?: number; days?: number }): { start_at: string | null; due_at: string | null } | null {
  if (!s.due_at) return opt.days ? { start_at: null, due_at: dayKey(opt.days) } : null
  if (opt.minutes && !hasTime(s.due_at)) return null
  const move = (f: string) => (opt.minutes ? addMinutes(f, opt.minutes) : addDays(f, opt.days ?? 0))
  return { start_at: s.start_at ? move(s.start_at) : null, due_at: move(s.due_at) }
}
export const spanMinutes = (s: Span) => (s.start_at && s.due_at ? minutesBetween(s.start_at, s.due_at) : 0)

/** 받침에 맞춰 "로/으로"를 붙인다(받침 없음·ㄹ받침 → 로). */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}(으)로`
  const jong = code % 28
  return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`
}
