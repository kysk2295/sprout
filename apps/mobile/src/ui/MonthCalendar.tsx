// 날짜 시트 달력(시안 E .cal-mini, 03 §3): 머리 ‹ 2026년 10월 ›, 월요일 시작 6주 고정, 오늘 = 강조색 글자, 선택 = 강조색 원.
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'
import { monthCells, shiftMonth } from './dateSheetModel'

const WEEK = ['월', '화', '수', '목', '금', '토', '일']

export function MonthCalendar({ month, onMonth, today, selected, range = [], onPick }: {
  month: string; onMonth: (m: string) => void; today: string; selected: string[]; range?: string[]; onPick: (date: string) => void
}) {
  const p = usePalette()
  const [y, m] = month.split('-').map(Number)
  const cells = monthCells(month)
  return (
    <View>
      <View style={s.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" hitSlop={10} onPress={() => onMonth(shiftMonth(month, -1))}><ChevronLeft size={18} color={p.textTertiary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="이번 달로" onPress={() => onMonth(today.slice(0, 7))}>
          <Text style={[s.title, { color: p.textPrimary }]}>{y}년 {m}월</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" hitSlop={10} onPress={() => onMonth(shiftMonth(month, 1))}><ChevronRight size={18} color={p.textTertiary} /></Pressable>
      </View>
      <View style={s.grid}>
        {WEEK.map((w) => <Text key={w} style={[s.wd, { color: p.textTertiary }]}>{w}</Text>)}
        {cells.map((d, i) => {
          const other = d.slice(0, 7) !== month
          const sel = selected.includes(d)
          const inRange = range.includes(d) && !sel
          const isToday = d === today
          const sun = i % 7 === 6
          return (
            <Pressable key={d} accessibilityRole="button" accessibilityLabel={d} accessibilityState={{ selected: sel }} onPress={() => onPick(d)} style={s.cellWrap}>
              <View style={[s.cell, sel && { backgroundColor: p.accent }, inRange && { backgroundColor: p.accentSubtle }]}>
                <Text style={[
                  s.day,
                  { color: other ? p.calOther : sun ? p.danger : p.textPrimary },
                  isToday && { color: p.accent, fontWeight: '600' },
                  sel && { color: '#fff', fontWeight: '600' }
                ]}>{Number(d.slice(8))}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 4, paddingBottom: 10 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, lineHeight: 16, paddingBottom: 4 },
  cellWrap: { width: `${100 / 7}%`, alignItems: 'center' },
  cell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 15, lineHeight: 20 }
})
