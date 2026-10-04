// 스와이프 행(21 §4.2 — 틱틱 기본값)
// - 오른쪽으로 밀기 → 왼쪽에 완료(초록)·고정(노랑). 행 폭 40% 넘게 밀고 놓으면 바로 완료("놓으면 완료")
// - 왼쪽으로 밀기 → 오른쪽에 이동(파랑)·삭제(빨강)·날짜(주황). 끝까지 밀어도 실행하지 않고 열린 채(실수 삭제 방지)
// - 칸은 아이콘만, 폭 60. 다른 행을 열거나 스크롤하면 닫힌다. 끝 도달 지점에서 선택 틱 흔들림
import * as Haptics from 'expo-haptics'
import { Check } from 'lucide-react-native'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

export type SwipeAction = { key: string; color: string; icon: ReactNode; label: string; onPress: () => void }
const CELL = 60
const SPRING = { damping: 22, stiffness: 260, mass: 0.8 }

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
}) {
  const left = props.left ?? []
  const right = props.right ?? []
  const tx = useSharedValue(0)
  const width = useSharedValue(360)
  const start = useSharedValue(0)
  const armed = useSharedValue(0)
  const hasFull = !!props.onFullSwipe
  const nL = left.length
  const nR = right.length

  const close = useCallback(() => { tx.value = withSpring(0, SPRING) }, [tx])
  const closeRef = useRef(close)
  closeRef.current = close
  const onOpened = useCallback(() => {
    if (openRow && openRow !== closeRef.current) openRow()
    openRow = closeRef.current
  }, [])
  const tick = useCallback(() => { void Haptics.selectionAsync() }, [])
  const full = useCallback(() => {
    props.onFullSwipe?.()
    setTimeout(() => { tx.value = 0 }, 350)
  }, [props.onFullSwipe, tx])
  useEffect(() => () => { if (openRow === closeRef.current) openRow = null }, [])

  const pan = Gesture.Pan()
    .enabled(props.enabled !== false && (nL > 0 || nR > 0))
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
      if (x < minX) x = minX + (x - minX) * 0.25
      const maxX = hasFull ? width.value : nL * CELL
      if (x > maxX) x = maxX + (x - maxX) * 0.25
      tx.value = x
      const past = hasFull && x > width.value * 0.4 ? 1 : 0
      if (past !== armed.value) {
        armed.value = past
        scheduleOnRN(tick)
      }
    })
    .onEnd(() => {
      const x = tx.value
      if (hasFull && x > width.value * 0.4) {
        tx.value = withTiming(width.value, { duration: 140 })
        scheduleOnRN(full)
      } else if (x > CELL * 0.6 && nL) {
        tx.value = withSpring(nL * CELL, SPRING)
        scheduleOnRN(onOpened)
      } else if (x < -CELL * 0.6 && nR) {
        tx.value = withSpring(-nR * CELL, SPRING)
        scheduleOnRN(onOpened)
      } else tx.value = withSpring(0, SPRING)
    })

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))
  const leftStyle = useAnimatedStyle(() => ({ width: Math.max(tx.value, 0), opacity: tx.value > 0 ? 1 : 0 }))
  const rightStyle = useAnimatedStyle(() => ({ width: Math.max(-tx.value, 0), opacity: tx.value < 0 ? 1 : 0 }))
  const fullStyle = useAnimatedStyle(() => ({ opacity: hasFull && tx.value > width.value * 0.4 ? 1 : 0 }))

  const run = (a: SwipeAction) => { close(); a.onPress() }
  return (
    <View style={s.wrap} onLayout={(e) => { width.value = e.nativeEvent.layout.width }}>
      {nL ? (
        <Animated.View style={[s.side, { left: 0 }, leftStyle]}>
          {left.map((a) => (
            <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => run(a)} style={[s.cell, { backgroundColor: a.color }]}>{a.icon}</Pressable>
          ))}
          <View style={s.grow} />
          {hasFull ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.full, { backgroundColor: props.fullColor ?? left[0]?.color }, fullStyle]}>
              <Check size={22} color="#fff" />
              <Text style={s.fullText}>{props.fullLabel ?? '놓으면 완료'}</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
      {nR ? (
        <Animated.View style={[s.side, { right: 0, justifyContent: 'flex-end' }, rightStyle]}>
          {right.map((a) => (
            <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => run(a)} style={[s.cell, { backgroundColor: a.color }]}>{a.icon}</Pressable>
          ))}
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
  side: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', overflow: 'hidden' },
  cell: { width: CELL, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  full: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8 },
  fullText: { color: '#fff', fontSize: 14, fontWeight: '600' }
})
