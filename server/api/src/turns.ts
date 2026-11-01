// 47 §20 서버에서 도는 AI 비서 턴: POST /ai/turn(시작·흘려 보내기) · GET /ai/turn/{id}?after=N(이어 받기) · POST /ai/turn/{id}/cancel.
// 앱이 쓰던 runTurn을 서버가 끝까지 돌린다(turnExec.ts) — 앱 연결이 끊겨도 멈추지 않고, ■ 멈춤·150초 상한만 멈춘다.
// 사건·결과는 메모리에만, 끝난 뒤 10분(TURN_KEEP_MS). 원문은 디스크·로그에 남기지 않는다.
import { fork, type ChildProcess } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseTurnStart, TURN_ID, TURN_KEEP_MS } from '../../../packages/schema/src/assistantTurn.ts'
import { execTurn, type ExecDeps, type TurnSpec } from './turnExec.ts'

/** 턴 하나를 돌린다. emit = 줄 payload, done = 끝(성공·실패 모두 한 번) */
export type TurnRunner = (spec: TurnSpec, emit: (payload: Record<string, unknown>) => void, done: () => void) => { cancel(): void }

/** 같은 프로세스에서(시간대가 같을 때·시험) */
export function inProcessRunner(deps: ExecDeps): TurnRunner {
  return (spec, emit, done) => {
    const abort = new AbortController()
    void execTurn(spec, deps, abort.signal, emit).finally(done)
    return { cancel: () => abort.abort(Object.assign(new Error('stopped'), { name: 'AbortError' })) }
  }
}

export const isTimeZone = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }

/**
 * 사용자 시간대가 이 프로세스와 같으면 같은 프로세스에서, 다르면 그 시간대(TZ)로 띄운 자식(turnWorker.ts)에서.
 * 자식은 시간대마다 하나, 최대 maxChildren(넘으면 가장 오래 안 쓴 빈 자식부터 끔), 30분 안 쓰면 끔.
 */
export function zoneRunner(o: { exec: ExecDeps; workerPath: string; env: NodeJS.ProcessEnv; maxChildren?: number; idleMs?: number; log?: (l: string) => void }): TurnRunner {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone
  const local = inProcessRunner(o.exec)
  const max = o.maxChildren ?? 4
  const idleMs = o.idleMs ?? 30 * 60_000
  type Child = { proc: ChildProcess; jobs: Map<string, { emit: (p: Record<string, unknown>) => void; done: () => void }>; usedAt: number; idle?: NodeJS.Timeout }
  const children = new Map<string, Child>()
  let seq = 0
  const stop = (tz: string, c: Child) => {
    children.delete(tz)
    clearTimeout(c.idle)
    for (const j of c.jobs.values()) { j.emit({ error: '지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.', status: 503 }); j.done() }
    c.jobs.clear()
    if (c.proc.connected) c.proc.disconnect()
  }
  const childFor = (tz: string): Child => {
    const have = children.get(tz)
    if (have && have.proc.connected) return have
    if (children.size >= max) {
      const idle = [...children.entries()].filter(([, c]) => !c.jobs.size).sort((a, b) => a[1].usedAt - b[1].usedAt)[0]
      if (!idle) throw Object.assign(new Error('지금은 AI 비서를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.'), { status: 503 })
      stop(idle[0], idle[1])
    }
    const proc = fork(o.workerPath, [], { env: { ...o.env, TZ: tz }, execArgv: ['--experimental-strip-types', '--no-warnings'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    const c: Child = { proc, jobs: new Map(), usedAt: Date.now() }
    proc.on('message', (m: { type: string; id: string; payload?: Record<string, unknown> }) => {
      const j = c.jobs.get(m.id)
      if (!j) return
      if (m.type === 'line' && m.payload) j.emit(m.payload)
      if (m.type === 'done') { c.jobs.delete(m.id); j.done(); arm(tz, c) }
    })
    proc.on('exit', (code) => { if (children.get(tz) === c) { o.log?.(`ai turn worker exit ${code}`); stop(tz, c) } })
    children.set(tz, c)
    return c
  }
  const arm = (tz: string, c: Child) => {
    clearTimeout(c.idle)
    if (!c.jobs.size) c.idle = setTimeout(() => { if (!c.jobs.size && children.get(tz) === c) stop(tz, c) }, idleMs)
  }
  return (spec, emit, done) => {
    const tz = spec.body.timeZone ?? here
    if (tz === here) return local(spec, emit, done)
    let c: Child
    try { c = childFor(tz) } catch (e) { emit({ error: (e as Error).message, status: 503 }); done(); return { cancel() {} } }
    const id = String(++seq)
    clearTimeout(c.idle)
    c.usedAt = Date.now()
    c.jobs.set(id, { emit, done })
    c.proc.send({ type: 'start', id, spec })
    return { cancel: () => { if (c.proc.connected) c.proc.send({ type: 'cancel', id }) } }
  }
}

export type TurnDeps = {
  /** JWT 확인 → 사용자 id */
  auth: (req: IncomingMessage) => Promise<string>
  run: TurnRunner
  keepMs?: number
  pingMs?: number
  log?: (line: string) => void
}

type Job = { key: string; userId: string; lines: string[]; listeners: Set<(line: string) => void>; done: boolean; cancel: () => void; endedAt?: number }

class HttpError extends Error { status: number; code?: string; constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code } }
const MSG = {
  bad: '잘못된 요청이에요.',
  auth: '로그인이 필요해요.',
  busy: '이미 답을 만드는 중이에요. 끝나면 다시 보내 주세요.',
  gone: '연결이 끊겨서 답을 받지 못했어요. 다시 보내 주세요.'
}
const KEEP_DONE_PER_USER = 3

export function createTurns(deps: TurnDeps) {
  const keepMs = deps.keepMs ?? TURN_KEEP_MS
  const pingMs = deps.pingMs ?? 10_000
  const log = deps.log ?? ((l: string) => console.error(l))
  const jobs = new Map<string, Job>()

  const sweep = (now: number) => {
    for (const [k, j] of jobs) if (j.done && j.endedAt !== undefined && now - j.endedAt > keepMs) jobs.delete(k)
  }
  const finish = (job: Job) => {
    if (job.done) return
    job.done = true
    job.endedAt = Date.now()
    for (const l of job.listeners) l('')
    job.listeners.clear()
    // 끝난 턴은 사용자당 몇 개만
    const mine = [...jobs.values()].filter((j) => j.userId === job.userId && j.done).sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
    for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_DONE_PER_USER))) jobs.delete(old.key)
  }
  const push = (job: Job, payload: Record<string, unknown>) => {
    if (job.done) return
    const line = JSON.stringify({ seq: job.lines.length + 1, ...payload })
    job.lines.push(line)
    for (const l of job.listeners) l(line)
  }

  /** seq after 다음부터 보내고, 아직 돌면 이어서 흘린다. 앱이 끊어도 턴은 멈추지 않는다 */
  function stream(job: Job, res: ServerResponse, after: number) {
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    res.flushHeaders()
    for (const line of job.lines.slice(after)) res.write(line + '\n')
    if (job.done) { res.end(); return }
    const listener = (line: string) => { if (res.writableEnded) return; if (!line) res.end(); else res.write(line + '\n') }
    job.listeners.add(listener)
    // 기다리는 동안 아무 바이트도 없으면 중간 장비·기기가 연결을 끊는다 → 살아 있음 줄
    const ping = setInterval(() => { if (!res.writableEnded) res.write('{"ping":1}\n') }, pingMs)
    res.on('close', () => { clearInterval(ping); job.listeners.delete(listener) })
  }

  const send = (res: ServerResponse, status: number, body: unknown) => {
    if (res.headersSent) { res.end(); return }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
    let size = 0
    const chunks: Buffer[] = []
    for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, MSG.bad, 'bad_request'); chunks.push(c) }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw new HttpError(400, MSG.bad, 'bad_request') }
  }

  /** /ai/turn… 이면 처리하고 true */
  async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (path !== '/ai/turn' && !path.startsWith('/ai/turn/')) return false
    try {
      const userId = await deps.auth(req).catch(() => { throw new HttpError(401, MSG.auth, 'unauthorized') })
      sweep(Date.now())
      if (path === '/ai/turn' && req.method === 'POST') {
        const body = parseTurnStart(await readJson(req, 200_000))
        if (!body || !body.timeZone || !isTimeZone(body.timeZone)) throw new HttpError(400, MSG.bad, 'bad_request')
        const key = `${userId}:${body.turn}`
        let job = jobs.get(key)
        if (!job) {
          if ([...jobs.values()].some((j) => j.userId === userId && !j.done)) throw new HttpError(409, MSG.busy, 'busy')
          const created: Job = { key, userId, lines: [], listeners: new Set(), done: false, cancel: () => {} }
          jobs.set(key, created)
          created.cancel = deps.run({ userId, authorization: String(req.headers.authorization ?? ''), body }, (p) => push(created, p), () => finish(created)).cancel
          job = created
        }
        stream(job, res, 0)
        return true
      }
      const m = /^\/ai\/turn\/([^/]+)(\/cancel)?$/.exec(path)
      if (!m || !TURN_ID.test(m[1])) throw new HttpError(404, MSG.gone, 'not_found')
      const job = jobs.get(`${userId}:${m[1]}`)
      if (!job) throw new HttpError(404, MSG.gone, 'not_found')
      if (m[2] && req.method === 'POST') { if (!job.done) job.cancel(); send(res, 200, { ok: true }); return true }
      if (!m[2] && req.method === 'GET') {
        const after = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('after') ?? 0)
        stream(job, res, Number.isInteger(after) && after >= 0 ? Math.min(after, job.lines.length) : 0)
        return true
      }
      throw new HttpError(404, MSG.gone, 'not_found')
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(500, '서버 오류가 났어요. 잠시 뒤 다시 시도해 주세요.')
      if (!(e instanceof HttpError)) log(`ai turn route error: ${e instanceof Error ? e.name : 'unknown'}`)
      send(res, err.status, { error: err.message, ...(err.code ? { code: err.code } : {}) })
    }
    return true
  }

  return { handle, jobs }
}
