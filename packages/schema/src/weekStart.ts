// 캘린더 주 시작 요일 — 06 §16.1 설정 › 날짜 & 시간 "일주일을 시작하는 요일"(틱틱 설정 › 날짜 및 시간 › 주 시작 요일: 토요일 · 일요일 · 월요일).
// - 값: 동기화되는 view_settings('calendar').options_json 의 `weekStart` — JS getDay()와 같은 번호(0 = 일, 1 = 월, 6 = 토). 없으면 일요일(틱틱 기본).
// - 따르는 곳: 캘린더 주·월 보기, 작은 달력, 날짜 고르기, 일기 달력·이번 주 칸, 메모·수집함 "이번 주", 맥·iOS 위젯 월 칸.
// - 따르지 않는 곳: 성장 주(주간 목표·주간 리포트·점검 XP·작업 지도 "이번 주") — 서버 리포트·XP id 경계라 월요일 고정.
// - 색은 칸 자리가 아니라 그 날의 요일로 정한다: 일요일 빨강 · 토요일 파랑(어느 열에 있든).
// 순수 함수만(시험: weekStart.test.ts). 앱(데스크톱 렌더러·메인, 모바일)이 함께 쓴다.
import { addDays, daysBetween, toDate, WEEKDAY_KO } from './time.ts'

export type WeekStart = 0 | 1 | 6
export const WEEK_START_DEFAULT: WeekStart = 0
/** 틱틱과 같은 순서(토 · 일 · 월) */
export const WEEK_START_OPTIONS: readonly { value: WeekStart; label: string }[] = [
  { value: 6, label: '토요일' },
  { value: 0, label: '일요일' },
  { value: 1, label: '월요일' }
]
/** 저장값 → 0·1·6(모르는 값은 일요일) */
export const toWeekStart = (v: unknown): WeekStart => (v === 1 || v === 6 ? v : 0)
export function weekStartOfOptions(optionsJson: string | null | undefined): WeekStart {
  try { return toWeekStart(optionsJson ? (JSON.parse(optionsJson) as { weekStart?: unknown }).weekStart : undefined) } catch { return WEEK_START_DEFAULT }
}
export const weekStartLabel = (ws: WeekStart) => `${WEEKDAY_KO[ws]}요일`

/** 요일 머리(예: 월요일 시작 → 월 화 수 목 금 토 일) */
export const weekHead = (ws: WeekStart): string[] => Array.from({ length: 7 }, (_, i) => WEEKDAY_KO[(ws + i) % 7])
/** 머리 i번째 열의 요일(getDay 번호) */
export const headWeekday = (i: number, ws: WeekStart) => (ws + i) % 7
/** 요일 색: 일요일 = 'sun'(빨강), 토요일 = 'sat'(파랑) */
export const weekdayTone = (dow: number): 'sun' | 'sat' | null => (dow === 0 ? 'sun' : dow === 6 ? 'sat' : null)
export const headTone = (i: number, ws: WeekStart) => weekdayTone(headWeekday(i, ws))
/** 그 날이 주의 몇 번째 칸인가(0~6) */
export const weekCol = (date: string, ws: WeekStart) => (toDate(date).getDay() - ws + 7) % 7
/** 그 날이 든 주의 첫날 */
export const startOfWeek = (date: string, ws: WeekStart) => addDays(date, -weekCol(date, ws))
/** 그 날이 든 주의 7날짜 */
export const weekDays = (date: string, ws: WeekStart) => { const s = startOfWeek(date, ws); return Array.from({ length: 7 }, (_, i) => addDays(s, i)) }
/** 'YYYY-MM' 달의 칸 — 그 달에 필요한 주만큼(4·5·6줄) */
export function monthWeeksDays(month: string, ws: WeekStart): string[] {
  const first = `${month.slice(0, 7)}-01`
  const from = startOfWeek(first, ws)
  const d = toDate(first)
  const last = addDays(first, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - 1)
  const weeks = Math.ceil((daysBetween(from, last) + 1) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i))
}
/** 'YYYY-MM' 달의 6주 고정 42칸(작은 달력·날짜 고르기·일기 달력) */
export function monthGrid42(month: string, ws: WeekStart): string[] {
  const from = startOfWeek(`${month.slice(0, 7)}-01`, ws)
  return Array.from({ length: 42 }, (_, i) => addDays(from, i))
}
/** 주 번호(W)를 셀 날: 그 줄 안의 월요일(일요일 시작 → +1, 토요일 시작 → +2) */
export const mondayOfRow = (date: string, ws: WeekStart) => addDays(startOfWeek(date, ws), (8 - ws) % 7)
