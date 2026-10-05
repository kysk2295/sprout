// 29 §9.4 정리(기본함 정리 · 밀린 일) — 읽기와 DB 동작. 계산은 공용 @sprout/schema/tidy(데스크톱 분류 책상과 같은 코드).
// 휴대폰은 AI를 부르지 않는다: 기본함 → 리스트 제안 = 공용 낱말 검사(keywordPick, 30 §B.3 (가)), 프로젝트 제안 = 31 T.3(suggestProjects).
import { useQuery } from '@powersync/react-native'
import { keywordPick } from '@sprout/schema/keywords'
import { projectMembers } from '@sprout/schema/projects'
import { planCompleteNoXp } from '@sprout/schema/taskCore'
import {
  buildBuckets, buildPiles, proposalsFor, suggestProjects, TIDY_TABS,
  type Bucket, type Proposal, type TidyFolder, type TidyLink, type TidyList, type TidyTab, type TidyTag, type TidyTask
} from '@sprout/schema/tidy'
import { useMemo } from 'react'
import { coreDb, db, run } from '../../data/db'
import { moveDates, moveToList, trashTasks, update } from '../../data/tasks'
import { dayKey } from '../../lib/dates'
import { useKv, kvGet, kvSet } from './kv'
import { addToProject } from './plan'

type Undo = () => Promise<void>
const TASKS_SQL = `SELECT t.id, t.title, t.list_id, t.parent_id, t.due_at, t.start_at, t.is_all_day, t.created_at FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
  WHERE t.deleted_at IS NULL AND t.status = 0 AND t.title IS NOT NULL AND t.title != '' AND l.archived_at IS NULL ORDER BY t.sort_order, t.created_at`
const LINKS_SQL = 'SELECT id, task_id, tag_id, state FROM task_tags'
const TAGS_SQL = "SELECT id, name, kind, aliases, home_type, home_id, sort_order FROM tags WHERE name IS NOT NULL AND name != '' ORDER BY sort_order"
const LISTS_SQL = 'SELECT id, name, emoji, folder_id, kind, sort_order, archived_at FROM lists ORDER BY sort_order'
const FOLDERS_SQL = 'SELECT id, name, sort_order FROM folders ORDER BY sort_order'
// 리스트별 최근 할 일 제목(완료 포함, 8개) — 낱말 검사 예시
const RECENT_SQL = `SELECT list_id, title FROM (SELECT t.list_id, t.title, ROW_NUMBER() OVER (PARTITION BY t.list_id ORDER BY t.created_at DESC) AS n
  FROM tasks t WHERE t.deleted_at IS NULL AND t.title != '' AND t.list_id IS NOT NULL) WHERE n <= 8`

export const NO_KEY = 'sprout.map.tidy.no'
export const NO_LIST_KEY = 'sprout.map.tidy.noList'

export type TidyData = {
  loaded: boolean
  today: string
  piles: Record<TidyTab, TidyTask[]>
  buckets: Bucket[]
  projects: { tag: TidyTag; count: number }[]
  proposals: Record<TidyTab, Proposal[]>
  lists: TidyList[]
  place: (t: TidyTask) => string
  listOf: Map<string, TidyList>
  tagOf: Map<string, TidyTag>
}

export function useTidyData(): TidyData {
  const today = dayKey()
  const tasksQ = useQuery<TidyTask>(TASKS_SQL)
  const links = useQuery<TidyLink>(LINKS_SQL).data
  const tags = useQuery<TidyTag>(TAGS_SQL).data
  const lists = useQuery<TidyList>(LISTS_SQL).data
  const folders = useQuery<TidyFolder>(FOLDERS_SQL).data
  const recent = useQuery<{ list_id: string; title: string }>(RECENT_SQL).data
  const [no] = useKv<Record<string, string>>(NO_KEY, {})
  const [noList] = useKv<Record<string, string>>(NO_LIST_KEY, {})
  const tasks = tasksQ.data
  return useMemo(() => {
    const listOf = new Map(lists.map((l) => [l.id, l]))
    const folderOf = new Map(folders.map((f) => [f.id, f]))
    const tagOf = new Map(tags.map((t) => [t.id, t]))
    const inbox = lists.find((l) => l.kind === 'inbox') ?? null
    const live = lists.filter((l) => l.kind !== 'inbox' && !l.archived_at)
    const liveIds = new Set(live.map((l) => l.id))
    // 프로젝트 예시 = 구성원 제목(낱말 비교)
    const examples: Record<string, string[]> = {}
    for (const t of tags.filter((x) => x.kind === 'project')) {
      const m = projectMembers(t, tasks, links.map((l, i) => ({ id: l.id ?? `l${i}`, ...l })), lists)
      examples[t.id] = tasks.filter((x) => m.has(x.id)).map((x) => x.title).slice(0, 30)
    }
    const projMap = suggestProjects(tasks, tags, links, lists, examples, no, folders)
    const piles = buildPiles({ tasks, links, inboxId: inbox?.id ?? null, today, projects: projMap })
    const recentBy: Record<string, string[]> = {}
    for (const r of recent) (recentBy[r.list_id] ??= []).push(r.title)
    const pickable = live.map((l) => ({ id: l.id, name: l.name }))
    const listSug = new Map<string, string>()
    for (const t of piles.inbox) {
      const id = keywordPick(t.title, pickable, recentBy)
      if (id && noList[t.id] !== id) listSug.set(t.id, id)
    }
    const proposals = Object.fromEntries(TIDY_TABS.map((tab) => [tab, proposalsFor(tab, piles[tab], (id) => listSug.get(id) ?? null, projMap, liveIds)])) as Record<TidyTab, Proposal[]>
    const openByList = new Map<string, number>()
    for (const t of tasks) if (!t.parent_id && t.list_id) openByList.set(t.list_id, (openByList.get(t.list_id) ?? 0) + 1)
    const members = new Map(tags.filter((t) => t.kind === 'project').map((t) => [t.id, projectMembers(t, tasks, links.map((l, i) => ({ id: l.id ?? `l${i}`, ...l })), lists).size]))
    const place = (t: TidyTask) => {
      const l = t.list_id ? listOf.get(t.list_id) : undefined
      if (!l) return ''
      if (l.kind === 'inbox') return '기본함'
      const f = l.folder_id ? folderOf.get(l.folder_id) : undefined
      return `${f ? `${f.name} › ` : ''}${l.emoji ? `${l.emoji} ` : ''}${l.name}`
    }
    return {
      loaded: !tasksQ.isLoading, today, piles, buckets: buildBuckets(folders, lists, openByList),
      projects: tags.filter((t) => t.kind === 'project').map((tag) => ({ tag, count: members.get(tag.id) ?? 0 })).sort((a, b) => b.count - a.count),
      proposals, lists, place, listOf, tagOf
    }
  }, [tasks, links, tags, lists, folders, recent, no, noList, today, tasksQ.isLoading])
}

/** `아니` — 다시 제안하지 않는다(기기) */
export function sayNo(pr: Proposal) {
  const key = pr.to.kind === 'list' ? NO_LIST_KEY : NO_KEY
  kvSet(key, { ...kvGet<Record<string, string>>(key, {}), [pr.taskId]: pr.to.id })
}

/** 넣기: 리스트 = 옮김(하위 함께), 프로젝트 = 태그만 */
export async function putInto(ids: string[], to: { kind: 'list' | 'project'; id: string }): Promise<Undo> {
  return to.kind === 'list' ? moveToList(ids, to.id) : addToProject(ids, to.id)
}
/** 제안 여러 개 한 번에, 되돌리기는 한 번에(거꾸로) */
export async function applyProposals(ps: Proposal[]): Promise<{ lists: number; projects: number; undo: Undo }> {
  const groups = new Map<string, Proposal[]>()
  for (const x of ps) { const k = `${x.to.kind}:${x.to.id}`; groups.set(k, [...(groups.get(k) ?? []), x]) }
  const undos: Undo[] = []
  let lists = 0, projects = 0
  for (const g of groups.values()) {
    undos.push(await putInto(g.map((x) => x.taskId), g[0].to))
    if (g[0].to.kind === 'list') lists += g.length; else projects += g.length
  }
  return { lists, projects, undo: async () => { for (const u of undos.reverse()) await u() } }
}

/** 기한 지난 일 한꺼번에(19 정리 동작): 오늘로 · 다음 주로(시각 유지) · 완료(XP 없음, 하위 함께) · 지우기 */
export async function lateAction(ids: string[], kind: 'today' | 'next' | 'done' | 'trash', date?: string): Promise<Undo> {
  if (kind === 'trash') return trashTasks(ids)
  if (kind !== 'done') return moveDates(ids, date!)
  const marks = ids.map(() => '?').join(',')
  const plan = await planCompleteNoXp(coreDb, ids, { today: dayKey(), now: () => new Date().toISOString() })
  const all = [...new Set([...ids, ...plan.open, ...plan.repeating])]
  const snap = await db.getAll<Record<string, unknown> & { id: string }>(`SELECT id, status, due_at, start_at, is_all_day, repeat_rule, repeat_from, completed_at, deleted_at FROM tasks WHERE id IN (${all.map(() => '?').join(',') || marks})`, all)
  await run(plan.stmts)
  return async () => { await run(snap.map(({ id, ...rest }) => update('tasks', id, rest))) }
}
