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
import { useShareInbox } from '../src/share/useShareInbox'
import { useReminderNotifications } from '../src/notifications/background'
import { ThemeProvider, usePalette } from '../src/theme/ThemeProvider'
import { ToastProvider } from '../src/ui/Toast'
import { WikiIndexProvider } from '../src/wiki/WikiIndex'

export const unstable_settings = { anchor: '(tabs)' }

export default function Root() {
  useEffect(() => { void startAuth() }, [])
  const { status } = useAuth()
  useShareInbox() // 24: 공유 확장 토큰 건네기 + 대기열 비우기
  if (status === 'loading') return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PowerSyncContext.Provider value={db}>
          <ThemeProvider>
            <ToastProvider>
              {/* 33 §11: 행 태그 알약·[[링크]]가 쓰는 색인 하나 */}
              <WikiIndexProvider>
                <Screens signedIn={status === 'signedIn'} />
              </WikiIndexProvider>
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
  useReminderNotifications(signedIn) // 20 §4.4 로컬 알림: 예약·감시·알림 동작·백그라운드 새로 고침
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
          {/* 일정 시트(20 §7.1): 상세와 같은 반 시트 */}
          <Stack.Screen name="event/[id]" options={sheet([0.6, 1])} />
          <Stack.Screen name="move" options={{ ...sheet([0.8, 1]), contentStyle: { backgroundColor: p.pageBg } }} />
          <Stack.Screen name="tags" options={{ ...sheet([0.7, 1]), contentStyle: { backgroundColor: p.pageBg } }} />
          <Stack.Screen name="date" options={sheet([0.85, 1])} />
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
