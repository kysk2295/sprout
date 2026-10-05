// 31 §12 자동 프로젝트(순수): 일의 종류 · 프로젝트 같은 말 · 이름 · 덩어리 찾기 · 구성원(집·하위·✕) · 마감 · 넓히기 · 다음 · 추정 선 · 쌓기
import assert from 'node:assert/strict'
import {
  blockedSet, expandProject, findProjectClusters, fullProjectName, inferredChain, nextSteps, projectDeadline, projectEmoji, projectish, projectMembers,
  projectSpan, stackRows, taskDay, upgradeToProject, workKind, type FindCtx, type PTask
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
assert.equal(fullProjectName('공모전', ['공모전 회의', 'k 인공지능 제조 데이터 공모전 신청', '데이터 공모전 회식']), 'K 인공지능 제조 데이터 공모전')
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
    T('u1', 'UniPort 사업계획서 초안', 'ls'),
    T('u2', 'UniPort 투자 미팅', 'le'),
    T('u3', '카드뉴스 3편 게시', 'lm'),
    T('s1', 'SQLD 기출 2회 풀기', 'lq'),
    T('s2', 'SQLD 접수', 'in'),
    T('s3', 'SQLD 요약 노트', 'lq'),
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
  assert.deepEqual(names, ['K 인공지능 제조 데이터 공모전', 'SQLD', 'UniPort'].sort())
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
console.log('projects ok')
