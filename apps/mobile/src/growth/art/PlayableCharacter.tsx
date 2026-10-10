// 49 §7.1 만지기 v3(휴대폰) — CharacterArt를 감싸 누르기 깡충 · 두 번/3번째 한 바퀴 · 빠르게 4번 간지럼 · 길게 쓰다듬기 · 끌었다 놓기 · 가끔 딴짓.
// 규칙·시간·움직임 키는 공용 @sprout/schema/charPlay(데스크톱과 같다), 휴대폰에서 돌리는 계산은 ./playPlan.
// 성능(39 §11): 감싸개 transform(translate·rotate·scale)·opacity만. 한 바퀴 = 미리 올려 둔 회전 띠 한 장(가로 12컷)을 칸 안에서 translateX로 넘긴다 —
// 컷 번호는 useAnimatedStyle 안(UI 스레드)에서 계산, 도는 동안 층 그림(옷 포함)은 opacity 0. 띠가 없으면(종 묶음 전) 한 바퀴 대신 깡충.
// 반응 하나가 진행 중이면 새 누르기는 판정만 하고, 더 센 반응(한 바퀴·간지럼)만 끊고 들어간다. 딴짓은 보일 때만(active + 앱 앞).
// 보상 없음(43 §4.1) — 만지기는 아무것도 주지 않고 세지도 않는다. 말풍선은 부르는 쪽이 그린다(onTap·onSay).
import { artFile, FOOT, headTop3d, MASCOT, spinOf } from '@sprout/schema/characterArt'
import { DIZZY, GIGGLE, HOP, landAt, newTapState, nextIdleMs, onTap as judgeTap, PET, pickIdle, PULSE, SPIN, WOBBLE, type Motion, type PlayKind } from '@sprout/schema/charPlay'
import { normalizeSpecies } from '@sprout/schema/growth'
import { TOUCH, TOUCH_LINES } from '@sprout/schema/wardrobe'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AppState, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated'
import { hx } from '../../ui/haptics'
import { DustBurst, Heart } from '../Bits'
import { useMotionReduced } from '../motion'
import { artSource, CharacterArt, useArtPackVersion, useCharacterWear, type CharacterArtProps, type CharacterWear } from './CharacterArt'
import { packUri } from './art3dPacks'
import { dustBits, faceHoldMs, PET_EVERY_MS, PET_HOLD_MS, PET_MAX, petBit, shouldStart, spinCut, steps, withStrip, type Dust } from './playPlan'

export type PlayHandle = {
  /** 부르는 쪽이 움직임 하나를 건다(완료 깡충·데모). 진행 중보다 약하면 버린다 */
  play: (kind: 'hop' | 'spin' | 'giggle' | 'wobble' | 'pet' | 'dizzy' | 'pulse') => void
  hop: () => void
}
export type PlayLevel = 'full' | 'light'
/** 움직임 공유 값 — 부르는 쪽이 만들어 넘기면(values) 말풍선 등이 같은 값을 UI 스레드에서 읽는다(49 §7.2) */
export type PlayValues = {
  /** 몸: 위아래(상자 높이 비율) · 기울기(°) · 늘기 — 기준 50% · FOOT.y */
  y: SharedValue<number>; sx: SharedValue<number>; sy: SharedValue<number>; rot: SharedValue<number>
  /** 끌기: 감싸개 이동(px) · 기울기(°) — 기준 가운데 */
  dx: SharedValue<number>; dy: SharedValue<number>; drot: SharedValue<number>
}
export function usePlayValues(): PlayValues {
  const y = useSharedValue(0), sx = useSharedValue(1), sy = useSharedValue(1), rot = useSharedValue(0)
  const dx = useSharedValue(0), dy = useSharedValue(0), drot = useSharedValue(0)
  return useMemo(() => ({ y, sx, sy, rot, dx, dy, drot }), [y, sx, sy, rot, dx, dy, drot])
}

type Props = Pick<CharacterArtProps, 'species' | 'stage' | 'size' | 'mood' | 'seed' | 'crop' | 'style'> & {
  wear?: CharacterWear | null
  /** full = 전부, light = 누르기 깡충만(딴짓·한 바퀴·간지럼·쓰다듬기·끌기 없음) — AI 비서 빈 대화·일기 큰 얼굴 */
  level?: PlayLevel
  /** 손가락 받기(false면 부르는 쪽이 Pressable로 감싸고 ref.hop()을 부른다) */
  interactive?: boolean
  /** 화면에 보이는가(포커스) — 딴짓은 이것 && 앱이 앞일 때만 */
  active?: boolean
  /** 딴짓 켜기(밤에 자는 중·바쁜 날이면 부르는 쪽이 끈다) */
  idle?: boolean
  /** 끌었다 놓기(받침 반경 안에서 따라옴) — 기본 full이면 켬 */
  draggable?: boolean
  /** 움직임 줄이기(안 주면 OS·성장 설정) */
  reduced?: boolean
  disabled?: boolean
  /** 움직임 공유 값을 바깥에서(말풍선 따라가기 — 49 §7.2). 없으면 안에서 만든다 */
  values?: PlayValues
  /** 누를 때마다(판정 결과 · 실제로 움직였는지) — 말풍선 한 줄은 부르는 쪽이 */
  onTap?: (kind: PlayKind, started: boolean) => void
  /** 반응이 말하는 한 줄(간지럼 `히히, 간지러워!` · 쓰다듬기 끝 `헤헤, 고마워`) */
  onSay?: (text: string) => void
  onPetStart?: () => void
  onDragStart?: () => void
  onDrop?: (far: boolean) => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

const BY_KIND: Record<Parameters<PlayHandle['play']>[0], Motion> = { hop: HOP, spin: SPIN, giggle: GIGGLE, wobble: WOBBLE, pet: PET, dizzy: DIZZY, pulse: PULSE }
const IDLE_KINDS = new Set<PlayKind>(['look', 'stretch', 'blink', 'minihop'])
const ease = Easing.inOut(Easing.quad)
type Face = 'happy' | 'wow' | 'think' | 'sleepy'

function drive(v: SharedValue<number>, m: Motion, f: 'y' | 'sx' | 'sy' | 'rot', d: number) {
  cancelAnimation(v)
  const st = steps(m, f, d)
  v.value = withSequence(...st.map((k) => withTiming(k.v, { duration: k.ms, easing: ease })))
}
function loop(v: SharedValue<number>, m: Motion, f: 'sx' | 'sy' | 'rot', d: number) {
  cancelAnimation(v)
  const st = steps(m, f, d, true)
  v.value = withRepeat(withSequence(...st.map((k) => withTiming(k.v, { duration: k.ms, easing: ease }))), -1)
}

function useAppActive() {
  const [on, setOn] = useState(AppState.currentState === 'active')
  useEffect(() => { const sub = AppState.addEventListener('change', (s) => setOn(s === 'active')); return () => sub.remove() }, [])
  return on
}

export const PlayableCharacter = memo(forwardRef<PlayHandle, Props>(function PlayableCharacter(props, ref) {
  const { species, stage = 1, size = 120, mood, seed, crop, wear, style, level = 'full', interactive = true, active = true, idle = true, disabled, accessibilityLabel, accessibilityHint } = props
  const osReduced = useMotionReduced()
  const reduced = props.reduced ?? osReduced
  const appOn = useAppActive()
  const ctx = useCharacterWear()
  useArtPackVersion()
  // 종이 없으면 = 성향 조사 전 → 마스코트(아기 달팽이, 49 §15)를 달팽이 1단계 그대로 만지게 한다
  const mascot = !normalizeSpecies(species ?? null)
  const sp = mascot ? MASCOT.sp : normalizeSpecies(species ?? null)
  const st = mascot ? MASCOT.st : Math.min(5, Math.max(1, stage))
  const full = level === 'full' && !!sp
  const draggable = (props.draggable ?? full) && full
  const w = mascot || wear === null ? undefined : wear ?? (ctx && sp && ctx.species === sp ? ctx.wear : undefined)
  const path = w?.path ?? 'a'
  const seedNo = mascot ? MASCOT.seed : seed ?? w?.seed ?? ctx?.wear.seed ?? 0

  // 회전 띠(종 묶음 — 없으면 null → 깡충)
  const strip = useMemo(() => {
    if (!full || crop === 'bust' || size <= 40) return null
    const s = spinOf(sp!, st, path, seedNo)
    if (!s) return null
    const src = artSource(s.key, s.px) ?? (() => { const u = packUri(artFile(s.key, s.px)); return u ? { uri: u } : null })()
    return src ? { src, frames: s.frames } : null
  }, [full, crop, size, sp, st, path, seedNo]) // eslint-disable-line react-hooks/exhaustive-deps
  const frames = strip?.frames ?? 0
  const headY = sp ? Math.max(0.08, headTop3d(sp, st, path, seedNo).y) * size : size * 0.25

  // 최신 콜백(제스처 객체를 다시 만들지 않게)
  const cb = useRef(props)
  cb.current = props

  // ── 공유 값 ──
  const own = usePlayValues()
  const { y, sx, sy, rot, dx, dy, drot } = props.values ?? own
  const t = useSharedValue(0), sFrom = useSharedValue(2), sTo = useSharedValue(2)

  // ── 얼굴 · 조각 ──
  const [face, setFace] = useState<Face | null>(null)
  const [blink, setBlink] = useState(false)
  const [dust, setDust] = useState<{ id: number; bits: Dust[] }[]>([])
  const [bits, setBits] = useState<{ id: number; kind: 'heart' | 'spark'; dx: number }[]>([])

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = useCallback((fn: () => void, ms: number) => { const tm = setTimeout(() => { timers.current.delete(tm); fn() }, ms); timers.current.add(tm); return tm }, [])
  const motionTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const cur = useRef<PlayKind | null>(null)
  const runId = useRef(0)
  const faceId = useRef(0)
  const petting = useRef<{ on: boolean; iv?: ReturnType<typeof setInterval> }>({ on: false })
  const dragging = useRef(false)
  const tapState = useRef(newTapState())
  useEffect(() => () => {
    timers.current.forEach(clearTimeout); clearInterval(petting.current.iv)
    for (const v of [y, sx, sy, rot, t, dx, dy, drot]) cancelAnimation(v)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showFace = useCallback((f: Face | null, ms: number) => {
    const id = ++faceId.current
    setFace(f)
    later(() => { if (faceId.current === id) setFace(null) }, ms)
  }, [later])
  const stopMotion = useCallback(() => {
    motionTimers.current.forEach((tm) => { clearTimeout(tm); timers.current.delete(tm) })
    motionTimers.current = []
    cancelAnimation(t); t.value = 0; sFrom.value = 2; sTo.value = 2
    cur.current = null
  }, [t, sFrom, sTo])

  /** 움직임 하나 — 진행 중보다 약하면 false */
  const run = useCallback((m0: Motion): boolean => {
    let m = withStrip(m0, !!strip)
    if (!full && (m.kind === 'spin' || m.kind === 'giggle' || m.kind === 'wobble' || m.kind === 'pet' || m.kind === 'dizzy')) m = HOP
    const quiet = IDLE_KINDS.has(m.kind)
    if (reduced && m.kind !== 'blink' && m.kind !== 'pulse') m = { ...PULSE, face: m0.face ?? (quiet ? undefined : 'happy') }
    if (!shouldStart(cur.current, m.kind)) return false
    stopMotion()
    const id = ++runId.current
    cur.current = m.kind
    const fc: Face | undefined = m.face ?? (m.kind === 'pulse' && !quiet ? 'happy' : undefined)
    if (m.kind === 'blink') { setBlink(true); motionTimers.current.push(later(() => setBlink(false), m.ms)) }
    else if (fc) showFace(fc, faceHoldMs(m))
    drive(y, m, 'y', 0); drive(sx, m, 'sx', 1); drive(sy, m, 'sy', 1); drive(rot, m, 'rot', 0)
    if (m.spin && frames) {
      sFrom.value = m.spin.from; sTo.value = m.spin.to
      t.value = 0; t.value = withTiming(1, { duration: m.ms, easing: Easing.linear })
    }
    const land = landAt(m)
    if (land !== null && !quiet && !reduced) {
      motionTimers.current.push(later(() => {
        if (m.kind === 'spin') hx.tick(); else hx.tap() // 깡충 착지 = 가볍게, 한 바퀴 끝 = 부드럽게
        const did = Date.now() + Math.random()
        setDust((d) => [...d.slice(-2), { id: did, bits: dustBits(Math.floor(did) % 9) }])
        later(() => setDust((d) => d.filter((x) => x.id !== did)), 460)
      }, land))
    }
    motionTimers.current.push(later(() => { if (runId.current === id) { cur.current = null; sFrom.value = 2 } }, m.ms))
    return true
  }, [strip, full, reduced, frames, stopMotion, later, showFace, y, sx, sy, rot, t, sFrom, sTo])

  const hop = useCallback(() => { run(reduced ? PULSE : HOP) }, [run, reduced])
  useImperativeHandle(ref, () => ({ play: (k) => { run(BY_KIND[k]) }, hop }), [run, hop])

  // ── 누르기 ──
  const tap = useCallback(() => {
    if (cb.current.disabled) return
    let m: Motion
    if (!full) m = reduced ? PULSE : HOP
    else { const r = judgeTap(tapState.current, Date.now(), reduced); tapState.current = r.state; m = r.motion }
    if (reduced) hx.tick()
    const started = run(m)
    cb.current.onTap?.(m.kind, started)
    if (m.kind === 'giggle') cb.current.onSay?.(TOUCH_LINES.tickle)
  }, [full, reduced, run])

  // ── 길게 = 쓰다듬기 ──
  const petStart = useCallback(() => {
    if (!full || cb.current.disabled) return
    stopMotion()
    cur.current = 'pet'
    petting.current.on = true
    hx.tap()
    faceId.current++; setFace('happy')
    cb.current.onPetStart?.()
    if (reduced) return
    loop(rot, PET, 'rot', 0); loop(sx, PET, 'sx', 1); loop(sy, PET, 'sy', 1)
    let n = 0
    const add = () => {
      if (n >= PET_MAX) return
      const b = petBit(n++), id = Date.now() + Math.random()
      setBits((x) => [...x.slice(-PET_MAX), { id, ...b }])
      later(() => setBits((x) => x.filter((k) => k.id !== id)), 1100)
    }
    add()
    petting.current.iv = setInterval(add, PET_EVERY_MS)
  }, [full, reduced, stopMotion, later, rot, sx, sy])
  const petEnd = useCallback(() => {
    if (!petting.current.on) return
    petting.current.on = false
    clearInterval(petting.current.iv)
    for (const [v, d] of [[rot, 0], [sx, 1], [sy, 1]] as const) { cancelAnimation(v); v.value = withTiming(d, { duration: 220, easing: ease }) }
    cur.current = null
    showFace('happy', 1200)
    cb.current.onSay?.(TOUCH_LINES.pet)
  }, [rot, sx, sy, showFace])

  // ── 끌었다 놓기 ──
  const dragStart = useCallback(() => {
    stopMotion()
    dragging.current = true
    for (const [v, d] of [[y, 0], [rot, 0], [sx, 1], [sy, 1]] as const) { cancelAnimation(v); v.value = withTiming(d, { duration: 120 }) }
    faceId.current++; setFace('wow')
    cb.current.onDragStart?.()
  }, [stopMotion, y, rot, sx, sy])
  const drop = useCallback((far: boolean) => {
    later(() => { dragging.current = false; faceId.current++; setFace(null); run(WOBBLE) }, reduced ? 0 : 400)
    cb.current.onDrop?.(far)
  }, [later, run, reduced])

  // ── 딴짓(8~15초, 보일 때만) ──
  const idleOn = full && idle && active && appOn && !disabled
  useEffect(() => {
    if (!idleOn) return
    let tm: ReturnType<typeof setTimeout>
    const next = () => {
      tm = setTimeout(() => {
        if (!petting.current.on && !dragging.current && cur.current === null) run(pickIdle(Math.random(), reduced))
        next()
      }, nextIdleMs(Math.random()))
    }
    next()
    return () => clearTimeout(tm)
  }, [idleOn, reduced, run])
  // 보이지 않게 되면 하던 쓰다듬기를 끝낸다
  useEffect(() => { if (!active || !appOn) { clearInterval(petting.current.iv); petting.current.on = false } }, [active, appOn])

  const gesture = useMemo(() => {
    const R = TOUCH.dragRadius, DOWN = TOUCH.dragDown, FAR = TOUCH.dropFarPx, red = reduced
    const tapG = Gesture.Tap().maxDuration(450).onEnd((_e, ok) => { if (ok) runOnJS(tap)() })
    if (!full) return tapG
    const long = Gesture.LongPress().minDuration(PET_HOLD_MS).maxDistance(TOUCH.dragStartPx)
      .onStart(() => { runOnJS(petStart)() })
      .onFinalize(() => { runOnJS(petEnd)() })
    if (!draggable) return Gesture.Race(long, tapG)
    const pan = Gesture.Pan().minDistance(TOUCH.dragStartPx)
      .onStart(() => { runOnJS(dragStart)() })
      .onUpdate((e) => {
        const r = Math.hypot(e.translationX, e.translationY), k = r > R ? R / r : 1
        dx.value = e.translationX * k
        dy.value = Math.min(e.translationY * k, DOWN)
        drot.value = dx.value / 9
      })
      .onEnd(() => {
        const x = dx.value, yy = dy.value, far = Math.hypot(x, yy) > FAR
        if (red) {
          dx.value = withTiming(0, { duration: 160 }); dy.value = withTiming(0, { duration: 160 }); drot.value = withTiming(0, { duration: 160 })
        } else {
          dx.value = withSequence(withTiming(x * 0.35, { duration: 230 }), withTiming(0, { duration: 180 }))
          dy.value = withSequence(withTiming(Math.min(yy, 0) - (far ? 34 : 16), { duration: 230, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }))
          drot.value = withSequence(withTiming(-x / 14, { duration: 230 }), withTiming(0, { duration: 180 }))
        }
        runOnJS(drop)(far)
      })
    return Gesture.Race(pan, long, tapG)
  }, [full, draggable, reduced, tap, petStart, petEnd, dragStart, drop, dx, dy, drot])

  // ── 그리기 ──
  const outer = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }, { translateY: dy.value }, { rotate: `${drot.value}deg` }] }))
  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value * size }, { rotate: `${rot.value}deg` }, { scaleX: sx.value }, { scaleY: sy.value }]
  }))
  const artOp = useAnimatedStyle(() => ({ opacity: spinCut(t.value, sFrom.value, sTo.value, frames) < 0 ? 1 : 0 }))
  const stripOp = useAnimatedStyle(() => ({ opacity: spinCut(t.value, sFrom.value, sTo.value, frames) < 0 ? 0 : 1 }))
  const stripX = useAnimatedStyle(() => ({ transform: [{ translateX: -Math.max(0, spinCut(t.value, sFrom.value, sTo.value, frames)) * size }] }))

  const art = (
    <Animated.View style={[s.fill, { transformOrigin: `50% ${FOOT.y * 100}%` }, body]}>
      <Animated.View style={[s.fill, artOp]}>
        <CharacterArt species={sp} stage={st} size={size} mood={face ?? mood} seed={mascot ? MASCOT.seed : seed} crop={crop} wear={mascot ? null : wear} blink={full ? blink : undefined} />
      </Animated.View>
      {strip ? (
        <Animated.View style={[s.fill, s.clip, stripOp]} pointerEvents="none">
          <Animated.View style={[{ width: size * frames, height: size }, stripX]}>
            <Image source={strip.src} style={{ width: size * frames, height: size }} fadeDuration={0} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </Animated.View>
  )
  const fx = (
    <>
      <View style={[s.pt, { left: size / 2, top: FOOT.y * size }]} pointerEvents="none">
        {dust.map((d) => <DustBurst key={d.id} bits={d.bits} box={size} />)}
      </View>
      <View style={[s.pt, { left: size / 2, top: headY }]} pointerEvents="none">
        {bits.map((b) => <Heart key={b.id} dx={b.dx * size} rise={Math.min(44, headY * 0.8)} size={b.kind === 'heart' ? 15 : 13} spark={b.kind === 'spark'} />)}
      </View>
    </>
  )
  const box = [{ width: size, height: size }, style]
  if (!interactive) return <View style={box} pointerEvents="none">{art}{fx}</View>
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[box, outer]} accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled }} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => tap()}>
        {art}{fx}
      </Animated.View>
    </GestureDetector>
  )
}))

const s = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  clip: { overflow: 'hidden' },
  pt: { position: 'absolute', width: 0, height: 0, alignItems: 'center' }
})

