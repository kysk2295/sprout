// sprout AI 워커 — Mac mini에서 돈다. API(Railway 등)로 "바깥으로" 접속해 AI 일을 당겨 가서 로컬 Ollama로 돌리고 결과를 흘려 보낸다.
// Mac mini는 포트를 열 필요가 없다. 의존성 없음(Node 22 fetch만).
//   SPROUT_API_URL   API 주소(https://...)              필수
//   AI_WORKER_TOKEN  API와 같은 비밀(16자 이상)            필수
//   OLLAMA_URL       기본 http://127.0.0.1:11434
//   WORKER_SLOTS     동시에 당겨 올 일 수(API의 AI_CONCURRENCY 이상), 기본 1
//   WORKER_NAME      기본 호스트 이름
// 실행: node --experimental-strip-types --no-warnings worker.ts   (launchd 예시: sprout-ai-worker.plist)
// 요청·응답 원문은 로그에 남기지 않는다.
import { hostname } from 'node:os'

export type WorkerConfig = { apiUrl: string; token: string; ollamaUrl?: string; slots?: number; name?: string; log?: (l: string) => void }

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((r) => {
  const t = setTimeout(r, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); r() }, { once: true })
})

export function startWorker(c: WorkerConfig) {
  const api = c.apiUrl.replace(/\/+$/, '')
  const ollama = (c.ollamaUrl ?? 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const name = c.name ?? hostname()
  const log = c.log ?? ((l: string) => console.log(`${new Date().toISOString()} ${l}`))
  const auth = { authorization: `Bearer ${c.token}` }
  const stopper = new AbortController()
  let tagsCache: { at: number; tags: unknown } | undefined

  // Ollama 모델 목록(10초 캐시). 꺼져 있으면 null → API가 "지금은 쓸 수 없어요"
  async function tags() {
    if (tagsCache && Date.now() - tagsCache.at < 10_000) return tagsCache.tags
    let value: unknown = null
    try {
      const r = await fetch(`${ollama}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (r.ok) value = await r.json()
    } catch { /* 꺼짐 */ }
    tagsCache = { at: Date.now(), tags: value }
    return value
  }

  async function runJob(job: { id: string; body: Record<string, unknown> }) {
    const ctl = new AbortController()
    const stop = () => ctl.abort()
    stopper.signal.addEventListener('abort', stop, { once: true })
    const pipe = new TransformStream<Uint8Array, Uint8Array>()
    const writer = pipe.writable.getWriter()
    // 결과 POST를 먼저 연다. 서버가 이 연결을 끊으면(앱이 취소·시간 초과) Ollama도 멈춘다
    const post = fetch(`${api}/ai/worker/result/${encodeURIComponent(job.id)}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/x-ndjson' },
      body: pipe.readable,
      duplex: 'half',
      signal: ctl.signal
    } as RequestInit).then((r) => { if (!r.ok) ctl.abort() }, () => ctl.abort())
    const started = Date.now()
    try {
      // 빈 줄 하나로 결과 연결을 바로 연다(서버가 "받았음"을 알고, 취소를 전할 수 있게). 빈 줄은 무시된다
      await writer.write(new TextEncoder().encode('\n'))
      const r = await fetch(`${ollama}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...job.body, stream: true }),
        signal: ctl.signal
      })
      if (!r.ok || !r.body) {
        await r.body?.cancel().catch(() => {})
        await writer.write(new TextEncoder().encode(JSON.stringify({ error: `ollama ${r.status}` }) + '\n'))
      } else {
        for await (const chunk of r.body) await writer.write(chunk)
      }
      log(`job done ${Date.now() - started}ms`)
    } catch {
      if (!ctl.signal.aborted) await writer.write(new TextEncoder().encode('{"error":"ollama unavailable"}\n')).catch(() => {})
      log(ctl.signal.aborted ? 'job cancelled' : 'job failed')
    } finally {
      await writer.close().catch(() => {})
      await post
      stopper.signal.removeEventListener('abort', stop)
    }
  }

  async function loop(slot: number) {
    let backoff = 1000
    while (!stopper.signal.aborted) {
      try {
        const r = await fetch(`${api}/ai/worker/poll`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ worker: `${name}#${slot}`, tags: await tags() }),
          signal: AbortSignal.any([stopper.signal, AbortSignal.timeout(60_000)])
        })
        if (r.status === 401) { log('토큰이 맞지 않아요(AI_WORKER_TOKEN)'); await sleep(60_000, stopper.signal); continue }
        if (!r.ok) throw new Error(`poll ${r.status}`)
        const { job } = (await r.json()) as { job: { id: string; body: Record<string, unknown> } | null }
        backoff = 1000
        if (job) await runJob(job)
      } catch {
        if (stopper.signal.aborted) break
        await sleep(backoff, stopper.signal)
        backoff = Math.min(backoff * 2, 30_000)
      }
    }
  }

  const loops = Array.from({ length: Math.max(1, c.slots ?? 1) }, (_, i) => loop(i))
  log(`sprout ai worker ${name} → ${api} (ollama ${ollama}, slots ${loops.length})`)
  return { stop: async () => { stopper.abort(); await Promise.all(loops) } }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { SPROUT_API_URL, AI_WORKER_TOKEN } = process.env
  if (!SPROUT_API_URL || !AI_WORKER_TOKEN) {
    console.error('SPROUT_API_URL, AI_WORKER_TOKEN이 필요해요')
    process.exit(1)
  }
  const w = startWorker({ apiUrl: SPROUT_API_URL, token: AI_WORKER_TOKEN, ollamaUrl: process.env.OLLAMA_URL, slots: Number(process.env.WORKER_SLOTS) || 1, name: process.env.WORKER_NAME })
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void w.stop().then(() => process.exit(0)) })
}
