// 기본함 규칙 시험: 고르기(가장 오래된 것)·없으면 만들기(로그인 = inbox-<userId>)·list_id 대신 넣기·첫 로그인 옮기기
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from './index.ts'
import { ensureInbox, inboxIdFor, INBOX_NAME, pickInbox, planAdoptInbox, resolveListId } from './inbox.ts'
import type { CoreDb, Stmt } from './taskCore.ts'

const SQL = await initSqlJs()
const fresh = () => {
  const sqldb = new SQL.Database()
  for (const [name, def] of Object.entries(TABLES)) sqldb.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
  const all = (sql: string, params: unknown[] = []) => { const s = sqldb.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
  const db: CoreDb = { getAll: async <T,>(sql: string, p?: unknown[]) => all(sql, p) as T[], get: async <T,>(sql: string, p?: unknown[]) => (all(sql, p)[0] ?? null) as T | null }
  const run = async (stmts: Stmt[]) => { sqldb.run('BEGIN'); try { for (const s of stmts) sqldb.run(s.sql, s.params as never); sqldb.run('COMMIT') } catch (e) { sqldb.run('ROLLBACK'); throw e } }
  return { db, run, all }
}

// pickInbox: 가장 오래된 기본함, 같으면 id. created_at 없는 행은 뒤로
assert.equal(pickInbox([{ id: 'a', kind: 'normal' }]), undefined)
assert.equal(pickInbox([
  { id: 'b', kind: 'inbox', created_at: '2026-10-02T00:00:00Z' },
  { id: 'n', kind: 'normal', created_at: '2020-01-01T00:00:00Z' },
  { id: 'a', kind: 'inbox', created_at: '2026-10-01T00:00:00Z' },
  { id: 'z', kind: 'inbox', created_at: null }
])?.id, 'a')
assert.equal(pickInbox([{ id: 'b', kind: 'inbox', created_at: 't' }, { id: 'a', kind: 'inbox', created_at: 't' }])?.id, 'a')
assert.equal(pickInbox([{ id: 'z', kind: 'inbox' }, { id: 'y', kind: 'inbox' }])?.id, 'y')

// ensureInbox: 로그인 → inbox-<userId>, 두 번 불러도 하나
{
  const { db, run, all } = fresh()
  const first = await ensureInbox(db, run, { userId: 'U1', ownerId: 'U1', now: () => '2026-10-05T00:00:00.000Z' })
  assert.deepEqual(first, { id: inboxIdFor('U1'), created: true })
  assert.equal(first.id, 'inbox-U1')
  const again = await ensureInbox(db, run, { userId: 'U1', ownerId: 'U1' })
  assert.deepEqual(again, { id: 'inbox-U1', created: false })
  const rows = all("SELECT * FROM lists WHERE kind = 'inbox'")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, INBOX_NAME)
  assert.equal(rows[0].owner_id, 'U1')
}
// 로그인 전 → uuid
{
  const { db, run } = fresh()
  const r = await ensureInbox(db, run, { userId: null, ownerId: 'local', uuid: () => 'u-1' })
  assert.deepEqual(r, { id: 'u-1', created: true })
}
// 둘 있으면 가장 오래된 것을 쓰고 지우지 않는다
{
  const { db, run, all } = fresh()
  await run([
    { sql: "INSERT INTO lists (id, kind, name, created_at) VALUES ('new', 'inbox', '기본함', '2026-10-05')" },
    { sql: "INSERT INTO lists (id, kind, name, created_at) VALUES ('old', 'inbox', '기본함', '2026-10-01')" }
  ])
  assert.equal((await ensureInbox(db, run, { userId: 'U', ownerId: 'U' })).id, 'old')
  assert.equal(all("SELECT id FROM lists WHERE kind = 'inbox'").length, 2)
}

// resolveListId: 있는 리스트는 그대로, 비었거나 없는 id는 기본함(없으면 만든다)
{
  const { db, run, all } = fresh()
  await run([{ sql: "INSERT INTO lists (id, kind, name) VALUES ('work', 'normal', '업무')" }])
  const ctx = { userId: 'U2', ownerId: 'U2' }
  assert.equal(await resolveListId(db, run, 'work', ctx), 'work')
  assert.equal(await resolveListId(db, run, '', ctx), 'inbox-U2')
  assert.equal(await resolveListId(db, run, undefined, ctx), 'inbox-U2')
  assert.equal(await resolveListId(db, run, 'gone', ctx), 'inbox-U2')
  assert.equal(all("SELECT id FROM lists WHERE kind = 'inbox'").length, 1)
}

// planAdoptInbox: 로컬 기본함(무작위 id) → inbox-<userId>. 할 일·섹션도 따라간다. 이미 맞으면 아무것도 안 함
{
  const { db, run, all } = fresh()
  await run([
    { sql: "INSERT INTO lists (id, kind, name, created_at, sort_order, show_in_smart) VALUES ('rand', 'inbox', '기본함', '2026-09-01', 0, 'all')" },
    { sql: "INSERT INTO lists (id, kind, name) VALUES ('work', 'normal', '업무')" },
    { sql: "INSERT INTO tasks (id, list_id, title) VALUES ('t1', 'rand', '하나'), ('t2', 'work', '둘')" },
    { sql: "INSERT INTO sections (id, list_id, name) VALUES ('s1', 'rand', '칸')" }
  ])
  await run(await planAdoptInbox(db, 'U3', 'U3', '2026-10-05T00:00:00.000Z'))
  const inboxes = all("SELECT * FROM lists WHERE kind = 'inbox'")
  assert.deepEqual(inboxes.map((l) => l.id), ['inbox-U3'])
  assert.equal(inboxes[0].created_at, '2026-09-01') // 처음 만든 때를 그대로
  assert.equal(all("SELECT list_id FROM tasks WHERE id = 't1'")[0].list_id, 'inbox-U3')
  assert.equal(all("SELECT list_id FROM tasks WHERE id = 't2'")[0].list_id, 'work')
  assert.equal(all("SELECT list_id FROM sections WHERE id = 's1'")[0].list_id, 'inbox-U3')
  assert.deepEqual(await planAdoptInbox(db, 'U3', 'U3'), [])
}
// 이미 inbox-<userId>가 있고(서버에서 먼저 받음) 로컬 것도 있으면 → 합친다
{
  const { db, run, all } = fresh()
  await run([
    { sql: "INSERT INTO lists (id, kind, name, created_at) VALUES ('inbox-U4', 'inbox', '기본함', '2026-10-05')" },
    { sql: "INSERT INTO lists (id, kind, name, created_at) VALUES ('rand', 'inbox', '기본함', '2026-09-01')" },
    { sql: "INSERT INTO tasks (id, list_id, title) VALUES ('t1', 'rand', '하나')" }
  ])
  await run(await planAdoptInbox(db, 'U4', 'U4'))
  assert.deepEqual(all("SELECT id FROM lists WHERE kind = 'inbox'").map((l) => l.id), ['inbox-U4'])
  assert.equal(all("SELECT list_id FROM tasks WHERE id = 't1'")[0].list_id, 'inbox-U4')
}

console.log('inbox: ok')
