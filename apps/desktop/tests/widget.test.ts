// 25 맥 위젯 §8.3·§8.5: 저장 파일(snapshot v1) 만들기 · 대기열 파일 검사 · 위젯 체크 반영(taskCore) · 예시 파일 형식
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { addDays } from '@sprout/schema/time'
import { insertStmt, planCompleteWithXp, type CoreDb, type Stmt } from '@sprout/schema/taskCore'
import { actionTooOld, buildSnapshot, isoLocal, parseAction, snapshotKey, widgetAccents, MAX_TASKS } from '../src/main/widgetSnapshot'
import { dayKey } from '../src/renderer/src/lib/dates'

const SQL = await initSqlJs()
const sqldb = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) sqldb.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = sqldb.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const db: CoreDb = { getAll: async <T,>(sql: string, p?: unknown[]) => all(sql, p) as T[], get: async <T,>(sql: string, p?: unknown[]) => (all(sql, p)[0] ?? null) as T | null }
const run = (stmts: Stmt[]) => { for (const s of stmts) sqldb.run(s.sql, s.params as never) }

const today = dayKey()
const yesterday = addDays(today, -1)
run([
  insertStmt('lists', { id: 'l1', name: '기본함', kind: 'inbox', show_in_smart: 'all' }),
  insertStmt('lists', { id: 'l2', name: '숨김', kind: 'normal', show_in_smart: 'none' }),
  insertStmt('tasks', { id: 'a', list_id: 'l1', title: '아침 스트레칭', status: 0, priority: 1, due_at: `${today}T08:00`, is_all_day: 0, sort_order: 1 }),
  insertStmt('tasks', { id: 'b', list_id: 'l1', title: '기획서 초안 쓰기', status: 0, priority: 3, due_at: today, is_all_day: 1, sort_order: 2 }),
  insertStmt('tasks', { id: 'b1', list_id: 'l1', parent_id: 'b', title: '자료 조사', status: 0, priority: 0, sort_order: 3 }),
  insertStmt('tasks', { id: 'o', list_id: 'l1', title: '보고서 제출', status: 0, priority: 2, due_at: yesterday, is_all_day: 1, sort_order: 4 }),
  insertStmt('tasks', { id: 'r', list_id: 'l1', title: '물 마시기', status: 0, priority: 0, due_at: today, is_all_day: 1, repeat_rule: 'FREQ=DAILY', sort_order: 5 }),
  insertStmt('tasks', { id: 'done', list_id: 'l1', title: '끝난 일', status: 1, due_at: today, sort_order: 6 }),
  insertStmt('tasks', { id: 'del', list_id: 'l1', title: '지운 일', status: 0, due_at: today, deleted_at: '2026-01-01', sort_order: 7 }),
  insertStmt('tasks', { id: 'hid', list_id: 'l2', title: '숨긴 리스트', status: 0, due_at: today, sort_order: 8 }),
  insertStmt('tasks', { id: 'tm', list_id: 'l1', title: '내일 일', status: 0, due_at: addDays(today, 1), sort_order: 9 }),
  insertStmt('user_prefs', { id: 'p', theme: 'matcha|black' }),
  insertStmt('characters', { id: 'c', name: '미미', species: 'cat', assessed_at: '2026-10-01T00:00:00Z' }),
  insertStmt('xp_events', { id: 'x1', kind: 'kpi', amount: 60, ref_id: 'k', day: yesterday, created_at: '2026-10-01T00:00:00Z' }),
  insertStmt('xp_events', { id: 'x2', kind: 'task', amount: 1, ref_id: 'q', day: today, created_at: '2026-10-02T00:00:00Z' })
])

// ── 로그아웃: 로그아웃 형태만(할 일 제목이 남지 않게, §8.8) ──
const out = await buildSnapshot(db, { today, now: new Date(), signedIn: false })
assert.deepEqual(Object.keys(out).sort(), ['account', 'generatedAt', 'schema'])
assert.equal(out.account.signedIn, false)
assert.ok(!JSON.stringify(out).includes('스트레칭'))

// ── 로그인: 만료됨 먼저, 오늘(앱 정렬 그대로 — 종일이 시각보다 앞), 하위는 부모 바로 아래 depth 1, 완료·삭제·숨긴 리스트·내일 제외 ──
const snap = await buildSnapshot(db, { today, now: new Date(), signedIn: true, appliedActions: ['A1'] })
assert.equal(snap.schema, 1)
assert.equal(snap.day, today)
const tasks = snap.today!.tasks
assert.deepEqual(tasks.map((t) => t.id), ['o', 'b', 'b1', 'r', 'a'])
assert.equal(snap.today!.count, 5)
assert.deepEqual(tasks.map((t) => t.depth), [0, 0, 1, 0, 0])
const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
assert.equal(byId.o.labelTone, 'danger')
assert.equal(byId.o.label, '어제')
assert.equal(byId.a.label, '오전 8:00')
assert.equal(byId.a.labelTone, 'accent')
assert.equal(byId.b.label, '오늘')
assert.equal(byId.b1.label, null)
assert.equal(byId.r.repeat, true)
assert.equal(byId.b.priority, 3)
// 메모·리스트 이름 같은 다른 필드는 넣지 않는다(§8.8)
assert.deepEqual(Object.keys(byId.a).sort(), ['depth', 'id', 'label', 'labelTone', 'overdueAt', 'priority', 'repeat', 'title'])
assert.deepEqual(snap.appliedActions, ['A1'])

// 테마 강조색(§5.2): 라이트 = 기본 테마(말차), 다크 = 다크일 때 테마(트루 블랙)
assert.deepEqual(snap.theme, { accentLight: '#55793D', accentDark: '#5A62FA' })
assert.deepEqual(widgetAccents('dark'), { accentLight: '#12715E', accentDark: '#19856B' })
assert.deepEqual(widgetAccents(null), { accentLight: '#12715E', accentDark: '#19856B' })

// 캐릭터: 61 XP → Lv 2(40) + 21/60, 오늘 할 일 XP 1 → 기쁨
const g = snap.growth!
assert.equal(g.hasCharacter, true)
assert.equal(g.name, '미미')
assert.equal(g.level, 2)
assert.equal(g.xpInto, 21)
assert.equal(g.xpToNext, 60)
assert.equal(g.todayTaskXp, 1)
assert.equal(g.mood, 'happy')
assert.equal(g.stageName, '아기')
assert.equal(g.species, 'worm') // 옛 종 id(cat)도 새 종으로(43 결정 ⑥)
assert.equal(g.art, 'art/v5-worm-1-happy@2x.png')

// 내용이 같으면 키가 같다(generatedAt만 다름 → 새로 고침 안 함)
const again = await buildSnapshot(db, { today, now: new Date(Date.now() + 5000), signedIn: true, appliedActions: ['A1'] })
assert.equal(snapshotKey(again), snapshotKey(snap))

// 20개 넘으면 잘리고 개수는 전체
run(Array.from({ length: 25 }, (_, i) => insertStmt('tasks', { id: `m${i}`, list_id: 'l1', title: `많음 ${i}`, status: 0, due_at: today, sort_order: 100 + i })))
const big = await buildSnapshot(db, { today, now: new Date(), signedIn: true })
assert.equal(big.today!.tasks.length, MAX_TASKS)
assert.equal(big.today!.count, 30)

// ── 대기열 파일 검사(§8.5) ──
const ok = parseAction(JSON.stringify({ schema: 1, id: '01J9ZK3', kind: 'complete', taskId: 'a', at: new Date().toISOString(), day: today }))
assert.ok(ok)
assert.equal(parseAction('{'), null)
assert.equal(parseAction(JSON.stringify({ schema: 2, id: 'x', kind: 'complete', taskId: 'a', at: new Date().toISOString() })), null)
assert.equal(parseAction(JSON.stringify({ schema: 1, id: 'x', kind: 'delete', taskId: 'a', at: new Date().toISOString() })), null)
assert.equal(parseAction(JSON.stringify({ schema: 1, id: '../evil', kind: 'complete', taskId: 'a', at: new Date().toISOString() })), null)
assert.equal(parseAction(JSON.stringify({ schema: 1, id: 'x', kind: 'complete', taskId: "a' OR 1=1", at: new Date().toISOString() })), null)
assert.equal(actionTooOld(ok!, new Date()), false)
assert.equal(actionTooOld({ ...ok!, at: '2020-01-01T00:00:00Z' }, new Date()), true)

// ── 위젯 체크 반영 = 정상 완료 경로(완료 + XP +1) ──
const plan = await planCompleteWithXp(db, ['a'], { today })
run(plan.stmts)
assert.equal(all("SELECT status FROM tasks WHERE id = 'a'")[0].status, 1)
assert.equal(plan.granted, 1)
const after = await buildSnapshot(db, { today, now: new Date(), signedIn: true })
assert.ok(!after.today!.tasks.some((t) => t.id === 'a'))
assert.equal(after.growth!.todayTaskXp, 2)

// ── 예시 파일(Swift 시험과 공용)이 계약 모양을 지킨다 ──
const fixture = JSON.parse(readFileSync('apps/desktop/native/widget/fixtures/snapshot.v1.json', 'utf8'))
assert.equal(fixture.schema, 1)
assert.deepEqual(Object.keys(fixture.today.tasks[0]).sort(), Object.keys(byId.a).sort())
assert.deepEqual(Object.keys(fixture.growth).sort(), Object.keys(g).sort())

assert.match(isoLocal(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/)
console.log('widget tests ok')
