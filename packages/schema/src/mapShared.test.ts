// 29 §9 · 31 §12 — 데스크톱·모바일 공용으로 옮긴 작업 지도 계산(낱말 검사·점검 주·단계 만들기·계획 보기)
import assert from 'node:assert/strict'
import { keywordPick, keywords } from './keywords.ts'
import { reviewTarget, reviewWindowWeek, weekStartMon } from './review.ts'
import { breakdownRows, manualSteps, planUndoPick } from './breakdown.ts'
import { buildPlanView, projectEnded } from './planView.ts'
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

// 끝난 프로젝트(31 §12.10.4 빠른 추가 알약에서 뺌): 다 끝남 · 마감 지남 · 남은 일이 모두 지난 날짜 · 집 리스트 보관
const P0 = view.projects[0]
const m = (id: string, status: number, due_at: string | null) => ({ ...P0.members[0], id, status, due_at })
assert.equal(projectEnded(P0, today), false, '앞으로 할 일이 있으면 진행 중')
assert.equal(P0.archived, false)
assert.equal(projectEnded({ ...P0, members: [m('a', 1, '2026-10-07')], open: 0, deadline: null }, today), true, '다 끝남')
assert.equal(projectEnded(P0, '2026-10-11'), false, '마감 지난 지 7일 안 — 아직 끝남 아님')
assert.equal(projectEnded(P0, '2026-10-18'), true, '마감 지나고 7일 넘음 + 앞으로 할 일 없음')
assert.equal(projectEnded({ ...P0, members: [m('a', 0, '2026-09-20')], open: 1, deadline: null }, today), true, '남은 일이 모두 지난 날짜')
assert.equal(projectEnded({ ...P0, members: [m('a', 0, '2026-09-20'), m('b', 0, null)], open: 2, deadline: null }, today), false, '날짜 없는 열린 일이 있으면 진행 중')
assert.equal(projectEnded({ ...P0, archived: true }, today), true, '집 리스트 보관')
// 2026-10-06 고침: 오늘 목록에서 넣은 '발표 자료 정리'(오늘 마감)가 프로젝트 마감이 되어 다음 날 끝남이 되던 것
{
  const v = buildPlanView({
    tasks: [
      { id: 'k1', title: 'K 데이터 공모전 신청', list_id: 'L', parent_id: null, status: 1, priority: 0, due_at: '2026-10-01', start_at: null, completed_at: '2026-10-01T09:00:00Z', created_at: '2026-09-28' },
      { id: 'k2', title: '발표 자료 정리', list_id: 'L', parent_id: null, status: 0, priority: 0, due_at: today, start_at: null, completed_at: null, created_at: today },
      { id: 'k3', title: '2차 회의', list_id: 'L', parent_id: null, status: 0, priority: 0, due_at: null, start_at: null, completed_at: null, created_at: today }
    ],
    tags: [{ id: 'K', name: 'K 데이터 공모전', kind: 'project', aliases: null, source: 'user', home_type: null, home_id: null, topic_id: null }],
    links: ['k1', 'k2', 'k3'].map((t) => ({ id: `y${t}`, task_id: t, tag_id: 'K', source: 'user', state: 'accepted' })),
    lists: [{ id: 'L', name: '학교', emoji: null, folder_id: null, kind: 'list' }], folders: [], seq: [],
    pstore: { dismissed: [], confirmed: {} }, today, suggest: false, focus: 'K'
  })
  const K = v.projects[0]
  assert.equal(K.deadline, null, "'발표 자료 정리'는 마감이 아니다")
  assert.equal(K.focus, true)
  assert.equal(projectEnded(K, '2026-10-07'), false, '다음 날에도 진행 중(날짜 없는 열린 일)')
  const noUndated = { ...K, members: K.members.filter((x) => x.id !== 'k3') }
  assert.equal(projectEnded(noUndated, '2026-10-07'), false, '남은 일이 하루 지났을 뿐 — 7일 안')
  const withDl = { ...K, deadline: { day: '2026-10-05', word: '제출', taskId: 'x' } }
  assert.equal(projectEnded(withDl, '2026-10-20'), false, '마감이 지나도 날짜 없는 열린 일이 있으면 진행 중')
  const future = { ...noUndated, members: [...noUndated.members, { ...K.members[0], id: 'k4', title: '결과 확인', status: 0, due_at: '2026-10-25', completed_at: null }], deadline: { day: '2026-10-05', word: '제출', taskId: 'x' } }
  assert.equal(projectEnded(future, '2026-10-20'), false, '마감이 지나도 오늘 이후 열린 일이 있으면 진행 중')
}
const homed = buildPlanView({ tasks: [], tags: [{ id: 'Q', name: '창업 공모전', kind: 'project', aliases: null, source: 'user', home_type: 'list', home_id: 'gone', topic_id: null }], links: [], lists: [], folders: [], seq: [], pstore: { dismissed: [], confirmed: {} }, today, suggest: false })
assert.equal(homed.projects[0].archived, true, '집 리스트가 보관 리스트(질의에 없음)')

// 대화 상태 기계(공용): ① 제목 + 날짜 한 번에 → createGoal 효과
const st = planReduce(planReduce(initPlan('새싹', today), { type: 'start' }).state, { type: 'answer', text: '사업계획서 다음 주 금요일까지' })
assert.deepEqual(st.effects, [{ kind: 'createGoal', title: '사업계획서', due: '2026-10-16' }])
console.log('map shared ok')
import './projectDirect.test.ts'
