// 33 관계 위키: [[ ]] 인식 우선순위 · 링크 동기화·이름 바꾸기 · 리스트/태그 페이지 계산 · accepted만 세기
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { relationId } from '@sprout/schema/wikiLink'
import { linkMoveTarget, parseAdd, resolveLink } from '../src/renderer/src/lib/addParse'
import { planLinkSync, relatedLists, relatedTags, resolveSegments, rowTagIds, tagFilterIds, tagPills } from '../src/renderer/src/lib/wikiGraph'
import { createTask, insert, run, setTag, updateTask } from '../src/renderer/src/data/mutations'
import { autoTag, linkRenameStmts, removeTaskTag, renameWithLinks, syncLinks } from '../src/renderer/src/data/wiki'
import { saveOrganization } from '../src/renderer/src/data/organization'
import { openTasksSql, defaultSettings } from '../src/renderer/src/data/views'

// ── §6.3 [[ ]] 먼저 보호, 그다음 날짜 → #태그 → ~리스트 → !우선순위 ──
const now = new Date(2026, 9, 5, 12)
const lists = [{ id: 'L1', name: '자격증', kind: 'normal' }, { id: 'L2', name: '커리어', kind: 'normal' }, { id: 'IN', name: '기본함', kind: 'inbox' }]
const tags = [{ id: 'G1', name: '공부' }, { id: 'G2', name: '교수님', aliases: '["지도교수님"]' }]
let p = parseAdd('[[3월 SQLD]] 내일 ~자격증 #공부 !높음', lists, tags, { keepDate: false, now })
assert.equal(p.title, '[[3월 SQLD]]')
assert.equal(p.due_at, '2026-10-06')
assert.equal(p.list_id, 'L1')
assert.deepEqual(p.tag_ids, ['G1'])
assert.equal(p.priority, 3)
assert.deepEqual(p.links, ['3월 SQLD'])
assert.ok(p.tokens.includes('[[3월 SQLD]]'))
// 링크 안 날짜·# ·~ 는 인식하지 않는다
p = parseAdd('[[내일 #공부 ~자격증]] 정리', lists, tags, { keepDate: false, now })
assert.deepEqual([p.title, p.due_at, p.tag_ids, p.list_id, p.newTags], ['[[내일 #공부 ~자격증]] 정리', null, [], undefined, []])
// 닫히지 않은 [[는 글 — 그 안의 날짜는 인식된다(보호 대상 아님)
p = parseAdd('[[메모 내일', lists, tags, { keepDate: false, now })
assert.equal(p.title, '[[메모')
assert.equal(p.due_at, '2026-10-06')
// keepDate(날짜 문구 남김)도 링크는 그대로
p = parseAdd('[[교수님]]께 메일 내일 #공부', lists, tags, { keepDate: true, now })
assert.equal(p.title, '[[교수님]]께 메일 내일')
// 새 태그 이름은 링크 밖 #만
p = parseAdd('[[A #B]] #새것', lists, tags, { keepDate: false, now })
assert.deepEqual(p.newTags, ['새것'])
assert.equal(p.title, '[[A #B]]')

// 이름 풀기: 태그 이름 → 리스트 이름 → 별칭 → 할 일 제목
assert.deepEqual(resolveLink('교수님', tags, lists), { type: 'tag', id: 'G2', name: '교수님' })
assert.deepEqual(resolveLink('지도교수님', tags, lists), { type: 'tag', id: 'G2', name: '교수님' })
assert.deepEqual(resolveLink('자격증', tags, lists), { type: 'list', id: 'L1', name: '자격증' })
assert.deepEqual(resolveLink('보고서', tags, lists, [{ id: 'T9', title: '보고서' }]), { type: 'task', id: 'T9', name: '보고서' })
assert.equal(resolveLink('없음', tags, lists), null)
// §6.3-4 기본함 + [[리스트]] 하나 → 그 리스트로, ~리스트가 있거나 링크가 둘이면 안 옮김
assert.equal(linkMoveTarget(parseAdd('이력서에 [[자격증]] 넣기', lists, tags, { keepDate: false, now }), tags, lists), 'L1')
assert.equal(linkMoveTarget(parseAdd('[[자격증]] ~커리어', lists, tags, { keepDate: false, now }), tags, lists), undefined)
assert.equal(linkMoveTarget(parseAdd('[[자격증]] [[커리어]]', lists, tags, { keepDate: false, now }), tags, lists), undefined)
assert.equal(linkMoveTarget(parseAdd('[[교수님]]께 메일', lists, tags, { keepDate: false, now }), tags, lists), undefined)
assert.equal(linkMoveTarget(parseAdd('[[기본함]] 정리', lists, tags, { keepDate: false, now }), tags, lists), undefined)

// ── 순수 계산: 태그 알약 · 관련 리스트 · 관련 태그 · 거르기 · 행 알약 ──
assert.deepEqual(tagPills([{ tag_id: 'a', source: 'user', c: 2 }, { tag_id: 'b', source: 'ai', c: 3 }, { tag_id: 'a', source: 'ai', c: 1 }, { tag_id: 'c', source: 'rule', c: 1 }]),
  [{ tag_id: 'a', count: 3, aiOnly: false }, { tag_id: 'b', count: 3, aiOnly: true }, { tag_id: 'c', count: 1, aiOnly: true }])
const graph = [
  { list_id: 'L1', tag_id: 'sqld', c: 6 }, { list_id: 'L2', tag_id: 'sqld', c: 2 }, { list_id: 'L3', tag_id: 'sqld', c: 1 },
  { list_id: 'L1', tag_id: 'wide', c: 5 }, { list_id: 'L4', tag_id: 'wide', c: 9 }
]
// wide = 열린 할 일 50개 중 14개(28%) → 너무 넓어 뺀다. L3은 점수 1이라 빠짐
assert.deepEqual(relatedLists('L1', graph, 50), [{ list_id: 'L2', score: 2, tags: ['sqld'] }])
assert.deepEqual(relatedLists('L1', graph, 50, { pinned: ['L3'] }).map((r) => [r.list_id, r.score]), [['L3', 11], ['L2', 2]])
assert.deepEqual(relatedLists('L1', graph, 50, { hidden: ['L2'] }), [])
const pairs = [{ task_id: 't1', tag_id: 'p' }, { task_id: 't1', tag_id: 'q' }, { task_id: 't2', tag_id: 'p' }, { task_id: 't2', tag_id: 'q' }, { task_id: 't3', tag_id: 'p' }, { task_id: 't3', tag_id: 'r' }]
assert.deepEqual(relatedTags('p', pairs), [{ tag_id: 'q', score: 2 }])
const tree = [{ id: 'a', parent_id: null, tag_ids: 'x' }, { id: 'a1', parent_id: 'a', tag_ids: null }, { id: 'b', parent_id: null, tag_ids: 'y' }, { id: 'b1', parent_id: 'b', tag_ids: 'x' }]
assert.deepEqual([...tagFilterIds(tree, ['x'])].sort(), ['a', 'a1', 'b1'])
assert.deepEqual(rowTagIds(['u', 'l', 'a1', 'a2']), { shown: ['u', 'l'], more: 2 })
assert.deepEqual(rowTagIds(['u', 'l'], 2, 'u'), { shown: ['l'], more: 0 })
// 행 표시: 이름이 맞는 관계, 이름이 바뀐 대상은 남은 관계를 지금 이름으로, 없으면 없는 링크
const segs = resolveSegments('[[옛이름]] 그리고 [[교수님]] [[없음]]', [{ to_type: 'tag', to_id: 'G2', name: '교수님' }, { to_type: 'list', to_id: 'L1', name: '자격증·시험' }], () => null)
assert.deepEqual(segs.filter((s) => s.link).map((s) => [s.text, s.target?.id ?? null, !!s.missing]), [['자격증·시험', 'L1', false], ['교수님', 'G2', false], ['없음', null, true]])

// planLinkSync: 원하는 관계 넣기·지우기, 태그 링크는 link 행(user·dismissed는 그대로, 자동은 올림)
const plan = planLinkSync(
  [{ type: 'task', id: 'T1', field: 'title', text: '[[교수님]]께 [[자격증]] 결과' }, { type: 'task', id: 'T2', field: 'title', text: '[[교수님]]' }, { type: 'task', id: 'T3', field: 'title', text: '[[교수님]]' }],
  [{ id: 'old', from_type: 'task', from_id: 'T9', to_type: 'list', to_id: 'L2', field: 'title' }],
  [{ id: 'tt2', task_id: 'T2', tag_id: 'G2', source: 'ai', state: 'accepted' }, { id: 'tt3', task_id: 'T3', tag_id: 'G2', source: 'link', state: 'dismissed' }, { id: 'tt9', task_id: 'T9', tag_id: 'G2', source: 'link', state: 'accepted' }],
  { tags, lists, tasks: [] }
)
assert.deepEqual(plan.insertRel.map((r) => [r.from_id, r.to_type, r.to_id]).sort(), [['T1', 'list', 'L1'], ['T1', 'tag', 'G2'], ['T2', 'tag', 'G2'], ['T3', 'tag', 'G2']])
assert.equal(plan.insertRel[0].id, relationId(plan.insertRel[0].from_id, plan.insertRel[0].to_id, 'title'))
assert.deepEqual(plan.deleteRel, ['old'])
assert.deepEqual(plan.insertTag.map((r) => r.task_id), ['T1'])
assert.deepEqual(plan.upgradeTag, ['tt2'])
assert.deepEqual(plan.deleteTag, ['tt9'])

// ── DB: syncLinks · 이름 바꾸기(id 기준 링크 글 고침) · setTag/removeTaskTag · accepted만 세기 ──
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
Object.assign(globalThis, { window: { sprout: { db: { getAll: async (sql: string, p?: unknown[]) => all(sql, p), get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null, transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } } } } } })
const L = await saveOrganization('list', undefined, { name: '자격증' })
const career = await saveOrganization('list', undefined, { name: '커리어' })
const prof = await saveOrganization('tag', undefined, { name: '교수님', color: null, parent_id: null })
const t1 = await createTask({ title: '이력서에 [[자격증]] 결과 넣기', list_id: career })
const t2 = await createTask({ title: '[[교수님]]께 중간 보고 메일', list_id: L })
await updateTask(t2, { content: '본문에서도 [[자격증]]' })
assert.ok((await syncLinks()) > 0)
assert.equal(await syncLinks(), 0) // 두 번째는 할 일 없음(결정적 id, 같은 결과)
const rels = all("SELECT from_id, to_type, to_id, field FROM relations WHERE source = 'link' ORDER BY from_id, field")
assert.equal(rels.length, 3)
assert.deepEqual(all('SELECT source, state FROM task_tags WHERE task_id = ? AND tag_id = ?', [t2, prof]), [{ source: 'link', state: 'accepted' }])
// 태그 화면은 accepted만
const tagQuery = (id: string) => { const q = openTasksSql(`tag:${id}`, defaultSettings(`tag:${id}`), '2026-10-05'); return all(q.sql, q.params) }
assert.equal(defaultSettings(`tag:${prof}`).group_by, 'list')
assert.equal(tagQuery(prof).length, 1)
// 상세 ✕: 링크 태그는 dismissed로 남아 다시 안 붙고, 태그 화면·tag_ids에서 빠진다
const undo = await removeTaskTag(t2, prof)
assert.equal(all('SELECT state FROM task_tags WHERE task_id = ?', [t2])[0].state, 'dismissed')
await syncLinks()
assert.equal(all('SELECT state FROM task_tags WHERE task_id = ?', [t2])[0].state, 'dismissed')
assert.equal(tagQuery(prof).length, 0)
assert.equal(tagQuery(prof).length, 0)
await undo()
assert.equal(tagQuery(prof).length, 1)
// 직접 붙이기(setTag on)는 뗐던 자동 태그도 되살리고 user가 된다, 떼기(off)는 자동이면 dismissed
const auto = await saveOrganization('tag', undefined, { name: '기출', color: null, parent_id: null })
await run(insert('task_tags', { id: 'ai1', task_id: t1, tag_id: auto, source: 'ai', state: 'accepted', confidence: 92, run_id: 'run1' }))
assert.equal((await autoTag().summary()).count, 1)
await setTag([t1], auto, false)
assert.equal(all("SELECT state FROM task_tags WHERE id = 'ai1'")[0].state, 'dismissed')
assert.equal((await autoTag().summary()).count, 0)
await setTag([t1], auto, true)
assert.deepEqual(all("SELECT source, state FROM task_tags WHERE id = 'ai1'")[0], { source: 'user', state: 'accepted' })
// 자동 태그 되돌리기: 그 run 중 아직 자동·accepted인 것만 지우고, 그 run이 만든 빈 AI 태그도 지운다
const made = 'tag-ai-made'
await run(insert('tags', { id: made, name: 'SQLD', source: 'ai', run_id: 'run2' }), insert('task_tags', { id: 'ai2', task_id: t1, tag_id: made, source: 'ai', state: 'accepted', run_id: 'run2' }))
assert.equal((await autoTag().summary()).lastRun?.id, 'run2')
assert.equal(await autoTag().undoLastRun(), 1)
assert.equal(all('SELECT count(*) AS c FROM tags WHERE id = ?', [made])[0].c, 0)
// 이름 바꾸기: 이 대상을 가리키는 [[옛이름]]만 id 기준으로 고친다(제목·본문 모두)
const plan2 = await linkRenameStmts('list', L, '자격증', '자격증·시험')
assert.equal(plan2.count, 2)
assert.equal(await renameWithLinks('list', L, '자격증', '자격증·시험'), 2)
assert.equal(all('SELECT title FROM tasks WHERE id = ?', [t1])[0].title, '이력서에 [[자격증·시험]] 결과 넣기')
assert.equal(all('SELECT content FROM tasks WHERE id = ?', [t2])[0].content, '본문에서도 [[자격증·시험]]')
assert.equal(all('SELECT name FROM lists WHERE id = ?', [L])[0].name, '자격증·시험')
assert.equal(await syncLinks(), 0) // 고친 글이 같은 대상으로 풀려 관계가 그대로
// 링크를 지우면 link 관계·link 태그만 떨어진다(user 태그는 그대로)
await setTag([t2], auto, true)
await updateTask(t2, { title: '중간 보고 메일', content: '' })
await syncLinks()
assert.equal(all("SELECT count(*) AS c FROM relations WHERE from_id = ?", [t2])[0].c, 0)
assert.deepEqual(all('SELECT tag_id FROM task_tags WHERE task_id = ?', [t2]).map((r) => r.tag_id), [auto])
console.log('wiki(desktop): ok')
