// 떠 있는 메뉴(시안 키트 .m-menu · 39 §4.5 [영상 실측 research 34 §3.3]): 머리 ⋯ 메뉴, 만료됨 "미루기", 상세 깃발(우선순위) 등.
// 누른 버튼 위치(measureInWindow)에 붙여 연다. 열림 = 버튼 쪽 모서리에서 커지며(SPRING.menu, 살짝 넘침), 닫힘 = 그 모서리로 줄며 175ms 뒤 내림.
// 모양: 모서리 20, 줄 44, 줄 사이 선 없음, 아이콘·✓는 왼쪽, iOS는 뒤 흐림. 바깥을 누르면 닫힌다.
import { BlurView } from 'expo-blur'
import { Check } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { DUR, EASE, SPRING, useReducedMotion } from './motion'

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

/**
 * 열림/닫힘 움직임용: open이 false가 돼도 닫힘 움직임이 끝날 때까지 마지막 값을 들고 있는다.
 * progress 0 → 1 열림(spring), 1 → 0 닫힘(timing). 끝나면 shown=false.
 */
export function usePresence<T>(value: T | null, opts: { inMs?: 'menu' | 'snappy'; outMs?: number } = {}) {
  const reduce = useReducedMotion()
  const [held, setHeld] = useState<T | null>(value)
  const last = useRef<T | null>(value)
  const k = useSharedValue(0)
  if (value) last.current = value
  useEffect(() => {
    if (value) {
      setHeld(value)
      k.value = reduce ? withTiming(1, { duration: DUR.base }) : withSpring(1, opts.inMs === 'snappy' ? SPRING.snappy : SPRING.menu)
    } else if (held) {
      k.value = withTiming(0, { duration: reduce ? DUR.fast : (opts.outMs ?? DUR.menuOut), easing: EASE.in }, (fin) => { if (fin) scheduleOnRN(setHeld, null) })
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return { shown: value ?? held, k, reduce, closing: !value && !!held }
}

export function PopMenu(props: { anchor: Rect | null; onClose: () => void; items: MenuItem[]; header?: ReactNode; width?: number; align?: 'left' | 'right' }) {
  const p = usePalette()
  const win = useWindowDimensions()
  const lastItems = useRef(props.items)
  if (props.anchor) lastItems.current = props.items
  const { shown: a, k, reduce, closing } = usePresence(props.anchor)
  const w = props.width ?? 236
  const items = lastItems.current
  const left = !a ? 0 : props.align === 'left' ? Math.max(12, a.x) : Math.min(win.width - w - 12, Math.max(12, a.x + a.width - w))
  const below = a ? a.y + a.height + 6 : 0
  const est = items.length * 44 + 12 + (props.header ? 60 : 0)
  const up = !!a && below + est > win.height - 40
  const top = !a ? 0 : up ? Math.max(60, a.y - est - 6) : below
  // 기준점 = 버튼 쪽 모서리(오른쪽 정렬이면 오른쪽 위, 위로 열리면 아래)
  const ox = a ? Math.min(w, Math.max(0, a.x + a.width / 2 - left)) : 0
  const oy = up ? est : 0
  const style = useAnimatedStyle(() => {
    const s = reduce ? 1 : 0.5 + 0.5 * k.value
    return {
      opacity: Math.min(1, k.value * 1.6),
      transform: [{ translateX: ox - w / 2 }, { translateY: oy - est / 2 }, { scale: s }, { translateX: w / 2 - ox }, { translateY: est / 2 - oy }]
    }
  }, [ox, oy, w, est, reduce])
  if (!a) return null
  return (
    <Modal transparent visible animationType="none" onRequestClose={props.onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} accessibilityLabel="메뉴 닫기" />
      <Animated.View pointerEvents={closing ? 'none' : 'auto'} style={[s.menu, { left, top, width: w, borderColor: p.borderPopover, shadowOpacity: p.dark ? 0.45 : 0.18 }, style]}>
        {Platform.OS === 'ios' ? <BlurView intensity={40} tint={p.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bgPopover, opacity: Platform.OS === 'ios' ? 0.86 : 1 }]} />
        <View style={s.pad}>
          {props.header}
          {items.map((it) => (
            <Pressable
              key={it.key}
              accessibilityRole="menuitem"
              accessibilityState={{ checked: it.checked, disabled: it.disabled }}
              disabled={it.disabled || closing}
              onPress={() => { props.onClose(); it.onPress() }}
              style={({ pressed }) => [s.item, pressed && { backgroundColor: p.bgSelected }, it.disabled && { opacity: 0.4 }]}
            >
              {items.some((x) => x.checked !== undefined) ? <View style={s.check}>{it.checked ? <Check size={17} color={p.textPrimary} strokeWidth={2.4} /> : null}</View> : null}
              {it.icon ? <View style={s.icon}>{it.icon}</View> : null}
              <Text style={[s.label, { color: it.danger ? p.danger : p.textPrimary }]} numberOfLines={1}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </Modal>
  )
}
const s = StyleSheet.create({
  menu: { position: 'absolute', borderRadius: M.radiusMenu, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 16 },
  pad: { paddingVertical: 6 },
  item: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10, marginHorizontal: 6, borderRadius: 12 },
  check: { width: 18, alignItems: 'center', marginLeft: -4 },
  icon: { width: 22, alignItems: 'center' },
  label: { flex: 1, fontSize: 16, lineHeight: 22 }
})
