// 로그인 방법 연결 시험(08 §3.1.1): 가짜 JWKS로 만든 구글·애플 토큰 → 로그인한 계정에 연결, 남의 계정 409, 해제 규칙, 이메일 가리기
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { canUnlink, linkedView, linkIdentity, maskEmail, memoryLinkStore, MSG, parseProvider, unlinkProvider } from './link.ts'
import { memoryIdentityStore, resolveSocialUser, SocialError, verifyAppleIdToken, verifyGoogleIdToken } from './social.ts'

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] })
const sign = (claims: Record<string, unknown>, iss: string, aud: string, sub: string) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime('10m').sign(privateKey)
const G = 'client-1.apps.googleusercontent.com'
const google = async (sub: string, email: string) =>
  verifyGoogleIdToken(await sign({ email, email_verified: true, nonce: 'n' }, 'https://accounts.google.com', G, sub), { clientIds: [G], keys, nonce: 'n' })
const is = (status: number, msg?: string) => (e: unknown) => e instanceof SocialError && e.status === status && (!msg || e.message === msg)

// ── 이메일 가리기 ──
assert.equal(maskEmail('qa-ui@sprout.test'), 'qa***@sprout.test')
assert.equal(maskEmail('ab@x.co'), 'a***@x.co')
assert.equal(maskEmail('a@x.co'), 'a***@x.co')
assert.equal(maskEmail(null), null)
assert.equal(maskEmail('weird'), '***')
assert.equal(maskEmail('abc@privaterelay.appleid.com'), 'ab***@privaterelay.appleid.com')
assert.deepEqual(linkedView([{ provider: 'apple', subject: 'a', email: null }, { provider: 'google', subject: 'g', email: 'kim@gmail.com' }]),
  [{ provider: 'google', email: 'ki***@gmail.com' }, { provider: 'apple', email: null }]) // 구글 → 애플 순
assert.equal(parseProvider('google'), 'google')
assert.throws(() => parseProvider('kakao'), is(404))

// ── 실제 시나리오: qa-ui(이메일·비밀번호)가 이메일이 다른 구글 계정을 연결 → 다음부터 구글 로그인 = 이 계정 ──
const ids = memoryIdentityStore()
ids.users.set('qa', { id: 'qa', email: 'qa-ui@sprout.test', password: true })
ids.users.set('other', { id: 'other', email: 'other@sprout.test', password: true })
const users = () => Object.fromEntries([...ids.users.values()].map((u) => [u.id, { password: u.password }]))
const store = memoryLinkStore(users(), ids.identities as any) // 같은 user_identities 표를 본다
const me = await google('g-me', 'kysk@gmail.com')

let r = await linkIdentity(store, 'qa', me)
assert.deepEqual(r, { linked: true, identities: [{ provider: 'google', email: 'ky***@gmail.com' }] })
const signIn = await resolveSocialUser(ids, me)
assert.deepEqual(signIn, { user: { id: 'qa', email: 'qa-ui@sprout.test' }, created: false, linked: false }) // 새 계정이 생기지 않는다
r = await linkIdentity(store, 'qa', me) // 다시 눌러도 그대로
assert.equal(r.linked, false)
assert.equal(ids.identities.length, 1)

// 같은 구글 계정을 다른 sprout 계정에 붙이려 하면 409(빼앗지 않음)
await assert.rejects(linkIdentity(store, 'other', me), is(409, '이미 다른 sprout 계정에 연결된 구글 계정이에요'))
assert.equal(await store.ownerOf('google', 'g-me'), 'qa')
// 이 계정에 이미 다른 구글 계정이 있으면 409
await assert.rejects(linkIdentity(store, 'qa', await google('g-second', 'second@gmail.com')), is(409, MSG.other('google')))

// 애플(가린 이메일·두 번째부터 이메일 없음)도 같은 규칙
const raw = 'raw-nonce'
const atok = await sign({ nonce: createHash('sha256').update(raw).digest('hex') }, 'https://appleid.apple.com', 'com.sprout.signin', '001.apple')
const apple = await verifyAppleIdToken(atok, { servicesId: 'com.sprout.signin', keys, rawNonce: raw })
r = await linkIdentity(store, 'qa', apple)
assert.deepEqual(r.identities, [{ provider: 'google', email: 'ky***@gmail.com' }, { provider: 'apple', email: null }])
assert.equal((await resolveSocialUser(ids, apple)).user.id, 'qa') // 이메일이 없어도 식별자로 들어온다

// 동시에 다른 계정이 먼저 넣은 경우(ownerOf는 비어 보였지만 insert가 실패)
{
  const racy = memoryLinkStore({ a: { password: true }, b: { password: true } })
  const realOwner = racy.ownerOf
  let first = true
  racy.ownerOf = async (p, s) => { if (first) { first = false; racy.rows.push({ userId: 'b', provider: p, subject: s, email: null }); return null } return realOwner(p, s) }
  await assert.rejects(linkIdentity(racy, 'a', await google('g-race', 'r@gmail.com')), is(409))
}

// ── 해제 ──
assert.equal(canUnlink(true, [], 'google'), true)
assert.equal(canUnlink(false, [{ provider: 'google' }], 'google'), false)
assert.equal(canUnlink(false, [{ provider: 'google' }, { provider: 'apple' }], 'google'), true)
r = await unlinkProvider(store, 'qa', 'apple') // 비밀번호가 있으니 된다
assert.deepEqual(r.identities, [{ provider: 'google', email: 'ky***@gmail.com' }])
r = await unlinkProvider(store, 'qa', 'apple') // 없는 걸 또 떼도 그대로
assert.equal(r.identities.length, 1)
{
  // 구글로만 가입한 계정(비밀번호 없음): 마지막 방법은 못 뗀다, 애플을 붙이면 구글은 뗄 수 있다
  const s = memoryLinkStore({ soc: { password: false } }, [{ userId: 'soc', provider: 'google', subject: 'g9', email: 'soc@gmail.com' }])
  await assert.rejects(unlinkProvider(s, 'soc', 'google'), is(409, MSG.last))
  await linkIdentity(s, 'soc', apple)
  r = await unlinkProvider(s, 'soc', 'google')
  assert.deepEqual(r.identities, [{ provider: 'apple', email: null }])
  await assert.rejects(unlinkProvider(s, 'soc', 'apple'), is(409, MSG.last))
  await assert.rejects(unlinkProvider(s, 'ghost', 'apple'), is(401))
}
// 해제한 뒤 그 구글로 로그인하면 더는 qa 계정이 아니다(확인된 다른 이메일 → 새 계정)
await unlinkProvider(store, 'qa', 'google')
assert.equal((await resolveSocialUser(ids, me)).created, true)

console.log('link: ok')
