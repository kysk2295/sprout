// 일기 화면들(대화·그냥 쓰기·지난 날 / 기분 달력 / 검색)이 같이 보는 "고른 날" — 앱 실행 동안만(기기 저장 없음)
import { useSyncExternalStore } from 'react'
import { dayKey } from '../lib/dates'

/** want = 그날을 열 때 한 번만 바랄 보기(이번 주 한 줄 → 그냥 쓰기) — 일기 화면이 읽고 지운다 */
type State = { date: string; want?: 'free' | 'chat' }
let state: State = { date: dayKey() }
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useDiaryState = () => useSyncExternalStore(subscribe, () => state)
export function setDiaryState(patch: Partial<State>) {
  // 미래 날은 고를 수 없다(15 §3)
  if (patch.date && patch.date > dayKey()) return
  if (patch.date === state.date && patch.want === state.want) return
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
/** 그날로(달력 칸·검색 결과·딥 링크) */
export const openDay = (date: string, want?: 'free' | 'chat') => setDiaryState({ date, want })
export const clearWant = () => { if (state.want) { state = { ...state, want: undefined }; listeners.forEach((l) => l()) } }
