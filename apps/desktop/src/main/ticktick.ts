// 17 틱틱에서 가져오기 — 메인 프로세스: 틱틱 공식 Open API 연결(OAuth2 또는 개인 API 토큰)과 읽기.
// - 비밀번호는 다루지 않는다. 비공개 API(/api/v2)는 쓰지 않는다(docs/ticktick-research/21).
// - 토큰은 safeStorage(OS 키체인)로 암호화해 userData/ticktick.bin에만 둔다. 화면에는 넘기지 않는다.
// - 클라이언트 id·secret은 개발용 환경 변수(TICKTICK_CLIENT_ID / TICKTICK_CLIENT_SECRET). 공개 출시 때는 secret을 sprout API의 토큰 교환 엔드포인트로 옮긴다 [다음].
import { app, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLimiter, fetchCompleted, type TTBundle, type TTConnectInput, type TTGroup, type TTProgress, type TTProject, type TTProjectData, type TTResult, type TTStatus, type TTTag, type TTTask } from '../shared/ticktick'

const AUTH_URL = 'https://ticktick.com/oauth/authorize'
const TOKEN_URL = 'https://ticktick.com/oauth/token'
const REVOKE_URL = 'https://api.ticktick.com/oauth/revoke'
const API = 'https://api.ticktick.com/open/v1'
const SCOPE = 'tasks:read'
/** 개발자 센터 Manage Apps에 똑같이 등록해야 하는 주소. 바꾸려면 TICKTICK_REDIRECT_URI(루프백 주소만) */
export const DEFAULT_REDIRECT = 'http://127.0.0.1:47321/ticktick/callback'
const LOGIN_TIMEOUT = 5 * 60_000
const FILE = () => join(app.getPath('userData'), 'ticktick.bin')

type Saved = { access_token: string; kind: 'oauth' | 'token'; expires_at: number | null }
let saved: Saved | undefined
let loaded = false
let pending: { server: Server; cancel: (why: string) => void } | undefined

const env = () => ({ id: process.env.TICKTICK_CLIENT_ID?.trim() ?? '', secret: process.env.TICKTICK_CLIENT_SECRET?.trim() ?? '' })
function redirectUri(): URL {
  const raw = process.env.TICKTICK_REDIRECT_URI?.trim() || DEFAULT_REDIRECT
  const u = new URL(raw)
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname) || !u.port) throw new Error('TICKTICK_REDIRECT_URI는 http://127.0.0.1:<포트>/… 형태여야 해요.')
  return u
}

// ── 저장 ──
function save(s: Saved | undefined) {
  saved = s
  const file = FILE()
  if (!s) { if (existsSync(file)) rmSync(file); return }
  // 암호화를 못 쓰는 기기에서는 파일로 남기지 않고 이번 실행 동안만 메모리에 둔다
  if (!safeStorage.isEncryptionAvailable()) return
  writeFileSync(file, safeStorage.encryptString(JSON.stringify(s)), { mode: 0o600 })
}
function current(): Saved | undefined {
  if (!loaded) {
    loaded = true
    try { if (existsSync(FILE()) && safeStorage.isEncryptionAvailable()) saved = JSON.parse(safeStorage.decryptString(readFileSync(FILE()))) } catch { saved = undefined }
  }
  if (saved?.expires_at && saved.expires_at < Date.now()) save(undefined)
  return saved
}

export function status(): TTStatus {
  const { id, secret } = env()
  let uri = DEFAULT_REDIRECT
  try { uri = redirectUri().href } catch { /* 잘못된 값이면 기본값을 보여 준다 */ }
  const s = current()
  return { connected: !!s, kind: s?.kind ?? null, oauthAvailable: !!(id && secret), redirectUri: uri, waiting: !!pending }
}

class TTError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
async function call<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}, limit: () => Promise<void>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await limit()
    signal?.throwIfAborted()
    const res = await fetch(`${API}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)
    })
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 4) throw new TTError(res.status === 429 ? '틱틱 요청 한도에 걸렸어요. 몇 분 뒤 다시 해 주세요.' : `틱틱 서버 오류(${res.status})`, res.status)
      const after = Number(res.headers.get('retry-after'))
      await new Promise((r) => setTimeout(r, (Number.isFinite(after) && after > 0 ? after : 2 ** (attempt + 1)) * 1000))
      continue
    }
    if (res.status === 401 || res.status === 403) throw new TTError('틱틱 연결이 끊겼어요. 다시 연결해 주세요.', res.status)
    if (!res.ok) throw new TTError(`틱틱 요청 실패(${res.status})`, res.status)
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  }
}

// ── OAuth: 시스템 브라우저 + 고정 루프백 주소 ──
const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:15px -apple-system,system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#333"><div style="text-align:center"><h2>${title}</h2><p>${body}</p></div></body>`

function oauth(): Promise<Saved> {
  const { id, secret } = env()
  if (!id || !secret) return Promise.reject(new Error('틱틱 앱 정보(TICKTICK_CLIENT_ID·TICKTICK_CLIENT_SECRET)가 없어요. API 토큰으로 연결하거나 앱을 등록해 주세요.'))
  if (pending) return Promise.reject(new Error('진행 중인 연결이 있어요. 브라우저에서 마치거나 취소해 주세요.'))
  const redirect = redirectUri()
  const state = randomBytes(24).toString('base64url')
  return new Promise<Saved>((resolve, reject) => {
    let done = false
    const finish = (err: Error | null, value?: Saved) => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      pending = undefined
      if (err) reject(err)
      else resolve(value!)
    }
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', redirect.origin)
      if (url.pathname !== redirect.pathname) { res.writeHead(404).end(); return }
      const send = (code: number, title: string, body: string) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }).end(page(title, body)) }
      if (url.searchParams.get('state') !== state) { send(400, '연결하지 못했어요', '요청이 맞지 않아요. sprout에서 다시 시도해 주세요.'); return } // 다른 요청이 끼어든 것 — 기다림은 계속
      const code = url.searchParams.get('code')
      if (!code) { send(400, '연결을 취소했어요', 'sprout로 돌아가 주세요.'); finish(new Error(url.searchParams.get('error') === 'access_denied' ? '틱틱에서 허용하지 않았어요.' : '틱틱 연결을 취소했어요.')); return }
      try {
        const r = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
          body: new URLSearchParams({ code, grant_type: 'authorization_code', scope: SCOPE, redirect_uri: redirect.href }),
          signal: AbortSignal.timeout(20_000)
        })
        const json = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
        if (!r.ok || !json.access_token) throw new Error(`토큰을 받지 못했어요(${r.status}).`)
        send(200, '틱틱과 연결했어요', '이 창을 닫고 sprout로 돌아가 주세요.')
        finish(null, { access_token: json.access_token, kind: 'oauth', expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : null })
      } catch (e) {
        send(500, '연결하지 못했어요', 'sprout로 돌아가 다시 시도해 주세요.')
        finish(e instanceof Error ? e : new Error(String(e)))
      }
    })
    const timer = setTimeout(() => finish(new Error('5분 안에 연결을 마치지 않아 취소했어요.')), LOGIN_TIMEOUT)
    server.on('error', (e: NodeJS.ErrnoException) => finish(new Error(e.code === 'EADDRINUSE' ? `연결용 포트(${redirect.port})를 다른 프로그램이 쓰고 있어요.` : String(e))))
    server.listen(Number(redirect.port), redirect.hostname, () => {
      pending = { server, cancel: (why) => finish(new Error(why)) }
      const auth = new URL(AUTH_URL)
      auth.search = new URLSearchParams({ client_id: id, scope: SCOPE, state, redirect_uri: redirect.href, response_type: 'code' }).toString()
      void shell.openExternal(auth.href)
    })
  })
}

async function connect(input: TTConnectInput): Promise<TTStatus> {
  if (input?.kind === 'token') {
    const token = typeof input.token === 'string' ? input.token.trim() : ''
    if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('API 토큰을 확인해 주세요.')
    try { await call<TTProject[]>(token, '/project', {}, async () => {}) } // 맞는 토큰인지 한 번 확인
    catch (e) { throw e instanceof TTError && (e.status === 401 || e.status === 403) ? new Error('틱틱이 이 토큰을 받지 않아요. 토큰을 다시 복사해 주세요.') : e }
    save({ access_token: token, kind: 'token', expires_at: null })
  } else if (input?.kind === 'oauth') {
    const s = await oauth()
    save(s)
  } else throw new Error('연결 방법을 알 수 없어요.')
  return status()
}

async function disconnect(): Promise<TTStatus> {
  const s = current()
  save(undefined)
  // OAuth 토큰은 폐기를 요청한다. 개인 API 토큰은 사용자가 틱틱 설정에서 직접 지운다(17 §4.5)
  if (s?.kind === 'oauth') {
    const { id, secret } = env()
    const body = new URLSearchParams({ token: s.access_token })
    await fetch(REVOKE_URL, { method: 'POST', body, headers: id && secret ? { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` } : {}, signal: AbortSignal.timeout(10_000) }).catch(() => {})
  }
  return status()
}

const HISTORY_FROM = Date.UTC(2010, 0, 1) // 틱틱 출시 전

async function fetchAll(progress: (p: TTProgress) => void, signal: AbortSignal): Promise<TTBundle> {
  const s = current()
  if (!s) throw new TTError('틱틱에 먼저 연결해 주세요.', 401)
  const limit = createLimiter()
  const get = <T>(path: string, init: { method?: string; body?: unknown } = {}) => call<T>(s.access_token, path, init, limit, signal)
  const warnings: string[] = []
  progress({ step: 'projects', done: 0, total: 1, label: '리스트 목록' })
  const pref = await get<{ timeZone?: string }>('/preference', { method: 'POST' }).catch(() => null)
  const projects: TTProject[] = []
  for (let offset = 0; ; offset += 200) {
    const page = (await get<TTProject[]>(`/project?offset=${offset}&limit=200`)) ?? []
    projects.push(...page)
    if (page.length < 200) break
  }
  const groups = (await get<TTGroup[]>('/project/group').catch(() => { warnings.push('폴더 목록을 받지 못해 폴더 없이 가져와요.'); return [] })) ?? []
  const tags = (await get<TTTag[]>('/tag').catch(() => { warnings.push('태그 색·부모를 받지 못해 이름만 가져와요.'); return [] })) ?? []
  const data: Record<string, TTProjectData> = {}
  const total = projects.length + 1
  let done = 0
  let inbox: TTProjectData | undefined
  try { inbox = (await get<TTProjectData>('/project/inbox/data')) ?? undefined } catch (e) {
    if (e instanceof TTError && e.status === 401) throw e
    warnings.push('받은함을 읽지 못했어요. 받은함 할 일은 빠질 수 있어요.')
  }
  progress({ step: 'data', done: ++done, total, label: '받은함' })
  for (const p of projects) {
    try { data[p.id] = (await get<TTProjectData>(`/project/${encodeURIComponent(p.id)}/data`)) ?? {} } catch (e) {
      if (e instanceof TTError && e.status === 401) throw e
      warnings.push(`'${p.name ?? p.id}' 리스트를 읽지 못했어요.`)
    }
    progress({ step: 'data', done: ++done, total, label: p.name })
  }
  const inboxId = inbox?.tasks?.find((t) => t.projectId)?.projectId ?? 'inbox'
  let calls = 0
  const completed = await fetchCompleted((body) => get<TTTask[]>('/task/completed', { body }), [...projects.map((p) => p.id), inboxId], HISTORY_FROM, Date.now(), () => progress({ step: 'completed', done: ++calls, total: 0, label: '완료한 할 일' }))
    .catch((e) => { if (e instanceof TTError && e.status === 401) throw e; warnings.push('완료한 할 일 기록을 받지 못해 미완료만 가져와요.'); return [] as TTTask[] })
  progress({ step: 'done', done: 1, total: 1 })
  return { fetchedAt: new Date().toISOString(), timeZone: pref?.timeZone, projects, groups, tags, data, inbox, completed, warnings }
}

let fetching: AbortController | undefined
const fail = (e: unknown): TTResult<never> => {
  const reconnect = e instanceof TTError && (e.status === 401 || e.status === 403)
  if (reconnect) save(undefined)
  return { ok: false, error: e instanceof Error ? (e.name === 'AbortError' ? '취소했어요.' : e.message) : String(e), reconnect }
}

/** 로그아웃 때 부른다(같은 컴퓨터의 다음 sprout 사용자가 이 틱틱 계정을 쓰지 않게) */
export function forgetTickTick() { pending?.cancel('취소했어요.'); fetching?.abort(); save(undefined) }

export function registerTickTick() {
  ipcMain.handle('ticktick:status', () => status())
  ipcMain.handle('ticktick:connect', async (_e, input: TTConnectInput): Promise<TTResult<TTStatus>> => {
    try { return { ok: true, value: await connect(input) } } catch (e) { return fail(e) }
  })
  ipcMain.handle('ticktick:cancel', () => { pending?.cancel('취소했어요.'); fetching?.abort(); return status() })
  ipcMain.handle('ticktick:fetch', async (event: IpcMainInvokeEvent): Promise<TTResult<TTBundle>> => {
    fetching?.abort()
    const ctrl = new AbortController()
    fetching = ctrl
    const progress = (p: TTProgress) => { if (!event.sender.isDestroyed()) event.sender.send('ticktick:progress', p) }
    try { return { ok: true, value: await fetchAll(progress, ctrl.signal) } } catch (e) { return fail(e) } finally { if (fetching === ctrl) fetching = undefined }
  })
  ipcMain.handle('ticktick:disconnect', () => disconnect())
}
