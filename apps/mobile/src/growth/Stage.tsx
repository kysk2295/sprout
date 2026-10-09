// 49 §6 휴대폰 성장 홈(시안 character-v3 B): 3D 정원 장면이 상태 막대 뒤까지 화면 끝까지 + 위 `꿈틀`·유리 알약 `한 날 N일`·⋯ +
// 유리 주 달력 띠(오늘 = 강조색 원, 한 날 = 옅은 원) + 받침(perch) 위 캐릭터(숨쉬기) + 아래 유리 카드(Lv 배지 · 큰 % · 꼬리 칩 · 14px 막대 · 옷장·도감·이번 주).
// 만지기(43 §4.1 그대로): 누르기 = 웃음 + 깡충 + 유리 말풍선 한 줄 · 길게 = 쓰다듬기 · 빠르게 4번 = 간지럼 · 끌었다 놓기 · 이름 = 부르기.
// 만지기는 아무것도 주지 않는다(XP·아이템 없음). 움직임은 감싸개의 transform·opacity만, UI 스레드(39 §11). 반복 움직임 캐릭터는 이 무대 하나.
// 트로피 선반은 장면에서 뺐다(49 §6) — 트로피는 도감 화면 목록에 있다.
import { FOOT, headTop3d, sceneDark, sceneLayout, standOnPerch, titleOf } from '@sprout/schema/characterArt'
import { XP, type Species } from '@sprout/schema/growth'
import { decorOn, ITEMS, TOUCH, TOUCH_LINES, type Equip } from '@sprout/schema/wardrobe'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { hx } from '../ui/haptics'
import type { Palette } from '../theme/palette'
import { CharacterArt } from './art/CharacterArt'
import { SceneBackdrop } from './art/Scene3D'
import { FloatChip, Heart, SpeciesBurst } from './Bits'
import { DEX_TOTAL } from './home/dex'
import { AccThumb, fitScene, Glass, glassTone } from './home/glass'
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
/** 주 달력 띠 한 칸 */
export type WeekCell = { day: string; label: string; num: number; did: boolean; today: boolean }

/** 옷장 칸 썸네일: 입은 옷 → 받은 옷 → 첫 옷 */
const wardIconOf = (worn: Partial<Equip>, owned: Set<string>) =>
  worn.hat ?? worn.neck ?? worn.hand ?? worn.back ?? ITEMS.find((i) => i.slot !== 'bg' && owned.has(i.id))?.id ?? 'acorn-cap'

export const RaiseStage = forwardRef<StageHandle, {
  p: Palette; raise: Raise; name: string; width: number; height: number; topInset: number
  /** 화면 바닥 ~ 탭 막대 윗변(유리 카드는 그 위 12) */
  bottomClear: number
  sceneKey: string; reduced: boolean; live: boolean
  night: boolean; calm: boolean; lines: () => string; onEgg?: () => void
  week: WeekCell[]; dexN: number; freshDot?: boolean
  onWard?: () => void; onDex?: () => void; onWeek?: () => void
  /** 머리 오른쪽(⋯ 메뉴) */
  menu?: ReactNode
}>(function RaiseStage({ p, raise, name, width, height, topInset, bottomClear, sceneKey, reduced, live, night, calm, lines, onEgg, week, dexN, freshDot, onWard, onDex, onWeek, menu }, ref) {
  const { species, progress, look, worn, state, owned } = raise
  const lv = progress.level
  const st = progress.stage
  const seed = look.seed ?? 0
  const t = glassTone(p.dark)

  // ── 자리: 유리 카드 위에 받침이 오게 장면을 깐다 ──
  const hudBottom = bottomClear + 12
  const [hudH, setHudH] = useState(236)
  const T = Math.round(height - hudBottom - hudH - 6)
  const fit = useMemo(() => fitScene(sceneKey, width, height, T), [sceneKey, width, height, T])
  const L = useMemo(() => sceneLayout(sceneKey, width, fit.height, 'bottom'), [sceneKey, width, fit.height])
  const perchX = L.perchX, perchY = fit.top + L.perchY
  const weekBottom = topInset + 50 + 66
  const headFrac = species ? headTop3d(species, st, look.path, seed).y - (worn.hat ? 0.07 : 0) : 0.22
  const box = Math.round(Math.max(120, Math.min(250, (perchY - weekBottom - 10) / (FOOT.y - headFrac))))
  const size = species ? box : Math.round(Math.min(box, 190))
  const pos = standOnPerch(perchX, perchY, size)
  const headY = pos.top + size * headFrac

  // ── 얼굴 · 말 · 하트 · 칩 ──
  const [mood, setMood] = useState<{ m: StageMood; id: number } | null>(null)
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null)
  const [hearts, setHearts] = useState<{ id: number; dx: number }[]>([])
  const [chips, setChips] = useState<{ id: number; text: string; kind: 'xp' | 'lv' | 'z'; dx: number }[]>([])
  const [bursts, setBursts] = useState<{ id: number; n: number; dist: number }[]>([])
  const [hold, setHold] = useState<string | null>(null)
  const [woke, setWoke] = useState(false)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = useCallback((fn: () => void, ms: number) => { const tm = setTimeout(() => { timers.current.delete(tm); fn() }, ms); timers.current.add(tm) }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const feel = useCallback((m: StageMood, ms?: number) => { const id = Math.random(); setMood({ m, id }); if (ms) later(() => setMood((x) => (x?.id === id ? null : x)), ms) }, [later])
  const say = useCallback((text: string, ms: number = TOUCH.sayMs) => { const id = Math.random(); setBubble({ text, id }); later(() => setBubble((b) => (b?.id === id ? null : b)), ms) }, [later])
  const heart = useCallback((dx = 0) => { if (reduced) return; const id = Math.random(); setHearts((h) => [...h.slice(-6), { id, dx }]); later(() => setHearts((h) => h.filter((x) => x.id !== id)), 1100) }, [reduced, later])
  const chip = useCallback((text: string, kind: 'xp' | 'lv' | 'z', dx = 0) => { const id = Math.random(); setChips((c) => [...c, { id, text, kind, dx }]); later(() => setChips((c) => c.filter((x) => x.id !== id)), kind === 'xp' ? 1000 : 1600) }, [later])
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
    const tm = setInterval(() => { hopY.value = withSequence(withTiming(-7, { duration: 160 }), withTiming(0, { duration: 260, easing: Easing.bounce })) }, st === 4 ? 7000 : 6000)
    return () => clearInterval(tm)
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
    feel('smile')
    if (!reduced) rot.value = withSequence(withTiming(-5, { duration: 300 }), withDelay(800, withTiming(0, { duration: 300 })))
    say(line)
    later(() => setMood(null), TOUCH.callMs)
  }, [reduced, rot, say, feel, later])

  useImperativeHandle(ref, () => ({
    hop, say, feel, burst, wave,
    xp: (n) => { chip(`+${n}`, 'xp'); feel('happy', 2200); hop() },
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
  const pet = useRef<{ on: boolean; t?: ReturnType<typeof setInterval> }>({ on: false })
  const onTap = useCallback(() => {
    hx.tick()
    if (!species) { if (!reduced) { hopY.value = withSequence(withTiming(-8, { duration: 140 }), withTiming(0, { duration: 220 })) } onEgg?.(); return }
    if (sleepy) { setWoke(true); feel('default', TOUCH.wakeMs); hop(1, 8); say(TOUCH_LINES.wake); later(() => setWoke(false), TOUCH.wakeMs); return }
    const now = Date.now()
    taps.current = [...taps.current.filter((x) => now - x < TOUCH.tickleWindowMs), now]
    if (taps.current.length >= TOUCH.tickleTaps && now > tickleUntil.current) {
      tickleUntil.current = now + TOUCH.tickleCooldownMs; taps.current = []
      feel('giggle', 1800)
      if (!reduced) rot.value = withSequence(...[-7, 7, -6, 6, -4, 4, 0].map((r) => withTiming(r, { duration: 100 })))
      say(TOUCH_LINES.tickle); return
    }
    hop(); heart(); feel('happy', 1500)
    say(lines())
  }, [species, sleepy, feel, hop, say, heart, reduced, rot, hopY, lines, later, onEgg])
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
    const tm = setInterval(() => { chip('Z', 'z', 10 + (i % 3) * 6); i++ }, 1700)
    return () => clearInterval(tm)
  }, [sleepy, reduced, live, chip])

  const decor = useMemo(() => (species ? decorOn(lv, look) : []), [species, lv, look])
  const faceMood = mood?.m ?? (sleepy ? 'sleepy' : 'default')
  const eq: Partial<Equip> = hold ? { ...worn, hand: hold } : worn

  // ── 카드 ──
  const pct = Math.floor(Math.min(100, (progress.into / Math.max(1, progress.toNext)) * 100))
  const left = Math.max(1, Math.ceil((progress.toNext - progress.into) / XP.task))
  const title = species ? titleOf(species, st, look.path) : '아직 모르는 씨앗'
  const tailBg = p.dark ? '#EEF3F0' : '#13211B', tailInk = p.dark ? '#13211B' : '#FFFFFF'
  const wardIcon = wardIconOf(worn, owned)
  const doneDays = week.filter((c) => c.did).length

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <SceneBackdrop sceneKey={sceneKey} width={width} height={fit.height} decor={decor} style={{ position: 'absolute', left: 0, top: fit.top }} />

      {/* 위: 꿈틀 · 한 날 · ⋯ */}
      <View style={[s.head, { top: topInset + 6 }]} pointerEvents="box-none">
        <Text style={[s.logo, { color: sceneDark(sceneKey) || p.dark ? '#FFFFFF' : '#13211B' }]} accessibilityRole="header" accessibilityLabel="성장">꿈틀</Text>
        <View style={{ flex: 1 }} />
        <Glass dark={p.dark} radius={16} style={s.pill}>
          <Text style={[s.pillT, { color: t.ink }]}>한 날 <Text style={s.pillB}>{state.days}</Text>일</Text>
        </Glass>
        {menu}
      </View>

      {/* 주 달력 띠(43 누적: 한 날 = 옅은 원) */}
      <Glass dark={p.dark} radius={22} style={[s.week, { top: topInset + 50 }]}>
        <View style={s.weekRow} accessible accessibilityLabel={`이번 주 한 날 ${doneDays}일`}>
          {week.map((c) => (
            <View key={c.day} style={s.wcol}>
              <Text style={[s.wd, { color: t.ink }]}>{c.label}</Text>
              <View style={[s.wn, c.today ? { backgroundColor: p.accent } : c.did ? { backgroundColor: t.did } : null]}>
                <Text style={[s.wnT, { color: c.today ? '#fff' : t.ink }]}>{c.num}</Text>
              </View>
            </View>
          ))}
        </View>
      </Glass>

      {/* 받침 위 캐릭터 */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ position: 'absolute', left: pos.left, top: pos.top, width: size, height: size }, wrap]} accessible accessibilityRole="button"
          accessibilityLabel={species ? `${name}, Lv ${lv} ${title}. 눌러서 말 걸기` : '아직 모르는 씨앗. 눌러서 깨우기'}
          accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => onTap()}>
          {species
            ? <CharacterArt species={species} stage={st} size={size} mood={faceMood} wear={{ lv, path: look.path, eq, seed }} />
            : <CharacterArt species={null} size={size} seed={seed} />}
        </Animated.View>
      </GestureDetector>
      {bubble ? (
        <View style={[s.sayBox, { left: perchX - 150, top: headY }]} pointerEvents="none">
          <Animated.View key={bubble.id} entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={[s.say, { backgroundColor: t.bubble, borderColor: t.line }]}>
            <Text style={[s.sayT, { color: t.ink }]} numberOfLines={2} accessibilityLiveRegion="polite">{bubble.text}</Text>
            <View style={[s.sayTail, { backgroundColor: t.bubble }]} />
          </Animated.View>
        </View>
      ) : null}
      <View style={[s.fx, { left: perchX, top: headY + 6 }]} pointerEvents="none">
        {hearts.map((h) => <Heart key={h.id} dx={h.dx} />)}
        {chips.map((c) => <FloatChip key={c.id} text={c.text} kind={c.kind} dx={c.kind === 'xp' ? 34 : c.dx} reduced={reduced} />)}
      </View>
      {species ? <View style={[s.fx, { left: perchX, top: pos.top + size * 0.55 }]} pointerEvents="none">{bursts.map((b) => <SpeciesBurst key={b.id} species={species as Species} count={b.n} dist={b.dist} />)}</View> : null}

      {/* 아래 유리 카드 */}
      <View style={[s.hud, { bottom: hudBottom }]} onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (Math.abs(h - hudH) > 1) setHudH(h) }}>
        <Glass dark={p.dark} radius={26} style={s.hudIn}>
          <View style={s.lvRow}>
            <View style={[s.lvb, { backgroundColor: p.accent }]}><Text style={s.lvbT}>Lv {lv}</Text></View>
            <Pressable onPress={() => species && wave()} hitSlop={8} disabled={!species} accessibilityRole="button" accessibilityLabel={species ? `${name} 부르기` : title} style={{ flexShrink: 1 }}>
              <Text style={[s.who, { color: t.ink }]} numberOfLines={1}>{species ? `${name} · ${title}` : title}</Text>
            </Pressable>
          </View>
          <View style={s.row2}>
            <Text style={[s.big, { color: t.ink }]} accessibilityLabel={`다음 레벨까지 ${pct}퍼센트`}>{pct}<Text style={s.bigPct}>%</Text></Text>
            <View style={[s.tail, { backgroundColor: tailBg }]}>
              <Text style={[s.tailT, { color: tailInk }]} numberOfLines={1}>할 일 {left}개 더 하면 Lv {lv + 1}</Text>
              <View style={[s.tailTip, { backgroundColor: tailBg }]} />
            </View>
          </View>
          <Text style={[s.lbl, { color: t.ink }]}>다음 레벨까지</Text>
          <XpBar pct={pct} live={live} reduced={reduced} track={t.track} from={p.accentHi} to={p.accent} into={progress.into} toNext={progress.toNext} />
          {species ? (
            <View style={s.quick}>
              <Quick label="옷장" bg={t.soft} ink={t.ink} dot={freshDot ? p.accent : undefined} onPress={onWard}><AccThumb id={wardIcon} size={34} /></Quick>
              <Quick label={`도감 ${dexN}/${DEX_TOTAL}`} bg={t.soft} ink={t.ink} onPress={onDex}><CharacterArt species={species} stage={st} size={34} crop="bust" /></Quick>
              <Quick label="이번 주" bg={t.soft} ink={t.ink} onPress={onWeek}><CharacterArt species={null} size={34} seed={seed} /></Quick>
            </View>
          ) : (
            <Pressable onPress={onEgg} style={({ pressed }) => [s.eggBtn, { backgroundColor: p.accent }, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button">
              <Text style={s.eggBtnT}>씨앗 깨우기</Text>
            </Pressable>
          )}
        </Glass>
      </View>
    </View>
  )
})

/** 14px 막대(강조색 그라데이션, 둥근 끝). 돌아오면(live) 0.8초 동안 찬다 — transform만(39 §11) */
const XpBar = memo(function XpBar({ pct, live, reduced, track, from, to, into, toNext }: { pct: number; live: boolean; reduced: boolean; track: string; from: string; to: string; into: number; toNext: number }) {
  const [w, setW] = useState(0)
  const v = useSharedValue(pct)
  const shown = useRef(false)
  useEffect(() => {
    if (!live) return
    if (!shown.current || reduced) { shown.current = true; cancelAnimation(v); v.value = pct; return }
    v.value = withDelay(250, withTiming(pct, { duration: 800, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }))
  }, [pct, live, reduced, v])
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -w * (1 - Math.max(0, Math.min(100, v.value)) / 100) }] }))
  return (
    <View style={[s.bar, { backgroundColor: track }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: toNext, now: into }}>
      {w ? (
        <Animated.View style={[s.fill, { width: w }, st]}>
          <Svg width={w} height={14}>
            <Defs><LinearGradient id="xpFill" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={from} /><Stop offset="1" stopColor={to} /></LinearGradient></Defs>
            <Rect x={0} y={0} width={w} height={14} rx={7} fill="url(#xpFill)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
})

function Quick({ label, bg, ink, dot, onPress, children }: { label: string; bg: string; ink: string; dot?: string; onPress?: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={() => { hx.tick(); onPress?.() }} style={({ pressed }) => [s.qb, { backgroundColor: bg }, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityRole="button" accessibilityLabel={label}>
      {children}
      <Text style={[s.qbT, { color: ink }]} numberOfLines={1}>{label}</Text>
      {dot ? <View style={[s.qbDot, { backgroundColor: dot }]} /> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  head: { position: 'absolute', left: 18, right: 18, height: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { fontSize: 21, fontWeight: '800', letterSpacing: -0.85 },
  pill: { height: 32, paddingHorizontal: 12, justifyContent: 'center' },
  pillT: { fontSize: 13, fontWeight: '700' },
  pillB: { fontWeight: '800' },
  week: { position: 'absolute', left: 14, right: 14 },
  weekRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 6 },
  wcol: { flex: 1, alignItems: 'center' },
  wd: { fontSize: 11, fontWeight: '600', opacity: 0.6, marginBottom: 6 },
  wn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  wnT: { fontSize: 14.5, fontWeight: '700' },
  fx: { position: 'absolute', width: 0, height: 0, alignItems: 'center' },
  sayBox: { position: 'absolute', width: 300, height: 0, alignItems: 'center' },
  say: { position: 'absolute', bottom: 8, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10, maxWidth: 230, shadowColor: '#0F2316', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  sayT: { fontSize: 14, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  sayTail: { position: 'absolute', bottom: -6, left: '50%', marginLeft: -7, width: 14, height: 14, transform: [{ rotate: '45deg' }], borderRadius: 3 },
  hud: { position: 'absolute', left: 14, right: 14 },
  hudIn: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  lvRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lvb: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  lvbT: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  who: { fontSize: 13, fontWeight: '700', opacity: 0.82 },
  row2: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  big: { fontSize: 54, lineHeight: 58, fontWeight: '800', letterSpacing: -2.7, marginTop: 6, includeFontPadding: false },
  bigPct: { fontSize: 28, letterSpacing: -0.5 },
  tail: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, marginBottom: 12, flexShrink: 1 },
  tailT: { fontSize: 12.5, fontWeight: '700' },
  tailTip: { position: 'absolute', left: 22, bottom: -5, width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  lbl: { fontSize: 12.5, fontWeight: '600', opacity: 0.6, marginTop: 2 },
  bar: { height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 12 },
  fill: { height: 14 },
  quick: { flexDirection: 'row', gap: 8, marginTop: 14 },
  qb: { flex: 1, borderRadius: 16, paddingTop: 4, paddingBottom: 7, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  qbT: { fontSize: 12.5, fontWeight: '700' },
  qbDot: { position: 'absolute', top: 7, right: 10, width: 7, height: 7, borderRadius: 4 },
  eggBtn: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  eggBtnT: { color: '#fff', fontSize: 16, fontWeight: '700' }
})
