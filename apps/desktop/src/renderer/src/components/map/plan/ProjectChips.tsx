// 31 §12.10.4 빠른 추가 프로젝트 알약 줄 — 추가 줄 아래. 제목에 맞는 특정 프로젝트 먼저, 그다음 같은 분류의 최근 프로젝트(최대 4).
// 끝난 프로젝트(projectEnded: 보드의 끝남 · 다 끝남 · 마감 지남 · 보관)는 띄우지 않는다. 자동으로 고르지 않는다 — 한 번 누르면 고름, 다시 누르면 풂.
// 줄 끝 ✕(또는 Esc — AddBar) = 이 입력 동안 줄 숨김. 추가할 때 고른 프로젝트에 user로 넣는다(TaskListView AddBar).
// §12.13.7 지금 집중: 줄 맨 앞에 미리 붙은 `🚀 이름 ✕` 칩(누르면 이 할 일에서만 뗌·다시 누르면 붙임). 다른 곳이 분명하면(focusApplies) 안 붙인다.
// 붙어 있는지는 onFocus(id | null)로 알린다 — 줄이 닫히면(언마운트) null.
import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { projectEnded } from '@sprout/schema/planView'
import { focusApplies } from '@sprout/schema/projectScore'
import { dayKey } from '../../../lib/dates'
import { rankProjectChips, type ChipProject } from '../../../lib/projectEdit'
import { usePlanData } from './useProjects'
import './chips.css'

export function ProjectChips({ title, picked, onToggle, onDismiss, onVisible, query, focusOff = false, onFocusToggle, onFocus, onlyFocus = false }: {
  title: string
  picked: string[]
  onToggle: (id: string) => void
  /** ✕ = 이 입력 동안 줄 숨김 */
  onDismiss: () => void
  /** 줄이 보이는지(Esc가 먼저 줄을 닫게) */
  onVisible?: (on: boolean) => void
  /** 인식 결과(집중 칩을 붙일지 — #태그·~리스트) */
  query?: { title: string; tag_ids?: string[]; list_id?: string | null }
  /** 이 할 일에서 집중 칩을 뗐나 */
  focusOff?: boolean
  onFocusToggle?: () => void
  /** 집중 칩이 붙어 있으면 그 프로젝트 id(뗐거나 안 붙으면 null) */
  onFocus?: (id: string | null) => void
  /** 빠른 추가 창: 집중 칩만 */
  onlyFocus?: boolean
}) {
  const plan = usePlanData()
  const today = dayKey()
  const projects = useMemo<ChipProject[]>(() => plan.projects.filter((p) => !projectEnded(p, today) && !(p.auto && !p.members.length)).map((p) => ({ // 빈 자동 프로젝트도 뺀다
    id: p.tag.id, name: p.tag.name, aliases: p.tag.aliases, category: p.category,
    last: p.members.map((m) => m.due_at ?? m.start_at ?? m.created_at ?? '').filter(Boolean).sort().pop() ?? null
  })), [plan.projects, today])
  // §12.13.7 지금 집중
  const q = query ?? { title }
  const qKey = `${q.title}|${(q.tag_ids ?? []).join(',')}|${q.list_id ?? ''}`
  const focus = useMemo(() => {
    const f = plan.projects.find((p) => p.focus)
    if (!f) return null
    const lists = [...new Set([...f.lists.map((l) => l.id), ...(f.mainList ? [f.mainList] : []), ...(f.tag.home_type === 'list' && f.tag.home_id ? [f.tag.home_id] : [])])]
    const others = plan.projects.map((p) => ({ id: p.tag.id, name: p.tag.name, aliases: p.tag.aliases, ended: projectEnded(p, today) }))
    return focusApplies({ id: f.tag.id, name: f.title, ended: projectEnded(f, today), lists }, q, others) ? { id: f.tag.id, name: f.title } : null
  }, [plan.projects, today, qKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const focusOn = !!focus && !focusOff
  useEffect(() => { onFocus?.(focusOn ? focus!.id : null) }, [focusOn, focus?.id, onFocus]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onFocus?.(null), [onFocus])
  const chips = useMemo(() => (onlyFocus ? [] : rankProjectChips(title, projects, today)), [title, projects, today, onlyFocus])
  const shown = [...chips, ...(onlyFocus ? [] : projects.filter((p) => picked.includes(p.id) && !chips.includes(p)))].filter((p) => p.id !== focus?.id)
  const on = shown.length > 0 || !!focus
  useEffect(() => { onVisible?.(on) }, [on, onVisible])
  useEffect(() => () => onVisible?.(false), [onVisible])
  if (!on) return null
  return (
    <div className="addbar__projects" role="group" aria-label="프로젝트">
      <span>프로젝트</span>
      {focus && (
        <button className={`addbar__focus${focusOn ? ' is-on' : ''}`} aria-pressed={focusOn} title={focusOn ? '지금 집중 중인 프로젝트 — 누르면 이 할 일에서 빼요' : '다시 누르면 넣어요'}
          onMouseDown={(e) => e.preventDefault()} onClick={onFocusToggle}>
          🚀 {focus.name}{focusOn && <X aria-label="빼기" />}
        </button>
      )}
      {shown.map((p) => (
        <button key={p.id} className={picked.includes(p.id) ? 'is-on' : ''} aria-pressed={picked.includes(p.id)} title={picked.includes(p.id) ? '다시 누르면 빼요' : '눌러서 이 프로젝트에 넣기'} onMouseDown={(e) => e.preventDefault()} onClick={() => onToggle(p.id)}>{p.name}</button>
      ))}
      {!onlyFocus && <button className="addbar__projects-x" aria-label="프로젝트 제안 닫기" title="닫기 (Esc)" onMouseDown={(e) => e.preventDefault()} onClick={onDismiss}><X /></button>}
    </div>
  )
}
