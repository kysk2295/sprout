// 31 §12 자동 프로젝트(순수): 일의 종류 · 프로젝트 같은 말 · 이름 · 덩어리 찾기 · 구성원(집·하위·✕) · 마감 · 넓히기 · 다음 · 추정 선 · 쌓기
import assert from 'node:assert/strict'
import {
  blockedSet, expandProject, findProjectClusters, fullProjectName, inferredChain, nextSteps, projectDeadline, projectEmoji, projectish, projectMembers,
  projectSpan, stackRows, taskDay, upgradeToProject, workKind, nearSameName, planProjectCleanup, type FindCtx, type PTask
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
  assert.deepEqual(names, ['공모전', 'SQLD', 'UniPort'].sort())
  const uni = auto.find((p) => p.name === 'UniPort')!
  assert.equal(uni.reason, 'home')
  assert.deepEqual(uni.home, { type: 'folder', id: 'fu' }, '폴더 이름이 다른 리스트 제목에 2번 = 집')
  const comp = auto.find((p) => p.key === '공모전')!
  assert.equal(comp.word, '공모전')
  assert.equal(comp.taskIds.length, 5)
  assert.ok(suggest.some((p) => p.key === '블로그' && p.reason === 'plain'), '프로젝트 같지 않은 낱말 3개·리스트 3곳 = 제안')
  assert.ok(suggest.some((p) => p.key === '해커톤' && p.reason === 'project'), '프로젝트 같은 말 2개 = 제안')
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
  const r2 = findProjectClusters(b2, new Set(['공모전']))
  assert.ok(!r2.auto.some((p) => p.key === 'sqld'), '이미 있는 태그 이름은 새로 안 만듦')
  assert.ok(r2.suggest.some((p) => p.reason === 'tag' && p.tagId === 'gs'), '사용자 topic 태그가 프로젝트 같으면 제안')
  assert.ok(!r2.auto.some((p) => p.key === '공모전'), '막은 이름')
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
  assert.ok(names.includes('공모전') && names.includes('창업'), `공모전·창업은 따로, 이름은 함께 쓰는 핵심 말: ${names}`)
  assert.ok(!names.some((n) => n.startsWith('신한')), '제목 하나의 긴 이름이 덩어리 이름이 되지 않음')
  assert.ok(names.includes('adsp') || names.includes('ADsP') || auto.some((p) => p.key === 'adsp'), '날짜 다른 3개 = 자동')
  assert.ok(!auto.some((p) => p.key === 'sqlp'), '날짜가 하루뿐이면(3개라도) 자동 아님')
  assert.ok(nearSameName('신한 스퀘어브릿지 대학생 창업', '신한 스퀘어브릿지 대학생 창업 공모전'))
  assert.ok(nearSameName('공모전', '공모전 자료조사') && !nearSameName('공모전', '창업'))

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
  assert.deepEqual(plan.updateTags.find((u) => u.id === 'tg'), { id: 'tg', name: '공모전', aliases: JSON.stringify(['공모전 자료조사']) }, '이름 다시 짓고 거의 같은 이름(공모전 자료조사)은 별칭으로')
  assert.equal(plan.updateTags.find((u) => u.id === 'tc')?.name, '창업')
  assert.ok(plan.removeTags.includes('tz') && !plan.removeTags.includes('tc'), '공모전 자료조사는 공모전으로 합침, 창업은 따로')
  assert.deepEqual(plan.addLinks.map((a) => [a.task_id, a.tag_id]), [['x2', 'tg']], '합친 쪽 할 일은 옮김(이미 있는 g2는 다시 안 넣음)')
  assert.deepEqual(planProjectCleanup({ ...real(), tags: [{ id: 'ok', name: 'adsp', kind: 'project', source: 'ai', run_id: 'proj-x' }], links: ['a1', 'a2', 'a3'].map((t, i) => L(`k${i}`, t, 'ok')) }),
    { removeTags: [], removeLinks: [], addLinks: [], updateTags: [] }, '고칠 것 없으면 빈 계획')
  // 날짜 하루뿐인 자동 덩어리 → 지움
  const one = planProjectCleanup({ ...real(), tags: [{ id: 'sq', name: 'SQLP', kind: 'project', source: 'ai', run_id: 'proj-x' }], links: ['one1', 'one2', 'one3'].map((t, i) => L(`s${i}`, t, 'sq')) })
  assert.deepEqual(one.removeTags, ['sq'])
}
console.log('projects ok')
