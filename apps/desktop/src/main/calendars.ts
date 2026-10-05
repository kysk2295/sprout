// 16 캘린더 연동(구글·Apple 읽기 전용) — Electron 연결: 캐시 파일·토큰(safeStorage)·IPC·새로 고침 주기·로그아웃 정리.
// 구글 클라이언트: 환경 변수 GOOGLE_CLIENT_ID (+ GOOGLE_CLIENT_SECRET — 구글 데스크톱 클라이언트는 토큰 교환에 비밀값을 요구한다. 설치형 앱에서는 비밀로 보지 않고 보안은 PKCE가 맡는다).
// 개발·시험용 덮어쓰기(패키지 앱에서는 무시): SPROUT_GOOGLE_ENDPOINTS='{"auth","token","revoke","api"}', SPROUT_GOOGLE_FAKE_BROWSER=1(브라우저 대신 앱이 직접 동의 주소를 엶), SPROUT_CALENDAR_HELPER(가짜 도우미)
import { app, BrowserWindow, ipcMain, powerMonitor, safeStorage, shell, net } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { addDaysStr, APPLE_ACCOUNT_ID, cacheFrom, deviceTimeZone, floating, type CalendarsStatus, type ConnectProgress, type ConnectResult, type Provider } from '../shared/calendars'
import { CalendarStore, type SqlDb } from './calendarStore'
import { GoogleError, GOOGLE_ENDPOINTS, GoogleSync, startOAuth, wipeAccounts, type GoogleEndpoints, type OAuthHandle, type Tokens, type TokenVault } from './googleSync'
import { AppleSync, helperRunner } from './appleSync'

const DIR = () => join(app.getPath('userData'), 'calendars')
const dev = !app.isPackaged
const client = () => ({ clientId: (process.env.GOOGLE_CLIENT_ID?.trim() || (typeof __BUILD_GOOGLE_CLIENT_ID__ === 'string' ? __BUILD_GOOGLE_CLIENT_ID__ : '')), clientSecret: (process.env.GOOGLE_CLIENT_SECRET?.trim() || (typeof __BUILD_GOOGLE_CLIENT_SECRET__ === 'string' ? __BUILD_GOOGLE_CLIENT_SECRET__ : '') || undefined) })
const endpoints = (): GoogleEndpoints => {
  if (dev && process.env.SPROUT_GOOGLE_ENDPOINTS) { try { return { ...GOOGLE_ENDPOINTS, ...JSON.parse(process.env.SPROUT_GOOGLE_ENDPOINTS) } } catch { /* 기본값 */ } }
  return GOOGLE_ENDPOINTS
}
const helperPath = () => {
  if (dev && process.env.SPROUT_CALENDAR_HELPER) return process.env.SPROUT_CALENDAR_HELPER
  if (process.platform !== 'darwin') return null
  return app.isPackaged ? join(process.resourcesPath, 'sprout-calendar') : join(app.getAppPath(), 'native/calendar/out/sprout-calendar')
}

// ── 토큰 보관: safeStorage 파일, 암호화가 안 되면 메모리에만(16 §7.5) ──
const memory = new Map<string, Tokens>()
const tokenFile = (id: string) => join(DIR(), `google-${id.replace(/[^\w-]/g, '')}.bin`)
const vault: TokenVault = {
  get(id) {
    if (memory.has(id)) return memory.get(id)
    if (!safeStorage.isEncryptionAvailable() || !existsSync(tokenFile(id))) return undefined
    try { const t = JSON.parse(safeStorage.decryptString(readFileSync(tokenFile(id)))) as Tokens; memory.set(id, t); return t } catch { return undefined } // 복호화 실패 → reauth
  },
  set(id, t) {
    if (!t) { memory.delete(id); rmSync(tokenFile(id), { force: true }); return }
    memory.set(id, t)
    if (!safeStorage.isEncryptionAvailable()) return
    mkdirSync(DIR(), { recursive: true })
    writeFileSync(tokenFile(id), safeStorage.encryptString(JSON.stringify(t)), { mode: 0o600 })
  }
}
const memoryOnly = (id: string) => id !== APPLE_ACCOUNT_ID && !safeStorage.isEncryptionAvailable()

// ── 캐시 DB ──
let raw: Database.Database | undefined
let store: CalendarStore | undefined
function getStore(): CalendarStore {
  if (store) return store
  mkdirSync(DIR(), { recursive: true })
  raw = new Database(join(DIR(), 'cache.db'))
  raw.pragma('journal_mode = WAL')
  const db = raw
  const sql: SqlDb = {
    exec: (s) => db.exec(s),
    run: (s, p = []) => { db.prepare(s).run(...(p as never[])) },
    all: <T>(s: string, p: unknown[] = []) => db.prepare(s).all(...(p as never[])) as T[],
    tx: <T>(fn: () => T) => (db.inTransaction ? fn() : db.transaction(fn)())
  }
  store = new CalendarStore(sql)
  return store
}
const google = () => new GoogleSync({ store: getStore(), vault, client: client(), endpoints: endpoints(), timeZone: deviceTimeZone })
const apple = () => new AppleSync({ store: getStore(), run: helperRunner(helperPath), timeZone: deviceTimeZone })

// ── 알림 ──
let changedTimer: NodeJS.Timeout | undefined
const changeListeners = new Set<() => void>()
function changed() {
  clearTimeout(changedTimer)
  changedTimer = setTimeout(() => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('calendars:changed')
    for (const cb of changeListeners) { try { cb() } catch (e) { console.warn('[calendars] 변경 알림 실패:', e) } }
  }, 50)
}
/** 25 §15 월 캘린더 위젯: 구글·Apple 일정이 바뀌면(새로 고침·연결·끊기) 저장 파일을 다시 쓴다 */
export function onCalendarsChanged(cb: () => void): () => void {
  changeListeners.add(cb)
  return () => changeListeners.delete(cb)
}
/** 25 §15: 앱 캘린더와 같은 외부 일정(왼쪽 패널에 체크된 캘린더) */
export const panelEvents = (from: string, to: string) => getStore().events(from, to, { panel: true })
const progress = (p: ConnectProgress) => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('calendars:progress', p) }

// ── 새로 고침 ──
const lastRun = new Map<string, number>()
const running = new Map<string, Promise<unknown>>()
async function refreshAccount(id: string, force = false) {
  if (running.has(id)) return running.get(id)
  if (!force && Date.now() - (lastRun.get(id) ?? 0) < 60_000) return // 1분 안의 중복은 건너뜀
  const a = getStore().account(id)
  if (!a) return
  if (!force && a.status === 'retrying' && a.next_retry_at && a.next_retry_at > Date.now()) return
  lastRun.set(id, Date.now())
  const p = (async () => {
    changed()
    if (a.provider === 'google') await google().sync(id)
    else await apple().sync()
  })().catch((e) => console.warn('[calendars] 새로 고침 실패:', e)).finally(() => { running.delete(id); changed() })
  running.set(id, p)
  return p
}
async function refreshAll(force = false) { await Promise.all(getStore().accounts().map((a) => refreshAccount(a.id, force))) }

let tick: NodeJS.Timeout | undefined
function startSchedule() {
  if (tick) return
  // 앞에 있을 때 5분, 뒤에 있을 때 30분(16 §4.2). 1분마다 확인
  tick = setInterval(() => {
    const focused = BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocused())
    const every = focused ? 5 * 60_000 : 30 * 60_000
    const online = net.isOnline()
    for (const a of getStore().accounts()) {
      if (['reauth', 'scope_missing', 'denied', 'restricted', 'helper_missing'].includes(a.status)) continue
      const due = Date.now() - (lastRun.get(a.id) ?? 0) >= every
      const back = a.status === 'offline' && online
      const retry = a.status === 'retrying' && (a.next_retry_at ?? 0) <= Date.now()
      if (due || back || retry) void refreshAccount(a.id, back || retry)
    }
  }, 60_000)
  app.on('browser-window-focus', () => void refreshAll())
  powerMonitor.on('resume', () => void refreshAll(true))
  setTimeout(() => void refreshAll(), 3000)
}

// ── 연결 ──
let pending: { provider: Provider; oauth?: OAuthHandle } | undefined
async function connect(provider: Provider): Promise<ConnectResult> {
  if (pending) return { ok: false, error: '진행 중인 연결이 있어요.' }
  if (provider === 'apple') {
    if (process.platform !== 'darwin') return { ok: false, error: 'Apple 캘린더는 맥에서만 연결할 수 있어요.' }
    pending = { provider }
    progress({ provider, step: 'permission' })
    try {
      const r = await apple().connect()
      changed()
      return r.ok ? { ok: true, accountId: APPLE_ACCOUNT_ID } : { ok: false, error: r.error, code: r.code }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } } finally { pending = undefined; progress({ provider, step: 'done' }) }
  }
  const c = client()
  if (!c.clientId) return { ok: false, error: '구글 연결 준비가 아직 안 됐어요. 운영자가 구글 OAuth 클라이언트 ID(GOOGLE_CLIENT_ID)를 넣어야 해요.', code: 'no_client' }
  if (!net.isOnline()) return { ok: false, error: '인터넷에 연결되어 있지 않아요.', code: 'offline' }
  const fakeBrowser = dev && process.env.SPROUT_GOOGLE_FAKE_BROWSER === '1'
  const oauth = startOAuth({
    client: c,
    endpoints: endpoints(),
    openExternal: (url) => (fakeBrowser ? fetch(url).catch(() => {}) : shell.openExternal(url)), // 앱 안 웹뷰로 열지 않는다(구글이 막음)
    onStep: (step) => progress({ provider, step })
  })
  pending = { provider, oauth }
  try {
    const tokens = await oauth.promise
    progress({ provider, step: 'sync' })
    const g = google()
    const { accountId, existed } = await g.addAccount(tokens).catch(async (e) => { await g.revoke(tokens.refresh_token); throw e })
    changed()
    lastRun.delete(accountId)
    void refreshAccount(accountId, true)
    return { ok: true, accountId, message: existed ? '이미 연결된 계정이라 다시 연결했어요.' : undefined }
  } catch (e) {
    const err = e instanceof GoogleError ? e : null
    return { ok: false, error: e instanceof Error ? e.message : String(e), code: err?.kind }
  } finally { pending = undefined; progress({ provider, step: 'done' }) }
}

async function disconnect(id: string) {
  await wipeAccounts(getStore(), vault, google(), id) // 폐기 요청이 실패해도(오프라인) 로컬은 지운다
  lastRun.delete(id)
  changed()
}

function status(): CalendarsStatus {
  const s = getStore()
  return {
    providers: {
      google: { available: true, configured: !!client().clientId },
      apple: { available: process.platform === 'darwin', helper: !!helperPath() && existsSync(helperPath()!) },
      encryption: safeStorage.isEncryptionAvailable()
    },
    accounts: s.view(memoryOnly),
    connecting: pending?.provider ?? null,
    cacheFrom: cacheFrom(new Date(), deviceTimeZone())
  }
}

/** 로그아웃(결정 ⑤): 구글 토큰 폐기·파일 삭제, 캐시 파일 삭제. Apple 권한은 OS 것이라 그대로 */
export async function forgetCalendars() {
  pending?.oauth?.cancel()
  try { await wipeAccounts(getStore(), vault, google()) } catch { /* 지우기는 계속 */ }
  memory.clear()
  raw?.close()
  raw = undefined
  store = undefined
  lastRun.clear()
  if (existsSync(DIR())) for (const f of readdirSync(DIR())) rmSync(join(DIR(), f), { force: true, recursive: true })
  changed()
}

export function registerCalendars() {
  ipcMain.handle('calendars:status', () => status())
  ipcMain.handle('calendars:connect', (_e, provider: Provider) => connect(provider === 'apple' ? 'apple' : 'google'))
  ipcMain.handle('calendars:cancel', () => { pending?.oauth?.cancel() })
  ipcMain.handle('calendars:reopen', () => { pending?.oauth?.reopen() })
  ipcMain.handle('calendars:events', (_e, from: string, to: string, opts?: { panel?: boolean; accountId?: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return []
    return getStore().events(from, to, { panel: !!opts?.panel, accountId: typeof opts?.accountId === 'string' ? opts.accountId : undefined })
  })
  ipcMain.handle('calendars:counts', () => {
    const today = floating(new Date(), deviceTimeZone()).slice(0, 10)
    return getStore().counts(today, addDaysStr(today, 90))
  })
  ipcMain.handle('calendars:setVisibility', (_e, accountId: string, changes: { calendarId: string; visibility: 'show' | 'hide' }[]) => {
    const clean = (Array.isArray(changes) ? changes : []).filter((c) => typeof c?.calendarId === 'string' && (c.visibility === 'show' || c.visibility === 'hide'))
    if (getStore().setVisibility(accountId, clean)) void refreshAccount(accountId, true)
    changed()
  })
  ipcMain.handle('calendars:setPanel', (_e, accountId: string | null, calendarId: string | null, on: boolean) => { getStore().setPanel(accountId ?? '', calendarId, !!on); changed() })
  ipcMain.handle('calendars:refresh', (_e, accountId?: string, force?: boolean) => (accountId ? refreshAccount(accountId, !!force) : refreshAll(!!force)))
  ipcMain.handle('calendars:disconnect', (_e, accountId: string) => disconnect(accountId))
  ipcMain.handle('calendars:open', async (_e, accountId: string, calendarId: string, eventId: string) => {
    const ev = getStore().event(accountId, calendarId, eventId)
    if (!ev?.link) return
    if (accountId === APPLE_ACCOUNT_ID) {
      await shell.openExternal(`ical://ekevent/${encodeURIComponent(ev.link)}?method=show&options=more`).catch(() => shell.openExternal('ical://'))
    } else if (/^https:\/\/(www\.)?google\.com\/calendar\//.test(ev.link) || (dev && process.env.SPROUT_GOOGLE_ENDPOINTS)) await shell.openExternal(ev.link)
  })
  ipcMain.handle('calendars:openPrivacy', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars'))
  startSchedule()
}
