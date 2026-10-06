// 일기 화면 부품: 곁에 앉은 캐릭터(숨쉬기·반응) · 월 기분 달력(주 시작 설정 — 06 §16.1) · 연 12×31 모자이크 · 기분 비율 막대
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { CharacterArt } from '../growth/art/CharacterArt'
import type { Mood } from '../growth/logic'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { MoodFace, PaperIcon, diaryColors } from './art'
import { MOODS, moodOf, monthGrid, moodShare, weekDaysHead, yearMosaic, isWritten, type Buddy, type DiaryEntry } from './logic'
import { useWeekStart } from '../data/calendarPrefs'
import { headWeekday } from '@sprout/schema/weekStart'

/** 캐릭터: 대기 중엔 숨쉬기(움직임 줄이기면 멈춤), bounce가 바뀌면 깡충 한 번 */
export function BuddyArt({ buddy, stage, size, mood = 'default', still, bounce }: { buddy: Buddy; stage: number; size: number; mood?: Mood; still?: boolean; bounce?: number }) {
  const breathe = useSharedValue(1)
  const hop = useSharedValue(0)
  useEffect(() => {
    if (still) { cancelAnimation(breathe); breathe.value = 1; return }
    breathe.value = withRepeat(withSequence(withTiming(1.03, { duration: 1400 }), withTiming(1, { duration: 1400 })), -1)
    return () => cancelAnimation(breathe)
  }, [still, breathe])
  useEffect(() => {
    if (!bounce || still) return
    hop.value = withSequence(withTiming(-8, { duration: 140 }), withTiming(0, { duration: 180 }))
  }, [bounce, still, hop])
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }, { scaleY: breathe.value }] }))
  return <Animated.View style={st}><CharacterArt species={buddy.species} stage={stage} size={size} mood={mood} /></Animated.View>
}

/** 말풍선(캐릭터 옆) */
export function Bubble({ text, side = 'left' }: { text: string; side?: 'left' | 'right' }) {
  const p = usePalette()
  return (
    <View style={[s.bubble, { backgroundColor: p.bgPopover, borderColor: p.borderPopover }, side === 'left' ? { borderBottomLeftRadius: 4 } : { borderBottomRightRadius: 4 }]}>
      <Text accessibilityLiveRegion="polite" style={{ color: p.textPrimary, fontSize: 13.5, lineHeight: 19 }}>{text}</Text>
    </View>
  )
}

/** 월 기분 달력(28 §2.4, 15 §9.6): 칸 = 기분 색 20% + 얼굴, 오늘 = 강조색 링, 미래 = 흐림, 안 쓴 지난 날 = 점선 */
export function MonthMoodGrid({ month, entries, today, selected, onPick, cell = 52 }: {
  month: string; entries: DiaryEntry[]; today: string; selected?: string; onPick: (date: string) => void; cell?: number
}) {
  const p = usePalette()
  const c = diaryColors(p)
  const by = new Map(entries.map((e) => [e.date, e]))
  const ws = useWeekStart()
  const days = monthGrid(month, ws)
  const rows = days.slice(35).every((d) => d.slice(0, 7) !== month) ? 5 : 6
  return (
    <View>
      <View style={s.weekHead}>{weekDaysHead(ws).map((w, i) => <Text key={w} style={[s.wh, { color: headWeekday(i, ws) === 0 || headWeekday(i, ws) === 6 ? p.textTertiary : p.textSecondary }]}>{w}</Text>)}</View>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={s.gridRow}>
          {days.slice(r * 7, r * 7 + 7).map((d) => {
            const inMonth = d.slice(0, 7) === month
            if (!inMonth) return <View key={d} style={[s.cell, { height: cell }]} />
            const e = by.get(d)
            const m = moodOf(e?.mood)
            const future = d > today
            const written = !!e && isWritten(e)
            return (
              <Pressable
                key={d}
                disabled={future}
                accessibilityRole="button"
                accessibilityLabel={`${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일${m ? ` · ${m.label}` : written ? ' · 기록' : ''}`}
                onPress={() => onPick(d)}
                style={[s.cell, { height: cell }]}
              >
                <View style={[
                  s.cellIn,
                  { backgroundColor: m ? alpha(m.color, 0.2) : 'transparent' },
                  !written && !future && { borderWidth: 1, borderStyle: 'dashed', borderColor: p.borderDivider },
                  d === today && { borderWidth: 2, borderStyle: 'solid', borderColor: p.accent },
                  d === selected && d !== today && { borderWidth: 2, borderStyle: 'solid', borderColor: p.textSecondary },
                  future && { opacity: 0.35 }
                ]}>
                  <Text style={[s.dnum, { color: d === today ? p.accent : p.textSecondary }]}>{Number(d.slice(8))}</Text>
                  {m ? <MoodFace mood={m.value} size={cell >= 48 ? 21 : 16} /> : written ? <PaperIcon size={cell >= 48 ? 20 : 15} paper={c.paper} line={p.textQuaternary} /> : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

/** 연 12줄 × 31칸 모자이크(15 §9.6) — 칸 누르면 그날, 달 이름 누르면 월 보기 */
export function YearMosaic({ year, entries, today, onPick, onMonth }: { year: number; entries: DiaryEntry[]; today: string; onPick: (d: string) => void; onMonth: (m: string) => void }) {
  const p = usePalette()
  const rows = yearMosaic(year, entries, today)
  return (
    <View style={{ gap: 3 }}>
      {rows.map((cells, m) => (
        <View key={m} style={s.yrow}>
          <Pressable onPress={() => onMonth(`${year}-${String(m + 1).padStart(2, '0')}`)} accessibilityRole="button" accessibilityLabel={`${m + 1}월 보기`} style={s.ylabelBox}>
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
}

/** 기분 비율 막대 + 범례 */
export function MoodBar({ entries }: { entries: Pick<DiaryEntry, 'mood'>[] }) {
  const p = usePalette()
  const share = moodShare(entries)
  if (!share.length) return <Text style={{ color: p.textTertiary, fontSize: 13 }}>이 달은 아직 기분 기록이 없어요</Text>
  return (
    <View style={{ gap: 8 }}>
      <View style={s.bar}>{share.map((r) => <View key={r.mood} style={{ flex: r.ratio, backgroundColor: MOODS[r.mood - 1].color }} />)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {share.map((r) => (
          <View key={r.mood} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MoodFace mood={r.mood} size={16} />
            <Text style={{ color: p.textSecondary, fontSize: 12.5 }}>{r.n}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  bubble: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 7, maxWidth: 220 },
  weekHead: { flexDirection: 'row', marginBottom: 4 },
  wh: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500' },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, padding: 2 },
  cellIn: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 1 },
  dnum: { position: 'absolute', top: 3, left: 5, fontSize: 10.5, fontWeight: '600' },
  yrow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ylabelBox: { width: 28 },
  ylabel: { fontSize: 10, fontWeight: '600' },
  ycell: { flex: 1, aspectRatio: 1, borderRadius: 2 },
  bar: { height: 9, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' }
})
