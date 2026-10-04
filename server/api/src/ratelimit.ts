// 로그인·가입 시도 제한 (메모리, API 한 대 기준 — README "시도 제한")
// - 키(예: "login:email:a@b.co", "login:ip:1.2.3.4")마다 최근 시각을 창(window) 안에서만 센다(미끄러지는 창).
// - check()는 세기만 하고 기록하지 않는다. 실패했을 때 hit()로 남기고, 로그인이 성공하면 reset()으로 이메일 칸을 비운다.
// - 클라이언트 IP: X-Forwarded-For는 믿을 수 있는 앞단(TRUST_PROXY)에서 온 연결일 때만 쓴다(맨 오른쪽 = 앞단이 붙인 값).
import type { IncomingMessage } from 'node:http'

export type Rule = { max: number; windowMs: number }
export type Verdict = { ok: true } | { ok: false; retryAfterSec: number }

export class RateLimitError extends Error {
  status = 429
  code = 'too_many_attempts'
  retryAfter: number
  constructor(retryAfterSec: number, what = '로그인') {
    super(`${what} 시도가 너무 많아요. ${Math.max(1, Math.ceil(retryAfterSec / 60))}분 뒤 다시 시도해 주세요.`)
    this.retryAfter = Math.max(1, Math.ceil(retryAfterSec))
  }
}

export class RateLimiter {
  private hits = new Map<string, number[]>()
  private calls = 0
  private now: () => number
  private maxKeys: number
  constructor(now: () => number = Date.now, maxKeys = 100_000) { this.now = now; this.maxKeys = maxKeys }

  private recent(key: string, rule: Rule): number[] {
    const t = this.now()
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < rule.windowMs)
    if (list.length) this.hits.set(key, list)
    else this.hits.delete(key)
    return list
  }

  /** 지금 더 해도 되나(기록하지 않음). 막혔으면 가장 오래된 기록이 창을 벗어날 때까지 남은 초 */
  check(key: string, rule: Rule): Verdict {
    const list = this.recent(key, rule)
    if (list.length < rule.max) return { ok: true }
    const oldest = list[list.length - rule.max]
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + rule.windowMs - this.now()) / 1000)) }
  }

  /** 한 번 기록한다(실패 또는 시도) */
  hit(key: string, rule: Rule) {
    const list = this.recent(key, rule)
    list.push(this.now())
    if (list.length > rule.max * 2) list.splice(0, list.length - rule.max * 2) // 막힌 뒤 계속 와도 메모리가 늘지 않게
    this.hits.set(key, list)
    if (++this.calls % 1000 === 0) this.sweep()
  }

  reset(key: string) { this.hits.delete(key) }

  /** 오래된 키 정리(가장 긴 창 기준). 키가 너무 많으면 오래된 것부터 버린다 */
  sweep(longestWindowMs = 24 * 3600_000) {
    const t = this.now()
    for (const [k, list] of this.hits) if (!list.length || t - list[list.length - 1] >= longestWindowMs) this.hits.delete(k)
    if (this.hits.size > this.maxKeys) {
      const extra = this.hits.size - this.maxKeys
      let i = 0
      for (const k of this.hits.keys()) { if (i++ >= extra) break; this.hits.delete(k) }
    }
  }

  get size() { return this.hits.size }
}

/** 여러 키를 한꺼번에 확인 — 하나라도 막혔으면 가장 긴 대기 시간으로 던진다 */
export function enforce(limiter: RateLimiter, checks: [string, Rule][], what?: string) {
  let wait = 0
  for (const [key, rule] of checks) {
    const v = limiter.check(key, rule)
    if (!v.ok) wait = Math.max(wait, v.retryAfterSec)
  }
  if (wait) throw new RateLimitError(wait, what)
}

// ── 한도 [임시] — 환경 변수로 바꾼다 ──
export type Limits = {
  loginEmail: Rule    // 이메일당 로그인 실패
  loginIp: Rule       // IP당 로그인 실패
  signupIp: Rule      // IP당 가입 시도(성공 포함)
  refreshIp: Rule     // IP당 리프레시 실패
  socialIp: Rule      // IP당 구글·애플 로그인 실패
  callbackIp: Rule    // IP당 애플 콜백(브라우저 form_post) 시도
  deleteUser: Rule    // 사용자당 계정 삭제 재인증 실패
}
const MIN = 60_000
const num = (env: Record<string, string | undefined>, name: string, def: number) => {
  const v = Number(env[name])
  return Number.isFinite(v) && v > 0 ? v : def
}
export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  const rule = (prefix: string, max: number, minutes: number): Rule => ({ max: num(env, `${prefix}_MAX`, max), windowMs: num(env, `${prefix}_WINDOW_MIN`, minutes) * MIN })
  return {
    loginEmail: rule('RL_LOGIN_EMAIL', 10, 15),
    loginIp: rule('RL_LOGIN_IP', 30, 15),
    signupIp: rule('RL_SIGNUP_IP', 5, 60),
    refreshIp: rule('RL_REFRESH_IP', 60, 15),
    socialIp: rule('RL_SOCIAL_IP', 30, 15),
    callbackIp: rule('RL_CALLBACK_IP', 60, 15),
    deleteUser: rule('RL_DELETE_USER', 5, 15)
  }
}

// ── 클라이언트 IP ──
export type TrustProxy = 'none' | 'loopback' | 'private'
export const trustFromEnv = (v = process.env.TRUST_PROXY): TrustProxy => (v === 'none' || v === 'private' ? v : 'loopback')

const strip = (ip: string) => ip.trim().replace(/^::ffff:/i, '').replace(/^\[|\]$/g, '').toLowerCase()
export const isLoopback = (raw: string) => {
  const ip = strip(raw)
  return ip === '::1' || /^127\./.test(ip)
}
export const isPrivate = (raw: string) => {
  const ip = strip(raw)
  if (isLoopback(ip)) return true
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true
  const m = /^172\.(\d+)\./.exec(ip)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true
  return /^f[cd][0-9a-f]{2}:/.test(ip) || /^fe[89ab][0-9a-f]:/.test(ip) // fc00::/7 · fe80::/10
}

/** 앞단이 믿을 만하면 X-Forwarded-For의 맨 오른쪽(앞단이 직접 붙인 값), 아니면 연결한 쪽 주소 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>, trust: TrustProxy): string {
  const peer = strip(req.socket?.remoteAddress ?? '') || '?'
  const trusted = trust === 'loopback' ? isLoopback(peer) : trust === 'private' ? isPrivate(peer) : false
  if (!trusted) return peer
  const xff = req.headers['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff.join(',') : xff
  const last = raw?.split(',').map((s) => s.trim()).filter(Boolean).pop()
  return last && last.length <= 64 && /^[0-9a-fA-F:.[\]]+$/.test(last) ? strip(last) : peer
}
