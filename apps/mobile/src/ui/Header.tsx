// 머리(21 §2): 1줄 = 둥근 유리 버튼(☰ · ⋯, 52) / 2줄 = 큰 제목 28/700 + 옆 작은 날짜(48)
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

export function NavRow(props: { left?: ReactNode; right?: ReactNode; title?: string }) {
  const insets = useSafeAreaInsets()
  const p = usePalette()
  return (
    <View style={[s.nav, { marginTop: insets.top }]}>
      <View style={s.side}>{props.left}</View>
      {props.title ? <Text style={[FONT.nav, s.navTitle, { color: p.textPrimary }]} numberOfLines={1}>{props.title}</Text> : <View style={{ flex: 1 }} />}
      <View style={[s.side, { justifyContent: 'flex-end' }]}>{props.right}</View>
    </View>
  )
}
export function BigTitle(props: { title: string; sub?: string; emoji?: string | null }) {
  const p = usePalette()
  return (
    <View style={s.title}>
      {props.emoji ? <Text style={{ fontSize: 24, marginRight: 8 }}>{props.emoji}</Text> : null}
      <Text style={[FONT.title, { color: p.textPrimary }]} numberOfLines={1}>{props.title}</Text>
      {props.sub ? <Text style={[FONT.meta, { color: p.textTertiary, marginLeft: 8, alignSelf: 'flex-end', paddingBottom: 8 }]}>{props.sub}</Text> : null}
    </View>
  )
}
const s = StyleSheet.create({
  nav: { height: M.navH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  side: { minWidth: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navTitle: { flex: 1, textAlign: 'center' },
  title: { height: M.titleH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: M.gutter }
})
