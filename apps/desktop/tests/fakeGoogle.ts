// 시험·화면 확인용 가짜 구글(OAuth + Calendar API v3 일부). 실제 구글 응답 모양만 흉내 낸다.
import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import type { GoogleEvent } from '../src/shared/calendars'

export interface FakeCalendar { id: string; summary: string; backgroundColor?: string; foregroundColor?: string; accessRole?: string; primary?: boolean; selected?: boolean }
export interface FakeGoogle {
  url: string
  endpoints: { auth: string; token: string; revoke: string; api: string }
  calendars: FakeCalendar[]
  /** 일정 바꾸기(증분 변경 기록에 남음). status 'cancelled'면 지운 것 */
  put(calendarId: string, ev: GoogleEvent): void
  state: {
    scope: string // 토큰 응답의 scope(일부만 동의 흉내)
    authError?: string // 동의 화면에서 거부 → ?error=
    revokedRefresh: Set<string>
    revoked: string[]
    expireSyncTokens: boolean // 다음 증분 요청에 410
    rateLimit: number // 앞으로 N번 429
    forbidCalendars: Set<string>
    insufficient: boolean
    pageSize: number
    requests: string[]
    accessTtl: number
  }
  close(): Promise<void>
}

export async function startFakeGoogle(opts: { email?: string } = {}): Promise<FakeGoogle> {
  const email = opts.email ?? 'me@example.com'
  const codes = new Map<string, string>() // code → challenge
  let seq = 0
  const log = new Map<string, { seq: number; ev: GoogleEvent }[]>()
  const access = new Map<string, number>() // access token → 만료
  let n = 0
  const state: FakeGoogle['state'] = {
    scope: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly',
    revokedRefresh: new Set(), revoked: [], expireSyncTokens: false, rateLimit: 0, forbidCalendars: new Set(), insufficient: false, pageSize: 2500, requests: [], accessTtl: 3600
  }
  const calendars: FakeCalendar[] = [
    { id: email, summary: email, backgroundColor: '#039be5', accessRole: 'owner', primary: true, selected: true },
    { id: 'family@group.calendar.google.com', summary: '가족', backgroundColor: '#7cb342', accessRole: 'owner', selected: false },
    { id: 'ko.south_korea#holiday@group.v.calendar.google.com', summary: '대한민국의 휴일', backgroundColor: '#0b8043', accessRole: 'reader', selected: true }
  ]
  const json = (res: import('node:http').ServerResponse, code: number, body: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  const readBody = (req: import('node:http').IncomingMessage) => new Promise<URLSearchParams>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(new URLSearchParams(b))) })
  const server: Server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    state.requests.push(`${req.method} ${u.pathname}${u.search}`)
    if (u.pathname === '/auth') {
      const redirect = u.searchParams.get('redirect_uri')!
      const back = new URL(redirect)
      back.searchParams.set('state', u.searchParams.get('state') ?? '')
      if (state.authError) back.searchParams.set('error', state.authError)
      else {
        const code = `code-${++n}`
        codes.set(code, u.searchParams.get('code_challenge') ?? '')
        back.searchParams.set('code', code)
      }
      res.writeHead(302, { location: back.href }).end()
      return
    }
    if (u.pathname === '/token') {
      const b = await readBody(req)
      if (b.get('grant_type') === 'authorization_code') {
        const challenge = codes.get(b.get('code') ?? '')
        const ok = challenge && createHash('sha256').update(b.get('code_verifier') ?? '').digest('base64url') === challenge
        if (!ok) return json(res, 400, { error: 'invalid_grant' })
        codes.delete(b.get('code')!)
        const at = `at-${++n}`
        access.set(at, Date.now() + state.accessTtl * 1000)
        return json(res, 200, { access_token: at, refresh_token: `rt-${n}`, expires_in: state.accessTtl, scope: state.scope, token_type: 'Bearer' })
      }
      if (b.get('grant_type') === 'refresh_token') {
        if (state.revokedRefresh.has(b.get('refresh_token') ?? '')) return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
        const at = `at-${++n}`
        access.set(at, Date.now() + state.accessTtl * 1000)
        return json(res, 200, { access_token: at, expires_in: state.accessTtl, scope: state.scope })
      }
      return json(res, 400, { error: 'unsupported_grant_type' })
    }
    if (u.pathname === '/revoke') { const t = u.searchParams.get('token') ?? ''; state.revoked.push(t); state.revokedRefresh.add(t); return json(res, 200, {}) }
    if (!u.pathname.startsWith('/api/')) return json(res, 404, {})
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    if (!access.has(token) || access.get(token)! < Date.now()) return json(res, 401, { error: { code: 401, errors: [{ reason: 'authError' }] } })
    if (state.rateLimit > 0) { state.rateLimit--; return json(res, 429, { error: { code: 429, errors: [{ reason: 'rateLimitExceeded' }] } }) }
    if (state.insufficient) return json(res, 403, { error: { code: 403, status: 'PERMISSION_DENIED', errors: [{ reason: 'insufficientPermissions' }] } })
    const path = u.pathname.slice(4)
    if (path === '/users/me/calendarList') return json(res, 200, { items: calendars })
    const m = /^\/calendars\/([^/]+)\/events$/.exec(path)
    if (m) {
      const id = decodeURIComponent(m[1])
      if (state.forbidCalendars.has(id)) return json(res, 404, { error: { code: 404, errors: [{ reason: 'notFound' }] } })
      const sync = u.searchParams.get('syncToken')
      if (sync && (u.searchParams.has('timeMin') || u.searchParams.has('timeMax'))) return json(res, 400, { error: { code: 400, errors: [{ reason: 'invalid' }] } })
      if (sync && state.expireSyncTokens) { state.expireSyncTokens = false; return json(res, 410, { error: { code: 410, errors: [{ reason: 'fullSyncRequired' }] } }) }
      if (u.searchParams.get('singleEvents') !== 'true') return json(res, 400, { error: { code: 400 } })
      const entries = log.get(id) ?? []
      let items: GoogleEvent[]
      if (sync) {
        const since = Number(sync.replace('tok-', ''))
        const latest = new Map<string, GoogleEvent>()
        for (const e of entries) if (e.seq > since) latest.set(e.ev.id, e.ev)
        items = [...latest.values()]
      } else {
        const latest = new Map<string, GoogleEvent>()
        for (const e of entries) latest.set(e.ev.id, e.ev)
        const timeMin = u.searchParams.get('timeMin')
        items = [...latest.values()].filter((e) => e.status !== 'cancelled' && (!timeMin || (e.end?.dateTime ?? `${e.end?.date}T00:00:00Z`) >= timeMin))
      }
      const offset = Number(u.searchParams.get('pageToken') ?? 0)
      const page = items.slice(offset, offset + state.pageSize)
      const more = offset + state.pageSize < items.length
      return json(res, 200, { kind: 'calendar#events', items: page, ...(more ? { nextPageToken: String(offset + state.pageSize) } : { nextSyncToken: `tok-${seq}` }) })
    }
    return json(res, 404, { error: { code: 404 } })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return {
    url,
    endpoints: { auth: `${url}/auth`, token: `${url}/token`, revoke: `${url}/revoke`, api: `${url}/api` },
    calendars,
    put(calendarId, ev) { seq++; const l = log.get(calendarId) ?? []; l.push({ seq, ev }); log.set(calendarId, l) },
    state,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) })
  }
}
