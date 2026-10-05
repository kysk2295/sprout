// 31 §12 점검 — 주간 점검 3단계: 주 고르기 · 밀린 일 · 큰 숫자 · 프로젝트 진행 · 7칸 · 목표 제안·고르기 · 진행 기억 · 요약·한마디 · DB(정하기·되돌리기·목표 만들기·되돌리기)
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { insert, run } from '../src/renderer/src/data/mutations'
import {
  applyDecision, createGoals, finishSummary, freshProgress, loadProgress, lookColumns, lookLine, membershipOf, mergeMissed, missedLine, missedOf, pickLine, pickRoom,
  goStep, planColumns, projectProgress, restoreSnap, reviewTarget, saveProgress, shortTitle, suggestGoals, togglePick, undecided, undoGoals, weekNumbers, type RGoal, type RTask
} from '../src/renderer/src/data/review'

// ── 주 ──
assert.deepEqual(reviewTarget(new Date('2026-10-05T21:00')), { week: '2026-10-05', planWeek: '2026-10-12' }) // 월요일 밤 → 이번 주
assert.deepEqual(reviewTarget(new Date('2026-10-04T21:00')), { week: '2026-09-28', planWeek: '2026-10-05' }) // 일요일 20시 뒤 → 이번 주
assert.deepEqual(reviewTarget(new Date('2026-10-05T09:00')), { week: '2026-09-28', planWeek: '2026-10-05' }) // 월요일 아침 → 지난주 돌아보고 이번 주 고르기
assert.deepEqual(reviewTarget(new Date('2026-10-08T15:00')), { week: '2026-10-05', planWeek: '2026-10-12' }) // 수요일 → 이번 주

const week = '2026-09-29'.replace('29', '28') // 9/28(월)
const today = '2026-10-04' // 일요일
const iso = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00`).toISOString()
const T = (id: string, o: Partial<RTask> = {}): RTask => ({ id, title: id, status: 0, parent_id: null, due_at: null, completed_at: null, list_id: 'L1', ...o })
const tasks: RTask[] = [
  T('d1', { status: 1, due_at: '2026-09-28', completed_at: iso('2026-09-28') }),
  T('d2', { status: 1, due_at: '2026-09-30T09:00', completed_at: iso('2026-10-01'), list_id: 'L2' }), // 끝낸 날 칸에
  T('d3', { status: 1, completed_at: iso('2026-09-27') }), // 지난주에 끝냄 → 안 셈
  T('m1', { due_at: '2026-09-30' }),
  T('m2', { due_at: '2026-10-02T10:00', list_id: 'L2' }),
  T('m3', { due_at: '2026-09-20' }), // 지난주 이전 → 이번 점검 밀린 일 아님(19 정리 몫)
  T('sub', { due_at: '2026-09-29', parent_id: 'm1' }), // 하위 → 밀린 일 아님
  T('w', { due_at: '2026-10-01', status: 2 }), // 하지 않음
  T('o1', { due_at: '2026-10-04' }), // 오늘 = 아직 남음
  T('n1', { due_at: '2026-10-08', list_id: 'L2' }), // 다음 주
  T('n2', { due_at: '2026-10-15' }), // 다다음 주
  T('far', { due_at: '2026-11-30' })
]

// 밀린 일 = 그 주 마감 · 열림 · 최상위 · 오늘 전
assert.deepEqual(missedOf(tasks, week, today).map((t) => t.id), ['m1', 'm2'])
assert.deepEqual(missedOf(tasks, week, '2026-10-12').map((t) => t.id), ['m1', 'm2', 'o1']) // 주가 지나면 일요일까지

const goals: RGoal[] = [
  { id: 'g1', week_start: week, title: 'SQLD 기출 3회', target: 3, progress: 2, status: 'active' },
  { id: 'g2', week_start: week, title: '운동', target: 1, progress: 1, status: 'achieved' },
  { id: 'g3', week_start: '2026-10-05', title: '이미 있는 목표', target: 1, progress: 0, status: 'active' }
]
const nums = weekNumbers(tasks, goals, week, 2)
assert.deepEqual([nums.done, nums.missed, nums.goals.achieved, nums.goals.total, nums.goals.lead?.id], [2, 2, 1, 2, 'g1'])
assert.equal(lookLine(nums), 'SQLD 기출 3회는 2/3 했네! 이번 주 2개 끝냈어.')
assert.equal(lookLine(weekNumbers([], [], week, 0)), '조용한 한 주였네. 다음 주를 같이 정해 보자.')
assert.equal(lookLine({ done: 18, missed: 4, goals: { achieved: 0, total: 0, lead: null } }), '이번 주 18개나 끝냈어.')

// 7칸: 끝낸 일은 끝낸 날에, 못 한 일 ✕, 오늘 남은 일
const cols = lookColumns(tasks, week, today)
assert.equal(cols.length, 7)
assert.equal(cols[0].label, '월 9/28')
assert.deepEqual(cols[0].bars.map((b) => [b.id, b.tone]), [['d1', 'done']])
assert.deepEqual(cols[2].bars.map((b) => [b.id, b.tone]), [['m1', 'miss']]) // 9/30: d2는 10/1로, w(하지 않음)는 빠짐
assert.deepEqual(cols[3].bars.map((b) => b.id), ['d2'])
assert.deepEqual(cols[6].bars.map((b) => [b.id, b.tone]), [['o1', 'open']])

// 프로젝트: 태그가 없으면 리스트(기본함 이름)
const lists = [{ id: 'IN', name: 'Inbox', emoji: null, kind: 'inbox' }, { id: 'L1', name: '공부', emoji: '📜', kind: 'normal' }, { id: 'L2', name: '공모전', emoji: '🏆', kind: 'normal' }]
const byList = membershipOf(tasks, [], [], lists)
assert.equal(byList.byTag, false)
assert.equal(byList.projects[0].name, '기본함')
const prog = projectProgress(tasks, byList.projects, byList.member, week)
assert.deepEqual(prog.map((p) => [p.name, p.done, p.total]), [['공부', 1, 3], ['공모전', 1, 2]]) // 공부: d1·m1·o1 / 공모전: d2·m2
// 태그가 있으면 project 태그로
const byTag = membershipOf(tasks, [{ id: 'P', name: 'UniPort', kind: 'project' }, { id: 'Q', name: '주제', kind: 'topic' }], [{ id: '1', task_id: 'd1', tag_id: 'P' }, { id: '2', task_id: 'm1', tag_id: 'P' }, { id: '3', task_id: 'n1', tag_id: 'P' }, { id: '4', task_id: 'o1', tag_id: 'P', state: 'dismissed' }, { id: '5', task_id: 'd2', tag_id: 'Q' }], lists)
assert.equal(byTag.byTag, true)
assert.deepEqual(byTag.projects, [{ id: 'P', name: 'UniPort', emoji: '🚀' }]) // 계획 모드와 같은 이름·이모지 규칙
assert.deepEqual(byTag.member.get('sub'), ['P']) // 하위 할 일도 구성원(projectMembers)
// 집(리스트)이 있는 프로젝트: 그 리스트 할 일 전부
// 프로젝트 마감 말(제출)이 있으면 그 날을 마감으로
const comp = membershipOf([...tasks, T('c1', { title: '공모전 팀 회의', due_at: '2026-10-06' }), T('c2', { title: '공모전 제출', due_at: '2026-10-10' })], [{ id: 'C', name: '데이터 공모전', kind: 'project' }], [{ id: 'a', task_id: 'c1', tag_id: 'C' }, { id: 'b', task_id: 'c2', tag_id: 'C' }], lists)
const compSug = suggestGoals({ tasks: [...tasks, T('c1', { title: '공모전 팀 회의', due_at: '2026-10-06' }), T('c2', { title: '공모전 제출', due_at: '2026-10-10' })], projects: comp.projects, member: comp.member, goals: [], week, planWeek: '2026-10-05', today })[0]
assert.deepEqual([compSug.title, compSug.meta, compSug.due, compSug.dueWord], ['데이터 공모전: 팀 회의 · 제출', '프로젝트 · 제출 10/10', '2026-10-10', '제출'])
// 마감 일은 가까운 일이 많아도 늘 딸린다
const many = ['m1', 'm2', 'm3'].map((id, i) => T(id + 'x', { title: `공모전 일 ${i}`, due_at: `2026-10-0${6 + i}` }))
const mc = [...many, T('c2', { title: '공모전 제출', due_at: '2026-10-12' })]
const mm = membershipOf(mc, [{ id: 'C', name: '데이터 공모전', kind: 'project' }], mc.map((t) => ({ id: t.id, task_id: t.id, tag_id: 'C' })), lists)
assert.deepEqual(suggestGoals({ tasks: mc, projects: mm.projects, member: mm.member, goals: [], week, planWeek: '2026-10-05', today })[0].taskIds, ['m1x', 'm2x', 'c2'])
assert.equal(pickLine([compSug], today, '2026-10-05'), '데이터 공모전 제출이 토요일이야. 이건 꼭 넣자!')
const home = membershipOf(tasks, [{ id: 'H', name: '🏆 공모전', kind: 'project', home_type: 'list', home_id: 'L2' }], [], lists)
assert.deepEqual([home.projects[0].name, home.projects[0].emoji, [...home.member.keys()].sort()], ['공모전', '🏆', ['d2', 'm2', 'n1']])
assert.deepEqual(projectProgress(tasks, byTag.projects, byTag.member, week).map((p) => [p.name, p.done, p.total]), [['UniPort', 1, 2]])

// ── ③ 제안 ──
const sugs = suggestGoals({ tasks, projects: byTag.projects, member: byTag.member, goals, week, planWeek: '2026-10-05', today, exclude: new Set(['m1', 'm2']) })
assert.deepEqual(sugs.map((s) => s.key), ['carry:g1', 'project:P', 'deadline:n2']) // o1(오늘 마감)은 고를 주 전이라 빠짐
assert.equal(sugs[0].meta, '이번 주 2/3 이어서')
assert.deepEqual([sugs[1].title, sugs[1].taskIds, sugs[1].target, sugs[1].meta], ['UniPort: n1', ['n1'], 1, '프로젝트 · 마감 10/8'])
// 이어 가는 목표와 같은 제목 할 일은 그 목표에 딸리고 프로젝트 제안에서 빠진다(같은 일 두 번 제안 안 함)
const dupTasks = [...tasks, T('SQLD 기출 3회', { due_at: '2026-10-09' })]
const dupMem = membershipOf(dupTasks, [{ id: 'S', name: 'SQLD', kind: 'project' }], [{ id: '9', task_id: 'SQLD 기출 3회', tag_id: 'S' }], lists)
const dup = suggestGoals({ tasks: dupTasks, projects: dupMem.projects, member: dupMem.member, goals, week, planWeek: '2026-10-05', today })
assert.deepEqual(dup.find((s) => s.key === 'carry:g1')?.taskIds, ['SQLD 기출 3회'])
assert.ok(!dup.some((s) => s.key === 'project:S'))
// 반복 할 일은 마감 제안에서 빠지고, 중요도 높은 것이 앞
const rep = suggestGoals({ tasks: [T('r', { due_at: '2026-10-05', repeat_rule: 'FREQ=DAILY' }), T('lo', { due_at: '2026-10-06' }), T('hi', { due_at: '2026-10-12', priority: 5 })], projects: [], member: new Map(), goals: [], week, planWeek: '2026-10-05', today })
assert.deepEqual(rep.map((s) => s.key), ['deadline:hi', 'deadline:lo'])
// 줄인 이름이 같으면 한 번만(`팀 회의` · `공모전 팀 회의`)
const twin = membershipOf([T('x1', { title: '팀 회의', due_at: '2026-10-06' }), T('x2', { title: '공모전 팀 회의', due_at: '2026-10-07' }), T('x3', { title: '공모전 제출', due_at: '2026-10-10' })], [{ id: 'C', name: '공모전', kind: 'project' }], ['x1', 'x2', 'x3'].map((id) => ({ id, task_id: id, tag_id: 'C' })), lists)
assert.equal(suggestGoals({ tasks: [T('x1', { title: '팀 회의', due_at: '2026-10-06' }), T('x2', { title: '공모전 팀 회의', due_at: '2026-10-07' }), T('x3', { title: '공모전 제출', due_at: '2026-10-10' })], projects: twin.projects, member: twin.member, goals: [], week, planWeek: '2026-10-05', today })[0].title, '공모전: 팀 회의 · 제출')
assert.equal(shortTitle('UniPort 베타 배포', 'UniPort'), '베타 배포')
assert.equal(shortTitle('공모전 팀 회의', '데이터 공모전'), '팀 회의')
assert.equal(shortTitle('SQLD', 'SQLD'), 'SQLD')
assert.ok(!sugs.some((s) => s.taskIds.includes('far'))) // 2주 밖
// 다음 주에 같은 제목 목표가 있으면 뺀다 · 리스트로 묶을 땐 기본함은 프로젝트 제안 아님
const sugs2 = suggestGoals({ tasks: [...tasks, T('i1', { list_id: 'IN', due_at: '2026-10-06' })], projects: byList.projects, member: membershipOf([...tasks, T('i1', { list_id: 'IN' })], [], [], lists).member, goals: [...goals, { id: 'g4', week_start: '2026-10-05', title: 'SQLD 기출 3회', target: 3, progress: 0, status: 'active' }], week, planWeek: '2026-10-05', today })
assert.ok(!sugs2.some((s) => s.key === 'carry:g1'))
assert.ok(!sugs2.some((s) => s.key === 'project:IN'))
assert.ok(sugs2.some((s) => s.key === 'project:L2'))
assert.ok(sugs2.length <= 6)
assert.equal(pickLine(sugs, today, '2026-10-05'), 'UniPort 마감이 목요일이야. 이건 꼭 넣자!')
assert.equal(pickLine(sugs.slice(2), today, '2026-10-05'), 'n2 마감이 다다음 주 목요일이야. 이건 꼭 넣자!')
assert.equal(pickLine([{ key: 'd', kind: 'deadline', title: '안약', meta: '', target: 1, taskIds: [], due: '2026-10-05' }, sugs[1]], today, '2026-10-05'), 'UniPort 마감이 목요일이야. 이건 꼭 넣자!') // 프로젝트 마감이 먼저
assert.equal(pickLine(sugs.slice(2), '2026-10-05', '2026-10-05'), 'n2 마감이 다음 주 목요일이야. 이건 꼭 넣자!') // 월요일 아침: 고를 주 = 이번 주
assert.equal(pickLine([], today, '2026-10-05'), '다음 주 목표가 아직 없네. 직접 적어 볼까?')

// 고르기: 3개까지 · 주 5개 상한
assert.deepEqual([pickRoom(0), pickRoom(2), pickRoom(3), pickRoom(5)], [3, 3, 2, 0])
assert.deepEqual(togglePick(['a', 'b'], 'c', 3), ['a', 'b', 'c'])
assert.deepEqual(togglePick(['a', 'b', 'c'], 'd', 3), ['a', 'b', 'c']) // 자리 없음
assert.deepEqual(togglePick(['a', 'b', 'c'], 'b', 3), ['a', 'c'])
const pc = planColumns(tasks, '2026-10-05', new Set(['n1']))
assert.equal(pc[0].label, '월 10/5')
assert.deepEqual(pc[3].bars.map((b) => [b.id, b.tone]), [['n1', 'goal']])

// ── 진행 기억(그 주 안에서만) ──
const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
assert.deepEqual(loadProgress(week, store), freshProgress(week))
saveProgress({ ...freshProgress(week), step: 2, missed: [{ id: 'm1', due: '2026-09-30' }], decisions: { m1: 'next' } }, store)
assert.equal(loadProgress(week, store).step, 2)
assert.equal(loadProgress('2026-10-05', store).step, 1) // 다른 주 → 새로
mem.set('sprout.map.review', '{깨짐')
assert.equal(loadProgress(week, store).step, 1)
// 스테퍼: 가 본 단계까지 앞뒤로
const g3 = goStep(goStep(freshProgress(week), 2), 3)
assert.deepEqual([g3.step, g3.reached], [3, 3])
assert.deepEqual([goStep(g3, 1).step, goStep(g3, 1).reached], [1, 3])
const merged = mergeMissed([{ id: 'm1', due: '2026-09-30' }], [T('m1', { due_at: '2026-10-05' }), T('m2', { due_at: '2026-10-02T10:00' })])
assert.deepEqual(merged, [{ id: 'm1', due: '2026-09-30' }, { id: 'm2', due: '2026-10-02' }]) // 처음 본 마감을 기억, 새것은 뒤에
assert.deepEqual(undecided({ missed: merged, decisions: { m1: 'done' } }, new Set(['m1', 'm2'])), ['m2'])
assert.deepEqual(undecided({ missed: merged, decisions: {} }, new Set(['m1'])), ['m1']) // 지워진(안 보이는) 것은 빼고
assert.equal(missedLine(4, 4), '밀린 건 4개야. 하나씩 정하자. 귀찮으면 전부 다음 주로 넘겨도 돼.')
assert.equal(missedLine(0, 0), '밀린 일이 없어! 바로 다음으로 가자.')
assert.equal(finishSummary({ decisions: { a: 'next', b: 'next', c: 'someday', d: 'done' }, created: [{ goalId: 'x', title: 'x', removed: [] }, { goalId: 'y', title: 'y', removed: [] }, { goalId: 'z', title: 'z', removed: [] }] }), '주 목표 3개 · 다음 주로 2개 · 언젠가 1개 · 정리 1개')
assert.equal(finishSummary({ decisions: {}, created: [] }), '이번 주는 그대로 두었어요')

// ── DB: 정하기 · 되돌리기 · 목표 만들기 · 되돌리기 (sql.js) ──
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const ls = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) },
  window: {
    dispatchEvent: () => true,
    sprout: { db: { getAll: async (sql: string, p?: unknown[]) => all(sql, p), get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null, transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } } } }
  }
})
const task = (id: string, o: Record<string, unknown> = {}) => insert('tasks', { id, list_id: 'L1', parent_id: null, title: id, status: 0, priority: 0, due_at: null, start_at: null, is_all_day: 1, repeat_rule: null, sort_order: 1, ...o })
await run(task('A', { due_at: '2026-09-30T14:30', is_all_day: 0 }), task('B', { due_at: '2026-10-01' }), task('C', { due_at: '2026-10-02' }), task('C1', { parent_id: 'C' }), task('D', { due_at: '2026-10-03' }), task('N', { due_at: '2026-10-08' }))
const row = (id: string) => all('SELECT * FROM tasks WHERE id = ?', [id])[0]
const planWeek = '2026-10-05'

const sA = await applyDecision('A', 'next', planWeek, today)
assert.equal(row('A').due_at, '2026-10-05T14:30') // 다음 주 월요일, 시각 유지
const sB = await applyDecision('B', 'someday', planWeek, today)
assert.equal(row('B').due_at, null)
const sC = await applyDecision('C', 'done', planWeek, today)
assert.deepEqual([row('C').status, row('C1').status], [1, 1]) // 하위와 함께
assert.equal(all('SELECT count(*) n FROM xp_events')[0].n, 0) // XP 없음
const sD = await applyDecision('D', 'trash', planWeek, today)
assert.ok(row('D').deleted_at)
assert.deepEqual(sC.map((r) => r.id).sort(), ['C', 'C1'])
for (const s of [sA, sB, sC, sD]) await restoreSnap(s)
assert.deepEqual(['A', 'B', 'C', 'C1', 'D'].map((id) => [row(id).due_at, row(id).status, row(id).deleted_at]),
  [['2026-09-30T14:30', 0, null], ['2026-10-01', 0, null], ['2026-10-02', 0, null], [null, 0, null], ['2026-10-03', 0, null]])

// 목표: 할 일이 딸린 제안은 목표 선 + 횟수, 직접 적은 건 "운동 3번" → 3, 기존 목표 선은 옮기고 되돌릴 때 되살림
await run(insert('kpis', { id: 'OLDG', week_start: week, title: '예전 목표', target: 1, progress: 0, status: 'active', link_kind: 'none', sort_order: 1 }),
  insert('map_links', { id: 'OLDL', kind: 'goal', from_type: 'kpi', from_id: 'OLDG', to_id: 'N', source: 'user', state: 'accepted' }))
const created = await createGoals(planWeek, [
  { key: 'project:P', kind: 'project', title: 'UniPort: N · A', meta: '', target: 2, taskIds: ['N', 'A'] },
  { key: 'custom:1', kind: 'custom', title: '운동 3번', meta: '', target: 1, taskIds: [] }
])
assert.equal(created.length, 2)
const kp = all('SELECT id, title, target, week_start FROM kpis WHERE week_start = ? ORDER BY sort_order', [planWeek])
assert.deepEqual(kp.map((k) => [k.title, k.target]), [['UniPort: N · A', 2], ['운동 3번', 3]])
assert.deepEqual(all("SELECT to_id FROM map_links WHERE kind = 'goal' AND from_id = ? ORDER BY to_id", [created[0].goalId]).map((r) => r.to_id), ['A', 'N'])
assert.equal(all("SELECT count(*) n FROM map_links WHERE id = 'OLDL'")[0].n, 0)
await undoGoals(created)
assert.equal(all('SELECT count(*) n FROM kpis WHERE week_start = ?', [planWeek])[0].n, 0)
assert.deepEqual(all("SELECT from_id, to_id FROM map_links WHERE kind = 'goal'"), [{ from_id: 'OLDG', to_id: 'N' }])
// 주 5개 상한: 이미 4개면 하나만
for (let i = 0; i < 4; i++) await run(insert('kpis', { id: `K${i}`, week_start: planWeek, title: `기존 ${i}`, target: 1, progress: 0, status: 'active', sort_order: i }))
assert.equal((await createGoals(planWeek, [{ key: 'a', kind: 'custom', title: '하나', meta: '', target: 1, taskIds: [] }, { key: 'b', kind: 'custom', title: '둘', meta: '', target: 1, taskIds: [] }])).length, 1)

console.log('review ok')
