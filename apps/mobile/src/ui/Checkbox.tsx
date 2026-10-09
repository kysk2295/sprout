// 체크박스(21 §2·§3, 44 §4 — 22, 모서리 7, 테두리 2px = 우선순위 색, 안쪽 8% 같은 색, 없음 = 진한 선), 누르는 칸 44.
// 44 §4: 완료 = 강조 채움 + 흰 체크. 체크되는 순간 상자 0.88 → 1.04 → 1 스프링(움직임 줄이기면 바로).
// 움직임(39 §4.1): 손가락 닿음 → 상자 0.88, 체크되면 상자가 채워지고(120ms) 흰 ✓가 톡 튐(0.6 → 1, SPRING.pop), 상자도 0.88 → 1.
// 완료 직후 머무는 동안(pending)과 빛남(flash)은 우선순위 색으로 채움, 완료 묶음에서는 회색.
import { Check } from 'lucide-react-native'
import { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { alpha, M, priorityColor, R } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from './haptics'
import { playComplete } from './sound'
import { DUR, SPRING, timing } from './motion'

export function Checkbox(props: { priority: number; done: boolean; onPress?: () => void; size?: number; label?: string; disabled?: boolean; flash?: boolean; /** 완료 모양으로 머무는 중(39 §4.1-3) */ pending?: boolean }) {
  const p = usePalette()
  const size = props.size ?? M.check
  const color = props.priority ? priorityColor(p, props.priority) : p.borderStrong
  const checked = props.done || !!props.pending
  const fill = p.accent
  const emptyBg = props.priority ? alpha(color, 0.08) : alpha(color, 0)
  const on = useSharedValue(checked ? 1 : 0)
  const box = useSharedValue(1)
  const mark = useSharedValue(checked ? 1 : 0)
  useEffect(() => {
    on.value = withTiming(checked ? 1 : 0, timing(DUR.fast))
    if (checked) {
      mark.value = 0.6
      mark.value = withSpring(1, SPRING.pop)
      box.value = withSequence(withSpring(1.04, SPRING.snappy), withSpring(1, SPRING.pop))
    } else mark.value = withTiming(0, timing(DUR.fast))
  }, [checked]) // eslint-disable-line react-hooks/exhaustive-deps
  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [emptyBg, fill]),
    borderColor: interpolateColor(on.value, [0, 1], [color, fill]),
    transform: [{ scale: box.value }]
  }), [color, fill, emptyBg])
  const markStyle = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: mark.value }] }))
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: props.disabled }}
      accessibilityLabel={props.label ?? '완료'}
      disabled={props.disabled || !props.onPress}
      onPress={() => { if (!checked) { hx.tap(); playComplete() } props.onPress?.() }}
      onPressIn={() => { box.value = withTiming(0.88, timing(DUR.fast)) }}
      onPressOut={() => { if (!checked) box.value = withSpring(1, SPRING.snappy) }}
      style={s.hit}
      hitSlop={6}
    >
      <Animated.View style={[s.box, { width: size, height: size, borderRadius: size >= 20 ? R.check : Math.round(size * 0.3) }, boxStyle]}>
        <Animated.View style={markStyle}><Check size={Math.round(size * 0.68)} color={p.onAccent} strokeWidth={3.2} /></Animated.View>
      </Animated.View>
    </Pressable>
  )
}
const s = StyleSheet.create({
  hit: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6, marginRight: -6 },
  box: { borderRadius: R.check, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }
})
