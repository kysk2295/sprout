// 모바일 캘린더 계산(06 휴대폰판 — 시안 G): 범위·월 칸·막대 줄·시각 블록·일정 목록·끌어 옮기기. 화면과 떨어진 순수 함수(시험: calendar.test.ts).
// 데스크톱 apps/desktop/src/renderer/src/lib/calendar.ts와 같은 규칙: 주 시작 일요일(2026-10-06 사용자 결정 "일부터" — 틱틱 기본), 기간 할 일은 [시작, 끝] 겹침,
// 종일·여러 날 = 막대, 시각 = 블록(겹치면 열을 나눔). 구글·Apple 일정은 컴퓨터 기기 데이터라 모바일엔 sprout 할 일만 그린다(06 §12, 16).
import { addDays, addMinutes, datePart, daysBetween, hasTime, minutesBetween, nextOccurrence, parseRule, timePart, toDate, WEEKDAY_KO } from '@sprout/schema/time'

export type MobileCalView = 'list' | 'day' | '3day' | 'month'
export const CAL_VIEWS: [MobileCalView, string][] = [['list', '목록'], ['day', '일'], ['3day', '3일'], ['month', '월']]
/** 목록(일정) 보기가 보여 주는 날 수 [임시] */
export const AGENDA_DAYS = 30
export const HOUR_H = 56 // 시안 G-2: 1시간 56

export interface CalTask {
  id: string
  title: string
  status: number
  priority: number
  start_at: string | null
  due_at: string | null
  repeat_rule?: string | null
  repeat_from?: string | null
  list_color?: string | null
}
/** locked = 끌 수 없음(읽기 전용 휴대폰 캘린더 일정 — 38 §4) */
export interface CalItem<T extends CalTask = CalTask> { key: string; task: T; start: string; end: string; allDay: boolean; virtual: boolean; locked?: boolean }

// ── 범위 ──
export const weekStart = (d: string) => addDays(d, -toDate(d).getDay())
/** 그 달에 필요한 주만큼(5줄 또는 6줄), 일요일 시작 */
export function monthDays(cursor: string): string[] {
  const first = `${cursor.slice(0, 7)}-01`
  const from = weekStart(first)
  const last = addDays(shiftCursor('month', first, 1), -1)
  const weeks = Math.ceil((daysBetween(from, last) + 1) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i))
}
export function rangeOf(view: MobileCalView, cursor: string): { from: string; to: string; days: string[] } {
  if (view === 'day') return { from: cursor, to: cursor, days: [cursor] }
  if (view === '3day') {
    const days = [0, 1, 2].map((i) => addDays(cursor, i))
    return { from: days[0], to: days[2], days }
  }
  if (view === 'list') {
    const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(cursor, i))
    return { from: days[0], to: days[days.length - 1], days }
  }
  const days = monthDays(cursor)
  return { from: days[0], to: days[days.length - 1], days }
}
export function shiftCursor(view: MobileCalView, cursor: string, n: number): string {
  if (view === 'day') return addDays(cursor, n)
  if (view === '3day') return addDays(cursor, 3 * n)
  if (view === 'list') return addDays(cursor, AGENDA_DAYS * n)
  const d = toDate(`${cursor.slice(0, 7)}-01`)
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
/** 머리 가운데(시안 G "10월"): 올해면 "10월", 다른 해면 "2027년 1월" */
export function monthTitle(cursor: string, today: string): string {
  const d = toDate(cursor)
  return cursor.slice(0, 4) === today.slice(0, 4) ? `${d.getMonth() + 1}월` : `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}
/** 일요일 시작 요일 머리 */
export const WEEK_HEAD = ['일', '월', '화', '수', '목', '금', '토']
export const weekdayKo = (d: string) => WEEKDAY_KO[toDate(d).getDay()]
/** 일정 목록 묶음 머리: "오늘 · 10월 4일 일" / "내일 · 10월 5일 월" / "10월 7일 수" */
export function agendaTitle(d: string, today: string): string {
  const x = toDate(d)
  const base = `${x.getMonth() + 1}월 ${x.getDate()}일 ${weekdayKo(d)}`
  const n = daysBetween(today, d)
  return n === 0 ? `오늘 · ${base}` : n === 1 ? `내일 · ${base}` : n === -1 ? `어제 · ${base}` : d.slice(0, 4) !== today.slice(0, 4) ? `${x.getFullYear()}년 ${base}` : base
}

// ── 항목(반복 미래 회차는 선택) ──
export function itemsOf<T extends CalTask>(tasks: T[], from: string, to: string, withRepeats = false): CalItem<T>[] {
  const out: CalItem<T>[] = []
  for (const t of tasks) {
    if (!t.due_at) continue
    const start = t.start_at ?? t.due_at
    const allDay = !hasTime(t.due_at)
    if (datePart(start) <= to && datePart(t.due_at) >= from) out.push({ key: t.id, task: t, start, end: t.due_at, allDay, virtual: false })
    if (!withRepeats || !t.repeat_rule || t.status !== 0) continue
    const rule = parseRule(t.repeat_rule)
    if (!rule) continue
    const len = minutesBetween(start, t.due_at)
    let cur = datePart(start)
    let count = rule.count
    for (let i = 0; i < 400; i++) {
      const next = nextOccurrence({ ...rule, count }, cur, t.repeat_from === 'completion' ? 'completion' : 'due')
      if (!next || next > to) break
      if (count !== undefined) count -= 1
      cur = next
      if (next < from) continue
      const s = hasTime(start) ? `${next}T${timePart(start)}` : next
      const e = hasTime(t.due_at) ? addMinutes(s, len) : addDays(t.due_at, daysBetween(datePart(start), next))
      out.push({ key: `${t.id}@${next}`, task: t, start: s, end: e, allDay, virtual: true })
    }
  }
  return out
}
/** 종일 영역·월 칸 막대에 들어가는가: 종일이거나 여러 날에 걸침(06 §4.1) */
export const isBarItem = (it: CalItem) => it.allDay || datePart(it.start) !== datePart(it.end)
/** 그날에 걸친 항목들: 막대(긴 것 먼저) → 시각순 → 우선순위 */
export function itemsOnDay<T extends CalTask>(items: CalItem<T>[], day: string): CalItem<T>[] {
  return items
    .filter((it) => datePart(it.start) <= day && datePart(it.end) >= day)
    .sort((a, b) => {
      const ab = isBarItem(a) ? 0 : 1
      const bb = isBarItem(b) ? 0 : 1
      if (ab !== bb) return ab - bb
      if (a.start !== b.start) return a.start < b.start ? -1 : 1
      return b.task.priority - a.task.priority
    })
}
/** 월 칸 한 칸에 보일 것: 최대 max줄, 넘치면 "+n"(시안 G-1) */
export function cellSummary<T extends CalTask>(items: CalItem<T>[], day: string, max: number): { shown: CalItem<T>[]; more: number } {
  const all = itemsOnDay(items, day)
  if (all.length <= max) return { shown: all, more: 0 }
  return { shown: all.slice(0, max - 1), more: all.length - (max - 1) }
}

/** 시각 블록 겹침 배치(06 §4.2): 같은 날 겹치는 블록끼리 열을 나눈다 */
export interface Block<T extends CalTask = CalTask> { item: CalItem<T>; startMin: number; endMin: number; col: number; cols: number }
export const POINT_MINUTES = 30 // 끝 시각 없는 할 일: 칸 높이용 길이 [임시 — 휴대폰은 손가락으로 누를 수 있게 30분]
export const minutesOfDay = (f: string) => {
  const t = timePart(f)
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export function layoutDay<T extends CalTask>(items: CalItem<T>[], day: string): Block<T>[] {
  const blocks = items
    .filter((it) => !isBarItem(it) && datePart(it.start) === day)
    .map((it) => {
      const s = minutesOfDay(it.start)
      const e = it.start !== it.end ? Math.max(s + 15, minutesOfDay(it.end)) : s + POINT_MINUTES
      return { item: it, startMin: s, endMin: Math.min(e, 24 * 60), col: 0, cols: 1 }
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  let cluster: Block<T>[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((b) => b.col + 1))
    cluster.forEach((b) => (b.cols = cols))
    cluster = []
  }
  for (const b of blocks) {
    if (b.startMin >= clusterEnd && cluster.length) flush()
    const used = new Set(cluster.filter((x) => x.endMin > b.startMin).map((x) => x.col))
    let col = 0
    while (used.has(col)) col++
    b.col = col
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.endMin)
  }
  if (cluster.length) flush()
  return blocks
}

// ── 만들기·옮기기 ──
/** 시간 칸의 y(px) → 그 시각(분, snap 단위로 내림) */
export function minutesAtY(y: number, snap = 30): number {
  const m = Math.floor(((y / HOUR_H) * 60) / snap) * snap
  return Math.max(0, Math.min(24 * 60 - snap, m))
}
export const floatingAt = (day: string, minutes: number) =>
  `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/**
 * 블록을 끌어 놓았을 때(06 §7.2): 새 시작(floating)으로 옮기고 길이는 유지.
 * 종일 할 일을 시간 칸에 놓으면 그 시각의 시각 할 일(끝 없음)이 된다.
 */
export function moveTo(t: { start_at: string | null; due_at: string | null }, newStart: string): { start_at: string | null; due_at: string; is_all_day: number } {
  const timed = hasTime(newStart)
  if (!t.due_at || !t.start_at) return { start_at: null, due_at: newStart, is_all_day: timed ? 0 : 1 }
  if (hasTime(t.start_at) && timed) {
    const len = minutesBetween(t.start_at, t.due_at)
    return { start_at: newStart, due_at: addMinutes(newStart, len), is_all_day: 0 }
  }
  if (!hasTime(t.start_at) && !timed) {
    const n = daysBetween(t.start_at, newStart)
    return { start_at: newStart, due_at: addDays(t.due_at, n), is_all_day: 1 }
  }
  return { start_at: null, due_at: newStart, is_all_day: timed ? 0 : 1 }
}
/** 끌어 옮긴 거리(px, 칸 폭) → 새 시작. 15분 단위, 하루 안에서만 */
export function dragTarget(start: string, dyPx: number, dCols: number, snap = 15): string {
  const day = addDays(datePart(start), dCols)
  const raw = minutesOfDay(start) + (dyPx / HOUR_H) * 60
  const m = Math.max(0, Math.min(24 * 60 - snap, Math.round(raw / snap) * snap))
  return floatingAt(day, m)
}
/** 블록 시각 글자 "오후 3:00"(끝이 있으면 "오후 3:00-4:00") */
export function blockTime(start: string, end: string): string {
  const f = (x: string) => {
    const [h, m] = timePart(x)!.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}`
  }
  const ap = (x: string) => (Number(timePart(x)!.slice(0, 2)) < 12 ? '오전' : '오후')
  if (start === end || !hasTime(end)) return `${ap(start)} ${f(start)}`
  return ap(start) === ap(end) ? `${ap(start)} ${f(start)}-${f(end)}` : `${ap(start)} ${f(start)}-${ap(end)} ${f(end)}`
}
/** 시간 칸 왼쪽 시각 글자(06 §4.1 실측: 한국어 UI도 "9 AM") */
export const hourLabel = (h: number) => (h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`)
