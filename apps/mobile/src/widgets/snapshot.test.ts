// 36 §7.2 모바일 위젯 저장 파일 조립 시험: 오늘 순서·날짜 문구·하위·월 칸 항목(할 일·일정·색·옅게)·로그아웃 형태
import assert from 'node:assert/strict'
import type { TaskRow } from '../data/views.ts'
import type { EventRow } from '../data/eventsModel.ts'
import { composeWidgetSnapshot, todayItems, type WidgetData } from './snapshot.ts'

const today = '2026-10-05'
const now = new Date('2026-10-05T10:00:00')
let n = 0
const t = (p: Partial<TaskRow>): TaskRow => ({
  id: `t${++n}`, list_id: 'l1', parent_id: null, section_id: null, title: `할 일 ${n}`, content: null, content_mode: 'text', status: 0, priority: 0,
  start_at: null, due_at: null, is_all_day: 1, sort_order: n, repeat_rule: null, pinned_at: null, created_at: null, completed_at: null, deleted_at: null,
  list_name: '업무', list_emoji: null, list_color: null, list_kind: 'normal', check_total: 0, check_done: 0, reminder_count: 0, ...p
})

// 오늘: 만료됨 먼저 → 시각순 → 종일, 하위는 부모 아래
const over = t({ title: '보고서', due_at: '2026-10-03', priority: 2 })
const late = t({ title: '점심', due_at: '2026-10-05T12:30', is_all_day: 0 })
const early = t({ title: '스트레칭', due_at: '2026-10-05T08:00', is_all_day: 0, repeat_rule: 'FREQ=DAILY' })
const allday = t({ title: '[[독서]] 30분', due_at: '2026-10-05', priority: 3 })
const child = t({ title: '자료', parent_id: allday.id })
const items = todayItems([allday, late, child, over, early], today)
assert.deepEqual(items.map((i) => i.title), ['보고서', '스트레칭', '점심', '독서 30분', '자료'])
assert.deepEqual(items.map((i) => i.depth), [0, 0, 0, 0, 1])
assert.equal(items[0].label, '10월 3일')
assert.equal(items[0].labelTone, 'danger')
assert.equal(items[1].label, '오전 8:00')
assert.equal(items[1].repeat, true)
assert.equal(items[3].label, '오늘')
assert.equal(items[3].priority, 3)

// 월 칸
const ev: EventRow = { id: 'e1', title: '치과', notes: null, start_at: '2026-10-07T15:00', end_at: '2026-10-07T16:00', is_all_day: 0, repeat_rule: null, location: null, reminders: null, color: null }
const data: WidgetData = {
  todayRows: [allday, late, child, over, early],
  calTasks: [
    t({ id: 'c1', title: '여행', start_at: '2026-10-06', due_at: '2026-10-08', list_color: '#FF8800ff' }),
    t({ id: 'c2', title: '끝낸 일', due_at: '2026-10-07', status: 1 }),
    t({ id: 'c3', title: '어제 회의', due_at: '2026-10-04T09:00', is_all_day: 0 })
  ],
  events: [ev],
  calendarOptions: JSON.stringify({ myColor: '#33AA55' }),
  theme: 'teal|black',
  character: { name: '미미', species: 'cat' },
  xp: [{ kind: 'task', amount: 1, day: today, created_at: '2026-10-05T01:00:00Z' }]
}
const snap = composeWidgetSnapshot(data, { today, now, signedIn: true, appliedActions: ['a1'] })
assert.equal(snap.schema, 1)
assert.equal(snap.day, today)
assert.deepEqual(snap.theme, { accentLight: '#237973', accentDark: '#5A62FA' })
assert.equal(snap.today!.count, 5)
assert.equal(snap.growth!.mood, 'happy')
assert.equal(snap.growth!.species, 'worm') // 옛 종 id(cat)도 새 종으로
assert.equal(snap.growth!.art, 'art/v5-worm-1-happy@2x.png')
assert.equal(snap.growth!.todayTaskXp, 1)
const cal = snap.calendar!
assert.equal(cal.months.length, 4)
assert.equal(cal.months[cal.current].month, '2026-10')
const day = (d: string) => cal.months[cal.current].weeks.flat().find((c) => c.date === d)!
// 10/7: 여러 날 막대(여행) 먼저 → 끝낸 일(종일) → 치과(시각 일정)
assert.deepEqual(day('2026-10-07').items.map((i) => i.title), ['여행', '끝낸 일', '치과'])
assert.equal(day('2026-10-07').items[0].color, '#FF8800')
assert.equal(day('2026-10-07').items[1].faded, true, '완료는 옅게')
assert.equal(day('2026-10-07').items[2].kind, 'event')
assert.equal(day('2026-10-07').items[2].id, 'e1', '일정 id는 ev: 없이')
assert.equal(day('2026-10-07').items[2].color, '#33AA55', '일정 색 = 내 일정 색')
assert.equal(day('2026-10-06').total, 1)
assert.equal(day('2026-10-08').items[0].title, '여행')
assert.equal(day('2026-10-04').items[0].faded, true, '지난 시각 할 일은 옅게')
assert.equal(day('2026-10-05').today, true)
assert.equal(day('2026-10-03').holiday, '개천절')
assert.equal(day('2026-10-09').tone, 'holiday')
// 휴일 표시 끄면 이름 없음
const off = composeWidgetSnapshot({ ...data, calendarOptions: JSON.stringify({ holidays: 0 }) }, { today, now, signedIn: true })
assert.equal(off.calendar!.months[1].weeks.flat().find((c) => c.date === '2026-10-03')!.holiday, null)
// 06 §16.1 주 시작 설정 → 위젯 머리·줄이 그 요일부터, 항목은 그대로
assert.equal(cal.weekStart, 0)
const mon = composeWidgetSnapshot({ ...data, calendarOptions: JSON.stringify({ weekStart: 1, myColor: '#33AA55' }) }, { today, now, signedIn: true }).calendar!
assert.equal(mon.weekStart, 1)
assert.deepEqual(mon.weekHead, ['월', '화', '수', '목', '금', '토', '일'])
assert.equal(mon.months[mon.current].weeks[0][0].date, '2026-09-28')
assert.ok(mon.months[mon.current].weeks.every((w) => w[5].tone !== 'sun' && w[6].tone !== 'sat' && w[0].tone !== 'sun'))
assert.deepEqual(mon.months[mon.current].weeks.flat().find((c) => c.date === '2026-10-07')!.items.map((i) => i.title), ['여행', '끝낸 일', '치과'])

// 로그아웃 형태: 제목이 남지 않는다
const out = composeWidgetSnapshot(data, { today, now, signedIn: false })
assert.deepEqual(Object.keys(out).sort(), ['account', 'generatedAt', 'schema'])
assert.ok(!JSON.stringify(out).includes('보고서'))

console.log('widget snapshot ok')
