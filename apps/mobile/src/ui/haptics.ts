// 흔들림 지도(39 §3) — expo-haptics를 직접 부르는 곳은 여기 하나. 손가락이 일으킨 눈에 보이는 변화와 같은 프레임에 부른다.
// 설정 › 소리와 알림 `진동`(기본 켬, 기기별 — 결정 ④)을 끄면 아무것도 안 한다. 완료음 켜기(결정 ②)도 같은 저장소.
import * as Haptics from 'expo-haptics'
import { useSyncExternalStore } from 'react'
import { onChange, preload, read, write } from '../growth/store'

export const PREF = { haptics: 'sprout.pref.haptics', sound: 'sprout.pref.completeSound' } as const
void preload([PREF.haptics, PREF.sound])

const on = (k: string) => read(k) !== 'off'
export const hapticsOn = () => on(PREF.haptics)
export const soundOn = () => on(PREF.sound)
export const setPref = (k: (typeof PREF)[keyof typeof PREF], v: boolean) => write(k, v ? 'on' : 'off')
export function usePref(k: (typeof PREF)[keyof typeof PREF]): boolean {
  return useSyncExternalStore(onChange, () => on(k))
}

const run = (f: () => Promise<void>) => { if (hapticsOn()) void f().catch(() => {}) }
export const hx = {
  /** 휠·세그먼트 값, 끌기 중 자리 넘어감, 캘린더 15분 칸, 날짜 칸 고름 */
  tick: () => run(() => Haptics.selectionAsync()),
  /** 체크 완료, 스와이프 기준 넘김/되돌림, 칸 열림, 끌기 놓음, 빠른 입력 보냄 */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** 길게 누름(메뉴 열림·끌기 시작), 캘린더 블록 잡음 */
  lift: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** 레벨업, 모두 완료로 빈 상태가 될 때 한 번 */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** 영구 삭제 확인 창이 뜰 때 */
  warn: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning))
}
