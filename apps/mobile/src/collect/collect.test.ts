// 26 수집함 순수 규칙 시험 — 데스크톱과 같은 행·같은 id·같은 묶음·같은 위키 버전
import assert from 'node:assert/strict'
import {
  bandReason, chipsOf, contentOf, convertError, convertStmts, domainOf, dropSource, groupItems, isYoutube, itemRow, kindPatch, restoreReason,
  shortDay, sourceLabel, suggestionInput, titleOf, versionStmts, watchGroups, type CollectItem
} from './core.ts'

const today = '2026-10-05' // 월요일
const at = (d: string, t = '10:00') => new Date(`${d}T${t}:00`).toISOString()
let n = 0
const item = (p: Partial<CollectItem>): CollectItem => ({
  id: `n${++n}`, content: '내용', created_at: at(today), modified_at: at(today), task_id: null, kind: null, kind_source: null, ai_state: 'pending',
  suggestion: null, url: null, link_title: null, seen_at: null, topic_id: null, source: 'app', captured_at: null, ...p
})

// 새 항목: 링크만이면 AI 없이 볼 것, 나머지는 데스크톱이 정리하도록 pending
assert.deepEqual(itemRow('  https://youtu.be/abc  '), { content: 'https://youtu.be/abc', task_id: null, url: 'https://youtu.be/abc', kind: 'link', kind_source: 'ai', ai_state: 'done', source: 'app' })
assert.equal(itemRow('이 영상 금요일까지 요약 https://youtu.be/abc').kind, null)
assert.equal(itemRow('이 영상 금요일까지 요약 https://youtu.be/abc').ai_state, 'pending')
assert.equal(itemRow('우유 사기').url, null)
assert.ok(isYoutube('https://www.youtube.com/watch?v=1') && isYoutube('https://youtu.be/x') && !isYoutube('https://notyoutube.com'))
assert.equal(domainOf('https://www.blog.example.dev/a'), 'blog.example.dev')

// 꼬리표
const sug = JSON.stringify({ title: '치과', due: '2026-10-06T15:00', listId: 'l2' })
{
  const c = chipsOf(item({ kind: 'task', ai_state: 'done', suggestion: sug }), today)
  assert.equal(c.chips[0].text, '할 일 제안 · 내일 오후 3:00')
  assert.equal(c.register, true)
  assert.equal(c.icon, 'task')
}
assert.equal(chipsOf(item({ task_id: 'note-x', task_title: '치과', kind: 'task', ai_state: 'done' }), today).chips[0].text, '할 일로 등록됨')
assert.equal(chipsOf(item({ task_id: 'note-x', task_title: '치과', task_scheduled: 1 }), today).chips[0].text, '일정으로 등록됨')
assert.equal(chipsOf(item({ task_id: 'note-x', task_title: null }), today).chips[0].text, '할 일 · 삭제됨')
assert.equal(chipsOf(item({ kind: 'wiki', ai_state: 'done', topic_name: 'LLM 공부' }), today).chips[0].text, '위키 · LLM 공부')
assert.equal(chipsOf(item({ ai_state: 'pending' }), today).chips[0].text, '정리 전')
assert.deepEqual(chipsOf(item({ ai_state: 'failed', kind: 'task' }), today).chips, [])
assert.deepEqual(chipsOf(item({ source: 'kakao_import', kind: 'memo', ai_state: 'done' }), today).chips.map((c) => c.text), ['카톡', '메모'])

// 제목: 링크만 있는 항목은 가져온 제목
assert.equal(titleOf({ url: 'https://a.com', link_title: '가져온 제목', content: 'https://a.com' }), '가져온 제목')
assert.equal(titleOf({ url: 'https://a.com', link_title: '가져온 제목', content: '\n  첫 줄\n둘째' }), '첫 줄')

// 묶음: 오늘 · 어제 · 이번 주(일요일 시작) · 이전(접힘) + 카톡 날짜별(최근만 펼침)
{
  const g = groupItems([
    item({ created_at: at(today) }), item({ created_at: at('2026-10-04') }), item({ created_at: at('2026-10-01') }),
    item({ source: 'kakao_import', captured_at: at('2026-10-02') }), item({ source: 'kakao_import', captured_at: at('2026-09-30') })
  ], today)
  assert.deepEqual(g.map((x) => [x.id, x.closedByDefault]), [['today', false], ['yesterday', false], ['older', true], ['kakao:2026-10-02', false], ['kakao:2026-09-30', true]])
  assert.equal(g[3].name, '카카오톡에서 가져옴 · 10월 2일')
}
{
  // 수요일 기준이면 월요일 것이 이번 주
  const g = groupItems([item({ created_at: at('2026-10-05') })], '2026-10-07')
  assert.equal(g[0].id, 'week')
  // 일요일 것도 이번 주(일요일 시작), 그 전 토요일은 이전
  assert.equal(groupItems([item({ created_at: at('2026-10-04') })], '2026-10-07')[0].id, 'week')
  assert.equal(groupItems([item({ created_at: at('2026-10-03') })], '2026-10-07')[0].id, 'older')
}
assert.deepEqual(watchGroups([item({ url: 'https://a', seen_at: null }), item({ url: 'https://b', seen_at: at(today) }), item({})]).map((g) => g.items.length), [1, 1])
assert.equal(shortDay(at(today), today), '오늘')
assert.equal(shortDay(at('2026-10-04'), today), '어제')
assert.equal(shortDay(at('2026-10-02'), today), '10월 2일')
assert.equal(sourceLabel({ source: 'kakao_import', captured_at: at('2026-10-02'), created_at: at(today) }, today), '카톡 10/2')
assert.equal(sourceLabel({ source: 'app', captured_at: null, created_at: at('2026-09-30') }, today), '메모 9/30')

// 할 일로 만들기: 데스크톱 convertNote와 같은 검사·결정적 id·INSERT OR IGNORE
assert.equal(convertError({ title: ' ', listId: 'l' }), '제목을 입력해 주세요.')
assert.equal(convertError({ title: 'a', listId: 'l', due: '2026-02-30' }), '날짜를 확인해 주세요.')
assert.equal(convertError({ title: 'a', listId: 'l', start: '2026-10-06T16:00', due: '2026-10-06T15:00' }), '종료 시각은 시작 이후여야 해요.')
assert.equal(convertError({ title: 'a', listId: 'l', start: '2026-10-06T15:00', due: '2026-10-06T16:00' }), null)
{
  const [task, note] = convertStmts({ id: 'abc', content: '내일 3시 치과' }, { title: ' 치과 ', listId: 'l1', due: '2026-10-06T15:00' }, 'u1', -1)
  assert.match(task.sql, /^INSERT OR IGNORE INTO tasks/)
  const cols = task.sql.match(/\(([^)]*)\)/)![1].split(',')
  const row = Object.fromEntries(cols.map((c, i) => [c, task.params![i]]))
  assert.equal(row.id, 'note-abc')
  assert.equal(row.title, '치과')
  assert.equal(row.content, '내일 3시 치과')
  assert.equal(row.is_all_day, 0)
  assert.equal(row.owner_id, 'u1')
  assert.match(note.sql, /^UPDATE notes SET task_id = \?/)
  assert.equal(note.params![0], 'note-abc')
}
assert.deepEqual(suggestionInput(item({ content: '내일 3시 치과', suggestion: sug }), [{ id: 'inbox', kind: 'inbox' }, { id: 'l2', kind: 'normal' }]), { title: '치과', listId: 'l2', due: '2026-10-06T15:00', start: undefined })
assert.equal(suggestionInput(item({ content: '첫 줄\n둘째', suggestion: null }), [{ id: 'inbox', kind: 'inbox' }])!.listId, 'inbox')
assert.deepEqual(kindPatch({ suggestion: null }, 'task'), { kind: 'task', kind_source: 'user', ai_state: 'pending', topic_id: null })
assert.deepEqual(kindPatch({ suggestion: null }, 'wiki'), { kind: 'wiki', kind_source: 'user', ai_state: 'pending' })
assert.deepEqual(kindPatch({ suggestion: null }, 'memo'), { kind: 'memo', kind_source: 'user', ai_state: 'done', topic_id: null })

// 위키: 깨진 JSON도 빈 페이지 · 자료 빼기(직접 쓴 줄은 남김) · 버전 id · 되돌리기 문구
assert.deepEqual(contentOf({ content: 'oops' }).sections.key, [])
{
  const c = contentOf({ content: JSON.stringify({ sections: { overview: [], key: [{ text: 'a', src: 'n1', at: '', by: 'ai' }, { text: 'b', src: 'n1', at: '', by: 'user' }], questions: [] }, related: [], suggestions: [{ text: 's', src: 'n1', at: '', by: 'ai', section: 'key' }] }) })
  const next = dropSource(c, 'n1')!
  assert.deepEqual(next.sections.key.map((l) => l.text), ['b'])
  assert.equal(next.suggestions.length, 0)
  assert.equal(dropSource(next, 'n1'), null)
  const [u, ins] = versionStmts({ id: 't1', version: 6 }, next, restoreReason(3), 'u1')
  assert.match(u.sql, /^UPDATE wiki_topics SET content = \?, version = \?/)
  assert.equal(u.params![1], 7)
  assert.ok(ins.params!.includes('t1-v7'))
}
assert.equal(restoreReason(3), '버전 3으로 되돌렸어요')
assert.equal(restoreReason(2), '버전 2로 되돌렸어요')
assert.equal(bandReason(6, 6, 'x'), '')
assert.equal(bandReason(6, 5, "방금 들어온 자료 1개를 '핵심 정리'에 반영했어요"), "방금 들어온 자료 1개를 '핵심 정리'에 반영했어요")
assert.equal(bandReason(7, 5, '마지막'), '2번 바뀌었어요 — 마지막')

console.log('collect ok')
