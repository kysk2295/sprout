// 일기(28): 쓰기·돌아보기(index) → 캐릭터와 이야기(chat, 밀려 들어옴) · 월 달력 시트 · 검색
import { Stack } from 'expo-router'
import { usePalette } from '../../src/theme/ThemeProvider'

// 딥 링크로 안쪽 화면을 바로 열어도 ‹가 목록(index)으로 돌아오게
export const unstable_settings = { initialRouteName: 'index' }

export default function DiaryLayout() {
  const p = usePalette()
  const sheet = (detents: number[]) => ({ presentation: 'formSheet' as const, sheetAllowedDetents: detents, sheetGrabberVisible: true, sheetCornerRadius: 22, contentStyle: { backgroundColor: p.sheetBg } })
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="calendar" options={sheet([0.75, 1])} />
      <Stack.Screen name="search" />
    </Stack>
  )
}
