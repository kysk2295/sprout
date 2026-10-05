// 16 캘린더 연동(구글·Apple — v1 읽기, v2 §12 양방향) — 메인·화면·시험이 같이 쓰는 형태와 순수 변환 함수.
// Node·Electron 모듈을 가져오지 않는다(렌더러도 타입을 가져다 쓴다).

export type Provider = 'google' | 'apple'
export type AccountStatus = 'ok' | 'syncing' | 'reauth' | 'scope_missing' | 'offline' | 'retrying' | 'denied' | 'restricted' | 'helper_missing'

export interface CalendarView {
  accountId: string
  calendarId: string
  hash: string // 16 §12.0.1 events.ext_calendar 값
  name: string
  color: string
  colorFg: string
  accessRole: string
  group: string // 편집 모달 묶음: 구글 '내 캘린더'/'다른 캘린더', Apple 출처 이름
  primary: boolean
  visibility: 'show' | 'hide'
  panelOn: boolean
}
export interface AccountView {
  id: string
  provider: Provider
  label: string
  status: AccountStatus
  firstSync: boolean // 아직 한 번도 끝까지 받지 못함
  lastSyncAt: string | null
  lastError: string | null
  errorSince: string | null
  memoryOnly: boolean // 토큰을 디스크에 못 둠(키체인 없음)
  canWrite: boolean // 16 §12.3: 구글 쓰기 범위(calendar.events)를 받았음(Apple은 늘 참)
  calendars: CalendarView[]
}
/** 16 §12.4 빠른 만들기 캘린더 고르기·추가 바: 쓸 수 있고 보이는 캘린더 */
export interface CalendarTarget {
  key: string // `${accountId}|${calHash}` — localStorage·events.ext_* 와 같은 값
  provider: Provider
  accountId: string
  accountLabel: string
  calendarHash: string
  name: string
  color: string
  group: string
  primary: boolean
  canWrite: boolean // 거짓이면 고를 때 쓰기 권한 대화(§12.3.2)
}
/** 16 §12.5 캐시 전용 외부 일정 고치기 */
export interface ExtPatch { title?: string; description?: string | null; location?: string | null; start?: string; end?: string; allDay?: boolean }
export type WriteScope = 'this' | 'following' | 'all'
export type WriteCode = 'offline' | 'reauth' | 'scope' | 'readonly' | 'gone' | 'conflict' | 'rate' | 'helper' | 'http' | 'notfound'
export type WriteResult = { ok: true; undo?: ExtSnapshot } | { ok: false; code: WriteCode; message: string }
/** 지운 캐시 전용 일정 되돌리기(§12.6) */
export interface ExtSnapshot { key: string; row: EventRow }
export interface CalendarToast { message: string; kind?: 'info' | 'error' }
export interface ProvidersInfo {
  google: { available: boolean; configured: boolean } // configured = GOOGLE_CLIENT_ID 있음
  apple: { available: boolean; helper: boolean } // available = macOS
  encryption: boolean
}
export interface CalendarsStatus { providers: ProvidersInfo; accounts: AccountView[]; connecting: Provider | null; cacheFrom: string }
export interface ExtEvent {
  key: string // accountId|calendarId|eventId
  accountId: string
  provider: Provider
  calendarId: string
  eventId: string
  title: string
  description: string | null
  location: string | null
  start: string // floating
  end: string // floating (종일은 마지막 날)
  allDay: boolean
  recurring: boolean
  color: string
  calendarName: string
  accountLabel: string
  stale: boolean // 계정이 다시 연결 필요 → 옅게
  hasLink: boolean
  // 16 §12.2 고칠 수 있는지(캐시 전용 외부 일정)
  writable: boolean
  readonlyReason: string | null
  needsGrant: boolean // 구글 쓰기 권한이 아직 없음 → 고치기 전에 §12.3.2 대화
  askNotify: boolean // 내가 주최자 + 다른 참석자 있음 → §12.8 메일 대화
}
export type ConnectResult = { ok: true; accountId: string; message?: string } | { ok: false; error: string; code?: string }
export interface ConnectProgress { provider: Provider; step: 'browser' | 'token' | 'sync' | 'permission' | 'done' }

// 16 §12.3.1: 새 연결은 처음부터 읽기·쓰기. v1으로 받은 events.readonly 토큰도 읽기는 계속 된다
export const SCOPE_LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
export const SCOPE_EVENTS = 'https://www.googleapis.com/auth/calendar.events'
export const SCOPE_EVENTS_READ = 'https://www.googleapis.com/auth/calendar.events.readonly'
export const SCOPES = [SCOPE_LIST, SCOPE_EVENTS] as const
const scopeSet = (scope: string) => new Set(scope.split(/\s+/))
/** 읽기에 필요한 범위(목록 + 일정 읽기 또는 쓰기) */
export const canReadScope = (scope: string) => { const s = scopeSet(scope); return s.has(SCOPE_LIST) && (s.has(SCOPE_EVENTS) || s.has(SCOPE_EVENTS_READ)) }
export const canWriteScope = (scope: string) => scopeSet(scope).has(SCOPE_EVENTS)
export const CACHE_MONTHS = 6
export const MAX_EVENTS_PER_CAL = 5000
export const APPLE_ACCOUNT_ID = 'apple'
export const APPLE_LABEL = '이 Mac의 캘린더'

// ── 날짜 ──
const pad = (n: number) => String(n).padStart(2, '0')
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
/** 절대 시각 → 그 시간대의 floating "YYYY-MM-DDTHH:mm" */
export function floating(d: Date, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}
export function addDaysStr(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}
/** floating "YYYY-MM-DDTHH:mm"(또는 날짜) → 그 시간대의 절대 시각 */
export function fromFloating(f: string, timeZone: string): Date {
  const [d, t = '00:00'] = f.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const want = Date.UTC(y, mo - 1, da, h, mi)
  let guess = want
  for (let i = 0; i < 3; i++) {
    const shown = floating(new Date(guess), timeZone)
    const [sd, st] = shown.split('T')
    const [sy, smo, sda] = sd.split('-').map(Number)
    const [sh, smi] = st.split(':').map(Number)
    const diff = want - Date.UTC(sy, smo - 1, sda, sh, smi)
    if (!diff) break
    guess += diff
  }
  return new Date(guess)
}
/** 도우미에 넘기는 ISO(밀리초 없음 — Swift ISO8601DateFormatter 기본값이 밀리초를 못 읽는다) */
export const isoNoMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

/** 오늘 − 6개월(기기 날짜 기준 "YYYY-MM-DD") */
export function cacheFrom(now: Date, timeZone: string): string {
  const today = floating(now, timeZone).slice(0, 10)
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 - CACHE_MONTHS, Math.min(d, 28)))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}
/** 끝 시각 정리: 0시에 끝나는 시각 일정은 전날 23:59로(하루짜리 블록으로 그린다) */
export function fixEnd(start: string, end: string): string {
  if (end.length > 10 && end.endsWith('T00:00') && end.slice(0, 10) > start.slice(0, 10)) {
    const prev = `${addDaysStr(end.slice(0, 10), -1)}T23:59`
    return prev >= start ? prev : end
  }
  return end < start ? start : end
}

/** HTML 설명 → 글자만(줄바꿈 유지), 최대 8KB */
export function plainText(html: string | null | undefined): string | null {
  if (!html) return null
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) => (label.replace(/<[^>]+>/g, '').trim() === href ? href : `${label} (${href})`))
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text ? text.slice(0, 8192) : null
}

// ── 캐시 행 ──
export interface EventRow {
  account_id: string
  calendar_id: string
  event_id: string
  recurring: number
  status: string
  title: string
  description: string | null
  location: string | null
  start: string
  end: string
  all_day: number
  time_zone: string | null
  link: string | null
  declined: number
  updated: string | null // 구글 updated · Apple lastModifiedDate
  // 16 §12.10 (캐시 판 2)
  base_id: string | null // 반복 원본 id(구글 recurringEventId, Apple eventIdentifier) 또는 자기 id
  etag: string | null
  event_type: string | null
  organizer_self: number // 1 = 내가 주최자(주최자 정보가 없으면 1)
  guests_can_modify: number
  has_attendees: number // 나 말고 참석자가 있음
  original_start: string | null // 구글 originalStartTime · Apple occurrenceDate (ISO)
}

// ── 구글 Events 자원 → 행 (null = 저장하지 않음 / 'delete' = 캐시에서 지움) ──
export interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  recurringEventId?: string
  eventType?: string
  updated?: string
  etag?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  attendees?: { self?: boolean; responseStatus?: string; resource?: boolean; email?: string }[]
  organizer?: { self?: boolean; email?: string }
  guestsCanModify?: boolean
  recurrence?: string[]
  originalStartTime?: { date?: string; dateTime?: string }
}
export function mapGoogleEvent(ev: GoogleEvent, accountId: string, calendarId: string, timeZone: string): EventRow | 'delete' | null {
  if (ev.status === 'cancelled') return 'delete'
  if (ev.eventType === 'workingLocation') return null // 16 §7.3: 근무 위치는 그리지 않는다
  if (!ev.start || !ev.end) return null
  let start: string
  let end: string
  const allDay = !!ev.start.date
  if (allDay) {
    start = ev.start.date!
    end = addDaysStr(ev.end.date ?? ev.start.date!, -1) // 구글 종일 끝 = 다음 날(배타)
    if (end < start) end = start
  } else {
    if (!ev.start.dateTime || !ev.end.dateTime) return null
    const s = new Date(ev.start.dateTime)
    const e = new Date(ev.end.dateTime)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
    start = floating(s, timeZone)
    end = fixEnd(start, floating(e, timeZone))
  }
  const self = ev.attendees?.find((a) => a.self)
  return {
    account_id: accountId,
    calendar_id: calendarId,
    event_id: ev.id,
    recurring: ev.recurringEventId ? 1 : 0,
    status: ev.status ?? 'confirmed',
    title: ev.summary?.trim() || '(제목 없음)',
    description: plainText(ev.description),
    location: ev.location?.trim() || null,
    start,
    end,
    all_day: allDay ? 1 : 0,
    time_zone: ev.start.timeZone ?? null,
    link: ev.htmlLink ?? null,
    declined: self?.responseStatus === 'declined' ? 1 : 0,
    updated: ev.updated ?? null,
    base_id: ev.recurringEventId ?? ev.id,
    etag: ev.etag ?? null,
    event_type: ev.eventType ?? null,
    organizer_self: !ev.organizer || ev.organizer.self ? 1 : 0,
    guests_can_modify: ev.guestsCanModify ? 1 : 0,
    has_attendees: (ev.attendees ?? []).some((a) => !a.self && !a.resource) ? 1 : 0,
    original_start: ev.originalStartTime?.dateTime ?? ev.originalStartTime?.date ?? null
  }
}

// ── Apple 도우미 JSON → 행 ──
export interface AppleEvent { id: string; calendarId: string; title?: string; notes?: string | null; location?: string | null; url?: string | null; start: string; end: string; allDay?: boolean; timeZone?: string | null; recurring?: boolean; status?: string; declined?: boolean
  modifiedAt?: string | null; occurrence?: string | null; organizerIsMe?: boolean; hasAttendees?: boolean; rrule?: string | null }
export interface AppleCalendar { id: string; title: string; color?: string; source?: string; sourceType?: string; type?: string; allowsModify?: boolean; isDefault?: boolean }
export function mapAppleEvent(ev: AppleEvent, timeZone: string): EventRow | null {
  const s = new Date(ev.start)
  const e = new Date(ev.end)
  if (!ev.id || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  if (ev.status === 'canceled' || ev.status === 'cancelled') return null
  let start: string
  let end: string
  if (ev.allDay) {
    // EventKit 종일: 시작 = 그날 0시(기기 시간대), 끝 = 마지막 날 23:59:59 → 날짜만
    start = floating(s, timeZone).slice(0, 10)
    end = floating(new Date(e.getTime() - 1000), timeZone).slice(0, 10)
    if (end < start) end = start
  } else {
    start = floating(s, timeZone)
    end = fixEnd(start, floating(e, timeZone))
  }
  return {
    account_id: APPLE_ACCOUNT_ID,
    calendar_id: ev.calendarId,
    event_id: `${ev.id}@${ev.start}`, // 반복 회차는 같은 id라 시작 시각을 붙인다
    recurring: ev.recurring ? 1 : 0,
    status: 'confirmed',
    title: ev.title?.trim() || '(제목 없음)',
    description: ev.notes ? ev.notes.slice(0, 8192) : null,
    location: ev.location?.trim() || null,
    start,
    end,
    all_day: ev.allDay ? 1 : 0,
    time_zone: ev.timeZone ?? null,
    link: ev.id,
    declined: ev.declined ? 1 : 0,
    updated: ev.modifiedAt ?? null,
    base_id: ev.id,
    etag: null,
    event_type: null,
    organizer_self: ev.organizerIsMe === false ? 0 : 1,
    guests_can_modify: 0,
    has_attendees: ev.hasAttendees ? 1 : 0,
    original_start: ev.occurrence ?? ev.start
  }
}

// ── 16 §12.2 고칠 수 있는지 ──
const STALE: AccountStatus[] = ['reauth', 'scope_missing', 'denied', 'restricted', 'helper_missing']
export function judgeWritable(x: { provider: Provider; accessRole: string; calendarId: string; acctStatus: AccountStatus; eventType?: string | null; organizerSelf?: number; guestsCanModify?: number }): { writable: boolean; reason: string | null } {
  if (STALE.includes(x.acctStatus)) return { writable: false, reason: x.provider === 'google' ? '구글 계정을 다시 연결해 주세요' : '캘린더 접근을 다시 허용해 주세요' }
  if (x.provider === 'google' && /#holiday@group\.v\.calendar\.google\.com$|#contacts@group\.v\.calendar\.google\.com$/.test(x.calendarId)) return { writable: false, reason: '공휴일·생일 캘린더는 고칠 수 없어요' }
  if (x.eventType === 'birthday') return { writable: false, reason: '공휴일·생일 캘린더는 고칠 수 없어요' }
  if (!['owner', 'writer'].includes(x.accessRole)) return { writable: false, reason: '이 캘린더는 보기만 할 수 있어요' }
  if (x.eventType && !['default', ''].includes(x.eventType)) return { writable: false, reason: '구글 캘린더에서만 고칠 수 있는 일정이에요' }
  if (x.organizerSelf === 0 && !x.guestsCanModify) return { writable: false, reason: '주최자가 아니라 옮기거나 고칠 수 없어요' }
  return { writable: true, reason: null }
}
/** 캘린더 단위(만들기 대상): 계정 상태·권한만 본다 */
export const calendarWritable = (provider: Provider, accessRole: string, calendarId: string, acctStatus: AccountStatus) => judgeWritable({ provider, accessRole, calendarId, acctStatus }).writable

/** 상태 → 설정 행 오른쪽 글자 (16 §3.2·§11.2). danger = 빨강 */
export function statusText(a: Pick<AccountView, 'status' | 'lastSyncAt' | 'errorSince' | 'firstSync'>, now = Date.now()): { text: string; danger: boolean; action?: 'reconnect' | 'settings' } {
  const ago = (iso: string | null) => {
    if (!iso) return ''
    const min = Math.floor((now - Date.parse(iso)) / 60000)
    return min < 1 ? '방금 동기화' : min < 60 ? `${min}분 전에 동기화` : min < 60 * 24 ? `${Math.floor(min / 60)}시간 전에 동기화` : `${Math.floor(min / 1440)}일 전에 동기화`
  }
  const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : '없음')
  switch (a.status) {
    case 'reauth': return { text: '다시 연결이 필요해요', danger: true, action: 'reconnect' }
    case 'scope_missing': return { text: '일정 읽기 권한이 빠졌어요', danger: true, action: 'reconnect' }
    case 'denied': return { text: '캘린더 접근이 꺼져 있어요', danger: true, action: 'settings' }
    case 'restricted': return { text: '이 Mac에서는 캘린더 접근이 제한돼 있어요', danger: true }
    case 'helper_missing': return { text: '캘린더 도우미가 없어요. 앱을 다시 설치해 주세요.', danger: true }
    case 'offline': return { text: `오프라인 · 마지막 동기화 ${clock(a.lastSyncAt)}`, danger: false }
    case 'syncing': return a.firstSync ? { text: '일정을 가져오는 중…', danger: false } : { text: ago(a.lastSyncAt) || '일정을 가져오는 중…', danger: false }
    case 'retrying': {
      const long = a.errorSince && now - Date.parse(a.errorSince) > 5 * 60_000
      return { text: long ? '잠시 뒤 다시 시도할게요' : ago(a.lastSyncAt) || '일정을 가져오는 중…', danger: false }
    }
    default: return { text: a.firstSync ? '일정을 가져오는 중…' : ago(a.lastSyncAt), danger: false }
  }
}
