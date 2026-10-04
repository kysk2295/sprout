// AI 백엔드: 대기열·상한(ai.ts)을 통과한 요청을 실제 Ollama까지 나르는 방법. 둘 중 하나를 고른다
//   direct — API가 OLLAMA_URL로 바로 부른다(같은 기계·사설망·터널). OLLAMA_TOKEN이 있으면 Bearer로 붙인다
//   worker — Mac mini의 워커(server/ai-worker)가 API로 "바깥으로" 접속해 일을 당겨 간다(Railway → Mac mini로 못 붙을 때)
//            POST /ai/worker/poll           (Bearer AI_WORKER_TOKEN) {worker, tags} → {job:{id, body}} | {job:null} (최대 25초 대기)
//            POST /ai/worker/result/<id>    (Bearer AI_WORKER_TOKEN) Ollama NDJSON을 그대로 흘려 보낸다. 서버가 끊으면 = 취소
// 어느 쪽이든 chat()은 Ollama /api/chat(stream:true)과 같은 NDJSON Response를 돌려준다. 원문은 지나가기만 하고 남기지 않는다
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { AiError } from './ai.ts'

export interface AiBackend {
  name: 'direct' | 'worker'
  /** Ollama /api/tags 응답. 못 쓰면 던진다 */
  tags(): Promise<unknown>
  /** Ollama /api/chat 응답(NDJSON 스트림) */
  chat(body: Record<string, unknown>, signal: AbortSignal): Promise<Response>
  /** 워커용 경로(/ai/worker/*). 처리했으면 true */
  handle?(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean>
}

export function directBackend(url: string, token?: string): AiBackend {
  const base = url.replace(/\/+$/, '')
  const auth: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  let cache: { at: number; tags: unknown } | undefined // 성공한 목록만 30초 기억
  return {
    name: 'direct',
    async tags() {
      if (cache && Date.now() - cache.at < 30_000) return cache.tags
      cache = undefined
      const r = await fetch(`${base}/api/tags`, { headers: auth, signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`tags ${r.status}`)
      cache = { at: Date.now(), tags: await r.json() }
      return cache.tags
    },
    chat: (body, signal) => fetch(`${base}/api/chat`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  }
}

type Job = {
  id: string
  body: Record<string, unknown>
  state: 'pending' | 'claimed' | 'streaming' | 'done'
  resolve: (r: Response) => void
  reject: (e: unknown) => void
  cancel: (reason: unknown) => void
}
type Poller = { res: ServerResponse; timer: NodeJS.Timeout }

export type WorkerOptions = { token: string; pollMs?: number; staleMs?: number; pickupMs?: number; maxResultBytes?: number; now?: () => number }

export function workerBackend(o: WorkerOptions): AiBackend & { connected(): boolean } {
  if (!o.token || o.token.length < 16) throw new Error('AI_WORKER_TOKEN은 16자 이상이어야 해요')
  const pollMs = o.pollMs ?? 25_000
  const staleMs = o.staleMs ?? pollMs + 15_000
  const pickupMs = o.pickupMs ?? 15_000
  const maxResult = o.maxResultBytes ?? 5_000_000
  const now = o.now ?? Date.now
  const secret = Buffer.from(o.token)
  const pending: Job[] = []
  const jobs = new Map<string, Job>()
  const pollers: Poller[] = []
  let lastSeen = 0
  let lastTags: unknown = null

  const authorized = (req: IncomingMessage) => {
    const h = req.headers.authorization ?? ''
    const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '')
    return got.length === secret.length && timingSafeEqual(got, secret)
  }
  // 워커가 붙어 있음 = 기다리는 poll이 있거나, 최근에 poll했거나, 일을 하는 중
  const connected = () => pollers.length > 0 || now() - lastSeen < staleMs || [...jobs.values()].some((j) => j.state !== 'pending')

  function giveTo(p: Poller, job: Job | null) {
    clearTimeout(p.timer)
    pollers.splice(pollers.indexOf(p), 1)
    if (job) job.state = 'claimed'
    p.res.writeHead(200, { 'content-type': 'application/json' })
    p.res.end(JSON.stringify({ job: job ? { id: job.id, body: job.body } : null }))
  }
  function dispatch() {
    while (pending.length) {
      const p = pollers.find((x) => !x.res.destroyed)
      if (!p) return
      giveTo(p, pending.shift()!)
    }
  }

  async function readSmall(req: IncomingMessage) {
    let raw = ''
    for await (const c of req) { raw += c; if (raw.length > 1_000_000) throw new AiError('too_large') }
    try { return raw ? JSON.parse(raw) : {} } catch { throw new AiError('bad_request') }
  }

  async function poll(req: IncomingMessage, res: ServerResponse) {
    const { tags } = await readSmall(req)
    lastSeen = now()
    lastTags = tags ?? null // Mac mini의 Ollama가 꺼져 있으면 워커가 null을 보낸다
    const p: Poller = { res, timer: setTimeout(() => giveTo(p, null), pollMs) }
    pollers.push(p)
    res.on('close', () => {
      clearTimeout(p.timer)
      const i = pollers.indexOf(p)
      if (i >= 0) pollers.splice(i, 1)
      lastSeen = now()
    })
    dispatch()
  }

  async function result(req: IncomingMessage, res: ServerResponse, id: string) {
    const job = jobs.get(id)
    if (!job || job.state !== 'claimed') {
      res.writeHead(410, { 'content-type': 'application/json' })
      res.end('{"error":"gone"}')
      req.resume()
      return
    }
    job.state = 'streaming'
    lastSeen = now()
    let size = 0
    await new Promise<void>((done) => {
      let ctl!: ReadableStreamDefaultController<Uint8Array>
      const stream = new ReadableStream<Uint8Array>({ start: (c) => { ctl = c }, cancel: () => { req.destroy() } })
      const fail = (e: unknown) => { try { ctl.error(e) } catch { /* 이미 닫힘 */ } }
      job.cancel = (reason) => { fail(reason); req.destroy(); res.destroy() } // 시간 초과면 TimeoutError, 앱 취소면 aborted
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > maxResult) { fail(new AiError('unavailable')); req.destroy(); return }
        try { ctl.enqueue(new Uint8Array(c)) } catch { /* 읽는 쪽이 이미 끝남 */ }
      })
      req.on('end', () => {
        try { ctl.close() } catch { /* 이미 닫힘 */ }
        if (!res.headersSent) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}') }
        done()
      })
      req.on('close', () => { if (!req.complete) fail(new AiError('unavailable', 30)); done() })
      job.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }))
    })
    job.state = 'done'
    jobs.delete(id)
    lastSeen = now()
  }

  return {
    name: 'worker',
    connected,
    async tags() {
      if (!connected() || !lastTags) throw new AiError('unavailable', 30)
      return lastTags
    },
    chat(body, signal) {
      if (!connected()) return Promise.reject(new AiError('unavailable', 30))
      if (signal.aborted) return Promise.reject(signal.reason)
      return new Promise<Response>((resolve, reject) => {
        const job: Job = { id: randomUUID(), body, state: 'pending', resolve, reject, cancel: () => {} }
        const finish = () => {
          clearTimeout(pickup)
          signal.removeEventListener('abort', onAbort)
          const i = pending.indexOf(job)
          if (i >= 0) pending.splice(i, 1)
        }
        // 워커가 일정 시간 안에 가져가지 않으면 = 꺼짐
        const pickup = setTimeout(() => {
          if (job.state !== 'pending') return
          finish(); jobs.delete(job.id); reject(new AiError('unavailable', 30))
        }, pickupMs)
        const onAbort = () => { finish(); job.cancel(signal.reason); jobs.delete(job.id); reject(signal.reason) }
        signal.addEventListener('abort', onAbort, { once: true })
        job.resolve = (r) => {
          clearTimeout(pickup)
          // 받은 뒤에도 취소(클라이언트 끊김·시간 초과)는 워커 연결을 끊어서 전한다
          resolve(r)
        }
        jobs.set(job.id, job)
        pending.push(job)
        dispatch()
      })
    },
    async handle(req, res, path) {
      if (!path.startsWith('/ai/worker/')) return false
      if (!authorized(req)) throw new AiError('unauthorized')
      if (req.method === 'POST' && path === '/ai/worker/poll') { await poll(req, res); return true }
      const m = /^\/ai\/worker\/result\/([\w-]{1,64})$/.exec(path)
      if (req.method === 'POST' && m) { await result(req, res, m[1]); return true }
      return false
    }
  }
}

/** 환경 변수로 고른다: AI_BACKEND=worker|direct (생략하면 AI_WORKER_TOKEN이 있으면 worker) */
export function backendFromEnv(env: Record<string, string | undefined> = process.env): AiBackend {
  const kind = env.AI_BACKEND || (env.AI_WORKER_TOKEN ? 'worker' : 'direct')
  if (kind === 'worker') return workerBackend({ token: env.AI_WORKER_TOKEN ?? '', pickupMs: Number(env.AI_WORKER_PICKUP_MS) || undefined })
  return directBackend(env.OLLAMA_URL || 'http://host.docker.internal:11434', env.OLLAMA_TOKEN || undefined)
}
