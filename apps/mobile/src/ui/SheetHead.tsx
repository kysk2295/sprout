// 시트 닫기 규칙(20 §3.2 · research 24 §4·§7·§8 — 틱틱 iOS "✕ · 제목 · ✓"): 모든 시트는 왼쪽 위에 둥근 ✕(지름 40)가 보인다.
// 아래로 끌기·바깥 누르기·Android 뒤로 버튼으로도 닫힌다(✕는 그 위에 "보이는" 닫기를 하나 더 두는 것).
//  - SheetHead: 시트 머리(시안 키트 .m-sheet-head) — 왼쪽 ✕ · 가운데 제목 17/600 · 오른쪽(선택) ✓ 또는 아무 노드
//  - CloseButton: 머리 모양이 다른 시트(상세·일정·수집 항목)가 머리 줄 맨 왼쪽에 끼우는 ✕ 하나
// onClose를 주지 않으면 경로 시트(formSheet)로 보고 router.back()으로 닫는다.
import { useRouter } from 'expo-router'
import { Check, X } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { GlassButton } from './Glass'

export function CloseButton({ onPress, label = '닫기' }: { onPress?: () => void; label?: string }) {
  const p = usePalette()
  const router = useRouter()
  return <GlassButton label={label} onPress={onPress ?? (() => router.back())}><X size={20} color={p.textPrimary} /></GlassButton>
}

export function SheetHead({ title, onDone, onClose, right, compact }: {
  title: string
  onDone?: () => void
  /** 없으면 router.back() */
  onClose?: () => void
  /** ✓ 대신 오른쪽에 둘 것 */
  right?: ReactNode
  /** BottomSheet 머리(잡는 막대 바로 아래)처럼 위 여백이 이미 있을 때 */
  compact?: boolean
}) {
  const p = usePalette()
  return (
    <View style={[s.head, compact && s.compact]}>
      <CloseButton onPress={onClose} />
      <Text style={[FONT.nav, s.title, { color: p.textPrimary }]} numberOfLines={1}>{title}</Text>
      {onDone ? (
        <GlassButton label="확인" onPress={onDone} style={{ backgroundColor: p.accent }} plain><Check size={20} color="#fff" /></GlassButton>
      ) : right ?? <View style={{ width: 40 }} />}
    </View>
  )
}
const s = StyleSheet.create({
  head: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  compact: { height: 48, paddingTop: 0, paddingBottom: 4 },
  title: { flex: 1, textAlign: 'center' }
})
