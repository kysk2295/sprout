// 47 §20 서버 턴 시험: 실제 AI 프록시(createAi) + 가짜 모델 백엔드 + 기기 시험 데이터(node:sqlite)로
// 끝까지 받기 · 앱이 끊어도 턴은 끝남 → 이어 받기 · 살아 있음 줄 · 멈춤 · 동시 턴 409 · 없는 턴 404 · 턴 1회 셈.
// TEST_DATABASE_URL이 있으면 시간대 자식 프로세스(zoneRunner + turnWorker)로 실제 Postgres까지.
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { aiConfigFromEnv, createAi, memoryUsageStore } from './ai.ts'
import { createTurns, inProcessRunner, zoneRunner } from './turns.ts'
import { toPg } from './assistantDb.ts'
import type { AssistantDb } from '../../../packages/schema/src/assistantExec.ts'
import { createTables, seedFixture } from '../../../packages/schema/src/assistantFixture.ts'
import { emptyMemory } from '../../../packages/schema/src/assistantRouter.ts'

const listen = (s: Server) => new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)))
const close = (s: Server) => new Promise((r) => { s.closeAllConnections(); s.close(r) })
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

// ── 가짜 모델: 판단 = read, 도구를 주면 when_last 미용실, 도구 결과를 받으면 답. 'slow'가 들어간 말은 문이 열릴 때까지 기다림 ──
const seen: any[] = []
let gate: Promise<void> | null = null
let openGate = () => {}
const holdModel = () => { gate = new Promise((r) => { openGate = () => { gate = null; r() } }) }
const reply = (o: unknown) => new Response(JSON.stringify(o) + '\n', { headers: { 'content-type': 'application/x-ndjson' } })
const backend = {
  name: 'direct' as const,
  tags: async () => ({ models: [{ name: 'qwen3.5:9b' }] }),
  chat: async (body: any, signal?: AbortSignal) => {
    seen.push(body)
    if (gate && !body.sprout_route) await Promise.race([gate, new Promise((_, rej) => signal?.addEventListener('abort', () => rej(new Error('aborted'))))])
    if (body.sprout_route) return reply({ message: { role: 'assistant', content: JSON.stringify({ intent: 'read', confidence: 0.99, resolution: 'lookup' }) }, done: true })
    const hasTool = body.messages.some((m: any) => m.role === 'tool')
    if (body.tools?.length && !hasTool) return reply({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'when_last', arguments: { query: '미용실' } } }] }, done: true, prompt_eval_count: 10, eval_count: 5 })
    return reply({ message: { role: 'assistant', content: '마지막으로 간 날은 카드에 있어.' }, done: true, prompt_eval_count: 10, eval_count: 5 })
  }
}

// 기기 시험 데이터 = 이 사용자의 DB
const { DatabaseSync } = await import('node:sqlite')
const lite = new DatabaseSync(':memory:')
createTables((sql, p = []) => { lite.prepare(sql).run(...(p as any[])) })
seedFixture((sql, p = []) => { lite.prepare(sql).run(...(p as any[])) })
const liteDb: AssistantDb = { getAll: async (sql, args = []) => lite.prepare(sql).all(...(args as any[])).map((r) => ({ ...r })) as any }

const store = memoryUsageStore()
const USER = '00000000-0000-0000-0000-00000000000a'
const auth = async (req: any) => { if (req.headers.authorization !== 'Bearer good') throw new Error('no'); return USER }
const ai = createAi({ routing: true, turns: true, config: { ...aiConfigFromEnv({}), perMinute: 100, perDay: 100 }, store, backend, auth, log: () => {} })
let turns2!: ReturnType<typeof createTurns>
const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (await turns2.handle(req, res, path)) return
  if (!(await ai.handle(req, res, path))) { res.writeHead(404); res.end() }
})
const self = await listen(server)
turns2 = createTurns({ auth, run: inProcessRunner({ db: () => liteDb, self, routing: true }), pingMs: 50, log: () => {} })

const H = { 'content-type': 'application/json', authorization: 'Bearer good' }
const body = (turn: string, text = '미용실 마지막으로 언제 갔지?') => ({ turn, text, history: [], memory: emptyMemory(), pending: null, diary: false, name: '꿈틀이', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
const readAll = async (r: Response) => (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l))

try {
  // 1) 상태에 turn 기능
  const status = await (await fetch(`${self}/ai/status`, { headers: H })).json()
  assert.ok(status.features.includes('turn'))

  // 2) 끝까지 받기: 칩·카드 사건 → 결과. 판단 + 모델 2번이어도 턴 1회
  const before = await store.count(USER, '2000-01-01')
  const lines = await readAll(await fetch(`${self}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify(body('turn-full-0001')) }))
  const result = lines.find((l) => l.result)?.result
  assert.ok(result, JSON.stringify(lines))
  assert.ok(result.chips.some((c: any) => c.tool === 'when_last'))
  assert.ok(result.cards.some((c: any) => c.type === 'since'))
  assert.equal(result.raw, undefined, '근거 검사 전 글은 보내지 않음')
  assert.deepEqual(lines.map((l) => l.seq).filter(Boolean), lines.filter((l) => l.seq).map((_, i) => i + 1), 'seq 1부터 빈틈 없이')
  assert.ok(seen.some((b) => b.sprout_route), '서버가 Jev 판단도 부름')
  assert.equal(await store.count(USER, '2000-01-01') - before, 1, '턴 1회만 셈')

  // 3) 앱이 받는 중 끊음 → 서버 턴은 끝까지 → 이어 받기
  holdModel()
  const ctl = new AbortController()
  const r1 = await fetch(`${self}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify(body('turn-drop-0001')), signal: ctl.signal })
  const reader = r1.body!.getReader()
  let got = ''
  while (!got.includes('"seq":1')) got += new TextDecoder().decode((await reader.read()).value)
  ctl.abort() // 앱을 나감
  await tick(30)
  openGate()
  for (let i = 0; i < 100 && !turns2.jobs.get(`${USER}:turn-drop-0001`)?.done; i++) await tick(20)
  assert.ok(turns2.jobs.get(`${USER}:turn-drop-0001`)?.done, '앱이 끊어도 서버 턴은 끝남')
  const rest = await readAll(await fetch(`${self}/ai/turn/turn-drop-0001?after=1`, { headers: H }))
  assert.equal(rest[0].seq, 2)
  assert.ok(rest.at(-1).result?.cards.some((c: any) => c.type === 'since'))

  // 4) 기다리는 동안 살아 있음 줄
  holdModel()
  const r2 = await fetch(`${self}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify(body('turn-ping-0001')) })
  const rd2 = r2.body!.getReader()
  let text2 = ''
  const until = Date.now() + 2000
  while (!text2.includes('"ping":1') && Date.now() < until) text2 += new TextDecoder().decode((await rd2.read()).value)
  assert.ok(text2.includes('"ping":1'))
  // 5) 도는 턴이 있으면 다른 턴은 409
  assert.equal((await fetch(`${self}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify(body('turn-other-001')) })).status, 409)
  // 같은 턴을 다시 시작하면 붙기만(새로 돌리지 않음)
  const again = await fetch(`${self}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify(body('turn-ping-0001')) })
  assert.equal(again.status, 200); await again.body?.cancel()
  // 6) 멈춤 → 오류 줄(멈춤)로 끝
  assert.equal((await fetch(`${self}/ai/turn/turn-ping-0001/cancel`, { method: 'POST', headers: H })).status, 200)
  for (let i = 0; i < 100 && !turns2.jobs.get(`${USER}:turn-ping-0001`)?.done; i++) await tick(20)
  const stopped = await readAll(await fetch(`${self}/ai/turn/turn-ping-0001?after=0`, { headers: H }))
  const last = stopped.at(-1)
  assert.ok(last.error || last.result?.stopped, JSON.stringify(last))
  await rd2.cancel().catch(() => {})
  openGate()

  // 7) 없는 턴 404 · 로그인 없음 401 · 시간대 없음 400
  assert.equal((await fetch(`${self}/ai/turn/turn-none-0001?after=0`, { headers: H })).status, 404)
  assert.equal((await fetch(`${self}/ai/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body('turn-auth-001')) })).status, 401)
  const { timeZone: _tz, ...noTz } = body('turn-notz-001')
  assert.equal((await fetch(`${self}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify(noTz) })).status, 400)
  assert.equal((await fetch(`${self}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify({ ...body('turn-badtz-01'), timeZone: 'Mars/Base' }) })).status, 400)
  console.log('turns: 끝까지 받기 · 턴 1회 셈 · 끊어도 끝남 → 이어 받기 · 살아 있음 줄 · 409 · 같은 턴 다시 붙기 · 멈춤 · 404/401/400 ok')
} finally { await close(server) }

// ── 시간대 자식 프로세스 + 실제 Postgres(TEST_DATABASE_URL이 있을 때) ──
const url = process.env.TEST_DATABASE_URL
if (!url) { console.log('turns: TEST_DATABASE_URL 없음 — 자식 프로세스·Postgres 시험 건너뜀'); process.exit(0) }
const name = `turn_test_${Date.now()}`
const admin = new pg.Client({ connectionString: url })
await admin.connect()
await admin.query(`CREATE DATABASE ${name}`)
const dbUrl = new URL(url); dbUrl.pathname = `/${name}`
const pool = new pg.Pool({ connectionString: dbUrl.toString() })
const server3 = createServer()
try {
  const init = new URL('../../db/init/', import.meta.url)
  for (const f of ['01-base.sql', '02-schema.sql', '09-assistant-scope.sql']) await pool.query(readFileSync(new URL(f, init), 'utf8'))
  await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'a@example.com', 'x')", [USER])
  const pending: Promise<unknown>[] = []
  seedFixture((sql, params = []) => {
    const ins = /^INSERT INTO (\w+) \(([^)]*)\) VALUES \(([^)]*)\)$/.exec(sql)
    pending.push(pool.query(toPg(ins ? `INSERT INTO ${ins[1]} (owner_id, ${ins[2]}) VALUES (?, ${ins[3]})` : sql), ins ? [USER, ...params] : params))
  })
  for (const p of pending) await p
  const self3 = await listen(server3)
  // 이 프로세스와 다른 시간대 → 자식(turnWorker.ts, TZ=그 시간대)에서
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  // 지금 이 프로세스와 '날짜'가 다른 시간대(UTC+14 · UTC-11 중) — 자식이 정말 그 시간대로 셈하는지 가린다
  const other = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find((tz) => dayIn(tz) !== dayIn(here)) ?? 'Pacific/Kiritimati'
  const run = zoneRunner({ exec: { db: () => liteDb, self: self3, routing: true }, workerPath: new URL('./turnWorker.ts', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: dbUrl.toString(), TURN_SELF: self3 }, idleMs: 60_000 })
  const t3 = createTurns({ auth, run, log: () => {} })
  server3.on('request', async (req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (await t3.handle(req, res, path)) return
    if (!(await ai.handle(req, res, path))) { res.writeHead(404); res.end() }
  })
  seen.length = 0
  const lines3 = await readAll(await fetch(`${self3}/ai/turn`, { method: 'POST', headers: H, body: JSON.stringify({ ...body('turn-zone-0001'), timeZone: other }) }))
  const r3 = lines3.find((l) => l.result)?.result
  assert.ok(r3, JSON.stringify(lines3))
  assert.ok(r3.cards.some((c: any) => c.type === 'since'), '자식 프로세스가 Postgres(사용자 범위)에서 찾음')
  // 모델에게 간 '오늘'이 그 시간대의 오늘
  const today = dayIn(other)
  assert.notEqual(today, dayIn(here))
  const sent = JSON.stringify(seen.find((b) => b.messages)?.messages ?? [])
  assert.ok(sent.includes(`오늘 ${today}`), `모델에게 간 오늘(${today})`)
  console.log(`turns: 시간대 자식(${other}) · 실제 Postgres · 오늘 ${today} ok`)
} finally {
  await close(server3)
  await pool.end()
  await admin.query(`DROP DATABASE IF EXISTS ${name}`).catch(() => {})
  await admin.end()
}
process.exit(0) // 자식 프로세스·연결을 기다리지 않고 끝냄
