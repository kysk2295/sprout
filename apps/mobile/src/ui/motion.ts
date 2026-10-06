// 공용 움직임 값(39 §2) — 모든 화면이 이것만 쓴다. 이름·값은 데스크톱 토큰(--motion-fast 120 · --motion-base 180)과 맞춘다.
// [영상 실측] = research 34(사용자 휴대폰 틱틱 녹화), 나머지는 [iOS 기본] 근사.
import { Easing, ReduceMotion, withTiming, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated'
import { useMotionReduced } from '../growth/motion'

export const DUR = {
  /** 누름 강조 켜짐, 작은 색 바뀜 */
  fast: 120,
  /** 나타남·사라짐(옅어짐), 토스트, ⌄ 회전 */
  base: 180,
  /** 행 접힘·목록 미끄러짐·묶음 펼침 [영상 실측 250] */
  move: 250,
  /** 서랍 ☰ 열림/닫힘 [영상 실측 250/233] */
  drawerIn: 250,
  drawerOut: 233,
  /** 탭 내용 교차 옅어짐 [영상 실측 70~120] */
  tab: 90,
  /** 메뉴·팝오버 닫힘 [영상 실측 175] */
  menuOut: 175,
  /** 키보드 이벤트 값이 없을 때 */
  keyboard: 250
} as const

/** 체크 뒤 행이 완료 모양으로 머무는 시간(결정 ① 0.35초) */
export const HOLD = { complete: 350 } as const

export const EASE = {
  out: Easing.bezier(0.2, 0, 0, 1),
  in: Easing.bezier(0.4, 0, 1, 1),
  keyboard: Easing.bezier(0.17, 0.59, 0.4, 0.77)
} as const

const sp = (duration: number, dampingRatio: number): WithSpringConfig => ({ duration, dampingRatio, reduceMotion: ReduceMotion.System })
export const SPRING = {
  snappy: sp(350, 0.9),
  smooth: sp(450, 1),
  pop: sp(380, 0.55),
  /** 메뉴·팝오버 열림 — 살짝 넘침 [영상 실측] */
  menu: sp(300, 0.78),
  /** 서랍 놓음 [영상 실측 250 감속] */
  drawer: sp(250, 1),
  /** 캘린더 한 달 넘김 [영상 실측 180~330] */
  page: sp(300, 1)
} as const

export const timing = (duration: number, easing = EASE.out): WithTimingConfig => ({ duration, easing, reduceMotion: ReduceMotion.System })

export const PRESS = {
  /** 스크롤 안 행: 강조 켜기 전 기다림 */
  rowDelay: 100,
  button: 0.94,
  fab: 0.92,
  card: 0.97
} as const

/** 끝을 넘겨 끌 때 고무줄 저항 */
export const RUBBER = 0.25

/** OS 동작 줄이기 또는 성장 ⋯ 움직임 줄이기 스위치(39 §2.4) */
export const useReducedMotion = useMotionReduced

/** 옅게 + 살짝 커지며 나타남(빈 상태 0.96, + 버튼 0.8 — 39 §4.8·§4.9). Reanimated entering 함수 */
export function popIn(from: number, duration: number = DUR.move) {
  return () => {
    'worklet'
    return {
      initialValues: { opacity: 0, transform: [{ scale: from }] },
      animations: { opacity: withTiming(1, { duration, easing: EASE.out, reduceMotion: ReduceMotion.System }), transform: [{ scale: withTiming(1, { duration, easing: EASE.out, reduceMotion: ReduceMotion.System }) }] }
    }
  }
}
