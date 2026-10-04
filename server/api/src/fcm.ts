// FCM HTTP v1 보내기 (32 §10 I6) — firebase-admin 없이 jose로 서비스 계정 JWT(RS256)를 만들어 OAuth 토큰과 바꾼다(55분 캐시).
//   설정: FCM_PROJECT_ID(비면 푸시 전체 꺼짐) + 서비스 계정 키 FCM_SERVICE_ACCOUNT(파일 경로, 컨테이너 /run/secrets/fcm.json)
//         또는 FCM_SERVICE_ACCOUNT_B64(base64 JSON — Railway처럼 파일을 붙일 수 없는 곳).
//   결과: ok · invalid(토큰이 더는 쓸 수 없음 → 호출한 쪽이 기기 행을 지운다) · error(다음에 다시).
//   429·5xx는 Retry-After/지수 백오프로 3번까지(한 번 보내기에 10초 이하). 401이면 OAuth 토큰을 한 번 새로 받는다.
//   메시지 내용(할 일 제목 등)은 로그에 남기지 않는다.
import { readFile } from 'node:fs/promises'
import { importPKCS8, SignJWT } from 'jose'

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
export type ServiceAccount = { client_email: string; private_key: string; private_key_id?: string; token_uri?: string; project_id?: string }
export type FcmConfig = { projectId: string; account: ServiceAccount; apiBase: string }
export type SendResult = { ok: true } | { ok: false; invalid: boolean; status: number; code?: string }
export type FcmMessage = Record<string, unknown> // HTTP v1 message(token 칸 없이)
export type FcmSender = { send: (token: string, message: FcmMessage) => Promise<SendResult> }

/** 환경 변수 → 설정. FCM_PROJECT_ID가 비면 null(푸시 꺼짐). 키가 없거나 깨졌으면 던진다(잘못 배포를 바로 알게) */
export async function fcmConfigFromEnv(env: Record<string, string | undefined> = process.env): Promise<FcmConfig | null> {
  const projectId = env.FCM_PROJECT_ID?.trim()
  if (!projectId) return null
  let raw: string | undefined
  const b64 = env.FCM_SERVICE_ACCOUNT_B64?.trim() || env.FCM_SERVICE_ACCOUNT_JSON?.trim()
  if (b64) raw = b64.startsWith('{') ? b64 : Buffer.from(b64, 'base64').toString('utf8')
  else if (env.FCM_SERVICE_ACCOUNT?.trim()) raw = await readFile(env.FCM_SERVICE_ACCOUNT.trim(), 'utf8')
  if (!raw?.trim()) throw new Error('FCM_PROJECT_ID is set but no service account (FCM_SERVICE_ACCOUNT or FCM_SERVICE_ACCOUNT_B64)')
  let account: ServiceAccount
  try { account = JSON.parse(raw) } catch { throw new Error('FCM service account is not valid JSON') }
  if (typeof account?.client_email !== 'string' || typeof account?.private_key !== 'string') throw new Error('FCM service account needs client_email and private_key')
  if (account.project_id && account.project_id !== projectId) console.warn('[push] FCM_PROJECT_ID와 서비스 계정 project_id가 다르다')
  return { projectId, account, apiBase: env.FCM_API_BASE?.trim() || 'https://fcm.googleapis.com' }
}

type Fetch = typeof fetch
export type SenderOpts = { fetch?: Fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; maxAttempts?: number; maxWaitMs?: number }

export function createFcmSender(cfg: FcmConfig, opts: SenderOpts = {}): FcmSender & { accessToken: () => Promise<string> } {
  const doFetch = opts.fetch ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  const maxAttempts = opts.maxAttempts ?? 3
  const maxWaitMs = opts.maxWaitMs ?? 10_000
  const tokenUri = cfg.account.token_uri || 'https://oauth2.googleapis.com/token'
  let cached: { token: string; until: number } | null = null
  let inflight: Promise<string> | null = null
  let key: CryptoKey | null = null

  async function fetchToken(): Promise<string> {
    key ??= (await importPKCS8(cfg.account.private_key, 'RS256')) as CryptoKey
    const iat = Math.floor(now() / 1000)
    const assertion = await new SignJWT({ scope: FCM_SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(cfg.account.private_key_id ? { kid: cfg.account.private_key_id } : {}) })
      .setIssuer(cfg.account.client_email)
      .setSubject(cfg.account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key)
    const r = await doFetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
    })
    if (!r.ok) throw new Error(`oauth token ${r.status}`)
    const j = (await r.json()) as { access_token?: string; expires_in?: number }
    if (!j.access_token) throw new Error('oauth token missing')
    // 구글 토큰은 1시간 — 55분만 쓴다
    cached = { token: j.access_token, until: now() + Math.min((j.expires_in ?? 3600) * 1000, 3600_000) - 5 * 60_000 }
    return j.access_token
  }
  async function accessToken(): Promise<string> {
    if (cached && cached.until > now()) return cached.token
    inflight ??= fetchToken().finally(() => { inflight = null })
    return inflight
  }

  async function send(token: string, message: FcmMessage): Promise<SendResult> {
    const url = `${cfg.apiBase}/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`
    let waited = 0
    let reauthed = false
    let last: SendResult = { ok: false, invalid: false, status: 0 }
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let r: Response
      try {
        r = await doFetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message: { ...message, token } })
        })
      } catch {
        last = { ok: false, invalid: false, status: 0, code: 'network' }
        r = null as unknown as Response
      }
      if (r) {
        if (r.ok) { await r.body?.cancel().catch(() => {}); return { ok: true } }
        const err = await readError(r)
        last = { ok: false, invalid: isInvalidToken(r.status, err), status: r.status, code: err.code }
        if (last.invalid) return last
        if (r.status === 401 && !reauthed) { cached = null; reauthed = true; attempt--; continue }
        if (!(r.status === 429 || r.status >= 500)) return last // 400·403 등: 다시 보내도 같다
      }
      if (attempt === maxAttempts) break
      const retryAfter = r ? Number(r.headers.get('retry-after')) : NaN
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1)
      if (waited + wait > maxWaitMs) break
      waited += wait
      await sleep(wait)
    }
    return last
  }
  return { send, accessToken }
}

type FcmErrorBody = { code?: string; status?: string; message?: string }
async function readError(r: Response): Promise<FcmErrorBody> {
  try {
    const j = (await r.json()) as { error?: { status?: string; message?: string; details?: { '@type'?: string; errorCode?: string }[] } }
    const fcm = j.error?.details?.find((d) => d['@type']?.includes('FcmError'))?.errorCode
    return { code: fcm ?? j.error?.status, status: j.error?.status, message: j.error?.message }
  } catch { return {} }
}
/** 이 토큰은 더 쓸 수 없다: 앱 삭제·토큰 만료(UNREGISTERED), 다른 프로젝트 토큰(SENDER_ID_MISMATCH), 토큰 형식 오류 */
function isInvalidToken(status: number, e: FcmErrorBody): boolean {
  if (e.code === 'UNREGISTERED' || e.code === 'SENDER_ID_MISMATCH') return true
  if (status === 404 && e.status === 'NOT_FOUND') return true
  if (status === 400 && e.code === 'INVALID_ARGUMENT' && /registration token/i.test(e.message ?? '')) return true
  return false
}
