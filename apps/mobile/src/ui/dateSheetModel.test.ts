// 날짜 시트 계산 시험(22 §3.3, 03 §3·§4): 시각·알림 기본값, 빠른 날짜, 기간, 반복 RRULE(데스크톱과 같은 꼴)
import assert from 'node:assert/strict'
import { parseRule } from '@sprout/schema/time'
import {
  EMPTY_SCHEDULE, addsReminder, chipLabel, customTrigger, dateCellLabel, fromWheel, monthCells, pickDate, quickSchedule, reminderOptions, ruleBase,
  setEnd, setRepeat, setStart, setTime, shiftMonth, toDateMode, toDuration, toggleAllDay, toggleReminder, toWheel, weeklyDays, weeklyRule, type Schedule
} from './dateSheetModel.ts'

const today = '2026-10-04' // 일요일
const at = (patch: Partial<Schedule>): Schedule => ({ ...EMPTY_SCHEDULE, ...patch })

// 날짜 고르기: 시각 유지
assert.equal(pickDate(at({ due_at: '2026-10-04T15:00', is_all_day: 0 }), '2026-10-09').due_at, '2026-10-09T15:00')
assert.equal(pickDate(EMPTY_SCHEDULE, '2026-10-09').due_at, '2026-10-09')
// 기간은 길이 유지
const span = pickDate(at({ start_at: '2026-10-04T09:00', due_at: '2026-10-04T10:30', is_all_day: 0 }), '2026-10-06')
assert.equal(span.start_at, '2026-10-06T09:00')
assert.equal(span.due_at, '2026-10-06T10:30')

// 시각: 처음 넣으면 "정각에", 지우면 알림도 지움
const timed = setTime(at({ due_at: '2026-10-05' }), '15:00', today)
assert.equal(timed.due_at, '2026-10-05T15:00')
assert.equal(timed.is_all_day, 0)
assert.deepEqual(timed.reminders, ['-PT0M'])
assert.deepEqual(setTime({ ...timed, reminders: ['-PT30M'] }, '16:00', today).reminders, ['-PT30M'], '시각만 바꾸면 알림 유지')
assert.deepEqual(setTime(timed, null, today), at({ due_at: '2026-10-05', is_all_day: 1, reminders: [] }))
assert.equal(setTime(EMPTY_SCHEDULE, '09:00', today).due_at, '2026-10-04T09:00', '날짜 없으면 오늘')

// 빠른 날짜: 오늘 밤 = 20:00 + 정각에
const night = quickSchedule(EMPTY_SCHEDULE, today, '20:00')
assert.equal(night.due_at, '2026-10-04T20:00')
assert.deepEqual(night.reminders, ['-PT0M'])
assert.equal(quickSchedule(timed, '2026-10-12').due_at, '2026-10-12T15:00', '빠른 날짜는 시각 유지')

// 기간: 시작 = 정한 시각 또는 다음 정각, 끝 = +1시간
const dur = toDuration(timed, today)
assert.equal(dur.start_at, '2026-10-05T15:00')
assert.equal(dur.due_at, '2026-10-05T16:00')
assert.equal(toDuration(at({ due_at: '2026-10-05' }), today, new Date('2026-10-04T13:20')).start_at, '2026-10-05T14:00')
assert.equal(setStart(dur, '2026-10-05T18:00').due_at, '2026-10-05T19:00', '시작을 옮기면 길이 유지')
assert.equal(setEnd(dur, '2026-10-05T14:00').due_at, '2026-10-05T16:00', '끝 < 시작이면 시작 + 1시간')
assert.equal(setEnd(dur, '2026-10-05T17:30').due_at, '2026-10-05T17:30')
const allDaySpan = toggleAllDay(dur)
assert.equal(allDaySpan.start_at, '2026-10-05')
assert.equal(allDaySpan.due_at, '2026-10-05')
assert.deepEqual(allDaySpan.reminders, [])
assert.equal(toDateMode({ ...dur, reminders: ['-PT0M', 'END-PT0M'] }).due_at, '2026-10-05T15:00')
assert.deepEqual(toDateMode({ ...dur, reminders: ['-PT0M', 'END-PT0M'] }).reminders, ['-PT0M'], '끝날 때 알림은 기간에서만')

// 알림 목록·직접 설정(데스크톱 프리셋 그대로)
assert.deepEqual(reminderOptions(false, false).map(([t]) => t), ['-PT0M', '-PT5M', '-PT30M', '-PT1H', '-P1D'])
assert.deepEqual(reminderOptions(true, false).map(([t]) => t), ['PT9H', '-PT15H', '-P1DT15H', '-P2DT15H', '-P6DT15H'])
assert.ok(reminderOptions(false, true).some(([t]) => t === 'END-PT0M'))
assert.deepEqual(toggleReminder(['-PT0M'], '-PT30M'), ['-PT0M', '-PT30M'])
assert.deepEqual(toggleReminder(['-PT0M', '-PT30M'], '-PT0M'), ['-PT30M'])
assert.equal(customTrigger(15, 'm', false), '-PT15M')
assert.equal(customTrigger(2, 'h', false), '-PT2H')
assert.equal(customTrigger(1, 'd', true, '09:00'), '-PT15H', '종일 1일 전 09:00 = 데스크톱 프리셋과 같은 값')
assert.equal(customTrigger(0, 'd', true, '08:30'), 'PT8H30M')
assert.ok(addsReminder([], ['-PT0M']))
assert.ok(!addsReminder(['-PT0M'], ['-PT0M']))

// 반복: RRULE은 데스크톱과 같은 꼴, 날짜 없으면 오늘, 종료 조건 유지
const daily = setRepeat(EMPTY_SCHEDULE, 'FREQ=DAILY', today)
assert.equal(daily.repeat_rule, 'FREQ=DAILY')
assert.equal(daily.repeat_from, 'due')
assert.equal(daily.due_at, today)
const ended = setRepeat(at({ due_at: today, repeat_rule: 'FREQ=DAILY;COUNT=5' }), 'FREQ=WEEKLY;BYDAY=SU', today)
assert.equal(ended.repeat_rule, 'FREQ=WEEKLY;BYDAY=SU;COUNT=5')
assert.equal(ruleBase(ended.repeat_rule), 'FREQ=WEEKLY;BYDAY=SU')
assert.deepEqual(setRepeat(daily, null, today), { ...daily, repeat_rule: null, repeat_from: null })
// 요일 고르기: 월요일 시작 순서, 비면 날짜의 요일
assert.equal(weeklyRule(['FR', 'MO', 'WE'], today), 'FREQ=WEEKLY;BYDAY=MO,WE,FR')
assert.equal(weeklyRule([], today), 'FREQ=WEEKLY;BYDAY=SU')
assert.equal(weeklyRule(['SU', 'SA'], today, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20261231'), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU;UNTIL=20261231')
assert.deepEqual(weeklyDays('FREQ=WEEKLY;BYDAY=MO,TH', today), ['MO', 'TH'])
assert.deepEqual(weeklyDays('FREQ=WEEKLY', '2026-10-06'), ['TU'])
assert.deepEqual(weeklyDays('FREQ=DAILY', today), [])
assert.deepEqual(parseRule(weeklyRule(['TU', 'TH'], today))?.byday, ['TU', 'TH'], '공용 parseRule로 다시 읽힌다')
// 공용 recognize의 "매주 수"와 같은 꼴
assert.equal(weeklyRule(['WE'], today), 'FREQ=WEEKLY;BYDAY=WE')

// 표기
assert.equal(chipLabel(at({ due_at: '2026-10-05T15:00' }), today), '내일, 15:00')
assert.equal(chipLabel(at({ due_at: '2026-10-04' }), today), '오늘')
assert.equal(chipLabel(at({ due_at: '2026-10-07' }), today), '수요일')
assert.equal(chipLabel(at({ due_at: '2026-10-20' }), today), '10월 20일')
assert.equal(chipLabel(at({ start_at: '2026-10-05T09:00', due_at: '2026-10-05T10:00' }), today), '내일, 09:00 - 10:00')
assert.equal(chipLabel(EMPTY_SCHEDULE, today), null)
assert.equal(dateCellLabel('2026-10-05', today), '10월 5일 (월) · 내일')
assert.equal(dateCellLabel('2026-10-20', today), '10월 20일 (화)')
assert.deepEqual(toWheel('15:00'), { pm: true, hour12: 3, minute: 0 })
assert.deepEqual(toWheel('00:07'), { pm: false, hour12: 12, minute: 5 })
assert.equal(fromWheel({ pm: false, hour12: 12, minute: 30 }), '00:30')
assert.equal(fromWheel({ pm: true, hour12: 12, minute: 0 }), '12:00')
assert.equal(fromWheel(toWheel('21:45')), '21:45')
// 달력: 일요일 시작 6주(2026-10-06)
const cells = monthCells('2026-10')
assert.equal(cells.length, 42)
assert.equal(cells[0], '2026-09-27', '2026년 10월 1일(목) → 앞 일요일 9월 27일')
assert.equal(new Date(`${cells[0]}T00:00`).getDay(), 0)
assert.equal(shiftMonth('2026-12', 1), '2027-01')
assert.equal(shiftMonth('2026-01', -1), '2025-12')

console.log('dateSheetModel.test ok')
