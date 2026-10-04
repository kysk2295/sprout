// 비밀번호 해시(scrypt, 네이티브 의존성 없음)와 JWT(RS256) 발급·검증
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT, type JWK, type KeyLike } from 'jose'

const scryptAsync = (pw: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, len, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))))

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, 32)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, key] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(expected, actual)
}

export const newRefreshToken = () => randomBytes(32).toString('base64url')
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export const validEmail = (e: unknown): e is string => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
// 08 §8: 틱틱과 같이 6-64자
export const validPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= 6 && p.length <= 64

// ── JWT ──
export type Keys = { kid: string; privateKey: KeyLike; publicJwk: JWK }
export const AUDIENCE = 'powersync'

/** 키를 파일에서 읽고, 없으면 만들어 저장한다(재시작해도 같은 키) */
export async function loadKeys(path: string): Promise<Keys> {
  if (existsSync(path)) {
    const { kid, privateJwk, publicJwk } = JSON.parse(readFileSync(path, 'utf8'))
    return { kid, privateKey: (await importJWK(privateJwk, 'RS256')) as KeyLike, publicJwk }
  }
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  const kid = randomBytes(8).toString('hex')
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }
  const privateJwk = await exportJWK(privateKey)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ kid, privateJwk, publicJwk }), { mode: 0o600 })
  return { kid, privateKey: privateKey as KeyLike, publicJwk }
}

/** 접근 토큰 = PowerSync 토큰. sub = 사용자 id, aud = powersync, 1시간 */
export function signAccessToken(keys: Keys, userId: string, issuer: string, ttlSec = 3600) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: keys.kid })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(keys.privateKey)
}

export async function verifyAccessToken(keys: Keys, token: string, issuer: string): Promise<string> {
  const pub = await importJWK(keys.publicJwk, 'RS256')
  const { payload } = await jwtVerify(token, pub, { audience: AUDIENCE, issuer })
  if (!payload.sub) throw new Error('no sub')
  return payload.sub
}
