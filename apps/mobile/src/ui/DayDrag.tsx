// 월 보기 그날 판의 할 일을 끌어 다른 날로(39 §4.11 · [영상 실측 research 37]).
// 길게 누름 350ms → 그대로 떼면 메뉴, 8pt 넘게 움직이면 끌기:
// - 행 사본 카드가 잡은 간격 그대로 손가락을 따라가고(x·y), 원래 행은 빈자리
// - + 버튼 자리에 회색 ✕(그 위에 놓으면 취소)
// - 손가락이 판 밖으로 나가면 판이 닫히고(onLeave), 닫힌 달 위에서는 손가락 밑 날짜에 강조색 원(hot)
// - 날짜 위에 놓으면 그 날로(onDrop), 카드는 제자리에서 0.9배로 줄며 170ms에 사라짐
// 39 §11: 칸 판정은 UI 스레드(잡을 때 잰 자리), 칸·✕ 위가 바뀔 때만 JS로 알림. 카드 자리는 잡을 때 한 번, 끄는 동안 transform·opacity만.
import { X } from 'lucide-react-native'
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from './haptics'
import { DUR, popIn, SPRING, timing } from './motion'
import type { Rect } from './Menu'

/** 창 좌표(잡을 때 한 번 잼). 격자는 닫힌 달 기준 */
export type DayDragGeo = {
  gx: number; gy: number; cw: number; rowH: number; weeks: number; maxY: number
  pTop: number; pBottom: number
  xx: number; xy: number; xr: number
  ox: number; oy: number
}
export type DayDragMeasure = (done: (g: DayDragGeo) => void) => void

const DROP_OUT = timing(170) // [영상 실측 research 37 §5: 줄며 옅어짐 약 170ms]
const xIn = popIn(0.8, DUR.base)

export function useDayDrag(opts: {
  /** 판이 열린 정도(0 = 닫힘) — 닫힌 달 위에서만 날짜를 고른다 */
  openK: SharedValue<number>
  measure: DayDragMeasure
  /** 칸 번호 → 날짜(지금 달 격자) */
  dayAt: (idx: number) => string | undefined
  /** 끄는 행이 원래 있던 날 */
  fromDay: string
  onMenu: (item: unknown, rect: Rect) => void
  onLeave: () => void
  onDrop: (item: unknown, day: string) => void
}) {
  const rows = useRef(new Map<string, { view: View | null; item: unknown }>())
  const active = useSharedValue<string | null>(null)
  const moved = useSharedValue(0)
  const left = useSharedValue(0)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const lift = useSharedValue(0)
  const fade = useSharedValue(0)
  const hotIdx = useSharedValue(-1)
  const overX = useSharedValue(0)
  const geo = useSharedValue<DayDragGeo | null>(null)
  const [ghost, setGhost] = useState<{ id: string; item: unknown; x: number; y: number; w: number; h: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hot, setHot] = useState<string | null>(null)
  const [onX, setOnX] = useState(false)
  const rect = useRef<Rect | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const openK = opts.openK

  const register = useCallback((id: string, item: unknown, view: View | null) => {
    if (view) rows.current.set(id, { view, item })
    else rows.current.delete(id)
  }, [])

  /** 잡은 순간: 행·격자·판·✕ 자리를 창 좌표로 재서 UI 스레드에 넘긴다 */
  const turn = useRef(0) // 잰 값이 늦게 와도 이미 끝난 끌기에는 쓰지 않는다
  const begin = useCallback((id: string) => {
    hx.lift()
    const r = rows.current.get(id)
    if (!r?.view) return
    const my = ++turn.current
    r.view.measureInWindow((x, y, w, h) => {
      if (my !== turn.current) return
      rect.current = { x, y, width: w, height: h }
      optsRef.current.measure((g) => {
        if (my !== turn.current) return
        geo.value = g
        setGhost({ id, item: r.item, x: x - g.ox, y: y - g.oy, w, h })
      })
    })
  }, [geo])
  const startMove = useCallback(() => setDragging(true), [])
  const leave = useCallback(() => optsRef.current.onLeave(), [])
  const hotChanged = useCallback((idx: number) => {
    const d = idx >= 0 ? optsRef.current.dayAt(idx) ?? null : null
    setHot(d)
    if (d) hx.tick()
  }, [])
  const xChanged = useCallback((on: boolean) => { setOnX(on); if (on) hx.tick() }, [])
  const clear = useCallback(() => {
    active.value = null
    setGhost(null)
    setHot(null)
    setOnX(false)
  }, [active])
  const end = useCallback((id: string, didMove: boolean, idx: number, cancel: boolean, wasLeft: boolean) => {
    setDragging(false)
    const r = rows.current.get(id)
    if (!didMove) {
      turn.current++
      clear()
      if (r && rect.current) optsRef.current.onMenu(r.item, rect.current)
      return
    }
    const day = idx >= 0 ? optsRef.current.dayAt(idx) : undefined
    setHot(null)
    setOnX(false)
    if (r && day && !cancel && day !== optsRef.current.fromDay) {
      hx.tap()
      optsRef.current.onDrop(r.item, day)
    }
    if (!wasLeft && !day) {
      // 판 안에서 놓음: 카드가 원래 행 자리로 돌아가 붙는다
      tx.value = withSpring(0, SPRING.snappy)
      ty.value = withSpring(0, SPRING.snappy, (fin) => { if (fin) scheduleOnRN(clear) })
      return
    }
    fade.value = withTiming(1, DROP_OUT, (fin) => { if (fin) scheduleOnRN(clear) })
  }, [clear, fade, tx, ty])

  const gestureFor = useCallback((id: string) => Gesture.Pan()
    .activateAfterLongPress(350)
    .onStart(() => {
      active.value = id
      moved.value = 0
      left.value = 0
      tx.value = 0
      ty.value = 0
      fade.value = 0
      hotIdx.value = -1
      overX.value = 0
      geo.value = null
      lift.value = withSpring(1, SPRING.snappy)
      scheduleOnRN(begin, id)
    })
    .onUpdate((e) => {
      if (!moved.value) {
        if (Math.abs(e.translationX) + Math.abs(e.translationY) <= 8) return
        moved.value = 1
        scheduleOnRN(startMove)
      }
      tx.value = e.translationX
      ty.value = e.translationY
      const g = geo.value
      if (!g) return
      const fx = e.absoluteX
      const fy = e.absoluteY
      if (!left.value && (fy < g.pTop || fy > g.pBottom)) {
        left.value = 1
        scheduleOnRN(leave)
      }
      const dx = fx - g.xx
      const dy = fy - g.xy
      const ox = dx * dx + dy * dy < g.xr * g.xr ? 1 : 0
      if (ox !== overX.value) {
        overX.value = ox
        scheduleOnRN(xChanged, ox === 1)
      }
      let idx = -1
      if (left.value && !ox && openK.value < 0.05) {
        const c = Math.floor((fx - g.gx) / g.cw)
        const r = Math.floor((fy - g.gy) / g.rowH)
        if (c >= 0 && c < 7 && r >= 0 && r < g.weeks && fy < g.maxY) idx = r * 7 + c
      }
      if (idx !== hotIdx.value) {
        hotIdx.value = idx
        scheduleOnRN(hotChanged, idx)
      }
    })
    .onEnd(() => {
      scheduleOnRN(end, id, moved.value === 1, hotIdx.value, overX.value === 1, left.value === 1)
    })
    .onFinalize(() => {
      lift.value = withTiming(0, { duration: DUR.base })
    }), [active, moved, left, tx, ty, fade, hotIdx, overX, geo, lift, begin, startMove, leave, xChanged, hotChanged, end, openK])

  const state = useMemo(() => ({ active, moved, tx, ty, lift, fade }), [active, moved, tx, ty, lift, fade])
  const api = useMemo(() => ({ register, gestureFor, state }), [register, gestureFor, state])
  /** 끄는 동안 판(행 제스처가 든 뷰)을 내리지 않는다 — 내리면 터치가 끊긴다 */
  const holding = ghost !== null
  return { api, ghost, dragging, hot, onX, holding }
}
export type DayDragApi = ReturnType<typeof useDayDrag>['api']

/** 판의 할 일 행 하나: 길게 눌러 끌기, 끄는 동안 원래 자리는 비어 보인다 */
export const DayDragRow = memo(function DayDragRow(props: { id: string; item: unknown; drag: DayDragApi; children: ReactNode }) {
  const { register, gestureFor, state } = props.drag
  const { id, item } = props
  const { active, moved } = state
  const style = useAnimatedStyle(() => ({ opacity: active.value === id && moved.value ? 0 : 1 }))
  const ref = useCallback((v: View | null) => register(id, item, v), [register, id, item])
  const gesture = useMemo(() => gestureFor(id), [gestureFor, id])
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={ref} collapsable={false} style={style}>{props.children}</Animated.View>
    </GestureDetector>
  )
})

/** 떠 있는 카드 + ✕(+ 버튼 자리). 부모는 끄는 동안 + 버튼을 숨긴다 */
export function DayDragLayer(props: { drag: DayDragApi; ghost: { x: number; y: number; w: number; h: number } | null; dragging: boolean; onX: boolean; fabBottom: number; children: ReactNode }) {
  const p = usePalette()
  const { tx, ty, lift, fade, moved } = props.drag.state
  const card = useAnimatedStyle(() => ({
    opacity: moved.value ? 1 - fade.value : 0,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: (1 + 0.03 * lift.value) * (1 - 0.1 * fade.value) }],
    shadowOpacity: (p.dark ? 0.5 : 0.22) * lift.value
  }), [p.dark])
  const g = props.ghost
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {props.dragging ? (
        <Animated.View entering={xIn} exiting={FadeOut.duration(DUR.fast)} style={[s.x, { bottom: props.fabBottom }]}>
          <XButton on={props.onX} />
        </Animated.View>
      ) : null}
      {g ? (
        <Animated.View style={[s.ghost, { left: g.x, top: g.y, width: g.w, height: g.h }, card]}>
          <View style={[s.ghostIn, { backgroundColor: p.dark ? p.sheetBg : p.cardBg }]}>{props.children}</View>
        </Animated.View>
      ) : null}
    </View>
  )
}

function XButton(props: { on: boolean }) {
  const p = usePalette()
  const style = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(props.on ? 1.12 : 1, SPRING.snappy) }] }), [props.on])
  return (
    <Animated.View style={[s.xIn, { backgroundColor: p.dark ? 'rgba(120,120,128,0.55)' : 'rgba(60,60,67,0.35)' }, style]}>
      <X size={26} color="#fff" strokeWidth={2.4} />
    </Animated.View>
  )
}

const s = StyleSheet.create({
  ghost: { position: 'absolute', borderRadius: 12, shadowColor: '#000', shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 14 },
  ghostIn: { flex: 1, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
  x: { position: 'absolute', right: M.fabRight },
  xIn: { width: M.fab, height: M.fab, borderRadius: M.fab / 2, alignItems: 'center', justifyContent: 'center' }
})
