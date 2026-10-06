// 31 §12.9.3 프로젝트 화면 — 머리(← 모든 프로젝트 · 아이콘·이름·자동 · N개 중 M개 완료 · ⋯) + 도구(타임라인 · 관계도 / 할 일 넣기 / 자동으로 넣은 것만 / 다음 단계 같이 짜기)
// 두 보기는 같은 PlanData(로컬 DB 감시)를 읽어 한쪽에서 고치면 다른 쪽도 바로 바뀐다.
import { ArrowLeft, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { confirmProject } from '../../../data/projects'
import { dayKey } from '../../../lib/dates'
import { mainSteps, searchTasks } from '../../../lib/projectEdit'
import { StepBoard } from './StepBoard'
import type { TaskActions } from '../../../lib/taskActions'
import { MenuItem, Popover } from '../../Popover'
import { useToast } from '../../Toast'
import { CardLine, NameDialog, PlanBubble, ProjectIcon, ProjectMenu, TASK_DND, type PlanOpen } from './ProjectBoard'
import { ProjectTimeline } from './ProjectTimeline'
import { RelationGraph } from './RelationGraph'
import { pickNext, QuickAddInput, useProjectEdit, type ProjectEdit } from './edit'
import type { PTaskRow } from './useProjects'
import type { PlanData, ProjectView } from './useProjects'

type View = 'steps' | 'timeline' | 'graph'
// 31 §12.11: 프로젝트마다 마지막 보기를 기억 — 처음 열면 단계가 있으면 `단계`, 없으면 `타임라인`
const VIEW_KEY = 'sprout.map.projview.v2'
const readViews = (): Record<string, View> => { try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} } }

export function ProjectScreen({ p, data, selected, onBack, onSelect, onPlan, actions, chatOpen, onCloseChat }: {
  p: ProjectView; data: PlanData; selected: string | null
  onBack: () => void; onSelect: (id: string | null) => void; onPlan: PlanOpen; actions: TaskActions
  chatOpen: boolean; onCloseChat: () => void
}) {
  const today = dayKey()
  const edit = useProjectEdit(p, actions)
  const hasSteps = useMemo(() => mainSteps(p).steps.length > 0, [p])
  const [view, setViewState] = useState<View>(() => readViews()[p.tag.id] ?? (hasSteps ? 'steps' : 'timeline'))
  useEffect(() => { setViewState(readViews()[p.tag.id] ?? (hasSteps ? 'steps' : 'timeline')) }, [p.tag.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, JSON.stringify({ ...readViews(), [p.tag.id]: v })) } catch { /* 기억만 못 함 */ } }
  const [autoOnly, setAutoOnly] = useState(false)
  const [picker, setPicker] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [naming, setNaming] = useState<HTMLElement | null>(null)
  const [adder, setAdder] = useState<HTMLElement | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (!p.autoCount) setAutoOnly(false) }, [p.autoCount])

  // 31 §12.12.2 여러 개 고르기 — 2개 이상이면 선택 띠, 하나면 오른쪽 상세(selected)
  const [picked, setPicked] = useState<string[]>([])
  const memberIds = useMemo(() => new Set(p.members.map((m) => m.id)), [p])
  useEffect(() => { setPicked((xs) => { const n = xs.filter((x) => memberIds.has(x)); return n.length === xs.length ? xs : n.length > 1 ? n : [] }) }, [memberIds])
  useEffect(() => { setPicked([]) }, [p.tag.id])
  const pickedRows = useMemo(() => picked.map((id) => p.members.find((m) => m.id === id)).filter((x): x is PTaskRow => !!x), [picked, p])
  const onPick = (id: string, e?: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    const cur = picked.length ? picked : selected ? [selected] : []
    const next = pickNext(cur, id, { meta: !!e && (e.metaKey || e.ctrlKey), shift: !!e?.shiftKey })
    if (next.length > 1) { setPicked(next); onSelect(null) } else { setPicked([]); onSelect(next[0] ?? null) }
  }
  const clearPick = () => setPicked([])
  // 고른 상태 Delete/Backspace = 삭제(휴지통, 목록과 같음) · 선 선택·관계도 사람·메모 노드는 각 보기가 먼저 먹는다
  const delState = useRef({ picked: pickedRows, selected, p, edit })
  delState.current = { picked: pickedRows, selected, p, edit }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || e.defaultPrevented) return
      if ((e.target as HTMLElement).closest?.('input,textarea,select,[contenteditable],.app__detail,.pc') || document.querySelector('.popover,[aria-modal="true"]')) return
      const k = delState.current
      const ts = k.picked.length > 1 ? k.picked : k.p.members.filter((m) => m.id === k.selected)
      if (!ts.length) return
      e.preventDefault()
      setPicked([]); onSelect(null)
      void k.edit.trash(ts)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onSelect])

  // Cmd/Ctrl+Z = 마지막 편집 되돌리기(캘린더·목록과 같음, 02 §7) — 입력칸 밖
  const toast = useToast()
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      if ((e.target as HTMLElement).closest?.('input,textarea,[contenteditable]')) return
      if (toast.undoLast()) e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [toast])

  // Esc = 모든 프로젝트(입력·팝오버·끌기 밖 — 타임라인·관계도가 먼저 먹으면 여기까지 안 온다)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.cancelBubble || document.querySelector('.popover,[aria-modal="true"]')) return
      if ((e.target as HTMLElement).closest?.('input,textarea,[contenteditable],.app__detail,.pc')) return
      if (picked.length) { setPicked([]); return }
      if (selected) { onSelect(null); return }
      onBack()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onBack, onSelect, selected, picked.length])

  return (
    <div className={`plan-proj plan-proj--${view}`}>
      <button className="plan-crumb" onClick={onBack}><ArrowLeft />모든 프로젝트</button>
      <div className="plan-ftitle">
        <ProjectIcon name={p.tag.name} size={20} />
        <h2 ref={title} onDoubleClick={() => setNaming(title.current)} title="두 번 눌러 이름 바꾸기">{p.title}</h2>
        {p.focus && <span className="pc-focus">집중</span>}
        {p.auto && <span className="pc-auto">자동</span>}
        <CardLine p={p} today={today} />
        <button className="icon-btn plan-ftitle__more" aria-label="프로젝트 메뉴" onClick={(e) => setMenu(e.currentTarget)}><MoreHorizontal /></button>
      </div>
      <div className="plan-tools">
        <div className="plan-seg" role="tablist" aria-label="보기">
          <button role="tab" aria-selected={view === 'steps'} className={view === 'steps' ? 'is-on' : ''} onClick={() => setView('steps')}>단계</button>
          <button role="tab" aria-selected={view === 'timeline'} className={view === 'timeline' ? 'is-on' : ''} onClick={() => setView('timeline')}>타임라인</button>
          <button role="tab" aria-selected={view === 'graph'} className={view === 'graph' ? 'is-on' : ''} onClick={() => setView('graph')}>관계도</button>
        </div>
        <span className="plan-tools__sp" />
        <button className="map-btn map-btn--primary" onClick={(e) => setAdder(e.currentTarget)} title="새 할 일을 이 프로젝트에 — '내일 오후 3시'처럼 날짜도 적을 수 있어요"><Plus />새 할 일</button>
        <button className="map-btn" onClick={(e) => setPicker(e.currentTarget)} title="이미 있는 할 일을 찾아 이 프로젝트에 넣어요"><Search />할 일 넣기</button>
        {p.autoCount > 0 && (
          <button className={`map-btn${autoOnly ? ' is-on' : ''}`} aria-pressed={autoOnly} onClick={() => setAutoOnly((v) => !v)} title="자동으로 넣고 아직 확인 안 한 일만 진하게">
            자동으로 넣은 것만 <b>{p.autoCount}</b>
          </button>
        )}
        <button className={`map-btn${chatOpen ? ' is-on' : ''}`} aria-pressed={chatOpen} title="수달이랑 다음 단계 — 답하면 단계가 바로 생겨요" onClick={() => chatOpen ? onCloseChat() : onPlan({ project: { id: p.tag.id, name: p.title } })}>
          다음 단계 같이 짜기
        </button>
      </div>
      {!p.confirmed && p.members.length > 0 && p.autoCount > 0 && (
        <PlanBubble text={`${p.short} 관련 일 ${p.members.length}개를 찾아서 묶었어요. 틀린 건 ✕로 빼고, 빠진 건 할 일 넣기로 넣어 주세요`}>
          <button className="map-btn" onClick={() => confirmProject(p.tag.id, p.members.length)}>빠진 거 없어</button>
        </PlanBubble>
      )}
      {pickedRows.length > 1 && <PickBar ts={pickedRows} edit={edit} onClear={clearPick} />}
      {view === 'steps'
        ? <StepBoard p={p} data={data} edit={edit} actions={actions} selected={selected} onSelect={onSelect} picked={pickedRows} onPick={onPick} />
        : view === 'timeline'
        ? <ProjectTimeline p={p} data={data} selected={selected} onSelect={onSelect} edit={edit} autoOnly={autoOnly} picked={pickedRows} onPick={onPick} />
        : <div className="plan-graph"><RelationGraph p={p} data={data} edit={edit} actions={actions} selected={selected} onSelect={onSelect} autoOnly={autoOnly} picked={pickedRows} onPick={onPick} /></div>}
      {adder && (
        <Popover anchor={adder} onClose={() => setAdder(null)} width={360} align="end" className="plan-adder">
          <QuickAddInput placeholder={`'${p.title}'에 새 할 일`} onClose={() => setAdder(null)} onSubmit={(raw) => edit.quick(raw)} />
          <p className="plan-adder__hint">'내일', '10/12 오후 3시'처럼 날짜를 같이 적어도 돼요 · Enter로 계속 추가</p>
        </Popover>
      )}
      {picker && <AddPicker anchor={picker} p={p} data={data} edit={edit} onClose={() => setPicker(null)} />}
      {menu && <ProjectMenu p={p} all={data.projects} anchor={menu} onClose={() => setMenu(null)} onPlan={onPlan} onRename={() => setNaming(title.current)} onGone={onBack} />}
      {naming && <NameDialog anchor={naming} p={p} onClose={() => setNaming(null)} />}
    </div>
  )
}

/** 할 일 넣기(§12.9.3): 모든 할 일(열린 것 먼저) 퍼지 검색 · 여러 개 체크 → N개 넣기 · 행을 끌어 타임라인 줄·관계도·카드에 놓기 */
function AddPicker({ anchor, p, data, edit, onClose }: { anchor: HTMLElement; p: ProjectView; data: PlanData; edit: ProjectEdit; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set())
  const inside = useMemo(() => new Set(p.members.map((m) => m.id)), [p])
  const all = useMemo(() => [...data.byId.values()], [data])
  const rows = searchTasks(all, q, inside, 50)
  const toggle = (id: string) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <Popover anchor={anchor} onClose={onClose} width={360} align="end" className="plan-add">
      <input autoFocus className="plan-add__q" placeholder="넣을 할 일 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="넣을 할 일 찾기"
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && pick.size) { void edit.add([...pick]); onClose() } }} />
      <div className="plan-add__list" role="listbox" aria-multiselectable="true">
        {rows.length ? rows.map((t) => (
          <label key={t.id} role="option" aria-selected={pick.has(t.id)} className={`plan-add__row${t.status !== 0 ? ' is-done' : ''}`} draggable
            onDragStart={(e) => { e.dataTransfer.setData(TASK_DND, t.id); e.dataTransfer.effectAllowed = 'copy' }}>
            <input type="checkbox" checked={pick.has(t.id)} onChange={() => toggle(t.id)} />
            <span>{t.title}</span><small>{data.listName(t.list_id)}</small>
          </label>
        )) : <p className="plan-add__none">{q ? '맞는 할 일이 없어요' : '넣을 할 일이 없어요'}</p>}
      </div>
      <div className="plan-add__foot">
        <span>행을 끌어 줄·관계도에 놓아도 돼요</span>
        <button className="map-btn map-btn--primary" disabled={!pick.size} onClick={() => { void edit.add([...pick]); onClose() }}>{pick.size ? `${pick.size}개 넣기` : '넣기'}</button>
      </div>
    </Popover>
  )
}

/** 31 §12.12.2 선택 띠: `3개 고름 · 날짜 › · 완료 · 프로젝트에서 빼기 · 삭제 · 고름 풀기` */
function PickBar({ ts, edit, onClear }: { ts: PTaskRow[]; edit: ProjectEdit; onClear: () => void }) {
  const [date, setDate] = useState<HTMLElement | null>(null)
  const run = (f: () => unknown) => () => { onClear(); void f() }
  return (
    <div className="plan-pick" role="toolbar" aria-label="고른 할 일">
      <b>{ts.length}개 고름</b>
      <button className="map-btn" onClick={(e) => setDate(e.currentTarget)}>날짜</button>
      <button className="map-btn" onClick={run(() => edit.completeMany(ts))}>{ts.every((t) => t.status !== 0) ? '완료 취소' : '완료'}</button>
      <button className="map-btn" onClick={run(() => edit.outMany(ts))} title="프로젝트 연결만 끊어요 — 할 일은 리스트에 남아요">프로젝트에서 빼기</button>
      <button className="map-btn is-danger" onClick={run(() => edit.trash(ts))} title="휴지통으로 옮겨요 (Delete)">삭제</button>
      <span className="plan-tools__sp" />
      <button className="icon-btn" aria-label="고름 풀기" title="고름 풀기 (Esc)" onClick={onClear}><X /></button>
      {date && (
        <Popover anchor={date} onClose={() => setDate(null)} className="menu" width={170}>
          <MenuItem label="오늘" onClick={() => { setDate(null); run(() => edit.dateMany(ts, dayKey()))() }} />
          <MenuItem label="내일" onClick={() => { setDate(null); run(() => edit.dateMany(ts, dayKey(1)))() }} />
          <div className="menu__divider" />
          <MenuItem label="날짜 지우기" onClick={() => { setDate(null); run(() => edit.dateMany(ts, null))() }} />
        </Popover>
      )}
    </div>
  )
}
