// 31 작업 지도 v3 §2 타임라인 — 화면과 떨어진 순수 계산(날짜 ↔ x, 배율, 막대 모양·줄 배치, 끌기 붙기, 순서 화살표 어긋남).
// 근거: research 29 §2~§4(틱틱 타임라인), 31 §2.1~§2.5. 수치는 틱틱 실측 전이라 [임시].
// 시간은 floating: 종일 'YYYY-MM-DD', 시각 'YYYY-MM-DDTHH:mm'. 종일 기간은 마감일 포함(06 캘린더와 같다).
import { addDays, addMinutes, datePart, daysBetween, hasTime, minutesBetween, toDate, WEEKDAY_KO } from '@sprout/schema/time'

export type Scale = 'day' | 'week' | 'month'
export const SCALES: Scale[] = ['day', 'week', 'month']
export const SCALE_LABEL: Record<Scale, string> = { day: '일', week: '주', month: '월' }
/** 하루 폭(px) [임시] — 일 = 시간당 12 · 주 = 44 · 월 = 14 (31 §2.1) */
export const DAY_PX: Record<Scale, number> = { day: 288, week: 44, month: 14 }
/** 그리는 범위: 가운데 날짜 앞뒤로 며칠(가장자리에 닿으면 창을 옮긴다) */
export const HALF_DAYS: Record<Scale, number> = { day: 21, week: 98, month: 380 }
export const ROW_H = { head: 30, task: 36 } as const
export const HEAD_H = 48
export const BAR_H = 24
export const ROW_HEAD = { def: 200, min: 160, max: 320, narrow: 160 } as const
export const DAY_MIN = 1440
/** 시각만 있는(시작 없는) 할 일: 일 배율에서 마감 시각에 끝나는 1시간 막대 [임시] */
export const POINT_MIN = 60

const ORIGIN = (origin: string) => `${origin}T00:00`

// ── 날짜 ↔ 분 ↔ x ──
/** origin 0시부터 f까지 분(날짜만이면 그날 0시) */
export const toMin = (f: string, origin: string) => minutesBetween(ORIGIN(origin), hasTime(f) ? f : `${f}T00:00`)
/** origin 0시 + m분 → floating(시각 포함) */
export const fromMin = (m: number, origin: string) => addMinutes(ORIGIN(origin), Math.round(m))
export const xOf = (min: number, scale: Scale) => (min / DAY_MIN) * DAY_PX[scale]
export const minOf = (x: number, scale: Scale) => (x / DAY_PX[scale]) * DAY_MIN
export const dayOfMin = (m: number, origin: string) => addDays(origin, Math.floor(m / DAY_MIN))

/** 붙는 단위(분): 일 배율 시각 할 일 = 15분, 그 밖(종일·주·월) = 하루 (31 §2.5) */
export const snapUnit = (scale: Scale, timed: boolean) => (scale === 'day' && timed ? 15 : DAY_MIN)
export const snap = (delta: number, unit: number) => Math.round(delta / unit) * unit

// ── 그리는 범위 ──
export type Window = { from: string; days: number }
export function windowAround(center: string, scale: Scale): Window {
  const half = HALF_DAYS[scale]
  return { from: addDays(center, -half), days: half * 2 + 1 }
}
/** 한 화면(‹ ›)에 해당하는 날 수 — 보이는 폭 기준 */
export const pageDays = (viewW: number, scale: Scale) => Math.max(1, Math.floor(viewW / DAY_PX[scale]))

// ── 막대 모양 (31 §2.2) ──
export type BarTask = { id: string; start_at: string | null; due_at: string | null }
export type Bar = { start: number; end: number; allDay: boolean; point: boolean }
/**
 * - 종일: 시작일 0시 ~ 마감일 24시(마감일 포함). 시작이 없으면 그날 하루
 * - 시각 + 시작: 일 배율은 그 시각 그대로, 주·월은 날 단위로 넓혀 그림
 * - 시각만(시작 없음): 일 배율은 마감 시각에 끝나는 1시간, 주·월은 그날 하루
 * - 날짜 없음: null(할일 정렬 칸)
 */
export function barOf(t: BarTask, scale: Scale, origin: string): Bar | null {
  if (!t.due_at) return null
  const timed = hasTime(t.due_at)
  const s = t.start_at ?? t.due_at
  if (!timed || scale !== 'day') {
    const start = toMin(datePart(s) <= datePart(t.due_at) ? datePart(s) : datePart(t.due_at), origin)
    const end = toMin(addDays(datePart(t.due_at), 1), origin)
    return { start, end, allDay: !timed, point: false }
  }
  if (!t.start_at) {
    const end = toMin(t.due_at, origin)
    return { start: end - POINT_MIN, end, allDay: false, point: true }
  }
  const start = toMin(hasTime(t.start_at) ? t.start_at : `${t.start_at}T00:00`, origin)
  const end = Math.max(start + 15, toMin(t.due_at, origin))
  return { start, end, allDay: false, point: false }
}

// ── 끌기 (31 §2.5: 몸통 = 옮기기, 가장자리 = 기간, 최소 한 단위) ──
export type DragMode = 'move' | 'start' | 'end'
export type DateChange = { id: string; start_at: string | null; due_at: string | null }
const shiftDays = (f: string, n: number) => (n ? addDays(f, n) : f)

/** 끌어 놓은 결과. 바뀐 것이 없으면 null. delta는 분(붙기 전) */
export function dragDates(t: BarTask, mode: DragMode, delta: number, scale: Scale): DateChange | null {
  if (!t.due_at) return null
  const timed = hasTime(t.due_at)
  let start_at = t.start_at
  let due_at = t.due_at
  if (!timed || scale !== 'day') {
    // 날 단위: 시각은 그대로 두고 날짜만
    const n = Math.round(delta / DAY_MIN)
    if (!n) return null
    const s0 = t.start_at ?? t.due_at
    if (mode === 'move') {
      start_at = t.start_at ? shiftDays(t.start_at, n) : null
      due_at = shiftDays(t.due_at, n)
    } else if (mode === 'end') {
      const next = shiftDays(t.due_at, n)
      if (datePart(next) < datePart(s0)) due_at = hasTime(next) ? `${datePart(s0)}T${next.slice(11)}` : datePart(s0)
      else due_at = next
      if (!t.start_at) start_at = s0
    } else {
      const next = shiftDays(s0, n)
      start_at = datePart(next) > datePart(t.due_at) ? (hasTime(next) ? `${datePart(t.due_at)}T${next.slice(11)}` : datePart(t.due_at)) : next
    }
    // 시각 할 일에서 시작이 마감보다 늦어지면 마감 시각에 맞춘다
    if (start_at && hasTime(start_at) && hasTime(due_at) && start_at > due_at) start_at = due_at
  } else {
    const d = snap(delta, 15)
    if (!d) return null
    const bar = barOf(t, 'day', datePart(t.due_at))!
    const base = datePart(t.due_at)
    if (mode === 'move') {
      start_at = t.start_at ? fromMin(bar.start + d, base) : null
      due_at = fromMin(bar.end + d, base)
    } else if (mode === 'end') {
      due_at = fromMin(Math.max(bar.start + 15, bar.end + d), base)
      start_at = fromMin(bar.start, base)
    } else {
      start_at = fromMin(Math.min(bar.end - 15, bar.start + d), base)
    }
  }
  // 종일 하루짜리는 시작을 비운다(06 캘린더와 같은 모양)
  if (start_at && !hasTime(due_at) && datePart(start_at) === datePart(due_at)) start_at = null
  if (start_at === t.start_at && due_at === t.due_at) return null
  return { id: t.id, start_at, due_at }
}

/** 빈 곳 클릭으로 새 할 일(31 §2.5): 주·월 = 그날 종일, 일 = 누른 시각(15분 내림)부터 1시간 */
export function draftAt(min: number, scale: Scale, origin: string): { start_at: string | null; due_at: string } {
  const day = dayOfMin(min, origin)
  if (scale !== 'day') return { start_at: null, due_at: day }
  const s = Math.floor(min / 15) * 15
  return { start_at: fromMin(s, origin), due_at: fromMin(s + 60, origin) }
}

// ── 줄 배치 ──
export type RowBox = { top: number; height: number }
export function rowBoxes(kinds: ('head' | 'task')[]): { boxes: RowBox[]; height: number } {
  let y = 0
  const boxes = kinds.map((k) => { const h = ROW_H[k]; const b = { top: y, height: h }; y += h; return b })
  return { boxes, height: y }
}
/** y(줄 영역 기준) → 줄 번호 */
export function rowAt(boxes: RowBox[], y: number): number {
  let lo = 0
  let hi = boxes.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const b = boxes[mid]
    if (y < b.top) hi = mid - 1
    else if (y >= b.top + b.height) lo = mid + 1
    else return mid
  }
  return -1
}
/** 보이는 줄만 그린다(31 §2.4 — 300줄 넘으면 가상 스크롤). 위아래 여유 overscan px */
export function visibleRange(boxes: RowBox[], top: number, height: number, overscan = 200): [number, number] {
  if (!boxes.length) return [0, -1]
  const a = Math.max(0, rowAt(boxes, Math.max(0, top - overscan)))
  let b = rowAt(boxes, top + height + overscan)
  if (b < 0) b = boxes.length - 1
  return [a, b]
}

// ── 순서 화살표 (31 §2.3 — sprout) ──
export type ArrowLink = { id: string; from_id: string; to_id: string; state: string }
export type Arrow = { id: string; from: string; to: string; suggested: boolean; warn: boolean }
/** 둘 다 축 위에 있는 순서 선만. 어긋남 = 뒤 할 일 시작이 앞 할 일 끝보다 이름(날짜를 자동으로 밀지 않는다) */
export function arrowsOf(links: ArrowLink[], bars: Map<string, Pick<Bar, 'start' | 'end'>>): Arrow[] {
  const out: Arrow[] = []
  for (const l of links) {
    if (l.state === 'dismissed') continue
    const a = bars.get(l.from_id)
    const b = bars.get(l.to_id)
    if (!a || !b) continue
    out.push({ id: l.id, from: l.from_id, to: l.to_id, suggested: l.state === 'suggested', warn: l.state === 'accepted' && b.start < a.end })
  }
  return out
}

// ── 날짜 머리 (31 §2.1) ──
export type HeadCell = { x: number; w: number; label: string; strong?: boolean; weekend?: boolean; today?: boolean }
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`
const dow = (d: string) => toDate(d).getDay()
export const isWeekend = (d: string) => dow(d) === 0 || dow(d) === 6
/** 주 이름: 그 주 월요일이 그 달 몇째 주인가 — `10월 2주` [임시] */
export const weekName = (monday: string) => `${Number(monday.slice(5, 7))}월 ${Math.floor((Number(monday.slice(8, 10)) - 1) / 7) + 1}주`
/** 주 배율 위 줄: 달의 첫 주(또는 맨 앞)는 `2026년 10월 · 1주`, 나머지는 `2주` (시안 B) */
export function weekHead(monday: string, first: boolean): string {
  const n = Math.floor((Number(monday.slice(8, 10)) - 1) / 7) + 1
  return first || n === 1 ? `${monday.slice(0, 4)}년 ${Number(monday.slice(5, 7))}월 · ${n}주` : `${n}주`
}

export function headCells(scale: Scale, win: Window, today: string): { top: HeadCell[]; bottom: HeadCell[] } {
  const W = DAY_PX[scale]
  const top: HeadCell[] = []
  const bottom: HeadCell[] = []
  for (let i = 0; i < win.days; i++) {
    const d = addDays(win.from, i)
    const x = i * W
    const wd = dow(d)
    if (scale === 'day') {
      top.push({ x, w: W, label: `${md(d)} ${WEEKDAY_KO[wd]}요일`, today: d === today, weekend: isWeekend(d) })
      for (let h = 0; h < 24; h += 3) bottom.push({ x: x + (h / 24) * W, w: W / 8, label: `${h}` })
    } else if (scale === 'week') {
      if (wd === 1 || i === 0) top.push({ x, w: W * 7, label: weekHead(addDays(d, -((wd + 6) % 7)), i === 0) })
      bottom.push({ x, w: W, label: `${Number(d.slice(8, 10))} ${WEEKDAY_KO[wd]}`, today: d === today, weekend: isWeekend(d) })
    } else {
      if (d.slice(8, 10) === '01' || i === 0) top.push({ x, w: W * 28, label: `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월` })
      // 1일과 5일마다(30일은 다음 1일과 겹쳐 뺀다). 오늘 둘레 이틀은 오늘 원과 겹치지 않게 비운다
      const n = Number(d.slice(8, 10))
      const near = Math.abs(daysBetween(d, today)) <= 2
      if (d === today) bottom.push({ x, w: W, label: `${n}`, today: true, weekend: isWeekend(d) })
      else if (!near && (n === 1 || (n % 5 === 0 && n <= 25))) bottom.push({ x, w: W, label: `${n}`, weekend: isWeekend(d) })
    }
  }
  return { top, bottom }
}

// ── 글자 ──
/** 끄는 중 말풍선: `10월 7일 – 10월 9일` · 일 배율 시각 `10월 7일 오후 2:00 – 3:00` */
export function rangeLabel(start_at: string | null, due_at: string | null): string {
  if (!due_at) return '날짜 없음'
  const s = start_at ?? due_at
  const t = (f: string) => {
    const h = Number(f.slice(11, 13))
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${f.slice(14, 16)}`
  }
  if (hasTime(due_at)) {
    if (!start_at) return `${md(due_at)} ${t(due_at)}`
    return datePart(s) === datePart(due_at) ? `${md(s)} ${t(s)} – ${t(due_at)}` : `${md(s)} ${hasTime(s) ? t(s) : ''} – ${md(due_at)} ${t(due_at)}`.replace(/\s+/g, ' ')
  }
  return datePart(s) === datePart(due_at) ? md(due_at) : `${md(s)} – ${md(due_at)}`
}

/** 기한 지남(열린 할 일): 종일은 마감일 < 오늘, 시각은 마감 시각 < 지금 */
export function isOverdue(t: { status: number; due_at: string | null }, nowF: string): boolean {
  const due = t.due_at
  if (t.status !== 0 || !due) return false
  return due.includes('T') ? due < nowF : due < datePart(nowF)
}

/** 배율을 바꿀 때 가운데 날짜를 고정하는 새 scrollLeft (31 §2.5 애니메이션 — 가운데 날짜 고정) */
export function keepCenter(scrollLeft: number, viewW: number, from: Scale, to: Scale, fromOrigin: string, toOrigin: string): number {
  const centerMin = minOf(scrollLeft + viewW / 2, from) + daysBetween(toOrigin, fromOrigin) * DAY_MIN
  return Math.max(0, xOf(centerMin, to) - viewW / 2)
}
export const nextScale = (s: Scale, dir: 1 | -1): Scale => SCALES[Math.max(0, Math.min(2, SCALES.indexOf(s) + dir))]
