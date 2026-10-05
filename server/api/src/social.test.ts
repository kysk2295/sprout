// 소셜 로그인 시험: 이 자리에서 만든 키·가짜 JWKS로 구글·애플 토큰 검증, 계정 연결 규칙, 애플 맡김 칸, client_secret
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose'
import {
  appleClientSecret, appleReturnPage, appleTokenExchange, exchangeAppleCode, revokeAppleToken, revokeAppleTokens, HandoffStore, memoryIdentityStore, NONCELESS_MAX_AGE_SEC, parseAppleCallback, ReplayGuard, resolveSocialUser,
  socialConfigFromEnv, SocialError, verifyAppleIdToken, verifyGoogleIdToken
} from './social.ts'

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
const other = await generateKeyPair('RS256', { extractable: true })
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] })
const sign = (claims: Record<string, unknown>, o: { iss: string; aud: string; sub?: string; exp?: string; key?: any; kid?: string }) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: o.kid ?? 'k1' }).setIssuer(o.iss).setAudience(o.aud).setSubject(o.sub ?? 'sub-1').setIssuedAt().setExpirationTime(o.exp ?? '10m').sign(o.key ?? privateKey)
const rejects401 = async (p: Promise<unknown>) => { await assert.rejects(p, (e: any) => e instanceof SocialError && e.status === 401) }

// ── 구글 ──
const G = 'client-1.apps.googleusercontent.com'
const gopts = { clientIds: [G, 'other-client'], keys }
const gtok = await sign({ email: 'Me@Gmail.com', email_verified: true, nonce: 'n-1' }, { iss: 'https://accounts.google.com', aud: G })
const g = await verifyGoogleIdToken(gtok, { ...gopts, nonce: 'n-1' })
assert.deepEqual(g, { provider: 'google', subject: 'sub-1', email: 'me@gmail.com', emailVerified: true, privateRelay: false })
assert.equal((await verifyGoogleIdToken(await sign({ email: 'a@b.co', email_verified: true, nonce: 'n-1' }, { iss: 'accounts.google.com', aud: G }), { ...gopts, nonce: 'n-1' })).email, 'a@b.co') // iss 두 형태
await rejects401(verifyGoogleIdToken(gtok, { ...gopts, nonce: 'n-2' })) // nonce 다름
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://accounts.google.com', aud: 'someone-else' }), gopts)) // 다른 앱의 토큰
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://evil.example', aud: G }), gopts))
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://accounts.google.com', aud: G, exp: '-5m' }), gopts)) // 만료
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://accounts.google.com', aud: G, key: other.privateKey }), gopts)) // 서명 위조
await rejects401(verifyGoogleIdToken('not-a-jwt', gopts))
await rejects401(verifyGoogleIdToken(42, gopts))
await assert.rejects(verifyGoogleIdToken(gtok, { clientIds: [], keys }), (e: any) => e.status === 503) // 설정 없음
assert.equal((await verifyGoogleIdToken(await sign({ email: 'x@y.co', email_verified: false, nonce: 'n' }, { iss: 'https://accounts.google.com', aud: G }), { ...gopts, nonce: 'n' })).emailVerified, false)

// 모바일(20 §4.3): 기기 구글 로그인은 nonce를 넣지 못한다 → azp(iOS·Android 클라이언트) ≠ aud(웹 클라이언트) · 10분 안 · 한 번만
{
  const W = 'web-1.apps.googleusercontent.com'
  const mopts = { clientIds: [G, W], keys }
  const now = Math.floor(Date.now() / 1000)
  const mob = (claims: Record<string, unknown> = {}) => sign({ email: 'm@gmail.com', email_verified: true, azp: 'ios-1.apps.googleusercontent.com', ...claims }, { iss: 'https://accounts.google.com', aud: W })
  const replay = new ReplayGuard()
  const t1 = await mob()
  assert.equal((await verifyGoogleIdToken(t1, { ...mopts, replay })).email, 'm@gmail.com')
  await rejects401(verifyGoogleIdToken(t1, { ...mopts, replay })) // 같은 토큰 두 번 → 거절(재사용)
  assert.equal((await verifyGoogleIdToken(await mob({ jti: 'j-1' }), { ...mopts, replay })).subject, 'sub-1')
  await rejects401(verifyGoogleIdToken(await mob({ jti: 'j-1' }), { ...mopts, replay })) // jti가 같으면 재사용
  assert.equal((await verifyGoogleIdToken(await mob({ jti: 'j-2' }), { ...mopts, replay, nonce: null })).email, 'm@gmail.com') // nonce: null = 없음
  // 데스크톱 토큰(azp = aud, nonce 있음)에서 nonce를 빼고 보내면 거절 — nonce 검사를 건너뛸 수 없다
  await rejects401(verifyGoogleIdToken(gtok, { ...gopts, replay }))
  await rejects401(verifyGoogleIdToken(await sign({ azp: G }, { iss: 'https://accounts.google.com', aud: G }), { ...gopts, replay }))
  await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://accounts.google.com', aud: W }), { ...mopts, replay })) // azp 없음
  // 오래된 토큰(발급 10분 넘음) · 미래 발급 → 거절
  await rejects401(verifyGoogleIdToken(await mob({ jti: 'j-3' }), { ...mopts, replay, nowSec: now + NONCELESS_MAX_AGE_SEC + 5 }))
  await rejects401(verifyGoogleIdToken(await mob({ jti: 'j-4' }), { ...mopts, replay, nowSec: now - 300 }))
  // nonce를 보냈으면 모바일 토큰이라도 nonce가 맞아야 한다
  await rejects401(verifyGoogleIdToken(await mob({ jti: 'j-5' }), { ...mopts, replay, nonce: 'x' }))
  assert.equal((await verifyGoogleIdToken(await mob({ jti: 'j-6', nonce: 'x' }), { ...mopts, replay, nonce: 'x' })).email, 'm@gmail.com')
  // 기록은 토큰이 끝나면 지워지고, 가득 차면 가장 오래된 것부터 지운다
  let clock = 0
  const g2 = new ReplayGuard(2, () => clock)
  assert.equal(g2.use('a', 10), true); assert.equal(g2.use('a', 10), false)
  clock = 11_000; assert.equal(g2.use('a', 20), true)
  assert.equal(g2.use('b', 20), true); assert.equal(g2.use('c', 20), true)
  assert.equal(g2.use('b', 20), false); assert.equal(g2.use('a', 20), true)
}


// ── 애플 ──
const A = 'com.sprout.signin'
const raw = 'raw-nonce-123'
const hashed = createHash('sha256').update(raw).digest('hex')
const atok = await sign({ email: 'abc@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true', nonce: hashed }, { iss: 'https://appleid.apple.com', aud: A, sub: '001.apple' })
const a = await verifyAppleIdToken(atok, { servicesId: A, keys, rawNonce: raw })
assert.deepEqual(a, { provider: 'apple', subject: '001.apple', email: 'abc@privaterelay.appleid.com', emailVerified: true, privateRelay: true, audience: A })
await rejects401(verifyAppleIdToken(atok, { servicesId: A, keys, rawNonce: hashed })) // 해시를 그대로 보내면 안 된다(원래 nonce만)
await rejects401(verifyAppleIdToken(atok, { servicesId: A, keys, rawNonce: undefined }))
await rejects401(verifyAppleIdToken(atok, { servicesId: 'other', keys, rawNonce: raw }))
// 두 번째 로그인부터는 이메일이 없을 수 있다
const a2 = await verifyAppleIdToken(await sign({ nonce: hashed }, { iss: 'https://appleid.apple.com', aud: A, sub: '001.apple' }), { servicesId: A, keys, rawNonce: raw })
assert.equal(a2.email, null)

// iOS 기기 애플 로그인(20 §4.3.1): aud = 앱 번들 id. 웹 Services ID용 토큰과 섞이지 않는다
{
  const B = 'app.sprout.mobile'
  const ntok = await sign({ email: 'me@icloud.com', email_verified: true, nonce: hashed }, { iss: 'https://appleid.apple.com', aud: B, sub: '001.apple' })
  const n = await verifyAppleIdToken(ntok, { audiences: [B, 'app.sprout.mobile.dev'], keys, rawNonce: raw })
  assert.deepEqual([n.subject, n.email, n.audience, n.privateRelay], ['001.apple', 'me@icloud.com', B, false])
  await rejects401(verifyAppleIdToken(ntok, { servicesId: A, keys, rawNonce: raw })) // 웹(Services ID) 자리에는 기기 토큰을 못 쓴다
  await rejects401(verifyAppleIdToken(atok, { audiences: [B], keys, rawNonce: raw })) // 기기 자리에는 웹 토큰을 못 쓴다
  await rejects401(verifyAppleIdToken(ntok, { audiences: [B], keys, rawNonce: 'other-nonce' }))
  await rejects401(verifyAppleIdToken(ntok, { audiences: [B], keys, rawNonce: undefined })) // 기기도 nonce 필수
  await assert.rejects(verifyAppleIdToken(ntok, { audiences: [], keys, rawNonce: raw }), (e: any) => e.status === 503) // 꺼짐
}

// ── 계정 규칙 ──
const store = memoryIdentityStore()
store.users.set('pw', { id: 'pw', email: 'me@gmail.com', password: true }) // 이메일·비밀번호로 먼저 가입한 계정
let r = await resolveSocialUser(store, g)
assert.deepEqual(r, { user: { id: 'pw', email: 'me@gmail.com' }, created: false, linked: true }) // 확인된 같은 이메일 → 연결
r = await resolveSocialUser(store, g)
assert.deepEqual(r, { user: { id: 'pw', email: 'me@gmail.com' }, created: false, linked: false }) // 다음부터는 식별자로
r = await resolveSocialUser(store, a)
assert.equal(r.created, true) // 가림 이메일 → 새 계정(비밀번호 없음)
assert.equal(store.users.get(r.user.id)!.password, false)
assert.equal(store.inboxes.get(r.user.id), `inbox-${r.user.id}`) // 새 계정은 기본함과 함께 만든다(defaultInbox.ts)
assert.equal(store.inboxes.has('pw'), false) // 기존 계정에 연결할 때는 만들지 않는다(그 계정은 이미 있다)
const appleUser = r.user.id
r = await resolveSocialUser(store, a2) // 이메일 없는 다음 로그인 → 같은 계정
assert.equal(r.user.id, appleUser)
await assert.rejects(resolveSocialUser(store, { ...a2, subject: 'new-apple' }), (e: any) => e.status === 400 && /email required/.test(e.message))
await assert.rejects(resolveSocialUser(store, { ...g, subject: 'g2', email: 'me@gmail.com', emailVerified: false }), (e: any) => e.status === 403) // 확인 안 된 이메일로 남의 계정에 붙지 않는다
assert.equal(store.identities.length, 2)
// 같은 사람이 구글과 애플(실제 이메일 공유)을 둘 다 쓰면 한 계정
r = await resolveSocialUser(store, { provider: 'apple', subject: '002.apple', email: 'me@gmail.com', emailVerified: true, privateRelay: false })
assert.deepEqual([r.user.id, r.linked], ['pw', true])

// ── 애플 콜백 · 맡김 칸 ──
const state = 'S'.repeat(43)
assert.deepEqual(parseAppleCallback(new URLSearchParams({ state, code: 'c1', id_token: 't1', user: '{"email":"fake@x.com"}' }).toString()), { state, value: { idToken: 't1', code: 'c1' } })
assert.deepEqual(parseAppleCallback(new URLSearchParams({ state, error: 'user_cancelled_authorize' }).toString()), { state, value: { error: 'cancelled' } })
assert.equal(parseAppleCallback(new URLSearchParams({ state: 'short', id_token: 't' }).toString()), null)
assert.equal(parseAppleCallback(new URLSearchParams({ state: `${state}"><script>`, id_token: 't' }).toString()), null)
assert.deepEqual(parseAppleCallback(new URLSearchParams({ state }).toString())!.value, { error: 'apple error' })
const page = appleReturnPage(state, true)
assert.ok(page.includes(`sprout://auth/apple?state=${state}`) && !page.includes('t1'))
let clock = 0
const hs = new HandoffStore(1000, 3, () => clock)
hs.put(state, { idToken: 't1' })
assert.ok(hs.has(state))
assert.deepEqual(hs.take(state), { idToken: 't1' })
assert.equal(hs.take(state), undefined) // 한 번만
hs.put('a', {}); clock = 2000
assert.equal(hs.take('a'), undefined) // 5분(여기선 1초) 지나면 사라짐
clock = 0; hs.put('1', {}); hs.put('2', {}); hs.put('3', {}); hs.put('4', {})
assert.ok(!hs.has('1') && hs.has('4')) // 상한을 넘으면 오래된 것부터

// ── client_secret · 코드 교환 ──
const ec = await generateKeyPair('ES256', { extractable: true })
const apple = { servicesId: A, redirectUri: 'https://api.example/auth/apple/callback', teamId: 'BU697KN34B', keyId: 'KEY123', privateKey: await exportPKCS8(ec.privateKey) }
const secret = await appleClientSecret(apple)
assert.equal(decodeProtectedHeader(secret).kid, 'KEY123')
const { payload } = await jwtVerify(secret, ec.publicKey, { issuer: 'BU697KN34B', audience: 'https://appleid.apple.com', subject: A })
assert.ok(payload.exp! - payload.iat! <= 300)
let sent: URLSearchParams | undefined
const fakeFetch = (async (_url: string, init: any) => { sent = init.body; return new Response(JSON.stringify({ id_token: await sign({}, { iss: 'https://appleid.apple.com', aud: A, sub: '001.apple' }) }), { status: 200 }) }) as unknown as typeof fetch
assert.equal(await exchangeAppleCode(apple, 'code-1', fakeFetch), '001.apple')
assert.equal(sent!.get('code'), 'code-1')
assert.equal(sent!.get('redirect_uri'), apple.redirectUri)
await assert.rejects(exchangeAppleCode(apple, 'bad', (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch))

// 기기 코드 교환: client_id = 번들 id, redirect_uri 없음, refresh_token 돌려받음(폐기용)
{
  const B = 'app.sprout.mobile'
  const key = { teamId: apple.teamId, keyId: apple.keyId, privateKey: apple.privateKey }
  let body: URLSearchParams | undefined
  const f = (async (url: string, init: any) => {
    assert.equal(url, 'https://appleid.apple.com/auth/token')
    body = init.body
    return new Response(JSON.stringify({ id_token: await sign({}, { iss: 'https://appleid.apple.com', aud: B, sub: '001.apple' }), refresh_token: 'rt-1' }), { status: 200 })
  }) as unknown as typeof fetch
  assert.deepEqual(await appleTokenExchange(key, B, 'code-2', undefined, f), { subject: '001.apple', refreshToken: 'rt-1' })
  assert.equal(body!.get('client_id'), B)
  assert.equal(body!.get('redirect_uri'), null)
  await jwtVerify(body!.get('client_secret')!, ec.publicKey, { issuer: 'BU697KN34B', audience: 'https://appleid.apple.com', subject: B }) // client_secret sub = 번들 id

  // 폐기: /auth/revoke 에 refresh_token 힌트로
  const calls: URLSearchParams[] = []
  const rf = (async (url: string, init: any) => {
    assert.equal(url, 'https://appleid.apple.com/auth/revoke')
    calls.push(init.body)
    return new Response('', { status: init.body.get('token') === 'bad' ? 400 : 200 })
  }) as unknown as typeof fetch
  assert.equal(await revokeAppleToken(key, B, 'rt-1', rf), true)
  assert.deepEqual([calls[0].get('client_id'), calls[0].get('token'), calls[0].get('token_type_hint')], [B, 'rt-1', 'refresh_token'])
  // 여러 개 · 일부 실패 · 네트워크 오류도 던지지 않는다
  const thrower = (async () => { throw new Error('offline') }) as unknown as typeof fetch
  assert.deepEqual(await revokeAppleTokens(key, [{ clientId: B, refreshToken: 'rt-1' }, { clientId: A, refreshToken: 'bad' }], rf), { revoked: 1, failed: 1 })
  assert.deepEqual(await revokeAppleTokens(key, [{ clientId: B, refreshToken: 'rt-1' }], thrower), { revoked: 0, failed: 1 })
  assert.deepEqual(await revokeAppleTokens(null, [{ clientId: B, refreshToken: 'rt-1' }], rf), { revoked: 0, failed: 1 }) // 키 없음
  assert.deepEqual(await revokeAppleTokens(key, [], rf), { revoked: 0, failed: 0 })
}

// ── 환경 변수 ──
const cfg = socialConfigFromEnv({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_IDS: 'b, a', APPLE_SERVICES_ID: A, APPLE_KEY_ID: 'K', API_PUBLIC_URL: 'https://x.example/' })
assert.deepEqual(cfg.googleClientIds, ['b', 'a'])
assert.deepEqual(cfg.apple, { servicesId: A, redirectUri: 'https://x.example/auth/apple/callback', teamId: 'BU697KN34B', keyId: 'K', privateKey: null })
assert.equal(socialConfigFromEnv({}).apple, null)
// 기기 애플: 기본 번들 id app.sprout.mobile, 목록·끄기, 키는 .p8 + KEY_ID가 다 있을 때만
assert.deepEqual(socialConfigFromEnv({}).appleNative, { bundleIds: ['app.sprout.mobile'], key: null })
assert.deepEqual(socialConfigFromEnv({ APPLE_BUNDLE_IDS: 'a.b, c.d' }).appleNative.bundleIds, ['a.b', 'c.d'])
assert.deepEqual(socialConfigFromEnv({ APPLE_BUNDLE_IDS: 'off' }).appleNative.bundleIds, [])
{
  const pem = apple.privateKey
  const n = socialConfigFromEnv({ APPLE_PRIVATE_KEY: pem, APPLE_KEY_ID: 'K2', APPLE_TEAM_ID: 'TEAM9' }).appleNative
  assert.deepEqual(n.key, { teamId: 'TEAM9', keyId: 'K2', privateKey: pem })
  assert.equal(socialConfigFromEnv({ APPLE_PRIVATE_KEY: pem }).appleNative.key, null) // KEY_ID 없음
}
console.log('social: ok')
