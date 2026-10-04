// 계정·동기화 (PRD E): 이메일 로그인 → JWT → PowerSync 연결.
// - 로그인 정보(리프레시 토큰)는 OS 키체인으로 암호화(safeStorage)해서 userData/auth.bin에 둔다.
// - 첫 로그인: 서버에 내 데이터가 없으면 이 기기의 로컬 데이터를 내 계정으로 올리고,
//   이미 있으면(다른 기기에서 쓰던 계정) 로컬 시드를 지우고 서버 데이터를 내려받는다.
import { app, ipcMain, safeStorage, BrowserWindow } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UpdateType, type AbstractPowerSyncDatabase, type PowerSyncBackendConnector } from '@powersync/node'
import { LOCAL_OWNER, TABLES } from '@sprout/schema'
import { db } from './db'
import { ensureSeed } from './seed'
import { forgetTickTick } from './ticktick'
import { forgetCalendars } from './calendars'
import { clearWidget } from './widget'

// 기본 = Mac mini 서버(Tailscale Funnel 공개 주소, 2026-10-05). 이 Mac의 개발 서버는 SPROUT_API_URL=http://127.0.0.1:6060 SPROUT_SYNC_URL=http://127.0.0.1:8089
const API_URL = process.env.SPROUT_API_URL ?? 'https://macmini.tail425c97.ts.net'
const SYNC_URL = process.env.SPROUT_SYNC_URL ?? 'https://macmini.tail425c97.ts.net:8443'
const AUTH_FILE = () => join(app.getPath('userData'), 'auth.bin')

type Session = { user: { id: string; email: string }; access_token: string; refresh_token: string; expires_at: number }
let session: Session | undefined

// newAccount: 이 기기에서 방금 새 계정을 만들었다(가입·구글·애플 첫 로그인) → 화면이 첫 실행 안내(18)를 띄운다. 이번 실행 동안만
let newAccount = false
export type AuthState = { user: { id: string; email: string } | null; newAccount?: boolean; sync: { connected: boolean; uploading: boolean; downloading: boolean; lastSyncedAt: string | null; error: string | null } }

// ── 저장 ──
function save(s: Session | undefined) {
  session = s
  const file = AUTH_FILE()
  if (!s) { if (existsSync(file)) rmSync(file); return }
  const raw = JSON.stringify(s)
  writeFileSync(file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(raw) : Buffer.from(raw), { mode: 0o600 })
}
function load(): Session | undefined {
  const file = AUTH_FILE()
  if (!existsSync(file)) return
  try {
    const buf = readFileSync(file)
    return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8'))
  } catch { return undefined }
}

// ── API ──
class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  return json as T
}
type TokenResponse = { user: { id: string; email: string }; access_token: string; refresh_token: string; expires_in: number }
const toSession = (r: TokenResponse): Session => ({ user: r.user, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000 })

/** 접근 토큰이 5분 안에 끝나면 새로 받는다 */
async function freshToken(): Promise<string | null> {
  if (!session) return null
  if (session.expires_at - Date.now() > 5 * 60_000) return session.access_token
  try {
    save(toSession(await api<TokenResponse>('/auth/refresh', { body: { refresh_token: session.refresh_token } })))
    return session!.access_token
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { save(undefined); broadcast() } // 세션 만료 → 로그아웃 상태
    return null
  }
}

// ── PowerSync 연결자 ──
const connector: PowerSyncBackendConnector = {
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
      // 400(형식이 깨진 연산)은 다시 보내도 같다 → 이 묶음은 버리고 진행(로그 남김).
      // 409(서버가 모르는 테이블·칸 = 서버가 앱보다 오래됨)·네트워크·5xx는 버리지 않고 다시 시도한다
      if (e instanceof ApiError && e.status === 400) console.error('[sync] upload rejected, skipping batch:', e.message)
      else throw e
    }
    await batch.complete()
  }
}

// ── 상태 알림 ──
function state(): AuthState {
  const s = db.currentStatus
  return {
    user: session?.user ?? null,
    newAccount: !!session && newAccount,
    sync: {
      connected: !!s?.connected,
      uploading: !!s?.dataFlowStatus?.uploading,
      downloading: !!s?.dataFlowStatus?.downloading,
      lastSyncedAt: s?.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
      error: (s?.dataFlowStatus?.uploadError ?? s?.dataFlowStatus?.downloadError)?.message ?? null
    }
  }
}
function broadcast() {
  const st = state()
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('auth:state', st)
}

/** 로그인 직후: 서버에 데이터가 있으면 로컬을 비우고 내려받고, 없으면 로컬 데이터를 내 계정으로 옮겨 올린다 */
async function adopt(s: Session) {
  const me = await api<{ has_data: boolean }>('/auth/me', { token: s.access_token })
  if (me.has_data) {
    await db.disconnectAndClear()
  } else {
    await db.writeTransaction(async (tx) => {
      // 예전 고정 id 설정 행은 uuid로 바꾼다(서버에서 다른 사용자와 겹치지 않게)
      const old = await tx.getOptional<Record<string, unknown>>("SELECT * FROM user_prefs WHERE id = 'prefs-local'")
      if (old) {
        const { id: _id, ...rest } = old
        const cols = Object.keys(rest)
        await tx.execute(`INSERT INTO user_prefs (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`, [crypto.randomUUID(), ...cols.map((c) => rest[c])])
        await tx.execute("DELETE FROM user_prefs WHERE id = 'prefs-local'")
      }
      for (const t of Object.keys(TABLES)) await tx.execute(`UPDATE ${t} SET owner_id = ? WHERE owner_id = ? OR owner_id IS NULL`, [s.user.id, LOCAL_OWNER])
    })
  }
}

async function signIn(path: '/auth/login' | '/auth/signup', email: string, password: string): Promise<AuthState> {
  return signInWithTokens(await api<TokenResponse>(path, { body: { email, password } }), path === '/auth/signup')
}

/** 08 §3.1 구글·애플: 서버가 준 토큰 응답(/auth/google·/auth/apple)으로 이메일 로그인과 같은 길(adopt → 저장 → 동기화)을 탄다 */
export const apiBase = () => API_URL
export async function signInWithTokens(r: TokenResponse & { created?: boolean }, created = !!r.created): Promise<AuthState> {
  const s = toSession(r)
  newAccount = created
  await adopt(s)
  save(s)
  await db.connect(connector)
  broadcast()
  return state()
}

export const isSignedIn = () => !!session
/** 서버 AI 프록시 호출용: API 주소 + 새 접근 토큰(로그인 안 했으면 null) */
export const serverAccess = async () => ({ url: API_URL, token: await freshToken() })

export async function startSync() {
  session = load()
  db.registerListener({ statusChanged: () => broadcast() })
  if (session) void db.connect(connector)

  ipcMain.handle('auth:state', () => state())
  ipcMain.handle('auth:login', async (_e, email: string, password: string) => {
    try { return { ok: true, state: await signIn('/auth/login', email, password) } } catch (e) { return { ok: false, error: e instanceof ApiError ? e.message : String(e) } }
  })
  ipcMain.handle('auth:signup', async (_e, email: string, password: string) => {
    try { return { ok: true, state: await signIn('/auth/signup', email, password) } } catch (e) { return { ok: false, error: e instanceof ApiError ? e.message : String(e) } }
  })
  ipcMain.handle('auth:sync-now', async () => { if (session) await db.connect(connector) })
  ipcMain.handle('auth:logout', async () => {
    const s = session
    // 로그아웃하면 이 기기의 내 데이터를 지우고 처음 상태로 돌아간다(다음 사람에게 보이지 않게)
    await db.disconnectAndClear()
    save(undefined)
    newAccount = false
    await forgetTickTick() // 17: 로그아웃하면 틱틱 연결도 끊는다
    await forgetCalendars().catch((e) => console.warn('[calendars] 로그아웃 정리 실패:', e)) // 16 결정 ⑤: 구글 연결 끊기·캐시 삭제
    await clearWidget().catch((e) => console.warn('[widget] 로그아웃 정리 실패:', e)) // 25 §8.8: 위젯에 할 일 제목이 남지 않게
    // 설정 창이 열려 있으면 닫는다(로그아웃한 계정 정보가 남아 보이지 않게)
    for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('window=settings')) w.close()
    await ensureSeed(process.env.SPROUT_SEED !== '0' && (!app.isPackaged || process.env.SPROUT_SEED === '1'))
    if (s) await api('/auth/logout', { body: { refresh_token: s.refresh_token } }).catch(() => {})
    broadcast()
    return state()
  })
}
