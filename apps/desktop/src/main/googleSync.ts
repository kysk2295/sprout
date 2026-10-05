// 16 §7 구글 캘린더: OAuth(설치형 앱 + PKCE + 루프백) · calendarList · events(syncToken 증분, 410 → 전체 다시) · 백오프.
// 16 §12 쓰기: insert·patch·delete·get(If-Match etag, sendUpdates), 증분 동의(include_granted_scopes).
// Electron을 가져오지 않는다(시험은 가짜 구글 서버로). Electron 연결은 main/calendars.ts.
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { cacheFrom, canReadScope, canWriteScope, mapGoogleEvent, SCOPES, type EventRow, type GoogleEvent } from '../shared/calendars'
import type { CalendarStore } from './calendarStore'

export interface GoogleEndpoints { auth: string; token: string; revoke: string; api: string }
export const GOOGLE_ENDPOINTS: GoogleEndpoints = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/calendar/v3'
}
export interface Tokens { access_token: string; refresh_token: string; expires_at: number; scope: string }
export interface TokenVault { get(accountId: string): Tokens | undefined; set(accountId: string, t: Tokens | undefined): void }
export interface GoogleClient { clientId: string; clientSecret?: string }

export type GoogleErrorKind = 'reauth' | 'scope' | 'offline' | 'rate' | 'gone' | 'forbidden' | 'notfound' | 'http' | 'cancelled' | 'timeout' | 'denied' | 'conflict' | 'exists'
export class GoogleError extends Error {
  constructor(message: string, readonly kind: GoogleErrorKind, readonly status = 0) { super(message) }
}

const accountKey = (email: string) => `g_${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)}`
export { accountKey as googleAccountId }

// ── PKCE ──
export function pkce() {
  const verifier = randomBytes(48).toString('base64url') // 64자(43~128)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** 브라우저 쪽 돌아오는 페이지(16 §3.4) — 외부 이미지·스크립트 없음 */
const page = (ok: boolean) =>
  `<!doctype html><meta charset="utf-8"><title>꿈틀</title><body style="margin:0;background:#fff;font:15px -apple-system,system-ui,sans-serif;color:#333;display:grid;place-items:center;height:90vh"><p>${ok ? '꿈틀로 돌아가 주세요. 이 창은 닫아도 돼요.' : '연결하지 못했어요. sprout에서 다시 시도해 주세요.'}</p></body>`

export interface OAuthHandle { promise: Promise<Tokens>; cancel: () => void; reopen: () => void }
/** 루프백(127.0.0.1, 빈 포트) + PKCE로 인증 코드 → 토큰 */
export function startOAuth(opts: { client: GoogleClient; endpoints?: GoogleEndpoints; openExternal: (url: string) => unknown; fetch?: typeof fetch; timeoutMs?: number; onStep?: (s: 'browser' | 'token') => void; loginHint?: string; incremental?: boolean }): OAuthHandle {
  const ep = opts.endpoints ?? GOOGLE_ENDPOINTS
  const f = opts.fetch ?? fetch
  const { verifier, challenge } = pkce()
  const state = randomBytes(24).toString('base64url')
  let authUrl = ''
  let finish: (err: Error | null, t?: Tokens) => void = () => {}
  const promise = new Promise<Tokens>((resolve, reject) => {
    let done = false
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/oauth/callback') { res.writeHead(404).end(); return }
      const send = (ok: boolean) => res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' }).end(page(ok))
      if (url.searchParams.get('state') !== state) { send(false); return } // 끼어든 요청 — 계속 기다림
      const code = url.searchParams.get('code')
      if (!code) {
        send(false)
        const err = url.searchParams.get('error')
        finish(err === 'access_denied' ? new GoogleError('연결을 취소했어요.', 'denied') : new GoogleError(`구글이 연결을 거절했어요(${err ?? '알 수 없음'}).`, 'http'))
        return
      }
      opts.onStep?.('token')
      try {
        const port = (server.address() as { port: number }).port
        const body = new URLSearchParams({ code, code_verifier: verifier, client_id: opts.client.clientId, redirect_uri: `http://127.0.0.1:${port}/oauth/callback`, grant_type: 'authorization_code' })
        if (opts.client.clientSecret) body.set('client_secret', opts.client.clientSecret)
        const r = await f(ep.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000) })
        const json = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string }
        if (!r.ok || !json.access_token || !json.refresh_token) throw new GoogleError(`토큰을 받지 못했어요(${json.error ?? r.status}).`, 'http', r.status)
        send(true)
        finish(null, { access_token: json.access_token, refresh_token: json.refresh_token, expires_at: Date.now() + (json.expires_in ?? 3600) * 1000, scope: json.scope ?? '' })
      } catch (e) {
        send(false)
        finish(e instanceof Error ? (e instanceof GoogleError ? e : new GoogleError('인터넷에 연결되어 있지 않아요.', 'offline')) : new Error(String(e)))
      }
    })
    const timer = setTimeout(() => finish(new GoogleError('시간이 지나서 연결을 멈췄어요.', 'timeout')), opts.timeoutMs ?? 5 * 60_000)
    finish = (err, t) => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      server.closeAllConnections?.()
      if (err) reject(err)
      else resolve(t!)
    }
    server.on('error', (e) => finish(new GoogleError(`연결용 임시 주소를 열지 못했어요(${String(e)}).`, 'http')))
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const u = new URL(ep.auth)
      u.search = new URLSearchParams({
        client_id: opts.client.clientId,
        redirect_uri: `http://127.0.0.1:${port}/oauth/callback`,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: opts.incremental ? 'true' : 'false', // 16 §12.3.2 증분 동의
        ...(opts.loginHint ? { login_hint: opts.loginHint } : {})
      }).toString()
      authUrl = u.href
      opts.onStep?.('browser')
      void opts.openExternal(authUrl)
    })
  })
  promise.catch(() => {}) // 처리하지 않은 거부 경고 방지(호출한 쪽이 따로 await)
  return { promise, cancel: () => finish(new GoogleError('연결을 취소했어요.', 'cancelled')), reopen: () => { if (authUrl) void opts.openExternal(authUrl) } }
}

/** 읽기에 필요한 범위가 있다(v1 읽기 전용 토큰도 참). 쓰기는 canWriteScope */
export const hasScopes = (scope: string) => canReadScope(scope)
export { canWriteScope }

// ── API 호출 ──
interface Deps { store: CalendarStore; vault: TokenVault; client: GoogleClient; endpoints?: GoogleEndpoints; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeZone: () => string; now?: () => Date; maxRetries?: number }
type GCalendarListEntry = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; foregroundColor?: string; accessRole?: string; primary?: boolean; selected?: boolean; deleted?: boolean; hidden?: boolean }

export class GoogleSync {
  private ep: GoogleEndpoints
  private f: typeof fetch
  private sleep: (ms: number) => Promise<void>
  constructor(private d: Deps) {
    this.ep = d.endpoints ?? GOOGLE_ENDPOINTS
    this.f = d.fetch ?? fetch
    this.sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  private async post(url: string, body: URLSearchParams) {
    try { return await this.f(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000) }) }
    catch { throw new GoogleError('인터넷에 연결되어 있지 않아요.', 'offline') }
  }

  /** 접근 토큰(만료 1분 전이면 리프레시) */
  async accessToken(accountId: string, force = false): Promise<string> {
    const t = this.d.vault.get(accountId)
    if (!t) throw new GoogleError('다시 연결이 필요해요', 'reauth')
    if (!force && t.expires_at - Date.now() > 60_000) return t.access_token
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: this.d.client.clientId })
    if (this.d.client.clientSecret) body.set('client_secret', this.d.client.clientSecret)
    const r = await this.post(this.ep.token, body)
    const json = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error?: string }
    if (r.status === 400 || r.status === 401) { if (json.error === 'invalid_grant' || json.error === 'unauthorized_client' || r.status === 401) throw new GoogleError('다시 연결이 필요해요', 'reauth', r.status) }
    if (r.status === 429 || r.status >= 500) throw new GoogleError('구글 서버가 바빠요', 'rate', r.status)
    if (!r.ok || !json.access_token) throw new GoogleError(`토큰을 새로 받지 못했어요(${json.error ?? r.status})`, 'http', r.status)
    const next = { ...t, access_token: json.access_token, expires_at: Date.now() + (json.expires_in ?? 3600) * 1000, scope: json.scope ?? t.scope }
    this.d.vault.set(accountId, next)
    return next.access_token
  }

  /** GET + 401 한 번 리프레시 + 429/403 rateLimit/5xx 지수 백오프(1·2·4·8초…, 무작위 지연) */
  get<T>(accountId: string | null, path: string, token?: string): Promise<T> { return this.request<T>(accountId, 'GET', path, { token }) }

  async request<T>(accountId: string | null, method: string, path: string, o: { token?: string; body?: unknown; ifMatch?: string | null; maxRetries?: number } = {}): Promise<T> {
    const token = o.token
    let refreshed = false
    for (let attempt = 0; ; attempt++) {
      const access = token ?? (await this.accessToken(accountId!))
      let res: Response
      const headers: Record<string, string> = { authorization: `Bearer ${access}`, accept: 'application/json' }
      if (o.body !== undefined) headers['content-type'] = 'application/json'
      if (o.ifMatch) headers['if-match'] = o.ifMatch
      try { res = await this.f(`${this.ep.api}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: AbortSignal.timeout(method === 'GET' ? 30_000 : 15_000) }) }
      catch { throw new GoogleError('인터넷에 연결되어 있지 않아요.', 'offline') }
      if (res.ok) return (res.status === 204 ? ({} as T) : ((await res.json().catch(() => ({}))) as T))
      const json = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; status?: string } }
      const reason = json.error?.errors?.[0]?.reason ?? ''
      if (res.status === 401 && !refreshed && accountId && !token) { refreshed = true; await this.accessToken(accountId, true); continue }
      if (res.status === 401) throw new GoogleError('다시 연결이 필요해요', 'reauth', 401)
      if (res.status === 410) throw new GoogleError(method === 'GET' ? '동기화 토큰이 만료됐어요' : '이미 삭제된 일정이에요', 'gone', 410)
      if (res.status === 404) throw new GoogleError(method === 'GET' ? '캘린더를 찾을 수 없어요' : '이미 삭제된 일정이에요', 'notfound', 404)
      if (res.status === 412) throw new GoogleError('다른 곳에서 먼저 바뀐 일정이에요', 'conflict', 412)
      if (res.status === 409) throw new GoogleError('이미 있는 일정이에요', 'exists', 409)
      const rate = res.status === 429 || res.status >= 500 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(reason))
      if (rate) {
        if (attempt >= (o.maxRetries ?? (method === 'GET' ? this.d.maxRetries ?? 4 : 1))) throw new GoogleError('잠시 뒤 다시 시도할게요', 'rate', res.status)
        await this.sleep(Math.min(5 * 60_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500))
        continue
      }
      if (res.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(reason + (json.error?.status ?? ''))) throw new GoogleError(method === 'GET' ? '일정 읽기 권한이 빠졌어요' : '구글 캘린더에 쓰기 권한이 필요해요', 'scope', 403)
      if (res.status === 403) throw new GoogleError(method === 'GET' ? '이 캘린더를 읽을 수 없어요' : '이 캘린더는 이제 보기만 할 수 있어요', 'forbidden', 403)
      throw new GoogleError(`구글 요청 실패(${res.status})`, 'http', res.status)
    }
  }

  private async calendarList(accountId: string | null, token?: string): Promise<GCalendarListEntry[]> {
    const out: GCalendarListEntry[] = []
    let pageToken: string | undefined
    do {
      const q = new URLSearchParams({ maxResults: '250', ...(pageToken ? { pageToken } : {}) })
      const r = await this.get<{ items?: GCalendarListEntry[]; nextPageToken?: string }>(accountId, `/users/me/calendarList?${q}`, token)
      out.push(...(r.items ?? []))
      pageToken = r.nextPageToken
    } while (pageToken)
    return out.filter((c) => !c.deleted)
  }

  /** 토큰을 받은 뒤: 기본 캘린더 id = 이메일 → 계정 만들기(같은 계정이면 토큰만 바꿈) */
  async addAccount(tokens: Tokens): Promise<{ accountId: string; email: string; existed: boolean; canWrite: boolean }> {
    if (!hasScopes(tokens.scope)) throw new GoogleError('일정을 읽는 권한이 있어야 연결할 수 있어요.', 'scope')
    const list = await this.calendarList(null, tokens.access_token)
    const primary = list.find((c) => c.primary)
    if (!primary) throw new GoogleError('기본 캘린더를 찾지 못했어요.', 'http')
    const email = primary.id
    const accountId = accountKey(email)
    const old = this.d.vault.get(accountId)
    if (old && old.refresh_token !== tokens.refresh_token) await this.revoke(old.refresh_token) // 16 §7.5 리프레시 토큰 100개 한도
    this.d.vault.set(accountId, tokens)
    const existed = this.d.store.upsertAccount(accountId, 'google', email)
    this.d.store.setCanWrite(accountId, canWriteScope(tokens.scope))
    this.saveCalendars(accountId, list, !existed)
    return { accountId, email, existed, canWrite: canWriteScope(tokens.scope) }
  }

  // ── 16 §12 쓰기 ──
  private evPath = (calendarId: string, eventId?: string, q?: Record<string, string>) => `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}${q && Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`
  getEvent(accountId: string, calendarId: string, eventId: string) { return this.request<GoogleEvent>(accountId, 'GET', this.evPath(calendarId, eventId)) }
  insertEvent(accountId: string, calendarId: string, body: Record<string, unknown>, o: { notify?: boolean } = {}) {
    return this.request<GoogleEvent>(accountId, 'POST', this.evPath(calendarId, undefined, { sendUpdates: o.notify ? 'all' : 'none' }), { body })
  }
  patchEvent(accountId: string, calendarId: string, eventId: string, body: Record<string, unknown>, o: { etag?: string | null; notify?: boolean } = {}) {
    return this.request<GoogleEvent>(accountId, 'PATCH', this.evPath(calendarId, eventId, { sendUpdates: o.notify ? 'all' : 'none' }), { body, ifMatch: o.etag })
  }
  deleteEvent(accountId: string, calendarId: string, eventId: string, o: { etag?: string | null; notify?: boolean } = {}) {
    return this.request<unknown>(accountId, 'DELETE', this.evPath(calendarId, eventId, { sendUpdates: o.notify ? 'all' : 'none' }), { ifMatch: o.etag })
  }
  /** 쓰기 범위가 있는 토큰인지(증분 동의 뒤 바뀜) */
  canWrite(accountId: string) { const t = this.d.vault.get(accountId); return !!t && canWriteScope(t.scope) }
  /** 증분 동의로 받은 새 토큰을 그 계정에 넣는다(같은 계정이어야 함) */
  async replaceTokens(accountId: string, tokens: Tokens): Promise<boolean> {
    const list = await this.calendarList(null, tokens.access_token)
    const email = list.find((c) => c.primary)?.id
    if (!email || accountKey(email) !== accountId) { await this.revoke(tokens.refresh_token); throw new GoogleError('다른 구글 계정으로 허용했어요. 같은 계정으로 다시 시도해 주세요.', 'http') }
    const old = this.d.vault.get(accountId)
    if (old && old.refresh_token !== tokens.refresh_token) await this.revoke(old.refresh_token)
    this.d.vault.set(accountId, tokens)
    this.d.store.setCanWrite(accountId, canWriteScope(tokens.scope))
    return canWriteScope(tokens.scope)
  }

  private saveCalendars(accountId: string, list: GCalendarListEntry[], first: boolean) {
    this.d.store.replaceCalendars(accountId, list.map((c, i) => ({
      calendar_id: c.id,
      name: c.summaryOverride || c.summary || c.id,
      color_bg: c.backgroundColor ?? '#4E75F2',
      color_fg: c.foregroundColor ?? '#ffffff',
      access_role: c.accessRole ?? 'reader',
      group_label: null,
      is_primary: !!c.primary,
      // 16 §4.1: 처음엔 기본 + 구글에서 켜 둔 캘린더만 보이기, 나중에 생긴 캘린더는 숨기기
      initiallyVisible: first && (!!c.primary || !!c.selected),
      sort: i
    })))
  }

  async revoke(token: string) {
    await this.f(`${this.ep.revoke}?${new URLSearchParams({ token })}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000) }).catch(() => {})
  }

  /** 계정 한 개 새로 고침. 상태는 store에 기록하고, 오류 종류를 돌려준다 */
  async sync(accountId: string): Promise<GoogleErrorKind | null> {
    const store = this.d.store
    if (!store.account(accountId)) return null
    store.setStatus(accountId, 'syncing')
    const tz = this.d.timeZone()
    store.ensureTimeZone(tz)
    const from = cacheFrom(this.d.now?.() ?? new Date(), tz)
    try {
      this.saveCalendars(accountId, await this.calendarList(accountId), false)
      store.setCanWrite(accountId, this.canWrite(accountId))
      for (const cal of store.calendars(accountId).filter((c) => c.visibility === 'show')) {
        try { await this.syncCalendar(accountId, cal.calendar_id, cal.sync_token, from, tz) }
        catch (e) {
          if (e instanceof GoogleError && (e.kind === 'notfound' || e.kind === 'forbidden')) { store.dropCalendar(accountId, cal.calendar_id); continue } // 16 §3.2: 캘린더 하나 접근 잃음
          throw e
        }
      }
      store.prune(from)
      store.setStatus(accountId, 'ok', { synced: true, error: null })
      return null
    } catch (e) {
      const err = e instanceof GoogleError ? e : new GoogleError(String(e), 'http')
      const a = store.account(accountId)
      if (err.kind === 'reauth') store.setStatus(accountId, 'reauth', { error: err.message })
      else if (err.kind === 'scope') store.setStatus(accountId, 'scope_missing', { error: err.message })
      else if (err.kind === 'offline') store.setStatus(accountId, 'offline', { error: err.message })
      else store.setStatus(accountId, 'retrying', { error: err.message, nextRetryAt: Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (a?.fail_count ?? 0)) })
      return err.kind
    }
  }

  private async syncCalendar(accountId: string, calendarId: string, syncToken: string | null, from: string, tz: string): Promise<void> {
    const store = this.d.store
    let pageToken: string | undefined
    const base: Record<string, string> = { singleEvents: 'true', maxResults: '2500' }
    // syncToken과 timeMin은 같이 못 쓴다(구글 규칙)
    if (syncToken) base.syncToken = syncToken
    else { base.timeMin = new Date(`${from}T00:00:00Z`).toISOString(); store.clearEvents(accountId, calendarId) }
    try {
      do {
        const q = new URLSearchParams({ ...base, ...(pageToken ? { pageToken } : {}) })
        const r = await this.get<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(accountId, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`)
        const rows = (r.items ?? []).flatMap((ev): (EventRow | { delete: string })[] => {
          const m = mapGoogleEvent(ev, accountId, calendarId, tz)
          return m === 'delete' ? [{ delete: ev.id }] : m ? [m] : []
        })
        store.applyEvents(accountId, calendarId, rows)
        pageToken = r.nextPageToken
        if (!pageToken && r.nextSyncToken) store.setSyncToken(accountId, calendarId, r.nextSyncToken)
      } while (pageToken)
    } catch (e) {
      if (e instanceof GoogleError && e.kind === 'gone' && syncToken) { store.clearEvents(accountId, calendarId); return this.syncCalendar(accountId, calendarId, null, from, tz) } // 16 §7.3: 410 → 전체 다시
      throw e
    }
  }
}

/** 로그아웃·연결 끊기 공통(16 §4.4, 결정 ⑤): 구글 토큰 폐기 요청(실패해도 계속) → 토큰·계정·캐시 삭제 */
export async function wipeAccounts(store: CalendarStore, vault: TokenVault, g: Pick<GoogleSync, 'revoke'>, only?: string, waitMs = 5000) {
  const targets = store.accounts().filter((a) => !only || a.id === only)
  const revokes = targets.filter((a) => a.provider === 'google').map((a) => { const t = vault.get(a.id); vault.set(a.id, undefined); return t ? g.revoke(t.refresh_token) : undefined })
  await Promise.race([Promise.all(revokes), new Promise((r) => setTimeout(r, waitMs))])
  for (const a of targets) store.removeAccount(a.id)
}
