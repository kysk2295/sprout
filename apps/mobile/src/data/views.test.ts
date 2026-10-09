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
assert.deepEqual(groups.map((g) => g.id), ['pinned', 'today', 'overdue', 'done'], '만료됨은 맨 아래(완료 바로 위)')
assert.equal(groups[2].postpone, true)
assert.deepEqual(groups[1].rows.map((r) => r.task.id), [early.id, timed.id, allday.id], '시각 있는 것 시각순 → 종일')
assert.deepEqual(groups[1].rows[2].children.map((c) => c.task.id), [child.id], '하위 할 일은 부모 아래')
assert.equal(groups[1].count, 4)
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

// ── 2026-10-05 모바일 전체 기능: 묶기·정렬·보기 범위 ──
import { defaultSettings, newTaskDefaults, openSql, settingsOf, smartVisible, readVisibility, splitView, viewTitle, doneSql } from './views.ts'
const p1 = t({ priority: 1, title: '나' })
const p3 = t({ priority: 3, title: '가', tag_ids: 'g2' })
const p0 = t({ priority: 0, title: '다', tag_ids: 'g1,g2' })
const tags = [{ id: 'g1', name: '운동' }, { id: 'g2', name: '공부' }]
// 우선순위 묶기
const pg = buildGroups('smart:all', [p1, p3, p0], [], { today, settings: { group_by: 'priority', sort_by: 'date' } })
assert.deepEqual(pg.map((g) => g.title), ['높은 우선순위', '낮은 우선순위', '우선순위 없음'])
// 태그 묶기: 태그 순서상 첫 태그, 태그 없음
const tg = buildGroups('smart:all', [p1, p3, p0], [], { today, tags, settings: { group_by: 'tag', sort_by: 'title' } })
assert.deepEqual(tg.map((g) => [g.id, g.count]), [['tg:g1', 1], ['tg:g2', 1], ['tg:none', 1]])
// 묶기 없음 + 제목 정렬
const ng = buildGroups('smart:all', [p1, p3, p0], [], { today, settings: { group_by: 'none', sort_by: 'title' } })
assert.deepEqual(ng[0].rows.map((r) => r.task.title), ['가', '나', '다'])
// 목록 묶기(폴더 기본)
const lists = [{ id: 'l1', name: '업무', emoji: null, color: null, kind: 'normal', folder_id: 'f', sort_order: 1 }, { id: 'l2', name: '개인', emoji: null, color: null, kind: 'normal', folder_id: 'f', sort_order: 2 }]
const fg = buildGroups('folder:f', [t({ list_id: 'l2' }), t({})], [], { today, lists })
assert.deepEqual(fg.map((g) => g.title), ['업무', '개인'])
// 빈 섹션도 머리는 보인다
const es = buildGroups('list:l1', [t({})], [], { today, sections: [{ id: 'x', list_id: 'l1', name: '빈 섹션', sort_order: 0 }] })
assert.deepEqual(es.map((g) => [g.title, g.count]), [['', 1], ['빈 섹션', 0]])
// 설정: 기본값, 다른 보기 값은 무시
assert.deepEqual(defaultSettings('list:l1'), { group_by: 'custom', sort_by: 'custom' })
assert.deepEqual(defaultSettings('smart:today'), { group_by: 'time', sort_by: 'date' })
assert.deepEqual(settingsOf('smart:today', { group_by: 'custom', sort_by: 'priority' }), { group_by: 'time', sort_by: 'priority' })
// 계획 취소·완료: 완료 날짜별 묶음
const wd = buildGroups('smart:wontdo', [t({ status: 2, completed_at: '2026-10-04T03:00:00' })], [], { today })
assert.equal(wd[0].title, '오늘')
assert.match(openSql('smart:wontdo').sql, /t\.status = 2/)
assert.match(openSql('tag:g1').sql, /task_tags/)
assert.match(openSql('filter:f1').sql, /FROM filters f/)
assert.match(doneSql('smart:today').sql, /status IN \(1, 2\)/)
// 날짜 보기(캘린더 빈 칸 → 빠른 입력)
assert.deepEqual(splitView('date:2026-10-07T15:00'), ['date', '2026-10-07T15:00'])
assert.deepEqual(newTaskDefaults('date:2026-10-07T15:00', 'inbox', today), { list_id: 'inbox', due_at: '2026-10-07T15:00' })
assert.deepEqual(newTaskDefaults('tag:g1', 'inbox', today), { list_id: 'inbox', due_at: null, tag_id: 'g1' })
assert.equal(viewTitle('tag:g1', [], [], { tags }).title, '#운동')
assert.equal(viewTitle('smart:wontdo', [], []).title, '계획 취소')
// 스마트 목록 표시
const vis = readVisibility('{"all":"hide","trash":"auto","x":"nope"}')
assert.deepEqual(vis, { all: 'hide', trash: 'auto' })
assert.equal(smartVisible('all', vis), false)
assert.equal(smartVisible('trash', vis, 0), false)
assert.equal(smartVisible('trash', vis, 2), true)
assert.equal(smartVisible('inbox', { inbox: 'hide' }), true)
// 33 §11: 태그 페이지 = 리스트별 묶음, 제목 = 종류 아이콘 + 이름(주제는 #), 태그 범위·행 태그는 accepted만
assert.deepEqual(defaultSettings('tag:t1'), { group_by: 'list', sort_by: 'date' })
assert.deepEqual(viewTitle('tag:t1', [], [], { tags: [{ id: 't1', name: '교수님', kind: 'person' }] }), { title: '교수님', emoji: '👤' })
assert.deepEqual(viewTitle('tag:t1', [], [], { tags: [{ id: 't1', name: 'SQLD', kind: 'topic' }] }), { title: '#SQLD' })
assert.ok(openSql('tag:t1').sql.includes("COALESCE(tt.state,'accepted') = 'accepted'"))
assert.ok(openSql('smart:all').sql.includes("COALESCE(x.state,'accepted') = 'accepted'"))
// 30 §A.5: 폴더·리스트 이름 앞 이모지는 아이콘 자리로(폴더 그림 + 🎓Study 겹침 없음)
{
  const { splitLead, listShow } = await import('./emojiLead.ts')
  const { viewTitle } = await import('./views.ts')
  assert.deepEqual(splitLead('🎓Study'), { emoji: '🎓', name: 'Study' })
  assert.deepEqual(splitLead('회사'), { emoji: null, name: '회사' })
  assert.deepEqual(splitLead('🎓'), { emoji: null, name: '🎓' })
  assert.deepEqual(listShow({ name: '💰가계부', emoji: null }), { emoji: '💰', name: '가계부' })
  assert.deepEqual(listShow({ name: '생활', emoji: '🏠' }), { emoji: '🏠', name: '생활' })
  assert.deepEqual(viewTitle('folder:f', [], [{ id: 'f', name: '🎓Study', sort_order: 1 }] as never), { title: 'Study', emoji: '🎓' })
  // 태그도 같은 규칙(아이콘 하나): `🚀🎓 졸업 프로젝트` → 🎓 + 졸업 프로젝트
  const { tagShow, tagText } = await import('./emojiLead.ts')
  assert.deepEqual(tagShow({ name: '🚀🎓 졸업 프로젝트', kind: 'project' }), { emoji: '🎓', name: '졸업 프로젝트' })
  assert.deepEqual(tagShow({ name: 'UniPort', kind: 'project' }), { emoji: '🚀', name: 'UniPort' })
  assert.deepEqual(tagShow({ name: 'SQLD', kind: 'topic' }), { emoji: null, name: 'SQLD' })
  assert.equal(tagText({ name: '🚀🎓 졸업 프로젝트' }), '🎓 졸업 프로젝트')
  assert.deepEqual(viewTitle('tag:t1', [], [], { tags: [{ id: 't1', name: '🚀🎓 졸업 프로젝트', kind: 'project' }] }), { title: '졸업 프로젝트', emoji: '🎓' })
  assert.deepEqual(viewTitle('tag:t1', [], [], { tags: [{ id: 't1', name: '🎓 졸업', kind: 'topic' }] }), { title: '졸업', emoji: '🎓' })
}
console.log('views+ ok')
