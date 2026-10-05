// 32 푸시(휴대폰) — OS·서버를 부르지 않는 순수 함수(시험: pushLogic.test.ts).
// FCM 데이터 메시지 해석(§9.4) · 받을 때 중복 확인(§4.3-3) · 지우기 목록(§4.5) · 눌렀을 때 갈 화면 · 기기 등록 본문(§3.2) · 로컬 예약 보고(§4.3-1).
import { PUSH_CAPS, type PushCap } from '@sprout/schema/notify'

/** 이 앱 버전이 열 수 있는 종류(device_tokens.caps). 기본함 정리 화면이 아직 없어 inbox-cleanup은 뺀다(32 §8) */
export const MOBILE_CAPS: PushCap[] = PUSH_CAPS.filter((c) => c !== 'inbox-cleanup')

export type PushMessage =
  | { type: 'reminder'; key: string; taskId: string; at: number; title?: string; body: string; url: string; channel: string; category: string }
  | { type: 'daily' | 'growth' | 'test'; kind: string; key: string; title: string; body: string; url?: string; channel: string }
  | { type: 'sync'; dismiss: string[] }

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
/** 작업 페이로드(Android: RemoteMessageSerializer 묶음 — data 안에 FCM data) 또는 data 자체에서 sprout 메시지를 꺼낸다 */
export function parsePushPayload(payload: unknown): PushMessage | null {
  const p = payload as Record<string, unknown> | null | undefined
  if (!p || typeof p !== 'object') return null
  const inner = p.data && typeof p.data === 'object' ? (p.data as Record<string, unknown>) : null
  const d = (inner && typeof inner.type === 'string' ? inner : typeof p.type === 'string' ? p : null) as Record<string, unknown> | null
  if (!d) return null
  const type = str(d.type)
  if (type === 'reminder') {
    const key = str(d.key), taskId = str(d.taskId), at = Number(d.at)
    if (!key || !key.startsWith('r:') || !taskId || !Number.isFinite(at)) return null
    return {
      type, key, taskId, at, title: str(d.title), body: str(d.body) ?? '', url: str(d.url) ?? `sprout://task/${taskId}`,
      channel: str(d.channel) ?? 'tasks', category: str(d.category) ?? 'sprout-task'
    }
  }
  if (type === 'daily' || type === 'growth' || type === 'test') {
    const title = str(d.title)
    if (!title) return null
    return { type, kind: str(d.kind) ?? type, key: str(d.key) ?? `${type}:${Date.now()}`, title, body: str(d.body) ?? '', url: str(d.url), channel: str(d.channel) ?? (type === 'test' ? 'tasks' : type) }
  }
  if (type === 'sync') {
    let dismiss: string[] = []
    const raw = str(d.dismiss)
    if (raw) try { const a = JSON.parse(raw); if (Array.isArray(a)) dismiss = a.filter((x): x is string => typeof x === 'string') } catch { /* 깨진 목록은 무시 */ }
    return { type, dismiss }
  }
  return null
}

/** 작업 페이로드가 알림 응답(버튼·누름)인가 — Android는 앱이 배경·닫힘일 때 버튼 응답도 같은 작업으로 온다 */
export const isResponsePayload = (payload: unknown): boolean =>
  !!payload && typeof payload === 'object' && typeof (payload as { actionIdentifier?: unknown }).actionIdentifier === 'string'

export type ShownNote = { id: string; taskId?: string }
/** 알림 id 끝의 울리는 순간(ms): r:<rid>@<ms> */
const atOf = (id: string) => { const i = id.lastIndexOf('@'); return i < 0 ? NaN : Number(id.slice(i + 1)) }
/**
 * 32 §4.3-3 받을 때 다시 확인. 같은 알림 = 같은 id, 또는 같은 할 일·같은 순간(다른 reminder id — 서버는 가장 작은 id, 휴대폰은 행 순서로 고른다).
 * - 이미 떠 있으면 띄우지 않는다.
 * - 아직 예약만 돼 있으면(서버는 울릴 시각에 보내므로 그 예약은 늦은 것 — Android 정확하지 않은 알람) 지금 같은 id로 띄우고 그 예약은 취소한다.
 */
export function reminderPlan(msg: { key: string; taskId: string; at: number }, scheduled: ShownNote[], presented: ShownNote[]): { show: boolean; cancel: string[] } {
  const same = (n: ShownNote) => n.id === msg.key || (n.id.startsWith('r:') && n.taskId === msg.taskId && atOf(n.id) === msg.at)
  if (presented.some(same)) return { show: false, cancel: [] }
  return { show: true, cancel: scheduled.filter(same).map((n) => n.id) }
}

/** §4.5 지우기: 떠 있는 알림 중 그 할 일 것(할 일 알림·다시 알림 모두) */
export const dismissTargets = (presented: ShownNote[], taskIds: string[]): string[] => {
  const set = new Set(taskIds)
  return presented.filter((n) => n.taskId && set.has(n.taskId)).map((n) => n.id)
}

/** 알림의 url → 앱 경로(expo-router). 모르는 곳이면 null(앱만 연다) */
export function routeOf(url: string | undefined): string | null {
  if (!url) return null
  const m = url.match(/^sprout:\/\/([^?#]*)/)
  if (!m) return null
  const path = m[1].replace(/\/+$/, '')
  const task = path.match(/^task\/([^/]+)$/)
  if (task) return `/task/${task[1]}`
  if (path === 'today') return '/today'
  if (path === 'growth') return '/growth'
  return null
}

export type DeviceBody = { token: string; platform: 'android' | 'ios'; app_version: string; caps: string[]; timezone: string; locale: string; push_reminders: boolean }
/** 같은 본문을 하루 안에 다시 보내지 않는다(앞으로 올 때 하루 한 번 이하 — §3.2). 본문이 바뀌면 바로 */
export function needsRegister(body: DeviceBody, last: { sig: string; at: number } | null, now: number, dayMs = 86400_000): boolean {
  if (!last) return true
  return last.sig !== JSON.stringify(body) || now - last.at >= dayMs
}

/** §4.3-1 로컬 예약 보고: 할 일 알림(r:)만, 정렬해 비교. 같으면 보내지 않는다 */
export function localKeysOf(ids: string[], max = 50): string[] {
  return [...new Set(ids.filter((id) => /^r:[^\s]{1,120}$/.test(id)))].sort().slice(0, max)
}
export const sameKeys = (a: string[] | null, b: string[]) => !!a && a.length === b.length && a.every((k, i) => k === b[i])
/** 보고 간격 최소 30초: 지금 보내도 되면 0, 아니면 기다릴 ms */
export const reportDelay = (lastAt: number | null, now: number, minMs = 30_000) => (lastAt === null ? 0 : Math.max(0, lastAt + minMs - now))
