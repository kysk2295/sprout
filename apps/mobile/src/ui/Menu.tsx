// 떠 있는 메뉴(시안 키트 .m-menu): 머리 ⋯ 메뉴, 만료됨 "미루기", 상세 깃발(우선순위) 등.
// 누른 버튼 위치(measureInWindow)에 붙여 연다. 바깥을 누르면 닫힌다.
import { Check } from 'lucide-react-native'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { usePalette } from '../theme/ThemeProvider'

export type Rect = { x: number; y: number; width: number; height: number }
export type MenuItem = { key: string; label: string; icon?: ReactNode; danger?: boolean; checked?: boolean; disabled?: boolean; onPress: () => void }

/** ref를 붙인 뷰의 화면 위치를 재서 메뉴를 연다 */
export function useAnchor<T extends View = View>() {
  const ref = useRef<T>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const open = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => setRect({ x, y, width, height }))
  }, [])
  const close = useCallback(() => setRect(null), [])
  return { ref, rect, open, close }
}

export function PopMenu(props: { anchor: Rect | null; onClose: () => void; items: MenuItem[]; header?: ReactNode; width?: number; align?: 'left' | 'right' }) {
  const p = usePalette()
  const win = useWindowDimensions()
  if (!props.anchor) return null
  const w = props.width ?? 236
  const a = props.anchor
  const left = props.align === 'left' ? Math.max(12, a.x) : Math.min(win.width - w - 12, Math.max(12, a.x + a.width - w))
  const below = a.y + a.height + 6
  const est = props.items.length * 44 + (props.header ? 60 : 0)
  const top = below + est > win.height - 40 ? Math.max(60, a.y - est - 6) : below
  return (
    <Modal transparent visible animationType="none" onRequestClose={props.onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} accessibilityLabel="메뉴 닫기" />
      <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(100)} style={[s.menu, { left, top, width: w, backgroundColor: p.bgPopover, borderColor: p.borderPopover }]}>
        {props.header}
        {props.items.map((it, i) => (
          <Pressable
            key={it.key}
            accessibilityRole="menuitem"
            disabled={it.disabled}
            onPress={() => { props.onClose(); it.onPress() }}
            style={({ pressed }) => [s.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }, it.disabled && { opacity: 0.4 }]}
          >
            <Text style={[s.label, { color: it.danger ? p.danger : p.textPrimary }]} numberOfLines={1}>{it.label}</Text>
            <View style={s.right}>
              {it.checked ? <Check size={18} color={p.accent} /> : null}
              {it.icon}
            </View>
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  )
}
const s = StyleSheet.create({
  menu: { position: 'absolute', borderRadius: 14, overflow: 'hidden', borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 16 },
  item: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  label: { flex: 1, fontSize: 16, lineHeight: 22 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 }
})
