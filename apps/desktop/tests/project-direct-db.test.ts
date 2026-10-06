// 41 (31 §12.14) 프로젝트 직접 고치기(DB, sql.js): 한 줄 만들기(태그 + ⚑ 할 일 + 마감 이음 + 줄 기준) · 핵심 날짜 바꾸기·지우기 ·
// 줄 추가·옮기기·이름·지우기 · 동기화 설정 행 · 보드 공통 기억(view_settings projects) — 모두 동기화 표에만 쓰는지, 되돌리기가 되는지.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { buildPlanView, keyDateRelId, laneRelId, mergeProjectsShared, NO_LANE, parseProjectSettings, projectSettingsId } from '@sprout/schema/planView'

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
const D = await import('../src/renderer/src/data/projectDirect')
const P = await import('../src/renderer/src/data/projects')
db.run("INSERT INTO lists (id, name, kind) VALUES ('in', 'Inbox', 'inbox')")
const count = (t: string) => all(`SELECT count(*) AS c FROM ${t}`)[0].c as number

// ── 한 줄 만들기 ──
const r = await D.createProjectLine({ name: '투자자산운용사 시험', emoji: '📜', day: '2026-11-23', word: '시험', team: ['민수'] })
const tag = all('SELECT id, name, kind, source FROM tags WHERE id = ?', [r.tagId])[0]
assert.deepEqual([tag.name, tag.kind, tag.source], ['📜 투자자산운용사 시험', 'project', 'user'])
const kt = all('SELECT id, title, due_at, is_all_day, list_id FROM tasks')
assert.equal(kt.length, 1, '만들면 생기는 할 일은 ⚑ 하나뿐')
assert.deepEqual([kt[0].title, kt[0].due_at, kt[0].is_all_day, kt[0].list_id], ['투자자산운용사 시험일', '2026-11-23', 1, 'in'])
assert.equal(all('SELECT to_id FROM relations WHERE id = ?', [keyDateRelId(r.tagId)])[0].to_id, kt[0].id, '마감 이음 = ⚑ 할 일')
assert.equal(all("SELECT count(*) AS c FROM task_tags WHERE task_id = ? AND tag_id = ? AND source = 'user'", [kt[0].id, r.tagId])[0].c, 1)
assert.equal(parseProjectSettings(all('SELECT options_json FROM view_settings WHERE id = ?', [projectSettingsId(r.tagId)])[0].options_json).by, 'tag', '새 프로젝트 줄 기준 = 태그')
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_id = ? AND field = 'project'", [r.tagId])[0].c, 1, '팀원 이음')
// 계획 보기: 핵심 날짜가 마감, 줄 기준 태그
const view = () => buildPlanView({
  tasks: all('SELECT id, title, list_id, parent_id, status, priority, due_at, start_at, completed_at, created_at FROM tasks WHERE deleted_at IS NULL') as never,
  tags: all('SELECT id, name, kind, aliases, source, home_type, home_id, topic_id FROM tags') as never,
  links: all('SELECT id, task_id, tag_id, source, state FROM task_tags') as never,
  lists: all('SELECT id, name, emoji, folder_id, kind FROM lists') as never, folders: [], seq: [], pstore: { dismissed: [], confirmed: {} }, today: '2026-10-06', suggest: false,
  deadlines: all("SELECT from_id AS tag_id, to_id AS task_id FROM relations WHERE field = 'deadline'") as never,
  lanes: all("SELECT from_id AS project_id, to_id AS tag_id, created_at FROM relations WHERE field = 'lane'") as never,
  settings: all("SELECT view_key, options_json FROM view_settings WHERE view_key LIKE 'project:%'") as never,
  team: all("SELECT r.from_id AS project_id, r.to_id AS tag_id, g.name FROM relations r JOIN tags g ON g.id = r.to_id WHERE r.field = 'project'") as never
}).projects.find((p) => p.tag.id === r.tagId)!
let p = view()
assert.deepEqual(p.deadline, { day: '2026-11-23', word: '시험', taskId: kt[0].id })
assert.equal(p.laneBy, 'tag')
assert.deepEqual(p.team.map((x) => x.name), ['민수'])

// ── 핵심 날짜 바꾸기(날짜 이름도) · 지우기 ──
const u1 = await D.setKeyDate({ tagId: r.tagId, name: p.title, keyTask: p.keyTask, mainList: null }, '2026-11-08', '발표')
assert.deepEqual(all('SELECT title, due_at FROM tasks')[0], { title: '투자자산운용사 발표일', due_at: '2026-11-08' })
assert.equal(view().deadline?.day, '2026-11-08', '⚑ 할 일을 옮기면 마감도 같이')
await u1.undo()
assert.deepEqual(all('SELECT title, due_at FROM tasks')[0], { title: '투자자산운용사 시험일', due_at: '2026-11-23' })
const u2 = await D.clearKeyDate(r.tagId)
assert.equal(count('tasks'), 1, '핵심 날짜 지우기는 이음만 — ⚑ 할 일은 남음')
assert.equal(all('SELECT count(*) AS c FROM relations WHERE id = ?', [keyDateRelId(r.tagId)])[0].c, 0)
await u2()
assert.equal(view().keyTask?.id, kt[0].id)

// ── 줄 ──
const fin = (await D.addLane(r.tagId, '#금융상품'))!
assert.equal(all('SELECT kind, source FROM tags WHERE id = ?', [fin.tagId])[0].kind, 'topic')
assert.equal(all('SELECT field FROM relations WHERE id = ?', [laneRelId(r.tagId, fin.tagId)])[0].field, 'lane')
const law = (await D.addLane(r.tagId, '법규'))!
assert.equal((await D.addLane(r.tagId, '금융상품'))!.tagId, fin.tagId, '있는 태그면 그것')
// 할 일 두 개를 만들어 줄로
db.run("INSERT INTO tasks (id, title, list_id, status, created_at) VALUES ('a', '1과목 1회독', 'in', 0, '2026-10-01'), ('b', '세제 암기', 'in', 0, '2026-10-01')")
await P.addToProject(['a', 'b'], r.tagId)
p = view()
const mv = await D.moveToLane(['a', 'b'].map((id) => ({ id, tags: p.tagLanes.tagsOf.get(id) ?? [], from: p.tagLanes.laneOf.get(id) ?? NO_LANE })), fin.tagId)
p = view()
assert.deepEqual(p.tagLanes.lanes.map((l) => [l.name, l.items.length]), [['금융상품', 2], ['법규', 0], ['태그 없음', 1]])
// 법규로 하나 더 붙이면 앞 줄(금융상품) + `+1`
await D.moveToLane([{ id: 'a', tags: [], from: NO_LANE }], law.tagId)
p = view()
assert.equal(p.tagLanes.laneOf.get('a'), fin.tagId)
assert.equal(p.tagLanes.more.get('a'), 1)
await D.moveToLane([{ id: 'a', tags: p.tagLanes.tagsOf.get('a')!, from: fin.tagId }], NO_LANE)
assert.equal(view().tagLanes.laneOf.get('a'), NO_LANE, '태그 없음에 놓으면 줄 태그 모두 뗌')
await mv()
// 이름 고치기 · 같은 이름이면 합치기 묻기
assert.equal((await D.renameLane(r.tagId, fin.tagId, '금융상품 및 세제')).result, 'ok')
assert.equal(all('SELECT name FROM tags WHERE id = ?', [fin.tagId])[0].name, '금융상품 및 세제')
assert.equal((await D.renameLane(r.tagId, law.tagId, '#금융상품 및 세제')).result, 'conflict')
// 줄 지우기: 태그는 남고 이 프로젝트 할 일에서만 떨어짐
const rm = await D.removeLane(r.tagId, fin.tagId, ['a', 'b', kt[0].id])
assert.equal(all('SELECT count(*) AS c FROM tags WHERE id = ?', [fin.tagId])[0].c, 1, '태그는 남음')
assert.equal(all("SELECT count(*) AS c FROM task_tags WHERE tag_id = ? AND COALESCE(state,'accepted') = 'accepted'", [fin.tagId])[0].c, 0)
assert.ok(!view().tagLanes.lanes.some((l) => l.id === fin.tagId))
await rm.undo()
assert.ok(view().tagLanes.lanes.some((l) => l.id === fin.tagId), '되돌리기')

// ── 프로젝트 설정(동기화) — 모르는 칸은 남긴다 ──
db.run('UPDATE view_settings SET options_json = ? WHERE id = ?', [JSON.stringify({ by: 'tag', future: 7 }), projectSettingsId(r.tagId)])
await D.saveProjectSettings(r.tagId, { order: [law.tagId, fin.tagId], starterSeen: true })
const so = JSON.parse(all('SELECT options_json FROM view_settings WHERE id = ?', [projectSettingsId(r.tagId)])[0].options_json)
assert.deepEqual(so, { by: 'tag', future: 7, order: [law.tagId, fin.tagId], starterSeen: true })
assert.deepEqual(view().tagLanes.lanes.map((l) => l.name).slice(0, 2), ['법규', '금융상품 및 세제'], '손 순서')

// ── 보드 공통 기억: 기기 localStorage가 아니라 view_settings projects 행 ──
P.projectStore.set({ dismissed: ['블로그'], confirmed: { [r.tagId]: 3 } })
await new Promise((res) => setTimeout(res, 20))
const shared = all("SELECT id, options_json FROM view_settings WHERE view_key = 'projects'")
assert.equal(shared.length, 1)
assert.ok(String(shared[0].id).length >= 32, '고정 id가 아니다(서버에서 남과 겹치지 않게)')
assert.deepEqual(mergeProjectsShared(shared as never), { dismissed: ['블로그'], confirmed: { [r.tagId]: 3 }, skip: [] })
P.projectStore.set({ lastRun: '2026-10-06T00:00:00Z' })
await new Promise((res) => setTimeout(res, 20))
assert.equal(all("SELECT count(*) AS c FROM view_settings WHERE view_key = 'projects'")[0].c, 1, '기기 칸(lastRun)은 동기화 행을 늘리지 않음')
assert.ok(!all("SELECT options_json FROM view_settings WHERE view_key = 'projects'")[0].options_json.includes('lastRun'))

// ── 되돌리기: 한 줄 만들기 통째로 ──
await r.undo()
assert.equal(all('SELECT count(*) AS c FROM tags WHERE id = ?', [r.tagId])[0].c, 0)
assert.equal(all('SELECT count(*) AS c FROM tasks WHERE id = ?', [kt[0].id])[0].c, 0, '⚑ 할 일도 같이 사라짐')
assert.equal(all('SELECT count(*) AS c FROM relations WHERE id = ?', [keyDateRelId(r.tagId)])[0].c, 0)
console.log('project direct db ok')
