// 31 §12 계획 모드 v2 — ⚡ 지금 할 일(§12.5) + 프로젝트 보드(§12.2) ⇄ 관계 타임라인(§12.3).
// 열면 자동 프로젝트 패스(§12.1)를 한 번 부른다(마지막 실행 60초 안이면 건너뜀).
import { Check, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { runProjectPass } from '../../../data/projects'
import { checkboxColor } from '../../../lib/priority'
import type { TaskActions } from '../../../lib/taskActions'
import { ProjectBoard, type PlanOpen } from './ProjectBoard'
import { ProjectTimeline } from './ProjectTimeline'
import { usePlanData, type PlanData } from './useProjects'
import './plan.css'

export function PlanHome({ selected, onSelect, onPlan, onTidy, actions, focusProject }: {
  selected: string | null
  onSelect: (id: string) => void
  onPlan: PlanOpen
  onTidy: () => void
  actions: TaskActions
  /** 같이 계획 짜기가 만든·고른 프로젝트를 바로 연다 */
  focusProject?: { id: string; n: number } | null
}) {
  const data = usePlanData()
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { void runProjectPass().catch((e) => console.warn('[project] 보류', e)) }, [])
  useEffect(() => { if (focusProject) setOpen(focusProject.id) }, [focusProject])
  const back = useCallback(() => setOpen(null), [])
  const p = open ? data.projects.find((x) => x.tag.id === open) : undefined
  // 보던 프로젝트가 없어지면(프로젝트 아님) 보드로 — 막 만든 프로젝트는 쿼리에 아직 없을 수 있어 한 번 본 뒤에만
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (p) seen.current = p.tag.id
    else if (open && data.loaded && seen.current === open) { seen.current = null; setOpen(null) }
  }, [open, data.loaded, p])

  return (
    <div className="plan">
      <TodayStrip data={data} actions={actions} selected={selected} onSelect={onSelect} onTidy={onTidy} />
      <div className="plan__body">
        {!data.loaded ? null : p
          ? <ProjectTimeline p={p} data={data} selected={selected} onBack={back} onSelect={onSelect} onPlan={onPlan} />
          : <ProjectBoard data={data} onOpen={setOpen} onPlan={onPlan} />}
      </div>
    </div>
  )
}

/** ⚡ 지금 할 일(§12.5): 최대 3개, 오늘 것만. 기한 지난 일은 `정리에서 →` */
function TodayStrip({ data, actions, selected, onSelect, onTidy }: { data: PlanData; actions: TaskActions; selected: string | null; onSelect: (id: string) => void; onTidy: () => void }) {
  const [checking, setChecking] = useState<Set<string>>(new Set())
  if (!data.loaded || (!data.todayTotal && !data.overdue)) return null
  const complete = (id: string) => {
    setChecking((s) => new Set(s).add(id))
    window.setTimeout(() => { void actions.complete([id]).finally(() => setChecking((s) => { const n = new Set(s); n.delete(id); return n })) }, 400)
  }
  return (
    <div className="plan-now" role="region" aria-label="지금 할 일">
      <span className="plan-now__h"><Zap />지금 할 일 <em>{data.todayTotal}</em></span>
      {data.today.map(({ task, why, project }) => {
        const on = checking.has(task.id)
        return (
          <div key={task.id} className={`plan-now__chip${selected === task.id ? ' is-selected' : ''}${on ? ' is-leaving' : ''}`} role="button" tabIndex={0}
            onClick={() => onSelect(task.id)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(task.id) }} title={task.title}>
            <button className={`checkbox${on ? ' is-checked' : ''}`} style={{ ['--checkbox-color' as string]: checkboxColor(task.priority ?? 0) }} aria-label="완료"
              onClick={(e) => { e.stopPropagation(); if (!on) complete(task.id) }}>{on && <Check strokeWidth={3} />}</button>
            <span className="plan-now__t">{task.title}</span>
            {project ? <small>{project}</small> : why === 'today' ? <small className="is-today">오늘</small> : null}
          </div>
        )
      })}
      {!data.todayTotal && <span className="plan-now__none">오늘 할 일은 다 정리됐어요</span>}
      {data.overdue > 0 && <button className="plan-now__more" onClick={onTidy}>기한 지난 일 <b>{data.overdue}</b>개는 정리에서 볼게요 →</button>}
    </div>
  )
}
