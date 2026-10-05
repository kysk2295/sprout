// 06 §7.2 캘린더 끌기 계산(화면과 떼어 놓은 순수 함수 — tests/calendar-drag.test.ts).
// 틱틱 근거: 월 = 원래 모양 막대가 포인터를 따라 떠다니고 놓을 칸이 칠해짐, 주·일 = 15분 칸에 붙은 미리 보기,
// 종일 → 시간 칸 = 시각만 있는 한 줄 막대(기간 없음), 가장자리 끌기 = 길이(시간 칸)·여러 날(막대). research 17 §끌기.
import { addDays, datePart, daysBetween } from '@sprout/schema/time'
import { isBarItem, minutesOfDay, type Bar, type CalItem } from './calendar'

export const SNAP = 15
export interface DragChange { id: string; start_at: string | null; due_at: string | null }

const pad = (n: number) => String(n).padStart(2, '0')
export const at = (day: string, min: number) => `${day}T${pad(Math.floor(min / 60))}:${pad(min % 60)}`
export const snapMin = (m: number) => Math.max(0, Math.min(24 * 60 - SNAP, Math.round(m / SNAP) * SNAP))
/** 날짜·시각 문자열을 days일·mins분 옮긴다(자정을 넘으면 날짜도) */
export const shiftF = (f: string, days: number, mins: number) => {
  if (!f.includes('T')) return addDays(f, days)
  const total = minutesOfDay(f) + mins
  const d = addDays(datePart(f), days + Math.floor(total / 1440))
  return at(d, ((total % 1440) + 1440) % 1440)
}
const change = (id: string, start: string, end: string): DragChange => ({ id, start_at: start === end ? null : start, due_at: end })

/** 주·일 보기에서 놓았을 때 바뀌는 값.
 * - 시간 칸 블록 → 종일 영역: 그날 종일(시각·기간 지움)
 * - 종일 막대 → 시간 칸: 할 일은 그 시각 한 점(틱틱 실측 — 놓은 뒤에도 한 줄 막대), 일정은 1시간(06 §14.4)
 * - 여러 날 시각 막대 → 시간 칸: 길이를 그대로 두고 그 시각부터
 * - 그 밖: 같은 만큼 날짜·시각 이동(여러 개 선택은 함께, 막대는 날짜만) */
export function gridMoveChanges(group: CalItem[], grabbed: CalItem, to: { dayDelta: number; zone: 'grid' | 'allday'; min: number }, isEvent: (it: CalItem) => boolean = () => false): DragChange[] {
  const grabbedBlock = !isBarItem(grabbed)
  const minDelta = grabbedBlock && to.zone === 'grid' ? to.min - minutesOfDay(grabbed.start) : 0
  return group.map((g) => {
    const isGrabbed = g.key === grabbed.key
    if (isGrabbed && to.zone === 'allday' && grabbedBlock) return { id: g.task.id, start_at: null, due_at: addDays(datePart(g.start), to.dayDelta) }
    if (isGrabbed && to.zone === 'grid' && !grabbedBlock) {
      const day = addDays(datePart(g.start), to.dayDelta)
      const s = at(day, to.min)
      if (!g.allDay && g.start.includes('T') && g.end.includes('T')) {
        const len = daysBetween(datePart(g.start), datePart(g.end)) * 1440 + minutesOfDay(g.end) - minutesOfDay(g.start)
        return change(g.task.id, s, shiftF(s, 0, Math.max(SNAP, len)))
      }
      return isEvent(g) ? change(g.task.id, s, shiftF(s, 0, 60)) : { id: g.task.id, start_at: null, due_at: s }
    }
    const mins = isBarItem(g) ? 0 : minDelta
    const ns = shiftF(g.start, to.dayDelta, mins)
    const ne = shiftF(g.end, to.dayDelta, mins)
    return { id: g.task.id, start_at: g.task.start_at ? ns : null, due_at: g.task.start_at ? ne : ns }
  })
}

/** 월 보기: 날짜만 옮기고 시각·기간은 그대로(03 §5) */
export function monthMoveChanges(group: CalItem[], delta: number): DragChange[] {
  const shift = (f: string) => (f.includes('T') ? `${addDays(datePart(f), delta)}T${f.slice(11)}` : addDays(f, delta))
  return group.map((g) => ({ id: g.task.id, start_at: g.task.start_at ? shift(g.start) : null, due_at: shift(g.end) }))
}

/** 시간 칸 블록 위·아래 가장자리 끌기(최소 15분). 기간 없는 한 점은 30분짜리로 보고 늘린다 */
export function resizeTime(item: CalItem, edge: 'top' | 'bottom', min: number): { day: string; a: number; b: number } {
  const s = minutesOfDay(item.start)
  const e = item.start !== item.end ? minutesOfDay(item.end) : s + 30
  return { day: datePart(item.start), a: edge === 'top' ? Math.min(min, e - SNAP) : s, b: edge === 'bottom' ? Math.max(min, s + SNAP) : e }
}

/** 막대(종일 영역·월 칸) 왼쪽·오른쪽 끝 끌기 = 시작·끝 날짜 바꾸기(틱틱 도움말: 막대 끝을 끌면 여러 날 할 일). 시각은 그대로 둔다 */
export function resizeBar(item: CalItem, edge: 'start' | 'end', dayDelta: number): DragChange {
  const s = datePart(item.start)
  const e = datePart(item.end)
  const ns = edge === 'start' ? (addDays(s, dayDelta) > e ? e : addDays(s, dayDelta)) : s
  const ne = edge === 'end' ? (addDays(e, dayDelta) < s ? s : addDays(e, dayDelta)) : e
  const withTime = (d: string, f: string) => (f.includes('T') ? `${d}${f.slice(10)}` : d)
  let start = withTime(ns, item.start)
  const end = withTime(ne, item.end)
  if (start > end) start = end // 같은 날로 줄였는데 시작 시각이 끝보다 늦음 → 한 점
  return change(item.task.id, start, end)
}

/** 끄는 동안 그릴 미리 보기 항목(원래 항목과 같은 모양 — Item 컴포넌트로 그린다) */
export function previewOf(item: CalItem, c: Pick<DragChange, 'start_at' | 'due_at'>): CalItem {
  const end = c.due_at!
  return { ...item, key: `${item.key}#drag`, start: c.start_at ?? end, end, allDay: !end.includes('T'), virtual: false }
}

/** 종일 영역 미리 보기 막대가 들어갈 줄: [col, col+span) 칸이 빈 가장 위 줄(끄는 원래 막대는 비운 것으로 본다) */
export function freeLane(bars: Pick<Bar, 'lane' | 'col' | 'span' | 'item'>[], col: number, span: number, skipKey?: string): number {
  const busy = new Set(bars.filter((b) => b.item.key !== skipKey && b.col < col + span && col < b.col + b.span).map((b) => b.lane))
  let lane = 0
  while (busy.has(lane)) lane++
  return lane
}

/** 가장자리 자동 스크롤: 스크롤 칸 위·아래 zone px 안에 들어가면 가까울수록 빠르게(프레임당 최대 max px) */
export function autoScrollDelta(y: number, top: number, bottom: number, zone = 36, max = 14): number {
  if (y < top + zone) return -Math.ceil(max * Math.min(1, (top + zone - y) / zone))
  if (y > bottom - zone) return Math.ceil(max * Math.min(1, (y - (bottom - zone)) / zone))
  return 0
}

/** 막대가 차지하는 날 수(월·종일 영역 끌기 때 놓을 칸 칠하기) */
export const spanDays = (it: Pick<CalItem, 'start' | 'end'>) => daysBetween(datePart(it.start), datePart(it.end)) + 1
