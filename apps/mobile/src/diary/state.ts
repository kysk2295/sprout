// 일기 화면들(쓰기·달력 시트·검색·이야기)이 같이 보는 "고른 날"과 "쓰기/돌아보기" — 앱 실행 동안만(기기 저장 없음)
import { useSyncExternalStore } from 'react'
import { dayKey } from '../lib/dates'

type State = { date: string; tab: 'write' | 'review'; month: string }
let state: State = { date: dayKey(), tab: 'write', month: dayKey().slice(0, 7) }
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useDiaryState = () => useSyncExternalStore(subscribe, () => state)
export function setDiaryState(patch: Partial<State>) {
  // 미래 날은 고를 수 없다(15 §3)
  if (patch.date && patch.date > dayKey()) return
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
/** 그날로 쓰기(돌아보기 칸·검색 결과·달력) */
export const openDay = (date: string) => setDiaryState({ date, tab: 'write', month: date.slice(0, 7) })
