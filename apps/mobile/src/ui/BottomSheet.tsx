// 아래 시트(시안 키트 .m-sheet — 위 모서리 22, 잡는 막대): 두 높이(중간 · 전체), 잡는 막대·머리를 끌어 오르내리고 아래로 끌면 닫힘.
// 경로(formSheet)가 아닌 화면 안에서 띄우는 시트 — 수집 항목 상세(26 C4), AI 비서 빠른 진입(27 D3)이 쓴다.
// 키보드가 올라오면 시트 바닥이 키보드 위로 올라간다. 모션 감소 설정이면 튕김 없이 바로.
import { useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Keyboard, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

const SPRING = { damping: 24, stiffness: 240, mass: 0.9 }

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
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates.height))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  const snap = (to: number) => { h.value = reduce ? to : withSpring(to, SPRING); props.onFull?.(to === fullH) }
  useEffect(() => {
    if (props.visible) { setMounted(true); h.value = 0; requestAnimationFrame(() => snap(props.startFull ? fullH : midH)) }
    else if (mounted) { h.value = withTiming(0, { duration: reduce ? 0 : 180 }); const t = setTimeout(() => setMounted(false), reduce ? 0 : 190); return () => clearTimeout(t) }
  }, [props.visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => props.onClose()
  const settle = (v: number, vy: number) => {
    if (v < midH * 0.6 || (vy > 900 && v < midH + 40)) return close()
    if (vy < -600) return snap(fullH)
    if (vy > 600) return snap(midH)
    snap(Math.abs(v - fullH) < Math.abs(v - midH) ? fullH : midH)
  }
  const pan = Gesture.Pan()
    .onStart(() => { start.value = h.value })
    .onUpdate((e) => { h.value = Math.max(0, Math.min(fullH + 20, start.value - e.translationY)) })
    .onEnd((e) => { scheduleOnRN(settle, h.value, e.velocityY) })

  const room = H - insets.top - 10 - kb
  const sheetStyle = useAnimatedStyle(() => ({ height: Math.min(h.value, room) }), [room])
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, h.value / Math.max(1, midH)) }))
  if (!mounted) return null
  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, scrimStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal accessibilityLabel={props.label} style={[s.sheet, { backgroundColor: p.sheetBg, bottom: kb }, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View>
              <View style={s.grabWrap}><View style={[s.grab, { backgroundColor: p.textTertiary }]} /></View>
              {props.head}
            </View>
          </GestureDetector>
          <View style={{ flex: 1 }}>{props.children}</View>
          {props.footer ? <View style={{ paddingBottom: kb ? 8 : Math.max(insets.bottom, 12) }}>{props.footer}</View> : null}
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
