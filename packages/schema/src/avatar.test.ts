// 35 프로필 이미지: avatar_json 읽기·검사·그릴 것 결정·고르기
import assert from 'node:assert/strict'
import { AVATAR_COLORS, AVATAR_FACES, avatarLabel, parseAvatar, pickAvatar, pickAvatarColor, resolveAvatar, sameAvatar, serializeAvatar } from './avatar.ts'

// 없음·깨짐·모르는 값 → 글자(null)
assert.equal(parseAvatar(null), null)
assert.equal(parseAvatar(''), null)
assert.equal(parseAvatar('{bad'), null)
assert.equal(parseAvatar('"x"'), null)
assert.equal(parseAvatar('{"kind":"face","id":"dragon","color":"red"}'), null)
assert.equal(parseAvatar('{"kind":"char","id":"otter-9","color":"red"}'), null)
assert.equal(parseAvatar('{"kind":"photo","color":"red"}'), null)
// 정상값 · 모르는 색은 초록
assert.deepEqual(parseAvatar('{"kind":"face","id":"rabbit","color":"blue"}'), { kind: 'face', id: 'rabbit', color: 'blue' })
assert.deepEqual(parseAvatar('{"kind":"char","id":"frog-3","color":"neon"}'), { kind: 'char', id: 'frog-3', color: 'green' })
// 옛 종 id(43 결정 ⑥)는 새 종으로 읽는다
assert.deepEqual(parseAvatar('{"kind":"char","id":"otter-3","color":"red"}'), { kind: 'char', id: 'frog-3', color: 'red' })
assert.equal(parseAvatar('{"kind":"char","id":"dragon-3","color":"red"}'), null)
assert.deepEqual(parseAvatar('{"kind":"follow","id":"junk","color":"rose"}'), { kind: 'follow', color: 'rose' })
// 되돌려 쓰기
assert.equal(serializeAvatar(null), null)
assert.deepEqual(parseAvatar(serializeAvatar({ kind: 'char', id: 'worm-5', color: 'yellow' })), { kind: 'char', id: 'worm-5', color: 'yellow' })

// 그릴 것: 따라가기는 지금 종·단계, 조사 전이면 알
const g = { species: 'bee' as const, stage: 4 }
assert.deepEqual(resolveAvatar(null, g), { type: 'letter' })
assert.deepEqual(resolveAvatar({ kind: 'follow', color: 'blue' }, g), { type: 'char', species: 'bee', stage: 4, bg: '#C2DFFD' })
assert.deepEqual(resolveAvatar({ kind: 'follow', color: 'blue' }, { species: null, stage: 1 }), { type: 'egg', bg: '#C2DFFD' })
assert.deepEqual(resolveAvatar({ kind: 'char', id: 'turtle-1', color: 'red' }, g), { type: 'char', species: 'snail', stage: 1, bg: '#F9C2C7' })
assert.deepEqual(resolveAvatar({ kind: 'face', id: 'panda', color: 'slate' }, g), { type: 'face', faceId: 'panda', bg: '#D4D7E3' })
assert.deepEqual(resolveAvatar({ kind: 'face', id: 'nope', color: 'slate' }, g), { type: 'letter' })

// 고르기: 색 유지, 글자 상태에서 색 → 따라가기
assert.deepEqual(pickAvatar(null, 'face', 'fox'), { kind: 'face', id: 'fox', color: 'green' })
assert.deepEqual(pickAvatar({ kind: 'face', id: 'fox', color: 'purple' }, 'follow'), { kind: 'follow', color: 'purple' })
assert.deepEqual(pickAvatarColor(null, 'orange'), { kind: 'follow', color: 'orange' })
assert.deepEqual(pickAvatarColor({ kind: 'char', id: 'cat-2', color: 'red' }, 'orange'), { kind: 'char', id: 'cat-2', color: 'orange' })
assert.ok(sameAvatar({ kind: 'char', id: 'cat-2', color: 'red' }, 'char', 'cat-2'))
assert.ok(!sameAvatar({ kind: 'char', id: 'cat-2', color: 'red' }, 'char', 'cat-3'))
assert.ok(sameAvatar({ kind: 'follow', color: 'red' }, 'follow'))
assert.equal(avatarLabel({ kind: 'char', id: 'frog-3', color: 'red' }), '개구리 · 친구')

// 자산 수: 색 8 · 얼굴 8, id 겹침 없음
assert.equal(AVATAR_COLORS.length, 8)
assert.equal(AVATAR_FACES.length, 8)
assert.equal(new Set(AVATAR_FACES.map((f) => f.id)).size, 8)
console.log('avatar ok')
