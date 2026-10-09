// 43 §18.2 휴대폰 성장 탭 무대(시안 character-raising-v2 A): 장면이 화면 위 끝까지 + 큰 제목·유리 칩 + 받침 위 캐릭터 + 유리 HUD
// (큰 % · 다음 선물 칩 · 굵은 막대 · 태그). 만지기(43 §4.1): 누르기 · 길게 = 쓰다듬기 · 빠르게 4번 = 간지럼 · 끌었다 놓기 · 이름 = 부르기.
// 만지기는 아무것도 주지 않는다(XP·아이템 없음). 움직임은 감싸개의 transform·opacity만, UI 스레드(39 §11). 반복 움직임 캐릭터는 이 무대 하나.
import { anchors, itemIcon, scene, sceneGround, sceneIsDark, SCALE, standBottom, titleOf, art } from '@sprout/schema/characterArt'
import { stageOf, type Species } from '@sprout/schema/growth'
import { cmOf, decorOn, evolutionHint, giftsAt, growthTags, stageBoxSize, TOUCH, TOUCH_LINES, trophyShape, type Equip } from '@sprout/schema/wardrobe'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { hx } from '../ui/haptics'
import type { Palette } from '../theme/palette'
import { CharacterArt, SvgString } from './art/CharacterArt'
import { FloatChip, Heart, SpeciesBurst } from './Bits'
import type { Raise } from './raise'

export type StageHandle = {
  hop: (times?: number, h?: number) => void
  say: (text: string, ms?: number) => void
  feel: (mood: StageMood, ms?: number) => void
  xp: (n: number) => void
  levelUp: (level: number) => void
  burst: (n: number, dist: number) => void
  wave: (line?: string) => void
  /** 잠깐 손에 든 것(마감 날 깃발) */
  holdFor: (hand: string, ms: number) => void
}
type StageMood = 'default' | 'smile' | 'happy' | 'pet' | 'giggle' | 'wow' | 'sleepy' | 'eat'

export const stageHeight = (topInset: number) => Math.max(470, topInset + 450)

export const RaiseStage = forwardRef<StageHandle, {
  p: Palette; raise: Raise; name: string; topInset: number; reduced: boolean; live: boolean
  night: boolean; calm: boolean; todayDone: number; todayTotal: number; lines: () => string; onEgg?: () => void
}>(function RaiseStage({ p, raise, name, topInset, reduced, live, night, calm, todayDone, todayTotal, lines, onEgg }, ref) {
  const { species, progress, look, worn, state } = raise
  const lv = progress.level
  const st = progress.stage
  const H = stageHeight(topInset)
  const sceneH = H - 108
  const [w, setW] = useState(0)
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)
  // 무대 상자 × 0.8(43 §18.2). 좁은 휴대폰에서 전설이 제목·칩을 덮지 않게 머리 위를 제목 아래로 막는다
  const feetY = w ? sceneH - 120 * Math.max(w / 600, sceneH / 420) : sceneH - 112
  // 상자 위쪽은 단계 배율 때문에 비어 있다 — 그려진 머리(새싹) 꼭대기만 본다
  const headFrac = species ? (108 - (108 - (anchors(st, species, look.path).top - 14)) * SCALE[st]) / 120 : 0.2
  const box = Math.round(Math.min(stageBoxSize(lv) * 0.8, (feetY - topInset - 44) / (11 / 12 - headFrac)))
  const bottom = w ? H - sceneH + standBottom(w, sceneH, box) : 140
  // 말풍선은 머리(새싹) 바로 위: 그림 안 단계 배율 때문에 상자 위가 비어 있다
  const headTop = box * headFrac

  // ── 얼굴 · 말 · 하트 · 칩 ──
  const [mood, setMood] = useState<{ m: StageMood; id: number } | null>(null)
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null)
  const [hearts, setHearts] = useState<{ id: number; dx: number }[]>([])
  const [chips, setChips] = useState<{ id: number; text: string; kind: 'xp' | 'lv' | 'z'; dx: number }[]>([])
  const [bursts, setBursts] = useState<{ id: number; n: number; dist: number }[]>([])
  const [waving, setWaving] = useState(false)
  const [hold, setHold] = useState<string | null>(null)
  const [woke, setWoke] = useState(false)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = useCallback((fn: () => void, ms: number) => { const t = setTimeout(() => { timers.current.delete(t); fn() }, ms); timers.current.add(t) }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const feel = useCallback((m: StageMood, ms?: number) => { const id = Math.random(); setMood({ m, id }); if (ms) later(() => setMood((x) => (x?.id === id ? null : x)), ms) }, [later])
  const say = useCallback((text: string, ms: number = TOUCH.sayMs) => { const id = Math.random(); setBubble({ text, id }); later(() => setBubble((b) => (b?.id === id ? null : b)), ms) }, [later])
  const heart = useCallback((dx = 0) => { if (reduced) return; const id = Math.random(); setHearts((h) => [...h.slice(-6), { id, dx }]); later(() => setHearts((h) => h.filter((x) => x.id !== id)), 1100) }, [reduced, later])
  const chip = useCallback((text: string, kind: 'xp' | 'lv' | 'z', dx = 0) => { const id = Math.random(); setChips((c) => [...c, { id, text, kind, dx }]); later(() => setChips((c) => c.filter((x) => x.id !== id)), kind === 'xp' ? 900 : 1600) }, [later])
  const burst = useCallback((n: number, dist: number) => { if (reduced) return; const id = Math.random(); setBursts((b) => [...b, { id, n, dist }]); later(() => setBursts((b) => b.filter((x) => x.id !== id)), 1200) }, [reduced, later])

  // ── 감싸개 움직임(UI 스레드) ──
  const tx = useSharedValue(0), ty = useSharedValue(0), rot = useSharedValue(0), hopY = useSharedValue(0)
  const sx = useSharedValue(1), sy = useSharedValue(1), breath = useSharedValue(0)
  const sleepy = !!species && night && !woke
  useEffect(() => {
    if (reduced || !live) { cancelAnimation(breath); breath.value = 0; return }
    breath.value = 0
    breath.value = withRepeat(withTiming(1, { duration: sleepy || calm ? 2500 : st === 1 ? 1200 : 1600, easing: Easing.inOut(Easing.sin) }), -1, true)
    return () => cancelAnimation(breath)
  }, [reduced, live, sleepy, calm, st, breath])
  // 4·5단계: 7초·6초마다 제자리 깡충(42 §4.1, 바쁜 날 끔)
  useEffect(() => {
    if (reduced || !live || st < 4 || calm || sleepy) return
    const t = setInterval(() => { hopY.value = withSequence(withTiming(-7, { duration: 160 }), withTiming(0, { duration: 260, easing: Easing.bounce })) }, st === 4 ? 7000 : 6000)
    return () => clearInterval(t)
  }, [reduced, live, st, calm, sleepy, hopY])
  const wrap = useAnimatedStyle(() => ({
    transformOrigin: 'bottom',
    transform: [
      { translateX: tx.value }, { translateY: ty.value + hopY.value },
      { rotate: `${rot.value}deg` },
      { scaleX: sx.value * (1 + breath.value * 0.018) }, { scaleY: sy.value * (1 - breath.value * 0.028) }
    ]
  }))
  const hop = useCallback((times = 1, h = 14) => {
    if (reduced) return
    const one = [withTiming(3, { duration: 70 }), withTiming(-h, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) })]
    hopY.value = withSequence(...(times > 1 ? [...one, ...one] : one))
    const sq = [withTiming(1.06, { duration: 70 }), withTiming(0.96, { duration: 150 }), withTiming(1.05, { duration: 120 }), withTiming(1, { duration: 100 })]
    sx.value = withSequence(...sq)
    sy.value = withSequence(withTiming(0.93, { duration: 70 }), withTiming(1.05, { duration: 150 }), withTiming(0.95, { duration: 120 }), withTiming(1, { duration: 100 }))
  }, [reduced, hopY, sx, sy])

  const wave = useCallback((line: string = TOUCH_LINES.call) => {
    setWaving(true); feel('smile')
    if (!reduced) rot.value = withSequence(withTiming(-5, { duration: 300 }), withDelay(800, withTiming(0, { duration: 300 })))
    say(line)
    later(() => { setWaving(false); setMood(null) }, TOUCH.callMs)
  }, [reduced, rot, say, feel, later])

  useImperativeHandle(ref, () => ({
    hop, say, feel, burst, wave,
    xp: (n) => { chip(`+${n} XP`, 'xp'); feel('happy', 2200); hop() },
    levelUp: (level) => {
      if (!reduced) {
        sx.value = withSequence(withTiming(0.94, { duration: 120 }), withTiming(1.12, { duration: 190 }), withTiming(0.98, { duration: 190 }), withTiming(1, { duration: 120 }))
        sy.value = withSequence(withTiming(1.05, { duration: 120 }), withTiming(1.12, { duration: 190 }), withTiming(1.02, { duration: 190 }), withTiming(1, { duration: 120 }))
        hopY.value = withSequence(withTiming(0, { duration: 120 }), withTiming(-12, { duration: 190 }), withTiming(0, { duration: 310 }))
      }
      burst(10, 90); chip(`Lv ${level}`, 'lv')
    },
    holdFor: (hand, ms) => { setHold(hand); later(() => setHold(null), ms) }
  }), [hop, say, feel, burst, wave, chip, reduced, sx, sy, hopY, later])

  // ── 만지기 ──
  const taps = useRef<number[]>([])
  const tickleUntil = useRef(0)
  const lineN = useRef(0)
  const pet = useRef<{ on: boolean; t?: ReturnType<typeof setInterval> }>({ on: false })
  const onTap = useCallback(() => {
    hx.tick()
    if (!species) { onEgg?.(); return }
    if (sleepy) { setWoke(true); feel('default', TOUCH.wakeMs); hop(1, 8); say(TOUCH_LINES.wake); later(() => setWoke(false), TOUCH.wakeMs); return }
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < TOUCH.tickleWindowMs), now]
    if (taps.current.length >= TOUCH.tickleTaps && now > tickleUntil.current) {
      tickleUntil.current = now + TOUCH.tickleCooldownMs; taps.current = []
      feel('giggle', 1800)
      if (!reduced) rot.value = withSequence(...[-7, 7, -6, 6, -4, 4, 0].map((r) => withTiming(r, { duration: 100 })))
      say(TOUCH_LINES.tickle); return
    }
    hop(); heart(); feel('happy', 1500)
    lineN.current++
    say(lines())
  }, [species, sleepy, feel, hop, say, heart, reduced, rot, lines, later, onEgg])
  const petStart = useCallback(() => {
    if (!species) return
    hx.tap(); pet.current.on = true; feel('pet')
    let n = 0
    pet.current.t = setInterval(() => { if (n++ < 6) heart((n % 2 ? -1 : 1) * (8 + n * 4)) }, 300)
  }, [species, feel, heart])
  const petEnd = useCallback(() => {
    if (!pet.current.on) return
    pet.current.on = false; clearInterval(pet.current.t)
    say(TOUCH_LINES.pet); feel('happy', 1500)
  }, [say, feel])
  const dragStart = useCallback(() => { feel('wow') }, [feel])
  const drop = useCallback((far: boolean) => { feel('happy', 1600); later(() => say(far ? TOUCH_LINES.dropFar : TOUCH_LINES.drop), reduced ? 0 : 500) }, [feel, say, later, reduced])

  const gesture = useMemo(() => {
    const R = TOUCH.dragRadius, DOWN = TOUCH.dragDown
    const pan = Gesture.Pan().minDistance(TOUCH.dragStartPx).enabled(!!species)
      .onStart(() => { runOnJS(dragStart)() })
      .onUpdate((e) => {
        const r = Math.hypot(e.translationX, e.translationY), k = r > R ? R / r : 1
        tx.value = e.translationX * k
        ty.value = Math.min(e.translationY * k, DOWN)
        rot.value = tx.value / 9
      })
      .onEnd(() => {
        const x = tx.value, y = ty.value, far = Math.hypot(x, y) > TOUCH.dropFarPx
        if (reduced) {
          tx.value = withTiming(0, { duration: 160 }); ty.value = withTiming(0, { duration: 160 }); rot.value = withTiming(0, { duration: 160 })
        } else {
          tx.value = withSequence(withTiming(x * 0.35, { duration: 230 }), withTiming(0, { duration: 180 }))
          ty.value = withSequence(withTiming(Math.min(y, 0) - (far ? 34 : 16), { duration: 230, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }), withTiming(-9, { duration: 120 }), withTiming(0, { duration: 150 }))
          rot.value = withSequence(withTiming(-x / 14, { duration: 230 }), withTiming(0, { duration: 180 }))
          sx.value = withSequence(withDelay(410, withTiming(1.08, { duration: 60 })), withTiming(0.97, { duration: 120 }), withTiming(1.02, { duration: 90 }), withTiming(1, { duration: 70 }))
          sy.value = withSequence(withDelay(410, withTiming(0.89, { duration: 60 })), withTiming(1.04, { duration: 120 }), withTiming(0.98, { duration: 90 }), withTiming(1, { duration: 70 }))
        }
        runOnJS(drop)(far)
      })
    const long = Gesture.LongPress().minDuration(TOUCH.petMs).maxDistance(TOUCH.dragStartPx)
      .onStart(() => { runOnJS(petStart)() })
      .onFinalize(() => { runOnJS(petEnd)() })
    const tap = Gesture.Tap().maxDuration(450).onEnd((_e, ok) => { if (ok) runOnJS(onTap)() })
    return Gesture.Race(pan, long, tap)
  }, [species, reduced, tx, ty, rot, sx, sy, dragStart, drop, petStart, petEnd, onTap])

  // 늦은 밤 Z 3개(움직임 줄이기면 없음)
  useEffect(() => {
    if (!sleepy || reduced || !live) return
    let i = 0
    const t = setInterval(() => { chip('Z', 'z', 10 + (i % 3) * 6); i++ }, 1700)
    return () => clearInterval(t)
  }, [sleepy, reduced, live, chip])

  // ── 장면 ──
  const decor = useMemo(() => decorOn(lv, look), [lv, look])
  const shelf = useMemo(() => raise.trophies.map((t) => trophyShape(t)), [raise.trophies])
  const sceneSvg = useMemo(() => scene({ bg: worn.bg, night, decor, trophies: shelf, rn: true }), [worn.bg, night, decor, shelf])
  const darkScene = sceneIsDark(worn.bg, night)
  const faceMood = mood?.m ?? (sleepy ? 'sleepy' : 'smile')
  const eq: Partial<Equip> = hold ? { ...worn, hand: hold } : worn

  // ── HUD ──
  const pct = Math.floor(Math.min(100, (progress.into / progress.toNext) * 100))
  const nx = giftsAt(lv + 1)[0]
  const giftIco = useMemo(() => nx ? itemIcon(nx.id, { rn: true }) : species ? art(species, stageOf(lv + 1), { lv: lv + 1, path: look.path, crop: 'bust', detail: 'small', rn: true }) : null, [nx, species, lv, look.path])
  const tags = species ? growthTags(lv + 1, species) : []
  const ink = p.dark ? '#fff' : '#16201A'
  const glass = p.dark ? 'rgba(18,24,20,0.72)' : 'rgba(255,255,255,0.80)'
  const title = species ? titleOf(species, st, look.path) : '아직 모르는 씨앗'

  return (
    <View style={[s.stage, { height: H, backgroundColor: sceneGround(worn.bg, night) }]} onLayout={onLayout}>
      {w > 0 ? <View style={[s.scene, { height: sceneH }]} pointerEvents="none"><SvgString svg={sceneSvg} width={w} height={sceneH} preserveAspectRatio="xMidYMax slice" /></View> : null}
      {p.dark ? <View style={[s.scene, { height: sceneH, backgroundColor: 'rgba(0,0,0,0.14)' }]} pointerEvents="none" /> : null}

      <View style={[s.hdr, { top: topInset + 8 }]} pointerEvents="box-none">
        <Text style={[s.h1, { color: darkScene || p.dark ? '#fff' : '#10301C' }]} accessibilityRole="header">성장</Text>
        <View style={s.chips}>
          <View style={[s.chip, { backgroundColor: glass }]}><Text style={[s.chipT, { color: ink }]}>한 날 {state.days}일</Text></View>
          <View style={[s.chip, { backgroundColor: glass }]}><Text style={[s.chipT, { color: ink }]}>오늘 {todayDone}/{todayTotal}</Text></View>
        </View>
      </View>

      <View style={[s.charPos, { bottom }]} pointerEvents="box-none">
        {bubble ? (
          <Animated.View key={bubble.id} entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={[s.say, { bottom: box - headTop + 4 }]} pointerEvents="none">
            <Text style={s.sayT} numberOfLines={2} accessibilityLiveRegion="polite">{bubble.text}</Text>
            <View style={s.sayTail} />
          </Animated.View>
        ) : null}
        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ width: box, height: box }, wrap]} accessible accessibilityRole="button"
            accessibilityLabel={species ? `${name}, Lv ${lv} ${title}. 눌러서 말 걸기` : '아직 모르는 씨앗. 눌러서 성향 조사'}
            accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => onTap()}>
            <CharacterArt species={species} stage={st} size={box} fit={false} mood={faceMood} wave={waving} calm={calm} wear={{ lv, path: look.path, eq }} />
          </Animated.View>
        </GestureDetector>
        <View style={[s.fx, { top: headTop + 10 }]} pointerEvents="none">
          {hearts.map((h) => <Heart key={h.id} dx={h.dx} />)}
          {chips.map((c) => <FloatChip key={c.id} text={c.text} kind={c.kind} dx={c.dx} reduced={reduced} />)}
        </View>
        {species ? <View style={[s.fx, { top: box * 0.5 }]} pointerEvents="none">{bursts.map((b) => <SpeciesBurst key={b.id} species={species as Species} count={b.n} dist={b.dist} />)}</View> : null}
      </View>

      <View style={[s.hud, { backgroundColor: glass, borderColor: p.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)' }]}>
        <View style={s.who}>
          <Pressable onPress={() => species && wave()} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${name} 부르기`}><Text style={[s.nm, { color: ink }]}>{name}</Text></Pressable>
          <View style={[s.lvb, { backgroundColor: p.accent }]}><Text style={s.lvbT}>Lv {lv}</Text></View>
          <Text style={[s.ttl, { color: ink }]} numberOfLines={1}>{title} · 키 {cmOf(lv)}cm</Text>
        </View>
        <View style={s.mid}>
          <View style={{ flex: 1 }}>
            <Text style={[s.num, { color: ink }]} accessibilityLabel={`다음 레벨까지 ${pct}퍼센트`}>{pct}<Text style={s.numPct}>%</Text></Text>
            <Text style={[s.lbl, { color: p.accentInk }]} numberOfLines={1}>Lv {lv + 1}까지 · {evolutionHint(lv)}</Text>
          </View>
          <View style={s.gift}>
            <View style={[s.tip, { backgroundColor: p.accent }]}><Text style={s.tipT} numberOfLines={1}>{nx ? `Lv ${lv + 1}에 ${nx.name}` : `Lv ${lv + 1} 모습`}</Text></View>
            {giftIco ? <View style={[s.ico, { backgroundColor: p.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)' }]}><SvgString svg={giftIco} size={30} /></View> : null}
          </View>
        </View>
        <View style={[s.bar, { backgroundColor: p.dark ? 'rgba(255,255,255,0.12)' : 'rgba(16,48,28,0.10)' }]} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.toNext, now: progress.into }}>
          <View style={[s.fill, { width: `${pct}%`, backgroundColor: p.accent }]} />
        </View>
        <View style={s.tags}>{tags.map((t) => <View key={t} style={[s.tag, { backgroundColor: p.dark ? 'rgba(34,164,93,0.22)' : 'rgba(34,164,93,0.12)' }]}><Text style={[s.tagT, { color: p.accentInk }]}>{t}</Text></View>)}</View>
      </View>
    </View>
  )
})

const s = StyleSheet.create({
  stage: { overflow: 'hidden' },
  scene: { position: 'absolute', left: 0, right: 0, top: 0 },
  hdr: { position: 'absolute', left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 4, marginRight: 50 },
  chip: { borderRadius: 999, paddingHorizontal: 10, height: 28, justifyContent: 'center' },
  chipT: { fontSize: 12.5, fontWeight: '700' },
  charPos: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fx: { position: 'absolute', left: '50%', width: 0, height: 0, alignItems: 'center' },
  say: { position: 'absolute', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9, maxWidth: 260, shadowColor: '#0F2316', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, zIndex: 6 },
  sayT: { color: '#16201A', fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  sayTail: { position: 'absolute', bottom: -5, left: '50%', marginLeft: -5, width: 10, height: 10, backgroundColor: '#fff', transform: [{ rotate: '45deg' }], borderRadius: 2 },
  hud: { position: 'absolute', left: 12, right: 12, bottom: 26, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#0A2814', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  nm: { fontSize: 15, fontWeight: '700' },
  lvb: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  lvbT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  ttl: { flex: 1, fontSize: 12.5, opacity: 0.72 },
  mid: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  num: { fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2 },
  numPct: { fontSize: 17, letterSpacing: 0 },
  lbl: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  gift: { alignItems: 'flex-end', gap: 6 },
  tip: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 170 },
  tipT: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  ico: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  tagT: { fontSize: 11, fontWeight: '600' }
})
