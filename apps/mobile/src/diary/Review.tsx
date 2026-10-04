// 28 §2.4 돌아보기(E4) + 15 §9.6: 달 줄(‹ 2026년 10월 › · 월|연) → 이번 달 한 장(캐릭터 + 한 줄 발견 + 칩 4개) → 기분 달력 → 기분 비율 → 기억에 남는 날 → (연) 12×31 모자이크
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'
import { Segmented } from '../ui/Segmented'
import { LeafIcon, MoodFace, diaryColors } from './art'
import { useDoneByDay } from './data'
import { averageMood, highlightsOf, insightOf, isWritten, longestStreak, streakOf, type Buddy, type DiaryEntry } from './logic'
import { Bubble, BuddyArt, MonthMoodGrid, MoodBar, YearMosaic } from './parts'
import { openDay, setDiaryState } from './state'

const shiftMonth = (m: string, n: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Review({ month, entries, today, buddy, stage, reduced }: { month: string; entries: DiaryEntry[]; today: string; buddy: Buddy; stage: number; reduced: boolean }) {
  const p = usePalette()
  const c = diaryColors(p)
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const year = Number(month.slice(0, 4))
  const doneByDay = useDoneByDay(month)
  const written = useMemo(() => entries.filter(isWritten), [entries])
  const inMonth = written.filter((e) => e.date.slice(0, 7) === month)
  const dates = useMemo(() => new Set(written.map((e) => e.date)), [written])
  const streak = streakOf(dates, today)
  const longest = longestStreak(dates)
  const avg = averageMood(inMonth)
  const insight = inMonth.length ? insightOf(inMonth, doneByDay) : '이 달은 아직 비어 있어요. 지난 날도 쓸 수 있어요'
  const highlights = highlightsOf(inMonth, month)
  const inYear = written.filter((e) => e.date.startsWith(String(year)))
  const topMood = useMemo(() => {
    const n = [1, 2, 3, 4, 5].map((v) => ({ v, n: inYear.filter((e) => e.mood === v).length })).sort((a, b) => b.n - a.n)[0]
    return n && n.n ? n.v : null
  }, [inYear])
  const nextOk = mode === 'month' ? shiftMonth(month, 1) <= today.slice(0, 7) : year < Number(today.slice(0, 4))
  const go = (n: number) => setDiaryState({ month: mode === 'month' ? shiftMonth(month, n) : `${year + n}-${month.slice(5)}` })
  const chip = (label: string, key: string) => <View key={key} style={[s.chip, { backgroundColor: p.dark ? '#ffffff14' : '#ffffffcc' }]}><Text style={{ color: p.textPrimary, fontSize: 12, fontWeight: '600' }}>{label}</Text></View>

  return (
    <View style={{ gap: 12 }}>
      <View style={s.monthRow}>
        <Pressable onPress={() => go(-1)} accessibilityLabel={mode === 'month' ? '이전 달' : '이전 해'} hitSlop={8} style={s.arrow}><ChevronLeft size={22} color={p.textPrimary} /></Pressable>
        <Text style={[s.monthTitle, { color: p.textPrimary }]}>{mode === 'month' ? `${year}년 ${Number(month.slice(5))}월` : `${year}년`}</Text>
        <Pressable disabled={!nextOk} onPress={() => go(1)} accessibilityLabel={mode === 'month' ? '다음 달' : '다음 해'} hitSlop={8} style={[s.arrow, !nextOk && { opacity: 0.3 }]}><ChevronRight size={22} color={p.textPrimary} /></Pressable>
        <View style={{ flex: 1 }} />
        <Segmented small style={{ width: 96 }} value={mode} onChange={setMode} items={[{ key: 'month', label: '월' }, { key: 'year', label: '연' }]} />
      </View>

      {mode === 'month' ? (
        <>
          <View style={[s.sheet, { backgroundColor: c.sky.day[1] }]}>
            <View style={[s.ground, { backgroundColor: p.dark ? '#3b5a3a' : '#d5edc5' }]} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <BuddyArt buddy={buddy} stage={stage} size={84} mood={avg && avg >= 4 ? 'happy' : 'default'} still={reduced} />
              <View style={{ flex: 1, paddingBottom: 24 }}><Bubble text={insight} /></View>
            </View>
            <View style={s.chips}>
              {chip(`기록 ${inMonth.length}일`, 'n')}
              {chip(`지금 ${streak.days}일 연속`, 's')}
              {chip(`가장 길게 ${longest}일`, 'l')}
              {avg ? <View style={[s.chip, { backgroundColor: p.dark ? '#ffffff14' : '#ffffffcc', flexDirection: 'row', gap: 4 }]}><Text style={{ color: p.textPrimary, fontSize: 12, fontWeight: '600' }}>평균 기분</Text><MoodFace mood={avg} size={16} /></View> : null}
            </View>
          </View>

          <View style={[s.card, { backgroundColor: p.cardBg }]}>
            <MonthMoodGrid month={month} entries={entries} today={today} onPick={openDay} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 12 }}>
            <View style={[s.stat, { backgroundColor: p.cardBg }]}><Text style={[s.statNum, { color: p.textPrimary }]}>{inMonth.length}일</Text><Text style={[s.statLabel, { color: p.textTertiary }]}>이번 달 기록</Text></View>
            <View style={[s.stat, { backgroundColor: p.cardBg }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><LeafIcon size={18} /><Text style={[s.statNum, { color: p.textPrimary }]}>{streak.days}일</Text></View><Text style={[s.statLabel, { color: p.textTertiary }]}>연속 기록</Text></View>
          </View>

          <View style={[s.card, { backgroundColor: p.cardBg, gap: 10 }]}>
            <Text style={[s.cardHead, { color: p.textSecondary }]}>이번 달 기분</Text>
            <MoodBar entries={inMonth} />
          </View>

          {highlights.length ? (
            <View style={[s.card, { backgroundColor: p.cardBg, gap: 8 }]}>
              <Text style={[s.cardHead, { color: p.textSecondary }]}>기억에 남는 날</Text>
              {highlights.map((h) => (
                <Pressable key={h.date} onPress={() => openDay(h.date)} accessibilityRole="button" style={[s.hl, { backgroundColor: c.note }]}>
                  <MoodFace mood={h.mood!} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: p.textTertiary, fontSize: 11.5, fontWeight: '600' }}>{Number(h.date.slice(5, 7))}월 {Number(h.date.slice(8))}일</Text>
                    <Text style={{ color: p.textPrimary, fontSize: 14, lineHeight: 19 }} numberOfLines={2}>{(h.content ?? '').trim()}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={[s.card, { backgroundColor: p.cardBg, gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>올해 {inYear.length}일 기록</Text>
            {topMood ? <><Text style={{ color: p.textSecondary, fontSize: 13 }}>· 가장 많았던 기분</Text><MoodFace mood={topMood} size={16} /></> : null}
          </View>
          <YearMosaic year={year} entries={entries} today={today} onPick={openDay} onMonth={(m) => { setMode('month'); setDiaryState({ month: m }) }} />
        </View>
      )}
      <View style={{ height: 30 }} />
    </View>
  )
}
const s = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 17, fontWeight: '700' },
  sheet: { marginHorizontal: 12, borderRadius: 16, padding: 14, paddingBottom: 12, overflow: 'hidden', gap: 6 },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 52 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, alignItems: 'center' },
  card: { marginHorizontal: 12, borderRadius: 14, padding: 12 },
  cardHead: { fontSize: 12.5, fontWeight: '600' },
  stat: { flex: 1, borderRadius: 14, padding: 12, gap: 2 },
  statNum: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  hl: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, padding: 10 }
})
