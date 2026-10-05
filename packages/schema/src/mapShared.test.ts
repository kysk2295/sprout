// 29 §9 · 31 §12 — 데스크톱·모바일 공용으로 옮긴 작업 지도 계산(낱말 검사·점검 주·단계 만들기·계획 보기)
import assert from 'node:assert/strict'
import { keywordPick, keywords } from './keywords.ts'
import { reviewTarget, reviewWindowWeek, weekStartMon } from './review.ts'
import { breakdownRows, manualSteps, planUndoPick } from './breakdown.ts'
import { buildPlanView } from './planView.ts'
import { planReduce, initPlan } from './planChat.ts'

// 낱말 검사: 한 리스트 최근 3개와 겹치면 그 리스트, 다른 리스트 이름이 제목에 있으면 없음
const lists = [{ id: 'a', name: '📚 수업·과제' }, { id: 'b', name: '운동' }]
const recent = { a: ['데이터베이스 과제 1', '데이터베이스 퀴즈', '데이터베이스 기말'], b: ['헬스 등록', '러닝'] }
assert.equal(keywordPick('데이터베이스 과제 2 제출', lists, recent), 'a')
assert.equal(keywordPick('운동 데이터베이스', lists, recent), null)
assert.equal(keywordPick('장보기', lists, recent), null)
assert.ok(keywords('교수님께 메일 보내기').includes('교수님께') || keywords('교수님께 메일 보내기').length > 0)

// 점검 주: 월요일 시작, 일요일 21시 = 그 주, 월요일 9시 = 지난주, 수요일 = 이번 주
assert.equal(weekStartMon('2026-10-07'), '2026-10-05')
assert.equal(weekStartMon('2026-10-04'), '2026-09-28')
assert.equal(reviewWindowWeek(new Date(2026, 9, 4, 21)), '2026-09-28')
assert.equal(reviewWindowWeek(new Date(2026, 9, 5, 9)), '2026-09-28')
assert.equal(reviewWindowWeek(new Date(2026, 9, 7, 9)), null)
assert.deepEqual(reviewTarget(new Date(2026, 9, 7, 9)), { week: '2026-10-05', planWeek: '2026-10-12' })

// 단계 만들기: 직접 적은 순서 사슬 → 하위 3개 + 선 2개
let n = 0
const rows = breakdownRows({ id: 'g', list_id: 'L' }, manualSteps(['자료 조사', '목차', '초안']), { sortBase: 0, at: 'T', newId: () => `id${++n}`, source: 'user' })
assert.equal(rows.tasks.length, 3)
assert.equal(rows.links.length, 2)
assert.equal(rows.tasks[0].parent_id, 'g')
assert.equal(rows.links[0].source, 'user')
// 되돌리기: 손댄 것(modified_at 다름)은 남기고, 남는 하위가 있는 부모는 지우지 않는다
const pick = planUndoPick({ tasks: ['g', 'id1', 'id2'], stamps: { g: 'T', id1: 'T', id2: 'T' } },
  [{ id: 'g', modified_at: 'T', deleted_at: null }, { id: 'id1', modified_at: 'T2', deleted_at: null }, { id: 'id2', modified_at: 'T', deleted_at: null }],
  [{ id: 'id1', parent_id: 'g' }, { id: 'id2', parent_id: 'g' }])
assert.deepEqual(pick, { remove: ['id2'], kept: 2 })

// 계획 보기: 동기화로 받은 프로젝트 태그만 보여 준다(suggest=false면 제안 카드 계산 안 함)
const today = '2026-10-05'
const view = buildPlanView({
  tasks: [
    { id: 't1', title: '공모전 데이터 분석', list_id: 'L', parent_id: null, status: 0, priority: 0, due_at: '2026-10-07', start_at: null, completed_at: null, created_at: '2026-10-01' },
    { id: 't2', title: '공모전 제출', list_id: 'L', parent_id: null, status: 0, priority: 0, due_at: '2026-10-10', start_at: null, completed_at: null, created_at: '2026-10-01' },
    { id: 't3', title: '오늘 장보기', list_id: 'L', parent_id: null, status: 0, priority: 0, due_at: today, start_at: null, completed_at: null, created_at: '2026-10-01' }
  ],
  tags: [{ id: 'P', name: '데이터 공모전', kind: 'project', aliases: '["공모전"]', source: 'ai', home_type: null, home_id: null, topic_id: null }],
  links: [{ id: 'x1', task_id: 't1', tag_id: 'P', source: 'rule', state: 'accepted' }, { id: 'x2', task_id: 't2', tag_id: 'P', source: 'rule', state: 'accepted' }],
  lists: [{ id: 'L', name: '학교', emoji: null, folder_id: null, kind: 'list' }], folders: [], seq: [],
  pstore: { dismissed: [], confirmed: {} }, today, suggest: false
})
assert.equal(view.projects.length, 1)
assert.equal(view.projects[0].emoji, '🏆')
assert.equal(view.projects[0].deadline?.day, '2026-10-10')
assert.equal(view.projects[0].kinds.find(([k]) => k === 'research')?.[1], 1)
assert.equal(view.suggestion, null)
assert.deepEqual(view.today.map((x) => x.task.id), ['t3'])

// 대화 상태 기계(공용): ① 제목 + 날짜 한 번에 → createGoal 효과
const st = planReduce(planReduce(initPlan('새싹', today), { type: 'start' }).state, { type: 'answer', text: '사업계획서 다음 주 금요일까지' })
assert.deepEqual(st.effects, [{ kind: 'createGoal', title: '사업계획서', due: '2026-10-16' }])
console.log('map shared ok')
