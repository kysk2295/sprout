// 31 §12 자동 프로젝트(순수): 일의 종류 · 프로젝트 같은 말 · 이름 · 덩어리 찾기 · 구성원(집·하위·✕) · 마감 · 넓히기 · 다음 · 추정 선 · 쌓기
import assert from 'node:assert/strict'
import {
  blockedSet, expandProject, findProjectClusters, fullProjectName, inferredChain, nextSteps, projectDeadline, deadlineWord, membersEndedBy, projectEmoji, projectish, projectMembers,
  projectSpan, stackRows, taskDay, upgradeToProject, workKind, nearSameName, planProjectCleanup, categoryOf, isBareCategory, specificName, sameInstance, findInstances, type FindCtx, type PTask
} from './projects.ts'
import { planAssign, type Ctx } from './autoTag.ts'

// ── 일의 종류 ──
assert.equal(workKind('공모전 관련 데이터 분석'), 'research')
assert.equal(workKind('공모전 자료조사'), 'research')
assert.equal(workKind('교수님 미팅'), 'meeting')
assert.equal(workKind('팀 회의'), 'meeting')
assert.equal(workKind('베이스라인 모델'), 'dev')
assert.equal(workKind('대시보드 개발'), 'dev')
assert.equal(workKind('k 인공지능 제조 데이터 공모전 신청'), 'admin', '신청이 데이터보다 앞선다')
assert.equal(workKind('발표자료'), 'admin')
assert.equal(workKind('최종 제출'), 'admin')
assert.equal(workKind('데이터 공모전 회식'), 'other', '회식은 일이 아닌 모임 → 기타')
assert.equal(workKind('장보기'), 'other')
assert.equal(workKind('API 붙이기'), 'dev', '영문은 낱말 그대로')
assert.equal(workKind('rapid 연습'), 'other', '영문 낱말 일부(api)는 아님')

// ── 프로젝트 같은 말 · 이모지 ──
for (const w of ['공모전', 'SQLD', 'UniPort', '모두의창업', '해커톤', '졸업작품']) assert.ok(projectish(w), w)
for (const w of ['회의', '데이터', '교수님', 'API', 'uniport', '운동']) assert.ok(!projectish(w), w)
assert.equal(projectEmoji('K 인공지능 제조 데이터 공모전'), '🏆')
assert.equal(projectEmoji('SQLD'), '📜')
assert.equal(projectEmoji('모두의창업'), '🌱')
assert.equal(projectEmoji('UniPort'), '🚀')
assert.equal(projectEmoji('🎸 밴드 공연'), '🎸')

// ── 이름 ──
assert.equal(fullProjectName('공모전', ['k 인공지능 제조 데이터 공모전 신청']), 'K 인공지능 제조 데이터 공모전', '제목 하나면 가장 긴 이름')
assert.equal(fullProjectName('공모전', ['공모전 회의', 'k 인공지능 제조 데이터 공모전 신청', '데이터 공모전 회식']), '데이터 공모전', '절반 넘게 같이 쓰는 가장 긴 이름')
// 2026-10-05 실제 데이터: 제목 하나(신한 … 공모전 신청)가 공모전 할 일 전체의 이름이 되면 안 된다
assert.equal(fullProjectName('공모전', ['신한 스퀘어브릿지 대학생 창업 공모전 신청', '공모전 회의', '공모전 미팅', '공모전 자료추가 조사', '데이터 공모전 회식']), '공모전')
assert.equal(fullProjectName('SQLD', ['SQLD 기출 2회', 'SQLD 접수']), 'SQLD')
assert.equal(fullProjectName('공모전', ['오늘 공모전 회의']), '공모전', '흔한 낱말은 이름에 안 들어감')

// ── 덩어리 찾기 ──
const T = (id: string, title: string, list_id: string, extra: Partial<PTask> = {}): PTask => ({ id, title, list_id, status: 0, created_at: '2026-09-01T00:00:00Z', ...extra })
const base = (): FindCtx => ({
  tags: [{ id: 'gp', name: '교수님', kind: 'person' }],
  folders: [{ id: 'fu', name: '🚀 UniPort' }],
  lists: [{ id: 'in', name: 'Inbox', kind: 'inbox' }, { id: 'ls', name: '🎓 학사 행정' }, { id: 'la', name: '🤖 AI 공부·도구' }, { id: 'le', name: '💼 교육·미팅' }, { id: 'lm', name: '마케팅', folder_id: 'fu' }, { id: 'lq', name: '자격증' }],
  tasks: [
    T('c1', '공모전 관련 데이터 분석', 'la', { due_at: '2026-09-09' }),
    T('c2', '공모전 자료조사', 'la', { due_at: '2026-09-11' }),
    T('c3', '공모전 회의', 'le', { due_at: '2026-09-11' }),
    T('c4', 'k 인공지능 제조 데이터 공모전 신청', 'ls', { due_at: '2026-09-09', status: 1, completed_at: '2026-09-09T10:00:00Z' }),
    T('c5', '데이터 공모전 회식', 'in', { due_at: '2026-10-23' }),
    T('u1', 'UniPort 사업계획서 초안', 'ls', { due_at: '2026-09-10' }),
    T('u2', 'UniPort 투자 미팅', 'le', { due_at: '2026-09-12' }),
    T('u3', '카드뉴스 3편 게시', 'lm', { due_at: '2026-09-14' }),
    T('s1', 'SQLD 기출 2회 풀기', 'lq', { due_at: '2026-09-02' }),
    T('s2', 'SQLD 접수', 'in', { due_at: '2026-09-05' }),
    T('s3', 'SQLD 요약 노트', 'lq', { due_at: '2026-09-08' }),
    T('b1', '블로그 글 쓰기', 'la'),
    T('b2', '블로그 이미지 만들기', 'le'),
    T('b3', '블로그 댓글 답하기', 'in'),
    T('a1', '해커톤 팀 모집', 'le'),
    T('a2', '해커톤 주제 정하기', 'la')
  ],
  links: []
})
{
  const { auto, suggest } = findProjectClusters(base())
  const names = auto.map((p) => p.name).sort()
  assert.deepEqual(names, ['K 인공지능 제조 데이터 공모전', 'SQLD', 'UniPort'].sort(), '§12.10: 공모전은 분류 — 프로젝트는 특정 공모전')
  const uni = auto.find((p) => p.name === 'UniPort')!
  assert.equal(uni.reason, 'home')
  assert.deepEqual(uni.home, { type: 'folder', id: 'fu' }, '폴더 이름이 다른 리스트 제목에 2번 = 집')
  const comp = auto.find((p) => p.category === '공모전')!
  assert.equal(comp.reason, 'instance')
  assert.deepEqual([...comp.taskIds].sort(), ['c1', 'c2', 'c3', 'c4', 'c5'], '닻(c4·데이터 공모전 c5) + 14일 안 막연한 공모전 일')
  assert.deepEqual(comp.aliases, ['데이터 공모전'])
  assert.ok(suggest.some((p) => p.key === '블로그' && p.reason === 'plain'), '프로젝트 같지 않은 낱말 3개·리스트 3곳 = 제안')
  assert.ok(!auto.some((p) => p.key === '해커톤') && !suggest.some((p) => p.key === '해커톤'), '막연한 해커톤 일만 있으면 프로젝트·제안 아님(분류에서 고르기)')
  assert.ok(!auto.some((p) => p.key === '데이터') && !suggest.some((p) => p.key === '데이터'), '일의 종류 낱말은 덩어리 아님')
  assert.equal(suggest.find((p) => p.key === '블로그')!.name, '블로그', '그냥 낱말 제안은 낱말 그대로 이름')
  // 이미 프로젝트 구성원인 할 일은 제안에서 세지 않는다 · 막연한 낱말(계획)은 제안 안 함
  const c3 = base()
  c3.tasks.push(T('g1', '주간 계획', 'la'), T('g2', '발표 계획 세우기', 'le'), T('g3', '여행 계획', 'in'))
  assert.ok(!findProjectClusters(c3).suggest.some((p) => p.key === '계획'), '계획은 막연함')
  assert.ok(!findProjectClusters(base(), new Set(), new Set(['b1', 'b2'])).suggest.some((p) => p.key === '블로그'), '구성원 빼면 3개 미만')
  // 막은 이름 · 이미 있는 태그
  const b2 = base()
  b2.tags.push({ id: 'gs', name: 'SQLD', kind: 'topic', source: 'user' })
  b2.links = ['s1', 's2', 's3'].map((t, i) => ({ id: `x${i}`, task_id: t, tag_id: 'gs', source: 'user' }))
  const r2 = findProjectClusters(b2, new Set(['k인공지능제조데이터공모전']))
  assert.ok(!r2.auto.some((p) => p.key === 'sqld'), '이미 있는 태그 이름은 새로 안 만듦')
  assert.ok(r2.suggest.some((p) => p.reason === 'tag' && p.tagId === 'gs'), '사용자 topic 태그가 프로젝트 같으면 제안')
  assert.ok(!r2.auto.some((p) => p.category === '공모전'), '막은 이름')
}
assert.deepEqual(upgradeToProject([{ id: 'a', name: 'SQLD', kind: 'topic', source: 'ai' }, { id: 'b', name: 'SQLD2', kind: 'topic', source: 'user' }, { id: 'c', name: '헬스', kind: 'topic', source: 'ai' }]), ['a'])

// ── 구성원 ──
{
  const ctx = base()
  ctx.tasks.push(T('u4', '하위: 문안 쓰기', 'in', { parent_id: 'u1' }), T('u5', '하위의 하위', 'in', { parent_id: 'u4' }), T('u6', '지운 것', 'lm', { deleted_at: '2026-09-02' }))
  const live = ctx.tasks.filter((t) => !t.deleted_at)
  const tag = { id: 'gu', name: 'UniPort', kind: 'project', home_type: 'folder', home_id: 'fu' }
  const links = [{ id: 'l1', task_id: 'u1', tag_id: 'gu', source: 'rule' }, { id: 'l2', task_id: 'u2', tag_id: 'gu', source: 'rule', state: 'dismissed' }]
  const m = projectMembers(tag, live, links, ctx.lists)
  assert.deepEqual([...m].sort(), ['u1', 'u3', 'u4', 'u5'], '태그 + 집(폴더) 안 + 하위 − ✕')
}

// ── 날짜 · 마감 · 기간 ──
assert.equal(taskDay(T('x', 'a', 'l', { due_at: '2026-10-10T09:00' })), '2026-10-10')
assert.equal(taskDay(T('x', 'a', 'l', { status: 1, completed_at: '2026-10-01T09:00:00Z' })), '2026-10-01')
assert.equal(taskDay(T('x', 'a', 'l')), null)
{
  const ms = [T('d1', '발표자료', 'l', { due_at: '2026-10-08' }), T('d2', '최종 제출', 'l', { due_at: '2026-10-10' }), T('d3', '제출 연습', 'l', { due_at: '2026-10-20', status: 1 }), T('d4', '팀 회의', 'l', { due_at: '2026-10-30' })]
  assert.deepEqual(projectDeadline(ms), { day: '2026-10-10', word: '제출', taskId: 'd2' }, '열린 일 중 마감 말 든 가장 늦은 것(발표 10/8 < 제출 10/10)')
  assert.equal(projectDeadline([T('z', '팀 회의', 'l', { due_at: '2026-10-30' })]), null)
  // 강한 마감 말만(2026-10-06 고침): '발표 자료 정리'·준비·연습은 마감이 아니다
  for (const [title, want] of [
    ['발표 자료 정리', null], ['발표자료 만들기', null], ['발표 준비', null], ['최종 발표 연습', null], ['제출 서류 준비', null], ['자료 정리', null], ['ADsP 시험 공부', null], ['발표', null], ['면접', null],
    ['공모전 제출', '제출'], ['신청 마감', '마감'], ['서류 접수', '접수'], ['본선', '본선'], ['결선 진출 발표회', '발표'], ['최종 발표', '발표'], ['ADsP 시험일', '시험'], ['D-day', 'D-day'], ['공모전 D-DAY', 'D-day']
  ] as [string, string | null][]) assert.equal(deadlineWord(title), want, title)
  assert.equal(projectDeadline([T('p1', '발표 자료 정리', 'l', { due_at: '2026-10-06' }), T('p2', '2차 회의', 'l')]), null, "'발표 자료 정리'(오늘 마감)는 프로젝트 마감이 아니다")
  assert.deepEqual(projectDeadline([T('p1', '발표 자료 정리', 'l', { due_at: '2026-10-12' }), T('p3', '공모전 최종 제출', 'l', { due_at: '2026-10-10', status: 1 })]), { day: '2026-10-10', word: '제출', taskId: 'p3' }, '낸 뒤에도 마감은 마감')
  assert.deepEqual(projectDeadline([T('p3', '최종 제출', 'l', { due_at: '2026-10-10' })], '2026-10-20'), { day: '2026-10-20', word: '마감', taskId: null }, '사람이 정한 마감이 먼저')
  // 끝남: 앞으로 할 열린 일 없음 + (다 끝남 또는 마감 7일 지남)
  const done = (id: string, d: string) => T(id, '공모전 제출', 'l', { due_at: d, status: 1 })
  assert.equal(membersEndedBy([done('e1', '2026-10-01')], null, '2026-10-02'), true, '다 끝남')
  assert.equal(membersEndedBy([done('e1', '2026-10-01'), T('e2', '회고', 'l')], '2026-10-01', '2026-10-30'), false, '날짜 없는 열린 일')
  assert.equal(membersEndedBy([done('e1', '2026-10-01'), T('e2', '회고', 'l', { due_at: '2026-10-07' })], '2026-10-01', '2026-10-07'), false, '오늘 열린 일')
  assert.equal(membersEndedBy([T('e3', '발표 자료 정리', 'l', { due_at: '2026-10-06' })], null, '2026-10-07'), false, '하루 지난 열린 일 — 7일 안')
  assert.equal(membersEndedBy([T('e3', '발표 자료 정리', 'l', { due_at: '2026-10-06' })], null, '2026-10-14'), true, '마지막 날짜 7일 넘게 지남')
  assert.equal(membersEndedBy([], null, '2026-10-14'), false, '구성원 없음')
  assert.deepEqual(projectSpan(ms), { from: '2026-10-08', to: '2026-10-30' })
}

// ── 넓히기 ──
{
  const ctx: FindCtx = { ...base(), tasks: [], links: [] }
  ctx.tags = [{ id: 'gc', name: '공모전', kind: 'project' }, { id: 'gz', name: 'SQLD', kind: 'project' }]
  ctx.tasks = [
    T('m1', '공모전 데이터 분석', 'la', { due_at: '2026-09-09' }),
    T('m2', '공모전 회의', 'la', { due_at: '2026-09-20' }),
    T('e1', '베이스라인 모델', 'la', { due_at: '2026-09-22' }),
    T('e2', '팀 회의', 'la', { due_at: '2026-12-01' }),
    T('e3', '장보기', 'la', { due_at: '2026-09-15' }),
    T('e4', '대시보드 개발', 'le', { due_at: '2026-09-16' }),
    T('e5', 'SQLD 회의', 'la', { due_at: '2026-09-16' })
  ]
  ctx.links = [{ id: 'k1', task_id: 'm1', tag_id: 'gc', source: 'rule' }, { id: 'k2', task_id: 'm2', tag_id: 'gc', source: 'rule' }, { id: 'k3', task_id: 'e5', tag_id: 'gz', source: 'rule' }]
  const add = expandProject(ctx.tags[0], new Set(['m1', 'm2']), ctx)
  assert.deepEqual(add, ['e1'], '같은 리스트·기간 안·단계로 보이는 일만(기간 밖 팀 회의, 기타 장보기, 다른 리스트, 다른 프로젝트 일은 아님)')
}

// ── 프로젝트 태그 상한(33 planAssign 예외) ──
{
  const ctx: Ctx = {
    person: true, folders: [], lists: [{ id: 'l', name: '기타' }], links: [],
    tags: [{ id: 'g1', name: '교수님', kind: 'person' }, { id: 'g2', name: '데이터', kind: 'topic' }, { id: 'gp', name: '공모전', kind: 'project' }, { id: 'gq', name: 'SQLD', kind: 'project' }],
    tasks: [{ id: 't', title: '교수님 데이터 공모전 SQLD', list_id: 'l', status: 0 }]
  }
  const plan = planAssign([{ taskId: 't', tagId: 'g1', source: 'rule', confidence: 100 }, { taskId: 't', tagId: 'g2', source: 'rule', confidence: 100 }, { taskId: 't', tagId: 'gp', source: 'rule', confidence: 100 }, { taskId: 't', tagId: 'gq', source: 'rule', confidence: 90 }], ctx)
  assert.deepEqual(plan.map((a) => a.tagId).sort(), ['g1', 'g2', 'gp'], '자동 2개 + 프로젝트 1개(두 번째 프로젝트는 아님)')
}

// ── 다음 · 막힘 · 추정 선 · 쌓기 ──
{
  const ms = [T('a', 'A', 'l', { due_at: '2026-10-01' }), T('b', 'B', 'l', { due_at: '2026-10-07' }), T('c', 'C', 'l', { due_at: '2026-10-08' }), T('d', 'D', 'l'), T('e', 'E', 'l', { status: 1 })]
  const blocked = blockedSet([{ from_id: 'b', to_id: 'c', kind: 'sequence', state: 'accepted' }], new Set(['a', 'b', 'c', 'd']))
  assert.deepEqual(nextSteps(ms, blocked, '2026-10-05').map((t) => t.id), ['b', 'd'], '기한 안 지난 것 → 날짜 없는 것, 막힌 C 빼고, 기한 지난 A는 뒤')
}
assert.deepEqual(inferredChain([
  { id: 'r1', kind: 'research', day: '2026-09-11' }, { id: 'r2', kind: 'research', day: '2026-09-25' },
  { id: 'd1', kind: 'dev', day: '2026-10-02' }, { id: 'p1', kind: 'admin', day: '2026-10-08' }, { id: 'p2', kind: 'admin', day: '2026-10-10' }, { id: 'm1', kind: 'meeting', day: '2026-10-07' }
], 'p2'), [['r2', 'd1'], ['d1', 'p1'], ['p1', 'p2']])
{
  const rows = stackRows([{ id: 'a', x: 0, w: 100 }, { id: 'b', x: 50, w: 100 }, { id: 'c', x: 120, w: 50 }])
  assert.deepEqual([rows.get('a'), rows.get('b'), rows.get('c')], [0, 1, 0])
}

// ── 2026-10-05 실제 데이터 버그(사용자 앱): `🚀 근무`(🏠생활 › 근무 리스트) · `🚀 프로젝트` · 신한 … 창업 / 신한 … 창업 공모전 중복 ──
{
  const R = (id: string, title: string, list_id: string, due: string | null, status = 1): PTask => ({ id, title, list_id, status, due_at: due, created_at: '2026-06-01T00:00:00Z', completed_at: status ? `${due ?? '2026-06-01'}T10:00:00Z` : null })
  const real = (): FindCtx => ({
    tags: [],
    folders: [{ id: 'fl', name: '🏠생활' }],
    lists: [{ id: 'in', name: '기본함', kind: 'inbox' }, { id: 'lw', name: '근무', folder_id: 'fl' }, { id: 'lc', name: '창업 준비' }, { id: 'lg', name: '공모전·대외활동' }, { id: 'ld', name: '개발·디자인' }, { id: 'lq', name: '자격증' }],
    tasks: [
      R('w1', '근무', 'in', '2026-07-16'), R('w2', '근무', 'in', '2026-07-17'), R('w3', '근무', 'in', '2026-07-18'), R('w4', '근무', 'in', '2026-07-19'),
      R('p1', '프로젝트 서버 이전', 'in', '2026-06-23'), R('p2', '프로젝트 과제', 'in', '2026-08-23'), R('p3', '프로젝트 초기 세팅', 'ld', '2026-02-25'), R('p4', '프로젝트 유지보수', 'ld', null, 0),
      R('c1', '창업 사무실', 'lc', '2026-02-04'), R('c2', '창업 아이템 발굴', 'lc', '2026-06-29'), R('c3', '모두의 창업 마감', 'lc', '2026-09-17', 0), R('c4', '창업 아이디어 발굴 에이전트 만들기', 'lc', '2026-07-01'),
      R('g1', '신한 스퀘어브릿지 대학생 창업 공모전 신청', 'in', '2025-11-04'), R('g2', '공모전 회의', 'in', '2026-09-06'), R('g3', '공모전 미팅', 'in', '2026-09-04'), R('g4', '공모전 자료추가 조사', 'in', '2026-09-08'), R('g5', '공모전 관련 데이터 분석', 'lg', '2026-09-09', 0),
      R('a1', 'adsp 접수', 'in', '2026-07-06'), R('a2', 'adsp 시험', 'lq', '2026-10-31', 0), R('a3', 'adsp 접수', 'in', '2026-09-28'),
      R('one1', 'SQLP 접수', 'in', '2026-09-01'), R('one2', 'SQLP 기출', 'in', '2026-09-01'), R('one3', 'SQLP 요약', 'in', '2026-09-01')
    ],
    links: []
  })
  const { auto } = findProjectClusters(real())
  const names = auto.map((p) => p.name)
  assert.ok(!names.includes('근무'), '영역 리스트(🏠생활 › 근무) 이름은 집 프로젝트 아님')
  assert.ok(!auto.some((p) => p.key === '프로젝트'), '막연한 말(프로젝트)은 자동 프로젝트 아님')
  assert.ok(!projectish('프로젝트') && !projectish('계획') && !projectish('🏠생활') && projectish('사이드프로젝트'))
  assert.ok(!names.includes('공모전') && !names.includes('창업'), `§12.10: 공모전·창업은 분류 — 프로젝트 아님: ${names}`)
  assert.ok(names.includes('신한 스퀘어브릿지 대학생 창업 공모전'), '강한 이름(앞 낱말 2개 이상)은 할 일 하나여도 프로젝트')
  assert.ok(!names.includes('모두의 창업'), '약한 이름 + 할 일 하나는 자동 아님')
  assert.ok(names.includes('adsp') || names.includes('ADsP') || auto.some((p) => p.key === 'adsp'), '날짜 다른 3개 = 자동')
  assert.ok(!auto.some((p) => p.key === 'sqlp'), '날짜가 하루뿐이면(3개라도) 자동 아님')
  assert.ok(nearSameName('신한 스퀘어브릿지 대학생 창업', '신한 스퀘어브릿지 대학생 창업 공모전'))
  assert.ok(!nearSameName('공모전', '공모전 자료조사') && !nearSameName('공모전', '신한 스퀘어브릿지 대학생 창업 공모전') && !nearSameName('공모전', '창업'), '분류 낱말 하나는 특정 이름과 같지 않음')

  // 한 번 정리: 예전 규칙이 만든 태그들
  const c = real()
  c.tags = [
    { id: 'tw', name: '근무', kind: 'project', source: 'ai', home_type: 'list', home_id: 'lw', run_id: 'proj-x' },
    { id: 'tp', name: '프로젝트', kind: 'project', source: 'ai', run_id: 'proj-x' },
    { id: 'tc', name: '신한 스퀘어브릿지 대학생 창업', aliases: '["창업"]', kind: 'project', source: 'ai', run_id: 'proj-x' },
    { id: 'tg', name: '신한 스퀘어브릿지 대학생 창업 공모전', aliases: '["공모전"]', kind: 'project', source: 'ai', run_id: 'proj-x' },
    { id: 'tz', name: '공모전 자료조사', kind: 'project', source: 'ai', run_id: 'tagrun-x' },
    { id: 'ta', name: 'adsp', kind: 'project', source: 'ai', run_id: 'proj-x' },
    { id: 'tu', name: '내 프로젝트', kind: 'project', source: 'user' }
  ]
  const L = (id: string, task: string, tag: string, conf = 100, source = 'rule') => ({ id, task_id: task, tag_id: tag, source, state: 'accepted', confidence: conf })
  c.tasks.push(R('x1', '국민카드 결제오류 전화', 'in', '2026-09-28'), R('x2', '공모전 자료조사', 'lg', '2026-09-11', 0))
  c.links = [
    ...['w1', 'w2', 'w3'].map((t, i) => L(`lw${i}`, t, 'tw')),
    ...['p1', 'p2', 'p3'].map((t, i) => L(`lp${i}`, t, 'tp')),
    ...['c1', 'c2', 'c3', 'c4'].map((t, i) => L(`lc${i}`, t, 'tc')),
    ...['g1', 'g2', 'g3', 'g4', 'g5'].map((t, i) => L(`lg${i}`, t, 'tg')),
    L('lz0', 'x2', 'tz'), L('lz1', 'g2', 'tz'),
    L('la0', 'a1', 'ta'), L('la1', 'a2', 'ta'), L('la2', 'a3', 'ta'), L('la3', 'x1', 'ta', 75),
    L('lu0', 'p1', 'tu', 100, 'user')
  ]
  const plan = planProjectCleanup(c)
  assert.ok(plan.removeTags.includes('tw') && plan.removeTags.includes('tp'), '근무·프로젝트 지움')
  assert.ok(!plan.removeTags.includes('tu') && !plan.removeLinks.includes('lu0'), '사용자 태그·연결은 그대로')
  assert.ok(plan.removeLinks.includes('la3') && !plan.removeLinks.includes('la0'), '기본함 넓히기(rule 75)만 뗌')
  assert.ok(!plan.removeTags.includes('ta'), 'adsp는 남음(날짜 다른 3개)')
  // §12.10.5: 분류(공모전·창업)에 든 자동 프로젝트는 지우고 제목에서 다시 나눈다 — 예전 합치기·이름 바꾸기 안 함
  for (const id of ['tg', 'tc', 'tz']) assert.ok(plan.removeTags.includes(id), `분류 자동 프로젝트 지움 ${id}`)
  assert.deepEqual(plan.updateTags, [], '분류 낱말로 이름 바꾸기 없음')
  assert.deepEqual(plan.addLinks, [], '합치기 없음')
  {
    const u = real()
    u.tags = [{ id: 'gc', name: '창업', kind: 'project', source: 'ai', run_id: 'proj-x' }, { id: 'lot', name: '롯데리아', kind: 'project', source: 'user' }]
    u.links = [L('a', 'c1', 'gc'), L('b', 'c3', 'gc', 100, 'user'), L('c', 'c2', 'lot', 100, 'user')]
    const pl = planProjectCleanup(u)
    assert.deepEqual(pl.removeTags, ['gc'], '사람이 넣은 할 일이 있어도 막연한 자동 프로젝트는 지움 · 사용자 태그는 그대로')
    assert.deepEqual(pl.carryUser, ['c3'], '사람이 넣은 할 일은 기억')
    assert.deepEqual(pl.removeLinks.sort(), ['a', 'b'])
  }
  assert.deepEqual(planProjectCleanup({ ...real(), tags: [{ id: 'ok', name: 'adsp', kind: 'project', source: 'ai', run_id: 'proj-x' }], links: ['a1', 'a2', 'a3'].map((t, i) => L(`k${i}`, t, 'ok')) }),
    { removeTags: [], removeLinks: [], addLinks: [], updateTags: [], carryUser: [] }, '고칠 것 없으면 빈 계획')
  // 날짜 하루뿐인 자동 덩어리 → 지움
  const one = planProjectCleanup({ ...real(), tags: [{ id: 'sq', name: 'SQLP', kind: 'project', source: 'ai', run_id: 'proj-x' }], links: ['one1', 'one2', 'one3'].map((t, i) => L(`s${i}`, t, 'sq')) })
  assert.deepEqual(one.removeTags, ['sq'])
}

// ── §12.10 프로젝트는 하나하나 · 분류 ──
{
  assert.equal(categoryOf('K 인공지능 제조 데이터 공모전'), '공모전')
  assert.equal(categoryOf('창업 아이디어 경진대회'), '경진대회', '가장 오른쪽 · 경진대회 > 대회')
  assert.equal(categoryOf('SK 하이닉스 AI 해커톤'), '해커톤')
  assert.equal(categoryOf('adsp 시험'), '시험')
  assert.equal(categoryOf('UniPort'), null)
  assert.ok(isBareCategory('공모전') && isBareCategory('🏆 창업') && !isBareCategory('데이터 공모전'))
  assert.deepEqual(specificName('k 인공지능 제조 데이터 공모전 신청', '공모전'), { name: 'K 인공지능 제조 데이터 공모전', quals: 4 })
  assert.deepEqual(specificName('신한 스퀘어브릿지 대학생 창업 공모전 신청', '공모전'), { name: '신한 스퀘어브릿지 대학생 창업 공모전', quals: 4 })
  assert.equal(specificName('공모전 회의', '공모전'), null, '막연한 할 일')
  assert.equal(specificName('공모전 관련 데이터 분석', '공모전'), null)
  assert.deepEqual(specificName('창업지원장학금 신청', '창업'), { name: '창업지원장학금', quals: 1 }, '붙은 낱말 통째')
  assert.equal(specificName('소상공인을 위한 창업 아이템 기획', '창업'), null, '목적어 조사·위한에서 멈춤')
  assert.ok(sameInstance('데이터 공모전', 'K 인공지능 제조 데이터 공모전') && !sameInstance('공모전', 'K 인공지능 제조 데이터 공모전') && !sameInstance('SK 하이닉스 AI 해커톤', 'K 인공지능 제조 데이터 공모전'))

  const D = (id: string, title: string, due: string | null, extra: Partial<PTask> = {}): PTask => ({ id, title, list_id: 'l', status: 0, due_at: due, created_at: '2026-08-01T00:00:00Z', ...extra })
  const tasks = [
    D('k1', 'K 인공지능 제조 데이터 공모전 신청', '2026-09-05'),
    D('k2', '데이터 공모전 최종 제출', '2026-09-20'),
    D('h1', 'SK 하이닉스 AI 공모전 접수', '2026-11-10'),
    D('h2', 'SK 하이닉스 AI 공모전 발표', '2026-11-24'),
    D('g1', '공모전 회의', '2026-09-12'),
    D('g2', '공모전 자료조사', '2026-11-03'),
    D('g3', '공모전 아이디어 정리', '2026-10-20'),
    D('g4', '공모전 팀 모집', null),
    D('r1', '토익 접수', '2026-09-01')
  ]
  const { instances, loose } = findInstances(tasks)
  assert.deepEqual(instances.map((i) => i.name).sort(), ['K 인공지능 제조 데이터 공모전', 'SK 하이닉스 AI 공모전'])
  const k = instances.find((i) => i.name.startsWith('K'))!, h = instances.find((i) => i.name.startsWith('SK'))!
  assert.deepEqual([...k.anchors].sort(), ['k1', 'k2'])
  assert.deepEqual(k.aliases, ['데이터 공모전'])
  assert.deepEqual(k.generic, ['g1'], '9/12 공모전 회의 → 9월 공모전(닻 9/5·9/20, 14일 안)')
  assert.deepEqual(h.generic, ['g2'], '11/3 자료조사 → 11월 공모전')
  assert.deepEqual(loose.map((x) => x.taskId).sort(), ['g3', 'g4'], '가운데 날짜·날짜 없는 막연한 일은 고르기')
  const g3 = loose.find((x) => x.taskId === 'g3')!
  assert.equal(instances[g3.choices[0]].name, 'SK 하이닉스 AI 공모전', '고르기 알약은 가까운 순(10/20 → 11/10이 9/20보다 가까움)')
  assert.equal(g3.cat, '공모전')
  // 같은 이름이라도 120일 넘게 떨어지면 다른 회차
  const rep = findInstances([D('a', '데이터 청년 캠퍼스 공모전 신청', '2025-03-01'), D('b', '데이터 청년 캠퍼스 공모전 제출', '2025-03-20'), D('c', '데이터 청년 캠퍼스 공모전 신청', '2026-03-02')]).instances
  assert.deepEqual(rep.map((i) => i.name), ['데이터 청년 캠퍼스 공모전 2025', '데이터 청년 캠퍼스 공모전 2026'])
  // 덩어리 찾기에 반영: 두 공모전이 따로 자동 프로젝트, 막연한 `공모전`은 없음
  const fc = findProjectClusters({ tags: [], folders: [], lists: [{ id: 'l', name: '할 일' }], tasks, links: [] })
  assert.deepEqual(fc.auto.filter((p) => p.reason === 'instance').map((p) => p.name).sort(), ['K 인공지능 제조 데이터 공모전', 'SK 하이닉스 AI 공모전'])
  assert.ok(!fc.auto.some((p) => p.name === '공모전') && !fc.suggest.some((p) => p.name === '공모전'))
  assert.deepEqual([...fc.auto.find((p) => p.name.startsWith('K'))!.taskIds].sort(), ['g1', 'k1', 'k2'])
  assert.deepEqual(upgradeToProject([{ id: 'x', name: '공모전', kind: 'topic', source: 'ai' }]), [], '분류 낱말 태그는 프로젝트로 안 올림')
}
console.log('projects ok')
