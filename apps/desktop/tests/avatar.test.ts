// 35 프로필 이미지: saveAvatar — 행 없음 → insert, 있음 → update(다른 칸 보존), null = 글자로 되돌리기
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { parseAvatar, pickAvatar } from '@sprout/schema/avatar'
import { saveAvatar } from '../src/renderer/src/data/avatar'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const fakeDb = {
  getAll: async (sql: string, p?: unknown[]) => all(sql, p),
  get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
  execute: async (sql: string, p?: unknown[]) => { db.run(sql, p as never) },
  transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
}
Object.assign(globalThis, { window: { sprout: { db: fakeDb }, dispatchEvent: () => true } })

await saveAvatar({ kind: 'face', id: 'rabbit', color: 'blue' })
let rows = all('SELECT id, avatar_json, theme FROM user_prefs')
assert.equal(rows.length, 1)
assert.deepEqual(parseAvatar(rows[0].avatar_json as string), { kind: 'face', id: 'rabbit', color: 'blue' })

db.run("UPDATE user_prefs SET theme = 'dark'")
await saveAvatar({ kind: 'follow', color: 'rose' })
rows = all('SELECT id, avatar_json, theme FROM user_prefs')
assert.equal(rows.length, 1)
assert.equal(rows[0].theme, 'dark')
assert.deepEqual(JSON.parse(rows[0].avatar_json as string), { kind: 'follow', color: 'rose' })

await saveAvatar(null)
rows = all('SELECT avatar_json FROM user_prefs')
assert.equal(rows[0].avatar_json, null)
assert.equal(parseAvatar(rows[0].avatar_json as null), null)
console.log('desktop avatar ok')

// 함수로 저장: 지금 DB 값 위에 적용(화면 값이 늦게 읽혀도 색 유지)
await saveAvatar({ kind: 'face', id: 'fox', color: 'yellow' })
await saveAvatar((cur) => pickAvatar(cur, 'follow'))
assert.deepEqual(parseAvatar(all('SELECT avatar_json FROM user_prefs')[0].avatar_json as string), { kind: 'follow', color: 'yellow' })
console.log('desktop avatar merge ok')
