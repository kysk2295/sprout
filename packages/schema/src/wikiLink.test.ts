import assert from 'node:assert/strict'
import { chosung, displayTitle, linkNames, linkSegments, linkTagId, maskLinks, matchRank, mentionsPlain, normName, parseAliases, relationId, renameLinks, sha1, wrapMention } from './wikiLink.ts'

// 조각·이름·표시 글
assert.deepEqual(linkSegments('[[교수님]]께 메일'), [{ link: '교수님', raw: '[[교수님]]' }, { text: '께 메일' }])
assert.deepEqual(linkNames('[[A]] 와 [[B]] 그리고 [[A]]'), ['A', 'B'])
assert.equal(displayTitle('데모 [[UniPort]] 리허설'), '데모 UniPort 리허설')
// 닫히지 않은 [[ 는 글(§6.3-5), 빈 링크도 글
assert.deepEqual(linkNames('메모 [[미완성'), [])
assert.equal(displayTitle('[[]] 그대로'), '[[]] 그대로')
// 보호·복원
const m = maskLinks('[[3월 SQLD]] 내일')
assert.ok(!m.masked.includes('3월'))
assert.equal(m.restore(m.masked), '[[3월 SQLD]] 내일')
assert.deepEqual(m.links, ['3월 SQLD'])
// 이름 바꾸기(이모지·공백·대소문자 무시로 같은 이름)
assert.deepEqual(renameLinks('[[자격증]] 결과, [[커리어]] [[ 자격증 ]]', '자격증', '자격증·시험'), { text: '[[자격증·시험]] 결과, [[커리어]] [[자격증·시험]]', count: 2 })
assert.equal(renameLinks('[[sqld]]', 'SQLD', 'SQLD').count, 1)
// 연결 안 된 언급
assert.equal(mentionsPlain('이력서 자격증 칸', '자격증'), true)
assert.equal(mentionsPlain('이력서 [[자격증]] 칸', '자격증'), false)
assert.equal(wrapMention('[[커리어]] 이력서 자격증 칸', '자격증'), '[[커리어]] 이력서 [[자격증]] 칸')
// 맞추기: 앞부분 > 포함 > 초성, 별칭
assert.equal(matchRank('유니', 'UniPort', ['유니포트']).rank, 3)
assert.equal(matchRank('유니', 'UniPort', ['유니포트']).via, '유니포트')
assert.equal(matchRank('port', 'UniPort').rank, 2)
assert.equal(matchRank('ㄱㅅㄴ', '교수님').rank, 1)
assert.equal(chosung('교수님'), 'ㄱㅅㄴ')
assert.equal(matchRank('zz', '교수님').rank, 0)
assert.equal(normName('🎓 학교'), '학교')
assert.deepEqual(parseAliases('["지도교수님", " ", 3]'), ['지도교수님'])
assert.deepEqual(parseAliases('깨짐'), [])
// 결정적 id
assert.equal(sha1('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d')
assert.equal(sha1('한글'), sha1('한글'))
assert.equal(relationId('t1', 'l1', 'title'), relationId('t1', 'l1', 'title'))
assert.notEqual(relationId('t1', 'l1', 'title'), relationId('t1', 'l1', 'content'))
assert.match(linkTagId('t', 'g'), /^ttl-[0-9a-f]{24}$/)
console.log('wikiLink: ok')
