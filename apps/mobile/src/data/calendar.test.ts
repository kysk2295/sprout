// 캘린더 범위·배치·옮기기 시험(06 휴대폰판)
import assert from 'node:assert/strict'
import { agendaTitle, blockTime, cellSummary, dragTarget, floatingAt, itemsOf, layoutDay, minutesAtY, monthDays, monthTitle, moveTo, rangeOf, shiftCursor, WEEK_HEAD, weekStart, type CalTask } from './calendar.ts'

const today = '2026-10-04' // 일요일
// 주 시작 일요일(2026-10-06 사용자 결정)
assert.equal(weekStart('2026-10-04'), '2026-10-04')
assert.equal(weekStart('2026-10-10'), '2026-10-04')
assert.deepEqual(WEEK_HEAD, ['일', '월', '화', '수', '목', '금', '토'])
// 2026년 10월: 9/27(일)부터 10/31(토)까지 5주
const m = monthDays('2026-10-15')
assert.equal(m[0], '2026-09-27')
assert.equal(m.length, 35)
assert.equal(m[m.length - 1], '2026-10-31')
// 2026년 8월: 1일이 토요일 → 7/26부터 6주
assert.equal(monthDays('2026-08-01').length, 42)
assert.deepEqual(rangeOf('3day', today).days, ['2026-10-04', '2026-10-05', '2026-10-06'])
assert.equal(rangeOf('list', today).to, '2026-11-02')
assert.equal(shiftCursor('month', '2026-12-20', 1), '2027-01-01')
assert.equal(shiftCursor('3day', today, -1), '2026-10-01')
assert.equal(monthTitle('2026-10-01', today), '10월')
assert.equal(monthTitle('2027-01-01', today), '2027년 1월')
assert.equal(agendaTitle('2026-10-04', today), '오늘 · 10월 4일 일')
assert.equal(agendaTitle('2026-10-05', today), '내일 · 10월 5일 월')
assert.equal(agendaTitle('2026-10-07', today), '10월 7일 수')

let n = 0
const t = (p: Partial<CalTask>): CalTask => ({ id: `t${++n}`, title: `할 일 ${n}`, status: 0, priority: 0, start_at: null, due_at: null, ...p })
const a = t({ due_at: '2026-10-04T09:00' })
const b = t({ start_at: '2026-10-04T09:30', due_at: '2026-10-04T11:00' })
const c = t({ due_at: '2026-10-04' })
const span = t({ start_at: '2026-10-03', due_at: '2026-10-06' })
const none = t({})
const rep = t({ due_at: '2026-10-01', repeat_rule: 'FREQ=DAILY' })
const items = itemsOf([a, b, c, span, none, rep], '2026-10-04', '2026-10-06')
assert.ok(!items.some((i) => i.task.id === none.id), '날짜 없는 할 일은 캘린더에 없다')
assert.ok(!items.some((i) => i.task.id === rep.id), '반복 미래 회차는 기본으로 그리지 않는다')
assert.equal(itemsOf([rep], '2026-10-04', '2026-10-06', true).length, 3)
// 겹침: a(9:00 + 30분)와 b(9:30-11:00)는 겹치지 않는다 → 각자 한 열
const blocks = layoutDay(items, '2026-10-04')
assert.equal(blocks.length, 2)
assert.deepEqual(blocks.map((x) => x.cols), [1, 1])
const blocks2 = layoutDay(itemsOf([a, t({ due_at: '2026-10-04T09:10' })], '2026-10-04', '2026-10-04'), '2026-10-04')
assert.deepEqual(blocks2.map((x) => [x.col, x.cols]), [[0, 2], [1, 2]])
// 월 칸: 막대(여러 날·종일) 먼저, 넘치면 +n
const cell = cellSummary(items, '2026-10-04', 3)
assert.equal(cell.more, 2)
assert.deepEqual(cell.shown.map((x) => x.task.id), [span.id, c.id])
// 빈 칸 누름 → 30분 단위
assert.equal(minutesAtY(56 * 15 + 40), 15 * 60 + 30)
assert.equal(floatingAt('2026-10-07', 15 * 60 + 30), '2026-10-07T15:30')
// 끌어 옮기기: 길이 유지, 15분 단위, 다른 날
assert.deepEqual(moveTo(b, '2026-10-05T14:00'), { start_at: '2026-10-05T14:00', due_at: '2026-10-05T15:30', is_all_day: 0 })
assert.deepEqual(moveTo(a, '2026-10-05T14:00'), { start_at: null, due_at: '2026-10-05T14:00', is_all_day: 0 })
assert.deepEqual(moveTo(span, '2026-10-10'), { start_at: '2026-10-10', due_at: '2026-10-13', is_all_day: 1 })
assert.deepEqual(moveTo(c, '2026-10-04T10:00'), { start_at: null, due_at: '2026-10-04T10:00', is_all_day: 0 })
assert.equal(dragTarget('2026-10-04T09:00', 56 * 2 + 10, 1), '2026-10-05T11:15')
assert.equal(dragTarget('2026-10-04T01:00', -56 * 5, 0), '2026-10-04T00:00')
assert.equal(blockTime('2026-10-04T15:00', '2026-10-04T16:30'), '오후 3:00-4:30')
assert.equal(blockTime('2026-10-04T11:00', '2026-10-04T13:00'), '오전 11:00-오후 1:00')
console.log('calendar ok')
