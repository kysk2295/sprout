// 29 §9.3 성장 탭 `주간 점검 ›` 줄 — 일요일 20시~월요일 12시에는 강조색 `지금 점검할 때예요`, 이 주에 끝냈으면 `이번 주 점검 끝 ✓`
import { useQuery } from '@powersync/react-native'
import { isoWeekStart } from '@sprout/schema/growth'
import { reviewTarget, reviewWindowWeek } from '@sprout/schema/review'
import { useRouter } from 'expo-router'
import { ChevronRight, ClipboardCheck } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePalette } from '../../theme/ThemeProvider'

export function ReviewEntry() {
  const p = usePalette()
  const router = useRouter()
  const now = new Date()
  const { week } = reviewTarget(now)
  const due = !!reviewWindowWeek(now)
  const done = useQuery<{ id: string }>('SELECT id FROM xp_events WHERE kind = ? AND ref_id = ? LIMIT 1', ['review', `review:${isoWeekStart(week)}`]).data.length > 0
  return (
    <Pressable onPress={() => router.push('/growth/review')} accessibilityRole="button"
      style={({ pressed }) => [s.row, { backgroundColor: due && !done ? p.accentSubtle : p.cardBg }, pressed && { opacity: 0.7 }]}>
      <ClipboardCheck size={18} color={due && !done ? p.accent : p.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.textPrimary, fontSize: 15.5, fontWeight: '600' }}>주간 점검</Text>
        <Text style={{ color: due && !done ? p.accentInk : p.textTertiary, fontSize: 12.5, marginTop: 1 }}>
          {done ? '이번 주 점검 끝 ✓' : due ? '지금 점검할 때예요 · 약 5분' : '돌아보기 · 밀린 일 · 다음 주 목표'}
        </Text>
      </View>
      <ChevronRight size={16} color={p.textQuaternary} />
    </Pressable>
  )
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }
})
