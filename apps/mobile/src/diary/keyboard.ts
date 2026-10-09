// 28 §8.4·§8.5 키보드: 빠른 답·입력창·도구 막대는 늘 키보드 바로 위, 키보드를 끌어 내리면 같이 내려간다.
// 39 §11 규칙 1: 움직이는 건 transform만 — 아래 덩어리는 useAnimatedKeyboard 높이로 translateY(UI 스레드, 끌어 내리기도 따라감).
// 스크롤 여백(대화가 덩어리 뒤에 숨지 않게)은 키보드가 뜨고 질 때 한 번씩만 바꾼다(프레임마다 레이아웃 바꾸지 않음).
import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated'

/** 아래 고정 덩어리: 키보드가 오르면 (키보드 높이 − 아래 안전 영역)만큼 올라간다. 덩어리는 아래 안전 영역만큼 바닥 여백을 가진다 */
export function useKeyboardLift(bottomInset: number) {
  const kb = useAnimatedKeyboard()
  return useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(0, kb.height.value - bottomInset) }] }), [bottomInset])
}

/** 지금 키보드 높이(뜨고 질 때만 바뀜) — 스크롤 여백·키보드 있을 때 숨길 것에 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e.endCoordinates.height))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  return h
}
