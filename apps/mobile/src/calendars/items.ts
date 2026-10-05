// 38 §2.2·§7 휴대폰 캘린더 일정 → 캘린더 항목(꿈틀 일정과 같은 모양), 같은 일정 숨김, 연결된 꿈틀 일정의 캘린더 이름.
// 순수 계산(시험: items.test.ts). 휴대폰 일정 항목 id = 'ev:dx:<열쇠>' — 일정처럼 그리고, 열면 휴대폰 일정 시트로 간다.
import type { CalItem } from '../data/calendar.ts'
import { EV_PREFIX, eventIdOf, type EventCalItem, type EventRow } from '../data/eventsModel.ts'
import type { TaskRow } from '../data/views.ts'
import { calHash, hash16, isDeviceProvider, judgeDevice, lookKey, spanFromDevice, type DevCalendar, type DevEvent, type Platform } from './link.ts'

export const DX = 'dx:'
/** 캘린더 항목·일정 id가 휴대폰 일정인가 */
export const isDeviceItemId = (id: string) => eventIdOf(id).startsWith(DX)

export interface DeviceRef {
  key: string
  ev: DevEvent
  cal: DevCalendar
  writable: boolean
  reason: string | null
  recurring: boolean
  start_at: string
  end_at: string
  is_all_day: number
}
const registry = new Map<string, DeviceRef>()
/** 시트·메뉴가 열쇠로 찾는다(마지막으로 그린 것) */
export const deviceRef = (key: string) => registry.get(key.startsWith(EV_PREFIX) ? key.slice(EV_PREFIX.length) : key)

const datePart = (f: string) => f.slice(0, 10)
const isRecurring = (ev: DevEvent) => !!ev.recurrenceRule || !!ev.originalId

/** 연결된 꿈틀 일정의 캘린더 이름(§2.2) — 이 휴대폰 것이면 그 캘린더 이름 */
export function linkLabel(e: Pick<EventRow, 'ext_provider' | 'ext_calendar' | 'ext_account'>, cals: DevCalendar[], myAccount: string | null, pf: Platform): string | null {
  if (!e.ext_provider) return null
  if (isDeviceProvider(e.ext_provider) && e.ext_account && e.ext_account === myAccount && e.ext_provider === `device-${pf}`) {
    const c = cals.find((x) => calHash(x.id) === e.ext_calendar)
    if (c) return c.title
  }
  return e.ext_provider === 'google' ? '구글 캘린더' : e.ext_provider === 'apple' ? 'Apple 캘린더' : e.ext_provider === 'device-ios' ? 'iPhone 캘린더' : e.ext_provider === 'device-android' ? 'Android 캘린더' : null
}

/**
 * 휴대폰 일정 → 캘린더 항목. 숨김(§7): ① 이 휴대폰 연결 일정의 사본(myExtIds) ② 연결된 꿈틀 일정과 제목·시작·끝이 같은 것(linked).
 */
export function deviceItems(events: DevEvent[], cals: DevCalendar[], pf: Platform, opts: { myExtIds: Set<string>; linked: Pick<CalItem<TaskRow>, 'start' | 'end' | 'task'>[]; from: string; to: string }): EventCalItem[] {
  const byId = new Map(cals.map((c) => [c.id, c]))
  const looks = new Set(opts.linked.map((it) => lookKey(it.task.title, it.start, it.end)))
  const out: EventCalItem[] = []
  for (const ev of events) {
    const cal = byId.get(ev.calendarId)
    if (!cal) continue
    if (opts.myExtIds.has(ev.id) || (ev.originalId && opts.myExtIds.has(ev.originalId))) continue
    const span = spanFromDevice(ev, pf)
    if (!span) continue
    if (datePart(span.start_at) > opts.to || datePart(span.end_at) < opts.from) continue
    if (looks.has(lookKey(ev.title, span.start_at, span.end_at))) continue
    const key = `${DX}${hash16(`${ev.calendarId}|${ev.id}|${String(ev.startDate)}`)}`
    const { writable, reason } = judgeDevice(cal, ev)
    const ref: DeviceRef = { key, ev, cal, writable, reason, recurring: isRecurring(ev), ...span }
    registry.set(key, ref)
    const evt: EventRow = { id: key, title: ev.title || '', notes: ev.notes || null, location: ev.location || null, start_at: span.start_at, end_at: span.end_at, is_all_day: span.is_all_day, repeat_rule: ref.recurring ? 'FREQ=DAILY' : null, reminders: null, color: cal.color }
    const task: TaskRow = {
      id: `${EV_PREFIX}${key}`, list_id: null, parent_id: null, section_id: null, title: evt.title ?? '', content: evt.notes, content_mode: null, status: 0, priority: 0,
      start_at: span.start_at === span.end_at ? null : span.start_at, due_at: span.end_at, is_all_day: span.is_all_day, sort_order: null, repeat_rule: null, pinned_at: null,
      created_at: null, completed_at: null, deleted_at: null, list_name: cal.title, list_emoji: null, list_color: cal.color, list_kind: 'event',
      check_total: 0, check_done: 0, reminder_count: 0, tag_ids: null
    }
    out.push({ key, task, start: span.start_at, end: span.end_at, allDay: !!span.is_all_day, virtual: false, locked: !writable, evt, occ: { start: span.start_at, end: span.end_at, date: datePart(span.start_at), virtual: false }, color: cal.color })
  }
  return out
}
