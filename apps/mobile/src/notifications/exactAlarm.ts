// 32 §17.6 결정 — 정확한 알람(Android 12+ "알람 및 리마인더"). ⓐ + ⓒ:
// ⓐ SCHEDULE_EXACT_ALARM(modules/sprout-alarms 매니페스트)을 사용자가 허용하면 expo가 로컬 예약을 정확한 알람으로 건다.
//    묻는 곳: 알림 있는 할 일을 처음 저장할 때 한 번(ensureExactAlarm) · 설정 › 소리와 알림의 `알람 및 리마인더` 줄.
// ⓒ 허용이 없으면 로컬 예약 보고를 빈 목록으로(push.ts reportLocal → pushLogic.reportKeys) → 서버가 모든 할 일 알림을 정시에 보낸다.
// 허용이 바뀌면(앞으로 올 때 확인) 로컬 예약을 모두 다시 넣고(index.ts rescheduleOnce) 다시 보고한다.
// USE_EXACT_ALARM은 쓰지 않는다(Play 정책: 알람·캘린더가 핵심인 앱만).
import { requireOptionalNativeModule } from 'expo'
import * as SecureStore from 'expo-secure-store'
import { Alert, Linking, Platform } from 'react-native'

type SproutAlarms = { needsPermission(): boolean; canScheduleExactAlarms(): boolean; openSettings(): Promise<boolean> }
const native = Platform.OS === 'android' ? requireOptionalNativeModule<SproutAlarms>('SproutAlarms') : null

const LAST_KEY = 'sprout.exactAlarm.last'
const ASKED_KEY = 'sprout.exactAlarm.asked'

/** 'na' = 이 기기는 사용자 허용이 필요 없다(iOS·Android 11 이하) */
export type ExactAlarmState = 'allowed' | 'denied' | 'na'
export function exactAlarmState(): ExactAlarmState {
  if (Platform.OS !== 'android') return 'na'
  // 모듈 없이 만든 빌드: 알 수 없으면 허용 안 됨으로 본다(서버가 모두 보내는 쪽이 안전)
  if (!native) return 'denied'
  try {
    if (!native.needsPermission()) return 'na'
    return native.canScheduleExactAlarms() ? 'allowed' : 'denied'
  } catch {
    return 'denied'
  }
}
/** 로컬 예약이 정시에 울리나(보고·다시 넣기 판단) */
export const exactAlarmsOk = () => exactAlarmState() !== 'denied'

/** 시스템 "알람 및 리마인더" 화면(못 열면 앱 정보) */
export async function openExactAlarmSettings(): Promise<void> {
  const ok = await native?.openSettings().catch(() => false)
  if (!ok) await Linking.openSettings().catch(() => {})
}

/**
 * 허용 상태가 지난번(보안 저장소 — 앱이 꺼졌다 켜져도 비교되게)과 달라졌나. 처음 보는 값은 '바뀜 아님'.
 * 허용을 끄면 OS가 앱을 멈추고 정확한 알람을 모두 지우므로, 다음 실행에서 이 값으로 다시 넣는다.
 */
export async function exactAlarmChanged(): Promise<boolean> {
  const now = exactAlarmsOk() ? '1' : '0'
  const last = await SecureStore.getItemAsync(LAST_KEY).catch(() => null)
  if (last === now) return false
  await SecureStore.setItemAsync(LAST_KEY, now).catch(() => {})
  return last !== null
}

let asking: Promise<void> | undefined
/**
 * 알림 있는 할 일을 처음 저장할 때(알림 권한이 생긴 뒤) 한 번만 묻는다. 거절해도 서버가 제때 보내므로 다시 묻지 않고,
 * 설정 › 소리와 알림의 줄로만 안내한다(틱틱: 알림이 늦으면 소리와 알림 › 고급 설정 안내 — research 30 §6).
 */
export function ensureExactAlarm(): Promise<void> {
  asking ??= (async () => {
    if (exactAlarmState() !== 'denied' || !native) return
    if (await SecureStore.getItemAsync(ASKED_KEY).catch(() => null)) return
    await SecureStore.setItemAsync(ASKED_KEY, '1').catch(() => {})
    const ok = await new Promise<boolean>((resolve) =>
      Alert.alert(
        '정한 시각에 바로 울리게 할까요?',
        '‘알람 및 리마인더’를 허용하면 인터넷이 없어도 할 일 알림이 제시간에 울려요. 허용하지 않아도 연결돼 있으면 서버가 제때 알려 드려요.',
        [
          { text: '나중에', style: 'cancel', onPress: () => resolve(false) },
          { text: '허용하러 가기', onPress: () => resolve(true) }
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      )
    )
    if (ok) await openExactAlarmSettings()
  })().finally(() => { asking = undefined })
  return asking
}
