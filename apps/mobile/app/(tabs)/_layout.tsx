// 탭 5칸(2026-10-05 사용자 결정 — 모바일 v1 = 데스크톱 기능 전부, 20 §0 D4 개정):
// 할 일(오늘 + 서랍) · 캘린더 · 성장 · 수집함 · 더보기(2026-10-10 성장 ↔ 수집함 — 20 머리). 설정은 더보기 안 화면(탭 바에 없음, 켜지면 더보기 칸이 켜진다).
// 탭 바는 떠 있는 유리 알약, 서랍은 탭 바까지 덮는다. 뒤로 = 지난 탭(설정 → 더보기).
import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { useIsFocused } from 'expo-router'
import { useEffect, type ReactNode } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { TasksViewProvider } from '../../src/state/tasksView'
import { usePalette } from '../../src/theme/ThemeProvider'
import { Drawer, drawerP, drawerW } from '../../src/ui/Drawer'
import { DUR, timing, useReducedMotion } from '../../src/ui/motion'
import { FloatingTabBar } from '../../src/ui/TabBar'

export default function TabsLayout() {
  const p = usePalette()
  const reduce = useReducedMotion()
  // 39 §4.7 [영상 실측]: 서랍이 열리면 탭 화면 전체가 판과 같이 오른쪽으로 밀린다(동작 줄이기면 그대로)
  const push = useAnimatedStyle(() => ({ transform: [{ translateX: reduce ? 0 : drawerP.value * drawerW.value }] }), [reduce])
  return (
    <TasksViewProvider>
      <View style={{ flex: 1, backgroundColor: p.pageBg }}>
        <Animated.View style={[{ flex: 1 }, push]}>
        {/* 39 §4.13 [영상 실측]: 탭 내용은 약 90ms에 옅게 나타나며 바뀐다 */}
        {/* 2026-10-06 성능 점검(39 §11): 내비게이터 'fade'는 다시 연 탭(캘린더)이 하얗게 빈 채 남는 문제가 있어(시뮬레이터 재현) 끄고, 들어오는 탭만 UI 스레드에서 옅게 나타나게 한다 */}
        <Tabs backBehavior="history" tabBar={(props) => <FloatingTabBar {...props} />} screenLayout={reduce ? undefined : ({ children }) => <TabFade>{children}</TabFade>} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.pageBg }, animation: 'none' }}>
          <Tabs.Screen name="index" options={{ title: '할 일' }} />
          <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
          <Tabs.Screen name="growth" options={{ title: '성장' }} />
          <Tabs.Screen name="collect" options={{ title: '수집함' }} />
          <Tabs.Screen name="more" options={{ title: '더보기' }} />
          <Tabs.Screen name="settings" options={{ title: '설정', href: null }} />
        </Tabs>
        </Animated.View>
        <Drawer />
      </View>
    </TasksViewProvider>
  )
}

/** 들어오는 탭: 0 → 1을 DUR.tab(90ms)에(transform·opacity만 — 39 §11) */
function TabFade({ children }: { children: ReactNode }) {
  const focused = useIsFocused()
  const o = useSharedValue(1)
  useEffect(() => {
    if (!focused) return
    o.value = 0
    o.value = withTiming(1, timing(DUR.tab))
  }, [focused, o])
  const st = useAnimatedStyle(() => ({ opacity: o.value }))
  return <Animated.View style={[{ flex: 1 }, st]}>{children}</Animated.View>
}
