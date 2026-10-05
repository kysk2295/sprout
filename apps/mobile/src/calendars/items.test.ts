// 38 §2.2·§7 휴대폰 캘린더 일정 → 캘린더 항목·같은 일정 숨김·연결된 일정 캘린더 이름 시험
import assert from 'node:assert/strict'
import { eventItems, isEventId, type EventRow } from '../data/eventsModel.ts'
import { deviceItems, deviceRef, isDeviceItemId, linkLabel } from './items.ts'
import { calHash, type DevCalendar, type DevEvent } from './link.ts'

const cals: DevCalendar[] = [
  { id: 'CAL-HOME', title: '집', color: '#ff0000', allowsModifications: true, source: { name: 'iCloud' } },
  { id: 'CAL-HOL', title: '대한민국의 휴일', color: '#00aa00', allowsModifications: false, type: 'subscribed', source: { name: 'Subscribed Calendars' } }
]
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()
const devs: DevEvent[] = [
  { id: 'D1', calendarId: 'CAL-HOME', title: '치과', startDate: at(12, 15), endDate: at(12, 16), allDay: false },
  { id: 'D2', calendarId: 'CAL-HOL', title: '한글날', startDate: new Date(2026, 9, 9).toISOString(), endDate: new Date(2026, 9, 9, 23, 59, 59).toISOString(), allDay: true },
  { id: 'MINE', calendarId: 'CAL-HOME', title: '내가 만든 것', startDate: at(13, 9), endDate: at(13, 10), allDay: false },
  { id: 'G1', calendarId: 'CAL-HOME', title: '데스크톱이 구글에 올린 것', startDate: at(14, 9), endDate: at(14, 10), allDay: false },
  { id: 'R1', calendarId: 'CAL-HOME', title: '스탠드업', startDate: at(15, 9), endDate: at(15, 9, 15), allDay: false, recurrenceRule: { frequency: 'daily' } },
  { id: 'X', calendarId: 'UNKNOWN', title: '꺼 둔 캘린더', startDate: at(12, 9), endDate: at(12, 10) }
]
const sprout: EventRow[] = [
  { id: 's1', title: '내가 만든 것', notes: null, start_at: '2026-10-13T09:00', end_at: '2026-10-13T10:00', is_all_day: 0, repeat_rule: null, location: null, reminders: null, color: '#ff0000', ext_provider: 'device-ios', ext_account: 'd_me', ext_calendar: calHash('CAL-HOME'), ext_id: 'MINE' },
  { id: 's2', title: '데스크톱이 구글에 올린 것', notes: null, start_at: '2026-10-14T09:00', end_at: '2026-10-14T10:00', is_all_day: 0, repeat_rule: null, location: null, reminders: null, color: null, ext_provider: 'google', ext_account: 'g_x', ext_calendar: 'c_y', ext_id: 'kkabc' },
  { id: 's3', title: '그냥 꿈틀 일정', notes: null, start_at: '2026-10-12T15:00', end_at: '2026-10-12T16:00', is_all_day: 0, repeat_rule: null, location: null, reminders: null, color: null }
]
const sItems = eventItems(sprout, '2026-10-01', '2026-10-31', null, (e) => linkLabel(e, cals, 'd_me', 'ios'))
assert.equal(sItems.find((i) => i.evt.id === 's1')!.task.list_name, '집', '이 휴대폰 연결 = 그 캘린더 이름')
assert.equal(sItems.find((i) => i.evt.id === 's2')!.task.list_name, '구글 캘린더')
assert.equal(sItems.find((i) => i.evt.id === 's3')!.task.list_name, '내 일정')
assert.equal(linkLabel({ ext_provider: 'device-ios', ext_account: 'd_other', ext_calendar: calHash('CAL-HOME') }, cals, 'd_me', 'ios'), 'iPhone 캘린더', '다른 휴대폰')
assert.equal(linkLabel({ ext_provider: 'device-android', ext_account: 'd_me', ext_calendar: 'c_' }, cals, 'd_me', 'ios'), 'Android 캘린더')

const linked = sItems.filter((i) => !!i.evt.ext_provider)
const out = deviceItems(devs, cals, 'ios', { myExtIds: new Set(['MINE']), linked, from: '2026-10-01', to: '2026-10-31' })
const titles = out.map((i) => i.task.title).sort()
// 꿈틀 일정과 같은 제목·시각이라도 연결 안 된 꿈틀 일정(s3)이면 숨기지 않는다 — 치과는 다른 제목이라 보인다
assert.deepEqual(titles, ['스탠드업', '치과', '한글날'], '내 연결 사본·연결된 일정과 같은 모양·꺼 둔 캘린더는 빠진다')
const dentist = out.find((i) => i.task.title === '치과')!
assert.ok(isEventId(dentist.task.id) && isDeviceItemId(dentist.task.id))
assert.equal(dentist.task.list_color, '#ff0000'); assert.equal(dentist.task.list_name, '집')
assert.equal(dentist.locked, false)
const hol = out.find((i) => i.task.title === '한글날')!
assert.equal(hol.locked, true, '구독 캘린더 = 끌 수 없음'); assert.equal(hol.allDay, true); assert.equal(hol.start, '2026-10-09')
assert.equal(deviceRef(hol.task.id)!.reason, '공휴일·생일·구독 캘린더는 고칠 수 없어요')
assert.equal(deviceRef(out.find((i) => i.task.title === '스탠드업')!.key)!.recurring, true)
// 기간 밖은 빠진다
assert.equal(deviceItems(devs, cals, 'ios', { myExtIds: new Set(), linked: [], from: '2026-11-01', to: '2026-11-30' }).length, 0)

console.log('calendars/items ok')
