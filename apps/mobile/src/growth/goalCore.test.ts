// goalCore 시험(실제 SQL — sql.js): 목표 체크 +30 · 같은 주 풀면 되돌림 · XP 3개 한도 · 2개 이상 모두 달성 +20 ·
// 5개 한도 · 초안 숨기기 · 리포트 본 것 · 조사 결과 쓰기 · 레벨 감지(원장 → 레벨). 데스크톱 data/growth.ts와 같은 결과여야 한다.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { progressFromEvents, readTextJson, xpEventId } from '@sprout/schema/growth'
import { insertStmt, type CoreDb, type Stmt } from '@sprout/schema/taskCore'
import { CHARACTER_SQL, planAddGoal, planAssignCharacter, planDismissDraft, planMarkSeen, planRename, planSetGoalProgress, type GrowthEnv } from './goalCore.ts'
import { levelChange, type GoalRow } from './logic.ts'

const SQL = await initSqlJs()
const sqldb = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) sqldb.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = sqldb.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const db: CoreDb = { getAll: async <T,>(sql: string, p?: unknown[]) => all(sql, p) as T[], get: async <T,>(sql: string, p?: unknown[]) => (all(sql, p)[0] ?? null) as T | null }
const run = (stmts: Stmt[]) => { sqldb.run('BEGIN'); try { for (const s of stmts) sqldb.run(s.sql, s.params as never); sqldb.run('COMMIT') } catch (e) { sqldb.run('ROLLBACK'); throw e } }
let n = 0
let clock = 0
const env: GrowthEnv = { today: '2026-10-07', owner: 'user-1', now: () => new Date(Date.UTC(2026, 9, 7, 1, 0, clock++)).toISOString(), uuid: () => `u${++n}` }
const week = '2026-10-05'
const xpSum = () => Number(all('SELECT coalesce(sum(amount),0) n FROM xp_events')[0].n)
const goal = (id: string) => all('SELECT id, week_start, title, target, progress, status, source, achieved_at, sort_order FROM kpis WHERE id = ?', [id])[0] as unknown as GoalRow
const set = async (id: string, p: number) => { const r = await planSetGoalProgress(db, env, goal(id), p); run(r.stmts); return r.gained }
const add = async (title: string, target = 1, source: 'manual' | 'ai' = 'manual') => { const r = await planAddGoal(db, env, week, title, target, source); if (r === 'full') return r; run(r); return all('SELECT id FROM kpis WHERE title = ? ORDER BY sort_order DESC', [title])[0].id as string }

// ── 캐릭터: 없으면 만들고 조사 결과를 쓴다(새 행 owner_id = 지금 사용자) ──
run(await planAssignCharacter(db, env, { species: 'bee', typeCode: 'plan-multi', answers: { q1: 'A' }, name: '도토리' }))
const ch = all(CHARACTER_SQL)[0]
assert.equal(ch.species, 'bee')
assert.equal(ch.name, '도토리')
assert.equal(ch.type_code, 'plan-multi')
assert.equal(all('SELECT owner_id FROM characters')[0].owner_id, 'user-1')
run(await planRename(db, env, '도톨'))
assert.equal(all(CHARACTER_SQL)[0].name, '도톨')
assert.equal(all('SELECT count(*) n FROM characters')[0].n, 1) // 다시 써도 한 행

// ── 목표 5개 한도 ──
const ids: string[] = []
for (const [t, k] of [['논문 읽기', 1], ['운동 3번', 3], ['포트폴리오', 1], ['책 50쪽', 1], ['정리', 1]] as const) ids.push((await add(t, k)) as string)
assert.equal(all('SELECT count(*) n FROM kpis WHERE week_start = ?', [week])[0].n, 5)
assert.equal(await add('여섯째'), 'full')
assert.equal(all('SELECT owner_id FROM kpis LIMIT 1')[0].owner_id, 'user-1')
const [g1, g2, g3, g4, g5] = ids

// ── 체크 +30, 같은 주 풀면 되돌림(다시 이루면 다시 +30, 순번 id) ──
assert.equal(await set(g1, 1), 30)
assert.equal(xpSum(), 30)
assert.equal(goal(g1).status, 'achieved')
assert.ok(all('SELECT id FROM xp_events WHERE id = ?', [xpEventId.kpi(g1)]).length === 1)
assert.equal(await set(g1, 0), 0)
assert.equal(xpSum(), 0)
assert.equal(goal(g1).status, 'active')
assert.equal(await set(g1, 1), 30)
assert.equal(xpSum(), 30)
assert.equal(all('SELECT count(*) n FROM xp_events WHERE ref_id = ?', [g1])[0].n, 3) // 지급·되돌림·재지급 = 3줄(겹치지 않는 id)

// ── 횟수 목표: 점으로 올려 목표에 닿으면 달성 ──
assert.equal(await set(g2, 2), 0)
assert.equal(goal(g2).progress, 2)
assert.equal(goal(g2).status, 'active')
assert.equal(await set(g2, 3), 30)
assert.equal(goal(g2).status, 'achieved')

// ── XP는 한 주 3개까지 ──
assert.equal(await set(g3, 1), 30)
assert.equal(await set(g4, 1), 0) // 4번째는 기록만
assert.equal(goal(g4).status, 'achieved')
assert.equal(xpSum(), 90)

// ── 2개 이상 모두 달성 +20(마지막 목표를 이룰 때), 하나 풀면 보너스 되돌림 ──
assert.equal(await set(g5, 1), 20)
assert.equal(xpSum(), 110)
const bonusId = xpEventId.kpiAll(ch.id as string, week)
assert.equal(all('SELECT amount FROM xp_events WHERE id = ?', [bonusId])[0].amount, 20)
await set(g5, 0)
assert.equal(xpSum(), 90) // g5는 XP가 없었으니 보너스만 되돌림
// 앞 목표(g1)를 풀면 그 +30만 되돌리고, 다시 이루면 XP 자리가 비어 있으니 다시 +30
await set(g5, 1)
assert.equal(xpSum(), 110)
await set(g1, 0)
assert.equal(xpSum(), 60) // −30 목표, −20 보너스
assert.equal(await set(g1, 1), 50) // +30 다시(3개 안) + 보너스 +20
assert.equal(xpSum(), 110)

// ── 레벨: 원장 → 레벨, 감지 ──
const evs = all('SELECT amount, created_at FROM xp_events') as { amount: number; created_at: string }[]
const prog = progressFromEvents(evs)
assert.equal(prog.level, 3) // 110 XP: 40 + 60 = 100 → Lv 3
assert.deepEqual(levelChange(1, prog.level), { kind: 'evolve', prev: 1, level: 3, prevStage: 1, stage: 2 })

// ── 초안 숨기기(×) · 리포트 본 것 ──
run([insertStmt('weekly_reports', { id: 'report:x:2026-09-28', week_start: '2026-09-28', stats_json: '{}', text_json: JSON.stringify({ draft: [{ title: '운동 3번', target: 3 }], draftWeek: week, reportTried: true }), xp_total: 12, seen_at: null })])
run(await planDismissDraft(db, env, '2026-09-28', '운동 3번'))
run(await planDismissDraft(db, env, '2026-09-28', '운동 3번'))
const tj = readTextJson(all('SELECT text_json FROM weekly_reports')[0].text_json as string)
assert.deepEqual(tj.dismissed, ['운동 3번']) // 겹치지 않게
assert.equal(tj.reportTried, true) // 다른 칸은 그대로
assert.deepEqual(await planDismissDraft(db, env, '2020-01-06', 'x'), []) // 리포트가 없으면 아무것도 안 함
run(planMarkSeen(env, 'report:x:2026-09-28'))
assert.ok(all('SELECT seen_at FROM weekly_reports')[0].seen_at)

// ── AI 초안 + = source 'ai' (다음 주라 한도 따로) ──
const r = await planAddGoal(db, env, '2026-10-12', '운동 3번', 3, 'ai')
assert.notEqual(r, 'full')
run(r as Stmt[])
assert.deepEqual(all("SELECT title, target, source, status FROM kpis WHERE week_start = '2026-10-12'"), [{ title: '운동 3번', target: 3, source: 'ai', status: 'active' }])

// ── 캐릭터가 없을 때 목표를 이루면 캐릭터 행을 같이 만든다(보너스 id에 캐릭터 id가 필요) ──
sqldb.run('DELETE FROM characters')
sqldb.run('DELETE FROM kpis')
sqldb.run('DELETE FROM xp_events')
const a = (await add('a')) as string
const b = (await add('b')) as string
await set(a, 1)
assert.equal(await set(b, 1), 50)
assert.equal(all('SELECT count(*) n FROM characters')[0].n, 1)

console.log('growth goalCore ok')
