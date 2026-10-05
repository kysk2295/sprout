import { useCallback, useMemo } from 'react'
import { dayMarks, holidayMap, type DayMarks, type MarkPrefs } from '@sprout/schema/holidays'
import { useQuery } from './useQuery'
import { setViewSetting } from './mutations'
import { getDb } from './db'
import { DEFAULT_OPTIONS, type CalOptions } from '../lib/calendar'

// 캘린더 보기 설정(동기화: view_settings 'calendar' 행의 options_json — 06 §12). 캘린더·설정 › 날짜 & 시간·날짜 선택기가 함께 읽는다
export function useCalendarOptions(): [CalOptions, (patch: Partial<CalOptions>) => void] {
  const row = useQuery<{ options_json: string | null }>("SELECT options_json FROM view_settings WHERE view_key = 'calendar'")?.[0]
  const opts: CalOptions = useMemo(() => {
    try { return { ...DEFAULT_OPTIONS, ...(row?.options_json ? JSON.parse(row.options_json) : {}) } } catch { return DEFAULT_OPTIONS }
  }, [row?.options_json])
  const setOpts = useCallback((patch: Partial<CalOptions>) => void saveCalendarOptions(patch), [])
  return [opts, setOpts]
}

// 연달아 고쳐도(설정에서 두 칸을 바로 바꾸기 등) 앞의 값을 덮지 않게, 저장할 때 최신 값을 읽어 합치고 차례로 쓴다
let chain: Promise<unknown> = Promise.resolve()
export function saveCalendarOptions(patch: Partial<CalOptions>): Promise<unknown> {
  chain = chain.catch(() => {}).then(async () => {
    const db = await getDb()
    const row = await db.get<{ options_json: string | null }>("SELECT options_json FROM view_settings WHERE view_key = 'calendar'")
    let cur: Partial<CalOptions> = {}
    try { cur = row?.options_json ? JSON.parse(row.options_json) : {} } catch { cur = {} }
    await setViewSetting('calendar', { options_json: JSON.stringify({ ...DEFAULT_OPTIONS, ...cur, ...patch }) })
  })
  return chain
}

export const markPrefsOf = (o: Pick<CalOptions, 'holidays' | 'lunar' | 'weekNumbers'>): MarkPrefs => ({ holidays: o.holidays !== 0, lunar: o.lunar === 1, weekNumbers: o.weekNumbers === 1 })

/** 06 §16 날짜 칸 표시(휴일 이름·주 번호·음력)를 범위 하나로 미리 계산한다 */
export function useDayMarks(days: string[], prefs: MarkPrefs): (day: string, firstOfRow: boolean) => DayMarks {
  const from = days[0]
  const to = days[days.length - 1]
  const map = useMemo(() => (from && to ? holidayMap(from, to) : new Map<string, string>()), [from, to])
  return useCallback((day: string, firstOfRow: boolean) => dayMarks(day, prefs, firstOfRow, map), [map, prefs.holidays, prefs.lunar, prefs.weekNumbers]) // eslint-disable-line react-hooks/exhaustive-deps
}
