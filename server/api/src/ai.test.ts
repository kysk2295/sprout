// AI 프록시 시험: 가짜 Ollama(로컬 http)로 인증·검사·대기열·상한·시간 초과·원문 미저장을 확인한다
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { aiConfigFromEnv, AiError, AiQueue, createAi, priorityOf, dayKey, COMPANION_RULES, DIARY_GROUNDING, DISTILL_SYSTEM, diaryEndpointOf, formatFor, localModelNames, memoryUsageStore, pgUsageStore, prepareMessages, weekKey, type AiConfig } from './ai.ts'
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
  assert.deepEqual(st.queue, {
    running: 0, waiting: 0, concurrency: 1, max: 20,
    interactive: { running: 0, waiting: 0 },
    background: { running: 0, waiting: 0, concurrency: 1, max: 10 }
  }, '갈래별 길이만(사용자 정보 없음)')
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

// 31 작업 지도 AI 쪼개기: 용도 breakdown, 하루 10회(용도별) + 공용 분·일 상한 그대로, 실패는 세지 않음, 원문 저장 없음, 형식 지시
{
  clock = Date.parse('2026-10-07T03:00:00Z')
  assert.equal(aiConfigFromEnv({}).daily.breakdown, 10)
  assert.equal(aiConfigFromEnv({ AI_DAILY_BREAKDOWN: '3' }).daily.breakdown, 3)
  const { base, store } = await proxy({ daily: { breakdown: 2 } })
  const schema = { type: 'object', properties: { steps: { type: 'array' }, note: { type: 'string' } }, required: ['steps', 'note'] }
  let r = await call(base, '/ai/breakdown', { messages: [{ role: 'system', content: 'split' }, ...msg('졸업 기획서 쪼개기')], format: schema })
  assert.equal(r.status, 200)
  assert.ok(bodies.at(-1).messages[0].content.includes('"required":["steps","note"]'), '다른 용도처럼 지시문에 형식(스키마)을 붙인다')
  assert.deepEqual(bodies.at(-1).format, schema)
  assert.equal((await call(base, '/ai/breakdown', { messages: msg('fail') })).status, 503)
  assert.equal((await call(base, '/ai/breakdown', { messages: msg('b2') })).status, 200, '실패한 1회는 돌려준다')
  r = await call(base, '/ai/breakdown', { messages: msg('b3') })
  assert.equal(r.status, 429)
  const j = await r.json()
  assert.equal(j.code, 'daily')
  assert.equal(j.error, '오늘은 이 AI 기능을 다 썼어요. 내일 다시 쓸 수 있어요.')
  assert.equal(Number(r.headers.get('retry-after')), 12 * 3600, '한국 자정까지')
  assert.equal((await call(base, '/ai/assistant', { messages: msg('a') })).status, 200, '다른 용도는 쪼개기 상한과 무관')
  const st = await (await fetch(base + '/ai/status', { headers: { authorization: 'Bearer user-a' } })).json()
  assert.deepEqual(st.usage.daily.breakdown, { used: 2, limit: 2 })
  const row = [...store.rows.values()].find((x) => x.endpoint === 'breakdown')!
  assert.equal(row.requests, 2)
  assert.equal(row.failures, 1)
  const dump = JSON.stringify([...store.rows.values(), ...store.calls])
  for (const secret of ['졸업', 'split', 'b2', 'steps']) assert.ok(!dump.includes(secret), `저장소에 원문 없음: ${secret}`)
  clock += 13 * 3600_000 // 다음 날
  assert.equal((await call(base, '/ai/breakdown', { messages: msg('b4') })).status, 200)
  // 분 상한은 공용 그대로
  const { base: b2 } = await proxy({ perMinute: 1 })
  assert.equal((await call(b2, '/ai/breakdown', { messages: msg('m1') })).status, 200)
  r = await call(b2, '/ai/breakdown', { messages: msg('m2') })
  assert.equal(r.status, 429)
  assert.equal((await r.json()).code, 'rate_minute')
}

// 33 자동 태그: 용도 tag, 하루 40회(용도별, breakdown과 따로), 출력 상한 1600(용도별), 형식 지시, 원문 저장 없음
{
  clock = Date.parse('2026-10-08T03:00:00Z')
  assert.equal(aiConfigFromEnv({}).daily.tag, 40)
  assert.equal(aiConfigFromEnv({ AI_DAILY_TAG: '5' }).daily.tag, 5)
  assert.equal(aiConfigFromEnv({}).predict?.tag, 1600)
  assert.equal(aiConfigFromEnv({ AI_PREDICT_TAG: '900' }).predict?.tag, 900)
  const { base, store } = await proxy({ daily: { tag: 2, breakdown: 1 }, predict: { tag: 1600 } })
  const schema = { type: 'object', properties: { items: { type: 'array' } }, required: ['items'] }
  let r = await call(base, '/ai/tag', { messages: [{ role: 'system', content: 'tagger' }, ...msg('교수님께 중간 보고 메일')], format: schema })
  assert.equal(r.status, 200)
  assert.equal(bodies.at(-1).options.num_predict, 1600, 'tag는 용도별 출력 상한')
  assert.ok(bodies.at(-1).messages[0].content.includes('"required":["items"]'), '지시문에 형식(스키마)')
  assert.deepEqual(bodies.at(-1).format, schema)
  assert.equal(bodies.at(-1).think, false)
  assert.equal((await call(base, '/ai/breakdown', { messages: msg('b') })).status, 200)
  assert.equal(bodies.at(-1).options.num_predict, 700, '다른 용도는 기본 출력 상한 그대로')
  assert.equal((await call(base, '/ai/tag', { messages: msg('fail') })).status, 503)
  assert.equal((await call(base, '/ai/tag', { messages: msg('t2') })).status, 200, '실패한 1회는 돌려준다')
  r = await call(base, '/ai/tag', { messages: msg('t3') })
  assert.equal(r.status, 429)
  assert.equal((await r.json()).code, 'daily')
  assert.equal((await call(base, '/ai/assistant', { messages: msg('a') })).status, 200, '다른 용도는 태그 상한과 무관')
  const st = await (await fetch(base + '/ai/status', { headers: { authorization: 'Bearer user-a' } })).json()
  assert.deepEqual(st.usage.daily.tag, { used: 2, limit: 2 })
  const row = [...store.rows.values()].find((x) => x.endpoint === 'tag')!
  assert.equal(row.requests, 2)
  assert.equal(row.failures, 1)
  const dump = JSON.stringify([...store.rows.values(), ...store.calls])
  for (const secret of ['교수님', 'tagger', 't2', 'items']) assert.ok(!dump.includes(secret), `저장소에 원문 없음: ${secret}`)
  clock += 13 * 3600_000 // 다음 날
  assert.equal((await call(base, '/ai/tag', { messages: msg('t4') })).status, 200)
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

// ── 우선순위·공정 대기열 ──
// 용도 기본 갈래 + 헤더로는 낮추기만
{
  assert.equal(priorityOf('tag', undefined), 'background')
  assert.equal(priorityOf('map', undefined), 'background')
  assert.equal(priorityOf('tag', 'interactive'), 'background', '헤더로 올릴 수 없다')
  for (const ep of ['assistant', 'classify', 'diary', 'breakdown', 'kpi-draft', 'weekly-report'] as const) assert.equal(priorityOf(ep, undefined), 'interactive', ep)
  assert.equal(priorityOf('classify', 'background'), 'background', '수집함 자동 분류는 앱이 낮춘다')
  assert.equal(priorityOf('assistant', ' Background '), 'background')
  assert.equal(priorityOf('assistant', 'urgent'), 'interactive', '모르는 값은 무시')
  assert.equal(priorityOf('assistant', ['background']), 'background')
  assert.deepEqual(aiConfigFromEnv({}).background, ['tag', 'map'])
  assert.deepEqual(aiConfigFromEnv({ AI_BACKGROUND_PURPOSES: 'tag, nope ,classify' }).background, ['tag', 'classify'])
  const c = aiConfigFromEnv({})
  assert.deepEqual([c.queueMaxBg, c.bgConcurrency, c.userBgConcurrent, c.bgRetryAfter], [10, 1, 1, 60])
  assert.equal(aiConfigFromEnv({ AI_CONCURRENCY: '3' }).bgConcurrency, 2, 'interactive 자리를 하나 남긴다')
  assert.equal(aiConfigFromEnv({ AI_CONCURRENCY: '3', AI_BG_CONCURRENCY: '3' }).bgConcurrency, 3)
}
const sig = () => new AbortController().signal
const take = (q: AiQueue, label: string, user: string, priority: 'interactive' | 'background', order: string[], signal = sig()) =>
  q.acquire(signal, undefined, { user, priority }).then((rel) => { order.push(label); return rel })
// interactive 먼저, background는 그 뒤
{
  const q = new AiQueue(1, 20, { maxBg: 10 })
  const order: string[] = []
  const hold = await q.acquire(sig(), undefined, { user: 'a', priority: 'interactive' })
  const pb1 = take(q, 'bg-b', 'b', 'background', order)
  const pb2 = take(q, 'bg-c', 'c', 'background', order)
  const pi = take(q, 'int-d', 'd', 'interactive', order)
  assert.deepEqual(q.stats().interactive, { running: 1, waiting: 1 })
  assert.deepEqual(q.stats().background, { running: 0, waiting: 2, concurrency: 1, max: 10 })
  hold()
  ;(await pi)()
  ;(await pb1)()
  ;(await pb2)()
  assert.deepEqual(order, ['int-d', 'bg-b', 'bg-c'], '나중에 온 interactive가 먼저')
  assert.equal(q.running, 0)
}
// 같은 갈래 안에서는 사용자별 돌아가며(한 사람이 줄을 세워도 다른 사람이 한 바퀴 안에)
{
  const q = new AiQueue(1, 20)
  const order: string[] = []
  const pos = new Map<string, number[]>()
  const hold = await q.acquire(sig())
  const ps = [['a1', 'a'], ['a2', 'a'], ['a3', 'a'], ['b1', 'b'], ['c1', 'c']].map(([label, user]) =>
    q.acquire(sig(), (p) => pos.set(label, [...(pos.get(label) ?? []), p]), { user, priority: 'interactive' }).then((rel) => { order.push(label); rel() }))
  assert.equal(q.waiting.length, 5)
  assert.deepEqual(pos.get('c1'), [3], 'c는 a의 둘째보다 앞(3번째)')
  assert.deepEqual(pos.get('a3'), [3, 4, 5], '뒤 사람이 끼어들면 순서가 밀린다')
  hold()
  await Promise.all(ps)
  assert.deepEqual(order, ['a1', 'b1', 'c1', 'a2', 'a3'])
  // background도 같은 방식
  const q2 = new AiQueue(1, 20)
  const o2: string[] = []
  const h2 = await q2.acquire(sig())
  const bs = [['x1', 'x'], ['x2', 'x'], ['y1', 'y']].map(([l, u]) => take(q2, l, u, 'background', o2).then((rel) => rel()))
  h2()
  await Promise.all(bs)
  assert.deepEqual(o2, ['x1', 'y1', 'x2'])
}
// background: 사용자당 실행 1개, 전체 background 실행 자리 제한(interactive 자리를 남긴다)
{
  const q = new AiQueue(3, 20, { bgConcurrency: 3, bgPerUser: 1 })
  const order: string[] = []
  const a1 = take(q, 'a1', 'a', 'background', order)
  const a2 = take(q, 'a2', 'a', 'background', order)
  const b1 = take(q, 'b1', 'b', 'background', order)
  await tick(10)
  assert.deepEqual(order, ['a1', 'b1'], '같은 사용자 둘째는 자리가 있어도 기다린다')
  assert.equal(q.running, 2)
  ;(await a1)()
  await tick(10)
  assert.deepEqual(order, ['a1', 'b1', 'a2'])
  ;(await a2)(); (await b1)()
  // 기본 bgConcurrency = concurrency-1 → 동시 2면 background는 1개만, 남은 자리는 interactive가 바로 쓴다
  const q2 = new AiQueue(2, 20)
  const o2: string[] = []
  const x = take(q2, 'x', 'x', 'background', o2)
  const y = take(q2, 'y', 'y', 'background', o2)
  const i = take(q2, 'i', 'i', 'interactive', o2)
  await tick(10)
  assert.deepEqual(o2, ['x', 'i'])
  ;(await x)(); (await i)(); (await y)()
  assert.deepEqual(o2, ['x', 'i', 'y'])
}
// 줄이 차면 interactive가 가장 늦게 온 background를 밀어낸다(bg_deferred + Retry-After), background만 꽉 차면 background 거절
{
  const q = new AiQueue(1, 2, { maxBg: 2, bgRetryAfter: 45 })
  const order: string[] = []
  const hold = await q.acquire(sig(), undefined, { user: 'h' })
  const bx = take(q, 'bx', 'x', 'background', order)
  const by = take(q, 'by', 'y', 'background', order).catch((e) => e)
  await assert.rejects(q.acquire(sig(), undefined, { user: 'z', priority: 'background' }), (e: AiError) => e.code === 'bg_deferred' && e.status === 503 && e.retryAfter === 45)
  assert.equal(q.admitError('interactive'), null, 'background를 밀어낼 수 있으면 interactive는 받는다')
  const i1 = take(q, 'i1', 'i', 'interactive', order)
  const ey = await by
  assert.ok(ey instanceof AiError && ey.code === 'bg_deferred' && ey.retryAfter === 45, '가장 늦게 온 background가 밀려난다')
  const i2 = take(q, 'i2', 'j', 'interactive', order)
  const ex = await bx.catch((e) => e)
  assert.equal((ex as AiError).code, 'bg_deferred')
  assert.equal(q.waitingOf('background'), 0)
  assert.equal(q.full, true)
  await assert.rejects(q.acquire(sig(), undefined, { user: 'k' }), (e: AiError) => e.code === 'queue_full', 'interactive만 꽉 차면 그때 거절')
  hold()
  ;(await i1)(); (await i2)()
  assert.deepEqual(order, ['i1', 'i2'])
  // 대기 중에 끊으면 background 줄에서도 빠진다
  const q3 = new AiQueue(1, 5)
  const h3 = await q3.acquire(sig())
  const ctl = new AbortController()
  const p = q3.acquire(ctl.signal, undefined, { user: 'b', priority: 'background' }).catch(() => 'aborted')
  assert.equal(q3.waitingOf('background'), 1)
  ctl.abort()
  assert.equal(await p, 'aborted')
  assert.equal(q3.waitingOf('background'), 0)
  h3()
  assert.equal(q3.running, 0)
}

// HTTP: 우선순위·헤더·밀어내기·Retry-After
{
  const callH = (base: string, path: string, body: unknown, user: string, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${user}`, ...headers }, body: JSON.stringify(body) })
  const bgHeader = { 'x-sprout-priority': 'background' }
  {
    const { base, ai } = await proxy({ concurrency: 1 })
    started.length = 0
    const p1 = call(base, '/ai/assistant', { messages: msg('gate:p1') }, 'user-a')
    await tick(50)
    const pt = call(base, '/ai/tag', { messages: msg('gate:pt') }, 'user-b') // 기본 background
    await tick(50)
    const pc = callH(base, '/ai/classify', { messages: msg('gate:pc') }, 'user-c', bgHeader) // 헤더로 낮춤
    await tick(50)
    const pd = call(base, '/ai/diary', { messages: msg('gate:pd') }, 'user-d')
    await tick(50)
    const st = await (await fetch(base + '/ai/status', { headers: { authorization: 'Bearer user-a' } })).json()
    assert.deepEqual(st.queue.interactive, { running: 1, waiting: 1 })
    assert.equal(st.queue.background.waiting, 2)
    assert.ok(!JSON.stringify(st.queue).includes('user-'), '대기열 상태에 사용자 정보 없음')
    // 같은 사용자의 background는 1개만(대기 포함) → 429 bg_busy + Retry-After. 헤더로 interactive라 해도 tag는 background
    let r = await callH(base, '/ai/tag', { messages: msg('x') }, 'user-b', { 'x-sprout-priority': 'interactive' })
    assert.equal(r.status, 429)
    assert.equal(Number(r.headers.get('retry-after')), 60)
    const j = await r.json()
    assert.equal(j.code, 'bg_busy')
    assert.equal(j.retry_after, 60)
    assert.match(j.error, /잠시/, '앱의 isUnavailable이 알아듣는 문구(조용히 나중에)')
    r = await callH(base, '/ai/map', { messages: msg('x') }, 'user-b', bgHeader)
    assert.equal((await r.json()).code, 'bg_busy', '용도가 달라도 사용자당 background 1개')
    // background가 있어도 같은 사용자의 interactive는 따로
    const pb = call(base, '/ai/assistant', { messages: msg('gate:pb') }, 'user-b')
    await tick(50)
    for (const g of ['p1', 'pd', 'pb', 'pt', 'pc']) await openGate(g)
    const rs = await Promise.all([p1, pt, pc, pd, pb])
    assert.deepEqual(rs.map((x) => x.status), [200, 200, 200, 200, 200])
    assert.deepEqual(started, ['gate:p1', 'gate:pd', 'gate:pb', 'gate:pt', 'gate:pc'], 'interactive 먼저, background는 들어온 사용자 순')
    assert.equal(ai.queue.running, 0)
    // 끝나면 다시 background를 받는다
    assert.equal((await call(base, '/ai/tag', { messages: msg('again') }, 'user-b')).status, 200)
  }
  {
    // 줄 1칸: 기다리던 background를 interactive가 밀어낸다 → 503 bg_deferred + Retry-After, 사용량·분 상한 되돌림
    const { base, ai, store } = await proxy({ concurrency: 1, queueMax: 1, perMinute: 2, bgRetryAfter: 90 })
    const p1 = call(base, '/ai/assistant', { messages: msg('gate:e1') }, 'user-a')
    await tick(50)
    const pt = call(base, '/ai/tag', { messages: msg('evicted') }, 'user-b')
    await tick(50)
    assert.equal(ai.queue.waitingOf('background'), 1)
    const pi = call(base, '/ai/breakdown', { messages: msg('gate:e2') }, 'user-c')
    const rt = await pt
    assert.equal(rt.status, 503)
    assert.equal(Number(rt.headers.get('retry-after')), 90)
    const jt = await rt.json()
    assert.equal(jt.code, 'bg_deferred')
    assert.equal(jt.retry_after, 90)
    assert.match(jt.error, /잠시/)
    const tagRow = [...store.rows.values()].find((x) => x.endpoint === 'tag')!
    assert.deepEqual([tagRow.requests, tagRow.failures], [0, 1], '밀려난 요청은 상한에서 되돌린다')
    // 줄이 interactive로 차 있으면 background는 바로 503(줄에 서지 않음)
    const r = await callH(base, '/ai/classify', { messages: msg('x') }, 'user-d', bgHeader)
    assert.equal(r.status, 503)
    assert.equal((await r.json()).code, 'bg_deferred')
    await openGate('e1')
    await openGate('e2')
    assert.equal((await p1).status, 200)
    assert.equal((await pi).status, 200)
    // 밀려난 두 번은 분 상한(2)을 쓰지 않았다
    assert.equal((await call(base, '/ai/tag', { messages: msg('t1') }, 'user-b')).status, 200)
    assert.equal((await call(base, '/ai/tag', { messages: msg('t2') }, 'user-b')).status, 200)
    assert.equal((await call(base, '/ai/tag', { messages: msg('t3') }, 'user-b')).status, 429)
  }
  {
    // 스트림으로 기다리다 밀려나면 오류 줄에 retry_after
    const { base } = await proxy({ concurrency: 1, queueMax: 1 })
    const p1 = call(base, '/ai/assistant', { messages: msg('gate:s1') }, 'user-a')
    await tick(50)
    const pt = call(base, '/ai/map', { messages: msg('x'), stream: true }, 'user-b')
    await tick(50)
    const pi = call(base, '/ai/assistant', { messages: msg('y') }, 'user-c')
    const lines = await ndjson(await pt)
    assert.deepEqual(lines.at(-1), { error: '지금은 AI가 바빠서 자동 작업을 미뤘어요. 잠시 뒤 다시 시도해 주세요.', code: 'bg_deferred', retry_after: 60 })
    await openGate('s1')
    assert.equal((await p1).status, 200)
    assert.equal((await pi).status, 200)
  }
  {
    // background 대기 시간 초과도 bg_deferred(재시도 가능)
    const { base } = await proxy({ concurrency: 1, queueWaitMs: 200 })
    const p1 = call(base, '/ai/assistant', { messages: msg('gate:w1') }, 'user-a')
    await tick(50)
    const r = await call(base, '/ai/tag', { messages: msg('x') }, 'user-b')
    assert.equal(r.status, 503)
    assert.equal((await r.json()).code, 'bg_deferred')
    assert.equal(Number(r.headers.get('retry-after')), 60)
    await openGate('w1')
    assert.equal((await p1).status, 200)
  }
}


// 28 §8 일기(사용자 스킬 conversational-journal-to-wiki): chat = 친구 같은 한 턴(하루 30), distill = 1인칭 일기 + 제목 + 태그 JSON(하루 5, polish = 다시 옮기기)
{
  // 지시문 규칙(모양은 packages/schema diaryPrompts.test에서도 본다)
  for (const must of ['<diary>', '지어내', '짐작', '물어봐', '예시']) assert.ok(DIARY_GROUNDING.includes(must), `들은 말만 "${must}"`)
  for (const must of ['보고서', '묻지 않으면 조언하지 마', '형식적', '조언을 바로 멈춰']) assert.ok(COMPANION_RULES.includes(must), `대화 규칙 "${must}"`)
  for (const must of ['지어내지 마', '캐릭터의 말·공감·조언·위로', '1인칭', '#감정/']) assert.ok(DISTILL_SYSTEM.includes(must), `옮기기 "${must}"`)
  const reply = prepareMessages('diary', [{ role: 'system', content: 'APP' }, { role: 'user', content: '<diary>오늘</diary>' }])
  assert.ok(reply[0].content.startsWith('APP') && reply[0].content.endsWith(DIARY_GROUNDING), '예전 답: 앱 지시 뒤에 들은 말만')
  assert.equal(prepareMessages('diary', [{ role: 'user', content: 'x' }])[0].content, DIARY_GROUNDING, 'system이 없으면 맨 앞에')
  const chat = prepareMessages('diary-chat', [{ role: 'system', content: '너는 느리야' }, { role: 'user', content: '시험이 코앞이야' }])
  assert.ok(chat[0].content.startsWith('너는 느리야') && chat[0].content.includes(COMPANION_RULES) && chat[0].content.includes(DIARY_GROUNDING), '대화: 규칙을 꼭 넣는다')
  const already = `너는 느리야\n\n${COMPANION_RULES}\n\n${DIARY_GROUNDING}`
  assert.equal(prepareMessages('diary-chat', [{ role: 'system', content: already }, { role: 'user', content: 'a' }])[0].content, already, '이미 있으면 두 번 붙이지 않음')
  assert.throws(() => prepareMessages('diary-chat', [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]), AiError, '마지막이 사용자 말이어야')
  const dist = prepareMessages('diary-distill', [{ role: 'system', content: '아무 일이나 해 줘' }, { role: 'user', content: '<conversation>\n나: 시험\n</conversation>' }])
  assert.deepEqual(dist, [{ role: 'system', content: DISTILL_SYSTEM }, { role: 'user', content: '<conversation>\n나: 시험\n</conversation>' }], '앱 지시는 버린다')
  assert.throws(() => prepareMessages('diary-distill', [{ role: 'system', content: 's' }]), AiError)
  assert.deepEqual(prepareMessages('assistant', msg('a') as any), msg('a'), '다른 용도는 그대로')
  assert.deepEqual((formatFor('diary-distill', undefined) as any).required, ['title', 'tags', 'entry'])
  assert.equal(formatFor('diary-chat', undefined), undefined)
  assert.equal(diaryEndpointOf({ messages: [] }), 'diary')
  assert.equal(diaryEndpointOf({ mode: 'reply' }), 'diary')
  assert.equal(diaryEndpointOf({ mode: 'chat' }), 'diary-chat')
  assert.equal(diaryEndpointOf({ mode: 'distill' }), 'diary-distill')
  assert.equal(diaryEndpointOf({ mode: 'polish' }), 'diary-distill', '다듬어 줘 = 다시 옮기기')
  assert.throws(() => diaryEndpointOf({ mode: 'free' }), AiError)
  for (const ep of ['diary-chat', 'diary-distill'] as const) assert.equal(priorityOf(ep, undefined), 'interactive')
  assert.equal(aiConfigFromEnv({}).daily['diary-chat'], 30)
  assert.equal(aiConfigFromEnv({}).daily['diary-distill'], 5)
  assert.equal(aiConfigFromEnv({ AI_DAILY_DIARY_CHAT: '10', AI_DAILY_DIARY_DISTILL: '2' }).daily['diary-distill'], 2)

  clock = Date.parse('2026-10-09T03:00:00Z')
  const { base, store } = await proxy({ daily: { ...aiConfigFromEnv({}).daily, 'diary-chat': 2, 'diary-distill': 2 } })
  const distill = (content: string, extra: object = {}) => call(base, '/ai/diary', { mode: 'distill', messages: [{ role: 'system', content: 'APP-SYS' }, { role: 'user', content }], ...extra })
  let r = await distill('기획서 초안 끝냄')
  assert.equal(r.status, 200)
  const sent = bodies.at(-1)
  assert.ok(sent.messages[0].content.startsWith(DISTILL_SYSTEM), '서버 지시(+형식 힌트)')
  assert.ok(!JSON.stringify(sent.messages).includes('APP-SYS'))
  assert.deepEqual(sent.format.required, ['title', 'tags', 'entry'], '형식은 서버 스키마')
  assert.equal((await distill('fail')).status, 503)
  assert.equal((await call(base, '/ai/diary', { mode: 'polish', messages: msg('p2') })).status, 200, '실패한 1회는 돌려준다 · polish도 같은 상한')
  r = await distill('d3', { stream: true })
  assert.equal(r.status, 429)
  const j = await r.json()
  assert.equal(j.code, 'daily')
  assert.equal(j.error, '오늘은 이 AI 기능을 다 썼어요. 내일 다시 쓸 수 있어요.')
  // chat: 따로 세는 하루 상한, 규칙이 붙는다
  const chatCall = (content: string) => call(base, '/ai/diary', { mode: 'chat', stream: true, messages: [{ role: 'system', content: '너는 느리야' }, { role: 'user', content }] })
  r = await chatCall('오늘 산책했다')
  assert.equal(r.status, 200)
  await r.text()
  assert.ok(bodies.at(-1).messages[0].content.includes(COMPANION_RULES))
  assert.equal((await chatCall('c2')).status, 200)
  r = await chatCall('c3')
  assert.equal(r.status, 429)
  assert.equal((await r.json()).code, 'daily')
  // 예전 답(데스크톱)은 두 상한과 무관 + 들은 말만
  r = await call(base, '/ai/diary', { messages: [{ role: 'system', content: 'APP-SYS' }, ...msg('오늘 산책했다')] })
  assert.equal(r.status, 200)
  assert.ok(bodies.at(-1).messages[0].content.includes(DIARY_GROUNDING))
  assert.equal((await call(base, '/ai/diary', { mode: 'zzz', messages: msg('x') })).status, 400)
  for (const p of ['/ai/diary-chat', '/ai/diary-distill']) assert.equal((await call(base, p, { messages: msg('x') })).status, 404, '일기 용도는 /ai/diary mode로만')
  const st = await (await fetch(base + '/ai/status', { headers: { authorization: 'Bearer user-a' } })).json()
  assert.deepEqual(st.usage.daily['diary-distill'], { used: 2, limit: 2 })
  assert.deepEqual(st.usage.daily['diary-chat'], { used: 2, limit: 2 })
  const row = [...store.rows.values()].find((x) => x.endpoint === 'diary-distill')!
  assert.equal(row.requests, 2)
  assert.equal(row.failures, 1)
  const dump = JSON.stringify([...store.rows.values(), ...store.calls])
  for (const secret of ['기획서', 'APP-SYS', '산책', '느리']) assert.ok(!dump.includes(secret), `저장소에 원문 없음: ${secret}`)
  clock += 13 * 3600_000 // 다음 날(한국 자정 넘김)
  assert.equal((await distill('d4')).status, 200)
}

for (const s of servers) await close(s)
await close(ollama)
console.log('ai: ok')
