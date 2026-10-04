import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword, loadKeys, signAccessToken, validEmail, validPassword, verifyAccessClaims, verifyAccessToken, verifyPassword } from './auth.ts'

const h = await hashPassword('correct horse')
assert.ok(await verifyPassword('correct horse', h))
assert.ok(!(await verifyPassword('wrong', h)))
assert.ok(!(await verifyPassword('x', 'garbage')))
assert.ok(validEmail('a@b.co') && !validEmail('nope') && !validEmail(3))
assert.ok(validPassword('123456') && !validPassword('12345') && !validPassword('x'.repeat(65)))

// 키는 파일에 남아 재시작해도 같다, 토큰 왕복
const path = join(mkdtempSync(join(tmpdir(), 'sprout-keys-')), 'keys.json')
const k1 = await loadKeys(path)
const k2 = await loadKeys(path)
assert.equal(k1.kid, k2.kid)
const token = await signAccessToken(k1, 'user-1', 'test')
assert.equal(await verifyAccessToken(k2, token, 'test'), 'user-1')
await assert.rejects(verifyAccessToken(k2, token, 'other-issuer'))
// auth_time: 막 로그인한 토큰에만(계정 삭제 재확인), 리프레시 토큰에는 없다
assert.deepEqual(await verifyAccessClaims(k1, token, 'test'), { sub: 'user-1', authTime: undefined })
assert.deepEqual(await verifyAccessClaims(k1, await signAccessToken(k1, 'user-1', 'test', 3600, 1_900_000_000), 'test'), { sub: 'user-1', authTime: 1_900_000_000 })
console.log('auth: ok')
