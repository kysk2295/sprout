// 떠 있는 탭 알약(20 §2 [틱틱 iOS 26]): 좌우 16, 홈 표시줄 위 22, 높이 58, 아이콘만(접근성 라벨은 붙임).
// 선택 = 강조색. 탭을 다시 누르면 맨 위로(목록이 useScrollToTop). 완료로 XP가 들어오면 성장 아이콘 위 "+1"(21 §3, 0.9초).
import type { BottomTabBarProps } from 'expo-router/tabs'
import { BlurView } from 'expo-blur'
import { Settings, SquareCheckBig, Sprout } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { xpGained } from '../data/events'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { tabBarBottom } from './Toast'

const TABS: Record<string, { label: string; Icon: typeof Settings }> = {
  index: { label: '할 일', Icon: SquareCheckBig },
  growth: { label: '성장', Icon: Sprout },
  settings: { label: '설정', Icon: Settings }
}

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
  return (
    <View style={[s.bar, { bottom: tabBarBottom(insets.bottom), borderColor: p.glassLine, shadowOpacity: p.dark ? 0.5 : 0.1 }]}>
      {Platform.OS === 'ios' ? <BlurView intensity={30} tint={p.dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, s.round]} /> : null}
      <View style={[StyleSheet.absoluteFill, s.round, { backgroundColor: Platform.OS === 'ios' ? p.glass : p.cardBg }]} />
      {state.routes.map((route, i) => {
        const tab = TABS[route.name]
        if (!tab) return null
        const focused = state.index === i
        const color = focused ? p.tabOn : p.tabIcon
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params)
        }
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: focused }} onPress={onPress} style={s.tab}>
            <tab.Icon size={25} color={color} strokeWidth={focused ? 2.3 : 1.9} />
            {route.name === 'growth' && xp ? (
              <Animated.Text key={xp.k} entering={SlideInDown.duration(350)} exiting={FadeOut.duration(250)} style={[s.xp, { color: p.accent }]}>+{xp.n}</Animated.Text>
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
  xp: { position: 'absolute', top: 2, left: '50%', marginLeft: 8, fontSize: 11, fontWeight: '700' }
})
