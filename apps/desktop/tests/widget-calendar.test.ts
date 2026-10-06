// 25 맥 위젯 §15 월 캘린더: 이번 달 격자(일요일 시작) · 날마다 막대(할 일·내 일정·구글/Apple) · 순서 · 상한 · 공휴일 · 보기 설정 · 예시 파일 형식
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { MY_CAL_COLOR } from '@sprout/schema/events'
import { insertStmt, type CoreDb, type Stmt } from '@sprout/schema/taskCore'
import { buildSnapshot, calendarOf, MAX_DAY_ITEMS } from '../src/main/widgetSnapshot'
import type { ExtEvent } from '../src/shared/calendars'

const SQL = await initSqlJs()
const sqldb = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) sqldb.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = sqldb.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const db: CoreDb = { getAll: async <T,>(sql: string, p?: unknown[]) => all(sql, p) as T[], get: async <T,>(sql: string, p?: unknown[]) => (all(sql, p)[0] ?? null) as T | null }
const run = (stmts: Stmt[]) => { for (const s of stmts) sqldb.run(s.sql, s.params as never) }
const setOpts = (o: Record<string, unknown>) => { sqldb.run("DELETE FROM view_settings WHERE view_key = 'calendar'"); run([insertStmt('view_settings', { id: 'vs', view_key: 'calendar', options_json: JSON.stringify(o) })]) }

const today = '2026-10-05' // 월요일 — 10월 1일 목요일, 31일 토요일
run([
  insertStmt('lists', { id: 'l1', name: '업무', kind: 'normal', color: '#4E75F2' }),
  insertStmt('lists', { id: 'l2', name: '색 없음', kind: 'normal' }),
  insertStmt('lists', { id: 'l3', name: '보관', kind: 'normal', color: '#55AA55', archived_at: '2026-09-01' }),
  insertStmt('tasks', { id: 'a', list_id: 'l1', title: '보고서 제출', status: 0, priority: 3, due_at: '2026-10-01', is_all_day: 1, sort_order: 1 }),
  insertStmt('tasks', { id: 'b', list_id: 'l1', title: '끝난 일', status: 1, priority: 0, due_at: '2026-10-05', is_all_day: 1, sort_order: 2 }),
  insertStmt('tasks', { id: 'c', list_id: 'l2', title: '[[팀 회의]] 준비', status: 0, priority: 1, due_at: '2026-10-05T09:00', is_all_day: 0, sort_order: 3 }),
  insertStmt('tasks', { id: 'd', list_id: 'l1', title: '출장', status: 0, priority: 0, start_at: '2026-10-07', due_at: '2026-10-09', is_all_day: 1, sort_order: 4 }),
  insertStmt('tasks', { id: 'e', list_id: 'l3', title: '보관한 리스트', status: 0, due_at: '2026-10-05', sort_order: 5 }),
  insertStmt('tasks', { id: 'f', list_id: 'l1', title: '물 마시기', status: 0, due_at: '2026-10-10', is_all_day: 1, repeat_rule: 'FREQ=DAILY', sort_order: 6 }),
  insertStmt('tasks', { id: 'g', list_id: 'l1', title: '9월 일', status: 0, due_at: '2026-09-29', is_all_day: 1, sort_order: 7 }),
  insertStmt('tasks', { id: 'h', list_id: 'l1', title: '지운 일', status: 0, due_at: '2026-10-05', deleted_at: '2026-10-01', sort_order: 8 }),
  insertStmt('tasks', { id: 'z', list_id: 'l1', title: '다음 달 일', status: 0, due_at: '2026-11-20', sort_order: 9 }),
  insertStmt('events', { id: 'ev1', title: '가족 모임', start_at: '2026-10-03', end_at: '2026-10-03', is_all_day: 1 }),
  insertStmt('events', { id: 'ev2', title: '요가', start_at: '2026-10-06T19:00', end_at: '2026-10-06T20:00', is_all_day: 0, repeat_rule: 'FREQ=WEEKLY', color: '#AA55CC' }),
  insertStmt('events', { id: 'ev3', title: '지운 일정', start_at: '2026-10-06', end_at: '2026-10-06', is_all_day: 1, deleted_at: '2026-10-01' }),
  ...Array.from({ length: 8 }, (_, i) => insertStmt('tasks', { id: `m${i}`, list_id: 'l1', title: `많음 ${i}`, status: 0, due_at: '2026-10-20', is_all_day: 1, sort_order: 100 + i }))
])
const ext: ExtEvent[] = [{ key: 'acc|cal|x1', accountId: 'acc', provider: 'google', calendarId: 'cal', eventId: 'x1', title: '병원', description: '메모는 안 들어감', location: '서울', start: '2026-10-05T15:00', end: '2026-10-05T16:00', allDay: false, recurring: false, color: '#33B679', calendarName: '개인', accountLabel: 'me@example.com', stale: false, hasLink: false }]
const extFn = (from: string, to: string) => ext.filter((e) => e.start.slice(0, 10) <= to && e.end.slice(0, 10) >= from)

// ── 기본 보기 설정(완료 보기 켬 · 반복 회차 끔 · 휴일 표시 켬 · 내 일정 켬) ──
const cal = await calendarOf(db, today, extFn)
assert.equal(cal.month, '2026-10')
assert.equal(cal.title, '10월')
assert.equal(cal.days.length, 35) // 9/27(일) ~ 10/31(토), 5주
assert.equal(cal.days[0].d, '2026-09-27')
assert.equal(cal.days.at(-1)!.d, '2026-10-31')
assert.equal(cal.days[0].other, true)
assert.equal(cal.days.at(-1)!.other, undefined) // 10/31 = 그 달 마지막 날(토)
const day = (d: string) => cal.days.find((x) => x.d === d)!
assert.equal(day('2026-10-01').other, undefined)
// 다른 달 칸에도 그 날 항목이 들어간다(앱 월 보기와 같다)
assert.deepEqual(day('2026-09-29').items.map((i) => i.id), ['g'])
// 공휴일(06 §16): 개천절(토)·대체공휴일(월)·한글날(금)
assert.equal(day('2026-10-03').holiday, '개천절')
assert.ok(day('2026-10-05').holiday)
assert.equal(day('2026-10-09').holiday, '한글날')
assert.equal(day('2026-10-06').holiday, undefined)

// 10월 5일: 종일 먼저(완료 b) → 시각 순(할 일 9:00, 구글 15:00). 보관 리스트·지운 일 없음
const d5 = day('2026-10-05')
assert.deepEqual(d5.items.map((i) => i.kind + ':' + (i.id ?? i.title)), ['task:b', 'task:c', 'ext:병원'])
assert.equal(d5.count, 3)
const [b, c, x] = d5.items
assert.equal(b.done, true) // 완료 = 흐림(취소선은 위젯이 그리지 않음)
assert.equal(b.allDay, true)
assert.equal(c.done, false)
assert.equal(c.allDay, false)
assert.equal(c.title, '팀 회의 준비') // 33 §6.6 위키 링크 괄호 없이
assert.equal(c.color, null) // 색 없는 리스트 = 테마 강조색(위젯이 칠함)
assert.equal(b.color, '#4E75F2')
assert.equal(x.id, null)
assert.equal(x.color, '#33B679')
// 막대에는 제목·색·종류만(메모·장소·계정 없음 — §15.5)
assert.deepEqual(Object.keys(x).sort(), ['allDay', 'color', 'done', 'id', 'kind', 'repeat', 'title'])
assert.ok(!JSON.stringify(cal).includes('example.com') && !JSON.stringify(cal).includes('서울'))

// 여러 날 할 일은 날마다 막대 하나
for (const dd of ['2026-10-07', '2026-10-08', '2026-10-09']) assert.ok(day(dd).items.some((i) => i.id === 'd'), dd)
// 내 일정: 색 없으면 기본 "내 일정" 색, 반복 일정은 회차마다
assert.deepEqual(day('2026-10-03').items.map((i) => [i.kind, i.id, i.color]), [['event', 'ev1', MY_CAL_COLOR]])
for (const dd of ['2026-10-06', '2026-10-13', '2026-10-27']) assert.ok(day(dd).items.some((i) => i.id === 'ev2' && i.repeat && !i.allDay), dd)
assert.ok(!day('2026-10-06').items.some((i) => i.id === 'ev3'))
// 반복 할 일은 기본(반복 회차 끔)에선 첫 날만
assert.deepEqual(cal.days.filter((dd) => dd.items.some((i) => i.id === 'f')).map((dd) => dd.d), ['2026-10-10'])
// 하루 상한: 막대 6개 + 전체 수(종일 8개 + 요가 1개)
assert.equal(day('2026-10-20').items.length, MAX_DAY_ITEMS)
assert.equal(day('2026-10-20').count, 9)
assert.ok(day('2026-10-20').items.every((i) => i.allDay)) // 종일이 시각보다 앞

// ── 보기 설정을 따른다: 완료 숨김 · 반복 회차 · 휴일 끔 · 내 일정 끔 · 우선순위 색 · 리스트 필터 ──
setOpts({ completed: 0, repeats: 1, holidays: 0, myCal: 0, color: 'priority' })
const cal2 = await calendarOf(db, today, extFn)
const day2 = (d: string) => cal2.days.find((x) => x.d === d)!
assert.ok(!day2('2026-10-05').items.some((i) => i.id === 'b'))
assert.equal(day2('2026-10-03').holiday, undefined)
assert.ok(!cal2.days.some((dd) => dd.items.some((i) => i.kind === 'event')))
assert.ok(day2('2026-10-11').items.some((i) => i.id === 'f')) // 반복 미래 회차(원래 할 일 id로 링크)
assert.ok(day2('2026-10-31').items.some((i) => i.id === 'f'))
assert.equal(day2('2026-10-01').items[0].color, '#C53C31') // 높음 = 빨강
setOpts({ lists: ['l2'] })
const cal3 = await calendarOf(db, today)
assert.deepEqual([...new Set(cal3.days.flatMap((dd) => dd.items.filter((i) => i.kind === 'task').map((i) => i.id)))], ['c'])
setOpts({})

// 6주 달: 2026년 8월(1일 토요일, 31일 월요일) → 7/26 ~ 9/5
assert.equal((await calendarOf(db, '2026-08-15')).days.length, 42)
// 06 §16.1 주 시작 설정 → 맥 위젯 칸도 그 요일부터(weekStart를 함께 넘김)
assert.equal(cal.weekStart, 0)
setOpts({ weekStart: 1 })
const calMon = await calendarOf(db, today, extFn)
assert.equal(calMon.weekStart, 1)
assert.equal(calMon.days[0].d, '2026-09-28')
assert.equal(calMon.days.at(-1)!.d, '2026-11-01')
setOpts({ weekStart: 6 })
const calSat = await calendarOf(db, today, extFn)
assert.equal(calSat.weekStart, 6)
assert.equal(calSat.days[0].d, '2026-09-26')
assert.equal(calSat.days.length, 42)
setOpts({})

// ── 저장 파일: 로그인이면 calendar가 있고, 로그아웃이면 없다 ──
const snap = await buildSnapshot(db, { today, now: new Date('2026-10-05T09:00:00+09:00'), signedIn: true, extEvents: extFn })
assert.equal(snap.calendar?.month, '2026-10')
assert.equal((await buildSnapshot(db, { today, now: new Date(), signedIn: false })).calendar, undefined)
// 크기 목표(§15.5): 이 예시 달이 10KB 안
assert.ok(JSON.stringify(snap.calendar).length < 10_000, `calendar ${JSON.stringify(snap.calendar).length}B`)

// ── 예시 파일(Swift 미리보기와 공용)이 계약 모양을 지킨다 ──
const fixture = JSON.parse(readFileSync('apps/desktop/native/widget/fixtures/snapshot.calendar.json', 'utf8'))
assert.equal(fixture.schema, 1)
assert.match(fixture.calendar.month, /^\d{4}-\d{2}$/)
assert.ok([35, 42].includes(fixture.calendar.days.length))
assert.equal(new Date(`${fixture.calendar.days[0].d}T00:00`).getDay(), fixture.calendar.weekStart ?? 0) // 주 시작(weekStart) 요일부터
const fItem = fixture.calendar.days.flatMap((dd: { items: unknown[] }) => dd.items)[0] as Record<string, unknown>
assert.deepEqual(Object.keys(fItem).sort(), Object.keys(x).sort())
console.log('widget calendar tests ok')
