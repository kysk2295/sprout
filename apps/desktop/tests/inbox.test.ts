// 02 §14.1 기본함 안전망(2026-10-05 사용자 결정): 새 할 일은 조용히 사라지지 않는다.
// list_id가 비었거나 없는 리스트면 기본함으로, 기본함도 없으면 만든다(로그인 = inbox-<userId>). 같은 묶음에서 만드는 리스트는 그대로.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, any>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
let user: { id: string; email: string } | null = { id: 'U9', email: 'u@x.co' }
let failWrites = false
Object.assign(globalThis, {
  window: { sprout: {
    db: {
      getAll: async (sql: string, p?: unknown[]) => all(sql, p),
      get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
      transaction: async (stmts: { sql: string; params?: unknown[] }[]) => {
        if (failWrites) throw new Error('disk full')
        db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e }
      }
    },
    auth: { state: async () => ({ user, sync: {} }) }
  }, dispatchEvent: () => true } // 다음 시험 파일들이 같은 프로세스에서 window를 쓴다
})
const { createTask, insert, run, taskListId, uuid } = await import('../src/renderer/src/data/mutations')
const { createCalendarTask } = await import('../src/renderer/src/data/calendarCreate')
const inboxes = () => all("SELECT id, name, kind FROM lists WHERE kind = 'inbox'")
const listOf = (id: string) => all('SELECT list_id FROM tasks WHERE id = ?', [id])[0]?.list_id

// 기본함이 하나도 없는 로그인 계정(예: 서버가 리스트 없이 만든 구글 계정) → 캘린더에서 만든 할 일이 기본함에 들어간다
assert.equal(inboxes().length, 0)
const cal = await createCalendarTask('회의', '', 0, { start_at: null, due_at: '2026-10-06', is_all_day: 1, repeat_rule: null, repeat_from: null, reminders: [] } as never)
assert.deepEqual(inboxes(), [{ id: 'inbox-U9', name: '기본함', kind: 'inbox' }])
assert.equal(listOf(cal), 'inbox-U9')

// 빈 list_id → 기본함. 있는 리스트는 그대로(없는 id도 run은 건드리지 않는다 — 동기화 중일 수 있다). 기본함은 하나뿐
await run(insert('lists', { id: 'work', name: '업무', kind: 'normal', sort_order: 1 }))
assert.equal(listOf(await createTask({ title: 'a', list_id: '' })), 'inbox-U9')
assert.equal(await taskListId('gone'), 'inbox-U9') // 명시적으로 고를 때는 없는 리스트 → 기본함
assert.equal(listOf(await createTask({ title: 'b', list_id: 'work' })), 'work')
assert.equal(listOf(await createTask({ title: 'c', list_id: null })), 'inbox-U9')
assert.equal(inboxes().length, 1)

// list_id 칸이 아예 없는 insert도 기본함으로
const bare = uuid()
await run(insert('tasks', { id: bare, title: 'd', status: 0 }))
assert.equal(listOf(bare), 'inbox-U9')

// 같은 묶음에서 새로 만드는 리스트로 가는 할 일은 옮기지 않는다
const t2 = uuid()
await run(insert('lists', { id: 'fresh', name: '새 리스트', kind: 'normal' }), insert('tasks', { id: t2, title: 'e', list_id: 'fresh' }))
assert.equal(listOf(t2), 'fresh')

// 둘이면 가장 오래된 것
await run({ sql: "INSERT INTO lists (id, kind, name, created_at) VALUES ('older', 'inbox', '기본함', '2000-01-01T00:00:00.000Z')" })
assert.equal(await taskListId(''), 'older')
assert.equal(listOf(await createTask({ title: 'f', list_id: '' })), 'older')

// 로그인 전(웹 미리보기·로그아웃) → uuid 기본함
db.run('DELETE FROM lists')
user = null
const local = await taskListId(null)
assert.ok(local && !local.startsWith('inbox-'))
assert.equal(inboxes().length, 1)

// 쓰기가 실패하면 throw(조용히 사라지지 않는다 → 화면이 토스트)
db.run('DELETE FROM lists')
failWrites = true
await assert.rejects(createTask({ title: 'g', list_id: '' }))
failWrites = false

console.log('inbox: ok')
