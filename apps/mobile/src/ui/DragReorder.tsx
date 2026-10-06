// 끌어서 순서 바꾸기(39 §4.3 · G15 · 결정 ③ — 같은 묶음 안 순서 + 리스트의 다른 섹션으로).
// 행을 길게 누르면(350ms) 흔들림과 함께 떠오르고, 그대로 떼면 메뉴, 8pt 넘게 움직이면 끌기:
// - 끄는 행은 화면 위 떠 있는 사본(1.03배 + 그림자)이 손가락을 따라가고, 원래 자리는 비어 보인다
// - 같은 묶음의 다른 행은 비켜 미끄러지고(SPRING.snappy), 자리 넘어갈 때마다 틱. 다른 섹션 위면 그 자리에 강조색 선
// - 놓으면 빈자리로 붙으며 가벼운 흔들림. 계산은 UI 스레드(워클릿), 쓰기는 놓은 뒤 한 번
// 하위로 만들기(오른쪽 아래로 놓기)·끄는 중 저절로 스크롤은 [다음].
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from './haptics'
import { DUR, SPRING } from './motion'

export type Slot = { id: string; group: string; y: number; h: number; x: number; w: number }
export type DropAt = { id: string; group: string; before: string | null; after: string | null }

export function useDragReorder(opts: { canCross: (from: string, to: string) => boolean; onDrop: (d: DropAt) => void; onMenu: (id: string) => void }) {
  const refs = useRef(new Map<string, { view: View | null; group: string }>())
  const slots = useSharedValue<Slot[]>([])
  const active = useSharedValue<string | null>(null)
  const from = useSharedValue<Slot | null>(null)
  const dy = useSharedValue(0)
  const lift = useSharedValue(0)
  const target = useSharedValue(-1) // 끄는 행을 뺀 slots에서 이 앞에 넣음
  const shifts = useSharedValue<Record<string, number>>({})
  const moved = useSharedValue(0)
  const [ghost, setGhost] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const optsRef = useRef(opts)
  optsRef.current = opts

  const register = useCallback((id: string, group: string, view: View | null) => {
    if (view) refs.current.set(id, { view, group })
    else refs.current.delete(id)
  }, [])

  /** 잡은 순간: 모든 행 위치를 화면 좌표로 재서 UI 스레드에 넘긴다 */
  const begin = useCallback((id: string) => {
    hx.lift()
    const entries = [...refs.current.entries()]
    const out: Slot[] = []
    let left = entries.length
    if (!left) return
    for (const [rid, r] of entries) {
      r.view?.measureInWindow((x, y, w, h) => {
        if (h > 0) out.push({ id: rid, group: r.group, x, y, w, h })
        if (--left === 0) {
          out.sort((a, b) => a.y - b.y)
          slots.value = out
          from.value = out.find((s) => s.id === id) ?? null
          setGhost(id)
        }
      })
    }
  }, [slots, from])
  const end = useCallback((id: string, didMove: boolean, k: number) => {
    setDragging(false)
    if (!didMove) { setGhost(null); optsRef.current.onMenu(id); return }
    const list = slots.value.filter((s) => s.id !== id)
    const src = slots.value.find((s) => s.id === id)
    const after = k > 0 ? list[k - 1] : null
    const before = k < list.length ? list[k] : null
    let group = src?.group ?? ''
    if (after && before && after.group !== before.group) group = after.group === src?.group ? after.group : before.group
    else group = (after ?? before)?.group ?? group
    hx.tap()
    if (src && group !== src.group && !optsRef.current.canCross(src.group, group)) { setGhost(null); return }
    optsRef.current.onDrop({ id, group, before: before && before.group === group ? before.id : null, after: after && after.group === group ? after.id : null })
    setTimeout(() => setGhost(null), DUR.base)
  }, [slots])
  const startMove = useCallback(() => setDragging(true), [])

  const gestureFor = (id: string) => Gesture.Pan()
    .activateAfterLongPress(350)
    .onStart(() => {
      active.value = id
      dy.value = 0
      moved.value = 0
      target.value = -1
      lift.value = withSpring(1, SPRING.snappy)
      scheduleOnRN(begin, id)
    })
    .onUpdate((e) => {
      if (!moved.value && Math.abs(e.translationY) + Math.abs(e.translationX) > 8) { moved.value = 1; scheduleOnRN(startMove) }
      if (!moved.value) return
      dy.value = e.translationY
      const src = from.value
      if (!src) return
      const list = slots.value.filter((s) => s.id !== id)
      const cy = src.y + src.h / 2 + e.translationY
      let k = 0
      while (k < list.length && list[k].y + list[k].h / 2 < cy) k++
      if (k !== target.value) {
        target.value = k
        scheduleOnRN(hx.tick)
        // 같은 묶음: 원래 자리와 새 자리 사이 행들이 비켜 준다
        const next: Record<string, number> = {}
        const fromIdx = slots.value.findIndex((s) => s.id === id)
        for (let i = 0; i < list.length; i++) {
          const s = list[i]
          if (s.group !== src.group) continue
          const orig = i < fromIdx ? i : i + 1 // slots 안 원래 순번
          if (orig > fromIdx && i < k) next[s.id] = -src.h
          else if (orig < fromIdx && i >= k) next[s.id] = src.h
        }
        shifts.value = next
      }
    })
    .onEnd(() => {
      scheduleOnRN(end, id, !!moved.value, target.value < 0 ? slots.value.findIndex((s) => s.id === id) : target.value)
    })
    .onFinalize(() => {
      lift.value = withTiming(0, { duration: DUR.base })
      shifts.value = {}
      active.value = null
    })

  return { register, gestureFor, ghost, dragging, state: { slots, active, from, dy, lift, target, shifts, moved } }
}
type DragState = ReturnType<typeof useDragReorder>['state']

/** 목록 행 한 줄: 길게 눌러 끌기 + 다른 행이 비켜 줄 때 미끄러짐 */
export function DragRow(props: { id: string; group: string; drag: ReturnType<typeof useDragReorder>; enabled: boolean; children: ReactNode }) {
  const { shifts, active, moved } = props.drag.state
  const id = props.id // 워클릿에는 값만(props 통째로 넘기면 children을 복사하다 실패)
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(shifts.value[id] ?? 0, SPRING.snappy) }],
    opacity: active.value === id && moved.value ? 0 : 1
  }))
  const content = (
    <Animated.View ref={(v: View | null) => props.drag.register(props.id, props.group, v)} collapsable={false} style={style}>
      {props.children}
    </Animated.View>
  )
  if (!props.enabled) return content
  return <GestureDetector gesture={props.drag.gestureFor(props.id)}>{content}</GestureDetector>
}

/** 화면 위 떠 있는 사본 + 다른 섹션에 놓일 자리 선 */
export function DragGhost(props: { state: DragState; render: (id: string) => ReactNode; id: string | null }) {
  const p = usePalette()
  const { from, moved, dy, lift, target, slots } = props.state
  const state = { from, moved, dy, lift, target, slots }
  const card = useAnimatedStyle(() => {
    const f = state.from.value
    if (!f) return { opacity: 0 }
    return {
      opacity: state.moved.value ? 1 : 0,
      top: f.y,
      left: f.x,
      width: f.w,
      transform: [{ translateY: state.dy.value }, { scale: 1 + 0.03 * state.lift.value }],
      shadowOpacity: 0.22 * state.lift.value
    }
  })
  const line = useAnimatedStyle(() => {
    const f = state.from.value
    const k = state.target.value
    if (!f || k < 0 || !state.moved.value) return { opacity: 0 }
    const list = state.slots.value.filter((s) => s.id !== f.id)
    const ref = k < list.length ? list[k] : list[list.length - 1]
    if (!ref || ref.group === f.group) return { opacity: 0 }
    const y = k < list.length ? ref.y : ref.y + ref.h
    return { opacity: 1, top: y - 1, left: ref.x + 16, width: ref.w - 32 }
  })
  if (!props.id) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[s.line, { backgroundColor: p.accent }, line]} />
      <Animated.View style={[s.ghost, { backgroundColor: p.cardBg }, card]}>{props.render(props.id)}</Animated.View>
    </View>
  )
}
const s = StyleSheet.create({
  ghost: { position: 'absolute', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 14 },
  line: { position: 'absolute', height: 2, borderRadius: 1 }
})

export type { SharedValue }
