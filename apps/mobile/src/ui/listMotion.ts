// 목록 넣기·빼기·접기 전환(39 §4.8): 행은 옅게 나타나고 옅게 빠지며, 나머지는 250ms 감속으로 미끄러진다 [영상 실측 묶음 펼침 250ms].
// 처음 그릴 때·보기를 바꿀 때·한 번에 많이 바뀔 때(동기화 첫 내려받기)는 전환을 끈다 — 화면 전체가 깜빡이지 않게.
import { useEffect, useRef, useState } from 'react'
import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated'
import { DUR, EASE } from './motion'

export const rowEnter = FadeIn.duration(DUR.base).reduceMotion(ReduceMotion.System)
export const rowExit = FadeOut.duration(DUR.base).easing(EASE.in).reduceMotion(ReduceMotion.System)
export const rowLayout = LinearTransition.duration(DUR.move).easing(EASE.out).reduceMotion(ReduceMotion.System)
/** 묶음 카드 높이·자리(펼침·접힘, 아래 카드 밀림) — 카드 몇 장에만 붙인다(행마다 아님, 39 §4.8 · §11.4-8) */
export const groupLayout = LinearTransition.duration(DUR.group).easing(EASE.out).reduceMotion(ReduceMotion.System)

/** 이 행 수를 넘는 목록은 전환 없이(성능) */
const MAX_ROWS = 80
/** 한 번에 이만큼 넘게 바뀌면 그 차례는 전환 없이 */
const BIG_JUMP = 30
const ON: ListMotion = { entering: rowEnter, exiting: rowExit, layout: rowLayout, card: groupLayout }
/** 행이 많을 때: 행 전환은 끄고 묶음 카드 펼침·접힘만 */
const CARDS: ListMotion = { card: groupLayout }
const OFF: ListMotion = {}

export type ListMotion = { entering?: typeof rowEnter; exiting?: typeof rowExit; layout?: typeof rowLayout; card?: typeof groupLayout }

/**
 * key(보기)가 바뀌거나 처음 그릴 때는 잠깐 끄고, 그 뒤부터 켠다. count = 목록의 모든 행 수(접힌 묶음 포함 —
 * 묶음을 접고 펼 때 수가 크게 바뀌어 전환이 꺼지지 않게).
 */
export function useListMotion(key: string, count: number): ListMotion {
  const [ready, setReady] = useState(false)
  const last = useRef(count)
  const jump = Math.abs(count - last.current) > BIG_JUMP
  useEffect(() => { last.current = count }, [count])
  useEffect(() => {
    setReady(false)
    const t = setTimeout(() => setReady(true), 400)
    return () => clearTimeout(t)
  }, [key])
  // 늘 같은 두 객체 중 하나 — 행 memo가 깨지지 않게(39 §11)
  return !ready || jump ? OFF : count > MAX_ROWS ? CARDS : ON
}
