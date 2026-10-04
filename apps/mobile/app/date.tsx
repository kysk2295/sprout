// 날짜 시트 — 기초판(자리). 22 §3.3·03의 전체 날짜 시트(달력·시간 휠·알림·반복·기간)는 다음 작업(빠른 입력 담당)이 이 경로를 바꿔 만든다.
// 지금 되는 것: 맨 위 빠른 날짜 줄(20 M6 확정: 오늘 · 내일 · 다음 주 월) + 날짜 지우기. 시각·기간은 유지(03 §5).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CalendarArrowUp, CalendarX, Sun, Sunrise } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { moveDates } from '../src/data/tasks'
import { dayKey, nextMonday } from '../src/lib/dates'
import { FONT } from '../src/theme/palette'
import { usePalette } from '../src/theme/ThemeProvider'
import { SheetHead } from '../src/ui/SheetHead'
import { useToast } from '../src/ui/Toast'

export default function DateSheet() {
  const { ids: raw } = useLocalSearchParams<{ ids: string }>()
  const ids = (raw ?? '').split(',').filter(Boolean)
  const p = usePalette()
  const router = useRouter()
  const toast = useToast()
  const today = dayKey()
  const set = async (date: string | null, label: string) => {
    const undo = await moveDates(ids, date)
    router.back()
    toast.show(label, { undo })
  }
  const quick: [string, ReactNode, () => void][] = [
    ['오늘', <Sun key="i" size={24} color={p.textPrimary} />, () => void set(today, '오늘로 옮겼어요')],
    ['내일', <Sunrise key="i" size={24} color={p.textPrimary} />, () => void set(dayKey(1), '내일로 옮겼어요')],
    ['다음 주 월', <CalendarArrowUp key="i" size={24} color={p.textPrimary} />, () => void set(nextMonday(today), '다음 주로 옮겼어요')],
    ['날짜 없음', <CalendarX key="i" size={24} color={p.textPrimary} />, () => void set(null, '날짜를 지웠어요')]
  ]
  return (
    <View style={{ flex: 1, backgroundColor: p.sheetBg }}>
      <SheetHead title="날짜" />
      <View style={[s.row, { borderBottomColor: p.borderDivider }]}>
        {quick.map(([label, icon, onPress]) => (
          <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.q}>
            {icon}
            <Text style={{ fontSize: 12, color: p.textSecondary }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[FONT.meta, { color: p.textTertiary, textAlign: 'center', padding: 20 }]}>달력 · 시간 · 알림 · 반복은 다음 업데이트에서 이 자리에 붙어요</Text>
    </View>
  )
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  q: { alignItems: 'center', gap: 6, minWidth: 70 }
})
