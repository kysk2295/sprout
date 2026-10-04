// 32 푸시 알림 — 순수 계산(시험: push.test.ts): 어느 기기에 어떤 알림을 언제 보낼지, 업로드가 어떤 효과를 내는지, FCM 메시지 모양.
// DB·네트워크는 없다. 시각은 모두 ms, 기기 시간대는 IANA(device_tokens.timezone).
import { floatingToMs, zonedParts, dayKeyIn, reminderFireTimeIn } from '../../../packages/schema/src/time.ts'
import { CHANNELS, clip, HIDDEN_REMINDER_TITLE, reminderBody, reminderKey, TASK_CATEGORY, UNTITLED, type Notice, type NotifyPrefs } from '../../../packages/schema/src/notify.ts'

export type Device = {
  id: string
  user_id: string
  provider: string
  token: string
  platform: 'android' | 'ios'
  app_version: string | null
  caps: string[]
  timezone: string
  locale: string | null
  local_keys: string[]
  push_reminders: boolean
  last_seen_at: number
}
export type ReminderRow = {
  owner_id: string
  rid: string
  trigger: string
  tid: string
  title: string | null
  start_at: string | null
  due_at: string | null
  list_name: string | null
  list_kind: string | null
}

// ── FCM 메시지 (32 §9.4: data만, 값은 모두 문자열) ──
export type PushData = Record<string, string>
export type Outgoing = { kind: string; key?: string; taskId?: string | null; data: PushData; priority: 'high' | 'normal'; ttlSec: number; collapseKey?: string }

/** 기기 하나에 보낼 HTTP v1 message(token 칸은 보내는 쪽이 넣는다). iOS는 PUSH_IOS를 켰을 때만 오고, 보이는 알림으로 보낸다(§11-5) */
export function fcmMessage(device: Pick<Device, 'platform'>, o: Outgoing): Record<string, unknown> {
  const data = Object.fromEntries(Object.entries(o.data).filter(([, v]) => typeof v === 'string'))
  const msg: Record<string, unknown> = {
    data,
    android: { priority: o.priority === 'high' ? 'HIGH' : 'NORMAL', ttl: `${o.ttlSec}s`, ...(o.collapseKey ? { collapse_key: o.collapseKey } : {}) }
  }
  if (device.platform === 'ios') {
    const exp = String(Math.floor(Date.now() / 1000) + o.ttlSec)
    msg.apns = data.type === 'sync'
      ? { headers: { 'apns-push-type': 'background', 'apns-priority': '5', 'apns-expiration': exp }, payload: { aps: { 'content-available': 1 } } }
      : {
          headers: { 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': exp, ...(o.collapseKey ? { 'apns-collapse-id': o.collapseKey } : {}) },
          payload: { aps: { alert: { title: data.title ?? HIDDEN_REMINDER_TITLE, body: data.body ?? '' }, sound: 'default', 'mutable-content': 1, ...(data.type === 'reminder' ? { category: TASK_CATEGORY } : {}) } }
        }
  }
  return msg
}

export const noticeOut = (n: Notice, key: string, channel: string, ttlSec: number): Outgoing => ({
  kind: n.kind, key, data: { type: n.kind === 'daily' ? 'daily' : n.kind === 'test' ? 'test' : 'growth', kind: n.kind, key, title: clip(n.title), body: n.body, channel, ...(n.url ? { url: n.url } : {}) },
  priority: 'high', ttlSec
})
export const syncOut = (dismiss: string[] = []): Outgoing => ({
  kind: 'sync', data: { type: 'sync', ...(dismiss.length ? { dismiss: JSON.stringify(dismiss.slice(0, 100)) } : {}) }, priority: 'normal', ttlSec: 600, collapseKey: 'sync'
})
export const TTL = { reminder: 3600, daily: 3 * 3600, growth: 24 * 3600, test: 60 } as const

/** 기기가 이 종류를 열 수 있나(옛 앱 보호) */
export const can = (d: Pick<Device, 'caps'>, cap: string) => d.caps.includes(cap)

// ── 할 일 알림 (32 §4) ──
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
/** 후보를 줄이는 날짜 범위(떠 있는 시각이라 시간대 여유를 둔다). 1주 전 알림(-P6DT15H)까지 들어오게 뒤는 +15일 */
export function candidateDays(now: number): { from: string; to: string } {
  const today = new Date(now).toISOString().slice(0, 10)
  return { from: plusDays(today, -2), to: plusDays(today, 15) }
}

/**
 * 창 (from, to]에 울릴 이 기기의 할 일 알림. 휴대폰 planReminders와 같은 규칙:
 * 지금 행의 알림만(반복은 펼치지 않음), 한 할 일의 두 알림이 같은 순간이면 하나만(가장 작은 reminder id),
 * 기기가 로컬로 예약해 둔 id(local_keys)는 보내지 않는다(같은 할 일·같은 순간의 어느 id라도 있으면 건너뜀).
 */
export function planReminderPushes(rows: ReminderRow[], device: Device, prefs: NotifyPrefs, from: number, to: number): Outgoing[] {
  if (!device.push_reminders || !prefs.reminders || !can(device, 'reminder')) return []
  const local = new Set(device.local_keys)
  const groups = new Map<string, { at: number; row: ReminderRow; rids: string[] }>()
  for (const r of rows) {
    if (r.owner_id !== device.user_id || !r.due_at) continue
    const at = reminderFireTimeIn(r, r.trigger, device.timezone)
    if (at === null || Number.isNaN(at) || at <= from || at > to) continue
    const g = groups.get(`${r.tid}@${at}`)
    if (!g) groups.set(`${r.tid}@${at}`, { at, row: r, rids: [r.rid] })
    else { g.rids.push(r.rid); if (r.rid < g.row.rid) g.row = r }
  }
  const out: Outgoing[] = []
  for (const { at, row, rids } of groups.values()) {
    if (rids.some((rid) => local.has(reminderKey(rid, at)))) continue
    const key = reminderKey(row.rid, at)
    const data: PushData = {
      type: 'reminder', key, taskId: row.tid, at: String(at), channel: CHANNELS.tasks, category: TASK_CATEGORY, url: `sprout://task/${row.tid}`,
      body: reminderBody(row, at, device.timezone, !prefs.hideTitles)
    }
    if (!prefs.hideTitles) data.title = clip(row.title?.trim() || UNTITLED) // 숨기기면 제목·리스트 이름이 페이로드에 아예 없다
    out.push({ kind: 'reminder', key, taskId: row.tid, data, priority: 'high', ttlSec: TTL.reminder })
  }
  return out.sort((a, b) => Number(a.data.at) - Number(b.data.at))
}

// ── 기기 시각으로 정한 순간(하루 요약 08:00, 일요일 20:00) ──
/** 창 (from, to]에 "그 기기 시각 time"이 된 날짜들(어제·오늘 — 자정 넘김 대비). weekday 필터(0=일) */
export function localMomentsIn(timeZone: string, time: string, from: number, to: number, weekdays?: number[]): { day: string; at: number }[] {
  const out: { day: string; at: number }[] = []
  const today = dayKeyIn(to, timeZone)
  for (const day of [plusDays(today, -1), today]) {
    const at = floatingToMs(`${day}T${time}`, timeZone)
    if (!(at > from && at <= to)) continue
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
    if (weekdays && !weekdays.includes(wd)) continue
    out.push({ day, at })
  }
  return out
}
export const WEEKDAYS = [1, 2, 3, 4, 5]
/** 월요일 시작 주의 첫날(10 성장, 2026-10-05 결정) */
export function weekStartOf(day: string): string {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
  return plusDays(day, -((wd + 6) % 7))
}
export const localDay = (ms: number, tz: string) => dayKeyIn(ms, tz)
export const localWeekday = (ms: number, tz: string) => zonedParts(ms, tz).weekday

// ── 업로드 효과 (32 §4.5·§6·§8) ──
export type CrudOp = { op: 'PUT' | 'PATCH' | 'DELETE'; table: string; id: string; data?: Record<string, unknown> }
export type Effects = {
  sync: boolean // 조용한 동기화 푸시를 보낼 변경이 있나
  dismiss: string[] // 떠 있는 알림을 지울 할 일 id
  deletedReminders: string[] // 지운 알림 id(할 일 id는 push_sent에서 찾는다)
  xp: boolean // 진화 확인
  reports: string[] // text_json이 바뀐 weekly_reports id
  tasks: boolean // 기본함 수 확인
}
export const SYNC_TABLES = new Set(['tasks', 'reminders', 'lists', 'check_items', 'xp_events', 'kpis', 'weekly_reports'])
const has = (d: Record<string, unknown> | undefined, k: string) => !!d && Object.hasOwn(d, k)
const num = (v: unknown) => (typeof v === 'string' ? Number(v) : v)

/** 올린 묶음 → 효과. PATCH는 바뀐 칸만 온다(PowerSync). PUT은 새 행이 대부분이라 상태·휴지통만 본다 */
export function pushEffects(batch: unknown): Effects {
  const e: Effects = { sync: false, dismiss: [], deletedReminders: [], xp: false, reports: [], tasks: false }
  if (!Array.isArray(batch)) return e
  const dismiss = new Set<string>()
  for (const raw of batch as CrudOp[]) {
    if (!raw || typeof raw !== 'object' || typeof raw.table !== 'string' || typeof raw.id !== 'string') continue
    const { op, table, id, data } = raw
    if (SYNC_TABLES.has(table)) e.sync = true
    if (table === 'tasks') {
      e.tasks = true
      if (op === 'DELETE') dismiss.add(id)
      else {
        const st = num(data?.status)
        if (st === 1 || st === 2) dismiss.add(id)
        if (data?.deleted_at) dismiss.add(id)
        if (op === 'PATCH' && (has(data, 'due_at') || has(data, 'start_at'))) dismiss.add(id)
      }
    }
    if (table === 'reminders' && (op === 'DELETE' || (op === 'PATCH' && has(data, 'trigger')))) e.deletedReminders.push(id)
    if (table === 'xp_events') e.xp = true
    if (table === 'weekly_reports' && op !== 'DELETE' && has(data, 'text_json')) e.reports.push(id)
  }
  e.dismiss = [...dismiss]
  return e
}

/** 리포트 행 → 보낼 소식 판단에 쓰는 숫자(AI 글은 꺼내지 않는다) */
export function reportNumbers(statsJson: string | null, textJson: string | null): { completed: number; goals: number; achieved: number; hasReport: boolean; drafts: number } {
  const parse = (s: string | null) => { try { const v = s ? JSON.parse(s) : {}; return v && typeof v === 'object' ? v : {} } catch { return {} } }
  const st = parse(statsJson)
  const tx = parse(textJson)
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
  return {
    completed: n(st.completed),
    goals: Array.isArray(st.goals) ? st.goals.length : 0,
    achieved: n(st.goalsAchieved),
    hasReport: !!tx.report && typeof tx.report === 'object',
    drafts: Array.isArray(tx.draft) ? tx.draft.length : 0
  }
}

/** 알림 키에서 알림 id: 'r:<rid>@<ms>' → rid */
export const ridOfKey = (key: string) => (key.startsWith('r:') ? key.slice(2, key.lastIndexOf('@')) : null)
