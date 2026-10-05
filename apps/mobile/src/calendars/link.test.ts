// 38 휴대폰 캘린더 순수 계산 시험
import assert from 'node:assert/strict'
import {
  calHash, decide, deviceInput, deviceToRule, fieldsFromDevice, fingerprint, hash16, isDeviceProvider, isMine, judgeDevice, linkAccountFor, lookKey,
  ruleToDevice, spanChoices, spanFromDevice, spanToDevice, type LinkFields
} from './link.ts'

// 해시: 같은 값 = 같은 결과, 16자 16진수, 앞붙이
assert.equal(hash16('abc'), hash16('abc'))
assert.notEqual(hash16('abc'), hash16('abd'))
assert.match(hash16('x'), /^[0-9a-f]{16}$/)
assert.match(calHash('ABC-123'), /^c_[0-9a-f]{16}$/)
assert.match(linkAccountFor('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'), /^d_[0-9a-f]{16}$/)
assert.ok(isDeviceProvider('device-ios') && isDeviceProvider('device-android') && !isDeviceProvider('google') && !isDeviceProvider('apple') && !isDeviceProvider(null))

// 주인 판정: 같은 종류 + 같은 연결 id만
assert.ok(isMine({ ext_provider: 'device-ios', ext_account: 'd_1' }, 'ios', 'd_1'))
assert.ok(!isMine({ ext_provider: 'device-ios', ext_account: 'd_2' }, 'ios', 'd_1'))
assert.ok(!isMine({ ext_provider: 'device-android', ext_account: 'd_1' }, 'ios', 'd_1'))
assert.ok(!isMine({ ext_provider: 'google', ext_account: 'd_1' }, 'ios', 'd_1'))
assert.ok(!isMine({ ext_provider: 'apple', ext_account: 'apple' }, 'ios', 'apple'))

// 지문: 공백·줄바꿈·반복 규칙 순서가 달라도 같다, 지움은 x:
const f: LinkFields = { title: ' 회의 ', notes: 'a\r\nb', location: '', start_at: '2026-10-05T14:00', end_at: '2026-10-05T15:00', is_all_day: 0, repeat_rule: 'FREQ=WEEKLY;BYDAY=MO' }
assert.equal(fingerprint(f), fingerprint({ ...f, title: '회의', notes: 'a\nb', location: null }))
assert.notEqual(fingerprint(f), fingerprint({ ...f, end_at: '2026-10-05T16:00' }))
assert.ok(fingerprint(f, true).startsWith('x:'))

// 반복 규칙 ⇄ OS
assert.equal(ruleToDevice(null), null)
assert.deepEqual(ruleToDevice('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR'), { frequency: 'weekly', interval: 2, daysOfTheWeek: [{ dayOfTheWeek: 2 }, { dayOfTheWeek: 6 }] })
assert.deepEqual(ruleToDevice('FREQ=MONTHLY;BYDAY=-1FR'), { frequency: 'monthly', interval: 1, daysOfTheWeek: [{ dayOfTheWeek: 6, weekNumber: -1 }] })
assert.equal(ruleToDevice('RDATE=20261005,20261010'), 'unsupported')
const until = ruleToDevice('FREQ=DAILY;UNTIL=20261031;COUNT=3')
assert.ok(until && until !== 'unsupported' && until.endDate instanceof Date && (until.endDate as Date).getDate() === 31 && until.occurrence === 3)
for (const r of ['FREQ=DAILY', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR', 'FREQ=MONTHLY;BYMONTHDAY=15', 'FREQ=MONTHLY;BYDAY=3TU', 'FREQ=YEARLY;BYMONTHDAY=5;BYMONTH=10', 'FREQ=DAILY;UNTIL=20261031']) {
  const d = ruleToDevice(r)
  assert.ok(d && d !== 'unsupported')
  assert.equal(deviceToRule(d), r, r)
}
assert.equal(deviceToRule({ frequency: 'weekly', interval: 0, daysOfTheWeek: [{ dayOfTheWeek: 1 }] }), 'FREQ=WEEKLY;BYDAY=SU')
assert.equal(deviceToRule({ frequency: 'hourly' }), null)

// 시각: 시각 일정은 이 휴대폰 시각 그대로
const s = new Date(2026, 9, 5, 14, 0)
const e = new Date(2026, 9, 5, 15, 30)
assert.deepEqual(spanFromDevice({ startDate: s.toISOString(), endDate: e.toISOString(), allDay: false }, 'ios'), { start_at: '2026-10-05T14:00', end_at: '2026-10-05T15:30', is_all_day: 0 })
// 끝이 없거나 앞이면 시작 + 기본 길이
assert.equal(spanFromDevice({ startDate: s, endDate: 'bad', allDay: false }, 'android', 30)!.end_at, '2026-10-05T14:30')
// 종일: iOS = 이 휴대폰 날짜(끝 23:59:59), Android = UTC 자정(끝 = 다음 날 자정)
assert.deepEqual(spanFromDevice({ startDate: new Date(2026, 9, 5), endDate: new Date(2026, 9, 6, 23, 59, 59), allDay: true }, 'ios'), { start_at: '2026-10-05', end_at: '2026-10-06', is_all_day: 1 })
assert.deepEqual(spanFromDevice({ startDate: '2026-10-05T00:00:00.000Z', endDate: '2026-10-06T00:00:00.000Z', allDay: true }, 'android'), { start_at: '2026-10-05', end_at: '2026-10-05', is_all_day: 1 })
// 되돌아오기(꿈틀 → OS → 꿈틀)
for (const pf of ['ios', 'android'] as const) {
  for (const x of [f, { ...f, start_at: '2026-10-05', end_at: '2026-10-07', is_all_day: 1 }, { ...f, start_at: '2026-10-05', end_at: '2026-10-05', is_all_day: 1, repeat_rule: null }]) {
    const t = spanToDevice(x, pf, 'Asia/Seoul')
    assert.deepEqual(spanFromDevice({ startDate: t.startDate.toISOString(), endDate: t.endDate.toISOString(), allDay: t.allDay }, pf), { start_at: x.start_at, end_at: x.end_at, is_all_day: x.is_all_day }, `${pf} ${x.start_at}`)
  }
}
assert.equal(spanToDevice({ start_at: '2026-10-05', end_at: '2026-10-05', is_all_day: 1 }, 'android', 'Asia/Seoul').timeZone, 'UTC')
// 만들기 입력 → 읽기가 같은 지문
const inp = deviceInput(f, 'ios', 'Asia/Seoul')
assert.equal(inp.ruleLost, false)
const back = fieldsFromDevice({ id: '1', calendarId: 'c', ...(inp.input as object), startDate: (inp.input.startDate as Date).toISOString(), endDate: (inp.input.endDate as Date).toISOString() } as never, 'ios')
assert.equal(fingerprint(back!), fingerprint(f))
assert.equal(deviceInput({ ...f, repeat_rule: 'RDATE=20261005' }, 'ios', 'Asia/Seoul').ruleLost, true)

// 판정
assert.equal(judgeDevice({ allowsModifications: true }).writable, true)
assert.equal(judgeDevice({ allowsModifications: false }).reason, '이 캘린더는 보기만 할 수 있어요')
assert.equal(judgeDevice({ allowsModifications: true, type: 'subscribed' }).writable, false)
assert.equal(judgeDevice({ allowsModifications: true }, { organizer: { isCurrentUser: false } }).reason, '주최자가 아니라 옮기거나 고칠 수 없어요')
assert.equal(judgeDevice(undefined).writable, false)

// 반복 범위: Android 고치기 = 모든 회차만
assert.deepEqual(spanChoices('ios', 'edit'), ['this', 'future', 'all'])
assert.deepEqual(spanChoices('android', 'edit'), ['all'])
assert.deepEqual(spanChoices('android', 'delete'), ['this', 'all'])

// 같은 모양 열쇠
assert.equal(lookKey(' 회의 ', '2026-10-05T14:00', '2026-10-05T15:00'), lookKey('회의', '2026-10-05T14:00', '2026-10-05T15:00'))

// 다리 판단(§6.3)
const base = { ext_id: 'E1', ext_hash: 'H', deleted_at: null, modified_at: '2026-10-05T05:00:00.000Z' }
assert.deepEqual(decide({ ...base, ext_id: null }, 'H2', null, null), { kind: 'create' })
assert.deepEqual(decide({ ...base, ext_id: null, deleted_at: 'x' }, 'x:H2', null, null), { kind: 'record' })
assert.deepEqual(decide({ ...base, ext_id: null, deleted_at: 'x', ext_hash: 'x:H2' }, 'x:H2', null, null), { kind: 'none' })
assert.deepEqual(decide(base, 'H', 'H', null), { kind: 'none' })
assert.deepEqual(decide(base, 'H2', 'H', null), { kind: 'update' })
assert.deepEqual(decide({ ...base, deleted_at: '2026-10-05T06:00:00.000Z' }, 'x:H', 'H', null), { kind: 'delete' })
assert.deepEqual(decide(base, 'H', 'H3', null), { kind: 'pull' })
assert.deepEqual(decide(base, 'H', null, null), { kind: 'remoteDeleted' })
assert.deepEqual(decide(base, 'H2', null, null), { kind: 'create' }) // 휴대폰에서 지웠는데 꿈틀에서 고침 → 살린다
assert.deepEqual(decide({ ...base, ext_hash: 'x:H' }, 'H', null, null), { kind: 'create' }) // 지운 것을 되돌림
assert.deepEqual(decide({ ...base, ext_hash: 'x:H' }, 'H', 'H', null), { kind: 'update' })
assert.deepEqual(decide(base, 'H2', 'H3', '2026-10-05T04:00:00.000Z'), { kind: 'conflict', winner: 'mine' })
assert.deepEqual(decide(base, 'H2', 'H3', '2026-10-05T06:00:00.000Z'), { kind: 'conflict', winner: 'theirs' })
assert.deepEqual(decide(base, 'H2', 'H3', null), { kind: 'conflict', winner: 'mine' }) // Android: 꿈틀 쪽
assert.deepEqual(decide(base, 'H2', 'H2', null), { kind: 'record' })

// 0시에 끝나는 시각 일정 = 전날 23:59
assert.deepEqual(spanFromDevice({ startDate: new Date(2026, 9, 5, 23, 0), endDate: new Date(2026, 9, 6, 0, 0), allDay: false }, 'ios'), { start_at: '2026-10-05T23:00', end_at: '2026-10-05T23:59', is_all_day: 0 })

console.log('calendars/link ok')
