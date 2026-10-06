// 31 §12.13 (DB, sql.js): 사람이 만든 프로젝트 + 팀원 → 아무렇게나 넣은 할 일이 점수로 들어가고, 애매한 건 묻고, 답은 규칙으로 남는다 ·
// 끝난 프로젝트는 아무것도 안 받고 지금 집중도 꺼진다.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { projectCandidates } from '@sprout/schema/projectScore'

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

db.run("INSERT INTO lists (id, name, kind) VALUES ('in', 'Inbox', 'inbox'), ('ls', '학교', NULL)")
let n = 0
const task = (id: string, title: string, created: string, extra: Record<string, unknown> = {}) =>
  db.run('INSERT INTO tasks (id, title, list_id, parent_id, status, due_at, completed_at, created_at, deleted_at, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, title, (extra.list_id as string) ?? 'in', null, (extra.status as number) ?? 0, (extra.due as string) ?? null, (extra.completed_at as string) ?? null, created, null, n++])
const linked = (tagId: string) => all("SELECT task_id, source FROM task_tags WHERE tag_id = ? AND COALESCE(state,'accepted') = 'accepted' ORDER BY task_id", [tagId])
const ids = (tagId: string) => linked(tagId).map((l) => l.task_id)

// 사람이 만든 프로젝트 + 팀원 민수·지은
const made = await E.createProject('K 데이터 공모전')
const PID = made.tagId
await E.linkTeam(PID, ['민수', '지은'])
assert.equal(all("SELECT count(*) AS c FROM tags WHERE kind = 'person'")[0].c, 2)
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_id = ? AND field = 'project'", [PID])[0].c, 2, '팀원 = relations tag→tag project')
task('m1', 'K 데이터 공모전 신청', '2026-10-01T09:00:00.000Z', { list_id: 'ls', due: '2026-10-16' })
task('m2', '1차 회의', '2026-10-01T09:01:00.000Z', { due: '2026-10-05', status: 1, completed_at: '2026-10-05T18:00:00.000Z' })
await P.addToProject(['m1', 'm2'], PID)

// 아무렇게나 넣은 할 일(기본함, 날짜 없음) — 오전에 몰아서, 오후·저녁에 하나씩
task('n1', '회의', '2026-10-06T10:00:00.000Z')
task('n2', '민수한테 자료', '2026-10-06T10:01:00.000Z')
task('n3', '2차 회의', '2026-10-06T10:02:00.000Z')
task('n4', '회식', '2026-10-06T10:03:00.000Z')
task('n6', '장보기', '2026-10-06T10:04:00.000Z')
task('n5', '데이터 전처리', '2026-10-06T13:00:00.000Z')
task('n7', '빨래', '2026-10-06T18:00:00.000Z')

const r = await P.runProjectPass({ at: '2026-10-06T11:00:00.000Z', force: true })
assert.equal(r.created, 0, '프로젝트는 만들지 않는다')
assert.deepEqual(ids(PID), ['m1', 'm2', 'n2', 'n3'], '팀원 이름 · 이어지는 이름만 바로 들어간다')
assert.equal(linked(PID).find((l) => l.task_id === 'n2')!.source, 'rule', '자동(✦ · ✕로 뗌)')
for (const id of ['n6', 'n7']) assert.ok(!ids(PID).includes(id), `생활 낱말은 안 들어간다 (${id})`)

// 묻기 = 같은 점수 함수(화면 useProjectCandidates와 같은 입력)
const ask = async () => { const c = await P.readProjectCtx(new Date('2026-10-06T14:00:00.000Z')); return projectCandidates({ tags: c.tags, tasks: c.tasks, links: c.links, lists: c.lists, relations: c.relations, today: '2026-10-06' }).ask.map((x) => x.taskId).sort() }
assert.deepEqual(await ask(), ['n1', 'n4', 'n5'], '회의·회식(같은 때) · 데이터 전처리(비슷한 낱말)는 묻는다')

// 응 → 넣기(user) + 배운 낱말 '회의'
const u1 = await E.answerProjectQuestion({ taskId: 'n1', tagId: PID, title: '회의' }, true)
assert.equal(linked(PID).find((l) => l.task_id === 'n1')!.source, 'user')
assert.equal(all("SELECT to_id FROM relations WHERE from_id = ? AND to_type = 'hint'", [PID])[0]?.to_id, '회의', '배운 낱말')
assert.equal(P.askedToday(), 1)
// 다음 '회의 준비'는 묻지 않고 바로
task('n9', '회의 준비', '2026-10-06T20:00:00.000Z')
await P.runProjectPass({ at: '2026-10-06T20:01:00.000Z', force: true })
assert.ok(ids(PID).includes('n9'), '배운 낱말로 바로 들어감')
// 아니 → dismissed, 다시 안 묻고 안 붙음
await E.answerProjectQuestion({ taskId: 'n5', tagId: PID, title: '데이터 전처리' }, false)
assert.equal(all('SELECT state FROM task_tags WHERE task_id = ? AND tag_id = ?', ['n5', PID])[0].state, 'dismissed')
assert.ok(!(await ask()).includes('n5'))
// 응을 되돌리면 넣은 것·배운 것 모두 돌아간다
await u1()
assert.ok(!ids(PID).includes('n1'))
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_id = ? AND to_type = 'hint'", [PID])[0].c, 0)
// 사람 이름이 든 답은 팀원으로(배운 낱말 대신)
const q2 = await E.createProject('모두의창업')
task('x1', '지은이랑 창업 서류', '2026-10-06T21:00:00.000Z')
await E.answerProjectQuestion({ taskId: 'x1', tagId: q2.tagId, title: '지은이랑 창업 서류' }, true, { count: false })
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_id = ? AND field = 'project'", [q2.tagId])[0].c, 1, '지은 → 모두의창업 팀원')
assert.equal(P.askedToday(), 2, '주간 점검 [하나씩](count false)은 하루 수에 안 셈 — 앞의 응·아니만')

// 지금 집중: 하나만
await E.setFocus(PID)
await E.setFocus(q2.tagId)
assert.deepEqual(all("SELECT from_id FROM relations WHERE to_type = 'focus'").map((x) => x.from_id), [q2.tagId], '한 번에 하나')
const uf = await E.setFocus(PID)
await uf()
assert.deepEqual(all("SELECT from_id FROM relations WHERE to_type = 'focus'").map((x) => x.from_id), [q2.tagId], '되돌리기')
await E.setFocus(PID)

// 2026-10-06 고침: 오늘 목록에서 넣은 '발표 자료 정리'(오늘 마감)는 프로젝트 마감이 아니다 — 다음 날에도 끝나지 않고 집중도 남는다
db.run("UPDATE tasks SET due_at = '2026-10-04' WHERE id = 'm1'")
task('n12', '발표 자료 정리', '2026-10-06T15:00:00.000Z', { due: '2026-10-06' })
await P.addToProject(['n12'], PID)
db.run("UPDATE tasks SET status = 1, completed_at = '2026-10-06T22:00:00.000Z' WHERE id IN ('n2','n3','n9')")
await P.runProjectPass({ at: '2026-10-07T08:00:00.000Z', force: true })
assert.equal(all("SELECT count(*) AS c FROM relations WHERE to_type = 'focus'")[0].c, 1, '남은 일이 하루 지났을 뿐 — 집중 그대로')

// 프로젝트가 끝나면(다 끝남) 아무것도 안 받고 집중도 꺼진다
db.run("UPDATE tasks SET status = 1, completed_at = '2026-10-06T23:00:00.000Z' WHERE id IN ('m1','n12')")
task('n10', '3차 회의', '2026-10-07T09:00:00.000Z')
task('n11', '민수 미팅', '2026-10-07T09:01:00.000Z')
await P.runProjectPass({ at: '2026-10-07T09:05:00.000Z', force: true })
assert.ok(!ids(PID).includes('n10') && !ids(PID).includes('n11'), '끝난 프로젝트는 안 받는다')
assert.equal(all("SELECT count(*) AS c FROM relations WHERE to_type = 'focus'")[0].c, 0, '끝난 프로젝트의 집중은 꺼짐')
console.log('project-score(desktop): ok')
