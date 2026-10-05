// 16 캘린더 연동(구글·Apple) — Electron 연결: 캐시 파일·토큰(safeStorage)·IPC·새로 고침 주기·로그아웃 정리.
// §12 양방향: 캐시 전용 일정 쓰기(calendarWrite) · 연결된 일정 다리(calendarBridge, 꿈틀 events ⇄ 외부).
// 구글 클라이언트: 환경 변수 GOOGLE_CLIENT_ID (+ GOOGLE_CLIENT_SECRET — 구글 데스크톱 클라이언트는 토큰 교환에 비밀값을 요구한다. 설치형 앱에서는 비밀로 보지 않고 보안은 PKCE가 맡는다).
// 개발·시험용 덮어쓰기(패키지 앱에서는 무시): SPROUT_GOOGLE_ENDPOINTS='{"auth","token","revoke","api"}', SPROUT_GOOGLE_FAKE_BROWSER=1(브라우저 대신 앱이 직접 동의 주소를 엶), SPROUT_CALENDAR_HELPER(가짜 도우미)
import { app, BrowserWindow, ipcMain, powerMonitor, safeStorage, shell, net } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { addDaysStr, APPLE_ACCOUNT_ID, cacheFrom, deviceTimeZone, floating, type CalendarsStatus, type CalendarToast, type ConnectProgress, type ConnectResult, type ExtPatch, type ExtSnapshot, type Provider, type WriteScope } from '../shared/calendars'
import { CalendarStore, type SqlDb } from './calendarStore'
import { GoogleError, GOOGLE_ENDPOINTS, GoogleSync, startOAuth, wipeAccounts, type GoogleEndpoints, type OAuthHandle, type Tokens, type TokenVault } from './googleSync'
import { AppleSync, helperRunner } from './appleSync'
import { CalendarWriter } from './calendarWrite'
import { CalendarBridge } from './calendarBridge'
import { db } from './db'

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
const toast = (t: CalendarToast) => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('calendars:toast', t) }
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
  })().catch((e) => console.warn('[calendars] 새로 고침 실패:', e)).finally(() => { running.delete(id); changed(); scheduleBridge() })
  running.set(id, p)
  return p
}
async function refreshAll(force = false) { await Promise.all(getStore().accounts().map((a) => refreshAccount(a.id, force))) }

// ── 16 §12 쓰기 · 다리 ──
const writer = () => new CalendarWriter({ store: getStore(), google, apple, timeZone: deviceTimeZone, online: () => net.isOnline(), refresh: (id) => refreshAccount(id, true), changed })
let bridge: CalendarBridge | undefined
const getBridge = () => (bridge ??= new CalendarBridge({
  db: { getAll: (sql, p) => db.getAll(sql, p ?? []), execute: (sql, p) => db.execute(sql, p ?? []) },
  store: getStore(), google, apple, timeZone: deviceTimeZone, online: () => net.isOnline(),
  toast: (message, kind) => toast({ message, kind }), changed,
  pushed: (id) => { clearTimeout(pushTimers.get(id)); pushTimers.set(id, setTimeout(() => void refreshAccount(id, true), 1500)) }
}))
const pushTimers = new Map<string, NodeJS.Timeout>()
let bridgeTimer: NodeJS.Timeout | undefined
function scheduleBridge(ms = 400) {
  clearTimeout(bridgeTimer)
  bridgeTimer = setTimeout(() => { void getBridge().pass().catch((e) => console.warn('[calendars] 다리 실패:', e)) }, ms)
}
function startBridge() {
  // 연결 정보가 있는 꿈틀 일정이 바뀌면(이 기기·휴대폰·다른 기기) 올린다
  db.watchWithCallback('SELECT id, modified_at, deleted_at, ext_hash, ext_id, ext_calendar FROM events WHERE ext_provider IS NOT NULL', [], {
    onResult: () => scheduleBridge(),
    onError: (e) => console.warn('[calendars] 다리 감시 실패:', e)
  })
  setInterval(() => scheduleBridge(0), 60_000) // 대기 중인 것 다시(오프라인 → 온라인 포함)
}

// 증분 동의(§12.3.2): 같은 계정으로 쓰기 범위를 더 받는다
async function grantWrite(accountId: string): Promise<ConnectResult> {
  if (pending) return { ok: false, error: '진행 중인 연결이 있어요.' }
  const a = getStore().account(accountId)
  if (!a || a.provider !== 'google') return { ok: false, error: '계정을 찾을 수 없어요.' }
  if (!net.isOnline()) return { ok: false, error: '인터넷에 연결되어 있지 않아요.', code: 'offline' }
  const fakeBrowser = dev && process.env.SPROUT_GOOGLE_FAKE_BROWSER === '1'
  const oauth = startOAuth({ client: client(), endpoints: endpoints(), loginHint: a.label, incremental: true,
    openExternal: (url) => (fakeBrowser ? fetch(url).catch(() => {}) : shell.openExternal(url)), onStep: (step) => progress({ provider: 'google', step }) })
  pending = { provider: 'google', oauth }
  try {
    const tokens = await oauth.promise
    const ok = await google().replaceTokens(accountId, tokens)
    if (getStore().account(accountId)?.status === 'reauth' || getStore().account(accountId)?.status === 'scope_missing') void refreshAccount(accountId, true)
    changed()
    scheduleBridge(0)
    return ok ? { ok: true, accountId } : { ok: false, error: '쓰기 권한을 받지 못해서 바꾸지 않았어요', code: 'scope' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), code: e instanceof GoogleError ? e.kind : undefined }
  } finally { pending = undefined; progress({ provider: 'google', step: 'done' }) }
}

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
    const { accountId, existed, canWrite } = await g.addAccount(tokens).catch(async (e) => { await g.revoke(tokens.refresh_token); throw e })
    changed()
    lastRun.delete(accountId)
    void refreshAccount(accountId, true)
    // 16 §12.3.1: 동의 화면에서 쓰기를 빼면 읽기 전용 연결
    const message = !canWrite ? '읽기만 연결했어요. 일정을 고치려면 쓰기 권한을 허용해 주세요.' : existed ? '이미 연결된 계정이라 다시 연결했어요.' : undefined
    return { ok: true, accountId, message }
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
  bridge = undefined
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
  // 16 §12
  ipcMain.handle('calendars:targets', () => getStore().targets())
  ipcMain.handle('calendars:grantWrite', (_e, accountId: string) => grantWrite(String(accountId)))
  const scopeOf = (o: unknown): WriteScope | undefined => { const v = (o as { scope?: unknown })?.scope; return v === 'this' || v === 'following' || v === 'all' ? v : undefined }
  ipcMain.handle('calendars:update', (_e, key: string, patch: ExtPatch, opts?: { scope?: WriteScope; notify?: boolean }) => {
    const clean: ExtPatch = {}
    if (typeof patch?.title === 'string') clean.title = patch.title.trim() || undefined
    if (patch && 'description' in patch) clean.description = typeof patch.description === 'string' ? patch.description : null
    if (patch && 'location' in patch) clean.location = typeof patch.location === 'string' ? patch.location : null
    if (typeof patch?.start === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(patch.start)) clean.start = patch.start
    if (typeof patch?.end === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(patch.end)) clean.end = patch.end
    if (typeof patch?.allDay === 'boolean') clean.allDay = patch.allDay
    return writer().update(String(key), clean, { scope: scopeOf(opts), notify: !!opts?.notify })
  })
  ipcMain.handle('calendars:delete', (_e, key: string, opts?: { scope?: WriteScope; notify?: boolean }) => writer().delete(String(key), { scope: scopeOf(opts), notify: !!opts?.notify }))
  ipcMain.handle('calendars:restore', (_e, snap: ExtSnapshot) => writer().restore(snap))
  ipcMain.handle('calendars:event', (_e, key: string) => { const [a, ...rest] = String(key).split('|'); const ev = rest.pop(); return a && ev ? getStore().viewOf(a, rest.join('|'), ev) ?? null : null })
  startSchedule()
  startBridge()
}
