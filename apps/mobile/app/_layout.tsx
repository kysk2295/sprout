// 앱 뿌리: 폴리필 → 로그인 상태 → PowerSync 컨텍스트 → 테마 → 토스트 → 화면 묶음
// 로그인 전에는 login·signup만, 로그인 뒤에는 탭·시트만 열린다(Stack.Protected — 08 A안: 먼저 로그인).
import '../src/polyfills'
import { PowerSyncContext } from '@powersync/react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { startAuth, useAuth } from '../src/data/auth'
import { db } from '../src/data/db'
import { ThemeProvider, usePalette } from '../src/theme/ThemeProvider'
import { ToastProvider } from '../src/ui/Toast'

export const unstable_settings = { anchor: '(tabs)' }

export default function Root() {
  useEffect(() => { void startAuth() }, [])
  const { status } = useAuth()
  if (status === 'loading') return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PowerSyncContext.Provider value={db}>
          <ThemeProvider>
            <ToastProvider>
              <Screens signedIn={status === 'signedIn'} />
            </ToastProvider>
          </ThemeProvider>
        </PowerSyncContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function Screens({ signedIn }: { signedIn: boolean }) {
  const p = usePalette()
  useEffect(() => { void SystemUI.setBackgroundColorAsync(p.pageBg) }, [p.pageBg])
  const sheet = (detents: number[]) => ({
    presentation: 'formSheet' as const,
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: 22,
    contentStyle: { backgroundColor: p.sheetBg }
  })
  return (
    <>
      <StatusBar style={p.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          {/* 상세: 반 시트 → 끌어 올리면 전체 화면(21 §5) */}
          <Stack.Screen name="task/[id]" options={sheet([0.6, 1])} />
          <Stack.Screen name="move" options={{ ...sheet([0.8, 1]), contentStyle: { backgroundColor: p.pageBg } }} />
          <Stack.Screen name="tags" options={{ ...sheet([0.7, 1]), contentStyle: { backgroundColor: p.pageBg } }} />
          <Stack.Screen name="date" options={sheet([0.5, 1])} />
          <Stack.Screen name="quick-add" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ contentStyle: { backgroundColor: p.loginBg } }} />
          <Stack.Screen name="signup" options={{ contentStyle: { backgroundColor: p.loginBg } }} />
        </Stack.Protected>
      </Stack>
    </>
  )
}
