// 31 §12.2~12.5 계획 화면이 읽는 것 — 프로젝트(태그 kind project) · 구성원 · 일의 종류 · 기간·마감 · 다음 · 옆 칸 · 제안 · ⚡ 지금 할 일.
// 계산은 공용 @sprout/schema/planView(모바일과 같은 코드). 쿼리는 useQuery(로컬 DB 감시)라 태그·할 일이 바뀌면 바로 다시 그린다.
import { useMemo, useSyncExternalStore } from 'react'
import { buildPlanView, type LinkRow, type ListRow, type PlanData, type PTaskRow, type SeqRow, type TagRow } from '@sprout/schema/planView'
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
const NOTES_SQL = `SELECT r.to_id AS tag_id, n.id, n.content, n.link_title FROM relations r JOIN notes n ON n.id = r.from_id
  WHERE r.from_type = 'note' AND r.to_type = 'tag' AND COALESCE(r.state, 'accepted') = 'accepted'`

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
  const pstore = useStore(projectStore)
  const astore = useStore(autoTagStore)
  const today = dayKey()

  return useMemo<PlanData>(() => buildPlanView({ tasks, tags, links, lists, folders, seq, topics, notes, pstore, blocked: astore.blocked, today }), [tasks, tags, links, lists, folders, seq, topics, notes, pstore, astore, today])
}

