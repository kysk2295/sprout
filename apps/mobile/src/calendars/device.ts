// 38 휴대폰 OS 캘린더 호출(iOS EventKit · Android 캘린더 제공자 — expo-calendar 옛 API). 화면·DB 없음.
// 반복 범위 옵션(`instanceStartDate`·`futureEvents`)이 옛 API에 있어서 legacy를 쓴다.
import * as Cal from 'expo-calendar/legacy'
import { Linking, Platform as RNPlatform } from 'react-native'
import type { DevCalendar, DevEvent, Platform, Span } from './link'

export const PF: Platform = RNPlatform.OS === 'ios' ? 'ios' : 'android'
export const deviceTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }

export type PermState = 'granted' | 'denied' | 'undetermined'
export interface Perm { state: PermState; canAskAgain: boolean }
const permOf = (r: { status: string; granted?: boolean; canAskAgain?: boolean }): Perm => ({
  state: r.granted || r.status === 'granted' ? 'granted' : r.status === 'undetermined' ? 'undetermined' : 'denied',
  canAskAgain: r.canAskAgain !== false
})
export async function permission(): Promise<Perm> {
  try { return permOf(await Cal.getCalendarPermissionsAsync()) } catch { return { state: 'denied', canAskAgain: false } }
}
/** OS 권한 창(iOS 17+ 전체 접근, Android 읽기·쓰기) */
export async function requestPermission(): Promise<Perm> {
  try { return permOf(await Cal.requestCalendarPermissionsAsync()) } catch { return { state: 'denied', canAskAgain: false } }
}
export const openAppSettings = () => Linking.openSettings()

export async function listCalendars(): Promise<DevCalendar[]> {
  const list = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT)
  return list
    .filter((c) => (PF === 'android' ? c.isSynced !== false : true))
    .map((c) => ({
      id: c.id, title: c.title || c.name || '캘린더', color: normColor(c.color), allowsModifications: !!c.allowsModifications,
      type: (c.type as string | undefined) ?? null, source: c.source ? { name: c.source.name ?? null, type: (c.source.type as string) ?? null } : null,
      ownerAccount: c.ownerAccount ?? null, accessLevel: (c.accessLevel as string | undefined) ?? null, isPrimary: !!c.isPrimary
    }))
}
/** '#RRGGBB'로(Android는 '#AARRGGBB'·숫자로 올 때가 있다) */
function normColor(c: unknown): string {
  if (typeof c === 'number') return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`
  const s = typeof c === 'string' ? c.trim() : ''
  if (/^#[0-9a-f]{8}$/i.test(s)) return `#${s.slice(3)}`
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  return '#8e8e93'
}

const devOf = (e: Cal.Event): DevEvent => ({
  id: e.id, calendarId: e.calendarId, title: e.title, location: e.location, notes: e.notes, startDate: e.startDate, endDate: e.endDate, allDay: !!e.allDay,
  recurrenceRule: (e.recurrenceRule as DevEvent['recurrenceRule']) ?? null, lastModifiedDate: e.lastModifiedDate ?? null,
  organizer: e.organizer ? { isCurrentUser: e.organizer.isCurrentUser } : null, accessLevel: (e.accessLevel as string | undefined) ?? null,
  originalId: e.originalId ?? null, instanceId: e.instanceId ?? null
})
export async function listEvents(calendarIds: string[], from: Date, to: Date): Promise<DevEvent[]> {
  if (!calendarIds.length) return []
  return (await Cal.getEventsAsync(calendarIds, from, to)).map(devOf)
}
/** OS가 '그런 일정 없음'이라고 답한 오류(iOS ERR_EVENT_NOT_FOUND · Android E_EVENT_NOT_FOUND)인가 — 그 밖의 실패는 일시 오류로 본다 */
export const isNotFound = (e: unknown) => {
  const x = e as { code?: unknown; message?: unknown } | null
  return /EVENT_NOT_FOUND/.test(String(x?.code ?? '')) || /could not be found/i.test(String(x?.message ?? ''))
}
/** 일정 하나(반복이면 첫 회차 — instanceStart를 주면 그 회차). 정말 없으면 null, 조회가 실패하면(권한·OS 일시 오류) 던진다 — 다리는 이것으로만 '휴대폰에서 지움'을 판단한다 */
export async function findEvent(id: string, instanceStart?: string | Date): Promise<DevEvent | null> {
  try {
    const e = await Cal.getEventAsync(id, instanceStart ? { instanceStartDate: instanceStart } : undefined)
    return e && e.id ? devOf(e) : null
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}
/** 화면용: 없거나 조회가 실패하면 null */
export async function getEvent(id: string, instanceStart?: string | Date): Promise<DevEvent | null> {
  try { return await findEvent(id, instanceStart) } catch { return null }
}
export async function createEvent(calendarId: string, input: Record<string, unknown>): Promise<string> {
  return Cal.createEventAsync(calendarId, input as never)
}
/** span: this = 그 회차만, future = 그 회차부터, all/undefined = 일정 전체(반복이면 첫 회차부터) */
export async function updateEvent(id: string, input: Record<string, unknown>, opt?: { span?: Span; instanceStart?: string | Date }): Promise<void> {
  await Cal.updateEventAsync(id, input as never, recurringOpts(opt))
}
export async function deleteEvent(id: string, opt?: { span?: Span; instanceStart?: string | Date }): Promise<void> {
  await Cal.deleteEventAsync(id, recurringOpts(opt))
}
function recurringOpts(opt?: { span?: Span; instanceStart?: string | Date }) {
  if (!opt?.span || opt.span === 'all') return PF === 'ios' ? { futureEvents: true } : undefined
  return { futureEvents: opt.span === 'future', instanceStartDate: opt.instanceStart }
}
/** 캘린더 앱에서 열기 */
export async function openInCalendarApp(id: string, instanceStart?: string | Date) {
  try { await Cal.openEventInCalendarAsync({ id, instanceStartDate: instanceStart }) } catch { /* 열 수 없으면 무시 */ }
}
