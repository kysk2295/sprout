// 아래 가운데 토스트(21 §3): "작업이 완료되었습니다." + 되돌리기, 약 2초(되돌리기 있는 삭제는 5초). 탭 알약·+ 버튼 위.
import { Check, CircleAlert } from 'lucide-react-native'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { DUR, EASE, SPRING } from './motion'

// 39 §4.12: 아래에서 16 올라오며 나타남(SPRING.snappy), 8 내려가며 옅게 사라짐(DUR.base), 아래로 밀면 치움
const enter = () => {
  'worklet'
  return { initialValues: { opacity: 0, transform: [{ translateY: 16 }] }, animations: { opacity: withTiming(1, { duration: DUR.base, reduceMotion: ReduceMotion.System }), transform: [{ translateY: withSpring(0, SPRING.snappy) }] } }
}
const leave = () => {
  'worklet'
  return { initialValues: { opacity: 1, transform: [{ translateY: 0 }] }, animations: { opacity: withTiming(0, { duration: DUR.base, easing: EASE.in, reduceMotion: ReduceMotion.System }), transform: [{ translateY: withTiming(8, { duration: DUR.base, reduceMotion: ReduceMotion.System }) }] } }
}
import { usePalette } from '../theme/ThemeProvider'
import { useFabShown } from './Fab'
import { useTabBarSpace } from './tabBarSpace'

type ToastOpts = { undo?: () => Promise<void> | void; error?: boolean; duration?: number; icon?: boolean; /** 되돌리기 대신 다른 이름의 버튼(예: "열기") */ action?: { label: string; onPress: () => void } }
type Toast = ToastOpts & { id: number; message: string }
const Ctx = createContext<{ show: (message: string, opts?: ToastOpts) => void; hide: () => void }>({ show: () => {}, hide: () => {} })
export const useToast = () => useContext(Ctx)

export { tabBarBottom } from './tabBarSpace'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seq = useRef(0)
  const show = useCallback((message: string, opts: ToastOpts = {}) => {
    clearTimeout(timer.current)
    const id = ++seq.current
    setToast({ id, message, ...opts })
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), opts.duration ?? (opts.undo || opts.action ? 3000 : 2000))
  }, [])
  /** 같은 자리에 더 중요한 카드가 뜰 때(성장 탭 새 옷 카드 — 43 §5.5) 지금 토스트를 바로 치운다 */
  const hide = useCallback(() => { clearTimeout(timer.current); setToast(null) }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const value = useMemo(() => ({ show, hide }), [show, hide])
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onClose={() => setToast(null)} /> : null}
    </Ctx.Provider>
  )
}

function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const p = usePalette()
  const space = useTabBarSpace()
  // + 버튼이 떠 있으면 그 위, 아니면 탭 알약 바로 위(21 §2)
  const bottom = useFabShown() ? space.toastBottom : space.fabBottom
  const dy = useSharedValue(0)
  const pan = Gesture.Pan()
    .activeOffsetY(6)
    .onUpdate((e) => { dy.value = Math.max(0, e.translationY) })
    .onEnd((e) => {
      if (e.translationY > 20 || e.velocityY > 300) scheduleOnRN(onClose)
      else dy.value = withSpring(0, SPRING.snappy)
    })
  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }], opacity: 1 - Math.min(0.6, dy.value / 80) }))
  return (
    <GestureDetector gesture={pan}>
    <Animated.View entering={enter} exiting={leave} style={[s.pos, { bottom }]} accessibilityLiveRegion="polite">
      <Animated.View style={[s.toast, { backgroundColor: p.toastBg, borderColor: toast.error ? p.danger : 'transparent' }, drag]}>
      {toast.error ? <CircleAlert size={16} color={p.danger} /> : toast.icon === false ? null : <Check size={16} color={p.accentHi} strokeWidth={2.6} />}
      <Text style={s.msg} numberOfLines={2}>{toast.message}</Text>
      {toast.undo ? (
        <Pressable accessibilityRole="button" accessibilityLabel="되돌리기" hitSlop={8} onPress={async () => { onClose(); await toast.undo?.() }}>
          <Text style={[s.undo, { color: p.toastAction }]}>되돌리기</Text>
        </Pressable>
      ) : toast.action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={toast.action.label} hitSlop={8} onPress={() => { onClose(); toast.action?.onPress() }}>
          <Text style={[s.undo, { color: p.toastAction }]}>{toast.action.label}</Text>
        </Pressable>
      ) : null}
      </Animated.View>
    </Animated.View>
    </GestureDetector>
  )
}
const s = StyleSheet.create({
  pos: { position: 'absolute', left: 16, right: 16, zIndex: 100, elevation: 12 },
  toast: { minHeight: 48, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8, borderWidth: 1, zIndex: 100, elevation: 12, shadowColor: '#12281a', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }, // 44 §4: 짙은 둥근 사각 18 + sh-3
  msg: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '500', paddingVertical: 14 },
  undo: { fontSize: 14, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 12 }
})
