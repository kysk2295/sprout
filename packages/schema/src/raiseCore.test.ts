// raiseCore 시험(실제 SQL — sql.js): 옛 종 옮기기 · 끝낸 프로젝트 · 해금 넣기(한 번만, 두 기기 같은 id) · 모습 저장 · 본 것 표시
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from './index.ts'
import { insertStmt, type CoreDb, type Stmt } from './taskCore.ts'
import { fixAvatarJson, loadFinishedProjects, loadProjectDeadlineToday, loadRaiseState, planLegacySpeciesFix, planMarkSeen, planSaveLook, planUnlocks, CHARACTER_ITEMS_SQL } from './raiseCore.ts'
import { equipItem, DEFAULT_LOOK, parseLook } from './wardrobe.ts'

const SQL = await initSqlJs()
const sqldb = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) sqldb.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = sqldb.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const db: CoreDb = { getAll: async <T,>(sql: string, p?: unknown[]) => all(sql, p) as T[], get: async <T,>(sql: string, p?: unknown[]) => (all(sql, p)[0] ?? null) as T | null }
const run = (stmts: Stmt[]) => { for (const s of stmts) sqldb.run(s.sql, s.params as never) }
let clock = 0
const env = { owner: 'user-1', now: () => new Date(Date.UTC(2026, 9, 9, 1, 0, clock++)).toISOString() }

// ── 옛 종 id → 새 종(서버 마이그레이션과 같은 표), 아바타 id도 ──
run([insertStmt('characters', { id: 'c1', owner_id: 'user-1', species: 'otter', name: '퐁' }), insertStmt('user_prefs', { id: 'p1', owner_id: 'user-1', avatar_json: '{"kind":"char","id":"cat-3","color":"red"}' })])
run(await planLegacySpeciesFix(db, env))
assert.equal(all('SELECT species FROM characters')[0].species, 'frog')
assert.equal(all('SELECT avatar_json FROM user_prefs')[0].avatar_json, '{"kind":"char","id":"worm-3","color":"red"}')
assert.deepEqual(await planLegacySpeciesFix(db, env), []) // 다시 돌려도 할 것 없음
assert.equal(fixAvatarJson('{"kind":"face","id":"cat"}'), '{"kind":"face","id":"cat"}')
assert.equal(fixAvatarJson('{"kind":"char","id":"turtle-5","color":"x"}'), '{"kind":"char","id":"snail-5","color":"x"}')

// ── 원장: Lv 3(누적 100 XP 이상) · 한 날 2일 · 점검 1번 ──
const xp = (id: string, kind: string, amount: number, day: string) => insertStmt('xp_events', { id, owner_id: 'user-1', kind, amount, ref_id: id, day, created_at: `${day}T09:00:00Z` })
run([xp('a', 'task', 1, '2026-10-01'), xp('b', 'task', 1, '2026-10-02'), xp('k', 'kpi', 30, '2026-10-02'), xp('k2', 'kpi', 30, '2026-10-02'), xp('r', 'review', 30, '2026-10-05'), xp('k3', 'kpi', 30, '2026-10-06')])
const s1 = await loadRaiseState(db)
assert.equal(s1.level, 3)
assert.equal(s1.days, 2)
assert.equal(s1.reviews, 1)
assert.deepEqual(s1.seasons, ['chuseok'])

// 첫 해금: 행이 없으면 지금 가진 것을 "본 것"으로 넣고 카드는 띄우지 않는다
const u1 = await planUnlocks(db, 'c1', env)
run(u1.stmts)
assert.deepEqual(u1.fresh, [])
const items1 = all(CHARACTER_ITEMS_SQL, ['c1'])
assert.deepEqual(items1.map((r) => r.item_id).sort(), ['acorn-cap', 'auto', 'dawn', 'grass', 'moon', 'ribbon', 'songpyeon'])
assert.ok(items1.every((r) => r.seen_at && r.owner_id === undefined)) // SELECT 칸에 owner 없음
assert.equal(all('SELECT owner_id FROM character_items')[0].owner_id, 'user-1')
// 다시 돌리면 아무것도 넣지 않는다
assert.equal((await planUnlocks(db, 'c1', env)).stmts.length, 0)

// Lv 4로 오르면 몽당연필 하나가 새로(본 적 없음 = 점)
run([xp('k4', 'kpi', 30, '2026-10-07'), xp('k5', 'kpi', 30, '2026-10-07')])
const u2 = await planUnlocks(db, 'c1', env)
assert.deepEqual(u2.fresh.map((r) => r.item_id), ['pencil'])
run(u2.stmts)
const pencil = all('SELECT id, seen_at FROM character_items WHERE item_id = ?', ['pencil'])[0]
assert.equal(pencil.id, 'item:c1:pencil')
assert.equal(pencil.seen_at, null)
run(planMarkSeen(['item:c1:pencil'], env))
assert.ok(all('SELECT seen_at FROM character_items WHERE item_id = ?', ['pencil'])[0].seen_at)

// 완료 취소로 조건 아래로 내려가도 받은 것은 남는다(행을 지우는 문이 없다)
run([xp('rv', 'task_revoke', -1, '2026-10-02')])
const u3 = await planUnlocks(db, 'c1', env)
assert.equal(u3.stmts.length, 0)
assert.ok(u3.stmts.every((s) => !/DELETE/i.test(s.sql)))
assert.equal(all('SELECT count(*) n FROM character_items')[0].n, 8) // + 자동·새벽 배경(처음부터)

// ── 끝낸 프로젝트 → 깃발 + 트로피(프로젝트 이름은 행에 남긴다) ──
run([
  insertStmt('tags', { id: 't1', owner_id: 'user-1', name: '🏆 공모전', kind: 'project' }),
  ...['x1', 'x2', 'x3'].map((id, i) => insertStmt('tasks', { id, owner_id: 'user-1', title: `공모전 ${id}`, status: 1, completed_at: `2026-10-0${i + 1}T10:00:00`, list_id: null })),
  ...['x1', 'x2', 'x3'].map((id) => insertStmt('task_tags', { id: `l${id}`, owner_id: 'user-1', task_id: id, tag_id: 't1', state: 'accepted' })),
  insertStmt('tasks', { id: 'x4', owner_id: 'user-1', title: '공모전 제출', status: 0, due_at: '2026-10-09', list_id: null }),
  insertStmt('task_tags', { id: 'lx4', owner_id: 'user-1', task_id: 'x4', tag_id: 't1', state: 'accepted' })
])
assert.deepEqual(await loadFinishedProjects(db), []) // 열린 것 하나 남음
assert.equal(await loadProjectDeadlineToday(db, '2026-10-09'), true) // 마감 날 장면
assert.equal(await loadProjectDeadlineToday(db, '2026-10-10'), false)
run([`UPDATE tasks SET status = 1, completed_at = '2026-10-09T18:00:00' WHERE id = 'x4'`].map((sql) => ({ sql })))
assert.deepEqual(await loadFinishedProjects(db), [{ id: 't1', title: '공모전', day: '2026-10-09' }])
const u4 = await planUnlocks(db, 'c1', env)
assert.deepEqual(u4.fresh.map((r) => r.id).sort(), ['item:c1:flag', 'trophy:c1:project:t1'])
run(u4.stmts)
// 두 기기가 같은 사건으로 넣어도 같은 id → 한 행(PRIMARY KEY)
assert.throws(() => run(u4.stmts))
assert.equal(all("SELECT title FROM character_items WHERE kind = 'trophy'")[0].title, '공모전')

// ── 입힌 모습 저장 ──
run(planSaveLook('c1', equipItem(DEFAULT_LOOK, 'pencil'), env))
assert.equal(parseLook(all('SELECT look_json FROM characters')[0].look_json as string).eq.hand, 'pencil')

console.log('raiseCore ok')
