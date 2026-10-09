// 40 캐릭터 동행 — 자리 체계(S·M·L)의 캐릭터 한 마리. 몸 움직임은 그림이 아니라 transform(UI 스레드, Reanimated 공유 값).
// 반복: breathe(L만, scaleY 1→1.02 3.2초) · think(rotate ±3° 1.4초) · wiggle(알, 4초마다 ±4·±3·±2°) / 한 번: hop(−6, 340ms) · tilt(−8°, 420ms).
// 움직임 줄이기(OS · 성장 ⋯)면 transform 없이 얼굴만, 말풍선·+1은 페이드만. 화면이 포커스를 잃거나 앱이 뒤로 가면 반복을 멈춘다.
// 한 화면에 움직이는 캐릭터는 하나 — 대화의 지난 답은 StaticFace(메모된 정지 그림)를 쓴다. 새 스프링 값 없음(withTiming만).
import type { Species } from '@sprout/schema/growth'
import type { CompanionMove } from '@sprout/schema/companion'
import { useIsFocused } from 'expo-router'
import { memo, useEffect, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { CharacterArt } from '../growth/art/CharacterArt'
import type { Mood } from '../growth/logic'
import { useMotionReduced } from '../growth/motion'
import { usePalette } from '../theme/ThemeProvider'

export type CompanionLoop = 'breathe' | 'think' | 'wiggle' | null
const ORIGIN = '50% 92%' // 발밑 기준(40 §7)
const ease = Easing.inOut(Easing.ease)

/** 앱이 앞에 있고 화면이 포커스일 때만 반복 움직임 */
function useActive() {
  const focused = useIsFocused()
  const [app, setApp] = useState(AppState.currentState === 'active')
  useEffect(() => { const sub = AppState.addEventListener('change', (s) => setApp(s === 'active')); return () => sub.remove() }, [])
  return focused && app
}

/** 49 §8.1: 원 안 작은 얼굴(30·36·72)은 crop='bust'(머리 쪽 자르기) — 40pt 이하는 CharacterArt가 저절로 bust */
type FaceCrop = 'bust' | 'full'

export function CompanionFace({ species, stage, size, mood = 'smile', loop = null, play, dim, onPress, label, crop, style }: {
  species: Species | null; stage: number; size: number; mood?: Mood; loop?: CompanionLoop; crop?: FaceCrop
  /** n이 바뀔 때마다 한 번 움직임 */
  play?: { move: CompanionMove; n: number }
  dim?: boolean; onPress?: () => void; label?: string; style?: StyleProp<ViewStyle>
}) {
  const reduced = useMotionReduced()
  const active = useActive()
  const sy = useSharedValue(1)
  const rotLoop = useSharedValue(0)
  const rotOnce = useSharedValue(0)
  const ty = useSharedValue(0)
  useEffect(() => {
    const stop = () => { cancelAnimation(sy); cancelAnimation(rotLoop); sy.value = 1; rotLoop.value = 0 }
    stop()
    if (reduced || !active || !loop) return stop
    if (loop === 'breathe') sy.value = withRepeat(withSequence(withTiming(1.02, { duration: 1600, easing: ease }), withTiming(1, { duration: 1600, easing: ease })), -1)
    else if (loop === 'think') {
      rotLoop.value = withSequence(withTiming(-3, { duration: 350, easing: ease }), withRepeat(withSequence(withTiming(3, { duration: 700, easing: ease }), withTiming(-3, { duration: 700, easing: ease })), -1))
    } else if (loop === 'wiggle') {
      const t = (v: number) => withTiming(v, { duration: 80 })
      rotLoop.value = withRepeat(withSequence(withDelay(3600, t(-4)), t(4), t(-3), t(2), t(0)), -1)
    }
    return stop
  }, [loop, reduced, active, sy, rotLoop])
  useEffect(() => {
    if (!play?.n || reduced || !play.move) return
    if (play.move === 'hop') ty.value = withSequence(withTiming(-6, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 190, easing: Easing.in(Easing.quad) }))
    else rotOnce.value = withSequence(withTiming(-8, { duration: 170, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 250, easing: Easing.inOut(Easing.quad) }))
  }, [play?.n, play?.move, reduced, ty, rotOnce])
  useEffect(() => () => { cancelAnimation(sy); cancelAnimation(rotLoop); cancelAnimation(rotOnce); cancelAnimation(ty) }, [sy, rotLoop, rotOnce, ty])
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }, { rotate: `${rotLoop.value + rotOnce.value}deg` }, { scaleY: sy.value }] }))
  const art = (
    <Animated.View style={[{ width: size, height: size, transformOrigin: ORIGIN }, dim && { opacity: 0.55 }, st]}>
      <CharacterArt species={species} stage={stage} size={size} mood={mood} crop={crop} />
    </Animated.View>
  )
  if (!onPress) return <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{art}</View>
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={style}>{art}</Pressable>
}

/** 지난 답의 얼굴 — 그 답의 얼굴로 멈춘 그림(움직임·공유 값 없음) */
export const StaticFace = memo(function StaticFace({ species, stage, size, mood = 'smile', dim, crop }: { species: Species | null; stage: number; size: number; mood?: Mood; dim?: boolean; crop?: FaceCrop }) {
  return (
    <View style={[{ width: size, height: size }, dim && { opacity: 0.55 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <CharacterArt species={species} stage={stage} size={size} mood={mood} crop={crop} />
    </View>
  )
})

/** 말풍선 한 줄(2.6초, opacity만 — 줄이기 설정이어도 같다) */
export function SayBubble({ text, n, style }: { text: string; n: number; style?: StyleProp<ViewStyle> }) {
  const p = usePalette()
  const o = useSharedValue(0)
  useEffect(() => {
    if (!n) return
    o.value = 0
    o.value = withSequence(withTiming(1, { duration: 200 }), withDelay(2080, withTiming(0, { duration: 320 })))
    return () => cancelAnimation(o)
  }, [n, o])
  const st = useAnimatedStyle(() => ({ opacity: o.value }))
  if (!n) return null
  return (
    <Animated.View pointerEvents="none" style={[s.bubble, { backgroundColor: p.bgPopover, borderColor: p.borderPopover }, st, style]}>
      <Text accessibilityLiveRegion="polite" style={{ color: p.textPrimary, fontSize: 13.5, lineHeight: 18 }}>{text}</Text>
    </Animated.View>
  )
}

/** XP +1 (0.9초 위로 + 옅어짐, 줄이기면 제자리 페이드) */
export function XpPop({ n, style }: { n: number; style?: StyleProp<ViewStyle> }) {
  const p = usePalette()
  const reduced = useMotionReduced()
  const o = useSharedValue(0)
  const y = useSharedValue(0)
  useEffect(() => {
    if (!n) return
    o.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 720 }))
    y.value = reduced ? 0 : 4
    if (!reduced) y.value = withTiming(-14, { duration: 900, easing: Easing.out(Easing.quad) })
    return () => { cancelAnimation(o); cancelAnimation(y) }
  }, [n, reduced, o, y])
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }))
  if (!n) return null
  return <Animated.Text pointerEvents="none" style={[s.xp, { color: p.accent }, st, style]} accessibilityLiveRegion="polite">+1</Animated.Text>
}

const s = StyleSheet.create({
  bubble: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, borderBottomLeftRadius: 4, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 240, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  xp: { position: 'absolute', fontSize: 12, lineHeight: 15, fontWeight: '600' }
})
