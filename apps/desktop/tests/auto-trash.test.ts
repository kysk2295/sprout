// 48 자동 정리 — 앱 쪽(DB, sql.js): 설정 행(사용자당 한 행·끔/켬·시간대) · 묶음 본 것 표시 · 그 묶음만 되돌리기
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { batchJson, parseAutoTrashSettings, parseBatch, pendingNotice } from '@sprout/schema/autoTrash'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, any>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
Object.assign(globalThis, {
  window: { sprout: { db: {
    getAll: async (sql: string, p?: unknown[]) => all(sql, p),
    get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
    transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
  } } }
})
const A = await import('../src/renderer/src/data/autoTrash')

// 설정: 행이 없으면 켬, 스위치 → 사용자당 한 행
assert.equal(parseAutoTrashSettings(all(A.SETTINGS_SQL)[0]?.options_json).on, true)
await A.saveAutoTrash(false)
await A.saveAutoTrash(false)
const set = all("SELECT id, options_json FROM view_settings WHERE view_key = 'autoTrash'")
assert.equal(set.length, 1)
assert.equal(set[0].id, 'autotrash-local') // 로그인 전(시험) = local
assert.equal(parseAutoTrashSettings(set[0].options_json).on, false)
await A.saveAutoTrash(true)
assert.equal(parseAutoTrashSettings(all(A.SETTINGS_SQL)[0].options_json).on, true)

// 서버가 만든 묶음 두 개(동기화로 내려온 모양)
const at1 = '2026-10-08T15:30:00.000Z'
const at2 = '2026-10-09T15:30:00.000Z'
for (const [id, at] of [['a', at1], ['kid', at1], ['b', at2]]) db.run('INSERT INTO tasks (id, title, status, due_at, deleted_at) VALUES (?, ?, 0, ?, ?)', [id, id, '2026-09-01', at])
db.run("INSERT INTO tasks (id, title, status, due_at, deleted_at) VALUES ('mine', 'mine', 0, '2026-09-01', '2026-10-09T01:00:00.000Z')") // 손으로 지운 것
db.run('INSERT INTO view_settings (id, view_key, created_at, options_json) VALUES (?, ?, ?, ?)', ['B1', 'autoTrash:batch', at1, batchJson({ at: at1, day: '2026-10-09', ids: ['a', 'kid'], count: 2, seen: false, undone: false })])
db.run('INSERT INTO view_settings (id, view_key, created_at, options_json) VALUES (?, ?, ?, ?)', ['B2', 'autoTrash:batch', at2, batchJson({ at: at2, day: '2026-10-10', ids: ['b', 'mine'], count: 2, seen: false, undone: false })])
const notice = pendingNotice(all(A.BATCHES_SQL) as never)
assert.deepEqual(notice, { batchIds: ['B2', 'B1'], count: 4 })

// 본 것 표시 → 다시 안 뜸
await A.markBatchesSeen(notice!.batchIds)
assert.equal(pendingNotice(all(A.BATCHES_SQL) as never), null)

// B1만 되돌리기: 그 묶음 시각으로 휴지통에 있는 것만. 사용자가 그 사이 kid를 다시 지웠으면(시각 다름) 그대로
db.run("UPDATE tasks SET deleted_at = '2026-10-09T09:00:00.000Z' WHERE id = 'kid'")
assert.equal(await A.undoBatches(['B1']), 1)
const del = Object.fromEntries(all('SELECT id, deleted_at FROM tasks').map((r) => [r.id, r.deleted_at]))
assert.deepEqual(del, { a: null, kid: '2026-10-09T09:00:00.000Z', b: at2, mine: '2026-10-09T01:00:00.000Z' })
assert.equal(parseBatch(all("SELECT options_json FROM view_settings WHERE id = 'B1'")[0].options_json)!.undone, true)
// 한 번 더 눌러도 0
assert.equal(await A.undoBatches(['B1']), 0)
// B2 되돌리기: 묶음에 없는 시각의 'mine'은 그대로
assert.equal(await A.undoBatches(['B2']), 1)
assert.equal(all("SELECT deleted_at FROM tasks WHERE id = 'mine'")[0].deleted_at, '2026-10-09T01:00:00.000Z')
// 앱은 XP 표를 건드리지 않는다
assert.equal(all('SELECT count(*) AS c FROM xp_events')[0].c, 0)

console.log('auto-trash (desktop db): ok')
