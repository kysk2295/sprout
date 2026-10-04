// 06 캘린더 계산 · 13 AI 비서 서버 경로(대기열 줄·느슨한 JSON) — 2026-10-04 E2E 점검에서 고친 것 포함
import assert from 'node:assert/strict'
import { hourLabel, itemsOf, layoutDay, rangeOf, shiftCursor, shortRange, titleOf } from '../src/renderer/src/lib/calendar'
import { timeSelection } from '../src/renderer/src/lib/calendarSelection'
import { scheduledDrop } from '../src/renderer/src/lib/calendarDrop'
import { parseIntent, readChatStream } from '../src/shared/assistant'
import type { TaskRow } from '../src/renderer/src/data/types'

// ── 범위: 월요일 시작(2026-10-05 사용자 결정), 월 보기는 필요한 주만큼 ──
assert.deepEqual(rangeOf('week', '2026-10-07').days, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
assert.deepEqual(rangeOf('week', '2026-10-11').days[0], '2026-10-05', '일요일은 그 주의 마지막 날')
assert.equal(rangeOf('month', '2026-10-15').days[0], '2026-09-28')
assert.equal(rangeOf('month', '2026-10-15').days.length, 35) // 2026-10: 9/28 ~ 11/1, 5주
assert.equal(rangeOf('month', '2026-08-01').days.length, 42) // 2026-08: 7/27 ~ 9/6, 6주
assert.equal(shiftCursor('month', '2026-01-31', 1), '2026-02-01')
assert.equal(shiftCursor('week', '2026-10-04', -1), '2026-09-27')
assert.equal(titleOf('week', '2026-10-03'), '2026년 10월')
assert.deepEqual([0, 11, 12, 13].map(hourLabel), ['0 AM', '11 AM', '12 PM', '1 PM'])
assert.equal(shortRange('2026-10-04T11:00', '2026-10-04T12:15', true), '오전 11:00-오후 12:15')

// ── 만들기: 클릭 = 한 시각, 끌기 = 마지막 15분 칸 포함(방향 무관) ──
assert.deepEqual(timeSelection('2026-10-06', 840, 840), { start_at: null, due_at: '2026-10-06T14:00' })
assert.deepEqual(timeSelection('2026-10-07', 720, 660), { start_at: '2026-10-07T11:00', due_at: '2026-10-07T12:15' })
assert.equal(timeSelection('2026-10-07', 1380, 1425).due_at, '2026-10-07T23:59')

// ── 할일 정렬 패널 → 캘린더: 시간 칸이면 1시간, 날짜 칸이면 종일 ──
assert.deepEqual(scheduledDrop({ id: 'a', start_at: null, due_at: null }, { day: '2026-10-07', minute: 780 }), { id: 'a', start_at: '2026-10-07T13:00', due_at: '2026-10-07T14:00' })
assert.deepEqual(scheduledDrop({ id: 'a', start_at: null, due_at: null }, { day: '2026-10-20' }), { id: 'a', start_at: null, due_at: '2026-10-20' })

// ── 겹침: 같은 시간대 블록은 열을 나눈다 ──
const task = (id: string, start_at: string | null, due_at: string): TaskRow => ({ id, title: id, start_at, due_at, status: 0, repeat_rule: null } as unknown as TaskRow)
const items = itemsOf([task('a', '2026-10-09T17:00', '2026-10-09T18:00'), task('b', '2026-10-09T17:15', '2026-10-09T18:15'), task('c', '2026-10-09T19:00', '2026-10-09T20:00')], '2026-10-04', '2026-10-10', false)
const blocks = layoutDay(items, '2026-10-09')
assert.deepEqual(blocks.map((b) => [b.item.task.id, b.col, b.cols]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]])

// ── 13 AI 비서: 서버 프록시 대기열 줄은 답 글자가 아니다 ──
const stream = (lines: string[]) => new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l)); c.close() } }))
const queue: number[] = []
let text = ''
const out = await readChatStream(stream(['{"queue":{"position":2,"waiting":2}}\n{"queue":{"position":1,"waiting":1}}\n', '{"queue":{"position":0,"waiting":0}}\n{"message":{"content":"안"}}\n{"message":{"content":"녕"},"done":true}\n']), (d) => { text += d }, undefined, (q) => queue.push(q.position))
assert.equal(out, '안녕'); assert.equal(text, '안녕'); assert.deepEqual(queue, [2, 1, 0])
// 대기열 콜백 없이도(예전 호출) 그대로 동작
assert.equal(await readChatStream(stream(['{"queue":{"position":1,"waiting":1}}\n{"message":{"content":"ok"},"done":true}\n']), () => {}), 'ok')
await assert.rejects(readChatStream(stream(['{"error":"지금은 AI를 쓸 수 없어요."}\n']), () => {}), /쓸 수 없어요/)

// ── 서버(think:false)에서는 스키마가 강제되지 않는다: 빠진 칸·앞뒤 군말을 받아 준다 ──
const loose = parseIntent('{"action":"query","status":"open","message":"","title":"","listId":"","start":"","due":"","from":"2026-10-05","to":"2026-10-11"}')
assert.equal(loose.keyword, ''); assert.equal(loose.repeat, ''); assert.equal(loose.from, '2026-10-05')
assert.equal(parseIntent('답: {"action":"reply","message":"몇 시로 할까요?"} 끝').status, 'all')
assert.throws(() => parseIntent('[{"date":"2026-09-28","events":[]}]'), /형식/)
assert.throws(() => parseIntent('{"action":"delete"}'), /형식/)

console.log('calendar tests ok')
