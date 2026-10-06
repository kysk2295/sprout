// 내용 높이만큼의 화면 안 아래 판(39 §4.4 — G4): 어두운 덮개는 제자리에서 옅게 짙어지고, 판만 아래에서 올라온다.
// Modal animationType="slide" + 안쪽 덮개(덮개까지 같이 밀려 올라옴)를 대신한다. 아래로 끌면 손가락을 따라 내려가고 놓으면 닫히거나 돌아감.
// 닫힐 때는 판이 내려가는 움직임(250ms)이 끝난 뒤 Modal을 내린다.
import { useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { usePalette } from '../theme/ThemeProvider'
import { usePresence } from './Menu'
import { DUR, SPRING } from './motion'

export function SlideSheet(props: { visible: boolean; onClose: () => void; children: ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  const p = usePalette()
  const { shown, k, reduce } = usePresence(props.visible ? true : null, { inMs: 'snappy', outMs: DUR.move })
  const [h, setH] = useState(600)
  const drag = useSharedValue(0)
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => { drag.value = Math.max(0, e.translationY) })
    .onEnd((e) => {
      if (e.translationY > h * 0.3 || e.velocityY > 900) scheduleOnRN(props.onClose)
      else drag.value = withSpring(0, { ...SPRING.smooth, velocity: e.velocityY })
    })
  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, k.value) * (1 - Math.min(1, drag.value / Math.max(1, h))) }), [h])
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: reduce ? drag.value : (1 - k.value) * h + drag.value }], opacity: reduce ? Math.min(1, k.value) : 1 }), [h, reduce])
  if (!shown) return null
  return (
    <Modal transparent visible animationType="none" onRequestClose={props.onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, scrim]}>
          <Pressable style={{ flex: 1 }} onPress={props.onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View accessibilityViewIsModal accessibilityLabel={props.label} onLayout={(e) => { setH(e.nativeEvent.layout.height); drag.value = 0 }} style={[s.panel, props.style, panel]}>
            {props.children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}
const s = StyleSheet.create({
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0 }
})
