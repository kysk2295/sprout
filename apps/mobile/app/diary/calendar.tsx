// 28 §8.4 기분 달력 하나(예전 📅 시트 + 돌아보기 탭을 합침): 머리(‹ · 월/연) · `10월 2026` + ‹ › · 달력(칸 56, 얼굴 30)
// → 이번 달 기분(막대 + 얼굴·개수, `N일 남겼어요`) → 이번 주 돌아보기(얼굴 7칸 + 캐릭터 한 줄 — AI 없음 + [이번 주를 한 줄로 남기기]).
// 연속 기록 숫자·XP 없음(§8.1-8). 칸 누름 = 그날, 좌우 밀기 = 달.
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { MoodFace } from '../../src/diary/art'
import { saveEntry, useBuddy, useDoneByDay, useEntries } from '../../src/diary/data'
import { isWritten, weekOf, WEEK_DAYS } from '../../src/diary/logic'
import { BuddyArt, MonthMoodGrid, MoodDistribution, YearMosaic } from '../../src/diary/parts'
import { openDay, useDiaryState } from '../../src/diary/state'
import { weekLineOf } from '../../src/diary/talk'
import { useWeekStart } from '../../src/data/calendarPrefs'
import { useMotionReduced } from '../../src/growth/motion'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { hx } from '../../src/ui/haptics'
import { Segmented } from '../../src/ui/Segmented'

const shift = (m: string, n: number) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function MoodCalendar() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { date } = useDiaryState()
  const today = dayKey()
  const ws = useWeekStart()
  const reduced = useMotionReduced()
  const buddy = useBuddy()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(date.slice(0, 7))
  const entries = useEntries()
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])
  const inMonth = useMemo(() => entries.filter((e) => e.date.slice(0, 7) === month && isWritten(e)), [entries, month])
  const canNext = month < today.slice(0, 7)
  const move = useCallback((n: number) => setMonth((m) => { const next = shift(m, n); if (next > dayKey().slice(0, 7)) return m; hx.tick(); return next }), [])
  const swipe = useMemo(() => Gesture.Pan().activeOffsetX([-24, 24]).failOffsetY([-14, 14]).onEnd((e) => {
    if (Math.abs(e.translationX) > 60) scheduleOnRN(move, e.translationX > 0 ? -1 : 1)
  }), [move])
  const pick = (d: string) => { hx.tick(); openDay(d); router.back() }

  // 이번 주(주 시작 설정) — 이번 달을 볼 때만
  const week = weekOf(today, ws)
  const doneByDay = useDoneByDay(today.slice(0, 7))
  const weekRows = week.map((d) => { const e = byDate.get(d); return { date: d, mood: e?.mood ?? null, written: !!e && isWritten(e), done: doneByDay.get(d) ?? 0, private: !!e?.private } })
  const weekLine = weekLineOf(weekRows.filter((d) => d.date <= today))
  const weekOne = async () => {
    hx.tap()
    const e = byDate.get(today)
    const q = 'Q. 이번 주를 한 줄로 남긴다면?\n'
    if (!(e?.content ?? '').includes(q.trim())) await saveEntry(today, { content: e?.content ? `${e.content.trim()}\n\n${q}` : q })
    openDay(today, 'free')
    router.back()
  }
  const year = Number(month.slice(0, 4))

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.hdr, { marginTop: insets.top }]}>
        <GlassButton label="일기로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <View style={{ flex: 1 }} />
        <Segmented style={{ width: 112 }} value={mode} onChange={(m) => setMode(m)} items={[{ key: 'month', label: '월' }, { key: 'year', label: '연' }]} />
      </View>
      <GestureDetector gesture={swipe}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 12 }}>
          <View style={s.titleRow}>
            <Text style={[s.title, { color: p.textPrimary }]}>{mode === 'month' ? `${Number(month.slice(5))}월` : `${year}년`}<Text style={[s.titleSub, { color: p.textTertiary }]}>{mode === 'month' ? `  ${year}` : ''}</Text></Text>
            <View style={{ flex: 1 }} />
            {mode === 'month' ? <>
              <Pressable onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel="이전 달" style={s.arrow}><ChevronLeft size={22} color={p.textPrimary} /></Pressable>
              <Pressable onPress={() => move(1)} disabled={!canNext} accessibilityRole="button" accessibilityLabel="다음 달" style={[s.arrow, !canNext && { opacity: 0.3 }]}><ChevronRight size={22} color={p.textPrimary} /></Pressable>
            </> : <>
              <Pressable onPress={() => setMonth(`${year - 1}-12`)} accessibilityRole="button" accessibilityLabel="지난해" style={s.arrow}><ChevronLeft size={22} color={p.textPrimary} /></Pressable>
              <Pressable onPress={() => setMonth(`${year + 1}-01`)} disabled={year >= Number(today.slice(0, 4))} accessibilityRole="button" accessibilityLabel="다음 해" style={[s.arrow, year >= Number(today.slice(0, 4)) && { opacity: 0.3 }]}><ChevronRight size={22} color={p.textPrimary} /></Pressable>
            </>}
          </View>

          {mode === 'month' ? <>
            <View style={[s.card, { backgroundColor: p.cardBg }]}>
              <MonthMoodGrid month={month} byDate={byDate} today={today} selected={date} onPick={pick} />
            </View>
            <View style={[s.card, s.pad, { backgroundColor: p.cardBg }]}>
              <View style={s.sh}><Text style={[s.shTitle, { color: p.textPrimary }]}>이번 달 기분</Text><Text style={{ color: p.textTertiary, fontSize: 12.5 }}>{inMonth.length}일 남겼어요</Text></View>
              <MoodDistribution entries={inMonth} />
            </View>
            {month === today.slice(0, 7) ? (
              <View style={[s.card, s.pad, { backgroundColor: p.cardBg }]}>
                <View style={s.sh}><Text style={[s.shTitle, { color: p.textPrimary }]}>이번 주 돌아보기</Text><Text style={{ color: p.textTertiary, fontSize: 12.5 }}>{Number(week[0].slice(5, 7))}월 {Number(week[0].slice(8))}일 ~ {Number(week[6].slice(8))}일</Text></View>
                <View style={s.wk}>
                  {weekRows.map((d, i) => (
                    <Pressable key={d.date} disabled={d.date > today} onPress={() => pick(d.date)} accessibilityRole="button" accessibilityLabel={`${Number(d.date.slice(8))}일`} style={s.wkCell}>
                      {d.private && d.written ? <View style={[s.wkEmpty, { borderColor: p.borderStrong, borderStyle: 'solid' }]}><Lock size={12} color={p.textTertiary} /></View>
                        : d.mood ? <MoodFace mood={d.mood} size={30} />
                        : <View style={[s.wkEmpty, { borderColor: p.borderStrong, opacity: d.date > today ? 0.4 : 1 }]} />}
                      <Text style={{ color: d.date === today ? p.accentInk : p.textTertiary, fontSize: 11, fontWeight: d.date === today ? '700' : '500' }}>{WEEK_DAYS[new Date(`${d.date}T00:00:00`).getDay()]}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={s.wkLine}>
                  <BuddyArt buddy={buddy} stage={buddy.stage} size={40} mood="happy" still={reduced} crop="bust" />
                  <View style={[s.bubble, { backgroundColor: p.dark ? p.bgSelected : p.pageBg }]}><Text style={{ color: p.textPrimary, fontSize: 14, lineHeight: 20 }}>{weekLine}</Text></View>
                </View>
                <Pressable accessibilityRole="button" onPress={() => void weekOne()} style={[s.block, { backgroundColor: p.bgSelected }]}>
                  <Text style={{ color: p.textPrimary, fontSize: 15, fontWeight: '700' }}>이번 주를 한 줄로 남기기</Text>
                </Pressable>
              </View>
            ) : null}
          </> : (
            <View style={[s.card, s.pad, { backgroundColor: p.cardBg }]}>
              <View style={s.sh}><Text style={[s.shTitle, { color: p.textPrimary }]}>한 해 기분</Text><Text style={{ color: p.textTertiary, fontSize: 12.5 }}>{entries.filter((e) => e.date.startsWith(String(year)) && isWritten(e)).length}일 남겼어요</Text></View>
              <YearMosaic year={year} entries={entries} today={today} onPick={pick} onMonth={(m) => { setMonth(m); setMode('month') }} />
            </View>
          )}
        </ScrollView>
      </GestureDetector>
    </View>
  )
}
const s = StyleSheet.create({
  hdr: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 4 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.75 },
  titleSub: { fontSize: 15, fontWeight: '600', letterSpacing: 0 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, padding: 10 },
  pad: { padding: 16, gap: 12 },
  sh: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  shTitle: { fontSize: 15, fontWeight: '700' },
  wk: { flexDirection: 'row', justifyContent: 'space-between' },
  wkCell: { alignItems: 'center', gap: 4, minWidth: 40, minHeight: 44 },
  wkEmpty: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  wkLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { flex: 1, borderRadius: 16, borderBottomLeftRadius: 6, paddingHorizontal: 12, paddingVertical: 9 },
  block: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }
})
