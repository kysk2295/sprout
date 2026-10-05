// 16 §12 양방향: 변환(반복·종일·시간대)·판정 · 캐시 전용 쓰기(화면 먼저·412·오프라인·반복 범위·되돌리기) · 연결된 일정 다리(올리기·내려받기·지움·충돌·숨김) · Apple 도우미 쓰기
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { judgeWritable, SCOPES, canReadScope, canWriteScope, type AppleEvent } from '../src/shared/calendars'
import { appleInput, calHash, fieldsFromApple, fieldsFromGoogle, fingerprint, googleBody, googleIdFor, icsToRule, ruleToIcs, type LinkedRow } from '../src/main/calendarLink'
import { CalendarStore, type SqlDb } from '../src/main/calendarStore'
import { GoogleSync, startOAuth, type Tokens, type TokenVault } from '../src/main/googleSync'
import { AppleSync, type RunHelper } from '../src/main/appleSync'
import { CalendarWriter } from '../src/main/calendarWrite'
import { CalendarBridge, CONFLICT_TOAST, type BridgeDb } from '../src/main/calendarBridge'
import { startFakeGoogle } from './fakeGoogle'

const SQL = await initSqlJs()
function memDb(): SqlDb {
  const db = new SQL.Database()
  let depth = 0
  return {
    exec: (s) => db.exec(s),
    run: (s, p = []) => db.run(s, p as never),
    all: <T>(s: string, p: unknown[] = []) => { const st = db.prepare(s); st.bind(p as never); const out: T[] = []; while (st.step()) out.push(st.getAsObject() as T); st.free(); return out },
    tx: <T>(fn: () => T) => { if (depth) return fn(); depth++; db.run('BEGIN'); try { const r = fn(); db.run('COMMIT'); return r } catch (e) { db.run('ROLLBACK'); throw e } finally { depth-- } }
  }
}
const TZ = 'Asia/Seoul'

// ── 1. 변환 ──
assert.deepEqual(SCOPES, ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events'], '새 연결은 처음부터 쓰기 범위')
assert.ok(canReadScope('https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly'), 'v1 읽기 전용 토큰도 읽기는 된다')
assert.ok(!canWriteScope('https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly'))
assert.deepEqual(ruleToIcs('FREQ=WEEKLY;BYDAY=MO,WE', { timed: true, timeZone: TZ }), ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])
assert.deepEqual(ruleToIcs('FREQ=DAILY;UNTIL=20261031', { timed: true, timeZone: TZ }), ['RRULE:FREQ=DAILY;UNTIL=20261031T235959Z'], '시각 일정 UNTIL은 UTC 날짜·시각')
assert.deepEqual(ruleToIcs('FREQ=DAILY;UNTIL=20261031', { timed: false, timeZone: TZ }), ['RRULE:FREQ=DAILY;UNTIL=20261031'])
assert.deepEqual(ruleToIcs('RDATE=20261012,20261020', { timed: false, timeZone: TZ }), ['RDATE;VALUE=DATE:20261012,20261020'])
assert.equal(icsToRule(['RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=3TU;UNTIL=20270101T145959Z;WKST=SU']), 'FREQ=MONTHLY;INTERVAL=2;BYDAY=3TU;UNTIL=20270101', '꿈틀이 다루는 칸만, UNTIL은 날짜')
assert.equal(icsToRule(['EXDATE:20261012', 'RRULE:FREQ=YEARLY;COUNT=3']), 'FREQ=YEARLY;COUNT=3')
assert.equal(icsToRule([]), null)
assert.equal(calHash('me@example.com'), calHash('me@example.com'))
assert.match(calHash('me@example.com'), /^c_[0-9a-f]{16}$/)
assert.ok(!calHash('me@example.com').includes('example'), '캘린더 id(이메일)는 서버로 가지 않는다')
assert.match(googleIdFor('3F2A1B4C-0000-4000-8000-00000000ABCD'), /^kk[0-9a-v]{32}$/, '구글 id = base32hex')
const timed = { title: ' 치과 ', notes: '', location: '강남', start_at: '2026-10-12T15:00', end_at: '2026-10-12T16:00', is_all_day: 0, repeat_rule: null }
const gb = googleBody(timed, TZ)
assert.deepEqual([gb.summary, gb.description, gb.location, gb.start, gb.end, gb.recurrence], ['치과', '', '강남', { dateTime: '2026-10-12T15:00:00', timeZone: TZ, date: null }, { dateTime: '2026-10-12T16:00:00', timeZone: TZ, date: null }, []])
const allday = { title: '여행', notes: '짐 싸기', location: null, start_at: '2026-10-12', end_at: '2026-10-14', is_all_day: 1, repeat_rule: 'FREQ=YEARLY' }
const ga = googleBody(allday, TZ)
assert.deepEqual([ga.start, ga.end, ga.recurrence], [{ date: '2026-10-12', dateTime: null }, { date: '2026-10-15', dateTime: null }, ['RRULE:FREQ=YEARLY']], '구글 종일 끝 = 다음 날(배타)')
// 구글에서 받아도 같은 내용 → 같은 지문(왕복해도 다시 올리지 않는다)
const back = fieldsFromGoogle({ id: 'x', summary: '치과', location: '강남', start: { dateTime: '2026-10-12T15:00:00+09:00' }, end: { dateTime: '2026-10-12T16:00:00+09:00' } }, TZ)!
assert.equal(fingerprint(back), fingerprint(timed))
const backAll = fieldsFromGoogle({ id: 'y', summary: '여행', description: '짐 싸기', start: { date: '2026-10-12' }, end: { date: '2026-10-15' }, recurrence: ['RRULE:FREQ=YEARLY'] }, TZ)!
assert.equal(fingerprint(backAll), fingerprint(allday))
assert.notEqual(fingerprint(timed), fingerprint(timed, true), '지운 상태는 다른 지문')
assert.ok(fingerprint(timed, true).startsWith('x:'))
const ai = appleInput(allday, TZ)
assert.deepEqual([ai.start, ai.end, ai.allDay, ai.rrule], ['2026-10-11T15:00:00Z', '2026-10-14T14:59:59Z', true, 'FREQ=YEARLY'], 'Apple 종일 끝 = 마지막 날 23:59:59, 밀리초 없음')
const aBack = fieldsFromApple({ id: 'A', calendarId: 'c', title: '여행', notes: '짐 싸기', start: ai.start, end: ai.end, allDay: true, rrule: 'FREQ=YEARLY' }, TZ)!
assert.equal(fingerprint(aBack), fingerprint(allday))
const at = appleInput(timed, TZ)
assert.deepEqual([at.start, at.end, at.allDay], ['2026-10-12T06:00:00Z', '2026-10-12T07:00:00Z', false])

// ── 2. 판정 ──
const W = (x: Partial<Parameters<typeof judgeWritable>[0]>) => judgeWritable({ provider: 'google', accessRole: 'owner', calendarId: 'me@example.com', acctStatus: 'ok', ...x })
assert.deepEqual(W({}), { writable: true, reason: null })
assert.equal(W({ accessRole: 'writer' }).writable, true)
assert.equal(W({ accessRole: 'reader' }).reason, '이 캘린더는 보기만 할 수 있어요')
assert.equal(W({ accessRole: 'reader', calendarId: 'ko.south_korea#holiday@group.v.calendar.google.com' }).reason, '공휴일·생일 캘린더는 고칠 수 없어요')
assert.equal(W({ eventType: 'outOfOffice' }).reason, '구글 캘린더에서만 고칠 수 있는 일정이에요')
assert.equal(W({ eventType: 'default' }).writable, true)
assert.equal(W({ organizerSelf: 0 }).reason, '주최자가 아니라 옮기거나 고칠 수 없어요')
assert.equal(W({ organizerSelf: 0, guestsCanModify: 1 }).writable, true)
assert.equal(W({ acctStatus: 'reauth' }).reason, '구글 계정을 다시 연결해 주세요')

// ── 3. 구글 연결(쓰기 범위) ──
const fake = await startFakeGoogle()
fake.state.scope = SCOPES.join(' ')
const store = new CalendarStore(memDb())
const tokens = new Map<string, Tokens>()
const vault: TokenVault = { get: (id) => tokens.get(id), set: (id, t) => { if (t) tokens.set(id, t); else tokens.delete(id) } }
const g = new GoogleSync({ store, vault, client: { clientId: 'cid', clientSecret: 's' }, endpoints: fake.endpoints, timeZone: () => TZ, sleep: async () => {} })
const browser = (url: string) => { void fetch(url, { redirect: 'follow' }).catch(() => {}) }
const added = await g.addAccount(await startOAuth({ client: { clientId: 'cid' }, endpoints: fake.endpoints, openExternal: browser }).promise)
assert.equal(added.canWrite, true)
const ACC = added.accountId
const PRIMARY = 'me@example.com'
assert.ok(store.view(() => false)[0].canWrite)
assert.deepEqual(store.targets().map((t) => t.name).sort(), ['me@example.com'], '만들기 대상 = 쓸 수 있고 보이는 캘린더(휴일·숨긴 캘린더 없음)')
fake.put(PRIMARY, { id: 'm1', summary: '회의', start: { dateTime: '2026-10-12T10:00:00+09:00' }, end: { dateTime: '2026-10-12T11:00:00+09:00' }, organizer: { self: true }, attendees: [{ self: true }, { email: 'kim@example.com' }] })
fake.put(PRIMARY, { id: 'inv', summary: '남의 초대', start: { dateTime: '2026-10-13T10:00:00+09:00' }, end: { dateTime: '2026-10-13T11:00:00+09:00' }, organizer: { email: 'boss@example.com' } })
fake.put(PRIMARY, { id: 'rr_20261014', recurringEventId: 'rr', originalStartTime: { dateTime: '2026-10-14T09:00:00+09:00' }, summary: '스탠드업', start: { dateTime: '2026-10-14T09:00:00+09:00' }, end: { dateTime: '2026-10-14T09:15:00+09:00' } })
fake.put(PRIMARY, { id: 'rr_20261015', recurringEventId: 'rr', originalStartTime: { dateTime: '2026-10-15T09:00:00+09:00' }, summary: '스탠드업', start: { dateTime: '2026-10-15T09:00:00+09:00' }, end: { dateTime: '2026-10-15T09:15:00+09:00' } })
fake.put(PRIMARY, { id: 'rr', summary: '스탠드업', start: { dateTime: '2026-10-14T09:00:00+09:00' }, end: { dateTime: '2026-10-14T09:15:00+09:00' }, recurrence: ['RRULE:FREQ=DAILY'] })
assert.equal(await g.sync(ACC), null)
const evs = () => store.events('2026-10-01', '2026-10-31')
const byId = (id: string) => evs().find((e) => e.eventId === id)!
assert.equal(byId('m1').writable, true); assert.equal(byId('m1').askNotify, true, '내 회의 + 참석자 → 메일 묻기')
assert.equal(byId('inv').writable, false); assert.equal(byId('inv').readonlyReason, '주최자가 아니라 옮기거나 고칠 수 없어요')

// ── 4. 캐시 전용 쓰기 ──
let online = true
const refreshed: string[] = []
const w = new CalendarWriter({ store, google: () => g, apple: () => { throw new Error('no apple') }, timeZone: () => TZ, online: () => online, refresh: async (id) => { refreshed.push(id); await g.sync(id) }, changed: () => {} })
const key = (id: string) => `${ACC}|${PRIMARY}|${id}`
let r = await w.update(key('m1'), { start: '2026-10-12T14:00', end: '2026-10-12T15:30' }, { notify: true })
assert.deepEqual(r, { ok: true })
assert.equal(fake.latest(PRIMARY, 'm1')!.start!.dateTime, '2026-10-12T14:00:00')
assert.ok(fake.state.writes.includes('PATCH m1 all'), '메일 보내기를 고르면 sendUpdates=all')
assert.equal(byId('m1').start, '2026-10-12T14:00')
// 412: 구글에서 먼저 바뀜 → 되돌리고 최신으로
fake.put(PRIMARY, { ...fake.latest(PRIMARY, 'm1')!, summary: '회의(웹에서 바꿈)' })
r = await w.update(key('m1'), { title: '꿈틀에서 바꿈' })
assert.equal(r.ok, false); assert.equal((r as { code: string }).code, 'conflict')
assert.equal(byId('m1').title, '회의(웹에서 바꿈)', '내 변경으로 덮어쓰지 않고 최신 내용으로')
// 오프라인이면 쓰기 전에 막는다
online = false
r = await w.update(key('m1'), { title: 'x' })
assert.deepEqual(r, { ok: false, code: 'offline', message: '인터넷에 연결되면 고칠 수 있어요' })
online = true
// 읽기 전용 일정은 거절
r = await w.update(key('inv'), { title: 'x' })
assert.equal((r as { code: string }).code, 'readonly')
// 서버 오류 → 화면 되돌림
fake.state.failWrites = 3
const before = byId('m1').title
r = await w.update(key('m1'), { title: '실패할 변경' })
assert.equal(r.ok, false); assert.equal(byId('m1').title, before, '실패하면 캐시를 원래대로')
fake.state.failWrites = 0
// 삭제 → 되돌리기(같은 id 되살림)
r = await w.delete(key('m1'))
assert.ok(r.ok && r.undo); assert.equal(fake.latest(PRIMARY, 'm1')!.status, 'cancelled'); assert.ok(!evs().some((e) => e.eventId === 'm1'))
assert.deepEqual(await w.restore(r.ok ? r.undo! : (null as never)), { ok: true })
assert.equal(fake.latest(PRIMARY, 'm1')!.status, 'confirmed'); assert.ok(evs().some((e) => e.eventId === 'm1'))
// 반복: 이번 회차만 → 회차 id에, 모든 회차 → 원본을 같은 만큼 옮김, 이후 모든 회차 → 원본 끊고 새 반복
r = await w.update(key('rr_20261015'), { title: '스탠드업(이번만)' }, { scope: 'this' })
assert.ok(r.ok); assert.equal(fake.latest(PRIMARY, 'rr_20261015')!.summary, '스탠드업(이번만)'); assert.equal(fake.latest(PRIMARY, 'rr')!.summary, '스탠드업')
r = await w.update(key('rr_20261014'), { start: '2026-10-14T09:30', end: '2026-10-14T09:45' }, { scope: 'all' })
assert.ok(r.ok); assert.equal(fake.latest(PRIMARY, 'rr')!.start!.dateTime, '2026-10-14T09:30:00', '원본도 30분 옮김')
assert.ok(refreshed.includes(ACC), '범위 변경 뒤 새로 고침')
r = await w.update(key('rr_20261015'), { title: '새 스탠드업' }, { scope: 'following' })
assert.ok(r.ok)
assert.deepEqual(fake.latest(PRIMARY, 'rr')!.recurrence, ['RRULE:FREQ=DAILY;UNTIL=20261014T235959Z'], '원본을 그 회차 앞에서 끊음')
assert.ok(fake.state.writes.some((x) => x.startsWith('POST')), '그 회차부터 새 반복 일정')

// ── 5. 연결된 일정 다리 ──
const sdb = new SQL.Database()
sdb.run(`CREATE TABLE events (id TEXT PRIMARY KEY, owner_id TEXT, created_at TEXT, modified_at TEXT, title TEXT, notes TEXT, start_at TEXT, end_at TEXT, is_all_day INTEGER, time_zone TEXT, repeat_rule TEXT, location TEXT, reminders TEXT, color TEXT, deleted_at TEXT,
  ext_provider TEXT, ext_account TEXT, ext_calendar TEXT, ext_id TEXT, ext_etag TEXT, ext_updated TEXT, ext_hash TEXT, ext_error TEXT)`)
const bdb: BridgeDb = {
  getAll: async <T>(s: string, p: unknown[] = []) => { const st = sdb.prepare(s); st.bind(p as never); const out: T[] = []; while (st.step()) out.push(st.getAsObject() as T); st.free(); return out },
  execute: async (s: string, p: unknown[] = []) => { sdb.run(s, p as never) }
}
const row = async (id: string) => (await bdb.getAll<LinkedRow>('SELECT * FROM events WHERE id = ?', [id]))[0]
const toasts: string[] = []
let changes = 0
const bridge = new CalendarBridge({ db: bdb, store, google: () => g, apple: () => { throw new Error('no apple') }, timeZone: () => TZ, online: () => online, toast: (m) => toasts.push(m), changed: () => { changes++ } })
const EV = '3f2a1b4c-0000-4000-8000-00000000abcd'
const GID = googleIdFor(EV)
const t0 = '2026-10-05T01:00:00.000Z'
// 오프라인에서 만들면 꿈틀에만 저장되고 기다린다
online = false
await bdb.execute(`INSERT INTO events (id, created_at, modified_at, title, notes, start_at, end_at, is_all_day, time_zone, location, ext_provider, ext_account, ext_calendar) VALUES (?, ?, ?, '치과', NULL, '2026-10-20T15:00', '2026-10-20T16:00', 0, 'floating', '강남', 'google', ?, ?)`, [EV, t0, t0, ACC, calHash(PRIMARY)])
await bridge.pass()
assert.equal((await row(EV)).ext_id, null, '오프라인 = 기다림'); assert.equal(fake.latest(PRIMARY, GID), undefined)
online = true
await bridge.pass()
let lr = await row(EV)
assert.equal(lr.ext_id, GID, '꿈틀 id로 정한 구글 id'); assert.equal(fake.latest(PRIMARY, GID)!.summary, '치과'); assert.equal(fake.latest(PRIMARY, GID)!.location, '강남')
assert.equal(lr.ext_hash, fingerprint(lr)); assert.ok(lr.ext_etag)
// 두 번째 기기가 같은 일정을 또 만들려 해도(409) 하나뿐
const posts = fake.state.writes.filter((x) => x.startsWith('POST')).length
await bdb.execute('UPDATE events SET ext_id = NULL, ext_hash = NULL WHERE id = ?', [EV])
await bridge.pass()
assert.equal(fake.state.writes.filter((x) => x.startsWith('POST')).length, posts + 1); assert.equal((await row(EV)).ext_id, GID, '409 → 같은 id를 지금 내용으로')
// 캐시에 들어온 사본은 숨긴다(두 번 보이지 않게)
await g.sync(ACC)
await bridge.pass()
assert.ok(!evs().some((e) => e.eventId === GID), '연결된 일정의 캐시 사본은 그리지 않는다')
assert.ok(store.events('2026-10-01', '2026-10-31', { accountId: ACC }).some((e) => e.eventId === GID), '계정 목록 보기에는 보인다')
assert.ok(changes > 0)
// 38 §6.2·§7 휴대폰이 연결한 일정(device-ios)은 데스크톱이 올리지 않고, 같은 제목·시작·끝인 캐시 일정은 숨긴다
const PH = '3f2a1b4c-0000-4000-8000-0000000fe0e1'
const writesBefore = fake.state.writes.length
await bdb.execute(`INSERT INTO events (id, created_at, modified_at, title, notes, start_at, end_at, is_all_day, time_zone, location, ext_provider, ext_account, ext_calendar) VALUES (?, ?, ?, ' 남의 초대', NULL, '2026-10-13T10:00', '2026-10-13T11:00', 0, 'floating', NULL, 'device-ios', 'd_0123456789abcdef', 'c_0123456789abcdef')`, [PH, t0, t0])
await bridge.pass()
assert.equal(fake.state.writes.length, writesBefore, '휴대폰 연결 일정은 구글에 올리지 않는다')
assert.equal((await row(PH)).ext_id, null); assert.equal((await row(PH)).ext_error, null)
assert.ok(!evs().some((e) => e.eventId === 'inv'), '휴대폰이 연결한 일정과 같은 모양의 캐시 일정은 그리지 않는다')
await bdb.execute('UPDATE events SET deleted_at = ? WHERE id = ?', [t0, PH])
await bridge.pass()
assert.ok(evs().some((e) => e.eventId === 'inv'), '지우면 다시 보인다')
// 꿈틀(또는 휴대폰)에서 고침 → 구글에
await bdb.execute("UPDATE events SET start_at = '2026-10-20T17:00', end_at = '2026-10-20T18:00', modified_at = ? WHERE id = ?", ['2026-10-05T02:00:00.000Z', EV])
await bridge.pass()
assert.equal(fake.latest(PRIMARY, GID)!.start!.dateTime, '2026-10-20T17:00:00')
lr = await row(EV)
assert.equal(lr.ext_hash, fingerprint(lr)); assert.equal(lr.ext_error, null)
// 구글 웹에서 고침 → 새로 고침 뒤 꿈틀 행이 따라 바뀐다
fake.put(PRIMARY, { ...fake.latest(PRIMARY, GID)!, summary: '치과(웹)', location: '역삼' })
await g.sync(ACC)
await bridge.pass()
lr = await row(EV)
assert.equal(lr.title, '치과(웹)'); assert.equal(lr.location, '역삼'); assert.equal(lr.ext_hash, fingerprint(lr), '내려받은 뒤 다시 올리지 않는다')
const patchesBefore = fake.state.writes.filter((x) => x.startsWith('PATCH')).length
await bridge.pass()
assert.equal(fake.state.writes.filter((x) => x.startsWith('PATCH')).length, patchesBefore, '그대로면 아무것도 안 쓴다')
// 양쪽 다 바뀜 → 나중에 고친 쪽(꿈틀이 나중)
fake.put(PRIMARY, { ...fake.latest(PRIMARY, GID)!, summary: '치과(웹 2)' })
await bdb.execute("UPDATE events SET title = '치과(꿈틀 2)', modified_at = ? WHERE id = ?", ['2027-01-01T00:00:00.000Z', EV])
await bridge.pass()
assert.equal(fake.latest(PRIMARY, GID)!.summary, '치과(꿈틀 2)'); assert.ok(toasts.includes(CONFLICT_TOAST))
// 양쪽 다 바뀜 → 구글이 나중
fake.put(PRIMARY, { ...fake.latest(PRIMARY, GID)!, summary: '치과(웹 3)' })
await bdb.execute("UPDATE events SET title = '치과(꿈틀 3)', modified_at = ? WHERE id = ?", ['2026-01-01T00:00:00.000Z', EV])
await bridge.pass()
assert.equal((await row(EV)).title, '치과(웹 3)', '외부가 나중이면 꿈틀 행을 바꾼다')
// 꿈틀에서 지움 → 구글에서도 지움, 되돌리면(⌘Z) 같은 id로 살림
await bdb.execute('UPDATE events SET deleted_at = ? WHERE id = ?', ['2027-01-02T00:00:00.000Z', EV])
await bridge.pass()
assert.equal(fake.latest(PRIMARY, GID)!.status, 'cancelled'); assert.ok((await row(EV)).ext_hash!.startsWith('x:'))
await bdb.execute('UPDATE events SET deleted_at = NULL WHERE id = ?', [EV])
await bridge.pass()
assert.equal(fake.latest(PRIMARY, GID)!.status, 'confirmed', '되돌리면 같은 id를 되살림')
// 구글에서 지움 → 꿈틀에서도 지움
fake.put(PRIMARY, { ...fake.latest(PRIMARY, GID)!, status: 'cancelled' })
await g.sync(ACC)
await bridge.pass()
assert.ok((await row(EV)).deleted_at, '외부에서 지운 일정은 꿈틀에서도 지운다')
// 반복 연결 일정은 RRULE로
const EV2 = '00000000-0000-4000-8000-000000000002'
await bdb.execute(`INSERT INTO events (id, created_at, modified_at, title, start_at, end_at, is_all_day, repeat_rule, ext_provider, ext_account, ext_calendar) VALUES (?, ?, ?, '헬스', '2026-10-06T07:00', '2026-10-06T08:00', 0, 'FREQ=WEEKLY;BYDAY=TU,TH', 'google', ?, ?)`, [EV2, t0, t0, ACC, calHash(PRIMARY)])
await bridge.pass()
assert.deepEqual(fake.latest(PRIMARY, googleIdFor(EV2))!.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'])
// 쓰기 권한이 없는 계정 → 오류 표시만, 다시 시도하지 않음
tokens.set(ACC, { ...tokens.get(ACC)!, scope: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly' })
await bdb.execute("UPDATE events SET title = '헬스(권한 없음)', modified_at = ? WHERE id = ?", ['2027-02-01T00:00:00.000Z', EV2])
await bridge.pass()
assert.equal((await row(EV2)).ext_error, '구글 캘린더에 쓰기 권한이 필요해요')
assert.ok(toasts.some((m) => m.includes('쓰기 권한')))

// ── 6. Apple 도우미 쓰기 + 다리 ──
const astore = new CalendarStore(memDb())
const apple: AppleEvent[] = []
let mod = 0
const calls: { cmd: string; input: Record<string, unknown> }[] = []
const run: RunHelper = async (args, _t, input) => {
  const cmd = args[0]
  const inp = (input ?? {}) as Record<string, unknown>
  calls.push({ cmd, input: inp })
  if (cmd === 'status') return { status: 'fullAccess' }
  if (cmd === 'calendars') return { calendars: [{ id: 'ical-home', title: '집', color: '#FF2968', source: 'iCloud', allowsModify: true, isDefault: true }, { id: 'subs', title: '구독', source: '기타', type: 'subscription' }] }
  if (cmd === 'events') return { events: apple }
  const stamp = () => `2026-10-05T0${++mod}:00:00Z`
  if (cmd === 'create') { const ev: AppleEvent = { id: `A${apple.length + 1}`, calendarId: inp.calendarId as string, title: inp.title as string, notes: inp.notes as string, location: inp.location as string, start: inp.start as string, end: inp.end as string, allDay: inp.allDay as boolean, rrule: inp.rrule as string, modifiedAt: stamp() }; apple.push(ev); return { event: ev } }
  const ev = apple.find((e) => e.id === inp.id)
  if (!ev) return { error: 'notFound', message: '이미 삭제된 일정이에요' }
  if (inp.expectModified && inp.expectModified !== ev.modifiedAt) return { error: 'conflict', message: '다른 곳에서 먼저 바뀐 일정이에요' }
  if (cmd === 'get') return { event: ev }
  if (cmd === 'update') { Object.assign(ev, inp.patch as object, { modifiedAt: stamp() }); return { event: ev } }
  if (cmd === 'delete') { apple.splice(apple.indexOf(ev), 1); return { ok: true } }
  throw new Error(cmd)
}
const ap = new AppleSync({ store: astore, run, timeZone: () => TZ })
assert.deepEqual(await ap.connect(), { ok: true })
assert.deepEqual(astore.targets().map((t) => [t.name, t.primary, t.canWrite]), [['집', true, true]], 'Apple: 쓸 수 있는 캘린더만, 기본 캘린더 표시')
const abridge = new CalendarBridge({ db: bdb, store: astore, google: () => g, apple: () => ap, timeZone: () => TZ, online: () => false, toast: (m) => toasts.push(m), changed: () => {} })
const EV3 = '00000000-0000-4000-8000-000000000003'
await bdb.execute(`INSERT INTO events (id, created_at, modified_at, title, start_at, end_at, is_all_day, ext_provider, ext_account, ext_calendar) VALUES (?, ?, ?, '병원', '2026-10-21', '2026-10-21', 1, 'apple', 'apple', ?)`, [EV3, t0, t0, calHash('ical-home')])
await abridge.pass()
assert.equal((await row(EV3)).ext_id, 'A1', 'Apple은 오프라인에도 올린다(기기 안)')
assert.deepEqual([apple[0].start, apple[0].end, apple[0].allDay], ['2026-10-20T15:00:00Z', '2026-10-21T14:59:59Z', true])
await bdb.execute("UPDATE events SET title = '병원(바꿈)', modified_at = ? WHERE id = ?", ['2026-10-05T03:00:00.000Z', EV3])
await abridge.pass()
assert.equal(apple[0].title, '병원(바꿈)')
assert.equal(calls.filter((c) => c.cmd === 'update').at(-1)!.input.span, 'future', '연결된 반복 일정은 늘 전체')
// 캘린더 앱에서 바꿈 → 내려받기
Object.assign(apple[0], { title: '병원(캘린더 앱)', modifiedAt: '2026-10-05T09:00:00Z' })
await ap.sync()
await abridge.pass()
assert.equal((await row(EV3)).title, '병원(캘린더 앱)')
// 캐시 전용 Apple 일정 고치기(span·수정 시각 확인)
apple.push({ id: 'R', calendarId: 'ical-home', title: '요가', start: '2026-10-22T00:00:00Z', end: '2026-10-22T01:00:00Z', recurring: true, occurrence: '2026-10-22T00:00:00Z', modifiedAt: '2026-10-05T10:00:00Z' })
await ap.sync()
const aw = new CalendarWriter({ store: astore, google: () => g, apple: () => ap, timeZone: () => TZ, online: () => false, refresh: async () => { await ap.sync() }, changed: () => {} })
r = await aw.update(`apple|ical-home|R@2026-10-22T00:00:00Z`, { title: '요가(이후)' }, { scope: 'following' })
assert.ok(r.ok)
const upd = calls.filter((c) => c.cmd === 'update').at(-1)!.input
assert.deepEqual([upd.id, upd.span, upd.occurrence, upd.expectModified], ['R', 'future', '2026-10-22T00:00:00Z', '2026-10-05T10:00:00Z'])

await fake.close()
console.log('calendar-write.test: ok')
