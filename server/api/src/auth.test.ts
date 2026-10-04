import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword, loadKeys, signAccessToken, validEmail, validPassword, verifyAccessToken, verifyPassword } from './auth.ts'

const h = await hashPassword('correct horse')
assert.ok(await verifyPassword('correct horse', h))
assert.ok(!(await verifyPassword('wrong', h)))
assert.ok(!(await verifyPassword('x', 'garbage')))
assert.ok(validEmail('a@b.co') && !validEmail('nope') && !validEmail(3))
assert.ok(validPassword('12345678') && !validPassword('short'))

// 키는 파일에 남아 재시작해도 같다, 토큰 왕복
const path = join(mkdtempSync(join(tmpdir(), 'sprout-keys-')), 'keys.json')
const k1 = await loadKeys(path)
const k2 = await loadKeys(path)
assert.equal(k1.kid, k2.kid)
const token = await signAccessToken(k1, 'user-1', 'test')
assert.equal(await verifyAccessToken(k2, token, 'test'), 'user-1')
await assert.rejects(verifyAccessToken(k2, token, 'other-issuer'))
console.log('auth: ok')
