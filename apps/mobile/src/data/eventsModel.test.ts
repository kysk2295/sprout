// 일정 휴대폰판 계산 시험(20 §7.1)
import assert from 'node:assert/strict'
import { eventItems, eventListRange, eventSheetLabel, eventsByGroup, eventTimeGroup, eventTimeLabel, isEventId, eventIdOf, isPast, mergeEventGroups, myColorOf, type EventRow } from './eventsModel.ts'
import type { Group } from './views.ts'

const ev = (p: Partial<EventRow>): EventRow => ({ id: 'e1', title: '피부과', notes: null, start_at: '2026-10-05T14:00', end_at: '2026-10-05T15:00', is_all_day: 0, repeat_rule: null, location: null, reminders: null, color: null, ...p })

// 캘린더 항목: 가짜 할 일 행(ev: 앞붙이), 색 = 일정 색 → 내 일정 색 → 기본 노랑
const items = eventItems([ev({}), ev({ id: 'e2', color: '#123456', start_at: '2026-10-06', end_at: '2026-10-06', is_all_day: 1 })], '2026-10-05', '2026-10-11', '#ff0000')
assert.equal(items.length, 2)
assert.ok(isEventId(items[0].task.id) && eventIdOf(items[0].task.id) === 'e1')
assert.equal(items[0].task.list_color, '#ff0000')
assert.equal(items[1].task.list_color, '#123456')
assert.equal(items[1].allDay, true)
assert.equal(items[1].task.start_at, null, '하루 종일 = start 없음(할 일 모양)')
assert.equal(eventItems([ev({})], '2026-10-05', '2026-10-05')[0].task.list_color, '#E9A23B')
// 반복: 회차마다, 첫 회차만 virtual 아님
const weekly = eventItems([ev({ repeat_rule: 'FREQ=WEEKLY' })], '2026-10-01', '2026-10-31')
assert.deepEqual(weekly.map((x) => [x.start, x.virtual]), [['2026-10-05T14:00', false], ['2026-10-12T14:00', true], ['2026-10-19T14:00', true], ['2026-10-26T14:00', true]])
assert.notEqual(weekly[0].key, weekly[1].key)

// 내 일정 색
assert.equal(myColorOf('{"myColor":"#abcdef"}'), '#abcdef')
assert.equal(myColorOf('{"icons":true}'), null)
assert.equal(myColorOf('깨짐'), null)

// 지난 일정
const now = new Date('2026-10-05T14:30')
assert.equal(isPast('2026-10-05T15:00', now), false)
assert.equal(isPast('2026-10-05T14:00', now), true)
assert.equal(isPast('2026-10-05', now), false, '종일은 그날이 끝나야 지남')
assert.equal(isPast('2026-10-04', now), true)

// 목록 기간·묶음
const today = '2026-10-05'
assert.deepEqual(eventListRange('smart:next7', today), { from: '2026-10-05', to: '2026-10-11' })
assert.equal(eventListRange('smart:inbox', today), null)
assert.equal(eventTimeGroup('2026-10-03', today), 'today', '이미 시작한 여러 날 일정은 오늘')
assert.equal(eventTimeGroup('2026-10-06T09:00', today), 'tomorrow')
assert.equal(eventTimeGroup('2026-10-09', today), 'next7')
const list = eventItems([ev({}), ev({ id: 'e3', title: '휴가', start_at: '2026-10-05', end_at: '2026-10-05', is_all_day: 1 }), ev({ id: 'e4', start_at: '2026-10-07T09:00', end_at: '2026-10-07T10:00' })], today, '2026-10-11')
const by = eventsByGroup(list, today, true)
assert.deepEqual(by.get('today')!.map((x) => x.task.title), ['휴가', '피부과'], '종일 먼저')
assert.equal(by.get('next7')!.length, 1)
assert.equal(eventsByGroup(list, today, false).get('events')!.length, 3)

// 묶음 합치기: 있는 묶음은 개수만, 없는 날짜 묶음은 순서대로 새로, 완료 앞
const g = (id: string, n: number, extra: Partial<Group> = {}): Group => ({ id, title: id, rows: [], count: n, ...extra })
const merged = mergeEventGroups([g('overdue', 2), g('tomorrow', 1), g('done', 4, { done: true })], by, true)
assert.deepEqual(merged.map((x) => [x.id, x.count]), [['overdue', 2], ['today', 2], ['tomorrow', 1], ['next7', 1], ['done', 4]])
assert.equal(merged[1].title, '오늘')
const merged2 = mergeEventGroups([g('l:a', 1), g('done', 1, { done: true })], eventsByGroup(list, today, false), false)
assert.deepEqual(merged2.map((x) => [x.id, x.title, x.count]), [['l:a', 'l:a', 1], ['events', '일정', 3], ['done', 'done', 1]])
assert.equal(mergeEventGroups([], new Map(), true).length, 0)

// 글자
assert.equal(eventTimeLabel('2026-10-05T14:00', '2026-10-05T15:00'), '오후 2:00-3:00')
assert.equal(eventTimeLabel('2026-10-05T11:00', '2026-10-05T13:00'), '오전 11:00-오후 1:00')
assert.equal(eventTimeLabel('2026-10-05', '2026-10-05'), '종일')
assert.equal(eventTimeLabel('2026-10-05', '2026-10-07'), '10월 5일-7일')
assert.equal(eventSheetLabel('2026-10-12T14:00', '2026-10-12T15:00'), '10월 12일 (월) 오후 2:00-3:00')
assert.equal(eventSheetLabel('2026-10-12', '2026-10-12'), '10월 12일 (월) · 종일')
assert.equal(eventSheetLabel('2026-10-12', '2026-10-14'), '10월 12일 (월) - 10월 14일 (수)')
console.log('eventsModel.test ok')
{
  const { quickEventFields, eventAddedToast } = await import('./eventsModel.ts')
  assert.deepEqual(quickEventFields({ start_at: null, due_at: null, repeat_rule: null, reminders: [] }, false, today), { start_at: null, due_at: today, repeat_rule: null, reminders: [] }, '날짜 없음 = 오늘 종일')
  assert.deepEqual(quickEventFields({ start_at: null, due_at: '2026-10-05T14:00', repeat_rule: null, reminders: [] }, false, today).reminders, ['-PT0M'], '캘린더 빈 시간 = 정각에')
  assert.deepEqual(quickEventFields({ start_at: '2026-10-05T14:00', due_at: '2026-10-05T16:00', repeat_rule: null, reminders: [] }, true, today).reminders, [], '직접 고른 알림 없음은 그대로')
  assert.equal(eventAddedToast('2026-10-05T14:00', today), '일정을 추가했어요')
  assert.equal(eventAddedToast('2026-10-06', today), '내일에 일정을 추가했어요')
  assert.equal(eventAddedToast('2026-10-12', today), '10월 12일에 일정을 추가했어요')
  console.log('eventsModel quick ok')
}
