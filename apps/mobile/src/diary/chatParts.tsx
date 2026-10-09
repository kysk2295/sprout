// 28 §8.4 대화 부품: 말풍선 · 점 세 개 · 빠른 답 칩 줄 · 기분 얼굴 줄 · 입력창. 누르는 것은 모두 44pt 이상.
import { ArrowUp } from 'lucide-react-native'
import { forwardRef, memo, useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { CharacterArt } from '../growth/art/CharacterArt'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { PressableScale } from '../ui/Pressables'
import { MoodFace } from './art'
import { MOODS, moodOf, type Buddy } from './logic'
import { BuddyArt } from './parts'
import { moodShort } from './talk'

/** 점 세 개(0.65초 기다림·AI 읽는 중) — opacity만, 움직임 줄이기면 멈춤 */
function Dot({ i, still }: { i: number; still: boolean }) {
  const p = usePalette()
  const o = useSharedValue(still ? 0.6 : 0.3)
  useEffect(() => {
    if (still) return
    o.value = withDelay(i * 150, withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0.3, { duration: 400 })), -1))
    return () => cancelAnimation(o)
  }, [still, i, o])
  const st = useAnimatedStyle(() => ({ opacity: o.value }))
  return <Animated.View style={[s.dot, { backgroundColor: p.textTertiary }, st]} />
}
export const TypingDots = memo(function TypingDots({ still }: { still: boolean }) {
  return <View style={s.dots} accessibilityLabel="쓰는 중">{[0, 1, 2].map((i) => <Dot key={i} i={i} still={still} />)}</View>
})

/** 캐릭터 말풍선 줄: 묶음 첫 줄만 얼굴(30), 마지막 말의 얼굴만 숨쉰다(한 번에 하나만 움직임 — §8.8) */
export function BuddyRow({ buddy, avatar, live, still, face = 'smile', ai, children }: { buddy: Buddy & { stage: number }; avatar: boolean; live: boolean; still: boolean; face?: 'smile' | 'happy' | 'default' | 'giggle' | 'think'; ai?: boolean; children: ReactNode }) {
  const p = usePalette()
  return (
    <View style={s.rowB}>
      <View style={[s.av, avatar && { backgroundColor: p.accentSubtle }]}>
        {avatar ? (live ? <BuddyArt buddy={buddy} stage={buddy.stage} size={30} mood={face} still={still} crop="bust" /> : <CharacterArt species={buddy.species} stage={buddy.stage} size={30} mood={face} crop="bust" />) : null}
      </View>
      <View style={[s.bb, { backgroundColor: p.dark ? p.bgSelected : p.cardBg, shadowOpacity: p.dark ? 0 : 0.06 }, ai && { borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(p.accent, 0.35) }]}>{children}</View>
    </View>
  )
}
export function MeRow({ text, mood, skip }: { text: string; mood?: number | null; skip?: boolean }) {
  const p = usePalette()
  return (
    <View style={[s.bm, skip ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: p.borderStrong } : { backgroundColor: p.accentSubtle }]}>
      {mood ? <MoodFace mood={mood} size={26} /> : null}
      <Text style={[s.msg, { color: skip ? p.textTertiary : p.textPrimary, flexShrink: 1 }]}>{text}</Text>
    </View>
  )
}

/** 빠른 답 칩(높이 44, 가로 스크롤). mute = 회색(건너뛸래·그냥 쓸래요), acc = 강조 테두리 */
export type Chip = { key: string; label: string; onPress: () => void; tone?: 'mute' | 'acc'; icon?: ReactNode }
export const ChipRow = memo(function ChipRow({ chips, disabled }: { chips: Chip[]; disabled?: boolean }) {
  const p = usePalette()
  if (!chips.length) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={s.qr} style={disabled && { opacity: 0.45 }}>
      {chips.map((c) => (
        <PressableScale key={c.key} accessibilityRole="button" accessibilityLabel={c.label} disabled={disabled} onPress={c.onPress}
          style={[s.qc, c.tone === 'mute' ? { backgroundColor: p.bgSelected, borderColor: 'transparent' } : { backgroundColor: p.cardBg, borderColor: c.tone === 'acc' ? p.accent : p.borderStrong }]}>
          {c.icon}
          <Text style={{ color: c.tone === 'acc' ? p.accentInk : c.tone === 'mute' ? p.textSecondary : p.textPrimary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{c.label}</Text>
        </PressableScale>
      ))}
    </ScrollView>
  )
})

/** 기분 빠른 답: 얼굴 40 × 5, 누르는 칸 64×58 + 짧은 이름 */
export const MoodRow = memo(function MoodRow({ onPick, disabled, selected }: { onPick: (v: number) => void; disabled?: boolean; selected?: number | null }) {
  const p = usePalette()
  return (
    <View style={s.qmood} accessibilityRole="radiogroup" accessibilityLabel="오늘 기분">
      {MOODS.map((m) => {
        const on = selected === m.value
        const dim = !!selected && !on
        return (
          <PressableScale key={m.value} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={m.label} disabled={disabled} onPress={() => onPick(m.value)} style={s.qf}>
            <MoodFace mood={m.value} size={on ? 46 : 40} faded={dim} />
            <Text style={{ color: on ? p.textPrimary : p.textSecondary, fontSize: 11.5, fontWeight: on ? '700' : '600' }}>{moodShort(m.value)}</Text>
          </PressableScale>
        )
      })}
    </View>
  )
})

/** 입력창(높이 48, 모서리 24) + 보내기 원 40. 한 줄 보내기(⏎ = 보내기) */
export const Composer = forwardRef<TextInput, { placeholder: string; onSend: (t: string) => void; disabled?: boolean; ai?: boolean }>(function Composer({ placeholder, onSend, disabled, ai }, ref) {
  const p = usePalette()
  const [v, setV] = useState('')
  const ok = !!v.trim() && !disabled
  const send = () => { if (!ok) return; const t = v.trim(); setV(''); onSend(t) }
  return (
    <View style={[s.cmp, { backgroundColor: p.cardBg, borderColor: ai ? alpha(p.accent, 0.45) : p.borderDivider }]}>
      <TextInput
        ref={ref}
        value={v}
        onChangeText={setV}
        placeholder={placeholder}
        placeholderTextColor={p.textTertiary}
        accessibilityLabel="답 쓰기"
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={send}
        maxLength={1000}
        style={[s.input, { color: p.textPrimary }]}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="보내기" disabled={!ok} onPress={send} hitSlop={4} style={[s.send, { backgroundColor: p.accent, opacity: ok ? 1 : 0.3 }]}>
        <ArrowUp size={18} color={p.onAccent} strokeWidth={2.4} />
      </Pressable>
    </View>
  )
})

export const moodFaceArt = (mood: number | null | undefined): 'smile' | 'happy' | 'default' | 'giggle' => (mood === 5 ? 'giggle' : mood === 4 ? 'happy' : mood === 3 ? 'smile' : mood ? 'default' : 'smile')
export const moodName = (v: number | null | undefined) => moodOf(v)?.label ?? ''

const s = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 4, paddingVertical: 7, paddingHorizontal: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowB: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '88%' },
  av: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bb: { flexShrink: 1, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 13, paddingVertical: 9, shadowColor: '#0B2A22', shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, gap: 8 },
  bm: { alignSelf: 'flex-end', maxWidth: '82%', borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  msg: { fontSize: 15, lineHeight: 22 },
  qr: { gap: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 },
  qc: { height: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  qmood: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 8 },
  qf: { width: 64, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 16, paddingVertical: 4 },
  cmp: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, paddingLeft: 16, paddingRight: 4, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 15.5, height: 44, paddingVertical: 0 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }
})
export const chatStyles = s
