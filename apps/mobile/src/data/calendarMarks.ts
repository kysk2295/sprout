// 06 §16 / 20 §7.2 휴일·음력·주 번호 표시 설정 — 데스크톱과 같은 동기화 값(view_settings 'calendar' options_json).
// 순수 함수만(테스트: calendarMarks.test.ts). 읽기·쓰기 훅은 calendarPrefs.ts
import type { MarkPrefs } from '@sprout/schema/holidays'

/** 저장값이 없으면 휴일 켬 · 음력 없음 · 주 번호 끔(데스크톱 DEFAULT_OPTIONS와 같음) */
export function markPrefsOf(optionsJson: string | null | undefined): MarkPrefs {
  let o: Record<string, unknown> = {}
  try { o = optionsJson ? (JSON.parse(optionsJson) as Record<string, unknown>) : {} } catch { o = {} }
  return { holidays: o.holidays !== 0, lunar: o.lunar === 1, weekNumbers: o.weekNumbers === 1 }
}
/** 다른 키(색·필터·보기 등 데스크톱 값)를 지우지 않고 고친다 */
export function mergeOptions(optionsJson: string | null | undefined, patch: Record<string, unknown>): string {
  let o: Record<string, unknown> = {}
  try { o = optionsJson ? (JSON.parse(optionsJson) as Record<string, unknown>) : {} } catch { o = {} }
  return JSON.stringify({ ...o, ...patch })
}
