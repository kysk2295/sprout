// 둥근 유리 머리 버튼(지름 40, 21 §2 · 시안 키트 .m-ib.glass)
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'

export function GlassButton(props: { onPress?: () => void; children: ReactNode; label: string; badge?: boolean; style?: ViewStyle; plain?: boolean; disabled?: boolean }) {
  const p = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={4}
      style={({ pressed }) => [
        s.btn,
        !props.plain && { backgroundColor: p.glass, borderColor: p.glassLine, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: p.dark ? 0.5 : 0.1, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
        pressed && { opacity: 0.6 },
        props.style
      ]}
    >
      {props.children}
      {props.badge ? <View style={[s.badge, { backgroundColor: p.danger }]} /> : null}
    </Pressable>
  )
}
const s = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4 }
})
