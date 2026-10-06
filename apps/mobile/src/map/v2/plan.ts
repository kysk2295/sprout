// 29 §9.2 계획 — 읽기(useQuery → 공용 buildPlanView) · 프로젝트 손질(✕ 빼기 · ＋ 더 넣기 · 빠진 거 없어 · 같이 짠 큰 일 → 프로젝트).
// 휴대폰은 자동 프로젝트 패스를 돌리지 않는다(29 §9.1): 데스크톱이 만든 프로젝트 태그를 보여 주기만. 구성원 계산만 공용 함수로 같이 한다.
import { useQuery } from '@powersync/react-native'
import { autoTagRowId, findSynonym, type AtTag } from '@sprout/schema/autoTag'
import { buildPlanView, type LinkRow, type ListRow, type PlanData, type ProjectTaskInput, type PTaskRow, type SeqRow, type TagRow } from '@sprout/schema/planView'
import { relationId } from '@sprout/schema/wikiLink'
import { PROJECT } from '@sprout/schema/projects'
import { deleteStmt, type Stmt } from '@sprout/schema/taskCore'
import { useMemo } from 'react'
import { db, run } from '../../data/db'
import { createTask, deleteForever, insert, update } from '../../data/tasks'
import { dayKey } from '../../lib/dates'
import { kvGet, kvSet, useKv } from './kv'

export type { PlanData, ProjectView, PTaskRow, TodayItem } from '@sprout/schema/planView'
type Undo = () => Promise<void>

const TASKS_SQL = `SELECT id, title, list_id, parent_id, status, priority, due_at, start_at, completed_at, created_at FROM tasks
  WHERE deleted_at IS NULL AND title IS NOT NULL AND title != '' AND (status = 0 OR (status = 1 AND completed_at >= ?)) ORDER BY sort_order, created_at`
const TAGS_SQL = "SELECT id, name, kind, aliases, source, home_type, home_id, topic_id FROM tags WHERE name IS NOT NULL AND name != '' ORDER BY sort_order"
const LINKS_SQL = 'SELECT id, task_id, tag_id, source, state FROM task_tags'
const LISTS_SQL = 'SELECT id, name, emoji, folder_id, kind FROM lists WHERE archived_at IS NULL'
const FOLDERS_SQL = 'SELECT id, name FROM folders'
const SEQ_SQL = "SELECT id, from_id, to_id, kind, state FROM map_links WHERE kind = 'sequence' AND state = 'accepted'"
const TOPICS_SQL = 'SELECT id, name FROM wiki_topics'
const KINDS_SQL = "SELECT from_id AS task_id, to_id AS kind FROM relations WHERE from_type = 'task' AND to_type = 'work_kind' AND COALESCE(state, 'accepted') = 'accepted'"
// 31 §12.13.7 지금 집중(relations tag → focus) — 데스크톱과 같은 행
const FOCUS_SQL = "SELECT from_id FROM relations WHERE from_type = 'tag' AND to_type = 'focus' AND COALESCE(state, 'accepted') = 'accepted'"
const NOTES_SQL = `SELECT r.to_id AS tag_id, n.id, n.content, n.link_title FROM relations r JOIN notes n ON n.id = r.from_id
  WHERE r.from_type = 'note' AND r.to_type = 'tag' AND COALESCE(r.state, 'accepted') = 'accepted'`

export type ProjectStore = { dismissed: string[]; confirmed: Record<string, number> }
export const PROJECTS_KEY = 'sprout.map.projects.v1'
const EMPTY_STORE: ProjectStore = { dismissed: [], confirmed: {} }

export function usePlanData(): PlanData {
  const today = dayKey()
  const cutoff = useMemo(() => new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10), [])
  const tasks = useQuery<PTaskRow>(TASKS_SQL, [cutoff])
  const tags = useQuery<TagRow>(TAGS_SQL)
  const links = useQuery<LinkRow>(LINKS_SQL)
  const lists = useQuery<ListRow>(LISTS_SQL)
  const folders = useQuery<{ id: string; name: string }>(FOLDERS_SQL)
  const seq = useQuery<SeqRow>(SEQ_SQL)
  const topics = useQuery<{ id: string; name: string }>(TOPICS_SQL)
  const notes = useQuery<{ tag_id: string; id: string; content: string | null; link_title: string | null }>(NOTES_SQL)
  const kinds = useQuery<{ task_id: string; kind: string }>(KINDS_SQL)
  const focusQ = useQuery<{ from_id: string }>(FOCUS_SQL)
  const focus = focusQ.data?.[0]?.from_id ?? null
  const [pstore] = useKv<ProjectStore>(PROJECTS_KEY, EMPTY_STORE)
  const loading = tasks.isLoading || tags.isLoading || links.isLoading || lists.isLoading || folders.isLoading || seq.isLoading
  return useMemo(() => buildPlanView({
    tasks: loading ? null : tasks.data, tags: tags.data, links: links.data, lists: lists.data, folders: folders.data, seq: seq.data,
    topics: topics.data, notes: notes.data, pstore: { ...EMPTY_STORE, ...pstore }, today, suggest: false, kindOverrides: kinds.data, focus
  }), [loading, tasks.data, tags.data, links.data, lists.data, folders.data, seq.data, topics.data, notes.data, kinds.data, pstore, today, focus])
}

/** `빠진 거 없어` — 그때 구성원 수(늘면 말풍선이 다시) */
export function confirmProject(tagId: string, count: number) {
  const s = { ...EMPTY_STORE, ...kvGet<ProjectStore>(PROJECTS_KEY, EMPTY_STORE) }
  kvSet(PROJECTS_KEY, { ...s, confirmed: { ...s.confirmed, [tagId]: count } })
}

/** 프로젝트에서 빼기(31 §12.9.2 · §12.12.2, 데스크톱과 같음): 연결만 끊는다 — 태그 행은 (사람이 넣은 것도) dismissed로 남겨
 * 자동 패스가 다시 붙이지 않게 하고, 집·하위로 들어온 할 일은 dismissed 행 하나. 할 일은 리스트에 그대로 */
export async function removeFromProject(taskId: string, tagId: string): Promise<Undo> {
  const rows = await db.getAll<{ id: string; state: string | null }>('SELECT id, state FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, tagId])
  if (rows.length) {
    await run(rows.map((r) => update('task_tags', r.id, { state: 'dismissed' })))
    return async () => { await run(rows.map((r) => update('task_tags', r.id, { state: r.state }))) }
  }
  const id = autoTagRowId(taskId, tagId)
  await run([insert('task_tags', { id, task_id: taskId, tag_id: tagId, source: 'rule', state: 'dismissed', confidence: null, run_id: null })])
  return async () => { await run([deleteStmt('task_tags', id)]) }
}

/** 31 §12.12.1 프로젝트 안 새 할 일(공용 projectTaskInput 결과): 리스트(없으면 기본함) · 시각이 있으면 정시 알림 · 반복 · #태그 ·
 * 프로젝트 태그 user · 줄(묶음) 종류가 제목 분류와 다르면 일의 종류 덮어쓰기. 되돌리기 = 만든 것 지움 */
export async function addProjectTask(input: ProjectTaskInput, projectTagId: string): Promise<{ id: string; undo: Undo }> {
  const timed = !!input.due_at?.includes('T')
  const id = await createTask({
    title: input.title, list_id: input.list_id ?? '', due_at: input.due_at, priority: input.priority, repeat_rule: input.repeat_rule,
    tag_ids: input.tag_ids.filter((t) => t !== projectTagId), reminders: timed ? ['-PT0M'] : []
  })
  await addToProject([id], projectTagId)
  const kindId = relationId(id, 'work_kind', 'work_kind')
  if (input.kind) await run([insert('relations', { id: kindId, from_type: 'task', from_id: id, to_type: 'work_kind', to_id: input.kind, source: 'manual', state: 'accepted', field: 'work_kind' })])
  return { id, undo: async () => { if (input.kind) await run([deleteStmt('relations', kindId)]); await deleteForever([id]) } }
}

/** `＋ 더 넣기` · 같이 계획 짜기: 사람이 넣음(source user). 뗀 행이 있으면 다시 켠다 */
export async function addToProject(taskIds: string[], tagId: string): Promise<Undo> {
  if (!taskIds.length) return async () => {}
  const marks = taskIds.map(() => '?').join(',')
  const rows = await db.getAll<{ id: string; task_id: string; source: string | null; state: string | null }>(`SELECT id, task_id, source, state FROM task_tags WHERE tag_id = ? AND task_id IN (${marks})`, [tagId, ...taskIds])
  const stmts: Stmt[] = []
  const made: string[] = []
  const prev: { id: string; source: string | null; state: string | null }[] = []
  for (const taskId of taskIds) {
    const r = rows.find((x) => x.task_id === taskId)
    if (r) { prev.push(r); stmts.push(update('task_tags', r.id, { source: 'user', state: 'accepted' })) }
    else { const id = autoTagRowId(taskId, tagId); made.push(id); stmts.push(insert('task_tags', { id, task_id: taskId, tag_id: tagId, source: 'user', state: 'accepted', confidence: null, run_id: null })) }
  }
  await run(stmts)
  return async () => { await run([...made.map((id) => deleteStmt('task_tags', id)), ...prev.map((p) => update('task_tags', p.id, { source: p.source, state: p.state }))]) }
}

/** 보드 `＋ 같이 계획 짜기`(31 §12.4 makeProject): 큰 일 이름으로 프로젝트 태그(source user, 20자, 같은 뜻 태그면 그것) + 그 일에 붙임 */
export async function ensureProjectForGoal(goal: { id: string; title: string }): Promise<string> {
  const tags = await db.getAll<AtTag>("SELECT id, name, kind, aliases, source FROM tags WHERE name IS NOT NULL AND name != ''")
  const name = [...goal.title.trim()].slice(0, PROJECT.nameMax).join('').trim() || '새 프로젝트'
  const syn = findSynonym(name, tags)
  let tagId: string
  if (syn) {
    tagId = syn.tag.id
    if (syn.tag.kind !== 'project') await run([update('tags', tagId, { kind: 'project' })])
  } else {
    tagId = crypto.randomUUID()
    await run([insert('tags', { id: tagId, name, color: null, parent_id: null, sort_order: Date.now(), pinned: 0, kind: 'project', aliases: null, source: 'user', run_id: null, home_type: null, home_id: null })])
  }
  await addToProject([goal.id], tagId)
  return tagId
}

/** 프로젝트 안 같이 계획 짜기 ① 답 칩: 그 프로젝트의 열린 최상위 할 일(마감 가까운 순) */
export function projectCandidates(p: { members: PTaskRow[] }, n = 3) {
  return p.members.filter((m) => m.status === 0 && !m.parent_id)
    .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
    .slice(0, n).map((m) => ({ id: m.id, title: m.title }))
}
