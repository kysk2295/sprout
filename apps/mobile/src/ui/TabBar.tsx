// 떠 있는 탭 알약(20 §2 [틱틱 iOS 26]): 좌우 20, 화면 바닥 위 16, 높이 58 [영상 실측], 고른 탭 뒤 미끄러지는 알약, 아이콘만(접근성 라벨은 붙임).
// 2026-10-05 5칸: 할 일 · 캘린더(오늘 날짜 숫자) · 수집함 · 성장 · 더보기. 설정은 더보기 안 화면이라 설정에 있으면 더보기가 켜진다.
// 선택 = 강조색. 탭을 다시 누르면 맨 위로(목록이 useScrollToTop). 완료로 XP가 들어오면 성장 아이콘 위 "+1"(21 §3, 0.9초).
// 49 §6: 성장 탭에서만 장면 위 유리 — 더 비치는 면(sceneGlass) + 장면 밝기에 맞춘 글자색(어두운 장면 = 짙은 유리 + 흰 아이콘). 다른 탭은 지금 막대 그대로.
import type { BottomTabBarProps } from 'expo-router/tabs'
import { BlurView } from 'expo-blur'
import { CircleEllipsis, Layers, Settings, SquareCheckBig, Sprout } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeOut, SlideInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { SPRING, useReducedMotion } from './motion'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { xpGained } from '../data/events'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { tabBarBottom } from './tabBarSpace'
import { useCharacterWear } from '../growth/art/CharacterArt'
import { sceneTone, myScene } from '../growth/home/glass'
import { sceneDark } from '@sprout/schema/characterArt'

type IconT = typeof Settings
/** 캘린더 탭 아이콘: 둥근 사각 안 오늘 날짜 숫자(시안 .date-ic) — 선택이면 채움 */
function DateIcon({ color, size, strokeWidth }: { color: string; size: number; strokeWidth: number }) {
  const on = strokeWidth > 2
  const p = usePalette()
  return (
    <View style={{ width: size - 3, height: size - 3, borderRadius: 6, borderWidth: 2, borderColor: color, backgroundColor: on ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', color: on ? (p.dark ? p.bgGround : '#fff') : color }}>{new Date().getDate()}</Text>
    </View>
  )
}
const TABS: Record<string, { label: string; Icon: IconT | typeof DateIcon }> = {
  index: { label: '할 일', Icon: SquareCheckBig },
  calendar: { label: '캘린더', Icon: DateIcon },
  collect: { label: '수집함', Icon: Layers },
  'collect/index': { label: '수집함', Icon: Layers },
  growth: { label: '성장', Icon: Sprout },
  more: { label: '더보기', Icon: CircleEllipsis }
}
/** 탭 바에 없는 화면이 어느 칸을 켜나 */
const OWNER: Record<string, string> = { settings: 'more' }

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const [xp, setXp] = useState<{ n: number; k: number } | null>(null)
  useEffect(() => xpGained.on((n) => setXp({ n, k: Date.now() })), [])
  useEffect(() => {
    if (!xp) return
    const t = setTimeout(() => setXp(null), 900)
    return () => clearTimeout(t)
  }, [xp])
  // 39 §4.13 [영상 실측]: 고른 탭 뒤 둥근 알약이 옆 칸으로 미끄러진다
  const visible = state.routes.filter((r) => TABS[r.name])
  const cur = state.routes[state.index]?.name
  const sel = Math.max(0, visible.findIndex((r) => r.name === cur || OWNER[cur] === r.name))
  const reduce = useReducedMotion()
  const [barW, setBarW] = useState(0)
  const tabW = barW > 0 ? (barW - 12) / Math.max(1, visible.length) : 0
  const px = useSharedValue(0)
  useEffect(() => { px.value = reduce || !tabW ? sel * tabW : withSpring(sel * tabW, SPRING.snappy) }, [sel, tabW, reduce, px])
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: px.value }] }))
  // 성장 탭: 장면 위 유리(49 §6) — 내 배경 장면의 밝기를 따른다
  const wear = useCharacterWear()
  const sceneKey = cur === 'growth' ? myScene(wear?.wear.eq?.bg, p.dark) : null
  const tone = sceneKey ? sceneTone(sceneKey) : null
  const sceneDarkTone = sceneKey ? sceneDark(sceneKey) : p.dark
  return (
    <View onLayout={(e) => setBarW(e.nativeEvent.layout.width)} style={[s.bar, { bottom: tabBarBottom(insets.bottom), borderColor: tone ? tone.line : p.glassLine, shadowOpacity: tone ? 0.12 : p.dark ? 0.5 : 0.1 }]}>
      {Platform.OS === 'ios' ? <BlurView intensity={tone ? 24 : 30} tint={sceneDarkTone ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, s.round]} /> : null}
      <View style={[StyleSheet.absoluteFill, s.round, { backgroundColor: tone ? tone.bg : Platform.OS === 'ios' ? p.glass : p.cardBg }]} />
      {tabW ? <Animated.View pointerEvents="none" style={[s.pill, { width: tabW - 4, backgroundColor: tone ? tone.did : p.bgSelected }, pill]} /> : null}
      {state.routes.map((route, i) => {
        const tab = TABS[route.name]
        if (!tab) return null
        const cur = state.routes[state.index]?.name
        const focused = state.index === i || OWNER[cur] === route.name
        const color = tone ? (focused ? tone.ink : tone.sub) : focused ? p.tabOn : p.tabIcon
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (state.index !== i && !e.defaultPrevented) navigation.navigate(route.name, route.params)
        }
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: focused }} onPress={onPress} style={s.tab}>
            <tab.Icon size={25} color={color} strokeWidth={focused ? 2.3 : 1.9} />
            {route.name === 'growth' && xp ? (
              <Animated.Text key={xp.k} entering={SlideInDown.duration(350)} exiting={FadeOut.duration(250)} style={[s.xp, { color: p.accentInk }]}>+{xp.n}</Animated.Text>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}
const s = StyleSheet.create({
  bar: { position: 'absolute', left: M.tabInset, right: M.tabInset, height: M.tabH, borderRadius: 30, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
  round: { borderRadius: 30, overflow: 'hidden' },
  tab: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', left: 8, top: 6, bottom: 6, borderRadius: 23 },
  xp: { position: 'absolute', top: 2, left: '50%', marginLeft: 8, fontSize: 11, fontWeight: '700' }
})
