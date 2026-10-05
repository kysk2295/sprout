// 32 푸시(휴대폰) 순수 함수 시험: 메시지 해석 · 중복 확인 · 지우기 · 경로 · 등록 · 로컬 보고
import assert from 'node:assert/strict'
import {
  dismissTargets, isResponsePayload, localKeysOf, MOBILE_CAPS, needsRegister, parsePushPayload, reminderPlan, reportDelay, reportKeys, routeOf, sameKeys, type DeviceBody
} from './pushLogic.ts'

// ── 해석: Android 작업 페이로드(data 안 FCM data)와 data 자체 둘 다 ──
const reminderData = { type: 'reminder', key: 'r:abc@1760000000000', taskId: 't1', at: '1760000000000', channel: 'tasks', category: 'sprout-task', url: 'sprout://task/t1', body: '오늘 오후 3:00 · 업무', title: '보고서' }
const wrapped = { collapseKey: null, data: { ...reminderData, dataString: null }, messageId: '0:1', notification: null }
const r = parsePushPayload(wrapped)
assert.ok(r && r.type === 'reminder')
assert.equal(r.taskId, 't1')
assert.equal(r.at, 1760000000000)
assert.equal(r.title, '보고서')
assert.deepEqual(parsePushPayload(reminderData), r, 'data 자체도 같다')
// 제목 숨기기: title 없음
const hidden = parsePushPayload({ data: { ...reminderData, title: undefined, body: '오늘 오후 3:00' } })
assert.ok(hidden && hidden.type === 'reminder' && hidden.title === undefined)
// 깨진 reminder
assert.equal(parsePushPayload({ data: { ...reminderData, at: 'x' } }), null)
assert.equal(parsePushPayload({ data: { ...reminderData, key: 's:t1@1' } }), null, 'r: 키만')
// 하루 요약·성장·시험
const daily = parsePushPayload({ data: { type: 'daily', kind: 'daily', key: 'daily:2026-10-05', title: '오늘 할 일 5개', body: '보고서 · 운동', url: 'sprout://today', channel: 'daily' } })
assert.ok(daily && daily.type === 'daily' && daily.channel === 'daily' && daily.url === 'sprout://today')
const test = parsePushPayload({ data: { type: 'test', kind: 'test', key: 'test:1', title: '꿈틀 알림이 잘 와요', body: '이 휴대폰에서 서버 알림을 받을 수 있어요', channel: 'tasks' } })
assert.ok(test && test.type === 'test' && test.channel === 'tasks')
assert.equal(parsePushPayload({ data: { type: 'growth', kind: 'growth_evolve' } }), null, '제목 없으면 버림')
// 조용한 동기화
assert.deepEqual(parsePushPayload({ data: { type: 'sync' } }), { type: 'sync', dismiss: [] })
assert.deepEqual(parsePushPayload({ data: { type: 'sync', dismiss: '["a","b",3]' } }), { type: 'sync', dismiss: ['a', 'b'] })
assert.deepEqual(parsePushPayload({ data: { type: 'sync', dismiss: '{bad' } }), { type: 'sync', dismiss: [] })
// 모르는 것
assert.equal(parsePushPayload({ data: { type: 'other' } }), null)
assert.equal(parsePushPayload(null), null)
assert.equal(parsePushPayload({ data: { title: 'x' } }), null, 'type 없는 메시지(다른 출처)는 건드리지 않는다')
// 응답 페이로드 구분
assert.equal(isResponsePayload({ actionIdentifier: 'done', notification: {} }), true)
assert.equal(isResponsePayload(wrapped), false)

// ── 받을 때 확인(§4.3-3) ──
const msg = { key: 'r:abc@1000', taskId: 't1', at: 1000 }
assert.deepEqual(reminderPlan(msg, [], []), { show: true, cancel: [] })
assert.deepEqual(reminderPlan(msg, [], [{ id: 'r:abc@1000' }]), { show: false, cancel: [] }, '같은 id가 떠 있음')
assert.deepEqual(reminderPlan(msg, [], [{ id: 'r:zzz@1000', taskId: 't1' }]), { show: false, cancel: [] }, '같은 할 일·같은 순간의 다른 알림이 떠 있음')
assert.deepEqual(reminderPlan(msg, [{ id: 'r:abc@1000', taskId: 't1' }], []), { show: true, cancel: ['r:abc@1000'] }, '예약만 있음(늦은 알람) → 지금 띄우고 예약 취소')
assert.deepEqual(reminderPlan(msg, [{ id: 'r:zzz@1000', taskId: 't1' }], []), { show: true, cancel: ['r:zzz@1000'] })
assert.deepEqual(reminderPlan(msg, [{ id: 'r:zzz@2000', taskId: 't1' }], [{ id: 's:t1@1000', taskId: 't1' }]), { show: true, cancel: [] }, '다른 순간·다시 알림은 다른 알림')

// ── 지우기(§4.5) ──
assert.deepEqual(dismissTargets([{ id: 'r:a@1', taskId: 't1' }, { id: 's:t2@5', taskId: 't2' }, { id: 'daily:x' }, { id: 'r:b@1', taskId: 't3' }], ['t1', 't2']), ['r:a@1', 's:t2@5'])

// ── 경로 ──
assert.equal(routeOf('sprout://task/abc-1'), '/task/abc-1')
assert.equal(routeOf('sprout://today'), '/today')
assert.equal(routeOf('sprout://growth?report=2026-09-28'), '/growth')
assert.equal(routeOf('sprout://lists/inbox?cleanup=1'), null)
assert.equal(routeOf('https://x'), null)
assert.equal(routeOf(undefined), null)

// ── 등록 ──
assert.deepEqual(MOBILE_CAPS, ['reminder', 'daily', 'sync', 'growth'])
const body: DeviceBody = { token: 'tok-12345678', platform: 'android', app_version: '0.1.0', caps: MOBILE_CAPS, timezone: 'Asia/Seoul', locale: 'ko-KR', push_reminders: true }
assert.equal(needsRegister(body, null, 0), true)
assert.equal(needsRegister(body, { sig: JSON.stringify(body), at: 0 }, 3600_000), false, '같은 본문 하루 안')
assert.equal(needsRegister(body, { sig: JSON.stringify(body), at: 0 }, 86400_000), true, '하루 지나면')
assert.equal(needsRegister({ ...body, push_reminders: false }, { sig: JSON.stringify(body), at: 0 }, 1), true, '바뀌면 바로')

// ── 로컬 보고 ──
assert.deepEqual(localKeysOf(['s:t@1', 'r:b@2', 'daily:x', 'r:a@1', 'r:a@1']), ['r:a@1', 'r:b@2'])
assert.equal(localKeysOf(Array.from({ length: 80 }, (_, i) => `r:${i}@1`)).length, 50)
assert.equal(sameKeys(null, []), false)
assert.equal(sameKeys(['r:a@1'], ['r:a@1']), true)
assert.equal(sameKeys(['r:a@1'], ['r:a@2']), false)
assert.equal(reportDelay(null, 100), 0)
assert.equal(reportDelay(0, 10_000), 20_000)
assert.equal(reportDelay(0, 40_000), 0)

// 32 §17.6 ⓒ: 정확한 알람이 없으면 빈 목록(서버가 모두 보냄)
assert.deepEqual(reportKeys(['r:b@2', 's:t@1', 'r:a@1'], true), ['r:a@1', 'r:b@2'])
assert.deepEqual(reportKeys(['r:b@2', 'r:a@1'], false), [])
assert.equal(sameKeys(['r:a@1'], reportKeys(['r:a@1'], false)), false, '허용이 꺼지면 다시 보고')

console.log('pushLogic.test ok')
