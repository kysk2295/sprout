// 기본함 기본값 시험: 계정을 만드는 문이 같은 문에서 기본함(inbox-<id>)을 만든다 · 보충·자가 치유는 멱등 · has_data는 자동 기본함을 세지 않는다
// DATABASE_URL이 있으면 실제 Postgres로도 확인한다(없으면 SQL 모양만).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BACKFILL_INBOX_SQL, CREATE_USER_SQL, createUserWithInbox, ENSURE_INBOX_SQL, ensureDefaultInbox, hasData, HAS_DATA_SQL, inboxIdFor } from './defaultInbox.ts'
import { inboxIdFor as appInboxIdFor } from '../../../packages/schema/src/inbox.ts'

// 앱과 같은 id 규칙
assert.equal(inboxIdFor('abc'), 'inbox-abc')
assert.equal(inboxIdFor('abc'), appInboxIdFor('abc'))
assert.ok(inboxIdFor('00000000-0000-0000-0000-000000000000').length <= 64) // 업로드 id 길이 한도

// 한 문(CTE)으로 사용자 + 기본함. 이미 있는 이메일이면 둘 다 안 만든다
assert.match(CREATE_USER_SQL, /^WITH u AS \(INSERT INTO users[\s\S]*ON CONFLICT \(email\) DO NOTHING RETURNING id, email\)/)
assert.match(CREATE_USER_SQL, /INSERT INTO lists \(id, owner_id, created_at, modified_at, name, kind, sort_order, pinned, show_in_smart\) SELECT 'inbox-' \|\| u\.id::text, u\.id,[\s\S]*'기본함', 'inbox', 0, 0, 'all' FROM u ON CONFLICT \(id\) DO NOTHING/)
for (const sql of [ENSURE_INBOX_SQL, BACKFILL_INBOX_SQL]) {
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM lists x WHERE x\.owner_id = u\.id AND x\.kind = 'inbox'\)/) // 기본함이 하나라도 있으면 안 만든다
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING$/)
}
assert.match(ENSURE_INBOX_SQL, /u\.id = \$1/)
assert.match(HAS_DATA_SQL, /id <> \$2/)

// 마이그레이션 파일이 같은 보충 규칙을 담는다
const migration = readFileSync(new URL('../../db/migrations/20261009-default-inbox.sql', import.meta.url), 'utf8')
assert.match(migration, /'inbox-' \|\| u\.id::text/)
assert.match(migration, /NOT EXISTS \(SELECT 1 FROM lists x WHERE x\.owner_id = u\.id AND x\.kind = 'inbox'\)/)
assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/)

// 부르는 모양(가짜 q)
{
  const calls: [string, unknown[] | undefined][] = []
  const q = async (sql: string, params?: unknown[]) => { calls.push([sql, params]); return sql === CREATE_USER_SQL ? { rows: [{ id: 'u1', email: 'a@b.co' }], rowCount: 1 } : sql === HAS_DATA_SQL ? { rows: [{ has: false }], rowCount: 1 } : { rows: [], rowCount: 0 } }
  assert.deepEqual(await createUserWithInbox(q, 'a@b.co', null), { id: 'u1', email: 'a@b.co' })
  assert.deepEqual(calls[0], [CREATE_USER_SQL, ['a@b.co', null]])
  assert.equal(await ensureDefaultInbox(q, 'u1'), false)
  assert.deepEqual(calls[1], [ENSURE_INBOX_SQL, ['u1']])
  assert.equal(await hasData(q, 'u1'), false)
  assert.deepEqual(calls[2], [HAS_DATA_SQL, ['u1', 'inbox-u1']])
  const dup = async () => ({ rows: [], rowCount: 0 })
  assert.equal(await createUserWithInbox(dup, 'a@b.co', 'h'), null)
}

// 실제 Postgres(선택): DATABASE_URL=postgres://… npm run test:api — 버리는 스키마에서 돌리고 지운다
if (process.env.DATABASE_URL) {
  const pg = (await import('pg')).default
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  const schema = `inbox_test_${process.pid}`
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}, public`)
    await client.query(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password_hash text)`)
    await client.query(`CREATE TABLE lists (id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at text, modified_at text, name text, emoji text, color text, folder_id text, kind text, sort_order double precision, pinned integer, archived_at text, show_in_smart text, description text)`)
    for (const t of ['tasks', 'notes', 'events']) await client.query(`CREATE TABLE ${t} (id text PRIMARY KEY, owner_id uuid NOT NULL)`)
    const q = (sql: string, params?: unknown[]) => client.query(sql, params)
    const made = await createUserWithInbox(q, 'new@x.co', 'hash')
    assert.ok(made)
    const lists = (await q('SELECT id, owner_id, name, kind, sort_order, show_in_smart, created_at FROM lists')).rows
    assert.equal(lists.length, 1)
    assert.deepEqual({ ...lists[0], created_at: undefined }, { id: `inbox-${made!.id}`, owner_id: made!.id, name: '기본함', kind: 'inbox', sort_order: 0, show_in_smart: 'all', created_at: undefined })
    assert.match(lists[0].created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    assert.equal(await createUserWithInbox(q, 'new@x.co', 'hash'), null) // 같은 이메일 → 아무것도 안 만든다
    assert.equal((await q('SELECT count(*)::int AS n FROM lists')).rows[0].n, 1)
    assert.equal(await hasData(q, made!.id), false) // 자동 기본함만 → 데이터 없음
    await q(`INSERT INTO tasks (id, owner_id) VALUES ('t1', $1)`, [made!.id])
    assert.equal(await hasData(q, made!.id), true)
    // 예전 계정(기본함 없음) → 자가 치유·보충 모두 한 번만
    const old = (await q(`INSERT INTO users (email) VALUES ('old@x.co'), ('old2@x.co') RETURNING id`)).rows
    assert.equal(await ensureDefaultInbox(q, old[0].id), true)
    assert.equal(await ensureDefaultInbox(q, old[0].id), false)
    await q(`INSERT INTO lists (id, owner_id, kind, name) VALUES ('legacy', $1, 'inbox', '받은함')`, [old[1].id]) // 옛 무작위 id 기본함이 있는 계정
    assert.equal((await q(BACKFILL_INBOX_SQL)).rowCount, 0)
    await q('DELETE FROM lists')
    assert.equal((await q(BACKFILL_INBOX_SQL)).rowCount, 3)
    assert.equal((await q(BACKFILL_INBOX_SQL)).rowCount, 0)
    await q('DELETE FROM lists')
    await q(migration.replace(/^--.*$/gm, ''))
    assert.equal((await q('SELECT count(*)::int AS n FROM lists')).rows[0].n, 3) // 마이그레이션 파일도 같은 일
    await q(migration.replace(/^--.*$/gm, ''))
    assert.equal((await q('SELECT count(*)::int AS n FROM lists')).rows[0].n, 3) // 다시 돌려도 그대로
    console.log('defaultInbox: postgres ok')
  } finally {
    await client.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {})
    await client.end()
  }
}

console.log('defaultInbox: ok')
