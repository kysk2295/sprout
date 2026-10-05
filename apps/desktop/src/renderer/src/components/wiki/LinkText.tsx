import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useQuery } from '../../data/useQuery'
import { ensureTags } from '../../data/organization'
import { openLink, syncLinks } from '../../data/wiki'
import { resolveLink } from '../../lib/addParse'
import { resolveSegments } from '../../lib/wikiGraph'
import './wiki.css'

// 33 §6.6 행 제목 속 `[[링크]]`: 괄호 없이 강조색 글자, 호버 = 밑줄, 누르면 그 페이지. 없는 링크 = 회색 점선 밑줄 → 누르면 태그 만들기.
type Rel = { from_id: string; field: string | null; to_type: string; to_id: string; name: string | null; list_id: string | null }
type Named = { id: string; name: string; aliases?: string | null; kind?: string | null; emoji?: string | null }
type Index = { rels: Map<string, Rel[]>; tags: Named[]; lists: Named[] }
const Ctx = createContext<Index | null>(null)

const REL_SQL = `SELECT r.from_id, r.field, r.to_type, r.to_id,
  CASE r.to_type WHEN 'tag' THEN (SELECT name FROM tags WHERE id = r.to_id) WHEN 'list' THEN (SELECT name FROM lists WHERE id = r.to_id)
    ELSE (SELECT title FROM tasks WHERE id = r.to_id) END AS name,
  CASE r.to_type WHEN 'task' THEN (SELECT list_id FROM tasks WHERE id = r.to_id) END AS list_id
  FROM relations r WHERE r.source = 'link' AND r.from_type = 'task' AND COALESCE(r.state,'accepted') = 'accepted'`

/** 목록 화면 하나가 링크 대상(id 기준 이름)을 한 번에 읽어 행에 나눠 준다 */
export function LinkIndexProvider({ tags, lists, children }: { tags: Named[]; lists: Named[]; children: ReactNode }) {
  const rows = useQuery<Rel>(REL_SQL)
  const metas = useQuery<Named>('SELECT id, name, aliases FROM tags')
  const value = useMemo(() => {
    const rels = new Map<string, Rel[]>()
    for (const r of rows ?? []) rels.set(r.from_id, [...(rels.get(r.from_id) ?? []), r])
    return { rels, tags: metas ?? tags, lists }
  }, [rows, metas, tags, lists])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function LinkText({ taskId, text, field = 'title' }: { taskId: string; text: string; field?: 'title' | 'content' }) {
  const idx = useContext(Ctx)
  if (!text.includes('[[') || !idx) return <>{text}</>
  const rels = (idx.rels.get(taskId) ?? []).filter((r) => (r.field ?? 'title') === field)
  const segs = resolveSegments(text, rels, (name) => resolveLink(name, idx.tags, idx.lists))
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <>
      {segs.map((s, i) => {
        if (!s.link) return <span key={i}>{s.text}</span>
        if (s.missing) {
          return (
            <span key={i} className="wiki-link is-missing" title={`'${s.text}' 태그 만들기`} role="link" tabIndex={-1}
              onPointerDown={stop} onClick={(e) => { stop(e); void ensureTags([s.text]) }}>{s.text}</span>
          )
        }
        const t = s.target!
        const listId = t.type === 'task' ? rels.find((r) => r.to_id === t.id)?.list_id : undefined
        return (
          <span key={i} className="wiki-link" role="link" tabIndex={-1} title={t.type === 'tag' ? `#${t.name} 태그 페이지` : t.type === 'list' ? `${t.name} 리스트` : t.name}
            onPointerDown={stop} onClick={(e) => { stop(e); openLink(t.type, t.id, listId) }}>{s.text}</span>
        )
      })}
    </>
  )
}

/** 앱이 뒤에서 `[[ ]]` 글과 관계를 맞춘다(§6.4) — 할 일·리스트·태그가 바뀌면 0.5초 뒤 한 번 */
export function useLinkSync() {
  const stamp = useQuery<{ a: string | null; b: string | null; c: string | null; n: number }>(
    'SELECT (SELECT max(modified_at) FROM tasks) AS a, (SELECT max(modified_at) FROM tags) AS b, (SELECT max(modified_at) FROM lists) AS c, (SELECT count(*) FROM relations) AS n'
  )?.[0]
  const key = stamp ? `${stamp.a}|${stamp.b}|${stamp.c}|${stamp.n}` : ''
  const busy = useRef(false)
  useEffect(() => {
    if (!key) return
    const timer = window.setTimeout(() => {
      if (busy.current) return
      busy.current = true
      void syncLinks().catch((e) => console.error('[links]', e)).finally(() => { busy.current = false })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [key])
}
