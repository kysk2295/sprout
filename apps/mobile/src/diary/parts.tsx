// 일기 화면 부품: 곁에 앉은 캐릭터(숨쉬기·반응) · 기분 달력(28 §8.4 — 칸 56, 얼굴 30, 주 시작 설정 06 §16.1) · 연 12×31 모자이크 · 이번 달 기분 분포
import { memo, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { Lock } from 'lucide-react-native'
import { CharacterArt } from '../growth/art/CharacterArt'
import type { ArtMood as Mood } from '@sprout/schema/characterArt'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { MoodFace } from './art'
import { MOODS, moodOf, monthGrid, weekDaysHead, yearMosaic, isWritten, type Buddy, type DiaryEntry } from './logic'
import { moodShort } from './talk'
import { useWeekStart } from '../data/calendarPrefs'
import { headWeekday } from '@sprout/schema/weekStart'

/** 캐릭터: 대기 중엔 숨쉬기(움직임 줄이기면 멈춤), bounce가 바뀌면 깡충 한 번 — transform만(39 §11) */
export function BuddyArt({ buddy, stage, size, mood = 'default', still, bounce, crop }: { buddy: Buddy; stage: number; size: number; mood?: Mood; still?: boolean; bounce?: number; crop?: 'bust' }) {
  const breathe = useSharedValue(1)
  const hop = useSharedValue(0)
  useEffect(() => {
    if (still) { cancelAnimation(breathe); breathe.value = 1; return }
    breathe.value = withRepeat(withSequence(withTiming(1.03, { duration: 1600 }), withTiming(1, { duration: 1600 })), -1)
    return () => cancelAnimation(breathe)
  }, [still, breathe])
  useEffect(() => {
    if (!bounce || still) return
    hop.value = withSequence(withTiming(-8, { duration: 140 }), withTiming(0, { duration: 180 }))
  }, [bounce, still, hop])
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }, { scaleY: breathe.value }] }))
  return <Animated.View style={st}><CharacterArt species={buddy.species} stage={stage} size={size} mood={mood} crop={crop} /></Animated.View>
}

/** 기분 달력 한 달: 칸 = 날짜 + 그날 얼굴(30). 오늘 = 강조 칩, 안 쓴 지난 날 = 점, 나만 보기 = 자물쇠, 기분 없이 쓴 날 = 강조 점, 미래 = 흐림 */
export const MonthMoodGrid = memo(function MonthMoodGrid({ month, byDate, today, selected, onPick, cell = 56 }: {
  month: string; byDate: Map<string, DiaryEntry>; today: string; selected?: string; onPick: (date: string) => void; cell?: number
}) {
  const p = usePalette()
  const ws = useWeekStart()
  const days = monthGrid(month, ws)
  const rows = days.slice(35).every((d) => d.slice(0, 7) !== month) ? 5 : 6
  return (
    <View>
      <View style={s.weekHead}>{weekDaysHead(ws).map((w, i) => <Text key={w} style={[s.wh, { color: headWeekday(i, ws) === 0 || headWeekday(i, ws) === 6 ? p.textTertiary : p.textSecondary }]}>{w}</Text>)}</View>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={s.gridRow}>
          {days.slice(r * 7, r * 7 + 7).map((d) => {
            if (d.slice(0, 7) !== month) return <View key={d} style={[s.cell, { height: cell }]} />
            const e = byDate.get(d)
            const m = moodOf(e?.mood)
            const future = d > today
            const written = !!e && isWritten(e)
            const isToday = d === today
            return (
              <Pressable
                key={d}
                disabled={future}
                accessibilityRole="button"
                accessibilityLabel={`${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일${e?.private ? ' · 나만 보기' : m ? ` · ${m.label}` : written ? ' · 기록' : ''}`}
                onPress={() => onPick(d)}
                style={({ pressed }) => [s.cell, { height: cell }, future && { opacity: 0.35 }, pressed && { opacity: 0.6 }]}
              >
                <View style={[s.num, isToday && { backgroundColor: p.accent }, d === selected && !isToday && { backgroundColor: p.bgSelected }]}>
                  <Text style={[s.dnum, { color: isToday ? p.onAccent : p.textSecondary }]}>{Number(d.slice(8))}</Text>
                </View>
                <View style={s.face}>
                  {e?.private && written ? <Lock size={14} color={p.textTertiary} />
                    : m ? <MoodFace mood={m.value} size={30} />
                    : written ? <View style={[s.dot, { backgroundColor: alpha(p.accent, 0.55) }]} />
                    : !future ? <View style={[s.dot, { backgroundColor: p.borderStrong }]} /> : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
})

/** 연 12줄 × 31칸 모자이크(15 §9.6) — 칸 누르면 그날, 달 이름 누르면 월 보기 */
export const YearMosaic = memo(function YearMosaic({ year, entries, today, onPick, onMonth }: { year: number; entries: DiaryEntry[]; today: string; onPick: (d: string) => void; onMonth: (m: string) => void }) {
  const p = usePalette()
  const rows = yearMosaic(year, entries, today)
  return (
    <View style={{ gap: 3 }}>
      {rows.map((cells, m) => (
        <View key={m} style={s.yrow}>
          <Pressable onPress={() => onMonth(`${year}-${String(m + 1).padStart(2, '0')}`)} accessibilityRole="button" accessibilityLabel={`${m + 1}월 보기`} style={s.ylabelBox} hitSlop={6}>
            <Text style={[s.ylabel, { color: p.textTertiary }]}>{m + 1}월</Text>
          </Pressable>
          {cells.map((cl, d) => {
            if (!cl) return <View key={d} style={s.ycell} />
            const color = cl.kind === 'mood' ? moodOf(cl.mood)!.color : cl.kind === 'plain' ? alpha(p.accent, 0.4) : p.bgSelected
            return (
              <Pressable key={d} disabled={cl.kind === 'future'} onPress={() => onPick(cl.date)} accessibilityLabel={`${m + 1}월 ${d + 1}일`} hitSlop={1}
                style={[s.ycell, { backgroundColor: color, opacity: cl.kind === 'future' ? 0.4 : 1 }, cl.date === today && { borderWidth: 1.5, borderColor: p.accent }]} />
            )
          })}
        </View>
      ))}
    </View>
  )
})

/** 이번 달 기분(28 §8.4): 막대 12 + 얼굴 다섯(28) · 개수 · 짧은 이름. 연속 숫자 없음 */
export const MoodDistribution = memo(function MoodDistribution({ entries }: { entries: Pick<DiaryEntry, 'mood'>[] }) {
  const p = usePalette()
  const counts = MOODS.map((m) => entries.filter((e) => e.mood === m.value).length)
  const total = counts.reduce((a, b) => a + b, 0)
  if (!total) return <Text style={{ color: p.textTertiary, fontSize: 13, lineHeight: 18 }}>이 달은 아직 비어 있어요</Text>
  return (
    <View style={{ gap: 12 }}>
      <View style={s.bar}>{MOODS.map((m, i) => (counts[i] ? <View key={m.value} style={{ flex: counts[i], backgroundColor: m.color }} /> : null))}</View>
      <View style={s.legend}>
        {MOODS.map((m, i) => (
          <View key={m.value} style={s.legItem} accessible accessibilityLabel={`${m.label} ${counts[i]}일`}>
            <MoodFace mood={m.value} size={28} faded={!counts[i]} />
            <Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '700' }}>{counts[i]}</Text>
            <Text style={{ color: p.textTertiary, fontSize: 11 }}>{moodShort(m.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
})

const s = StyleSheet.create({
  weekHead: { flexDirection: 'row', marginBottom: 4 },
  wh: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500' },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingTop: 2 },
  num: { minWidth: 20, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  dnum: { fontSize: 11, fontWeight: '600' },
  face: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  yrow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ylabelBox: { width: 28 },
  ylabel: { fontSize: 10, fontWeight: '600' },
  ycell: { flex: 1, aspectRatio: 1, borderRadius: 2 },
  bar: { height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row' },
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  legItem: { alignItems: 'center', gap: 2, minWidth: 44 }
})
