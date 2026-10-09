// 31 §12.2~12.5 계획 화면이 읽는 것 — 프로젝트(태그 kind project) · 구성원 · 일의 종류 · 기간·마감 · 다음 · 옆 칸 · 제안 · ⚡ 지금 할 일.
// 계산은 공용 @sprout/schema/planView(모바일과 같은 코드). 쿼리는 useQuery(로컬 DB 감시)라 태그·할 일이 바뀌면 바로 다시 그린다.
import { useMemo, useSyncExternalStore } from 'react'
import { buildPlanView, type LinkRow, type ListRow, type PlanData, type PTaskRow, type SeqRow, type TagRow } from '@sprout/schema/planView'
import { askItemsOf, projectCandidates, type AskItem, type ScoreRel } from '@sprout/schema/projectScore'
import { autoTagStore } from '../../../data/autoTag'
import { projectStore } from '../../../data/projects'
import { useQuery } from '../../../data/useQuery'
import { dayKey } from '../../../lib/dates'

export type { PTaskRow, ProjectView, TodayItem, PlanData } from '@sprout/schema/planView'
const TASKS_SQL = `SELECT id, title, list_id, parent_id, status, priority, due_at, start_at, completed_at, created_at FROM tasks
  WHERE deleted_at IS NULL AND title IS NOT NULL AND title != '' AND (status = 0 OR (status = 1 AND completed_at >= ?)) ORDER BY sort_order, created_at`
const TAGS_SQL = 'SELECT id, name, kind, aliases, source, home_type, home_id, topic_id FROM tags WHERE name IS NOT NULL AND name != \'\' ORDER BY sort_order'
const LINKS_SQL = 'SELECT id, task_id, tag_id, source, state FROM task_tags'
const LISTS_SQL = 'SELECT id, name, emoji, folder_id, kind FROM lists WHERE archived_at IS NULL'
const FOLDERS_SQL = 'SELECT id, name FROM folders'
const SEQ_SQL = "SELECT id, from_id, to_id, kind, state FROM map_links WHERE kind = 'sequence' AND state = 'accepted'"
const TOPICS_SQL = 'SELECT id, name FROM wiki_topics'
// 31 §12.10 사람이 고른 분류
const CATS_SQL = "SELECT from_id AS tag_id, to_id AS word FROM relations WHERE from_type = 'tag' AND to_type = 'category' AND COALESCE(state, 'accepted') = 'accepted'"
// 31 §12.9.2 사람이 정한 일의 종류
const KINDS_SQL = "SELECT from_id AS task_id, to_id AS kind FROM relations WHERE from_type = 'task' AND to_type = 'work_kind' AND COALESCE(state, 'accepted') = 'accepted'"
// 31 §12.13 팀원(tag→tag project) · 배운 낱말(tag→hint) · 지금 집중(tag→focus)
const SCORE_REL_SQL = "SELECT from_type, from_id, to_type, to_id, field, state FROM relations WHERE from_type = 'tag' AND field IN ('project', 'hint', 'focus') AND COALESCE(state, 'accepted') = 'accepted'"
const NOTES_SQL = `SELECT r.to_id AS tag_id, n.id, n.content, n.link_title FROM relations r JOIN notes n ON n.id = r.from_id
  WHERE r.from_type = 'note' AND r.to_type = 'tag' AND COALESCE(r.state, 'accepted') = 'accepted'`
// 41 §9 ⚑ 핵심 날짜(tag → task deadline) · 만든 줄(tag → tag lane) · 프로젝트 설정(view_settings project:*) · 팀원(tag → tag project) — 모두 동기화 표
const DEADLINES_SQL = "SELECT from_id AS tag_id, to_id AS task_id FROM relations WHERE from_type = 'tag' AND to_type = 'task' AND field = 'deadline' AND COALESCE(state, 'accepted') = 'accepted'"
const LANES_SQL = "SELECT from_id AS project_id, to_id AS tag_id, created_at FROM relations WHERE from_type = 'tag' AND to_type = 'tag' AND field = 'lane' AND COALESCE(state, 'accepted') = 'accepted'"
const SETTINGS_SQL = "SELECT view_key, options_json FROM view_settings WHERE view_key LIKE 'project:%' ORDER BY modified_at"
const TEAM_SQL = `SELECT r.from_id AS project_id, r.to_id AS tag_id, g.name FROM relations r JOIN tags g ON g.id = r.to_id
  WHERE r.from_type = 'tag' AND r.to_type = 'tag' AND r.field = 'project' AND COALESCE(r.state, 'accepted') = 'accepted' ORDER BY r.created_at`

const useStore = <T,>(s: { get: () => T; subscribe: (f: () => void) => () => void }) => useSyncExternalStore(s.subscribe, s.get)
const cutoffDay = () => new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10)

export function usePlanData(): PlanData {
  const cutoff = useMemo(cutoffDay, [])
  const tasks = useQuery<PTaskRow>(TASKS_SQL, [cutoff])
  const tags = useQuery<TagRow>(TAGS_SQL)
  const links = useQuery<LinkRow>(LINKS_SQL)
  const lists = useQuery<ListRow>(LISTS_SQL)
  const folders = useQuery<{ id: string; name: string }>(FOLDERS_SQL)
  const seq = useQuery<SeqRow>(SEQ_SQL)
  const topics = useQuery<{ id: string; name: string }>(TOPICS_SQL)
  const notes = useQuery<{ tag_id: string; id: string; content: string | null; link_title: string | null }>(NOTES_SQL)
  const kinds = useQuery<{ task_id: string; kind: string }>(KINDS_SQL)
  const cats = useQuery<{ tag_id: string; word: string }>(CATS_SQL)
  const rels = useQuery<ScoreRel>(SCORE_REL_SQL)
  const focus = rels?.find((r) => r.to_type === 'focus')?.from_id ?? null
  const deadlines = useQuery<{ tag_id: string; task_id: string }>(DEADLINES_SQL)
  const lanes = useQuery<{ project_id: string; tag_id: string; created_at: string | null }>(LANES_SQL)
  const settings = useQuery<{ view_key: string | null; options_json: string | null }>(SETTINGS_SQL)
  const team = useQuery<{ project_id: string; tag_id: string; name: string }>(TEAM_SQL)
  const pstore = useStore(projectStore)
  const astore = useStore(autoTagStore)
  const today = dayKey()

  return useMemo<PlanData>(() => buildPlanView({ tasks: deadlines && lanes && settings && team ? tasks : undefined, tags, links, lists, folders, seq, topics, notes, pstore, blocked: astore.blocked, today, kindOverrides: kinds, categoryOverrides: cats, skip: pstore.skip, suggest: pstore.auto !== false, focus, deadlines, lanes, settings, team }), [tasks, tags, links, lists, folders, seq, topics, notes, kinds, cats, pstore, astore, today, focus, deadlines, lanes, settings, team])
}


// ── 31 §12.9.5 관계도가 더 읽는 것(그 프로젝트) ──
const PERSON_SQL = `SELECT tt.task_id, tt.tag_id, g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
  WHERE g.kind = 'person' AND COALESCE(tt.state, 'accepted') = 'accepted'`
const PPEOPLE_SQL = `SELECT r.from_id AS project_id, r.to_id AS tag_id, g.name FROM relations r JOIN tags g ON g.id = r.to_id
  WHERE r.from_type = 'tag' AND r.to_type = 'tag' AND r.field = 'project' AND COALESCE(r.state, 'accepted') = 'accepted'`
const RNOTES_SQL = `SELECT n.id, n.content, n.link_title, r.to_type, r.to_id FROM relations r JOIN notes n ON n.id = r.from_id
  WHERE r.from_type = 'note' AND r.to_type IN ('tag', 'task') AND COALESCE(r.state, 'accepted') = 'accepted'`
const RELATED_SQL = "SELECT id, from_id, to_id FROM relations WHERE from_type = 'task' AND to_type = 'task' AND field = 'related' AND COALESCE(state, 'accepted') = 'accepted'"
export type RelRows = {
  personLinks: { task_id: string; tag_id: string; name: string }[]
  projectPeople: { project_id: string; tag_id: string; name: string }[]
  notes: { id: string; title: string; to_type: 'tag' | 'task'; to_id: string }[]
  related: { id: string; from_id: string; to_id: string }[]
  persons: { id: string; name: string }[]
}
export function useRelationRows(): RelRows | null {
  const personLinks = useQuery<{ task_id: string; tag_id: string; name: string }>(PERSON_SQL)
  const projectPeople = useQuery<{ project_id: string; tag_id: string; name: string }>(PPEOPLE_SQL)
  const notes = useQuery<{ id: string; content: string | null; link_title: string | null; to_type: 'tag' | 'task'; to_id: string }>(RNOTES_SQL)
  const related = useQuery<{ id: string; from_id: string; to_id: string }>(RELATED_SQL)
  const persons = useQuery<{ id: string; name: string }>("SELECT id, name FROM tags WHERE kind = 'person' ORDER BY name")
  return useMemo(() => (!personLinks || !projectPeople || !notes || !related || !persons) ? null : {
    personLinks, projectPeople, related, persons,
    notes: notes.map((n) => ({ id: n.id, to_type: n.to_type, to_id: n.to_id, title: (n.link_title || (n.content ?? '').split('\n')[0] || '메모').slice(0, 40) }))
  }, [personLinks, projectPeople, notes, related, persons])
}

// ── 31 §12.13.4·12.13.6 넣을지 물을 할 일(점수 40~69) ──
export type { AskItem } from '@sprout/schema/projectScore'
/** 묻기 범위 후보 전부(점수 높은 순). 말풍선은 fresh·하루 상한으로 거르고, 주간 점검은 전부 */
export function useProjectCandidates(): { loaded: boolean; ask: AskItem[] } {
  const cutoff = useMemo(cutoffDay, [])
  const tasks = useQuery<PTaskRow>(TASKS_SQL, [cutoff])
  const tags = useQuery<TagRow>(TAGS_SQL)
  const links = useQuery<LinkRow>(LINKS_SQL)
  const lists = useQuery<ListRow>(LISTS_SQL)
  const rels = useQuery<ScoreRel>(SCORE_REL_SQL)
  const today = dayKey()
  return useMemo(() => {
    if (!tasks || !tags || !links || !lists || !rels) return { loaded: false, ask: [] }
    const r = projectCandidates({ tags, tasks, links, lists, relations: rels, today })
    return { loaded: true, ask: askItemsOf(r, tasks) }
  }, [tasks, tags, links, lists, rels, today])
}
/** 말풍선용: 최근 7일 안에 만든 할 일만(공용) */
export { freshAsk } from '@sprout/schema/projectScore'
