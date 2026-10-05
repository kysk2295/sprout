// 31 §12.10.4 빠른 추가 프로젝트 알약 줄 — 추가 줄 아래. 제목에 맞는 특정 프로젝트 먼저, 그다음 같은 분류의 최근 프로젝트(최대 4).
// 한 번 누르면 고름(다시 누르면 풂). 추가할 때 고른 프로젝트에 user로 넣는다(TaskListView AddBar).
import { useMemo } from 'react'
import { categoryOf } from '@sprout/schema/projects'
import { useQuery } from '../../../data/useQuery'
import { dayKey } from '../../../lib/dates'
import { rankProjectChips, type ChipProject } from '../../../lib/projectEdit'
import './chips.css'

const SQL = `SELECT g.id, g.name, g.aliases,
  (SELECT r.to_id FROM relations r WHERE r.from_type = 'tag' AND r.from_id = g.id AND r.to_type = 'category' LIMIT 1) AS cat,
  (SELECT max(COALESCE(t.due_at, t.start_at, t.created_at)) FROM task_tags x JOIN tasks t ON t.id = x.task_id
    WHERE x.tag_id = g.id AND COALESCE(x.state, 'accepted') = 'accepted' AND t.deleted_at IS NULL) AS last
  FROM tags g WHERE g.kind = 'project'`

export function ProjectChips({ title, picked, onToggle }: { title: string; picked: string[]; onToggle: (id: string) => void }) {
  const rows = useQuery<{ id: string; name: string; aliases: string | null; cat: string | null; last: string | null }>(SQL)
  const projects = useMemo<ChipProject[]>(() => (rows ?? []).map((r) => ({ id: r.id, name: r.name, aliases: r.aliases, last: r.last, category: r.cat !== null ? r.cat || null : categoryOf(r.name) })), [rows])
  const chips = useMemo(() => rankProjectChips(title, projects, dayKey()), [title, projects])
  const shown = [...chips, ...projects.filter((p) => picked.includes(p.id) && !chips.includes(p))]
  if (!shown.length) return null
  return (
    <div className="addbar__projects" role="group" aria-label="프로젝트">
      <span>프로젝트</span>
      {shown.map((p) => (
        <button key={p.id} className={picked.includes(p.id) ? 'is-on' : ''} aria-pressed={picked.includes(p.id)} onMouseDown={(e) => e.preventDefault()} onClick={() => onToggle(p.id)}>{p.name}</button>
      ))}
    </div>
  )
}
