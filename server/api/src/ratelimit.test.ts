// 시도 제한 시험: 미끄러지는 창, 성공 시 초기화, 429 문구·Retry-After, 환경 변수, X-Forwarded-For 믿는 범위
import assert from 'node:assert/strict'
import { clientIp, enforce, isPrivate, limitsFromEnv, RateLimiter, RateLimitError, trustFromEnv, type Rule } from './ratelimit.ts'

let now = 1_000_000
const clock = () => now
const MIN = 60_000

// ── 창 안에서만 센다 ──
{
  const l = new RateLimiter(clock)
  const rule: Rule = { max: 3, windowMs: 15 * MIN }
  for (let i = 0; i < 3; i++) { assert.deepEqual(l.check('k', rule), { ok: true }); l.hit('k', rule); now += MIN }
  const v = l.check('k', rule)
  assert.equal(v.ok, false)
  // 첫 기록(3분 전)이 창을 벗어날 때까지 12분 = 720초
  assert.equal(!v.ok && v.retryAfterSec, 720)
  now += 12 * MIN
  assert.deepEqual(l.check('k', rule), { ok: true }) // 가장 오래된 하나가 빠졌다
  l.hit('k', rule)
  assert.equal(l.check('k', rule).ok, false)
  l.reset('k')
  assert.deepEqual(l.check('k', rule), { ok: true }) // 성공하면 초기화
  assert.equal(l.check('other', rule).ok, true) // 키끼리 따로
}

// ── 로그인 규칙: 이메일 10회·IP 30회 실패, 성공하면 이메일만 초기화 ──
{
  const l = new RateLimiter(clock)
  const limits = limitsFromEnv({})
  const email = 'login:email:me@x.co'
  const ip = 'login:ip:1.2.3.4'
  const attempt = (ok: boolean) => {
    enforce(l, [[ip, limits.loginIp], [email, limits.loginEmail]])
    if (ok) l.reset(email)
    else { l.hit(ip, limits.loginIp); l.hit(email, limits.loginEmail) }
  }
  for (let i = 0; i < 9; i++) attempt(false)
  attempt(true) // 10번째에 맞힘 → 이메일 칸 비움
  for (let i = 0; i < 10; i++) attempt(false)
  assert.throws(() => attempt(false), (e: any) => {
    assert.ok(e instanceof RateLimitError)
    assert.equal(e.status, 429)
    assert.equal(e.retryAfter, 15 * 60)
    assert.equal(e.message, '로그인 시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.')
    return true
  })
  // 같은 IP에서 다른 이메일: IP 실패는 19회라 아직 된다, 11회 더 하면 IP가 막힌다
  const other = 'login:email:you@x.co'
  for (let i = 0; i < 11; i++) { enforce(l, [[ip, limits.loginIp], [other, limits.loginEmail]]); l.hit(ip, limits.loginIp); l.hit(other, limits.loginEmail); if (i === 8) l.reset(other) }
  assert.throws(() => enforce(l, [[ip, limits.loginIp], ['login:email:third@x.co', limits.loginEmail]]), RateLimitError)
  // 다른 IP·같은 이메일(막힌 이메일)은 여전히 막힘
  assert.throws(() => enforce(l, [['login:ip:5.6.7.8', limits.loginIp], [email, limits.loginEmail]]), RateLimitError)
  now += 15 * MIN
  enforce(l, [[ip, limits.loginIp], [email, limits.loginEmail]]) // 15분 지나면 풀림
}

// ── 문구: 분은 올림, 가입은 "가입" ──
assert.equal(new RateLimitError(61, '가입').message, '가입 시도가 너무 많아요. 2분 뒤 다시 시도해 주세요.')
assert.equal(new RateLimitError(5).message, '로그인 시도가 너무 많아요. 1분 뒤 다시 시도해 주세요.')

// ── 한도 기본값·환경 변수 ──
{
  const d = limitsFromEnv({})
  assert.deepEqual(d.loginEmail, { max: 10, windowMs: 15 * MIN })
  assert.deepEqual(d.loginIp, { max: 30, windowMs: 15 * MIN })
  assert.deepEqual(d.signupIp, { max: 5, windowMs: 60 * MIN })
  const e = limitsFromEnv({ RL_SIGNUP_IP_MAX: '20', RL_SIGNUP_IP_WINDOW_MIN: '30', RL_LOGIN_EMAIL_MAX: 'abc', RL_LOGIN_IP_MAX: '-1' })
  assert.deepEqual(e.signupIp, { max: 20, windowMs: 30 * MIN })
  assert.equal(e.loginEmail.max, 10) // 잘못된 값은 기본값
  assert.equal(e.loginIp.max, 30)
}

// ── 메모리: 막힌 뒤 계속 와도 키당 기록이 늘지 않고, 오래된 키는 정리 ──
{
  const l = new RateLimiter(clock, 3)
  const rule = { max: 2, windowMs: MIN }
  for (let i = 0; i < 100; i++) l.hit('flood', rule)
  assert.equal((l as any).hits.get('flood').length, 4)
  for (let i = 0; i < 5; i++) l.hit(`k${i}`, rule)
  l.sweep()
  assert.ok(l.size <= 3)
  now += 25 * 3600_000
  l.sweep()
  assert.equal(l.size, 0)
}

// ── 클라이언트 IP ──
const req = (remoteAddress: string, xff?: string | string[]) => ({ socket: { remoteAddress } as any, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } })
assert.equal(trustFromEnv(undefined), 'loopback')
assert.equal(trustFromEnv('private'), 'private')
assert.equal(trustFromEnv('none'), 'none')
assert.equal(trustFromEnv('weird'), 'loopback')
// 루프백 앞단(Tailscale Funnel → 127.0.0.1)만 믿는다: 맨 오른쪽 값 = Funnel이 붙인 진짜 주소
assert.equal(clientIp(req('127.0.0.1', '9.9.9.9, 203.0.113.7'), 'loopback'), '203.0.113.7')
assert.equal(clientIp(req('::ffff:127.0.0.1', '203.0.113.7'), 'loopback'), '203.0.113.7')
assert.equal(clientIp(req('::1', ['1.1.1.1', '203.0.113.8']), 'loopback'), '203.0.113.8')
// 인터넷에서 바로 온 연결이 XFF를 꾸며도 무시
assert.equal(clientIp(req('198.51.100.4', '127.0.0.1'), 'loopback'), '198.51.100.4')
// 도커 게이트웨이(사설 주소)는 loopback 모드에서는 믿지 않고, private 모드에서만 믿는다
assert.equal(clientIp(req('::ffff:172.18.0.1', '203.0.113.9'), 'loopback'), '172.18.0.1')
assert.equal(clientIp(req('::ffff:172.18.0.1', '203.0.113.9'), 'private'), '203.0.113.9')
assert.equal(clientIp(req('192.168.65.1', '203.0.113.9'), 'private'), '203.0.113.9')
assert.equal(clientIp(req('127.0.0.1', '203.0.113.9'), 'none'), '127.0.0.1')
// XFF가 없거나 이상하면 연결한 쪽
assert.equal(clientIp(req('127.0.0.1'), 'loopback'), '127.0.0.1')
assert.equal(clientIp(req('127.0.0.1', 'not an ip<script>'), 'loopback'), '127.0.0.1')
assert.equal(clientIp(req('127.0.0.1', '2001:db8::1'), 'loopback'), '2001:db8::1')
assert.ok(isPrivate('10.0.0.1') && isPrivate('172.31.255.1') && !isPrivate('172.32.0.1') && isPrivate('fd7a:115c:a1e0::1') && !isPrivate('8.8.8.8'))

console.log('ratelimit: ok')
