// 06 §14.4 sprout 자체 일정: 만들기·고치기·끌기·복제·삭제·되돌리기·할 일 ⇄ 일정·검색·캘린더 항목·회차
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { applyEventSchedule, convertEventToTask, convertTaskToEvent, createEvent, deleteEvents, duplicateEvents, EVENTS_IN_RANGE, EV_PREFIX, eventIdOf, isEventKey, rescheduleEvents, searchEvents, updateEvent, type EventRow } from '../src/renderer/src/data/events'
import { createTask, insert, run } from '../src/renderer/src/data/mutations'
import { eventItems, eventListItems, evtOf } from '../src/renderer/src/lib/calendarEvents'
import { DEFAULT_OPTIONS, isBarItem, layoutDay } from '../src/renderer/src/lib/calendar'
import { extTimeGroup, sortExt } from '../src/renderer/src/lib/calendarExt'
import { MY_CAL_COLOR } from '@sprout/schema/events'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
Object.assign(globalThis, { window: { sprout: { db: { getAll: async (sql: string, p?: unknown[]) => all(sql, p), get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null, transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } } } }, dispatchEvent: () => true } })
const ev = (id: string) => all('SELECT * FROM events WHERE id = ?', [id])[0] as unknown as EventRow

// ── 옵션 기본값: 내 일정 보이기 켬, 색 없음(= MY_CAL_COLOR) ──
assert.equal(DEFAULT_OPTIONS.myCal, 1)
assert.equal(DEFAULT_OPTIONS.myColor, null)
assert.equal(isEventKey(`${EV_PREFIX}abc`), true)
assert.equal(eventIdOf(`${EV_PREFIX}abc`), 'abc')
assert.equal(eventIdOf('abc'), 'abc')

// ── 만들기: 시간 칸 클릭(한 시각) = 1시간, 종일, 빈 제목 거절 ──
const a = await createEvent({ title: ' 피부과 ', start_at: null, due_at: '2026-10-07T15:00', reminders: ['-PT0M'], location: '강남역', notes: '' })
assert.deepEqual([ev(a).title, ev(a).start_at, ev(a).end_at, ev(a).is_all_day, ev(a).location, ev(a).notes, ev(a).reminders], ['피부과', '2026-10-07T15:00', '2026-10-07T16:00', 0, '강남역', null, '["-PT0M"]'])
const b = await createEvent({ title: '휴가', start_at: '2026-10-08', due_at: '2026-10-10' })
assert.deepEqual([ev(b).start_at, ev(b).end_at, ev(b).is_all_day, ev(b).reminders], ['2026-10-08', '2026-10-10', 1, null])
await assert.rejects(() => createEvent({ title: '  ', start_at: null, due_at: '2026-10-07' }), /제목/)

// ── 기간 쿼리: 겹침 + 그 전에 시작한 반복 ──
const range = (from: string, to: string) => all(EVENTS_IN_RANGE, [to, from, to]).map((r) => r.title)
assert.deepEqual(range('2026-10-09', '2026-10-09'), ['휴가'])
const weekly = await createEvent({ title: '스터디', start_at: '2026-09-28T19:00', due_at: '2026-09-28T21:00', repeat_rule: 'FREQ=WEEKLY' })
assert.deepEqual(range('2026-10-12', '2026-10-18'), ['스터디'])

// ── 캘린더 항목: 반복 회차 계산, 색, 가짜 태스크 id ──
const rows = all(EVENTS_IN_RANGE, ['2026-10-11', '2026-10-05', '2026-10-11']) as unknown as EventRow[]
const items = eventItems(rows, '2026-10-05', '2026-10-11', null)
const study = items.filter((i) => evtOf(i)?.id === weekly)
assert.deepEqual(study.map((i) => [i.start, i.end, i.virtual]), [['2026-10-05T19:00', '2026-10-05T21:00', true]])
assert.equal(study[0].key, `${EV_PREFIX}${weekly}@2026-10-05`)
assert.equal(study[0].task.id, `${EV_PREFIX}${weekly}`)
assert.equal(study[0].task.list_color, MY_CAL_COLOR)
assert.equal(eventItems(rows, '2026-10-05', '2026-10-11', '#60a5fa')[0].task.list_color, '#60a5fa')
const vacation = items.find((i) => evtOf(i)?.id === b)!
assert.equal(isBarItem(vacation), true)
const derm = items.find((i) => evtOf(i)?.id === a)!
assert.equal(layoutDay(items, '2026-10-07').map((x) => x.item.key).includes(derm.key), true)
// 목록 행: 구독 일정과 같은 그룹·순서 규칙
const list = sortExt(eventListItems(rows, '2026-10-05', '2026-10-11', null))
assert.deepEqual(list.map((l) => l.title), ['스터디', '피부과', '휴가'])
assert.equal(extTimeGroup(list[0], '2026-10-05'), 'today')
assert.equal(extTimeGroup(list[1], '2026-10-05'), 'next7')

// ── 끌기·길이(06 §7.2): 종일 → 시간 칸, 시간 → 종일, 되돌리기 ──
let restore = await rescheduleEvents([{ id: `${EV_PREFIX}${a}`, start_at: '2026-10-07T16:00', due_at: '2026-10-07T17:30' }])
assert.deepEqual([ev(a).start_at, ev(a).end_at], ['2026-10-07T16:00', '2026-10-07T17:30'])
await restore()
assert.deepEqual([ev(a).start_at, ev(a).end_at], ['2026-10-07T15:00', '2026-10-07T16:00'])
restore = await rescheduleEvents([{ id: a, start_at: null, due_at: '2026-10-07' }])
assert.deepEqual([ev(a).start_at, ev(a).end_at, ev(a).is_all_day], ['2026-10-07', '2026-10-07', 1])
await restore()
assert.equal(ev(a).is_all_day, 0)

// ── 팝오버: 고치기·날짜 선택기·되돌리기 ──
restore = await updateEvent(a, { title: '피부과 재진' })
assert.equal(ev(a).title, '피부과 재진')
await restore()
assert.equal(ev(a).title, '피부과')
restore = await applyEventSchedule(a, { start_at: null, due_at: '2026-10-09T10:00', repeat_rule: 'FREQ=MONTHLY', reminders: ['-PT15M', '-PT15M'] })
assert.deepEqual([ev(a).start_at, ev(a).end_at, ev(a).repeat_rule, ev(a).reminders], ['2026-10-09T10:00', '2026-10-09T11:00', 'FREQ=MONTHLY', '["-PT15M"]'])
await restore()
assert.deepEqual([ev(a).start_at, ev(a).repeat_rule, ev(a).reminders], ['2026-10-07T15:00', null, '["-PT0M"]'])

// ── 복제(⌥ 끌기)·삭제·되돌리기 ──
const undoDup = await duplicateEvents([{ id: `${EV_PREFIX}${a}`, start_at: '2026-10-14T15:00', due_at: '2026-10-14T16:00' }])
assert.equal(all("SELECT count(*) AS n FROM events WHERE title = '피부과'")[0].n, 2)
await undoDup()
assert.equal(all("SELECT count(*) AS n FROM events WHERE title = '피부과'")[0].n, 1)
restore = await deleteEvents([`${EV_PREFIX}${b}`])
assert.ok(ev(b).deleted_at)
assert.deepEqual(range('2026-10-09', '2026-10-09'), ['스터디'], '지운 휴가는 빠지고, 반복 일정은 후보로 남는다')
await restore()
assert.equal(ev(b).deleted_at, null)

// ── 할 일 → 일정(06 §14.4.6): 체크 항목·알림, 할 일은 휴지통, 되돌리기 ──
const inbox = 'inbox-1'
await run(insert('lists', { id: inbox, name: '기본함', kind: 'inbox', sort_order: 0 }))
const t = await createTask({ title: '미용실', list_id: inbox, due_at: '2026-10-10T11:00' })
await run(insert('tasks', { id: 'chk-task', title: '병원', list_id: inbox, content: '', content_mode: 'checklist', status: 0, priority: 0, due_at: '2026-10-11', is_all_day: 1, time_zone: 'floating', sort_order: 0 }),
  insert('check_items', { id: 'c1', task_id: 'chk-task', title: '보험증', done: 0, sort_order: 0 }),
  insert('reminders', { id: 'r1', task_id: t, trigger: '-PT0M' }))
const conv = await convertTaskToEvent(t, '2026-10-05')
assert.ok(conv && conv !== 'has-children')
assert.deepEqual([ev(conv.id).title, ev(conv.id).start_at, ev(conv.id).end_at, ev(conv.id).reminders], ['미용실', '2026-10-10T11:00', '2026-10-10T12:00', '["-PT0M"]'])
assert.ok(all('SELECT deleted_at FROM tasks WHERE id = ?', [t])[0].deleted_at)
await conv.restore()
assert.equal(all('SELECT deleted_at FROM tasks WHERE id = ?', [t])[0].deleted_at, null)
assert.equal(all('SELECT count(*) AS n FROM events WHERE id = ?', [conv.id])[0].n, 0)
const conv2 = await convertTaskToEvent('chk-task', '2026-10-05')
assert.ok(conv2 && conv2 !== 'has-children')
assert.equal(ev(conv2.id).notes, '- 보험증')
assert.equal(ev(conv2.id).is_all_day, 1)
// 하위 할 일이 있으면 바꾸지 않는다
await createTask({ title: '하위', list_id: inbox, parent_id: t })
assert.equal(await convertTaskToEvent(t, '2026-10-05'), 'has-children')

// ── 일정 → 할 일: 장소는 설명 첫 줄, 알림 행, 일정은 지움, 되돌리기 ──
const back = await convertEventToTask(`${EV_PREFIX}${a}`, inbox)
assert.ok(back)
const task = all('SELECT * FROM tasks WHERE id = ?', [back.id])[0]
assert.deepEqual([task.title, task.list_id, task.start_at, task.due_at, task.content, task.status], ['피부과', inbox, '2026-10-07T15:00', '2026-10-07T16:00', '📍 강남역', 0])
assert.equal(all('SELECT trigger FROM reminders WHERE task_id = ?', [back.id])[0].trigger, '-PT0M')
assert.ok(ev(a).deleted_at)
await back.restore()
assert.equal(ev(a).deleted_at, null)
assert.equal(all('SELECT count(*) AS n FROM tasks WHERE id = ?', [back.id])[0].n, 0)
assert.equal(all('SELECT count(*) AS n FROM reminders WHERE task_id = ?', [back.id])[0].n, 0)

// ── 검색(⌘F): 제목·설명·장소, 지운 일정 제외 ──
assert.deepEqual((await searchEvents('강남')).map((e) => e.id), [a])
assert.deepEqual((await searchEvents('보험')).map((e) => e.id), [conv2.id])
assert.deepEqual(await searchEvents('  '), [])
await deleteEvents([a])
assert.deepEqual(await searchEvents('강남'), [])

console.log('events: ok')
