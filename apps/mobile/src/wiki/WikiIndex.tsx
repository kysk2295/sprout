// 33 §11 모바일: 행 태그 알약·`[[링크]]` 글자가 쓰는 색인(태그·리스트·링크 관계)을 한 번에 읽어 나눠 준다 + 페이지로 이동.
// 행마다 쿼리하지 않도록 앱 뿌리(_layout)에 Provider 하나.
import { resolveLink, resolveSegments, type LinkTarget, type ResolvedSeg } from '@sprout/schema/wikiGraph'
import { useRouter } from 'expo-router'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { setTasksView } from '../state/tasksView'
import { TAG_META_SQL, type TagMeta } from './data'
import { useRows } from '../data/rows'

type Rel = { from_id: string; field: string | null; to_type: string; to_id: string; name: string | null }
type Index = { tags: Map<string, TagMeta>; tagList: TagMeta[]; lists: { id: string; name: string; kind: string | null }[]; rels: Map<string, Rel[]> }
const Ctx = createContext<Index | null>(null)

const REL_SQL = `SELECT r.from_id, r.field, r.to_type, r.to_id,
  CASE r.to_type WHEN 'tag' THEN (SELECT name FROM tags WHERE id = r.to_id) WHEN 'list' THEN (SELECT name FROM lists WHERE id = r.to_id)
    ELSE (SELECT title FROM tasks WHERE id = r.to_id) END AS name
  FROM relations r WHERE r.source = 'link' AND r.from_type = 'task' AND COALESCE(r.state,'accepted') = 'accepted'`

export function WikiIndexProvider({ children }: { children: ReactNode }) {
  // 39 §11: 결과가 같으면 같은 배열 → 색인(컨텍스트)이 그대로 → 할 일을 체크해도 모든 행이 다시 그려지지 않는다(REL_SQL은 tasks를 읽어 체크마다 다시 돈다)
  const tags = useRows<TagMeta>(TAG_META_SQL).data
  const lists = useRows<{ id: string; name: string; kind: string | null }>('SELECT id, name, kind FROM lists WHERE archived_at IS NULL').data
  const rows = useRows<Rel>(REL_SQL).data
  const value = useMemo<Index>(() => {
    const rels = new Map<string, Rel[]>()
    for (const r of rows) rels.set(r.from_id, [...(rels.get(r.from_id) ?? []), r])
    return { tags: new Map(tags.map((t) => [t.id, t])), tagList: tags, lists, rels }
  }, [tags, lists, rows])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useWikiIndex = () => useContext(Ctx)

/** 행 제목 조각(§6.6): 링크 이름 → 대상(id 기준, 이름이 바뀌었으면 남은 link 관계로) */
export function useLinkSegments(taskId: string, text: string, field: 'title' | 'content' = 'title'): ResolvedSeg[] | null {
  const idx = useWikiIndex()
  if (!idx || !text.includes('[[')) return null
  const rels = (idx.rels.get(taskId) ?? []).filter((r) => (r.field ?? 'title') === field)
  return resolveSegments(text, rels, (name) => resolveLink(name, idx.tagList, idx.lists))
}

/** 할 일 탭의 그 보기로(태그·리스트 페이지). 시트·다른 탭 어디서든 */
type Router = ReturnType<typeof useRouter>
let pendingFilter: { view: string; tag: string } | undefined
/** 태그 페이지 `리스트` 알약(§4.1): 그 리스트를 이 태그로 거른 채 연다 — 목록 화면이 보기를 바꿀 때 한 번 가져간다 */
export function takeTagFilter(view: string): string[] {
  const f = pendingFilter?.view === view ? [pendingFilter.tag] : []
  pendingFilter = undefined
  return f
}
/** fromTab = 다른 탭 안 쌓기(더보기 › 태그)에서 — 그 쌓기는 두고 할 일 탭으로 옮긴다. 아니면 시트·쌓인 화면을 닫고 할 일 탭으로 */
export function openView(router: Router, view: string, tagFilter?: string, fromTab = false) {
  pendingFilter = tagFilter ? { view, tag: tagFilter } : undefined
  setTasksView(view)
  if (!fromTab && router.canDismiss()) router.dismissTo('/')
  else router.navigate('/')
}
export function useOpenTarget() {
  const router = useRouter()
  return useCallback((t: LinkTarget) => {
    if (t.type === 'task') router.push(`/task/${t.id}`)
    else openView(router, `${t.type}:${t.id}`)
  }, [router])
}
