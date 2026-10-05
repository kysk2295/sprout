// sprout Node API
//   POST /auth/signup  {email, password}      → {user, access_token, refresh_token, expires_in}
//   POST /auth/login   {email, password}      → 같음
//   POST /auth/refresh {refresh_token}        → 새 토큰 한 쌍(리프레시 토큰은 매번 바뀐다)
//   POST /auth/logout  {refresh_token}        → 그 세션 삭제
//   GET  /auth/me      (Bearer)               → {user, has_data, has_password, providers, identities:[{provider, email(가림)}]}
//   DELETE /auth/account (Bearer) {password?} → 계정 삭제(다시 확인: 비밀번호 또는 10분 안에 로그인한 토큰) — account.ts
//   로그인·가입·리프레시·구글·애플은 시도 제한(ratelimit.ts) → 429 + Retry-After
//   GET  /auth/providers                      → 소셜 로그인 설정 여부 {google, apple:{services_id, redirect_uri}|null}
//   POST /auth/google  {id_token, nonce?}     → 같은 토큰 응답 + created (social.ts). nonce 없음 = 모바일 기기 로그인(azp≠aud·10분·한 번만)
//   POST /auth/apple/callback (애플 form_post) → state별로 5분 맡기고 sprout://auth/apple 로 돌려보냄
//   POST /auth/apple   {state, nonce}         → 202 {pending} 또는 토큰 응답 + created
//   POST /auth/apple/native {id_token, nonce, authorization_code?} → iOS 기기 애플 로그인(aud = 번들 id) — 토큰 응답 + created
//   POST /auth/link/apple/native (Bearer) {id_token, nonce, authorization_code?} → 지금 계정에 애플 연결(iOS)
//   POST /auth/link/google (Bearer) {id_token, nonce?} · POST /auth/link/apple (Bearer) {state, nonce}
//                                             → 로그인한 계정에 연결 {linked, identities:[{provider, email(가림)}]} (link.ts, 08 §3.1.1)
//   DELETE /auth/link/google · /auth/link/apple (Bearer) → 연결 해제(로그인할 길이 없어지면 409)
//   GET  /.well-known/jwks.json               → PowerSync가 토큰을 검증할 공개키
//   POST /sync/upload  (Bearer) {batch}       → 기기 변경분을 한 트랜잭션으로 적용. 헤더 X-Sprout-Device(휴대폰 기기 id) → 푸시 효과에서 그 기기는 뺀다
//   PUT/DELETE /push/devices/:id, PUT /push/devices/:id/local, POST /push/test (Bearer) → push.ts (FCM 푸시, 32). /auth/logout {device_id?}도 그 기기 등록을 지운다
//   GET  /health
//   GET  /ai/status, POST /ai/{assistant,classify,map,diary,kpi-draft,weekly-report}  (Bearer) → ai.ts
//   POST /ai/worker/poll, /ai/worker/result/:id  (Bearer AI_WORKER_TOKEN, Mac mini 워커) → ai-backend.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import pg from 'pg'
import {
  hashPassword, hashToken, loadKeys, newRefreshToken, signAccessToken, validEmail, validPassword, verifyAccessClaims, verifyAccessToken, verifyPassword
} from './auth.ts'
import { clientIp, enforce, limitsFromEnv, RateLimiter, RateLimitError, trustFromEnv, type Rule } from './ratelimit.ts'
import { AccountError, deleteAccount } from './account.ts'
import { toStatements, UploadError } from './upload.ts'
import {
  APPLE_JWKS_URL, appleTokenExchange, GOOGLE_JWKS_URL, pgAppleTokenStore, revokeAppleTokens, HandoffStore, appleReturnPage, parseAppleCallback, pgIdentityStore, remoteJwks,
  resolveSocialUser, socialConfigFromEnv, SocialError, STATE_RE, verifyAppleIdToken, verifyGoogleIdToken
} from './social.ts'
import { linkedView, linkIdentity, parseProvider, pgLinkStore, unlinkProvider } from './link.ts'
import { aiConfigFromEnv, createAi, pgUsageStore } from './ai.ts'
import { createPush, pushConfigFromEnv } from './push.ts'
import { pgPushStore } from './push-store.ts'
import { createFcmSender, fcmConfigFromEnv } from './fcm.ts'
import { backendFromEnv } from './ai-backend.ts'
import { TABLES } from '../../../packages/schema/src/index.ts'
import { createUserWithInbox, ensureDefaultInbox, hasData } from './defaultInbox.ts'

const PORT = Number(process.env.API_PORT ?? 6060)
const ISSUER = process.env.API_ISSUER ?? 'sprout-api'
const ACCESS_TTL = 3600
const REFRESH_DAYS = 60
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const keys = await loadKeys(process.env.KEYS_PATH ?? '/data/keys.json')

// ── 작은 도구 ──
const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
async function readText(req: IncomingMessage, limit: number): Promise<string> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new UploadError('body too large', 413)
    chunks.push(c)
  }
  return Buffer.concat(chunks).toString('utf8')
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

// AI 프록시: Mac mini Ollama로 대기열·상한을 걸어 전달한다(원문 저장 없음)
const ai = createAi({ config: aiConfigFromEnv(), backend: backendFromEnv(), store: pgUsageStore((sql, params) => pool.query(sql, params)), auth: userFrom })

// 푸시 알림(32, push.ts): FCM_PROJECT_ID가 비었거나 키가 잘못되면 푸시만 꺼지고 나머지는 그대로 돈다
const pushConfig = pushConfigFromEnv()
const fcm = await fcmConfigFromEnv().catch((e) => { console.error(`[push] FCM 설정 오류 — 푸시 꺼짐: ${(e as Error).message}`); return null })
const pushStore = pgPushStore(pool, pushConfig.ios)
const push = createPush({ config: pushConfig, store: pushStore, sender: fcm ? createFcmSender(fcm) : null, auth: userFrom })

// 시도 제한(ratelimit.ts, 메모리 — API는 한 대). 한도는 RL_* 환경 변수, IP는 TRUST_PROXY 앞단의 X-Forwarded-For만 믿는다(README)
const limiter = new RateLimiter()
const limits = limitsFromEnv()
const trust = trustFromEnv()
const ipOf = (req: IncomingMessage) => clientIp(req, trust)
/** 4xx 실패(틀린 비밀번호·검증 실패 등)만 센다. 서버 오류(5xx)·연결 문제는 사용자 탓이 아니라 세지 않는다 */
const isClientFailure = (e: unknown) => (e instanceof UploadError || e instanceof SocialError || e instanceof AccountError) && e.status >= 400 && e.status < 500
async function counted<T>(checks: [string, Rule][], fn: () => Promise<T>, what?: string): Promise<T> {
  enforce(limiter, checks, what)
  try { return await fn() } catch (e) {
    if (isClientFailure(e)) for (const [k, r] of checks) limiter.hit(k, r)
    throw e
  }
}

/** fresh: 비밀번호·구글·애플로 막 로그인함 → 접근 토큰에 auth_time(계정 삭제 재확인용). 리프레시는 false */
async function issue(userId: string, email: string, created = false, fresh = true) {
  // 기본함이 없는 예전 계정도 로그인·리프레시 때 채운다(있으면 아무것도 안 함). 실패해도 로그인은 막지 않는다
  await ensureDefaultInbox((sql, params) => pool.query(sql, params), userId).catch((e) => console.error('[inbox] ensure', (e as Error).message))
  const refresh = newRefreshToken()
  await pool.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '${REFRESH_DAYS} days')`, [userId, hashToken(refresh)])
  const access = await signAccessToken(keys, userId, ISSUER, ACCESS_TTL, fresh ? Math.floor(Date.now() / 1000) : undefined)
  return { user: { id: userId, email }, access_token: access, refresh_token: refresh, expires_in: ACCESS_TTL, created }
}

// 소셜 로그인(08 §3.1): 공급자 공개키는 처음 쓸 때 받아 캐시한다
const social = socialConfigFromEnv()
const identities = pgIdentityStore((sql, params) => pool.query(sql, params))
const googleKeys = remoteJwks(GOOGLE_JWKS_URL)
const appleKeys = remoteJwks(APPLE_JWKS_URL)
const appleHandoff = new HandoffStore()
const appleTokens = pgAppleTokenStore((sql, params) => pool.query(sql, params))
const appleKey = social.appleNative.key
/** 인가 코드가 있고 .p8 키가 있으면: 애플에 코드를 확인(같은 사용자인지)하고 폐기용 refresh_token을 받는다 */
async function appleConfirm(clientId: string, subject: string, code: unknown, redirectUri?: string) {
  if (!appleKey || typeof code !== 'string' || !code || code.length > 4096) return null
  const got = await appleTokenExchange(appleKey, clientId, code, redirectUri)
  if (got.subject !== subject) throw new SocialError('invalid token')
  return got.refreshToken ? { clientId, refreshToken: got.refreshToken } : null
}
/** 기기(iOS) 애플 ID 토큰: aud = 번들 id, nonce = sha256(앱이 가진 원래 nonce) */
async function appleNativeVerify(body: any) {
  if (!social.appleNative.bundleIds.length) throw new SocialError('provider not configured', 503)
  const verified = await verifyAppleIdToken(body?.id_token, { audiences: social.appleNative.bundleIds, keys: appleKeys, rawNonce: body?.nonce })
  const token = await appleConfirm(verified.audience, verified.subject, body?.authorization_code)
  return { verified, token }
}
/** 애플 맡김 칸에서 state + 원래 nonce로 꺼내 검증한다. 아직 안 왔으면 null(202) — 로그인·연결 공용 */
function appleVerify(req: IncomingMessage, state: unknown, nonce: unknown, extra: [string, Rule][] = []) {
  if (!social.apple) throw new SocialError('provider not configured', 503)
  if (typeof state !== 'string' || !STATE_RE.test(state)) throw new UploadError('bad request')
  if (!appleHandoff.has(state)) return null
  const apple = social.apple
  return (then: (v: Awaited<ReturnType<typeof verifyAppleIdToken>>) => Promise<unknown>) => counted([[`social:ip:${ipOf(req)}`, limits.socialIp], ...extra], async () => {
    const got = appleHandoff.take(state)!
    if (got.error) throw new SocialError(got.error === 'cancelled' ? 'cancelled' : 'apple error', 400)
    const verified = await verifyAppleIdToken(got.idToken, { servicesId: apple.servicesId, keys: appleKeys, rawNonce: nonce })
    // .p8 키가 있으면 인가 코드를 애플에 한 번 더 확인한다(같은 사용자인지) + 폐기용 refresh_token 보관
    const token = await appleConfirm(apple.servicesId, verified.subject, got.code, apple.redirectUri)
    const out = await then(verified)
    if (token) await appleTokens.save(verified.subject, token)
    return [200, out] as [number, unknown]
  })
}
async function withTx<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<any>) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn((sql, params) => client.query(sql, params))
    await client.query('COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
// 08 §3.1.1 로그인 방법 연결: 로그인한 계정에 구글·애플 식별자를 붙인다(이메일이 달라도). 시도 제한은 소셜 로그인과 같은 IP 칸 + 사용자 칸
const links = pgLinkStore((sql, params) => pool.query(sql, params), withTx)
const linkKeys = (req: IncomingMessage, userId: string): [string, Rule][] => [[`social:ip:${ipOf(req)}`, limits.socialIp], [`link:user:${userId}`, limits.socialIp]]
async function unlinkRoute(req: IncomingMessage, provider: string): Promise<[number, unknown]> {
  const userId = await userFrom(req)
  return counted([[`link:user:${userId}`, limits.socialIp]], async () => {
    // 애플 연결 해제 = 애플 토큰도 폐기(행이 지워지기 전에 읽어 둔다)
    const tokens = provider === 'apple' ? await appleTokens.forUser(userId) : []
    const out = await unlinkProvider(links, userId, parseProvider(provider))
    if (tokens.length) void revokeAppleTokens(appleKey, tokens)
    return [200, out] as [number, unknown]
  })
}

async function socialSignIn(verified: Awaited<ReturnType<typeof verifyGoogleIdToken>>) {
  const r = await resolveSocialUser(identities, verified)
  if (r.linked) console.log(`[social] ${verified.provider} 식별자를 기존 계정에 연결`)
  return issue(r.user.id, r.user.email, r.created)
}

// ── 경로 ──
const routes: Record<string, (req: IncomingMessage) => Promise<[number, unknown]>> = {
  'GET /health': async () => {
    await pool.query('SELECT 1')
    return [200, { ok: true }]
  },
  'GET /.well-known/jwks.json': async () => [200, { keys: [keys.publicJwk] }],

  'POST /auth/signup': async (req) => {
    // 가입은 성공도 센다(계정 대량 생성 막기)
    const ipKey: [string, Rule] = [`signup:ip:${ipOf(req)}`, limits.signupIp]
    enforce(limiter, [ipKey], '가입')
    limiter.hit(...ipKey)
    const { email, password } = await readJson(req, 10_000)
    if (!validEmail(email)) throw new UploadError('invalid email')
    if (!validPassword(password)) throw new UploadError('password must be 6-64 characters')
    const normalized = email.trim().toLowerCase()
    // 사용자 + 기본함(inbox-<id>)을 한 문으로 만든다(defaultInbox.ts — 모든 계정에 기본함)
    const made = await createUserWithInbox((sql, params) => pool.query(sql, params), normalized, await hashPassword(password))
    if (!made) throw new UploadError('email already registered', 409)
    return [201, await issue(made.id, normalized, true)]
  },

  'POST /auth/login': async (req) => {
    const { email, password } = await readJson(req, 10_000)
    const normalized = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : ''
    const emailKey = `login:email:${normalized}`
    return counted([[`login:ip:${ipOf(req)}`, limits.loginIp], [emailKey, limits.loginEmail]], async () => {
      if (!validEmail(email) || typeof password !== 'string' || password.length > 1024) throw new UploadError('invalid credentials', 401)
      const r = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [normalized])
      if (r.rowCount && r.rows[0].password_hash === null) {
        // 구글·애플로만 가입한 계정: 어느 쪽으로 로그인하면 되는지 알려 준다(08 §4)
        const p = await pool.query('SELECT DISTINCT provider FROM user_identities WHERE user_id = $1 ORDER BY provider', [r.rows[0].id])
        throw new UploadError(`social account: ${p.rows.map((x) => x.provider).join(',')}`, 401)
      }
      if (!r.rowCount || !(await verifyPassword(password, r.rows[0].password_hash))) throw new UploadError('invalid credentials', 401)
      limiter.reset(emailKey) // 성공하면 이 이메일의 실패 기록을 지운다(IP 기록은 남김)
      return [200, await issue(r.rows[0].id, normalized)] as [number, unknown]
    })
  },

  'GET /auth/providers': async () => [200, {
    google: social.googleClientIds.length > 0,
    apple: social.apple ? { services_id: social.apple.servicesId, redirect_uri: social.apple.redirectUri } : null
  }],

  'POST /auth/google': async (req) => counted([[`social:ip:${ipOf(req)}`, limits.socialIp]], async () => {
    const { id_token, nonce } = await readJson(req, 20_000)
    const verified = await verifyGoogleIdToken(id_token, { clientIds: social.googleClientIds, keys: googleKeys, nonce })
    return [200, await socialSignIn(verified)] as [number, unknown]
  }),

  // 애플이 브라우저를 통해 form_post로 보낸다. 토큰은 여기 잠깐 맡기고, 앱에는 state만 들려 보낸다
  'POST /auth/apple/callback': async (req) => {
    const ipKey: [string, Rule] = [`callback:ip:${ipOf(req)}`, limits.callbackIp]
    enforce(limiter, [ipKey])
    limiter.hit(...ipKey)
    const parsed = parseAppleCallback(await readText(req, 50_000))
    if (!parsed) throw new UploadError('bad request')
    appleHandoff.put(parsed.state, parsed.value)
    return [200, { __html: appleReturnPage(parsed.state, !parsed.value.error) }]
  },

  // 앱이 state + 원래 nonce로 찾아간다. 아직 안 왔으면 202(앱이 2초마다 다시 묻는다 — 시도 제한에 세지 않음)
  'POST /auth/apple': async (req) => {
    const { state, nonce } = await readJson(req, 10_000)
    const run = appleVerify(req, state, nonce)
    return run ? run(socialSignIn) : [202, { pending: true }]
  },

  // 20 §4.3.1 iOS 기기 애플 로그인(expo-apple-authentication). 웹 흐름과 같은 계정 규칙
  'POST /auth/apple/native': async (req) => counted([[`social:ip:${ipOf(req)}`, limits.socialIp]], async () => {
    const { verified, token } = await appleNativeVerify(await readJson(req, 20_000))
    const out = await socialSignIn(verified)
    if (token) await appleTokens.save(verified.subject, token)
    return [200, out] as [number, unknown]
  }),

  // 08 §3.1.1 로그인 방법 연결 — 로그인하지 않고, 지금 계정에 식별자만 붙인다
  'POST /auth/link/google': async (req) => {
    const userId = await userFrom(req)
    return counted(linkKeys(req, userId), async () => {
      const { id_token, nonce } = await readJson(req, 20_000)
      const verified = await verifyGoogleIdToken(id_token, { clientIds: social.googleClientIds, keys: googleKeys, nonce })
      return [200, await linkIdentity(links, userId, verified)] as [number, unknown]
    })
  },
  'POST /auth/link/apple': async (req) => {
    const userId = await userFrom(req)
    const { state, nonce } = await readJson(req, 10_000)
    const run = appleVerify(req, state, nonce, [[`link:user:${userId}`, limits.socialIp]])
    return run ? run((v) => linkIdentity(links, userId, v)) : [202, { pending: true }]
  },
  'POST /auth/link/apple/native': async (req) => {
    const userId = await userFrom(req)
    return counted(linkKeys(req, userId), async () => {
      const { verified, token } = await appleNativeVerify(await readJson(req, 20_000))
      const out = await linkIdentity(links, userId, verified)
      if (token) await appleTokens.save(verified.subject, token)
      return [200, out] as [number, unknown]
    })
  },
  'DELETE /auth/link/google': (req) => unlinkRoute(req, 'google'),
  'DELETE /auth/link/apple': (req) => unlinkRoute(req, 'apple'),

  'POST /auth/refresh': async (req) => counted([[`refresh:ip:${ipOf(req)}`, limits.refreshIp]], async () => {
    const { refresh_token } = await readJson(req, 10_000)
    if (typeof refresh_token !== 'string') throw new UploadError('unauthorized', 401)
    const r = await pool.query(
      `DELETE FROM sessions s USING users u WHERE s.token_hash = $1 AND s.user_id = u.id AND s.expires_at > now() RETURNING u.id, u.email`,
      [hashToken(refresh_token)]
    )
    if (!r.rowCount) throw new UploadError('unauthorized', 401)
    return [200, await issue(r.rows[0].id, r.rows[0].email, false, false)] as [number, unknown]
  }),

  'POST /auth/logout': async (req) => {
    const { refresh_token, device_id } = await readJson(req)
    // 32 §3.2: 앱이 DELETE /push/devices/:id에 실패해도 정리된다(그 세션 사용자의 기기일 때만)
    if (typeof refresh_token === 'string' && typeof device_id === 'string' && /^[0-9a-f-]{36}$/i.test(device_id)) {
      await pushStore.deleteDeviceBySession(device_id.toLowerCase(), hashToken(refresh_token)).catch((e) => console.error('[push] logout device', (e as Error).message))
    }
    if (typeof refresh_token === 'string') await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(refresh_token)])
    return [200, { ok: true }]
  },

  'GET /auth/me': async (req) => {
    const userId = await userFrom(req)
    const u = await pool.query('SELECT id, email, password_hash IS NOT NULL AS has_password FROM users WHERE id = $1', [userId])
    if (!u.rowCount) throw new UploadError('unauthorized', 401)
    // 서버에 이 사용자의 데이터가 이미 있으면, 새 기기는 로컬 시드를 지우고 내려받는다
    // 계정을 만들 때 생긴 빈 기본함(inbox-<id>)만 있으면 "데이터 없음" → 첫 기기가 로컬 데이터를 올린다(defaultInbox.ts)
    const has = await hasData((sql, params) => pool.query(sql, params), userId)
    // has_password·providers: 계정 삭제 화면이 비밀번호를 물을지, 구글·애플로 다시 로그인하게 할지 고른다(08 §7.1)
    // identities: 설정 › 계정 › 로그인 방법(08 §3.1.1) — 공급자와 가린 이메일
    const p = await pool.query('SELECT provider, subject, email FROM user_identities WHERE user_id = $1 ORDER BY created_at', [userId])
    const { has_password, ...user } = u.rows[0]
    const providers = [...new Set(p.rows.map((x) => x.provider as string))].sort()
    return [200, { user, has_data: has, has_password, providers, identities: linkedView(p.rows) }]
  },

  // 08 §7.1 계정 삭제: 다시 확인(비밀번호 / 10분 안의 구글·애플 로그인) → 한 트랜잭션으로 삭제
  'DELETE /auth/account': async (req) => {
    const h = req.headers.authorization ?? ''
    if (!h.startsWith('Bearer ')) throw new UploadError('unauthorized', 401)
    let claims: { sub: string; authTime?: number }
    try { claims = await verifyAccessClaims(keys, h.slice(7), ISSUER) } catch { throw new UploadError('unauthorized', 401) }
    const { password } = await readJson(req, 10_000)
    const key: [string, Rule] = [`delete:user:${claims.sub}`, limits.deleteUser]
    enforce(limiter, [key], '계정 삭제 확인')
    await deleteAccount({ query: (sql, params) => pool.query(sql, params), transaction: withTx }, { userId: claims.sub, authTime: claims.authTime, password }, () => limiter.hit(...key),
      { read: (id) => appleTokens.forUser(id), revoke: (tokens) => revokeAppleTokens(appleKey, tokens) })
    limiter.reset(key[0])
    return [200, { ok: true }]
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
      // 계정이 지워진 뒤 다른 기기가 올리면 owner_id 외래 키가 깨진다 → 로그인 만료로 알려 준다(앱이 리프레시 → 401 → 로그아웃)
      if ((e as { code?: string })?.code === '23503') throw new UploadError('unauthorized', 401)
      throw e
    } finally {
      client.release()
    }
    // 커밋 뒤 푸시 효과(조용한 동기화·알림 지우기·성장 소식) — 기다리지 않는다
    const device = req.headers['x-sprout-device']
    void push.afterUpload(userId, typeof device === 'string' ? device.toLowerCase() : null, batch).catch((e) => console.error('[push] afterUpload', (e as Error).message))
    return [200, { applied: stmts.length }]
  }
}

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (await ai.handle(req, res, path)) return
  if (await push.handle(req, res, path)) return
  const handler = routes[`${req.method} ${path}`]
  if (!handler) return send(res, 404, { error: 'not found' })
  try {
    const [status, body] = await handler(req)
    if (body && typeof body === 'object' && '__html' in body) {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'referrer-policy': 'no-referrer' })
      return void res.end((body as { __html: string }).__html)
    }
    send(res, status, body)
  } catch (e) {
    if (e instanceof RateLimitError) return send(res, 429, { error: e.message, code: e.code, retry_after: e.retryAfter }, { 'retry-after': String(e.retryAfter) })
    if (e instanceof UploadError || e instanceof SocialError || e instanceof AccountError) return send(res, e.status, { error: e.message })
    console.error(req.method, path, e)
    send(res, 500, { error: 'server error' })
  }
}).listen(PORT, () => {
  console.log(`sprout api :${PORT} · tables ${Object.keys(TABLES).length} · push ${push.enabled ? 'on' : 'off'}`)
  push.start()
})
