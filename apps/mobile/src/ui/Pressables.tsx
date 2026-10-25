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

/** 기본 눌림 반응(UX 점검 P2-9): Pressable을 그대로 대신한다 — 눌린 동안 옅어짐(0.6). 스타일이 함수(이미 자기 눌림 모양)면 그대로 둔다.
 *  단추·칩·행에 반응이 없던 곳을 파일 단위로 `Pressable` → `Tap`으로 바꾼다. Android 물결은 둥근 단추 밖으로 번져 쓰지 않는다. */
export const Tap = forwardRef<View, PressableProps>(function Tap({ style, ...rest }, ref) {
  return <Pressable ref={ref} {...rest} style={typeof style === 'function' ? style : ({ pressed }) => [style, pressed && TAP_PRESSED]} />
})
const TAP_PRESSED = { opacity: 0.6 }
