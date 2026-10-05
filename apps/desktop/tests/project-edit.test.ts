// 31 §12.9 프로젝트 편집·관계도 — 순수 계산: 끌기 날짜·줄, 순서 선 검사, 퍼지 검색, 관계도 노드·선·방사형 자리, 잇기 계획.
import assert from 'node:assert/strict'
import { buildPlanView } from '@sprout/schema/planView'
import { allKinds, buildRelationGraph, connectPlan, dateDrag, dragDays, fuzzyScore, laneAt, orderCheck, overlapping, radialLayout, searchTasks } from '../src/renderer/src/lib/projectEdit'

// ── 끌기: 하루 칸 ──
assert.equal(dragDays(31, 30), 1)
assert.equal(dragDays(44, 30), 1)
assert.equal(dragDays(46, 30), 2)
assert.equal(dragDays(-16, 30), -1)
assert.equal(dragDays(10, 0), 0)

// ── 날짜 바꾸기 ──
assert.deepEqual(dateDrag({ id: 'a', start_at: null, due_at: '2026-10-07' }, { delta: 2 }), { id: 'a', start_at: null, due_at: '2026-10-09' })
assert.deepEqual(dateDrag({ id: 'a', start_at: null, due_at: '2026-10-07T14:30' }, { delta: -1 }), { id: 'a', start_at: null, due_at: '2026-10-06T14:30' }, '시각 유지')
assert.deepEqual(dateDrag({ id: 'a', start_at: '2026-10-07', due_at: '2026-10-09' }, { delta: 3 }), { id: 'a', start_at: '2026-10-10', due_at: '2026-10-12' }, '기간 유지')
assert.deepEqual(dateDrag({ id: 'a', start_at: '2026-10-07T09:00', due_at: null }, { delta: 1 }), { id: 'a', start_at: null, due_at: '2026-10-08T09:00' }, '시작만 → 한 점')
assert.equal(dateDrag({ id: 'a', start_at: null, due_at: '2026-10-07' }, { delta: 0 }), null, '안 움직임')
assert.deepEqual(dateDrag({ id: 'a', start_at: null, due_at: null }, { day: '2026-10-08' }), { id: 'a', start_at: null, due_at: '2026-10-08' }, '언젠가 → 줄 = 그날 종일')
assert.deepEqual(dateDrag({ id: 'a', start_at: null, due_at: '2026-10-07' }, { day: null }), { id: 'a', start_at: null, due_at: null }, '언젠가 칸 = 날짜 지움')
assert.equal(dateDrag({ id: 'a', start_at: null, due_at: null }, { day: null }), null)
assert.deepEqual(dateDrag({ id: 'a', start_at: null, due_at: '2026-10-07T10:00' }, { day: '2026-10-10' }), { id: 'a', start_at: null, due_at: '2026-10-10T10:00' })

// ── 놓을 줄 ──
const lanes = [{ kind: 'research' as const, top: 0, height: 44 }, { kind: 'admin' as const, top: 44, height: 76 }]
assert.equal(laneAt(10, lanes), 'research')
assert.equal(laneAt(50, lanes), 'admin')
assert.equal(laneAt(-30, lanes), 'research', '위 밖 = 첫 줄')
assert.equal(laneAt(400, lanes), 'admin', '아래 밖 = 끝 줄')
assert.equal(laneAt(10, []), null)
assert.deepEqual(allKinds(['admin', 'research']), ['admin', 'research', 'meeting', 'dev', 'other'])

// ── 순서 선 검사 ──
const L = [{ kind: 'sequence', from_id: 'a', to_id: 'b', state: 'accepted' }, { kind: 'sequence', from_id: 'b', to_id: 'c', state: 'accepted' }, { kind: 'sequence', from_id: 'c', to_id: 'x', state: 'dismissed' }]
assert.equal(orderCheck(L, 'a', 'a'), 'self')
assert.equal(orderCheck(L, 'a', 'b'), 'exists')
assert.equal(orderCheck(L, 'c', 'a'), 'cycle', 'a→b→c→a 고리')
assert.equal(orderCheck(L, 'a', 'c'), 'ok')
assert.equal(orderCheck(L, 'x', 'c'), 'ok', '무시한 제안은 세지 않음')

// ── 퍼지 검색 ──
assert.ok(fuzzyScore('공모전', 'K 인공지능 제조 데이터 공모전 신청') > 0)
assert.ok(fuzzyScore('신청 공모전', '공모전 신청') > 0, '낱말 순서 무관')
assert.ok(fuzzyScore('데이터분석', '데이터 분석 2차') > 0, '띄어쓰기 무시')
assert.ok(fuzzyScore('공전', '공모전') > 0, '흩어진 글자')
assert.equal(fuzzyScore('토익', '공모전 신청'), 0)
assert.ok(fuzzyScore('공모', '공모전') > fuzzyScore('공모', '데이터 공모전'), '앞에서 맞으면 먼저')
const found = searchTasks([
  { id: '1', title: '공모전 발표', status: 1 }, { id: '2', title: '공모전 제출', status: 0 }, { id: '3', title: '토익', status: 0 }, { id: '4', title: '공모전 회의', status: 0 }
], '공모전', new Set(['4']))
assert.deepEqual(found.map((t) => t.id), ['2', '1'], '열린 것 먼저, 넣은 것 제외')

// ── 관계도 ──
const tasks = [
  { id: 't1', title: '데이터 공모전 자료조사', list_id: 'la', status: 1, priority: 0, due_at: '2026-09-11', start_at: null, completed_at: '2026-09-11T10:00:00Z', created_at: '2026-09-01' },
  { id: 't2', title: '데이터 공모전 분석', list_id: 'la', status: 0, priority: 0, due_at: '2026-10-02', start_at: null, completed_at: null, created_at: '2026-09-01' },
  { id: 't3', title: '공모전 교수님 미팅', list_id: 'le', status: 0, priority: 0, due_at: '2026-10-07', start_at: null, completed_at: null, created_at: '2026-09-01' },
  { id: 't4', title: '공모전 최종 제출', list_id: 'le', status: 0, priority: 0, due_at: '2026-10-10', start_at: null, completed_at: null, created_at: '2026-09-01' },
  { id: 'q1', title: 'SQLD 기출', list_id: 'lq', status: 0, priority: 0, due_at: '2026-10-08', start_at: null, completed_at: null, created_at: '2026-09-01' }
]
const view = buildPlanView({
  tasks, today: '2026-10-05', pstore: { dismissed: [], confirmed: {} },
  tags: [
    { id: 'pc', name: '데이터 공모전', kind: 'project', aliases: null, source: 'ai', home_type: null, home_id: null, topic_id: null },
    { id: 'pq', name: 'SQLD', kind: 'project', aliases: null, source: 'user', home_type: null, home_id: null, topic_id: null },
    { id: 'u1', name: '교수님', kind: 'person', aliases: null, source: 'user', home_type: null, home_id: null, topic_id: null }
  ],
  links: [
    { id: 'k1', task_id: 't1', tag_id: 'pc', source: 'ai', state: 'accepted' }, { id: 'k2', task_id: 't2', tag_id: 'pc', source: 'rule', state: 'accepted' },
    { id: 'k3', task_id: 't3', tag_id: 'pc', source: 'user', state: 'accepted' }, { id: 'k4', task_id: 't4', tag_id: 'pc', source: 'ai', state: 'accepted' },
    { id: 'k5', task_id: 't3', tag_id: 'u1', source: 'user', state: 'accepted' }, { id: 'k6', task_id: 'q1', tag_id: 'pq', source: 'user', state: 'accepted' },
    { id: 'k7', task_id: 't2', tag_id: 'pq', source: 'user', state: 'accepted' }
  ],
  lists: [{ id: 'la', name: 'AI 공부', emoji: null, folder_id: null, kind: null }, { id: 'le', name: '교육·미팅', emoji: null, folder_id: null, kind: null }, { id: 'lq', name: '자격증', emoji: null, folder_id: null, kind: null }],
  folders: [], seq: [{ id: 's1', from_id: 't2', to_id: 't4', kind: 'sequence', state: 'accepted' }],
  kindOverrides: [{ task_id: 't3', kind: 'dev' }, { task_id: 't1', kind: 'nope' }]
})
const pc = view.projects.find((p) => p.tag.id === 'pc')!
assert.equal(pc.kindOf.get('t3'), 'dev', '사람이 정한 종류가 먼저')
assert.equal(pc.kindOf.get('t1'), 'research', '모르는 종류 값은 무시')
assert.deepEqual([...pc.kindSet], ['t3'])
assert.equal(pc.via.get('t3'), 'user')
assert.equal(pc.via.get('t2'), 'auto')
assert.equal(pc.autoCount, 3)
assert.ok(pc.mainList === 'la' || pc.mainList === 'le')
const others = overlapping(pc, view.projects)
assert.deepEqual(others, [{ id: 'pq', title: 'SQLD', emoji: view.projects.find((p) => p.tag.id === 'pq')!.emoji, shared: 1 }])
const g = buildRelationGraph({
  p: pc, others,
  personLinks: [{ task_id: 't3', tag_id: 'u1', name: '교수님' }, { task_id: 'q1', tag_id: 'u1', name: '교수님' }],
  projectPeople: [], related: [{ id: 'r1', from_id: 't1', to_id: 't3' }, { id: 'r2', from_id: 't1', to_id: 'q1' }],
  notes: [{ id: 'n1', title: '데이터 설명서', to_type: 'tag', to_id: 'pc' }, { id: 'n1', title: '데이터 설명서', to_type: 'task', to_id: 't2' }, { id: 'n2', title: '남의 메모', to_type: 'tag', to_id: 'pq' }]
})
const kinds = (k: string) => g.nodes.filter((n) => n.kind === k).map((n) => n.id)
assert.deepEqual(kinds('project'), ['p:pc'])
assert.equal(kinds('task').length, 4)
assert.deepEqual(kinds('person'), ['u:u1'])
assert.deepEqual(kinds('note'), ['n:n1'], '메모는 한 번만, 다른 프로젝트 메모는 뺌')
assert.deepEqual(kinds('other'), ['x:pq'])
assert.equal(g.nodes.find((n) => n.id === 'u:u1')!.sub, '할 일 1', '프로젝트 밖 할 일은 세지 않음')
assert.equal(g.nodes.find((n) => n.id === 't:t2')!.auto, true)
const ek = (k: string) => g.edges.filter((e) => e.kind === k)
assert.equal(ek('member').length, 4)
assert.deepEqual(ek('order').map((e) => [e.source, e.target]), [['t:t2', 't:t4']])
assert.deepEqual(ek('related').map((e) => e.id), ['r:r1'], '프로젝트 밖으로 가는 관련 선은 뺌')
assert.equal(ek('person').length, 1)
assert.equal(ek('note').length, 2)
// 방사형: 가운데 0,0 · 할 일은 같은 반지름 · 첫 할 일(가장 이른 날) 12시 · 결정적
const pos = radialLayout(g)
assert.deepEqual(pos.get('p:pc'), { x: 0, y: 0 })
const r = (id: string) => Math.hypot(pos.get(id)!.x, pos.get(id)!.y)
assert.ok(Math.abs(r('t:t1') - r('t:t4')) < 2)
assert.ok(pos.get('t:t1')!.x === 0 && pos.get('t:t1')!.y < 0, '가장 이른 일 = 12시')
assert.ok(r('u:u1') > r('t:t1') + 100, '사람은 바깥 고리')
assert.deepEqual([...radialLayout(g)], [...pos], '결정적')
for (const n of g.nodes) assert.ok(pos.has(n.id), `자리 있음 ${n.id}`)
// 바깥 노드끼리 겹치지 않음
const outer = g.nodes.filter((n) => n.kind !== 'task' && n.kind !== 'project').map((n) => pos.get(n.id)!)
for (let a = 0; a < outer.length; a++) for (let b = a + 1; b < outer.length; b++) assert.ok(Math.hypot(outer[a].x - outer[b].x, outer[a].y - outer[b].y) > 150, '바깥 노드 간격')
// 잇기 계획
const N = (id: string) => g.nodes.find((n) => n.id === id)
assert.deepEqual(connectPlan(N('t:t1'), N('t:t2')), { kind: 'order', from: 't1', to: 't2' })
assert.deepEqual(connectPlan(N('u:u1'), N('t:t4')), { kind: 'person', task: 't4', person: 'u1' })
assert.deepEqual(connectPlan(N('p:pc'), N('u:u1')), { kind: 'projectPerson', person: 'u1' })
assert.deepEqual(connectPlan(N('t:t4'), N('n:n1')), { kind: 'note', note: 'n1', to: { type: 'task', id: 't4' } })
assert.deepEqual(connectPlan(N('l:la'), N('t:t1')), { kind: 'none' })
assert.deepEqual(connectPlan(N('t:t1'), N('t:t1')), { kind: 'none' })
console.log('project-edit ok')
// ── 차분한 카드 한 줄(§12.9.0) ──
{
  const { projectCardLine } = await import('@sprout/schema/planView')
  const c = projectCardLine({ members: [1, 2, 3, 4] as never, done: 1, deadline: { day: '2026-10-07', word: '제출', taskId: 'x' } }, '2026-10-05')
  assert.deepEqual(c, { text: '4개 중 1개 완료 · 제출 10/7', deadline: '제출 10/7', hot: true, progress: 0.25 })
  assert.equal(projectCardLine({ members: [1] as never, done: 0, deadline: { day: '2026-10-20', word: '마감', taskId: 'x' } }, '2026-10-05').hot, false)
  assert.equal(projectCardLine({ members: [1] as never, done: 0, deadline: { day: '2026-10-01', word: '마감', taskId: 'x' } }, '2026-10-05').hot, true, '지남 = 빨강')
  assert.equal(projectCardLine({ members: [] as never, done: 0, deadline: null }, '2026-10-05').text, '0개 중 0개 완료')
  console.log('project-card ok')
}
// ── 빠른 추가 프로젝트 알약(§12.10.4) ──
{
  const { rankProjectChips } = await import('../src/renderer/src/lib/projectEdit')
  const P = [
    { id: 'k', name: 'K 인공지능 제조 데이터 공모전', aliases: '["데이터 공모전"]', category: '공모전', last: '2026-09-20' },
    { id: 'h', name: 'SK 하이닉스 AI 공모전', aliases: null, category: '공모전', last: '2026-11-10' },
    { id: 'o', name: '오래된 공모전', aliases: null, category: '공모전', last: '2025-01-01' },
    { id: 'u', name: 'UniPort', aliases: null, category: null, last: '2026-10-01' }
  ]
  assert.deepEqual(rankProjectChips('데이터 공모전 회의', P, '2026-10-05').map((x) => x.id), ['k', 'h', 'o'], '별칭이 든 프로젝트 먼저, 그다음 같은 분류 가까운 순')
  assert.deepEqual(rankProjectChips('공모전 회의', P, '2026-11-01').map((x) => x.id), ['h', 'k', 'o'], '분류 낱말만 = 가까운 프로젝트 순')
  assert.deepEqual(rankProjectChips('UniPort 미팅', P, '2026-10-05').map((x) => x.id), ['u'])
  assert.deepEqual(rankProjectChips('장보기', P, '2026-10-05'), [], '맞는 말이 없으면 줄을 숨김')
  console.log('project-chips ok')
}
// ── 단계 보드(§12.11) ──
{
  const { mainSteps, moveStep, chainPairs } = await import('../src/renderer/src/lib/projectEdit')
  const M = (id: string, title: string, due: string | null, status = 0, parent_id: string | null = 'g') => ({ id, title, list_id: 'l', status, priority: 0, due_at: due, start_at: null, completed_at: status ? due : null, created_at: '2026-09-01', parent_id })
  const members = [M('g', '발표·제출까지', '2026-10-10', 0, null), M('s1', '자료조사', '2026-09-11', 1), M('s2', '데이터 분석 2차', '2026-09-25', 1), M('s3', '팀 회의', '2026-10-07'), M('s4', '최종 제출', '2026-10-10'), M('x', '회식', '2026-10-23', 0, null), M('y1', '딴 줄 A', null, 0, null), M('y2', '딴 줄 B', null, 0, null)]
  const seq = [{ id: 'a', from_id: 's1', to_id: 's2', kind: 'sequence', state: 'accepted' }, { id: 'b', from_id: 's3', to_id: 's4', kind: 'sequence', state: 'accepted' }, { id: 'c', from_id: 's2', to_id: 's3', kind: 'sequence', state: 'accepted' }, { id: 'd', from_id: 'y1', to_id: 'y2', kind: 'sequence', state: 'accepted' }]
  const r = mainSteps({ members, seq } as never)
  assert.deepEqual(r.steps.map((s) => s.id), ['s1', 's2', 's3', 's4'], '가장 긴 덩어리 · 위상 순')
  assert.equal(r.goal?.id, 'g', '같은 부모 = 목표')
  assert.equal(r.current, 's3', '첫 열린 단계 = 지금')
  assert.deepEqual(r.rest.map((x) => x.id).sort(), ['x', 'y1', 'y2'], '단계 아닌 구성원(목표 제외)')
  assert.deepEqual(mainSteps({ members, seq: [] } as never).steps, [], '순서 선 없으면 단계 없음')
  assert.deepEqual(moveStep(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c'])
  assert.deepEqual(moveStep(['a', 'b', 'c'], 0, 9), ['b', 'c', 'a'])
  assert.deepEqual(chainPairs(['a', 'b', 'c']), [['a', 'b'], ['b', 'c']])
  // 고리가 있어도 끝난다
  const loop = mainSteps({ members, seq: [...seq, { id: 'e', from_id: 's4', to_id: 's1', kind: 'sequence', state: 'accepted' }] } as never)
  assert.equal(loop.steps.length, 4)
  console.log('steps ok')
}

// ── 31 §12.12 프로젝트 안에서 넣기·고르기: 주 리스트 · 인식 + 자리 기본값 · 여러 개 고르기 ──
{
  const { mainListOf, projectTaskInput } = await import('@sprout/schema/planView')
  const { parseAdd } = await import('../src/renderer/src/lib/addParse')
  const { pickNext } = await import('../src/renderer/src/lib/projectEdit')
  const lists: Record<string, { kind: string | null; name: string }> = { in: { kind: 'inbox', name: '기본함' }, a: { kind: null, name: '가 공부' }, b: { kind: null, name: '나 교육' } }
  const of = (id: string) => lists[id] ?? null
  const m = (list_id: string | null, status = 0) => ({ list_id, status })
  assert.equal(mainListOf([m('in'), m('in'), m('in'), m('a')], of), 'a', '기본함은 주 리스트가 아님')
  assert.equal(mainListOf([m('a'), m('b'), m('b', 1)], of), 'b', '구성원이 가장 많은 리스트')
  assert.equal(mainListOf([m('a', 1), m('b')], of), 'b', '같으면 열린 구성원이 많은 쪽')
  assert.equal(mainListOf([m('b'), m('a')], of), 'a', '그것도 같으면 이름 순')
  assert.equal(mainListOf([m('in'), m(null), m('gone')], of), null, '일반 리스트가 없으면 null(기본함) — 보관·없는 리스트 제외')

  const now = new Date('2026-10-05T09:00:00')
  const P = (raw: string) => parseAdd(raw, [{ id: 'a', name: '공부' }], [{ id: 't1', name: '중요' }], { keepDate: false, now })
  const r1 = projectTaskInput(P('내일 오후 3시 자료 정리'), { kind: 'research', mainList: 'b' })!
  assert.equal(r1.title, '자료 정리', '날짜 문구는 제목에서 뺌')
  assert.equal(r1.due_at, '2026-10-06T15:00', '내일 오후 3시 → 15시')
  assert.equal(r1.list_id, 'b', '주 리스트')
  assert.equal(r1.kind, null, '제목 분류(조사·분석)와 줄이 같으면 덮어쓰기 안 함')
  const r2 = projectTaskInput(P('발표 연습'), { day: '2026-10-09', kind: 'dev', mainList: null })!
  assert.equal(r2.due_at, '2026-10-09', '적은 날짜가 없으면 누른 날짜')
  assert.equal(r2.list_id, null, '주 리스트가 없으면 기본함(null → 안전망)')
  assert.equal(r2.kind, 'dev', '줄 종류가 제목 분류와 다르면 덮어쓰기')
  const r3 = projectTaskInput(P('금요일 제출 ~공부 #중요 !높음'), { day: '2026-10-07', mainList: 'b' })!
  assert.equal(r3.due_at, '2026-10-09', '적은 날짜가 누른 날짜를 이김')
  assert.equal(r3.list_id, 'a', '~리스트가 주 리스트를 이김')
  assert.deepEqual(r3.tag_ids, ['t1'])
  assert.equal(r3.priority, 3)
  assert.equal(projectTaskInput(P('   '), { mainList: 'b' }), null, '빈 제목')

  assert.deepEqual(pickNext(['a'], 'b', { meta: false, shift: false }), ['b'], '보통 누름 = 하나만')
  assert.deepEqual(pickNext(['a'], 'b', { meta: true, shift: false }), ['a', 'b'], '⌘ = 더하기')
  assert.deepEqual(pickNext(['a', 'b'], 'a', { meta: true, shift: false }), ['b'], '⌘ 다시 = 빼기')
  assert.deepEqual(pickNext(['a'], 'a', { meta: false, shift: true }), ['a'], 'Shift = 더하기만')
  assert.deepEqual(pickNext([], 'c', { meta: false, shift: true }), ['c'])
  console.log('project quick add ok')
}
