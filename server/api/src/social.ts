// 소셜 로그인 (08 §3.1 · PRD §7.2 E): 구글 ID 토큰·애플 ID 토큰 검증 → 계정 찾기·연결·만들기.
// - 구글: 데스크톱이 시스템 브라우저 + PKCE + 루프백으로 받은 ID 토큰을 POST /auth/google 로 보낸다.
//   서버는 구글 공개키(JWKS)로 서명·iss·aud(우리 클라이언트 id)·만료·email_verified·nonce를 확인한다.
//   모바일(20 §4.3)은 기기 구글 로그인(@react-native-google-signin 무료판)이라 nonce를 넣을 수 없다 → nonce 없이 보낸다.
//   그때만: 토큰이 "네이티브 앱이 우리 서버(웹 클라이언트 id)용으로 받은 것"(azp ≠ aud)이고, 10분 안에 발급됐고, 한 번만 쓸 수 있다.
//   데스크톱 토큰은 azp = aud라 nonce를 빼고 보내도 통과하지 못한다.
// - 애플: 웹 흐름(response_mode=form_post)이라 돌아오는 주소가 https여야 한다 → API의 /auth/apple/callback 이 받아
//   state 별로 잠깐(5분) 맡아 두고 sprout://auth/apple 로 앱을 깨운다. 앱은 POST /auth/apple {state, nonce}로 찾아간다.
//   토큰은 URL에 싣지 않는다. 애플에는 nonce의 SHA-256만 보내므로, 원래 nonce를 아는 그 앱만 교환할 수 있다.
// - 애플(iOS 기기, 20 §4.3.1): expo-apple-authentication이 받은 ID 토큰을 POST /auth/apple/native {id_token, nonce, authorization_code?}.
//   aud = 앱 번들 id(APPLE_BUNDLE_IDS, 기본 app.sprout.mobile). nonce 규칙은 웹 흐름과 같다(앱은 sha256(nonce)를 애플에 보냄).
// - 애플 토큰 폐기(심사 지침 5.1.1(v)): .p8 키가 있으면 인가 코드를 교환해 받은 refresh_token을 user_identities에 서버 전용으로 두고,
//   계정 삭제·애플 연결 해제 때 POST https://appleid.apple.com/auth/revoke 로 폐기한다(revokeAppleToken).
// - 계정 규칙: (공급자, subject)가 이미 있으면 그 계정 → 없으면 확인된 같은 이메일 계정에 연결 → 없으면 새 계정(비밀번호 없음).
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRemoteJWKSet, decodeJwt, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from 'jose'
import { createUserWithInbox, inboxIdFor } from './defaultInbox.ts'

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
  /** iOS 기기 애플 로그인(ID 토큰 aud = 번들 id). 키는 공개키(JWKS)만 있으면 되고, key는 토큰 폐기·코드 확인용(없으면 null) */
  appleNative: { bundleIds: string[]; key: AppleKey | null }
}
/** 애플 "Sign in with Apple" 키(.p8) — 웹(Services ID)·기기(번들 id) 둘 다 같은 키로 client_secret을 만든다 */
export type AppleKey = { teamId: string; keyId: string; privateKey: string }

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
  const teamId = env.APPLE_TEAM_ID?.trim() || 'BU697KN34B'
  const keyId = env.APPLE_KEY_ID?.trim() ?? ''
  // 번들 id는 비밀이 아니고 검증에 애플 공개키만 쓰므로 기본으로 켠다. APPLE_BUNDLE_IDS=off 로 끈다
  const bundleRaw = env.APPLE_BUNDLE_IDS?.trim()
  const bundleIds = bundleRaw === 'off' ? [] : bundleRaw ? list(bundleRaw) : ['app.sprout.mobile']
  return {
    googleClientIds,
    appleNative: { bundleIds, key: privateKey && keyId ? { teamId, keyId, privateKey } : null },
    apple: servicesId
      ? { servicesId, redirectUri: env.APPLE_REDIRECT_URI?.trim() || `${publicUrl}/auth/apple/callback`, teamId, keyId, privateKey }
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
export async function verifyAppleIdToken(token: unknown, opts: { servicesId?: string; audiences?: string[]; keys: KeySource; rawNonce: unknown }): Promise<VerifiedIdentity & { audience: string }> {
  const audiences = opts.audiences ?? (opts.servicesId ? [opts.servicesId] : [])
  const p = await verify(token, opts.keys, ['https://appleid.apple.com'], audiences)
  if (typeof opts.rawNonce !== 'string' || typeof p.nonce !== 'string' || !sameText(p.nonce, sha256hex(opts.rawNonce))) throw new SocialError('invalid token')
  const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : null
  const audience = (Array.isArray(p.aud) ? p.aud.find((a) => audiences.includes(a)) : p.aud) as string
  return { provider: 'apple', subject: p.sub!, email, emailVerified: truthy(p.email_verified), privateRelay: truthy(p.is_private_email) || !!email?.endsWith('@privaterelay.appleid.com'), audience }
}

// ── 애플 client_secret(ES256, .p8) · 코드 교환 ──
/** 애플 토큰 엔드포인트용 client_secret. 최대 6개월 유효 — 여기서는 5분짜리를 매번 만든다 */
export async function appleClientSecret(a: AppleKey & { servicesId: string }, ttlSec = 300): Promise<string> {
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
  return (await appleTokenExchange({ ...a, privateKey: a.privateKey }, a.servicesId, code, a.redirectUri, fetchImpl)).subject
}

/**
 * 인가 코드 → 애플 토큰(client_id = Services ID 또는 번들 id). 돌려받은 ID 토큰의 sub와 refresh_token(폐기용, 없을 수 있음).
 * 기기 흐름은 redirect_uri를 보내지 않는다.
 */
export async function appleTokenExchange(
  key: AppleKey,
  clientId: string,
  code: string,
  redirectUri: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<{ subject: string; refreshToken: string | null }> {
  const body = new URLSearchParams({ client_id: clientId, client_secret: await appleClientSecret({ ...key, servicesId: clientId }), code, grant_type: 'authorization_code' })
  if (redirectUri) body.set('redirect_uri', redirectUri)
  const res = await fetchImpl('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000)
  })
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; refresh_token?: string }
  if (!res.ok || !json.id_token) throw new SocialError('apple code rejected')
  const sub = decodeJwt(json.id_token).sub // 애플 서버에서 TLS로 직접 받은 토큰이라 서명 재검증은 생략
  if (!sub) throw new SocialError('apple code rejected')
  return { subject: sub, refreshToken: typeof json.refresh_token === 'string' && json.refresh_token ? json.refresh_token : null }
}

/** 애플 토큰 폐기(계정 삭제·연결 해제). 성공 = 200. 이미 폐기·만료된 토큰도 애플은 200을 준다 */
export async function revokeAppleToken(key: AppleKey, clientId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchImpl('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: await appleClientSecret({ ...key, servicesId: clientId }), token, token_type_hint: 'refresh_token' }),
    signal: AbortSignal.timeout(15_000)
  })
  return res.ok
}

export type AppleToken = { clientId: string; refreshToken: string }
/** 계정의 애플 토큰을 모두 폐기한다(최선 노력 — 실패해도 던지지 않고 실패 수만 센다). 키가 없으면 0건 */
export async function revokeAppleTokens(key: AppleKey | null, tokens: AppleToken[], fetchImpl: typeof fetch = fetch): Promise<{ revoked: number; failed: number }> {
  let revoked = 0
  let failed = 0
  if (!key) return { revoked, failed: tokens.length }
  for (const t of tokens) {
    const ok = await revokeAppleToken(key, t.clientId, t.refreshToken, fetchImpl).catch(() => false)
    if (ok) revoked++
    else failed++
  }
  if (tokens.length) console.log(`[social] 애플 토큰 폐기 ${revoked}건${failed ? ` · 실패 ${failed}건` : ''}`)
  return { revoked, failed }
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
  /** 사용자와 기본함(lists kind='inbox', id inbox-<id>)을 함께 만든다. 같은 이메일이 동시에 만들어지면 null */
  createUser(email: string): Promise<UserRow | null>
  link(userId: string, id: VerifiedIdentity): Promise<void>
}

/** 애플 refresh_token 보관(서버 전용 칸 user_identities.apple_*, migrations/20261011-apple-tokens.sql). 칸이 아직 없는 서버에서도 로그인은 막지 않는다 */
export interface AppleTokenStore {
  save(subject: string, token: AppleToken): Promise<void>
  /** 이 사용자의 애플 토큰(계정 삭제 전에 읽는다) */
  forUser(userId: string): Promise<AppleToken[]>
}
export function pgAppleTokenStore(q: Q): AppleTokenStore {
  return {
    async save(subject, t) {
      await q(`UPDATE user_identities SET apple_client_id = $2, apple_refresh_token = $3 WHERE provider = 'apple' AND subject = $1`, [subject, t.clientId, t.refreshToken])
        .catch((e) => console.error('[social] 애플 토큰 저장 실패(마이그레이션 20261011 확인):', (e as Error).message))
    },
    async forUser(userId) {
      try {
        const r = await q(`SELECT apple_client_id, apple_refresh_token FROM user_identities WHERE user_id = $1 AND provider = 'apple' AND apple_refresh_token IS NOT NULL`, [userId])
        return r.rows.map((x) => ({ clientId: x.apple_client_id as string, refreshToken: x.apple_refresh_token as string })).filter((x) => x.clientId && x.refreshToken)
      } catch (e) {
        console.error('[social] 애플 토큰 읽기 실패(마이그레이션 20261011 확인):', (e as Error).message)
        return []
      }
    }
  }
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
      // 사용자 + 기본함(inbox-<id>)을 한 문으로(defaultInbox.ts — 모든 계정에 기본함)
      return createUserWithInbox(q, email, null)
    },
    async link(userId, id) {
      await q('INSERT INTO user_identities (user_id, provider, subject, email) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, subject) DO NOTHING', [userId, id.provider, id.subject, id.email])
    }
  }
}

export function memoryIdentityStore(): IdentityStore & { users: Map<string, UserRow & { password: boolean }>; identities: { userId: string; provider: Provider; subject: string; email: string | null }[]; inboxes: Map<string, string> } {
  const users = new Map<string, UserRow & { password: boolean }>()
  const inboxes = new Map<string, string>() // 사용자 id → 기본함 id
  const identities: { userId: string; provider: Provider; subject: string; email: string | null }[] = []
  let n = 0
  return {
    users,
    identities,
    inboxes,
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
      inboxes.set(id, inboxIdFor(id))
      return { id, email }
    },
    async link(userId, id) {
      if (!identities.some((x) => x.provider === id.provider && x.subject === id.subject)) identities.push({ userId, provider: id.provider, subject: id.subject, email: id.email })
    }
  }
}
