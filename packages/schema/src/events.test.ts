// 06 §14.4 sprout 자체 일정 — 순수 함수 시험
import assert from 'node:assert/strict'
import { eventMatches, eventReminderTimes, eventSpan, eventToSchedule, eventToTaskFields, occurrences, parseReminders, stringifyReminders, taskToEventFields, upcomingOccurrence } from './events.ts'
import { TABLES } from './index.ts'

// 스키마: 동기화 테이블 events
assert.ok('events' in TABLES)
assert.deepEqual(Object.keys(TABLES.events.columns).filter((c) => !['owner_id', 'created_at', 'modified_at'].includes(c)).sort(),
  ['color', 'deleted_at', 'end_at', 'ext_account', 'ext_calendar', 'ext_error', 'ext_etag', 'ext_hash', 'ext_id', 'ext_provider', 'ext_updated', 'is_all_day', 'location', 'notes', 'reminders', 'repeat_rule', 'start_at', 'time_zone', 'title'])

// 시작·끝: 한 시각 = 1시간, 범위 그대로, 종일
assert.deepEqual(eventSpan(null, '2026-10-06T14:00'), { start_at: '2026-10-06T14:00', end_at: '2026-10-06T15:00', is_all_day: 0 })
assert.deepEqual(eventSpan('2026-10-06T11:00', '2026-10-06T12:15'), { start_at: '2026-10-06T11:00', end_at: '2026-10-06T12:15', is_all_day: 0 })
assert.deepEqual(eventSpan(null, '2026-10-06'), { start_at: '2026-10-06', end_at: '2026-10-06', is_all_day: 1 })
assert.deepEqual(eventSpan('2026-10-06', '2026-10-08'), { start_at: '2026-10-06', end_at: '2026-10-08', is_all_day: 1 })
assert.deepEqual(eventSpan('2026-10-06T23:30', '2026-10-06T23:30').end_at, '2026-10-07T00:30')
assert.deepEqual(eventToSchedule({ start_at: '2026-10-06', end_at: '2026-10-06' }), { start_at: null, due_at: '2026-10-06' })
assert.deepEqual(eventToSchedule({ start_at: '2026-10-06T09:00', end_at: '2026-10-06T10:00' }), { start_at: '2026-10-06T09:00', due_at: '2026-10-06T10:00' })

// 알림 JSON
assert.deepEqual(parseReminders('["-PT0M","-PT15M"]'), ['-PT0M', '-PT15M'])
assert.deepEqual(parseReminders('oops'), [])
assert.deepEqual(parseReminders(null), [])
assert.equal(stringifyReminders([]), null)
assert.equal(stringifyReminders(['-PT0M', '-PT0M']), '["-PT0M"]')

// 회차: 매주, 보이는 기간만, 첫 회차는 virtual 아님
const weekly = { start_at: '2026-10-05T10:00', end_at: '2026-10-05T11:00', repeat_rule: 'FREQ=WEEKLY;INTERVAL=1' }
const occ = occurrences(weekly, '2026-10-05', '2026-10-25')
assert.deepEqual(occ.map((o) => [o.start, o.end, o.virtual]), [
  ['2026-10-05T10:00', '2026-10-05T11:00', false],
  ['2026-10-12T10:00', '2026-10-12T11:00', true],
  ['2026-10-19T10:00', '2026-10-19T11:00', true]
])
assert.deepEqual(occurrences(weekly, '2026-10-10', '2026-10-13').map((o) => o.start), ['2026-10-12T10:00'])
// 여러 날 종일 반복은 길이를 유지
const multi = occurrences({ start_at: '2026-10-01', end_at: '2026-10-02', repeat_rule: 'FREQ=DAILY;INTERVAL=7' }, '2026-10-08', '2026-10-09')
assert.deepEqual(multi.map((o) => [o.start, o.end]), [['2026-10-08', '2026-10-09']])
// 횟수 제한
assert.equal(occurrences({ ...weekly, repeat_rule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=2' }, '2026-10-01', '2026-12-31').length, 2)
// 반복 없음
assert.equal(occurrences({ ...weekly, repeat_rule: null }, '2026-10-06', '2026-10-30').length, 0)

// 다가오는 회차·알림
assert.equal(upcomingOccurrence(weekly, '2026-10-14')?.start, '2026-10-19T10:00')
assert.equal(upcomingOccurrence({ ...weekly, repeat_rule: null }, '2026-10-14'), null)
const rem = eventReminderTimes({ ...weekly, reminders: '["-PT15M"]' }, '2026-10-14')
assert.equal(rem.length, 1)
assert.equal(rem[0].at.getHours() * 60 + rem[0].at.getMinutes(), 9 * 60 + 45)
assert.equal(rem[0].at.getDate(), 19)

// 할 일 ⇄ 일정
const ev = taskToEventFields({ title: ' 피부과 ', content: '접수 10분 전', start_at: null, due_at: '2026-10-07T15:00', repeat_rule: null }, ['보험증'], '2026-10-05', ['-PT0M'])
assert.equal(ev.title, '피부과')
assert.equal(ev.notes, '접수 10분 전\n- 보험증')
assert.equal(ev.start_at, '2026-10-07T15:00'); assert.equal(ev.end_at, '2026-10-07T16:00'); assert.equal(ev.is_all_day, 0)
assert.equal(ev.reminders, '["-PT0M"]')
const noDate = taskToEventFields({ title: '미용실', content: null, start_at: null, due_at: null, repeat_rule: null }, [], '2026-10-05', [])
assert.equal(noDate.start_at, '2026-10-05'); assert.equal(noDate.is_all_day, 1); assert.equal(noDate.notes, null)
const back = eventToTaskFields({ id: 'e', title: '피부과', notes: '메모', start_at: '2026-10-07T15:00', end_at: '2026-10-07T16:00', is_all_day: 0, repeat_rule: null, location: '강남역', reminders: '["-PT0M"]', color: null })
assert.equal(back.content, '📍 강남역\n메모')
assert.equal(back.start_at, '2026-10-07T15:00'); assert.equal(back.due_at, '2026-10-07T16:00')
assert.deepEqual(back.reminders, ['-PT0M'])
assert.equal(eventToTaskFields({ id: 'e', title: '휴가', notes: null, start_at: '2026-10-07', end_at: '2026-10-07', is_all_day: 1, repeat_rule: null, location: null, reminders: null, color: null }).start_at, null)

// 검색
assert.ok(eventMatches({ title: '피부과', notes: null, location: null }, '피부'))
assert.ok(eventMatches({ title: 'x', notes: null, location: 'Gangnam' }, 'gang'))
assert.ok(!eventMatches({ title: 'x', notes: null, location: null }, ' '))

console.log('events: ok')

// 오래된 반복 일정도 오늘 기간에 보인다(2026-10-11 Codex 리뷰: 시작일부터 400회까지만 세서 사라졌다)
{
  const old = { start_at: '2025-01-01T09:00', end_at: '2025-01-01T10:00', repeat_rule: 'FREQ=DAILY' }
  const got = occurrences(old, '2026-10-11', '2026-10-17')
  assert.equal(got.length, 7)
  assert.equal(got[0].start, '2026-10-11T09:00')
  assert.equal(occurrences(old, '2026-10-11', '2027-12-31', 5).length, 5) // max = 보여 줄 회차 상한
  const counted = { start_at: '2025-01-01', end_at: '2025-01-01', repeat_rule: 'FREQ=DAILY;COUNT=10' }
  assert.equal(occurrences(counted, '2026-10-11', '2026-10-17').length, 0) // 횟수가 끝난 반복은 여전히 없음
  console.log('events old repeat ok')
}
