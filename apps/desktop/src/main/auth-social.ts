// 08 §3.1 구글·애플로 계속하기 — 메인 프로세스.
// - 구글: 시스템 브라우저 + PKCE + 루프백(127.0.0.1 임의 포트). 받은 ID 토큰을 sprout API(POST /auth/google)에 넘긴다.
//   클라이언트 id는 캘린더 연동(16)과 같은 GOOGLE_CLIENT_ID(+ GOOGLE_CLIENT_SECRET). 범위는 openid email profile만.
// - 애플: 웹 흐름. 애플이 API의 https 주소(/auth/apple/callback)로 form_post → API가 state별로 잠깐 맡기고 sprout://auth/apple 로 앱을 깨운다.
//   앱은 POST /auth/apple {state, nonce}를 2초마다 묻고(딥 링크가 오면 바로), 끝나면 이메일 로그인과 같은 길(signInWithTokens)을 탄다.
//   애플에는 nonce의 SHA-256만 보낸다 → 원래 nonce는 이 프로세스 메모리에만 있다. 개발 실행(sprout:// 미등록)에서도 폴링으로 끝난다.
// - 토큰·코드는 화면(렌더러)에 넘기지 않는다.
// - 08 §3.1.1 로그인 방법 연결: 같은 브라우저 흐름으로 받은 토큰을 지금 세션(Bearer)으로 /auth/link/* 에 보낸다(로그인하지 않음).
import { ipcMain, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { apiBase, serverAccess, signInWithTokens, type AuthState } from './sync'

export type SocialProvider = 'google' | 'apple'
export type SocialResult = { ok: true; state: AuthState } | { ok: false; error: string; code: string }
export type LinkedIdentity = { provider: SocialProvider; email: string | null } // email은 서버가 가린 것(qa***@gmail.com)
export type LoginMethods = { ok: true; hasPassword: boolean; identities: LinkedIdentity[] } | { ok: false; error: string; code: string }
export type LinkResult = { ok: true; linked: boolean; identities: LinkedIdentity[] } | { ok: false; error: string; code: string }
export type SocialStatus = { google: boolean; apple: boolean | null; waiting: SocialProvider | null } // apple null = 서버에 물어보지 못함

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const APPLE_AUTH = 'https://appleid.apple.com/auth/authorize'
const TIMEOUT = 5 * 60_000
const POLL_MS = 2000

const b64url = (b: Buffer) => b.toString('base64url')
const sha256 = (s: string) => createHash('sha256').update(s)
const googleClient = () => ({ id: (process.env.GOOGLE_CLIENT_ID?.trim() || (typeof __BUILD_GOOGLE_CLIENT_ID__ === 'string' ? __BUILD_GOOGLE_CLIENT_ID__ : '')), secret: (process.env.GOOGLE_CLIENT_SECRET?.trim() || (typeof __BUILD_GOOGLE_CLIENT_SECRET__ === 'string' ? __BUILD_GOOGLE_CLIENT_SECRET__ : '') || undefined) })

class SocialFail extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.code = code }
}
const MSG: Record<string, string> = {
  cancelled: '로그인을 취소했어요.',
  timeout: '5분 안에 마치지 않아 로그인을 멈췄어요.',
  busy: '진행 중인 로그인이 있어요. 브라우저에서 마치거나 취소해 주세요.',
  no_google: 'Google 로그인이 아직 준비되지 않았어요. (운영자: GOOGLE_CLIENT_ID 필요)',
  no_apple: 'Apple 로그인이 아직 준비되지 않았어요. (운영자: 서버 APPLE_SERVICES_ID 필요)',
  unverified: '이메일이 확인되지 않은 계정이에요. 이메일을 확인한 뒤 다시 시도하세요.',
  no_email: 'Apple이 이메일을 알려 주지 않았어요. 기기 설정 › Apple 계정 › Apple로 로그인에서 꿈틀을 지운 뒤 다시 시도하세요.',
  rejected: '로그인을 확인하지 못했어요. 다시 시도하세요.',
  rate: '잠시 뒤 다시 시도하세요',
  network: '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요',
  port: '로그인용 포트를 열지 못했어요. 다시 시도하세요.',
  unauthorized: '로그인이 만료됐어요. 다시 로그인한 뒤 시도하세요'
}
const fail = (code: string) => new SocialFail(code, MSG[code] ?? MSG.rejected)

/** 서버 오류 → 화면 문구 코드 */
function fromServer(status: number, error: string): SocialFail {
  if (status === 503 || /not configured/.test(error)) return fail('no_apple')
  if (status === 429) return fail('rate')
  if (/not verified/.test(error)) return fail('unverified')
  if (/email required/.test(error)) return fail('no_email')
  if (/cancelled/.test(error)) return fail('cancelled')
  return fail('rejected')
}

async function post(path: string, body: unknown, token?: string, method = 'POST'): Promise<{ status: number; json: any }> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000)
    })
  } catch { throw fail('network') }
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

// ── 진행 중 하나만 ──
let pending: { provider: SocialProvider; cancel: () => void; nudge?: (state: string) => void } | undefined

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:15px -apple-system,system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#333"><div style="text-align:center"><h2>${title}</h2><p>${body}</p></div></body>`

// ── 구글 ──
function googleIdToken(): Promise<{ idToken: string; nonce: string }> {
  const { id, secret } = googleClient()
  if (!id) return Promise.reject(fail('no_google'))
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(sha256(verifier).digest())
  const state = b64url(randomBytes(24))
  const nonce = b64url(randomBytes(24))
  return new Promise((resolve, reject) => {
    let done = false
    let redirect = ''
    const finish = (err: Error | null, v?: { idToken: string; nonce: string }) => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      server.closeAllConnections?.()
      pending = undefined
      err ? reject(err) : resolve(v!)
    }
    const server: Server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/auth/google') { res.writeHead(404).end(); return }
      const send = (code: number, title: string, body: string) => res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }).end(page(title, body))
      if (url.searchParams.get('state') !== state) { send(400, '로그인하지 못했어요', '요청이 맞지 않아요. 꿈틀에서 다시 시도해 주세요.'); return }
      const code = url.searchParams.get('code')
      if (!code) { send(400, '로그인을 취소했어요', '꿈틀로 돌아가 주세요.'); finish(fail('cancelled')); return }
      try {
        const r = await fetch(GOOGLE_TOKEN, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, code_verifier: verifier, client_id: id, ...(secret ? { client_secret: secret } : {}), redirect_uri: redirect, grant_type: 'authorization_code' }),
          signal: AbortSignal.timeout(20_000)
        })
        const json = (await r.json().catch(() => ({}))) as { id_token?: string }
        if (!r.ok || !json.id_token) throw fail('rejected')
        send(200, '꿈틀로 돌아가 주세요', '이 창은 닫아도 돼요.')
        finish(null, { idToken: json.id_token, nonce })
      } catch (e) {
        send(500, '로그인하지 못했어요', '꿈틀로 돌아가 다시 시도해 주세요.')
        finish(e instanceof SocialFail ? e : fail('network'))
      }
    })
    const timer = setTimeout(() => finish(fail('timeout')), TIMEOUT)
    server.on('error', () => finish(fail('port')))
    // 구글 데스크톱 클라이언트는 루프백의 아무 포트나 받는다
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      redirect = `http://127.0.0.1:${port}/auth/google`
      pending = { provider: 'google', cancel: () => finish(fail('cancelled')) }
      const auth = new URL(GOOGLE_AUTH)
      auth.search = new URLSearchParams({
        client_id: id, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile',
        code_challenge: challenge, code_challenge_method: 'S256', state, nonce, prompt: 'select_account'
      }).toString()
      void shell.openExternal(auth.href)
    })
  })
}

async function signInGoogle(): Promise<AuthState> {
  const { idToken, nonce } = await googleIdToken()
  const r = await post('/auth/google', { id_token: idToken, nonce })
  if (r.status !== 200) throw r.status === 503 ? fail('no_google') : fromServer(r.status, String(r.json.error ?? ''))
  return signInWithTokens(r.json)
}

// ── 애플 ──
async function appleConfig(): Promise<{ services_id: string; redirect_uri: string } | null> {
  try {
    const res = await fetch(`${apiBase()}/auth/providers`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return ((await res.json()) as { apple: { services_id: string; redirect_uri: string } | null }).apple
  } catch { return null }
}

async function signInApple(): Promise<AuthState> {
  return signInWithTokens(await appleFlow((state, nonce) => post('/auth/apple', { state, nonce })))
}

/** 애플 브라우저 흐름 → 서버 맡김 칸을 exchange로 물어 200 응답 본문을 돌려준다(로그인·연결 공용) */
async function appleFlow(exchange: (state: string, nonce: string) => Promise<{ status: number; json: any }>): Promise<any> {
  const cfg = await appleConfig()
  if (!cfg) throw fail('no_apple')
  const state = b64url(randomBytes(32))
  const nonce = b64url(randomBytes(32))
  let cancelled = false
  let wake: () => void = () => {}
  pending = {
    provider: 'apple',
    cancel: () => { cancelled = true; wake() },
    nudge: (s) => { if (s === state) wake() } // sprout://auth/apple?state=… → 바로 묻기
  }
  try {
    const auth = new URL(APPLE_AUTH)
    auth.search = new URLSearchParams({
      client_id: cfg.services_id, redirect_uri: cfg.redirect_uri, response_type: 'code id_token', response_mode: 'form_post',
      scope: 'name email', state, nonce: sha256(nonce).digest('hex')
    }).toString()
    void shell.openExternal(auth.href)
    const until = Date.now() + TIMEOUT
    while (true) {
      await new Promise<void>((r) => { const t = setTimeout(r, POLL_MS); wake = () => { clearTimeout(t); r() } })
      if (cancelled) throw fail('cancelled')
      if (Date.now() > until) throw fail('timeout')
      let r: { status: number; json: any }
      try { r = await exchange(state, nonce) } catch { continue } // 잠깐 끊겨도 계속 묻는다
      if (r.status === 202) continue
      if (r.status !== 200) throw linkFail(r) ?? fromServer(r.status, String(r.json.error ?? ''))
      return r.json
    }
  } finally { pending = undefined }
}

// ── 08 §3.1.1 로그인 방법 연결 ──
/** 연결 전용 서버 오류: 409(남의 계정·이미 다른 계정·마지막 방법)는 서버 한국어 문구 그대로, 401은 로그인 만료 */
function linkFail(r: { status: number; json: any }): SocialFail | null {
  if (r.status === 409 && typeof r.json.error === 'string') return new SocialFail('conflict', r.json.error)
  if (r.status === 401 && /unauthorized/.test(String(r.json.error ?? ''))) return fail('unauthorized')
  if (r.status === 429 && typeof r.json.error === 'string') return new SocialFail('rate', r.json.error)
  return null
}
async function sessionToken(): Promise<string> {
  const { token } = await serverAccess()
  if (!token) throw fail('unauthorized')
  return token
}
const toIdentities = (json: any): LinkedIdentity[] =>
  (Array.isArray(json?.identities) ? json.identities : [])
    .filter((x: any) => x && (x.provider === 'google' || x.provider === 'apple'))
    .map((x: any) => ({ provider: x.provider, email: typeof x.email === 'string' ? x.email : null }))

async function linkGoogle(): Promise<LinkResult> {
  await sessionToken() // 로그인 안 했으면 브라우저를 열지 않는다
  const { idToken, nonce } = await googleIdToken()
  const r = await post('/auth/link/google', { id_token: idToken, nonce }, await sessionToken()) // 브라우저에 오래 있었으면 새 토큰
  if (r.status !== 200) throw linkFail(r) ?? (r.status === 503 ? fail('no_google') : fromServer(r.status, String(r.json.error ?? '')))
  return { ok: true, linked: !!r.json.linked, identities: toIdentities(r.json) }
}
async function linkApple(): Promise<LinkResult> {
  await sessionToken()
  const json = await appleFlow(async (state, nonce) => post('/auth/link/apple', { state, nonce }, await sessionToken()))
  return { ok: true, linked: !!json.linked, identities: toIdentities(json) }
}
async function unlink(provider: SocialProvider): Promise<LinkResult> {
  const r = await post(`/auth/link/${provider}`, undefined, await sessionToken(), 'DELETE')
  if (r.status !== 200) throw linkFail(r) ?? fromServer(r.status, String(r.json.error ?? ''))
  return { ok: true, linked: false, identities: toIdentities(r.json) }
}
async function loginMethods(): Promise<LoginMethods> {
  const res = await fetch(`${apiBase()}/auth/me`, { headers: { authorization: `Bearer ${await sessionToken()}` }, signal: AbortSignal.timeout(15_000) }).catch(() => { throw fail('network') })
  const json = (await res.json().catch(() => ({}))) as any
  if (!res.ok) throw linkFail({ status: res.status, json }) ?? fail('network')
  return { ok: true, hasPassword: json.has_password !== false, identities: toIdentities(json) }
}
const asFail = (e: unknown) => {
  const f = e instanceof SocialFail ? e : fail('rejected')
  if (!(e instanceof SocialFail)) console.warn('[social] 연결 실패:', e)
  return { ok: false as const, error: f.message, code: f.code }
}

/** index.ts openLink가 sprout://auth/… 를 넘긴다 */
export function handleAuthLink(url: string) {
  const m = /^sprout:\/\/auth\/apple\/?\?(.*)$/.exec(url)
  if (!m) return
  const state = new URLSearchParams(m[1]).get('state')
  if (state && pending?.provider === 'apple') pending.nudge?.(state)
}

export async function socialStatus(): Promise<SocialStatus> {
  const apple = await appleConfig().then((c) => !!c).catch(() => null)
  return { google: !!googleClient().id, apple, waiting: pending?.provider ?? null }
}

export function registerSocialAuth() {
  ipcMain.handle('auth:social-status', () => socialStatus())
  ipcMain.handle('auth:social', async (_e, provider: SocialProvider): Promise<SocialResult> => {
    if (pending) return { ok: false, error: MSG.busy, code: 'busy' }
    try {
      return { ok: true, state: provider === 'apple' ? await signInApple() : await signInGoogle() }
    } catch (e) {
      const f = e instanceof SocialFail ? e : fail('rejected')
      if (!(e instanceof SocialFail)) console.warn('[social] 로그인 실패:', e)
      return { ok: false, error: f.message, code: f.code }
    }
  })
  ipcMain.handle('auth:social-cancel', () => { pending?.cancel() })
  // 08 §3.1.1 설정 › 계정 › 로그인 방법
  ipcMain.handle('auth:login-methods', async (): Promise<LoginMethods> => { try { return await loginMethods() } catch (e) { return asFail(e) } })
  ipcMain.handle('auth:link', async (_e, provider: SocialProvider): Promise<LinkResult> => {
    if (pending) return { ok: false, error: MSG.busy, code: 'busy' }
    try { return provider === 'apple' ? await linkApple() : await linkGoogle() } catch (e) { return asFail(e) }
  })
  ipcMain.handle('auth:unlink', async (_e, provider: SocialProvider): Promise<LinkResult> => { try { return await unlink(provider) } catch (e) { return asFail(e) } })
}
