// 47 §20.3 서버 도구 DB: 자리표 변환·문장 거르기(늘) + 실제 Postgres에서 ① 다른 사용자 행이 절대 안 보임 ② 같은 도구가 기기 SQLite와 같은 결과
// 실제 DB 시험은 TEST_DATABASE_URL(빈 Postgres 서버, 슈퍼유저)이 있을 때만 — 임시 DB를 만들고 지운다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { checkQuery, scopedDb, toPg, AssistantQueryRejected } from './assistantDb.ts'
import { runTool, type AssistantDb } from '../../../packages/schema/src/assistantExec.ts'
import { createTables, seedFixture, FIXTURE_NOW } from '../../../packages/schema/src/assistantFixture.ts'

// ── 늘: 변환·거르기 ──
assert.equal(toPg('SELECT a FROM t WHERE x = ? AND y IN (?, ?)'), 'SELECT a FROM t WHERE x = $1 AND y IN ($2, $3)')
assert.equal(toPg("SELECT '?' AS q, \"a?\" FROM t WHERE z = ?"), "SELECT '?' AS q, \"a?\" FROM t WHERE z = $1")
assert.doesNotThrow(() => checkQuery("SELECT id FROM tasks WHERE title LIKE '%T%'"))
for (const bad of ['DELETE FROM tasks', 'SELECT 1; DELETE FROM tasks', 'SELECT * FROM public.tasks', 'SELECT * FROM pg_catalog.pg_user', 'SELECT * FROM information_schema.tables', 'select * from assistant_scope.tasks', '  UPDATE tasks SET title = 1'])
  assert.throws(() => checkQuery(bad), AssistantQueryRejected, bad)
{
  // 쿼리마다 읽기 전용 트랜잭션 + 사용자 값 + 보기 스키마, 실패하면 ROLLBACK
  const log: string[] = []
  const pool = { connect: async () => ({ query: async (q: any) => { const t = typeof q === 'string' ? q : q.text; log.push(t); if (t.includes('boom')) throw new Error('x'); return { rows: [{ n: 1 }] } }, release: () => log.push('release') }) }
  const db = scopedDb(pool, '00000000-0000-0000-0000-00000000000a')
  assert.deepEqual(await db.getAll('SELECT n FROM tasks WHERE id = ?', ['a']), [{ n: 1 }])
  assert.deepEqual(log.slice(0, 2), ['BEGIN READ ONLY', "SELECT set_config('sprout.user_id', $1, true), set_config('search_path', 'assistant_scope, pg_catalog', true)"])
  assert.deepEqual(log.slice(2), ['SELECT n FROM tasks WHERE id = $1', 'COMMIT', 'release'])
  log.length = 0
  await assert.rejects(db.getAll('SELECT boom FROM tasks'))
  assert.deepEqual(log.slice(-2), ['ROLLBACK', 'release'])
  assert.throws(() => scopedDb(pool, "x' OR 1=1"))
}
console.log('assistantDb: 자리표 · 문장 거르기 · 트랜잭션 ok')

const url = process.env.TEST_DATABASE_URL
if (!url) { console.log('assistantDb: TEST_DATABASE_URL 없음 — 실제 Postgres 시험 건너뜀'); process.exit(0) }

const name = `assistant_test_${Date.now()}`
const admin = new pg.Client({ connectionString: url })
await admin.connect()
await admin.query(`CREATE DATABASE ${name}`)
const testUrl = new URL(url); testUrl.pathname = `/${name}`
const pool = new pg.Pool({ connectionString: testUrl.toString(), max: 4 })
try {
  const init = new URL('../../db/init/', import.meta.url)
  for (const f of ['01-base.sql', '02-schema.sql', '09-assistant-scope.sql']) await pool.query(readFileSync(new URL(f, init), 'utf8'))
  const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'
  await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'a@example.com', 'x'), ($2, 'b@example.com', 'x')", [A, B])

  // A = 기기 시험 데이터 그대로(같은 run 함수 — INSERT에만 owner_id를 붙인다)
  const pending: Promise<unknown>[] = []
  const pgRun = (owner: string) => (sql: string, params: unknown[] = []) => {
    const ins = /^INSERT INTO (\w+) \(([^)]*)\) VALUES \(([^)]*)\)$/.exec(sql)
    const text = ins ? `INSERT INTO ${ins[1]} (owner_id, ${ins[2]}) VALUES (?, ${ins[3]})` : sql
    pending.push(pool.query(toPg(text), ins ? [owner, ...params] : params))
  }
  seedFixture(pgRun(A))
  for (const p of pending) await p
  // B = 같은 낱말을 가진 남의 행(새면 결과가 달라진다)
  const b = (table: string, row: Record<string, unknown>) => pool.query(`INSERT INTO ${table} (owner_id, ${Object.keys(row).join(', ')}) VALUES ($1, ${Object.keys(row).map((_, i) => `$${i + 2}`).join(', ')})`, [B, ...Object.values(row)])
  await b('lists', { id: 'b-life', name: '생활', kind: null, created_at: '2026-08-01T00:00:00.000Z', sort_order: 0 })
  await b('tasks', { id: 'b-hair', title: '미용실 가기', list_id: 'b-life', status: 1, priority: 0, due_at: '2026-10-08', completed_at: '2026-10-08T05:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z' })
  await b('tasks', { id: 'b-secret', title: 'B 비밀 과제', list_id: 'b-life', status: 0, priority: 3, due_at: '2026-10-10', created_at: '2026-08-01T00:00:00.000Z' })
  await b('events', { id: 'b-ev', title: 'B 팀 회의', start_at: '2026-10-14T10:00', end_at: '2026-10-14T11:00', is_all_day: 0, created_at: '2026-08-01T00:00:00.000Z' })
  await b('notes', { id: 'b-note', content: 'B 회의록 킥오프 비밀', kind: 'memo', modified_at: '2026-10-08T00:00:00.000Z' })
  await b('diary_entries', { id: 'b-diary', date: '2026-10-08', mood: 3, content: 'B 과제 비밀 일기', private: 0 })
  await b('tags', { id: 'b-tag', name: 'B 공모전 비밀', kind: 'project', source: 'user' })
  await b('characters', { id: 'b-ch', name: 'B캐릭터', species: 'cat', created_at: '2026-01-01T00:00:00.000Z' })
  await b('xp_events', { id: 'b-xp', kind: 'task', amount: 99999, ref_id: 'x', day: '2026-10-08', created_at: '2026-10-08T00:00:00.000Z' })

  // ① 사용자 범위
  const dbA = scopedDb(pool, A)
  const count = async (db: AssistantDb, t: string) => Number((await db.getAll(`SELECT COUNT(*) AS n FROM ${t}`))[0].n)
  assert.equal(await count(scopedDb(pool, B), 'tasks'), 2)
  assert.ok(await count(dbA, 'tasks') > 40)
  assert.equal((await dbA.getAll("SELECT id FROM tasks WHERE id LIKE 'b-%'")).length, 0)
  assert.equal(typeof (await dbA.getAll('SELECT COUNT(*) AS n FROM tasks'))[0].n, 'number', 'COUNT은 숫자')
  await assert.rejects(dbA.getAll('SELECT * FROM users'), 'users 표는 보기에 없다')
  await assert.rejects(dbA.getAll('SELECT * FROM diary_messages'), '일기 대화 원문은 보기에 없다')
  // 사용자 값 없이 보기를 읽으면 오류(아무것도 안 보임)
  await assert.rejects(pool.query('SELECT * FROM assistant_scope.tasks'))
  {
    const c = await pool.connect()
    try {
      await c.query('BEGIN READ ONLY'); await c.query("SELECT set_config('sprout.user_id', $1, true)", [A]); await c.query('COMMIT')
      await assert.rejects(c.query('SELECT * FROM assistant_scope.tasks'), '트랜잭션이 끝나면 사용자 값도 사라진다')
    } finally { c.release() }
  }

  // ② 기기 SQLite와 같은 결과
  const { DatabaseSync } = await import('node:sqlite')
  const lite = new DatabaseSync(':memory:')
  createTables((sql, params = []) => { lite.prepare(sql).run(...(params as any[])) })
  seedFixture((sql, params = []) => { lite.prepare(sql).run(...(params as any[])) })
  const dbLite: AssistantDb = { getAll: async (sql, args = []) => lite.prepare(sql).all(...(args as any[])).map((r) => ({ ...r })) as any }
  const calls: [string, Record<string, unknown>][] = [
    ['find_tasks', { status: 'open' }], ['find_tasks', { status: 'open', sort: 'urgent' }], ['find_tasks', { status: 'open', sort: 'due' }],
    ['find_tasks', { status: 'completed', from: '2026-10-01', to: '2026-10-09' }], ['find_tasks', { status: 'completed', sort: 'recent' }],
    ['find_tasks', { status: 'all', query: '미용실' }], ['find_tasks', { status: 'open', query: '과제' }], ['find_tasks', { status: 'all', list: '공부' }],
    ['find_tasks', { status: 'all', list: '기본함' }], ['find_tasks', { status: 'all', from: '2026-10-10', to: '2026-10-14' }], ['find_tasks', { status: 'all', query: '공모전 회의' }],
    ['find_events', { from: '2026-10-12', to: '2026-10-18' }], ['find_events', { query: '회의', from: '2026-10-01', to: '2026-10-31' }],
    ['when_last', { query: '미용실' }], ['when_last', { query: '헬스장', from: '2026-01-01' }], ['when_last', { query: '운동' }],
    ['find_notes', { query: '회의록' }], ['find_notes', { query: '킥오프 역할' }],
    ['find_diary', { query: '과제' }], ['find_diary', { from: '2026-10-01', to: '2026-10-09' }],
    ['project_info', { name: '공모전' }], ['project_info', { name: '' }], ['growth_stats', {}], ['date_calc', { op: 'days_between', a: '2026-10-09', b: '2026-10-21' }]
  ]
  for (const [tool, args] of calls) {
    const ctx = (db: AssistantDb) => ({ db, now: FIXTURE_NOW, aliases: {}, diary: true, newKey: () => 'k1' })
    const [l, p] = [await runTool(tool, args, ctx(dbLite)), await runTool(tool, args, ctx(dbA))]
    const pick = (r: typeof l) => JSON.parse(JSON.stringify({ ok: r.ok, forModel: r.forModel, card: r.card, chip: r.chip, facts: r.facts }))
    assert.deepEqual(pick(p), pick(l), `${tool} ${JSON.stringify(args)}`)
    assert.ok(!/B |B캐릭터|99999|b-/.test(JSON.stringify(pick(p))), `남의 행이 섞임: ${tool} ${JSON.stringify(args)}`)
    assert.ok(p.ok, `${tool} ${JSON.stringify(args)} 실패`)
  }
  console.log(`assistantDb: 실제 Postgres — 사용자 범위 · 도구 ${calls.length}개 기기 SQLite와 같은 결과 ok`)
} finally {
  await pool.end()
  await admin.query(`DROP DATABASE IF EXISTS ${name}`)
  await admin.end()
}
