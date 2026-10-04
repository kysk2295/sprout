// 08 §7.1 계정 삭제 화면 규칙: 다시 확인 방법, [계정 삭제] 버튼 활성 조건, 오류 문구 + 시도 제한 문구(08 §4)
import assert from 'node:assert/strict'
import { authErrorText, deleteErrorText, deleteMode, deleteReady, DELETE_WORD, providerLabel } from '../src/renderer/src/data/auth'

assert.equal(DELETE_WORD, '삭제')
assert.equal(deleteMode(true), 'password')
assert.equal(deleteMode(false), 'social')
assert.equal(providerLabel(['google']), 'Google')
assert.equal(providerLabel(['apple']), 'Apple')
assert.equal(providerLabel(['apple', 'google']), 'Google 또는 Apple')
assert.equal(providerLabel([]), 'Google')

// 비밀번호 계정: "삭제" 정확히 + 비밀번호
const base = { mode: 'password' as const, confirmText: '삭제', password: 'pw', reauthed: false, busy: false }
assert.equal(deleteReady(base), true)
assert.equal(deleteReady({ ...base, confirmText: ' 삭제 ' }), true) // 앞뒤 공백은 봐준다
assert.equal(deleteReady({ ...base, confirmText: '삭' }), false)
assert.equal(deleteReady({ ...base, confirmText: 'delete' }), false)
assert.equal(deleteReady({ ...base, password: '' }), false)
assert.equal(deleteReady({ ...base, busy: true }), false)
// 소셜 계정: 방금 다시 로그인해야 한다(비밀번호는 상관없음)
const social = { ...base, mode: 'social' as const, password: '' }
assert.equal(deleteReady(social), false)
assert.equal(deleteReady({ ...social, reauthed: true }), true)
assert.equal(deleteReady({ ...social, reauthed: true, confirmText: '' }), false)

// 오류 문구
assert.equal(deleteErrorText('invalid password', 403), '비밀번호가 맞지 않아요')
assert.equal(deleteErrorText('reauth required', 403, ['apple']), '보안을 위해 Apple로 다시 로그인한 뒤 10분 안에 삭제해 주세요')
const limited = '계정 삭제 확인 시도가 너무 많아요. 12분 뒤 다시 시도해 주세요.'
assert.equal(deleteErrorText(limited, 429), limited)
assert.equal(deleteErrorText('too many', 429), '잠시 뒤 다시 시도하세요')
assert.equal(deleteErrorText('unauthorized', 401), '로그인이 만료됐어요. 다시 로그인한 뒤 시도하세요')
assert.equal(deleteErrorText('network', 0), '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요')

// 로그인 화면: 서버의 한국어 시도 제한 문구는 그대로(몇 분 뒤인지), 예전 영어 코드는 짧은 문구
const login429 = '로그인 시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.'
assert.equal(authErrorText(login429), login429)
assert.equal(authErrorText('가입 시도가 너무 많아요. 60분 뒤 다시 시도해 주세요.'), '가입 시도가 너무 많아요. 60분 뒤 다시 시도해 주세요.')
assert.equal(authErrorText('too many attempts'), '잠시 뒤 다시 시도하세요')
assert.equal(authErrorText('invalid credentials'), '이메일 또는 비밀번호가 맞지 않아요')

console.log('account: ok')
