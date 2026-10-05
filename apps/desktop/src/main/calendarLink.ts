// 16 §12.0 연결된 일정(꿈틀 events ⇄ 구글·Apple) — 지문·캘린더 해시·반복 규칙 변환·구글/Apple 모양 변환. 순수 함수(Node crypto만).
import { createHash } from 'node:crypto'
import { parseRule, stringifyRule } from '@sprout/schema/time'
import { addDaysStr, floating, fromFloating, isoNoMs, plainText, type AppleEvent, type GoogleEvent } from '../shared/calendars'

/** 맞춰 보는 칸(꿈틀 events와 같은 이름) */
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
  ext_provider: 'google' | 'apple' | null
  ext_account: string | null
  ext_calendar: string | null
  ext_id: string | null
  ext_etag: string | null
  ext_updated: string | null
  ext_hash: string | null
  ext_error: string | null
  color?: string | null
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
/** 캘린더 id → 서버에 올려도 되는 해시(구글 캘린더 id는 이메일 모양) */
export const calHash = (calendarId: string) => `c_${sha(calendarId).slice(0, 16)}`
/** 꿈틀 일정 id → 구글 일정 id(base32hex 글자만, 5~1024자). 두 기기가 같이 올려도 409로 한 번만 생긴다 */
export const googleIdFor = (sproutId: string) => `kk${sproutId.toLowerCase().replace(/[^0-9a-f]/g, '')}`

const norm = (s: string | null | undefined) => (s ?? '').replace(/\r\n/g, '\n').trim()
export function fieldsOf(r: LinkFields): LinkFields {
  return { title: norm(r.title) || '(제목 없음)', notes: norm(r.notes) || null, location: norm(r.location) || null, start_at: r.start_at, end_at: r.end_at, is_all_day: r.is_all_day ? 1 : 0, repeat_rule: r.repeat_rule || null }
}
/** 마지막으로 맞춘 내용 지문. 지운 상태는 'x:' 앞붙이 */
export function fingerprint(r: LinkFields, deleted = false): string {
  const f = fieldsOf(r)
  const h = sha(JSON.stringify([f.title, f.notes, f.location, f.start_at, f.end_at, f.is_all_day, normRule(f.repeat_rule)])).slice(0, 16)
  return deleted ? `x:${h}` : h
}
const normRule = (r: string | null) => { const p = parseRule(r); return p ? stringifyRule(p) : null }

// ── 반복 규칙 ⇄ iCalendar ──
/** 꿈틀 반복 규칙 → 구글 recurrence 줄 */
export function ruleToIcs(rule: string | null, opts: { timed: boolean; startTime?: string; timeZone: string }): string[] {
  const r = parseRule(rule)
  if (!r) return []
  if (r.rdates?.length) {
    const dates = r.rdates.map((d) => d.replace(/-/g, ''))
    if (!opts.timed) return [`RDATE;VALUE=DATE:${dates.join(',')}`]
    const t = (opts.startTime ?? '00:00').replace(':', '') + '00'
    return [`RDATE;TZID=${opts.timeZone}:${dates.map((d) => `${d}T${t}`).join(',')}`]
  }
  const parts = stringifyRule(r).split(';').map((p) => {
    if (opts.timed && p.startsWith('UNTIL=') && p.length === 14) return `${p}T235959Z` // 시각 일정의 UNTIL은 UTC 날짜·시각
    return p
  })
  return [`RRULE:${parts.join(';')}`]
}
/** 구글·Apple RRULE 줄들 → 꿈틀 반복 규칙(꿈틀이 다루는 칸만) */
export function icsToRule(lines: string[] | null | undefined): string | null {
  if (!lines?.length) return null
  const rr = lines.find((l) => l.startsWith('RRULE:'))
  if (rr) {
    const kv = Object.fromEntries(rr.slice(6).split(';').map((p) => p.split('=') as [string, string]))
    const keep = ['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'UNTIL', 'COUNT']
    const body = keep.filter((k) => kv[k]).map((k) => `${k}=${k === 'UNTIL' ? kv[k].slice(0, 8) : kv[k]}`).join(';')
    return normRule(body)
  }
  const rd = lines.find((l) => l.startsWith('RDATE'))
  if (rd) {
    const dates = rd.slice(rd.indexOf(':') + 1).split(',').map((d) => d.slice(0, 8))
    return normRule(`RDATE=${dates.join(',')}`)
  }
  return null
}

// ── 구글 ──
export function googleTimes(f: Pick<LinkFields, 'start_at' | 'end_at' | 'is_all_day'>, timeZone: string) {
  if (f.is_all_day) return { start: { date: f.start_at.slice(0, 10), dateTime: null }, end: { date: addDaysStr(f.end_at.slice(0, 10), 1), dateTime: null } }
  return { start: { dateTime: `${f.start_at}:00`, timeZone, date: null }, end: { dateTime: `${f.end_at}:00`, timeZone, date: null } }
}
/** 꿈틀 → 구글 일정 몸통(만들기·고치기 공통) */
export function googleBody(r: LinkFields, timeZone: string) {
  const f = fieldsOf(r)
  return {
    summary: f.title,
    description: f.notes ?? '',
    location: f.location ?? '',
    ...googleTimes(f, timeZone),
    recurrence: ruleToIcs(f.repeat_rule, { timed: !f.is_all_day, startTime: f.start_at.slice(11, 16), timeZone })
  }
}
/** 구글 원본(반복이면 원본 일정) → 꿈틀 칸 */
export function fieldsFromGoogle(ev: GoogleEvent, timeZone: string): LinkFields | null {
  if (!ev.start || !ev.end) return null
  let start: string
  let end: string
  const allDay = !!ev.start.date
  if (allDay) {
    start = ev.start.date!
    end = addDaysStr(ev.end.date ?? ev.start.date!, -1)
    if (end < start) end = start
  } else {
    if (!ev.start.dateTime || !ev.end.dateTime) return null
    start = floating(new Date(ev.start.dateTime), timeZone)
    end = floating(new Date(ev.end.dateTime), timeZone)
    if (end < start) end = start
  }
  return fieldsOf({ title: ev.summary ?? '', notes: plainText(ev.description), location: ev.location ?? null, start_at: start, end_at: end, is_all_day: allDay ? 1 : 0, repeat_rule: icsToRule(ev.recurrence) })
}

// ── Apple ──
export interface AppleInput { calendarId?: string; title: string; notes: string | null; location: string | null; start: string; end: string; allDay: boolean; rrule: string | null }
/** 꿈틀 → 도우미 입력(시각은 밀리초 없는 ISO UTC). 종일 끝 = 마지막 날 23:59:59(EventKit이 돌려주는 모양과 같게) */
export function appleInput(r: LinkFields, timeZone: string): AppleInput {
  const f = fieldsOf(r)
  const allDay = !!f.is_all_day
  const start = fromFloating(allDay ? f.start_at.slice(0, 10) : f.start_at, timeZone)
  const end = allDay ? new Date(fromFloating(addDaysStr(f.end_at.slice(0, 10), 1), timeZone).getTime() - 1000) : fromFloating(f.end_at, timeZone)
  const ics = ruleToIcs(f.repeat_rule, { timed: !allDay, startTime: f.start_at.slice(11, 16), timeZone })
  return { title: f.title, notes: f.notes, location: f.location, start: isoNoMs(start), end: isoNoMs(end), allDay, rrule: ics[0]?.startsWith('RRULE:') ? ics[0].slice(6) : null }
}
export function fieldsFromApple(ev: AppleEvent, timeZone: string): LinkFields | null {
  const s = new Date(ev.start)
  const e = new Date(ev.end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  let start: string
  let end: string
  if (ev.allDay) {
    start = floating(s, timeZone).slice(0, 10)
    end = floating(new Date(e.getTime() - 1000), timeZone).slice(0, 10)
    if (end < start) end = start
  } else {
    start = floating(s, timeZone)
    end = floating(e, timeZone)
    if (end < start) end = start
  }
  return fieldsOf({ title: ev.title ?? '', notes: ev.notes ?? null, location: ev.location ?? null, start_at: start, end_at: end, is_all_day: ev.allDay ? 1 : 0, repeat_rule: ev.rrule ? icsToRule([`RRULE:${ev.rrule}`]) : null })
}
