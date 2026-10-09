// 48 자동 정리 작업 시험: 메모리 저장소로 흐름(하루 한 번·시간대·설정 끔·묶음 행·되살림·XP 그대로·오래된 묶음 지우기),
// DATABASE_URL이 있으면 실제 Postgres(버리는 스키마)로 같은 흐름 + 마이그레이션 파일.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAutoTrash, memAt, memoryAutoTrashStore, pgAutoTrashStore, type MemAt } from './autoTrash.ts'
import { AUTO_TRASH, parseBatch } from '../../../packages/schema/src/autoTrash.ts'

const U1 = '00000000-0000-4000-8000-000000000001'
const U2 = '00000000-0000-4000-8000-000000000002'
const task = (owner_id: string, id: string, due_at: string | null, x: Partial<MemAt['tasks'][number]> = {}): MemAt['tasks'][number] =>
  ({ owner_id, id, parent_id: null, status: 0, deleted_at: null, due_at, repeat_rule: null, pinned_at: null, list_id: null, ...x })

// ── 메모리 ──
{
  const d = memAt()
  d.tasks.push(
    task(U1, 'a', '2026-09-24'), // 서울 10-09 → 15일 → 옮김
    task(U1, 'b', '2026-09-25'), // 14일 → 아직
    task(U1, 'r', '2026-08-01', { repeat_rule: 'RRULE:FREQ=DAILY' }),
    task(U1, 'p', '2026-08-01', { pinned_at: '2026-08-01T00:00:00.000Z' }),
    task(U1, 'done', '2026-08-01', { status: 1 }),
    task(U1, 'kid', null, { parent_id: 'a' }),
    task(U2, 'la', '2026-09-24') // LA 사용자: 같은 순간 10-08 → 14일 → 아직
  )
  d.devices.push({ user_id: U2, timezone: 'America/Los_Angeles', last_seen_at: 1 })
  d.xpEvents.push({ owner_id: U1, amount: 1 })
  let t = Date.parse('2026-10-08T15:30:00Z') // 서울 10-09 00:30
  const job = createAutoTrash({ store: memoryAutoTrashStore(d), now: () => t, log: () => {} })

  assert.deepEqual(await job.tick(), { users: 1, tasks: 2 })
  const byId = (id: string) => d.tasks.find((x) => x.id === id)!
  assert.equal(byId('a').deleted_at, '2026-10-08T15:30:00.000Z')
  assert.equal(byId('kid').deleted_at, '2026-10-08T15:30:00.000Z') // 하위 같이
  assert.equal(byId('a').modified_at, byId('a').deleted_at)
  for (const id of ['b', 'r', 'p', 'done', 'la']) assert.equal(byId(id).deleted_at, null, id)
  assert.equal(byId('done').status, 1)
  assert.deepEqual(d.xpEvents, [{ owner_id: U1, amount: 1 }]) // XP 그대로
  const batches = d.viewSettings.filter((v) => v.view_key === AUTO_TRASH.batchKey)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].owner_id, U1)
  const b = parseBatch(batches[0].options_json)!
  assert.deepEqual({ ...b, ids: [...b.ids].sort() }, { at: '2026-10-08T15:30:00.000Z', day: '2026-10-09', ids: ['a', 'kid'], count: 2, seen: false, undone: false })
  assert.equal(d.state.get(U1), '2026-10-09')

  // 같은 날 다시 돌아도 아무것도
  t += 3600_000
  assert.deepEqual(await job.tick(), { users: 0, tasks: 0 })

  // 사용자가 되돌림(앱): 같은 마감이면 다음 날에도 다시 안 옮김
  byId('a').deleted_at = null
  byId('kid').deleted_at = null
  t = Date.parse('2026-10-09T16:00:00Z') // 서울 10-10 · LA 10-09
  const r2 = await job.tick()
  assert.equal(byId('a').deleted_at, null)
  assert.equal(byId('b').deleted_at, '2026-10-09T16:00:00.000Z') // 10-10 기준 15일
  assert.equal(byId('la').deleted_at, '2026-10-09T16:00:00.000Z') // LA 10-09 → 15일
  assert.deepEqual(r2, { users: 2, tasks: 2 })
  // 마감을 바꾸면 다시 셈
  byId('a').due_at = '2026-09-20'
  t = Date.parse('2026-10-10T16:00:00Z')
  await job.tick()
  assert.ok(byId('a').deleted_at)

  // 설정 끔 → 안 돎(행이 있어야 끔, 없으면 켬)
  d.tasks.push(task(U1, 'z', '2026-01-01'))
  d.viewSettings.push({ id: `autotrash-${U1}`, owner_id: U1, created_at: 'x', view_key: AUTO_TRASH.viewKey, options_json: '{"on":false}' })
  t = Date.parse('2026-10-11T16:00:00Z')
  await job.tick()
  assert.equal(byId('z').deleted_at, null)
  // 설정 시간대가 기기 시간대보다 먼저
  d.viewSettings.find((v) => v.view_key === AUTO_TRASH.viewKey)!.options_json = '{"on":true,"tz":"Pacific/Kiritimati"}'
  await job.tick()
  assert.ok(byId('z').deleted_at)
  assert.equal(d.state.get(U1), '2026-10-12') // 키리티마티(UTC+14)는 이미 10-12(서울은 10-12 01:00 — 마지막 날 10-11 다음)

  // 30일 지난 묶음 행 지우기
  t = Date.parse('2026-12-01T00:00:00Z')
  const before = d.viewSettings.filter((v) => v.view_key === AUTO_TRASH.batchKey).length
  assert.ok(before >= 3)
  await job.tick()
  assert.equal(d.viewSettings.filter((v) => v.view_key === AUTO_TRASH.batchKey).length, 0)
  assert.equal(d.viewSettings.filter((v) => v.view_key === AUTO_TRASH.viewKey).length, 1) // 설정 행은 그대로
}

// 마이그레이션 파일: 서버 전용 표 두 개, publication에 넣지 않음
const migration = readFileSync(new URL('../../db/migrations/20261014-auto-trash.sql', import.meta.url), 'utf8')
assert.match(migration, /CREATE TABLE IF NOT EXISTS auto_trash_log/)
assert.match(migration, /CREATE TABLE IF NOT EXISTS auto_trash_state/)
assert.doesNotMatch(migration.replace(/--.*$/gm, ''), /PUBLICATION/i)

// ── 실제 Postgres(선택): DATABASE_URL=postgres://… npm run test:api ──
if (process.env.DATABASE_URL) {
  const pg = (await import('pg')).default
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  const schema = `autotrash_test_${process.pid}`
  const setup = await pool.connect()
  try {
    await setup.query(`CREATE SCHEMA ${schema}`)
    // 풀의 모든 연결이 이 스키마를 보게
    pool.on('connect', (c) => { void c.query(`SET search_path TO ${schema}, public`) })
    await setup.query(`SET search_path TO ${schema}, public`)
    await setup.query(`CREATE TABLE users (id uuid PRIMARY KEY, email text)`)
    const base = 'id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at text, modified_at text'
    await setup.query(`CREATE TABLE tasks (${base}, list_id text, parent_id text, title text, status integer, due_at text, repeat_rule text, pinned_at text, completed_at text, deleted_at text)`)
    await setup.query(`CREATE TABLE lists (${base}, name text, archived_at text)`)
    await setup.query(`CREATE TABLE tags (${base}, name text, kind text)`)
    await setup.query(`CREATE TABLE task_tags (${base}, task_id text, tag_id text, state text)`)
    await setup.query(`CREATE TABLE relations (${base}, from_type text, from_id text, to_type text, to_id text, state text, field text)`)
    await setup.query(`CREATE TABLE view_settings (${base}, view_key text, group_by text, sort_by text, sort_dir text, show_completed integer, show_details integer, options_json text)`)
    await setup.query(`CREATE TABLE xp_events (${base}, kind text, amount integer, ref_id text, day text)`)
    await setup.query(`CREATE TABLE device_tokens (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, timezone text NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now())`)
    await setup.query(migration.replace(/^--.*$/gm, ''))
    await setup.query(migration.replace(/^--.*$/gm, '')) // 두 번 돌려도 그대로
    await setup.query(`INSERT INTO users (id) VALUES ($1), ($2)`, [U1, U2])
    const ins = (id: string, owner: string, due: string | null, x: Record<string, unknown> = {}) => {
      const row: Record<string, unknown> = { id, owner_id: owner, status: 0, due_at: due, ...x }
      const cols = Object.keys(row)
      return setup.query(`INSERT INTO tasks (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row))
    }
    await ins('a', U1, '2026-09-24')
    await ins('kid', U1, null, { parent_id: 'a' })
    await ins('kid-done', U1, null, { parent_id: 'a', status: 1 })
    await ins('b', U1, '2026-09-25')
    await ins('rep', U1, '2026-08-01', { repeat_rule: 'RRULE:FREQ=DAILY' })
    await ins('pin', U1, '2026-08-01', { pinned_at: 'x' })
    await ins('arch', U1, '2026-08-01', { list_id: 'L-arch' })
    await ins('proj', U1, '2026-08-01')
    await ins('key', U1, '2026-12-01')
    await ins('la', U2, '2026-09-24')
    await setup.query(`INSERT INTO lists (id, owner_id, archived_at) VALUES ('L-arch', $1, 'x')`, [U1])
    await setup.query(`INSERT INTO tags (id, owner_id, kind) VALUES ('P', $1, 'project')`, [U1])
    await setup.query(`INSERT INTO task_tags (id, owner_id, task_id, tag_id) VALUES ('tt1', $1, 'proj', 'P'), ('tt2', $1, 'key', 'P')`, [U1])
    await setup.query(`INSERT INTO relations (id, owner_id, from_type, from_id, to_type, to_id, field) VALUES ('rel', $1, 'tag', 'P', 'task', 'key', 'deadline')`, [U1])
    await setup.query(`INSERT INTO device_tokens (id, user_id, timezone) VALUES ('00000000-0000-4000-8000-0000000000aa', $1, 'America/Los_Angeles')`, [U2])
    await setup.query(`INSERT INTO xp_events (id, owner_id, amount) VALUES ('x1', $1, 1)`, [U1])

    let t = Date.parse('2026-10-08T15:30:00Z')
    const job = createAutoTrash({ store: pgAutoTrashStore(pool as any), now: () => t, log: () => {} })
    assert.deepEqual(await job.tick(), { users: 1, tasks: 2 })
    const rows = async () => Object.fromEntries((await setup.query('SELECT id, deleted_at, modified_at, status FROM tasks')).rows.map((r) => [r.id, r]))
    let r = await rows()
    assert.equal(r.a.deleted_at, '2026-10-08T15:30:00.000Z')
    assert.equal(r.a.modified_at, '2026-10-08T15:30:00.000Z')
    assert.equal(r.kid.deleted_at, '2026-10-08T15:30:00.000Z')
    for (const id of ['kid-done', 'b', 'rep', 'pin', 'arch', 'proj', 'key', 'la']) assert.equal(r[id].deleted_at, null, id)
    const vs = (await setup.query(`SELECT owner_id, options_json FROM view_settings WHERE view_key = $1`, [AUTO_TRASH.batchKey])).rows
    assert.equal(vs.length, 1)
    assert.deepEqual(parseBatch(vs[0].options_json)!.ids.sort(), ['a', 'kid'])
    assert.equal((await setup.query(`SELECT count(*)::int AS n FROM auto_trash_log`)).rows[0].n, 2)
    assert.equal((await setup.query(`SELECT count(*)::int AS n FROM xp_events`)).rows[0].n, 1)
    // 같은 날 다시 → 그대로
    assert.deepEqual(await job.tick(), { users: 0, tasks: 0 })
    // 되돌림 → 다음 날에도 a는 다시 안 옮김, b·la는 옮김
    await setup.query(`UPDATE tasks SET deleted_at = NULL WHERE id IN ('a', 'kid')`)
    t = Date.parse('2026-10-09T16:00:00Z')
    assert.deepEqual(await job.tick(), { users: 2, tasks: 2 })
    r = await rows()
    assert.equal(r.a.deleted_at, null)
    assert.ok(r.b.deleted_at && r.la.deleted_at)
    // 설정 끔
    await ins('z', U1, '2026-01-01')
    await setup.query(`INSERT INTO view_settings (id, owner_id, view_key, options_json) VALUES ($1, $2, 'autoTrash', '{"on":false}')`, [`autotrash-${U1}`, U1])
    t = Date.parse('2026-10-11T16:00:00Z')
    await job.tick()
    assert.equal((await rows()).z.deleted_at, null)
    // 사용자 지우면 서버 전용 표도 같이
    await setup.query(`DELETE FROM users WHERE id = $1`, [U1])
    assert.equal((await setup.query(`SELECT count(*)::int AS n FROM auto_trash_log`)).rows[0].n, 1)
    assert.equal((await setup.query(`SELECT count(*)::int AS n FROM auto_trash_state WHERE owner_id = $1`, [U1])).rows[0].n, 0)
    console.log('autoTrash: postgres ok')
  } finally {
    await setup.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {})
    setup.release()
    await pool.end()
  }
}

console.log('autoTrash: ok')
