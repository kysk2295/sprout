// 31 §12.11 단계 보드(시안 ③ "다음 단계 같이 짜기") — 프로젝트의 주 단계 줄을 큰 카드 → 화살표로.
// 끝낸 단계 = ✓ n · 제목 · `9/11 끝`(옅게, 취소선 없음) · 지금 단계 = 강조 테두리 `⚡ n · 지금` + `시작하기` · 다음 단계 = n · 제목 · 날짜(마감 단계 ⚑) · 점선 `＋ 단계 추가`.
// 편집: 카드 끌기 = 순서(순서 선 다시 잇기) · 더블클릭 = 이름 · 우클릭 = 할 일로 열기·날짜·단계에서 빼기·다른 프로젝트로·삭제 ·
//       할 일 넣기·⚡ 칩·아래 "단계 아닌 할 일" 행을 끌어 놓으면 끝 단계로. 대화 칸(PlanChat)이 만든 단계도 같은 데이터라 바로 보인다.
import { Check, Plus } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { taskDay } from '@sprout/schema/projects'
import { appendStep, dropStep, reorderSteps } from '../../../data/projectEdit'
import { dayKey } from '../../../lib/dates'
import { mainSteps, moveStep } from '../../../lib/projectEdit'
import type { TaskActions } from '../../../lib/taskActions'
import { MenuItem, Popover, SubMenu } from '../../Popover'
import { useToast } from '../../Toast'
import { TASK_DND } from './ProjectBoard'
import type { ProjectEdit } from './edit'
import type { PlanData, ProjectView, PTaskRow } from './useProjects'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const HINT_KEY = 'sprout.map.steps.hint'
const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === '1' } catch { return false } }
const STEP_DND = 'application/x-sprout-step'
/** `10/7 · 1시간` — 시각 범위가 있으면 길이 */
function when(t: PTaskRow) {
  const d = taskDay(t)
  if (!d) return ''
  if (t.start_at?.includes('T') && t.due_at?.includes('T')) {
    const m = Math.round((Date.parse(t.due_at) - Date.parse(t.start_at)) / 60000)
    if (m > 0) return `${md(d)} · ${m >= 60 ? `${Math.round(m / 6) / 10}시간`.replace('.0', '') : `${m}분`}`
  }
  return md(d)
}

export function StepBoard({ p, data, edit, actions, selected, onSelect }: {
  p: ProjectView; data: PlanData; edit: ProjectEdit; actions: TaskActions; selected: string | null; onSelect: (id: string | null) => void
}) {
  const toast = useToast()
  const today = dayKey()
  const s = useMemo(() => mainSteps(p), [p])
  const [hint, setHint] = useState(!hintSeen())
  const used = () => { if (hint) { setHint(false); try { localStorage.setItem(HINT_KEY, '1') } catch { /* */ } } }
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState<{ t: PTaskRow; i: number; point: { x: number; y: number } }>()
  const done = s.steps.filter((x) => x.status !== 0).length
  const total = s.steps.length
  const pct = total ? Math.round((done / total) * 100) : 0
  const last = s.steps[s.steps.length - 1] ?? null
  const dlId = p.deadline?.taskId
  const goalDay = s.goal ? taskDay(s.goal) : p.deadline?.day ?? null

  const reorder = async (from: number, to: number) => {
    if (from === to || from + 1 === to) return
    const order = moveStep(s.steps.map((x) => x.id), from, to > from ? to - 1 : to)
    used()
    toast.show('단계 순서를 바꿨어요', await reorderSteps(s.links.map((l) => l.id).filter(Boolean), order))
  }
  const append = async (id: string) => {
    if (s.steps.some((x) => x.id === id)) return
    const inside = p.members.some((m) => m.id === id)
    if (!inside) await edit.add([id])
    used()
    toast.show('단계로 넣었어요', await appendStep(last?.id ?? null, id))
  }
  const onBoardOver = (e: DragEvent) => { if (e.dataTransfer.types.includes(TASK_DND) || e.dataTransfer.types.includes(STEP_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }
  const onBoardDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DND)
    const from = e.dataTransfer.getData(STEP_DND)
    setDropAt(null); setDragFrom(null)
    if (from !== '') { e.preventDefault(); void reorder(Number(from), dropAt ?? total); return }
    if (id) { e.preventDefault(); void append(id) }
  }
  const create = async (title: string) => {
    setAdding(false)
    const id = await edit.create(title, null, null, s.goal?.id ?? null)
    if (id) { used(); await appendStep(last?.id ?? null, id) }
  }

  const card = (t: PTaskRow, i: number) => {
    const isDone = t.status !== 0
    const cur = s.current === t.id
    const late = !isDone && !!t.due_at && t.due_at.slice(0, 10) < today
    const cls = ['st-card', isDone ? 'is-done' : '', cur ? 'is-cur' : '', selected === t.id ? 'is-selected' : '', dragFrom === i ? 'is-dragging' : ''].filter(Boolean).join(' ')
    return (
      <div key={t.id} className="st-slot" onDragOver={(e) => { onBoardOver(e); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1) }}>
        {dropAt === i && dragFrom !== null && <i className="st-drop" aria-hidden="true" />}
        <div className={cls} role="button" tabIndex={0} draggable={renaming !== t.id} data-tid={t.id}
          onDragStart={(e) => { e.dataTransfer.setData(STEP_DND, String(i)); e.dataTransfer.setData(TASK_DND, t.id); e.dataTransfer.effectAllowed = 'move'; setDragFrom(i) }}
          onDragEnd={() => { setDragFrom(null); setDropAt(null) }}
          onClick={() => onSelect(t.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelect(t.id) }}
          onDoubleClick={() => { used(); setRenaming(t.id) }}
          onContextMenu={(e: MouseEvent) => { e.preventDefault(); used(); setMenu({ t, i, point: { x: e.clientX, y: e.clientY } }) }}>
          <span className="st-n">
            <button className={`st-ck${isDone ? ' is-on' : ''}`} aria-label={isDone ? '완료 취소' : '완료'} onClick={(e) => { e.stopPropagation(); void edit.complete(t) }}>{isDone && <Check strokeWidth={3} />}</button>
            {cur ? `${i + 1} · 지금` : `${i + 1}`}
          </span>
          {renaming === t.id ? (
            <input className="st-in" autoFocus defaultValue={t.title} aria-label="이름 고치기" onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { void edit.rename(t, e.currentTarget.value); setRenaming(null) } else if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null) } }}
              onBlur={(e) => { void edit.rename(t, e.currentTarget.value); setRenaming(null) }} />
          ) : <span className="st-t">{t.title}</span>}
          <span className={`st-m${late ? ' is-late' : ''}`}>
            {isDone ? (t.completed_at ? `${md(t.completed_at.slice(0, 10))} 끝` : '끝') : when(t) || '날짜 없음'}{!isDone && dlId === t.id ? ' ⚑' : ''}
          </span>
          {cur && <button className="map-btn map-btn--primary st-go" onClick={(e) => { e.stopPropagation(); void start(t) }}>시작하기</button>}
        </div>
        {i < total - 1 && <span className="st-arr" aria-hidden="true">→</span>}
      </div>
    )
  }
  /** 시작하기(§12.11): 날짜가 없거나 오늘 뒤면 오늘로 올리고(⚡ 지금 할 일에 뜸) 상세를 연다 */
  const start = async (t: PTaskRow) => {
    const d = taskDay(t)
    if (!d || d > today) await actions.moveDates([t.id], today, '오늘 할 일로 올렸어요')
    onSelect(t.id)
  }

  return (
    <div className="st" onDragOver={onBoardOver} onDrop={onBoardDrop} onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null) }}>
      <div className="st-head">
        <h3>{s.goal ? s.goal.title : '단계'}</h3>
        {goalDay && <span className="st-head__dl">{p.deadline?.word ?? '마감'} {md(goalDay)}</span>}
      </div>
      {total > 0 && (
        <div className="st-prog">
          <span>{done} / {total} 단계 끝</span>
          <div className="pc-bar"><i style={{ width: `${pct}%` }} /></div>
          <span>{pct}%</span>
        </div>
      )}
      <div className="st-road">
        {s.steps.map(card)}
        {dropAt === total && dragFrom !== null && <i className="st-drop" aria-hidden="true" />}
        {adding ? (
          <div className="st-card st-card--new is-editing">
            <input autoFocus className="st-in" placeholder="새 단계 이름" aria-label="새 단계 이름"
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) void create(v); else setAdding(false) } else if (e.key === 'Escape') { e.stopPropagation(); setAdding(false) } }}
              onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v) void create(v); else setAdding(false) }} />
          </div>
        ) : (
          <button className="st-card st-card--new" onClick={() => setAdding(true)}><Plus />단계 추가</button>
        )}
      </div>
      {hint && <div className="st-hints"><span>단계를 끌어서 순서 바꾸기</span><span>더블클릭으로 이름 고치기</span><span>우클릭: 날짜·삭제·할 일로 열기</span></div>}
      {s.rest.filter((t) => t.status === 0).length > 0 && (
        <div className="st-rest">
          <h6>단계가 아닌 할 일 · 끌어서 단계로</h6>
          <div className="st-rest__rows">
            {s.rest.filter((t) => t.status === 0).map((t) => (
              <div key={t.id} className="st-rest__row" draggable onDragStart={(e) => { e.dataTransfer.setData(TASK_DND, t.id); e.dataTransfer.effectAllowed = 'move' }}
                onClick={() => onSelect(t.id)} role="button" tabIndex={0}>
                <span>{t.title}</span>{taskDay(t) && <small>{md(taskDay(t)!)}</small>}
                <button className="st-rest__add" title="끝 단계로 넣기" aria-label="단계로 넣기" onClick={(e) => { e.stopPropagation(); void append(t.id) }}><Plus /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      {menu && (
        <Popover point={menu.point} onClose={() => setMenu(undefined)} className="menu" width={200}>
          <MenuItem label="할 일로 열기" onClick={() => { const t = menu.t; setMenu(undefined); onSelect(t.id) }} />
          <MenuItem label="이름 바꾸기" onClick={() => { const t = menu.t; setMenu(undefined); setRenaming(t.id) }} />
          <SubMenu label="날짜" width={170}>
            <MenuItem label="오늘" onClick={() => { const t = menu.t; setMenu(undefined); void edit.date(t, today) }} />
            <MenuItem label="내일" onClick={() => { const t = menu.t; setMenu(undefined); void edit.date(t, dayKey(1)) }} />
            <div className="menu__divider" />
            <MenuItem label="날짜 지우기" onClick={() => { const t = menu.t; setMenu(undefined); void edit.date(t, null) }} />
          </SubMenu>
          <MenuItem label="단계에서 빼기" onClick={() => {
            const { t, i } = menu
            setMenu(undefined)
            const ids = s.links.filter((l) => l.from_id === t.id || l.to_id === t.id).map((l) => l.id).filter(Boolean)
            void dropStep(t.id, ids, s.steps[i - 1]?.id ?? null, s.steps[i + 1]?.id ?? null).then((u) => toast.show('단계에서 뺐어요. 할 일은 그대로예요', u))
          }} />
          {data.projects.some((o) => o.tag.id !== p.tag.id && !o.finished) && (
            <SubMenu label="다른 프로젝트로" width={230}>
              {data.projects.filter((o) => o.tag.id !== p.tag.id && !o.finished).slice(0, 12).map((o) => <MenuItem key={o.tag.id} label={o.title} onClick={() => { const t = menu.t; setMenu(undefined); void edit.moveTo(t, o) }} />)}
            </SubMenu>
          )}
          <div className="menu__divider" />
          <MenuItem label="삭제" danger onClick={() => { const t = menu.t; setMenu(undefined); void actions.trash([t.id]) }} />
        </Popover>
      )}
    </div>
  )
}
