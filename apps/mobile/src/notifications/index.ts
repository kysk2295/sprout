// 로컬 알림(20 §4.4, 03 §7): 동기화된 로컬 DB의 tasks·reminders를 보고 앞으로 48시간 안 알림(최대 50개)을 OS에 맡긴다.
// - 다시 계산: 앱 시작 · 앞으로 올 때 · tasks/reminders/lists가 바뀔 때(다른 기기 변경이 동기화돼도) · 앞에 있는 동안 30분마다 · 백그라운드 작업(background.ts)
// - 알림 동작: 완료(앱을 열지 않음 — 공용 완료 경로 completeTasks, XP 규칙 그대로) · 10분/1시간/내일 다시 알림 · 누르면 sprout://task/<id>
// - 다시 알림은 기기에만 있다(예약된 알림 자체가 상태 — 03 §9 local_reminder_state 대신)
// - 앱이 완전히 꺼진 상태에서 "완료"를 누르면 iOS가 JS를 깨우지 않을 수 있다 → 다음 실행 때 마지막 응답을 확인해 반영한다(맥 위젯과 같은 방식)
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useEffect } from 'react'
import { Alert, AppState, Linking, Platform } from 'react-native'
import { db } from '../data/db'
import { completeTasks } from '../data/tasks'
import { ACTION_DONE, CATEGORY, diffSchedule, isReminderId, isSnoozeId, planReminders, SNOOZE_ACTIONS, snoozeAt, snoozeId, staleSnoozes, type ReminderRow } from './plan'

const QUERY = `SELECT r.id AS rid, r.trigger, t.id AS tid, t.title, t.start_at, t.due_at, l.name AS list_name, l.kind AS list_kind
  FROM reminders r JOIN tasks t ON t.id = r.task_id LEFT JOIN lists l ON l.id = t.list_id
  WHERE t.status = 0 AND t.deleted_at IS NULL AND t.due_at IS NOT NULL`
const HANDLED_KEY = 'sprout.notif.handled'
const CHANNEL = 'tasks'

let configured: Promise<void> | undefined
/** 앞에 있을 때도 배너로 보이게 + 알림 동작(카테고리) 등록 + Android 채널 */
export function configureNotifications() {
  configured ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
    })
    await Notifications.setNotificationCategoryAsync(CATEGORY, [
      { identifier: ACTION_DONE, buttonTitle: '완료', options: { opensAppToForeground: false } },
      ...SNOOZE_ACTIONS.map((a) => ({ identifier: a.id, buttonTitle: a.label, options: { opensAppToForeground: false } }))
    ])
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: '할 일 알림', importance: Notifications.AndroidImportance.HIGH })
    }
  })().catch((e) => { configured = undefined; console.warn('[notifications] configure failed', e) })
  return configured
}

// ── 권한(20 §4.4: 첫 알림이 생기는 순간 묻는다. 앱 첫 실행에 바로 묻지 않음) ──
export type PermissionState = 'granted' | 'denied' | 'undetermined'
export async function permissionState(): Promise<PermissionState> {
  const s = await Notifications.getPermissionsAsync()
  if (s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted'
  return s.canAskAgain ? 'undetermined' : 'denied'
}
let asking: Promise<boolean> | undefined
/**
 * 알림이 있는 할 일을 저장한 뒤 부른다. 아직 안 물었으면 한국어 안내 → OS 권한 창,
 * 꺼져 있으면 설정 열기를 권한다(같은 실행에서 한 번만).
 */
export function ensurePermission(): Promise<boolean> {
  asking ??= (async () => {
    const state = await permissionState()
    if (state === 'granted') return true
    if (state === 'denied') {
      if (!deniedShown) {
        deniedShown = true
        await choose('알림이 꺼져 있어요', '할 일 시간에 알림을 받으려면 설정에서 sprout 알림을 켜 주세요.', '설정 열기').then((ok) => { if (ok) void Linking.openSettings() })
      }
      return false
    }
    const ok = await choose('알림을 켤까요?', '정한 시간에 할 일을 알려 드려요. 알림에서 바로 완료하거나 다시 알림을 고를 수 있어요.', '알림 켜기', '나중에')
    if (!ok) return false
    const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
    if (r.granted) void rescheduleNow()
    return r.granted
  })().finally(() => { asking = undefined })
  return asking
}
let deniedShown = false
const choose = (title: string, message: string, ok: string, cancel = '취소') =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) }
    ], { cancelable: true, onDismiss: () => resolve(false) })
  )
export const openSystemSettings = () => Linking.openSettings()

// ── 예약 ──
let running: Promise<void> | null = null
let again = false
/** 지금 다시 계산(겹쳐 부르면 끝난 뒤 한 번 더) */
export function rescheduleNow(): Promise<void> {
  if (running) { again = true; return running }
  running = (async () => {
    try {
      do {
        again = false
        await rescheduleOnce()
      } while (again)
    } catch (e) {
      console.warn('[notifications] reschedule failed', e)
    } finally {
      running = null
    }
  })()
  return running
}
async function rescheduleOnce() {
  await configureNotifications()
  if ((await permissionState()) !== 'granted') return
  const rows = await db.getAll<ReminderRow>(QUERY)
  const planned = planReminders(rows, Date.now())
  const pending = (await Notifications.getAllScheduledNotificationsAsync()).map((n) => ({
    id: n.identifier, title: n.content.title, body: n.content.body, taskId: (n.content.data as { taskId?: string } | null)?.taskId
  }))
  const { cancel, add } = diffSchedule(pending, planned)
  const open = new Set((await db.getAll<{ id: string }>('SELECT id FROM tasks WHERE status = 0 AND deleted_at IS NULL')).map((r) => r.id))
  for (const id of [...cancel, ...staleSnoozes(pending, open)]) await Notifications.cancelScheduledNotificationAsync(id)
  for (const p of add) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { taskId: p.taskId, url: `sprout://task/${p.taskId}` }, categoryIdentifier: CATEGORY, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) }
    })
  }
}
/** 로그아웃: 이 기기의 예약을 모두 지운다 */
export async function cancelAll() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {})
}
/** 시험·확인용: 지금 예약된 알림 */
export async function scheduledSummary() {
  return (await Notifications.getAllScheduledNotificationsAsync()).map((n) => ({ id: n.identifier, title: n.content.title, body: n.content.body }))
}

// ── 알림 동작 ──
async function alreadyHandled(key: string): Promise<boolean> {
  const last = await SecureStore.getItemAsync(HANDLED_KEY).catch(() => null)
  if (last === key) return true
  await SecureStore.setItemAsync(HANDLED_KEY, key).catch(() => {})
  return false
}
export async function handleResponse(r: Notifications.NotificationResponse, opts: { navigate: boolean }) {
  const req = r.notification.request
  const taskId = (req.content.data as { taskId?: string } | null)?.taskId
  if (!taskId) return
  if (await alreadyHandled(`${req.identifier}|${r.actionIdentifier}|${r.notification.date}`)) return
  const snooze = SNOOZE_ACTIONS.find((a) => a.id === r.actionIdentifier)
  if (r.actionIdentifier === ACTION_DONE) {
    // 공용 완료 경로: 하위 함께·반복 다음 회차·XP 하루 10(같은 할 일을 다른 기기에서 완료해도 XP는 한 번 — taskCore)
    await completeTasks([taskId])
    void rescheduleNow()
  } else if (snooze) {
    const at = snoozeAt(snooze.minutes, Date.now())
    await Notifications.scheduleNotificationAsync({
      identifier: snoozeId(taskId, at),
      content: { title: req.content.title, body: req.content.body, data: { taskId, url: `sprout://task/${taskId}` }, categoryIdentifier: CATEGORY, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) }
    })
  } else if (r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER && opts.navigate) {
    // 빠른 입력·다른 시트가 열려 있으면 닫고 상세로(시트가 겹치지 않게)
    if (router.canDismiss()) router.dismissAll()
    router.push(`/task/${taskId}`)
  }
  if (req.identifier) await Notifications.dismissNotificationAsync(req.identifier).catch(() => {})
}

/**
 * 앱 뿌리(로그인 뒤)에서 한 번: 예약·감시·알림 응답. signedIn이 false가 되면 예약을 지운다.
 * 권한을 묻지는 않는다(첫 알림을 정할 때 ensurePermission).
 */
export function useNotifications(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) { void cancelAll(); return }
    void configureNotifications().then(() => rescheduleNow())
    // 데이터가 바뀌면(이 기기·동기화) 다시 계산
    const stopWatch = db.onChangeWithCallback({ onChange: () => void rescheduleNow() }, { tables: ['tasks', 'reminders', 'lists'], throttleMs: 1500 })
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void rescheduleNow() })
    // 48시간 창 안으로 들어오는 알림을 잡으려고 앞에 있는 동안 30분마다
    const timer = setInterval(() => void rescheduleNow(), 30 * 60_000)
    const sub = Notifications.addNotificationResponseReceivedListener((r) => void handleResponse(r, { navigate: true }))
    // 앱이 꺼져 있던 동안 누른 알림(누름 = 상세 열기, 완료 = 다음 실행 때 반영)
    const last = Notifications.getLastNotificationResponse()
    if (last) void handleResponse(last, { navigate: true }).finally(() => Notifications.clearLastNotificationResponse())
    return () => {
      stopWatch()
      app.remove()
      clearInterval(timer)
      sub.remove()
    }
  }, [signedIn])
}
export { isReminderId, isSnoozeId }
