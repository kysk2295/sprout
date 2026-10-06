// 아래 시트(시안 키트 .m-sheet — 위 모서리 22, 잡는 막대): 두 높이(중간 · 전체), 잡는 막대·머리를 끌어 오르내리고 아래로 끌면 닫힘.
// 경로(formSheet)가 아닌 화면 안에서 띄우는 시트 — 수집 항목 상세(26 C4), AI 비서 빠른 진입(27 D3)이 쓴다.
// 키보드가 올라오면 시트 바닥이 키보드 위로 올라간다. 모션 감소 설정이면 튕김 없이 바로.
// 39 §4.4 · G10: 판 높이는 고정하고 위치(translateY)만 움직인다 — 끄는 동안 안 글이 다시 줄바꿈되지 않게. 바닥 줄은 보이는 아래 끝에 붙는다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Keyboard, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { M } from '../theme/palette'
import { DUR, EASE, RUBBER, SPRING as MS } from './motion'
import { usePalette } from '../theme/ThemeProvider'


export function BottomSheet(props: {
  visible: boolean
  onClose: () => void
  /** 화면 높이 대비 중간 높이(0~1). 전체는 위 안전 영역 아래까지 */
  mid?: number
  /** 처음부터 전체 높이 */
  startFull?: boolean
  onFull?: (full: boolean) => void
  /** 머리(끌기 영역 — 잡는 막대 아래) */
  head?: ReactNode
  children: ReactNode
  /** 바닥 고정 줄(입력창·도구 줄). 키보드 위에 붙는다 */
  footer?: ReactNode
  label?: string
}) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const insetsBottom = useRef(insets.bottom)
  insetsBottom.current = insets.bottom
  const { height: H } = useWindowDimensions()
  const fullH = H - insets.top - 10
  const midH = Math.min(fullH, H * (props.mid ?? 0.6))
  const h = useSharedValue(0)
  const start = useSharedValue(0)
  const [kb, setKb] = useState(0)
  const [reduce, setReduce] = useState(false)
  const [mounted, setMounted] = useState(props.visible)

  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduce) }, [])
  useEffect(() => {
    // Android(전체 화면 그리기)는 키보드 높이에 아래 제스처 막대가 빠져 있어 그만큼 더한다 — 안 더하면 입력창이 키보드에 반쯤 가린다
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates.height + (Platform.OS === 'android' ? insetsBottom.current : 0)))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  const [target, setTarget] = useState(0)
  const snap = (to: number, v = 0) => { setTarget(to); h.value = reduce ? to : withSpring(to, { ...MS.smooth, velocity: -v }); props.onFull?.(to === fullH) }
  useEffect(() => {
    if (props.visible) { setMounted(true); h.value = 0; requestAnimationFrame(() => snap(props.startFull ? fullH : midH)) }
    else if (mounted) { h.value = withTiming(0, { duration: reduce ? 0 : DUR.move, easing: EASE.in }); const t = setTimeout(() => setMounted(false), reduce ? 0 : DUR.move + 10); return () => clearTimeout(t) }
  }, [props.visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => props.onClose()
  const settle = (v: number, vy: number) => {
    if (v < midH * 0.6 || (vy > 900 && v < midH + 40)) return close()
    if (vy < -600) return snap(fullH, vy)
    if (vy > 600) return snap(midH, vy)
    snap(Math.abs(v - fullH) < Math.abs(v - midH) ? fullH : midH, vy)
  }
  const pan = Gesture.Pan()
    .onStart(() => { start.value = h.value })
    .onUpdate((e) => { const v = start.value - e.translationY; h.value = Math.max(0, v > fullH ? fullH + (v - fullH) * RUBBER : v) })
    .onEnd((e) => { scheduleOnRN(settle, h.value, e.velocityY) })

  const room = H - insets.top - 10 - kb
  // 판은 room 높이로 고정, 보이는 높이 h만큼만 올라와 있다. 바닥 줄은 보이는 아래 끝으로 거꾸로 옮긴다
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(0, room - h.value) }] }), [room])
  const footStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(0, room - h.value) }] }), [room])
  const hidden = Math.max(0, room - Math.min(target, room))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, h.value / Math.max(1, midH)) }))
  if (!mounted) return null
  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, scrimStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal accessibilityLabel={props.label} style={[s.sheet, { backgroundColor: p.sheetBg, bottom: kb - 40, height: room + 40 }, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View>
              <View style={s.grabWrap}><View style={[s.grab, { backgroundColor: p.textTertiary }]} /></View>
              {props.head}
            </View>
          </GestureDetector>
          <View style={{ flex: 1, marginBottom: hidden + (props.footer ? 0 : 40) }}>{props.children}</View>
          {props.footer ? <Animated.View style={[{ paddingBottom: (kb ? 8 : Math.max(insets.bottom, 12)) + 40 }, footStyle]}>{props.footer}</Animated.View> : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}
const s = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, borderTopLeftRadius: M.radiusSheet, borderTopRightRadius: M.radiusSheet, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20 },
  grabWrap: { height: 18, alignItems: 'center', justifyContent: 'center' },
  grab: { width: 36, height: 5, borderRadius: 3, opacity: 0.45 }
})
