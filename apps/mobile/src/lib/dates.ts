// 날짜 규칙 — 02 §6(행 날짜 표기), §13.1(상세 머리), 03 §4·§5
// 데스크톱 apps/desktop/src/renderer/src/lib/dates.ts의 순수 함수를 옮겨 왔다(같은 규칙).
// TODO(공용화): rowDateLabel·detailDateLabel·timeGroup·moveToDate를 packages/schema로 옮겨 두 앱이 같이 쓰게 한다.
import { addDays, datePart, daysBetween, formatTimeKo, hasTime, timePart, withDate } from '@sprout/schema/time'

const pad = (n: number) => String(n).padStart(2, '0')
export const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

export type Span = { start_at?: string | null; due_at: string | null }

export function dayKey(offset = 0, from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const diffDays = (a: string, b: string) => daysBetween(b, a)
export function monthDay(date: string, today: string): string {
  const d = new Date(`${date}T00:00`)
  return date.slice(0, 4) === today.slice(0, 4) ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}
/** "10월 4일 일요일"(오늘 머리 옆 작은 날짜, 21 §2) */
export function longDay(date: string): string {
  const d = new Date(`${date}T00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY[d.getDay()]}요일`
}
const startOf = (s: Span) => s.start_at ?? s.due_at
const shortTime = (f: string) => timePart(f)!

export type DateTone = 'overdue' | 'today' | 'future'
const toneOf = (s: Span, today: string): DateTone => {
  const end = datePart(s.due_at!)
  const start = datePart(startOf(s)!)
  if (end < today) return 'overdue'
  if (start <= dayKey(1, new Date(`${today}T00:00`))) return 'today'
  return 'future'
}
function timeLabel(s: Span): string {
  const start = startOf(s)!
  if (!hasTime(start)) return ''
  const f = formatTimeKo
  const endTime = s.start_at && hasTime(s.due_at!)
    ? ` - ${f(shortTime(s.due_at!)).slice(0, 2) === f(shortTime(start)).slice(0, 2) ? f(shortTime(s.due_at!)).slice(3) : f(shortTime(s.due_at!))}`
    : ''
  return f(shortTime(start)) + endTime
}

/** 행 오른쪽 날짜(02 §6). 오늘 목록에서는 "오늘" 글자를 뺀다(21 §2 — 시간 없으면 비움) */
export function rowDateLabel(s: Span, today: string, opts: { hideToday?: boolean } = {}): { label: string; tone: DateTone } | null {
  if (!s.due_at) return null
  const start = startOf(s)!
  const date = datePart(start)
  const d = diffDays(date, today)
  const tone = toneOf(s, today)
  if (s.start_at && datePart(s.start_at) !== datePart(s.due_at)) return { label: `${monthDay(date, today)} - ${monthDay(datePart(s.due_at), today)}`, tone }
  const time = timeLabel(s)
  if (d < 0 && !s.start_at) return { label: d === -1 ? '어제' : monthDay(date, today), tone }
  if (d === 0) return time || !opts.hideToday ? { label: time || '오늘', tone } : null
  if (d === 1) return { label: time ? `내일 ${time}` : '내일', tone }
  if (d > 1 && d < 7) return { label: `${WEEKDAY[new Date(`${date}T00:00`).getDay()]}${time ? ` ${time}` : ''}`, tone }
  return { label: `${d === -1 ? '어제' : monthDay(date, today)}${time ? ` ${time}` : ''}`, tone }
}

/** 상세 날짜 줄(21 §5: "오늘, 오후 3:00", 비면 "날짜와 알림") */
export function detailDateLabel(s: Span, today: string): { label: string; tone: DateTone | 'none' } {
  if (!s.due_at) return { label: '날짜와 알림', tone: 'none' }
  const start = startOf(s)!
  const date = datePart(start)
  const tone = toneOf(s, today)
  if (s.start_at && datePart(s.start_at) !== datePart(s.due_at)) return { label: `${monthDay(date, today)} - ${monthDay(datePart(s.due_at), today)}`, tone }
  const time = timeLabel(s)
  const d = diffDays(date, today)
  const head = d === 0 ? '오늘' : d === 1 ? '내일' : d === -1 ? '어제' : monthDay(date, today)
  return { label: time ? `${head}, ${time}` : head, tone }
}

export type TimeGroup = 'overdue' | 'today' | 'tomorrow' | 'next7' | 'later' | 'nodate'
/** 날짜 묶음 순서 — 만료됨은 늘 맨 아래(완료 묶음 바로 위, 2026-10-06 사용자 결정 · 02 §그룹) */
export const TIME_GROUPS: [TimeGroup, string][] = [
  ['today', '오늘'], ['tomorrow', '내일'], ['next7', '다음 7일'], ['later', '나중'], ['nodate', '날짜 없음'], ['overdue', '만료됨']
]
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

/** 날짜만 바꾼다: 시각·기간 길이는 유지(03 §5). null이면 날짜를 지운다 */
export function moveToDate(s: Span, date: string | null): { start_at: string | null; due_at: string | null; is_all_day?: number } {
  if (date === null) return { start_at: null, due_at: null, is_all_day: 1 }
  if (!s.due_at) return { start_at: null, due_at: date, is_all_day: 1 }
  if (!s.start_at) return { start_at: null, due_at: withDate(s.due_at, date) }
  const days = daysBetween(datePart(s.start_at), date)
  return { start_at: addDays(s.start_at, days), due_at: addDays(s.due_at, days) }
}

/** 다음 주 월요일(빠른 날짜 "다음 주", 03) */
export function nextMonday(today: string): string {
  const d = new Date(`${today}T00:00`).getDay()
  return addDays(today, ((8 - d) % 7) || 7)
}

/** 받침에 맞춰 "로/으로"(02 §12 토스트 "업무로 옮겼어요") */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}(으)로`
  const jong = code % 28
  return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`
}
