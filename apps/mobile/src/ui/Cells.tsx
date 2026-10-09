// 설정 칸 묶음(시안 키트 .m-cells / .m-cell): 흰 카드 안 48 높이 칸, 왼쪽 색 사각 아이콘, 오른쪽 값 · ›
// 44 §4·§6.8: 묶음 모서리 20, 행 앞 말랑 아이콘(soft = 이름 · tone = 옅은 칸 색) 32 칸 — 없는 칸은 예전 색 사각 아이콘
import { ChevronRight } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FONT, M, R } from '../theme/palette'
import { SoftIcon, softTile, type SoftIconName, type SoftTone } from './SoftIcon'
import { usePalette } from '../theme/ThemeProvider'

export function Cells({ title, children }: { title?: string; children: ReactNode }) {
  const p = usePalette()
  return (
    <View>
      {title ? <Text style={[s.title, { color: p.textTertiary }]}>{title}</Text> : null}
      <View style={[s.cells, { backgroundColor: p.cardBg }]}>{children}</View>
    </View>
  )
}
export function Cell(props: { label: string; value?: string; icon?: ReactNode; iconBg?: string; soft?: SoftIconName; tone?: SoftTone; onPress?: () => void; right?: ReactNode; first?: boolean; chevron?: boolean; danger?: boolean }) {
  const p = usePalette()
  return (
    <Pressable disabled={!props.onPress} onPress={props.onPress} accessibilityRole={props.onPress ? 'button' : undefined} style={({ pressed }) => [s.cell, pressed && { backgroundColor: p.bgSelected }]}>
      {!props.first ? <View style={[s.line, { left: props.icon || props.soft ? 58 : 14, borderTopColor: p.borderDivider }]} /> : null}
      {props.soft ? <View style={[s.si, { backgroundColor: softTile(props.tone ?? 'plain', p.dark) }]}><SoftIcon name={props.soft} size={24} /></View>
        : props.icon ? <View style={[s.si, { backgroundColor: props.iconBg ?? p.textTertiary }]}>{props.icon}</View> : null}
      <Text style={[FONT.body, { flex: 1, color: props.danger ? p.danger : p.textPrimary }]} numberOfLines={1}>{props.label}</Text>
      {props.value ? <Text style={[FONT.sub, { color: p.textTertiary }]} numberOfLines={1}>{props.value}</Text> : null}
      {props.right}
      {props.chevron ?? !!props.onPress ? <ChevronRight size={16} color={p.textQuaternary} /> : null}
    </Pressable>
  )
}
const s = StyleSheet.create({
  title: { fontSize: 13, lineHeight: 18, fontWeight: '600', paddingTop: 18, paddingBottom: 6, paddingHorizontal: M.cardInset + 14 },
  cells: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: R.lg, overflow: 'hidden' },
  cell: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  line: { position: 'absolute', top: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  si: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }
})
