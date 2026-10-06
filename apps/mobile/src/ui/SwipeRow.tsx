// 스와이프 행(21 §4.2 — 틱틱 기본값, 움직임은 39 §4.2)
// - 오른쪽으로 밀기 → 왼쪽에 완료(초록)·고정(노랑). 행 폭 40% 넘으면 첫 칸(완료)이 행 전체로 늘어나고 흔들림, 놓으면 행이 오른쪽 밖으로 나간 뒤 실행
// - 왼쪽으로 밀기 → 오른쪽에 이동(파랑)·삭제(빨강)·날짜(주황). 끝까지 밀어도 실행하지 않고 열린 채(실수 삭제 방지)
// - 놓을 때 손가락 속도를 본다(빠르게 튕기면 짧게 밀어도 열림·닫힘). 칸 아이콘은 드러난 만큼 커지며 나타남
// - 칸은 아이콘만, 폭 60. 다른 행을 열거나 스크롤하면 닫힌다. 모든 계산은 UI 스레드(워클릿)
// 39 §11 성능 규칙: 끄는 동안 바뀌는 값은 transform·opacity뿐이다(폭·위치 같은 레이아웃 값을 매 프레임 바꾸지 않음).
//   칸 판은 행 전체 폭으로 깔아 두고, "창"(overflow hidden)을 transform으로 옮겨 드러난 만큼만 보이게 한다.
//   제스처는 렌더마다 새로 만들지 않는다(useMemo) — 목록이 다시 그려질 때 행마다 제스처를 다시 붙이지 않게.
import { Check } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { hx } from './haptics'
import { DUR, EASE, RUBBER, SPRING, timing } from './motion'

export type SwipeAction = { key: string; color: string; icon: ReactNode; label: string; onPress: () => void; /** 누르면 행이 그 쪽 밖으로 밀려 나간 뒤 실행(삭제) */ leaves?: boolean }
const CELL_SQ = 60
const CELL_ROUND = 48
const FULL = 0.4
const VEL = 400

// 열린 행은 하나만
let openRow: (() => void) | null = null
export const closeOpenRow = () => { openRow?.(); openRow = null }

export function SwipeRow(props: {
  children: ReactNode
  left?: SwipeAction[] // 오른쪽으로 밀면 보이는 칸
  right?: SwipeAction[] // 왼쪽으로 밀면 보이는 칸
  onFullSwipe?: () => void // 오른쪽 끝까지 = 완료
  fullLabel?: string
  fullColor?: string
  enabled?: boolean
  /** 둥근 칸(서랍 리스트·태그 행 — research 34 §3.5 [영상 실측]): 바탕 없이 지름 40 원 */
  round?: boolean
}) {
  const left = props.left ?? []
  const right = props.right ?? []
  const tx = useSharedValue(0)
  const width = useSharedValue(360)
  const start = useSharedValue(0)
  const armed = useSharedValue(0)
  const fullP = useSharedValue(0)
  const hasFull = !!props.onFullSwipe
  const nL = left.length
  const nR = right.length
  const alive = useRef(true)
  const CELL = props.round ? CELL_ROUND : CELL_SQ
  const enabled = props.enabled !== false && (nL > 0 || nR > 0)

  const close = useCallback(() => { tx.value = withSpring(0, SPRING.snappy) }, [tx])
  const onOpened = useCallback(() => {
    hx.tap()
    if (openRow && openRow !== close) openRow()
    openRow = close
  }, [close])
  const tap = useCallback(() => hx.tap(), [])
  // 실행 뒤 행이 남아 있으면(반복 할 일·완료 취소) 제자리로 미끄러져 돌아온다 — 순간 복귀 없음
  const comeBack = useCallback(() => {
    setTimeout(() => { if (alive.current) { fullP.value = withTiming(0, timing(DUR.base)); tx.value = withSpring(0, SPRING.snappy) } }, 500)
  }, [tx, fullP])
  const fullRef = useRef(props.onFullSwipe)
  fullRef.current = props.onFullSwipe
  const full = useCallback(() => { fullRef.current?.(); comeBack() }, [comeBack])
  useEffect(() => () => { alive.current = false; if (openRow === close) openRow = null }, [close])

  const pan = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onStart(() => {
      start.value = tx.value
      armed.value = 0
    })
    .onUpdate((e) => {
      let x = start.value + e.translationX
      if (nL === 0 && x > 0) x = 0
      if (nR === 0 && x < 0) x = 0
      const minX = -nR * CELL
      if (x < minX) x = minX + (x - minX) * RUBBER
      const maxX = hasFull ? width.value : nL * CELL
      if (x > maxX) x = maxX + (x - maxX) * RUBBER
      tx.value = x
      const past = hasFull && x > width.value * FULL ? 1 : 0
      if (past !== armed.value) {
        armed.value = past
        fullP.value = withSpring(past, SPRING.snappy)
        scheduleOnRN(tap)
      }
    })
    .onEnd((e) => {
      const x = tx.value
      const v = e.velocityX
      if (hasFull && x > width.value * FULL && v > -VEL) {
        tx.value = withTiming(width.value, { duration: DUR.base, easing: EASE.out })
        scheduleOnRN(full)
        return
      }
      fullP.value = withSpring(0, SPRING.snappy)
      const openL = nL > 0 && x > 0 && (x > CELL * nL * 0.5 || (v > VEL && x > 8))
      const openR = nR > 0 && x < 0 && (-x > CELL * nR * 0.5 || (v < -VEL && x < -8))
      if (openL && !(v < -VEL)) {
        tx.value = withSpring(nL * CELL, { ...SPRING.snappy, velocity: v })
        scheduleOnRN(onOpened)
      } else if (openR && !(v > VEL)) {
        tx.value = withSpring(-nR * CELL, { ...SPRING.snappy, velocity: v })
        scheduleOnRN(onOpened)
      } else tx.value = withSpring(0, { ...SPRING.snappy, velocity: v })
    }), [enabled, nL, nR, hasFull, CELL, tx, start, armed, width, fullP, tap, full, onOpened])

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))
  // 칸 판은 행 전체 폭. 바깥 창을 (드러난 폭 − 행 폭)만큼 옮기고 안쪽은 거꾸로 옮겨, 칸은 제자리에 있고 드러난 부분만 보인다
  const leftWin = useAnimatedStyle(() => {
    const r = Math.max(tx.value, 0)
    return { opacity: r > 0 ? 1 : 0, transform: [{ translateX: Math.min(r, width.value) - width.value }] }
  })
  const leftIn = useAnimatedStyle(() => ({ transform: [{ translateX: width.value - Math.min(Math.max(tx.value, 0), width.value) }] }))
  const rightWin = useAnimatedStyle(() => {
    const r = Math.max(-tx.value, 0)
    return { opacity: r > 0 ? 1 : 0, transform: [{ translateX: width.value - Math.min(r, width.value) }] }
  })
  const rightIn = useAnimatedStyle(() => ({ transform: [{ translateX: Math.min(Math.max(-tx.value, 0), width.value) - width.value }] }))
  // 칸 아이콘: 드러난 폭이 칸 폭의 60%가 될 때까지 손가락에 비례해 나타남
  const iconL = useAnimatedStyle(() => {
    const r = interpolate(tx.value, [0, CELL * 0.6], [0, 1], Extrapolation.CLAMP)
    return { opacity: r, transform: [{ scale: 0.7 + 0.3 * r }] }
  })
  const iconR = useAnimatedStyle(() => {
    const r = interpolate(-tx.value, [0, CELL * 0.6], [0, 1], Extrapolation.CLAMP)
    return { opacity: r, transform: [{ scale: 0.7 + 0.3 * r }] }
  })
  // 끝까지: 첫 칸이 행 전체(드러난 폭)로 늘어남 — 이것도 창 옮기기(폭은 그대로)
  const fullEdge = () => {
    'worklet'
    return interpolate(fullP.value, [0, 1], [CELL, Math.max(tx.value, CELL)])
  }
  const fullWin = useAnimatedStyle(() => ({ opacity: fullP.value > 0.01 ? 1 : 0, transform: [{ translateX: fullEdge() - width.value }] }))
  const fullIn = useAnimatedStyle(() => ({ transform: [{ translateX: width.value - fullEdge() }] }))

  const run = (a: SwipeAction, side: 1 | -1) => {
    if (a.leaves) {
      tx.value = withTiming(side * width.value, { duration: DUR.base, easing: EASE.in })
      setTimeout(() => { a.onPress(); comeBack() }, DUR.base)
      return
    }
    close()
    a.onPress()
  }
  return (
    <View style={s.wrap} onLayout={(e) => { width.value = e.nativeEvent.layout.width }}>
      {nL ? (
        <Animated.View style={[s.win, leftWin]}>
          <Animated.View style={[s.side, leftIn]}>
            {left.map((a) => (
              <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => run(a, 1)} style={[s.cell, { backgroundColor: a.color }]}>
                <Animated.View style={iconL}>{a.icon}</Animated.View>
              </Pressable>
            ))}
            <View style={[s.grow, { backgroundColor: left[nL - 1]?.color }]} />
            {hasFull ? (
              <Animated.View pointerEvents="none" style={[s.win, fullWin]}>
                <Animated.View style={[s.full, { backgroundColor: props.fullColor ?? left[0]?.color }, fullIn]}>
                  <Check size={22} color="#fff" />
                  <Text style={s.fullText} numberOfLines={1}>{props.fullLabel ?? '놓으면 완료'}</Text>
                </Animated.View>
              </Animated.View>
            ) : null}
          </Animated.View>
        </Animated.View>
      ) : null}
      {nR ? (
        <Animated.View style={[s.win, rightWin]}>
          <Animated.View style={[s.side, { justifyContent: 'flex-end' }, rightIn]}>
            <View style={[s.grow, { backgroundColor: props.round ? 'transparent' : right[0]?.color }]} />
            {right.map((a) => (
              <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => run(a, -1)} style={[s.cell, { width: CELL }, props.round ? null : { backgroundColor: a.color }]}>
                <Animated.View style={[iconR, props.round ? [s.circle, { backgroundColor: a.color }] : null]}>{a.icon}</Animated.View>
              </Pressable>
            ))}
          </Animated.View>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{props.children}</Animated.View>
      </GestureDetector>
    </View>
  )
}
const s = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  // 창 = 행 전체 폭, 넘친 부분은 잘림. 안쪽 판도 행 전체 폭
  win: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  side: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  cell: { width: CELL_SQ, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 19, gap: 8 },
  fullText: { color: '#fff', fontSize: 14, fontWeight: '600' }
})
