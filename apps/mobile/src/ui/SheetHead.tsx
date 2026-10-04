// 시트 머리(시안 키트 .m-sheet-head): 왼쪽 둥근 ✕ · 가운데 제목 17/600 · 오른쪽(선택) ✓
import { useRouter } from 'expo-router'
import { Check, X } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { FONT } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { GlassButton } from './Glass'

export function SheetHead({ title, onDone }: { title: string; onDone?: () => void }) {
  const p = usePalette()
  const router = useRouter()
  return (
    <View style={s.head}>
      <GlassButton label="닫기" onPress={() => router.back()}><X size={20} color={p.textPrimary} /></GlassButton>
      <Text style={[FONT.nav, s.title, { color: p.textPrimary }]}>{title}</Text>
      {onDone ? (
        <GlassButton label="확인" onPress={onDone} style={{ backgroundColor: p.accent }} plain><Check size={20} color="#fff" /></GlassButton>
      ) : <View style={{ width: 40 }} />}
    </View>
  )
}
const s = StyleSheet.create({
  head: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  title: { flex: 1, textAlign: 'center' }
})
