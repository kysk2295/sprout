// 32 §9.2 데스크톱 설정 › 알림: notify_json 읽기(기본값)·합치기·저장(행 없음 → insert, 있음 → update, 다른 칸 보존)·시각 목록
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { DEFAULT_NOTIFY, parseNotifyPrefs } from '@sprout/schema/notify'
import { dailyTimeOptions, mergeNotify, saveNotifyPrefs } from '../src/renderer/src/data/notifyPrefs'

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

// 합치기: 안쪽 칸만 바뀌고 나머지는 그대로, 깨진 시각은 기본값
const m = mergeNotify(DEFAULT_NOTIFY, { daily: { on: true } })
assert.deepEqual(m.daily, { on: true, time: '08:00', skipWeekends: false })
assert.deepEqual(m.growth, DEFAULT_NOTIFY.growth)
assert.equal(mergeNotify(DEFAULT_NOTIFY, { daily: { time: '25:00' } }).daily.time, '08:00')
assert.equal(mergeNotify(m, { growth: { report: false } }).daily.on, true)

// 저장: 행이 없으면 만든다
const a = await saveNotifyPrefs({ hideTitles: true })
assert.equal(a.hideTitles, true)
let rows = all('SELECT id, notify_json, theme FROM user_prefs')
assert.equal(rows.length, 1)
assert.deepEqual(parseNotifyPrefs(rows[0].notify_json as string), { ...DEFAULT_NOTIFY, hideTitles: true })
// 이미 행이 있으면(테마 등 다른 칸) 그 행을 고치고 다른 칸은 그대로
db.run('UPDATE user_prefs SET theme = ?', ['dark'])
await saveNotifyPrefs({ daily: { on: true, time: '07:30', skipWeekends: true } })
await saveNotifyPrefs({ growth: { evolve: false } })
rows = all('SELECT id, notify_json, theme FROM user_prefs')
assert.equal(rows.length, 1)
assert.equal(rows[0].theme, 'dark')
const saved = parseNotifyPrefs(rows[0].notify_json as string)
assert.deepEqual(saved, { reminders: true, hideTitles: true, daily: { on: true, time: '07:30', skipWeekends: true }, growth: { evolve: false, report: true, goalDue: true, inboxCleanup: false } })
// 저장한 JSON은 모든 칸을 담는다(휴대폰·서버가 기본값을 다르게 두어도 같은 값)
assert.deepEqual(Object.keys(JSON.parse(rows[0].notify_json as string)).sort(), ['daily', 'growth', 'hideTitles', 'reminders'])
// 깨진 값이 저장돼 있어도 기본값에서 이어서 저장
db.run('UPDATE user_prefs SET notify_json = ?', ['{not json'])
assert.deepEqual(await saveNotifyPrefs({ reminders: false }), { ...DEFAULT_NOTIFY, reminders: false })

// 시각 목록: 30분 간격 48개, 표기는 앱과 같게, 격자 밖 값은 제자리에 끼운다
const opts = dailyTimeOptions('08:00')
assert.equal(opts.length, 48)
assert.deepEqual(opts[16], { value: '08:00', label: '오전 8:00' })
assert.equal(opts[0].label, '오전 12:00')
assert.equal(opts[27].label, '오후 1:30')
const odd = dailyTimeOptions('08:15')
assert.equal(odd.length, 49)
assert.deepEqual(odd[17], { value: '08:15', label: '오전 8:15' })

console.log('notify ok')
