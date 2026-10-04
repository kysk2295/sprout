// taskCore 시험: 완료(하위 포함)·반복 다음 회차·완료 기록·체크 항목 초기화·XP 하루 10·완료 취소·멱등
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from './index.ts'
import { planComplete, planCompleteWithXp, planGrantTaskXp, planReopen, planReopenWithXp, planRevokeTaskXp, insertStmt, type CoreDb, type Stmt } from './taskCore.ts'

const SQL = await initSqlJs()
const sqldb = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) sqldb.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = sqldb.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const db: CoreDb = { getAll: async <T,>(sql: string, p?: unknown[]) => all(sql, p) as T[], get: async <T,>(sql: string, p?: unknown[]) => (all(sql, p)[0] ?? null) as T | null }
const run = (stmts: Stmt[]) => { sqldb.run('BEGIN'); try { for (const s of stmts) sqldb.run(s.sql, s.params as never); sqldb.run('COMMIT') } catch (e) { sqldb.run('ROLLBACK'); throw e } }
let n = 0
const env = { today: '2026-10-04', now: () => '2026-10-04T01:00:00.000Z', uuid: () => `u${++n}` }
const task = (id: string) => all('SELECT * FROM tasks WHERE id = ?', [id])[0]
const xpSum = () => Number(all('SELECT coalesce(sum(amount),0) n FROM xp_events')[0].n)

run([
  insertStmt('lists', { id: 'l1', name: '업무', kind: 'inbox' }),
  insertStmt('tasks', { id: 'p', list_id: 'l1', title: '부모', status: 0, priority: 3, due_at: '2026-10-04' }),
  insertStmt('tasks', { id: 'c', list_id: 'l1', parent_id: 'p', title: '자식', status: 0, priority: 0 }),
  insertStmt('tasks', { id: 'r', list_id: 'l1', title: '매일 운동', status: 0, priority: 1, start_at: '2026-10-04T08:00', due_at: '2026-10-04T09:00', is_all_day: 0, repeat_rule: 'FREQ=DAILY;COUNT=3', repeat_from: 'due' }),
  insertStmt('task_tags', { id: 'tt1', task_id: 'r', tag_id: 'g1' }),
  insertStmt('check_items', { id: 'ck1', task_id: 'r', title: '스트레칭', done: 1, completed_at: '2026-10-04T00:00:00Z' })
])

// ① 일반 할 일: 하위와 함께 완료
const p1 = await planComplete(db, ['p'], env)
assert.deepEqual(p1.open.sort(), ['c', 'p'])
run(p1.stmts)
assert.equal(task('p').status, 1)
assert.equal(task('c').status, 1)
// 이미 완료된 것은 다시 완료하지 않는다(멱등)
assert.equal((await planComplete(db, ['p'], env)).stmts.length, 0)

// ② 반복: 완료 기록 + 다음 회차(시각 유지) + 횟수 1 줄임 + 태그 복사 + 체크 항목 초기화
const p2 = await planComplete(db, ['r'], env)
assert.deepEqual(p2.repeating, ['r'])
assert.equal(p2.created.length, 1)
run(p2.stmts)
const r = task('r')
assert.equal(r.status, 0)
assert.equal(r.start_at, '2026-10-05T08:00')
assert.equal(r.due_at, '2026-10-05T09:00')
assert.match(String(r.repeat_rule), /COUNT=2/)
const rec = task(p2.created[0])
assert.equal(rec.status, 1)
assert.equal(rec.repeat_origin_id, 'r')
assert.equal(rec.due_at, '2026-10-04T09:00')
assert.equal(all('SELECT * FROM task_tags WHERE task_id = ?', [rec.id]).length, 1)
assert.equal(all('SELECT done FROM check_items WHERE id = ?', ['ck1'])[0].done, 0)

// ③ XP: 같은 할 일은 하루 한 번, 하루 10까지
run((await planGrantTaskXp(db, ['p', 'p', 'r'], env)).stmts)
assert.equal(xpSum(), 2)
run((await planGrantTaskXp(db, ['p'], env)).stmts)
assert.equal(xpSum(), 2)
const many = Array.from({ length: 15 }, (_, i) => `x${i}`)
const g = await planGrantTaskXp(db, many, env)
assert.equal(g.granted, 8)
run(g.stmts)
assert.equal(xpSum(), 10)
assert.equal((await planGrantTaskXp(db, ['y'], env)).stmts.length, 0)

// ④ 완료 취소: 반복 기록이면 원래 할 일이 그 회차로, 횟수 되돌림 + 같은 날 XP 회수
const re = await planReopen(db, [rec.id as string], env)
assert.deepEqual(re.records, [rec.id])
assert.deepEqual(re.xpIds, [rec.id, 'r'])
run(await planReopenWithXp(db, [rec.id as string], env))
assert.equal(task('r').due_at, '2026-10-04T09:00')
assert.match(String(task('r').repeat_rule), /COUNT=3/)
assert.equal(task(rec.id as string), undefined)
assert.equal(xpSum(), 9) // r의 XP만 회수
// 회수는 한 번만
assert.equal((await planRevokeTaskXp(db, ['r'], env)).length, 0)

// ⑤ 한 번에 완료 + XP(위젯 경로): 이미 완료된 할 일에는 XP를 주지 않는다
run([insertStmt('tasks', { id: 'w', list_id: 'l1', title: '위젯에서', status: 0, priority: 0 }), { sql: "DELETE FROM xp_events WHERE kind != 'task' OR ref_id LIKE 'x%'" }])
const before = xpSum()
const w = await planCompleteWithXp(db, ['w', 'p'], env)
assert.equal(w.granted, 1)
run(w.stmts)
assert.equal(task('w').status, 1)
assert.equal(xpSum(), before + 1)
assert.equal((await planCompleteWithXp(db, ['w'], env)).stmts.length, 0)

console.log('taskCore: ok')
