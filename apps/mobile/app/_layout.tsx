// 앱 뿌리: 폴리필 → 로그인 상태 → PowerSync 컨텍스트 → 테마 → 토스트 → 화면 묶음
// 로그인 전에는 login·signup만, 로그인 뒤에는 탭·시트만 열린다(Stack.Protected — 08 A안: 먼저 로그인).
import '../src/polyfills'
import { PowerSyncContext } from '@powersync/react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { startAuth, useAuth } from '../src/data/auth'
import { db } from '../src/data/db'
import { useAndroidShare } from '../src/share/android'
import { useShareInbox } from '../src/share/useShareInbox'
import { useWidgets, WidgetArtBaker } from '../src/widgets/useWidgets'
import { useReminderNotifications } from '../src/notifications/background'
import { ThemeProvider, usePalette } from '../src/theme/ThemeProvider'
import { sheetScreenLayout } from '../src/ui/SheetScrollGuard'
import { ToastProvider, useToast } from '../src/ui/Toast'
import { useAutoTrashNotice } from '../src/ui/AutoTrashNotice'
import { useDeviceCalBridge } from '../src/calendars/bridge'
import { useDeviceCalLifecycle } from '../src/calendars/store'
import { WikiIndexProvider } from '../src/wiki/WikiIndex'
import { RaiseRoot } from '../src/growth/raise'
import { RAISE_DEMO, RaiseDemo } from '../src/dev/raiseDemo'
import { PERF, PerfProbe, seedPerfTasks } from '../src/dev/perfProbe'

export const unstable_settings = { anchor: '(tabs)' }

// 20 §스플래시(사용자 "1초도 안 돼서 바로 생략돼 이상해 보여" 2026-10-10): 첫 화면이 준비될 때까지 붙잡고,
// 최소 SPLASH_MIN_MS는 보여 준 뒤 SPLASH_FADE_MS 동안 녹아 사라진다. 준비가 늦어도 SPLASH_MAX_MS에는 닫는다.
const LAUNCHED = Date.now()
const SPLASH_MIN_MS = 1000, SPLASH_FADE_MS = 450, SPLASH_MAX_MS = 4000
SplashScreen.preventAutoHideAsync().catch(() => undefined)
try { SplashScreen.setOptions({ duration: SPLASH_FADE_MS, fade: true }) } catch { /* 옛 런타임 */ }
const hideSplash = () => { SplashScreen.hideAsync().catch(() => undefined) }
setTimeout(hideSplash, SPLASH_MAX_MS)

export default function Root() {
  useEffect(() => { void startAuth() }, [])
  const { status } = useAuth()
  useEffect(() => {
    if (status === 'loading') return
    const t = setTimeout(hideSplash, Math.max(0, SPLASH_MIN_MS - (Date.now() - LAUNCHED)))
    return () => clearTimeout(t)
  }, [status])
  useShareInbox() // 24: 공유 확장 토큰 건네기 + 대기열 비우기
  useWidgets() // 36: 홈 화면 위젯 저장 파일·체크 대기열
  if (status === 'loading') return null
  if (RAISE_DEMO) return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><PowerSyncContext.Provider value={db}><ThemeProvider><RaiseDemo /></ThemeProvider></PowerSyncContext.Provider></SafeAreaProvider></GestureHandlerRootView>
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PowerSyncContext.Provider value={db}>
          <ThemeProvider>
            <ToastProvider>
              {/* 33 §11: 행 태그 알약·[[링크]]가 쓰는 색인 하나 */}
              <WikiIndexProvider>
                {/* 43: 입힌 옷을 모든 캐릭터 그림에 + 해금 판정 */}
                <RaiseRoot signedIn={status === 'signedIn'}>
                  <Screens signedIn={status === 'signedIn'} />
                </RaiseRoot>
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
  const { user } = useAuth()
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
      <RootEffects signedIn={signedIn} />
      <StatusBar style={p.dark ? 'light' : 'dark'} />
      {/* formSheet 화면은 모두 SheetScrollGuard로 감싼다 — 없으면 iOS가 ScrollView를 시트 밖으로 밀어 하얗게 빈다(SheetScrollGuard.tsx) */}
      <Stack screenLayout={sheetScreenLayout} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.pageBg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          {/* 상세: 반 시트 → 끌어 올리면 전체 화면(21 §5) */}
          <Stack.Screen name="task/[id]" options={sheet([0.55, 1])} />{/* 반 시트 55% [영상 실측 research 35 §4] */}
          {/* 일정 시트(20 §7.1): 상세와 같은 반 시트 */}
          <Stack.Screen name="event/[id]" options={sheet([0.6, 1])} />
          {/* 38 §2.3 휴대폰 캘린더 일정 시트 */}
          <Stack.Screen name="device-event" options={sheet([0.6, 1])} />
          <Stack.Screen name="move" options={{ ...sheet([0.8, 1]), contentStyle: { backgroundColor: p.pageBg } }} />
          <Stack.Screen name="tags" options={{ ...sheet([0.7, 1]), contentStyle: { backgroundColor: p.pageBg } }} />
          <Stack.Screen name="date" options={sheet([0.85, 1])} />
          {/* 39 §4.6: 화면 전환 움직임 없이 — 덮개는 화면 안에서 옅어지고 카드는 키보드에 붙어 오른다 */}
          {/* 49 §5 캐릭터 만들기 흐름: 장면 끝까지 · 페이드로 들어오고 나간다(중간에 밀어서 닫히지 않게) */}
          <Stack.Screen name="growth/make" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="quick-add" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ contentStyle: { backgroundColor: p.loginBg } }} />
          <Stack.Screen name="signup" options={{ contentStyle: { backgroundColor: p.loginBg } }} />
        </Stack.Protected>
      </Stack>
      {signedIn ? <WidgetArtBaker /> : null}
      {PERF && signedIn ? <PerfProbe seed={() => seedPerfTasks(user?.email)} /> : null}
    </>
  )
}

/** 뿌리의 감시·동기화 훅들(39 §11): 이 훅들이 다시 그려져도 화면 묶음(Stack → 모든 탭·서랍)이 같이 다시 그려지지 않게 따로 둔다 */
function RootEffects({ signedIn }: { signedIn: boolean }) {
  useReminderNotifications(signedIn) // 20 §4.4 로컬 알림: 예약·감시·알림 동작·백그라운드 새로 고침
  useAndroidShare(signedIn) // 24 §5-5: Android 다른 앱 공유 → 수집함
  const toast = useToast()
  useDeviceCalLifecycle(signedIn) // 38: 휴대폰 캘린더 권한·목록(앞으로 올 때 다시)
  useDeviceCalBridge(signedIn, (m) => toast.show(m)) // 38 §6: 이 휴대폰이 주인인 연결된 일정 ⇄ 휴대폰 캘린더
  useAutoTrashNotice(signedIn) // 48: 서버가 만료 2주 지난 할 일을 휴지통으로 옮겼으면 한 번 알림(보기·되돌리기)
  return null
}
