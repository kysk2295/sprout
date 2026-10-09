// 30 §A 이모지 선택기: 자료 읽기 · 한국어/영어 검색 · 자주 쓰는(최근 16개, 기기 저장) · 폴더 이름 앞 이모지 떼기/붙이기
import assert from 'node:assert/strict'
import { loadEmoji, parseEmojiData, pushRecent, saveRecent, loadRecent, searchEmoji, RECENT_MAX, EMOJI_GROUPS } from '../src/renderer/src/data/emoji'
import { splitEmoji, joinEmoji, tagShow, tagText } from '../src/shared/emoji'
const store = new Map<string, string>()
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } })

// 생성 자료 전체
const all = await loadEmoji()
assert.ok(all.length > 1800, '이모지 1,800개 이상')
assert.equal(new Set(all.map((x) => x.group)).size, EMOJI_GROUPS.length, '8개 분류 모두')
assert.ok(all.every((x) => x.ko || x.en), '이름이 있다')
assert.equal(all.find((x) => x.e === '🏫')?.group, 4, '학교 = 여행(장소)')

// 검색: 한국어(띄어쓰기 무시)·영어·태그·이모지 자체, 이름 시작 > 이름 포함 > 태그
const tiny = parseEmojiData(['😀\t활짝 웃는 얼굴\t미소 행복\tgrinning face\tsmile happy\t0', '🏫\t학교\t건물\tschool\tbuilding\t4', '📚\t책 더미\t공부 책\tbooks\tstudy read\t5', '😄\t웃는 눈으로 활짝 웃는 얼굴\t웃음\tgrinning face with smiling eyes\tlaugh\t0'].join('\n'))
assert.deepEqual(searchEmoji(tiny, '학교').map((x) => x.e), ['🏫'])
assert.deepEqual(searchEmoji(tiny, '웃는얼굴').map((x) => x.e), ['😀', '😄'], '띄어쓰기 무시, 순서 유지')
assert.deepEqual(searchEmoji(tiny, '활짝').map((x) => x.e), ['😀', '😄'])
assert.deepEqual(searchEmoji(tiny, '공부').map((x) => x.e), ['📚'], '태그로도')
assert.deepEqual(searchEmoji(tiny, 'School').map((x) => x.e), ['🏫'], '영어 대소문자 무시')
assert.deepEqual(searchEmoji(tiny, 'stu').map((x) => x.e), ['📚'], '영어 태그는 앞부분')
assert.deepEqual(searchEmoji(tiny, '🏫').map((x) => x.e), ['🏫'])
assert.equal(searchEmoji(tiny, '').length, 4, '빈 검색어 = 전부')
assert.ok(searchEmoji(all, '학교').some((x) => x.e === '🏫'), '실제 자료 한국어 검색')
assert.ok(searchEmoji(all, '책').length > 3)

// 자주 쓰는: 맨 앞으로, 겹치면 옮김, 16개까지, 기기 저장
assert.deepEqual(pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'])
assert.equal(pushRecent(Array.from({ length: 16 }, (_, i) => `${i}`), 'x').length, RECENT_MAX)
for (const e of ['🏫', '📚', '🏫']) saveRecent(e)
assert.deepEqual(loadRecent(), ['🏫', '📚'])
store.set('sprout.emoji.recent', '망가진 값')
assert.deepEqual(loadRecent(), [], '망가진 저장값은 비운다')

// 폴더 이름 앞 이모지(틱틱 가져오기와 같은 함수)
assert.deepEqual(splitEmoji('🥺Me'), { emoji: '🥺', name: 'Me' })
assert.deepEqual(splitEmoji('🎓 Study'), { emoji: '🎓', name: 'Study' })
assert.deepEqual(splitEmoji('👨‍👩‍👧 가족'), { emoji: '👨‍👩‍👧', name: '가족' })
assert.deepEqual(splitEmoji('Work'), { emoji: null, name: 'Work' })
assert.deepEqual(splitEmoji('🎯'), { emoji: null, name: '🎯' })
assert.equal(joinEmoji('🎓', ' Study '), '🎓Study')
assert.equal(joinEmoji(null, 'Study'), 'Study')
assert.deepEqual(splitEmoji(joinEmoji('🥺', 'Me')), { emoji: '🥺', name: 'Me' }, '붙였다 떼면 그대로')
// 30 §A.5 태그도 같은 규칙: 아이콘은 하나만(이름 앞 이모지 → 종류 아이콘 → 주제는 #)
assert.deepEqual(tagShow({ name: '🚀🎓 졸업 프로젝트', kind: 'project' }), { emoji: '🎓', name: '졸업 프로젝트' }, '앞 이모지 여럿 = 모두 떼고 종류 기본 아이콘이 아닌 것 하나')
assert.deepEqual(tagShow({ name: '🚀🎓 졸업 프로젝트', kind: 'topic' }), { emoji: '🎓', name: '졸업 프로젝트' })
assert.deepEqual(tagShow({ name: '🚀 해커톤', kind: 'project' }), { emoji: '🚀', name: '해커톤' })
assert.deepEqual(tagShow({ name: 'UniPort', kind: 'project' }), { emoji: '🚀', name: 'UniPort' }, '이모지 없으면 종류 아이콘')
assert.deepEqual(tagShow({ name: '교수님', kind: 'person' }), { emoji: '👤', name: '교수님' })
assert.deepEqual(tagShow({ name: 'SQLD', kind: 'topic' }), { emoji: null, name: 'SQLD' }, '주제 = # 자리')
assert.deepEqual(tagShow({ name: '🎯' }), { emoji: null, name: '🎯' }, '이모지뿐인 이름은 이름으로')
assert.equal(tagText({ name: '🚀🎓 졸업 프로젝트' }), '🎓 졸업 프로젝트')
assert.equal(tagText({ name: 'SQLD' }), 'SQLD')
console.log('emoji.test ok')
