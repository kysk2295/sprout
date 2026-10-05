// 32 푸시 알림 시험 — 실제 네트워크 없음: 가짜 FCM·OAuth(로컬 http), 메모리 저장소, 정한 시계.
// FCM 보내기(서비스 계정 JWT·토큰 캐시·오류 처리) · 경로(등록·소유권·시험 알림·시도 제한) ·
// 스케줄러(시간대·종일·반복·따라잡기·중복 막기·로컬 예약 건너뛰기·하루 요약·목표 마감) · 업로드 효과(지우기·모으기·성장 소식)
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose'
import { createFcmSender, fcmConfigFromEnv, FCM_SCOPE, type FcmSender, type SendResult } from './fcm.ts'
import { createPush, parseDevice, pushConfigFromEnv, PushError, type PushConfig } from './push.ts'
import { memoryPushStore } from './push-store.ts'
import { candidateDays, localMomentsIn, pushEffects, reportNumbers, weekStartOf, planReminderPushes, type Device } from './push-plan.ts'
import { floatingToMs } from '../../../packages/schema/src/time.ts'
import { parseNotifyPrefs } from '../../../packages/schema/src/notify.ts'

const listen = (s: Server) => new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)))
const close = (s: Server) => new Promise((r) => { s.closeAllConnections(); s.close(r) })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SEOUL = 'Asia/Seoul'
const NY = 'America/New_York'
const at = (f: string, tz = SEOUL) => floatingToMs(f, tz)

// ════════ 1. FCM 보내기 (가짜 OAuth + 가짜 FCM) ════════
const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
const pem = await exportPKCS8(privateKey)
const pub = await importSPKI(await exportSPKI(publicKey), 'RS256')
let tokenCalls = 0
let tokenSeq = 0
const assertions: Record<string, unknown>[] = []
const sends: { auth?: string; body: any }[] = []
// 토큰별 동작: 'dead' UNREGISTERED · 'badfmt' 형식 오류 · 'busy' 503 한 번 · 'payload' 다른 400 · 'expire' 401 한 번 · 'down' 늘 500
const seen = new Map<string, number>()
const fake = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  if (req.url === '/token') {
    tokenCalls++
    const p = new URLSearchParams(raw)
    assert.equal(p.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
    const { payload, protectedHeader } = await jwtVerify(p.get('assertion')!, pub)
    assert.equal(protectedHeader.alg, 'RS256')
    assert.equal(protectedHeader.kid, 'kid-1')
    assertions.push(payload)
    res.end(JSON.stringify({ access_token: `at-${++tokenSeq}`, expires_in: 3599, token_type: 'Bearer' }))
    return
  }
  assert.equal(req.url, '/v1/projects/sprout-test/messages:send')
  const body = JSON.parse(raw)
  sends.push({ auth: req.headers.authorization, body })
  const tok: string = body.message.token
  const n = (seen.get(tok) ?? 0) + 1
  seen.set(tok, n)
  const err = (status: number, s: string, code: string | null, message = 'x', headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(JSON.stringify({ error: { code: status, status: s, message, details: code ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: code }] : [] } }))
  }
  if (tok === 'dead') return err(404, 'NOT_FOUND', 'UNREGISTERED', 'Requested entity was not found.')
  if (tok === 'badfmt') return err(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token')
  if (tok === 'payload') return err(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value at message.data')
  if (tok === 'busy' && n === 1) return err(503, 'UNAVAILABLE', 'UNAVAILABLE', 'x', { 'retry-after': '0' })
  if (tok === 'expire' && n === 1) return err(401, 'UNAUTHENTICATED', null)
  if (tok === 'down') return err(500, 'INTERNAL', 'INTERNAL')
  res.end(JSON.stringify({ name: 'projects/sprout-test/messages/1' }))
})
const fakeUrl = await listen(fake)
const account = { client_email: 'sprout-push@sprout-test.iam.gserviceaccount.com', private_key: pem, private_key_id: 'kid-1', token_uri: `${fakeUrl}/token`, project_id: 'sprout-test' }

{
  // 설정: 프로젝트 id 없음 = 꺼짐, base64·파일 경로, 키 없음 = 오류
  assert.equal(await fcmConfigFromEnv({}), null)
  assert.equal(await fcmConfigFromEnv({ FCM_PROJECT_ID: '  ', FCM_SERVICE_ACCOUNT_B64: 'x' }), null)
  await assert.rejects(fcmConfigFromEnv({ FCM_PROJECT_ID: 'sprout-test' }), /no service account/)
  await assert.rejects(fcmConfigFromEnv({ FCM_PROJECT_ID: 'sprout-test', FCM_SERVICE_ACCOUNT_B64: Buffer.from('nope').toString('base64') }), /not valid JSON/)
  const b64 = await fcmConfigFromEnv({ FCM_PROJECT_ID: 'sprout-test', FCM_SERVICE_ACCOUNT_B64: Buffer.from(JSON.stringify(account)).toString('base64') })
  assert.equal(b64!.account.client_email, account.client_email)
  assert.equal(b64!.apiBase, 'https://fcm.googleapis.com')
  const dir = await mkdtemp(join(tmpdir(), 'sprout-fcm-'))
  await writeFile(join(dir, 'fcm.json'), JSON.stringify(account))
  const file = await fcmConfigFromEnv({ FCM_PROJECT_ID: 'sprout-test', FCM_SERVICE_ACCOUNT: join(dir, 'fcm.json'), FCM_API_BASE: fakeUrl })
  assert.equal(file!.apiBase, fakeUrl)

  const slept: number[] = []
  const sender = createFcmSender(file!, { sleep: async (ms) => { slept.push(ms) } })
  assert.deepEqual(await sender.send('good', { data: { type: 'test' } }), { ok: true })
  assert.deepEqual(await sender.send('good', { data: { type: 'test' } }), { ok: true })
  assert.equal(tokenCalls, 1) // OAuth 토큰은 캐시한다
  assert.equal(sends[0].auth, 'Bearer at-1')
  assert.deepEqual(sends[0].body, { message: { data: { type: 'test' }, token: 'good' } })
  const a = assertions[0]
  assert.equal(a.iss, account.client_email)
  assert.equal(a.aud, account.token_uri)
  assert.equal(a.scope, FCM_SCOPE)
  assert.equal((a.exp as number) - (a.iat as number), 3600)

  const dead = await sender.send('dead', {})
  assert.deepEqual(dead, { ok: false, invalid: true, status: 404, code: 'UNREGISTERED' })
  assert.equal((await sender.send('badfmt', {}) as Extract<SendResult, { ok: false }>).invalid, true)
  const payload = await sender.send('payload', {}) as Extract<SendResult, { ok: false }>
  assert.equal(payload.invalid, false) // 토큰 문제가 아니면 기기를 지우지 않는다
  assert.equal(sends.filter((s) => s.body.message.token === 'payload').length, 1) // 400은 다시 보내지 않는다
  assert.deepEqual(await sender.send('busy', {}), { ok: true }) // 503 → 다시
  assert.equal(seen.get('busy'), 2)
  assert.deepEqual(await sender.send('expire', {}), { ok: true }) // 401 → 토큰 새로 받고 다시
  assert.equal(tokenCalls, 2)
  const down = await sender.send('down', {}) as Extract<SendResult, { ok: false }>
  assert.equal(down.invalid, false)
  assert.equal(seen.get('down'), 3) // 3번까지
  assert.deepEqual(slept.slice(-2), [500, 1000]) // 지수 백오프
  // 기다림 상한(10초)을 넘기면 멈춘다
  const capped = createFcmSender(file!, { sleep: async () => {}, maxWaitMs: 400 })
  seen.delete('down')
  await capped.send('down', {})
  assert.equal(seen.get('down'), 1)
  // 토큰 캐시 만료(55분)
  let clock = Date.now()
  const timed = createFcmSender(file!, { now: () => clock })
  await timed.send('good', {})
  const before = tokenCalls
  clock += 50 * 60_000
  await timed.send('good', {})
  assert.equal(tokenCalls, before)
  clock += 6 * 60_000
  await timed.send('good', {})
  assert.equal(tokenCalls, before + 1)
}
await close(fake)

// ════════ 2. 순수 계산 ════════
{
  const e = pushEffects([
    { op: 'PATCH', table: 'tasks', id: 't1', data: { status: 1, completed_at: 'x' } },
    { op: 'PATCH', table: 'tasks', id: 't2', data: { title: '바뀐 제목' } },
    { op: 'PATCH', table: 'tasks', id: 't3', data: { due_at: '2026-10-06T10:00' } },
    { op: 'PATCH', table: 'tasks', id: 't4', data: { deleted_at: '2026-10-05T01:00:00Z' } },
    { op: 'DELETE', table: 'tasks', id: 't5' },
    { op: 'PUT', table: 'tasks', id: 't6', data: { title: '새 할 일', status: 0, due_at: '2026-10-06' } },
    { op: 'PUT', table: 'tasks', id: 't7', data: { status: '2' } },
    { op: 'DELETE', table: 'reminders', id: 'r9' },
    { op: 'PUT', table: 'reminders', id: 'r10', data: { task_id: 't6', trigger: '-PT0M' } },
    { op: 'PUT', table: 'xp_events', id: 'x', data: { amount: 1 } },
    { op: 'PATCH', table: 'weekly_reports', id: 'w1', data: { text_json: '{}' } },
    { op: 'PATCH', table: 'weekly_reports', id: 'w2', data: { seen_at: 'x' } }
  ])
  assert.deepEqual(e.dismiss.sort(), ['t1', 't3', 't4', 't5', 't7'])
  assert.deepEqual(e.deletedReminders, ['r9'])
  assert.equal(e.sync && e.xp && e.tasks, true)
  assert.deepEqual(e.reports, ['w1'])
  const quiet = pushEffects([{ op: 'PUT', table: 'diary_entries', id: 'd', data: { content: '일기' } }, { op: 'PUT', table: 'notes', id: 'n', data: {} }])
  assert.deepEqual(quiet, { sync: false, dismiss: [], deletedReminders: [], xp: false, reports: [], tasks: false }) // 일기·수집함은 보내지 않는다
  assert.deepEqual(pushEffects('nope'), quiet)
  assert.deepEqual(reportNumbers(JSON.stringify({ completed: 12, goals: [{}, {}, {}], goalsAchieved: 2 }), JSON.stringify({ report: { done: 'AI 글' }, draft: [{}, {}, {}] })), { completed: 12, goals: 3, achieved: 2, hasReport: true, drafts: 3 })
  assert.deepEqual(reportNumbers('broken', null), { completed: 0, goals: 0, achieved: 0, hasReport: false, drafts: 0 })
  assert.equal(weekStartOf('2026-10-11'), '2026-10-05') // 일요일 → 그 주 월요일
  assert.equal(weekStartOf('2026-10-05'), '2026-10-05')
  assert.deepEqual(candidateDays(Date.parse('2026-10-05T03:00:00Z')), { from: '2026-10-03', to: '2026-10-20' })
  // 자정 넘김: 23:30 요약을 00:10에 따라잡는다(어제 날짜)
  assert.deepEqual(localMomentsIn(SEOUL, '23:30', at('2026-10-05T22:00'), at('2026-10-06T00:10')), [{ day: '2026-10-05', at: at('2026-10-05T23:30') }])
  assert.deepEqual(localMomentsIn(SEOUL, '08:00', at('2026-10-10T07:00'), at('2026-10-10T09:00'), [1, 2, 3, 4, 5]), []) // 토요일
  // 본문 검사
  assert.throws(() => parseDevice({ token: 'tok-123456', platform: 'web', timezone: SEOUL }), PushError)
  assert.throws(() => parseDevice({ token: 'tok-123456', platform: 'android', timezone: 'Nowhere/City' }), /bad timezone/)
  assert.throws(() => parseDevice({ token: 'x', platform: 'android', timezone: SEOUL }), /bad token/)
  assert.deepEqual(parseDevice({ token: 'tok-123456', platform: 'android', timezone: SEOUL, caps: ['reminder', 'reminder', 'BAD CAP', 3, 'sync'] }), {
    token: 'tok-123456', platform: 'android', app_version: null, caps: ['reminder', 'sync'], timezone: SEOUL, locale: null, push_reminders: true
  })
  const cfg = pushConfigFromEnv({ PUSH_TICK_MS: '5000', PUSH_SYNC_MIN_SEC: '10', PUSH_IOS: '1' })
  assert.equal(cfg.tickMs, 5000)
  assert.equal(cfg.syncMinSec, 10)
  assert.equal(cfg.ios, true)
  assert.equal(pushConfigFromEnv({}).ios, false)
}

// ════════ 3. 시험 도구: 가짜 보내기 · 메모리 저장소 · 경로 서버 ════════
type Sent = { token: string; message: any }
function fakeSender(fail: (token: string, n: number) => SendResult | null = () => null) {
  const sent: Sent[] = []
  const count = new Map<string, number>()
  const sender: FcmSender = {
    send: async (token, message) => {
      const n = (count.get(token) ?? 0) + 1
      count.set(token, n)
      const f = fail(token, n)
      if (f) return f
      sent.push({ token, message })
      return { ok: true }
    }
  }
  return { sender, sent, clear: () => { sent.length = 0 } }
}
const CFG: PushConfig = { ...pushConfigFromEnv({}), syncMinSec: 0.2 }
const auth = async (req: { headers: Record<string, unknown> }) => {
  const h = String(req.headers.authorization ?? '')
  if (!h.startsWith('Bearer ')) throw Object.assign(new Error('unauthorized'), { status: 401 })
  return h.slice(7)
}
const ALL_CAPS = ['reminder', 'daily', 'sync', 'growth']
const D1 = '11111111-1111-4111-8111-111111111111'
const D2 = '22222222-2222-4222-8222-222222222222'
const D3 = '33333333-3333-4333-8333-333333333333'
function addDevice(store: ReturnType<typeof memoryPushStore>, id: string, user: string, token: string, extra: Partial<Device> = {}) {
  store.data.devices.push({ id, user_id: user, provider: 'fcm', token, platform: 'android', app_version: '0.1.0', caps: ALL_CAPS, timezone: SEOUL, locale: 'ko-KR', local_keys: [], push_reminders: true, last_seen_at: Date.parse('2026-10-01T00:00:00Z'), fail_count: 0, ...extra })
}

// ════════ 4. 경로 ════════
{
  const store = memoryPushStore()
  const f = fakeSender((tok) => (tok === 'dead-token' ? { ok: false, invalid: true, status: 404, code: 'UNREGISTERED' } : null))
  let clock = Date.parse('2026-10-05T00:00:00Z')
  const push = createPush({ config: CFG, store, sender: f.sender, auth: auth as any, now: () => clock, log: () => {} })
  const off = createPush({ config: CFG, store: memoryPushStore(), sender: null, auth: auth as any, log: () => {} })
  const srv = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const which = req.headers['x-off'] ? off : push
    if (!(await which.handle(req, res, path))) { res.writeHead(404); res.end('{}') }
  })
  const url = await listen(srv)
  const call = async (method: string, path: string, user: string | null, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(url + path, { method, headers: { ...(user ? { authorization: `Bearer ${user}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: r.status, body: await r.json() as any }
  }
  const reg = (token: string, extra: Record<string, unknown> = {}) => ({ token, platform: 'android', app_version: '0.1.0 (12)', caps: ALL_CAPS, timezone: SEOUL, locale: 'ko-KR', push_reminders: true, ...extra })

  assert.equal((await call('PUT', `/push/devices/${D1}`, null, reg('tok-aaaaaaaa'))).status, 401)
  assert.equal((await call('PUT', '/push/devices/not-a-uuid', 'ua', reg('tok-aaaaaaaa'))).status, 400)
  assert.equal((await call('PUT', `/push/devices/${D1}`, 'ua', reg('tok-aaaaaaaa', { timezone: 'Bad/Zone' }))).status, 400)
  const ok = await call('PUT', `/push/devices/${D1}`, 'ua', reg('tok-aaaaaaaa'))
  assert.deepEqual(ok, { status: 200, body: { ok: true, push: { enabled: true, ios: false } } })
  assert.equal(store.data.devices.length, 1)
  assert.equal(store.data.devices[0].user_id, 'ua')
  // 푸시가 꺼진 서버: 등록은 받고 enabled=false
  assert.deepEqual((await call('PUT', `/push/devices/${D1}`, 'ua', reg('tok-aaaaaaaa'), { 'x-off': '1' })).body.push, { enabled: false, ios: false })
  assert.equal((await call('POST', '/push/test', 'ua', { device_id: D1 }, { 'x-off': '1' })).status, 503)
  // 토큰 갱신(같은 기기 id) → 덮어쓰기
  await call('PUT', `/push/devices/${D1}`, 'ua', reg('tok-bbbbbbbb', { timezone: NY }))
  assert.equal(store.data.devices.length, 1)
  assert.equal(store.data.devices[0].token, 'tok-bbbbbbbb')
  assert.equal(store.data.devices[0].timezone, NY)
  // 같은 휴대폰에서 다른 계정으로 로그인(같은 토큰, 새 기기 id) → 옛 계정 행은 지운다
  await call('PUT', `/push/devices/${D2}`, 'ub', reg('tok-bbbbbbbb'))
  assert.deepEqual(store.data.devices.map((d) => [d.id, d.user_id]), [[D2, 'ub']])
  // 로컬 예약 보고: 남의 기기 → 404, 형식 오류 → 400
  assert.equal((await call('PUT', `/push/devices/${D2}/local`, 'ua', { keys: [] })).status, 404)
  assert.equal((await call('PUT', `/push/devices/${D2}/local`, 'ub', { keys: ['oops'] })).status, 400)
  assert.equal((await call('PUT', `/push/devices/${D2}/local`, 'ub', { keys: Array(201).fill('r:x@1') })).status, 400)
  assert.deepEqual((await call('PUT', `/push/devices/${D2}/local`, 'ub', { keys: ['r:r1@1759626000000', 's:t1@1'], until: 1 })).body, { ok: true })
  assert.deepEqual(store.data.devices[0].local_keys, ['r:r1@1759626000000', 's:t1@1'])
  // 시험 알림: 남의 기기 404, 내 기기 → 보냄, 10분에 3번
  assert.equal((await call('POST', '/push/test', 'ua', { device_id: D2 })).status, 404)
  assert.equal((await call('POST', '/push/test', 'ub', { device_id: 'x' })).status, 400)
  assert.deepEqual((await call('POST', '/push/test', 'ub', { device_id: D2 })).body, { ok: true })
  const m = f.sent.at(-1)!
  assert.equal(m.token, 'tok-bbbbbbbb')
  assert.deepEqual({ type: m.message.data.type, title: m.message.data.title, body: m.message.data.body }, { type: 'test', title: '꿈틀 알림이 잘 와요', body: '이 휴대폰에서 서버 알림을 받을 수 있어요' })
  assert.equal(m.message.android.ttl, '60s')
  await call('POST', '/push/test', 'ub', { device_id: D2 })
  await call('POST', '/push/test', 'ub', { device_id: D2 })
  const limited = await call('POST', '/push/test', 'ub', { device_id: D2 })
  assert.equal(limited.status, 429)
  assert.match(limited.body.error, /시험 알림 시도가 너무 많아요/)
  clock += 11 * 60_000
  assert.equal((await call('POST', '/push/test', 'ub', { device_id: D2 })).status, 200)
  // 죽은 토큰 → 시험 알림 502 + 기기 행 정리
  await call('PUT', `/push/devices/${D3}`, 'uc', reg('dead-token'))
  assert.equal((await call('POST', '/push/test', 'uc', { device_id: D3 })).status, 502)
  assert.equal(store.data.devices.some((d) => d.id === D3), false)
  // 해제: 남의 기기는 못 지운다
  assert.deepEqual((await call('DELETE', `/push/devices/${D2}`, 'ua')).body, { ok: true, deleted: false })
  assert.deepEqual((await call('DELETE', `/push/devices/${D2}`, 'ub')).body, { ok: true, deleted: true })
  assert.equal(store.data.devices.length, 0)
  // 로그아웃(리프레시 토큰의 사용자 기기만)
  await call('PUT', `/push/devices/${D1}`, 'ua', reg('tok-cccccccc'))
  store.data.sessions.push({ user_id: 'ub', token_hash: 'hb' }, { user_id: 'ua', token_hash: 'ha' })
  assert.equal(await store.deleteDeviceBySession(D1, 'hb'), false)
  assert.equal(await store.deleteDeviceBySession(D1, 'ha'), true)
  // 등록 시도 제한: 사용자당 분당 10
  let last = 0
  for (let i = 0; i < 11; i++) last = (await call('PUT', `/push/devices/${D1}`, 'ud', reg('tok-dddddddd'))).status
  assert.equal(last, 429)
  assert.equal((await call('GET', '/push/nothing', 'ua')).status, 404)
  await close(srv)
}

// ════════ 5. 스케줄러 ════════
function world(opts: { fail?: (token: string, n: number) => SendResult | null; ios?: boolean } = {}) {
  const store = memoryPushStore(opts.ios)
  const f = fakeSender(opts.fail)
  const clock = { t: 0 }
  const push = createPush({ config: { ...CFG, ios: !!opts.ios }, store, sender: f.sender, auth: auth as any, now: () => clock.t, log: () => {} })
  store.data.lists.push({ id: 'inbox-a', owner_id: 'ua', name: '기본함', kind: 'inbox' }, { id: 'work-a', owner_id: 'ua', name: '업무', kind: 'normal' })
  return { store, f, clock, push, data: (i = -1) => f.sent.at(i)?.message.data }
}
const task = (id: string, due_at: string | null, extra: Partial<{ start_at: string; status: number; list_id: string; title: string; owner_id: string; deleted_at: string; priority: number }> = {}) =>
  ({ id, owner_id: 'ua', title: `할 일 ${id}`, status: 0, start_at: null, due_at, list_id: 'work-a', priority: 0, ...extra })

{
  // 기본: 서울 기기, 10:00 정각 알림 → 그 tick에 한 번, 다음 tick에는 다시 안 감
  const w = world()
  addDevice(w.store, D1, 'ua', 'tok-1')
  w.store.data.tasks.push(task('t1', '2026-10-05T10:00'))
  w.store.data.reminders.push({ id: 'r1', owner_id: 'ua', task_id: 't1', trigger: '-PT0M' })
  w.store.data.cursor = at('2026-10-05T09:59:20')
  w.clock.t = at('2026-10-05T09:59:50')
  await w.push.tick()
  assert.equal(w.f.sent.length, 0) // 아직
  w.clock.t = at('2026-10-05T10:00:20')
  assert.deepEqual(await w.push.tick(), { sent: 1, failed: 0 })
  const d = w.data()
  const fire = at('2026-10-05T10:00')
  assert.deepEqual(d, { type: 'reminder', key: `r:r1@${fire}`, taskId: 't1', at: String(fire), channel: 'tasks', category: 'sprout-task', url: 'sprout://task/t1', body: '오늘 오전 10:00 · 업무', title: '할 일 t1' })
  assert.deepEqual(w.f.sent[0].message.android, { priority: 'HIGH', ttl: '3600s' })
  assert.equal(w.f.sent[0].message.apns, undefined)
  assert.equal(w.store.data.cursor, w.clock.t)
  assert.deepEqual(w.store.data.sent.map((s) => [s.key, s.kind, s.task_id]), [[`r:r1@${fire}`, 'reminder', 't1']]) // 제목은 남기지 않는다
  w.clock.t += 30_000
  await w.push.tick()
  assert.equal(w.f.sent.length, 1)
  // 커서를 되돌려도(재시작 등) push_sent가 막는다
  w.store.data.cursor = at('2026-10-05T09:59:00')
  await w.push.tick()
  assert.equal(w.f.sent.length, 1)
}
{
  // 시간대: 같은 할 일이 뉴욕 기기에는 뉴욕 10:00에. 종일 '당일 09:00'도 기기 시각
  const w = world()
  addDevice(w.store, D1, 'ua', 'tok-seoul')
  addDevice(w.store, D2, 'ua', 'tok-ny', { timezone: NY })
  w.store.data.tasks.push(task('t1', '2026-10-05T10:00'), task('t2', '2026-10-05'))
  w.store.data.reminders.push({ id: 'r1', owner_id: 'ua', task_id: 't1', trigger: '-PT0M' }, { id: 'r2', owner_id: 'ua', task_id: 't2', trigger: 'PT9H' })
  const sentTo = () => w.f.sent.map((s) => `${s.token}:${s.message.data.taskId}`)
  w.store.data.cursor = at('2026-10-05T08:59:50')
  w.clock.t = at('2026-10-05T09:00:10')
  await w.push.tick()
  assert.deepEqual(sentTo(), ['tok-seoul:t2'])
  assert.equal(w.data().body, '오늘 · 업무')
  w.store.data.cursor = at('2026-10-05T09:59:50')
  w.clock.t = at('2026-10-05T10:00:10')
  await w.push.tick()
  assert.deepEqual(sentTo(), ['tok-seoul:t2', 'tok-seoul:t1'])
  w.store.data.cursor = at('2026-10-05T08:59:50', NY)
  w.clock.t = at('2026-10-05T09:00:10', NY)
  await w.push.tick()
  assert.deepEqual(sentTo().slice(2), ['tok-ny:t2'])
  w.store.data.cursor = at('2026-10-05T09:59:50', NY)
  w.clock.t = at('2026-10-05T10:00:10', NY)
  await w.push.tick()
  assert.deepEqual(sentTo().slice(3), ['tok-ny:t1'])
}
{
  // 따라잡기: 20분 꺼졌다 켜지면 그 사이 것을 보내고, 2시간 꺼졌으면 1시간보다 오래된 것은 버린다
  const w = world()
  addDevice(w.store, D1, 'ua', 'tok-1')
  for (const [id, time] of [['a', '08:30'], ['b', '09:10'], ['c', '09:45'], ['d', '10:05']]) {
    w.store.data.tasks.push(task(id, `2026-10-05T${time}`))
    w.store.data.reminders.push({ id: `r${id}`, owner_id: 'ua', task_id: id, trigger: '-PT0M' })
  }
  w.store.data.cursor = at('2026-10-05T08:00')
  w.clock.t = at('2026-10-05T10:00') // 2시간 꺼짐 → 09:00 이후만
  await w.push.tick()
  assert.deepEqual(w.f.sent.map((s) => s.message.data.taskId), ['b', 'c'])
  const w2 = world()
  addDevice(w2.store, D1, 'ua', 'tok-1')
  w2.store.data.tasks.push(task('x', '2026-10-05T09:45'))
  w2.store.data.reminders.push({ id: 'rx', owner_id: 'ua', task_id: 'x', trigger: '-PT0M' })
  w2.store.data.cursor = at('2026-10-05T09:40')
  w2.clock.t = at('2026-10-05T10:00') // 20분 꺼짐
  await w2.push.tick()
  assert.equal(w2.f.sent.length, 1)
  // 커서가 없으면(처음 켬) 한 tick 전부터
  const w3 = world()
  addDevice(w3.store, D1, 'ua', 'tok-1')
  w3.store.data.tasks.push(task('y', '2026-10-05T09:59'))
  w3.store.data.reminders.push({ id: 'ry', owner_id: 'ua', task_id: 'y', trigger: '-PT0M' })
  w3.clock.t = at('2026-10-05T10:00')
  await w3.push.tick()
  assert.equal(w3.f.sent.length, 0)
}
{
  // 로컬 예약 건너뛰기 · 같은 순간 두 알림은 하나 · 완료·휴지통·남의 것 제외 · 반복은 지금 행만 · 제목 숨기기 · caps·권한
  const w = world()
  const fire = at('2026-10-05T10:00')
  addDevice(w.store, D1, 'ua', 'tok-1', { local_keys: [`r:rlocal@${fire}`] })
  addDevice(w.store, D2, 'ua', 'tok-2')
  addDevice(w.store, D3, 'ua', 'tok-3', { push_reminders: false })
  addDevice(w.store, '44444444-4444-4444-8444-444444444444', 'ua', 'tok-old-app', { caps: ['sync'] })
  w.store.data.tasks.push(
    task('local', '2026-10-05T10:00'),
    task('twice', '2026-10-05T10:30', { start_at: '2026-10-05T10:00' }),
    task('done', '2026-10-05T10:00', { status: 1 }),
    task('trash', '2026-10-05T10:00', { deleted_at: 'x' }),
    task('theirs', '2026-10-05T10:00', { owner_id: 'ub' }),
    task('repeat', '2026-10-05T10:00') // 반복 할 일: 지금 회차 행만 본다(다음 회차는 완료하면 생기는 다른 행)
  )
  w.store.data.reminders.push(
    { id: 'rlocal', owner_id: 'ua', task_id: 'local', trigger: '-PT0M' },
    { id: 'rb', owner_id: 'ua', task_id: 'twice', trigger: '-PT0M' }, // 시작 10:00
    { id: 'ra', owner_id: 'ua', task_id: 'twice', trigger: 'END-PT0M' }, // 끝 10:30 → 창 밖
    { id: 'rz', owner_id: 'ua', task_id: 'twice', trigger: '-PT0M' }, // 같은 순간 → 하나만(작은 id rb)
    { id: 'rd', owner_id: 'ua', task_id: 'done', trigger: '-PT0M' },
    { id: 'rt', owner_id: 'ua', task_id: 'trash', trigger: '-PT0M' },
    { id: 'ro', owner_id: 'ub', task_id: 'theirs', trigger: '-PT0M' },
    { id: 'rr', owner_id: 'ua', task_id: 'repeat', trigger: '-PT0M' }
  )
  w.store.data.cursor = at('2026-10-05T09:59:30')
  w.clock.t = at('2026-10-05T10:00:00')
  await w.push.tick()
  const got = w.f.sent.map((s) => `${s.token}:${s.message.data.key.split('@')[0]}`).sort()
  assert.deepEqual(got, ['tok-1:r:rb', 'tok-1:r:rr', 'tok-2:r:rb', 'tok-2:r:rlocal', 'tok-2:r:rr'])
  // 제목 숨기기: 페이로드에 제목·리스트 이름이 아예 없다
  const h = world()
  addDevice(h.store, D1, 'ua', 'tok-1')
  h.store.data.prefs.set('ua', JSON.stringify({ hideTitles: true }))
  h.store.data.tasks.push(task('secret', '2026-10-05T10:00', { title: '비밀 병원 예약' }))
  h.store.data.reminders.push({ id: 'rs', owner_id: 'ua', task_id: 'secret', trigger: '-PT0M' })
  h.store.data.cursor = at('2026-10-05T09:59:30')
  h.clock.t = at('2026-10-05T10:00:00')
  await h.push.tick()
  assert.equal(h.data().title, undefined)
  assert.equal(h.data().body, '오늘 오전 10:00')
  assert.equal(JSON.stringify(h.f.sent).includes('비밀'), false)
  assert.equal(JSON.stringify(h.f.sent).includes('업무'), false)
  // 할 일 알림 끔(설정) → 안 감
  const o = world()
  addDevice(o.store, D1, 'ua', 'tok-1')
  o.store.data.prefs.set('ua', JSON.stringify({ reminders: false }))
  o.store.data.tasks.push(task('t', '2026-10-05T10:00'))
  o.store.data.reminders.push({ id: 'r', owner_id: 'ua', task_id: 't', trigger: '-PT0M' })
  o.store.data.cursor = at('2026-10-05T09:59:30')
  o.clock.t = at('2026-10-05T10:00:00')
  await o.push.tick()
  assert.equal(o.f.sent.length, 0)
}
{
  // 30일 넘게 안 보인 기기 · iOS(PUSH_IOS 꺼짐)에는 보내지 않는다. 켜면 iOS는 보이는 알림(apns)
  for (const ios of [false, true]) {
    const w = world({ ios })
    addDevice(w.store, D1, 'ua', 'tok-stale', { last_seen_at: at('2026-09-01T00:00') })
    addDevice(w.store, D2, 'ua', 'tok-ios', { platform: 'ios' })
    w.store.data.tasks.push(task('t', '2026-10-05T10:00'))
    w.store.data.reminders.push({ id: 'r', owner_id: 'ua', task_id: 't', trigger: '-PT0M' })
    w.store.data.cursor = at('2026-10-05T09:59:30')
    w.clock.t = at('2026-10-05T10:00:00')
    await w.push.tick()
    assert.deepEqual(w.f.sent.map((s) => s.token), ios ? ['tok-ios'] : [])
    if (ios) {
      assert.deepEqual(w.f.sent[0].message.apns.payload.aps.alert, { title: '할 일 t', body: '오늘 오전 10:00 · 업무' })
      assert.equal(w.f.sent[0].message.apns.payload.aps.category, 'sprout-task')
    }
  }
}
{
  // 실패 → 다음 tick에 다시(울릴 시각 뒤 1시간 안에서만) · 죽은 토큰 → 기기 행 삭제
  let down = true
  const w = world({ fail: (tok) => (tok === 'tok-dead' ? { ok: false, invalid: true, status: 404, code: 'UNREGISTERED' } : down ? { ok: false, invalid: false, status: 503 } : null) })
  addDevice(w.store, D1, 'ua', 'tok-1')
  addDevice(w.store, D2, 'ua', 'tok-dead')
  w.store.data.tasks.push(task('t', '2026-10-05T10:00'))
  w.store.data.reminders.push({ id: 'r', owner_id: 'ua', task_id: 't', trigger: '-PT0M' })
  w.store.data.cursor = at('2026-10-05T09:59:30')
  w.clock.t = at('2026-10-05T10:00:00')
  assert.deepEqual(await w.push.tick(), { sent: 0, failed: 2 })
  assert.deepEqual(w.store.data.devices.map((d) => d.token), ['tok-1'])
  assert.equal(w.store.data.sent.length, 0) // 실패한 기록은 지운다
  assert.equal(w.store.data.devices[0].fail_count, 1)
  down = false
  w.clock.t += 30_000
  assert.deepEqual(await w.push.tick(), { sent: 1, failed: 0 })
  assert.equal(w.store.data.devices[0].fail_count, 0)
  // 1시간이 지나면 다시 하지 않는다
  down = true
  w.store.data.tasks.push(task('u', '2026-10-05T11:00'))
  w.store.data.reminders.push({ id: 'ru', owner_id: 'ua', task_id: 'u', trigger: '-PT0M' })
  w.store.data.cursor = at('2026-10-05T10:59:30')
  w.clock.t = at('2026-10-05T11:00:00')
  await w.push.tick()
  down = false
  w.clock.t = at('2026-10-05T12:00:30')
  assert.deepEqual(await w.push.tick(), { sent: 0, failed: 0 })
}
{
  // 한 프로세스만: 잠금을 못 잡으면 아무것도 안 한다. 푸시 꺼짐이면 tick 없음
  const w = world()
  w.store.data.locked = true
  w.clock.t = at('2026-10-05T10:00')
  assert.equal(await w.push.tick(), undefined)
  assert.equal(w.store.data.cursor, null)
  const off = createPush({ config: CFG, store: memoryPushStore(), sender: null, auth: auth as any, log: () => {} })
  assert.equal(await off.tick(), undefined)
  assert.equal(off.enabled, false)
  // push_sent 7일 정리
  const p = world()
  p.store.data.sent.push({ device_id: D1, key: 'old', kind: 'reminder', task_id: null, sent_at: at('2026-09-20T00:00') }, { device_id: D1, key: 'new', kind: 'reminder', task_id: null, sent_at: at('2026-10-04T00:00') })
  p.clock.t = at('2026-10-05T10:00')
  await p.push.tick()
  assert.deepEqual(p.store.data.sent.map((s) => s.key), ['new'])
}
{
  // 하루 요약: 기기 시각 08:00에 한 번, 주말 건너뛰기, 따라잡기 2시간, 0개인 날 없음, 숨기기
  const w = world()
  addDevice(w.store, D1, 'ua', 'tok-1')
  addDevice(w.store, D2, 'ua', 'tok-ny', { timezone: NY })
  addDevice(w.store, D3, 'ua', 'tok-nodaily', { caps: ['reminder', 'sync'] })
  w.store.data.prefs.set('ua', JSON.stringify({ daily: { on: true, time: '08:00', skipWeekends: true } }))
  w.store.data.tasks.push(
    task('a', '2026-10-05T10:00', { title: '보고서 제출' }), task('b', '2026-10-05', { title: '장보기' }), task('c', '2026-10-05', { title: '끝냄', status: 1 }),
    task('late', '2026-10-02', { title: '밀린 일' }), task('next', '2026-10-06', { title: '내일 일' })
  )
  w.store.data.cursor = at('2026-10-05T07:59:40')
  w.clock.t = at('2026-10-05T08:00:10') // 월요일
  await w.push.tick()
  assert.equal(w.f.sent.length, 1)
  assert.equal(w.f.sent[0].token, 'tok-1')
  assert.deepEqual(w.data(), { type: 'daily', kind: 'daily', key: 'daily:2026-10-05', title: '오늘 할 일 3개 중 1개 완료', body: '보고서 제출 · 장보기 · 밀린 할 일 1개', channel: 'daily', url: 'sprout://today' })
  assert.equal(w.f.sent[0].message.android.ttl, '10800s')
  w.store.data.cursor = at('2026-10-05T07:59:40') // 다시 돌아도 하루 한 번
  await w.push.tick()
  assert.equal(w.f.sent.length, 1)
  // 토요일 → 건너뛰기
  w.store.data.cursor = at('2026-10-10T07:59:40')
  w.clock.t = at('2026-10-10T08:00:10')
  await w.push.tick()
  assert.equal(w.f.sent.length, 1)
  // 따라잡기: 09:30에 켜지면 보내고, 10:01이면 안 보낸다
  w.store.data.cursor = at('2026-10-06T06:00')
  w.clock.t = at('2026-10-06T09:30')
  await w.push.tick()
  assert.equal(w.data().key, 'daily:2026-10-06')
  w.store.data.cursor = at('2026-10-07T06:00')
  w.clock.t = at('2026-10-07T10:01')
  await w.push.tick()
  assert.equal(w.data().key, 'daily:2026-10-06')
  // 뉴욕 기기는 뉴욕 08:00, 할 일 0개·밀린 것만
  w.store.data.cursor = at('2026-10-08T07:59:40', NY)
  w.clock.t = at('2026-10-08T08:00:10', NY)
  await w.push.tick()
  assert.equal(w.f.sent.at(-1)!.token, 'tok-ny')
  assert.deepEqual([w.data().title, w.data().body], ['밀린 할 일 4개가 있어요', '오늘 정리해 볼까요?']) // a·b·late·next 모두 10-08 전
  // 숨기기: 제목이 페이로드에 없다 · 0개면 안 보냄
  const h = world()
  addDevice(h.store, D1, 'ua', 'tok-1')
  h.store.data.prefs.set('ua', JSON.stringify({ hideTitles: true, daily: { on: true, time: '07:30' } }))
  h.store.data.tasks.push(task('a', '2026-10-05', { title: '비밀 일정' }))
  h.store.data.cursor = at('2026-10-05T07:29:40')
  h.clock.t = at('2026-10-05T07:30:10')
  await h.push.tick()
  assert.deepEqual([h.data().title, h.data().body], ['오늘 할 일 1개', '눌러서 오늘 목록 보기'])
  assert.equal(JSON.stringify(h.f.sent).includes('비밀'), false)
  const z = world()
  addDevice(z.store, D1, 'ua', 'tok-1')
  z.store.data.prefs.set('ua', JSON.stringify({ daily: { on: true } }))
  z.store.data.cursor = at('2026-10-05T07:59:40')
  z.clock.t = at('2026-10-05T08:00:10')
  await z.push.tick()
  assert.equal(z.f.sent.length, 0)
  // 기본은 꺼짐
  const def = world()
  addDevice(def.store, D1, 'ua', 'tok-1')
  def.store.data.tasks.push(task('a', '2026-10-05'))
  def.store.data.cursor = at('2026-10-05T07:59:40')
  def.clock.t = at('2026-10-05T08:00:10')
  await def.push.tick()
  assert.equal(def.f.sent.length, 0)
}
{
  // 이번 주 목표 마감: 일요일 20:00, 남은 목표가 있을 때 주 1번
  const w = world()
  addDevice(w.store, D1, 'ua', 'tok-1')
  w.store.data.kpis.push({ owner_id: 'ua', week_start: '2026-10-05', status: 'active' }, { owner_id: 'ua', week_start: '2026-10-05', status: 'active' }, { owner_id: 'ua', week_start: '2026-10-05', status: 'achieved' }, { owner_id: 'ua', week_start: '2026-09-28', status: 'active' })
  w.store.data.cursor = at('2026-10-11T19:59:40')
  w.clock.t = at('2026-10-11T20:00:10')
  await w.push.tick()
  assert.deepEqual(w.data(), { type: 'growth', kind: 'weekly_goal_due', key: 'goaldue:2026-10-05', title: '이번 주 목표가 2개 남았어요', body: '오늘 자정에 마감돼요. 하나만 더 해 볼까요?', channel: 'growth', url: 'sprout://growth' })
  // 토요일 20:00에는 없음, 남은 목표 0이면 없음, 끄면 없음
  w.store.data.cursor = at('2026-10-17T19:59:40')
  w.clock.t = at('2026-10-17T20:00:10')
  await w.push.tick()
  w.store.data.cursor = at('2026-10-18T19:59:40')
  w.clock.t = at('2026-10-18T20:00:10')
  await w.push.tick()
  assert.equal(w.f.sent.length, 1)
  const off = world()
  addDevice(off.store, D1, 'ua', 'tok-1')
  off.store.data.prefs.set('ua', JSON.stringify({ growth: { goalDue: false } }))
  off.store.data.kpis.push({ owner_id: 'ua', week_start: '2026-10-05', status: 'active' })
  off.store.data.cursor = at('2026-10-11T19:59:40')
  off.clock.t = at('2026-10-11T20:00:10')
  await off.push.tick()
  assert.equal(off.f.sent.length, 0)
}

// ════════ 6. 업로드 효과 ════════
{
  // 조용한 동기화 모으기: 기기마다 syncMinSec(시험 0.2초)에 1번 + 꼬리 1번, 올린 기기는 뺀다, 데스크톱(헤더 없음)은 모든 휴대폰
  const store = memoryPushStore()
  const f = fakeSender()
  const push = createPush({ config: CFG, store, sender: f.sender, auth: auth as any, log: () => {} })
  addDevice(store, D1, 'ua', 'tok-phone1', { last_seen_at: Date.now() })
  addDevice(store, D2, 'ua', 'tok-phone2', { last_seen_at: Date.now() })
  addDevice(store, D3, 'ua', 'tok-oldapp', { last_seen_at: Date.now(), caps: ['reminder'] })
  const edit = [{ op: 'PATCH', table: 'tasks', id: 't1', data: { title: '새 제목' } }]
  for (let i = 0; i < 10; i++) await push.afterUpload('ua', D1, edit)
  await sleep(30)
  assert.deepEqual(f.sent.map((s) => s.token), ['tok-phone2'])
  assert.deepEqual(f.sent[0].message, { data: { type: 'sync' }, android: { priority: 'NORMAL', ttl: '600s', collapse_key: 'sync' } })
  await sleep(250)
  assert.deepEqual(f.sent.map((s) => s.token), ['tok-phone2', 'tok-phone2']) // 꼬리 1번
  await sleep(250)
  f.clear()
  await push.afterUpload('ua', null, edit) // 데스크톱
  await sleep(30)
  assert.deepEqual(f.sent.map((s) => s.token).sort(), ['tok-phone1', 'tok-phone2'])
  // 동기화와 상관없는 테이블은 보내지 않는다
  f.clear()
  await sleep(250)
  await push.afterUpload('ua', null, [{ op: 'PUT', table: 'diary_entries', id: 'd', data: { content: '일기' } }])
  await sleep(30)
  assert.equal(f.sent.length, 0)
  // 완료·삭제·시각 변경 → 기다리지 않고 바로 지우기(모으기 간격 안이어도)
  await push.afterUpload('ua', D1, edit)
  await push.afterUpload('ua', D1, [{ op: 'PATCH', table: 'tasks', id: 't9', data: { status: 1 } }])
  assert.deepEqual(f.sent.map((s) => [s.token, s.message.data.dismiss]), [['tok-phone2', undefined], ['tok-phone2', '["t9"]']])
  // 지운 알림(reminders DELETE) → 그 알림을 받은 할 일 id를 push_sent에서 찾는다
  f.clear()
  store.data.sent.push({ device_id: D2, key: 'r:r77@123', kind: 'reminder', task_id: 't77', sent_at: Date.now() })
  await push.afterUpload('ua', D1, [{ op: 'DELETE', table: 'reminders', id: 'r77' }])
  assert.equal(f.sent.at(-1)!.message.data.dismiss, '["t77"]')
  push.stop() // 남은 꼬리 타이머 정리
  // 푸시 꺼짐 → 아무것도 안 함
  const off = createPush({ config: CFG, store, sender: null, auth: auth as any, log: () => {} })
  await off.afterUpload('ua', null, edit)
}
{
  // 성장 소식: 진화(처음은 기준만), 주간 리포트(숫자만·AI 글 없음), 초안만, 기본함 정리(caps·설정), 스위치 끄면 없음, 올린 기기 제외
  const w = world()
  const now = Date.parse('2026-10-05T03:00:00Z')
  w.clock.t = now
  addDevice(w.store, D1, 'ua', 'tok-desk-phone', { last_seen_at: now })
  addDevice(w.store, D2, 'ua', 'tok-2', { last_seen_at: now })
  w.store.data.characters.push({ owner_id: 'ua', name: '콩이', species: 'turtle' })
  const xpBatch = [{ op: 'PUT', table: 'xp_events', id: 'x1', data: { amount: 1 } }]
  w.store.data.xp.push({ owner_id: 'ua', amount: 10, created_at: '2026-10-01T00:00:00Z' })
  await w.push.afterUpload('ua', D1, xpBatch)
  assert.equal((await w.store.getState('ua')).last_stage, 1) // 처음: 기준만
  const growth = () => w.f.sent.filter((s) => s.message.data.type === 'growth')
  assert.equal(growth().length, 0)
  w.store.data.xp.push({ owner_id: 'ua', amount: 100, created_at: '2026-10-05T00:00:00Z' }) // 110 XP → 레벨 3 → 꼬마
  await w.push.afterUpload('ua', D1, xpBatch)
  assert.deepEqual(growth().map((s) => [s.token, s.message.data.title, s.message.data.body]), [['tok-2', '콩이가 꼬마로 자랐어요!', '할 일을 끝낸 덕분이에요. 새 모습을 보러 갈까요?']])
  assert.equal(growth()[0].message.android.ttl, '86400s')
  await w.push.afterUpload('ua', D1, xpBatch) // 같은 단계 → 다시 안 감
  assert.equal(growth().length, 1)
  // 리포트: text_json.report가 생김 → 숫자 본문, AI 글은 없다
  w.store.data.reports.push({ id: 'report:c:2026-09-28', owner_id: 'ua', week_start: '2026-09-28', stats_json: JSON.stringify({ completed: 12, goals: [{}, {}, {}], goalsAchieved: 2 }), text_json: JSON.stringify({ report: { done: 'AI가 쓴 비밀 문장', goals: '', next: [] }, draft: [{ title: 'AI 목표', target: 1 }, { title: 'b', target: 1 }, { title: 'c', target: 1 }] }) })
  await w.push.afterUpload('ua', D1, [{ op: 'PATCH', table: 'weekly_reports', id: 'report:c:2026-09-28', data: { text_json: '…' } }])
  assert.deepEqual([growth().at(-1)!.message.data.title, growth().at(-1)!.message.data.body, growth().at(-1)!.message.data.url], ['지난주 리포트가 도착했어요', '할 일 12개 완료 · 목표 3개 중 2개 달성 · 이번 주 목표 초안 3개', 'sprout://growth?report=2026-09-28'])
  assert.equal(JSON.stringify(w.f.sent).includes('AI가 쓴'), false)
  assert.equal(JSON.stringify(w.f.sent).includes('AI 목표'), false)
  await w.push.afterUpload('ua', D1, [{ op: 'PATCH', table: 'weekly_reports', id: 'report:c:2026-09-28', data: { text_json: '…' } }])
  assert.equal(growth().length, 2) // 같은 주는 한 번
  // 다음 주: 초안만
  w.store.data.reports.push({ id: 'report:c:2026-10-05', owner_id: 'ua', week_start: '2026-10-05', stats_json: '{}', text_json: JSON.stringify({ draft: [{ title: 'x', target: 1 }, { title: 'y', target: 1 }] }) })
  await w.push.afterUpload('ua', D1, [{ op: 'PATCH', table: 'weekly_reports', id: 'report:c:2026-10-05', data: { text_json: '…' } }])
  assert.deepEqual([growth().at(-1)!.message.data.kind, growth().at(-1)!.message.data.title, growth().at(-1)!.message.data.body], ['weekly_draft', '이번 주 목표 초안이 준비됐어요', '콩이가 목표 2개를 제안했어요. 골라서 정해 볼까요?'])
  // 기본함 정리: 기본 꺼짐 → 켜고 caps가 있어야, 20개 초과, 7일에 한 번
  for (let i = 0; i < 21; i++) w.store.data.tasks.push(task(`in${i}`, null, { list_id: 'inbox-a' }))
  const taskBatch = [{ op: 'PUT', table: 'tasks', id: 'in0', data: { title: 'x' } }]
  await w.push.afterUpload('ua', D1, taskBatch)
  assert.equal(growth().filter((s) => s.message.data.kind === 'inbox_cleanup').length, 0)
  w.store.data.prefs.set('ua', JSON.stringify({ growth: { inboxCleanup: true } }))
  await w.push.afterUpload('ua', D1, taskBatch)
  assert.equal(growth().filter((s) => s.message.data.kind === 'inbox_cleanup').length, 0) // caps 없음
  w.store.data.devices.find((d) => d.id === D2)!.caps = [...ALL_CAPS, 'inbox-cleanup']
  await w.push.afterUpload('ua', D1, taskBatch)
  const inbox = growth().filter((s) => s.message.data.kind === 'inbox_cleanup')
  assert.deepEqual([inbox.length, inbox[0].message.data.title, inbox[0].message.data.url], [1, '기본함에 할 일이 21개 쌓였어요', 'sprout://lists/inbox?cleanup=1'])
  w.clock.t += 6 * 86400_000
  await w.push.afterUpload('ua', D1, taskBatch)
  assert.equal(growth().filter((s) => s.message.data.kind === 'inbox_cleanup').length, 1)
  // 진화 스위치 끄면 없음
  w.store.data.prefs.set('ua', JSON.stringify({ growth: { evolve: false } }))
  w.store.data.xp.push({ owner_id: 'ua', amount: 500, created_at: '2026-10-06T00:00:00Z' })
  const n = growth().length
  await w.push.afterUpload('ua', D1, xpBatch)
  assert.equal(growth().length, n)
  w.push.stop()
}

// ════════ 7. 계획 함수 직접(로컬 예약 키가 다른 알림 id여도 같은 할 일·같은 순간이면 건너뜀) ════════
{
  const fire = at('2026-10-05T10:00')
  const dev: Device = { id: D1, user_id: 'ua', provider: 'fcm', token: 't', platform: 'android', app_version: null, caps: ['reminder'], timezone: SEOUL, locale: null, local_keys: [`r:rz@${fire}`], push_reminders: true, last_seen_at: 0 }
  const rows = [{ owner_id: 'ua', rid: 'ra', trigger: '-PT0M', tid: 't', title: 'x', start_at: null, due_at: '2026-10-05T10:00', list_name: null, list_kind: null }, { owner_id: 'ua', rid: 'rz', trigger: '-PT0M', tid: 't', title: 'x', start_at: null, due_at: '2026-10-05T10:00', list_name: null, list_kind: null }]
  assert.deepEqual(planReminderPushes(rows, dev, parseNotifyPrefs(null), fire - 1000, fire), [])
  assert.equal(planReminderPushes(rows, { ...dev, local_keys: [] }, parseNotifyPrefs(null), fire - 1000, fire)[0].key, `r:ra@${fire}`)
}

console.log('push: ok')
process.exit(0)
