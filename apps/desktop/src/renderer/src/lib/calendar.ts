// 캘린더 계산 — 06-calendar §4·§5·§12. 화면과 떨어진 순수 함수만 둔다.
import { addDays, datePart, daysBetween, hasTime, minutesBetween, nextOccurrence, parseRule, timePart, toDate } from '@sprout/schema/time'
import type { TaskRow } from '../data/types'

export type CalView = 'day' | 'week' | 'month'
export type ColorBy = 'list' | 'tag' | 'priority'
export type ItemStyle = 'simple' | 'detailed' // 06 §4.2 간결한 / 상세한
export interface CalOptions {
  view: CalView
  color: ColorBy
  style: ItemStyle
  completed: number
  repeats: number
  lists: string[]
  tags: string[]
}
export const DEFAULT_OPTIONS: CalOptions = { view: 'week', color: 'list', style: 'simple', completed: 1, repeats: 0, lists: [], tags: [] }

/** 캘린더에 그리는 한 항목. 반복 미래 회차는 virtual(원래 태스크 id = task.id) */
export interface CalItem {
  key: string
  task: TaskRow
  start: string // floating
  end: string // floating
  allDay: boolean
  virtual: boolean
}

// ── 범위 ──
export const weekStart = (d: string) => addDays(d, -((toDate(d).getDay() + 6) % 7)) // 월요일 시작(2026-10-05 사용자 결정 — 틱틱 실측 기본은 일요일, research 17 §2)
export function rangeOf(view: CalView, cursor: string): { from: string; to: string; days: string[] } {
  if (view === 'day') return { from: cursor, to: cursor, days: [cursor] }
  if (view === 'week') {
    const from = weekStart(cursor)
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
    return { from, to: days[6], days }
  }
  // 06 §5 실측: 그 달에 필요한 주만큼(5줄 또는 6줄)
  const first = `${cursor.slice(0, 7)}-01`
  const from = weekStart(first)
  const last = addDays(shiftCursor('month', first, 1), -1)
  const weeks = Math.ceil((daysBetween(from, last) + 1) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i))
  return { from, to: days[days.length - 1], days }
}
export function shiftCursor(view: CalView, cursor: string, n: number): string {
  if (view === 'day') return addDays(cursor, n)
  if (view === 'week') return addDays(cursor, 7 * n)
  const d = toDate(`${cursor.slice(0, 7)}-01`)
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
/** 06 §3 실측: 고른 날짜(커서)의 달. 9/27~10/3 주를 오늘(10/3)로 보면 "2026년 10월" */
export function titleOf(_view: CalView, cursor: string): string {
  const a = toDate(cursor)
  return `${a.getFullYear()}년 ${a.getMonth() + 1}월`
}
export const isWeekend = (d: string) => [0, 6].includes(toDate(d).getDay())

// ── 항목 만들기 (반복 미래 회차 포함) ──
export function itemsOf(tasks: TaskRow[], from: string, to: string, withRepeats: boolean): CalItem[] {
  const out: CalItem[] = []
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
      const shift = daysBetween(datePart(start), next)
      const e = hasTime(t.due_at) ? addMinutesF(s, len) : addDays(t.due_at, shift)
      out.push({ key: `${t.id}@${next}`, task: t, start: s, end: e, allDay, virtual: true })
    }
  }
  return out
}
const addMinutesF = (f: string, n: number) => {
  const d = toDate(f)
  d.setMinutes(d.getMinutes() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 종일 영역·월 칸에 들어가는가: 종일이거나 여러 날에 걸침(06 §4.1) */
export const isBarItem = (it: CalItem) => it.allDay || datePart(it.start) !== datePart(it.end)

/** 여러 날 막대를 줄(lane)에 쌓는다. days = 그 줄에 보이는 날짜들(주 하나) */
export interface Bar { item: CalItem; lane: number; col: number; span: number; contLeft: boolean; contRight: boolean }
export function packBars(items: CalItem[], days: string[]): Bar[] {
  const first = days[0]
  const last = days[days.length - 1]
  const inRow = items
    .filter((it) => datePart(it.start) <= last && datePart(it.end) >= first)
    .sort((a, b) => (datePart(a.start) < datePart(b.start) ? -1 : datePart(a.start) > datePart(b.start) ? 1 : daysBetween(datePart(b.start), datePart(b.end)) - daysBetween(datePart(a.start), datePart(a.end)) || (a.start < b.start ? -1 : 1)))
  const lanes: number[] = [] // lane → 마지막으로 쓴 col
  const out: Bar[] = []
  for (const it of inRow) {
    const s = datePart(it.start) < first ? first : datePart(it.start)
    const e = datePart(it.end) > last ? last : datePart(it.end)
    const col = days.indexOf(s) >= 0 ? days.indexOf(s) : nearestIndex(days, s)
    const endCol = days.indexOf(e) >= 0 ? days.indexOf(e) : nearestIndex(days, e)
    if (endCol < col) continue // 주말을 숨겨서 보이는 날이 없음
    let lane = lanes.findIndex((lastCol) => lastCol < col)
    if (lane < 0) { lane = lanes.length; lanes.push(-1) }
    lanes[lane] = endCol
    out.push({ item: it, lane, col, span: endCol - col + 1, contLeft: datePart(it.start) < first, contRight: datePart(it.end) > last })
  }
  return out
}
/** 주말을 숨겼을 때: 보이는 날 중 가장 가까운 칸 */
function nearestIndex(days: string[], d: string): number {
  const i = days.findIndex((x) => x >= d)
  return i < 0 ? days.length - 1 : i
}

/** 시각 블록 겹침 배치(06 §4.2): 같은 날 겹치는 블록끼리 열을 나눈다 */
export interface Block { item: CalItem; startMin: number; endMin: number; col: number; cols: number }
export const POINT_MINUTES = 20 // 기간 없는 시각 태스크: 겹침 계산용 길이(그림은 한 줄 막대 16pt — 06 §4.2)
export function layoutDay(items: CalItem[], day: string): Block[] {
  const blocks = items
    .filter((it) => !isBarItem(it) && datePart(it.start) === day)
    .map((it) => {
      const s = minutesOfDay(it.start)
      const e = it.start !== it.end ? Math.max(s + 15, minutesOfDay(it.end)) : s + POINT_MINUTES
      return { item: it, startMin: s, endMin: Math.min(e, 24 * 60), col: 0, cols: 1 }
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  // 겹치는 무리(cluster)마다 열 배정
  let cluster: Block[] = []
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
export const minutesOfDay = (f: string) => {
  const t = timePart(f)
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// ── 색(06 §4.2) ──
const PRIORITY_COLOR = ['#A6A7A9', '#4E75F2', '#EFAB3E', '#C53C31']
export function colorOf(t: TaskRow, by: ColorBy, tagColor: (id: string) => string | null | undefined): string {
  if (by === 'priority') return PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR[0]
  if (by === 'tag') {
    const first = t.tag_ids?.split(',')[0]
    return (first && tagColor(first)) || '#4E75F2'
  }
  return t.list_color || '#4E75F2'
}

// ── 시간 표기(06 §4.1) ──
/** 06 §4.1 실측: 틱틱 한국어 UI도 "0 AM" … "11 AM", "12 PM", "1 PM" … */
export function hourLabel(h: number): string {
  if (h < 12) return `${h} AM`
  return h === 12 ? '12 PM' : `${h - 12} PM`
}
export function shortRange(start: string, end: string, hasEnd: boolean): string {
  const f = (x: string) => {
    const [h, m] = timePart(x)!.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}`
  }
  const ap = (x: string) => (Number(timePart(x)!.slice(0, 2)) < 12 ? '오전' : '오후')
  if (!hasEnd) return `${ap(start)} ${f(start)}`
  return ap(start) === ap(end) ? `${ap(start)} ${f(start)}-${f(end)}` : `${ap(start)} ${f(start)}-${ap(end)} ${f(end)}`
}
