// 06 §16 / 20 §7.2 휴일·음력·주 번호 — 읽기 훅과 저장(데스크톱 설정 › 날짜 & 시간과 같은 값)
import { useRows } from './rows'
import { useCallback, useMemo } from 'react'
import { dayMarks, holidayMap, type DayMarks, type MarkPrefs } from '@sprout/schema/holidays'
import { toWeekStart, type WeekStart } from '@sprout/schema/weekStart'
import { db, run } from './db'
import { insert, update } from './tasks'
import { markPrefsOf, mergeOptions } from './calendarMarks'

const SQL = "SELECT id, options_json FROM view_settings WHERE view_key = 'calendar' LIMIT 1"
export function useMarkPrefs(): MarkPrefs {
  const row = useRows<{ options_json: string | null }>(SQL).data[0]
  return useMemo(() => markPrefsOf(row?.options_json), [row?.options_json])
}
/** 06 §16.1 / 20 §7.2 주 시작(0 일 · 1 월 · 6 토, 기본 일요일) — 바꾸면 열린 캘린더·날짜 시트·일기 달력이 바로 따른다 */
export function useWeekStart(): WeekStart {
  return toWeekStart(useMarkPrefs().weekStart)
}
export async function saveMarkPrefs(patch: { holidays?: number; lunar?: number; weekNumbers?: number; weekStart?: WeekStart }) {
  const row = await db.getOptional<{ id: string; options_json: string | null }>(SQL)
  const options_json = mergeOptions(row?.options_json, patch)
  await run([row ? update('view_settings', row.id, { options_json }) : insert('view_settings', { id: crypto.randomUUID(), view_key: 'calendar', sort_dir: 'asc', show_completed: 1, show_details: 0, options_json })])
}
/** 범위(첫날~끝날) 공휴일을 한 번에 계산해 두고 날마다 표시를 돌려준다 */
export function useDayMarks(from: string, to: string, prefs: MarkPrefs): (day: string, firstOfRow: boolean) => DayMarks {
  const map = useMemo(() => holidayMap(from, to), [from, to])
  return useCallback((day: string, firstOfRow: boolean) => dayMarks(day, prefs, firstOfRow, map), [map, prefs.holidays, prefs.lunar, prefs.weekNumbers, prefs.weekStart]) // eslint-disable-line react-hooks/exhaustive-deps
}
