// 41 (31 §12.14) §8 휴대폰 프로젝트 직접 고치기 — 사람 손 쓰기(모두 되돌리기 함수를 돌려준다). 데스크톱 data/projectDirect.ts와 같은 행:
//  · 한 줄 만들기   tags kind project + (날짜가 있으면) ⚑ 할 일 + task_tags(user) + relations tag → task field deadline + view_settings project:<id> {by: 'tag'} + 팀원
//  · 핵심 날짜      ⚑ 할 일 due_at(종일) · 날짜 이름 = 제목 끝 `○○일` · 지우기 = 이음 행만
//  · 줄 = 태그      tags kind topic + relations tag(프로젝트) → tag(줄) field lane · 줄 옮기기 = task_tags(떼기: 사람 행 삭제 · 자동 행 dismissed)
//  · 설정           view_settings project:<id> options_json(patchProjectSettings — 모르는 칸은 남김)
// 계산 규칙은 @sprout/schema/planView(데스크톱과 같은 코드). 새 테이블·서버 변경 없음.
import { tagKey } from '@sprout/schema/autoTag'
import {
  findTagByName, isLaneTag, keyDateRelId, keyTaskTitle, keyWordOf, laneMove, laneRelId, patchProjectSettings, projectSettingsId, projectViewKey, retitleKeyTask, type ProjectSettings
} from '@sprout/schema/planView'
import { projectTitle } from '@sprout/schema/projects'
import { deleteStmt, type Stmt } from '@sprout/schema/taskCore'
import { relationId } from '@sprout/schema/wikiLink'
import { db, run } from '../../data/db'
import { createTask, deleteForever, insert, update } from '../../data/tasks'
import { addToProject } from './plan'
import { laneName, nameWithEmoji } from './projectDirectModel'

export type Undo = () => Promise<void>
type Row = Record<string, unknown> & { id: string }
const noop: Undo = async () => {}
const uuid = () => crypto.randomUUID()
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
const clean = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'owner_id'))
/** 그 행들을 떠 두고, 되돌릴 때 지운 뒤 그대로 다시 넣는다(없던 행이면 지우기만) */
async function snapRows(table: string, ids: string[]): Promise<Undo> {
  if (!ids.length) return noop
  const rows = await db.getAll<Row>(`SELECT * FROM ${table} WHERE id IN (${marks(ids.length)})`, ids)
  return async () => { await run([...ids.map((id) => deleteStmt(table, id)), ...rows.map((r) => insert(table, clean(r)))]) }
}
const both = (...undos: Undo[]): Undo => async () => { for (const u of [...undos].reverse()) await u() }
const relRow = (id: string, from: string, toType: string, to: string, field: string) =>
  insert('relations', { id, from_type: 'tag', from_id: from, to_type: toType, to_id: to, source: 'manual', state: 'accepted', field })

// ── 프로젝트 설정(동기화) ──
/** 프로젝트 설정 바꾸기(읽고 합쳐 쓰기, 결정적 id라 두 기기가 따로 만들어도 한 행). 되돌리기 = 그 전 행 */
export async function saveProjectSettings(tagId: string, patch: ProjectSettings): Promise<Undo> {
  const id = projectSettingsId(tagId)
  const row = await db.getOptional<{ options_json: string | null }>('SELECT options_json FROM view_settings WHERE id = ?', [id])
  const undo = await snapRows('view_settings', [id])
  const json = patchProjectSettings(row?.options_json, patch)
  await run([row ? update('view_settings', id, { options_json: json }) : insert('view_settings', { id, view_key: projectViewKey(tagId), options_json: json })])
  return undo
}

// ── 이름 ──
/** 큰 제목 그 자리 고치기: tags.name(앞 이모지는 그대로 둔다) */
export async function renameProject(tagId: string, oldName: string, name: string): Promise<Undo | null> {
  const next = nameWithEmoji(oldName, name)
  if (!next || next === oldName) return null
  const undo = await snapRows('tags', [tagId])
  await run([update('tags', tagId, { name: next })])
  return undo
}

// ── 핵심 날짜 ──
/** ⚑ 할 일을 만들고(기본함·종일·프로젝트 태그 user) 프로젝트 마감으로 잇는다 */
async function makeKeyTask(projectTagId: string, name: string, day: string, word: string): Promise<{ id: string; undo: Undo }> {
  const id = await createTask({ title: keyTaskTitle(name, word), list_id: '', due_at: day, priority: 0 })
  await addToProject([id], projectTagId)
  const rel = keyDateRelId(projectTagId)
  const u = await snapRows('relations', [rel])
  await run([deleteStmt('relations', rel), relRow(rel, projectTagId, 'task', id, 'deadline')])
  return { id, undo: both(async () => { await deleteForever([id]) }, u) }
}
/** 핵심 날짜 정하기: ⚑ 할 일이 있으면 날짜(종일)·날짜 이름을 바꾸고(끊긴 이음은 다시), 없으면 만든다 */
export async function setKeyDate(p: { tagId: string; name: string; keyTaskId: string | null }, day: string, word: string): Promise<Undo> {
  if (!p.keyTaskId) return (await makeKeyTask(p.tagId, p.name, day, word)).undo
  const t = await db.getOptional<{ id: string; title: string; due_at: string | null; start_at: string | null; is_all_day: number | null }>('SELECT id, title, due_at, start_at, is_all_day FROM tasks WHERE id = ?', [p.keyTaskId])
  if (!t) return (await makeKeyTask(p.tagId, p.name, day, word)).undo
  const title = retitleKeyTask(t.title, keyWordOf(t.title), word)
  const rel = keyDateRelId(p.tagId)
  const u = await snapRows('relations', [rel])
  await run([
    update('tasks', t.id, { due_at: day, start_at: null, is_all_day: 1, ...(title !== t.title ? { title } : {}) }),
    deleteStmt('relations', rel), relRow(rel, p.tagId, 'task', t.id, 'deadline')
  ])
  return both(u, async () => { await run([update('tasks', t.id, { title: t.title, due_at: t.due_at, start_at: t.start_at, is_all_day: t.is_all_day ?? 1 })]) })
}
/** `핵심 날짜 지우기`: 마감 이음만 끊는다(⚑ 할 일은 남음) */
export async function clearKeyDate(tagId: string): Promise<Undo> {
  const rel = keyDateRelId(tagId)
  const u = await snapRows('relations', [rel])
  await run([deleteStmt('relations', rel)])
  return u
}

// ── 팀원 ──
/** 이름들 → 사람 태그(이름이 같은 태그가 있으면 그것을 사람으로, 없으면 새 태그 person·user) + 잇기(relations tag → tag field project) */
export async function linkTeam(projectTagId: string, names: string[]): Promise<Undo> {
  if (!names.length) return noop
  const tags = await db.getAll<{ id: string; name: string; kind: string | null }>("SELECT id, name, kind FROM tags WHERE name IS NOT NULL AND name != ''")
  const undos: Undo[] = []
  for (const n of names) {
    const hit = tags.find((t) => t.kind === 'person' && tagKey(t.name) === tagKey(n)) ?? tags.find((t) => tagKey(t.name) === tagKey(n) && t.id !== projectTagId)
    let id = hit?.id
    if (hit && hit.kind !== 'person') { undos.push(await snapRows('tags', [hit.id])); await run([update('tags', hit.id, { kind: 'person' })]) }
    if (!id) {
      const nid = uuid()
      id = nid
      await run([insert('tags', { id: nid, name: n, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'person', aliases: null, source: 'user', run_id: null })])
      tags.push({ id: nid, name: n, kind: 'person' })
      undos.push(async () => { await run([deleteStmt('tags', nid)]) })
    }
    const rid = relationId(projectTagId, id, 'project')
    undos.push(await snapRows('relations', [rid]))
    await run([deleteStmt('relations', rid), relRow(rid, projectTagId, 'tag', id, 'project')])
  }
  return both(...undos)
}
/** 팀원 ✕: 잇기만 끊는다(사람 태그는 남음) */
export async function unlinkTeammate(projectTagId: string, personTagId: string): Promise<Undo> {
  const rows = await db.getAll<{ id: string }>("SELECT id FROM relations WHERE from_type = 'tag' AND from_id = ? AND to_type = 'tag' AND to_id = ? AND field = 'project'", [projectTagId, personTagId])
  const u = await snapRows('relations', rows.map((r) => r.id))
  await run(rows.map((r) => deleteStmt('relations', r.id)))
  return u
}

// ── 한 줄 만들기 (§2.3 — 이것뿐) ──
export type NewProject = { name: string; emoji: string | null; day: string | null; word: string; team: string[] }
export async function createProjectLine(np: NewProject): Promise<{ tagId: string; undo: Undo }> {
  const name = np.name.trim()
  if (!name) throw new Error('이름을 적어 주세요')
  const emoji = np.emoji && np.emoji !== '🚀' ? np.emoji : null
  const full = emoji ? `${emoji} ${name}` : name
  const tags = await db.getAll<{ id: string; name: string; kind: string | null }>("SELECT id, name, kind FROM tags WHERE name IS NOT NULL AND name != ''")
  const hit = tags.find((t) => tagKey(projectTitle(t.name)) === tagKey(projectTitle(name)))
  const undos: Undo[] = []
  let tagId: string
  if (hit) {
    tagId = hit.id
    undos.push(await snapRows('tags', [hit.id]))
    await run([update('tags', hit.id, { kind: 'project', ...(emoji ? { name: full } : {}) })])
  } else {
    const id = uuid()
    tagId = id
    await run([insert('tags', { id, name: full, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'project', aliases: null, source: 'user', run_id: null, home_type: null, home_id: null })])
    undos.push(async () => {
      const links = await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE tag_id = ?', [id])
      await run([...links.map((r) => deleteStmt('task_tags', r.id)), deleteStmt('tags', id)])
    })
  }
  if (np.day) undos.push((await makeKeyTask(tagId, name, np.day, np.word)).undo)
  undos.push(await saveProjectSettings(tagId, { by: 'tag' }))
  if (np.team.length) undos.push(await linkTeam(tagId, np.team))
  return { tagId, undo: both(...undos) }
}

// ── 줄(묶음) = 태그 ──
type TagMini = { id: string; name: string; kind: string | null }
/** `＋ 묶음 추가`: 있는 태그면 그것(보통 태그일 때), 없으면 새 태그(topic·user) + 이 프로젝트 줄 행 */
export async function addLane(projectTagId: string, raw: string): Promise<{ tagId: string; name: string; undo: Undo } | null> {
  const name = laneName(raw)
  if (!name) return null
  const tags = await db.getAll<TagMini>("SELECT id, name, kind FROM tags WHERE name IS NOT NULL AND name != ''")
  const hit = findTagByName(tags.filter((t) => isLaneTag(t)), name)
  const undos: Undo[] = []
  let tagId: string
  if (hit) tagId = hit.id
  else {
    const id = uuid()
    tagId = id
    await run([insert('tags', { id, name, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'topic', aliases: null, source: 'user', run_id: null })])
    undos.push(async () => { await run([deleteStmt('tags', id)]) })
  }
  const rel = laneRelId(projectTagId, tagId)
  // 이미 이 프로젝트 줄이면 그대로(다시 만들면 만든 순서가 맨 뒤로 간다 — 데스크톱과 같음)
  const has = await db.getOptional<{ state: string | null }>('SELECT state FROM relations WHERE id = ?', [rel])
  if (!has || (has.state ?? 'accepted') !== 'accepted') {
    undos.push(await snapRows('relations', [rel]))
    await run([deleteStmt('relations', rel), relRow(rel, projectTagId, 'tag', tagId, 'lane')])
  }
  return { tagId, name: hit ? projectTitle(hit.name) : name, undo: both(...undos) }
}
/** 여러 줄 한꺼번에(줄 나누기 제안 [그렇게]) — 할 일은 만들지 않는다 */
export async function addLanes(projectTagId: string, names: string[]): Promise<Undo> {
  const undos: Undo[] = []
  for (const n of names) { const r = await addLane(projectTagId, n); if (r) undos.push(r.undo) }
  return both(...undos)
}
/** 태그 떼기(목록·상세와 같은 규칙): 사람이 붙인 행은 지우고, 자동(ai·rule·link) 행은 dismissed로 남겨 다시 안 붙게 */
const offStmts = (rows: { id: string; source: string | null }[]): Stmt[] =>
  rows.map((r) => ((r.source ?? 'user') === 'user' ? deleteStmt('task_tags', r.id) : update('task_tags', r.id, { state: 'dismissed' })))
/** 묶음 지우기: 이 프로젝트 할 일에서 그 태그를 떼고 줄 행을 지운다. 태그 자체·프로젝트 밖 연결은 남는다. 뗀 할 일 수 */
export async function removeLane(projectTagId: string, laneTagId: string, memberIds: string[]): Promise<{ n: number; undo: Undo }> {
  const rows = memberIds.length ? await db.getAll<{ id: string; task_id: string; source: string | null }>(
    `SELECT id, task_id, source FROM task_tags WHERE tag_id = ? AND COALESCE(state, 'accepted') = 'accepted' AND task_id IN (${marks(memberIds.length)})`, [laneTagId, ...memberIds]) : []
  const rels = await db.getAll<{ id: string }>("SELECT id FROM relations WHERE from_type = 'tag' AND from_id = ? AND to_type = 'tag' AND to_id = ? AND field = 'lane'", [projectTagId, laneTagId])
  const relIds = [...new Set([laneRelId(projectTagId, laneTagId), ...rels.map((r) => r.id)])]
  const u = both(await snapRows('relations', relIds), await snapRows('task_tags', rows.map((r) => r.id)))
  await run([...relIds.map((id) => deleteStmt('relations', id)), ...offStmts(rows)])
  return { n: new Set(rows.map((r) => r.task_id)).size, undo: u }
}
/** 묶음 이름 고치기 = 태그 이름. 같은 이름 태그가 있으면 바꾸지 않고 conflict(합치기는 컴퓨터 앱에서) */
export async function renameLane(laneTagId: string, raw: string): Promise<{ result: 'ok' | 'same' | 'conflict'; name: string; undo: Undo }> {
  const name = laneName(raw)
  const cur = await db.getOptional<TagMini>('SELECT id, name, kind FROM tags WHERE id = ?', [laneTagId])
  if (!cur || !name || tagKey(name) === tagKey(projectTitle(cur.name))) return { result: 'same', name, undo: noop }
  const others = await db.getAll<TagMini>("SELECT id, name, kind FROM tags WHERE id != ? AND name IS NOT NULL AND name != ''", [laneTagId])
  if (findTagByName(others, name)) return { result: 'conflict', name, undo: noop }
  const u = await snapRows('tags', [laneTagId])
  await run([update('tags', laneTagId, { name })])
  return { result: 'ok', name, undo: u }
}
/** 할 일을 다른 묶음으로(길게 누름 `다른 묶음으로 ›`): 공용 laneMove로 뗄·붙일 태그를 정하고 한 번에 쓴다 */
export async function moveToLane(moves: { id: string; tags: string[]; from: string }[], to: string): Promise<Undo> {
  const plan = moves.map((m) => ({ id: m.id, ...laneMove(m.tags, m.from, to) })).filter((x) => x.remove.length || x.add.length)
  if (!plan.length) return noop
  const ids = plan.map((p) => p.id)
  const tagIds = [...new Set(plan.flatMap((p) => [...p.remove, ...p.add]))]
  const rows = await db.getAll<{ id: string; task_id: string; tag_id: string; source: string | null; state: string | null }>(
    `SELECT id, task_id, tag_id, source, state FROM task_tags WHERE task_id IN (${marks(ids.length)}) AND tag_id IN (${marks(tagIds.length)})`, [...ids, ...tagIds])
  const before = await snapRows('task_tags', rows.map((r) => r.id))
  const stmts: Stmt[] = []
  const made: string[] = []
  for (const p of plan) {
    stmts.push(...offStmts(rows.filter((r) => r.task_id === p.id && p.remove.includes(r.tag_id) && (r.state ?? 'accepted') === 'accepted')))
    for (const t of p.add) {
      const r = rows.find((x) => x.task_id === p.id && x.tag_id === t)
      if (r) stmts.push(update('task_tags', r.id, { source: 'user', state: 'accepted', confidence: null }))
      else { const id = uuid(); made.push(id); stmts.push(insert('task_tags', { id, task_id: p.id, tag_id: t, source: 'user', state: 'accepted' })) }
    }
  }
  await run(stmts)
  return async () => { await run(made.map((id) => deleteStmt('task_tags', id))); await before() }
}
