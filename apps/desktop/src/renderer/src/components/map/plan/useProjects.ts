// 31 §12.2~12.5 계획 화면이 읽는 것 — 프로젝트(태그 kind project) · 구성원 · 일의 종류 · 기간·마감 · 다음 · 옆 칸 · 제안 · ⚡ 지금 할 일.
// 계산은 @sprout/schema/projects(순수). 쿼리는 useQuery(로컬 DB 감시)라 태그·할 일이 바뀌면 바로 다시 그린다.
import { useMemo, useSyncExternalStore } from 'react'
import { parseAliases } from '@sprout/schema/wikiLink'
import { tagKey } from '@sprout/schema/autoTag'
import {
  blockedSet, findProjectClusters, nextSteps, projectDeadline, projectEmoji, projectMembers, projectSpan, projectTitle, taskDay, workKind,
  WORK_KINDS, type Proposal, type PTask, type WorkKind
} from '@sprout/schema/projects'
import { autoTagStore } from '../../../data/autoTag'
import { projectStore } from '../../../data/projects'
import { useQuery } from '../../../data/useQuery'
import { dayKey } from '../../../lib/dates'

export type PTaskRow = PTask & { status: number; priority: number | null; list_id: string | null }
type TagRow = { id: string; name: string; kind: string | null; aliases: string | null; source: string | null; home_type: string | null; home_id: string | null; topic_id: string | null }
type LinkRow = { id: string; task_id: string; tag_id: string; source: string | null; state: string | null }
type ListRow = { id: string; name: string; emoji: string | null; folder_id: string | null; kind: string | null }
type SeqRow = { id: string; from_id: string; to_id: string; kind: string; state: string }

export type ProjectView = {
  tag: TagRow
  title: string
  emoji: string
  /** ✦ 자동으로 묶었어요 */
  auto: boolean
  /** 별칭 중 짧은 낱말(말풍선 `공모전 관련 일`) */
  short: string
  members: PTaskRow[]
  done: number
  open: number
  kindOf: Map<string, WorkKind>
  kinds: [WorkKind, number][]
  span: { from: string; to: string } | null
  deadline: { day: string; word: string; taskId: string } | null
  next: PTaskRow[]
  lists: { id: string; name: string; emoji: string | null; count: number }[]
  people: { id: string; name: string; label: string }[]
  memos: { kind: 'topic' | 'note'; id: string; title: string }[]
  seq: SeqRow[]
  /** 다 끝났고 마감 7일 지남 */
  finished: boolean
  /** 빠진 거 없어 이후 그대로면 말풍선 숨김 */
  confirmed: boolean
}
export type TodayItem = { task: PTaskRow; why: 'today' | 'step'; project?: string }
export type PlanData = {
  loaded: boolean
  projects: ProjectView[]
  suggestion: Proposal | null
  /** ⚡ 지금 할 일(최대 3) · 오늘 관련 전체 수 · 기한 지난 열린 일 수 */
  today: TodayItem[]
  todayTotal: number
  overdue: number
  /** 같이 계획 짜기·＋ 더 넣기에서 쓰는 열린 할 일 */
  openTasks: PTaskRow[]
  byId: Map<string, PTaskRow>
  listName: (id: string | null) => string
}

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

  return useMemo<PlanData>(() => {
    const byId = new Map((tasks ?? []).map((t) => [t.id, t]))
    const listOf = new Map((lists ?? []).map((l) => [l.id, l]))
    const listName = (id: string | null) => { const l = id ? listOf.get(id) : undefined; return l ? (l.kind === 'inbox' ? '기본함' : l.name) : '' }
    const empty: PlanData = { loaded: false, projects: [], suggestion: null, today: [], todayTotal: 0, overdue: 0, openTasks: [], byId, listName }
    if (!tasks || !tags || !links || !lists || !folders || !seq) return empty
    const accepted = (l: LinkRow) => (l.state ?? 'accepted') === 'accepted'
    const tagById = new Map(tags.map((t) => [t.id, t]))
    const openIds = new Set(tasks.filter((t) => t.status === 0).map((t) => t.id))
    const blocked = blockedSet(seq, openIds)
    const projectOf = new Map<string, string>() // 할 일 → 첫 프로젝트 이름(⚡ 칩)

    const projects: ProjectView[] = []
    for (const tag of tags.filter((t) => t.kind === 'project')) {
      const ids = projectMembers(tag, tasks, links, lists)
      const members = [...ids].map((id) => byId.get(id)!).filter(Boolean)
      const title = projectTitle(tag.name)
      for (const m of members) if (!projectOf.has(m.id)) projectOf.set(m.id, title)
      const kindOf = new Map(members.map((m) => [m.id, workKind(m.title)]))
      const count = new Map<WorkKind, number>()
      for (const k of kindOf.values()) count.set(k, (count.get(k) ?? 0) + 1)
      const deadline = projectDeadline(members)
      const span = projectSpan(members, deadline?.day)
      const done = members.filter((m) => m.status !== 0).length
      const perList = new Map<string, number>()
      for (const m of members) if (m.list_id) perList.set(m.list_id, (perList.get(m.list_id) ?? 0) + 1)
      // 관련 사람: 구성원에 함께 붙은 사람 태그(종류별 수)
      const people = new Map<string, Map<WorkKind, number>>()
      for (const l of links) {
        if (!accepted(l) || !ids.has(l.task_id)) continue
        const g = tagById.get(l.tag_id)
        if (g?.kind !== 'person') continue
        const m = people.get(g.id) ?? new Map()
        const k = kindOf.get(l.task_id) ?? 'other'
        m.set(k, (m.get(k) ?? 0) + 1)
        people.set(g.id, m)
      }
      // 관련 메모: 태그의 위키 주제(topic_id 또는 같은 이름·별칭) + 그 태그로 이은 수집함 메모
      const names = new Set([tag.name, ...parseAliases(tag.aliases)].map(tagKey))
      const memos: ProjectView['memos'] = []
      for (const tp of topics ?? []) if (tp.id === tag.topic_id || names.has(tagKey(tp.name))) memos.push({ kind: 'topic', id: tp.id, title: tp.name })
      for (const n of notes ?? []) if (n.tag_id === tag.id) memos.push({ kind: 'note', id: n.id, title: (n.link_title || (n.content ?? '').split('\n')[0] || '메모').slice(0, 40) })
      const finished = members.length > 0 && done === members.length && (!span || span.to < addDays(today, -7))
      const aliases = parseAliases(tag.aliases)
      projects.push({
        tag, title, emoji: projectEmoji(tag.name), auto: tag.source === 'ai', short: [...aliases].sort((a, b) => a.length - b.length)[0] ?? title,
        members: members.sort((a, b) => (taskDay(a) ?? '9999').localeCompare(taskDay(b) ?? '9999')),
        done, open: members.length - done, kindOf,
        kinds: WORK_KINDS.map((k) => [k, count.get(k) ?? 0] as [WorkKind, number]).filter(([, n]) => n > 0),
        span, deadline,
        next: nextSteps(members, blocked, today),
        lists: [...perList].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, name: listName(id), emoji: listOf.get(id)?.emoji ?? null, count: n })),
        people: [...people].map(([id, m]) => ({ id, name: tagById.get(id)!.name, label: [...m].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${KIND_SHORT[k]} ${n}`).join(' · ') })),
        memos, seq: seq.filter((l) => ids.has(l.from_id) && ids.has(l.to_id)), finished,
        confirmed: pstore.confirmed[tag.id] !== undefined && pstore.confirmed[tag.id] >= members.length
      })
    }
    // 순서: 끝난 것 맨 뒤 → 마감 가까운 순 → 열린 일 많은 순
    projects.sort((a, b) => Number(a.finished) - Number(b.finished) || (a.deadline?.day ?? '9999').localeCompare(b.deadline?.day ?? '9999') || b.open - a.open)

    // 제안 카드: 한 장(할 일 많은 것)
    const blockedKeys = new Set([...Object.keys(astore.blocked), ...pstore.dismissed])
    const taken = new Set(projects.flatMap((p) => p.members.map((m) => m.id)))
    const { suggest } = findProjectClusters({ tags, lists, folders, tasks, links }, blockedKeys, taken)
    const suggestion = suggest.sort((a, b) => b.taskIds.length - a.taskIds.length)[0] ?? null

    // ⚡ 지금 할 일(§12.5): 오늘 마감·시작 + 지금 할 수 있는 계획 단계(순서 선이 있는 열린 일, 막히지 않음, 기한 안 지남). 기한 지난 일은 넣지 않는다
    const stepIds = new Set(seq.flatMap((l) => [l.from_id, l.to_id]))
    const day = (s: string | null | undefined) => s?.slice(0, 10) ?? null
    const open = tasks.filter((t) => t.status === 0)
    const todayItems: TodayItem[] = []
    for (const t of open) {
      const due = day(t.due_at), start = day(t.start_at)
      if (due && due < today) continue
      if (due === today || start === today) todayItems.push({ task: t, why: 'today', project: projectOf.get(t.id) })
      else if (stepIds.has(t.id) && !blocked.has(t.id)) todayItems.push({ task: t, why: 'step', project: projectOf.get(t.id) })
    }
    todayItems.sort((a, b) => (a.why === 'today' ? 0 : 1) - (b.why === 'today' ? 0 : 1) || (a.task.due_at ?? '9999').localeCompare(b.task.due_at ?? '9999') || (b.task.priority ?? 0) - (a.task.priority ?? 0))
    const overdue = open.filter((t) => { const d = day(t.due_at); return !!d && d < today }).length

    return { loaded: true, projects, suggestion, today: todayItems.slice(0, 3), todayTotal: todayItems.length, overdue, openTasks: open, byId, listName }
  }, [tasks, tags, links, lists, folders, seq, topics, notes, pstore, astore, today])
}

const KIND_SHORT: Record<WorkKind, string> = { research: '분석', meeting: '미팅', dev: '개발', admin: '제출', other: '일' }
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
