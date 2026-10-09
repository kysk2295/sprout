// 27 AI 비서 순수 규칙 시험 — 데스크톱 shared/assistant.ts와 같은 해석(같은 입력 → 같은 결과)
import assert from 'node:assert/strict'
import * as desktop from '../../../desktop/src/shared/assistant.ts'
import {
  buildChatInput, completedStats, humanize, interpret, intentSchema, isConversational, isLimit, parseIntent, parseStreamLine, querySql, queryResult, replyPreview, splitLines,
  type Intent
} from './core.ts'

const base = { message: '', title: '', listId: '', start: '', due: '', from: '', to: '', keyword: '', repeat: '' }
const json = (o: object) => JSON.stringify(o)

// 데스크톱과 같은 스키마·같은 검증
assert.deepEqual(intentSchema, desktop.intentSchema)
const vectors = [
  json({ action: 'create', status: 'open', ...base, title: '회의', start: '2026-10-06T15:00', due: '2026-10-06T16:00' }),
  '```json\n' + json({ action: 'query', status: 'open', ...base, from: '2026-10-05', to: '2026-10-11' }) + '\n```',
  '네, 알겠습니다: ' + json({ action: 'stats', status: 'completed', from: '2026-10-05', to: '2026-10-11' }) + ' 끝',
  json({ action: 'create', status: 'open', ...base, title: 'x', start: '2026-10-06T16:00', due: '2026-10-06T15:00' }),
  json({ action: 'create', status: 'open', ...base, title: 'x', due: '2026-02-30' }),
  json({ action: 'create', status: 'open', ...base, title: 'x', due: '2026-10-06', repeat: 'FREQ=WEEKLY;BYDAY=MO' }),
  json({ action: 'create', status: 'open', ...base, title: 'x', repeat: 'FREQ=HOURLY' }),
  json({ action: 'query', status: 'all', ...base, from: '2026-10-09', to: '2026-10-05' }),
  json({ action: 'delete', status: 'all', ...base }),
  'not json'
]
for (const v of vectors) {
  let a: unknown, b: unknown
  try { a = parseIntent(v) } catch (e) { a = (e as Error).message }
  try { b = desktop.parseIntent(v) } catch (e) { b = (e as Error).message }
  assert.deepEqual(a, b, v)
}
assert.equal(parseIntent(vectors[2]).keyword, '') // 빠진 칸은 빈칸
assert.equal(replyPreview('{"action":"reply","message":"안녕하세요\\n반가'), '안녕하세요\n반가')
assert.equal(replyPreview('{"action":"create"'), desktop.replyPreview('{"action":"create"'))

// 스트림 줄
assert.equal(parseStreamLine('   '), null)
assert.deepEqual(parseStreamLine('{"queue":{"position":2,"waiting":3}}'), { queue: { position: 2, waiting: 3 } })
assert.deepEqual(parseStreamLine('{"message":{"content":"안"},"done":false}'), { delta: '안', done: false })
assert.deepEqual(parseStreamLine('{"done":true}'), { delta: undefined, done: true })
assert.throws(() => parseStreamLine('{"error":"지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.","code":"queue_full"}'), /쓰는 사람이 많아요/)
assert.deepEqual(splitLines('a\nb\nc'), { lines: ['a', 'b'], rest: 'c' })
assert.deepEqual(splitLines('a\n'), { lines: ['a'], rest: '' })

// 지시문: 날짜 표(월요일 시작) · 목록 id만 고르게
const now = new Date('2026-10-07T09:00:00') // 수요일
const lists = [{ id: 'inbox1', name: '기본함', kind: 'inbox' }, { id: 'l2', name: '공부', kind: 'normal' }]
{
  const { input, conversational } = buildChatInput('내일 오후 3시 회의 등록해 줘', 'm', lists, [{ role: 'user', content: '이전 말' }], now, 'Asia/Seoul')
  assert.equal(conversational, false)
  assert.match(input.messages[0].content, /Today is 2026-10-07, weekday 3/)
  assert.match(input.messages[0].content, /This week is 2026-10-05 through 2026-10-11/)
  assert.deepEqual((input.format as { properties: { listId: { enum: string[] } } }).properties.listId.enum, ['', 'inbox1', 'l2'])
  assert.equal(input.messages.length, 3)
  // 13 §3.1 기록 묻기 규칙(앞 규칙이 놓친 말은 모델이 recall:last·recall:count로 표시)
  assert.match(input.messages[0].content, /recall:last/)
  assert.match(input.messages[0].content, /recall:count/)
}
assert.equal(isConversational('너 무슨 기능 할 수 있어?'), true)
assert.equal(isConversational('오늘 할 일 보여 줘'), false)
assert.equal(buildChatInput('안녕', 'm', lists, [], now, 'Asia/Seoul').input.format, undefined)

// 후처리
{
  // 길이를 말하지 않으면 길이를 만들지 않는다
  const i = interpret(json({ action: 'create', status: 'open', ...base, title: '치과', start: '2026-10-08T15:00', due: '2026-10-08T16:00' }), '내일 오후 3시 치과 등록해 줘', now) as Intent
  assert.equal(i.start, ''); assert.equal(i.due, '2026-10-08T15:00')
  const j = interpret(json({ action: 'create', status: 'open', ...base, title: '회의', start: '2026-10-08T15:00', due: '2026-10-08T16:00' }), '내일 오후 3시 회의 한 시간 등록해 줘', now) as Intent
  assert.equal(j.start, '2026-10-08T15:00')
}
assert.deepEqual(interpret(json({ action: 'create', status: 'open', ...base, title: '회의', due: '2026-10-08' }), '내일 회의', now), { reply: '등록하려면 제목과 함께 “일정으로 등록해 줘”라고 말씀해 주세요.' })
{
  // 읽기 요청인데 모델이 엉뚱한 모양이면 앱이 조회로 바꾸고 기간은 달력 계산
  const i = interpret('모르겠어요', '이번 주 완료한 일 몇 시간이야?', now) as Intent
  assert.equal(i.action, 'stats'); assert.equal(i.status, 'completed'); assert.equal(i.from, '2026-10-05'); assert.equal(i.to, '2026-10-11')
  const k = interpret(json({ action: 'query', status: 'all', ...base, from: '2026-01-01', to: '2026-01-01' }), '다음 주 할 일 보여 줘', now) as Intent
  assert.equal(k.status, 'open'); assert.equal(k.from, '2026-10-12'); assert.equal(k.to, '2026-10-18')
}
assert.throws(() => interpret('엉망', '내일 3시 회의 등록해 줘', now), /형식/)

// 조회 SQL(데스크톱 executeIntent와 같은 조건)
{
  const q = querySql({ action: 'query', status: 'open', ...base, from: '2026-10-05', to: '2026-10-11', listId: 'l2', keyword: '영어' })
  assert.match(q.sql, /t\.deleted_at IS NULL AND t\.status <> 2 AND t\.status = 0 AND COALESCE\(t\.due_at,t\.start_at\) >= \? AND COALESCE\(t\.start_at,t\.due_at\) < \? AND t\.list_id = \?/)
  assert.deepEqual(q.args, ['2026-10-05', '2026-10-12', 'l2', '영어', '영어', '영어'])
  const st = querySql({ action: 'stats', status: 'completed', ...base, from: '2026-10-05', to: '2026-10-11' })
  assert.match(st.sql, /t\.status = 1 AND t\.completed_at >= \? AND t\.completed_at < \?/)
  assert.equal(st.args[0], new Date('2026-10-05T00:00:00').toISOString())
  assert.equal(st.args[1], new Date('2026-10-12T00:00:00').toISOString())
}
// 집계: 하위가 상위와 겹치면 상위만, 시간 없는 것은 따로
{
  const rows = [
    { id: 'a', title: 'A', start_at: '2026-10-06T09:00', due_at: '2026-10-06T11:00', is_all_day: 0, parent_id: null },
    { id: 'b', title: 'B', start_at: '2026-10-06T09:30', due_at: '2026-10-06T10:00', is_all_day: 0, parent_id: 'a' },
    { id: 'c', title: 'C', start_at: '2026-10-07T13:00', due_at: '2026-10-07T13:40', is_all_day: 0, parent_id: null },
    { id: 'd', title: 'D', start_at: null, due_at: '2026-10-07', is_all_day: 1, parent_id: null }
  ]
  assert.deepEqual(completedStats(rows), { count: 4, hours: 2.7, untimed: 1 })
  const r = queryResult({ action: 'stats', status: 'completed', ...base, from: '2026-10-05', to: '2026-10-11' }, rows)
  assert.equal(r.stats!.range, '2026-10-05 ~ 2026-10-11')
  assert.match(r.text, /완료한 항목 4개 · 예정된 시간 2.7시간/)
  assert.equal(queryResult({ action: 'query', status: 'open', ...base }, rows).text, '4개의 항목을 찾았어요.')
}

// 오류 문구(13 §6)
assert.equal(humanize(new Error('network request failed')), '꿈틀 AI에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.')
assert.equal(humanize(new Error('지금은 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.')), '지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.')
assert.equal(humanize(new Error('AI 요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요. (오늘 남은 요청 63회)')), 'AI 요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요. (오늘 남은 요청 63회)')
assert.equal(humanize(new Error('{"error":"x"}')), '요청을 처리하지 못했어요. 다시 시도해 주세요.')
assert.equal(humanize(new Error('Request failed with 503')), '지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.')
assert.ok(isLimit(new Error('오늘 AI 사용 한도를 다 썼어요. 내일 다시 시도해 주세요.')))
assert.ok(isLimit(new Error('지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.')))
assert.ok(!isLimit(new Error('network request failed')))

console.log('assistant ok')
