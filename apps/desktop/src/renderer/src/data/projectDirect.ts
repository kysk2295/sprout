// 41 (31 §12.14) 프로젝트 직접 고치기 — 사람 손 쓰기(모두 되돌리기 함수를 돌려준다). 새 테이블·서버 변경 없음, 모두 동기화 표:
//  · 한 줄 만들기        tags kind project + ⚑ 할 일(tasks) + task_tags + relations tag → task field deadline + view_settings project:<id> {by: 'tag'}
//  · 핵심 날짜           ⚑ 할 일 due_at(종일) · 날짜 이름은 제목 끝 `○○일` · 지우기 = 이음 행만
//  · 줄                  tags kind topic + relations tag(프로젝트) → tag(줄) field lane · 줄 옮기기 = task_tags
//  · 줄 기준·순서·제안    view_settings project:<id> options_json(@sprout/schema/planView patchProjectSettings — 모르는 칸은 남김)
// 계산 규칙은 @sprout/schema/planView(휴대폰과 같은 코드).
import { tagKey } from '@sprout/schema/autoTag'
import {
  findTagByName, isLaneTag, keyDateRelId, keyTaskTitle, keyWordOf, laneMove, laneRelId, patchProjectSettings, projectSettingsId, projectViewKey, retitleKeyTask, type ProjectSettings
} from '@sprout/schema/planView'
import { projectTitle } from '@sprout/schema/projects'
import { getDb, type Row, type Stmt } from './db'
import { createTask, deleteTasksHard, insert, remove, run, update, uuid } from './mutations'
import { addToProject } from './projects'
import { createProject, linkTeam, mergeProject } from './projectEdit'
import { renameWithLinks } from './wiki'

export type Undo = () => Promise<void>
const noop: Undo = async () => {}
const clean = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'owner_id'))
async function snapRows(table: string, ids: string[]): Promise<Undo> {
  if (!ids.length) return noop
  const db = await getDb()
  const rows = await db.getAll<Row>(`SELECT * FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  return async () => { await run(...ids.map((id) => remove(table, id)), ...rows.map((r) => insert(table, clean(r)))) }
}
const both = (...undos: Undo[]): Undo => async () => { for (const u of [...undos].reverse()) await u() }

// ── 프로젝트 설정(동기화) ──
/** 프로젝트 설정 바꾸기(읽고 합쳐 쓰기). 되돌리기 = 그 전 행 */
export async function saveProjectSettings(tagId: string, patch: ProjectSettings): Promise<Undo> {
  const id = projectSettingsId(tagId)
  const db = await getDb()
  const row = await db.get<{ options_json: string | null }>('SELECT options_json FROM view_settings WHERE id = ?', [id])
  const undo = await snapRows('view_settings', [id])
  const json = patchProjectSettings(row?.options_json, patch)
  await run(row ? update('view_settings', id, { options_json: json }) : insert('view_settings', { id, view_key: projectViewKey(tagId), options_json: json }))
  return undo
}

// ── 핵심 날짜 ──
/** ⚑ 할 일을 만들고 프로젝트 마감으로 잇는다(프로젝트 태그 user) */
async function makeKeyTask(projectTagId: string, name: string, day: string, word: string, listId: string | null): Promise<{ id: string; undo: Undo }> {
  const id = await createTask({ title: keyTaskTitle(name, word), list_id: listId, due_at: day, priority: 0 })
  const u1 = await addToProject([id], projectTagId)
  const rel = keyDateRelId(projectTagId)
  const u2 = await snapRows('relations', [rel])
  await run(remove('relations', rel), insert('relations', { id: rel, from_type: 'tag', from_id: projectTagId, to_type: 'task', to_id: id, source: 'manual', state: 'accepted', field: 'deadline' }))
  return { id, undo: both(async () => { await deleteTasksHard([id]) }, u1, u2) }
}
/** 핵심 날짜 정하기: ⚑ 할 일이 있으면 그 날짜(종일)·날짜 이름을 바꾸고, 없으면 만든다 */
export async function setKeyDate(p: { tagId: string; name: string; keyTask: { id: string; title: string } | null; mainList: string | null }, day: string, word?: string): Promise<{ undo: Undo; made: boolean }> {
  if (!p.keyTask) {
    const r = await makeKeyTask(p.tagId, p.name, day, word ?? '마감', p.mainList)
    return { undo: r.undo, made: true }
  }
  const db = await getDb()
  const t = await db.get<{ id: string; title: string; due_at: string | null; start_at: string | null; is_all_day: number | null }>('SELECT id, title, due_at, start_at, is_all_day FROM tasks WHERE id = ?', [p.keyTask.id])
  if (!t) return { undo: noop, made: false }
  const from = keyWordOf(t.title)
  const title = word ? retitleKeyTask(t.title, from, word) : t.title
  const rel = keyDateRelId(p.tagId)
  const u = await snapRows('relations', [rel])
  await run(
    update('tasks', t.id, { due_at: day, start_at: null, is_all_day: 1, ...(title !== t.title ? { title } : {}) }),
    // 연결이 끊겨 있었으면(휴대폰에서 지움 등) 다시 잇는다
    remove('relations', rel), insert('relations', { id: rel, from_type: 'tag', from_id: p.tagId, to_type: 'task', to_id: t.id, source: 'manual', state: 'accepted', field: 'deadline' })
  )
  return { undo: both(u, async () => { await run(update('tasks', t.id, { title: t.title, due_at: t.due_at, start_at: t.start_at, is_all_day: t.is_all_day ?? 1 })) }), made: false }
}
/** `핵심 날짜 지우기`: 마감 이음만 끊는다(⚑ 할 일은 남음) */
export async function clearKeyDate(tagId: string): Promise<Undo> {
  const rel = keyDateRelId(tagId)
  const u = await snapRows('relations', [rel])
  await run(remove('relations', rel))
  return u
}

// ── 한 줄 만들기 ──
export type NewProject = { name: string; emoji: string | null; day: string | null; word: string; team: string[] }
/** §2.3 만들면 생기는 것: 프로젝트 태그 · (날짜가 있으면) ⚑ 할 일 하나 + 마감 이음 · 줄 기준 태그 · 팀원. 다른 할 일·AI 없음 */
export async function createProjectLine(np: NewProject): Promise<{ tagId: string; keyTaskId: string | null; undo: Undo }> {
  const emoji = np.emoji && np.emoji !== '🚀' ? np.emoji : null
  const made = await createProject(np.name, emoji)
  const undos: Undo[] = [made.undo]
  let keyTaskId: string | null = null
  if (np.day) {
    const k = await makeKeyTask(made.tagId, np.name, np.day, np.word, null)
    keyTaskId = k.id
    undos.push(k.undo)
  }
  undos.push(await saveProjectSettings(made.tagId, { by: 'tag' }))
  if (np.team.length) undos.push(await linkTeam(made.tagId, np.team))
  return { tagId: made.tagId, keyTaskId, undo: both(...undos) }
}

// ── 팀원 ──
export async function unlinkTeammate(projectTagId: string, personTagId: string): Promise<Undo> {
  const db = await getDb()
  const rows = await db.getAll<{ id: string }>("SELECT id FROM relations WHERE from_type = 'tag' AND from_id = ? AND to_type = 'tag' AND to_id = ? AND field = 'project'", [projectTagId, personTagId])
  const u = await snapRows('relations', rows.map((r) => r.id))
  await run(...rows.map((r) => remove('relations', r.id)))
  return u
}

// ── 줄 = 태그 ──
type TagMini = { id: string; name: string; kind: string | null }
/** `＋ 줄 추가`: 있는 태그면 그것(보통 태그일 때), 없으면 새 태그(topic, user) + 이 프로젝트 줄 행 */
export async function addLane(projectTagId: string, raw: string, opts: { lane?: boolean } = {}): Promise<{ tagId: string; name: string; undo: Undo } | null> {
  const name = [...projectTitle(raw.replace(/^#+/, '').trim())].slice(0, 30).join('').trim()
  if (!name) return null
  const db = await getDb()
  const tags = await db.getAll<TagMini>("SELECT id, name, kind FROM tags WHERE name IS NOT NULL AND name != ''")
  const hit = findTagByName(tags, name)
  const undos: Undo[] = []
  let tagId: string
  if (hit && isLaneTag(hit)) tagId = hit.id
  else {
    tagId = uuid()
    await run(insert('tags', { id: tagId, name, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'topic', aliases: null, source: 'user', run_id: null }))
    undos.push(async () => { await run(remove('tags', tagId)) })
  }
  if (opts.lane !== false) {
    const rel = laneRelId(projectTagId, tagId)
    // 이미 이 프로젝트 줄이면 그대로(다시 만들면 만든 순서가 맨 뒤로 간다)
    const has = await db.get<{ state: string | null }>('SELECT state FROM relations WHERE id = ?', [rel])
    if (!has || (has.state ?? 'accepted') !== 'accepted') {
      undos.push(await snapRows('relations', [rel]))
      await run(remove('relations', rel), insert('relations', { id: rel, from_type: 'tag', from_id: projectTagId, to_type: 'tag', to_id: tagId, source: 'manual', state: 'accepted', field: 'lane' }))
    }
  }
  return { tagId, name: hit && isLaneTag(hit) ? projectTitle(hit.name) : name, undo: both(...undos) }
}
/** 여러 줄 한꺼번에(줄 나누기 제안 [그렇게]) */
export async function addLanes(projectTagId: string, names: string[]): Promise<Undo> {
  const undos: Undo[] = []
  for (const n of names) { const r = await addLane(projectTagId, n); if (r) undos.push(r.undo) }
  return both(...undos)
}
/** 태그 떼기(목록·상세와 같은 규칙): 사람이 붙인 행은 지우고, 자동(ai·rule·link) 행은 dismissed로 남겨 다시 안 붙게 */
function offStmts(rows: { id: string; source: string | null }[]): Stmt[] {
  return rows.map((r) => ((r.source ?? 'user') === 'user' ? remove('task_tags', r.id) : update('task_tags', r.id, { state: 'dismissed' })))
}
/** 줄 ✕: 이 프로젝트 할 일에서 그 태그를 떼고 줄 행을 지운다. 태그 자체·프로젝트 밖 연결은 남는다. 뗀 할 일 수 */
export async function removeLane(projectTagId: string, laneTagId: string, memberIds: string[]): Promise<{ n: number; undo: Undo }> {
  const db = await getDb()
  const rows = memberIds.length ? await db.getAll<{ id: string; source: string | null }>(
    `SELECT id, source FROM task_tags WHERE tag_id = ? AND COALESCE(state, 'accepted') = 'accepted' AND task_id IN (${memberIds.map(() => '?').join(',')})`, [laneTagId, ...memberIds]) : []
  const rel = laneRelId(projectTagId, laneTagId)
  const u = both(await snapRows('relations', [rel]), await snapRows('task_tags', rows.map((r) => r.id)))
  await run(remove('relations', rel), ...offStmts(rows))
  // 다른 기기가 만든 같은 줄 행(옛 id)이 있으면 같이
  const extra = await db.getAll<{ id: string }>("SELECT id FROM relations WHERE from_type = 'tag' AND from_id = ? AND to_type = 'tag' AND to_id = ? AND field = 'lane'", [projectTagId, laneTagId])
  if (extra.length) await run(...extra.map((r) => remove('relations', r.id)))
  return { n: rows.length, undo: u }
}
/** 줄 이름 고치기 = 태그 이름(링크 글도 같이). 같은 이름 태그가 있으면 merge=true일 때 그 태그로 합친다(이 프로젝트 줄도 그 태그로) */
export async function renameLane(projectTagId: string, laneTagId: string, raw: string, opts: { merge?: boolean } = {}): Promise<{ result: 'ok' | 'same' | 'conflict' | 'merged'; into?: TagMini; undo: Undo }> {
  const name = [...projectTitle(raw.replace(/^#+/, '').trim())].slice(0, 30).join('').trim()
  const db = await getDb()
  const cur = await db.get<TagMini>('SELECT id, name, kind FROM tags WHERE id = ?', [laneTagId])
  if (!cur || !name || tagKey(name) === tagKey(projectTitle(cur.name))) return { result: 'same', undo: noop }
  const tags = await db.getAll<TagMini>("SELECT id, name, kind FROM tags WHERE id != ? AND name IS NOT NULL AND name != ''", [laneTagId])
  const hit = findTagByName(tags, name)
  if (hit) {
    if (!opts.merge) return { result: 'conflict', into: hit, undo: noop }
    const rel = laneRelId(projectTagId, hit.id)
    const u0 = await snapRows('relations', [rel])
    const u = await mergeProject(laneTagId, hit.id)
    await run(remove('relations', rel), insert('relations', { id: rel, from_type: 'tag', from_id: projectTagId, to_type: 'tag', to_id: hit.id, source: 'manual', state: 'accepted', field: 'lane' }))
    return { result: 'merged', into: hit, undo: both(u, u0) }
  }
  const u = await snapRows('tags', [laneTagId])
  await renameWithLinks('tag', laneTagId, projectTitle(cur.name), name)
  return { result: 'ok', undo: u }
}
/** 다른 태그가 몇 개의 (이 프로젝트 밖) 할 일에 붙어 있나 — 이름 고치기 안내 `다른 할 일 N개에도 붙어 있어요` */
export async function laneOutsideCount(laneTagId: string, memberIds: string[]): Promise<number> {
  const db = await getDb()
  const r = await db.get<{ c: number }>(
    `SELECT count(*) AS c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE tt.tag_id = ? AND COALESCE(tt.state, 'accepted') = 'accepted' AND t.deleted_at IS NULL${memberIds.length ? ` AND tt.task_id NOT IN (${memberIds.map(() => '?').join(',')})` : ''}`,
    [laneTagId, ...memberIds])
  return r?.c ?? 0
}
/**
 * 할 일들을 다른 줄로(§4.3 끌기 · §6 태그 › · 함께 끌기): 공용 laneMove로 뗄·붙일 태그를 정하고 한 번에 쓴다. 되돌리기 하나.
 * moves = 할 일마다 { id, tags(지금 줄 태그), from(지금 줄) }
 */
export async function moveToLane(moves: { id: string; tags: string[]; from: string }[], to: string): Promise<Undo> {
  const db = await getDb()
  const plan = moves.map((m) => ({ id: m.id, ...laneMove(m.tags, m.from, to) })).filter((x) => x.remove.length || x.add.length)
  if (!plan.length) return noop
  const ids = plan.map((p) => p.id)
  const tagIds = [...new Set(plan.flatMap((p) => [...p.remove, ...p.add]))]
  const rows = await db.getAll<{ id: string; task_id: string; tag_id: string; source: string | null; state: string | null }>(
    `SELECT id, task_id, tag_id, source, state FROM task_tags WHERE task_id IN (${ids.map(() => '?').join(',')}) AND tag_id IN (${tagIds.map(() => '?').join(',')})`, [...ids, ...tagIds])
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
  await run(...stmts)
  return async () => { await run(...made.map((id) => remove('task_tags', id))); await before() }
}
