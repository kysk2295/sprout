// 31 §12.1 자동 프로젝트(DB, sql.js): runProjectPass가 손 없이 프로젝트 태그를 만들고 붙이고 넓힌다 ·
// ✕ 이건 아니야(태그 행·집 안) · ＋ 더 넣기 · 제안 카드 만들기·되돌리기 · 프로젝트 아님 · 같이 계획 짜기 프로젝트.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { projectMembers } from '@sprout/schema/projects'

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

const at = '2026-10-05T09:00:00.000Z'
const list = (id: string, name: string, extra: Record<string, unknown> = {}) => db.run('INSERT INTO lists (id, name, kind, folder_id) VALUES (?, ?, ?, ?)', [id, name, (extra.kind as string) ?? null, (extra.folder_id as string) ?? null])
db.run("INSERT INTO folders (id, name) VALUES ('fu', '🚀 UniPort')")
list('in', 'Inbox', { kind: 'inbox' }); list('ls', '🎓 학사 행정'); list('la', '🤖 AI 공부·도구'); list('le', '💼 교육·미팅'); list('lm', '마케팅', { folder_id: 'fu' }); list('lq', '자격증')
let n = 0
const task = (id: string, title: string, list_id: string, due: string | null, extra: Record<string, unknown> = {}) =>
  db.run('INSERT INTO tasks (id, title, list_id, parent_id, status, due_at, completed_at, created_at, deleted_at, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, title, list_id, (extra.parent_id as string) ?? null, (extra.status as number) ?? 0, due, (extra.completed_at as string) ?? null, '2026-09-01T00:00:00Z', null, n++])
task('c1', '공모전 관련 데이터 분석', 'la', '2026-09-09')
task('c2', '공모전 자료조사', 'la', '2026-09-11', { status: 1, completed_at: '2026-09-11T10:00:00Z' })
task('c3', '공모전 회의', 'le', '2026-09-11')
task('c4', 'k 인공지능 제조 데이터 공모전 신청', 'ls', '2026-09-09')
task('c5', '최종 제출', 'la', '2026-09-16') // 이름 없음 → 넓히기(같은 리스트, 기간 안, 제출)
task('c6', '장보기', 'la', '2026-09-10') // 기타 → 안 넓힘
task('u1', 'UniPort 사업계획서 초안', 'ls', null)
task('u2', 'UniPort 투자 미팅', 'le', null)
task('u3', '카드뉴스 3편 게시', 'lm', '2026-10-06')
task('s1', 'SQLD 기출 2회 풀기', 'lq', '2026-10-06')
task('s2', 'SQLD 접수', 'in', '2026-10-01')
task('s3', 'SQLD 요약 노트', 'lq', null)
task('b1', '블로그 글 쓰기', 'la', null); task('b2', '블로그 이미지 만들기', 'le', null); task('b3', '블로그 댓글 답하기', 'in', null)

const r = await P.runProjectPass({ at, force: true })
const tags = all("SELECT id, name, kind, aliases, source, home_type, home_id, run_id FROM tags WHERE kind = 'project' ORDER BY name")
assert.deepEqual(tags.map((t) => t.name).sort(), ['K 인공지능 제조 데이터 공모전', 'SQLD', 'UniPort'].sort(), '손 없이 프로젝트 3개')
assert.equal(r.created, 3)
const comp = tags.find((t) => t.name.includes('공모전'))!
assert.equal(comp.source, 'ai')
assert.deepEqual(JSON.parse(comp.aliases), ['공모전'])
const uni = tags.find((t) => t.name === 'UniPort')!
assert.equal(uni.home_type, 'folder'); assert.equal(uni.home_id, 'fu')
const linked = (tagId: string) => all("SELECT task_id, source, state FROM task_tags WHERE tag_id = ? AND COALESCE(state,'accepted') = 'accepted' ORDER BY task_id", [tagId])
assert.deepEqual(linked(comp.id).map((l) => l.task_id), ['c1', 'c2', 'c3', 'c4', 'c5'], '이름 4개 + 넓히기 1개(최종 제출)')
assert.equal(linked(comp.id).find((l) => l.task_id === 'c5')!.source, 'rule')
assert.ok(!linked(uni.id).some((l) => l.task_id === 'u3'), '집 안 할 일엔 태그 행을 쓰지 않는다')
const ctx = await P.readProjectCtx(new Date(at))
const members = (id: string) => [...projectMembers(ctx.tags.find((t) => t.id === id)!, ctx.tasks, ctx.links, ctx.lists)].sort()
assert.deepEqual(members(uni.id), ['u1', 'u2', 'u3'], '구성원 = 태그 + 집 안')

// 두 번 돌려도 그대로(결정적·겹침 없음)
const again = await P.runProjectPass({ at: '2026-10-05T09:05:00.000Z', force: true })
assert.deepEqual(again, { created: 0, attached: 0, upgraded: 0 })
// 60초 안이면 건너뜀
assert.deepEqual(await P.runProjectPass({ at: '2026-10-05T09:05:10.000Z' }), { created: 0, attached: 0, upgraded: 0 })

// ✕ 이건 아니야 — 자동 행은 dismissed, 다시 돌려도 안 붙음
const undo1 = await P.removeFromProject('c5', comp.id)
assert.equal(all('SELECT state FROM task_tags WHERE task_id = ? AND tag_id = ?', ['c5', comp.id])[0].state, 'dismissed')
await P.runProjectPass({ at: '2026-10-05T10:00:00.000Z', force: true })
assert.ok(!linked(comp.id).some((l) => l.task_id === 'c5'), '뗀 것은 다시 안 붙음')
await undo1()
assert.ok(linked(comp.id).some((l) => l.task_id === 'c5'), '되돌리기')
// 집 안 할 일 ✕ → dismissed 행 하나
const undo2 = await P.removeFromProject('u3', uni.id)
const ctx2 = await P.readProjectCtx(new Date(at))
assert.ok(!projectMembers(ctx2.tags.find((t) => t.id === uni.id)!, ctx2.tasks, ctx2.links, ctx2.lists).has('u3'))
await undo2()
assert.equal(all('SELECT count(*) AS c FROM task_tags WHERE task_id = ? AND tag_id = ?', ['u3', uni.id])[0].c, 0)

// ＋ 더 넣기
const undo3 = await P.addToProject(['c6'], comp.id)
assert.equal(linked(comp.id).find((l) => l.task_id === 'c6')!.source, 'user')
await undo3()
assert.ok(!linked(comp.id).some((l) => l.task_id === 'c6'))

// 제안 카드(블로그) 만들기 → 되돌리기
const made = await P.createProjectFrom({ key: '블로그', word: '블로그', name: '블로그', taskIds: ['b1', 'b2', 'b3'], listIds: ['la', 'le', 'in'], reason: 'plain' }, '2026-10-05T11:00:00.000Z')
assert.equal(all('SELECT kind, source FROM tags WHERE id = ?', [made.tagId])[0].kind, 'project')
assert.equal(linked(made.tagId).length, 3)
await made.undo()
assert.equal(all('SELECT count(*) AS c FROM tags WHERE id = ?', [made.tagId])[0].c, 0)
assert.equal(all('SELECT count(*) AS c FROM task_tags WHERE tag_id = ?', [made.tagId])[0].c, 0)
// 아니 → 다시 안 보임
P.dismissSuggestion('블로그')
assert.ok(P.projectStore.get().dismissed.includes('블로그'))

// 프로젝트 아님 → topic + 이름 막음 → 다시 안 만듦
const sqld = tags.find((t) => t.name === 'SQLD')!
const undo4 = await P.notProject(sqld)
assert.equal(all('SELECT kind, source FROM tags WHERE id = ?', [sqld.id])[0].kind, 'topic')
await P.runProjectPass({ at: '2026-10-05T12:00:00.000Z', force: true })
assert.equal(all("SELECT count(*) AS c FROM tags WHERE kind = 'project' AND name = 'SQLD'")[0].c, 0, '막은 이름은 다시 안 만든다')
await undo4()
assert.equal(all('SELECT kind FROM tags WHERE id = ?', [sqld.id])[0].kind, 'project')

// 같이 계획 짜기(보드 ＋) — 큰 일 이름으로 프로젝트
task('g1', '모두의창업 지원서 쓰기', 'in', '2026-10-20')
const gid = await P.ensureProjectForGoal({ id: 'g1', title: '모두의창업 지원서 쓰기' })
assert.equal(all('SELECT kind, source, name FROM tags WHERE id = ?', [gid])[0].kind, 'project')
assert.equal(linked(gid)[0].task_id, 'g1')
assert.deepEqual((await P.projectOpenTasks(gid)).map((t) => t.id), ['g1'])

// 확인(빠진 거 없어)
P.confirmProject(comp.id, 5)
assert.equal(P.projectStore.get().confirmed[comp.id], 5)
console.log('projects(desktop): ok')
