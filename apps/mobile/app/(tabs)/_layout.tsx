// 탭 5칸(2026-10-05 사용자 결정 — 모바일 v1 = 데스크톱 기능 전부, 20 §0 D4 개정):
// 할 일(오늘 + 서랍) · 캘린더 · 수집함 · 성장 · 더보기. 설정은 더보기 안 화면(탭 바에 없음, 켜지면 더보기 칸이 켜진다).
// 탭 바는 떠 있는 유리 알약, 서랍은 탭 바까지 덮는다. 뒤로 = 지난 탭(설정 → 더보기).
import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { TasksViewProvider } from '../../src/state/tasksView'
import { usePalette } from '../../src/theme/ThemeProvider'
import { Drawer } from '../../src/ui/Drawer'
import { FloatingTabBar } from '../../src/ui/TabBar'

export default function TabsLayout() {
  const p = usePalette()
  return (
    <TasksViewProvider>
      <View style={{ flex: 1, backgroundColor: p.pageBg }}>
        <Tabs backBehavior="history" tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.pageBg } }}>
          <Tabs.Screen name="index" options={{ title: '할 일' }} />
          <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
          <Tabs.Screen name="collect" options={{ title: '수집함' }} />
          <Tabs.Screen name="growth" options={{ title: '성장' }} />
          <Tabs.Screen name="more" options={{ title: '더보기' }} />
          <Tabs.Screen name="settings" options={{ title: '설정', href: null }} />
        </Tabs>
        <Drawer />
      </View>
    </TasksViewProvider>
  )
}
