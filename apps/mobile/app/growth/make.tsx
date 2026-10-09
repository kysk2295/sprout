// 49 §5 캐릭터 만들기 흐름(휴대폰, 시안 character-v3.html A "만들기 흐름 — 끝까지 눌러짐"):
// 0 시작 → 1 씨앗 고르기 → 2 성향 카드(10 §2.2 문항 그대로) → 3 부화(두드림 세 번) → 4 이름 → 5 첫 할 일 → 6 정원(성장 탭으로 페이드).
// 저장: 4단계 `좋아요`에서 characters(species·type_code·answers_json·assessed_at·name — 데스크톱 assignCharacter와 같은 칸) + look_json.seed(병합).
// 첫 할 일 = 보통 tasks 행(오늘, 받은편지함) + 앱의 완료 경로(completeTasks — XP는 taskCore 규칙 그대로).
// 0·1·2단계 `나중에` = 닫기(성장 화면에 씨앗이 남고 같은 흐름을 다시 연다). 순수 계산은 src/growth/make/flow.ts.
import { SEED_NAMES } from '@sprout/schema/characterArt'
import { XP, type Pick2, type Species } from '@sprout/schema/growth'
import { useIsFocused, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, Keyframe, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SceneBackdrop } from '../../src/growth/art/Scene3D'
import { useCharacterWear } from '../../src/growth/art/CharacterArt'
import { myScene } from '../../src/growth/home/glass'
import { assignCharacter } from '../../src/growth/data'
import {
  answerQuiz, backQuiz, canSkip, cleanName, cleanTask, dotOf, FIRST_DONE_LINE, firstTitle, HATCH0, HATCH_T, NAME_MAX, nameChips, nameCount, PET_NAME,
  QUIZ0, quizCard, seedA11yLabel, TASK_CHIPS, tapSeed, typeCardOf, wakeSeed, wobbleMs, type Hatch, type MakeStep, type Quiz
} from '../../src/growth/make/flow'
import {
  AxisBar, Baby, BigButton, CheckCircle, Chip, Copy, crackSrc, Dots, FlashFill, FloatingSeed, Glass, HaloFill, makeColors, once, SeedStill, seedSrc,
  SeedTurn, WobbleSeed, type BabyHandle, type MakeColors, type SeedTurnHandle
} from '../../src/growth/make/parts'
import { useMotionReduced } from '../../src/growth/motion'
import { completeTasks, createTask } from '../../src/data/tasks'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { hx } from '../../src/ui/haptics'
import { PressableScale } from '../../src/ui/Pressables'
import { useToast } from '../../src/ui/Toast'

/** 단계 들어오기(.scr: opacity .38s + translateY 14 · scale .985 → 제자리) */
const ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.985 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.bezier(0.2, 0.8, 0.2, 1) }
}).duration(450)

export default function MakeCharacter() {
  const p = usePalette()
  const c = useMemo(() => makeColors(p), [p])
  const router = useRouter()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const reduced = useMotionReduced()
  const [step, setStep] = useState<MakeStep>(0)
  const [seed, setSeed] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Pick2>>({})
  const [species, setSpecies] = useState<Species | null>(null)
  const [name, setName] = useState('')
  const small = height < 720
  const seedSize = small ? 200 : 240

  const root = useSharedValue(1)
  const rootStyle = useAnimatedStyle(() => ({ opacity: root.value }))
  const close = () => { if (router.canGoBack()) router.back(); else router.dismissTo('/growth') }
  // 6 정원: 성장 탭으로 페이드
  const toGarden = () => {
    setStep(6)
    root.value = withTiming(0, { duration: reduced ? 200 : 380 })
    setTimeout(() => router.dismissTo('/growth'), reduced ? 200 : 380)
  }

  const saving = useRef(false)
  const saveCharacter = async (nm: string) => {
    if (!species || saving.current) return
    saving.current = true
    try {
      await assignCharacter(dayKey(), { species, typeCode: typeCardOf(species, answers).typeCode, answers, name: nm, seed })
      setName(nm)
      setStep(5)
    } catch (e) {
      console.warn('[make] save failed:', e)
      toast.show('저장하지 못했어요. 다시 눌러 주세요')
    } finally { saving.current = false }
  }

  // 만들기 흐름 = 새벽(다크 = 별밤), 6 정원 도착 = 내 배경 장면(49 §6.1, 기본 `자동`) — 0.3초 교차 페이드
  const myBg = useCharacterWear()?.wear.eq?.bg
  const sceneKey = step >= 6 ? myScene(myBg, p.dark) : p.dark ? 'scene-dusk' : 'scene-dawn'
  const dot = dotOf(step)
  return (
    <Animated.View style={[{ flex: 1, backgroundColor: p.dark ? '#1F2846' : '#EDC4B1' }, rootStyle]}>
      <SceneBackdrop sceneKey={sceneKey} width={width} height={height} align="center" fade={300} style={StyleSheet.absoluteFill} />
      <View style={[st.head, { paddingTop: insets.top + 10 }]}>
        {dot >= 0 ? <Dots c={c} on={dot} /> : <View />}
        {canSkip(step) ? (
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="나중에" accessibilityHint="성장 화면에 씨앗이 남고 언제든 다시 열 수 있어요">
            <Text style={[st.later, { color: c.ink }]}>나중에</Text>
          </Pressable>
        ) : null}
      </View>
      <Animated.View key={step} entering={reduced ? FadeIn.duration(200) : ENTER} exiting={FadeOut.duration(reduced ? 120 : 220)} style={[st.fill, { paddingBottom: insets.bottom + 20 }]}>
        {step === 0 && <StepStart c={c} seed={seed} size={seedSize} reduced={reduced} onNext={() => setStep(1)} />}
        {step === 1 && <StepSeed c={c} seed={seed} size={seedSize} reduced={reduced} onSeed={setSeed} onNext={() => setStep(2)} />}
        {step === 2 && <StepQuiz c={c} seed={seed} width={width} reduced={reduced} onDone={(sp, a) => { setAnswers(a); setSpecies(sp); setStep(3) }} />}
        {step === 3 && species && <StepHatch c={c} seed={seed} species={species} answers={answers} width={width} height={height} size={seedSize} reduced={reduced} onNext={() => setStep(4)} />}
        {step === 4 && species && <StepName c={c} seed={seed} species={species} reduced={reduced} onSave={saveCharacter} />}
        {step >= 5 && species && <StepFirst c={c} seed={seed} species={species} name={name || PET_NAME[species]} reduced={reduced} onNext={toGarden} />}
      </Animated.View>
    </Animated.View>
  )
}

/** 가운데(남은 높이) — 그림을 가운데에 놓는다 */
function Middle({ children, pad = 0, onLayout }: { children: ReactNode; pad?: number; onLayout?: (e: LayoutChangeEvent) => void }) {
  return <View style={[st.middle, { paddingBottom: pad }]} onLayout={onLayout}>{children}</View>
}

// ── 0 시작 ──
function StepStart({ c, seed, size, reduced, onNext }: { c: MakeColors; seed: number; size: number; reduced: boolean; onNext: () => void }) {
  return (
    <>
      <Copy c={c} style={st.copy} title={'할 일을 끝낼 때마다\n함께 자라는 친구'} sub="씨앗 하나에서 시작해요. 무엇이 나올지는 당신이 일하는 방식이 정해요." />
      <Middle><View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><FloatingSeed seed={seed} size={size} reduced={reduced} /></View></Middle>
      {/* `이미 계정이 있어요`는 로그인 전 온보딩용 — 휴대폰은 로그인 뒤에 열리므로 뺀다 */}
      <View style={st.bottom}><BigButton c={c} label="씨앗 고르기" onPress={onNext} /></View>
    </>
  )
}

// ── 1 씨앗 고르기 ──
function StepSeed({ c, seed, size, reduced, onSeed, onNext }: { c: MakeColors; seed: number; size: number; reduced: boolean; onSeed: (s: number) => void; onNext: () => void }) {
  const turn = useRef<SeedTurnHandle>(null)
  useEffect(() => { const t = setTimeout(() => turn.current?.spin(), 380); return () => clearTimeout(t) }, [])
  const info = SEED_NAMES[seed]
  return (
    <>
      <Copy c={c} style={st.copy} title={'마음이 가는\n씨앗을 골라요'} sub={reduced ? '아래 칸을 눌러 골라 보세요. 껍질 무늬는 도감에 남아요.' : '좌우로 끌어서 돌려 보세요. 껍질 무늬는 도감에 남아요.'} />
      <Middle><SeedTurn ref={turn} seed={seed} size={size} reduced={reduced} /></Middle>
      <View style={st.bottom}>
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${info.name}, ${info.line}`}>
          <Text style={[st.seedName, { color: c.ink }]}>{info.name}</Text>
          <Text style={[st.seedLine, { color: c.ink }]}>{info.line}</Text>
        </View>
        <View style={st.seedPick}>
          {SEED_NAMES.map((_, i) => {
            const on = i === seed
            const src = seedSrc(i, 0)
            return (
              <PressableScale key={i} scale={0.92} accessibilityRole="button" accessibilityLabel={seedA11yLabel(i)} accessibilityState={{ selected: on }}
                onPress={() => { if (i === seed) return; hx.tick(); turn.current?.reset(); onSeed(i); turn.current?.pop() }}>
                <Glass c={c} radius={18} style={[st.pickCell, { borderWidth: 2, borderColor: on ? c.accent : 'transparent' }]}>
                  {src ? <Animated.Image source={src} style={st.pickImg} fadeDuration={0} /> : null}
                </Glass>
              </PressableScale>
            )
          })}
        </View>
        <BigButton c={c} label="이 씨앗으로" onPress={onNext} />
      </View>
    </>
  )
}

// ── 2 성향 카드 ──
function StepQuiz({ c, seed, width, reduced, onDone }: { c: MakeColors; seed: number; width: number; reduced: boolean; onDone: (sp: Species, a: Record<string, Pick2>) => void }) {
  const [quiz, setQuiz] = useState<Quiz>(QUIZ0)
  const busy = useRef(false)
  const view = quizCard(quiz)
  const x = useSharedValue(0), y = useSharedValue(0), rot = useSharedValue(0), sc = useSharedValue(1), op = useSharedValue(1)
  // 다음 카드가 아래에서 올라온다(움직임 줄이기 = 페이드)
  useEffect(() => {
    x.value = 0; rot.value = 0
    const e = Easing.bezier(0.2, 0.8, 0.2, 1)
    if (reduced) { y.value = 0; sc.value = 1; op.value = 0; op.value = withTiming(1, { duration: 200 }); return }
    y.value = 30; sc.value = 0.94; op.value = 0
    y.value = withTiming(0, { duration: 450, easing: e }); sc.value = withTiming(1, { duration: 450, easing: e }); op.value = withTiming(1, { duration: 350 })
  }, [quiz.index, reduced, x, y, rot, sc, op])
  const card = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rot.value}deg` }, { scale: sc.value }] }))

  const pick = (k: Pick2) => {
    if (busy.current) return
    busy.current = true
    hx.tick()
    const r = answerQuiz(quiz, k)
    // 고른 쪽으로 날아간다(왼쪽 = A, 오른쪽 = B)
    const dir = k === 'A' ? -1 : 1
    if (reduced) op.value = withTiming(0, { duration: 150 })
    else {
      const e = Easing.bezier(0.2, 0.8, 0.2, 1)
      x.value = withTiming(dir * width * 1.2, { duration: 450, easing: e }); rot.value = withTiming(dir * 10, { duration: 450, easing: e }); op.value = withTiming(0, { duration: 350 })
    }
    setTimeout(() => {
      busy.current = false
      if (r.done) onDone(r.done, r.quiz.answers)
      else setQuiz(r.quiz)
    }, reduced ? 150 : 300)
  }
  const q = view.card
  return (
    <>
      <View style={[st.copy, st.quizTop]}>
        <Text style={[st.quizTitle, { color: c.ink }]} accessibilityRole="header">어떤 친구가 나올까요</Text>
        {quiz.index > 0 ? (
          <Pressable onPress={() => { if (!busy.current) setQuiz(backQuiz(quiz)) }} hitSlop={10} accessibilityRole="button" accessibilityLabel="이전 질문">
            <Text style={[st.back, { color: c.ink }]}>‹ 이전</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={st.miniSeed}><WobbleSeed seed={seed} size={120} periodMs={wobbleMs(quiz.index, view.total)} reduced={reduced} /></View>
      {q ? (
        <Animated.View style={[st.qWrap, card]}>
          <Glass c={c} blur={false} style={st.qcard}>
            <Text style={[st.qn, { color: c.accentText }]}>{view.label}</Text>
            <Text style={[st.qt, { color: c.ink }]}>{q.text}</Text>
            {(['A', 'B'] as Pick2[]).map((k) => (
              <PressableScale key={k} scale={0.97} onPress={() => pick(k)} accessibilityRole="button" accessibilityLabel={`${k}, ${k === 'A' ? q.a : q.b}`}
                style={[st.opt, { backgroundColor: c.optBg }]}>
                <View style={[st.optKey, { backgroundColor: c.accentSubtle }]}><Text style={[st.optKeyText, { color: c.accentText }]}>{k}</Text></View>
                <Text style={[st.optText, { color: c.optInk }]}>{k === 'A' ? q.a : q.b}</Text>
              </PressableScale>
            ))}
          </Glass>
        </Animated.View>
      ) : null}
    </>
  )
}

// ── 3 부화 ──
function StepHatch({ c, seed, species, answers, width, height, size, reduced, onNext }: {
  c: MakeColors; seed: number; species: Species; answers: Record<string, Pick2>; width: number; height: number; size: number; reduced: boolean; onNext: () => void
}) {
  const [h, setH] = useState<Hatch>(HATCH0)
  const [ready, setReady] = useState(false)
  const tc = useMemo(() => typeCardOf(species, answers), [species, answers])
  const babySize = size + 20
  const copy = useSharedValue(1), seedRot = useSharedValue(0), seedOp = useSharedValue(1), flash = useSharedValue(0)
  const bx = useSharedValue(0.15), by = useSharedValue(0.15), bop = useSharedValue(0)
  const halo = useSharedValue(0), haloSc = useSharedValue(0.6), r1 = useSharedValue(0), r2 = useSharedValue(0)
  const cardY = useSharedValue(40), cardOp = useSharedValue(0)

  const reveal = () => {
    const T = HATCH_T
    copy.value = withTiming(0, { duration: 300 })
    if (reduced) {
      seedOp.value = withTiming(0, { duration: T.reduced }); bx.value = 1; by.value = 1; bop.value = withTiming(1, { duration: T.reduced })
      cardY.value = 0; cardOp.value = withTiming(1, { duration: T.reduced })
      setTimeout(() => setReady(true), T.reduced)
    } else {
      // 빛 0.9초(가장 밝은 때 0.3초쯤) — 한 번뿐이라 초당 3번 아래(WCAG 2.3.1)
      flash.value = withSequence(withTiming(1, { duration: T.flash * T.flashPeak, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: T.flash * (1 - T.flashPeak), easing: Easing.out(Easing.quad) }))
      seedOp.value = once(0, 80, T.seedOut)
      // 아기 0.15 → 1.16×0.86 → 0.93×1.08 → 1
      const d = T.babyDur, e = Easing.bezier(0.2, 0.8, 0.2, 1)
      bop.value = once(1, d * 0.45, T.baby)
      bx.value = withSequence(withTiming(0.15, { duration: T.baby }), withTiming(1.16, { duration: d * 0.45, easing: e }), withTiming(0.93, { duration: d * 0.25, easing: e }), withTiming(1, { duration: d * 0.3, easing: e }))
      by.value = withSequence(withTiming(0.15, { duration: T.baby }), withTiming(0.86, { duration: d * 0.45, easing: e }), withTiming(1.08, { duration: d * 0.25, easing: e }), withTiming(1, { duration: d * 0.3, easing: e }))
      halo.value = withSequence(withTiming(0, { duration: T.baby }), withTiming(1, { duration: 560 }), withTiming(0.55, { duration: 840 }))
      haloSc.value = withSequence(withTiming(0.6, { duration: T.baby }), withTiming(1, { duration: 560 }), withTiming(1.05, { duration: 840 }))
      r1.value = once(1, T.ring, T.baby, Easing.out(Easing.quad))
      r2.value = once(1, T.ring, T.baby + T.ring2Delay, Easing.out(Easing.quad))
      cardOp.value = once(1, 400, T.baby + T.card)
      setTimeout(() => { cardY.value = withSpring(0, { damping: 11, stiffness: 140, mass: 0.8 }); hx.tap() }, T.baby + T.card)
      setTimeout(() => setReady(true), T.baby + T.card)
    }
    setTimeout(() => AccessibilityInfo.announceForAccessibility(`씨앗이 깨어났어요. 당신은 ${tc.title}. ${tc.line}`), reduced ? T.reduced : T.baby + T.card)
  }
  const tap = () => {
    if (h.hatched) return
    const next = tapSeed(h)
    hx.tap()
    if (!reduced) seedRot.value = withSequence(withTiming(-9, { duration: 84 }), withTiming(8, { duration: 126 }), withTiming(-4, { duration: 105 }), withTiming(0, { duration: 105 }))
    setH(next)
    if (next.hatched) reveal()
  }
  const wake = () => { if (h.hatched) return; hx.tap(); setH(wakeSeed()); reveal() }

  const copyA = useAnimatedStyle(() => ({ opacity: copy.value }))
  const seedA = useAnimatedStyle(() => ({ opacity: seedOp.value, transform: [{ rotate: `${seedRot.value}deg` }] }))
  const flashA = useAnimatedStyle(() => ({ opacity: flash.value }))
  const babyA = useAnimatedStyle(() => ({ opacity: bop.value, transform: [{ scaleX: bx.value }, { scaleY: by.value }] }))
  const haloA = useAnimatedStyle(() => ({ opacity: halo.value, transform: [{ scale: haloSc.value }] }))
  const ring1A = useAnimatedStyle(() => ({ opacity: r1.value > 0 ? 0.9 * (1 - r1.value) : 0, transform: [{ scale: 0.4 + 2.4 * r1.value }] }))
  const ring2A = useAnimatedStyle(() => ({ opacity: r2.value > 0 ? 0.9 * (1 - r2.value) : 0, transform: [{ scale: 0.4 + 2.4 * r2.value }] }))
  const cardA = useAnimatedStyle(() => ({ opacity: cardOp.value, transform: [{ translateY: cardY.value }] }))
  const stage = Math.max(babySize, 360)
  return (
    <>
      <Animated.View style={copyA}><Copy c={c} style={st.copy} title={'씨앗을 톡톡\n두드려 주세요'} sub={h.sub} /></Animated.View>
      <Middle pad={140}>
        <View style={{ width: stage, height: stage, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[st.abs, haloA]} pointerEvents="none"><HaloFill size={360} /></Animated.View>
          <Animated.View style={[st.ring, ring1A]} pointerEvents="none" />
          <Animated.View style={[st.ring, ring2A]} pointerEvents="none" />
          <Animated.View style={[st.abs, seedA]} pointerEvents={h.hatched ? 'none' : 'auto'}>
            <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel="씨앗 깨우기" accessibilityHint="두 번 누르면 씨앗이 깨어나요"
              accessibilityActions={[{ name: 'activate', label: '씨앗 깨우기' }]} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate') wake() }}>
              <SeedStill src={crackSrc(seed, h.cracks)} size={size} />
            </Pressable>
          </Animated.View>
          <Animated.View style={[st.abs, { transformOrigin: '50% 90%' }, babyA]} pointerEvents="none">
            <Baby species={species} seed={seed} size={babySize} reduced={reduced} breathe={false} />
          </Animated.View>
        </View>
      </Middle>
      <View style={st.bottom}>
        <Animated.View style={[st.typeWrap, cardA]} pointerEvents="none">
          <Glass c={c} blur={false} style={st.typecard}>
            <Text style={[st.typeK, { color: c.ink }]}>당신은</Text>
            <Text style={[st.typeH, { color: c.ink }]}>{tc.title}</Text>
            <Text style={[st.typeLine, { color: c.ink }]}>{tc.line}</Text>
            <AxisBar c={c} left="계획" right="즉흥" pct={tc.plan} />
            <AxisBar c={c} left="몰입" right="멀티" pct={tc.focus} />
          </Glass>
        </Animated.View>
        <View style={{ opacity: ready ? 1 : 0 }} pointerEvents={ready ? 'auto' : 'none'} accessibilityElementsHidden={!ready} importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}>
          <BigButton c={c} label="이름 지어 주기" onPress={onNext} />
        </View>
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, { top: -200, bottom: -200 }, flashA]} pointerEvents="none"><FlashFill width={width} height={height + 400} /></Animated.View>
    </>
  )
}

// ── 4 이름 ──
/** 만지기 한 줄(49 §7.1 간지럼·쓰다듬기) — 2.6초 */
function useLine(): [{ text: string; id: number } | null, (text: string) => void] {
  const [line, setLine] = useState<{ text: string; id: number } | null>(null)
  const tm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(tm.current), [])
  const say = useCallback((text: string) => {
    const id = Date.now()
    setLine({ text, id }); clearTimeout(tm.current)
    tm.current = setTimeout(() => setLine((l) => (l?.id === id ? null : l)), 2600)
  }, [])
  return [line, say]
}
function LineBubble({ c, line }: { c: MakeColors; line: { text: string; id: number } | null }) {
  if (!line) return null
  return (
    <View style={st.lineBox} pointerEvents="none">
      <Animated.View key={line.id} entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)}>
        <Glass c={c} blur={false} radius={18} style={st.speech}><Text style={[st.speechText, { color: c.ink }]} accessibilityLiveRegion="polite">{line.text}</Text></Glass>
      </Animated.View>
    </View>
  )
}

function StepName({ c, seed, species, reduced, onSave }: { c: MakeColors; seed: number; species: Species; reduced: boolean; onSave: (name: string) => void }) {
  const [name, setName] = useState(PET_NAME[species])
  const [typing, setTyping] = useState(false)
  const [box, setBox] = useState(230)
  const baby = useRef<BabyHandle>(null)
  const focused = useIsFocused()
  const [line, say] = useLine()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const onType = (v: string) => {
    setName(v)
    // 입력하는 동안 웃는 얼굴
    setTyping(true); clearTimeout(timer.current); timer.current = setTimeout(() => setTyping(false), 900)
  }
  const ok = cleanName(name)
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Copy c={c} style={st.copy} title="이름을 지어 줄까요?" sub="나중에 성장 화면에서 바꿀 수 있어요." />
      <Middle onLayout={(e) => setBox(Math.max(90, Math.min(230, Math.floor(e.nativeEvent.layout.height - 12))))}>
        <View>
          <Baby ref={baby} species={species} seed={seed} size={box} mood={typing ? 'happy' : 'default'} reduced={reduced} play active={focused} onSay={say} label={`${name || PET_NAME[species]}. 눌러서 만지기`} />
          <LineBubble c={c} line={line} />
        </View>
      </Middle>
      <View style={st.bottom}>
        <Glass c={c} radius={20} style={st.nameField}>
          <TextInput value={name} onChangeText={onType} maxLength={NAME_MAX} returnKeyType="done" accessibilityLabel="캐릭터 이름" selectionColor={c.accent}
            onSubmitEditing={() => { if (ok) onSave(ok) }} style={[st.nameInput, { color: c.ink }]} />
          <Text style={[st.nameCount, { color: c.ink }]}>{nameCount(name)}</Text>
        </Glass>
        <View style={st.chips}>
          {nameChips(species).map((n) => <Chip key={n} c={c} label={n} onPress={() => { hx.tick(); setName(n); baby.current?.hop() }} />)}
        </View>
        <BigButton c={c} label="좋아요" disabled={!ok} dim={!ok} onPress={() => onSave(ok)} />
      </View>
    </KeyboardAvoidingView>
  )
}

// ── 5 첫 할 일 ──
function StepFirst({ c, seed, species, name, reduced, onNext }: { c: MakeColors; seed: number; species: Species; name: string; reduced: boolean; onNext: () => void }) {
  const toast = useToast()
  const [task, setTask] = useState<{ id: string; title: string } | null>(null)
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState('')
  const [done, setDone] = useState(false)
  const baby = useRef<BabyHandle>(null)
  const focused = useIsFocused()
  const [line, sayLine] = useLine()
  const busy = useRef(false)
  const xp = useSharedValue(0), say = useSharedValue(0)
  const xpA = useAnimatedStyle(() => ({ opacity: xp.value <= 0 ? 0 : xp.value < 0.25 ? xp.value / 0.25 : 1 - (xp.value - 0.25) / 0.75, transform: [{ translateY: xp.value < 0.25 ? -10 * (xp.value / 0.25) : -10 - 24 * ((xp.value - 0.25) / 0.75) }] }))
  const sayA = useAnimatedStyle(() => ({ opacity: say.value, transform: [{ translateY: 8 * (1 - say.value) }] }))

  const make = async (title: string) => {
    const t = cleanTask(title)
    if (!t || busy.current) return
    busy.current = true
    try {
      // 보통 할 일 행: 오늘(종일) · 받은편지함(list_id 비우면 기본함)
      const id = await createTask({ title: t, list_id: '', due_at: dayKey() })
      hx.tap()
      setTask({ id, title: t }); setWriting(false)
    } catch (e) {
      console.warn('[make] task failed:', e)
      toast.show('할 일을 만들지 못했어요')
    } finally { busy.current = false }
  }
  const complete = async () => {
    if (!task || done || busy.current) return
    busy.current = true
    hx.tap() // 21 완료 진동 그대로(손가락과 같은 순간)
    setDone(true)
    baby.current?.hop()
    xp.value = 0
    xp.value = reduced ? 0 : withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) })
    say.value = withTiming(1, { duration: reduced ? 200 : 300 })
    AccessibilityInfo.announceForAccessibility(`완료. ${FIRST_DONE_LINE}`)
    try { await completeTasks([task.id]) } catch (e) { console.warn('[make] complete failed:', e) } finally { busy.current = false }
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Copy c={c} style={st.copy} title={firstTitle(name)} sub="끝내면 바로 자라요. 작아도 괜찮아요." />
      <Middle>
        <View style={{ alignItems: 'center' }}>
          <Animated.View style={[sayA, { marginBottom: 8 }]} accessibilityElementsHidden={!done}>
            <Glass c={c} blur={false} radius={18} style={st.speech}><Text style={[st.speechText, { color: c.ink }]}>{FIRST_DONE_LINE}</Text></Glass>
          </Animated.View>
          <View>
            <Baby ref={baby} species={species} seed={seed} size={170} mood={done ? 'happy' : 'default'} reduced={reduced} play active={focused} onSay={sayLine} label={`${name}. 눌러서 만지기`} />
            <LineBubble c={c} line={line} />
          </View>
          <Animated.Text style={[st.xp, { color: c.honey }, xpA]} accessibilityElementsHidden>+{XP.task}</Animated.Text>
        </View>
      </Middle>
      <View style={st.bottom}>
        {task ? (
          <Pressable onPress={complete} disabled={done} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${task.title}, 오늘`}>
            <Glass c={c} radius={20} style={st.task}>
              <CheckCircle c={c} done={done} />
              <Text style={[st.taskText, { color: c.ink }, done && { textDecorationLine: 'line-through', opacity: 0.55 }]} numberOfLines={2}>{task.title}</Text>
              <Text style={[st.taskWhen, { color: c.ink }]}>오늘</Text>
            </Glass>
          </Pressable>
        ) : writing ? (
          <Glass c={c} radius={20} style={st.task}>
            <CheckCircle c={c} done={false} />
            <TextInput autoFocus value={draft} onChangeText={setDraft} placeholder="첫 할 일" placeholderTextColor={c.dark ? 'rgba(255,255,255,0.45)' : 'rgba(19,33,27,0.45)'}
              returnKeyType="done" onSubmitEditing={() => void make(draft)} accessibilityLabel="첫 할 일" selectionColor={c.accent} style={[st.taskText, st.taskInput, { color: c.ink }]} />
          </Glass>
        ) : (
          <View style={st.chips}>
            {TASK_CHIPS.map((t) => <Chip key={t} c={c} label={t} onPress={() => void make(t)} />)}
            <Chip c={c} label="직접 쓰기" onPress={() => setWriting(true)} />
          </View>
        )}
        <BigButton c={c} label="정원으로 가기" disabled={!done} dim={!done} onPress={onNext} style={{ marginTop: 10 }} />
      </View>
    </KeyboardAvoidingView>
  )
}

const st = StyleSheet.create({
  head: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingBottom: 6 },
  later: { fontSize: 14, fontWeight: '600', opacity: 0.8 },
  fill: { flex: 1 },
  copy: { marginTop: 92 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  bottom: { paddingHorizontal: 20 },
  abs: { position: 'absolute' },
  seedName: { textAlign: 'center', fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  seedLine: { textAlign: 'center', fontSize: 13, fontWeight: '500', opacity: 0.66, marginTop: 3 },
  seedPick: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 14, marginBottom: 18 },
  pickCell: { width: 56, height: 56, padding: 4 },
  pickImg: { width: '100%', height: '100%' },
  quizTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26 },
  quizTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.8 },
  back: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  miniSeed: { alignItems: 'center', marginTop: 8 },
  qWrap: { marginHorizontal: 20, marginTop: 10 },
  qcard: { paddingTop: 26, paddingHorizontal: 22, paddingBottom: 20 },
  qn: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.25 },
  qt: { marginTop: 6, marginBottom: 18, fontSize: 24, lineHeight: 31, fontWeight: '800', letterSpacing: -0.7 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16, marginTop: 10 },
  optKey: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  optKeyText: { fontSize: 13, fontWeight: '800' },
  optText: { flex: 1, fontSize: 16, lineHeight: 21.5, fontWeight: '600' },
  ring: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  typeWrap: { position: 'absolute', left: 20, right: 20, bottom: 78 },
  typecard: { paddingVertical: 18, paddingHorizontal: 20 },
  typeK: { fontSize: 12.5, fontWeight: '700', opacity: 0.7 },
  typeH: { marginTop: 2, marginBottom: 6, fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.8 },
  typeLine: { fontSize: 14.5, lineHeight: 22, fontWeight: '500', opacity: 0.72 },
  nameField: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, height: 60 },
  nameInput: { flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, padding: 0 },
  nameCount: { fontSize: 13, fontWeight: '600', opacity: 0.55 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 18 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginBottom: 10 },
  taskText: { flex: 1, fontSize: 16, fontWeight: '600' },
  taskInput: { padding: 0 },
  taskWhen: { fontSize: 12, fontWeight: '600', opacity: 0.6 },
  speech: { paddingHorizontal: 14, paddingVertical: 10, maxWidth: 230 },
  lineBox: { position: 'absolute', left: -60, right: -60, top: -8, alignItems: 'center' },
  speechText: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  xp: { position: 'absolute', right: -36, top: 0, fontSize: 22, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } }
})
