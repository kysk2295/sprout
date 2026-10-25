// 28 §10 v7 일기 사진 한 장: 사진 바이트를 서버 전용 표 media에 둔다(동기화 안 함, DB 백업에 들어감).
//   POST   /media        (Bearer, 본문 = 이미지 바이트 image/jpeg|png|webp, 3MB) → 201 {id, size}. 하루 10장(사용자 시간대 무관, UTC 하루)
//   GET    /media/:id    (Bearer, 내 것만) → 이미지. 바뀌지 않으므로 오래 캐시
//   DELETE /media/:id    (Bearer, 내 것만) → 204
// 그날 사진 목록은 동기화 표 diary_photos(media_id). 어디서도 가리키지 않는 사진은 하루 뒤 정리(cleanup, 하루 한 번).
import type { IncomingMessage, ServerResponse } from 'node:http'

export const MEDIA_MAX = 3_000_000
export const MEDIA_DAILY = Number(process.env.MEDIA_DAILY ?? 10)
const MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const
type Mime = (typeof MIMES)[number]
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 파일 머리로 형식 확인(올린 쪽이 말한 content-type과 같아야) */
export function sniff(b: Buffer): Mime | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

export type MediaStore = {
  countToday(owner: string): Promise<number>
  insert(owner: string, mime: string, bytes: Buffer): Promise<string>
  get(owner: string, id: string): Promise<{ mime: string; bytes: Buffer } | null>
  remove(owner: string, id: string): Promise<boolean>
  /** 하루 넘게 어떤 diary_photos도 가리키지 않는 사진 지우기 → 지운 수 */
  cleanup(): Promise<number>
}

class HttpError extends Error {
  status: number
  constructor(msg: string, status: number) { super(msg); this.status = status }
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > limit) throw new HttpError('body too large', 413)
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks)
}

export function createMedia(o: { store: MediaStore; auth: (req: IncomingMessage) => Promise<string>; log?: (s: string) => void }) {
  const log = o.log ?? ((s: string) => console.log(`[media] ${s}`))
  async function route(req: IncomingMessage, path: string): Promise<[number, unknown, Record<string, string>?, Buffer?]> {
    const owner = await o.auth(req)
    if (req.method === 'POST' && path === '/media') {
      const said = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (!(MIMES as readonly string[]).includes(said)) throw new HttpError('unsupported type', 415)
      const body = await readBody(req, MEDIA_MAX)
      if (!body.length) throw new HttpError('empty', 400)
      const real = sniff(body)
      if (!real || real !== said) throw new HttpError('bad image', 400)
      if ((await o.store.countToday(owner)) >= MEDIA_DAILY) throw new HttpError('daily limit', 429)
      const id = await o.store.insert(owner, real, body)
      return [201, { id, size: body.length }]
    }
    const m = path.match(/^\/media\/([^/]+)$/)
    if (!m || !ID.test(m[1])) throw new HttpError('not found', 404)
    if (req.method === 'GET') {
      const r = await o.store.get(owner, m[1].toLowerCase())
      if (!r) throw new HttpError('not found', 404)
      return [200, null, { 'content-type': r.mime, 'cache-control': 'private, max-age=31536000, immutable', 'content-length': String(r.bytes.length) }, r.bytes]
    }
    if (req.method === 'DELETE') {
      await o.store.remove(owner, m[1].toLowerCase())
      return [204, null]
    }
    throw new HttpError('not found', 404)
  }
  async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (path !== '/media' && !path.startsWith('/media/')) return false
    try {
      const [s, body, headers, bytes] = await route(req, path)
      if (bytes) { res.writeHead(s, headers); res.end(bytes) }
      else if (s === 204) { res.writeHead(204); res.end() }
      else { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    } catch (e) {
      const status = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : 500
      if (status === 500) log(`${req.method} ${path} 오류 ${(e as Error)?.message}`)
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: status === 500 ? 'server error' : (e as Error).message }))
    }
    return true
  }
  let timer: ReturnType<typeof setInterval> | undefined
  function start() {
    const run = () => void o.store.cleanup().then((n) => { if (n) log(`고아 사진 ${n}장 정리`) }).catch((e) => log(`정리 실패 ${(e as Error).message}`))
    setTimeout(run, 60_000)
    timer = setInterval(run, 24 * 3600_000)
  }
  const stop = () => clearInterval(timer)
  return { handle, start, stop }
}

type Q = (sql: string, params: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>
export function pgMediaStore(query: Q): MediaStore {
  return {
    async countToday(owner) {
      const r = await query("SELECT count(*)::int AS n FROM media WHERE owner_id = $1 AND created_at > now() - interval '1 day'", [owner])
      return r.rows[0]?.n ?? 0
    },
    async insert(owner, mime, bytes) {
      const r = await query('INSERT INTO media (owner_id, mime, bytes, size) VALUES ($1, $2, $3, $4) RETURNING id', [owner, mime, bytes, bytes.length])
      return r.rows[0].id
    },
    async get(owner, id) {
      const r = await query('SELECT mime, bytes FROM media WHERE id = $1 AND owner_id = $2', [id, owner])
      return r.rows[0] ? { mime: r.rows[0].mime, bytes: r.rows[0].bytes } : null
    },
    async remove(owner, id) {
      const r = await query('DELETE FROM media WHERE id = $1 AND owner_id = $2', [id, owner])
      return !!r.rowCount
    },
    async cleanup() {
      const r = await query(`DELETE FROM media m WHERE m.created_at < now() - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM diary_photos p WHERE p.owner_id = m.owner_id AND p.media_id = m.id::text)`, [])
      return r.rowCount ?? 0
    }
  }
}
