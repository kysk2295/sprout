// 필터 규칙·검색 시험(07, 04 검색)
import assert from 'node:assert/strict'
import { EMPTY_FILTER, filterSummary, matchesFilter, readFilter, writeFilter } from './filters.ts'
import { highlight, likeOf, pushRecent, searchSql, snippet } from './search.ts'

const days = { today: '2026-10-04', tomorrow: '2026-10-05', last: '2026-10-10' }
const task = (p: Partial<Parameters<typeof matchesFilter>[1]>) => ({ list_id: 'l1', tag_ids: null, priority: 0, title: '회의록', content: null, start_at: null, due_at: null, ...p })
// 잘못된 저장값은 버린다, 깨진 JSON은 빈 조건
assert.deepEqual(readFilter('{"lists":["a",3],"date":"weird","priorities":[3,9],"keyword":1}'), { lists: ['a'], tags: [], date: 'all', priorities: [3], keyword: '' })
assert.deepEqual(readFilter('{'), EMPTY_FILTER)
assert.deepEqual(readFilter(writeFilter({ ...EMPTY_FILTER, keyword: ' 회의 ', date: 'today' })), { ...EMPTY_FILTER, keyword: '회의', date: 'today' })
// 같은 종류 OR, 종류 사이 AND
const r = { ...EMPTY_FILTER, lists: ['l1', 'l2'], priorities: [3, 2] }
assert.equal(matchesFilter(r, task({ list_id: 'l2', priority: 2 }), days), true)
assert.equal(matchesFilter(r, task({ list_id: 'l2', priority: 1 }), days), false)
assert.equal(matchesFilter(r, task({ list_id: 'l3', priority: 3 }), days), false)
// 태그: 하나라도
assert.equal(matchesFilter({ ...EMPTY_FILTER, tags: ['g1', 'g2'] }, task({ tag_ids: 'g9,g2' }), days), true)
assert.equal(matchesFilter({ ...EMPTY_FILTER, tags: ['g1'] }, task({}), days), false)
// 날짜: 기간 겹침, 만료, 날짜 없음
assert.equal(matchesFilter({ ...EMPTY_FILTER, date: 'today' }, task({ start_at: '2026-10-01', due_at: '2026-10-06' }), days), true)
assert.equal(matchesFilter({ ...EMPTY_FILTER, date: 'tomorrow' }, task({ due_at: '2026-10-04T09:00' }), days), false)
assert.equal(matchesFilter({ ...EMPTY_FILTER, date: 'overdue' }, task({ due_at: '2026-10-03' }), days), true)
assert.equal(matchesFilter({ ...EMPTY_FILTER, date: 'none' }, task({}), days), true)
assert.equal(matchesFilter({ ...EMPTY_FILTER, date: 'next7' }, task({ due_at: '2026-10-11' }), days), false)
// 키워드: 제목·본문, 대소문자 무시
assert.equal(matchesFilter({ ...EMPTY_FILTER, keyword: 'abc' }, task({ title: 'x', content: '..ABC..' }), days), true)
assert.equal(filterSummary({ ...EMPTY_FILTER, lists: ['l1'], tags: ['g1'], date: 'today', priorities: [3] }, { lists: { l1: '업무' }, tags: { g1: '운동' } }), '업무 · #운동 · 오늘 · 높음')
assert.equal(filterSummary(EMPTY_FILTER, { lists: {}, tags: {} }), '모든 할 일')

// 검색: 와일드카드는 글자 그대로, 일기는 나만 보기 제외, 삭제한 할 일 제외
assert.equal(likeOf(' 50%_off\\ '), '%50\\%\\_off\\\\%')
assert.match(searchSql('diary', 'x').sql, /COALESCE\(private, 0\) = 0/)
assert.match(searchSql('task', 'x').sql, /t\.deleted_at IS NULL/)
assert.match(searchSql('task', 'x').sql, /check_items/)
assert.match(searchSql('list', 'x').sql, /archived_at IS NULL/)
assert.deepEqual(highlight('주간 회의록 회의', '회의'), [['주간 ', false], ['회의', true], ['록 ', false], ['회의', true]])
assert.deepEqual(highlight('abc', ''), [['abc', false]])
assert.equal(snippet('분기 회고 자료는 다음 회의 전에 숫자 확인하기', '회의', 6), '…료는 다음 회의 전에 숫자…')
assert.equal(snippet('없음', '회의'), null)
assert.deepEqual(pushRecent(['a', 'b'], ' b '), ['b', 'a'])
assert.equal(pushRecent(Array.from({ length: 10 }, (_, i) => `q${i}`), 'new').length, 10)
console.log('org ok')
