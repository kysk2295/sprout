// 아래 가운데 토스트(21 §3): "작업이 완료되었습니다." + 되돌리기, 약 2초(되돌리기 있는 삭제는 5초). 탭 알약·+ 버튼 위.
// 시트 위에도 뜬다(UX 점검 P2-2): 뿌리 토스트는 RN Modal·formSheet 뒤에 숨으므로, 시트(BottomSheet·SlideSheet·formSheet 화면)가
// 자기 안에 <ToastHost />를 두고, 가장 나중에 열린 자리가 토스트를 그린다. 자리가 없으면 뿌리가 그린다.
// 키보드가 올라와 있으면 키보드 바로 위(P2-3).
import { Check, CircleAlert } from 'lucide-react-native'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Keyboard, Platform, StyleSheet, Text } from 'react-native'
import { Tap } from './Pressables'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
type HostCtx = { toast: Toast | null; close: () => void; top: number | null; register: (id: number) => () => void }
const Hosts = createContext<HostCtx | null>(null)
let hostSeq = 0

export { tabBarBottom } from './tabBarSpace'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const [hosts, setHosts] = useState<number[]>([])
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
  const register = useCallback((id: number) => {
    setHosts((h) => [...h, id])
    return () => setHosts((h) => h.filter((x) => x !== id))
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const value = useMemo(() => ({ show, hide }), [show, hide])
  const top = hosts.length ? hosts[hosts.length - 1] : null
  const hostValue = useMemo(() => ({ toast, close: hide, top, register }), [toast, hide, top, register])
  return (
    <Ctx.Provider value={value}>
      <Hosts.Provider value={hostValue}>
        {children}
        {toast && top === null ? <ToastView key={toast.id} toast={toast} onClose={hide} /> : null}
      </Hosts.Provider>
    </Ctx.Provider>
  )
}

/** 시트 안 토스트 자리 — Modal·formSheet 안 맨 끝에 둔다. bottom을 안 주면 아래 안전 영역 + 16 */
export function ToastHost({ bottom }: { bottom?: number }) {
  const ctx = useContext(Hosts)
  const insets = useSafeAreaInsets()
  const [id] = useState(() => ++hostSeq)
  const register = ctx?.register
  useEffect(() => register?.(id), [register, id])
  if (!ctx?.toast || ctx.top !== id) return null
  return <ToastView key={ctx.toast.id} toast={ctx.toast} onClose={ctx.close} bottom={bottom ?? insets.bottom + 16} />
}

/** 키보드가 덮는 높이(Android는 키보드 높이에 아래 제스처 막대가 빠져 있어 더한다 — BottomSheet와 같은 보정) */
function useKeyboardCover(): number {
  const insets = useSafeAreaInsets()
  const extra = useRef(0)
  extra.current = Platform.OS === 'android' ? insets.bottom : 0
  const [h, setH] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e.endCoordinates.height + extra.current))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  return h
}

function ToastView({ toast, onClose, bottom: at }: { toast: Toast; onClose: () => void; bottom?: number }) {
  const p = usePalette()
  const space = useTabBarSpace()
  const kb = useKeyboardCover()
  // + 버튼이 떠 있으면 그 위, 아니면 탭 알약 바로 위(21 §2). 시트 안 자리는 그 자리가 준 높이. 키보드가 있으면 키보드 위 8
  const fab = useFabShown()
  const bottom = kb ? kb + 8 : at ?? (fab ? space.toastBottom : space.fabBottom)
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
      {/* 48: 둘 다 있으면 [이름 버튼] [되돌리기] 나란히(자동 정리 알림 — 보기 · 되돌리기) */}
      {toast.action ? (
        <Tap accessibilityRole="button" accessibilityLabel={toast.action.label} hitSlop={8} onPress={() => { onClose(); toast.action?.onPress() }}>
          <Text style={[s.undo, { color: p.toastAction }]}>{toast.action.label}</Text>
        </Tap>
      ) : null}
      {toast.undo ? (
        <Tap accessibilityRole="button" accessibilityLabel="되돌리기" hitSlop={8} onPress={async () => { onClose(); await toast.undo?.() }}>
          <Text style={[s.undo, { color: p.toastAction }]}>되돌리기</Text>
        </Tap>
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
