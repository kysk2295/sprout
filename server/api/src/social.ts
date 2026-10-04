// 소셜 로그인 (08 §3.1 · PRD §7.2 E): 구글 ID 토큰·애플 ID 토큰 검증 → 계정 찾기·연결·만들기.
// - 구글: 데스크톱이 시스템 브라우저 + PKCE + 루프백으로 받은 ID 토큰을 POST /auth/google 로 보낸다.
//   서버는 구글 공개키(JWKS)로 서명·iss·aud(우리 클라이언트 id)·만료·email_verified·nonce를 확인한다.
//   모바일(20 §4.3)은 기기 구글 로그인(@react-native-google-signin 무료판)이라 nonce를 넣을 수 없다 → nonce 없이 보낸다.
//   그때만: 토큰이 "네이티브 앱이 우리 서버(웹 클라이언트 id)용으로 받은 것"(azp ≠ aud)이고, 10분 안에 발급됐고, 한 번만 쓸 수 있다.
//   데스크톱 토큰은 azp = aud라 nonce를 빼고 보내도 통과하지 못한다.
// - 애플: 웹 흐름(response_mode=form_post)이라 돌아오는 주소가 https여야 한다 → API의 /auth/apple/callback 이 받아
//   state 별로 잠깐(5분) 맡아 두고 sprout://auth/apple 로 앱을 깨운다. 앱은 POST /auth/apple {state, nonce}로 찾아간다.
//   토큰은 URL에 싣지 않는다. 애플에는 nonce의 SHA-256만 보내므로, 원래 nonce를 아는 그 앱만 교환할 수 있다.
// - 계정 규칙: (공급자, subject)가 이미 있으면 그 계정 → 없으면 확인된 같은 이메일 계정에 연결 → 없으면 새 계정(비밀번호 없음).
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRemoteJWKSet, decodeJwt, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from 'jose'

export type Provider = 'google' | 'apple'
export type VerifiedIdentity = { provider: Provider; subject: string; email: string | null; emailVerified: boolean; privateRelay: boolean }

export class SocialError extends Error {
  status: number
  constructor(message: string, status = 401) { super(message); this.status = status }
}

// ── 설정 ──
export type SocialConfig = {
  googleClientIds: string[]
  apple: null | {
    servicesId: string
    redirectUri: string
    teamId: string
    keyId: string
    privateKey: string | null // .p8 내용(PEM). 있으면 코드 교환으로 한 번 더 확인한다
  }
}

export function socialConfigFromEnv(env: Record<string, string | undefined> = process.env): SocialConfig {
  const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const googleClientIds = [...new Set([...list(env.GOOGLE_CLIENT_IDS), ...list(env.GOOGLE_CLIENT_ID)])]
  const servicesId = env.APPLE_SERVICES_ID?.trim()
  let privateKey: string | null = null
  const keyPath = env.APPLE_PRIVATE_KEY?.trim()
  if (keyPath) {
    try { privateKey = keyPath.includes('BEGIN PRIVATE KEY') ? keyPath : readFileSync(keyPath, 'utf8') } catch (e) { console.warn('[social] APPLE_PRIVATE_KEY를 읽지 못했어요:', (e as Error).message) }
  }
  const publicUrl = (env.API_PUBLIC_URL ?? 'https://macmini.tail425c97.ts.net').replace(/\/+$/, '')
  return {
    googleClientIds,
    apple: servicesId
      ? { servicesId, redirectUri: env.APPLE_REDIRECT_URI?.trim() || `${publicUrl}/auth/apple/callback`, teamId: env.APPLE_TEAM_ID?.trim() || 'BU697KN34B', keyId: env.APPLE_KEY_ID?.trim() ?? '', privateKey }
      : null
  }
}

// ── 공개키(JWKS) ──
type KeySource = Parameters<typeof jwtVerify>[1]
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys'
export const remoteJwks = (url: string) => createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000, cacheMaxAge: 6 * 3600_000 })

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex')
const sameText = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const truthy = (v: unknown) => v === true || v === 'true'

async function verify(token: unknown, keys: KeySource, issuer: string[], audience: string[]): Promise<JWTPayload> {
  if (typeof token !== 'string' || token.length > 8192) throw new SocialError('invalid token')
  if (!audience.length) throw new SocialError('provider not configured', 503)
  try {
    const { payload } = await jwtVerify(token, keys as any, { issuer, audience, algorithms: ['RS256'], clockTolerance: 60 })
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no sub')
    return payload
  } catch (e) {
    if (e instanceof SocialError) throw e
    throw new SocialError('invalid token')
  }
}

/** 한 번만 쓰는 토큰 기록(메모리). 키 = jti 또는 토큰 해시, 토큰이 끝나는 시각까지 기억한다 */
export class ReplayGuard {
  private seen = new Map<string, number>()
  private max: number
  private now: () => number
  constructor(max = 20_000, now = () => Date.now()) { this.max = max; this.now = now }
  /** 처음이면 기록하고 true, 이미 쓴 것이면 false */
  use(key: string, expSec: number): boolean {
    const t = this.now()
    for (const [k, exp] of this.seen) if (exp * 1000 < t) this.seen.delete(k)
    if (this.seen.has(key)) return false
    if (this.seen.size >= this.max) this.seen.delete(this.seen.keys().next().value!)
    this.seen.set(key, expSec)
    return true
  }
}
const googleReplay = new ReplayGuard()
/** nonce 없는(모바일) 구글 토큰이 발급된 지 이만큼 안이어야 한다 */
export const NONCELESS_MAX_AGE_SEC = 600

/**
 * 구글 ID 토큰. nonce를 주면 토큰의 nonce와 같아야 한다(데스크톱).
 * nonce가 없으면(모바일 기기 로그인) azp ≠ aud · 10분 안 발급 · 한 번만 — 셋 다 맞아야 한다.
 */
export async function verifyGoogleIdToken(
  token: unknown,
  opts: { clientIds: string[]; keys: KeySource; nonce?: unknown; replay?: ReplayGuard; nowSec?: number }
): Promise<VerifiedIdentity> {
  const p = await verify(token, opts.keys, ['https://accounts.google.com', 'accounts.google.com'], opts.clientIds)
  if (opts.nonce !== undefined && opts.nonce !== null) {
    if (typeof opts.nonce !== 'string' || typeof p.nonce !== 'string' || !sameText(p.nonce, opts.nonce)) throw new SocialError('invalid token')
  } else {
    const aud = Array.isArray(p.aud) ? (p.aud.length === 1 ? p.aud[0] : undefined) : p.aud
    const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
    const crossClient = typeof p.azp === 'string' && !!p.azp && typeof aud === 'string' && p.azp !== aud
    const fresh = typeof p.iat === 'number' && p.iat <= now + 60 && now - p.iat <= NONCELESS_MAX_AGE_SEC
    if (!crossClient || !fresh) throw new SocialError('invalid token')
    const key = typeof p.jti === 'string' && p.jti ? `jti:${p.jti}` : `h:${sha256hex(token as string)}`
    if (!(opts.replay ?? googleReplay).use(key, typeof p.exp === 'number' ? p.exp : now + 3600)) throw new SocialError('invalid token')
  }
  const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : null
  return { provider: 'google', subject: p.sub!, email, emailVerified: truthy(p.email_verified), privateRelay: false }
}

/** 애플 ID 토큰. 애플에는 sha256(nonce)를 보냈으므로 토큰의 nonce = sha256hex(앱이 가진 원래 nonce) */
export async function verifyAppleIdToken(token: unknown, opts: { servicesId: string; keys: KeySource; rawNonce: unknown }): Promise<VerifiedIdentity> {
  const p = await verify(token, opts.keys, ['https://appleid.apple.com'], [opts.servicesId])
  if (typeof opts.rawNonce !== 'string' || typeof p.nonce !== 'string' || !sameText(p.nonce, sha256hex(opts.rawNonce))) throw new SocialError('invalid token')
  const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : null
  return { provider: 'apple', subject: p.sub!, email, emailVerified: truthy(p.email_verified), privateRelay: truthy(p.is_private_email) || !!email?.endsWith('@privaterelay.appleid.com') }
}

// ── 애플 client_secret(ES256, .p8) · 코드 교환 ──
/** 애플 토큰 엔드포인트용 client_secret. 최대 6개월 유효 — 여기서는 5분짜리를 매번 만든다 */
export async function appleClientSecret(a: { teamId: string; keyId: string; servicesId: string; privateKey: string }, ttlSec = 300): Promise<string> {
  const key = await importPKCS8(a.privateKey, 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: a.keyId })
    .setIssuer(a.teamId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .setAudience('https://appleid.apple.com')
    .setSubject(a.servicesId)
    .sign(key)
}

/** 인가 코드를 애플에 한 번 더 확인한다(코드가 진짜이고 같은 사용자인지). 돌려받은 ID 토큰의 sub를 반환 */
export async function exchangeAppleCode(
  a: NonNullable<SocialConfig['apple']> & { privateKey: string },
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: a.servicesId, client_secret: await appleClientSecret(a), code, grant_type: 'authorization_code', redirect_uri: a.redirectUri }),
    signal: AbortSignal.timeout(15_000)
  })
  const json = (await res.json().catch(() => ({}))) as { id_token?: string }
  if (!res.ok || !json.id_token) throw new SocialError('apple code rejected')
  const sub = decodeJwt(json.id_token).sub // 애플 서버에서 TLS로 직접 받은 토큰이라 서명 재검증은 생략
  if (!sub) throw new SocialError('apple code rejected')
  return sub
}

// ── 애플 콜백 맡김 칸(메모리, 5분, 한 번만) ──
export const STATE_RE = /^[A-Za-z0-9_-]{32,128}$/
export type AppleHandoff = { idToken?: string; code?: string; error?: string }

export class HandoffStore {
  private map = new Map<string, AppleHandoff & { at: number }>()
  private ttlMs: number
  private max: number
  private now: () => number
  constructor(ttlMs = 5 * 60_000, max = 2000, now = () => Date.now()) { this.ttlMs = ttlMs; this.max = max; this.now = now }
  put(state: string, value: AppleHandoff) {
    this.sweep()
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!) // 가장 오래된 것부터
    this.map.set(state, { ...value, at: this.now() })
  }
  /** 있으면 꺼내면서 지운다(한 번만) */
  take(state: string): AppleHandoff | undefined {
    this.sweep()
    const v = this.map.get(state)
    if (!v) return undefined
    this.map.delete(state)
    const { at: _at, ...rest } = v
    return rest
  }
  has(state: string) { this.sweep(); return this.map.has(state) }
  private sweep() { const t = this.now(); for (const [k, v] of this.map) if (t - v.at > this.ttlMs) this.map.delete(k) }
}

/** 애플 form_post 본문(x-www-form-urlencoded) → state·맡길 값. state가 이상하면 null */
export function parseAppleCallback(body: string): { state: string; value: AppleHandoff } | null {
  const f = new URLSearchParams(body)
  const state = f.get('state') ?? ''
  if (!STATE_RE.test(state)) return null
  const error = f.get('error')
  if (error) return { state, value: { error: error === 'user_cancelled_authorize' ? 'cancelled' : 'apple error' } }
  const idToken = f.get('id_token') ?? undefined
  const code = f.get('code') ?? undefined
  if (!idToken) return { state, value: { error: 'apple error' } }
  // f.get('user')(첫 로그인 때만 오는 이름·이메일 JSON)는 서명이 없어 믿지 않고 저장하지도 않는다. 이메일은 ID 토큰 것만 쓴다
  return { state, value: { idToken, code } }
}

/** 브라우저에 보여 줄 돌아가기 페이지(외부 자원 없음). state는 STATE_RE를 통과한 값만 들어온다 */
export function appleReturnPage(state: string, ok: boolean): string {
  const link = `sprout://auth/apple?state=${state}`
  const title = ok ? 'sprout로 돌아가 주세요' : '로그인하지 못했어요'
  const body = ok ? '이 창은 닫아도 돼요.' : 'sprout에서 다시 시도해 주세요.'
  return `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${link}"><title>${title}</title>` +
    `<body style="font:15px -apple-system,system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#333"><div style="text-align:center"><h2>${title}</h2><p>${body}</p><p><a href="${link}">sprout 열기</a></p></div></body>`
}

// ── 계정 찾기·연결·만들기 ──
export type UserRow = { id: string; email: string }
export interface IdentityStore {
  findByIdentity(provider: Provider, subject: string): Promise<UserRow | null>
  findUserByEmail(email: string): Promise<UserRow | null>
  /** 같은 이메일이 동시에 만들어지면 null */
  createUser(email: string): Promise<UserRow | null>
  link(userId: string, id: VerifiedIdentity): Promise<void>
}

export type Resolved = { user: UserRow; created: boolean; linked: boolean }

export async function resolveSocialUser(store: IdentityStore, id: VerifiedIdentity): Promise<Resolved> {
  const known = await store.findByIdentity(id.provider, id.subject)
  if (known) return { user: known, created: false, linked: false }
  if (!id.email) throw new SocialError('email required', 400) // 애플은 첫 로그인에만 이메일을 줄 때가 있다 → 앱에서 다시 시도
  if (!id.emailVerified) throw new SocialError('email not verified', 403)
  const existing = await store.findUserByEmail(id.email)
  if (existing) {
    await store.link(existing.id, id)
    return { user: existing, created: false, linked: true }
  }
  const made = (await store.createUser(id.email)) ?? (await store.findUserByEmail(id.email))
  if (!made) throw new SocialError('server error', 500)
  await store.link(made.id, id)
  return { user: made, created: true, linked: false }
}

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>
export function pgIdentityStore(q: Q): IdentityStore {
  return {
    async findByIdentity(provider, subject) {
      const r = await q('SELECT u.id, u.email FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = $1 AND i.subject = $2', [provider, subject])
      return r.rows[0] ?? null
    },
    async findUserByEmail(email) {
      const r = await q('SELECT id, email FROM users WHERE email = $1', [email])
      return r.rows[0] ?? null
    },
    async createUser(email) {
      const r = await q('INSERT INTO users (email, password_hash) VALUES ($1, NULL) ON CONFLICT (email) DO NOTHING RETURNING id, email', [email])
      return r.rows[0] ?? null
    },
    async link(userId, id) {
      await q('INSERT INTO user_identities (user_id, provider, subject, email) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, subject) DO NOTHING', [userId, id.provider, id.subject, id.email])
    }
  }
}

export function memoryIdentityStore(): IdentityStore & { users: Map<string, UserRow & { password: boolean }>; identities: { userId: string; provider: Provider; subject: string; email: string | null }[] } {
  const users = new Map<string, UserRow & { password: boolean }>()
  const identities: { userId: string; provider: Provider; subject: string; email: string | null }[] = []
  let n = 0
  return {
    users,
    identities,
    async findByIdentity(provider, subject) {
      const i = identities.find((x) => x.provider === provider && x.subject === subject)
      const u = i && users.get(i.userId)
      return u ? { id: u.id, email: u.email } : null
    },
    async findUserByEmail(email) {
      for (const u of users.values()) if (u.email === email) return { id: u.id, email: u.email }
      return null
    },
    async createUser(email) {
      for (const u of users.values()) if (u.email === email) return null
      const id = `u${++n}`
      users.set(id, { id, email, password: false })
      return { id, email }
    },
    async link(userId, id) {
      if (!identities.some((x) => x.provider === id.provider && x.subject === id.subject)) identities.push({ userId, provider: id.provider, subject: id.subject, email: id.email })
    }
  }
}
