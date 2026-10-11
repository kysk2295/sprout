// 2026-10-11 Codex 전체 리뷰(데스크톱 일정·비서 데이터 손상): 다리 내려받기 경합 · 이후 모든 회차 COUNT/참석자 ·
// 일정 되돌리기는 바꾼 칸만 · 연결된 복제 되돌리기는 deleted_at · 비서 완료 카드 되돌리기(반복·하위)
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { planComplete, planDeleteHard, planReopen } from '@sprout/schema/taskCore'
import { saveCard, undoCard } from '@sprout/schema/assistantAgent'
import type { ConfirmCard } from '@sprout/schema/assistantExec'
import { CalendarBridge, type BridgeDb } from '../src/main/calendarBridge'
import { CalendarWriter } from '../src/main/calendarWrite'
import type { CalendarStore } from '../src/main/calendarStore'
import type { GoogleSync } from '../src/main/googleSync'
import { fingerprint, type LinkedRow } from '../src/main/calendarLink'
import type { EventRow as ExtRow, GoogleEvent } from '../src/shared/calendars'
import { createEvent, duplicateEvents, updateEvent } from '../src/renderer/src/data/events'
import { agentWrites } from '../src/renderer/src/data/assistant'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, any>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const sdb = {
  getAll: async (sql: string, p?: unknown[]) => all(sql, p),
  get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
  transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
}
Object.assign(globalThis, { window: { sprout: { db: sdb }, dispatchEvent: () => true } })

// ── #1 다리: 외부를 묻는 동안 꿈틀에서 고치면 내려받기가 덮지 않는다 ──
const bdb: BridgeDb = { getAll: async <T>(s: string, p: unknown[] = []) => all(s, p) as T[], execute: async (s: string, p: unknown[] = []) => { db.run(s, p as never) } }
let remote: GoogleEvent = { id: 'g1', summary: '치과(웹)', updated: '2026-10-10T00:00:00Z', etag: 'e2', start: { dateTime: '2026-10-20T15:00:00+09:00' }, end: { dateTime: '2026-10-20T16:00:00+09:00' } }
let duringFetch: () => void = () => {}
const google = { canWrite: () => true, getEvent: async () => { duringFetch(); return remote } } as unknown as GoogleSync
const store = {
  account: () => ({ id: 'acc', provider: 'google', status: 'ok' }),
  calendarByHash: () => ({ calendar_id: 'cal', access_role: 'owner', visibility: 'show', full_synced_at: 'x' }),
  setLookalike: () => {}, setHidden: () => {}, setCanWrite: () => {},
  eventsByBase: () => [{ updated: '2026-10-10T00:00:00Z' }]
} as unknown as CalendarStore
const bridge = new CalendarBridge({ db: bdb, store, google: () => google, apple: () => { throw new Error('no apple') }, timeZone: () => 'Asia/Seoul', online: () => true, toast: () => {}, changed: () => {} })
const base = { title: '치과', notes: null, location: null, start_at: '2026-10-20T15:00', end_at: '2026-10-20T16:00', is_all_day: 0, repeat_rule: null }
const seed = (id: string) => db.run(`INSERT INTO events (id, modified_at, title, start_at, end_at, is_all_day, ext_provider, ext_account, ext_calendar, ext_id, ext_etag, ext_updated, ext_hash) VALUES (?, '2026-10-01T00:00:00.000Z', '치과', '2026-10-20T15:00', '2026-10-20T16:00', 0, 'google', 'acc', 'c', 'g1', 'e1', '2026-10-01T00:00:00Z', ?)`, [id, fingerprint(base)])
const brow = (id: string) => all('SELECT * FROM events WHERE id = ?', [id])[0] as LinkedRow
seed('b1')
duringFetch = () => db.run("UPDATE events SET title = '치과(꿈틀)', modified_at = '2026-10-11T00:00:00.000Z' WHERE id = 'b1'")
await bridge.pass()
assert.equal(brow('b1').title, '치과(꿈틀)', '묻는 동안 고친 내용을 외부 내용으로 덮지 않는다')
// 외부에서 지워진 것으로 보여도, 묻는 동안 꿈틀에서 고쳤으면 지우지 않는다
db.run("DELETE FROM events WHERE id = 'b1'"); seed('b2')
remote = { ...remote, status: 'cancelled' }
duringFetch = () => db.run("UPDATE events SET title = '치과(꿈틀2)', modified_at = '2026-10-11T00:00:00.000Z' WHERE id = 'b2'")
await bridge.pass()
assert.equal(brow('b2').deleted_at, null)
// 그대로면 평소처럼 내려받는다
db.run("DELETE FROM events WHERE id = 'b2'"); seed('b3')
remote = { ...remote, status: 'confirmed' }
duringFetch = () => {}
await bridge.pass()
assert.equal(brow('b3').title, '치과(웹)')
db.run("DELETE FROM events WHERE id = 'b3'")

// ── #2 이후 모든 회차: COUNT는 남은 횟수, 참석자·알림은 새 반복으로 ──
const master: GoogleEvent & Record<string, unknown> = { id: 'rr', etag: 'm1', summary: '회의', start: { dateTime: '2026-10-12T10:00:00+09:00' }, end: { dateTime: '2026-10-12T11:00:00+09:00' }, recurrence: ['RRULE:FREQ=DAILY;COUNT=3'], attendees: [{ email: 'kim@example.com' }], reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 5 }] } }
const inserted: Record<string, unknown>[] = []
const wg = { canWrite: () => true, getEvent: async () => master, patchEvent: async () => ({}), insertEvent: async (_a: string, _c: string, body: Record<string, unknown>) => { inserted.push(body); return {} } } as unknown as GoogleSync
const occ: ExtRow = { account_id: 'acc', calendar_id: 'cal', event_id: 'rr_20261014', recurring: 1, status: 'confirmed', title: '회의', description: null, location: null, start: '2026-10-14T10:00', end: '2026-10-14T11:00', all_day: 0, time_zone: null, link: null, declined: 0, updated: null, base_id: 'rr', etag: 'o1', event_type: null, organizer_self: 1, guests_can_modify: 0, has_attendees: 1, original_start: '2026-10-14T10:00' }
const wstore = { viewOf: () => ({ writable: true, provider: 'google' }), event: () => occ, applyEvents: () => {}, deleteEventRows: () => {} } as unknown as CalendarStore
const writer = new CalendarWriter({ store: wstore, google: () => wg, apple: () => { throw new Error('no apple') }, timeZone: () => 'Asia/Seoul', online: () => true, refresh: async () => {}, changed: () => {} })
assert.deepEqual(await writer.update('acc|cal|rr_20261014', { title: '회의(마지막)' }, { scope: 'following' }), { ok: true })
assert.deepEqual(inserted[0].recurrence, ['RRULE:FREQ=DAILY;COUNT=1'], 'COUNT=3의 마지막 회차부터 = 1회(끝없는 반복이 되지 않는다)')
assert.deepEqual(inserted[0].attendees, master.attendees)
assert.deepEqual(inserted[0].reminders, master.reminders)

// ── #3 일정 되돌리기: 바꾼 칸만, 그 뒤 다른 곳에서 바뀌지 않은 칸만 ──
const e1 = await createEvent({ title: '스터디', start_at: null, due_at: '2026-10-20T19:00', notes: '처음 설명' })
const undoTitle = await updateEvent(e1, { title: '스터디(바꿈)' })
db.run("UPDATE events SET notes = '다른 기기 설명' WHERE id = ?", [e1])
await undoTitle()
assert.deepEqual([all('SELECT title, notes FROM events WHERE id = ?', [e1])[0].title, all('SELECT notes FROM events WHERE id = ?', [e1])[0].notes], ['스터디', '다른 기기 설명'])
const undoTitle2 = await updateEvent(e1, { title: '스터디(2)' })
db.run("UPDATE events SET title = '다른 기기 제목' WHERE id = ?", [e1])
await undoTitle2()
assert.equal(all('SELECT title FROM events WHERE id = ?', [e1])[0].title, '다른 기기 제목', '그 뒤 다른 곳에서 고친 칸은 되돌리지 않는다')

// ── #4 연결된 일정 복제 되돌리기 = deleted_at(다리가 외부 사본도 지운다), 연결 없는 복제 = 바로 없앰 ──
const linked = await createEvent({ title: '외부', start_at: null, due_at: '2026-10-21T10:00', link: { provider: 'google', account: 'acc', calendar: 'c', color: '#000' } })
const plain = await createEvent({ title: '내 일정', start_at: null, due_at: '2026-10-21T11:00' })
const before = new Set(all('SELECT id FROM events').map((r) => r.id))
const undoDup = await duplicateEvents([{ id: linked, start_at: null, due_at: null }, { id: plain, start_at: null, due_at: null }])
const copies = all('SELECT id, ext_provider FROM events').filter((r) => !before.has(r.id))
assert.equal(copies.length, 2)
db.run("UPDATE events SET ext_id = 'gcopy' WHERE ext_provider = 'google' AND id IN (?, ?)", [copies[0].id, copies[1].id]) // 다리가 이미 올림
await undoDup()
const lc = copies.find((c) => c.ext_provider)!, pc = copies.find((c) => !c.ext_provider)!
assert.ok(all('SELECT deleted_at FROM events WHERE id = ?', [lc.id])[0]?.deleted_at, '연결된 복제는 행을 남기고 지움 표시')
assert.equal(all('SELECT id FROM events WHERE id = ?', [pc.id]).length, 0)

// ── #5 비서 완료 카드 되돌리기: 반복은 회차·기록까지, 일반은 함께 끝난 하위까지 ──
const env = { today: '2026-10-11' }
const complete = async (ids: string[]) => { await sdb.transaction((await planComplete(sdb, ids, env)).stmts) }
const reopen = async (ids: string[]) => { const p = await planReopen(sdb, ids, env); await sdb.transaction([...p.stmts, ...(await planDeleteHard(sdb, p.records))]) }
const t0 = '2026-10-01T00:00:00.000Z'
db.run(`INSERT INTO tasks (id, title, list_id, status, due_at, is_all_day, repeat_rule, repeat_from, modified_at) VALUES ('rep', '물 마시기', 'l', 0, '2026-10-11', 1, 'FREQ=DAILY', 'due', ?)`, [t0])
db.run(`INSERT INTO tasks (id, title, list_id, status, modified_at) VALUES ('par', '보고서', 'l', 0, ?)`, [t0])
db.run(`INSERT INTO tasks (id, title, list_id, status, parent_id, modified_at) VALUES ('kid', '초안', 'l', 0, 'par', ?)`, [t0])
const w = agentWrites({ complete, uncomplete: reopen })
const card = (id: string) => ({ type: 'confirm', op: 'complete', state: 'pending', title: '', targets: [{ id, title: '', picked: true }] }) as unknown as ConfirmCard
const saved = await saveCard(card('rep'), w)
assert.equal(all("SELECT due_at FROM tasks WHERE id = 'rep'")[0].due_at, '2026-10-12', '반복은 다음 회차로')
assert.equal(all("SELECT count(*) AS n FROM tasks WHERE repeat_origin_id = 'rep'")[0].n, 1)
assert.equal((await undoCard(saved, w)).state, 'undone', '반복 할 일 완료도 되돌린다')
assert.deepEqual([all("SELECT due_at FROM tasks WHERE id = 'rep'")[0].due_at, all("SELECT count(*) AS n FROM tasks WHERE repeat_origin_id = 'rep'")[0].n], ['2026-10-11', 0])
const saved2 = await saveCard(card('par'), w)
assert.deepEqual(all("SELECT status FROM tasks WHERE id IN ('par', 'kid') ORDER BY id").map((r) => r.status), [1, 1])
await undoCard(saved2, w)
assert.deepEqual(all("SELECT status FROM tasks WHERE id IN ('par', 'kid') ORDER BY id").map((r) => r.status), [0, 0], '함께 끝난 하위도 다시 연다')

console.log('review-1011-events.test: ok')
