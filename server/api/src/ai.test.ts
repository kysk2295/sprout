// AI 프록시 시험: 가짜 Ollama(로컬 http)로 인증·검사·대기열·상한·시간 초과·원문 미저장을 확인한다
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { aiConfigFromEnv, AiQueue, createAi, dayKey, localModelNames, memoryUsageStore, pgUsageStore, weekKey, type AiConfig } from './ai.ts'
import { backendFromEnv, directBackend, workerBackend, type AiBackend } from './ai-backend.ts'
import { startWorker } from '../../ai-worker/worker.ts'

const listen = (s: Server) => new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)))
const close = (s: Server) => new Promise((r) => { s.closeAllConnections(); s.close(r) })
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

// ── 가짜 Ollama ──
// 마지막 메시지 내용으로 동작을 고른다: "gate:<이름>" = 시험이 열 때까지 대기, "hang" = 답 안 함, "fail" = 500
const bodies: any[] = []
const authHeaders: (string | undefined)[] = []
const started: string[] = []
let active = 0
let peak = 0
const aborted: string[] = []
const gates = new Map<string, () => void>()
const openGate = async (name: string) => { for (let i = 0; i < 100 && !gates.has(name); i++) await tick(10); gates.get(name)!(); gates.delete(name) }
const ollama = createServer(async (req, res) => {
  if (req.url === '/api/tags') {
    res.end(JSON.stringify({ models: [
      { name: 'qwen3.5:9b', capabilities: ['completion'] },
      { name: 'llama3:8b' },
      { name: 'gpt-oss:120b-cloud' },
      { name: 'remote:1b', remote_host: 'https://ollama.com' },
      { name: 'bge-m3', details: { family: 'bert' } }
    ] }))
    return
  }
  let raw = ''
  for await (const c of req) raw += c
  const body = JSON.parse(raw)
  bodies.push(body)
  authHeaders.push(req.headers.authorization)
  const last: string = body.messages.at(-1).content
  started.push(last)
  active++
  peak = Math.max(peak, active)
  let closed = false
  res.on('close', () => { if (!res.writableFinished) { closed = true; aborted.push(last) } })
  try {
    if (last.startsWith('gate:')) await new Promise<void>((r) => gates.set(last.slice(5), r))
    if (last === 'hang') await new Promise((r) => res.on('close', r))
    if (closed) return
    if (last === 'fail') { res.writeHead(500); res.end('{"error":"boom"}'); return }
    const counts = { prompt_eval_count: 11, eval_count: 7, total_duration: 5_000_000 }
    if (!body.stream) { res.end(JSON.stringify({ model: body.model, message: { role: 'assistant', content: `답:${last}` }, done: true, ...counts })); return }
    res.writeHead(200, { 'content-type': 'application/x-ndjson' })
    res.write(JSON.stringify({ message: { role: 'assistant', content: '답:' }, done: false }) + '\n')
    if (last === 'slowstream') { await new Promise((r) => res.on('close', r)); return }
    res.write(JSON.stringify({ message: { role: 'assistant', content: last }, done: false }) + '\n')
    res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, ...counts }) + '\n')
  } finally { active-- }
})
const ollamaUrl = await listen(ollama)

// ── 프록시 하나 띄우기 ──
let clock = Date.parse('2026-10-07T03:00:00Z') // 수요일 12:00 KST
const servers: Server[] = []
async function proxy(over: Partial<AiConfig> = {}, backend: AiBackend = directBackend(ollamaUrl)) {
  const config = { ...aiConfigFromEnv({}), perMinute: 1000, perDay: 1000, ...over }
  const store = memoryUsageStore()
  const logs: string[] = []
  const ai = createAi({
    config, store, backend, now: () => clock, log: (l) => logs.push(l),
    auth: async (req) => {
      const h = req.headers.authorization ?? ''
      if (!h.startsWith('Bearer user-')) throw new Error('no')
      return h.slice(7)
    }
  })
  const s = createServer(async (req, res) => {
    if (!(await ai.handle(req, res, (req.url ?? '/').split('?')[0]))) { res.writeHead(404); res.end() }
  })
  servers.push(s)
  return { base: await listen(s), store, ai, logs }
}
const msg = (content: string) => [{ role: 'user', content }]
const call = (base: string, path: string, body: unknown, user: string | null = 'user-a', signal?: AbortSignal) =>
  fetch(base + path, { method: 'POST', signal, headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${user}` } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const ndjson = async (r: Response) => (await r.text()).trim().split('\n').map((l) => JSON.parse(l))

// 순수 함수
assert.equal(dayKey(Date.parse('2026-10-04T15:30:00Z'), 540), '2026-10-05') // 한국 자정 넘김
assert.equal(weekKey(Date.parse('2026-10-07T03:00:00Z'), 540), '2026-10-05') // 수 → 그 주 월
assert.equal(weekKey(Date.parse('2026-10-11T14:00:00Z'), 540), '2026-10-05') // 일 23시 KST
assert.equal(weekKey(Date.parse('2026-10-11T15:00:00Z'), 540), '2026-10-12') // 월 0시 KST
assert.deepEqual(localModelNames({ models: [{ name: 'a' }, { name: 'x-cloud' }, { name: 'r', remote_host: 'h' }] }), ['a'])
assert.deepEqual(localModelNames({ models: [{ name: 'a' }, { name: 'b' }] }, ['b']), ['b'])

{
  const { base, store } = await proxy()
  // 인증 필수
  let r = await call(base, '/ai/assistant', { messages: msg('hi') }, null)
  assert.equal(r.status, 401)
  assert.equal((await r.json()).error, '로그인이 필요해요.')
  assert.equal((await fetch(base + '/ai/status')).status, 401)
  assert.equal((await call(base, '/ai/assistant', { messages: msg('hi') }, 'nope')).status, 401)
  assert.equal((await call(base, '/ai/unknown', { messages: msg('hi') })).status, 404)

  // 검사
  const bad = async (body: unknown, status: number) => {
    const res = await call(base, '/ai/assistant', body)
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 80))
    const j = await res.json()
    assert.equal(typeof j.error, 'string')
    assert.match(j.error, /[가-힣]/)
  }
  await bad('{not json', 400)
  await bad({}, 400)
  await bad({ messages: [] }, 400)
  await bad({ messages: [{ role: 'tool', content: 'x' }] }, 400)
  await bad({ messages: [{ role: 'user', content: 3 }] }, 400)
  await bad({ messages: msg('x'), format: 'yaml' }, 400)
  await bad({ messages: msg('x'), stream: 'yes' }, 400)
  await bad({ messages: msg('x'), options: { temperature: 9 } }, 400)
  await bad({ messages: Array.from({ length: 31 }, () => ({ role: 'user', content: 'x' })) }, 413)
  await bad({ messages: msg('x'.repeat(30_001)) }, 413)
  await bad({ messages: [{ role: 'user', content: 'x'.repeat(30_000) }, { role: 'user', content: 'x'.repeat(30_000) }, { role: 'user', content: 'x' }] }, 413)
  await bad({ messages: msg('x'), format: { description: 'x'.repeat(20_001) } }, 413)
  await bad({ messages: msg('x'.repeat(300_000)) }, 413) // 본문 크기 상한
  await bad({ messages: msg('x'), model: 'gpt-oss:120b-cloud' }, 400) // 클라우드 금지
  await bad({ messages: msg('x'), model: 'remote:1b' }, 400) // 원격 금지
  await bad({ messages: msg('x'), model: 'bge-m3' }, 400) // 임베딩 모델
  assert.equal(bodies.length, 0, '검사에서 걸린 요청은 Ollama까지 가지 않는다')
  assert.equal(store.rows.size, 0, '걸린 요청은 사용량에 세지 않는다')

  // 정상: 강제 옵션 + format 그대로 + 기본 모델
  const schema = { type: 'object', properties: { a: { type: 'string' } } }
  r = await call(base, '/ai/classify', { messages: [{ role: 'system', content: 's', images: ['zzz'] }, ...msg('일')], format: schema, options: { temperature: 0.3, num_ctx: 99999 } })
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.message.content, '답:일')
  assert.equal(j.model, 'qwen3.5:9b')
  const sent = bodies.at(-1)
  assert.deepEqual(sent.options, { temperature: 0.3, num_ctx: 4096, num_predict: 700 })
  assert.equal(sent.think, false)
  assert.equal(sent.stream, true, '백엔드에는 늘 스트림으로 보내고 서버가 모은다')
  assert.deepEqual(sent.format, schema)
  assert.deepEqual(Object.keys(sent.messages[0]).sort(), ['content', 'role'], '다른 칸(images)은 버린다')
  assert.ok(sent.messages[0].content.startsWith('s\n\nReply with ONE JSON value only'), 'format이 있으면 기존 지시문 뒤에 JSON 모양을 붙인다')
  assert.ok(sent.messages[0].content.includes(JSON.stringify(schema)), '스키마를 지시문에 그대로 적는다')
  // 지시문이 없으면 맨 앞에 새로 넣고, format이 없으면 메시지를 건드리지 않는다
  r = await call(base, '/ai/classify', { messages: msg('j'), format: 'json' }, 'user-hint')
  assert.equal(bodies.at(-1).messages[0].role, 'system')
  assert.equal(bodies.at(-1).messages.length, 2)
  r = await call(base, '/ai/classify', { messages: msg('plain') }, 'user-hint')
  assert.equal(bodies.at(-1).messages.length, 1)
  r = await call(base, '/ai/map', { messages: msg('m'), model: 'llama3:8b' })
  assert.equal((await r.json()).model, 'llama3:8b')

  // 스트림: 대기 줄 → Ollama 줄 그대로
  r = await call(base, '/ai/assistant', { messages: msg('s'), stream: true })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type')!, /ndjson/)
  const lines = await ndjson(r)
  assert.deepEqual(lines[0], { queue: { position: 0, waiting: 0 } })
  assert.equal(lines.filter((l) => l.message).map((l) => l.message.content).join(''), '답:s')
  assert.equal(lines.at(-1).done, true)

  // 상태
  r = await fetch(base + '/ai/status', { headers: { authorization: 'Bearer user-a' } })
  const st = await r.json()
  assert.equal(st.available, true)
  assert.deepEqual(st.models, ['qwen3.5:9b', 'llama3:8b'])
  assert.equal(st.default_model, 'qwen3.5:9b')
  assert.deepEqual(st.queue, { running: 0, waiting: 0, concurrency: 1, max: 20 })
  assert.equal(st.usage.today, 3)
  assert.deepEqual(st.usage.weekly['kpi-draft'], { used: 0, limit: 1 })

  // 사용량은 숫자만: 원문이 저장소로 가지 않는다
  const row = [...store.rows.values()].find((x) => x.endpoint === 'classify')!
  assert.deepEqual({ ...row }, { userId: 'user-a', endpoint: 'classify', day: '2026-10-07', requests: 1, failures: 0, prompt_tokens: 11, output_tokens: 7, duration_ms: 5 })
  const dump = JSON.stringify([...store.rows.values(), store.calls])
  for (const secret of ['답:', '"일"', 'zzz', 'properties']) assert.ok(!dump.includes(secret), `저장소에 원문 없음: ${secret}`)
}

// 대기열: 동시 1, 들어온 순서대로, 대기 순서 표시
{
  const { base, ai } = await proxy({ concurrency: 1 })
  started.length = 0
  peak = 0
  const p1 = call(base, '/ai/assistant', { messages: msg('gate:q1') }, 'user-a')
  await tick(50)
  const p2 = call(base, '/ai/diary', { messages: msg('gate:q2'), stream: true }, 'user-b')
  await tick(50)
  const p3 = call(base, '/ai/assistant', { messages: msg('gate:q3'), stream: true }, 'user-c')
  await tick(50)
  assert.equal(ai.queue.running, 1)
  assert.equal(ai.queue.waiting.length, 2)
  await openGate('q1')
  await openGate('q2')
  await openGate('q3')
  const [r1, r2, r3] = await Promise.all([p1, p2, p3])
  assert.deepEqual(started, ['gate:q1', 'gate:q2', 'gate:q3'], '들어온 순서대로')
  assert.equal(peak, 1, '동시에 하나만')
  assert.equal(r1.status, 200)
  const l2 = await ndjson(r2)
  const l3 = await ndjson(r3)
  assert.deepEqual(l2[0], { queue: { position: 1, waiting: 1 } })
  assert.deepEqual(l3.filter((l) => l.queue).map((l) => l.queue.position), [2, 1, 0], '앞사람이 빠질 때마다 순서가 줄어든다')
}
// 동시 2
{
  const { base } = await proxy({ concurrency: 2 })
  peak = 0
  const ps = ['c1', 'c2', 'c3'].map((g, i) => call(base, '/ai/assistant', { messages: msg(`gate:${g}`) }, `user-${i}`))
  await tick(80)
  assert.equal(active, 2)
  for (const g of ['c1', 'c2', 'c3']) await openGate(g)
  await Promise.all(ps)
  assert.equal(peak, 2)
}
// 대기열이 차면 503 + Retry-After, 대기 시간 초과도 503
{
  const { base } = await proxy({ concurrency: 1, queueMax: 1, queueWaitMs: 300 })
  const p1 = call(base, '/ai/assistant', { messages: msg('gate:f1') }, 'user-a')
  await tick(50)
  const p2 = call(base, '/ai/assistant', { messages: msg('x') }, 'user-b')
  await tick(50)
  const r3 = await call(base, '/ai/assistant', { messages: msg('x') }, 'user-c')
  assert.equal(r3.status, 503)
  assert.ok(Number(r3.headers.get('retry-after')) > 0)
  assert.equal((await r3.json()).code, 'queue_full')
  const r2 = await p2 // 300ms 기다리다 포기
  assert.equal(r2.status, 503)
  assert.equal((await r2.json()).code, 'queue_timeout')
  await openGate('f1')
  assert.equal((await p1).status, 200)
}

// 사용자별 상한: 분당·일·동시
{
  const { base } = await proxy({ perMinute: 3, perDay: 5 })
  for (let i = 0; i < 3; i++) assert.equal((await call(base, '/ai/assistant', { messages: msg('x') })).status, 200)
  let r = await call(base, '/ai/assistant', { messages: msg('x') })
  assert.equal(r.status, 429)
  assert.equal((await r.json()).code, 'rate_minute')
  assert.ok(Number(r.headers.get('retry-after')) >= 1)
  assert.equal((await call(base, '/ai/assistant', { messages: msg('x') }, 'user-other')).status, 200, '다른 사용자는 따로 센다')
  clock += 61_000
  assert.equal((await call(base, '/ai/assistant', { messages: msg('x') })).status, 200)
  assert.equal((await call(base, '/ai/classify', { messages: msg('x') })).status, 200)
  r = await call(base, '/ai/assistant', { messages: msg('x') })
  assert.equal(r.status, 429)
  assert.equal((await r.json()).code, 'rate_day')
  assert.equal(Number(r.headers.get('retry-after')), 12 * 3600 - 61, '한국 자정까지')
  clock += 13 * 3600_000 // 다음 날
  assert.equal((await call(base, '/ai/assistant', { messages: msg('x') })).status, 200)
}
{
  const { base } = await proxy({ userConcurrent: 1 })
  const p = call(base, '/ai/assistant', { messages: msg('gate:u1') })
  await tick(50)
  const r = await call(base, '/ai/assistant', { messages: msg('x') })
  assert.equal(r.status, 429)
  assert.equal((await r.json()).code, 'user_busy')
  await openGate('u1')
  assert.equal((await p).status, 200)
}

// 주간 상한: KPI 초안 1 + 리포트 1, 실패는 세지 않는다, 다음 주 월요일에 풀린다
{
  clock = Date.parse('2026-10-07T03:00:00Z')
  const { base } = await proxy()
  let r = await call(base, '/ai/kpi-draft', { messages: msg('fail') })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error, '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.')
  assert.equal((await call(base, '/ai/kpi-draft', { messages: msg('k') })).status, 200, '실패한 1회는 돌려준다')
  r = await call(base, '/ai/kpi-draft', { messages: msg('k') })
  assert.equal(r.status, 429)
  assert.equal((await r.json()).code, 'weekly')
  assert.equal(Number(r.headers.get('retry-after')), (4 * 24 + 12) * 3600, '다음 월요일 0시 KST까지')
  assert.equal((await call(base, '/ai/weekly-report', { messages: msg('w') })).status, 200)
  assert.equal((await call(base, '/ai/weekly-report', { messages: msg('w') })).status, 429)
  assert.equal((await call(base, '/ai/assistant', { messages: msg('a') })).status, 200, '다른 AI는 주간 상한과 무관')
  clock = Date.parse('2026-10-11T15:00:00Z') // 월 0시 KST
  assert.equal((await call(base, '/ai/kpi-draft', { messages: msg('k') })).status, 200)
  // 같은 사용자가 동시에 두 번 보내도 1회만
  clock += 7 * 86_400_000
  const both = await Promise.all([call(base, '/ai/weekly-report', { messages: msg('w') }), call(base, '/ai/weekly-report', { messages: msg('w') })])
  assert.deepEqual(both.map((x) => x.status).sort(), [200, 429])
}

// 시간 초과 → 504, 실패로 기록(원문 없이)
{
  const { base, store } = await proxy({ timeoutMs: 200 })
  const r = await call(base, '/ai/assistant', { messages: msg('hang') })
  assert.equal(r.status, 504)
  assert.equal((await r.json()).code, 'timeout')
  const row = [...store.rows.values()][0]
  assert.equal(row.requests, 0)
  assert.equal(row.failures, 1)
}

// 클라이언트가 끊으면 Ollama 요청도 멈추고 자리를 비운다
{
  const { base, ai, store } = await proxy({ concurrency: 1 })
  const ctl = new AbortController()
  const r = await call(base, '/ai/assistant', { messages: msg('slowstream'), stream: true }, 'user-a', ctl.signal)
  const reader = r.body!.getReader()
  await reader.read()
  ctl.abort()
  await tick(100)
  assert.ok(aborted.includes('slowstream'), 'Ollama 쪽 연결도 끊긴다')
  assert.equal(ai.queue.running, 0)
  assert.equal([...store.rows.values()][0].failures, 1)
  // 대기 중에 끊으면 줄에서 빠진다
  const p = call(base, '/ai/assistant', { messages: msg('gate:a1') }, 'user-b')
  await tick(50)
  const ctl2 = new AbortController()
  const p2 = call(base, '/ai/assistant', { messages: msg('x') }, 'user-c', ctl2.signal).catch(() => 'aborted')
  await tick(50)
  assert.equal(ai.queue.waiting.length, 1)
  ctl2.abort()
  assert.equal(await p2, 'aborted')
  await tick(50)
  assert.equal(ai.queue.waiting.length, 0)
  await openGate('a1')
  assert.equal((await p).status, 200)
}

// Mac mini 꺼짐 → 503 "지금은 AI를 쓸 수 없어요", 상태는 available=false
{
  const dead = createServer()
  const deadUrl = await listen(dead)
  await close(dead)
  const { base, store } = await proxy({}, directBackend(deadUrl))
  const r = await call(base, '/ai/assistant', { messages: msg('x') })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error, '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.')
  assert.ok(Number(r.headers.get('retry-after')) > 0)
  const st = await (await fetch(base + '/ai/status', { headers: { authorization: 'Bearer user-a' } })).json()
  assert.equal(st.available, false)
  assert.equal(store.rows.size, 0)
}

// ── 백엔드: 직접 URL + 토큰 ──
{
  const { base } = await proxy({}, directBackend(ollamaUrl, 'ollama-secret'))
  assert.equal((await call(base, '/ai/assistant', { messages: msg('t') })).status, 200)
  assert.equal(authHeaders.at(-1), 'Bearer ollama-secret')
  assert.equal(backendFromEnv({ OLLAMA_URL: ollamaUrl }).name, 'direct')
  assert.equal(backendFromEnv({ AI_WORKER_TOKEN: 'x'.repeat(32) }).name, 'worker')
  assert.throws(() => backendFromEnv({ AI_BACKEND: 'worker', AI_WORKER_TOKEN: 'short' }))
}

// ── 백엔드: Mac mini 워커가 당겨 가기 ──
{
  const token = 'worker-secret-0123456789'
  const backend = workerBackend({ token, pollMs: 300, staleMs: 600, pickupMs: 800 })
  const { base, ai, store } = await proxy({ concurrency: 1, timeoutMs: 1500 }, backend)
  const status = async () => (await fetch(base + '/ai/status', { headers: { authorization: 'Bearer user-a' } })).json()

  // 워커 없음 → 503 "지금은 AI를 쓸 수 없어요"
  assert.equal((await status()).available, false)
  let r = await call(base, '/ai/assistant', { messages: msg('x') })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error, '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.')
  // 워커 경로는 워커 비밀로만
  r = await fetch(base + '/ai/worker/poll', { method: 'POST', headers: { authorization: 'Bearer user-a' }, body: '{}' })
  assert.equal(r.status, 401)
  r = await fetch(base + '/ai/worker/poll', { method: 'POST', body: '{}' })
  assert.equal(r.status, 401)

  // 워커 시작 → 모델 목록이 워커를 통해 보인다
  const workerLogs: string[] = []
  const worker = startWorker({ apiUrl: base, token, ollamaUrl, slots: 2, name: 'test', log: (l) => workerLogs.push(l) })
  for (let i = 0; i < 50 && !(await status()).available; i++) await tick(20)
  const st = await status()
  assert.equal(st.available, true)
  assert.equal(st.backend, 'worker')
  assert.deepEqual(st.models, ['qwen3.5:9b', 'llama3:8b'])

  // 한 번에 받기
  r = await call(base, '/ai/classify', { messages: msg('워커'), format: { type: 'object' } })
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.message.content, '답:워커')
  assert.equal(bodies.at(-1).options.num_predict, 700)
  assert.deepEqual(bodies.at(-1).format, { type: 'object' })
  // 스트림 + 대기 순서
  const pa = call(base, '/ai/assistant', { messages: msg('gate:w1') }, 'user-a')
  await tick(80)
  const pb = call(base, '/ai/assistant', { messages: msg('w2'), stream: true }, 'user-b')
  await tick(80)
  assert.equal(ai.queue.waiting.length, 1)
  await openGate('w1')
  assert.equal((await (await pa).json()).message.content, '답:gate:w1')
  const lines = await ndjson(await pb)
  assert.deepEqual(lines[0], { queue: { position: 1, waiting: 1 } })
  assert.equal(lines.filter((l) => l.message).map((l) => l.message.content).join(''), '답:w2')
  assert.equal(lines.at(-1).done, true)

  // 앱이 끊으면 워커 → Ollama까지 멈춘다
  const ctl = new AbortController()
  r = await call(base, '/ai/assistant', { messages: msg('slowstream'), stream: true }, 'user-c', ctl.signal)
  const reader = r.body!.getReader()
  let got = ''
  while (!got.includes('답:')) got += new TextDecoder().decode((await reader.read()).value)
  aborted.length = 0
  ctl.abort()
  for (let i = 0; i < 50 && !aborted.includes('slowstream'); i++) await tick(20)
  assert.ok(aborted.includes('slowstream'), '워커가 Ollama 요청을 멈춘다')

  // 시간 초과 → 504, Ollama도 멈춘다. 그 뒤에도 워커는 계속 일한다
  aborted.length = 0
  r = await call(base, '/ai/assistant', { messages: msg('hang') }, 'user-d')
  assert.equal(r.status, 504)
  for (let i = 0; i < 50 && !aborted.includes('hang'); i++) await tick(20)
  assert.ok(aborted.includes('hang'))
  assert.equal((await call(base, '/ai/assistant', { messages: msg('again') }, 'user-e')).status, 200)
  // Ollama 오류 → 503, 사용량은 되돌린다
  r = await call(base, '/ai/kpi-draft', { messages: msg('fail') }, 'user-f')
  assert.equal(r.status, 503)
  assert.equal((await call(base, '/ai/kpi-draft', { messages: msg('k') }, 'user-f')).status, 200)

  // 원문은 저장소에도, 워커 로그에도 없다
  const dump = JSON.stringify([...store.rows.values(), store.calls, workerLogs])
  for (const secret of ['워커', 'gate:', 'w2', 'slowstream', 'again']) assert.ok(!dump.includes(secret), secret)

  // 워커가 멈추면 곧 "쓸 수 없음"
  await worker.stop()
  await tick(700)
  assert.equal((await status()).available, false)
  r = await call(base, '/ai/assistant', { messages: msg('x') }, 'user-g')
  assert.equal(r.status, 503)
}
// Mac mini의 Ollama가 꺼져 있으면 워커는 붙어도 "쓸 수 없음"
{
  const token = 'worker-secret-0123456789'
  const { base } = await proxy({}, workerBackend({ token, pollMs: 300 }))
  const dead = createServer()
  const deadUrl = await listen(dead)
  await close(dead)
  const worker = startWorker({ apiUrl: base, token, ollamaUrl: deadUrl, log: () => {} })
  await tick(200)
  const r = await call(base, '/ai/assistant', { messages: msg('x') })
  assert.equal(r.status, 503)
  await worker.stop()
}

// Postgres 저장소: SQL·매개변수에 숫자·id·날짜만
{
  const seen: { sql: string; params: unknown[] }[] = []
  const pg = pgUsageStore(async (sql, params) => { seen.push({ sql, params }); return { rows: [{ n: 2 }] } })
  assert.equal(await pg.count('u1', '2026-10-05', 'kpi-draft'), 2)
  await pg.add('u1', 'assistant', '2026-10-07', { requests: 1, prompt_tokens: 3, output_tokens: 4, duration_ms: 5.6 })
  assert.deepEqual(seen[1].params, ['u1', 'assistant', '2026-10-07', 1, 0, 3, 4, 5])
  assert.match(seen[1].sql, /ON CONFLICT \(user_id, endpoint, day\)/)
  assert.ok(seen.every((s) => s.params.every((p) => typeof p === 'number' || /^[\w-]+$/.test(String(p)))))
}

// 대기열 단위 시험
{
  const q = new AiQueue(1, 5)
  const order: number[] = []
  const r1 = await q.acquire(new AbortController().signal)
  const ps = [2, 3].map((n) => q.acquire(new AbortController().signal).then((rel) => { order.push(n); return rel }))
  r1()
  ;(await ps[0])()
  ;(await ps[1])()
  assert.deepEqual(order, [2, 3])
  assert.equal(q.running, 0)
}

for (const s of servers) await close(s)
await close(ollama)
console.log('ai: ok')
