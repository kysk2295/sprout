// 16 캘린더 연동(구글·Apple 읽기): 일정 변환(종일·시간대·여러 날·반복 회차·취소) · OAuth PKCE · 증분 동기화 · 410 · 한도 · 권한 · 보이기 필터 · 로그아웃 지우기 · Apple 도우미
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { cacheFrom, fixEnd, floating, mapAppleEvent, mapGoogleEvent, plainText, statusText, APPLE_ACCOUNT_ID } from '../src/shared/calendars'
import { CalendarStore, type SqlDb } from '../src/main/calendarStore'
import { GoogleSync, googleAccountId, hasScopes, pkce, startOAuth, wipeAccounts, type Tokens, type TokenVault } from '../src/main/googleSync'
import { AppleSync, helperRunner, type RunHelper } from '../src/main/appleSync'
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
const ACC = 'g_test'

// ── 1. 일정 변환 ──
const allDay = mapGoogleEvent({ id: 'a', summary: '휴가', start: { date: '2026-10-12' }, end: { date: '2026-10-15' } }, ACC, 'c', TZ)
assert.ok(allDay && allDay !== 'delete')
assert.equal(allDay.start, '2026-10-12'); assert.equal(allDay.end, '2026-10-14', '종일 끝(배타)에서 하루 뺌 — 하루 더 길게 그리지 않는다'); assert.equal(allDay.all_day, 1)
const oneDay = mapGoogleEvent({ id: 'b', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } }, ACC, 'c', TZ)
assert.ok(oneDay && oneDay !== 'delete'); assert.equal(oneDay.end, '2026-10-12'); assert.equal(oneDay.title, '(제목 없음)')
const ny = mapGoogleEvent({ id: 'n', summary: '뉴욕 회의', start: { dateTime: '2026-10-12T09:00:00-04:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-10-12T10:30:00-04:00' } }, ACC, 'c', TZ)
assert.ok(ny && ny !== 'delete')
assert.equal(ny.start, '2026-10-12T22:00', '뉴욕 오전 9시 = 서울 오후 10시'); assert.equal(ny.end, '2026-10-12T23:30'); assert.equal(ny.time_zone, 'America/New_York')
const midnight = mapGoogleEvent({ id: 'm', start: { dateTime: '2026-10-12T22:00:00+09:00' }, end: { dateTime: '2026-10-13T00:00:00+09:00' } }, ACC, 'c', TZ)
assert.ok(midnight && midnight !== 'delete'); assert.equal(midnight.end, '2026-10-12T23:59', '0시에 끝나면 전날 23:59로')
const multi = mapGoogleEvent({ id: 'x', start: { dateTime: '2026-10-12T20:00:00+09:00' }, end: { dateTime: '2026-10-14T09:00:00+09:00' } }, ACC, 'c', TZ)
assert.ok(multi && multi !== 'delete'); assert.equal(multi.start, '2026-10-12T20:00'); assert.equal(multi.end, '2026-10-14T09:00')
const inst = mapGoogleEvent({ id: 'r_20261012', recurringEventId: 'r', summary: '주간 회의', start: { dateTime: '2026-10-12T10:00:00+09:00' }, end: { dateTime: '2026-10-12T11:00:00+09:00' }, htmlLink: 'https://www.google.com/calendar/event?eid=x' }, ACC, 'c', TZ)
assert.ok(inst && inst !== 'delete'); assert.equal(inst.recurring, 1); assert.equal(inst.event_id, 'r_20261012'); assert.equal(inst.link, 'https://www.google.com/calendar/event?eid=x')
assert.equal(mapGoogleEvent({ id: 'gone', status: 'cancelled' }, ACC, 'c', TZ), 'delete')
assert.equal(mapGoogleEvent({ id: 'w', eventType: 'workingLocation', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } }, ACC, 'c', TZ), null)
const declined = mapGoogleEvent({ id: 'd', start: { date: '2026-10-12' }, end: { date: '2026-10-13' }, attendees: [{ self: true, responseStatus: 'declined' }] }, ACC, 'c', TZ)
assert.ok(declined && declined !== 'delete'); assert.equal(declined.declined, 1)
assert.equal(plainText('<b>안건</b><br>1. 예산<br/><a href="https://ex.com">링크</a> &amp; 기타'), '안건\n1. 예산\n링크 (https://ex.com) & 기타')
assert.equal(plainText(''), null)
assert.equal(plainText('a'.repeat(9000))!.length, 8192)
assert.equal(floating(new Date('2026-03-08T10:30:00Z'), 'America/Los_Angeles'), '2026-03-08T03:30', '서머타임 시작일')
assert.equal(cacheFrom(new Date('2026-10-04T03:00:00Z'), TZ), '2026-04-04')
assert.equal(cacheFrom(new Date('2026-08-31T03:00:00Z'), TZ), '2026-02-28')
assert.equal(fixEnd('2026-10-12T10:00', '2026-10-12T09:00'), '2026-10-12T10:00')
// 상태 글자
const now = Date.parse('2026-10-04T12:00:00Z')
assert.equal(statusText({ status: 'ok', lastSyncAt: '2026-10-04T11:55:00Z', errorSince: null, firstSync: false }, now).text, '5분 전에 동기화')
assert.equal(statusText({ status: 'ok', lastSyncAt: '2026-10-04T11:59:40Z', errorSince: null, firstSync: false }, now).text, '방금 동기화')
assert.deepEqual(statusText({ status: 'reauth', lastSyncAt: null, errorSince: null, firstSync: false }, now), { text: '다시 연결이 필요해요', danger: true, action: 'reconnect' })
assert.equal(statusText({ status: 'retrying', lastSyncAt: '2026-10-04T11:58:00Z', errorSince: '2026-10-04T11:58:00Z', firstSync: false }, now).text, '2분 전에 동기화', '처음 5분은 표시 없음')
assert.equal(statusText({ status: 'retrying', lastSyncAt: '2026-10-04T11:50:00Z', errorSince: '2026-10-04T11:50:00Z', firstSync: false }, now).text, '잠시 뒤 다시 시도할게요')
assert.equal(statusText({ status: 'syncing', lastSyncAt: null, errorSince: null, firstSync: true }, now).text, '일정을 가져오는 중…')
assert.match(statusText({ status: 'offline', lastSyncAt: '2026-10-04T06:12:00Z', errorSince: null, firstSync: false }, now).text, /^오프라인 · 마지막 동기화/)
assert.equal(statusText({ status: 'denied', lastSyncAt: null, errorSince: null, firstSync: false }, now).action, 'settings')

// ── 2. PKCE·범위 ──
const p = pkce()
assert.ok(p.verifier.length >= 43 && p.verifier.length <= 128 && /^[\w-]+$/.test(p.verifier))
assert.ok(hasScopes('https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly'))
assert.ok(!hasScopes('https://www.googleapis.com/auth/calendar.calendarlist.readonly'))

// ── 3. 가짜 구글로 연결 → 동기화 → 증분 → 410 → 한도 → 권한 철회 ──
const fake = await startFakeGoogle({ email: 'me@example.com' })
const tokens = new Map<string, Tokens>()
const vault: TokenVault = { get: (id) => tokens.get(id), set: (id, t) => { if (t) tokens.set(id, t); else tokens.delete(id) } }
const store = new CalendarStore(memDb())
const clock = { now: new Date('2026-10-04T03:00:00Z') }
const sleeps: number[] = []
const g = new GoogleSync({ store, vault, client: { clientId: 'cid', clientSecret: 'secret' }, endpoints: fake.endpoints, timeZone: () => TZ, now: () => clock.now, sleep: async (ms) => { sleeps.push(ms) } })
// 브라우저 대신 동의 주소를 직접 연다(가짜 구글이 루프백으로 되돌려 보냄)
const browser = (url: string) => fetch(url)
const viaOAuth = () => startOAuth({ client: { clientId: 'cid', clientSecret: 'secret' }, endpoints: fake.endpoints, openExternal: browser })

const primaryId = 'me@example.com'
fake.put(primaryId, { id: 'e1', summary: '팀 회의', start: { dateTime: '2026-10-05T10:00:00+09:00' }, end: { dateTime: '2026-10-05T11:00:00+09:00' }, htmlLink: 'https://www.google.com/calendar/event?eid=e1' })
fake.put(primaryId, { id: 'e2', summary: '휴가', start: { date: '2026-10-12' }, end: { date: '2026-10-15' } })
fake.put(primaryId, { id: 'old', summary: '아주 옛날', start: { date: '2025-01-02' }, end: { date: '2025-01-03' } })
fake.put(primaryId, { id: 'dec', summary: '거절한 초대', start: { date: '2026-10-06' }, end: { date: '2026-10-07' }, attendees: [{ self: true, responseStatus: 'declined' }] })
for (let i = 0; i < 3; i++) fake.put(primaryId, { id: `r_${i}`, recurringEventId: 'r', summary: '주간 운동', start: { dateTime: `2026-10-0${6 + i}T07:00:00+09:00` }, end: { dateTime: `2026-10-0${6 + i}T08:00:00+09:00` } })
fake.put('family@group.calendar.google.com', { id: 'f1', summary: '가족 저녁', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } })
fake.put('ko.south_korea#holiday@group.v.calendar.google.com', { id: 'h1', summary: '한글날', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } })
fake.state.pageSize = 2 // 페이지 넘기기도 시험

const t1 = await viaOAuth().promise
assert.ok(t1.refresh_token && t1.access_token, 'PKCE로 토큰 교환(가짜 구글이 code_verifier를 확인)')
const added = await g.addAccount(t1)
assert.equal(added.email, 'me@example.com'); assert.equal(added.accountId, googleAccountId('me@example.com')); assert.equal(added.existed, false)
const A = added.accountId
const cals = store.calendars(A)
assert.deepEqual(cals.map((c) => [c.calendar_id, c.visibility]), [[primaryId, 'show'], ['family@group.calendar.google.com', 'hide'], ['ko.south_korea#holiday@group.v.calendar.google.com', 'show']], '처음 보이는 캘린더 = 기본 + 구글에서 켜 둔 캘린더')
assert.equal(await g.sync(A), null)
let evs = store.events('2026-10-01', '2026-10-31')
assert.deepEqual(evs.map((e) => e.title).sort(), ['주간 운동', '주간 운동', '주간 운동', '팀 회의', '한글날', '휴가'].sort(), '숨긴 가족 캘린더·거절한 초대 제외')
assert.equal(evs.find((e) => e.title === '휴가')!.end, '2026-10-14')
assert.equal(evs.find((e) => e.title === '한글날')!.color, '#0b8043')
assert.equal(store.events('2025-01-01', '2025-01-31').length, 0, '6개월보다 오래된 일정은 받지 않음')
assert.ok(store.calendars(A).every((c) => c.visibility === 'hide' || c.sync_token), '마지막 페이지의 nextSyncToken 저장')
assert.equal(store.account(A)!.status, 'ok')
assert.ok(fake.state.requests.some((r) => r.includes('pageToken=2')))

// 증분: 수정·삭제·추가만 받는다(timeMin 없이 syncToken)
fake.state.requests.length = 0
fake.put(primaryId, { id: 'e1', summary: '팀 회의(장소 변경)', location: '3층', start: { dateTime: '2026-10-05T14:00:00+09:00' }, end: { dateTime: '2026-10-05T15:00:00+09:00' } })
fake.put(primaryId, { id: 'r_1', status: 'cancelled' })
fake.put(primaryId, { id: 'e3', summary: '새 일정', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } })
assert.equal(await g.sync(A), null)
assert.ok(fake.state.requests.filter((r) => r.includes('/events')).every((r) => r.includes('syncToken=') && !r.includes('timeMin')), '증분 요청은 syncToken만')
evs = store.events('2026-10-01', '2026-10-31')
assert.equal(evs.find((e) => e.eventId === 'e1')!.start, '2026-10-05T14:00')
assert.equal(evs.find((e) => e.eventId === 'e1')!.location, '3층')
assert.equal(evs.filter((e) => e.title === '주간 운동').length, 2, '취소된 반복 회차 삭제')
assert.ok(evs.some((e) => e.title === '새 일정'))

// 410 Gone → 그 캘린더 캐시 비우고 전체 다시
fake.state.expireSyncTokens = true
fake.state.requests.length = 0
assert.equal(await g.sync(A), null)
assert.ok(fake.state.requests.some((r) => r.includes('timeMin=')), '410 뒤 전체 다시 받기')
assert.equal(store.events('2026-10-01', '2026-10-31').filter((e) => e.calendarId === primaryId).length, 5, 'e1·e2·e3·반복 2회')

// 한도(429): 지수 백오프 후 성공
fake.state.rateLimit = 2
sleeps.length = 0
assert.equal(await g.sync(A), null)
assert.equal(sleeps.length, 2); assert.ok(sleeps[0] >= 1000 && sleeps[0] < 1500 && sleeps[1] >= 2000 && sleeps[1] < 2500, '1·2초 + 무작위 지연')
// 계속 한도 → retrying(캐시는 그대로)
fake.state.rateLimit = 99
assert.equal(await g.sync(A), 'rate')
assert.equal(store.account(A)!.status, 'retrying'); assert.ok(store.account(A)!.next_retry_at! > Date.now())
assert.ok(store.events('2026-10-01', '2026-10-31').length > 0, '오류 때도 캐시는 그대로')
fake.state.rateLimit = 0

// 보이기 필터: 가족 캘린더 보이기 → 그때 전체 받기, 패널 체크 끄면 캘린더 보기에서만 걸러짐
assert.equal(store.setVisibility(A, [{ calendarId: 'family@group.calendar.google.com', visibility: 'show' }]), true)
assert.equal(await g.sync(A), null)
assert.ok(store.events('2026-10-10', '2026-10-10').some((e) => e.title === '가족 저녁'))
store.setPanel(A, 'family@group.calendar.google.com', false)
assert.ok(!store.events('2026-10-10', '2026-10-10', { panel: true }).some((e) => e.title === '가족 저녁'), '패널 체크 끔 = 캘린더 보기에서 거름')
assert.ok(store.events('2026-10-10', '2026-10-10').some((e) => e.title === '가족 저녁'), '사이드바 목록에는 그대로')
store.setVisibility(A, [{ calendarId: 'ko.south_korea#holiday@group.v.calendar.google.com', visibility: 'hide' }])
assert.ok(!store.events('2026-10-01', '2026-10-31').some((e) => e.title === '한글날'), '숨기기 = 모든 곳에서 숨김')
assert.equal(store.db.all('SELECT 1 FROM ext_events WHERE calendar_id = ?', ['ko.south_korea#holiday@group.v.calendar.google.com']).length, 0, '숨긴 캘린더 캐시는 지움')

// 캘린더 하나 접근 잃음(404) → 그 캘린더만 사라짐
fake.state.forbidCalendars.add('family@group.calendar.google.com')
assert.equal(await g.sync(A), null)
assert.ok(!store.calendars(A).some((c) => c.calendar_id === 'family@group.calendar.google.com') || store.calendars(A).find((c) => c.calendar_id === 'family@group.calendar.google.com')!.visibility === 'hide')
assert.ok(!store.events('2026-10-01', '2026-10-31').some((e) => e.title === '가족 저녁'))
fake.state.forbidCalendars.clear()

// 접근 토큰 만료(401) → 리프레시로 조용히 갱신
tokens.set(A, { ...tokens.get(A)!, access_token: 'expired', expires_at: Date.now() + 3600_000 })
assert.equal(await g.sync(A), null)
assert.notEqual(tokens.get(A)!.access_token, 'expired')
assert.equal(store.account(A)!.status, 'ok')

// 권한 부족(403 insufficientPermissions)
fake.state.insufficient = true
assert.equal(await g.sync(A), 'scope')
assert.equal(store.account(A)!.status, 'scope_missing')
fake.state.insufficient = false

// 권한 철회(invalid_grant) → reauth, 캐시는 남고 옅게(stale)
fake.state.revokedRefresh.add(tokens.get(A)!.refresh_token)
tokens.set(A, { ...tokens.get(A)!, expires_at: 0 })
assert.equal(await g.sync(A), 'reauth')
assert.equal(store.account(A)!.status, 'reauth')
assert.ok(store.events('2026-10-01', '2026-10-31').every((e) => e.stale))
// 다시 연결: 같은 계정 → 새 행 없이 토큰만 바꿈 + 옛 토큰 폐기
const oldRefresh = tokens.get(A)!.refresh_token
const t2 = await viaOAuth().promise
const again = await g.addAccount(t2)
assert.equal(again.existed, true); assert.equal(store.accounts().length, 1)
assert.ok(fake.state.revoked.includes(oldRefresh), '같은 계정 다시 연결 때 이전 리프레시 토큰 폐기')
assert.equal(await g.sync(A), null); assert.equal(store.account(A)!.status, 'ok')

// 일부 범위만 동의 → 연결 거절
fake.state.scope = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
const t3 = await viaOAuth().promise
await assert.rejects(g.addAccount(t3), /일정을 읽는 권한이 있어야/)
fake.state.scope = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly'
// 동의 화면에서 거부 · 취소 · 시간 초과
fake.state.authError = 'access_denied'
await assert.rejects(viaOAuth().promise, /연결을 취소했어요/)
fake.state.authError = undefined
const never = startOAuth({ client: { clientId: 'cid' }, endpoints: fake.endpoints, openExternal: () => {} })
never.cancel()
await assert.rejects(never.promise, /취소/)
await assert.rejects(startOAuth({ client: { clientId: 'cid' }, endpoints: fake.endpoints, openExternal: () => {}, timeoutMs: 30 }).promise, /시간이 지나서/)

// 오프라인: 캐시 유지 + offline 상태
const offline = new GoogleSync({ store, vault, client: { clientId: 'cid' }, endpoints: { ...fake.endpoints, api: 'http://127.0.0.1:9/api' }, timeZone: () => TZ, now: () => clock.now, sleep: async () => {} })
assert.equal(await offline.sync(A), 'offline')
assert.equal(store.account(A)!.status, 'offline'); assert.ok(store.events('2026-10-01', '2026-10-31').length > 0)
assert.equal(await g.sync(A), null)

// 시간대가 바뀌면 캐시를 다시 받는다
const before = store.events('2026-10-05', '2026-10-05').find((e) => e.eventId === 'e1')!.start
const la = new GoogleSync({ store, vault, client: { clientId: 'cid', clientSecret: 'secret' }, endpoints: fake.endpoints, timeZone: () => 'America/Los_Angeles', now: () => clock.now, sleep: async () => {} })
assert.equal(await la.sync(A), null)
assert.equal(before, '2026-10-05T14:00'); assert.equal(store.events('2026-10-04', '2026-10-05').find((e) => e.eventId === 'e1')!.start, '2026-10-04T22:00')
assert.equal(await g.sync(A), null)

// ── 4. 로그아웃(결정 ⑤): 폐기 요청 + 토큰·계정·캐시 삭제 ──
// 두 번째 계정(결정 ③ 여러 계정)
const fake2 = await startFakeGoogle({ email: 'work@company.com' })
fake2.put('work@company.com', { id: 'w1', summary: '업무', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } })
const g2 = new GoogleSync({ store, vault, client: { clientId: 'cid' }, endpoints: fake2.endpoints, timeZone: () => TZ, now: () => clock.now, sleep: async () => {} })
const b = await g2.addAccount(await startOAuth({ client: { clientId: 'cid' }, endpoints: fake2.endpoints, openExternal: browser }).promise)
assert.equal(await g2.sync(b.accountId), null)
assert.equal(store.accounts().length, 2)
assert.ok(store.events('2026-10-07', '2026-10-07').some((e) => e.accountLabel === 'work@company.com'))
const lastRefresh = tokens.get(A)!.refresh_token
await wipeAccounts(store, vault, g)
assert.ok(fake.state.revoked.includes(lastRefresh), '로그아웃 때 토큰 폐기 요청')
assert.equal(tokens.size, 0); assert.equal(store.accounts().length, 0)
assert.equal(store.db.all('SELECT 1 FROM ext_events').length, 0); assert.equal(store.db.all('SELECT 1 FROM ext_calendars').length, 0)
await fake.close(); await fake2.close()

// ── 5. Apple(가짜 도우미 JSON) ──
const astore = new CalendarStore(memDb())
let auth = 'notDetermined'
const calls: string[][] = []
const appleEvents = [
  { id: 'E1', calendarId: 'ical-home', title: '병원', start: '2026-10-05T01:00:00Z', end: '2026-10-05T02:00:00Z', allDay: false, location: '강남' },
  { id: 'E2', calendarId: 'ical-home', title: '여행', start: '2026-10-09T15:00:00Z', end: '2026-10-11T14:59:59Z', allDay: true },
  { id: 'R', calendarId: 'ical-work', title: '스탠드업', start: '2026-10-06T00:30:00Z', end: '2026-10-06T00:45:00Z', recurring: true },
  { id: 'R', calendarId: 'ical-work', title: '스탠드업', start: '2026-10-07T00:30:00Z', end: '2026-10-07T00:45:00Z', recurring: true },
  { id: 'B', calendarId: 'birthdays', title: '엄마 생일', start: '2026-10-08T15:00:00Z', end: '2026-10-09T14:59:59Z', allDay: true },
  { id: 'X', calendarId: 'ical-work', title: '거절', start: '2026-10-08T01:00:00Z', end: '2026-10-08T02:00:00Z', declined: true }
]
const run: RunHelper = async (args) => {
  calls.push(args)
  if (args[0] === 'status') return { status: auth }
  if (args[0] === 'request') { auth = 'fullAccess'; return { status: auth } }
  if (args[0] === 'calendars') return { calendars: [{ id: 'ical-home', title: '집', color: '#FF2968', source: 'iCloud' }, { id: 'ical-work', title: '회사', color: '#1BADF8', source: 'Exchange', allowsModify: true }, { id: 'birthdays', title: '생일', color: '#8E8E93', source: '기타', type: 'birthday' }] }
  if (args[0] === 'events') { const ids = args[args.indexOf('--calendars') + 1].split(','); return { events: appleEvents.filter((e) => ids.includes(e.calendarId)) } }
  throw new Error('?')
}
const ap = new AppleSync({ store: astore, run, timeZone: () => TZ, now: () => clock.now })
assert.deepEqual(await ap.connect(), { ok: true })
assert.ok(calls.some((c) => c[0] === 'request'), '처음이면 권한 요청')
assert.deepEqual(astore.calendars(APPLE_ACCOUNT_ID).map((c) => [c.name, c.visibility, c.group_label]).sort(), [['생일', 'hide', '기타'], ['집', 'show', 'iCloud'], ['회사', 'show', 'Exchange']].sort(), '생일만 숨김, 묶음 = 출처')
const aev = astore.events('2026-10-01', '2026-10-31')
assert.deepEqual(aev.map((e) => e.title).sort(), ['병원', '스탠드업', '스탠드업', '여행'].sort())
assert.equal(aev.find((e) => e.title === '병원')!.start, '2026-10-05T10:00')
const trip = aev.find((e) => e.title === '여행')!
assert.equal(trip.start, '2026-10-10'); assert.equal(trip.end, '2026-10-11'); assert.equal(trip.allDay, true)
assert.equal(new Set(aev.filter((e) => e.title === '스탠드업').map((e) => e.eventId)).size, 2, '반복 회차는 시작 시각으로 구분')
const evCalls = calls.filter((c) => c[0] === 'events')
assert.equal(evCalls.length, 3, '6개월 전 ~ 2년 뒤를 1년씩 나눠 묻는다')
// 다시 동기화하면 통째로 갈아 끼움(지운 일정 사라짐)
appleEvents.splice(0, 1)
assert.equal(await ap.sync(), null)
assert.ok(!astore.events('2026-10-01', '2026-10-31').some((e) => e.title === '병원'))
// 시스템 설정에서 권한 끔 → denied, 캐시 옅게
auth = 'denied'
assert.equal(await ap.sync(), 'denied')
assert.equal(astore.account(APPLE_ACCOUNT_ID)!.status, 'denied')
assert.ok(astore.events('2026-10-01', '2026-10-31').every((e) => e.stale))
// 거부 상태로 연결 → 안내 문구
const astore2 = new CalendarStore(memDb())
const denied = await new AppleSync({ store: astore2, run: async () => ({ status: 'denied' }), timeZone: () => TZ }).connect()
assert.equal(denied.ok, false); assert.match((denied as { error: string }).error, /시스템 설정/)
assert.equal(astore2.accounts().length, 0)
const restricted = await new AppleSync({ store: astore2, run: async () => ({ status: 'restricted' }), timeZone: () => TZ }).connect()
assert.match((restricted as { error: string }).error, /제한/)
assert.equal(mapAppleEvent({ id: 'c', calendarId: 'x', start: 'bad', end: 'bad' }, TZ), null)
// 실제 프로세스 실행(가짜 도우미 스크립트) · 도우미 없음
const dir = mkdtempSync(join(tmpdir(), 'sprout-cal-'))
const script = join(dir, 'helper.sh')
writeFileSync(script, '#!/bin/sh\nif [ "$1" = status ]; then echo \'{"status":"fullAccess"}\'; else echo \'{"calendars":[]}\'; fi\n')
chmodSync(script, 0o755)
assert.deepEqual(await helperRunner(() => script)(['status'], 5000), { status: 'fullAccess' })
const missing = new AppleSync({ store: new CalendarStore(memDb()), run: helperRunner(() => join(dir, 'none')), timeZone: () => TZ })
assert.equal(await missing.auth(), 'missing')
assert.match(((await missing.connect()) as { error: string }).error, /도우미가 없어요/)
rmSync(dir, { recursive: true, force: true })

console.log('google.test: ok')
