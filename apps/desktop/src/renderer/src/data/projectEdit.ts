// 31 §12.9 프로젝트 편집·관계도 — 사람 손 쓰기(모두 되돌리기 함수를 돌려준다). 새 테이블·스키마 변경 없음(§12.9.6).
//  · 일의 종류 덮어쓰기  relations task → work_kind (source manual, 할 일당 한 행)
//  · 관련 선            relations task → task (field related)
//  · 메모 잇기           relations note → task / note → tag
//  · 프로젝트 ↔ 사람      relations tag → tag (field project)
//  · 순서 선             map_links sequence (고리 검사 data/map wouldCycle)
//  · 프로젝트 만들기·이름·합치기·삭제  tags kind project source user
import { tagKey, withAlias } from '@sprout/schema/autoTag'
import { relationId } from '@sprout/schema/wikiLink'
import type { WorkKind } from '@sprout/schema/projects'
import { getDb, type Row, type Stmt } from './db'
import { readLinks, wouldCycle } from './map'
import { createTask, deleteTasksHard, insert, remove, run, setTag, update, uuid } from './mutations'
import { addToProject, noteAsked, removeFromProject } from './projects'
import { hintWord, personInTitle } from '@sprout/schema/projectScore'
import { itemRow } from './collect'
import { removeTaskTag } from './wiki'

export type Undo = () => Promise<void>
const noop: Undo = async () => {}
const clean = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'owner_id'))
/** 행을 통째로 떠 두고, 되돌릴 때 지금 행을 지운 뒤 다시 넣는다(없던 행은 지운다) */
async function snapRows(table: string, ids: string[]): Promise<Undo> {
  if (!ids.length) return noop
  const db = await getDb()
  const rows = await db.getAll<Row>(`SELECT * FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  return async () => { await run(...ids.map((id) => remove(table, id)), ...rows.map((r) => insert(table, clean(r)))) }
}
const both = (...undos: Undo[]): Undo => async () => { for (const u of [...undos].reverse()) await u() }

// ── 일의 종류 ──
export const kindRelId = (taskId: string) => relationId(taskId, 'work_kind', 'work_kind')
/** 사람이 정한 일의 종류. null = 자동으로(덮어쓰기 지움) */
export async function setWorkKind(taskId: string, kind: WorkKind | null): Promise<Undo> {
  const id = kindRelId(taskId)
  const undo = await snapRows('relations', [id])
  const db = await getDb()
  const has = await db.get<{ id: string }>('SELECT id FROM relations WHERE id = ?', [id])
  if (!kind) { if (has) await run(remove('relations', id)); return undo }
  await run(has
    ? update('relations', id, { to_id: kind, state: 'accepted' })
    : insert('relations', { id, from_type: 'task', from_id: taskId, to_type: 'work_kind', to_id: kind, source: 'manual', state: 'accepted', field: 'work_kind' }))
  return undo
}

// ── 순서 선 ──
export type LinkResult = { result: 'ok' | 'cycle' | 'exists' | 'self'; undo: Undo }
export async function linkOrder(from: string, to: string): Promise<LinkResult> {
  if (from === to) return { result: 'self', undo: noop }
  const links = await readLinks()
  const same = links.find((l) => l.kind === 'sequence' && l.from_id === from && l.to_id === to)
  if (same?.state === 'accepted') return { result: 'exists', undo: noop }
  if (wouldCycle(links.filter((l) => l !== same && l.state === 'accepted'), from, to)) return { result: 'cycle', undo: noop }
  const id = same?.id ?? uuid()
  const undo = await snapRows('map_links', [id])
  await run(same ? update('map_links', id, { state: 'accepted', source: 'user' }) : insert('map_links', { id, kind: 'sequence', from_type: 'task', from_id: from, to_id: to, source: 'user', state: 'accepted' }))
  return { result: 'ok', undo }
}
export async function unlinkOrder(linkId: string): Promise<Undo> {
  const undo = await snapRows('map_links', [linkId])
  await run(remove('map_links', linkId))
  return undo
}
/** 방향 바꾸기(고리면 'cycle') */
export async function flipOrder(linkId: string): Promise<LinkResult> {
  const links = await readLinks()
  const l = links.find((x) => x.id === linkId)
  if (!l) return { result: 'ok', undo: noop }
  if (wouldCycle(links.filter((x) => x.id !== linkId && x.state === 'accepted'), l.to_id, l.from_id)) return { result: 'cycle', undo: noop }
  const undo = await snapRows('map_links', [linkId])
  await run(update('map_links', linkId, { from_id: l.to_id, to_id: l.from_id, source: 'user' }))
  return { result: 'ok', undo }
}
/** 이 할 일의 순서 선 모두 끊기 */
export async function unlinkAllOrders(taskId: string): Promise<{ n: number; undo: Undo }> {
  const ids = (await readLinks()).filter((l) => l.kind === 'sequence' && l.state === 'accepted' && (l.from_id === taskId || l.to_id === taskId)).map((l) => l.id)
  const undo = await snapRows('map_links', ids)
  await run(...ids.map((id) => remove('map_links', id)))
  return { n: ids.length, undo }
}

// ── 관련 선(할 일 ↔ 할 일) ──
export const relatedId = (a: string, b: string) => { const [x, y] = [a, b].sort(); return relationId(x, y, 'related') }
export async function linkRelated(a: string, b: string): Promise<LinkResult> {
  if (a === b) return { result: 'self', undo: noop }
  const id = relatedId(a, b)
  const db = await getDb()
  const has = await db.get<{ state: string | null }>('SELECT state FROM relations WHERE id = ?', [id])
  if (has && (has.state ?? 'accepted') === 'accepted') return { result: 'exists', undo: noop }
  const undo = await snapRows('relations', [id])
  const [x, y] = [a, b].sort()
  await run(has ? update('relations', id, { state: 'accepted' }) : insert('relations', { id, from_type: 'task', from_id: x, to_type: 'task', to_id: y, source: 'manual', state: 'accepted', field: 'related' }))
  return { result: 'ok', undo }
}
export async function unlinkRelation(relId: string): Promise<Undo> {
  const undo = await snapRows('relations', [relId])
  await run(remove('relations', relId))
  return undo
}
/** 선 종류 바꾸기: 순서(→) ⇄ 관련(─) */
export async function orderToRelated(linkId: string, from: string, to: string): Promise<Undo> {
  const a = await unlinkOrder(linkId)
  const b = await linkRelated(from, to)
  return both(a, b.undo)
}
export async function relatedToOrder(relId: string, from: string, to: string): Promise<LinkResult> {
  const r = await linkOrder(from, to)
  if (r.result !== 'ok' && r.result !== 'exists') return r
  const a = await unlinkRelation(relId)
  return { result: 'ok', undo: both(r.undo, a) }
}

// ── 사람 ──
export async function linkPerson(taskId: string, personTagId: string): Promise<Undo> {
  const db = await getDb()
  const rows = await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, personTagId])
  const before = await snapRows('task_tags', rows.map((r) => r.id))
  await setTag([taskId], personTagId, true)
  const after = await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, personTagId])
  const made = after.filter((r) => !rows.some((x) => x.id === r.id)).map((r) => r.id)
  return async () => { await run(...made.map((id) => remove('task_tags', id))); await before() }
}
export const unlinkPerson = (taskId: string, personTagId: string): Promise<Undo> => removeTaskTag(taskId, personTagId)
export const projectPersonId = (projectTagId: string, personTagId: string) => relationId(projectTagId, personTagId, 'project')
export async function linkPersonToProject(projectTagId: string, personTagId: string): Promise<Undo> {
  const id = projectPersonId(projectTagId, personTagId)
  const undo = await snapRows('relations', [id])
  await run(remove('relations', id), insert('relations', { id, from_type: 'tag', from_id: projectTagId, to_type: 'tag', to_id: personTagId, source: 'manual', state: 'accepted', field: 'project' }))
  return undo
}
/** 이름으로 사람 태그 찾기·만들기 → id */
export async function ensurePerson(name: string): Promise<{ id: string; made: boolean }> {
  const n = name.trim().replace(/^👤\s*/, '')
  const db = await getDb()
  const tags = await db.getAll<{ id: string; name: string; kind: string | null }>('SELECT id, name, kind FROM tags')
  const hit = tags.find((t) => tagKey(t.name) === tagKey(n))
  if (hit) { if (hit.kind !== 'person') await run(update('tags', hit.id, { kind: 'person' })); return { id: hit.id, made: false } }
  const id = uuid()
  await run(insert('tags', { id, name: n, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'person', aliases: null, source: 'user', run_id: null }))
  return { id, made: true }
}

// ── 메모 ──
export const noteRelId = (noteId: string, toId: string) => relationId(noteId, toId, 'project')
export async function linkNote(noteId: string, to: { type: 'task' | 'tag'; id: string }): Promise<Undo> {
  const id = noteRelId(noteId, to.id)
  const undo = await snapRows('relations', [id])
  await run(remove('relations', id), insert('relations', { id, from_type: 'note', from_id: noteId, to_type: to.type, to_id: to.id, source: 'manual', state: 'accepted', field: 'project' }))
  return undo
}
/** `＋ 메모`: 수집함 메모를 만들고 프로젝트(또는 할 일)에 잇는다 */
export async function createNoteFor(text: string, to: { type: 'task' | 'tag'; id: string }): Promise<{ id: string; undo: Undo }> {
  const id = uuid()
  await run(insert('notes', { id, ...itemRow(text) }))
  const u = await linkNote(id, to)
  return { id, undo: async () => { await u(); await run(remove('notes', id)) } }
}
/** 메모 ↔ 대상의 모든 관계 끊기(메모는 남음) */
export async function unlinkNote(noteId: string, toId: string): Promise<Undo> {
  const db = await getDb()
  const ids = (await db.getAll<{ id: string }>("SELECT id FROM relations WHERE from_type = 'note' AND from_id = ? AND to_id = ?", [noteId, toId])).map((r) => r.id)
  const undo = await snapRows('relations', ids)
  await run(...ids.map((id) => remove('relations', id)))
  return undo
}

// ── 할 일 ──
/** 프로젝트에 새 할 일: 주 리스트 · 그날 종일 마감(없으면 날짜 없음) · 프로젝트 태그 user · 줄 종류가 자동 분류와 다르면 덮어쓰기 */
export async function addProjectTask(input: {
  title: string; projectTagId: string; listId: string | null; day?: string | null; kind?: WorkKind | null; parentId?: string | null
  /** 31 §12.12 빠른 추가 인식 값 */
  priority?: number; repeatRule?: string | null; tagIds?: string[]
  /** 41 §5 기간 시작(`10/12~10/18`) */
  startAt?: string | null
}): Promise<{ id: string; undo: Undo }> {
  let listId = input.listId
  if (input.parentId) { const par = await (await getDb()).get<{ list_id: string | null }>('SELECT list_id FROM tasks WHERE id = ?', [input.parentId]); if (par?.list_id) listId = par.list_id }
  const due = input.day ?? null
  const id = await createTask({ title: input.title.trim(), list_id: listId, due_at: due, priority: input.priority ?? 0, parent_id: input.parentId ?? null, sort_order: input.parentId ? Date.now() : -Date.now() })
  const extra: Stmt[] = []
  if (due && input.repeatRule) extra.push(update('tasks', id, { repeat_rule: input.repeatRule, repeat_from: 'due' }))
  if (due && input.startAt && input.startAt.slice(0, 10) < due.slice(0, 10)) extra.push(update('tasks', id, { start_at: input.startAt }))
  if (due?.includes('T')) extra.push(insert('reminders', { id: uuid(), task_id: id, trigger: '-PT0M' })) // 빠른 추가와 같게: 시각이 있으면 정시 알림
  if (extra.length) await run(...extra)
  for (const tagId of input.tagIds ?? []) if (tagId !== input.projectTagId) await setTag([id], tagId, true)
  await addToProject([id], input.projectTagId)
  if (input.kind) await setWorkKind(id, input.kind)
  return { id, undo: async () => { await run(remove('relations', kindRelId(id))); await deleteTasksHard([id]) } }
}
export async function renameTask(id: string, title: string): Promise<Undo> {
  const t = title.trim()
  if (!t) return noop
  const db = await getDb()
  const old = await db.get<{ title: string }>('SELECT title FROM tasks WHERE id = ?', [id])
  await run(update('tasks', id, { title: t }))
  return async () => { if (old) await run(update('tasks', id, { title: old.title })) }
}

// ── 프로젝트 ──
const nameWith = (emoji: string | null | undefined, name: string) => `${emoji ? `${emoji} ` : ''}${[...name.trim()].slice(0, 20).join('')}`.trim()
/** `＋ 새 프로젝트`: 사람이 만든 프로젝트(source user). 같은 이름 태그가 있으면 그것을 프로젝트로 */
export async function createProject(name: string, emoji?: string | null): Promise<{ tagId: string; undo: Undo }> {
  const full = nameWith(emoji, name)
  if (!name.trim()) throw new Error('이름을 입력해 주세요.')
  const db = await getDb()
  const tags = await db.getAll<{ id: string; name: string; kind: string | null; source: string | null }>('SELECT id, name, kind, source FROM tags')
  const plain = tagKey(name)
  const hit = tags.find((t) => tagKey(t.name.replace(/^\p{Extended_Pictographic}️?\s*/u, '')) === plain)
  if (hit) {
    const undo = await snapRows('tags', [hit.id])
    await run(update('tags', hit.id, { kind: 'project', ...(emoji ? { name: full } : {}) }))
    return { tagId: hit.id, undo }
  }
  const id = uuid()
  await run(insert('tags', { id, name: full, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'project', aliases: null, source: 'user', run_id: null, home_type: null, home_id: null }))
  return { tagId: id, undo: async () => { await deleteProjectRows(id) } }
}
export async function renameProject(tagId: string, name: string, emoji?: string | null): Promise<Undo> {
  if (!name.trim()) return noop
  const undo = await snapRows('tags', [tagId])
  await run(update('tags', tagId, { name: nameWith(emoji, name) }))
  return undo
}
async function deleteProjectRows(tagId: string) {
  const db = await getDb()
  const links = await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE tag_id = ?', [tagId])
  const rels = await db.getAll<{ id: string }>('SELECT id FROM relations WHERE to_id = ? OR from_id = ?', [tagId, tagId])
  await run(...links.map((r) => remove('task_tags', r.id)), ...rels.map((r) => remove('relations', r.id)), remove('tags', tagId))
}
/** `프로젝트 삭제`: 태그와 붙은 행을 지운다(할 일은 그대로) */
export async function deleteProject(tagId: string): Promise<Undo> {
  const db = await getDb()
  const links = (await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE tag_id = ?', [tagId])).map((r) => r.id)
  const rels = (await db.getAll<{ id: string }>('SELECT id FROM relations WHERE to_id = ? OR from_id = ?', [tagId, tagId])).map((r) => r.id)
  const u = both(await snapRows('tags', [tagId]), await snapRows('task_tags', links), await snapRows('relations', rels))
  await deleteProjectRows(tagId)
  return u
}
/** `다른 프로젝트와 합치기`: from의 구성원·관계를 into로(겹치면 into 것을 남김), from 이름은 into 별칭, from 태그 지움 */
export async function mergeProject(fromId: string, intoId: string): Promise<Undo> {
  if (fromId === intoId) return noop
  const db = await getDb()
  const from = await db.get<{ id: string; name: string }>('SELECT id, name FROM tags WHERE id = ?', [fromId])
  const into = await db.get<{ id: string; name: string; aliases: string | null }>('SELECT id, name, aliases FROM tags WHERE id = ?', [intoId])
  if (!from || !into) return noop
  const fl = await db.getAll<{ id: string; task_id: string; state: string | null }>('SELECT id, task_id, state FROM task_tags WHERE tag_id = ?', [fromId])
  const il = await db.getAll<{ task_id: string }>('SELECT task_id FROM task_tags WHERE tag_id = ?', [intoId])
  const rels = (await db.getAll<{ id: string; from_id: string; to_id: string }>('SELECT id, from_id, to_id FROM relations WHERE from_id = ? OR to_id = ?', [fromId, fromId]))
  const u = both(await snapRows('tags', [fromId, intoId]), await snapRows('task_tags', fl.map((l) => l.id)), await snapRows('relations', rels.map((r) => r.id)))
  const has = new Set(il.map((l) => l.task_id))
  const stmts: Stmt[] = []
  for (const l of fl) stmts.push(has.has(l.task_id) ? remove('task_tags', l.id) : update('task_tags', l.id, (l.state ?? 'accepted') === 'accepted' ? { tag_id: intoId, source: 'user' } : { tag_id: intoId }))
  for (const r of rels) stmts.push(update('relations', r.id, r.to_id === fromId ? { to_id: intoId } : { from_id: intoId }))
  const aliases = withAlias(into.aliases, from.name.replace(/^\p{Extended_Pictographic}️?\s*/u, ''), into.name)
  if (aliases) stmts.push(update('tags', intoId, { aliases }))
  stmts.push(remove('tags', fromId))
  await run(...stmts)
  return u
}

// ── 31 §12.10 분류 · 고르기 · 옮기기 ──
export const categoryRelId = (tagId: string) => relationId(tagId, 'category', 'category')
/** 사람이 고른 분류(null = 이름에서, '' = 분류 없음으로 고름) */
export async function setCategory(tagId: string, word: string | null): Promise<Undo> {
  const id = categoryRelId(tagId)
  const undo = await snapRows('relations', [id])
  await run(remove('relations', id), ...(word !== null ? [insert('relations', { id, from_type: 'tag', from_id: tagId, to_type: 'category', to_id: word, source: 'manual', state: 'accepted', field: 'category' })] : []))
  return undo
}
/** `다른 공모전으로 옮기기`: 여기서 빼고(dismissed) 거기에 넣기(user) */
export async function moveToProject(taskId: string, fromTag: string, toTag: string): Promise<Undo> {
  const a = await removeFromProject(taskId, fromTag)
  const b = await addToProject([taskId], toTag)
  return both(a, b)
}

// ── 31 §12.11 단계 보드 ──
/** 단계 순서 바꾸기: 그 줄의 순서 선을 지우고 새 순서로 이웃끼리 잇는다(한 번에 되돌리기) */
export async function reorderSteps(oldLinkIds: string[], order: string[]): Promise<Undo> {
  const links = await readLinks()
  const keep = links.filter((l) => !oldLinkIds.includes(l.id))
  const pairs = order.slice(1).map((id, i) => [order[i], id] as const)
  // 줄 밖 선과 고리가 생기면 그 이음은 건너뛴다
  const add: { id: string; from: string; to: string }[] = []
  const acc = keep.filter((l) => l.state === 'accepted')
  for (const [a, b] of pairs) { if (wouldCycle(acc as never, a, b)) continue; const id = uuid(); add.push({ id, from: a, to: b }); acc.push({ id, kind: 'sequence', from_id: a, to_id: b, state: 'accepted' } as never) }
  const undo = await snapRows('map_links', [...oldLinkIds, ...add.map((x) => x.id)])
  await run(...oldLinkIds.map((id) => remove('map_links', id)), ...add.map((x) => insert('map_links', { id: x.id, kind: 'sequence', from_type: 'task', from_id: x.from, to_id: x.to, source: 'user', state: 'accepted' })))
  return undo
}
/** 단계 줄 끝에 붙이기(끌어 넣기·＋ 단계 추가): 마지막 → 이 할 일 */
export async function appendStep(lastId: string | null, taskId: string): Promise<Undo> {
  if (!lastId || lastId === taskId) return noop
  return (await linkOrder(lastId, taskId)).undo
}
/** 단계에서 빼기: 앞뒤 선을 지우고 앞 → 뒤를 잇는다(할 일·프로젝트는 그대로) */
export async function dropStep(taskId: string, linkIds: string[], prev: string | null, next: string | null): Promise<Undo> {
  const u1 = await snapRows('map_links', linkIds)
  await run(...linkIds.map((id) => remove('map_links', id)))
  const r = prev && next ? await linkOrder(prev, next) : { undo: noop }
  return both(u1, r.undo)
}

// ── 31 §12.13 팀원 · 물음 답 · 지금 집중 ──
/** 팀원 이름들 → 사람 태그(찾거나 만들기) + 프로젝트와 잇기(relations tag→tag field project) */
export async function linkTeam(projectTagId: string, names: string[]): Promise<Undo> {
  const undos: Undo[] = []
  for (const n of names) {
    if (!n.trim()) continue
    const p = await ensurePerson(n)
    undos.push(await linkPersonToProject(projectTagId, p.id))
    if (p.made) undos.push(async () => { await run(remove('tags', p.id)) })
  }
  return both(...undos)
}
export const hintRelId = (projectTagId: string, word: string) => relationId(projectTagId, `hint:${word}`, 'hint')
/** 배운 낱말(§12.13.5 ⓑ): 프로젝트 → hint(낱말) */
export async function learnHint(projectTagId: string, word: string): Promise<Undo> {
  const id = hintRelId(projectTagId, word)
  const undo = await snapRows('relations', [id])
  await run(remove('relations', id), insert('relations', { id, from_type: 'tag', from_id: projectTagId, to_type: 'hint', to_id: word, source: 'manual', state: 'accepted', field: 'hint' }))
  return undo
}
/**
 * 물음 답(§12.13.5). 응 = 넣기(user) + 제목의 사람 → 팀원, 아니면 가장 긴 뚜렷한 낱말 → 배운 낱말. 아니 = 그 프로젝트에 dismissed 행.
 * 하루 물은 수를 센다(말풍선만 — 주간 점검 [하나씩]은 count false).
 */
export async function answerProjectQuestion(q: { taskId: string; tagId: string; title: string }, yes: boolean, opts: { count?: boolean } = {}): Promise<Undo> {
  if (opts.count !== false) noteAsked()
  if (!yes) return removeFromProject(q.taskId, q.tagId)
  const add = await addToProject([q.taskId], q.tagId)
  const db = await getDb()
  const persons = await db.getAll<{ id: string; name: string; aliases: string | null }>("SELECT id, name, aliases FROM tags WHERE kind = 'person'")
  const team = new Set((await db.getAll<{ to_id: string }>("SELECT to_id FROM relations WHERE from_type = 'tag' AND from_id = ? AND to_type = 'tag' AND field = 'project' AND COALESCE(state, 'accepted') = 'accepted'", [q.tagId])).map((r) => r.to_id))
  const who = personInTitle(q.title, persons)
  if (who && !team.has(who)) return both(add, await linkPersonToProject(q.tagId, who))
  const word = who ? null : hintWord(q.title)
  return word ? both(add, await learnHint(q.tagId, word)) : add
}
export const focusRelId = (projectTagId: string) => relationId(projectTagId, 'focus', 'focus')
/** 지금 집중(§12.13.7): 한 번에 하나 — 켜면 다른 집중 행은 지운다. null = 끄기 */
export async function setFocus(projectTagId: string | null): Promise<Undo> {
  const db = await getDb()
  const rows = await db.getAll<{ id: string }>("SELECT id FROM relations WHERE from_type = 'tag' AND to_type = 'focus'")
  const ids = [...new Set([...rows.map((r) => r.id), ...(projectTagId ? [focusRelId(projectTagId)] : [])])]
  const undo = await snapRows('relations', ids)
  await run(...rows.map((r) => remove('relations', r.id)),
    ...(projectTagId ? [insert('relations', { id: focusRelId(projectTagId), from_type: 'tag', from_id: projectTagId, to_type: 'focus', to_id: 'focus', source: 'manual', state: 'accepted', field: 'focus' })] : []))
  return undo
}
