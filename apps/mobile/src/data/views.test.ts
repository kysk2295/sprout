// 보기 묶음·날짜 표기 시험(21 §2·§3, 02 §6)
import assert from 'node:assert/strict'
import { buildGroups, bySmartDate, type TaskRow } from './views.ts'
import { detailDateLabel, nextMonday, rowDateLabel, withRo } from '../lib/dates.ts'

const today = '2026-10-04'
let n = 0
const t = (p: Partial<TaskRow>): TaskRow => ({
  id: `t${++n}`, list_id: 'l1', parent_id: null, section_id: null, title: `할 일 ${n}`, content: null, content_mode: 'text', status: 0, priority: 0,
  start_at: null, due_at: null, is_all_day: 1, sort_order: n, repeat_rule: null, pinned_at: null, created_at: null, completed_at: null, deleted_at: null,
  list_name: '업무', list_emoji: null, list_color: null, list_kind: 'normal', check_total: 0, check_done: 0, reminder_count: 0, ...p
})

// 오늘: 고정 → 만료됨 → 오늘 → 완료
const over = t({ due_at: '2026-10-03', priority: 2 })
const timed = t({ due_at: '2026-10-04T15:00', is_all_day: 0 })
const early = t({ due_at: '2026-10-04T07:30', is_all_day: 0 })
const allday = t({ due_at: '2026-10-04', priority: 3 })
const pin = t({ due_at: '2026-10-04', pinned_at: '2026-10-04T00:00:00Z' })
const child = t({ parent_id: allday.id })
const done = t({ due_at: '2026-10-04', status: 1, completed_at: '2026-10-04T01:00:00Z' })
const groups = buildGroups('smart:today', [over, timed, early, allday, pin, child], [done], { today })
assert.deepEqual(groups.map((g) => g.id), ['pinned', 'overdue', 'today', 'done'])
assert.equal(groups[1].postpone, true)
assert.deepEqual(groups[2].rows.map((r) => r.task.id), [early.id, timed.id, allday.id], '시각 있는 것 시각순 → 종일')
assert.deepEqual(groups[2].rows[2].children.map((c) => c.task.id), [child.id], '하위 할 일은 부모 아래')
assert.equal(groups[2].count, 4)
assert.equal(groups[3].collapsedByDefault, true)
assert.ok(bySmartDate(over, timed) < 0)

// 리스트: 섹션 카드, 미분류는 머리 없이 맨 앞
const s1 = { id: 'sec1', list_id: 'l1', name: '이번 주', sort_order: 1 }
const a = t({ section_id: 'sec1' })
const b = t({})
const lg = buildGroups('list:l1', [a, b], [], { today, sections: [s1] })
assert.deepEqual(lg.map((g) => [g.id, g.title]), [['s:none', ''], ['s:sec1', '이번 주']])

// 날짜 표기(02 §6)
assert.equal(rowDateLabel({ due_at: '2026-10-03' }, today)!.label, '어제')
assert.equal(rowDateLabel({ due_at: '2026-10-02' }, today)!.label, '10월 2일')
assert.equal(rowDateLabel({ due_at: '2026-10-02' }, today)!.tone, 'overdue')
assert.equal(rowDateLabel({ due_at: '2026-10-04T15:00' }, today)!.label, '오후 3:00')
assert.equal(rowDateLabel({ due_at: '2026-10-04' }, today, { hideToday: true }), null)
assert.equal(rowDateLabel({ due_at: '2026-10-05' }, today)!.label, '내일')
assert.equal(detailDateLabel({ due_at: '2026-10-04T15:00' }, today).label, '오늘, 오후 3:00')
assert.equal(detailDateLabel({ due_at: null }, today).label, '날짜와 알림')
assert.equal(nextMonday(today), '2026-10-05')
assert.equal(withRo('업무'), '업무로')
assert.equal(withRo('기본함'), '기본함으로')
console.log('views ok')
