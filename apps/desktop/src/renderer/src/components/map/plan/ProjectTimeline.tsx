// 31 §12.3 관계 타임라인 + §12.9.4 편집(틱틱 캘린더 끌기 말씨) + §12.9.0 차분한 모양.
// 가로 = 날짜, 세로 줄 = 일의 종류(회색 글), 선 = 순서(없으면 추정), 오늘·마감 세로선, 옆 칸(사람·메모·리스트).
// 편집: 칩 가로 끌기 = 날짜 · 세로 끌기 = 줄(종류 덮어쓰기) · 오른쪽 핸들 → 다른 칩 = 순서 선 · 선 클릭 → Delete = 끊기 ·
//       빈 곳 더블클릭 = 그 날짜·그 줄에 새 할 일 · 제목 더블클릭 = 이름 고치기 · 호버 ✓/✕ · 우클릭 메뉴 · 선택 + Delete = 프로젝트에서 빼기.
import { Check, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { daysBetween, inferredChain, stackRows, taskDay, workKind, WORK_KINDS, WORK_LABEL, type WorkKind } from '@sprout/schema/projects'
import { setWorkKind } from '../../../data/projectEdit'
import { openTarget, openWikiTopic } from '../../../data/wiki'
import { dayKey } from '../../../lib/dates'
import { dateDrag, dragDays, laneAt } from '../../../lib/projectEdit'
import { MenuItem, Popover } from '../../Popover'
import { TASK_DND } from './ProjectBoard'
import { ProjectTaskMenu, type ProjectEdit } from './edit'
import type { PlanData, ProjectView, PTaskRow } from './useProjects'

const LANE_W = 96
const SOMEDAY_W = 172
const SOMEDAY_MIN = 84
const ROW = 32
const CHIP_MAX = 160
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
/** 칩 폭 어림(글자 수) — 겹침 쌓기용 */
const chipW = (t: PTaskRow) => Math.min(CHIP_MAX, 40 + [...t.title].length * 11.5 + (t.due_at || t.completed_at ? 28 : 0))
const typing = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.('input,textarea,[contenteditable],.app__detail,.pc,.popover')

type Placed = { t: PTaskRow; kind: WorkKind; day: string | null; x: number; row: number; someday: boolean }
type Drag = { id: string; sx: number; sy: number; dx: number; dy: number; on: boolean; pointerX: number; pointerY: number }
type Linking = { from: string; x1: number; y1: number; x2: number; y2: number; over: string | null }
type Path = { key: string; d: string; guess: boolean; link?: { id: string; a: string; b: string }; mid: { x: number; y: number } }

export function ProjectTimeline({ p, data, selected, onSelect, edit, autoOnly }: {
  p: ProjectView; data: PlanData; selected: string | null; onSelect: (id: string | null) => void; edit: ProjectEdit; autoOnly: boolean
}) {
  const today = dayKey()
  const wrap = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [paths, setPaths] = useState<Path[]>([])
  const [menu, setMenu] = useState<{ t: PTaskRow; point: { x: number; y: number } }>()
  const [linkMenu, setLinkMenu] = useState<{ id: string; a: string; b: string; point: { x: number; y: number } }>()
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [linking, setLinking] = useState<Linking | null>(null)
  const [selLink, setSelLink] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; day: string | null; kind: WorkKind } | null>(null)
  const [dropLane, setDropLane] = useState<WorkKind | null>(null)
  const suppressClick = useRef(false)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // ── 배치 ──
  const dragging = !!drag?.on
  const layout = useMemo(() => {
    const items = p.members.map((t) => ({ t, kind: p.kindOf.get(t.id) ?? 'other' as WorkKind, day: taskDay(t) }))
    // 언젠가 칸은 늘 둔다(끄는 동안 자리가 바뀌지 않게 — 놓으면 날짜 지움). 날짜 없는 일이 없으면 좁게
    const hasSomeday = true
    const somedayW = items.some((i) => !i.day) ? SOMEDAY_W : SOMEDAY_MIN
    let from = p.span?.from ?? today, to = p.span?.to ?? today
    if (today >= addDays(from, -30) && today <= addDays(to, 30)) { if (today < from) from = today; if (today > to) to = today }
    from = addDays(from, -2); to = addDays(to, 3)
    const days = Math.max(7, daysBetween(from, to) + 1)
    const trackW = Math.max(240, width - LANE_W - somedayW)
    const px = trackW / days
    const xOf = (d: string) => LANE_W + (daysBetween(from, d) + 0.5) * px
    const dayAt = (x: number) => addDays(from, Math.max(0, Math.min(days - 1, Math.floor((x - LANE_W) / px))))
    const shown = WORK_KINDS.filter((k) => items.some((i) => i.kind === k))
    // 끄는 동안엔 빈 종류 줄도 보여 준다(어느 줄로든 옮길 수 있게)
    const lanes = WORK_KINDS.filter((k) => shown.includes(k) || dragging).map((k) => ({ kind: k, items: items.filter((i) => i.kind === k) }))
    const placed: Placed[] = []
    const laneRows = new Map<WorkKind, number>()
    for (const lane of lanes) {
      const d = lane.items.filter((i) => i.day)
      const at = (i: { t: PTaskRow; day: string | null }) => Math.min(xOf(i.day!) - 5, LANE_W + trackW - chipW(i.t) - 4)
      const rows = stackRows(d.map((i) => ({ id: i.t.id, x: at(i), w: chipW(i.t) })))
      let n = 0
      for (const i of d) { const r = rows.get(i.t.id)!; n = Math.max(n, r + 1); placed.push({ ...i, x: at(i), row: r, someday: false }) }
      const s = lane.items.filter((i) => !i.day)
      s.forEach((i, k) => placed.push({ ...i, x: LANE_W + trackW + 8, row: k, someday: true }))
      laneRows.set(lane.kind, Math.max(1, n, s.length))
    }
    const step = days <= 70 ? 7 : days <= 150 ? 14 : 30
    const ticks: { x: number; label: string }[] = []
    let t0 = from
    for (let i = 0; i < 7 && new Date(`${t0}T00:00:00Z`).getUTCDay() !== 1; i++) t0 = addDays(t0, 1)
    const marks = [today, p.deadline?.day].filter((x): x is string => !!x && x >= from && x <= to).map(xOf)
    for (let d = t0; d <= to; d = addDays(d, step)) { const x = xOf(d); if (!marks.some((m) => x > m - 34 && x < m + 70) && x < LANE_W + trackW - 18) ticks.push({ x, label: md(d) }) }
    return { lanes, placed, laneRows, ticks, xOf, dayAt, from, to, trackW, px, hasSomeday, somedayW }
  }, [p, width, today, dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const laneTop = useMemo(() => {
    const m = new Map<WorkKind, number>()
    const list: { kind: WorkKind; top: number; height: number }[] = []
    let y = 0
    for (const l of layout.lanes) { const h = layout.laneRows.get(l.kind)! * ROW + 12; m.set(l.kind, y); list.push({ kind: l.kind, top: y, height: h }); y += h }
    return { m, list, height: y }
  }, [layout])
  const byId = useMemo(() => new Map(layout.placed.map((x) => [x.t.id, x])), [layout])

  // ── 선 ──
  const pairs = useMemo(() => {
    const dated = new Set(p.members.filter((t) => taskDay(t)).map((t) => t.id))
    const explicit = p.seq.map((l) => ({ a: l.from_id, b: l.to_id, guess: false, id: l.id }))
    if (explicit.some((x) => dated.has(x.a) || dated.has(x.b))) return explicit
    return inferredChain(p.members.map((t) => ({ id: t.id, kind: p.kindOf.get(t.id) ?? 'other', day: taskDay(t) })), p.deadline?.taskId).map(([a, b]) => ({ a, b, guess: true, id: '' }))
  }, [p])
  useLayoutEffect(() => {
    const root = wrap.current
    if (!root) return
    const R = root.getBoundingClientRect()
    const box = (id: string) => root.querySelector<HTMLElement>(`[data-tid="${id}"]:not(.is-float)`)?.getBoundingClientRect()
    const out: Path[] = []
    for (const { a, b, guess, id } of pairs) {
      if (byId.get(a)?.someday && byId.get(b)?.someday) continue
      const A = box(a), B = box(b)
      if (!A || !B) continue
      const x1 = A.right - R.left, y1 = A.top - R.top + A.height / 2
      const x2 = B.left - R.left - 2, y2 = B.top - R.top + B.height / 2
      let d: string
      if (x2 < x1 + 8) { const sx = A.left - R.left + 18, sy = A.bottom - R.top; d = `M${sx} ${sy} C ${sx} ${y2}, ${sx} ${y2}, ${x2} ${y2}` }
      else { const mx = (x1 + x2) / 2; d = `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` }
      out.push({ key: `${a}>${b}`, d, guess, link: guess ? undefined : { id, a, b }, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } })
    }
    setPaths(out)
  }, [pairs, layout, laneTop, byId, renaming])

  // ── 키보드: Delete = 선 끊기 / 프로젝트에서 빼기 · Esc = 끌기 취소·선택 풀기 ──
  const keyState = useRef({ selLink, selected, p, edit, drag, linking })
  keyState.current = { selLink, selected, p, edit, drag, linking }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = keyState.current
      if (e.key === 'Escape') {
        if (k.drag || k.linking) { e.preventDefault(); e.stopImmediatePropagation(); dragRef.current = null; setDrag(null); setLinking(null); return }
        if (k.selLink) { e.stopImmediatePropagation(); setSelLink(null) }
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (typing(e.target) || document.querySelector('.popover,[aria-modal="true"]')) return
      if (k.selLink) { e.preventDefault(); const id = k.selLink; setSelLink(null); void k.edit.unorder(id); return }
      const t = k.selected ? k.p.members.find((m) => m.id === k.selected) : undefined
      if (t) { e.preventDefault(); onSelect(null); void k.edit.out(t) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onSelect])

  // ── 칩 끌기(날짜·줄) ──
  const local = (cx: number, cy: number) => { const r = lanesRef.current!.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top } }
  const onChipDown = (e: RPointerEvent, it: Placed) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,input,.plan-tk__h')) return
    const d: Drag = { id: it.t.id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, on: false, pointerX: e.clientX, pointerY: e.clientY }
    dragRef.current = d
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (!cur) return
      const dx = ev.clientX - cur.sx, dy = ev.clientY - cur.sy
      const on = cur.on || Math.hypot(dx, dy) > 4
      const next = { ...cur, dx, dy, on, pointerX: ev.clientX, pointerY: ev.clientY }
      dragRef.current = next
      if (on) setDrag(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const cur = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!cur?.on) return
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      void finishDrag(it, cur)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  /** 끄는 동안 계산(미리 보기·놓기 같은 값) */
  const dropOf = (it: Placed, d: Drag) => {
    const pt = local(d.pointerX, d.pointerY)
    const kind = laneAt(pt.y, laneTop.list) ?? it.kind
    const done = it.t.status !== 0
    const inSomeday = layout.hasSomeday && pt.x > LANE_W + layout.trackW
    let day: string | null = it.day
    let change = null as ReturnType<typeof dateDrag>
    if (!done) {
      if (inSomeday) { day = null; change = dateDrag(it.t, { day: null }) }
      else if (it.someday) { day = layout.dayAt(pt.x); change = dateDrag(it.t, { day }) }
      else { const delta = dragDays(d.dx, layout.px); day = addDays(it.day!, delta); change = dateDrag(it.t, { delta }) }
    }
    return { kind, day, change, inSomeday, done }
  }
  const finishDrag = async (it: Placed, d: Drag) => {
    const r = dropOf(it, d)
    await edit.move(it.t, r.change, r.kind !== it.kind ? r.kind : null)
  }

  // ── 핸들로 순서 잇기 ──
  const onHandleDown = (e: RPointerEvent, it: Placed) => {
    e.preventDefault(); e.stopPropagation()
    const root = wrap.current!.getBoundingClientRect()
    const a = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const start = { from: it.t.id, x1: a.left + a.width / 2 - root.left, y1: a.top + a.height / 2 - root.top }
    let cur: Linking = { ...start, x2: start.x1, y2: start.y1, over: null }
    setLinking(cur)
    const move = (ev: PointerEvent) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-tid]')?.dataset.tid ?? null
      cur = { ...cur, x2: ev.clientX - root.left, y2: ev.clientY - root.top, over: over && over !== it.t.id ? over : null }
      setLinking(cur)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLinking((l) => { if (l?.over) void edit.order(l.from, l.over); return null })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── 빈 곳 더블클릭 = 새 할 일 ──
  const onLanesDbl = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.plan-tk,.plan-draft')) return
    const pt = local(e.clientX, e.clientY)
    if (pt.x < LANE_W) return
    const kind = laneAt(pt.y, laneTop.list) ?? 'other'
    const inSomeday = layout.hasSomeday && pt.x > LANE_W + layout.trackW
    const day = inSomeday ? null : layout.dayAt(pt.x)
    const top = (laneTop.m.get(kind) ?? 0) + 6
    setDraft({ x: inSomeday ? LANE_W + layout.trackW - 140 : Math.min(pt.x, LANE_W + layout.trackW - 190), y: top, day, kind })
  }
  // ── 할 일 넣기에서 끌어 온 할 일 놓기 ──
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(TASK_DND)) return
    e.preventDefault()
    setDropLane(laneAt(local(e.clientX, e.clientY).y, laneTop.list))
  }
  const onDrop = async (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DND)
    const kind = laneAt(local(e.clientX, e.clientY).y, laneTop.list)
    setDropLane(null)
    if (!id) return
    e.preventDefault()
    if (p.members.some((m) => m.id === id)) return
    await edit.add([id])
    const t = data.byId.get(id)
    if (t && kind && workKind(t.title) !== kind) await setWorkKind(id, kind)
  }

  const chip = (it: Placed, float?: { left: number; top: number; label: string | null }) => {
    const done = it.t.status !== 0
    const late = !done && !!it.t.due_at && it.t.due_at.slice(0, 10) < today
    const via = p.via.get(it.t.id)
    const isRen = renaming === it.t.id && !float
    const cls = [
      'plan-tk', done ? 'is-done' : 'is-open', via === 'auto' ? 'is-auto' : '',
      selected === it.t.id && !float ? 'is-selected' : '', float ? 'is-float' : '', !float && drag?.on && drag.id === it.t.id ? 'is-ghost' : '',
      linking?.over === it.t.id ? 'is-target' : '', autoOnly && via !== 'auto' ? 'is-faded' : '', isRen ? 'is-renaming' : ''
    ].filter(Boolean).join(' ')
    return (
      <div key={float ? 'float' : it.t.id} data-tid={float ? undefined : it.t.id} className={cls}
        style={float ? { left: float.left, top: float.top } : { left: it.x, top: laneTop.m.get(it.kind)! + 6 + it.row * ROW }}
        role="button" tabIndex={float ? -1 : 0} aria-label={it.t.title}
        onPointerDown={float ? undefined : (e) => onChipDown(e, it)}
        onClick={() => { if (!suppressClick.current) { setSelLink(null); onSelect(it.t.id) } }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelect(it.t.id) }}
        onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('.plan-tk__t')) { e.stopPropagation(); setRenaming(it.t.id) } }}
        onContextMenu={(e: MouseEvent) => { e.preventDefault(); setMenu({ t: it.t, point: { x: e.clientX, y: e.clientY } }) }}>
        <button className={`plan-tk__ck${done ? ' is-on' : ''}`} aria-label={done ? '완료 취소' : '완료'} tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); void edit.complete(it.t) }}>{done && <Check strokeWidth={3} />}</button>
        {isRen ? (
          <input autoFocus className="plan-tk__in" defaultValue={it.t.title} aria-label="이름 고치기"
            onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { void edit.rename(it.t, e.currentTarget.value); setRenaming(null) } else if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null) } }}
            onBlur={(e) => { void edit.rename(it.t, e.currentTarget.value); setRenaming(null) }} onClick={(e) => e.stopPropagation()} />
        ) : <span className="plan-tk__t">{it.t.title}</span>}
        {float ? (float.label && <em className="plan-tk__drop">{float.label}</em>) : it.day && <em className={late ? 'is-late' : ''}>{md(it.day)}</em>}
        {!float && !isRen && <>
          <span className="plan-tk__acts">
            {via === 'auto' && <button aria-label="맞아" title="맞아 — 이 프로젝트에 둬요" onClick={(e) => { e.stopPropagation(); void edit.confirm(it.t) }}><Check /></button>}
            <button aria-label="프로젝트에서 빼기" title="이 프로젝트에서 빼기(할 일은 그대로)" onClick={(e) => { e.stopPropagation(); void edit.out(it.t) }}><X /></button>
          </span>
          <i className="plan-tk__h" title="끌어서 다음 일과 잇기" onPointerDown={(e) => onHandleDown(e, it)} />
        </>}
      </div>
    )
  }

  const xToday = today >= layout.from && today <= layout.to ? layout.xOf(today) : null
  const xDl = p.deadline && p.deadline.day >= layout.from && p.deadline.day <= layout.to ? layout.xOf(p.deadline.day) : null
  // 끄는 칩 미리 보기
  let floatEl: React.ReactNode = null
  let targetLane: WorkKind | null = dropLane
  if (drag?.on) {
    const it = byId.get(drag.id)
    if (it) {
      const r = dropOf(it, drag)
      targetLane = r.kind
      const baseTop = laneTop.m.get(it.kind)! + 6 + it.row * ROW
      const pt = local(drag.pointerX, drag.pointerY)
      const left = r.done ? it.x : r.inSomeday ? LANE_W + layout.trackW + 8 : r.day ? Math.min(layout.xOf(r.day) - 5, LANE_W + layout.trackW - chipW(it.t) - 4) : it.x
      const label = r.done ? null : r.inSomeday ? '언젠가' : r.day ? md(r.day) : null
      floatEl = chip(it, { left, top: Math.max(-4, Math.min(laneTop.height - 26, baseTop + drag.dy)), label })
      void pt
    }
  }

  return (
    <div className="plan-proj__body">
      <div className={`plan-tl${drag?.on ? ' is-dragging' : ''}${linking ? ' is-linking' : ''}`} ref={wrap}>
        <div className="plan-tl__axis">
          {layout.ticks.map((t) => <span key={t.label + t.x} style={{ left: t.x }}>{t.label}</span>)}
          {layout.hasSomeday && <span className="is-someday" style={{ left: LANE_W + layout.trackW + 8 }}>언젠가</span>}
        </div>
        <div className="plan-tl__lanes" ref={lanesRef} style={{ height: Math.max(laneTop.height, 120) }} onDoubleClick={onLanesDbl}
          onDragOver={onDragOver} onDragLeave={() => setDropLane(null)} onDrop={(e) => void onDrop(e)}
          onClick={(e) => { if (!(e.target as HTMLElement).closest('.plan-tk')) setSelLink(null) }}>
          {layout.lanes.map((l) => (
            <div key={l.kind} className={`plan-lane${targetLane === l.kind ? ' is-drop' : ''}${!l.items.length ? ' is-empty' : ''}`} style={{ top: laneTop.m.get(l.kind), height: layout.laneRows.get(l.kind)! * ROW + 12 }}>
              <div className="plan-lane__n">{WORK_LABEL[l.kind]}<small>{l.items.length}</small></div>
            </div>
          ))}
          {layout.hasSomeday && <i className="plan-tl__somedayline" style={{ left: LANE_W + layout.trackW }} />}
          {xToday !== null && <div className="plan-vline is-today" style={{ left: xToday }}><span>오늘 {md(today)}</span></div>}
          {xDl !== null && p.deadline && <div className="plan-vline is-dl" style={{ left: xDl }}><span>⚑ {p.deadline.word} {md(p.deadline.day)}</span></div>}
          {layout.placed.map((it) => chip(it))}
          {floatEl}
          {draft && <DraftInput draft={draft} onClose={() => setDraft(null)} onSave={async (title) => {
            const kind = workKind(title) !== draft.kind ? draft.kind : null
            setDraft(null)
            const id = await edit.create(title, draft.day, kind)
            if (id) onSelect(id)
          }} />}
          {laneTop.height === 0 && <p className="plan-tl__hint">빈 곳을 두 번 눌러 할 일을 넣어요</p>}
        </div>
        <svg className="plan-rel" aria-hidden="true">
          <defs>
            <marker id="plan-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke" /></marker>
          </defs>
          {paths.map((q) => (
            <g key={q.key} className={`plan-rel__g${q.guess ? ' is-guess' : ''}${q.link && selLink === q.link.id ? ' is-sel' : ''}`}>
              <path d={q.d} className="plan-rel__line" markerEnd="url(#plan-ah)" />
              {q.link && <path d={q.d} className="plan-rel__hit" onClick={(e) => { e.stopPropagation(); setSelLink(q.link!.id) }}
                onContextMenu={(e) => { e.preventDefault(); setSelLink(q.link!.id); setLinkMenu({ ...q.link!, point: { x: e.clientX, y: e.clientY } }) }} />}
            </g>
          ))}
          {linking && <path className="plan-rel__draft" d={`M${linking.x1} ${linking.y1} L${linking.x2} ${linking.y2}`} markerEnd="url(#plan-ah)" />}
        </svg>
        {selLink && (() => { const q = paths.find((x) => x.link?.id === selLink); return q ? (
          <div className="plan-linkpill" style={{ left: q.mid.x, top: q.mid.y }}>
            <button onClick={() => { const l = q.link!; setSelLink(null); void edit.flip(l.id) }}>⇄ 방향</button>
            <button onClick={() => { const l = q.link!; setSelLink(null); void edit.toRelated(l.id, l.a, l.b) }}>관련으로</button>
            <button className="is-danger" onClick={() => { const l = q.link!; setSelLink(null); void edit.unorder(l.id) }}>끊기</button>
          </div>
        ) : null })()}
        <div className="plan-legend">
          <span><i className="plan-lgd is-done" />끝냄</span><span><i className="plan-lgd" />남음</span>
          {p.autoCount > 0 && <span><i className="plan-lgd is-auto" />자동으로 넣음(확인 전)</span>}
          <span><i className="plan-lgd is-rel" />먼저 해야 함{pairs.some((x) => x.guess) ? ' · 점선 = 추정' : ''}</span>
          <span className="plan-legend__tip">끌어서 날짜·줄 바꾸기 · 오른쪽 점을 끌어 잇기 · 빈 곳 두 번 눌러 새 할 일</span>
        </div>
      </div>
      <aside className="plan-side">
        {p.people.length > 0 && <section><h6>관련 사람</h6><div className="plan-side__rows">{p.people.map((x) => <button key={x.id} onClick={() => openTarget({ view: `tag:${x.id}` })}><span>{x.name}</span><small>{x.label}</small></button>)}</div></section>}
        {p.memos.length > 0 && <section><h6>관련 메모</h6><div className="plan-side__rows">{p.memos.map((m) => <button key={m.kind + m.id} onClick={() => m.kind === 'topic' ? openWikiTopic(m.id) : openTarget({ view: 'notes' })}><span>{m.title}</span><small>{m.kind === 'topic' ? '위키' : '수집함'}</small></button>)}</div></section>}
        {p.lists.length > 0 && <section><h6>리스트 {p.lists.length}곳에서 모음</h6><div className="plan-side__rows">{p.lists.map((l) => <button key={l.id} onClick={() => openTarget({ view: `list:${l.id}` })}><span>{l.emoji ? `${l.emoji} ` : ''}{l.name}</span><small>{l.count}</small></button>)}</div></section>}
        {!p.people.length && !p.memos.length && !p.lists.length && <p className="plan-side__none">관계도에서 사람·메모를 이을 수 있어요</p>}
      </aside>
      {menu && <ProjectTaskMenu all={data.projects} t={menu.t} p={p} edit={edit} point={menu.point} onOpen={() => onSelect(menu.t.id)} onClose={() => setMenu(undefined)} onRename={() => setRenaming(menu.t.id)} />}
      {linkMenu && (
        <Popover point={linkMenu.point} onClose={() => setLinkMenu(undefined)} className="menu" width={170}>
          <MenuItem label="방향 바꾸기" onClick={() => { const l = linkMenu; setLinkMenu(undefined); void edit.flip(l.id) }} />
          <MenuItem label="관련 선으로 바꾸기" onClick={() => { const l = linkMenu; setLinkMenu(undefined); void edit.toRelated(l.id, l.a, l.b) }} />
          <div className="menu__divider" />
          <MenuItem label="순서 끊기" danger onClick={() => { const l = linkMenu; setLinkMenu(undefined); setSelLink(null); void edit.unorder(l.id) }} />
        </Popover>
      )}
    </div>
  )
}

function DraftInput({ draft, onSave, onClose }: { draft: { x: number; y: number; day: string | null; kind: WorkKind }; onSave: (title: string) => void; onClose: () => void }) {
  const done = useRef(false)
  return (
    <div className="plan-draft" style={{ left: draft.x, top: draft.y }}>
      <input autoFocus placeholder={`새 할 일 · ${draft.day ? md(draft.day) : '날짜 없음'} · ${WORK_LABEL[draft.kind]}`} aria-label="새 할 일"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') { done.current = true; const v = e.currentTarget.value.trim(); if (v) onSave(v); else onClose() }
          else if (e.key === 'Escape') { e.stopPropagation(); done.current = true; onClose() }
        }}
        onBlur={(e) => { if (done.current) return; const v = e.currentTarget.value.trim(); if (v) onSave(v); else onClose() }} />
    </div>
  )
}
