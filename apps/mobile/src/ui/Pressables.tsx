// 누름 반응(39 §4.9): PressableScale = 버튼·카드(눌리면 작아졌다 스프링으로 돌아옴, 투명도는 안 씀),
// PressableRow = 목록 행(크기 그대로, 100ms 뒤 강조가 켜지고 떼면 서서히 빠짐 — 스크롤할 때 행이 번쩍이지 않게).
// 값은 공유 값 + withTiming/withSpring이라 UI 스레드에서 돈다.
import { forwardRef, type ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { DUR, PRESS, SPRING, timing } from './motion'

const APressable = Animated.createAnimatedComponent(Pressable)

type ScaleProps = Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children?: ReactNode; scale?: number }
export const PressableScale = forwardRef<View, ScaleProps>(function PressableScale({ style, children, scale = PRESS.button, onPressIn, onPressOut, ...rest }, ref) {
  const k = useSharedValue(1)
  const a = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }))
  return (
    <APressable
      ref={ref}
      {...rest}
      onPressIn={(e) => { k.value = withTiming(scale, timing(DUR.fast)); onPressIn?.(e) }}
      onPressOut={(e) => { k.value = withSpring(1, SPRING.snappy); onPressOut?.(e) }}
      style={[style, a]}
    >
      {children}
    </APressable>
  )
})

type RowProps = Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children?: ReactNode; bg: string; pressedBg: string; /** 강조를 계속 켜 둠(길게 누른 행 등) */ held?: boolean; flashBg?: string | null }
export function PressableRow({ style, children, bg, pressedBg, held, flashBg, onPressIn, onPressOut, ...rest }: RowProps) {
  const on = useSharedValue(0)
  const a = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(on.value, [0, 1], [bg, pressedBg]) }), [bg, pressedBg])
  return (
    <APressable
      unstable_pressDelay={PRESS.rowDelay}
      {...rest}
      onPressIn={(e) => { on.value = withTiming(1, timing(DUR.fast)); onPressIn?.(e) }}
      onPressOut={(e) => { on.value = withTiming(0, timing(DUR.base)); onPressOut?.(e) }}
      style={[style, a, held ? { backgroundColor: pressedBg } : null, flashBg ? { backgroundColor: flashBg } : null]}
    >
      {children}
    </APressable>
  )
}
