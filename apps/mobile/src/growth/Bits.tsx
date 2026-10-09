// 성장 화면 공용 조각: 색종이 · 하트 · 종 조각(43 진화·레벨업) · 떠오르는 칩. 움직임 줄이기면 부르는 쪽이 그리지 않는다.
import { bitSvg, HEART_SVG } from '@sprout/schema/characterArt'
import type { Species } from '@sprout/schema/growth'
import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { SvgString } from './art/CharacterArt'

const CONFETTI = ['#FFD166', '#FF8FA3', '#7BD389', '#7CA7FF', '#C49BFF']

/** 색종이 한 번(1.2초). top만이면 위쪽으로만 흩어진다(B4) */
export function Confetti({ count = 18, spread = 120, top = false }: { count?: number; spread?: number; top?: boolean }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = top ? Math.PI + (Math.PI * i) / Math.max(1, count - 1) : (Math.PI * 2 * i) / count + Math.random() * 0.4
    const d = spread * (0.5 + Math.random() * 0.5)
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, r: Math.random() * 360, c: CONFETTI[i % 5], w: 6 + (i % 3) * 2 }
  }), [count, spread, top])
  return <View pointerEvents="none" style={s.center}>{bits.map((b, i) => <Bit key={i} {...b} />)}</View>
}
function Bit({ x, y, r, c, w }: { x: number; y: number; r: number; c: string; w: number }) {
  const t = useSharedValue(0)
  useEffect(() => { t.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }) }, [t])
  const st = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [{ translateX: x * t.value }, { translateY: y * t.value + 60 * t.value * t.value }, { rotate: `${r * t.value}deg` }]
  }))
  return <Animated.View style={[{ position: 'absolute', width: w, height: w * 0.6, borderRadius: 1.5, backgroundColor: c }, st]} />
}

/** 하트가 떠오르며 사라짐(1.1초) — 43 쓰다듬기·누르기 */
export function Heart({ dx }: { dx: number; color?: string }) {
  const t = useSharedValue(0)
  useEffect(() => { t.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }) }, [t])
  const st = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ translateX: dx * t.value }, { translateY: -70 * t.value }, { scale: 0.6 + 0.5 * t.value }] }))
  return (
    <Animated.View pointerEvents="none" style={[s.heart, st]}>
      <SvgString svg={HEART_SVG} size={18} />
    </Animated.View>
  )
}

/** 종 조각이 사방으로(42 §4.2 · §10.6): 달팽이 꽃잎 · 꿀벌 꿀방울 · 애벌레 잎 · 올챙이 물방울(위로 떠오름) */
export function SpeciesBurst({ species, count = 10, dist = 90, big, delay = 0 }: { species: Species; count?: number; dist?: number; big?: boolean; delay?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.2 : -0.1)
    const r = dist * (0.7 + (i % 3) * 0.17)
    const fall = species === 'frog' ? -30 : species === 'bee' ? 30 : 18
    return { i, x: Math.cos(a) * r, y: Math.sin(a) * r + fall, rot: i * 70, svg: bitSvg(species, i, true) }
  }), [species, count, dist])
  return <View pointerEvents="none" style={s.center}>{bits.map((b) => <SpeciesBit key={b.i} {...b} size={big ? 16 : 12} delay={delay} ms={big ? 1100 : 780} />)}</View>
}
function SpeciesBit({ x, y, rot, svg, size, delay, ms }: { x: number; y: number; rot: number; svg: string; size: number; delay: number; ms: number }) {
  const t = useSharedValue(0)
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: ms, easing: Easing.bezier(0.2, 0.8, 0.4, 1) })) }, [t, delay, ms])
  const st = useAnimatedStyle(() => ({
    opacity: t.value < 0.12 ? t.value / 0.12 : t.value < 0.55 ? 1 : 1 - (t.value - 0.55) / 0.45,
    transform: [{ translateX: x * t.value }, { translateY: y * t.value }, { scale: 0.4 + 0.6 * Math.min(1, t.value * 2) }, { rotate: `${rot * t.value}deg` }]
  }))
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }, st]}><SvgString svg={svg} size={size} /></Animated.View>
}

/** 떠오르는 칩(`+1 XP` · `Lv 9` · `Z`) */
export function FloatChip({ text, kind, dx = 0, reduced }: { text: string; kind: 'xp' | 'lv' | 'z'; dx?: number; reduced?: boolean }) {
  const t = useSharedValue(0)
  useEffect(() => { t.value = withTiming(1, { duration: kind === 'xp' ? 900 : 1600, easing: Easing.out(Easing.quad) }) }, [t, kind])
  const st = useAnimatedStyle(() => ({
    opacity: t.value < 0.2 ? t.value * 5 : t.value > 0.7 ? 1 - (t.value - 0.7) / 0.3 : 1,
    transform: [{ translateX: dx }, { translateY: reduced ? 0 : -30 * t.value }]
  }))
  const box = kind === 'xp' ? s.xp : kind === 'lv' ? s.lv : s.z
  const txt = kind === 'xp' ? s.xpT : kind === 'lv' ? s.lvT : s.zT
  return <Animated.View pointerEvents="none" style={[box, st]}><Text style={txt}>{text}</Text></Animated.View>
}

const s = StyleSheet.create({
  center: { position: 'absolute', left: '50%', top: '45%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  heart: { position: 'absolute', marginLeft: -9 },
  xp: { position: 'absolute', backgroundColor: '#22A45D', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, shadowColor: '#22A45D', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  xpT: { color: '#fff', fontSize: 15, fontWeight: '800' },
  lv: { position: 'absolute', backgroundColor: '#FFD45C', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  lvT: { color: '#16201A', fontSize: 14, fontWeight: '800' },
  z: { position: 'absolute' },
  zT: { color: '#fff', fontSize: 16, fontWeight: '800', opacity: 0.9 }
})
