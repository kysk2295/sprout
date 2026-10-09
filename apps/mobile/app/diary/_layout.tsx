// 일기(28 §8): 오늘 대화·그냥 쓰기·지난 날(index) · 기분 달력(calendar, 밀려 들어옴) · 검색
import { Stack } from 'expo-router'
import { usePalette } from '../../src/theme/ThemeProvider'
import { sheetScreenLayout } from '../../src/ui/SheetScrollGuard'

// 딥 링크로 안쪽 화면을 바로 열어도 ‹가 일기(index)로 돌아오게
export const unstable_settings = { initialRouteName: 'index' }

export default function DiaryLayout() {
  const p = usePalette()
  return (
    <Stack screenLayout={sheetScreenLayout} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="calendar" />
      <Stack.Screen name="search" />
    </Stack>
  )
}
