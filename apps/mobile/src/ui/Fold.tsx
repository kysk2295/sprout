// 접고 펴는 덩어리(서랍 폴더·필터·태그 — 39 §4.8 · §11.5): 할 일 묶음 카드(GroupCard)와 같은 값.
// ⌄는 하나를 돌리고(-90° ↔ 0, DUR.group 200ms 감속), 안의 줄은 한 번 펼친 뒤엔 접어도 그대로 두고(높이 0 + 덩어리 overflow hidden),
// opacity만 움직인다. 덩어리와 그 아래 덩어리에 `groupLayout`을 붙여 높이·자리가 200ms 감속으로 따라온다(줄마다 전환 없음).
import { ChevronDown } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { DUR, timing } from './motion'

export { groupLayout } from './listMotion'

export function FoldChevron(props: { open: boolean; size: number; color: string }) {
  const rot = useSharedValue(props.open ? 0 : -90)
  useEffect(() => { rot.value = withTiming(props.open ? 0 : -90, timing(DUR.group)) }, [props.open, rot])
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))
  return <Animated.View style={st}><ChevronDown size={props.size} color={props.color} /></Animated.View>
}

export function FoldBody(props: { open: boolean; children?: ReactNode }) {
  const { open } = props
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  const fade = useSharedValue(open ? 1 : 0)
  useEffect(() => { fade.value = withTiming(open ? 1 : 0, timing(open ? DUR.group : DUR.fast)) }, [open, fade])
  const st = useAnimatedStyle(() => ({ opacity: fade.value }))
  if (!mounted) return null
  return (
    <Animated.View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={[open ? null : s.shut, st]}>
      {props.children}
    </Animated.View>
  )
}
const s = StyleSheet.create({ shut: { height: 0 } })
