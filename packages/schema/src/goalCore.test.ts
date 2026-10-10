// goalCore 시험(실제 SQL — sql.js): 10 §4.6 목표 만들기·검사·이름·목표 수·연결 진행·지우기 되돌리기·순서 + §4.2 XP 규칙
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from './index.ts'
import { insertStmt, type CoreDb, type Stmt } from './taskCore.ts'
import {
  checkGoalTitle, goalsRatio, GOAL_COLS, GOAL_TEMPLATES, linkedCount, linkLabel, moveGoal, parseGoal, planCreateGoal, planRemoveGoal, planRenameGoal,
  planReorderGoals, planRestoreGoal, planSetGoalLink, planSetGoalProgress, planSetGoalTarget, retitleForTarget, syncLinkedGoals, weekBounds, type GoalEnv, type GoalRow
} from './goalCore.ts'

const SQL = await initSqlJs()
const sqldb = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) sqldb.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = sqldb.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const db: CoreDb = { getAll: async <T,>(sql: string, p?: unknown[]) => all(sql, p) as T[], get: async <T,>(sql: string, p?: unknown[]) => (all(sql, p)[0] ?? null) as T | null }
const run = async (stmts: Stmt[]) => { sqldb.run('BEGIN'); try { for (const s of stmts) sqldb.run(s.sql, s.params as never); sqldb.run('COMMIT') } catch (e) { sqldb.run('ROLLBACK'); throw e } }
let n = 0
let clock = 0
const env: GoalEnv = { today: '2026-10-07', owner: 'user-1', now: () => new Date(Date.UTC(2026, 9, 7, 1, 0, clock++)).toISOString(), uuid: () => `g${++n}` }
const week = '2026-10-05' // 월요일
const xpSum = () => Number(all('SELECT coalesce(sum(amount),0) n FROM xp_events')[0].n)
const goal = (id: string) => all(`SELECT ${GOAL_COLS} FROM kpis WHERE id = ?`, [id])[0] as unknown as GoalRow
const order = () => all('SELECT title FROM kpis WHERE week_start = ? ORDER BY sort_order', [week]).map((r) => r.title)
const create = async (title: string, target = 1, link?: { kind: 'none' | 'tasks' | 'tag' | 'list'; id?: string }) => {
  const r = await planCreateGoal(db, env, week, { title, target, link })
  if ('error' in r) return r.error
  await run(r.stmts)
  return r.id
}

// ── 글: parseGoal · 검사 ──
assert.deepEqual(parseGoal('  운동   3번 '), { title: '운동 3번', target: 3 })
assert.equal(parseGoal('운동 2번 하기').target, 2) // 가운데 숫자도 하나뿐이면
assert.equal(parseGoal('2번 보고 3번 쓰기').target, 1) // 여럿이면 모름
assert.equal(parseGoal('2026년 목표').target, 1)
assert.deepEqual(parseGoal('물 8회'), { title: '물 8회', target: 8 })
assert.deepEqual(parseGoal('논문 하나 읽기'), { title: '논문 하나 읽기', target: 1 })
assert.deepEqual(checkGoalTitle('   ', []), { ok: false, error: 'empty' })
assert.deepEqual(checkGoalTitle('가'.repeat(61), []), { ok: false, error: 'long' })
assert.deepEqual(checkGoalTitle('운동3번', [{ id: 'a', title: '운동 3번' }]), { ok: false, error: 'dup' })
assert.deepEqual(checkGoalTitle('운동 3번', [{ id: 'a', title: '운동 3번' }], 'a'), { ok: true, title: '운동 3번' }) // 자기 자신은 괜찮다

// ── 만들기: 검사 · 5개 한도 · 새 목표는 맨 아래 ──
const read = (await create('논문 읽기')) as string
assert.equal(await create(' 논문읽기 '), 'dup')
assert.equal(await create(''), 'empty')
const gym = (await create('운동 3번', 3)) as string
assert.equal(goal(gym).target, 3)
assert.equal(goal(gym).link_kind, 'none')
assert.deepEqual(order(), ['논문 읽기', '운동 3번'])

// ── 이름 바꾸기 ──
assert.deepEqual(await planRenameGoal(db, env, goal(read), '운동 3번'), { error: 'dup' })
assert.deepEqual(await planRenameGoal(db, env, goal(read), '  '), { error: 'empty' })
await run((await planRenameGoal(db, env, goal(read), '논문  하나 읽기')) as Stmt[])
assert.equal(goal(read).title, '논문 하나 읽기')

// ── 목표 수: 진행 2/3 → 목표를 2로 내리면 그 순간 달성 +30, 다시 4로 올리면 풀리고 되돌림 ──
await run((await planSetGoalProgress(db, env, goal(gym), 2)).stmts)
assert.equal(goal(gym).progress, 2)
let r = await planSetGoalTarget(db, env, goal(gym), 2)
await run(r.stmts)
assert.equal(r.gained, 30)
assert.equal(goal(gym).status, 'achieved')
assert.equal(goal(gym).target, 2)
assert.equal(goal(gym).title, '운동 2번') // 제목 숫자 = 지난 목표 수(3)라 같이 바뀜(10 §4.6)
r = await planSetGoalTarget(db, env, goal(gym), 4)
await run(r.stmts)
assert.equal(goal(gym).status, 'active')
assert.equal(goal(gym).target, 4)
assert.equal(goal(gym).title, '운동 4번')
assert.equal(xpSum(), 0)
// 제목 숫자 맞추기: 지난 목표 수와 같을 때만, 하나일 때만
assert.equal(retitleForTarget('운동 2번 하기', 2, 1), '운동 1번 하기')
assert.equal(retitleForTarget('책 3권 · 10회 달리기', 10, 12), '책 3권 · 12회 달리기')
assert.equal(retitleForTarget('운동 2번 하기', 3, 1), null) // 숫자가 지난 목표 수와 다르면 그대로
assert.equal(retitleForTarget('논문 읽기', 1, 2), null)
assert.equal(retitleForTarget('2번 보고 2번 쓰기', 2, 3), null) // 어느 것인지 모르면 그대로
assert.equal(retitleForTarget('2026년 12번 출근', 12, 13), '2026년 13번 출근') // 2026은 번이 아니다
assert.equal(retitleForTarget('물 8개', 8, 8), null)
assert.equal((await planSetGoalTarget(db, env, goal(gym), 0)).stmts.find((s) => s.sql.startsWith('UPDATE kpis'))!.params![0], 1) // 1 아래로 안 간다
r = await planSetGoalTarget(db, env, goal(gym), 120)
assert.equal(r.stmts.find((s) => s.sql.startsWith('UPDATE kpis'))!.params![0], 99) // 99까지

// ── 연결: 끝낸 할 일 · 태그 · 리스트(그 주 안, 지운 것·안 끝낸 것·받지 않은 태그는 안 셈) ──
const [from] = weekBounds(week)
const inWeek = (d: number) => new Date(Date.parse(from) + d * 86400000 + 3600000).toISOString()
await run([
  insertStmt('tags', { id: 'tg', name: '운동' }), insertStmt('lists', { id: 'ls', name: '업무' }),
  insertStmt('tasks', { id: 't1', title: '달리기', status: 1, completed_at: inWeek(0), list_id: 'ls' }),
  insertStmt('tasks', { id: 't2', title: '헬스', status: 1, completed_at: inWeek(2) }),
  insertStmt('tasks', { id: 't3', title: '지난주', status: 1, completed_at: inWeek(-1) }),
  insertStmt('tasks', { id: 't4', title: '안 끝냄', status: 0, list_id: 'ls' }),
  insertStmt('tasks', { id: 't5', title: '지움', status: 1, completed_at: inWeek(1), deleted_at: inWeek(1) }),
  insertStmt('task_tags', { id: 'x1', task_id: 't1', tag_id: 'tg' }), insertStmt('task_tags', { id: 'x2', task_id: 't2', tag_id: 'tg', state: 'suggested' })
])
assert.equal(await linkedCount(db, { week_start: week, link_kind: 'tasks', link_id: null }), 2)
assert.equal(await linkedCount(db, { week_start: week, link_kind: 'tag', link_id: 'tg' }), 1)
assert.equal(await linkedCount(db, { week_start: week, link_kind: 'list', link_id: 'ls' }), 1)
assert.equal(await linkedCount(db, { week_start: week, link_kind: 'tag', link_id: null }), 0)

// 할 일 2개 끝내기(끝낸 할 일 모두) — 만들고 맞추면 바로 달성 +30
const tasks2 = (await create('할 일 2개 끝내기', 2, { kind: 'tasks' })) as string
assert.equal(goal(tasks2).link_kind, 'tasks')
assert.equal(await syncLinkedGoals(db, env, week, run), 30)
assert.equal(goal(tasks2).status, 'achieved')
assert.equal(await syncLinkedGoals(db, env, week, run), 0) // 다시 맞춰도 그대로
// 할 일 완료를 풀면(1개) 되돌림, 다시 끝내면 다시 받는다
sqldb.run("UPDATE tasks SET status = 0 WHERE id = 't2'")
await syncLinkedGoals(db, env, week, run)
assert.equal(goal(tasks2).status, 'active')
assert.equal(goal(tasks2).progress, 1)
assert.equal(xpSum(), 0)
sqldb.run("UPDATE tasks SET status = 1 WHERE id = 't2'")
assert.equal(await syncLinkedGoals(db, env, week, run), 30)
// 직접 체크 목표를 태그로 연결 → 센 수(1)로 진행이 바뀐다, 직접 체크로 되돌리면 진행 그대로
await run((await planSetGoalLink(db, env, goal(gym), { kind: 'tag', id: 'tg' })).stmts)
assert.equal(goal(gym).link_id, 'tg')
assert.equal(goal(gym).progress, 1)
await run((await planSetGoalLink(db, env, goal(gym), { kind: 'none' })).stmts)
assert.equal(goal(gym).link_kind, 'none')
assert.equal(goal(gym).link_id, null)
assert.equal(goal(gym).progress, 1)
// 연결 목표의 목표 수를 바꾸면 센 수로 다시 판정: 끝낸 할 일 2개인데 목표 3 → 풀림
r = await planSetGoalTarget(db, env, goal(tasks2), 3)
await run(r.stmts)
assert.equal(goal(tasks2).status, 'active')
assert.equal(goal(tasks2).progress, 2)
assert.equal(linkLabel(goal(tasks2), { tags: new Map(), lists: new Map() }), '끝낸 할 일')
assert.equal(linkLabel({ link_kind: 'tag', link_id: 'tg' }, { tags: new Map([['tg', '운동']]), lists: new Map() }), '#운동')
assert.equal(linkLabel({ link_kind: 'list', link_id: 'gone' }, { tags: new Map(), lists: new Map() }), '연결 끊김')

// ── 순서 ──
assert.deepEqual(moveGoal(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'])
assert.deepEqual(moveGoal(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a'])
await run(planReorderGoals(env, moveGoal(all('SELECT id FROM kpis WHERE week_start = ? ORDER BY sort_order', [week]).map((x) => x.id as string), tasks2, read)))
assert.deepEqual(order(), ['할 일 3개 끝내기', '논문 하나 읽기', '운동 4번']) // 목표 수를 바꾸면 제목 숫자도(10 §4.6)
// 새 목표는 순서를 바꾼 뒤에도 맨 아래
const book = (await create('책 한 권 읽기')) as string
assert.deepEqual(order().at(-1), '책 한 권 읽기')

// ── 지우기 → 되돌리기: 같은 id·제목·진행·순서, 진행이 차 있으면 다시 달성(XP 맞음) ──
await run((await planSetGoalProgress(db, env, goal(read), 1)).stmts)
assert.equal(xpSum(), 30)
const removed = await planRemoveGoal(db, env, read)
await run(removed.stmts)
assert.equal(all('SELECT count(*) n FROM kpis WHERE id = ?', [read])[0].n, 0)
assert.equal(xpSum(), 0) // 지우면 그 목표 XP 되돌림
const back = planRestoreGoal(env, removed.row!)
await run(back.stmts)
r = await planSetGoalProgress(db, env, back.goal, removed.row!.progress)
await run(r.stmts)
assert.equal(r.gained, 30)
assert.equal(goal(read).title, '논문 하나 읽기')
assert.equal(goal(read).status, 'achieved')
assert.deepEqual(order(), ['할 일 3개 끝내기', '논문 하나 읽기', '운동 4번', '책 한 권 읽기'])
assert.equal(xpSum(), 30)

// ── 모두 달성 보너스: 넷 다 이루면 +20, 하나 지우면(남은 것 다 이룸·2개 이상) 보너스 유지, 못 이룬 것만 남으면 되돌림 ──
await run((await planSetGoalProgress(db, env, goal(gym), 4)).stmts)
await run((await planSetGoalProgress(db, env, goal(book), 1)).stmts)
sqldb.run("INSERT INTO tasks (id, title, status, completed_at) VALUES ('t6', '하나 더', 1, ?)", [inWeek(3)])
await syncLinkedGoals(db, env, week, run)
assert.equal(goal(tasks2).status, 'achieved')
// XP는 3개까지(넷째 할 일 2개 끝내기는 XP 없음) + 보너스 20
assert.equal(xpSum(), 30 * 3 + 20)
await run((await planRemoveGoal(db, env, book)).stmts)
assert.equal(xpSum(), 30 * 2 + 20) // 지운 '책' XP는 되돌리고, 남은 셋이 다 이뤄 보너스는 그대로
await run((await planSetGoalProgress(db, env, goal(gym), 3)).stmts) // 하나 풀면 그 XP와 보너스 되돌림
assert.equal(xpSum(), 30)
await run((await planRemoveGoal(db, env, read)).stmts)
assert.equal(xpSum(), 0)

// ── 5개 한도 ──
for (const t of ['가', '나', '다']) await create(t)
assert.equal(all('SELECT count(*) n FROM kpis WHERE week_start = ?', [week])[0].n, 5)
assert.equal(await create('라'), 'full')

// ── 고정 칸 막대 · 빈 상태 칩 ──
assert.equal(goalsRatio([]), 0)
assert.equal(goalsRatio([{ progress: 1, target: 2, status: 'active' }, { progress: 0, target: 1, status: 'achieved' }]), 0.75)
assert.equal(GOAL_TEMPLATES[0].link?.kind, 'tasks')
assert.equal(all('SELECT DISTINCT owner_id o FROM kpis')[0].o, 'user-1')

console.log('goalCore: ok')
