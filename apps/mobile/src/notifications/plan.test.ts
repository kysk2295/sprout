// 로컬 알림 예약 계획 시험(20 §4.4: 48시간 창 · 최대 50개 · 본문 · 차이 계산)
import assert from 'node:assert/strict'
import { bodyOf, diffSchedule, HORIZON_MS, MAX_SCHEDULED, planReminders, reminderId, snoozeAt, staleSnoozes, type ReminderRow } from './plan.ts'

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

// 다시 알림
assert.equal(snoozeAt(10, now), now + 600_000)
assert.deepEqual(staleSnoozes([{ id: 's:a@1', taskId: 'a' }, { id: 's:b@1', taskId: 'b' }, { id: 'r:x@1', taskId: 'x' }], new Set(['a'])), ['s:b@1'])

console.log('plan.test ok')
