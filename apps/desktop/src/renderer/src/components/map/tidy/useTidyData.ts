// 정리 모드(31 §12 정리)가 읽는 것: 열린 할 일 · 리스트(폴더 포함) · 폴더 · 태그 · 태그 연결 · 프로젝트 할 일 제목(낱말 비교) + 30 리스트 제안(기기).
import { useMemo } from 'react'
import { useQuery } from '../../../data/useQuery'
import { chipFor } from '../../../data/listSuggest'
import { useSuggestState } from '../../listSuggest/ListSuggest'
import { dayKey } from '../../../lib/dates'
import {
  buildBuckets, buildPiles, membersOf, projectTargets, suggestProjects, tidyNo,
  type TidyFolder, type TidyLink, type TidyList, type TidyTag, type TidyTask
} from '../../../data/tidy'

const TASKS_SQL = `SELECT t.id, t.title, t.list_id, t.parent_id, t.due_at, t.start_at, t.is_all_day, t.created_at
  FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
  WHERE t.deleted_at IS NULL AND t.status = 0 AND t.title IS NOT NULL AND t.title != '' AND l.archived_at IS NULL
  ORDER BY t.created_at`
const LISTS_SQL = 'SELECT id, name, emoji, folder_id, kind, sort_order, archived_at FROM lists ORDER BY sort_order'
const FOLDERS_SQL = 'SELECT id, name, sort_order FROM folders ORDER BY sort_order'
const TAGS_SQL = "SELECT id, name, kind, aliases, home_type, home_id, sort_order FROM tags WHERE name IS NOT NULL AND name != '' ORDER BY sort_order"
const LINKS_SQL = `SELECT tt.id, tt.task_id, tt.tag_id, tt.state FROM task_tags tt JOIN tasks t ON t.id = tt.task_id
  WHERE t.deleted_at IS NULL AND t.status = 0`
const EXAMPLES_SQL = `SELECT tt.tag_id, t.title FROM task_tags tt JOIN tasks t ON t.id = tt.task_id JOIN tags g ON g.id = tt.tag_id
  WHERE g.kind = 'project' AND COALESCE(tt.state, 'accepted') = 'accepted' AND t.deleted_at IS NULL AND t.title != ''
  ORDER BY t.created_at DESC`

export function useTidyData(noVersion: number) {
  const today = dayKey()
  const tasks = useQuery<TidyTask>(TASKS_SQL)
  const lists = useQuery<TidyList>(LISTS_SQL)
  const folders = useQuery<TidyFolder>(FOLDERS_SQL)
  const tags = useQuery<TidyTag>(TAGS_SQL)
  const links = useQuery<TidyLink>(LINKS_SQL)
  const exampleRows = useQuery<{ tag_id: string; title: string }>(EXAMPLES_SQL)
  const suggest = useSuggestState()
  const loaded = !!(tasks && lists && folders && tags && links && exampleRows)

  return useMemo(() => {
    const T = tasks ?? [], L = lists ?? [], F = folders ?? [], G = tags ?? [], K = links ?? []
    const inbox = L.find((l) => l.kind === 'inbox') ?? null
    const examples: Record<string, string[]> = {}
    for (const r of exampleRows ?? []) (examples[r.tag_id] ??= []).push(r.title)
    const top = T.filter((t) => !t.parent_id)
    const openByList = new Map<string, number>()
    for (const t of top) if (t.list_id) openByList.set(t.list_id, (openByList.get(t.list_id) ?? 0) + 1)
    const members = membersOf(G, T, K, L)
    const projects = suggestProjects(T, G, K, L, examples, tidyNo.get(), F)
    const piles = buildPiles({ tasks: T, links: K, inboxId: inbox?.id ?? null, today, projects })
    const buckets = buildBuckets(F, L, openByList)
    const targets = projectTargets(G, members)
    const liveLists = new Set(L.filter((l) => l.kind !== 'inbox' && !l.archived_at).map((l) => l.id))
    const listOf = (id: string) => chipFor(suggest, id, L)?.id ?? null
    const byList = new Map(L.map((l) => [l.id, l]))
    const byFolder = new Map(F.map((f) => [f.id, f]))
    const byTag = new Map(G.map((g) => [g.id, g]))
    const tagsOf = new Map<string, string[]>()
    for (const k of K) if ((k.state ?? 'accepted') === 'accepted') tagsOf.set(k.task_id, [...(tagsOf.get(k.task_id) ?? []), k.tag_id])
    return { loaded, today, inbox, piles, buckets, targets, projects, liveLists, listOf, byList, byFolder, byTag, tagsOf, suggest }
    // noVersion: "아니"로 기기 기억이 바뀌면 다시 계산
  }, [loaded, tasks, lists, folders, tags, links, exampleRows, suggest, today, noVersion])
}
export type TidyData = ReturnType<typeof useTidyData>
