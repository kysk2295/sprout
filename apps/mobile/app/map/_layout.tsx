// 작업 지도(29): 목록·보드(index) → 리스트(list/[id], 밀려 들어옴) · 목표별 묶음 · 옮기기 시트 · 잇기 시트
import { Stack } from 'expo-router'
import { usePalette } from '../../src/theme/ThemeProvider'

// 딥 링크로 안쪽 화면을 바로 열어도 ‹가 목록(index)으로 돌아오게
export const unstable_settings = { initialRouteName: 'index' }

export default function MapLayout() {
  const p = usePalette()
  const sheet = { presentation: 'formSheet' as const, sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true, sheetCornerRadius: 22, contentStyle: { backgroundColor: p.pageBg } }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="list/[id]" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="move" options={sheet} />
      <Stack.Screen name="link" options={sheet} />
    </Stack>
  )
}
