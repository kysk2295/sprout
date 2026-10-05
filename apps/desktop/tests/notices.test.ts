// 01 §3.2.1 레일 ⟳ 결과 토스트 · §3.3 종 알림 패널(합치기·자르기·시각 표기·웹 미리보기 기록) · AI 태그 줄 되돌리기(DB, sql.js)
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { autoTagTitle, markRead, markUndone, mergeNotice, NOTICE_MAX, noticeTime, prune, unreadCount, type Notice } from '../src/shared/notices'
import { SYNC_MIN_SPIN_MS, syncResultToast } from '../src/renderer/src/data/auth'

// ── 동기화 결과 → 토스트 ──
assert.ok(SYNC_MIN_SPIN_MS >= 800)
assert.deepEqual(syncResultToast({ ok: true, pending: 0, lastSyncedAt: null }), { text: '동기화 완료', retry: false })
assert.deepEqual(syncResultToast({ ok: true, pending: 3, lastSyncedAt: null }), { text: '동기화 완료 · 올릴 것 3건 남음', retry: false })
assert.equal(syncResultToast({ ok: false, reason: 'offline' }).retry, true)
assert.match(syncResultToast({ ok: false, reason: 'offline' }).text, /오프라인/)
assert.deepEqual(syncResultToast({ ok: false, reason: 'error', message: 'HTTP 500' }), { text: '동기화에 실패했어요', retry: true })
assert.equal(syncResultToast({ ok: false, reason: 'timeout' }).retry, false)
assert.equal(syncResultToast({ ok: false, reason: 'signed-out' }).retry, false)

// ── 합치기 ──
const T = '2026-10-05T09:00:00.000Z'
let list: Notice[] = []
list = mergeNotice(list, { kind: 'reminder', key: 'reminder:r1', title: '보고서 내기', body: '10월 5일 오후 3:00', target: { view: 'tasks', task: 't1' } }, T, 'n1')
assert.equal(list.length, 1)
assert.equal(list[0].read, false)
assert.equal(list[0].at, T)
// 같은 key는 한 번만
assert.equal(mergeNotice(list, { kind: 'reminder', key: 'reminder:r1', title: '다른 제목' }, T, 'n2'), list)
// 새 것은 맨 앞
list = mergeNotice(list, { kind: 'levelup', key: 'levelup:c:3', title: '레벨 3이 됐어요', read: true, target: { view: 'growth' } }, '2026-10-05T09:01:00.000Z', 'n2')
assert.deepEqual(list.map((n) => n.id), ['n2', 'n1'])
assert.equal(list[0].read, true, '레벨업 창을 이미 봤으면 읽음')
assert.equal(unreadCount(list), 1)
// AI 태그: 하루 한 줄로 더해지고 다시 안 읽음 + 맨 앞
list = mergeNotice(list, { kind: 'autotag', key: 'autotag:2026-10-05', title: autoTagTitle(2), count: 2, undo: ['a1'] }, '2026-10-05T09:02:00.000Z', 'n3')
list = markRead(list)
assert.equal(unreadCount(list), 0, '모두 읽음')
list = mergeNotice(list, { kind: 'reminder', key: 'reminder:r2', title: '운동' }, '2026-10-05T09:03:00.000Z', 'n4')
list = mergeNotice(list, { kind: 'autotag', key: 'autotag:2026-10-05', title: autoTagTitle(3), count: 3, undo: ['a2'] }, '2026-10-05T09:04:00.000Z', 'n5')
assert.equal(list[0].id, 'n3', '같은 줄(id 그대로)')
assert.equal(list[0].count, 5)
assert.deepEqual(list[0].undo, ['a1', 'a2'])
assert.equal(list[0].title, 'AI가 태그 5개 붙였어요')
assert.equal(list[0].read, false)
assert.equal(list.length, 4)
// 되돌린 뒤 또 붙으면 새 줄
list = markUndone(list, 'n3')
assert.equal(list[0].undone, true)
assert.equal(list[0].title, '자동 태그를 되돌렸어요')
list = mergeNotice(list, { kind: 'autotag', key: 'autotag:2026-10-05', title: autoTagTitle(1), count: 1, undo: ['a3'] }, '2026-10-05T09:05:00.000Z', 'n6')
assert.equal(list[0].id, 'n6')
assert.deepEqual(list[0].undo, ['a3'])
assert.equal(list.filter((n) => n.key === 'autotag:2026-10-05').length, 1)
// 하나만 읽음
list = markRead(list, 'n4')
assert.equal(list.find((n) => n.id === 'n4')!.read, true)

// ── 자르기: 30일 · 100개 ──
const old: Notice = { id: 'old', kind: 'reminder', key: 'k-old', title: '옛날', at: '2026-08-01T00:00:00.000Z', read: false }
assert.deepEqual(prune([old], T), [])
const many = Array.from({ length: 130 }, (_, i): Notice => ({ id: `m${i}`, kind: 'reminder', key: `k${i}`, title: `${i}`, at: T, read: false }))
assert.equal(prune(many, T).length, NOTICE_MAX)
assert.equal(prune(many, T)[0].id, 'm0', '앞(최근)을 남긴다')

// ── 시각 표기 ──
const now = new Date(2026, 9, 5, 15, 0)
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
assert.equal(noticeTime(ago(20_000), now), '방금')
assert.equal(noticeTime(ago(5 * 60_000), now), '5분 전')
assert.equal(noticeTime(ago(3 * 3600_000), now), '3시간 전')
assert.equal(noticeTime(new Date(2026, 9, 4, 23, 0).toISOString(), now), '어제')
assert.equal(noticeTime(new Date(2026, 9, 1, 9, 0).toISOString(), now), '10월 1일')

// ── DB: 알림 줄 되돌리기 = 그 묶음(created_at)의 자동 연결만 dismissed, 그때 만든 빈 AI 태그는 지움 ──
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, any>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  window: { sprout: { db: {
    getAll: async (sql: string, p?: unknown[]) => all(sql, p),
    get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
    transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
  } } }
})
const A1 = '2026-10-05T09:00:00.000Z', A2 = '2026-10-05T10:00:00.000Z', OTHER = '2026-10-04T09:00:00.000Z'
db.run(`INSERT INTO tags (id, name, kind, source, created_at) VALUES ('g-user', '공부', 'topic', 'user', '${OTHER}'), ('g-ai', 'SQLD', 'topic', 'ai', '${A1}'), ('g-ai2', '면접', 'topic', 'ai', '${A2}')`)
db.run(`INSERT INTO task_tags (id, task_id, tag_id, source, state, created_at) VALUES
  ('l1', 't1', 'g-user', 'rule', 'accepted', '${A1}'),
  ('l2', 't2', 'g-ai', 'ai', 'accepted', '${A1}'),
  ('l3', 't3', 'g-user', 'ai', 'accepted', '${OTHER}'),
  ('l4', 't4', 'g-user', 'user', 'accepted', '${A1}'),
  ('l5', 't5', 'g-ai2', 'ai', 'accepted', '${A2}'),
  ('l6', 't6', 'g-ai2', 'user', 'accepted', '${OTHER}')`)
const { undoAutoTagAt } = await import('../src/renderer/src/data/autoTag')
assert.deepEqual(await undoAutoTagAt([]), { dismissed: 0, tags: 0 })
const r = await undoAutoTagAt([A1, A2])
assert.deepEqual(r, { dismissed: 2, tags: 1 })
const state = (id: string) => all('SELECT state FROM task_tags WHERE id = ?', [id])[0]?.state
assert.equal(state('l1'), 'dismissed', '그 묶음의 자동 연결')
assert.equal(state('l2'), undefined, '빈 AI 태그와 함께 지움')
assert.equal(all("SELECT id FROM tags WHERE id = 'g-ai'").length, 0)
assert.equal(state('l3'), 'accepted', '다른 묶음은 그대로')
assert.equal(state('l4'), 'accepted', '사람이 붙인 것은 그대로')
assert.equal(state('l5'), 'dismissed', '사람 연결이 있는 AI 태그는 남기고 연결만 뗌')
assert.equal(all("SELECT id FROM tags WHERE id = 'g-ai2'").length, 1)

// ── 웹 미리보기 기록(localStorage) ──
const N = await import('../src/renderer/src/data/notices')
N.addNotice({ kind: 'project', key: 'project:p1', title: '프로젝트를 만들었어요', body: 'SQLD', target: { view: 'map' } })
await new Promise((res) => setTimeout(res, 0))
const saved = JSON.parse(store.get('sprout.notices') ?? '[]') as Notice[]
assert.equal(saved.length, 1)
assert.equal(saved[0].target?.view, 'map')
await N.readNotice()
assert.equal((JSON.parse(store.get('sprout.notices')!) as Notice[])[0].read, true)

console.log('notices ok')
