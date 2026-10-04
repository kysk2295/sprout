import { Stack } from 'expo-router'
import { usePalette } from '../../../src/theme/ThemeProvider'

export default function MoreLayout() {
  const p = usePalette()
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }} />
}
