// 작업 지도(29): 프로젝트 보드·⧉ 전체 지도(index) → 프로젝트(project/[id]) · 목록·보드 → 리스트(list/[id], 밀려 들어옴) · 목표별 묶음 · 옮기기 시트 · 잇기 시트
import { Stack } from 'expo-router'
import { useMemo } from 'react'
import { usePalette } from '../../src/theme/ThemeProvider'
import { sheetScreenLayout } from '../../src/ui/SheetScrollGuard'

// 딥 링크로 안쪽 화면을 바로 열어도 ‹가 목록(index)으로 돌아오게
export const unstable_settings = { initialRouteName: 'index' }

export default function MapLayout() {
  const p = usePalette()
  // 옵션 객체는 고정(렌더마다 새 객체면 위에 다른 화면이 뜰 때 setOptions가 끝없이 돈다 — 2026-10-05 시뮬레이터에서 확인)
  const sheet = useMemo(() => ({ presentation: 'formSheet' as const, sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true, sheetCornerRadius: 22, contentStyle: { backgroundColor: p.pageBg } }), [p.pageBg])
  const screen = useMemo(() => ({ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }), [p.pageBg])
  return (
    <Stack screenLayout={sheetScreenLayout} screenOptions={screen}>
      <Stack.Screen name="index" />
      <Stack.Screen name="list/[id]" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="move" options={sheet} />
      <Stack.Screen name="link" options={sheet} />
      <Stack.Screen name="project/[id]" />
    </Stack>
  )
}
