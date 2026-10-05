// 31 §12.10.4 빠른 추가 프로젝트 알약 줄 — 추가 줄 아래. 제목에 맞는 특정 프로젝트 먼저, 그다음 같은 분류의 최근 프로젝트(최대 4).
// 끝난 프로젝트(projectEnded: 보드의 끝남 · 다 끝남 · 마감 지남 · 보관)는 띄우지 않는다. 자동으로 고르지 않는다 — 한 번 누르면 고름, 다시 누르면 풂.
// 줄 끝 ✕(또는 Esc — AddBar) = 이 입력 동안 줄 숨김. 추가할 때 고른 프로젝트에 user로 넣는다(TaskListView AddBar).
import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { projectEnded } from '@sprout/schema/planView'
import { dayKey } from '../../../lib/dates'
import { rankProjectChips, type ChipProject } from '../../../lib/projectEdit'
import { usePlanData } from './useProjects'
import './chips.css'

export function ProjectChips({ title, picked, onToggle, onDismiss, onVisible }: {
  title: string
  picked: string[]
  onToggle: (id: string) => void
  /** ✕ = 이 입력 동안 줄 숨김 */
  onDismiss: () => void
  /** 줄이 보이는지(Esc가 먼저 줄을 닫게) */
  onVisible?: (on: boolean) => void
}) {
  const plan = usePlanData()
  const today = dayKey()
  const projects = useMemo<ChipProject[]>(() => plan.projects.filter((p) => !projectEnded(p, today) && !(p.auto && !p.members.length)).map((p) => ({ // 빈 자동 프로젝트도 뺀다
    id: p.tag.id, name: p.tag.name, aliases: p.tag.aliases, category: p.category,
    last: p.members.map((m) => m.due_at ?? m.start_at ?? m.created_at ?? '').filter(Boolean).sort().pop() ?? null
  })), [plan.projects, today])
  const chips = useMemo(() => rankProjectChips(title, projects, today), [title, projects, today])
  const shown = [...chips, ...projects.filter((p) => picked.includes(p.id) && !chips.includes(p))]
  const on = shown.length > 0
  useEffect(() => { onVisible?.(on) }, [on, onVisible])
  useEffect(() => () => onVisible?.(false), [onVisible])
  if (!on) return null
  return (
    <div className="addbar__projects" role="group" aria-label="프로젝트">
      <span>프로젝트</span>
      {shown.map((p) => (
        <button key={p.id} className={picked.includes(p.id) ? 'is-on' : ''} aria-pressed={picked.includes(p.id)} title={picked.includes(p.id) ? '다시 누르면 빼요' : '눌러서 이 프로젝트에 넣기'} onMouseDown={(e) => e.preventDefault()} onClick={() => onToggle(p.id)}>{p.name}</button>
      ))}
      <button className="addbar__projects-x" aria-label="프로젝트 제안 닫기" title="닫기 (Esc)" onMouseDown={(e) => e.preventDefault()} onClick={onDismiss}><X /></button>
    </div>
  )
}
