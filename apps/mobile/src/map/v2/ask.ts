// 29 §9.8 · 31 §12.13.4~6 넣을지 묻기 — 후보 읽기 · 답 쓰기 · 하루 물은 수.
// 규칙·글은 데스크톱과 같은 공용 @sprout/schema/projectScore(projectCandidates · askItemsOf · answerPlan …), 행 모양도 데스크톱 data/projectEdit와 같다.
// 휴대폰은 여기서도 70↑ 자동 붙이기는 하지 않는다(그건 데스크톱 패스) — 묻는 범위(ask)만 쓴다.
import { answerPlan, askedOn, askItemsOf, bumpAsked, hintRelId, projectCandidates, projectPersonId, type AskItem, type AskedCount, type ScoreRel } from '@sprout/schema/projectScore'
import type { LinkRow, ListRow, PTaskRow, TagRow } from '@sprout/schema/planView'
import { deleteStmt } from '@sprout/schema/taskCore'
import { useMemo } from 'react'
import { db, run } from '../../data/db'
import { useLiveQuery } from '../../data/rows'
import { insert } from '../../data/tasks'
import { dayKey } from '../../lib/dates'
import { useKv, kvGet, kvSet } from './kv'
import { addToProject, removeFromProject } from './plan'

export type { AskItem } from '@sprout/schema/projectScore'
type Undo = () => Promise<void>

// 데스크톱 useProjectCandidates와 같은 다섯 쿼리
const TASKS_SQL = `SELECT id, title, list_id, parent_id, status, priority, due_at, start_at, completed_at, created_at FROM tasks
  WHERE deleted_at IS NULL AND title IS NOT NULL AND title != '' AND (status = 0 OR (status = 1 AND completed_at >= ?)) ORDER BY sort_order, created_at`
const TAGS_SQL = "SELECT id, name, kind, aliases, source, home_type, home_id, topic_id FROM tags WHERE name IS NOT NULL AND name != '' ORDER BY sort_order"
const LINKS_SQL = 'SELECT id, task_id, tag_id, source, state FROM task_tags'
const LISTS_SQL = 'SELECT id, name, emoji, folder_id, kind FROM lists WHERE archived_at IS NULL'
const SCORE_REL_SQL = "SELECT from_type, from_id, to_type, to_id, field, state FROM relations WHERE from_type = 'tag' AND field IN ('project', 'hint', 'focus') AND COALESCE(state, 'accepted') = 'accepted'"

/** 묻기 범위 후보 전부(점수 높은 순). 말풍선은 nextAsk(7일·하루 3개), 주간 점검 끝은 leftoverGroups(전부) */
export function useAskCandidates(): { loaded: boolean; ask: AskItem[] } {
  const cutoff = useMemo(() => new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10), [])
  const tasks = useLiveQuery<PTaskRow>(TASKS_SQL, [cutoff])
  const tags = useLiveQuery<TagRow>(TAGS_SQL)
  const links = useLiveQuery<LinkRow>(LINKS_SQL)
  const lists = useLiveQuery<ListRow>(LISTS_SQL)
  const rels = useLiveQuery<ScoreRel>(SCORE_REL_SQL)
  const today = dayKey()
  const loading = tasks.isLoading || tags.isLoading || links.isLoading || lists.isLoading || rels.isLoading
  return useMemo(() => {
    if (loading || !tasks.data || !tags.data || !links.data || !lists.data || !rels.data) return { loaded: false, ask: [] }
    const r = projectCandidates({ tags: tags.data, tasks: tasks.data, links: links.data, lists: lists.data, relations: rels.data, today })
    return { loaded: true, ask: askItemsOf(r, tasks.data) }
  }, [loading, tasks.data, tags.data, links.data, lists.data, rels.data, today])
}

// ── 하루 물은 수(기기 기억, 동기화 안 함 — 데스크톱 sprout.map.projects.v1 asked와 같은 모양) ──
const ASKED_KEY = 'sprout.map.ask.v1'
/** [오늘 답한 수, 불러왔나] — 불러오기 전엔 말풍선을 띄우지 않는다(상한을 넘겨 묻지 않게) */
export function useAskedToday(): [number, boolean] {
  const [a, , loaded] = useKv<AskedCount | null>(ASKED_KEY, null)
  return [askedOn(a, dayKey()), loaded]
}
export function noteAsked() { const day = dayKey(); kvSet(ASKED_KEY, bumpAsked(kvGet<AskedCount | null>(ASKED_KEY, null), day)) }

// ── 답 쓰기(§12.13.5) ──
const both = (...undos: Undo[]): Undo => async () => { for (const u of [...undos].reverse()) await u() }
type Rel = Record<string, unknown> & { id: string }
/** 행을 지우고 새로 쓰기 전 모습 → 되돌리기(없던 행이면 지움) */
async function putRelation(row: Rel): Promise<Undo> {
  const prev = await db.getAll<Rel>('SELECT * FROM relations WHERE id = ?', [row.id])
  await run([deleteStmt('relations', row.id), insert('relations', row)])
  return async () => { await run([deleteStmt('relations', row.id), ...prev.map(({ owner_id: _o, ...r }) => insert('relations', r))]) }
}
const linkPersonToProject = (projectTagId: string, personTagId: string) =>
  putRelation({ id: projectPersonId(projectTagId, personTagId), from_type: 'tag', from_id: projectTagId, to_type: 'tag', to_id: personTagId, source: 'manual', state: 'accepted', field: 'project' })
const learnHint = (projectTagId: string, word: string) =>
  putRelation({ id: hintRelId(projectTagId, word), from_type: 'tag', from_id: projectTagId, to_type: 'hint', to_id: word, source: 'manual', state: 'accepted', field: 'hint' })

/**
 * 물음 답(데스크톱 answerProjectQuestion과 같음). 응 = 넣기(user) + 제목의 사람 → 팀원, 아니면 가장 긴 뚜렷한 낱말 → 배운 낱말.
 * 아니 = 그 프로젝트에 dismissed 행. 하루 물은 수는 말풍선만 센다(주간 점검 [하나씩]은 count false).
 */
export async function answerProjectQuestion(q: { taskId: string; tagId: string; title: string }, yes: boolean, opts: { count?: boolean } = {}): Promise<Undo> {
  if (opts.count !== false) noteAsked()
  if (!yes) return removeFromProject(q.taskId, q.tagId)
  const add = await addToProject([q.taskId], q.tagId)
  const persons = await db.getAll<{ id: string; name: string; aliases: string | null }>("SELECT id, name, aliases FROM tags WHERE kind = 'person'")
  const team = new Set((await db.getAll<{ to_id: string }>("SELECT to_id FROM relations WHERE from_type = 'tag' AND from_id = ? AND to_type = 'tag' AND field = 'project' AND COALESCE(state, 'accepted') = 'accepted'", [q.tagId])).map((r) => r.to_id))
  const plan = answerPlan(q.title, true, persons, team)
  if (plan.add && plan.person) return both(add, await linkPersonToProject(q.tagId, plan.person))
  return plan.add && plan.hint ? both(add, await learnHint(q.tagId, plan.hint)) : add
}
export { addToProject }
