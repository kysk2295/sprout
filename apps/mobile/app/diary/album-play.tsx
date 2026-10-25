// 28 §10.4 P3 이번 달 앨범 넘겨 보기: 3초마다 다음 장(위 진행 줄), 왼쪽·오른쪽 반 누르면 앞뒤, 누르고 있으면 멈춤.
// 다음 장은 오른쪽에서 4% 밀리며 교차(§10.5). 움직임 줄이기면 자동 넘김 끔(좌우로만).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { cancelAnimation, Easing, FadeIn, SlideInRight, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { SceneCardView } from '../../src/diary/SceneCard'
import { useMonthScenes } from '../../src/diary/sceneData'
import { openDay } from '../../src/diary/state'
import { useMotionReduced } from '../../src/growth/motion'
import { dayKey } from '../../src/lib/dates'

const STEP = 3000

export default function AlbumPlay() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useMotionReduced()
  const { month: param } = useLocalSearchParams<{ month?: string }>()
  const month = param ?? dayKey().slice(0, 7)
  const scenes = useMonthScenes(month)
  const days = useMemo(() => [...scenes.keys()].sort(), [scenes])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const prog = useSharedValue(0)
  const iRef = useRef(0)
  iRef.current = i
  const next = (d: 1 | -1) => setI((x) => { const n = x + d; if (n >= days.length) { router.back(); return x } return Math.max(0, n) })
  useEffect(() => {
    cancelAnimation(prog)
    prog.value = 0
    if (reduced || paused || !days.length) return
    prog.value = withTiming(1, { duration: STEP, easing: Easing.linear }, (done) => { if (done) scheduleOnRN(next, 1) })
  }, [i, paused, reduced, days.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const bar = useAnimatedStyle(() => ({ width: `${prog.value * 100}%` }))
  const d = days[i]
  const card = d ? scenes.get(d) : null
  return (
    <View style={{ flex: 1, backgroundColor: '#0d0f14' }}>
      <StatusBar style="light" />
      <View style={[s.bars, { marginTop: insets.top + 8 }]}>
        {days.map((x, k) => (
          <View key={x} style={s.track}>{k < i ? <View style={[s.fill, { width: '100%' }]} /> : k === i ? <Animated.View style={[s.fill, bar]} /> : null}</View>
        ))}
      </View>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} hitSlop={12}><Text style={s.x}>✕</Text></Pressable>
        <Text style={s.h}>{Number(month.slice(5))}월 · {days.length}장</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={paused ? '계속' : '멈춤'} onPress={() => setPaused((v) => !v)} hitSlop={12}><Text style={s.x}>{paused ? '▶' : '⏸'}</Text></Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, justifyContent: 'center' }}>
        {card ? (
          <Animated.View key={card.date} entering={reduced ? FadeIn.duration(150) : SlideInRight.duration(320).withInitialValues({ originX: 16 })}>
            <SceneCardView card={card} variant="hero" appear={false} reduced={reduced} />
          </Animated.View>
        ) : <Text style={{ color: '#fff8', textAlign: 'center' }}>이 달은 아직 장면이 없어요</Text>}
        {/* 왼쪽 반 = 앞 장, 오른쪽 반 = 다음 장, 누르고 있으면 멈춤 */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Pressable style={{ flex: 1 }} accessibilityLabel="앞 장" onPress={() => next(-1)} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={250} />
            <Pressable style={{ flex: 1 }} accessibilityLabel="다음 장" onPress={() => next(1)} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={250} />
          </View>
        </View>
      </View>
      <View style={[s.acts, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable accessibilityRole="button" disabled={!d} onPress={() => { if (d) { openDay(d); router.dismissTo('/diary') } }} style={s.btn}><Text style={s.btnText}>이 날 일기 열기</Text></Pressable>
      </View>
    </View>
  )
}
const s = StyleSheet.create({
  bars: { flexDirection: 'row', gap: 3, paddingHorizontal: 10 },
  track: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#fff' },
  top: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  x: { color: '#fff', fontSize: 18, fontWeight: '700' },
  h: { color: '#fff', fontSize: 14, fontWeight: '700' },
  acts: { paddingHorizontal: 16, paddingTop: 10 },
  btn: { height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' }
})
