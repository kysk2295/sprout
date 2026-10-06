// 31 §12.13 프로젝트 넣기 점수 — 실제처럼 아무렇게나 넣은 할 일 시나리오(K 데이터 공모전, 팀원 민수·지은)
import assert from 'node:assert/strict'
import { focusApplies, hintWord, personInTitle, projectCandidates, PSCORE, reasonLine, seriesKey, splitPeople, type ScoreInput, type ScoreTask } from './projectScore.ts'
import { initPlan, planReduce, type PlanState } from './planChat.ts'
import { buildPlanView } from './planView.ts'

// ── 이어지는 이름 ──
assert.equal(seriesKey('1차 회의'), seriesKey('2차 회의'))
assert.equal(seriesKey('회의 3차'), seriesKey('1차 회의'), '순서가 바뀌어도')
assert.equal(seriesKey('1회차 미팅'), seriesKey('2회 미팅'), '회차 = 회')
assert.equal(seriesKey('2주차 스터디'), seriesKey('3주차 스터디'))
assert.equal(seriesKey('발표 part 2'), seriesKey('발표 Part 1'))
assert.notEqual(seriesKey('1차 회의'), seriesKey('1주차 회의'), '단위가 다르면 다른 줄')
assert.equal(seriesKey('2차'), null, '줄기가 없으면 없음')
assert.equal(seriesKey('회의'), null)
assert.equal(seriesKey('3회의'), null, '회의의 회는 단위가 아님')

// ── 팀원 이름 ──
assert.deepEqual(splitPeople('민수, 지은'), ['민수', '지은'])
assert.deepEqual(splitPeople('민수랑 지은이'), ['민수', '지은'])
assert.deepEqual(splitPeople('👤민수 · 교수님'), ['민수', '교수님'])
assert.deepEqual(splitPeople('혼자 해'), [])

// ── 시나리오 ──
const today = '2026-10-06'
const at = (hm: string, day = today) => `${day}T${hm}:00.000Z`
const tags = [
  { id: 'P', name: 'K 데이터 공모전', kind: 'project', source: 'user', aliases: null },
  { id: 'E', name: 'SQLD', kind: 'project', source: 'ai', aliases: null }, // 끝난 프로젝트
  { id: 'pm', name: '민수', kind: 'person', source: 'user' },
  { id: 'pj', name: '지은', kind: 'person', source: 'user' }
]
const lists = [{ id: 'in', name: '기본함', kind: 'inbox' }, { id: 'ls', name: '학교' }]
const base: ScoreTask[] = [
  { id: 'm1', title: 'K 데이터 공모전 신청', list_id: 'ls', status: 0, due_at: '2026-10-16', created_at: at('09:00', '2026-10-01') },
  { id: 'm2', title: '1차 회의', list_id: 'in', status: 1, due_at: '2026-10-05', completed_at: at('18:00', '2026-10-05'), created_at: at('09:01', '2026-10-01') },
  { id: 'e1', title: 'SQLD 접수', list_id: 'in', status: 1, due_at: '2026-09-01', completed_at: at('10:00', '2026-09-01'), created_at: at('09:00', '2026-08-20') },
  // 아무렇게나 넣은 새 할 일(기본함, 날짜 없음)
  { id: 'n1', title: '회의', list_id: 'in', status: 0, created_at: at('10:00') },
  { id: 'n2', title: '민수한테 자료', list_id: 'in', status: 0, created_at: at('10:01') },
  { id: 'n3', title: '2차 회의', list_id: 'in', status: 0, created_at: at('10:02') },
  { id: 'n4', title: '회식', list_id: 'in', status: 0, created_at: at('10:03') },
  { id: 'n6', title: '장보기', list_id: 'in', status: 0, created_at: at('10:04') },
  { id: 'n5', title: '데이터 전처리', list_id: 'in', status: 0, created_at: at('13:00') },
  { id: 'n7', title: '빨래', list_id: 'in', status: 0, created_at: at('18:00') },
  { id: 'n8', title: 'SQLD 기출 풀기', list_id: 'in', status: 0, created_at: at('19:00') }
]
const links = [
  { id: 'l1', task_id: 'm1', tag_id: 'P', source: 'user', state: 'accepted' },
  { id: 'l2', task_id: 'm2', tag_id: 'P', source: 'user', state: 'accepted' },
  { id: 'l3', task_id: 'e1', tag_id: 'E', source: 'rule', state: 'accepted' }
]
const team = [
  { from_type: 'tag', from_id: 'P', to_type: 'tag', to_id: 'pm', field: 'project', state: 'accepted' },
  { from_type: 'tag', from_id: 'P', to_type: 'tag', to_id: 'pj', field: 'project', state: 'accepted' }
]
const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({ tags, tasks: base, links, lists, relations: team, today, ...over })
const r = projectCandidates(input())
const autoOf = (id: string) => r.auto.find((c) => c.taskId === id)
const askOf = (id: string) => r.ask.find((c) => c.taskId === id)
assert.deepEqual(r.auto.map((c) => c.taskId).sort(), ['n2', 'n3'], `붙는 것 = 팀원 이름·이어지는 이름 ${JSON.stringify(r.auto.map((c) => [c.taskId, c.score]))}`)
assert.equal(autoOf('n2')!.tagId, 'P')
assert.ok(autoOf('n2')!.reasons.some((x) => x.why === 'team'), '민수한테 자료 = 팀원')
assert.ok(autoOf('n3')!.reasons.some((x) => x.why === 'series'), '2차 회의 = 이어지는 이름')
assert.deepEqual(r.ask.map((c) => c.taskId).sort(), ['n1', 'n4', 'n5'], `묻는 것 ${JSON.stringify(r.ask.map((c) => [c.taskId, c.score]))}`)
assert.ok(askOf('n1')!.reasons.some((x) => x.why === 'burst'), '회의 = 같은 때 입력(두 번째 바퀴)')
assert.ok(askOf('n4')!.reasons.some((x) => x.why === 'burst'), '회식 = 같은 때 입력만으로 후보')
assert.ok(askOf('n5')!.reasons.some((x) => x.why === 'similar'), '데이터 전처리 = 비슷한 낱말')
for (const id of ['n6', 'n7']) assert.ok(!autoOf(id) && !askOf(id), `생활 낱말은 안 붙고 안 묻는다 (${id})`)
assert.ok(!autoOf('n8') && !askOf('n8'), '끝난 프로젝트(SQLD)는 받지 않는다')
assert.equal(reasonLine(askOf('n1')!), "같은 때 입력 · 비슷한 일 '회의'")
for (const c of [...r.auto, ...r.ask]) assert.ok(c.score >= PSCORE.ask && c.score <= 100)

// 중간 신호만 쌓여도(같은 때 + 같은 리스트) 붙지 않고 묻기까지만
const sameList = projectCandidates(input({ tasks: base.map((t) => (t.id === 'n1' ? { ...t, list_id: 'ls' } : t)) }))
assert.ok(sameList.ask.some((c) => c.taskId === 'n1' && c.score === PSCORE.auto - 1) && !sameList.auto.some((c) => c.taskId === 'n1'), '강한 신호 없으면 69에서 멈춤')
// 같은 때가 아니면 회식은 증거가 없다
const late = base.map((t) => (t.id === 'n4' ? { ...t, created_at: at('21:00') } : t))
assert.ok(!projectCandidates(input({ tasks: late })).ask.some((c) => c.taskId === 'n4'), '혼자 늦게 넣은 회식은 안 묻는다')

// 답 = 규칙: 아니(dismissed) → 다시 안 묻는다 · 응(배운 낱말 '회의') → 다음 '회의 준비'는 바로 붙음
const no = projectCandidates(input({ links: [...links, { id: 'x', task_id: 'n1', tag_id: 'P', source: 'rule', state: 'dismissed' }] }))
assert.ok(!no.ask.some((c) => c.taskId === 'n1') && !no.auto.some((c) => c.taskId === 'n1'))
assert.equal(hintWord('회의'), '회의')
assert.equal(hintWord('2차 회의'), '회의', '숫자 낱말 뺌')
const learned = projectCandidates(input({
  tasks: [...base, { id: 'n9', title: '회의 준비', list_id: 'in', status: 0, created_at: at('20:00') }],
  relations: [...team, { from_type: 'tag', from_id: 'P', to_type: 'hint', to_id: '회의', field: 'hint', state: 'accepted' }]
}))
assert.ok(learned.auto.some((c) => c.taskId === 'n9' && c.reasons.some((x) => x.why === 'hint')), '배운 낱말')
// 배운 낱말은 기간 밖(±14일 넘게)에선 안 먹는다
const far = projectCandidates(input({
  tasks: [...base, { id: 'n9', title: '회의 준비', list_id: 'in', status: 0, due_at: '2026-12-20', created_at: at('20:00') }],
  relations: [...team, { from_type: 'tag', from_id: 'P', to_type: 'hint', to_id: '회의', field: 'hint', state: 'accepted' }]
}))
assert.ok(!far.auto.some((c) => c.taskId === 'n9'), '기간 밖')
assert.equal(personInTitle('지은이랑 통화', tags.filter((t) => t.kind === 'person')), 'pj')

// 열린 프로젝트가 둘이면 '회의'는 덜 확실 — 붙지 않는다
const two = projectCandidates(input({
  tags: [...tags, { id: 'Q', name: '모두의창업', kind: 'project', source: 'user', aliases: null }],
  tasks: [...base, { id: 'q1', title: '창업 회의', list_id: 'ls', status: 0, due_at: '2026-10-08', created_at: at('09:00', '2026-09-30') }],
  links: [...links, { id: 'lq', task_id: 'q1', tag_id: 'Q', source: 'user', state: 'accepted' }]
}))
assert.ok(!two.auto.some((c) => c.taskId === 'n1'))
assert.ok(two.auto.some((c) => c.taskId === 'n2' && c.tagId === 'P'), '팀원 이름은 그래도 붙음')

// ── 지금 집중 칩 ──
const focus = { id: 'P', name: 'K 데이터 공모전', ended: false, lists: ['in', 'ls'] }
const others = [{ id: 'P', name: 'K 데이터 공모전' }, { id: 'Q', name: '모두의창업' }, { id: 'E', name: 'SQLD', ended: true }]
assert.equal(focusApplies(focus, { title: '회의' }, others), true)
assert.equal(focusApplies(focus, { title: '' }, others), false)
assert.equal(focusApplies(focus, { title: '회의', tag_ids: ['Q'] }, others), false, '#다른 프로젝트')
assert.equal(focusApplies(focus, { title: '회의', list_id: 'lz' }, others), false, '상관없는 ~리스트')
assert.equal(focusApplies(focus, { title: '회의', list_id: 'ls' }, others), true, '구성원이 있는 리스트')
assert.equal(focusApplies(focus, { title: '모두의창업 서류' }, others), false, '다른 프로젝트 이름')
assert.equal(focusApplies(focus, { title: 'SQLD 회의' }, others), true, '끝난 프로젝트 이름은 막지 않음')
assert.equal(focusApplies(focus, { title: '장보기' }, others), false, '생활 낱말')
assert.equal(focusApplies({ ...focus, ended: true }, { title: '회의' }, others), false, '끝난 집중')
assert.equal(focusApplies(null, { title: '회의' }, others), false)

// 계획 보기: 집중 표시 + 제안은 예전 '자동' 덩어리도
const pv = buildPlanView({
  tasks: base.map((t) => ({ ...t, status: t.status ?? 0, priority: 0, list_id: t.list_id })), tags: tags.map((t) => ({ ...t, aliases: t.aliases ?? null, source: t.source ?? null, home_type: null, home_id: null, topic_id: null, kind: t.kind })),
  links, lists: lists.map((l) => ({ ...l, emoji: null, folder_id: null, kind: l.kind ?? null })), folders: [], seq: [], pstore: { dismissed: [], confirmed: {} }, today, focus: 'P'
})
assert.equal(pv.projects.find((p) => p.tag.id === 'P')!.focus, true)
assert.equal(pv.projects.find((p) => p.tag.id === 'E')!.focus, false)

// ── 같이 계획 짜기 팀원 물음 ──
let s: PlanState = initPlan('수달', today)
const step = (ev: Parameters<typeof planReduce>[1]) => { const o = planReduce(s, ev); s = o.state; return o.effects }
step({ type: 'start', askTeam: true })
step({ type: 'answer', text: 'K 데이터 공모전' })
step({ type: 'goalReady', goal: { id: 'g', title: 'K 데이터 공모전', due: '2026-10-16' }, steps: [] })
step({ type: 'stepsReady', steps: [{ id: 's1', title: '자료 조사', done: false }] })
step({ type: 'chip', id: 'none' })
step({ type: 'chip', id: 'tomorrow' })
assert.equal(s.phase, 'team', '첫 걸음 뒤 팀원')
const fx = step({ type: 'answer', text: '민수, 지은' })
assert.deepEqual(fx.find((f) => f.kind === 'team'), { kind: 'team', names: ['민수', '지은'] })
assert.equal(s.phase, 'end')
// 팀원을 안 묻는 대화(프로젝트 안에서 짜기)
s = initPlan('수달', today)
step({ type: 'start', goal: { id: 'g', title: '발표', due: null }, steps: [{ id: 's1', title: '자료', done: false }, { id: 's2', title: '연습', done: false }] })
step({ type: 'skip' })
step({ type: 'chip', id: 'none' })
step({ type: 'chip', id: 'today' })
assert.equal(s.phase, 'end')

console.log('projectScore ok')
