// 08 §3.1.1 로그인 방법 연결: 계정 탭 줄 상태(연결됨·준비 중·해제 가능), 토스트·오류 문구
import assert from 'node:assert/strict'
import { linkErrorText, linkToast, loginMethodRows, unlinkToast } from '../src/renderer/src/data/auth'

const all = { google: true, apple: true }
// 이메일·비밀번호 계정, 아무것도 연결 안 함 → 둘 다 [연결]
let rows = loginMethodRows({ hasPassword: true, identities: [], available: all })
assert.deepEqual(rows.map((r) => [r.provider, r.linked, r.ready, r.canUnlink]), [['google', false, true, false], ['apple', false, true, false]])
// 애플 설정 없음(서버 미설정·물어보지 못함) → 준비 중
assert.equal(loginMethodRows({ hasPassword: true, identities: [], available: { google: true, apple: null } })[1].ready, false)
assert.equal(loginMethodRows({ hasPassword: true, identities: [], available: { google: true, apple: false } })[1].ready, false)
// 구글 연결됨 + 비밀번호 있음 → 해제 가능, 가린 이메일 표시
rows = loginMethodRows({ hasPassword: true, identities: [{ provider: 'google', email: 'ky***@gmail.com' }], available: all })
assert.deepEqual(rows[0], { provider: 'google', linked: true, email: 'ky***@gmail.com', ready: true, canUnlink: true })
// 구글로만 가입(비밀번호 없음) → 마지막 방법이라 해제 불가, 애플도 붙이면 둘 다 가능
assert.equal(loginMethodRows({ hasPassword: false, identities: [{ provider: 'google', email: null }], available: all })[0].canUnlink, false)
rows = loginMethodRows({ hasPassword: false, identities: [{ provider: 'google', email: null }, { provider: 'apple', email: null }], available: all })
assert.deepEqual(rows.map((r) => r.canUnlink), [true, true])
// 연결돼 있으면 설정이 빠져도 연결됨으로 보인다(해제는 가능)
assert.equal(loginMethodRows({ hasPassword: true, identities: [{ provider: 'apple', email: null }], available: { google: false, apple: null } })[1].linked, true)

assert.equal(linkToast('google'), "구글 계정을 연결했어요 — 다음부터 'Google로 계속하기'로 들어올 수 있어요")
assert.equal(unlinkToast('apple'), 'Apple 연결을 해제했어요')
assert.equal(linkErrorText({ error: '로그인을 취소했어요.', code: 'cancelled' }), null)
assert.equal(linkErrorText({ error: '이미 다른 sprout 계정에 연결된 구글 계정이에요', code: 'conflict' }), '이미 다른 sprout 계정에 연결된 구글 계정이에요')
assert.equal(linkErrorText({ error: '', code: 'network' }), '서버에 연결할 수 없어요. 잠시 뒤 다시 시도하세요')
console.log('link(desktop): ok')
