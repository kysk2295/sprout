// 성장 화면 공용 조각: 색종이 · 하트 · XP 방울 · 밥그릇 그림. 움직임 줄이기면 부르는 쪽이 그리지 않는다.
import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'
import { XP } from '@sprout/schema/growth'

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

/** 하트가 떠오르며 사라짐(1.1초) */
export function Heart({ dx, color = '#ff6b8a' }: { dx: number; color?: string }) {
  const t = useSharedValue(0)
  useEffect(() => { t.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }) }, [t])
  const st = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ translateX: dx * t.value }, { translateY: -70 * t.value }, { scale: 0.6 + 0.5 * t.value }] }))
  return (
    <Animated.View pointerEvents="none" style={[s.heart, st]}>
      <Svg width={22} height={22} viewBox="0 0 24 24"><Path fill={color} d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z" /></Svg>
    </Animated.View>
  )
}

export type Pt = { x: number; y: number }
/** XP 방울: from → (via) → to 포물선. 닿는 시각은 부르는 쪽이 delay+duration으로 안다 */
export const ORB_MS = { via: 950, direct: 750 }
export function Orb({ from, via, to, label, big, delay, accent }: { from: Pt; via: Pt | null; to: Pt; label: string; big: boolean; delay: number; accent: string }) {
  const t = useSharedValue(0)
  const dur = via ? ORB_MS.via : ORB_MS.direct
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: dur, easing: Easing.bezier(0.4, 0, 0.6, 1) })) }, [t, delay, dur])
  const size = big ? 34 : 22
  const st = useAnimatedStyle(() => {
    'worklet'
    const q = (a: Pt, b: Pt, lift: number, u: number) => {
      const cx = (a.x + b.x) / 2
      const cy = Math.min(a.y, b.y) - lift
      const k = 1 - u
      return { x: k * k * a.x + 2 * k * u * cx + u * u * b.x, y: k * k * a.y + 2 * k * u * cy + u * u * b.y }
    }
    const v = t.value
    let p: Pt
    if (via) p = v < 0.55 ? q(from, via, 60, v / 0.55) : q(via, to, 50, (v - 0.55) / 0.45)
    else p = q(from, to, 50, v)
    const sc = v < 0.1 ? 0.4 + v * 6 : v > 0.9 ? 1 - (v - 0.9) * 7 : 1
    return { opacity: v <= 0 ? 0 : v > 0.95 ? 0.2 : 1, transform: [{ translateX: p.x - size / 2 }, { translateY: p.y - size / 2 }, { scale: sc }] }
  })
  return (
    <Animated.View pointerEvents="none" style={[s.orb, { width: size, height: size, borderRadius: size / 2, backgroundColor: accent, borderColor: big ? '#f4c542' : 'rgba(255,255,255,0.8)', borderWidth: big ? 3 : 1.5 }, st]}>
      <Text style={[s.orbText, big && { fontSize: 11 }]}>{label}</Text>
    </Animated.View>
  )
}

/** 밥그릇: 오늘 할 일 XP 10칸(10 §3.2.2) */
export function BowlArt({ n, width = 64, accent }: { n: number; width?: number; accent: string }) {
  return (
    <Svg width={width} height={(width * 52) / 84} viewBox="0 0 84 52">
      <Ellipse cx={42} cy={48} rx={34} ry={4} fill="rgba(0,0,0,.12)" />
      {Array.from({ length: XP.taskDailyCap }, (_, i) => (
        <Circle key={i} cx={18 + (i % 5) * 12} cy={i < 5 ? 18 : 10} r={5.5} fill={i < n ? '#c98e5b' : 'rgba(0,0,0,0)'} stroke={i < n ? '#a8703f' : 'rgba(0,0,0,0)'} />
      ))}
      <Path d="M6 20 h72 a36 26 0 0 1 -72 0z" fill="#f2e6d8" stroke="#e0cfba" strokeWidth={2} />
      <Path d="M14 30 h56" stroke={accent} strokeWidth={2} opacity={0.5} />
    </Svg>
  )
}

const s = StyleSheet.create({
  center: { position: 'absolute', left: '50%', top: '40%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  heart: { position: 'absolute' },
  orb: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  orbText: { color: '#fff', fontSize: 10, fontWeight: '800' }
})
