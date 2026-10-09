// 성향 조사(23 §3, 시안 B5~B7 · 10 §2.2): 시작 → 8문항(동점이면 +1) → 결과·이름 짓기. 문항·점수는 공용 @sprout/schema/growth.
// 결과는 데스크톱 assignCharacter와 같은 칸(characters.species·type_code·answers_json·assessed_at·name)에 써서 데스크톱에도 같은 캐릭터.
import { useLiveQuery } from '../../src/data/rows'
import { scoreSurvey, SPECIES, speciesFrom, type Pick2, type Species } from '@sprout/schema/growth'
import { hx } from '../../src/ui/haptics'
import { useRouter } from 'expo-router'
import { Check, ChevronLeft, X } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { Easing, FadeIn, SlideInRight, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CharacterArt, Egg, HatchTop } from '../../src/growth/art/CharacterArt'
import { SpeciesBurst } from '../../src/growth/Bits'
import { assignCharacter } from '../../src/growth/data'
import { CHARACTER_SQL } from '../../src/growth/goalCore'
import { axisView, defaultName, MAIN_QUESTIONS, SURVEY_DESC, surveyQueue, typeCodeOf, type CharacterRow } from '../../src/growth/logic'
import { useMotionReduced } from '../../src/growth/motion'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'

const ALL: Species[] = ['snail', 'bee', 'worm', 'frog']

export default function Survey() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useMotionReduced()
  const current = useLiveQuery<CharacterRow>(CHARACTER_SQL).data[0]
  const again = !!current?.species
  const [step, setStep] = useState<'intro' | 'quiz' | 'result'>('intro')
  const [answers, setAnswers] = useState<Record<string, Pick2>>({})
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<Pick2 | null>(null)
  const [name, setName] = useState('')
  const score = useMemo(() => scoreSurvey(answers), [answers])
  const queue = useMemo(() => surveyQueue(answers), [answers])
  const species = speciesFrom(score)
  const close = () => router.back()

  const pick = (k: Pick2) => {
    if (picked) return
    const q = queue[i]
    hx.tick()
    setPicked(k)
    const next = { ...answers, [q.id]: k }
    // 누르는 순간 강조색 → 0.25초 뒤 다음 문항(B6)
    setTimeout(() => {
      setPicked(null)
      setAnswers(next)
      const s = scoreSurvey(next)
      const sp = speciesFrom(s)
      if (MAIN_QUESTIONS.every((x) => next[x.id]) && sp) { setName(defaultName(sp, current?.name)); setStep('result'); return }
      setI(i + 1)
    }, reduced ? 120 : 250)
  }

  return (
    <View style={[s.screen, { backgroundColor: p.bgApp, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {step === 'intro' && (
        <View style={{ flex: 1 }}>
          <View style={s.nav}><View style={{ flex: 1 }} /><GlassButton label="닫기" onPress={close}><X size={20} color={p.textPrimary} /></GlassButton></View>
          <View style={s.intro}>
            <Egg size={150} />
            <View style={s.sils}>{ALL.map((sp) => <CharacterArt key={sp} species={sp} size={52} silhouette={p.dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.16)'} />)}</View>
            <Text style={[s.h1, { color: p.textPrimary }]}>{again ? '성향을 다시 알아볼까요?' : '나와 닮은 친구를\n찾아볼까요?'}</Text>
            <Text style={[s.lead, { color: p.textSecondary }]}>
              {again ? '질문 8개에 다시 답하면 캐릭터 종류가 바뀔 수 있어요.\n지금까지 쌓은 레벨과 XP는 그대로 이어져요.' : '할 일을 다루는 방식을 8가지만 물어볼게요.\n정답은 없어요. 1분이면 끝나요.'}
            </Text>
          </View>
          <View style={s.bottom}>
            <Pressable style={[s.big, { backgroundColor: p.accent }]} onPress={() => setStep('quiz')} accessibilityRole="button"><Text style={s.bigText}>시작하기</Text></Pressable>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button"><Text style={[s.ghost, { color: p.textSecondary }]}>나중에</Text></Pressable>
          </View>
        </View>
      )}

      {step === 'quiz' && queue[i] && (
        <View style={{ flex: 1 }}>
          <View style={s.nav}>
            <GlassButton label="이전" disabled={i === 0} onPress={() => setI(Math.max(0, i - 1))}><ChevronLeft size={22} color={i === 0 ? p.textQuaternary : p.textPrimary} /></GlassButton>
            <Text style={[s.count, { color: p.textSecondary }]}>{Math.min(i + 1, queue.length)} / {queue.length}</Text>
            <GlassButton label="닫기" onPress={close}><X size={20} color={p.textPrimary} /></GlassButton>
          </View>
          <View style={[s.prog, { backgroundColor: p.bgSelected }]}><View style={{ height: 4, borderRadius: 2, backgroundColor: p.accent, width: `${(i / queue.length) * 100}%` }} /></View>
          <Animated.View key={queue[i].id} entering={reduced ? FadeIn.duration(150) : SlideInRight.duration(260).easing(Easing.out(Easing.cubic))} style={{ paddingTop: 56 }}>
            <Text style={[s.situ, { color: p.textTertiary }]}>상황 {i + 1}</Text>
            <Text style={[s.q, { color: p.textPrimary }]}>{queue[i].text}</Text>
            {(['A', 'B'] as Pick2[]).map((k) => {
              const on = picked === k || (!picked && answers[queue[i].id] === k)
              return (
                <Pressable key={k} onPress={() => pick(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[s.qcard, { borderColor: on ? p.accent : p.borderDivider, backgroundColor: on ? p.accentSubtle : p.cardBg }]}>
                  <View style={[s.key, { backgroundColor: on ? p.accent : p.bgSelected }]}>
                    {on ? <Check size={16} color="#fff" strokeWidth={3} /> : <Text style={[s.keyText, { color: p.textSecondary }]}>{k}</Text>}
                  </View>
                  <Text style={[s.qtext, { color: p.textPrimary }]}>{k === 'A' ? queue[i].a : queue[i].b}</Text>
                </Pressable>
              )
            })}
          </Animated.View>
          <View style={{ flex: 1 }} />
          <Text style={[s.hint, { color: p.textTertiary }]}>‹ 를 누르면 앞 문항을 다시 고를 수 있어요</Text>
        </View>
      )}

      {step === 'result' && species && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingTop: 52, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <Hatch species={species} reduced={reduced} />
            <Text style={[s.eyebrow, { color: p.textTertiary }]}>당신은</Text>
            <Text style={[s.typeName, { color: p.textPrimary }]}>{SPECIES[species].name}형</Text>
            <Text style={[s.desc, { color: p.textSecondary }]}>{SURVEY_DESC[species].join('\n')}</Text>
            <Axis p={p} left="계획" right="즉흥" ax={score.plan} />
            <Axis p={p} left="몰입" right="멀티" ax={score.focus} />
            <Text style={[s.nameLabel, { color: p.textTertiary }]}>이름을 지어 주세요</Text>
            <TextInput value={name} onChangeText={setName} maxLength={12} returnKeyType="done" accessibilityLabel="캐릭터 이름"
              style={[s.field, { color: p.textPrimary, borderColor: p.accent, backgroundColor: p.bgInput }]} />
          </ScrollView>
          <View style={[s.bottom, { paddingBottom: 12 }]}>
            <Pressable style={[s.big, { backgroundColor: p.accent, opacity: name.trim() ? 1 : 0.5 }]} disabled={!name.trim()} accessibilityRole="button"
              onPress={async () => {
                await assignCharacter(dayKey(), { species, typeCode: typeCodeOf(score), answers, name: name.trim() })
                close()
              }}>
              <Text style={s.bigText}>키우기 시작</Text>
            </Pressable>
            <Pressable onPress={() => { setAnswers({}); setI(0); setStep('quiz') }} hitSlop={8} accessibilityRole="button"><Text style={[s.ghost, { color: p.textSecondary }]}>다시 하기</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}

/** 씨앗 깨기(42 §10.6): 종마다 다른 뚜껑(달팽이 씨앗 윗껍질 · 꿀벌 밀랍 뚜껑 · 애벌레 알 윗부분 · 올챙이 물방울 막)이
 *  두 번 흔들린 뒤 날아가고(물방울은 터지고) 아랫단째 아기가 톡 + 종 조각. 움직임 줄이기 = 뚜껑 페이드만 */
function Hatch({ species, reduced }: { species: Species; reduced: boolean }) {
  const [hatched, setHatched] = useState(reduced)
  const rot = useSharedValue(0), tx = useSharedValue(0), ty = useSharedValue(0), sc = useSharedValue(1), op = useSharedValue(1), hop = useSharedValue(0)
  useEffect(() => {
    if (reduced) { op.value = withTiming(0, { duration: 300 }); return }
    rot.value = withSequence(withTiming(-6, { duration: 180 }), withTiming(6, { duration: 180 }), withTiming(-8, { duration: 180 }), withTiming(8, { duration: 180 }), withTiming(0, { duration: 180 }))
    const fly = { duration: 300 }
    if (species === 'frog') sc.value = withDelay(900, withTiming(1.3, fly))
    else { tx.value = withDelay(900, withTiming(40, fly)); ty.value = withDelay(900, withTiming(-120, fly)) }
    op.value = withDelay(900, withTiming(0, fly))
    hop.value = withDelay(900, withSequence(withTiming(-10, { duration: 150 }), withTiming(0, { duration: 250 })))
    const t = setTimeout(() => setHatched(true), 900)
    return () => clearTimeout(t)
  }, [reduced, species, rot, tx, ty, sc, op, hop])
  const lid = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${rot.value}deg` }, { scale: sc.value }] }))
  const baby = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }] }))
  return (
    <View style={s.hatch}>
      <Animated.View style={baby}><CharacterArt species={species} stage={1} size={150} mood={hatched ? 'happy' : 'wow'} /></Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, lid]} pointerEvents="none"><HatchTop species={species} size={150} fit /></Animated.View>
      {hatched && !reduced ? <View style={s.hatchBurst} pointerEvents="none"><SpeciesBurst species={species} count={12} dist={110} big /></View> : null}
    </View>
  )
}

function Axis({ p, left, right, ax }: { p: ReturnType<typeof usePalette>; left: string; right: string; ax: { ratioA: number; leanA: boolean | null } }) {
  const v = axisView(ax)
  return (
    <View style={s.axis}>
      <View style={s.axisEnds}>
        <Text style={[s.axisText, { color: v.strongA ? p.textPrimary : p.textTertiary }, v.strongA && { fontWeight: '700' }]}>{left}{v.strongA ? ` ${v.pctA}%` : ''}</Text>
        <Text style={[s.axisText, { color: !v.strongA ? p.textPrimary : p.textTertiary }, !v.strongA && { fontWeight: '700' }]}>{right}{!v.strongA ? ` ${v.pctB}%` : ''}</Text>
      </View>
      <View style={[s.axisTrack, { backgroundColor: p.bgSelected }]}>
        <View style={[s.axisFill, { backgroundColor: p.accent, width: `${v.strongA ? v.pctA : v.pctB}%` }, v.strongA ? { left: 0 } : { right: 0 }]} />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  count: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  intro: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 30 },
  sils: { flexDirection: 'row', gap: 14, marginTop: 18, marginBottom: 22 },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '800', textAlign: 'center' },
  lead: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  bottom: { position: 'relative', marginTop: 'auto', paddingHorizontal: 24, paddingBottom: 30, gap: 6, alignItems: 'center' },
  big: { alignSelf: 'stretch', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bigText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  ghost: { fontSize: 15, padding: 10 },
  prog: { height: 4, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  situ: { fontSize: 13, paddingHorizontal: 24 },
  q: { fontSize: 26, lineHeight: 34, fontWeight: '800', paddingHorizontal: 24, paddingTop: 6, paddingBottom: 40 },
  qcard: { marginHorizontal: 16, marginBottom: 12, minHeight: 72, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  key: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 14, fontWeight: '700' },
  qtext: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  hint: { textAlign: 'center', fontSize: 12, paddingBottom: 24 },
  hatch: { height: 160, alignItems: 'center', justifyContent: 'center' },
  hatchBurst: { position: 'absolute', left: 0, right: 0, top: 10, bottom: 0 },
  eyebrow: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  typeName: { fontSize: 25, lineHeight: 32, fontWeight: '800', textAlign: 'center' },
  desc: { fontSize: 14.5, lineHeight: 22, textAlign: 'center', paddingHorizontal: 30, paddingTop: 10, paddingBottom: 16 },
  axis: { paddingHorizontal: 24, marginBottom: 10 },
  axisEnds: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  axisText: { fontSize: 13 },
  axisTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  axisFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  nameLabel: { fontSize: 13, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 6 },
  field: { marginHorizontal: 24, height: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 17 }
})
