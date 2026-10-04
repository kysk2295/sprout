// 계정·동기화 (20 §4.3, 08) — 데스크톱 apps/desktop/src/main/sync.ts와 같은 흐름
// - 이메일 로그인 → JWT. 세션(리프레시 토큰 포함)은 expo-secure-store(iOS 키체인·Android Keystore)에 둔다.
// - 리프레시 토큰은 쓸 때마다 바뀐다 → 새로 고침은 한 번에 하나만(single-flight), 본 앱만 한다(공유 확장은 액세스 토큰만 읽기, 24).
// - 첫 로그인: 서버에 내 데이터가 있으면 로컬을 비우고 내려받는다. 없으면(새 계정) 기본함만 만들어 올린다
//   (휴대폰에는 로그인 전 데이터가 없다 — 20 §4.3).
// - 업로드: POST /sync/upload. 400은 버리고 진행, 그 밖(409·네트워크·5xx)은 다시 시도.
import * as SecureStore from 'expo-secure-store'
import { useSyncExternalStore } from 'react'
import { UpdateType, type AbstractPowerSyncDatabase, type PowerSyncBackendConnector } from '@powersync/react-native'
import { seedStatements } from '@sprout/schema/seed'
import { API_URL, SYNC_URL } from '../config'
import { db, run } from './db'

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
export async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined
    })
  } catch {
    throw new ApiError('network', 0)
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
    try {
      await save(toSession(await api<TokenResponse>('/auth/refresh', { body: { refresh_token: session!.refresh_token } })))
      return session!.access_token
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await signOutLocal()
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
      await api('/sync/upload', { body: { batch: ops }, token })
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
    await run(seedStatements(false))
    await db.execute('UPDATE lists SET owner_id = ?', [s.user.id])
  }
}

async function signIn(path: '/auth/login' | '/auth/signup', email: string, password: string) {
  const s = toSession(await api<TokenResponse>(path, { body: { email: email.trim(), password } }))
  await adopt(s)
  await save(s)
  status = 'signedIn'
  emit()
  void db.connect(connector)
}
export const login = (email: string, password: string) => signIn('/auth/login', email, password)
export const signup = (email: string, password: string) => signIn('/auth/signup', email, password)

async function signOutLocal() {
  await db.disconnectAndClear()
  await save(undefined)
  status = 'signedOut'
  emit()
}
/** 로그아웃: 이 기기의 내 데이터를 지우고 처음 상태로(다음 사람에게 보이지 않게 — 데스크톱과 같음) */
export async function logout() {
  const s = session
  await signOutLocal()
  if (s) await api('/auth/logout', { body: { refresh_token: s.refresh_token } }).catch(() => {})
}

/** 앱 시작: 저장된 세션이 있으면 바로 로그인 상태로(로컬 퍼스트) 열고 동기화를 붙인다 */
let started: Promise<void> | undefined
export function startAuth() {
  started ??= (async () => {
    await db.init()
    session = await load()
    status = session ? 'signedIn' : 'signedOut'
    emit()
    if (session) void db.connect(connector)
  })()
  return started
}

/** 당겨서 새로 고침·설정의 "지금 동기화": 끊겨 있으면 다시 붙이고, 내려받기가 끝날 때까지(최대 8초) 기다린다 */
export async function syncNow() {
  if (!session) return
  if (!db.currentStatus.connected) await db.connect(connector)
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
