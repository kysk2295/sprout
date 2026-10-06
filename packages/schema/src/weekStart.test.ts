// 주 시작 요일 시험(06 §16.1): 토 · 일 · 월 시작마다 칸·머리·색·주 번호가 맞는지
import assert from 'node:assert/strict'
import { toDate } from './time.ts'
import { dayMarks, holidayMap, weekLabel } from './holidays.ts'
import { buildWidgetCalendar, widgetMonthDays } from './widget.ts'
import {
  headTone, headWeekday, monthGrid42, monthWeeksDays, mondayOfRow, startOfWeek, toWeekStart, weekCol, weekDays, weekdayTone, weekHead,
  weekStartLabel, weekStartOfOptions, WEEK_START_OPTIONS, type WeekStart
} from './weekStart.ts'

const dow = (d: string) => toDate(d).getDay()
const ALL: WeekStart[] = [6, 0, 1]

// 저장값 읽기: 없거나 이상하면 일요일
assert.equal(weekStartOfOptions(null), 0)
assert.equal(weekStartOfOptions('{}'), 0)
assert.equal(weekStartOfOptions('{"weekStart":1,"holidays":1}'), 1)
assert.equal(weekStartOfOptions('{"weekStart":6}'), 6)
assert.equal(weekStartOfOptions('{"weekStart":3}'), 0)
assert.equal(weekStartOfOptions('깨짐'), 0)
assert.equal(toWeekStart('1'), 0)
assert.deepEqual(WEEK_START_OPTIONS.map((o) => o.label), ['토요일', '일요일', '월요일']) // 틱틱 순서
assert.equal(weekStartLabel(6), '토요일')

// 머리 글자
assert.deepEqual(weekHead(0), ['일', '월', '화', '수', '목', '금', '토'])
assert.deepEqual(weekHead(1), ['월', '화', '수', '목', '금', '토', '일'])
assert.deepEqual(weekHead(6), ['토', '일', '월', '화', '수', '목', '금'])
// 머리 색은 자리가 아니라 요일: 일 = 빨강(sun), 토 = 파랑(sat)
assert.deepEqual(weekHead(0).map((_, i) => headTone(i, 0)), ['sun', null, null, null, null, null, 'sat'])
assert.deepEqual(weekHead(1).map((_, i) => headTone(i, 1)), [null, null, null, null, null, 'sat', 'sun'])
assert.deepEqual(weekHead(6).map((_, i) => headTone(i, 6)), ['sat', 'sun', null, null, null, null, null])

// 주 범위(2026-10-07 수요일)
assert.equal(startOfWeek('2026-10-07', 0), '2026-10-04')
assert.equal(startOfWeek('2026-10-07', 1), '2026-10-05')
assert.equal(startOfWeek('2026-10-07', 6), '2026-10-03')
assert.equal(startOfWeek('2026-10-04', 1), '2026-09-28', '월요일 시작이면 일요일은 그 주의 끝')
assert.equal(startOfWeek('2026-10-09', 6), '2026-10-03', '토요일 시작이면 금요일은 그 주의 끝')
assert.equal(startOfWeek('2026-10-10', 6), '2026-10-10')
assert.deepEqual(weekDays('2026-10-07', 6), ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])

// 월 칸(그 달에 필요한 주만큼): 2026년 10월(1일 목, 31일 토)
assert.equal(monthWeeksDays('2026-10', 0)[0], '2026-09-27')
assert.equal(monthWeeksDays('2026-10', 0).length, 35)
assert.equal(monthWeeksDays('2026-10', 1)[0], '2026-09-28')
assert.equal(monthWeeksDays('2026-10', 1).length, 35) // 9/28 ~ 11/1
assert.equal(monthWeeksDays('2026-10', 6)[0], '2026-09-26')
assert.equal(monthWeeksDays('2026-10', 6).length, 42) // 31일 토 = 새 줄의 첫 칸 → 6줄
// 2026년 2월(1일 일, 28일 토): 일요일 시작이면 딱 4줄, 월요일·토요일 시작이면 5줄
assert.equal(monthWeeksDays('2026-02', 0).length, 28)
assert.equal(monthWeeksDays('2026-02', 1).length, 35)
assert.equal(monthWeeksDays('2026-02', 6).length, 35)
// 6주 고정
for (const ws of ALL) {
  for (const ym of ['2026-02', '2026-08', '2026-10', '2026-11', '2027-01']) {
    const g = monthGrid42(ym, ws)
    assert.equal(g.length, 42)
    assert.ok(g.includes(`${ym}-01`) && g.indexOf(`${ym}-01`) < 7, `${ym} ${ws} 1일은 첫 줄`)
    const m = monthWeeksDays(ym, ws)
    // 모든 칸: 열 i의 요일 = headWeekday(i), 색 = 그 날 요일의 색(일 빨강 · 토 파랑, 자리 무관)
    m.forEach((d, i) => {
      assert.equal(dow(d), headWeekday(i % 7, ws), `${ym} ws=${ws} ${d}`)
      assert.equal(weekdayTone(dow(d)), headTone(i % 7, ws))
      assert.equal(weekCol(d, ws), i % 7)
    })
    assert.equal(m[0], g[0])
    assert.ok(m.length % 7 === 0 && m.length >= 28 && m.length <= 42)
  }
}

// 주 번호(W): 그 줄 안 월요일의 ISO 주
assert.equal(mondayOfRow('2026-10-04', 0), '2026-10-05')
assert.equal(mondayOfRow('2026-10-05', 1), '2026-10-05')
assert.equal(mondayOfRow('2026-10-03', 6), '2026-10-05')
assert.equal(weekLabel('2026-10-04', 0), 'W41')
assert.equal(weekLabel('2026-10-04', 1), 'W40', '월요일 시작이면 일요일은 앞 줄(W40)')
assert.equal(weekLabel('2026-10-03', 6), 'W41')
assert.equal(weekLabel('2026-10-04'), 'W41') // 기본 = 일요일 시작
const map = holidayMap('2026-09-26', '2026-10-31')
assert.equal(dayMarks('2026-09-28', { holidays: true, lunar: false, weekNumbers: true, weekStart: 1 }, true, map).side, 'W40')

// 공휴일 색은 자리와 상관없이 그 날에(개천절 10/3 토 · 한글날 10/9 금)
for (const ws of ALL) {
  const cal = buildWidgetCalendar({ today: '2026-10-05', dayItems: () => [], showHolidays: true, weekStart: ws })
  assert.equal(cal.weekStart, ws)
  assert.deepEqual(cal.weekHead, weekHead(ws))
  const cells = cal.months[cal.current].weeks.flat()
  assert.equal(cells.find((c) => c.date === '2026-10-03')!.tone, 'holiday')
  assert.equal(cells.find((c) => c.date === '2026-10-09')!.tone, 'holiday')
  for (const w of cal.months.flatMap((mm) => mm.weeks)) {
    w.forEach((c, i) => {
      assert.equal(dow(c.date), headWeekday(i, ws))
      if (!c.holiday) assert.equal(c.tone, headTone(i, ws), `${c.date} ws=${ws}`)
    })
  }
  assert.deepEqual(widgetMonthDays('2026-10', ws), monthWeeksDays('2026-10', ws))
}
console.log('weekStart tests ok')
