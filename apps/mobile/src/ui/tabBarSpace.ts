// 탭 바 자리 계산(20 §3.1 아래 여백 규칙) — 떠 있는 탭 알약·+ 버튼·토스트·목록 아래 여백이 모두 여기 숫자를 쓴다.
// 화면마다 매직 넘버(140, insets.bottom + 120 …)를 두지 않는다. 탭 바가 보이는 화면((tabs) 안)의 스크롤 목록은
// contentContainerStyle.paddingBottom 에 `useTabBarSpace().pad`(+ 버튼이 있으면 `.padFab`)를 쓴다.
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { M } from '../theme/palette'

/** 탭 알약의 바닥 위치(홈 표시줄 위 22 — 시안 키트 --m-tab-bottom, 안전 영역 34 기준. 홈 버튼 기기는 12) */
export const tabBarBottom = (insetBottom: number) => Math.max(insetBottom - 12, 12)

export type TabBarSpace = {
  /** 탭 알약 bottom 값 */
  barBottom: number
  /** 화면 바닥 ~ 탭 알약 윗변 거리(이 위로 내용이 보여야 한다) */
  clear: number
  /** + 버튼 bottom 값(탭 알약 위 14) */
  fabBottom: number
  /** 토스트 bottom 값(+ 버튼 위 — 21 §2 "탭 바·+ 버튼 위") */
  toastBottom: number
  /** + 버튼 없는 탭 화면 목록의 아래 여백(마지막 줄이 탭 알약 위 24에서 끝남) */
  pad: number
  /** + 버튼 있는 탭 화면 목록의 아래 여백(마지막 줄이 + 버튼 위에서 끝남) */
  padFab: number
}

export function tabBarSpace(insetBottom: number): TabBarSpace {
  const barBottom = tabBarBottom(insetBottom)
  const clear = barBottom + M.tabH
  const fabBottom = clear + 14
  return { barBottom, clear, fabBottom, toastBottom: fabBottom + M.fab + 12, pad: clear + 24, padFab: fabBottom + M.fab + 16 }
}

export function useTabBarSpace(): TabBarSpace {
  return tabBarSpace(useSafeAreaInsets().bottom)
}
