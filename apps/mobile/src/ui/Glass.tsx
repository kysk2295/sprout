// 둥근 유리 머리 버튼(지름 42 [영상 실측], 21 §2 · 시안 키트 .m-ib.glass). 누르면 0.94로 눌림(39 §4.9).
// GlassGroup = 오른쪽 버튼 여럿을 한 유리 알약에(39 §4.14 — 틱틱 💡 · ⋯ 알약)
import type { ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { M } from '../theme/palette'
import { PressableScale } from './Pressables'
import { usePalette } from '../theme/ThemeProvider'

export function GlassButton(props: { onPress?: () => void; children: ReactNode; label: string; badge?: boolean; style?: ViewStyle; plain?: boolean; disabled?: boolean }) {
  const p = usePalette()
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={4}
      style={[
        s.btn,
        !props.plain && { backgroundColor: p.glass, borderColor: p.glassLine, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: p.dark ? 0.5 : 0.1, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
        props.disabled && { opacity: 0.4 },
        props.style
      ]}
    >
      {props.children}
      {props.badge ? <View style={[s.badge, { backgroundColor: p.danger }]} /> : null}
    </PressableScale>
  )
}

/** 머리 오른쪽 버튼 묶음 — 안의 GlassButton은 plain으로 둔다 */
export function GlassGroup({ children }: { children: ReactNode }) {
  const p = usePalette()
  return (
    <View style={[s.group, { backgroundColor: p.glass, borderColor: p.glassLine, shadowOpacity: p.dark ? 0.5 : 0.1 }]}>{children}</View>
  )
}
const s = StyleSheet.create({
  btn: { width: M.navBtn, height: M.navBtn, borderRadius: M.navBtn / 2, alignItems: 'center', justifyContent: 'center' },
  group: { height: M.navBtn, borderRadius: M.navBtn / 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  badge: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4 }
})
