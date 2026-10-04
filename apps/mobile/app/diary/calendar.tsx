// 28 §4 📅 → 월 달력 시트(기분 색, 월요일 시작). 날짜를 누르면 그날 쓰기로.
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEntries } from '../../src/diary/data'
import { MonthMoodGrid } from '../../src/diary/parts'
import { openDay, useDiaryState } from '../../src/diary/state'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { SheetHead } from '../../src/ui/SheetHead'

const shift = (m: string, n: number) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function DiaryCalendar() {
  const p = usePalette()
  const router = useRouter()
  const { date } = useDiaryState()
  const today = dayKey()
  const [month, setMonth] = useState(date.slice(0, 7))
  const entries = useEntries()
  const canNext = shift(month, 1) <= today.slice(0, 7)
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.sheetBg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <SheetHead title="날짜 고르기" />
      <View style={s.row}>
        <Pressable onPress={() => setMonth(shift(month, -1))} accessibilityLabel="이전 달" hitSlop={8} style={s.arrow}><ChevronLeft size={22} color={p.textPrimary} /></Pressable>
        <Text style={[s.title, { color: p.textPrimary }]}>{month.slice(0, 4)}년 {Number(month.slice(5))}월</Text>
        <Pressable disabled={!canNext} onPress={() => setMonth(shift(month, 1))} accessibilityLabel="다음 달" hitSlop={8} style={[s.arrow, !canNext && { opacity: 0.3 }]}><ChevronRight size={22} color={p.textPrimary} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => { openDay(today); router.back() }} hitSlop={8}><Text style={{ color: p.accent, fontSize: 15, fontWeight: '600' }}>오늘</Text></Pressable>
      </View>
      <View style={{ paddingHorizontal: 12 }}>
        <MonthMoodGrid month={month} entries={entries} today={today} selected={date} onPick={(d) => { openDay(d); router.back() }} />
      </View>
    </ScrollView>
  )
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingRight: 20, marginBottom: 8 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' }
})
