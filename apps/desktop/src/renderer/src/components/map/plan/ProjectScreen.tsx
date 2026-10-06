// 31 §12.9.3 프로젝트 화면 + 41 §3 머리 그 자리 고치기(아이콘·이름·⚑ D-day·팀원·지금 집중·⋯) · §7 도구(보기 · 줄: ▾ · 배율 · 자동으로 넣은 것만 · ＋ 할 일) ·
// §6 고른 띠(하루·일주일 미루기 · 날짜 고르기 · 태그 › · 완료 · 빼기 · 삭제) · §2.4 줄 나누기 제안. 다음 단계 같이 짜기는 ⋯ 메뉴(결정 4).
// 세 보기는 같은 PlanData(로컬 DB 감시)를 읽어 한쪽에서 고치면 다른 쪽도 바로 바뀐다. 설정은 view_settings project:<id>(동기화).
import { ArrowLeft, Check, ChevronDown, MoreHorizontal, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dDay, dDayHot, findDayRange, keyWordChips, mdWeek, NO_LANE, projectCardLine, starterFor } from '@sprout/schema/planView'
import { splitPeople } from '@sprout/schema/projectScore'
import { confirmProject } from '../../../data/projects'
import { linkTeam, renameProject, setFocus } from '../../../data/projectEdit'
import { addLanes, clearKeyDate, saveProjectSettings, setKeyDate, unlinkTeammate } from '../../../data/projectDirect'
import { openTarget } from '../../../data/wiki'
import { dayKey } from '../../../lib/dates'
import { mainSteps, searchTasks } from '../../../lib/projectEdit'
import { StepBoard } from './StepBoard'
import type { TaskActions } from '../../../lib/taskActions'
import { EmojiPicker } from '../../EmojiPicker'
import { MenuItem, Popover } from '../../Popover'
import { useToast } from '../../Toast'
import { iconOf, NameDialog, PlanBubble, ProjectIcon, ProjectMenu, TASK_DND, type PlanOpen } from './ProjectBoard'
import { defaultZoom, ProjectTimeline, type Zoom } from './ProjectTimeline'
import { RelationGraph } from './RelationGraph'
import { DayPop } from './DirectBits'
import { pickNext, quickParse, useProjectEdit, useQuickSources, type ProjectEdit } from './edit'
import { highlightRecognized } from '../../DesktopEntry'
import type { PTaskRow } from './useProjects'
import type { PlanData, ProjectView } from './useProjects'
import './direct.css'

type View = 'steps' | 'timeline' | 'graph'
// 예전 기기 기억(31 §12.11) — 동기화 설정에 보기가 없을 때만 읽는다(41 §9로 옮김)
const VIEW_KEY = 'sprout.map.projview.v2'
const readViews = (): Record<string, View> => { try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} } }

export function ProjectScreen({ p, data, selected, onBack, onSelect, onPlan, actions, chatOpen, onCloseChat }: {
  p: ProjectView; data: PlanData; selected: string | null
  onBack: () => void; onSelect: (id: string | null) => void; onPlan: PlanOpen; actions: TaskActions
  chatOpen: boolean; onCloseChat: () => void
}) {
  const today = dayKey()
  const toast = useToast()
  const edit = useProjectEdit(p, actions)
  const hasSteps = useMemo(() => mainSteps(p).steps.length > 0, [p])
  // 보기: 동기화 설정 → 예전 기기 기억 → (단계가 있으면 단계, 없으면 타임라인). 줄 기준이 태그(새 프로젝트)면 타임라인
  const view: View = p.settings.view ?? readViews()[p.tag.id] ?? (p.laneBy === 'tag' ? 'timeline' : hasSteps ? 'steps' : 'timeline')
  const setView = (v: View) => { void saveProjectSettings(p.tag.id, { view: v }) }
  const zoom: Zoom = p.settings.zoom ?? defaultZoom(p)
  const [autoOnly, setAutoOnly] = useState(false)
  const [adder, setAdder] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [naming, setNaming] = useState<HTMLElement | null>(null)
  const [byMenu, setByMenu] = useState<HTMLElement | null>(null)
  const [laneInput, setLaneInput] = useState<{ n: number; placeholder?: string } | undefined>()
  const moreBtn = useRef<HTMLButtonElement>(null)
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
  // 고른 상태 Delete/Backspace = 삭제(휴지통, 목록과 같음). ⚑ 핵심 날짜 할 일은 머리 알약에서 지운다
  const delState = useRef({ picked: pickedRows, selected, p, edit })
  delState.current = { picked: pickedRows, selected, p, edit }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || e.defaultPrevented) return
      if ((e.target as HTMLElement).closest?.('input,textarea,select,[contenteditable],.app__detail,.pc') || document.querySelector('.popover,[aria-modal="true"]')) return
      const k = delState.current
      const ts = (k.picked.length > 1 ? k.picked : k.p.members.filter((m) => m.id === k.selected)).filter((t) => t.id !== k.p.keyTask?.id)
      if (!ts.length) { if (k.selected && k.selected === k.p.keyTask?.id) toast.show('핵심 날짜는 머리의 ⚑ 알약에서 지워요'); return }
      e.preventDefault()
      setPicked([]); onSelect(null)
      void k.edit.trash(ts)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onSelect, toast])

  // Cmd/Ctrl+Z = 마지막 편집 되돌리기(캘린더·목록과 같음, 02 §7) — 입력칸 밖
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

  const setBy = async (by: 'tag' | 'kind') => { setByMenu(null); if (by !== p.laneBy) toast.show(by === 'tag' ? '줄을 태그로 나눠요' : '줄을 일의 종류로 나눠요', await saveProjectSettings(p.tag.id, { by })) }
  const setZoom = (z: Zoom) => { void saveProjectSettings(p.tag.id, { zoom: z }) }
  const setOrder = async (order: string[]) => { toast.registerUndo(await saveProjectSettings(p.tag.id, { order })) }
  const c = projectCardLine(p, today)

  return (
    <div className={`plan-proj plan-proj--${view}`}>
      <button className="plan-crumb" onClick={onBack}><ArrowLeft />모든 프로젝트</button>
      <ProjectHead p={p} today={today} onMenu={() => setMenu(moreBtn.current)} moreRef={moreBtn} />
      <div className="ph-line">
        <span>{c.text.split(' · ')[0]}</span>
        <div className="pc-bar ph-line__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress * 100)}><i style={{ width: `${c.progress * 100}%` }} /></div>
        {p.auto && <span className="pc-auto">자동</span>}
      </div>
      <div className="plan-tools">
        <div className="plan-seg" role="tablist" aria-label="보기">
          <button role="tab" aria-selected={view === 'steps'} className={view === 'steps' ? 'is-on' : ''} onClick={() => setView('steps')}>단계</button>
          <button role="tab" aria-selected={view === 'timeline'} className={view === 'timeline' ? 'is-on' : ''} onClick={() => setView('timeline')}>타임라인</button>
          <button role="tab" aria-selected={view === 'graph'} className={view === 'graph' ? 'is-on' : ''} onClick={() => setView('graph')}>관계도</button>
        </div>
        {view === 'timeline' && <>
          <button className="map-btn" onClick={(e) => setByMenu(e.currentTarget)} aria-haspopup="menu">줄: {p.laneBy === 'tag' ? '태그' : '일의 종류'}<ChevronDown /></button>
          <div className="plan-seg plan-seg--sm" role="radiogroup" aria-label="배율">
            <button role="radio" aria-checked={zoom === 'week'} className={zoom === 'week' ? 'is-on' : ''} onClick={() => setZoom('week')}>주</button>
            <button role="radio" aria-checked={zoom === 'month'} className={zoom === 'month' ? 'is-on' : ''} onClick={() => setZoom('month')}>월</button>
          </div>
        </>}
        <span className="plan-tools__sp" />
        {p.autoCount > 0 && (
          <button className={`map-btn${autoOnly ? ' is-on' : ''}`} aria-pressed={autoOnly} onClick={() => setAutoOnly((v) => !v)} title="자동으로 넣고 아직 확인 안 한 일만 진하게">
            자동으로 넣은 것만 <b>{p.autoCount}</b>
          </button>
        )}
        {chatOpen && <button className="map-btn is-on" aria-pressed onClick={onCloseChat}>같이 짜기 닫기</button>}
        <button className="map-btn map-btn--primary" onClick={(e) => setAdder(e.currentTarget)} title="새 할 일을 적거나, 이미 있는 할 일을 골라 넣어요"><Plus />할 일</button>
      </div>
      {!p.confirmed && p.members.length > 0 && p.autoCount > 0 && (
        <PlanBubble text={`${p.short} 관련 일 ${p.members.length}개를 찾아서 묶었어요. 틀린 건 ✕로 빼고, 빠진 건 ＋ 할 일로 넣어 주세요`}>
          <button className="map-btn" onClick={() => confirmProject(p.tag.id, p.members.length)}>빠진 거 없어</button>
        </PlanBubble>
      )}
      {view === 'timeline' && <StarterAsk p={p} onAddLane={(what) => setLaneInput((x) => ({ n: (x?.n ?? 0) + 1, placeholder: `${what} 이름 (예: ${what === '과목' ? '금융상품' : '회사 이름'})` }))} />}
      {pickedRows.length > 1 && <PickBar ts={pickedRows} p={p} edit={edit} onClear={clearPick} />}
      {view === 'steps'
        ? <StepBoard p={p} data={data} edit={edit} actions={actions} selected={selected} onSelect={onSelect} picked={pickedRows} onPick={onPick} />
        : view === 'timeline'
        ? <ProjectTimeline p={p} data={data} selected={selected} onSelect={onSelect} edit={edit} autoOnly={autoOnly} picked={pickedRows} onPick={onPick}
            laneBy={p.laneBy} zoom={zoom} onOrder={(o) => void setOrder(o)} laneInput={laneInput} />
        : <div className="plan-graph"><RelationGraph p={p} data={data} edit={edit} actions={actions} selected={selected} onSelect={onSelect} autoOnly={autoOnly} picked={pickedRows} onPick={onPick} /></div>}
      {adder && <AddAll anchor={adder} p={p} data={data} edit={edit} onClose={() => setAdder(null)} />}
      {byMenu && (
        <Popover anchor={byMenu} onClose={() => setByMenu(null)} className="menu" width={200}>
          <MenuItem label="태그" active={p.laneBy === 'tag'} trail={p.laneBy === 'tag' ? <Check /> : undefined} onClick={() => void setBy('tag')} />
          <MenuItem label="일의 종류" active={p.laneBy === 'kind'} trail={p.laneBy === 'kind' ? <Check /> : undefined} onClick={() => void setBy('kind')} />
          <div className="menu__caption">프로젝트마다 기억해요</div>
        </Popover>
      )}
      {menu && <ProjectMenu p={p} all={data.projects} anchor={menu} onClose={() => setMenu(null)} onPlan={onPlan} onRename={() => setNaming(moreBtn.current)} onGone={onBack} />}
      {naming && <NameDialog anchor={naming} p={p} onClose={() => setNaming(null)} />}
    </div>
  )
}

/** 41 §3 머리 한 줄: [아이콘] 이름 [⚑ 시험 11/23(월) D-48] 팀원 [👤 민수 ✕] [＋] [지금 집중] … ⋯ */
function ProjectHead({ p, today, onMenu, moreRef }: { p: ProjectView; today: string; onMenu: () => void; moreRef: React.RefObject<HTMLButtonElement | null> }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [keyPop, setKeyPop] = useState<HTMLElement | null>(null)
  const [teamIn, setTeamIn] = useState(false)
  const iconBtn = useRef<HTMLButtonElement>(null)
  const emoji = iconOf(p.tag.name)
  const rename = async (v: string) => {
    setEditing(false)
    const n = v.trim()
    if (!n || n === p.title) return
    toast.show('이름을 바꿨어요', await renameProject(p.tag.id, n, emoji))
  }
  const dl = p.deadline
  const focus = async () => {
    const u = await setFocus(p.focus ? null : p.tag.id)
    toast.show(p.focus ? '집중을 껐어요' : `지금 '${p.title}'에 집중해요 · 빠른 추가에 붙여 둘게요`, u)
  }
  return (
    <div className="ph">
      <button ref={iconBtn} className="ph__icon" title="아이콘 고르기" aria-label="아이콘 고르기" onClick={() => setPicking(true)}><ProjectIcon name={p.tag.name} size={20} /></button>
      {editing
        ? <input autoFocus className="ph__name is-edit" defaultValue={p.title} maxLength={20} aria-label="프로젝트 이름"
            onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') void rename(e.currentTarget.value); else if (e.key === 'Escape') { e.stopPropagation(); setEditing(false) } }}
            onBlur={(e) => void rename(e.currentTarget.value)} size={Math.max(4, [...p.title].length + 2)} />
        : <h2 className="ph__name" title="눌러서 이름 고치기" role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true) }}>{p.title}</h2>}
      {dl
        ? <button className="ph-pill" title="핵심 날짜 바꾸기" onClick={(e) => setKeyPop(e.currentTarget)}>⚑ {dl.word} {mdWeek(dl.day)} <b className={dDayHot(dl.day, today) && p.done < p.members.length ? 'is-hot' : ''}>{dDay(dl.day, today)}</b></button>
        : <button className="ph-pill is-add" onClick={(e) => setKeyPop(e.currentTarget)}><Plus />핵심 날짜</button>}
      <span className="ph-team">
        <span className="ph-team__l">팀원</span>
        {p.team.map((m) => (
          <span key={m.id} className="ph-team__p">
            <button className="ph-team__n" onClick={() => openTarget({ view: `tag:${m.id}` })}>👤 {m.name}</button>
            <button className="ph-team__x" aria-label={`${m.name} 빼기`} onClick={async () => toast.show(`👤 ${m.name}을(를) 팀원에서 뺐어요`, await unlinkTeammate(p.tag.id, m.id))}><X /></button>
          </span>
        ))}
        {teamIn
          ? <input autoFocus className="ph-team__in" placeholder="예: 민수, 지은" aria-label="팀원 넣기"
              onKeyDown={async (e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Escape') { e.stopPropagation(); setTeamIn(false); return }
                if (e.key !== 'Enter') return
                const names = splitPeople(e.currentTarget.value)
                setTeamIn(false)
                if (names.length) toast.show(`팀원 ${names.length}명을 이었어요`, await linkTeam(p.tag.id, names))
              }} onBlur={() => setTeamIn(false)} />
          : <button className="ph-team__add" aria-label="팀원 넣기" onClick={() => setTeamIn(true)}><Plus /></button>}
      </span>
      <button className={`ph-pill ph-focus${p.focus ? ' is-on' : ''}`} aria-pressed={p.focus} onClick={() => void focus()}>{p.focus ? '집중 중 ✓' : '지금 집중'}</button>
      <span className="ph__sp" />
      <button ref={moreRef} className="icon-btn plan-ftitle__more" aria-label="프로젝트 메뉴" title="이름·아이콘 · 합치기 · 다음 단계 같이 짜기 · 태그 페이지 · 프로젝트 아님 · 삭제" onClick={onMenu}><MoreHorizontal /></button>
      {picking && <EmojiPicker anchor={iconBtn.current} onPick={async (e) => toast.show('아이콘을 바꿨어요', await renameProject(p.tag.id, p.title, e))} onClose={() => setPicking(false)} />}
      {keyPop && <KeyDatePop p={p} anchor={keyPop} onClose={() => setKeyPop(null)} />}
    </div>
  )
}

/** ⚑ D-day 팝오버: 안내 · 달력 · 날짜 이름 칩 · 핵심 날짜 지우기(⚑ 할 일은 남고 이음만 끊음) */
function KeyDatePop({ p, anchor, onClose }: { p: ProjectView; anchor: HTMLElement; onClose: () => void }) {
  const toast = useToast()
  const dl = p.deadline
  // 제목 마감 말로 읽은 마감(⚑ 이음 없음)도 고르면 그 할 일을 핵심 날짜로 잇는다
  const keyTask = p.keyTask ?? (dl?.taskId ? p.members.find((m) => m.id === dl.taskId) ?? null : null)
  const word = dl?.word ?? '마감'
  const run = async (day: string, w?: string) => {
    onClose()
    const r = await setKeyDate({ tagId: p.tag.id, name: p.title, keyTask, mainList: p.mainList }, day, w)
    toast.show(r.made ? `⚑ 핵심 날짜를 ${mdWeek(day)}로 정했어요` : `핵심 날짜를 ${mdWeek(day)}로 바꿨어요`, r.undo)
  }
  return (
    <DayPop anchor={anchor} day={dl?.day ?? null} onPick={(d) => void run(d)} onClose={onClose} width={270}
      top={<p className="daypop__hint is-top">핵심 날짜 — ⚑ 할 일과 같은 날짜예요</p>}
      bottom={<>
        <div className="np__words daypop__words" role="radiogroup" aria-label="날짜 이름">
          {keyWordChips(word).map((w) => <button key={w} role="radio" aria-checked={w === word} className={`np-chip${w === word ? ' is-on' : ''}`} onClick={() => { if (w !== word) void run(dl?.day ?? dayKey(), w) }}>{w}</button>)}
        </div>
        {p.keyTask && <><div className="menu__divider" /><MenuItem label="핵심 날짜 지우기" onClick={async () => { onClose(); toast.show('핵심 날짜를 지웠어요 · ⚑ 할 일은 남아요', await clearKeyDate(p.tag.id)) }} /></>}
      </>} />
  )
}

/** 41 §2.4 만든 직후 한 번: 줄 나누기 제안(낱말 표, AI 없음). 누를 때만 생기고, 아무거나 누르면 다시 안 뜬다 */
function StarterAsk({ p, onAddLane }: { p: ProjectView; onAddLane: (what: string) => void }) {
  const toast = useToast()
  const ask = useMemo(() => {
    if (p.laneBy !== 'tag' || p.settings.starterSeen) return null
    if (p.tagLanes.lanes.some((l) => l.id !== NO_LANE)) return null
    return starterAsk(p.title)
  }, [p])
  if (!ask) return null
  const seen = () => saveProjectSettings(p.tag.id, { starterSeen: true })
  return (
    <PlanBubble size={24} text={ask.text}>
      {ask.lanes && <button className="map-btn" onClick={async () => { await seen(); toast.show(`줄 ${ask.lanes!.length}개를 만들었어요`, await addLanes(p.tag.id, ask.lanes!)) }}>그렇게</button>}
      {ask.add && <button className="map-btn" onClick={() => { void seen(); onAddLane(ask.add!) }}>＋ {ask.add} 추가</button>}
      <button className="map-btn map-btn--text" onClick={() => void seen()}>괜찮아요</button>
    </PlanBubble>
  )
}
const starterAsk = (name: string) => starterFor(name).ask

/** 41 §7 `＋ 할 일` 하나: 위 = 새 할 일(인식·Enter 계속), 아래 = 적는 글로 거른 이미 있는 할 일(눌러 넣기 · 끌어서 줄에). ↓ = 목록 */
function AddAll({ anchor, p, data, edit, onClose }: { anchor: HTMLElement; p: ProjectView; data: PlanData; edit: ProjectEdit; onClose: () => void }) {
  const [raw, setRaw] = useState('')
  const [hi, setHi] = useState(-1)
  const [scroll, setScroll] = useState(0)
  const busy = useRef(false)
  const src = useQuickSources()
  const inside = useMemo(() => new Set(p.members.map((m) => m.id)), [p])
  const all = useMemo(() => [...data.byId.values()], [data])
  const q = raw.trim()
  const range = q ? findDayRange(raw, dayKey()) : null
  const parsed = q ? quickParse(raw, src) : null
  // 적는 글(날짜·#·~ 뺀 제목)로 이미 있는 할 일을 거른다
  const words = parsed ? (range ? parsed.title.replace(range.token, ' ') : parsed.title).replace(/\s+/g, ' ').trim() : ''
  const rows = searchTasks(all, words, inside, 30)
  const tokens = [...(parsed?.tokens ?? []), ...(range ? [range.token] : [])]
  const submit = async () => {
    if (!q || busy.current) return
    busy.current = true
    try { await edit.quick(raw, p.laneBy === 'tag' ? { laneTag: null } : {}); setRaw('') } finally { busy.current = false }
  }
  return (
    <Popover anchor={anchor} onClose={onClose} width={340} align="end" className="plan-add plan-addall">
      <div className="plan-qa plan-addall__new">
        <Plus className="plan-qa__ic" />
        <span className="plan-addall__field">
          {tokens.length > 0 && <span className="np__hl" aria-hidden="true"><span style={{ transform: `translateX(-${scroll}px)` }}>{highlightRecognized(raw, tokens)}</span></span>}
          <input autoFocus value={raw} placeholder="예: 수험표 출력 11/16 #법규" aria-label={`'${p.title}'에 새 할 일`} spellCheck={false}
            onChange={(e) => { setRaw(e.target.value); setHi(-1) }} onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); if (hi >= 0 && rows[hi]) { void edit.add([rows[hi].id]) } else void submit() }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
            }} />
        </span>
      </div>
      <p className="plan-adder__hint">Enter = 새로 만들기 · '10/12~10/18'처럼 기간도 · ↓ 이미 있는 할 일</p>
      <div className="plan-add__h">이미 있는 할 일</div>
      <div className="plan-add__list" role="listbox">
        {rows.length ? rows.map((t, i) => (
          <button key={t.id} role="option" aria-selected={hi === i} className={`plan-add__row is-btn${t.status !== 0 ? ' is-done' : ''}${hi === i ? ' is-hi' : ''}`} draggable
            onDragStart={(e) => { e.dataTransfer.setData(TASK_DND, t.id); e.dataTransfer.effectAllowed = 'copy' }}
            onClick={() => void edit.add([t.id])}>
            <Plus /><span>{t.title}</span><small>{data.listName(t.list_id)}</small>
          </button>
        )) : <p className="plan-add__none">{q ? '맞는 할 일이 없어요 — Enter로 새로 만들어요' : '넣을 할 일이 없어요'}</p>}
      </div>
      <div className="plan-add__foot"><span>행을 눌러 넣거나, 끌어서 줄에 놓아요</span></div>
    </Popover>
  )
}

/** 41 §6 고른 띠: `3개 고름 · 하루 미루기 · 일주일 미루기 · 날짜 고르기… · 태그 › · 완료 · 프로젝트에서 빼기 · 삭제 · 고름 풀기 ✕` */
function PickBar({ ts, p, edit, onClear }: { ts: PTaskRow[]; p: ProjectView; edit: ProjectEdit; onClear: () => void }) {
  const [date, setDate] = useState<HTMLElement | null>(null)
  const [tag, setTag] = useState<HTMLElement | null>(null)
  const run = (f: () => unknown) => () => { void f() }
  const first = ts.map((t) => (t.start_at ?? t.due_at)?.slice(0, 10)).filter((x): x is string => !!x).sort()[0] ?? null
  const plain = ts.filter((t) => t.id !== p.keyTask?.id)
  return (
    <div className="plan-pick" role="toolbar" aria-label="고른 할 일">
      <b>{ts.length}개 고름</b>
      <button className="map-btn" onClick={run(() => edit.shift(ts, { days: 1 }))}>하루 미루기</button>
      <button className="map-btn" onClick={run(() => edit.shift(ts, { days: 7 }))}>일주일 미루기</button>
      <button className="map-btn" onClick={(e) => setDate(e.currentTarget)}>날짜 고르기…</button>
      <button className="map-btn" onClick={(e) => setTag(e.currentTarget)}>태그 ›</button>
      <button className="map-btn" onClick={run(() => edit.completeMany(ts))}>{ts.every((t) => t.status !== 0) ? '완료 취소' : '완료'}</button>
      <button className="map-btn" onClick={() => { onClear(); void edit.outMany(ts) }} title="프로젝트 연결만 끊어요 — 할 일은 리스트에 남아요">프로젝트에서 빼기</button>
      <button className="map-btn is-danger" onClick={() => { onClear(); void edit.trash(plain) }} title="휴지통으로 옮겨요 (Delete)">삭제</button>
      <span className="plan-tools__sp" />
      <button className="icon-btn" aria-label="고름 풀기" title="고름 풀기 (Esc)" onClick={onClear}><X /></button>
      {date && <DayPop anchor={date} day={first} onClose={() => setDate(null)} onPick={(d) => { setDate(null); void edit.shift(ts, { anchor: d }) }}
        bottom={<p className="daypop__hint">가장 이른 일이 그 날짜로, 나머지는 간격 그대로</p>} />}
      {tag && (
        <Popover anchor={tag} onClose={() => setTag(null)} className="menu" width={200}>
          {p.tagLanes.lanes.filter((l) => l.id !== NO_LANE).map((l) => <MenuItem key={l.id} label={`#${l.name}`} onClick={() => { setTag(null); void edit.toLane(ts, l.id) }} />)}
          {p.tagLanes.lanes.length > 1 && <div className="menu__divider" />}
          <MenuItem label="태그 없음으로" onClick={() => { setTag(null); void edit.toLane(ts, NO_LANE) }} />
          {p.tagLanes.lanes.length <= 1 && <div className="menu__caption">줄: 태그에서 ＋ 줄 추가로 줄을 만들어요</div>}
        </Popover>
      )}
    </div>
  )
}
