// 48 자동 정리 규칙 시험: 시간대 경계 · 14일 경계 · 제외(반복·고정·보관·프로젝트·마감 없음·완료·되살림) · 하위 · 설정·묶음 읽기
import assert from 'node:assert/strict'
import {
  AUTO_TRASH, activeProjectTasks, autoTrashSettingsId, autoTrashSettingsJson, cutoffDay, isStale, lastBatch, noticeText, parseAutoTrashSettings, parseBatch,
  pendingNotice, pickAutoTrash, pickTimeZone, todayIn, type AtInput, type AtTask
} from './autoTrash.ts'

const T = (id: string, due: string | null, x: Partial<AtTask> = {}): AtTask => ({ id, parent_id: null, status: 0, deleted_at: null, due_at: due, repeat_rule: null, pinned_at: null, list_id: 'inbox', ...x })
const input = (tasks: AtTask[], x: Partial<AtInput> = {}): AtInput => ({ tasks, archivedLists: [], projectTags: [], taskTags: [], deadlines: [], done: [], ...x })
const pick = (tasks: AtTask[], today: string, x: Partial<AtInput> = {}) => pickAutoTrash(input(tasks, x), today).ids.sort()

// ── 14일 경계(날짜만) ──
assert.equal(cutoffDay('2026-10-09'), '2026-09-25')
assert.equal(isStale('2026-09-24', '2026-10-09'), true) // 15일
assert.equal(isStale('2026-09-25', '2026-10-09'), false) // 딱 14일 = 아직
assert.equal(isStale('2026-09-24T23:59', '2026-10-09'), true) // 시각 있는 일도 날짜로
assert.equal(isStale('2026-09-25T00:00', '2026-10-09'), false)
assert.equal(isStale(null, '2026-10-09'), false)
assert.deepEqual(pick([T('a', '2026-09-24'), T('b', '2026-09-25'), T('c', '2026-09-24T09:00'), T('d', null)], '2026-10-09'), ['a', 'c'])
// 달·해 넘김
assert.equal(cutoffDay('2026-01-05'), '2025-12-22')
assert.equal(cutoffDay('2028-03-10'), '2028-02-25') // 윤년 2월

// ── 시간대 경계 ──
// 2026-10-08T15:30Z = 서울 10-09 00:30 · LA 10-08 08:30
const ms = Date.parse('2026-10-08T15:30:00Z')
assert.equal(todayIn(ms, 'Asia/Seoul'), '2026-10-09')
assert.equal(todayIn(ms, 'America/Los_Angeles'), '2026-10-08')
const due = [T('x', '2026-09-24')]
assert.deepEqual(pick(due, todayIn(ms, 'Asia/Seoul')), ['x']) // 서울은 이미 10-09 → 15일
assert.deepEqual(pick(due, todayIn(ms, 'America/Los_Angeles')), []) // LA는 아직 10-08 → 14일
// 서울 자정 직전(UTC 14:59)엔 아직
assert.equal(todayIn(Date.parse('2026-10-08T14:59:00Z'), 'Asia/Seoul'), '2026-10-08')
// 시간대 고르기: 설정 → 기기 → 서울
assert.equal(pickTimeZone('Europe/Paris', 'America/New_York'), 'Europe/Paris')
assert.equal(pickTimeZone(null, 'America/New_York'), 'America/New_York')
assert.equal(pickTimeZone('Not/AZone', undefined, ''), 'Asia/Seoul')
assert.equal(AUTO_TRASH.defaultTz, 'Asia/Seoul')

// ── 제외 ──
const today = '2026-10-09'
const old = '2026-08-01'
assert.deepEqual(pick([
  T('open', old),
  T('done', old, { status: 1 }),
  T('wontdo', old, { status: 2 }),
  T('trashed', old, { deleted_at: '2026-09-01T00:00:00.000Z' }),
  T('repeat', old, { repeat_rule: 'RRULE:FREQ=DAILY' }),
  T('pinned', old, { pinned_at: '2026-08-01T00:00:00.000Z' }),
  T('archived', old, { list_id: 'L-arch' }),
  T('nodue', null)
], today, { archivedLists: ['L-arch'] }), ['open'])

// 되살린 일: 같은 마감이면 다시 안 옮김, 마감을 바꾸면 다시 셈
assert.deepEqual(pick([T('r', old)], today, { done: [{ task_id: 'r', due_at: old }] }), [])
assert.deepEqual(pick([T('r', '2026-08-02')], today, { done: [{ task_id: 'r', due_at: old }] }), ['r'])

// ── 진행 중인 프로젝트 ──
{
  const tasks = [T('m1', old), T('m2', old), T('key', '2026-12-01'), T('n1', old), T('p2a', old), T('p2b', '2026-09-01'), T('p3a', old), T('p3b', '2026-10-20')]
  const x: Partial<AtInput> = {
    projectTags: ['P1', 'P2', 'P3'],
    taskTags: [
      { task_id: 'm1', tag_id: 'P1' }, { task_id: 'm2', tag_id: 'P1', state: 'suggested' }, { task_id: 'key', tag_id: 'P1' },
      { task_id: 'p2a', tag_id: 'P2' }, { task_id: 'p2b', tag_id: 'P2' }, // 마감 없음 → 가장 늦은 구성원 09-01 → 끝난 프로젝트
      { task_id: 'p3a', tag_id: 'P3' }, { task_id: 'p3b', tag_id: 'P3' }, // ⚑ 없음 → 가장 늦은 구성원 10-20 → 진행 중
      { task_id: 'n1', tag_id: 'TOPIC' } // 프로젝트 아닌 태그
    ],
    deadlines: [{ tag_id: 'P1', task_id: 'key' }]
  }
  const active = activeProjectTasks(input(tasks, x), today)
  assert.deepEqual([...active].sort(), ['key', 'm1', 'p3a', 'p3b'])
  // m2는 받아들이지 않은 제안 태그 → 프로젝트 구성원 아님 → 옮김
  assert.deepEqual(pick(tasks, today, x), ['m2', 'n1', 'p2a', 'p2b'])
  // ⚑ 마감이 지났으면 지키지 않음
  const past = tasks.map((t) => (t.id === 'key' ? { ...t, due_at: '2026-10-01' } : t))
  assert.ok(pick(past, today, x).includes('m1'))
  // ⚑ 마감 = 오늘이면 아직 진행 중
  const todayKey = tasks.map((t) => (t.id === 'key' ? { ...t, due_at: today } : t))
  assert.ok(!pick(todayKey, today, x).includes('m1'))
}

// ── 하위 ──
{
  // 마감 없는 하위·같이 지난 하위는 부모와 함께, 완료한 하위는 그대로
  const tasks = [T('p', old), T('c1', null, { parent_id: 'p' }), T('c2', old, { parent_id: 'p' }), T('c3', null, { parent_id: 'p', status: 1 }), T('g', null, { parent_id: 'c1' })]
  const r = pickAutoTrash(input(tasks), today)
  assert.deepEqual(r.ids.sort(), ['c1', 'c2', 'g', 'p'])
  assert.deepEqual(r.roots, ['p'])
}
{
  // 2주 안 된 하위가 있으면 부모 통째로 건너뜀 — 스스로 대상인 다른 하위(c2)는 따로 옮김
  const tasks = [T('p', old), T('c1', '2026-10-01', { parent_id: 'p' }), T('c2', old, { parent_id: 'p' })]
  assert.deepEqual(pick(tasks, today), ['c2'])
  // 손주가 지켜야 해도 마찬가지
  const deep = [T('p', old), T('c', null, { parent_id: 'p' }), T('g', today, { parent_id: 'c' })]
  assert.deepEqual(pick(deep, today), [])
  // 반복·고정·진행 중 프로젝트 하위도
  assert.deepEqual(pick([T('p', old), T('c', null, { parent_id: 'p', repeat_rule: 'RRULE:FREQ=WEEKLY' })], today), [])
  assert.deepEqual(pick([T('p', old), T('c', null, { parent_id: 'p', pinned_at: 'x' })], today), [])
}
{
  // 부모가 대상이 아니면 대상인 하위만
  const tasks = [T('p', today), T('c', old, { parent_id: 'p' })]
  assert.deepEqual(pick(tasks, today), ['c'])
  // 완료한 하위 아래 열린 손주는 건드리지 않음
  const t2 = [T('p', old), T('c', null, { parent_id: 'p', status: 1 }), T('g', null, { parent_id: 'c' })]
  assert.deepEqual(pick(t2, today), ['p'])
  // 순환이 있어도 끝난다
  const loop = [T('a', old, { parent_id: 'b' }), T('b', old, { parent_id: 'a' })]
  assert.equal(pick(loop, today).length, 2)
}

// ── 설정 ──
assert.equal(autoTrashSettingsId('u1'), 'autotrash-u1')
assert.deepEqual(parseAutoTrashSettings(null), { on: true, tz: null }) // 행 없음 = 켬
assert.deepEqual(parseAutoTrashSettings('{bad'), { on: true, tz: null })
assert.deepEqual(parseAutoTrashSettings('{"on":false,"tz":"Asia/Tokyo"}'), { on: false, tz: 'Asia/Tokyo' })
assert.deepEqual(parseAutoTrashSettings('{"on":true,"tz":"Mars/Base"}'), { on: true, tz: null })
assert.deepEqual(parseAutoTrashSettings(autoTrashSettingsJson({ on: false, tz: 'Asia/Seoul' })), { on: false, tz: 'Asia/Seoul' })

// ── 묶음 ──
const b1 = JSON.stringify({ at: '2026-10-09T00:10:00.000Z', day: '2026-10-09', ids: ['a', 'b'], count: 2, seen: false, undone: false })
const b2 = JSON.stringify({ at: '2026-10-10T00:10:00.000Z', day: '2026-10-10', ids: ['c'], count: 1, seen: false, undone: false })
const seen = JSON.stringify({ at: '2026-10-08T00:10:00.000Z', ids: ['z'], count: 1, seen: true, undone: false })
const undone = JSON.stringify({ at: '2026-10-11T00:10:00.000Z', ids: ['y'], count: 1, seen: false, undone: true })
assert.equal(parseBatch('nope'), null)
assert.equal(parseBatch(b1)!.count, 2)
assert.equal(parseBatch(seen)!.day, '2026-10-08')
assert.deepEqual(pendingNotice([{ id: 'B1', options_json: b1 }, { id: 'B2', options_json: b2 }, { id: 'S', options_json: seen }, { id: 'U', options_json: undone }]), { batchIds: ['B1', 'B2'], count: 3 })
assert.equal(pendingNotice([{ id: 'S', options_json: seen }]), null)
assert.equal(lastBatch([{ id: 'B1', options_json: b1 }, { id: 'B2', options_json: b2 }, { id: 'U', options_json: undone }])!.id, 'B2')
assert.equal(noticeText(12), '만료된 지 2주 지난 할 일 12개를 휴지통으로 옮겼어요')

console.log('autoTrash: ok')
