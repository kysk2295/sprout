// 날짜·시간·알림·반복 계산 — 03-date-picker §3·§8·§9.
// 앱(렌더러: 날짜 선택기·반복 완료)과 메인 프로세스(알림 예약)가 함께 쓴다.
// 시간은 floating: 종일 'YYYY-MM-DD', 시각 'YYYY-MM-DDTHH:mm' (오프셋 없음)

const pad = (n: number) => String(n).padStart(2, '0')
export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const RR_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

// ── floating 시간 ──
export const hasTime = (f: string | null | undefined): f is string => !!f && f.includes('T')
export const datePart = (f: string) => f.slice(0, 10)
export const timePart = (f: string) => (f.includes('T') ? f.slice(11, 16) : null)
export function toDate(f: string): Date {
  return new Date(f.includes('T') ? f : `${f}T00:00`)
}
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function fromDate(d: Date, withTime: boolean): string {
  return withTime ? `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : dateKey(d)
}
export function addDays(f: string, n: number): string {
  const d = toDate(f)
  d.setDate(d.getDate() + n)
  return fromDate(d, hasTime(f))
}
export function addMinutes(f: string, n: number): string {
  const d = toDate(f)
  d.setMinutes(d.getMinutes() + n)
  return fromDate(d, true)
}
export const withDate = (f: string | null, date: string) => (f && hasTime(f) ? `${date}T${timePart(f)}` : date)
export const withTimeOf = (date: string, time: string | null) => (time ? `${datePart(date)}T${time}` : datePart(date))
export const daysBetween = (a: string, b: string) => Math.round((toDate(datePart(b)).getTime() - toDate(datePart(a)).getTime()) / 86400000)
export const minutesBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 60000)
export function nextWholeHour(now = new Date()): string {
  const d = new Date(now)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return fromDate(d, true)
}

/** 한시~열두시 고유어 수(긴 말 먼저) — 04 빠른 추가 "내일 세시 반" */
export const NATIVE_HOURS: [string, number][] = [['열한', 11], ['열두', 12], ['다섯', 5], ['여섯', 6], ['일곱', 7], ['여덟', 8], ['아홉', 9], ['열', 10], ['한', 1], ['두', 2], ['세', 3], ['네', 4]]
/** 시각 앞말: 오전·아침·새벽 = 오전, 오후·저녁 = 오후, 낮(12·1~6시 = 낮), 밤(6~11시 = 오후, 1~5시 = 새벽, 12시는 모호해서 안 읽음) */
export const TIME_PREFIXES = ['오전', '오후', '아침', '저녁', '새벽', '낮', '밤'] as const

/** "1730", "930", "17:30", "5:30pm", "5pm", "오후 5:30", "17시 30분", "17시", "세시", "오후 세시 반", "저녁 일곱시", "3시 정각" → "HH:mm" */
export function parseTimeInput(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let pm: boolean | undefined
  let word: string | undefined
  if (/^(오후|pm)/.test(s) || /(pm|p)$/.test(s)) pm = true
  if (/^(오전|am)/.test(s) || /(am|a)$/.test(s)) pm = false
  const pre = s.match(/^(아침|저녁|새벽|낮|밤)/)
  if (pre) { word = pre[1]; s = s.slice(word.length) }
  s = s.replace(/^(오전|오후|am|pm)/, '').replace(/(am|pm|a|p)$/, '')
  // 고유어 시(세시 → 3시) · 반 → 30분 · 정각 → 0분
  for (const [w, n] of NATIVE_HOURS) if (s.startsWith(`${w}시`)) { s = `${n}${s.slice(w.length)}`; break }
  s = s.replace(/시반$/, '시30분').replace(/시정각$/, '시')
  let h: number
  let m = 0
  let mt: RegExpMatchArray | null
  if ((mt = s.match(/^(\d{1,2})시(?:(\d{1,2})분?)?$/))) [h, m] = [Number(mt[1]), Number(mt[2] ?? 0)]
  else if ((mt = s.match(/^(\d{1,2})[:.](\d{2})$/))) [h, m] = [Number(mt[1]), Number(mt[2])]
  else if ((mt = s.match(/^(\d{3,4})$/))) [h, m] = [Number(mt[1].slice(0, -2)), Number(mt[1].slice(-2))]
  else if ((mt = s.match(/^(\d{1,2})$/))) h = Number(mt[1])
  else return null
  if (word) {
    if (h > 12) return null // "저녁 19시"처럼 겹치면 읽지 않는다
    if (word === '아침' || word === '새벽') pm = false
    else if (word === '저녁') { if (h === 12) return null; pm = true }
    else if (word === '낮') pm = h === 12 || h <= 6
    else if (word === '밤') { if (h === 12) return null; pm = h >= 6 }
  }
  if (pm === true && h < 12) h += 12
  if (pm === false && h === 12) h = 0
  if (h > 23 || m > 59) return null
  return `${pad(h)}:${pad(m)}`
}
export function formatTimeKo(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(m)}`
}

// ── 알림 트리거(03 §3.2, §9) ──
// 시각 태스크: 시작(없으면 마감) 기준 상대값. 종일 태스크: 마감일 0시 기준 상대값. 'END' 접두 = 기간 태스크의 끝 기준.
export const ALL_DAY_PRESETS: [string, string][] = [
  ['PT9H', '당일 (09:00)'], ['-PT15H', '1일 전 (09:00)'], ['-P1DT15H', '2일 전 (09:00)'], ['-P2DT15H', '3일 전 (09:00)'], ['-P6DT15H', '1주 전 (09:00)']
]
export const TIMED_PRESETS: [string, string][] = [
  ['-PT0M', '정각에'], ['-PT5M', '5분 전'], ['-PT30M', '30분 전'], ['-PT1H', '1시간 전'], ['-P1D', '1일 전']
]
export const END_TRIGGER = 'END-PT0M'

/** ISO 8601 기간 → 분(부호 포함) */
export function durationMinutes(iso: string): number {
  const m = iso.replace(/^END/, '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/)
  if (!m) return 0
  const [, sign, w, d, h, mi] = m
  const total = Number(w ?? 0) * 10080 + Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(mi ?? 0)
  return sign === '-' ? -total : total
}
export function minutesToDuration(min: number): string {
  const sign = min < 0 ? '-' : ''
  let a = Math.abs(min)
  const d = Math.floor(a / 1440)
  a -= d * 1440
  const h = Math.floor(a / 60)
  const m = a - h * 60
  const t = h || m || !d ? `T${h ? `${h}H` : ''}${m || (!h && !d) ? `${m}M` : ''}` : ''
  return `${sign}P${d ? `${d}D` : ''}${t}`
}
export function reminderFireTime(t: { start_at?: string | null; due_at: string | null; is_all_day?: number | null }, trigger: string): Date | null {
  if (!t.due_at) return null
  const allDay = !hasTime(t.due_at)
  const base = trigger.startsWith('END') ? t.due_at : allDay ? datePart(t.start_at ?? t.due_at) : (t.start_at ?? t.due_at)
  const d = toDate(allDay ? datePart(base) : base)
  d.setMinutes(d.getMinutes() + durationMinutes(trigger))
  return d
}
export function reminderLabel(trigger: string, allDay: boolean): string {
  if (trigger === END_TRIGGER) return '끝날 때'
  const preset = [...ALL_DAY_PRESETS, ...TIMED_PRESETS].find(([v]) => v === trigger)
  if (preset && (allDay ? ALL_DAY_PRESETS : TIMED_PRESETS).includes(preset)) return preset[1]
  const min = durationMinutes(trigger)
  if (allDay) {
    const dayOffset = Math.floor(min / 1440)
    const within = min - dayOffset * 1440
    const time = `${pad(Math.floor(within / 60))}:${pad(within % 60)}`
    return dayOffset === 0 ? `당일 (${time})` : `${-dayOffset}일 전 (${time})`
  }
  const a = -min
  if (a === 0) return '정각에'
  if (a % 1440 === 0) return `${a / 1440}일 전`
  if (a % 60 === 0) return `${a / 60}시간 전`
  return `${a}분 전`
}

// ── 반복 RRULE(03 §3.3, §8, §9) ──
export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export interface Rule {
  freq: Freq
  interval: number
  byday?: string[] // 'MO' (주) · '3TU' / '-1FR' (월의 n번째 요일)
  bymonthday?: number[] // 20, -1(마지막 날)
  bymonth?: number[]
  until?: string // YYYY-MM-DD
  count?: number // 남은 횟수(03 §3.3 저장 방식)
  rdates?: string[] // 특정 날짜 반복
}

export function parseRule(s: string | null | undefined): Rule | null {
  if (!s) return null
  const parts = Object.fromEntries(s.split(';').map((p) => p.split('=') as [string, string]))
  if (parts.RDATE) {
    return { freq: 'DAILY', interval: 1, rdates: parts.RDATE.split(',').map(fromIcsDate), until: parts.UNTIL ? fromIcsDate(parts.UNTIL) : undefined }
  }
  if (!parts.FREQ) return null
  return {
    freq: parts.FREQ as Freq,
    interval: Number(parts.INTERVAL ?? 1) || 1,
    byday: parts.BYDAY ? parts.BYDAY.split(',') : undefined,
    bymonthday: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(Number) : undefined,
    bymonth: parts.BYMONTH ? parts.BYMONTH.split(',').map(Number) : undefined,
    until: parts.UNTIL ? fromIcsDate(parts.UNTIL) : undefined,
    count: parts.COUNT ? Number(parts.COUNT) : undefined
  }
}
const toIcsDate = (d: string) => d.replace(/-/g, '')
const fromIcsDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
export function stringifyRule(r: Rule): string {
  if (r.rdates?.length) return [`RDATE=${r.rdates.map(toIcsDate).join(',')}`, r.until && `UNTIL=${toIcsDate(r.until)}`].filter(Boolean).join(';')
  return [
    `FREQ=${r.freq}`,
    r.interval > 1 && `INTERVAL=${r.interval}`,
    r.byday?.length && `BYDAY=${r.byday.join(',')}`,
    r.bymonthday?.length && `BYMONTHDAY=${r.bymonthday.join(',')}`,
    r.bymonth?.length && `BYMONTH=${r.bymonth.join(',')}`,
    r.until && `UNTIL=${toIcsDate(r.until)}`,
    r.count && `COUNT=${r.count}`
  ].filter(Boolean).join(';')
}

const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate()
/** 그 달의 n번째(음수면 뒤에서) 요일 */
function nthWeekday(y: number, m0: number, n: number, wd: number): Date | null {
  if (n > 0) {
    const first = new Date(y, m0, 1)
    const day = 1 + ((wd - first.getDay() + 7) % 7) + (n - 1) * 7
    return day <= daysInMonth(y, m0) ? new Date(y, m0, day) : null
  }
  const lastDay = daysInMonth(y, m0)
  const last = new Date(y, m0, lastDay)
  const day = lastDay - ((last.getDay() - wd + 7) % 7) + (n + 1) * 7
  return day >= 1 ? new Date(y, m0, day) : null
}
const monthDays = (r: Rule, y: number, m0: number, anchorDay: number): Date[] => {
  const out: Date[] = []
  if (r.byday?.length) {
    for (const bd of r.byday) {
      const mt = bd.match(/^(-?\d+)?([A-Z]{2})$/)
      if (!mt) continue
      const d = nthWeekday(y, m0, Number(mt[1] ?? 1), RR_DAYS.indexOf(mt[2]))
      if (d) out.push(d)
    }
  } else {
    for (const md of r.bymonthday ?? [anchorDay]) {
      const dim = daysInMonth(y, m0)
      out.push(new Date(y, m0, md < 0 ? dim + md + 1 : Math.min(md, dim))) // 없는 날(31일 등)은 그 달 마지막 날 [임시]
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * 다음 회차 날짜(YYYY-MM-DD). 반복이 끝나면 null.
 * from = 이번 회차 날짜(마감일 기준) 또는 완료한 날(완료일 기준 — 주기만 쓴다).
 */
export function nextOccurrence(r: Rule, from: string, mode: 'due' | 'completion' = 'due'): string | null {
  if (r.count !== undefined && r.count <= 1) return null
  const anchor = toDate(datePart(from))
  let next: Date | null = null
  if (r.rdates?.length) {
    const n = r.rdates.filter((d) => d > datePart(from)).sort()[0]
    next = n ? toDate(n) : null
  } else if (mode === 'completion') {
    next = new Date(anchor)
    if (r.freq === 'DAILY') next.setDate(next.getDate() + r.interval)
    if (r.freq === 'WEEKLY') next.setDate(next.getDate() + 7 * r.interval)
    if (r.freq === 'MONTHLY') next.setMonth(next.getMonth() + r.interval)
    if (r.freq === 'YEARLY') next.setFullYear(next.getFullYear() + r.interval)
  } else if (r.freq === 'DAILY') {
    next = new Date(anchor)
    next.setDate(next.getDate() + r.interval)
  } else if (r.freq === 'WEEKLY') {
    const days = (r.byday?.length ? r.byday : [RR_DAYS[anchor.getDay()]]).map((d) => RR_DAYS.indexOf(d.slice(-2))).sort()
    // 같은 주(월요일 시작)에서 남은 요일 → 없으면 interval주 뒤 첫 요일
    const mondayIdx = (d: number) => (d + 6) % 7
    const later = days.map(mondayIdx).sort((a, b) => a - b).find((d) => d > mondayIdx(anchor.getDay()))
    next = new Date(anchor)
    if (later !== undefined) next.setDate(next.getDate() + (later - mondayIdx(anchor.getDay())))
    else {
      const first = Math.min(...days.map(mondayIdx))
      next.setDate(next.getDate() - mondayIdx(anchor.getDay()) + 7 * r.interval + first)
    }
  } else if (r.freq === 'MONTHLY') {
    const sameMonth = monthDays(r, anchor.getFullYear(), anchor.getMonth(), anchor.getDate()).find((d) => d > anchor)
    if (sameMonth) next = sameMonth
    else {
      for (let k = 1; k <= 48 && !next; k++) {
        const y = anchor.getFullYear()
        const m = anchor.getMonth() + k * r.interval
        next = monthDays(r, y + Math.floor(m / 12), ((m % 12) + 12) % 12, anchor.getDate())[0] ?? null
      }
    }
  } else if (r.freq === 'YEARLY') {
    const month = (r.bymonth?.[0] ?? anchor.getMonth() + 1) - 1
    const day = r.bymonthday?.[0] ?? anchor.getDate()
    const y = anchor.getFullYear() + r.interval
    next = new Date(y, month, Math.min(day, daysInMonth(y, month)))
  }
  if (!next) return null
  const key = dateKey(next)
  if (r.until && key > r.until) return null
  return key
}

const NTH_KO: Record<string, string> = { '1': '첫째', '2': '둘째', '3': '셋째', '4': '넷째', '5': '다섯째', '-1': '마지막' }
/** "매주 금요일", "2일마다", "매월 셋째 화요일", "평일마다" … (03 §3.3 요약 문구) */
export function ruleSummary(r: Rule | null, anchor?: string | null): string {
  if (!r) return ''
  const a = anchor ? toDate(datePart(anchor)) : new Date()
  let s: string
  if (r.rdates?.length) s = `특정 날짜 ${r.rdates.length}일`
  else if (r.freq === 'DAILY') s = r.interval > 1 ? `${r.interval}일마다` : '매일'
  else if (r.freq === 'WEEKLY') {
    const days = r.byday?.length ? r.byday : [RR_DAYS[a.getDay()]]
    const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR']
    if (r.interval === 1 && days.length === 5 && weekdays.every((d) => days.includes(d))) s = '평일마다'
    else {
      const names = [...days].sort((x, y) => ((RR_DAYS.indexOf(x) + 6) % 7) - ((RR_DAYS.indexOf(y) + 6) % 7)).map((d) => WEEKDAY_KO[RR_DAYS.indexOf(d)])
      s = `${r.interval > 1 ? `${r.interval}주마다` : '매주'} ${names.length === 1 ? `${names[0]}요일` : names.join(', ')}`
    }
  } else if (r.freq === 'MONTHLY') {
    const head = r.interval > 1 ? `${r.interval}개월마다` : '매월'
    if (r.byday?.length) {
      const mt = r.byday[0].match(/^(-?\d+)?([A-Z]{2})$/)!
      s = `${head} ${NTH_KO[mt[1] ?? '1'] ?? `${mt[1]}번째`} ${WEEKDAY_KO[RR_DAYS.indexOf(mt[2])]}요일`
    } else {
      const md = r.bymonthday ?? [a.getDate()]
      s = `${head} ${md.map((d) => (d === -1 ? '마지막 날' : `${d}일`)).join(', ')}`
    }
  } else {
    const month = r.bymonth?.[0] ?? a.getMonth() + 1
    const day = r.bymonthday?.[0] ?? a.getDate()
    s = `${r.interval > 1 ? `${r.interval}년마다` : '매년'} ${month}월 ${day}일`
  }
  if (r.until) s += ` · ${Number(r.until.slice(5, 7))}월 ${Number(r.until.slice(8, 10))}일까지`
  if (r.count) s += ` · ${r.count}회 남음`
  return s
}

/** 03 §3.3 반복 목록(선택한 날짜 기준 보조 표기 포함) */
export function repeatPresets(anchor: string): { label: string; hint?: string; rule: string }[] {
  const a = toDate(datePart(anchor))
  const wd = RR_DAYS[a.getDay()]
  return [
    { label: '매일', rule: 'FREQ=DAILY' },
    { label: '매주', hint: `${WEEKDAY_KO[a.getDay()]}요일`, rule: `FREQ=WEEKLY;BYDAY=${wd}` },
    { label: '매월', hint: `${a.getDate()}일`, rule: `FREQ=MONTHLY;BYMONTHDAY=${a.getDate()}` },
    { label: '매년', hint: `${a.getMonth() + 1}월 ${a.getDate()}일`, rule: `FREQ=YEARLY;BYMONTH=${a.getMonth() + 1};BYMONTHDAY=${a.getDate()}` },
    { label: '평일마다', hint: '월~금', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }
  ]
}
export const RR_DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export const rrDayLabel = (code: string) => WEEKDAY_KO[RR_DAYS.indexOf(code)]

// ── 시간대를 정해 계산하기(32 §4.1) — 서버(기기의 IANA 시간대)와 휴대폰이 같은 알림 시각(ms)을 얻는다 ──
// 위의 함수들은 "이 컴퓨터의 시간대"로 계산한다. 아래는 시간대를 인자로 받는 같은 계산(Intl만 쓴다, 의존성 없음).
// 규칙은 JS Date와 같다: 없는 시각(서머타임 시작의 빈 시간)은 바뀌기 전 오프셋으로, 두 번 있는 시각은 앞의 것으로.

const dtfCache = new Map<string, Intl.DateTimeFormat>()
function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    dtfCache.set(timeZone, f)
  }
  return f
}
/** 올바른 IANA 시간대 이름인가 */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try { dtf(tz); return true } catch { return false }
}
export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** 그 순간(ms)의 그 시간대 벽시계 */
export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const p: Record<string, string> = {}
  for (const { type, value } of dtf(timeZone).formatToParts(new Date(ms))) p[type] = value
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second), weekday: WD_EN.indexOf(p.weekday) }
}
/** 그 순간의 시간대 오프셋(분, UTC보다 앞서면 +) */
function offsetMin(ms: number, timeZone: string): number {
  const z = zonedParts(ms, timeZone)
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second)
  return Math.round((asUtc - (ms - (((ms % 1000) + 1000) % 1000))) / 60000)
}
/** 그 시간대의 날짜 'YYYY-MM-DD' */
export function dayKeyIn(ms: number, timeZone: string): string {
  const z = zonedParts(ms, timeZone)
  return `${z.year}-${pad(z.month)}-${pad(z.day)}`
}
/** 떠 있는 시각('YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm')을 그 시간대의 순간(ms)으로 */
export function floatingToMs(f: string, timeZone: string): number {
  const [d, t = '00:00'] = f.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, da, h, mi)
  if (Number.isNaN(wall)) return NaN
  const before = offsetMin(wall - 36 * 3600_000, timeZone)
  const after = offsetMin(wall + 36 * 3600_000, timeZone)
  const t1 = wall - before * 60000
  if (before === after) return t1
  const t2 = wall - after * 60000
  const ok1 = offsetMin(t1, timeZone) === before
  const ok2 = offsetMin(t2, timeZone) === after
  if (ok1 && ok2) return Math.min(t1, t2) // 두 번 있는 시각 → 앞의 것
  if (ok1) return t1
  if (ok2) return t2
  return t1 // 없는 시각 → 바뀌기 전 오프셋(JS Date와 같다)
}
/** 그 순간의 그 시간대 벽시계를 떠 있는 시각 'YYYY-MM-DDTHH:mm'으로 */
export function msToFloating(ms: number, timeZone: string): string {
  const z = zonedParts(ms, timeZone)
  return `${z.year}-${pad(z.month)}-${pad(z.day)}T${pad(z.hour)}:${pad(z.minute)}`
}
/**
 * reminderFireTime()의 시간대 버전: 알림이 울리는 순간(ms). 없으면 null.
 * reminderFireTime은 기준 시각을 Date로 만든 뒤 벽시계에서 분을 더한다(setMinutes) — 같은 순서로 계산해 결과가 같다.
 */
export function reminderFireTimeIn(t: { start_at?: string | null; due_at: string | null; is_all_day?: number | null }, trigger: string, timeZone: string): number | null {
  if (!t.due_at) return null
  const allDay = !hasTime(t.due_at)
  const base = trigger.startsWith('END') ? t.due_at : allDay ? datePart(t.start_at ?? t.due_at) : (t.start_at ?? t.due_at)
  const baseMs = floatingToMs(allDay ? datePart(base) : base, timeZone)
  if (Number.isNaN(baseMs)) return null
  const z = zonedParts(baseMs, timeZone)
  const wall = new Date(Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute + durationMinutes(trigger)))
  return floatingToMs(wall.toISOString().slice(0, 16), timeZone)
}
