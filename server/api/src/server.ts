// sprout Node API
//   POST /auth/signup  {email, password}      → {user, access_token, refresh_token, expires_in}
//   POST /auth/login   {email, password}      → 같음
//   POST /auth/refresh {refresh_token}        → 새 토큰 한 쌍(리프레시 토큰은 매번 바뀐다)
//   POST /auth/logout  {refresh_token}        → 그 세션 삭제
//   GET  /auth/me      (Bearer)               → {user, has_data}
//   GET  /.well-known/jwks.json               → PowerSync가 토큰을 검증할 공개키
//   POST /sync/upload  (Bearer) {batch}       → 기기 변경분을 한 트랜잭션으로 적용
//   GET  /health
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import pg from 'pg'
import {
  hashPassword, hashToken, loadKeys, newRefreshToken, signAccessToken, validEmail, validPassword, verifyAccessToken, verifyPassword
} from './auth.ts'
import { toStatements, UploadError } from './upload.ts'
import { TABLES } from '../../../packages/schema/src/index.ts'

const PORT = Number(process.env.API_PORT ?? 6060)
const ISSUER = process.env.API_ISSUER ?? 'sprout-api'
const ACCESS_TTL = 3600
const REFRESH_DAYS = 60
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const keys = await loadKeys(process.env.KEYS_PATH ?? '/data/keys.json')

// ── 작은 도구 ──
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
async function readJson(req: IncomingMessage, limit = 5_000_000): Promise<any> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new UploadError('body too large', 413)
    chunks.push(c)
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} } catch { throw new UploadError('bad json') }
}
async function userFrom(req: IncomingMessage): Promise<string> {
  const h = req.headers.authorization ?? ''
  if (!h.startsWith('Bearer ')) throw new UploadError('unauthorized', 401)
  try { return await verifyAccessToken(keys, h.slice(7), ISSUER) } catch { throw new UploadError('unauthorized', 401) }
}

// 로그인 시도 제한: IP당 10분에 20회
const attempts = new Map<string, number[]>()
function rateLimit(req: IncomingMessage) {
  const ip = (req.headers['cf-connecting-ip'] as string) ?? req.socket.remoteAddress ?? '?'
  const now = Date.now()
  const list = (attempts.get(ip) ?? []).filter((t) => now - t < 600_000)
  list.push(now)
  attempts.set(ip, list)
  if (list.length > 20) throw new UploadError('too many attempts', 429)
}

async function issue(userId: string, email: string) {
  const refresh = newRefreshToken()
  await pool.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '${REFRESH_DAYS} days')`, [userId, hashToken(refresh)])
  return { user: { id: userId, email }, access_token: await signAccessToken(keys, userId, ISSUER, ACCESS_TTL), refresh_token: refresh, expires_in: ACCESS_TTL }
}

// ── 경로 ──
const routes: Record<string, (req: IncomingMessage) => Promise<[number, unknown]>> = {
  'GET /health': async () => {
    await pool.query('SELECT 1')
    return [200, { ok: true }]
  },
  'GET /.well-known/jwks.json': async () => [200, { keys: [keys.publicJwk] }],

  'POST /auth/signup': async (req) => {
    rateLimit(req)
    const { email, password } = await readJson(req)
    if (!validEmail(email)) throw new UploadError('invalid email')
    if (!validPassword(password)) throw new UploadError('password must be 6-64 characters')
    const normalized = email.trim().toLowerCase()
    const r = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id', [normalized, await hashPassword(password)])
    if (!r.rowCount) throw new UploadError('email already registered', 409)
    return [201, await issue(r.rows[0].id, normalized)]
  },

  'POST /auth/login': async (req) => {
    rateLimit(req)
    const { email, password } = await readJson(req)
    if (!validEmail(email) || typeof password !== 'string') throw new UploadError('invalid credentials', 401)
    const normalized = email.trim().toLowerCase()
    const r = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [normalized])
    if (!r.rowCount || !(await verifyPassword(password, r.rows[0].password_hash))) throw new UploadError('invalid credentials', 401)
    return [200, await issue(r.rows[0].id, normalized)]
  },

  'POST /auth/refresh': async (req) => {
    const { refresh_token } = await readJson(req)
    if (typeof refresh_token !== 'string') throw new UploadError('unauthorized', 401)
    const r = await pool.query(
      `DELETE FROM sessions s USING users u WHERE s.token_hash = $1 AND s.user_id = u.id AND s.expires_at > now() RETURNING u.id, u.email`,
      [hashToken(refresh_token)]
    )
    if (!r.rowCount) throw new UploadError('unauthorized', 401)
    return [200, await issue(r.rows[0].id, r.rows[0].email)]
  },

  'POST /auth/logout': async (req) => {
    const { refresh_token } = await readJson(req)
    if (typeof refresh_token === 'string') await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(refresh_token)])
    return [200, { ok: true }]
  },

  'GET /auth/me': async (req) => {
    const userId = await userFrom(req)
    const u = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId])
    if (!u.rowCount) throw new UploadError('unauthorized', 401)
    // 서버에 이 사용자의 데이터가 이미 있으면, 새 기기는 로컬 시드를 지우고 내려받는다
    const d = await pool.query('SELECT EXISTS (SELECT 1 FROM lists WHERE owner_id = $1) AS has', [userId])
    return [200, { user: u.rows[0], has_data: d.rows[0].has }]
  },

  'POST /sync/upload': async (req) => {
    const userId = await userFrom(req)
    const { batch } = await readJson(req)
    const stmts = toStatements(batch, userId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const s of stmts) await client.query(s.sql, s.params)
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
    return [200, { applied: stmts.length }]
  }
}

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  const handler = routes[`${req.method} ${path}`]
  if (!handler) return send(res, 404, { error: 'not found' })
  try {
    const [status, body] = await handler(req)
    send(res, status, body)
  } catch (e) {
    if (e instanceof UploadError) return send(res, e.status, { error: e.message })
    console.error(req.method, path, e)
    send(res, 500, { error: 'server error' })
  }
}).listen(PORT, () => console.log(`sprout api :${PORT} · tables ${Object.keys(TABLES).length}`))
