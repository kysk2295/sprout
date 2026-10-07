// 계정·동기화 (20 §4.3, 08) — 데스크톱 apps/desktop/src/main/sync.ts와 같은 흐름
// - 이메일·구글(20 §4.3.1) 로그인 → JWT. 세션(리프레시 토큰 포함)은 expo-secure-store(iOS 키체인·Android Keystore)에 둔다.
// - 리프레시 토큰은 쓸 때마다 바뀐다 → 새로 고침은 한 번에 하나만(single-flight), 본 앱만 한다(공유 확장은 액세스 토큰만 읽기, 24).
// - 첫 로그인: 서버에 내 데이터가 있으면 로컬을 비우고 내려받는다. 없으면(새 계정) 기본함만 만들어 올린다
//   (휴대폰에는 로그인 전 데이터가 없다 — 20 §4.3).
// - 업로드: POST /sync/upload. 400은 버리고 진행, 그 밖(409·네트워크·5xx)은 다시 시도.
import * as SecureStore from 'expo-secure-store'
import { useSyncExternalStore } from 'react'
import { UpdateType, type AbstractPowerSyncDatabase, type PowerSyncBackendConnector } from '@powersync/react-native'
import { seedStatements } from '@sprout/schema/seed'
import { ensureInbox, inboxIdFor } from '@sprout/schema/inbox'
import { API_URL, SYNC_URL } from '../config'
import { CONNECT_OPTIONS, coreDb, db, run } from './db'
import { deviceId } from './device'
import { GoogleSignInError, googleIdToken } from './google'
import { AppleSignInError, appleCredential } from './apple'

const KEY = 'sprout.session.v1'

export type User = { id: string; email: string }
type Session = { user: User; access_token: string; refresh_token: string; expires_at: number }
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

// ── 상태(화면은 useAuth로 구독) ──
let session: Session | undefined
let status: AuthStatus = 'loading'
let snapshot: { status: AuthStatus; user: User | null } = { status, user: null }
const listeners = new Set<() => void>()
function emit() {
  snapshot = { status, user: session?.user ?? null }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
export const useAuth = () => useSyncExternalStore(subscribe, () => snapshot)
/** 지금 로그인한 사용자 id(로컬에 새로 쓰는 행의 owner_id — 서버는 어차피 토큰 사용자로 강제한다) */
export const currentUserId = () => session?.user.id ?? 'local'
/** 로그인했으면 사용자 id, 아니면 null(기본함 id inbox-<userId>를 정할 때) */
export const signedInUserId = () => session?.user.id ?? null

// ── 저장 ──
async function save(s: Session | undefined) {
  session = s
  if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s))
  else await SecureStore.deleteItemAsync(KEY)
}
async function load(): Promise<Session | undefined> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    return raw ? (JSON.parse(raw) as Session) : undefined
  } catch {
    return undefined
  }
}

// ── API ──
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
export async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  let res: Response
  const abort = init.timeoutMs ? new AbortController() : undefined
  const timer = abort ? setTimeout(() => abort.abort(), init.timeoutMs) : undefined
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
      signal: abort?.signal,
      body: init.body ? JSON.stringify(init.body) : undefined
    })
  } catch {
    throw new ApiError('network', 0)
  } finally {
    if (timer) clearTimeout(timer)
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  return json as T
}
type TokenResponse = { user: User; access_token: string; refresh_token: string; expires_in: number }
const toSession = (r: TokenResponse): Session => ({ user: r.user, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000 })

let refreshing: Promise<string | null> | undefined
/** 접근 토큰이 5분 안에 끝나면 새로 받는다. 401이면 세션 만료 → 로그아웃 상태 */
export async function freshToken(): Promise<string | null> {
  if (!session) return null
  if (session.expires_at - Date.now() > 5 * 60_000) return session.access_token
  refreshing ??= (async () => {
    const used = session!.refresh_token
    try {
      await save(toSession(await api<TokenResponse>('/auth/refresh', { body: { refresh_token: used } })))
      return session!.access_token
    } catch (e) {
      // 그사이 다른 곳(로그인·공유 확장 등)에서 세션이 새로 바뀌었으면 로그아웃하지 않는다
      if (e instanceof ApiError && e.status === 401) {
        if (session && session.refresh_token !== used) return session.access_token
        await signOutLocal()
      }
      return null
    } finally {
      refreshing = undefined
    }
  })()
  return refreshing
}

/** 서버 기능(AI 프록시 등)을 부를 때: API 주소 + 새 접근 토큰 */
export const serverAccess = async () => ({ url: API_URL, token: await freshToken() })

// ── PowerSync 연결자 ──
export const connector: PowerSyncBackendConnector = {
  async fetchCredentials() {
    const token = await freshToken()
    return token ? { endpoint: SYNC_URL, token } : null
  },
  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch(200)
    if (!batch) return
    const token = await freshToken()
    if (!token) throw new Error('not signed in')
    const ops = batch.crud.map((op) => ({
      op: op.op === UpdateType.PUT ? 'PUT' : op.op === UpdateType.PATCH ? 'PATCH' : 'DELETE',
      table: op.table,
      id: op.id,
      data: op.opData
    }))
    try {
      // 32 §6: 올린 기기는 조용한 동기화·지우기·성장 소식 대상에서 뺀다
      const device = await deviceId().catch(() => null)
      await api('/sync/upload', { body: { batch: ops }, token, headers: device ? { 'x-sprout-device': device } : undefined })
    } catch (e) {
      // 400(형식이 깨진 연산)은 다시 보내도 같다 → 이 묶음은 버리고 진행. 나머지는 다시 시도
      if (e instanceof ApiError && e.status === 400) console.warn('[sync] upload rejected, skipping batch:', e.message)
      else throw e
    }
    await batch.complete()
  }
}

/** 로그인 직후: 서버에 데이터가 있으면 로컬을 비우고 내려받고, 없으면 기본함을 만들어 올린다 */
async function adopt(s: Session) {
  const me = await api<{ has_data: boolean }>('/auth/me', { token: s.access_token })
  await db.disconnectAndClear()
  if (!me.has_data) {
    // 서버는 계정을 만들 때 기본함 inbox-<id>를 만든다 → 같은 id로 만들어야 둘이 되지 않는다(02 §14.1)
    await run(seedStatements(false, new Date(), { inboxId: inboxIdFor(s.user.id), ownerId: s.user.id }))
  }
}

// 08 §8.1 기본함 안전망: 첫 동기화가 끝난 뒤에도 기본함이 없으면 inbox-<userId>로 만든다(예전 서버·손상된 데이터에서도 넣을 곳이 있게)
let inboxWatch: AbortController | undefined
function watchInbox(userId: string) {
  inboxWatch?.abort()
  const ctl = new AbortController()
  inboxWatch = ctl
  void db.waitForFirstSync(ctl.signal)
    .then(async () => {
      if (ctl.signal.aborted || session?.user.id !== userId) return
      await ensureInbox(coreDb, run, { userId, ownerId: userId })
    })
    .catch((e) => { if (!ctl.signal.aborted) console.warn('[sync] 기본함 확인 실패:', e) })
}

/** 서버 토큰 응답 → 첫 로그인 규칙 → 저장 → 동기화(이메일·구글 공용) */
async function signInWithTokens(r: TokenResponse) {
  const s = toSession(r)
  await adopt(s)
  await save(s)
  status = 'signedIn'
  emit()
  void db.connect(connector, CONNECT_OPTIONS)
  watchInbox(s.user.id)
}
async function signIn(path: '/auth/login' | '/auth/signup', email: string, password: string) {
  await signInWithTokens(await api<TokenResponse>(path, { body: { email: email.trim(), password } }))
}
export const login = (email: string, password: string) => signIn('/auth/login', email, password)
export const signup = (email: string, password: string) => signIn('/auth/signup', email, password)

// ── 20 §4.3.1 Google로 계속하기 · 로그인 방법 · 계정 삭제 전 다시 로그인 ──
/** 기기 구글 로그인 → POST /auth/google(nonce 없음 — 서버가 azp≠aud·10분·한 번만으로 확인) → 이메일 로그인과 같은 길 */
export async function loginWithGoogle() {
  const idToken = await googleIdToken()
  await signInWithTokens(await api<TokenResponse>('/auth/google', { body: { id_token: idToken } }))
}

/**
 * 08 §7.1 소셜 전용 계정 삭제 전 다시 로그인: 같은 계정이면 토큰만 바꾼다(로컬 데이터·동기화 그대로, 새 접근 토큰에 auth_time).
 * 다른 계정이면 그 세션을 서버에서 버리고 'reauth: different account'.
 */
export async function reauthWithGoogle() {
  if (!session) throw new ApiError('unauthorized', 401)
  const me = session.user.id
  const idToken = await googleIdToken()
  const r = await api<TokenResponse>('/auth/google', { body: { id_token: idToken } })
  if (r.user.id !== me || !session || session.user.id !== me) {
    void api('/auth/logout', { body: { refresh_token: r.refresh_token } }).catch(() => {})
    throw new Error('reauth: different account')
  }
  await save(toSession(r))
}

// ── 20 §4.3.1 Apple로 계속하기(iOS) · 연결 · 삭제 전 다시 로그인 ──
/** 애플 시스템 창 → POST /auth/apple/native {id_token, nonce, authorization_code} → 이메일 로그인과 같은 길 */
export async function loginWithApple() {
  const cred = await appleCredential()
  await signInWithTokens(await api<TokenResponse>('/auth/apple/native', { body: cred }))
}
/** 08 §7.1 애플로만 가입한 계정 삭제 전 다시 로그인(구글과 같은 규칙: 같은 계정이면 토큰만 바꿈) */
export async function reauthWithApple() {
  if (!session) throw new ApiError('unauthorized', 401)
  const me = session.user.id
  const cred = await appleCredential()
  const r = await api<TokenResponse>('/auth/apple/native', { body: cred })
  if (r.user.id !== me || !session || session.user.id !== me) {
    void api('/auth/logout', { body: { refresh_token: r.refresh_token } }).catch(() => {})
    throw new Error('reauth: different account')
  }
  await save(toSession(r))
}

export type Provider = 'google' | 'apple'
export type LinkedIdentity = { provider: Provider; email: string | null } // email은 서버가 가린 것
export type LoginMethods = { hasPassword: boolean; identities: LinkedIdentity[] }
const toIdentities = (json: unknown): LinkedIdentity[] => {
  const list = (json as { identities?: unknown })?.identities
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && (x.provider === 'google' || x.provider === 'apple'))
    .map((x) => ({ provider: x.provider as Provider, email: typeof x.email === 'string' ? x.email : null }))
}
async function bearer() {
  const token = await freshToken()
  if (!token) throw new ApiError('unauthorized', 401)
  return token
}
/** 설정 › 계정 › 로그인 방법: GET /auth/me의 has_password·identities */
export async function loginMethods(): Promise<LoginMethods> {
  const me = await api<{ has_password?: boolean; identities?: unknown }>('/auth/me', { token: await bearer() })
  return { hasPassword: me.has_password !== false, identities: toIdentities(me) }
}
/** 지금 계정에 구글을 붙인다(로그인하지 않음). 서버 409 문구는 ApiError.message 그대로 */
export async function linkGoogle(): Promise<LinkedIdentity[]> {
  await bearer() // 로그인 안 했으면 구글 창을 열지 않는다
  const idToken = await googleIdToken()
  return toIdentities(await api('/auth/link/google', { body: { id_token: idToken }, token: await bearer() }))
}
/** 지금 계정에 애플을 붙인다(iOS). 서버 409 문구는 ApiError.message 그대로 */
export async function linkApple(): Promise<LinkedIdentity[]> {
  await bearer()
  const cred = await appleCredential()
  return toIdentities(await api('/auth/link/apple/native', { body: cred, token: await bearer() }))
}
export async function unlinkProvider(provider: Provider): Promise<LinkedIdentity[]> {
  return toIdentities(await api(`/auth/link/${provider}`, { method: 'DELETE', token: await bearer() }))
}

/** 소셜 로그인·연결 오류 → 화면 문구. 취소는 null(아무것도 안 띄움). 데스크톱 auth-social.ts MSG와 같은 뜻 */
export function socialErrorText(e: unknown, provider: Provider = e instanceof AppleSignInError ? 'apple' : 'google'): string | null {
  const notReady = provider === 'apple' ? 'Apple 로그인 설정이 아직 없어요' : '구글 로그인 설정이 아직 없어요'
  if (e instanceof AppleSignInError) {
    if (e.code === 'cancelled' || e.code === 'busy') return null
    if (e.code === 'not_configured') return notReady
    return '로그인을 확인하지 못했어요. 다시 시도하세요.'
  }
  if (e instanceof GoogleSignInError) {
    if (e.code === 'cancelled' || e.code === 'busy') return null
    if (e.code === 'not_configured') return '구글 로그인 설정이 아직 없어요'
    if (e.code === 'play_services') return 'Google Play 서비스가 필요해요. 업데이트한 뒤 다시 시도하세요'
    return '로그인을 확인하지 못했어요. 다시 시도하세요.'
  }
  if (e instanceof ApiError) {
    if (e.status === 0) return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
    if (e.status === 503 || /not configured/.test(e.message)) return notReady
    if (e.status === 429) return /분 뒤/.test(e.message) ? e.message : '잠시 뒤 다시 시도하세요'
    if (e.status === 409) return e.message // 연결: 서버 한국어 문구
    if (provider === 'apple' && /email required/.test(e.message)) return 'Apple이 이메일을 보내지 않았어요. 설정 › Apple ID › Apple로 로그인에서 꿈틀을 지운 뒤 다시 시도하세요.'
    if (/not verified/.test(e.message)) return '이메일이 확인되지 않은 계정이에요. 이메일을 확인한 뒤 다시 시도하세요.'
    if (e.status === 401 && /^unauthorized$/.test(e.message)) return '로그인이 만료됐어요. 다시 로그인한 뒤 시도하세요'
    if (e.status >= 500) return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
  }
  if (e instanceof Error && /different account/.test(e.message)) return '로그인을 확인하지 못했어요. 다시 시도하세요. 삭제할 계정과 같은 계정으로 로그인하세요.'
  return '로그인을 확인하지 못했어요. 다시 시도하세요.'
}

async function signOutLocal() {
  inboxWatch?.abort()
  inboxWatch = undefined
  await db.disconnectAndClear()
  await save(undefined)
  status = 'signedOut'
  emit()
}
/**
 * 로그아웃: 이 기기의 내 데이터를 지우고 처음 상태로(다음 사람에게 보이지 않게 — 데스크톱과 같음).
 * 32 §3.2: 접근 토큰이 살아 있을 때 먼저 이 기기 푸시 등록을 지우고(DELETE /push/devices/:id, 3초까지만 기다림),
 * /auth/logout에도 device_id를 실어 그 DELETE가 실패해도 서버가 정리하게 한다.
 */
export async function logout() {
  const s = session
  const device = await deviceId().catch(() => null)
  if (s && device) {
    const token = await freshToken().catch(() => null)
    if (token) await api(`/push/devices/${device}`, { method: 'DELETE', token, timeoutMs: 3000 }).catch(() => {})
  }
  await signOutLocal()
  if (s) await api('/auth/logout', { body: { refresh_token: s.refresh_token, ...(device ? { device_id: device } : {}) } }).catch(() => {})
}

/** 앱 시작: 저장된 세션이 있으면 바로 로그인 상태로(로컬 퍼스트) 열고 동기화를 붙인다 */
let started: Promise<void> | undefined
export function startAuth() {
  started ??= (async () => {
    await db.init()
    session = await load()
    status = session ? 'signedIn' : 'signedOut'
    emit()
    if (session) { void db.connect(connector, CONNECT_OPTIONS); watchInbox(session.user.id) }
  })()
  return started
}

/** 당겨서 새로 고침·설정의 "지금 동기화": 끊겨 있으면 다시 붙이고, 내려받기가 끝날 때까지(최대 8초) 기다린다 */
export async function syncNow() {
  if (!session) return
  if (!db.currentStatus.connected) await db.connect(connector, CONNECT_OPTIONS)
  const started = Date.now()
  await new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      const s = db.currentStatus
      const idle = s.connected && !s.dataFlowStatus.downloading && !s.dataFlowStatus.uploading
      if ((idle && Date.now() - started > 600) || Date.now() - started > 8000) {
        clearInterval(tick)
        resolve()
      }
    }, 200)
  })
}

/** 08 §4 오류 문구: 서버 오류 코드 → 한국어(데스크톱 data/auth.ts와 같은 표) */
export function authErrorText(e: unknown): string {
  const error = e instanceof Error ? e.message : String(e)
  if (/invalid email/.test(error)) return '이메일 주소를 확인하세요'
  if (/invalid credentials|unauthorized/.test(error)) return '이메일 또는 비밀번호가 맞지 않아요'
  if (/already registered/.test(error)) return '이미 가입된 이메일이에요'
  if (/password must/.test(error)) return '비밀번호는 6-64자로 입력하세요'
  if (/too many/.test(error)) return '잠시 뒤 다시 시도하세요'
  return '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요'
}
