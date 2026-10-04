// 23 §2 ①② 캐릭터 방 + XP 줄 (데스크톱 10 §3.2 v3 무대를 휴대폰 크기로): 시간대 장면, 숨쉬기·깜빡임·대기 동작,
// 누르면 깡충 + 하트 + 실제 숫자 말풍선, 길게 누르면 쓰다듬기, 5번 연타 어지러움, 밥그릇(오늘 할 일 XP / 10),
// XP 방울(자리 비운 사이 · 보는 중 들어온 XP), 레벨 링 배지 · 시간대·기분 알약 · 이름. 움직임 줄이기면 값만 바뀐다.
import * as Haptics from 'expo-haptics'
import { SPECIES, type Species } from '@sprout/schema/growth'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { dayKey } from '../lib/dates'
import { taskDone, xpGained } from '../data/events'
import { alpha, type Palette } from '../theme/palette'
import { CharacterArt } from './art/CharacterArt'
import { RoomScene, sceneIsDark } from './art/RoomScene'
import { BowlArt, Confetti, Heart, Orb, ORB_MS, type Pt } from './Bits'
import {
  baseMoodOf, bowlOf, catchUpOf, EGG_LINES, firstLine, greetingLine, isSleepy, levelOfTotal, moodLabel, nextStageHint, orbsOf, pickLine,
  placedDecor, stageLines, stageName, timeOfDay, TOD_LABEL, type Mood, type StageStats, type XpRow, type CharacterRow
} from './logic'
import { KEY, read, readRoomOff, takeGreeting, write } from './store'

export const ROOM_H = 260
type Progress = { total: number; level: number; into: number; toNext: number; stage: number }
type OrbItem = { id: number; from: Pt; via: Pt | null; to: Pt; label: string; big: boolean; delay: number }

export function GrowthRoom({ p, character, events, progress, stats, reduced, focused, loaded }: {
  p: Palette; character?: CharacterRow; events: XpRow[]; progress: Progress; stats: StageStats; reduced: boolean; focused: boolean; loaded: boolean
}) {
  const species: Species | null = character?.species ?? null
  const name = species ? (character?.name || SPECIES[species].name) : '아직 모르는 알'
  const [w, setW] = useState(0)
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)

  // ── 시간 · 앱 활성 ──
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => { const t = setInterval(() => setHour(new Date().getHours()), 60_000); return () => clearInterval(t) }, [])
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => { const sub = AppState.addEventListener('change', (st) => setActive(st === 'active')); return () => sub.remove() }, [])
  const live = focused && active
  const tod = timeOfDay(hour)
  const darkScene = sceneIsDark(tod, p.dark)

  // ── 표시용 XP(방울이 닿을 때마다 찬다) ──
  const [shownTotal, setShownTotal] = useState<number | null>(null)
  const settled = useRef(progress.total)
  const flying = useRef(0)
  useEffect(() => { if (shownTotal === null && flying.current === 0) settled.current = progress.total }, [progress.total, shownTotal])
  const shown = shownTotal === null ? progress : { ...levelOfTotal(shownTotal), total: shownTotal, stage: progress.stage }
  const stage = progress.stage
  const size = 120 + (stage - 1) * 8

  // ── 반응 상태 ──
  const [react, setReact] = useState<{ mood: Mood; id: number }>()
  const [bubble, setBubble] = useState<{ text: string; id: number }>()
  const [hearts, setHearts] = useState<{ id: number; dx: number }[]>([])
  const [orbs, setOrbs] = useState<OrbItem[]>([])
  const [burst, setBurst] = useState(0)
  const [banner, setBanner] = useState<string>()
  const [woke, setWoke] = useState(false)
  const [cracks, setCracks] = useState(0)
  const [blink, setBlink] = useState(false)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = useCallback((fn: () => void, ms: number) => { const t = setTimeout(() => { timers.current.delete(t); fn() }, ms); timers.current.add(t) }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const sleepy = !!species && isSleepy(hour, stats.idleDays) && !woke
  const mood = react?.mood ?? baseMoodOf({ sleepy, todayTaskXp: stats.todayTaskXp, todayDone: stats.todayDone })
  const feel = useCallback((m: Mood, ms: number) => { const id = Date.now() + Math.random(); setReact({ mood: m, id }); later(() => setReact((r) => (r?.id === id ? undefined : r)), ms) }, [later])
  const say = useCallback((text: string) => { const id = Date.now(); setBubble({ text, id }); later(() => setBubble((b) => (b?.id === id ? undefined : b)), 2600) }, [later])
  const heart = useCallback((dx = 0) => { if (reduced) return; const id = Date.now() + Math.random(); setHearts((h) => [...h.slice(-5), { id, dx }]); later(() => setHearts((h) => h.filter((x) => x.id !== id)), 1100) }, [reduced, later])

  // ── 숨쉬기 · 동작(깡충·흔들·빙글) ──
  const breath = useSharedValue(0)
  const hopY = useSharedValue(0)
  const tilt = useSharedValue(0)
  const spin = useSharedValue(0)
  useEffect(() => {
    if (reduced || !live) { cancelAnimation(breath); breath.value = 0; return }
    breath.value = 0
    breath.value = withRepeat(withTiming(1, { duration: sleepy ? 2500 : 1600, easing: Easing.inOut(Easing.sin) }), -1, true)
    return () => cancelAnimation(breath)
  }, [reduced, live, sleepy, breath])
  const charStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: hopY.value - breath.value * 1.5 },
      { rotate: `${tilt.value + spin.value}deg` },
      { scaleY: 1 + breath.value * 0.02 },
      { scaleX: 1 - breath.value * 0.008 }
    ]
  }))
  const hop = useCallback((times = 1) => {
    if (reduced) return
    const one = [withTiming(-18, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 220, easing: Easing.bounce })]
    hopY.value = withSequence(...(times > 1 ? [...one, ...one] : one))
  }, [reduced, hopY])
  const wobble = useCallback(() => {
    if (reduced) return
    tilt.value = withSequence(withTiming(-8, { duration: 100 }), withTiming(8, { duration: 160 }), withTiming(-5, { duration: 140 }), withTiming(0, { duration: 140 }))
  }, [reduced, tilt])
  const dizzy = useCallback(() => {
    if (reduced) return
    spin.value = 0
    spin.value = withTiming(360, { duration: 900, easing: Easing.inOut(Easing.cubic) }, () => { spin.value = 0 })
  }, [reduced, spin])

  // 깜빡임 3~6초(움직임이 아니라 얼굴 바꾸기라 움직임 줄이기에서도 둔다 — 10 §3.2.11) · 대기 동작 12~20초
  useEffect(() => {
    if (!live || !species) return
    let t: ReturnType<typeof setTimeout>
    const loop = () => { t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); loop() }, 3000 + Math.random() * 3000) }
    loop()
    return () => clearTimeout(t)
  }, [live, species])
  useEffect(() => {
    if (!live || reduced) return
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        if (!species) wobble()
        else if (!sleepy) (Math.random() < 0.5 ? hop : wobble)()
        loop()
      }, 12000 + Math.random() * 8000)
    }
    loop()
    return () => clearTimeout(t)
  }, [live, reduced, species, sleepy, hop, wobble])

  // ── 먹이: XP 방울 ──
  const geo = useMemo(() => {
    const cx = w / 2
    const charBottom = ROOM_H - 40
    return {
      mouth: { x: cx, y: charBottom - size * 0.36 },
      bowl: { x: 14 + 32, y: ROOM_H - 12 - 20 },
      left: { x: 6, y: ROOM_H * 0.42 },
      top: { x: cx + 50, y: 6 }
    }
  }, [w, size])
  const feed = useCallback((amounts: number[], opts: { viaBowl?: boolean; from?: Pt; base?: number } = {}) => {
    if (!amounts.length) return
    const total = amounts.reduce((a, b) => a + b, 0)
    if (reduced || !w) { feel('happy', 1500); return }
    const base = opts.base ?? settled.current
    setShownTotal((t) => t ?? base)
    flying.current += amounts.length
    const via = opts.viaBowl === false ? null : geo.bowl
    const from = opts.from ?? geo.left
    const dur = via ? ORB_MS.via : ORB_MS.direct
    const items: OrbItem[] = amounts.map((amt, i) => ({ id: Date.now() + Math.random() + i, from, via, to: geo.mouth, label: `+${amt}`, big: amt >= 10, delay: i * 120 }))
    setOrbs((o) => [...o, ...items])
    items.forEach((it, i) => later(() => {
      flying.current--
      setShownTotal((t) => (t ?? base) + amounts[i])
      setReact({ mood: 'eat', id: -1 })
      later(() => setReact((x) => (x?.id === -1 ? undefined : x)), 150)
      setOrbs((o) => o.filter((x) => x.id !== it.id))
    }, it.delay + dur))
    later(() => {
      feel('happy', 2500)
      hop()
      later(() => { if (flying.current === 0) { setShownTotal(null); settled.current = base + total } }, 400)
    }, items[items.length - 1].delay + dur)
  }, [reduced, w, geo, later, feel, hop])

  // 성장 탭에 들어올 때: 자리 비운 사이 받은 XP를 먹고(10 §3.2.5) 하루 첫 인사. 나갈 때 "본 때"를 적는다
  const entered = useRef(false)
  useEffect(() => {
    if (!character) return
    if (!focused) { if (entered.current) write(KEY.seenAt(character.id), new Date().toISOString()); entered.current = false; return }
    if (!loaded || !w || entered.current) return
    entered.current = true
    const since = read(KEY.seenAt(character.id))
    write(KEY.seenAt(character.id), new Date().toISOString())
    const c = catchUpOf(events, since)
    let wait = 600
    if (c.orbs.length) {
      setBanner(`자리 비운 사이 · ${c.tasks ? `할 일 ${c.tasks}개 ` : ''}+${c.xp} XP`)
      later(() => setBanner(undefined), 2600)
      settled.current = progress.total - c.xp
      if (!reduced) setShownTotal(progress.total - c.xp)
      later(() => feed(c.orbs, { base: progress.total - c.xp }), 500)
      wait = 2200
    }
    if (species && takeGreeting(dayKey())) later(() => { say(progress.total === 0 ? firstLine(name) : greetingLine(tod, stats)); hop() }, wait)
    else if (species && progress.total === 0) later(() => say(firstLine(name)), wait)
  }, [focused, loaded, w, character]) // eslint-disable-line react-hooks/exhaustive-deps

  // 보는 중에 들어온 XP(목표 체크 등) → 위에서 방울. 할 일 완료(XP 없어도) → 기뻐함
  useEffect(() => {
    if (!focused) return
    const offXp = xpGained.on((amount) => {
      if (character) write(KEY.seenAt(character.id), new Date().toISOString())
      setWoke(true)
      if (amount >= 10) setBurst((b) => b + 1)
      feed(orbsOf(amount), { from: geo.top, viaBowl: amount < 10 })
    })
    const offDone = taskDone.on(() => { setWoke(true); feel('happy', 3000); hop() })
    return () => { offXp(); offDone() }
  }, [focused, character, feed, feel, hop, geo])
  useEffect(() => { if (!woke) return; const t = setTimeout(() => setWoke(false), 60_000); return () => clearTimeout(t) }, [woke])

  // ── 말 걸기 ──
  const lineIdx = useRef(0)
  const lastLine = useRef('')
  const nextLine = () => {
    const all = species ? stageLines({ ...stats, level: progress.level, into: progress.into, toNext: progress.toNext }) : EGG_LINES
    const r = pickLine(all, lineIdx.current, lastLine.current)
    lineIdx.current = r.idx
    lastLine.current = r.line
    return r.line
  }
  const clicks = useRef<number[]>([])
  const dizzyAt = useRef(0)
  const petting = useRef<{ on: boolean; timer?: ReturnType<typeof setInterval> }>({ on: false })
  const onPress = () => {
    void Haptics.selectionAsync()
    if (!species) { setCracks((c) => Math.min(3, c + 1)); wobble(); say(nextLine()); return }
    if (sleepy) { setWoke(true); say('으음… 안 잤어!'); later(() => setWoke(false), 5000); return }
    const now = Date.now()
    clicks.current = [...clicks.current.filter((t) => now - t < 2000), now]
    if (clicks.current.length >= 5 && now - dizzyAt.current > 10_000) { dizzyAt.current = now; clicks.current = []; dizzy(); say('어지러워~'); return }
    hop()
    wobble()
    heart()
    feel('happy', 1500)
    say(nextLine())
  }
  const onLongPress = () => {
    if (!species) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    petting.current.on = true
    setReact({ mood: 'happy', id: -2 })
    let n = 0
    petting.current.timer = setInterval(() => { if (n++ < 6) heart((Math.random() - 0.5) * 50) }, 300)
  }
  const onPressOut = () => {
    if (!petting.current.on) return
    petting.current.on = false
    clearInterval(petting.current.timer)
    setReact((x) => (x?.id === -2 ? undefined : x))
    say('헤헤, 고마워')
  }

  // ── 장식(기기에만, 10 §3.2.7) ──
  const off = useMemo(() => (character ? readRoomOff(character.id) : new Set<string>()), [character])
  const placed = useMemo(() => placedDecor(progress.level, off, !!species), [progress.level, off, species])
  const bowl = bowlOf(stats.todayTaskXp)
  const ink = darkScene ? '#f2f2f2' : '#2a2a2a'
  const R = 21
  const C = 2 * Math.PI * R
  const ratio = shown.into / shown.toNext
  const stName = stageName(stage)

  return (
    <View>
      <View style={[s.room, { borderColor: p.id === 'black' ? '#1f1f1f' : 'transparent' }]} onLayout={onLayout}>
        {w > 0 && <RoomScene species={species} stage={stage} tod={tod} dark={p.dark} name={name} placed={placed} accent={p.accent} width={w} height={ROOM_H} />}
        {!reduced && live && <Clouds dark={darkScene} width={w} />}

        {/* 왼쪽 위 레벨 배지(50, 원형 진행 링) */}
        <View style={s.lv} accessible accessibilityLabel={`레벨 ${shown.level}, 다음 레벨까지 ${shown.toNext - shown.into} XP`}>
          <Svg width={50} height={50} viewBox="0 0 50 50">
            <Circle cx={25} cy={25} r={R} fill={darkScene ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.78)'} stroke={darkScene ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)'} strokeWidth={4} />
            <Circle cx={25} cy={25} r={R} fill="none" stroke={p.accent} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - ratio)} transform="rotate(-90 25 25)" />
          </Svg>
          <View style={s.lvText} pointerEvents="none">
            <Text style={[s.lvSmall, { color: ink }]}>Lv</Text>
            <Text style={[s.lvNum, { color: ink }]}>{shown.level}</Text>
          </View>
        </View>
        {/* 오른쪽 위 시간대 · 기분 */}
        <View style={[s.time, { backgroundColor: darkScene ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.65)' }]}>
          <Text style={[s.timeText, { color: darkScene ? '#cfd3da' : '#4b5563' }]}>{TOD_LABEL[tod]}{species ? ` · ${moodLabel(mood)}` : ''}</Text>
        </View>
        {banner ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[s.banner, { backgroundColor: alpha(p.accent, 0.92) }]} accessibilityLiveRegion="polite">
            <Text style={s.bannerText}>{banner}</Text>
          </Animated.View>
        ) : null}

        {/* 밥그릇(왼쪽 아래) */}
        {species ? (
          <Pressable style={s.bowl} accessibilityRole="button" accessibilityLabel={`밥그릇: 오늘 할 일 XP ${bowl.filled}/${bowl.cap}`} onPress={() => { say(bowl.line); if (bowl.full) feel('content', 1500) }} hitSlop={6}>
            <BowlArt n={bowl.filled} accent={p.accent} />
            <Text style={[s.bowlText, { color: ink }]}>{bowl.filled}/{bowl.cap}</Text>
          </Pressable>
        ) : null}

        {/* 캐릭터 */}
        <View style={[s.charWrap, { bottom: 40 }]} pointerEvents="box-none">
          {bubble ? (
            <Animated.View key={bubble.id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[s.bubble, { marginBottom: 2 }]}>
              <Text style={s.bubbleText} numberOfLines={2}>{bubble.text}</Text>
              <View style={s.bubbleTail} />
            </Animated.View>
          ) : null}
          {sleepy && !bubble ? <Text style={[s.zzz, { color: darkScene ? '#dfe3ff' : '#6b7280' }]}>Zzz</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={species ? `${name}, Lv ${progress.level} ${stName}. 눌러서 말 걸기` : '아직 모르는 알. 눌러서 두드리기'}
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={600}
            onPressOut={onPressOut}
          >
            <Animated.View style={charStyle}>
              <CharacterArt species={species} stage={stage} size={size} mood={mood} blink={blink} cracks={cracks} />
            </Animated.View>
          </Pressable>
          <View style={s.hearts} pointerEvents="none">{hearts.map((h) => <Heart key={h.id} dx={h.dx} />)}</View>
        </View>
        <View style={s.live} accessibilityLiveRegion="polite" importantForAccessibility="yes"><Text style={{ fontSize: 1, color: 'transparent' }}>{bubble?.text ?? ''}</Text></View>

        {/* 아래 가운데 이름 */}
        <View style={s.name} pointerEvents="none">
          <Text style={[s.nameText, { color: ink }]} numberOfLines={1}>{name}</Text>
          <Text style={[s.nameSub, { color: ink }]} numberOfLines={1}>{species ? `${stName} · ${SPECIES[species].name}` : '나와 닮은 친구를 찾으면 깨어나요'}</Text>
        </View>

        {orbs.map((o) => <Orb key={o.id} {...o} accent={p.accent} />)}
        {burst > 0 && !reduced ? <View key={burst} style={StyleSheet.absoluteFill} pointerEvents="none"><Confetti count={24} spread={140} /></View> : null}
      </View>

      {/* ② XP 줄 */}
      <XpLine p={p} into={shown.into} toNext={shown.toNext} level={shown.level} reduced={reduced} />
    </View>
  )
}

function XpLine({ p, into, toNext, level, reduced }: { p: Palette; into: number; toNext: number; level: number; reduced: boolean }) {
  const ratio = Math.max(0, Math.min(1, into / toNext))
  const fill = useSharedValue(ratio)
  useEffect(() => { fill.value = reduced ? ratio : withTiming(ratio, { duration: 450, easing: Easing.out(Easing.cubic) }) }, [ratio, reduced, fill])
  const st = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))
  const hint = nextStageHint(level)
  return (
    <View style={s.xpline} accessible accessibilityRole="progressbar" accessibilityLabel={`다음 레벨까지 ${toNext - into} XP`} accessibilityValue={{ min: 0, max: toNext, now: into }}>
      <View style={[s.xpbar, { backgroundColor: p.bgSelected }]}><Animated.View style={[s.xpfill, { backgroundColor: p.accent }, st]} /></View>
      <View style={s.xplbl}>
        <Text style={{ fontSize: 12, color: p.textSecondary }}>다음 레벨까지 <Text style={{ color: p.accent, fontWeight: '700' }}>{toNext - into} XP</Text></Text>
        {hint ? <Text style={{ fontSize: 12, color: p.textTertiary }}>{hint}</Text> : null}
      </View>
    </View>
  )
}

/** 구름 두 조각이 아주 천천히 흐른다(60초에 한 바퀴) */
function Clouds({ dark, width }: { dark: boolean; width: number }) {
  const t = useSharedValue(0)
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 60_000, easing: Easing.linear }), -1, false); return () => cancelAnimation(t) }, [t])
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: -90 + (width + 180) * t.value }] }))
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: -90 + (width + 180) * ((t.value + 0.55) % 1) }] }))
  const bg = dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.8)'
  return (
    <>
      <Animated.View pointerEvents="none" style={[s.cloud, { top: 34, backgroundColor: bg }, a]} />
      <Animated.View pointerEvents="none" style={[s.cloud, { top: 72, width: 54, height: 18, backgroundColor: bg }, b]} />
    </>
  )
}

const s = StyleSheet.create({
  room: { height: ROOM_H, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  lv: { position: 'absolute', left: 12, top: 12, width: 50, height: 50 },
  lvText: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  lvSmall: { fontSize: 9, lineHeight: 10, fontWeight: '600', opacity: 0.6 },
  lvNum: { fontSize: 15, lineHeight: 16, fontWeight: '700' },
  time: { position: 'absolute', right: 12, top: 14, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  timeText: { fontSize: 11, lineHeight: 16, fontWeight: '500' },
  banner: { position: 'absolute', top: 70, alignSelf: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  bannerText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bowl: { position: 'absolute', left: 14, bottom: 12, alignItems: 'center' },
  bowlText: { fontSize: 10, fontWeight: '700', marginTop: -2, opacity: 0.75 },
  charWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bubble: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 240, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  bubbleText: { color: '#333', fontSize: 12.5, lineHeight: 17, fontWeight: '500', textAlign: 'center' },
  bubbleTail: { position: 'absolute', bottom: -5, left: '50%', marginLeft: -5, width: 10, height: 10, backgroundColor: '#fff', transform: [{ rotate: '45deg' }] },
  zzz: { position: 'absolute', right: '28%', top: -6, fontSize: 16, fontWeight: '800', fontStyle: 'italic' },
  hearts: { position: 'absolute', left: '50%', top: 30, width: 0, height: 0, alignItems: 'center' },
  live: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  name: { position: 'absolute', left: 0, right: 0, bottom: 8, alignItems: 'center' },
  nameText: { fontSize: 15, lineHeight: 18, fontWeight: '700' },
  nameSub: { fontSize: 11, lineHeight: 14, fontWeight: '500', opacity: 0.7 },
  cloud: { position: 'absolute', left: 0, width: 80, height: 24, borderRadius: 12 },
  xpline: { paddingTop: 12, paddingHorizontal: 16 },
  xpbar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  xpfill: { height: 8, borderRadius: 4 },
  xplbl: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }
})

