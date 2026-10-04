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

/** "1730", "930", "17:30", "5:30pm", "5pm", "오후 5:30", "17시 30분", "17시" → "HH:mm" */
export function parseTimeInput(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let pm: boolean | undefined
  if (/^(오후|pm)/.test(s) || /(pm|p)$/.test(s)) pm = true
  if (/^(오전|am)/.test(s) || /(am|a)$/.test(s)) pm = false
  s = s.replace(/^(오전|오후|am|pm)/, '').replace(/(am|pm|a|p)$/, '')
  let h: number
  let m = 0
  let mt: RegExpMatchArray | null
  if ((mt = s.match(/^(\d{1,2})시(?:(\d{1,2})분?)?$/))) [h, m] = [Number(mt[1]), Number(mt[2] ?? 0)]
  else if ((mt = s.match(/^(\d{1,2})[:.](\d{2})$/))) [h, m] = [Number(mt[1]), Number(mt[2])]
  else if ((mt = s.match(/^(\d{3,4})$/))) [h, m] = [Number(mt[1].slice(0, -2)), Number(mt[1].slice(-2))]
  else if ((mt = s.match(/^(\d{1,2})$/))) h = Number(mt[1])
  else return null
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
