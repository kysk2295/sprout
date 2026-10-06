// 31 §12.9 프로젝트 편집(DB, sql.js): 손으로 뺀 것은 자동 패스가 다시 안 붙임 · 일의 종류 덮어쓰기 · 순서 선 고리 · 관련 선 ·
// 사람·메모 잇기 · 새 할 일(주 리스트·태그·종류) · 새 프로젝트·이름·합치기·삭제 · 되돌리기 · 자동으로 프로젝트 만들기 끔.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { findProjectClusters } from '@sprout/schema/projects'

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
const P = await import('../src/renderer/src/data/projects')
const E = await import('../src/renderer/src/data/projectEdit')

db.run("INSERT INTO lists (id, name, kind) VALUES ('in', 'Inbox', 'inbox'), ('la', 'AI 공부', NULL), ('le', '교육', NULL)")
let n = 0
const task = (id: string, title: string, list: string, due: string | null) => db.run('INSERT INTO tasks (id, title, list_id, status, due_at, created_at, sort_order) VALUES (?,?,?,0,?,?,?)', [id, title, list, due, '2026-09-01T00:00:00Z', n++])
task('c1', '데이터 공모전 자료조사', 'la', '2026-09-10'); task('c2', '데이터 공모전 분석', 'la', '2026-09-20'); task('c3', '데이터 공모전 제출', 'le', '2026-10-10'); task('c4', '데이터 공모전 회의', 'le', '2026-10-03')
await P.runProjectPass({ at: '2026-10-05T09:00:00.000Z', force: true })
assert.equal(all("SELECT count(*) AS c FROM tags WHERE kind = 'project'")[0].c, 0, '31 §12.13.1 패스는 프로젝트를 만들지 않는다')
// 제안 카드 [만들기]로 만든다
const sugg = findProjectClusters(await P.readProjectCtx(new Date('2026-10-05T09:00:00.000Z'))).auto
assert.equal(sugg.length, 1, '제안 하나')
await P.createProjectFrom(sugg[0], '2026-10-05T09:00:00.000Z')
const proj = all("SELECT id, name, source FROM tags WHERE kind = 'project'")
assert.equal(proj.length, 1, '프로젝트 하나')
const pid = proj[0].id as string
const linked = (tag = pid) => all("SELECT task_id, source, state FROM task_tags WHERE tag_id = ? AND COALESCE(state,'accepted') = 'accepted' ORDER BY task_id", [tag]).map((r) => r.task_id)
assert.deepEqual(linked(), ['c1', 'c2', 'c3', 'c4'])

// 사람이 넣은 것도 빼면 dismissed — 자동 패스가 다시 안 붙임
await P.addToProject(['c4'], pid)
assert.equal(all('SELECT source FROM task_tags WHERE task_id = ? AND tag_id = ?', ['c4', pid])[0].source, 'user')
const out = await P.removeFromProject('c4', pid)
assert.equal(all('SELECT state FROM task_tags WHERE task_id = ? AND tag_id = ?', ['c4', pid])[0].state, 'dismissed')
await P.runProjectPass({ at: '2026-10-05T10:00:00.000Z', force: true })
assert.ok(!linked().includes('c4'), '손으로 뺀 것은 그대로 빠져 있음')
await out()
assert.ok(linked().includes('c4'))

// 일의 종류 덮어쓰기(할 일당 한 행) · 되돌리기
const k1 = await E.setWorkKind('c1', 'dev')
await E.setWorkKind('c1', 'meeting')
assert.deepEqual(all("SELECT from_id, to_id, to_type, source FROM relations WHERE to_type = 'work_kind'"), [{ from_id: 'c1', to_id: 'meeting', to_type: 'work_kind', source: 'manual' }])
const k3 = await E.setWorkKind('c1', null)
assert.equal(all("SELECT count(*) AS c FROM relations WHERE to_type = 'work_kind'")[0].c, 0)
await k3()
assert.equal(all("SELECT to_id FROM relations WHERE to_type = 'work_kind'")[0].to_id, 'meeting')
await k1()
assert.equal(all("SELECT count(*) AS c FROM relations WHERE to_type = 'work_kind'")[0].c, 0, '처음 상태로')

// 순서 선 · 고리 · 방향 · 끊기 · 관련 선으로
assert.equal((await E.linkOrder('c1', 'c2')).result, 'ok')
assert.equal((await E.linkOrder('c2', 'c3')).result, 'ok')
assert.equal((await E.linkOrder('c3', 'c1')).result, 'cycle')
assert.equal((await E.linkOrder('c1', 'c2')).result, 'exists')
const l12 = all("SELECT id FROM map_links WHERE from_id = 'c1' AND to_id = 'c2'")[0].id as string
const flip = await E.flipOrder(l12)
assert.equal(flip.result, 'ok')
assert.deepEqual(all('SELECT from_id, to_id FROM map_links WHERE id = ?', [l12])[0], { from_id: 'c2', to_id: 'c1' })
await flip.undo()
assert.deepEqual(all('SELECT from_id, to_id FROM map_links WHERE id = ?', [l12])[0], { from_id: 'c1', to_id: 'c2' })
const toRel = await E.orderToRelated(l12, 'c1', 'c2')
assert.equal(all('SELECT count(*) AS c FROM map_links WHERE id = ?', [l12])[0].c, 0)
assert.equal(all("SELECT count(*) AS c FROM relations WHERE field = 'related'")[0].c, 1)
assert.equal((await E.linkRelated('c2', 'c1')).result, 'exists', '관련 선은 방향 없음')
await toRel()
assert.equal(all('SELECT count(*) AS c FROM map_links WHERE id = ?', [l12])[0].c, 1)
assert.equal(all("SELECT count(*) AS c FROM relations WHERE field = 'related'")[0].c, 0)
const cut = await E.unlinkAllOrders('c2')
assert.equal(cut.n, 2)
await cut.undo()
assert.equal(all("SELECT count(*) AS c FROM map_links WHERE kind = 'sequence'")[0].c, 2)

// 사람: 찾기·만들기 · 할 일에 붙이기 · 프로젝트에 잇기
const prof = await E.ensurePerson('👤 교수님')
assert.equal(prof.made, true)
assert.equal((await E.ensurePerson('교수님')).id, prof.id, '같은 이름은 그것')
const up = await E.linkPerson('c4', prof.id)
assert.equal(all('SELECT source FROM task_tags WHERE task_id = ? AND tag_id = ?', ['c4', prof.id])[0].source, 'user')
await up()
assert.equal(all('SELECT count(*) AS c FROM task_tags WHERE task_id = ? AND tag_id = ?', ['c4', prof.id])[0].c, 0)
const pp = await E.linkPersonToProject(pid, prof.id)
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_type = 'tag' AND field = 'project'")[0].c, 1)
await pp()
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_type = 'tag' AND field = 'project'")[0].c, 0)

// 메모: 만들고 잇기 · 할 일에도 · 끊기
const memo = await E.createNoteFor('공모전 데이터 설명서', { type: 'tag', id: pid })
assert.equal(all('SELECT content FROM notes WHERE id = ?', [memo.id])[0].content, '공모전 데이터 설명서')
await E.linkNote(memo.id, { type: 'task', id: 'c2' })
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_type = 'note'")[0].c, 2)
const un = await E.unlinkNote(memo.id, 'c2')
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_type = 'note'")[0].c, 1)
await un()
await memo.undo()
assert.equal(all('SELECT count(*) AS c FROM notes')[0].c, 0)

// 새 할 일: 주 리스트 · 날짜 · 프로젝트 태그 user · 종류
const made = await E.addProjectTask({ title: '발표 리허설', projectTagId: pid, listId: 'le', day: '2026-10-08', kind: 'meeting' })
assert.deepEqual(all('SELECT list_id, due_at FROM tasks WHERE id = ?', [made.id])[0], { list_id: 'le', due_at: '2026-10-08' })
assert.equal(all('SELECT source FROM task_tags WHERE task_id = ? AND tag_id = ?', [made.id, pid])[0].source, 'user')
assert.equal(all("SELECT to_id FROM relations WHERE from_id = ? AND to_type = 'work_kind'", [made.id])[0].to_id, 'meeting')
const ren = await E.renameTask(made.id, '발표 리허설 2')
assert.equal(all('SELECT title FROM tasks WHERE id = ?', [made.id])[0].title, '발표 리허설 2')
await ren()
assert.equal(all('SELECT title FROM tasks WHERE id = ?', [made.id])[0].title, '발표 리허설')
await made.undo()
assert.equal(all('SELECT count(*) AS c FROM tasks WHERE id = ?', [made.id])[0].c, 0)
assert.equal(all('SELECT count(*) AS c FROM task_tags WHERE task_id = ?', [made.id])[0].c, 0)

// 31 §12.12 빠른 추가 값: 주 리스트 없으면 기본함 · 시각 = 정시 알림 · 반복 · 우선순위 · #태그 · 되돌리기
{
  db.run("INSERT INTO tags (id, name, kind) VALUES ('tg', '중요', NULL)")
  const q = await E.addProjectTask({ title: '자료 정리', projectTagId: pid, listId: null, day: '2026-10-06T15:00', priority: 5, repeatRule: 'FREQ=WEEKLY', tagIds: ['tg'] })
  assert.deepEqual(all('SELECT list_id, due_at, is_all_day, priority, repeat_rule, deleted_at FROM tasks WHERE id = ?', [q.id])[0], { list_id: 'in', due_at: '2026-10-06T15:00', is_all_day: 0, priority: 5, repeat_rule: 'FREQ=WEEKLY', deleted_at: null }, '주 리스트가 없으면 기본함')
  assert.deepEqual(all('SELECT trigger FROM reminders WHERE task_id = ?', [q.id]).map((r) => r.trigger), ['-PT0M'])
  assert.deepEqual(all("SELECT tag_id, source FROM task_tags WHERE task_id = ? ORDER BY tag_id", [q.id]).map((r) => r.tag_id).sort(), [pid, 'tg'].sort())
  // 프로젝트에서 빼기 = 연결만(리스트·휴지통 그대로) — 삭제와 다름
  const o = await P.removeFromProject(q.id, pid)
  assert.deepEqual(all('SELECT list_id, deleted_at FROM tasks WHERE id = ?', [q.id])[0], { list_id: 'in', deleted_at: null }, '뺀 할 일은 리스트에 남음')
  assert.equal(all('SELECT state FROM task_tags WHERE task_id = ? AND tag_id = ?', [q.id, pid])[0].state, 'dismissed')
  await o()
  await q.undo()
  assert.equal(all('SELECT count(*) AS c FROM tasks WHERE id = ?', [q.id])[0].c, 0)
  assert.equal(all('SELECT count(*) AS c FROM reminders WHERE task_id = ?', [q.id])[0].c, 0, '되돌리면 알림·태그도 지움')
}

// 새 프로젝트(사람) · 이름 · 합치기 · 삭제 · 되돌리기
const np = await E.createProject('ADsP', '📜')
assert.deepEqual(all('SELECT name, kind, source FROM tags WHERE id = ?', [np.tagId])[0], { name: '📜 ADsP', kind: 'project', source: 'user' })
const rn = await E.renameProject(np.tagId, 'ADsP 시험', null)
assert.equal(all('SELECT name FROM tags WHERE id = ?', [np.tagId])[0].name, 'ADsP 시험')
await rn()
await P.addToProject(['c1', 'c3'], np.tagId)
const mg = await E.mergeProject(np.tagId, pid)
assert.equal(all('SELECT count(*) AS c FROM tags WHERE id = ?', [np.tagId])[0].c, 0, '진 쪽 지움')
assert.ok(String(all('SELECT aliases FROM tags WHERE id = ?', [pid])[0].aliases).includes('ADsP'), '진 이름은 별칭')
assert.equal(all('SELECT count(*) AS c FROM task_tags WHERE tag_id = ? AND task_id = ?', [pid, 'c1'])[0].c, 1, '겹치면 하나')
await mg()
assert.equal(all('SELECT count(*) AS c FROM tags WHERE id = ?', [np.tagId])[0].c, 1)
assert.deepEqual(linked(np.tagId), ['c1', 'c3'])
const del = await E.deleteProject(np.tagId)
assert.equal(all('SELECT count(*) AS c FROM task_tags WHERE tag_id = ?', [np.tagId])[0].c, 0)
assert.equal(all('SELECT count(*) AS c FROM tasks')[0].c, 4, '할 일은 그대로')
await del()
assert.deepEqual(linked(np.tagId), ['c1', 'c3'])
await assert.rejects(E.createProject('  ', null), /이름/)

// 자동으로 프로젝트 만들기 끔 → 패스가 쉼
task('s1', 'SQLD 기출 1회', 'la', '2026-10-01'); task('s2', 'SQLD 기출 2회', 'la', '2026-10-04'); task('s3', 'SQLD 접수', 'le', '2026-10-06')
P.projectStore.set({ auto: false })
assert.deepEqual(await P.runProjectPass({ at: '2026-10-05T11:00:00.000Z', force: true }), { created: 0, attached: 0, upgraded: 0 })
assert.equal(all("SELECT count(*) AS c FROM tags WHERE kind = 'project' AND name LIKE '%SQLD%'")[0].c, 0)
P.projectStore.set({ auto: true })
assert.equal((await P.runProjectPass({ at: '2026-10-05T11:05:00.000Z', force: true })).created, 0, '켜도 만들지 않는다(제안 카드로만)')
assert.equal(all("SELECT count(*) AS c FROM tags WHERE kind = 'project' AND name LIKE '%SQLD%'")[0].c, 0)
console.log('project-edit-db ok')
