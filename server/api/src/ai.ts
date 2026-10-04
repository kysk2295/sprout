// AI 프록시: 앱 → (JWT) → 여기(대기열·상한) → 백엔드(ai-backend.ts: 직접 URL 또는 Mac mini 워커) → Ollama. PRD "AI 사용 원칙"
//   GET  /ai/status                       → 쓸 수 있는지·모델·대기열·내 사용량
//   POST /ai/assistant|classify|map|diary|kpi-draft|weekly-report
//        {messages, format?, model?, stream?, options?: {temperature}}
//        stream=false → {model, message:{role,content}, done, ...숫자}
//        stream=true  → NDJSON: 대기 중 {"queue":{"position":n,"waiting":m}} → Ollama 줄 그대로 → 오류면 {"error","code"}
// 규칙: 동시 실행 수 + 대기열(공용), 사용자별 분·일 상한, 성장 주간 AI(kpi-draft·weekly-report) 주 1+1,
//       컨텍스트 4096·출력 700 토큰·제한 시간, 클라우드·원격 모델 금지. 요청·응답 원문은 저장도 기록도 하지 않는다(숫자만).
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AiBackend } from './ai-backend.ts'

export const ENDPOINTS = ['assistant', 'classify', 'map', 'diary', 'kpi-draft', 'weekly-report'] as const
export type Endpoint = (typeof ENDPOINTS)[number]
const isEndpoint = (s: string): s is Endpoint => (ENDPOINTS as readonly string[]).includes(s)

// ── 설정 (상한 숫자는 [임시] — Mac mini 부하 측정 뒤 정한다) ──
export type AiConfig = {
  defaultModel: string
  allowModels: string[] // 비면 Ollama에 설치된 로컬 모델 전부
  concurrency: number
  queueMax: number
  queueWaitMs: number
  timeoutMs: number
  userConcurrent: number
  perMinute: number
  perDay: number
  weekly: Partial<Record<Endpoint, number>>
  numCtx: number
  numPredict: number
  keepAlive: string
  tzOffsetMin: number
  maxMessages: number
  maxMessageChars: number
  maxTotalChars: number
  maxBodyBytes: number
}

export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig {
  const n = (k: string, d: number) => {
    const v = Number(env[k])
    return env[k] !== undefined && env[k] !== '' && Number.isFinite(v) && v >= 0 ? v : d
  }
  return {
    defaultModel: env.AI_MODEL || 'qwen3.5:9b',
    allowModels: (env.AI_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    concurrency: Math.max(1, n('AI_CONCURRENCY', 1)),
    queueMax: n('AI_QUEUE_MAX', 20),
    queueWaitMs: n('AI_QUEUE_WAIT_MS', 180_000),
    timeoutMs: n('AI_TIMEOUT_MS', 120_000),
    userConcurrent: Math.max(1, n('AI_USER_CONCURRENT', 2)),
    perMinute: n('AI_USER_PER_MINUTE', 6),
    perDay: n('AI_USER_PER_DAY', 100),
    weekly: { 'kpi-draft': n('AI_WEEKLY_KPI_DRAFT', 1), 'weekly-report': n('AI_WEEKLY_REPORT', 1) },
    numCtx: n('AI_NUM_CTX', 4096),
    numPredict: n('AI_NUM_PREDICT', 700),
    keepAlive: env.AI_KEEP_ALIVE || '5m',
    tzOffsetMin: n('AI_TZ_OFFSET_MIN', 540), // 한국 시각. 날짜·주(월요일 시작) 경계
    maxMessages: n('AI_MAX_MESSAGES', 30),
    maxMessageChars: n('AI_MAX_MESSAGE_CHARS', 30_000),
    maxTotalChars: n('AI_MAX_TOTAL_CHARS', 60_000),
    maxBodyBytes: n('AI_MAX_BODY_BYTES', 256 * 1024)
  }
}

// ── 오류: 한국어 한 가지 문구 + 코드 ──
const MESSAGES = {
  unauthorized: [401, '로그인이 필요해요.'],
  not_found: [404, '없는 AI 기능이에요.'],
  bad_request: [400, '요청 형식이 올바르지 않아요.'],
  model: [400, '쓸 수 있는 모델이 아니에요.'],
  too_large: [413, '요청이 너무 커요. 내용을 줄여 주세요.'],
  user_busy: [429, '이미 처리 중인 AI 요청이 있어요. 끝난 뒤 다시 시도해 주세요.'],
  rate_minute: [429, 'AI 요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.'],
  rate_day: [429, '오늘 AI 사용 한도를 다 썼어요. 내일 다시 시도해 주세요.'],
  weekly: [429, '이번 주에는 이미 사용했어요. 다음 주 월요일에 다시 쓸 수 있어요.'],
  queue_full: [503, '지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.'],
  queue_timeout: [503, '지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.'],
  unavailable: [503, '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.'],
  timeout: [504, 'AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.'],
  aborted: [499, '요청이 취소됐어요.'],
  server: [500, '서버 오류가 났어요. 잠시 뒤 다시 시도해 주세요.']
} as const
export type AiCode = keyof typeof MESSAGES

export class AiError extends Error {
  code: AiCode
  status: number
  retryAfter?: number
  constructor(code: AiCode, retryAfter?: number) {
    super(MESSAGES[code][1])
    this.code = code
    this.status = MESSAGES[code][0]
    if (retryAfter !== undefined) this.retryAfter = Math.max(1, Math.ceil(retryAfter))
  }
}

// ── 날짜(설정한 시간대 기준) ──
const DAY = 86_400_000
export function dayKey(ms: number, offMin: number) { return new Date(ms + offMin * 60_000).toISOString().slice(0, 10) }
/** 이번 주 월요일 날짜 */
export function weekKey(ms: number, offMin: number) {
  const dow = (new Date(ms + offMin * 60_000).getUTCDay() + 6) % 7
  return dayKey(ms - dow * DAY, offMin)
}
const localMidnight = (ms: number, offMin: number) => Math.floor((ms + offMin * 60_000) / DAY) * DAY - offMin * 60_000
const secsToNextDay = (ms: number, off: number) => (localMidnight(ms, off) + DAY - ms) / 1000
const secsToNextWeek = (ms: number, off: number) => {
  const dow = (new Date(ms + off * 60_000).getUTCDay() + 6) % 7
  return (localMidnight(ms, off) + (7 - dow) * DAY - ms) / 1000
}

// ── 사용량 저장: 숫자만. 원문을 받는 자리가 아예 없다 ──
export type UsageDelta = { requests?: number; failures?: number; prompt_tokens?: number; output_tokens?: number; duration_ms?: number }
export interface UsageStore {
  /** fromDay(포함) 이후 requests 합. endpoint를 주면 그것만 */
  count(userId: string, fromDay: string, endpoint?: Endpoint): Promise<number>
  add(userId: string, endpoint: Endpoint, day: string, delta: UsageDelta): Promise<void>
}

type Query = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>
export function pgUsageStore(query: Query): UsageStore {
  const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0)
  return {
    async count(userId, fromDay, endpoint) {
      const r = endpoint
        ? await query('SELECT COALESCE(SUM(requests), 0)::int AS n FROM ai_usage WHERE user_id = $1 AND day >= $2 AND endpoint = $3', [userId, fromDay, endpoint])
        : await query('SELECT COALESCE(SUM(requests), 0)::int AS n FROM ai_usage WHERE user_id = $1 AND day >= $2', [userId, fromDay])
      return Number(r.rows[0]?.n ?? 0)
    },
    async add(userId, endpoint, day, d) {
      await query(
        `INSERT INTO ai_usage (user_id, endpoint, day, requests, failures, prompt_tokens, output_tokens, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, endpoint, day) DO UPDATE SET
           requests = GREATEST(0, ai_usage.requests + EXCLUDED.requests),
           failures = ai_usage.failures + EXCLUDED.failures,
           prompt_tokens = ai_usage.prompt_tokens + EXCLUDED.prompt_tokens,
           output_tokens = ai_usage.output_tokens + EXCLUDED.output_tokens,
           duration_ms = ai_usage.duration_ms + EXCLUDED.duration_ms,
           updated_at = now()`,
        [userId, endpoint, day, int(d.requests), int(d.failures), int(d.prompt_tokens), int(d.output_tokens), int(d.duration_ms)]
      )
    }
  }
}

/** 시험·개발용 */
export function memoryUsageStore() {
  const rows = new Map<string, Required<UsageDelta> & { userId: string; endpoint: Endpoint; day: string }>()
  const calls: unknown[] = []
  const store: UsageStore & { rows: typeof rows; calls: unknown[] } = {
    rows,
    calls,
    async count(userId, fromDay, endpoint) {
      calls.push(['count', userId, fromDay, endpoint])
      let n = 0
      for (const r of rows.values()) if (r.userId === userId && r.day >= fromDay && (!endpoint || r.endpoint === endpoint)) n += r.requests
      return n
    },
    async add(userId, endpoint, day, d) {
      calls.push(['add', userId, endpoint, day, d])
      const k = `${userId}|${endpoint}|${day}`
      const r = rows.get(k) ?? { userId, endpoint, day, requests: 0, failures: 0, prompt_tokens: 0, output_tokens: 0, duration_ms: 0 }
      r.requests = Math.max(0, r.requests + (d.requests ?? 0))
      r.failures += d.failures ?? 0
      r.prompt_tokens += d.prompt_tokens ?? 0
      r.output_tokens += d.output_tokens ?? 0
      r.duration_ms += d.duration_ms ?? 0
      rows.set(k, r)
    }
  }
  return store
}

// ── 대기열: 모든 사용자가 같은 Mac mini를 나눠 쓴다. 들어온 순서대로 ──
type Waiter = { start: () => void; onPosition?: (position: number, waiting: number) => void }
export class AiQueue {
  running = 0
  waiting: Waiter[] = []
  concurrency: number
  max: number
  constructor(concurrency: number, max: number) {
    this.concurrency = concurrency
    this.max = max
  }
  get full() { return this.running >= this.concurrency && this.waiting.length >= this.max }
  /** 차례가 오면 release 함수를 돌려준다. signal이 끊기면 줄에서 빠진다 */
  acquire(signal: AbortSignal, onPosition?: Waiter['onPosition']): Promise<() => void> {
    if (signal.aborted) return Promise.reject(signal.reason)
    if (this.running < this.concurrency && !this.waiting.length) {
      this.running++
      return Promise.resolve(this.releaser())
    }
    if (this.waiting.length >= this.max) return Promise.reject(new AiError('queue_full', 10))
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const i = this.waiting.indexOf(entry)
        if (i >= 0) this.waiting.splice(i, 1)
        reject(signal.reason)
        this.notify()
      }
      const entry: Waiter = {
        onPosition,
        start: () => {
          signal.removeEventListener('abort', onAbort)
          this.running++
          resolve(this.releaser())
        }
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.waiting.push(entry)
      onPosition?.(this.waiting.length, this.waiting.length)
    })
  }
  private releaser() {
    let done = false
    return () => {
      if (done) return
      done = true
      this.running--
      while (this.running < this.concurrency && this.waiting.length) this.waiting.shift()!.start()
      this.notify()
    }
  }
  private notify() { this.waiting.forEach((w, i) => w.onPosition?.(i + 1, this.waiting.length)) }
}

// ── 요청 검사 ──
type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

/** qwen3.5 + think:false(Ollama 0.31 실측, 2026-10-05)는 format 스키마를 강제하지 않고 그냥 문장으로 답한다.
 *  생각을 켜면 형식은 지키지만 700토큰을 생각에 다 써서 빈 답이 된다 → 생각은 끈 채로 지시문에 모양을 직접 적는다(format도 그대로 넘긴다) */
export function withFormatHint(messages: Msg[], format: AiInput['format']): Msg[] {
  if (format === undefined) return messages
  const hint = format === 'json'
    ? 'Reply with ONE JSON value only. No prose, no markdown code fences, no explanation.'
    : `Reply with ONE JSON value only. No prose, no markdown code fences, no explanation. It must match this JSON Schema exactly (all required keys, allowed enum values only):\n${JSON.stringify(format)}`
  const [first, ...rest] = messages
  return first?.role === 'system' ? [{ ...first, content: `${first.content}\n\n${hint}` }, ...rest] : [{ role: 'system', content: hint }, ...messages]
}
export type AiInput = { messages: Msg[]; format?: 'json' | Record<string, unknown>; model?: string; stream: boolean; temperature: number }
const ROLES = new Set(['system', 'user', 'assistant'])
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function validateInput(body: unknown, cfg: AiConfig): AiInput {
  if (!isObj(body) || !Array.isArray(body.messages) || !body.messages.length) throw new AiError('bad_request')
  if (body.messages.length > cfg.maxMessages) throw new AiError('too_large')
  let total = 0
  const messages: Msg[] = body.messages.map((m: unknown) => {
    if (!isObj(m) || typeof m.role !== 'string' || !ROLES.has(m.role) || typeof m.content !== 'string') throw new AiError('bad_request')
    if (m.content.length > cfg.maxMessageChars) throw new AiError('too_large')
    total += m.content.length
    return { role: m.role as Msg['role'], content: m.content } // images 등 다른 칸은 버린다
  })
  if (total > cfg.maxTotalChars) throw new AiError('too_large')
  let format: AiInput['format']
  if (body.format !== undefined && body.format !== null) {
    if (body.format !== 'json' && !isObj(body.format)) throw new AiError('bad_request')
    if (JSON.stringify(body.format).length > 20_000) throw new AiError('too_large')
    format = body.format as AiInput['format']
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || !body.model || body.model.length > 200)) throw new AiError('bad_request')
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new AiError('bad_request')
  let temperature = 0
  if (body.options !== undefined) {
    if (!isObj(body.options)) throw new AiError('bad_request')
    const t = body.options.temperature
    if (t !== undefined && (typeof t !== 'number' || !(t >= 0 && t <= 2))) throw new AiError('bad_request')
    if (typeof t === 'number') temperature = t
  }
  return { messages, format, model: body.model as string | undefined, stream: body.stream === true, temperature }
}

/** Ollama /api/tags에서 쓸 수 있는 로컬 모델만(데스크톱 localModels와 같은 기준) */
export function localModelNames(tags: any, allow: string[] = []): string[] {
  const list = Array.isArray(tags?.models) ? tags.models : []
  return list
    .filter((m: any) => typeof m?.name === 'string' && !m.remote_host && !m.remote_model && !/cloud/i.test(m.name) && (!m.capabilities || m.capabilities.includes('completion')) && !/bert/i.test(m.details?.family ?? ''))
    .map((m: any) => m.name as string)
    .filter((name: string) => !allow.length || allow.includes(name))
}

async function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  if (Number(req.headers['content-length'] ?? 0) > limit) throw new AiError('too_large')
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new AiError('too_large')
    chunks.push(c)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new AiError('bad_request') }
}

// ── 본체 ──
export type AiDeps = {
  config: AiConfig
  store: UsageStore
  /** Ollama까지 나르는 방법(ai-backend.ts: direct | worker) */
  backend: AiBackend
  /** JWT 확인 → 사용자 id. 실패하면 던진다 */
  auth: (req: IncomingMessage) => Promise<string>
  now?: () => number
  log?: (line: string) => void
}

export function createAi(deps: AiDeps) {
  const cfg = deps.config
  const now = deps.now ?? Date.now
  const log = deps.log ?? ((l: string) => console.error(l))
  const queue = new AiQueue(cfg.concurrency, cfg.queueMax)
  const minute = new Map<string, number[]>()
  const inflight = new Map<string, number>()
  const locks = new Map<string, Promise<unknown>>()

  // 같은 사용자의 상한 확인 + 예약을 한 번에 하나씩(동시 요청으로 주간 상한을 넘지 못하게)
  async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (locks.get(key) ?? Promise.resolve()).then(fn, fn)
    const tail = run.catch(() => {})
    locks.set(key, tail)
    try { return await run } finally { if (locks.get(key) === tail) locks.delete(key) }
  }

  async function models(): Promise<string[]> {
    try {
      return localModelNames(await deps.backend.tags(), cfg.allowModels)
    } catch {
      throw new AiError('unavailable', 30)
    }
  }

  async function reserve(userId: string, endpoint: Endpoint) {
    return withLock(userId, async () => {
      const t = now()
      if ((inflight.get(userId) ?? 0) >= cfg.userConcurrent) throw new AiError('user_busy', 5)
      const recent = (minute.get(userId) ?? []).filter((x) => t - x < 60_000)
      if (recent.length >= cfg.perMinute) throw new AiError('rate_minute', (recent[0] + 60_000 - t) / 1000)
      const day = dayKey(t, cfg.tzOffsetMin)
      if ((await deps.store.count(userId, day)) >= cfg.perDay) throw new AiError('rate_day', secsToNextDay(t, cfg.tzOffsetMin))
      const weeklyCap = cfg.weekly[endpoint]
      if (weeklyCap !== undefined && (await deps.store.count(userId, weekKey(t, cfg.tzOffsetMin), endpoint)) >= weeklyCap) {
        throw new AiError('weekly', secsToNextWeek(t, cfg.tzOffsetMin))
      }
      if (queue.full) throw new AiError('queue_full', 10)
      await deps.store.add(userId, endpoint, day, { requests: 1 })
      recent.push(t)
      minute.set(userId, recent)
      inflight.set(userId, (inflight.get(userId) ?? 0) + 1)
      return day
    })
  }

  function sendError(res: ServerResponse, e: AiError) {
    if (res.destroyed || res.writableEnded) return
    if (res.headersSent) {
      res.end(JSON.stringify({ error: e.message, code: e.code }) + '\n')
      return
    }
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
    if (e.retryAfter) headers['retry-after'] = String(e.retryAfter)
    res.writeHead(e.status, headers)
    res.end(JSON.stringify({ error: e.message, code: e.code, ...(e.retryAfter ? { retry_after: e.retryAfter } : {}) }))
  }

  const toAiError = (e: unknown, fallback: AiCode): AiError => {
    if (e instanceof AiError) return e
    if (e instanceof Error && e.name === 'TimeoutError') return new AiError(fallback === 'unavailable' ? 'timeout' : fallback)
    return new AiError(fallback)
  }

  async function status(req: IncomingMessage, res: ServerResponse) {
    const userId = await deps.auth(req).catch(() => { throw new AiError('unauthorized') })
    let names: string[] = []
    let available = false
    try { names = await models(); available = names.length > 0 } catch { /* 꺼짐 */ }
    const t = now()
    const week = weekKey(t, cfg.tzOffsetMin)
    const weekly: Record<string, { used: number; limit: number }> = {}
    for (const [ep, limit] of Object.entries(cfg.weekly)) weekly[ep] = { used: await deps.store.count(userId, week, ep as Endpoint), limit: limit! }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      available,
      message: available ? null : MESSAGES.unavailable[1],
      models: names,
      default_model: names.includes(cfg.defaultModel) ? cfg.defaultModel : names[0] ?? null,
      backend: deps.backend.name,
      queue: { running: queue.running, waiting: queue.waiting.length, concurrency: cfg.concurrency, max: cfg.queueMax },
      limits: { per_minute: cfg.perMinute, per_day: cfg.perDay, num_ctx: cfg.numCtx, num_predict: cfg.numPredict, timeout_ms: cfg.timeoutMs },
      usage: { today: await deps.store.count(userId, dayKey(t, cfg.tzOffsetMin)), weekly }
    }))
  }

  async function run(endpoint: Endpoint, req: IncomingMessage, res: ServerResponse) {
    const userId = await deps.auth(req).catch(() => { throw new AiError('unauthorized') })
    const input = validateInput(await readBody(req, cfg.maxBodyBytes), cfg)
    const names = await models()
    if (!names.length) throw new AiError('unavailable', 30)
    const model = input.model ?? (names.includes(cfg.defaultModel) ? cfg.defaultModel : names[0])
    if (!names.includes(model)) throw new AiError('model')
    const day = await reserve(userId, endpoint)

    // 클라이언트가 끊으면 대기열에서 빠지고 Ollama 요청도 멈춘다
    const client = new AbortController()
    res.on('close', () => { if (!res.writableFinished) client.abort(new AiError('aborted')) })
    const queuedAt = now()
    let release: (() => void) | undefined
    let ok = false
    const usage: UsageDelta = {}
    const write = (s: string) => { if (!res.destroyed && !res.writableEnded) res.write(s) }
    try {
      if (input.stream) {
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
        res.flushHeaders()
      }
      const onPosition = input.stream
        ? (position: number, waiting: number) => write(JSON.stringify({ queue: { position, waiting } }) + '\n')
        : undefined
      const waitSignal = AbortSignal.any([client.signal, AbortSignal.timeout(cfg.queueWaitMs)])
      release = await queue.acquire(waitSignal, onPosition).catch((e) => {
        throw e instanceof Error && e.name === 'TimeoutError' ? new AiError('queue_timeout', 10) : e
      })
      if (input.stream) write(JSON.stringify({ queue: { position: 0, waiting: queue.waiting.length } }) + '\n')

      const signal = AbortSignal.any([client.signal, AbortSignal.timeout(cfg.timeoutMs)])
      const started = now()
      // 백엔드에는 늘 stream:true로 보낸다(워커 방식도 같은 모양, 끊으면 바로 멈춤). stream:false 요청은 여기서 모아서 준다
      const upstream = await deps.backend.chat({
        model,
        messages: withFormatHint(input.messages, input.format),
        ...(input.format !== undefined ? { format: input.format } : {}),
        stream: true,
        think: false,
        keep_alive: cfg.keepAlive,
        options: { temperature: input.temperature, num_ctx: cfg.numCtx, num_predict: cfg.numPredict }
      }, signal).catch((e) => { throw toAiError(e, 'unavailable') })
      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel().catch(() => {})
        throw new AiError(upstream.status === 404 ? 'model' : 'unavailable', 30)
      }
      const final = (o: any) => {
        usage.prompt_tokens = Number(o?.prompt_eval_count) || 0
        usage.output_tokens = Number(o?.eval_count) || 0
        usage.duration_ms = Math.round(Number(o?.total_duration) / 1e6) || now() - started
      }

      // NDJSON을 줄 단위로 읽는다: 스트림이면 그대로 넘기고, 아니면 내용만 모은다. 마지막 줄(done)에서 숫자만 읽는다
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      let content = ''
      let totalDuration: unknown = null
      const line = (raw: string) => {
        if (!raw.trim()) return
        let item: any
        try { item = JSON.parse(raw) } catch { throw new AiError('unavailable') }
        if (item?.error) throw new AiError('unavailable', 30)
        if (input.stream) write(raw + '\n')
        else if (typeof item?.message?.content === 'string') content += item.message.content
        if (item?.done) { done = true; totalDuration = item.total_duration ?? null; final(item) }
      }
      try {
        while (!done) {
          const chunk = await reader.read().catch((e) => { throw toAiError(e, 'unavailable') })
          if (chunk.done) { buffer += decoder.decode(); line(buffer); break }
          buffer += decoder.decode(chunk.value, { stream: true })
          let end: number
          while ((end = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1) }
        }
      } finally { await reader.cancel().catch(() => {}) }
      if (!done) throw new AiError('unavailable', 30)
      if (input.stream) res.end()
      else {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({
          model, message: { role: 'assistant', content }, done: true,
          prompt_eval_count: usage.prompt_tokens, eval_count: usage.output_tokens, total_duration: totalDuration, queue_wait_ms: started - queuedAt
        }))
      }
      ok = true
    } catch (e) {
      if (client.signal.aborted) throw new AiError('aborted')
      throw toAiError(e, 'server')
    } finally {
      release?.()
      inflight.set(userId, Math.max(0, (inflight.get(userId) ?? 1) - 1))
      if (!inflight.get(userId)) inflight.delete(userId)
      // 실패·중단은 상한에서 되돌린다(주간 1회를 날리지 않게). 숫자만 남긴다
      const delta: UsageDelta = ok ? usage : { requests: -1, failures: 1 }
      await deps.store.add(userId, endpoint, day, delta).catch(() => log(`ai usage write failed (${endpoint})`))
    }
  }

  /** /ai/* 이면 처리하고 true. 그 밖의 경로는 false */
  async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (path !== '/ai' && !path.startsWith('/ai/')) return false
    try {
      if (path.startsWith('/ai/worker/')) {
        if (!(await deps.backend.handle?.(req, res, path))) throw new AiError('not_found')
        return true
      }
      const name = path.slice(4)
      if (name === 'status' && req.method === 'GET') await status(req, res)
      else if (req.method === 'POST' && isEndpoint(name)) await run(name, req, res)
      else throw new AiError('not_found')
    } catch (e) {
      const err = toAiError(e, 'server')
      if (err.code === 'server') log(`ai ${path} error: ${e instanceof Error ? e.name : 'unknown'}`) // 원문·메시지는 남기지 않는다
      sendError(res, err)
    }
    return true
  }

  return { handle, queue, models }
}
