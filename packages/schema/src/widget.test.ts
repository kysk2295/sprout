// 위젯 공용 계약 시험(36 §7.2 · 25 §8.5): 월 칸·색·달 범위·강조색·대기열 정리
import assert from 'node:assert/strict'
import {
  buildWidgetCalendar, buildWidgetMonth, isWidgetDate, isWidgetId, parseWidgetAction, planWidgetActions, shiftMonth, widgetAccents,
  widgetArtPath, widgetCalendarRange, widgetDayTone, widgetMonthDays, widgetMonthTitle, widgetSnapshotKey, type WidgetCalItem
} from './widget.ts'

// 달 넘기기
assert.equal(shiftMonth('2026-10', 1), '2026-11')
assert.equal(shiftMonth('2026-12', 1), '2027-01')
assert.equal(shiftMonth('2026-01', -1), '2025-12')
assert.equal(shiftMonth('2026-10', -14), '2025-08')

// 칸: 일요일 시작(2026-10-06), 5줄/6줄
const oct = widgetMonthDays('2026-10') // 10월 1일 = 목요일
assert.equal(oct[0], '2026-09-27')
assert.equal(oct.length, 35)
assert.equal(oct[oct.length - 1], '2026-10-31')
const aug = widgetMonthDays('2026-08') // 8월 1일 = 토요일 → 6줄
assert.equal(aug[0], '2026-07-26')
assert.equal(aug.length, 42)
const feb = widgetMonthDays('2026-02') // 2월 1일 = 일요일, 28일 = 토요일 → 4줄
assert.equal(feb.length, 28)

// 머리 글자
assert.equal(widgetMonthTitle('2026-10', '2026-10-05'), '10월')
assert.equal(widgetMonthTitle('2027-01', '2026-10-05'), '2027년 1월')

// 색: 공휴일 > 일요일 빨강, 토요일 파랑
assert.equal(widgetDayTone('2026-10-04', null), 'sun')
assert.equal(widgetDayTone('2026-10-10', null), 'sat')
assert.equal(widgetDayTone('2026-10-05', null), null)
assert.equal(widgetDayTone('2026-10-09', '한글날'), 'holiday')

// 한 달 칸: 항목·+N 수·오늘·다른 달·공휴일
const items: Record<string, WidgetCalItem[]> = {
  '2026-10-07': Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, kind: 'task' as const, title: `할 일 ${i}`, color: '#4E75F2', faded: false })),
  '2026-09-29': [{ id: 'e1', kind: 'event', title: 'x'.repeat(60), color: null, faded: true }]
}
const m = buildWidgetMonth({ month: '2026-10', today: '2026-10-05', dayItems: (d) => items[d] ?? [], holidays: new Map([['2026-10-03', '개천절'], ['2026-10-09', '한글날']]) })
assert.equal(m.title, '10월')
assert.equal(m.weeks.length, 5)
assert.ok(m.weeks.every((w) => w.length === 7))
const cell = (d: string) => m.weeks.flat().find((c) => c.date === d)!
assert.equal(cell('2026-10-07').total, 6)
assert.equal(cell('2026-10-07').items.length, 4)
assert.equal(cell('2026-10-05').today, true)
assert.equal(cell('2026-10-04').today, false)
assert.equal(cell('2026-09-29').inMonth, false)
assert.equal(cell('2026-09-29').items[0].title.length, 40)
assert.equal(cell('2026-10-03').holiday, '개천절')
assert.equal(cell('2026-10-03').tone, 'holiday')
assert.equal(cell('2026-10-04').tone, 'sun')
assert.equal(cell('2026-10-01').n, 1)

// 달력 전체: 지난달 ~ 두 달 뒤, 휴일 표시 끄면 이름 없음(주말 색은 그대로)
const r = widgetCalendarRange('2026-10-05')
assert.deepEqual(r.months, ['2026-09', '2026-10', '2026-11', '2026-12'])
assert.equal(r.from, '2026-08-30')
assert.equal(r.to, '2027-01-02')
const cal = buildWidgetCalendar({ today: '2026-10-05', dayItems: () => [], showHolidays: true })
assert.equal(cal.current, 1)
assert.equal(cal.months[1].month, '2026-10')
assert.equal(cal.months[1].weeks.flat().find((c) => c.date === '2026-10-03')!.holiday, '개천절')
assert.equal(cal.months[1].weeks.flat().find((c) => c.date === '2026-10-09')!.holiday, '한글날')
assert.deepEqual(cal.weekHead, ['일', '월', '화', '수', '목', '금', '토'])
assert.equal(cal.weekStart, 0)
assert.ok(cal.months.every((mm) => mm.weeks.every((w) => w[0].tone !== 'sat' && w[6].tone !== 'sun'))) // 일 = 첫 칸, 토 = 끝 칸
const calOff = buildWidgetCalendar({ today: '2026-10-05', dayItems: () => [], showHolidays: false })
const c3 = calOff.months[1].weeks.flat().find((c) => c.date === '2026-10-03')!
assert.equal(c3.holiday, null)
assert.equal(c3.tone, 'sat') // 2026-10-03 = 토요일
// 해 바뀜: 12월 오늘 → 다음 해 달 머리
const dec = buildWidgetCalendar({ today: '2026-12-20', dayItems: () => [], showHolidays: true })
assert.deepEqual(dec.months.map((x) => x.title), ['11월', '12월', '2027년 1월', '2027년 2월'])

// 강조색(25 §5.2)
assert.deepEqual(widgetAccents(null), { accentLight: '#12715E', accentDark: '#19856B' })
assert.deepEqual(widgetAccents('teal|black'), { accentLight: '#237973', accentDark: '#5A62FA' })
assert.deepEqual(widgetAccents('dark'), { accentLight: '#12715E', accentDark: '#19856B' })
assert.deepEqual(widgetAccents('모름|이상'), { accentLight: '#12715E', accentDark: '#19856B' })
assert.equal(widgetArtPath('worm', 2, 'happy'), 'art/v3-worm-2-happy@2x.png')
assert.equal(widgetArtPath('worm', 2, 'happy', 'abc'), 'art/v3-worm-2-abc-happy@2x.png')
assert.equal(widgetArtPath(null, 1, 'default'), 'art/v3-egg@2x.png')

// 대기열
const now = new Date('2026-10-05T10:00:00+09:00')
const a = (id: string, taskId: string, kind: string, at: string) => ({ schema: 1, id, kind, taskId, at })
assert.equal(parseWidgetAction('{bad'), null)
assert.equal(parseWidgetAction(a('../x', 't', 'complete', now.toISOString())), null)
assert.equal(parseWidgetAction(a('a1', 't 1', 'complete', now.toISOString())), null)
assert.equal(parseWidgetAction(a('a1', 't1', 'delete', now.toISOString())), null)
assert.equal(parseWidgetAction(JSON.stringify(a('a1', 't1', 'complete', now.toISOString())))!.taskId, 't1')
const plan = planWidgetActions([
  a('a1', 't1', 'complete', '2026-10-05T09:00:00+09:00'),
  a('a2', 't2', 'complete', '2026-10-05T09:01:00+09:00'),
  a('a3', 't2', 'uncomplete', '2026-10-05T09:02:00+09:00'), // 같은 할 일은 마지막 것만
  a('a4', 't3', 'complete', '2026-09-20T09:00:00+09:00'), // 7일 넘음
  a('a5', 't4', 'complete', '2026-10-05T09:03:00+09:00'), // 이미 반영
  'garbage'
], ['a5'], now)
assert.deepEqual(plan.complete, [{ id: 'a1', taskId: 't1' }])
assert.deepEqual(plan.uncomplete, [{ id: 'a3', taskId: 't2' }])
assert.deepEqual(plan.ids, ['a1', 'a2', 'a3'])

// 딥 링크 검사
assert.ok(isWidgetDate('2026-10-07'))
assert.ok(!isWidgetDate('2026-1-7'))
assert.ok(!isWidgetDate('2026-13-40'))
assert.ok(isWidgetId('3f2a-b_c'))
assert.ok(!isWidgetId('a/b'))

// 비교 키는 generatedAt을 뺀다
assert.equal(widgetSnapshotKey({ schema: 1, generatedAt: 'a', account: { signedIn: false } }), widgetSnapshotKey({ schema: 1, generatedAt: 'b', account: { signedIn: false } }))

console.log('widget ok')
