// 38 휴대폰 캘린더 — 순수 계산(OS·DB 없음, 시험: link.test.ts).
// 지문·해시·꿈틀 반복 규칙 ⇄ OS 반복 규칙·시각 변환·고칠 수 있는지 판정·같은 모양 숨김·다리 판단(§6.3).
import { addDays, parseRule, stringifyRule, type Rule } from '@sprout/schema/time'

export type Platform = 'ios' | 'android'
export type DeviceProvider = 'device-ios' | 'device-android'
export const providerFor = (pf: Platform): DeviceProvider => (pf === 'ios' ? 'device-ios' : 'device-android')
export const isDeviceProvider = (p: string | null | undefined): p is DeviceProvider => p === 'device-ios' || p === 'device-android'

// ── 해시(서버에는 캘린더 id·기기 id 원문 대신 이것만 — §6.1) ──
/** 문자열 → 16자 16진수(두 갈래 53비트 해시. 암호용 아님 — 같은 값이면 같은 결과만 필요) */
export function hash16(s: string): string {
  let h1 = 0xdeadbeef ^ s.length
  let h2 = 0x41c6ce57 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
export const calHash = (calendarId: string) => `c_${hash16(`cal:${calendarId}`)}`
/** 이 앱 설치의 연결 id(§6.1) — 기기 id(sprout.deviceId) 해시 */
export const linkAccountFor = (deviceId: string) => `d_${hash16(`dev:${deviceId}`)}`

// ── 꿈틀 칸 · 지문 ──
export interface LinkFields {
  title: string
  notes: string | null
  location: string | null
  start_at: string
  end_at: string
  is_all_day: number
  repeat_rule: string | null
}
export interface LinkedRow extends LinkFields {
  id: string
  deleted_at: string | null
  modified_at: string | null
  ext_provider: string | null
  ext_account: string | null
  ext_calendar: string | null
  ext_id: string | null
  ext_etag: string | null
  ext_updated: string | null
  ext_hash: string | null
  ext_error: string | null
  color?: string | null
}
const norm = (s: string | null | undefined) => (s ?? '').replace(/\r\n/g, '\n').trim()
const normRule = (r: string | null) => { const p = parseRule(r); return p ? stringifyRule(p) : null }
export function fieldsOf(r: LinkFields): LinkFields {
  return { title: norm(r.title) || '(제목 없음)', notes: norm(r.notes) || null, location: norm(r.location) || null, start_at: r.start_at, end_at: r.end_at, is_all_day: r.is_all_day ? 1 : 0, repeat_rule: normRule(r.repeat_rule || null) }
}
/** 마지막으로 맞춘 내용 지문. 지운 상태는 'x:' 앞붙이(데스크톱 16 §12.0.1과 같은 규칙) */
export function fingerprint(r: LinkFields, deleted = false): string {
  const f = fieldsOf(r)
  const h = hash16(JSON.stringify([f.title, f.notes, f.location, f.start_at, f.end_at, f.is_all_day, f.repeat_rule]))
  return deleted ? `x:${h}` : h
}

// ── OS 모양(expo-calendar legacy Event·RecurrenceRule의 필요한 칸만) ──
export type DevFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'
export interface DevRule {
  frequency: DevFreq | string
  interval?: number
  endDate?: string | Date | null
  occurrence?: number | null
  daysOfTheWeek?: { dayOfTheWeek: number; weekNumber?: number }[] | null
  daysOfTheMonth?: number[] | null
  monthsOfTheYear?: number[] | null
}
export interface DevEvent {
  id: string
  calendarId: string
  title?: string | null
  location?: string | null
  notes?: string | null
  startDate: string | Date
  endDate: string | Date
  allDay?: boolean
  recurrenceRule?: DevRule | null
  lastModifiedDate?: string | Date | null
  organizer?: { isCurrentUser?: boolean } | null
  accessLevel?: string | null
  originalId?: string | null
  instanceId?: string | null
}
export interface DevCalendar {
  id: string
  title: string
  color: string
  allowsModifications: boolean
  type?: string | null
  source?: { name?: string | null; type?: string | null } | null
  ownerAccount?: string | null
  accessLevel?: string | null
  isPrimary?: boolean
}

// 요일: expo 1 = 일요일 … 7 = 토요일 ⇄ RRULE SU…SA
const RR = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
/** 꿈틀 반복 규칙 → OS 규칙. 없으면 null, OS로 옮길 수 없는 모양(날짜 목록)이면 'unsupported' */
export function ruleToDevice(rule: string | null | undefined): DevRule | null | 'unsupported' {
  const r = parseRule(rule)
  if (!r) return null
  if (r.rdates?.length) return 'unsupported'
  const out: DevRule = { frequency: r.freq.toLowerCase(), interval: r.interval || 1 }
  if (r.byday?.length) {
    const days = r.byday.map((d) => {
      const m = /^(-?\d+)?([A-Z]{2})$/.exec(d)
      if (!m || !RR.includes(m[2])) return null
      return m[1] ? { dayOfTheWeek: RR.indexOf(m[2]) + 1, weekNumber: Number(m[1]) } : { dayOfTheWeek: RR.indexOf(m[2]) + 1 }
    })
    if (days.some((d) => !d)) return 'unsupported'
    out.daysOfTheWeek = days as { dayOfTheWeek: number; weekNumber?: number }[]
  }
  if (r.bymonthday?.length) out.daysOfTheMonth = r.bymonthday
  if (r.bymonth?.length) out.monthsOfTheYear = r.bymonth
  if (r.until) out.endDate = untilDate(r.until)
  if (r.count) out.occurrence = r.count
  return out
}
/** 끝 날짜 = 그날 23:59:59(이 휴대폰 시각) — 그날 회차까지 들어가게 */
const untilDate = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59) }
/** OS 규칙 → 꿈틀 반복 규칙(꿈틀이 다루는 칸만) */
export function deviceToRule(r: DevRule | null | undefined): string | null {
  if (!r || !r.frequency) return null
  const freq = String(r.frequency).toUpperCase()
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null
  const rule: Rule = { freq: freq as Rule['freq'], interval: r.interval && r.interval > 0 ? r.interval : 1 }
  if (r.daysOfTheWeek?.length) rule.byday = r.daysOfTheWeek.map((d) => `${d.weekNumber ? d.weekNumber : ''}${RR[(d.dayOfTheWeek - 1 + 7) % 7]}`)
  if (r.daysOfTheMonth?.length) rule.bymonthday = r.daysOfTheMonth
  if (r.monthsOfTheYear?.length) rule.bymonth = r.monthsOfTheYear
  if (r.endDate) { const e = toDateObj(r.endDate); if (e) rule.until = localDay(e) }
  if (r.occurrence) rule.count = r.occurrence
  return stringifyRule(rule)
}

// ── 시각 ──
const pad = (n: number) => String(n).padStart(2, '0')
const toDateObj = (v: string | Date | null | undefined): Date | null => { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const utcDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
/** Date → 꿈틀 시각('YYYY-MM-DDTHH:mm', 이 휴대폰 시각) */
export const floatingOf = (d: Date) => `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const fromFloating = (f: string) => { const [day, t] = f.split('T'); const [y, m, d] = day.split('-').map(Number); const [hh, mm] = (t ?? '00:00').split(':').map(Number); return new Date(y, m - 1, d, hh || 0, mm || 0) }
const utcMidnight = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }

/**
 * OS 일정의 시작·끝 → 꿈틀 시각. 종일: iOS는 이 휴대폰 날짜, Android는 UTC 자정으로 저장돼 UTC 날짜로 읽는다.
 * 끝이 자정이면(다음 날 0시) 그 전날까지. 끝이 이상하면 시작 + fallbackMinutes.
 */
export function spanFromDevice(ev: Pick<DevEvent, 'startDate' | 'endDate' | 'allDay'>, pf: Platform, fallbackMinutes = 60): { start_at: string; end_at: string; is_all_day: number } | null {
  const s = toDateObj(ev.startDate)
  if (!s) return null
  let e = toDateObj(ev.endDate)
  if (ev.allDay) {
    const day = pf === 'android' ? utcDay : localDay
    const start = day(s)
    let end = e ? day(new Date(e.getTime() - 1000)) : start
    if (end < start) end = start
    return { start_at: start, end_at: end, is_all_day: 1 }
  }
  if (!e || e.getTime() < s.getTime()) e = new Date(s.getTime() + fallbackMinutes * 60000)
  const start = floatingOf(s)
  let end = floatingOf(e)
  // 0시에 끝나는 시각 일정은 전날 23:59로(하루짜리 블록 — 데스크톱 fixEnd와 같음)
  if (end.endsWith('T00:00') && end.slice(0, 10) > start.slice(0, 10)) { const prev = `${addDays(end.slice(0, 10), -1)}T23:59`; if (prev >= start) end = prev }
  return { start_at: start, end_at: end, is_all_day: 0 }
}
/** 꿈틀 시각 → OS에 넘길 시작·끝(종일: iOS = 그날 0시 ~ 마지막 날 23:59:59, Android = UTC 자정 ~ 다음 날 UTC 자정) */
export function spanToDevice(f: Pick<LinkFields, 'start_at' | 'end_at' | 'is_all_day'>, pf: Platform, timeZone: string): { startDate: Date; endDate: Date; allDay: boolean; timeZone: string } {
  if (f.is_all_day) {
    const a = f.start_at.slice(0, 10)
    const b = f.end_at.slice(0, 10) < a ? a : f.end_at.slice(0, 10)
    if (pf === 'android') return { startDate: utcMidnight(a), endDate: utcMidnight(addDays(b, 1)), allDay: true, timeZone: 'UTC' }
    return { startDate: fromFloating(a), endDate: new Date(fromFloating(addDays(b, 1)).getTime() - 1000), allDay: true, timeZone }
  }
  const s = fromFloating(f.start_at)
  let e = fromFloating(f.end_at)
  if (e.getTime() <= s.getTime()) e = new Date(s.getTime() + 60 * 60000)
  return { startDate: s, endDate: e, allDay: false, timeZone }
}
/** OS 일정 → 꿈틀 칸(반복이면 첫 회차 시각 + 규칙) */
export function fieldsFromDevice(ev: DevEvent, pf: Platform, fallbackMinutes = 60): LinkFields | null {
  const span = spanFromDevice(ev, pf, fallbackMinutes)
  if (!span) return null
  return fieldsOf({ title: ev.title ?? '', notes: ev.notes ?? null, location: ev.location ?? null, ...span, repeat_rule: deviceToRule(ev.recurrenceRule) })
}
/** 꿈틀 → OS 만들기·고치기 입력 */
export function deviceInput(r: LinkFields, pf: Platform, timeZone: string): { input: Record<string, unknown>; ruleLost: boolean } {
  const f = fieldsOf(r)
  const rule = ruleToDevice(f.repeat_rule)
  const span = spanToDevice(f, pf, timeZone)
  return {
    input: { title: f.title, notes: f.notes ?? '', location: f.location ?? '', ...span, recurrenceRule: rule === 'unsupported' ? null : rule },
    ruleLost: rule === 'unsupported'
  }
}

// ── 고칠 수 있는지(§4) ──
export function judgeDevice(cal: Pick<DevCalendar, 'allowsModifications' | 'type' | 'accessLevel'> | undefined, ev?: Pick<DevEvent, 'organizer' | 'accessLevel'>): { writable: boolean; reason: string | null } {
  if (cal?.type === 'birthdays' || cal?.type === 'subscribed') return { writable: false, reason: '공휴일·생일·구독 캘린더는 고칠 수 없어요' }
  if (!cal || !cal.allowsModifications) return { writable: false, reason: '이 캘린더는 보기만 할 수 있어요' }
  if (cal.accessLevel && ['read', 'freebusy', 'none', 'respond'].includes(cal.accessLevel)) return { writable: false, reason: '이 캘린더는 보기만 할 수 있어요' }
  if (ev?.organizer && ev.organizer.isCurrentUser === false) return { writable: false, reason: '주최자가 아니라 옮기거나 고칠 수 없어요' }
  return { writable: true, reason: null }
}

// ── 반복 범위(§5.4) ──
export type Span = 'this' | 'future' | 'all'
export const SPAN_LABEL: Record<Span, string> = { this: '이번 회차만', future: '이후 모든 회차', all: '모든 회차' }
export function spanChoices(pf: Platform, action: 'edit' | 'delete'): Span[] {
  if (pf === 'ios') return ['this', 'future', 'all']
  return action === 'edit' ? ['all'] : ['this', 'all']
}

// ── 같은 모양 숨김(§7) ──
/** 비교 열쇠: 제목(앞뒤 공백 없음)|시작|끝(꿈틀 모양) */
export const lookKey = (title: string | null | undefined, start: string, end: string) => `${norm(title)}|${start}|${end}`

// ── 주인 판정(§6.2) ──
export function isMine(row: { ext_provider?: string | null; ext_account?: string | null }, pf: Platform, account: string): boolean {
  return row.ext_provider === providerFor(pf) && row.ext_account === account
}

// ── 다리 판단(§6.3) ──
export type BridgeAction =
  | { kind: 'none' }
  | { kind: 'record' } // 지운 채로 아직 안 올린 것 — 지문만 맞춘다
  | { kind: 'create' }
  | { kind: 'update' }
  | { kind: 'delete' }
  | { kind: 'pull' }
  | { kind: 'remoteDeleted' }
  | { kind: 'conflict'; winner: 'mine' | 'theirs' }
/**
 * cur = 꿈틀 지금 지문, dev = 휴대폰 지금 지문(일정이 없으면 null), devModified = iOS 수정 시각(Android 없음).
 */
export function decide(row: Pick<LinkedRow, 'ext_id' | 'ext_hash' | 'deleted_at' | 'modified_at'>, cur: string, dev: string | null, devModified: string | null): BridgeAction {
  const deleted = !!row.deleted_at
  if (!row.ext_id) return deleted ? (row.ext_hash === cur ? { kind: 'none' } : { kind: 'record' }) : { kind: 'create' }
  const mineChanged = cur !== row.ext_hash
  if (dev === null) {
    if (!mineChanged) return deleted ? { kind: 'none' } : { kind: 'remoteDeleted' }
    return deleted ? { kind: 'record' } : { kind: 'create' } // 휴대폰에서 사라졌는데 꿈틀에서 고침 → 다시 만든다
  }
  const theirsChanged = dev !== row.ext_hash && !row.ext_hash?.startsWith('x:')
  if (mineChanged && theirsChanged) {
    if (dev === cur) return { kind: 'record' } // 양쪽이 같은 내용으로 바뀜
    const mine = row.deleted_at ?? row.modified_at ?? ''
    return { kind: 'conflict', winner: !devModified || mine >= devModified ? 'mine' : 'theirs' }
  }
  if (mineChanged) {
    return deleted ? { kind: 'delete' } : { kind: 'update' } // 휴대폰에 아직 있으니 되살린 것도 고치기
  }
  if (deleted) return { kind: 'none' }
  return theirsChanged ? { kind: 'pull' } : { kind: 'none' }
}
