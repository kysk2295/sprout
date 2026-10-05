// 로컬 알림 예약 계획 시험(20 §4.4: 48시간 창 · 최대 50개 · 본문 · 차이 계산)
import assert from 'node:assert/strict'
import { bodyOf, diffSchedule, HORIZON_MS, ACTION_DONE, ACTION_SNOOZE, LEGACY_SNOOZE_ACTIONS, MAX_ACTIONS, MAX_SCHEDULED, overdueIds, planReminders, reminderId, snoozeAt, snoozeAtOf, snoozeMinutesOf, staleSnoozes, type ReminderRow } from './plan.ts'

const now = new Date('2026-10-04T14:00').getTime()
let n = 0
const row = (p: Partial<ReminderRow>): ReminderRow => ({ rid: `r${++n}`, trigger: '-PT0M', tid: `t${n}`, title: `할 일 ${n}`, start_at: null, due_at: null, list_name: '업무', list_kind: 'normal', ...p })

// 창 안·밖
const soon = row({ due_at: '2026-10-04T15:00' })
const past = row({ due_at: '2026-10-04T13:00' })
const edge = row({ due_at: '2026-10-06T14:00' }) // 정확히 48시간 뒤 = 포함
const far = row({ due_at: '2026-10-06T14:05' }) // 48시간 넘음
const allDay = row({ due_at: '2026-10-05', trigger: 'PT9H', list_kind: 'inbox', list_name: 'Inbox' }) // 내일 09:00
const before = row({ due_at: '2026-10-05T10:00', trigger: '-PT30M' })
const noDate = row({ due_at: null })
const plan = planReminders([far, edge, soon, past, allDay, before, noDate], now)
assert.deepEqual(plan.map((p) => p.taskId), [soon.tid, allDay.tid, before.tid, edge.tid], '창 안, 가까운 순')
assert.equal(plan[0].at, new Date('2026-10-04T15:00').getTime())
assert.equal(plan[0].id, reminderId(soon.rid, plan[0].at))
assert.equal(plan[1].at, new Date('2026-10-05T09:00').getTime(), '종일 알림은 당일 09:00')
assert.equal(plan[2].at, new Date('2026-10-05T09:30').getTime(), '30분 전')

// 본문: 울리는 날 기준 오늘/내일, 기본함 이름
assert.equal(plan[0].body, '오늘 오후 3:00 · 업무')
assert.equal(plan[1].body, '오늘 · 기본함', '종일 할 일은 울리는 날(당일 09:00) 기준 오늘')
assert.equal(bodyOf({ start_at: null, due_at: '2026-10-05T10:00', list_name: '업무', list_kind: 'normal' }, new Date('2026-10-04T10:00').getTime()), '내일 오전 10:00 · 업무')
assert.equal(bodyOf({ start_at: '2026-10-12T09:00', due_at: '2026-10-12T10:00', list_name: null, list_kind: null }, new Date('2026-10-10T10:00').getTime()), '10월 12일 오전 9:00')

// 최대 50개
const many = Array.from({ length: 80 }, (_, i) => row({ due_at: `2026-10-05T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}` }))
const capped = planReminders(many, now)
assert.equal(capped.length, MAX_SCHEDULED)
assert.ok(capped.every((p, i) => i === 0 || capped[i - 1].at <= p.at), '가까운 것부터')
assert.equal(planReminders(many, now, { max: 3 }).length, 3)
assert.equal(HORIZON_MS, 48 * 3600_000)

// 한 할 일의 두 알림이 같은 순간이면 하나
const dupT = row({ due_at: '2026-10-04T16:00' })
assert.equal(planReminders([dupT, { ...dupT, rid: 'other', trigger: '-PT0M' }], now).length, 1)
// 기간 할 일 "끝날 때"
const span = row({ start_at: '2026-10-04T16:00', due_at: '2026-10-04T17:00', trigger: 'END-PT0M' })
assert.equal(planReminders([span], now)[0].at, new Date('2026-10-04T17:00').getTime())
// 제목 없음
assert.equal(planReminders([row({ due_at: '2026-10-04T15:00', title: '  ' })], now)[0].title, '제목 없음')

// 차이 계산: 같은 것은 그대로, 바뀐 제목은 다시, 사라진 것은 취소, 다시 알림(s:)은 건드리지 않음
const pending = [
  { id: plan[0].id, title: plan[0].title, body: plan[0].body },
  { id: plan[1].id, title: '옛 제목', body: plan[1].body },
  { id: 'r:gone@1', title: 'x', body: 'y' },
  { id: 's:t9@1', title: 'snooze', body: '' }
]
const diff = diffSchedule(pending, plan)
assert.deepEqual(diff.cancel.sort(), [plan[1].id, 'r:gone@1'].sort())
assert.deepEqual(diff.add.map((p) => p.id), [plan[1].id, plan[2].id, plan[3].id])

// 시각이 막 지났는데 아직 안 울린 예약(정확하지 않은 알람)은 지우지 않는다 — 완료·삭제된 것은 지운다
const late = row({ due_at: '2026-10-04T13:50' }) // now 14:00 → 10분 지남
const lateId = reminderId(late.rid, new Date('2026-10-04T13:50').getTime())
const old = row({ due_at: '2026-10-04T12:30' }) // 1시간 넘게 지남
const keep = overdueIds([late, old, soon], now)
assert.deepEqual([...keep], [lateId])
assert.deepEqual(diffSchedule([{ id: lateId, title: late.title, body: '' }], [], keep).cancel, [], '늦은 예약은 그대로')
assert.deepEqual(diffSchedule([{ id: lateId, title: late.title, body: '' }], [], overdueIds([], now)).cancel, [lateId], '할 일이 끝났으면 지움')

// 다시 알림
assert.equal(snoozeAt(10, now), now + 600_000)
assert.deepEqual(staleSnoozes([{ id: 's:a@1', taskId: 'a' }, { id: 's:b@1', taskId: 'b' }, { id: 'r:x@1', taskId: 'x' }], new Set(['a'])), ['s:b@1'])

// 32 §17.6: 정확한 알람 허용이 바뀌면 이미 예약된 것도 모두 다시 넣는다(막 지난 것은 그대로)
{
  const a = { id: 'r:a@100', taskId: 'a', at: now + 100, title: 'A', body: 'b' }
  const b = { id: 'r:b@200', taskId: 'b', at: now + 200, title: 'B', body: 'b' }
  const pending = [{ id: a.id, title: 'A', body: 'b' }, { id: b.id, title: 'B', body: 'b' }, { id: 'r:late@1', title: 'L', body: 'b' }, { id: 's:a@300', title: 'A', body: 'b' }]
  assert.deepEqual(diffSchedule(pending, [a, b], new Set(['r:late@1'])), { cancel: [], add: [] }, '평소엔 그대로')
  const forced = diffSchedule(pending, [a, b], new Set(['r:late@1']), true)
  assert.deepEqual(forced.cancel, [a.id, b.id])
  assert.deepEqual(forced.add.map((p) => p.id), [a.id, b.id])
}
assert.equal(snoozeAtOf('s:task-1@1760000000000'), 1760000000000)
assert.equal(snoozeAtOf('r:x@1'), null)
assert.equal(snoozeAtOf('s:bad'), null)

// 알림 버튼: 틱틱처럼 완료 · 다시 알림 둘(≤ Android 한도 3). 다시 알림은 설정 분, 예전 버튼(10분·1시간·내일) 응답도 처리
assert.ok([ACTION_DONE, ACTION_SNOOZE].length <= MAX_ACTIONS)
assert.equal(snoozeMinutesOf('snooze', 15), 15)
assert.equal(snoozeMinutesOf('snooze', 60), 60)
assert.equal(snoozeMinutesOf('snooze-10', 15), 10)
assert.equal(snoozeMinutesOf('snooze-60', 15), 60)
assert.equal(snoozeMinutesOf('snooze-tomorrow', 15), 24 * 60)
assert.equal(snoozeMinutesOf('done', 15), null)
assert.deepEqual(LEGACY_SNOOZE_ACTIONS.map((a) => a.id), ['snooze-10', 'snooze-60', 'snooze-tomorrow'])

console.log('plan.test ok')

// ── 일정 알림(20 §7.1) ──
{
  const { planEventReminders, mergePlans, isEventReminderId, eventSnoozeId } = await import('./plan.ts')
  const evs = [
    { id: 'e1', title: '피부과', start_at: '2026-10-04T15:00', end_at: '2026-10-04T16:00', repeat_rule: null, reminders: '["-PT0M","-PT15M"]', location: '강남' },
    { id: 'e2', title: '회의', start_at: '2026-09-28T10:00', end_at: '2026-09-28T11:00', repeat_rule: 'FREQ=WEEKLY', reminders: '["-PT0M"]', location: null },
    { id: 'e3', title: '알림 없음', start_at: '2026-10-04T16:00', end_at: '2026-10-04T17:00', repeat_rule: null, reminders: null, location: null },
    { id: 'e4', title: '지난 일', start_at: '2026-10-04T09:00', end_at: '2026-10-04T10:00', repeat_rule: null, reminders: '["-PT0M"]', location: null }
  ]
  const ep = planEventReminders(evs, now)
  assert.deepEqual(ep.map((x) => [x.eventId, new Date(x.at).getHours(), new Date(x.at).getMinutes()]), [['e1', 15, 0], ['e1', 14, 45], ['e2', 10, 0]], '반복 일정은 다음 회차(10/5 월 10:00), 알림 없음·지난 일정은 빠짐')
  assert.equal(ep[0].body, '오늘 오후 3:00 · 📍 강남')
  assert.ok(isEventReminderId(ep[0].id) && !ep[0].id.startsWith('r:'), '서버 보고(r:)에 섞이지 않음')
  // 반복 일정: 지난 회차의 다음 회차(10/5 10:00)
  const rep = planEventReminders([evs[1]], new Date('2026-10-04T20:00').getTime())
  assert.equal(rep.length, 1)
  assert.equal(rep[0].at, new Date('2026-10-05T10:00').getTime())
  assert.equal(rep[0].body, '오늘 오전 10:00 · 내 일정', '울리는 날 기준(할 일 알림과 같음)')
  // 합치기: 시각순, 최대 개수
  const merged = mergePlans(plan, ep, 3)
  assert.equal(merged.length, 3)
  assert.ok(merged.every((x, i) => i === 0 || merged[i - 1].at <= x.at))
  // 차이 계산은 e: 예약도 본다
  const d = diffSchedule([{ id: 'e:old:-PT0M@1', title: 'x', body: 'y' }], ep)
  assert.deepEqual(d.cancel, ['e:old:-PT0M@1'])
  assert.equal(d.add.length, 3)
  assert.ok(eventSnoozeId('e1', 5).startsWith('se:'))
}
console.log('plan(일정) ok')
