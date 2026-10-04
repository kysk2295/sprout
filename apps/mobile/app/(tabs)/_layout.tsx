// 탭 3개: 할 일(오늘 + 서랍) · 성장 · 설정(20 D4 확정). 탭 바는 떠 있는 유리 알약, 서랍은 탭 바까지 덮는다.
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
        <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.pageBg } }}>
          <Tabs.Screen name="index" options={{ title: '할 일' }} />
          <Tabs.Screen name="growth" options={{ title: '성장' }} />
          <Tabs.Screen name="settings" options={{ title: '설정' }} />
        </Tabs>
        <Drawer />
      </View>
    </TasksViewProvider>
  )
}
