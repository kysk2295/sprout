// 43 §19 연속 불꽃(휴대폰): 불꽃 그림(공용 FLAME 데이터를 react-native-svg로) + 성장 홈 머리 유리 알약 `N일 연속`.
// 오늘 아직이면 꺼진 불꽃 + `· 오늘 하면 N+1일`. 이정표(3·7·14·30) 축하 = 알약이 톡 커졌다 돌아옴 + 반짝이 5개(UI 스레드 transform·opacity만 — 39 §11).
// 끊겨도 아무 말 없이 `오늘 하면 1일`(43 §19.4).
import { FLAME, streakText, type Streak } from '@sprout/schema/streak'
import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'
import { Glass } from './home/glass'

export const Flame = memo(function Flame({ size = 18, lit }: { size?: number; lit: boolean }) {
  const c = lit ? FLAME.lit : FLAME.unlit
  const o = lit ? 'flLo' : 'flUo', i = lit ? 'flLi' : 'flUi'
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <RadialGradient id={o} cx="0.48" cy="0.72" r="0.62">
          <Stop offset="0" stopColor={c.outer[0]} /><Stop offset="0.55" stopColor={c.outer[1]} /><Stop offset="1" stopColor={c.outer[2]} />
        </RadialGradient>
        <LinearGradient id={i} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={c.inner[0]} /><Stop offset="1" stopColor={c.inner[1]} /></LinearGradient>
      </Defs>
      <Ellipse cx={FLAME.shadow.cx} cy={FLAME.shadow.cy} rx={FLAME.shadow.rx} ry={FLAME.shadow.ry} fill="#0F2316" opacity={c.shadow} />
      <Path d={FLAME.outer} fill={`url(#${o})`} />
      <Path d={FLAME.inner} fill={`url(#${i})`} />
      {c.shine ? <Path d={FLAME.shine} fill="#FFFFFF" opacity={c.shine} /> : null}
    </Svg>
  )
})

export type StreakPillHandle = { cheer: () => void }
const SPARKS = 5

/** 성장 홈 머리 알약(49 §6.0) */
export const StreakPill = memo(forwardRef<StreakPillHandle, { streak: Streak; dark: boolean; ink: string; reduced: boolean }>(function StreakPill({ streak, dark, ink, reduced }, ref) {
  const tx = streakText(streak)
  const pop = useSharedValue(1)
  const sp = useSharedValue(0)
  const [sparks, setSparks] = useState(0)
  useImperativeHandle(ref, () => ({
    cheer: () => {
      if (reduced) return
      pop.value = withSequence(withTiming(1.16, { duration: 160, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 9, stiffness: 220 }))
      sp.value = 0
      sp.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) })
      setSparks((n) => n + 1)
    }
  }), [reduced, pop, sp])
  useEffect(() => {
    if (!sparks) return
    const t = setTimeout(() => setSparks(0), 950)
    return () => clearTimeout(t)
  }, [sparks])
  const popSt = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  return (
    <Animated.View style={popSt} accessible accessibilityRole="text" accessibilityLabel={tx.a11y}>
      <Glass dark={dark} radius={16} style={s.pill}>
        <View style={s.row}>
          <Flame size={18} lit={streak.today} />
          <Text style={[s.main, { color: ink }]} numberOfLines={1}>{tx.main}</Text>
          {tx.sub ? <Text style={[s.sub, { color: ink }]} numberOfLines={1}>· {tx.sub}</Text> : null}
        </View>
      </Glass>
      {sparks ? (
        <View style={s.fx} pointerEvents="none">
          {Array.from({ length: SPARKS }, (_, k) => <Spark key={`${sparks}-${k}`} i={k} p={sp} />)}
        </View>
      ) : null}
    </Animated.View>
  )
}))

/** 반짝이 하나: 불꽃 위에서 부채꼴로 퍼지며 옅어진다 */
function Spark({ i, p }: { i: number; p: SharedValue<number> }) {
  const a = -Math.PI / 2 + (i - (SPARKS - 1) / 2) * 0.55
  const r = 20 + (i % 2) * 8
  const st = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 : 1 - (p.value - 0.15) / 0.85,
    transform: [{ translateX: Math.cos(a) * r * p.value }, { translateY: Math.sin(a) * r * p.value }, { scale: 0.6 + 0.6 * (1 - p.value) }]
  }))
  return <Animated.View style={[s.spark, { backgroundColor: i % 2 ? '#FFD36B' : '#FF9A45' }, st]} />
}

const s = StyleSheet.create({
  pill: { height: 32, paddingLeft: 9, paddingRight: 12, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  main: { fontSize: 13, fontWeight: '800' },
  sub: { fontSize: 12, fontWeight: '600', opacity: 0.62, flexShrink: 1 },
  fx: { position: 'absolute', left: 18, top: 10, width: 0, height: 0 },
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: 3, marginLeft: -2.5, marginTop: -2.5 }
})
