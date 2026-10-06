// 06 §5.1 월 보기 세로 스크롤(research 17 §17): 주 줄이 이어서 흐르고, 멈추면 주 경계에 맞춘다.
// 순수 계산만 — 화면(MonthView)은 이 값으로 그릴 주와 스크롤 위치를 정한다.
// 주 시작은 설정(06 §16.1, ws = 0 일 · 1 월 · 6 토)을 따른다 — 0번 주가 그 요일에 시작한다.
import { addDays, daysBetween } from '@sprout/schema/time'
import { startOfWeek, type WeekStart } from '@sprout/schema/weekStart'
import { shiftCursor } from './calendar'

/** 0번 주(기본 일요일 시작). 2000-01-02 ~ 2060년까지 그린다 */
export const EPOCH = '2000-01-02'
/** 주 시작별 0번 주: 일 2000-01-02 · 월 2000-01-03 · 토 2000-01-01 */
export const epochOf = (ws: WeekStart = 0) => startOfWeek('2000-01-05', ws)
export const TOTAL_WEEKS = 3200 // 2061년 초까지

export const weekIndexOf = (day: string, ws: WeekStart = 0) => Math.floor(daysBetween(epochOf(ws), startOfWeek(day, ws)) / 7)
export const weekAt = (index: number, ws: WeekStart = 0) => addDays(epochOf(ws), index * 7)

/** 그 달에 필요한 주 수(5 또는 6, 2월은 4도) — rangeOf('month')와 같다 */
export function weeksInMonth(ym: string, ws: WeekStart = 0): number {
  const first = `${ym}-01`
  const last = addDays(shiftCursor('month', first, 1), -1)
  return weekIndexOf(last, ws) - weekIndexOf(first, ws) + 1
}

/** 그 달 1일이 든 주의 번호 */
export const monthTopWeek = (ym: string, ws: WeekStart = 0) => weekIndexOf(`${ym}-01`, ws)

/** 머리 제목 달: 화면 가운데 줄(그 줄 7칸의 가운데 날)의 달 — research 17 §17.2 "가장 많이 보이는 달" */
export function monthAtCenter(scrollTop: number, viewH: number, rowH: number, ws: WeekStart = 0): string {
  const row = Math.max(0, Math.floor((scrollTop + viewH / 2) / rowH))
  return addDays(weekAt(row, ws), 3).slice(0, 7)
}

/**
 * 손을 떼고 관성까지 끝난 뒤 맞출 위치. 가장 가까운 주 경계로 가되,
 * 짧은 움직임(휠 한 칸)이 제자리로 되돌아가지 않게 discrete면 움직인 방향의 다음 주로.
 */
export function snapTop(top: number, startTop: number, rowH: number, discrete: boolean): number {
  let n = Math.round(top / rowH)
  const s = Math.round(startTop / rowH)
  const moved = top - startTop
  if (discrete && n === s && Math.abs(moved) > 2) n = s + Math.sign(moved)
  return n * rowH
}

/** 그릴 주 범위(보이는 주 + 위아래 여유) */
export function windowRows(scrollTop: number, viewH: number, rowH: number, pad = 2): [number, number] {
  const a = Math.max(0, Math.floor(scrollTop / rowH) - pad)
  const b = Math.min(TOTAL_WEEKS - 1, Math.ceil((scrollTop + viewH) / rowH) + pad)
  return [a, b]
}

/** 데이터를 미리 읽을 범위: 기준 달 앞뒤 6주(스크롤하는 동안 막대가 늦게 뜨지 않게) */
export function monthDataRange(cursor: string, ws: WeekStart = 0): { from: string; to: string; days: string[] } {
  const ym = cursor.slice(0, 7)
  const top = monthTopWeek(ym, ws)
  const from = weekAt(top - 6, ws)
  const to = addDays(weekAt(top + weeksInMonth(ym, ws) + 6, ws), -1)
  const days = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i))
  return { from, to, days }
}
