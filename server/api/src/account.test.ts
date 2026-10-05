// 계정 삭제 시험(가짜 DB): 비밀번호 확인, 소셜 계정의 "방금 로그인" 확인, 한 트랜잭션 삭제·되돌리기, 시도 기록 콜백
import assert from 'node:assert/strict'
import { hashPassword } from './auth.ts'
import { AccountError, deleteAccount, REAUTH_WINDOW_SEC, type AccountDb } from './account.ts'

type Row = { id: string; password_hash: string | null }
function fakeDb(users: Row[], opts: { failOn?: RegExp } = {}) {
  const state = { users: [...users], aiUsage: users.map((u) => u.id), devices: users.map((u) => u.id), log: [] as string[], committed: 0, rolledBack: 0 }
  const db: AccountDb = {
    query: async (sql, params = []) => {
      state.log.push(sql)
      if (/^SELECT password_hash FROM users WHERE id = \$1$/.test(sql)) {
        const u = state.users.filter((x) => x.id === params[0])
        return { rows: u.map((x) => ({ password_hash: x.password_hash })), rowCount: u.length }
      }
      throw new Error(`unexpected sql ${sql}`)
    },
    transaction: async (fn) => {
      const snapshot = { users: [...state.users], aiUsage: [...state.aiUsage], devices: [...state.devices] }
      try {
        const out = await fn(async (sql, params = []) => {
          state.log.push(sql)
          if (opts.failOn?.test(sql)) throw new Error('db down')
          if (sql === 'DELETE FROM ai_usage WHERE user_id = $1') { const n = state.aiUsage.length; state.aiUsage = state.aiUsage.filter((x) => x !== params[0]); return { rows: [], rowCount: n - state.aiUsage.length } }
          if (sql === 'DELETE FROM device_tokens WHERE user_id = $1') { const n = state.devices.length; state.devices = state.devices.filter((x) => x !== params[0]); return { rows: [], rowCount: n - state.devices.length } }
          if (sql === 'DELETE FROM users WHERE id = $1') { const n = state.users.length; state.users = state.users.filter((x) => x.id !== params[0]); return { rows: [], rowCount: n - state.users.length } }
          throw new Error(`unexpected sql ${sql}`)
        })
        state.committed++
        return out
      } catch (e) {
        state.users = snapshot.users
        state.aiUsage = snapshot.aiUsage
        state.devices = snapshot.devices
        state.rolledBack++
        throw e
      }
    }
  }
  return { db, state }
}
const is = (status: number, code: string) => (e: unknown) => e instanceof AccountError && e.status === status && e.code === code

const hash = await hashPassword('correct horse')
const NOW = 2_000_000_000

// ── 비밀번호 계정 ──
{
  const { db, state } = fakeDb([{ id: 'pw', password_hash: hash }, { id: 'other', password_hash: hash }])
  let fails = 0
  const onFail = () => { fails++ }
  await assert.rejects(deleteAccount(db, { userId: 'pw', password: 'wrong' }, onFail), is(403, 'invalid password'))
  await assert.rejects(deleteAccount(db, { userId: 'pw' }, onFail), is(403, 'invalid password')) // 비밀번호 없이
  await assert.rejects(deleteAccount(db, { userId: 'pw', password: 42 }, onFail), is(403, 'invalid password'))
  // 방금 로그인한 토큰이어도 비밀번호 계정은 비밀번호가 필요하다
  await assert.rejects(deleteAccount(db, { userId: 'pw', authTime: NOW, nowSec: NOW }, onFail), is(403, 'invalid password'))
  assert.equal(fails, 4)
  assert.equal(state.users.length, 2)
  assert.equal(state.committed, 0)
  await deleteAccount(db, { userId: 'pw', password: 'correct horse' }, onFail)
  assert.deepEqual(state.users.map((u) => u.id), ['other']) // 남의 계정은 그대로
  assert.deepEqual(state.aiUsage, ['other']) // ai_usage도 명시적으로 지운다
  assert.deepEqual(state.devices, ['other']) // 푸시 기기 토큰도(32) — 삭제 뒤 알림이 가지 않는다
  assert.equal(state.committed, 1)
  assert.equal(fails, 4)
  // 이미 지워진 계정(같은 토큰으로 다시) → 401
  await assert.rejects(deleteAccount(db, { userId: 'pw', password: 'correct horse' }), is(401, 'unauthorized'))
}

// ── 구글·애플로만 가입한 계정: auth_time이 10분 안이어야 한다 ──
{
  const { db, state } = fakeDb([{ id: 'social', password_hash: null }])
  let fails = 0
  await assert.rejects(deleteAccount(db, { userId: 'social', nowSec: NOW }, () => fails++), is(403, 'reauth required')) // 리프레시로 받은 토큰(auth_time 없음)
  await assert.rejects(deleteAccount(db, { userId: 'social', authTime: NOW - REAUTH_WINDOW_SEC - 1, nowSec: NOW }, () => fails++), is(403, 'reauth required'))
  await assert.rejects(deleteAccount(db, { userId: 'social', authTime: NOW + 3600, nowSec: NOW }, () => fails++), is(403, 'reauth required')) // 미래 시각
  await assert.rejects(deleteAccount(db, { userId: 'social', password: 'anything', nowSec: NOW }, () => fails++), is(403, 'reauth required')) // 비밀번호로는 안 됨
  assert.equal(fails, 4)
  assert.equal(state.users.length, 1)
  await deleteAccount(db, { userId: 'social', authTime: NOW - REAUTH_WINDOW_SEC + 5, nowSec: NOW })
  assert.equal(state.users.length, 0)
}

// ── 트랜잭션 중 실패 → 되돌린다(반쯤 지워진 상태가 없다) ──
{
  const { db, state } = fakeDb([{ id: 'pw', password_hash: hash }], { failOn: /DELETE FROM users/ })
  await assert.rejects(deleteAccount(db, { userId: 'pw', password: 'correct horse' }), /db down/)
  assert.equal(state.rolledBack, 1)
  assert.deepEqual(state.users.map((u) => u.id), ['pw'])
  assert.deepEqual(state.aiUsage, ['pw'])
  assert.deepEqual(state.devices, ['pw'])
}

// ── 애플 토큰 폐기 훅(지침 5.1.1(v)): 확인 통과 뒤 읽고 → 삭제 커밋 뒤 폐기. 폐기 실패해도 삭제는 끝난다 ──
{
  const { db, state } = fakeDb([{ id: 'social', password_hash: null }, { id: 'pw', password_hash: hash }])
  const order: string[] = []
  const hook = {
    read: async (id: string) => { order.push(`read:${id}:${state.users.length}`); return [{ clientId: 'app.sprout.mobile', refreshToken: 'rt' }] },
    revoke: async (t: unknown[]) => { order.push(`revoke:${t.length}:${state.users.length}`) }
  }
  // 확인 실패면 읽지도 폐기하지도 않는다
  await assert.rejects(deleteAccount(db, { userId: 'social', nowSec: NOW }, undefined, hook), is(403, 'reauth required'))
  await assert.rejects(deleteAccount(db, { userId: 'pw', password: 'wrong' }, undefined, hook), is(403, 'invalid password'))
  assert.deepEqual(order, [])
  await deleteAccount(db, { userId: 'social', authTime: NOW, nowSec: NOW }, undefined, hook)
  assert.deepEqual(order, ['read:social:2', 'revoke:1:1']) // 지우기 전에 읽고, 지운 뒤 폐기
  // 폐기가 던져도 · 읽기가 던져도 삭제는 성공
  await deleteAccount(db, { userId: 'pw', password: 'correct horse' }, undefined, { read: async () => { throw new Error('no column') }, revoke: async () => { throw new Error('x') } })
  assert.equal(state.users.length, 0)
  // 트랜잭션이 실패하면 폐기하지 않는다
  const f = fakeDb([{ id: 'pw', password_hash: hash }], { failOn: /DELETE FROM users/ })
  let revoked = 0
  await assert.rejects(deleteAccount(f.db, { userId: 'pw', password: 'correct horse' }, undefined, { read: async () => [{}], revoke: async () => { revoked++ } }), /db down/)
  assert.equal(revoked, 0)
}

// ── 없는 사용자 ──
{
  const { db } = fakeDb([])
  await assert.rejects(deleteAccount(db, { userId: 'ghost', password: 'x' }), is(401, 'unauthorized'))
}

console.log('account: ok')
