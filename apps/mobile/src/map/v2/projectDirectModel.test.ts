// 41 §8 휴대폰 프로젝트 직접 고치기 화면 글 시험
import assert from 'node:assert/strict'
import { NO_LANE, parseProjectLine, type TagLanes } from '@sprout/schema/planView'
import { keyPill, laneName, linePreview, nameWithEmoji, PROJECT_EXAMPLES, projectIcon, starterAsk, visibleLanes } from './projectDirectModel.ts'

const today = '2026-10-06'
// 미리보기: 이름 · ⚑ 날짜 이름 날짜(요일) · D-day
const pv = linePreview(parseProjectLine('투자자산운용사 시험 11/23', today), today)
assert.deepEqual(pv, { empty: false, head: '📜 투자자산운용사 시험', key: '⚑ 시험 11/23(월)', dday: 'D-48', note: null })
assert.deepEqual(linePreview(parseProjectLine('부산 이사', today), today), { empty: false, head: '🚀 부산 이사', key: null, dday: null, note: '날짜 없이 만들어도 돼요' })
assert.deepEqual(linePreview(parseProjectLine('  ', today), today), { empty: true, text: '이름을 적어 주세요' })
// 고른 날짜 이름 · 고른 아이콘
const pv2 = linePreview(parseProjectLine('K 데이터 공모전 11/1', today, '발표'), today, '🎯')
assert.equal(pv2.empty === false && pv2.head, '🎯 K 데이터 공모전')
assert.equal(pv2.empty === false && pv2.key, '⚑ 발표 11/1(일)')

// 머리 알약: 회색 → 3일 안·지남 빨강, 지난 뒤 D+n. ⚑ 할 일이 없으면 null(＋ 핵심 날짜)
assert.deepEqual(keyPill({ day: '2026-11-23', word: '시험' }, true, today), { text: '⚑ 시험 11/23', dday: 'D-48', hot: false })
assert.deepEqual(keyPill({ day: '2026-10-09', word: '제출' }, true, today), { text: '⚑ 제출 10/9', dday: 'D-3', hot: true })
assert.equal(keyPill({ day: '2026-10-03', word: '마감' }, true, today)?.dday, 'D+3')
assert.equal(keyPill({ day: '2026-11-23', word: '시험' }, false, today), null)
assert.equal(keyPill(null, true, today), null)

// 이름 고치기: 앞 이모지는 남기고, 새로 적은 이모지가 이긴다, 20자
assert.equal(nameWithEmoji('📜 투자자산운용사 시험', '투운사 시험'), '📜 투운사 시험')
assert.equal(nameWithEmoji('부산 이사', '서울 이사'), '서울 이사')
assert.equal(nameWithEmoji('📜 시험', '🎓 졸업 시험'), '🎓 졸업 시험')
assert.equal(nameWithEmoji('📜 시험', '   '), '')
assert.equal([...nameWithEmoji('x', '가'.repeat(30))].length, 20)
assert.equal(projectIcon('📜 투자자산운용사 시험'), '📜')
assert.equal(projectIcon('투자자산운용사 시험'), '🚀')

// 묶음 이름
assert.equal(laneName('#금융상품'), '금융상품')
assert.equal(laneName('  ##법규 '), '법규')
assert.equal(laneName('#'), '')

// 태그 없음은 비면 숨김
const lanes = (none: number): TagLanes => ({ lanes: [{ id: 't1', tag: null, name: '법규', items: [], manual: true }, { id: NO_LANE, tag: null, name: '태그 없음', items: Array(none).fill({}), manual: false }], laneOf: new Map(), more: new Map(), tagsOf: new Map() })
assert.deepEqual(visibleLanes(lanes(0)).map((l) => l.id), ['t1'])
assert.deepEqual(visibleLanes(lanes(2)).map((l) => l.id), ['t1', NO_LANE])

// 줄 나누기 제안: 태그 묶기 · 안 봄 · 낱말 표에 있을 때만
assert.equal(starterAsk({ title: '투자자산운용사 시험', laneBy: 'tag', settings: {} })?.add, '과목')
assert.deepEqual(starterAsk({ title: 'K 데이터 공모전', laneBy: 'tag', settings: {} })?.lanes, ['회의', '조사', '개발', '제출'])
assert.equal(starterAsk({ title: '투자자산운용사 시험', laneBy: 'tag', settings: { starterSeen: true } }), null)
assert.equal(starterAsk({ title: '투자자산운용사 시험', laneBy: 'kind', settings: {} }), null)
assert.equal(starterAsk({ title: '부산 이사', laneBy: 'tag', settings: {} }), null)

// 예시 7개, 채울 글은 끝이 띄어쓰기(날짜를 바로 적게)
assert.equal(PROJECT_EXAMPLES.length, 7)
for (const e of PROJECT_EXAMPLES) assert.ok(e.fill.endsWith(' '))
console.log('projectDirectModel ok')
