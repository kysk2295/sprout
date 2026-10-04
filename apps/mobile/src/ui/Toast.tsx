// 아래 가운데 토스트(21 §3): "작업이 완료되었습니다." + 되돌리기, 약 2초(되돌리기 있는 삭제는 5초). 탭 알약·+ 버튼 위.
import { Check, CircleAlert } from 'lucide-react-native'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

type ToastOpts = { undo?: () => Promise<void> | void; error?: boolean; duration?: number; icon?: boolean; /** 되돌리기 대신 다른 이름의 버튼(예: "열기") */ action?: { label: string; onPress: () => void } }
type Toast = ToastOpts & { id: number; message: string }
const Ctx = createContext<{ show: (message: string, opts?: ToastOpts) => void }>({ show: () => {} })
export const useToast = () => useContext(Ctx)

/** 탭 알약의 바닥 위치(홈 표시줄 위 22 — 시안 키트 --m-tab-bottom, 안전 영역 34 기준) */
export const tabBarBottom = (insetBottom: number) => Math.max(insetBottom - 12, 12)

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
  useEffect(() => () => clearTimeout(timer.current), [])
  const value = useMemo(() => ({ show }), [show])
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onClose={() => setToast(null)} /> : null}
    </Ctx.Provider>
  )
}

function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const bottom = tabBarBottom(insets.bottom) + M.tabH + 14
  return (
    <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOutDown.duration(160)} style={[s.toast, { bottom, backgroundColor: p.toastBg, borderColor: toast.error ? p.danger : 'transparent' }]} accessibilityLiveRegion="polite">
      {toast.error ? <CircleAlert size={16} color={p.danger} /> : toast.icon === false ? null : <Check size={16} color="#fff" />}
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
  )
}
const s = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8, borderWidth: 1, zIndex: 100, elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  msg: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 20, paddingVertical: 14 },
  undo: { fontSize: 14, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 12 }
})
