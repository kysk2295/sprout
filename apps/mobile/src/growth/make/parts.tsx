// 49 §5 만들기 흐름(휴대폰) 조각 — 시안 character-v3.html `.make` CSS를 RN으로 옮긴 것.
// 39 §11: 그림은 Image, 움직임은 reanimated transform·opacity만. 씨앗 회전 = 12컷을 모두 미리 올려 두고 opacity만 바꾼다(소스 교체·디코드 없음).
// 반복해서 움직이는 것은 한 화면에 하나(씨앗 둥실 · 작은 씨앗 두근 · 아기 숨쉬기 중 하나).
import { BlurView } from 'expo-blur'
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, type ReactNode } from 'react'
import { Image, Platform, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue
} from 'react-native-reanimated'
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg'
import { SEED_FRAMES, seedCrackKey, seedTurnKey } from '@sprout/schema/characterArt'
import type { Species } from '@sprout/schema/growth'
import { CharacterArt, artSource } from '../art/CharacterArt'
import { PressableScale } from '../../ui/Pressables'
import type { Palette } from '../../theme/palette'
import { INTRO_SPIN_MS, turnFromDrag, wrapTurn } from './flow'

// ── 색(시안 :root · [data-theme=dark]) ──
export function makeColors(p: Palette) {
  const d = p.dark
  return {
    dark: d,
    ink: d ? '#FFFFFF' : '#13211B',
    glass: d ? 'rgba(16,24,30,0.5)' : 'rgba(255,255,255,0.58)',
    /** 움직이는 카드는 흐림(BlurView) 없이 조금 더 짙게 — 흐림 뷰의 투명도를 움직이면 iOS가 효과를 끈다 */
    glassSolid: d ? 'rgba(20,28,34,0.78)' : 'rgba(255,255,255,0.8)',
    glassLine: d ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)',
    optBg: d ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.66)',
    optInk: d ? '#EEF3F0' : '#13211B',
    accent: p.accent,
    accentText: d ? '#6EE0C2' : p.accent,
    accentSubtle: d ? '#133A31' : '#DCEFE9',
    honey: '#F2B84B'
  }
}
export type MakeColors = ReturnType<typeof makeColors>

// ── 글자 ──
export const T = StyleSheet.create({
  hxl: { fontSize: 31, lineHeight: 38, fontWeight: '800', letterSpacing: -1.1 },
  sub: { fontSize: 14.5, lineHeight: 22.5, fontWeight: '500', opacity: 0.72, marginTop: 8 }
})
export function Copy({ c, title, sub, style, titleStyle }: { c: MakeColors; title: string; sub?: string; style?: StyleProp<ViewStyle>; titleStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[{ paddingHorizontal: 26 }, style]}>
      <Text style={[T.hxl, { color: c.ink }, titleStyle]} accessibilityRole="header">{title}</Text>
      {sub ? <Text style={[T.sub, { color: c.ink }]}>{sub}</Text> : null}
    </View>
  )
}

// ── 유리 ──
export function Glass({ c, children, style, radius = 26, blur = true }: { c: MakeColors; children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; blur?: boolean }) {
  const ios = Platform.OS === 'ios'
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.glassLine }, style]}>
      {blur && ios ? <BlurView intensity={40} tint={c.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: blur && ios ? c.glass : c.glassSolid }]} />
      {children}
    </View>
  )
}

// ── 버튼(.btn · .btn.ghost) ──
export function BigButton({ c, label, onPress, disabled, dim, style }: { c: MakeColors; label: string; onPress?: () => void; disabled?: boolean; dim?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <PressableScale scale={0.98} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={[s.btn, { backgroundColor: c.accent, opacity: dim ? 0.35 : 1 }, style]}>
      <Text style={s.btnText}>{label}</Text>
    </PressableScale>
  )
}
export function Chip({ c, label, onPress, a11y }: { c: MakeColors; label: string; onPress: () => void; a11y?: string }) {
  return (
    <PressableScale scale={0.95} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label}>
      <Glass c={c} radius={999} style={s.chip}><Text style={[s.chipText, { color: c.ink }]}>{label}</Text></Glass>
    </PressableScale>
  )
}

// ── 위 진행 점(.dots) ──
export const Dots = memo(function Dots({ c, on }: { c: MakeColors; on: number }) {
  return (
    <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 6 }, (_, i) => <View key={i} style={[s.dot, { backgroundColor: c.ink }, i === on ? s.dotOn : null]} />)}
    </View>
  )
})

// ── 씨앗 그림 ──
const SEED_PX = 320
/** 씨앗 회전 컷 그림(아직 굽지 않은 컷은 같은 씨앗 0컷 → 흙빛 0컷으로) */
export const seedSrc = (seed: number, turn: number): ImageSourcePropType | null =>
  artSource(seedTurnKey(seed, turn), SEED_PX) ?? artSource(seedTurnKey(seed, 0), SEED_PX) ?? artSource(seedTurnKey(0, 0), SEED_PX)
export const crackSrc = (seed: number, cracks: number) => (cracks ? artSource(seedCrackKey(seed, cracks), SEED_PX) ?? seedSrc(seed, 0) : seedSrc(seed, 0))

/** 바닥 그림자(.seedwrap .shadow) */
export function SeedShadow({ size }: { size: number }) {
  const w = size * 0.5, h = 18
  return (
    <Svg width={w + 20} height={h + 12} style={{ position: 'absolute', bottom: 0, left: (size - w - 20) / 2 }} pointerEvents="none">
      <Defs><RadialGradient id="seedShadow" cx="50%" cy="50%" rx="50%" ry="50%"><Stop offset="0" stopColor="#000" stopOpacity={0.2} /><Stop offset="1" stopColor="#000" stopOpacity={0} /></RadialGradient></Defs>
      <Ellipse cx={(w + 20) / 2} cy={(h + 12) / 2} rx={(w + 20) / 2} ry={(h + 12) / 2} fill="url(#seedShadow)" />
    </Svg>
  )
}

/** 정지한 씨앗 한 장 */
export function SeedStill({ src, size }: { src: ImageSourcePropType | null; size: number }) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <SeedShadow size={size} />
      {src ? <Image source={src} style={{ width: size, height: size }} fadeDuration={0} /> : null}
    </View>
  )
}

/** 0단계 둥실(3.6초, ±10px · ±2°) */
export function FloatingSeed({ seed, size, reduced }: { seed: number; size: number; reduced: boolean }) {
  const v = useSharedValue(0)
  useEffect(() => {
    if (reduced) { v.value = 0.5; return }
    v.value = 0
    v.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true)
    return () => cancelAnimation(v)
  }, [reduced, v])
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * v.value }, { rotate: `${-2 + 4 * v.value}deg` }] }))
  return <Animated.View style={a}><SeedStill src={seedSrc(seed, 0)} size={size} /></Animated.View>
}

/** 회전 컷 한 장 — 지금 컷일 때만 보인다 */
const TurnFrame = memo(function TurnFrame({ k, src, turn, size }: { k: number; src: ImageSourcePropType; turn: SharedValue<number>; size: number }) {
  const a = useAnimatedStyle(() => ({ opacity: wrapTurn(turn.value) === k ? 1 : 0 }))
  return <Animated.Image source={src} style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, a]} fadeDuration={0} />
})

export type SeedTurnHandle = { pop: () => void; spin: () => void; reset: () => void }
/** 1단계 큰 씨앗: 좌우로 끌면 30°씩 12컷(18px당 한 컷). 화면 읽기에서는 꾸밈(칸 버튼이 대신한다) */
export const SeedTurn = forwardRef<SeedTurnHandle, { seed: number; size: number; reduced: boolean }>(function SeedTurn({ seed, size, reduced }, ref) {
  const turn = useSharedValue(0)
  const start = useSharedValue(0)
  const sc = useSharedValue(1)
  const srcs = useMemo(() => Array.from({ length: SEED_FRAMES }, (_, k) => seedSrc(seed, k)), [seed])
  useImperativeHandle(ref, () => ({
    /** 칸을 눌러 바꿀 때 0.9 → 1.04 → 1 */
    pop: () => {
      if (reduced) return
      sc.value = withSequence(withTiming(0.9, { duration: 1 }), withTiming(1.04, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 230, easing: Easing.out(Easing.quad) }))
    },
    /** 들어오면 한 바퀴 */
    spin: () => {
      if (reduced) return
      turn.value = 0
      turn.value = withTiming(SEED_FRAMES, { duration: INTRO_SPIN_MS, easing: Easing.linear })
    },
    reset: () => { cancelAnimation(turn); turn.value = 0 }
  }), [reduced, sc, turn])
  const pan = useMemo(() => Gesture.Pan().minDistance(4)
    .onBegin(() => { cancelAnimation(turn); start.value = wrapTurn(turn.value) })
    .onUpdate((e) => { turn.value = turnFromDrag(start.value, e.translationX) }), [turn, start])
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }))
  const body = (
    <Animated.View style={[{ width: size, height: size }, pop]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SeedShadow size={size} />
      {srcs.map((src, k) => (src ? <TurnFrame key={k} k={k} src={src} turn={turn} size={size} /> : null))}
    </Animated.View>
  )
  // 움직임 줄이기: 회전은 칸 누르기만
  return reduced ? body : <GestureDetector gesture={pan}>{body}</GestureDetector>
})

/** 2단계 위 작은 씨앗: 문항마다 흔들림이 빨라진다(ms) */
export function WobbleSeed({ seed, size, periodMs, reduced }: { seed: number; size: number; periodMs: number; reduced: boolean }) {
  const r = useSharedValue(0)
  useEffect(() => {
    cancelAnimation(r)
    r.value = 0
    if (reduced) return
    const d = periodMs
    r.value = withRepeat(withSequence(
      withTiming(-7, { duration: d * 0.2, easing: Easing.inOut(Easing.sin) }),
      withTiming(6, { duration: d * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(-3, { duration: d * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: d * 0.3, easing: Easing.inOut(Easing.sin) })
    ), -1, false)
    return () => cancelAnimation(r)
  }, [periodMs, reduced, r])
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }))
  return <Animated.View style={a}><SeedStill src={seedSrc(seed, 0)} size={size} /></Animated.View>
}

// ── 아기(숨쉬기 · 깡충) ──
export type BabyHandle = { hop: () => void }
/** 이름·첫 할 일 단계의 아기: 숨쉬기(3.4초) + 깡충(0.52초). 발밑(아래 10%) 기준 */
export const Baby = forwardRef<BabyHandle, { species: Species; seed: number; size: number; mood?: string; reduced: boolean; breathe?: boolean }>(function Baby({ species, seed, size, mood, reduced, breathe = true }, ref) {
  const b = useSharedValue(0)
  const hy = useSharedValue(0), hx = useSharedValue(1), hs = useSharedValue(1)
  useEffect(() => {
    if (reduced || !breathe) { b.value = 0; return }
    b.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true)
    return () => cancelAnimation(b)
  }, [reduced, breathe, b])
  useImperativeHandle(ref, () => ({
    hop: () => {
      if (reduced) return
      const d = 520, e = Easing.out(Easing.quad)
      hx.value = withSequence(withTiming(1.08, { duration: d * 0.18, easing: e }), withTiming(0.95, { duration: d * 0.27, easing: e }), withTiming(1.06, { duration: d * 0.25, easing: e }), withTiming(1, { duration: d * 0.3, easing: e }))
      hs.value = withSequence(withTiming(0.9, { duration: d * 0.18, easing: e }), withTiming(1.06, { duration: d * 0.27, easing: e }), withTiming(0.94, { duration: d * 0.25, easing: e }), withTiming(1, { duration: d * 0.3, easing: e }))
      hy.value = withSequence(withTiming(0, { duration: d * 0.18 }), withTiming(-22, { duration: d * 0.27, easing: e }), withTiming(0, { duration: d * 0.25, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: d * 0.3 }))
    }
  }), [reduced, hx, hs, hy])
  const a = useAnimatedStyle(() => ({
    transform: [{ translateY: hy.value }, { scaleX: (1 + 0.012 * b.value) * hx.value }, { scaleY: (1 + 0.028 * b.value) * hs.value }]
  }))
  return (
    <Animated.View style={[{ width: size, height: size, transformOrigin: '50% 90%' }, a]}>
      <CharacterArt species={species} stage={1} size={size} mood={mood} seed={seed} wear={null} />
    </Animated.View>
  )
})

// ── 부화 빛 ──
/** 화면 빛 번짐(.flash) — 부르는 쪽이 opacity를 움직인다 */
export function FlashFill({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="makeFlash" cx="50%" cy="52%" rx="75%" ry="60%" fx="50%" fy="52%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="0.6" stopColor="#DCFAEC" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#makeFlash)" />
    </Svg>
  )
}
/** 빛무리(.halo) 360 */
export function HaloFill({ size }: { size: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="makeHalo" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="0.34" stopColor="#FFFAE1" stopOpacity={0.55} />
          <Stop offset="0.68" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={size / 2} cy={size / 2} rx={size / 2} ry={size / 2} fill="url(#makeHalo)" />
    </Svg>
  )
}

/** 축 막대(.axis) */
export function AxisBar({ c, left, right, pct }: { c: MakeColors; left: string; right: string; pct: number }) {
  return (
    <View style={s.axis} accessible accessibilityLabel={`${left} ${pct}%, ${right} ${100 - pct}%`}>
      <Text style={[s.axisText, { color: c.ink }]}>{left}</Text>
      <View style={s.axisBar}><View style={[s.axisFill, { backgroundColor: c.accent, width: `${pct}%` }]} /></View>
      <Text style={[s.axisText, { color: c.ink, opacity: 0.6, textAlign: 'right' }]}>{right}</Text>
    </View>
  )
}

/** 체크 원(.task .cb) */
export function CheckCircle({ c, done }: { c: MakeColors; done: boolean }) {
  return (
    <View style={[s.cb, done ? { backgroundColor: c.accent, borderColor: c.accent, opacity: 1 } : { borderColor: c.ink }]}>
      {done ? <View style={s.tick} /> : null}
    </View>
  )
}

/** 0 → 1 한 번(지연·길이) — 부화 시각표에 쓴다 */
export const once = (to: number, duration: number, delay = 0, easing = Easing.out(Easing.cubic)) => withDelay(delay, withTiming(to, { duration, easing }))

const s = StyleSheet.create({
  btn: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  btnText: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '700', letterSpacing: -0.2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13.5, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 22, height: 4, borderRadius: 2, opacity: 0.2 },
  dotOn: { width: 34, opacity: 0.9 },
  axis: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  axisText: { width: 54, fontSize: 12, fontWeight: '600' },
  axisBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(127,127,127,0.22)', overflow: 'hidden' },
  axisFill: { height: 8, borderRadius: 4 },
  cb: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, opacity: 0.5, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 10, height: 6, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: '#FFFFFF', transform: [{ rotate: '-45deg' }, { translateY: -1 }] }
})
