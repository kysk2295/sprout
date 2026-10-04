// 수집함 탭(26): 목록(index) → 위키 주제 페이지(wiki/[id])가 밀려 들어온다. 탭 바 항목은 (tabs)/_layout(내비게이션 담당)이 정한다.
import { Stack } from 'expo-router'
import { usePalette } from '../../../src/theme/ThemeProvider'

export default function CollectLayout() {
  const p = usePalette()
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }} />
}
