// 계정·동기화 (20 §4.3, 08) — 데스크톱 apps/desktop/src/main/sync.ts와 같은 흐름
// - 이메일·구글(20 §4.3.1) 로그인 → JWT. 세션(리프레시 토큰 포함)은 expo-secure-store(iOS 키체인·Android Keystore)에 둔다.
// - 리프레시 토큰은 쓸 때마다 바뀐다 → 새로 고침은 한 번에 하나만(single-flight), 본 앱만 한다(공유 확장은 액세스 토큰만 읽기, 24).
// - 첫 로그인: 서버에 내 데이터가 있으면 로컬을 비우고 내려받는다. 없으면(새 계정) 기본함만 만들어 올린다
//   (휴대폰에는 로그인 전 데이터가 없다 — 20 §4.3).
// - 업로드: POST /sync/upload. 400은 버리고 진행, 그 밖(409·네트워크·5xx)은 다시 시도.
import * as SecureStore from 'expo-secure-store'
import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { UpdateType, type AbstractPowerSyncDatabase, type PowerSyncBackendConnector } from '@powersync/react-native'
import { seedStatements } from '@sprout/schema/seed'
import { ensureInbox, inboxIdFor } from '@sprout/schema/inbox'
import { API_URL, SYNC_URL } from '../config'
import { CONNECT_OPTIONS, coreDb, db, run } from './db'
import { deviceId } from './device'
import { slog } from './syncLog'
import { clearDiaryPrefs } from '../diary/prefs'
import { GoogleSignInError, googleIdToken } from './google'
import { AppleSignInError, appleCredential } from './apple'

const KEY = 'sprout.session.v1'
/** 로그인이 만료된 계정(데이터·안 올린 변경은 기기에 그대로) — 같은 계정으로 다시 들어오면 지우지 않고 이어서 올린다 */
const STALE_KEY = 'sprout.session.stale'
/** 2026-10-21: 화면이 잠긴 채 배경에서 토큰을 새로 고치면 키체인 쓰기가 막혀(기본 WHEN_UNLOCKED) 새 리프레시 토큰을 잃었다 → 첫 잠금 해제 뒤면 쓰게 */
const KC = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

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
  if (!s) { await SecureStore.deleteItemAsync(KEY, KC).catch(() => {}); return }
  // 저장이 실패해도 이번 실행은 메모리 세션으로 계속 — 다음에 앞으로 올 때 다시 쓴다(옛 토큰이 남으면 다음 실행에서 로그인이 풀린다)
  try { await SecureStore.setItemAsync(KEY, JSON.stringify(s), KC); unsaved = false } catch (e) { unsaved = true; slog('session: 저장 실패', e) }
}
let unsaved = false
const retrySave = () => { if (unsaved && session) void save(session) }
let staleUser: User | null | undefined
export async function staleAccount(): Promise<User | null> {
  if (staleUser === undefined) {
    try { const raw = await SecureStore.getItemAsync(STALE_KEY); staleUser = raw ? (JSON.parse(raw) as User) : null } catch { staleUser = null }
  }
  return staleUser
}
async function setStale(u: User | null) {
  staleUser = u
  if (u) await SecureStore.setItemAsync(STALE_KEY, JSON.stringify(u), KC).catch(() => {})
  else await SecureStore.deleteItemAsync(STALE_KEY).catch(() => {})
}
/** 로그인 만료(리프레시 401): 지우지 않는다. 연결만 끊고 로그인 화면으로 — 같은 계정으로 다시 들어오면 쌓인 변경을 그대로 올린다 */
async function expireLocal() {
  const u = session?.user ?? null
  slog('session: 만료 — 기기 데이터는 그대로 두고 다시 로그인 대기', u?.id.slice(0, 8))
  inboxWatch?.abort()
  inboxWatch = undefined
  // 화면부터 로그인으로(세션을 먼저 비워 다시 연결 시도가 멈추게), 연결 끊기는 기다리되 오래 걸리면 그냥 넘어간다
  await setStale(u)
  await save(undefined)
  status = 'signedOut'
  emit()
  await Promise.race([db.disconnect().catch((e) => slog('session: 연결 끊기 실패', e)), new Promise((r) => setTimeout(r, 5000))])
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
  // 2026-10-25 QA: 시간 제한이 없으면 서버가 멈출 때 화면(로그인 방법·로그아웃)이 끝없이 돈다 — 기본 20초
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), init.timeoutMs ?? 20_000)
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
      signal: abort.signal,
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
  if (!session) { slog('token: 세션 없음'); return null }
  if (session.expires_at - Date.now() > 5 * 60_000) return session.access_token
  refreshing ??= (async () => {
    const used = session!.refresh_token
    slog('token: 새로 고침 시작, 만료까지', Math.round((session!.expires_at - Date.now()) / 1000), 's')
    try {
      const r = await api<TokenResponse>('/auth/refresh', { body: { refresh_token: used }, timeoutMs: 20_000 })
      slog('token: 새로 고침 성공')
      await save(toSession(r))
      return session!.access_token
    } catch (e) {
      // 그사이 다른 곳(로그인·공유 확장 등)에서 세션이 새로 바뀌었으면 로그아웃하지 않는다
      slog('token: 새로 고침 실패', e instanceof ApiError ? `${e.status} ${e.message}` : e)
      console.warn('[sync] 토큰 새로 고침 실패:', e instanceof ApiError ? `${e.status} ${e.message}` : e)
      if (e instanceof ApiError && e.status === 401) {
        if (session && session.refresh_token !== used) return session.access_token
        // 2026-10-25 QA(Android 에뮬레이터): 여기서 기다리면 교착 — 동기화 연결이 이 토큰을 기다리는 중인데
        // expireLocal이 그 연결이 끝나길(disconnect) 기다렸다 → 로그인 상태로 멈추고 로그아웃도 안 됨. 기다리지 않고 바로 null
        setTimeout(() => void expireLocal(), 0)
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
    slog('credentials:', token ? 'ok' : 'null')
    return token ? { endpoint: SYNC_URL, token } : null
  },
  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch(200)
    if (!batch) return
    slog('upload: 시작', batch.crud.length, '건')
    const token = await freshToken()
    if (!token) throw new Error('not signed in')
    const ops = batch.crud.map((op) => ({
      op: op.op === UpdateType.PUT ? 'PUT' : op.op === UpdateType.PATCH ? 'PATCH' : 'DELETE',
      table: op.table,
      id: op.id,
      data: op.opData
    }))
    // 32 §6: 올린 기기는 조용한 동기화·지우기·성장 소식 대상에서 뺀다
    const device = await deviceId().catch(() => null)
    const send = (b: typeof ops) => api('/sync/upload', { body: { batch: b }, token, headers: device ? { 'x-sprout-device': device } : undefined })
    try {
      await send(ops)
      slog('upload: 성공')
    } catch (e) {
      slog('upload: 실패', e instanceof ApiError ? `${e.status} ${e.message}` : e)
      // 400(형식이 깨진 연산)은 다시 보내도 같다. 묶음째 버리면 정상 변경까지 사라지니(2026-10-11 Codex 리뷰)
      // 한 건씩 다시 보내 깨진 연산만 버린다. 나머지 오류는 다시 시도
      if (!(e instanceof ApiError && e.status === 400)) throw e
      for (const op of ops) {
        try { await send([op]) } catch (e1) {
          if (e1 instanceof ApiError && e1.status === 400) console.warn('[sync] upload rejected, skipping op:', op.table, op.id, e1.message)
          else throw e1
        }
      }
    }
    await batch.complete()
  }
}

/** 로그인 직후: 서버에 데이터가 있으면 로컬을 비우고 내려받고, 없으면 기본함을 만들어 올린다 */
async function adopt(s: Session) {
  const me = await api<{ has_data: boolean }>('/auth/me', { token: s.access_token })
  // 만료됐던 같은 계정이면 지우지 않는다 — 기기에 쌓인 변경을 그대로 올리고, 내려받기로 맞춘다
  const stale = await staleAccount()
  if (stale && stale.id === s.user.id) { slog('login: 만료됐던 같은 계정 — 기기 데이터 유지'); await setStale(null); return }
  if (stale) await setStale(null)
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
  await save(undefined)
  void clearDiaryPrefs() // 다음 계정이 앞 사람의 일기 AI 나누기 동의·쓰기 방식을 물려받지 않게(2026-10-25 QA)
  status = 'signedOut'
  emit()
  // 연결이 토큰을 기다리며 멈춰 있어도 로그아웃은 끝나야 한다(교착 방지): 8초 안에 못 지우면 끊고 한 번 더
  const done = await Promise.race([db.disconnectAndClear().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 8000))])
  if (!done) { slog('logout: 지우기 늦음 — 다시'); await db.disconnect().catch(() => {}); await db.disconnectAndClear().catch((e) => slog('logout: 지우기 실패', e)) }
}
/**
 * 로그아웃: 이 기기의 내 데이터를 지우고 처음 상태로(다음 사람에게 보이지 않게 — 데스크톱과 같음).
 * 32 §3.2: 접근 토큰이 살아 있을 때 먼저 이 기기 푸시 등록을 지우고(DELETE /push/devices/:id, 3초까지만 기다림),
 * /auth/logout에도 device_id를 실어 그 DELETE가 실패해도 서버가 정리하게 한다.
 */
/** 아직 서버에 안 올라간 변경 수 */
export const pendingUploads = async () => (await db.getOptional<{ n: number }>('SELECT count(*) AS n FROM ps_crud'))?.n ?? 0

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
    slog('start: 세션', session ? `있음(${session.user.id.slice(0, 8)}, 토큰 만료까지 ${Math.round((session.expires_at - Date.now()) / 60000)}분)` : '없음', 'sync', SYNC_URL)
    status = session ? 'signedIn' : 'signedOut'
    emit()
    if (session) { void db.connect(connector, CONNECT_OPTIONS); watchInbox(session.user.id) }
    watchForeground()
  })()
  return started
}

/** 2026-10-21 실측: 휴대폰이 10-14부터 한 번도 서버에 붙지 않아 변경 22건이 쌓여 있었다(서버·데스크톱은 정상).
 *  iOS가 배경에서 연결을 끊은 뒤 다시 붙지 않는 경우를 막는다 — 앞으로 올 때마다, 그리고 앞에 있는 동안 1분마다
 *  로그인돼 있는데 끊겨 있으면 다시 붙인다(올릴 것이 쌓여 있어도 같은 길로 올라간다) */
let fgWatch: { remove: () => void } | undefined
let fgTimer: ReturnType<typeof setInterval> | undefined
function watchForeground() {
  if (fgWatch) return
  const kick = (why: string) => {
    if (!session || db.currentStatus.connected || db.currentStatus.connecting) return
    slog('reconnect:', why)
    console.warn('[sync] 다시 연결:', why)
    void db.connect(connector, CONNECT_OPTIONS).catch((e) => console.warn('[sync] 다시 연결 실패:', e))
  }
  // 상태가 바뀔 때마다 기록(연결·오류)
  let last = ''
  db.registerListener({ statusChanged: (s) => {
    const e = s.dataFlowStatus
    const line = `status: connected=${s.connected} connecting=${s.connecting} synced=${s.lastSyncedAt?.toISOString?.() ?? '-'} up=${e.uploading} down=${e.downloading} upErr=${e.uploadError?.message ?? '-'} downErr=${e.downloadError?.message ?? '-'}`
    if (line !== last) { last = line; slog(line) }
  } })
  fgWatch = AppState.addEventListener('change', (s) => { if (s === 'active') { retrySave(); kick('앞으로 옴') } })
  fgTimer = setInterval(() => { if (AppState.currentState === 'active') kick('1분 확인') }, 60_000)
}

/** 당겨서 새로 고침·설정의 "지금 동기화": 끊겨 있으면 다시 붙이고, 내려받기가 끝날 때까지(최대 8초) 기다린 뒤 **결과를 돌려준다**.
 *  예전엔 아무것도 돌려주지 않아 서버에 못 붙어도 "동기화했어요"가 떴다(2026-10-25 — 아이폰이 10-14부터 조용히 끊겨 있던 일) */
export type SyncResult = { ok: boolean; pending: number; message: string }
export async function syncNow(): Promise<SyncResult> {
  slog('syncNow: 눌림, 세션', session ? '있음' : '없음', 'connected', db.currentStatus.connected)
  if (!session) return { ok: false, pending: 0, message: '로그인이 필요해요' }
  try { if (!db.currentStatus.connected) await db.connect(connector, CONNECT_OPTIONS) } catch (e) { slog('syncNow: 연결 실패', e) }
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
  const s = db.currentStatus
  const pending = await pendingUploads().catch(() => 0)
  const r: SyncResult = !s.connected ? { ok: false, pending, message: pending ? `서버에 연결하지 못했어요 · 안 올라간 변경 ${pending}개는 기기에 그대로 있어요` : '서버에 연결하지 못했어요. 인터넷을 확인해 주세요' }
    : s.dataFlowStatus.uploadError ? { ok: false, pending, message: `변경 ${pending}개를 올리지 못했어요 · 저절로 다시 시도해요` }
    : s.dataFlowStatus.downloadError ? { ok: false, pending, message: '내려받지 못했어요 · 저절로 다시 시도해요' }
    : pending ? { ok: true, pending, message: `동기화 중이에요 · 변경 ${pending}개 올리는 중` }
    : { ok: true, pending: 0, message: '동기화했어요' }
  slog('syncNow: 결과', r.message)
  return r
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
