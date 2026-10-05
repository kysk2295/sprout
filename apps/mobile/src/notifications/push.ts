// 32 푸시 알림(휴대폰) — 기기 등록 · 로컬 예약 보고 · FCM 데이터 메시지 받기. Android만 켠다(iOS는 §11 준비 전까지 로컬 알림만).
// - 등록(§3.2): 로그인·앱 시작·앞으로 올 때(같은 본문이면 하루 한 번 이하)·FCM 토큰이 바뀔 때·권한/설정/시간대가 바뀔 때 PUT /push/devices/:id
// - 보고(§4.3-1): 로컬 예약을 다시 계산할 때마다 바뀌었으면 PUT …/local(30초 간격, 끝에 한 번 더)
// - 받기: FCM 데이터 메시지 → expo 알림 작업(Notifications.registerTaskAsync, 앱이 앞·배경·닫힘 모두).
//   Android에서는 plugins/push-service가 expo의 기본 표시를 막고 이 작업으로만 넘긴다(0단계 실험 — 32 §15.1).
//   reminder: 로컬 알림과 같은 채널·카테고리(버튼)·id, 이미 예약/떠 있으면 안 띄움 · daily/growth/test: 그 채널로 · sync: 지우기 + 배경이면 동기화·다시 계산
// - Android는 앱이 배경·닫힘일 때 알림 버튼 응답도 이 작업으로 온다 → 완료·다시 알림을 앱을 열지 않고 바로 처리
// 작업 정의는 모듈 맨 위(앱 진입점 index.ts가 가장 먼저 불러온다 — 닫힌 상태에서 JS만 깨어날 때도 정의돼 있어야 함).
import { HIDDEN_REMINDER_TITLE } from '@sprout/schema/notify'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { useEffect, useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import { APP_VERSION } from '../config'
import { api, ApiError, freshToken, startAuth, syncNow } from '../data/auth'
import { db } from '../data/db'
import { deviceId } from '../data/device'
import { readNotifyPrefs } from '../data/notifyPrefs'
import { configureNotifications, handleResponse, onRescheduled, permissionState, rescheduleNow, scheduledIds } from './index'
import { CATEGORY } from './plan'
import {
  dismissTargets, isResponsePayload, localKeysOf, MOBILE_CAPS, needsRegister, parsePushPayload, reminderPlan, reportDelay, sameKeys,
  type DeviceBody, type PushMessage, type ShownNote
} from './pushLogic'

export const PUSH_TASK = 'sprout-push'
const extra = (Constants.expoConfig?.extra ?? {}) as { pushAndroid?: boolean; pushIos?: boolean }
/** 이 빌드가 서버 푸시를 받을 수 있나: Android = google-services.json을 넣고 빌드함, iOS = extra.pushIos(§11, 지금 false) */
export const PUSH_SUPPORTED = Platform.OS === 'android' ? !!extra.pushAndroid : Platform.OS === 'ios' ? !!extra.pushIos : false

// ── 상태(설정 화면 상태 줄 — §7.2) ──
export type PushState = 'unsupported' | 'idle' | 'ok' | 'disabled' | 'offline'
type Snapshot = { state: PushState; checkedAt: number | null }
let snap: Snapshot = { state: PUSH_SUPPORTED ? 'idle' : 'unsupported', checkedAt: null }
const listeners = new Set<() => void>()
const setSnap = (s: Partial<Snapshot>) => { snap = { ...snap, ...s }; listeners.forEach((l) => l()) }
export const usePushStatus = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => snap)

// ── 등록 ──
let lastReg: { sig: string; at: number } | null = null
/** 서버 요청 상한 — 배경에서 네트워크가 막혀 있으면(§17.2) 요청이 끝나지 않아 다음 등록이 모두 그 뒤에 묶인다 */
const NET_MS = 15_000
let registering: Promise<void> | undefined
let again = false
const nativeBuild = () => Constants.nativeBuildVersion ?? Constants.expoConfig?.android?.versionCode?.toString() ?? '1'
const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul' } catch { return 'Asia/Seoul' } }
const locale = () => { try { return Intl.DateTimeFormat().resolvedOptions().locale || 'ko-KR' } catch { return 'ko-KR' } }

/** 등록 본문을 만들어, 바뀌었거나 하루가 지났으면(force면 늘) 보낸다. 겹쳐 부르면 끝난 뒤 한 번 더 */
export function registerDevice(force = false): Promise<void> {
  if (!PUSH_SUPPORTED) return Promise.resolve()
  if (registering) { again = true; return registering }
  registering = (async () => {
    let f = force
    do {
      again = false
      await registerOnce(f).catch((e) => {
        console.warn('[push] register', e instanceof Error ? e.message : e)
        setSnap({ state: 'offline', checkedAt: Date.now() })
      })
      f = false
    } while (again)
  })().finally(() => { registering = undefined })
  return registering
}
async function registerOnce(force: boolean) {
  const token = await freshToken()
  if (!token) return
  // Play 서비스가 없거나 아직 준비 전이면 토큰 요청이 끝나지 않을 수 있다 → 20초에서 끊는다(다음 앞으로 올 때 다시)
  const fcm = await Promise.race([
    Notifications.getDevicePushTokenAsync(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('device token timeout')), 20_000))
  ])
  if (typeof fcm.data !== 'string' || !fcm.data) throw new Error('no device token')
  const prefs = await readNotifyPrefs()
  const granted = (await permissionState()) === 'granted'
  const body: DeviceBody = {
    token: fcm.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    app_version: `${APP_VERSION} (${nativeBuild()})`,
    caps: MOBILE_CAPS,
    timezone: timeZone(),
    locale: locale(),
    push_reminders: granted && prefs.reminders
  }
  const now = Date.now()
  if (!force && !needsRegister(body, lastReg, now)) return
  const id = await deviceId()
  const r = await api<{ ok: boolean; push?: { enabled?: boolean } }>(`/push/devices/${id}`, { method: 'PUT', body, token, timeoutMs: NET_MS })
  lastReg = { sig: JSON.stringify(body), at: now }
  setSnap({ state: r.push?.enabled ? 'ok' : 'disabled', checkedAt: now })
  // 새 행이면 서버의 local_keys가 비어 있다 → 바로 다시 보고
  lastKeys = null
  await reportLocal()
}

// ── 로컬 예약 보고 (§4.3-1) ──
let lastKeys: string[] | null = null
let lastReportAt: number | null = null
let reportTimer: ReturnType<typeof setTimeout> | undefined
export async function reportLocal(): Promise<void> {
  if (!PUSH_SUPPORTED) return
  // 이 프로세스에서 아직 등록 전이면(닫힌 앱이 작업으로만 깨어남) 먼저 등록 — 등록이 끝나면 보고가 이어진다
  if (!lastReg) { await registerDevice(); if (!lastReg) return }
  const keys = localKeysOf(await scheduledIds().catch(() => []))
  if (sameKeys(lastKeys, keys)) return
  const wait = reportDelay(lastReportAt, Date.now())
  if (wait > 0) {
    if (!reportTimer) reportTimer = setTimeout(() => { reportTimer = undefined; void reportLocal() }, wait)
    return
  }
  const token = await freshToken()
  if (!token) return
  lastReportAt = Date.now()
  try {
    await api(`/push/devices/${await deviceId()}/local`, { method: 'PUT', body: { keys }, token, timeoutMs: NET_MS })
    lastKeys = keys
  } catch (e) {
    // 서버에 이 기기 행이 없으면(다른 곳에서 지워짐) 다시 등록 → 등록이 끝나면 다시 보고
    if (e instanceof ApiError && e.status === 404) { lastReg = null; void registerDevice(true) }
  }
}

// ── 시험 알림 (§7.2) ──
export async function sendTestPush(): Promise<'sent' | 'limited' | 'disabled' | 'offline'> {
  const send = async () => api('/push/test', { body: { device_id: await deviceId() }, token: (await freshToken()) ?? undefined, timeoutMs: NET_MS })
  try {
    if (!lastReg) await registerDevice()
    await send()
    return 'sent'
  } catch (e) {
    if (!(e instanceof ApiError)) return 'offline'
    if (e.status === 429) return 'limited'
    if (e.status === 503) { setSnap({ state: 'disabled', checkedAt: Date.now() }); return 'disabled' }
    if (e.status === 404) {
      await registerDevice(true)
      try { await send(); return 'sent' } catch { return 'offline' }
    }
    return 'offline'
  }
}

// ── 받기 ──
type Note = Notifications.Notification
const dataOf = (n: Note) => (n.request.content.data ?? {}) as { taskId?: string }
const shown = (list: Note[]): ShownNote[] => list.map((n) => ({ id: n.request.identifier, taskId: dataOf(n).taskId }))
const scheduledNotes = async (): Promise<ShownNote[]> =>
  (await Notifications.getAllScheduledNotificationsAsync()).map((n) => ({ id: n.identifier, taskId: (n.content.data as { taskId?: string } | null)?.taskId }))
const channel = (id: string) => (Platform.OS === 'android' ? { channelId: id } : null)

async function presentReminder(msg: Extract<PushMessage, { type: 'reminder' }>) {
  const plan = reminderPlan(msg, await scheduledNotes(), shown(await Notifications.getPresentedNotificationsAsync()))
  if (!plan.show) return
  // 이 기기가 이미 아는 할 일이면: 끝났거나 휴지통이면 띄우지 않고, 제목 숨기기로 온 알림에는 기기 안 제목을 보인다(§4.4)
  await startAuth().catch(() => {})
  const row = await db.getOptional<{ title: string | null; status: number; deleted_at: string | null }>('SELECT title, status, deleted_at FROM tasks WHERE id = ?', [msg.taskId]).catch(() => null)
  if (row && (row.status !== 0 || row.deleted_at)) return
  const title = msg.title ?? (row?.title?.trim() || HIDDEN_REMINDER_TITLE)
  // 늦은 같은 알림 예약은 먼저 지운다(같은 id로 지금 띄운 뒤 그 알람이 다시 울리지 않게)
  for (const id of plan.cancel) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: msg.key,
    content: { title, body: msg.body, data: { taskId: msg.taskId, url: msg.url, at: msg.at, via: 'push' }, categoryIdentifier: CATEGORY, sound: 'default' },
    trigger: channel(msg.channel)
  })
}
async function presentNotice(msg: Extract<PushMessage, { type: 'daily' | 'growth' | 'test' }>) {
  if ((await Notifications.getPresentedNotificationsAsync()).some((n) => n.request.identifier === msg.key)) return
  await Notifications.scheduleNotificationAsync({
    identifier: msg.key,
    content: { title: msg.title, body: msg.body, data: { kind: msg.kind, url: msg.url ?? null, via: 'push' }, sound: 'default' },
    trigger: channel(msg.channel)
  })
}
/**
 * §4.5 다른 기기에서 완료·삭제·시각 변경: 떠 있는 알림을 지우고, 그 할 일의 로컬 예약(할 일 알림·다시 알림)도 지운다.
 * 예약까지 지우는 이유: Android 15+는 배경(캐시) 상태 앱의 네트워크를 막아 조용한 푸시로 깨어나도 내려받지 못할 때가 많다(§17.2)
 * → 옛 시각 예약이 남아 울리지 않게. 새 시각은 서버가 그 기기의 local_keys에 없는 알림으로 보고 직접 보낸다.
 */
async function dismissFor(taskIds: string[]) {
  if (!taskIds.length) return
  for (const id of dismissTargets(shown(await Notifications.getPresentedNotificationsAsync()), taskIds)) {
    await Notifications.dismissNotificationAsync(id).catch(() => {})
  }
  for (const id of dismissTargets(await scheduledNotes(), taskIds)) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  }
}
/** 배경에서 네트워크가 막혀 있으면 연결·내려받기가 오래 걸린다 → 작업이 끝나도록 상한을 둔다 */
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))])

/** 작업 페이로드의 알림 응답 → NotificationResponse 모양(내용 data가 dataString으로만 올 때가 있다) */
function toResponse(p: Record<string, any>): Notifications.NotificationResponse {
  const req = p.notification?.request ?? {}
  const content = req.content ?? {}
  let data = content.data
  if ((!data || typeof data !== 'object') && typeof content.dataString === 'string') { try { data = JSON.parse(content.dataString) } catch { data = {} } }
  return { ...p, notification: { ...(p.notification ?? {}), request: { ...req, content: { ...content, data: data ?? {} } } } } as Notifications.NotificationResponse
}

/** 작업 본체(앞·배경·닫힘 모두 여기로) */
export async function handlePushPayload(payload: unknown): Promise<void> {
  await configureNotifications()
  if (isResponsePayload(payload)) {
    // Android 배경·닫힘에서 누른 버튼: 완료·다시 알림을 앱을 열지 않고 바로 처리 → 올리기
    await startAuth()
    await handleResponse(toResponse(payload as Record<string, any>), { navigate: false })
    // 알림 버튼은 잠깐 네트워크 허용(약 30초)을 받는다 → 그 안에 올리기
    await within((async () => {
      await syncNow().catch(() => {})
      await rescheduleNow()
      await reportLocal()
    })(), 20_000)
    return
  }
  const msg = parsePushPayload(payload)
  if (!msg) return
  if (msg.type === 'reminder') return presentReminder(msg)
  if (msg.type === 'sync') {
    await dismissFor(msg.dismiss)
    // 앞에 있으면 PowerSync가 이미 받는다. 배경·닫힘이면 잠깐 동기화 → 다시 계산(→ 로컬 예약 보고)
    if (AppState.currentState === 'active') return
    await within((async () => {
      await startAuth()
      await syncNow().catch(() => {})
      await rescheduleNow()
      await reportLocal()
    })(), 20_000)
    return
  }
  return presentNotice(msg)
}

if (!TaskManager.isTaskDefined(PUSH_TASK)) {
  TaskManager.defineTask(PUSH_TASK, async ({ data, error }) => {
    if (error) return Notifications.BackgroundNotificationTaskResult.Failed
    try {
      await handlePushPayload(data)
      return Notifications.BackgroundNotificationTaskResult.NewData
    } catch (e) {
      console.warn('[push] task', e instanceof Error ? e.message : e)
      return Notifications.BackgroundNotificationTaskResult.Failed
    }
  })
}

/**
 * 앱 뿌리(로그인 뒤)에서 한 번: 작업 등록 · 기기 등록 · 토큰/권한/설정/시간대 변화 감시 · 로컬 예약 보고.
 * 로그아웃 때 서버 등록 해제는 auth.logout이 한다(접근 토큰이 살아 있을 때 먼저).
 */
export function usePushNotifications(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || !PUSH_SUPPORTED) {
      lastReg = null; lastKeys = null
      if (PUSH_SUPPORTED) setSnap({ state: 'idle', checkedAt: null })
      return
    }
    void Notifications.registerTaskAsync(PUSH_TASK).catch((e) => console.warn('[push] registerTask', e))
    void registerDevice(true)
    const tokenSub = Notifications.addPushTokenListener(() => void registerDevice(true))
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void registerDevice() })
    // 다시 계산(권한이 생김·데이터 변경·30분마다)이 끝나면: 등록 본문(권한·설정) 확인 → 바뀐 로컬 예약 보고
    const stopResched = onRescheduled(() => { void registerDevice().then(() => reportLocal()) })
    // 설정(할 일 알림 켬/끔)이 바뀌면 push_reminders가 바뀐다
    const stopPrefs = db.onChangeWithCallback({ onChange: () => void registerDevice() }, { tables: ['user_prefs'], throttleMs: 1000 })
    return () => {
      tokenSub.remove()
      app.remove()
      stopResched()
      stopPrefs()
      if (reportTimer) { clearTimeout(reportTimer); reportTimer = undefined }
    }
  }, [signedIn])
}
