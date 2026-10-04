// 소셜 로그인 시험: 이 자리에서 만든 키·가짜 JWKS로 구글·애플 토큰 검증, 계정 연결 규칙, 애플 맡김 칸, client_secret
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose'
import {
  appleClientSecret, appleReturnPage, exchangeAppleCode, HandoffStore, memoryIdentityStore, parseAppleCallback, resolveSocialUser,
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
assert.equal((await verifyGoogleIdToken(await sign({ email: 'a@b.co', email_verified: true }, { iss: 'accounts.google.com', aud: G }), gopts)).email, 'a@b.co') // iss 두 형태
await rejects401(verifyGoogleIdToken(gtok, { ...gopts, nonce: 'n-2' })) // nonce 다름
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://accounts.google.com', aud: 'someone-else' }), gopts)) // 다른 앱의 토큰
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://evil.example', aud: G }), gopts))
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://accounts.google.com', aud: G, exp: '-5m' }), gopts)) // 만료
await rejects401(verifyGoogleIdToken(await sign({}, { iss: 'https://accounts.google.com', aud: G, key: other.privateKey }), gopts)) // 서명 위조
await rejects401(verifyGoogleIdToken('not-a-jwt', gopts))
await rejects401(verifyGoogleIdToken(42, gopts))
await assert.rejects(verifyGoogleIdToken(gtok, { clientIds: [], keys }), (e: any) => e.status === 503) // 설정 없음
assert.equal((await verifyGoogleIdToken(await sign({ email: 'x@y.co', email_verified: false }, { iss: 'https://accounts.google.com', aud: G }), gopts)).emailVerified, false)

// ── 애플 ──
const A = 'com.sprout.signin'
const raw = 'raw-nonce-123'
const hashed = createHash('sha256').update(raw).digest('hex')
const atok = await sign({ email: 'abc@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true', nonce: hashed }, { iss: 'https://appleid.apple.com', aud: A, sub: '001.apple' })
const a = await verifyAppleIdToken(atok, { servicesId: A, keys, rawNonce: raw })
assert.deepEqual(a, { provider: 'apple', subject: '001.apple', email: 'abc@privaterelay.appleid.com', emailVerified: true, privateRelay: true })
await rejects401(verifyAppleIdToken(atok, { servicesId: A, keys, rawNonce: hashed })) // 해시를 그대로 보내면 안 된다(원래 nonce만)
await rejects401(verifyAppleIdToken(atok, { servicesId: A, keys, rawNonce: undefined }))
await rejects401(verifyAppleIdToken(atok, { servicesId: 'other', keys, rawNonce: raw }))
// 두 번째 로그인부터는 이메일이 없을 수 있다
const a2 = await verifyAppleIdToken(await sign({ nonce: hashed }, { iss: 'https://appleid.apple.com', aud: A, sub: '001.apple' }), { servicesId: A, keys, rawNonce: raw })
assert.equal(a2.email, null)

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
const apple = { servicesId: A, redirectUri: 'https://api.example/auth/apple/callback', teamId: 'Z32F3Z65RD', keyId: 'KEY123', privateKey: await exportPKCS8(ec.privateKey) }
const secret = await appleClientSecret(apple)
assert.equal(decodeProtectedHeader(secret).kid, 'KEY123')
const { payload } = await jwtVerify(secret, ec.publicKey, { issuer: 'Z32F3Z65RD', audience: 'https://appleid.apple.com', subject: A })
assert.ok(payload.exp! - payload.iat! <= 300)
let sent: URLSearchParams | undefined
const fakeFetch = (async (_url: string, init: any) => { sent = init.body; return new Response(JSON.stringify({ id_token: await sign({}, { iss: 'https://appleid.apple.com', aud: A, sub: '001.apple' }) }), { status: 200 }) }) as unknown as typeof fetch
assert.equal(await exchangeAppleCode(apple, 'code-1', fakeFetch), '001.apple')
assert.equal(sent!.get('code'), 'code-1')
assert.equal(sent!.get('redirect_uri'), apple.redirectUri)
await assert.rejects(exchangeAppleCode(apple, 'bad', (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch))

// ── 환경 변수 ──
const cfg = socialConfigFromEnv({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_IDS: 'b, a', APPLE_SERVICES_ID: A, APPLE_KEY_ID: 'K', API_PUBLIC_URL: 'https://x.example/' })
assert.deepEqual(cfg.googleClientIds, ['b', 'a'])
assert.deepEqual(cfg.apple, { servicesId: A, redirectUri: 'https://x.example/auth/apple/callback', teamId: 'Z32F3Z65RD', keyId: 'K', privateKey: null })
assert.equal(socialConfigFromEnv({}).apple, null)
console.log('social: ok')
