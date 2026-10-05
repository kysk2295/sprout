// 31 §12.2 프로젝트 보드(계획 첫 화면, 시안 ①·④) — 말풍선 · 프로젝트 카드 · 제안 카드 · 같이 계획 짜기 카드 · 빈 상태.
import { MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { daysBetween, taskDay, WORK_LABEL, type Proposal } from '@sprout/schema/projects'
import { createProjectFrom, dismissSuggestion, notProject } from '../../../data/projects'
import { planCandidates } from '../../../data/planActions'
import { openTarget } from '../../../data/wiki'
import { dayKey } from '../../../lib/dates'
import { MenuItem, Popover } from '../../Popover'
import { useToast } from '../../Toast'
import { BuddyAvatar, useBuddy } from '../PlanChat'
import type { PlanData, ProjectView } from './useProjects'

export type PlanOpen = (opts?: { taskId?: string; project?: { id: string; name: string }; makeProject?: boolean }) => void

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
export const dLabel = (day: string, today: string) => { const n = daysBetween(today, day); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}` }
/** `제출 10/10 (D-5)` · 없으면 null */
export function deadlineText(p: ProjectView, today: string) {
  if (!p.deadline) return null
  return { word: p.deadline.word, text: `${md(p.deadline.day)} (${dLabel(p.deadline.day, today)})`, late: p.deadline.day < today }
}

export function PlanBubble({ text, children, size = 34 }: { text: string; children?: React.ReactNode; size?: number }) {
  const { buddy, stage } = useBuddy()
  return (
    <div className="plan-bub" role="status">
      <BuddyAvatar buddy={buddy} stage={stage} size={size} />
      <div className="plan-bub__msg">{text}</div>
      {children && <div className="plan-bub__reps">{children}</div>}
    </div>
  )
}

export function ProjectBoard({ data, onOpen, onPlan }: { data: PlanData; onOpen: (tagId: string) => void; onPlan: PlanOpen }) {
  const toast = useToast()
  const today = dayKey()
  const live = data.projects.filter((p) => !p.finished)
  const done = data.projects.filter((p) => p.finished)
  const [showDone, setShowDone] = useState(false)
  const [menu, setMenu] = useState<{ p: ProjectView; point: { x: number; y: number } }>()
  const [busy, setBusy] = useState(false)

  if (!live.length && !done.length && !data.suggestion) return <PlanEmpty onPlan={onPlan} />

  const near = live.find((p) => p.deadline && p.deadline.day >= today)
  const head = `여기저기 흩어진 일을 프로젝트 ${live.length}개로 묶어 놨어.`
  const tail = near?.deadline ? ` ${near.title} ${near.deadline.word}${daysBetween(today, near.deadline.day) === 0 ? '이 오늘이야!' : `까지 ${daysBetween(today, near.deadline.day)}일 남았어!`}` : ''
  const make = async (s: Proposal) => {
    setBusy(true)
    try {
      const r = await createProjectFrom(s)
      toast.show(`'${s.name}' 프로젝트를 만들었어요`, r.undo)
    } finally { setBusy(false) }
  }
  const openMenu = (p: ProjectView, e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ p, point: { x: e.clientX, y: e.clientY } }) }

  return (
    <div className="plan-board">
      {live.length > 0 && <PlanBubble text={head + tail} />}
      <div className="plan-grid">
        {live.map((p) => <ProjectCard key={p.tag.id} p={p} today={today} onOpen={() => onOpen(p.tag.id)} onMenu={(e) => openMenu(p, e)} />)}
        {data.suggestion && (
          <div className="pc-card pc-card--sugg">
            <div className="pc-card__t">✦ 묶일 것 같은 일 {data.suggestion.taskIds.length}개</div>
            <div className="pc-card__meta">{suggestWhy(data.suggestion, data)}</div>
            <div className="pc-card__acts">
              <button className="map-btn map-btn--primary" disabled={busy} onClick={() => void make(data.suggestion!)}>📊 {data.suggestion.name} 프로젝트 만들기</button>
              <button className="map-btn" onClick={() => dismissSuggestion(data.suggestion!.key)}>아니</button>
            </div>
          </div>
        )}
        <button className="pc-card pc-card--new" onClick={() => onPlan({ makeProject: true })}>
          <Plus className="pc-card__plus" />
          <b>같이 계획 짜기</b>
          <span>새 큰 일을 말해 주면 프로젝트로 만들고 단계도 나눠 줄게</span>
        </button>
      </div>
      {done.length > 0 && (
        <div className="plan-done">
          <button className="map-btn map-btn--text" onClick={() => setShowDone((s) => !s)}>끝난 프로젝트 {done.length} {showDone ? '▾' : '›'}</button>
          {showDone && <div className="plan-grid">{done.map((p) => <ProjectCard key={p.tag.id} p={p} today={today} onOpen={() => onOpen(p.tag.id)} onMenu={(e) => openMenu(p, e)} />)}</div>}
        </div>
      )}
      {menu && (
        <Popover point={menu.point} onClose={() => setMenu(undefined)} className="menu" width={200}>
          <MenuItem label="열기" onClick={() => { setMenu(undefined); onOpen(menu.p.tag.id) }} />
          <MenuItem label="다음 단계 같이 짜기" onClick={() => { setMenu(undefined); onPlan({ project: { id: menu.p.tag.id, name: menu.p.title } }) }} />
          <MenuItem label="태그 페이지" onClick={() => { setMenu(undefined); openTarget({ view: `tag:${menu.p.tag.id}` }) }} />
          <div className="menu__divider" />
          <MenuItem label="프로젝트 아님" onClick={() => {
            const p = menu.p
            setMenu(undefined)
            void notProject(p.tag).then((undo) => toast.show(`'${p.title}'을 프로젝트에서 뺐어요. 태그는 그대로예요`, undo))
          }} />
        </Popover>
      )}
    </div>
  )
}

function suggestWhy(s: Proposal, data: PlanData) {
  if (s.reason === 'tag') return `#${s.name} 태그가 붙은 일 ${s.taskIds.length}개를 프로젝트로 볼까요?`
  const names = [...new Set(s.taskIds.map((id) => data.listName(data.byId.get(id)?.list_id ?? null)).filter(Boolean))]
  const where = names.length > 1 ? `${names.slice(0, 3).join('·')}${names.length > 3 ? ` 외 ${names.length - 3}곳` : ''}에 흩어져 있어요.` : `${names[0] ?? '한 곳'}에 모여 있어요.`
  return `“${s.word}” 들어간 일이 ${where}`
}

function ProjectCard({ p, today, onOpen, onMenu }: { p: ProjectView; today: string; onOpen: () => void; onMenu: (e: MouseEvent) => void }) {
  const dl = deadlineText(p, today)
  const span = p.span
  const ongoing = !!span && p.open > 0 && !p.deadline && span.to <= today
  const spanText = span ? `${md(span.from)} – ${ongoing ? '진행 중' : md(span.to)}` : '날짜 없음'
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }
  return (
    <div className={`pc-card${p.finished ? ' is-finished' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={key} onContextMenu={onMenu} aria-label={`${p.title} 프로젝트 열기`}>
      <div className="pc-card__top">
        <div className="pc-card__t"><span className="pc-card__emoji">{p.emoji}</span>{p.title}</div>
        {p.auto && <span className="plan-auto">✦ 자동으로 묶었어요</span>}
        <button className="icon-btn pc-card__more" aria-label="프로젝트 메뉴" onClick={onMenu}><MoreHorizontal /></button>
      </div>
      <div className="pc-card__meta">
        {p.members.length}개 · {spanText}{p.lists.length > 1 ? ` · 리스트 ${p.lists.length}곳에서 모음` : ''}
        {dl ? <> · {dl.word} <b className={dl.late ? 'is-late' : ''}>{dl.text}</b></> : p.open ? ' · 마감 없음' : ''}
      </div>
      {p.kinds.length > 0 && <div className="plan-kinds">{p.kinds.map(([k, n]) => <span key={k}>{WORK_LABEL[k]} {n}</span>)}</div>}
      <Spark p={p} today={today} />
      <div className="pc-card__next">
        {p.next.length
          ? <>⚡ <b>다음:</b> {p.next.map((t, i) => <span key={t.id}>{i > 0 && ' → '}{t.title}{t.due_at ? ` ${md(t.due_at.slice(0, 10))}` : ''}</span>)}</>
          : p.open ? <span className="is-dim">다음 할 일을 정해 볼까?</span> : <span className="is-dim">다 끝냈어요 🎉</span>}
      </div>
    </div>
  )
}

/** 미니 타임라인(22px): 기간 선 · ● 끝냄 ○ 남음 · 빨간 세로선 오늘 · 노랑 점선 마감 */
function Spark({ p, today }: { p: ProjectView; today: string }) {
  if (!p.span) return <div className="plan-spark is-empty" />
  const from = p.span.from
  const to = p.span.to > today || !p.open ? p.span.to : today
  const days = Math.max(1, daysBetween(from, to))
  const x = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(from, d) / days) * 100))}%`
  const dots = p.members.map((m) => ({ id: m.id, d: taskDay(m), done: m.status !== 0 })).filter((m) => m.d)
  return (
    <div className="plan-spark" aria-hidden="true">
      <i className="plan-spark__line" />
      {today >= from && today <= to && <i className="plan-spark__today" style={{ left: x(today) }} />}
      {p.deadline && <i className="plan-spark__dl" style={{ left: x(p.deadline.day) }} />}
      {dots.map((m) => <i key={m.id} className={`plan-spark__dot${m.done ? ' is-done' : ''}`} style={{ left: x(m.d!) }} />)}
    </div>
  )
}

/** 빈 상태(시안 ④) */
function PlanEmpty({ onPlan }: { onPlan: PlanOpen }) {
  const [cands, setCands] = useState<{ id: string; title: string }[]>([])
  useEffect(() => { let on = true; void planCandidates(dayKey(), 4).then((c) => { if (on) setCands(c) }).catch(() => {}); return () => { on = false } }, [])
  const { buddy, stage } = useBuddy()
  return (
    <div className="plan-empty">
      <BuddyAvatar buddy={buddy} stage={stage} size={110} />
      <h3>아직 묶인 프로젝트가 없어. 큰 일 하나만 말해 줘</h3>
      <p>관련된 일이 생기면 알아서 묶어 드려요. 지금 바로 시작하려면 눌러요.</p>
      {cands.length > 0 && <div className="plan-empty__chips">{cands.map((c) => <button key={c.id} onClick={() => onPlan({ taskId: c.id, makeProject: true })}>🎯 {c.title}</button>)}</div>}
      <button className="map-btn map-btn--primary plan-empty__go" onClick={() => onPlan({ makeProject: true })}>＋ 직접 말하기</button>
    </div>
  )
}
