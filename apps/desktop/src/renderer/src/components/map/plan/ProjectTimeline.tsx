// 31 §12.3 관계 타임라인 + §12.9.4 편집(틱틱 캘린더 끌기 말씨) + 41 §4~§6 직접 고치기.
// 가로 = 날짜(배율 주·월, 긴 프로젝트는 오늘로 스크롤), 세로 줄 = 태그(41 §4) 또는 일의 종류, 선 = 순서, 오늘·⚑ 핵심 날짜 세로선, 오른쪽 언젠가 칸, 옆 칸(사람·메모·리스트).
// 칩: 누르기 = 고르기 · 고른 칩 제목 다시 누르기/더블클릭/Enter = 그 자리 이름(끝에서 Enter = 같은 줄에 다음 것) · 날짜 글자 = 날짜 팝오버 ·
//     몸통 가로 끌기 = 날짜 · 세로 = 줄(태그 바꾸기/종류 덮어쓰기) · 끝 끌기 = 기간 · 고른 칩 하나를 끌면 모두 같이 · 바깥 오른쪽 점 → 다른 칩 = 순서 선.
// 줄(태그): ＋ 줄 추가 · 이름 누르기 = 태그 이름 고치기 · ✕ = 줄 지우기(태그는 남음) · 이름 칸 끌기 = 순서. `태그 없음`은 맨 아래, 비면 숨김.
import { Check, GripVertical, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { daysBetween, inferredChain, stackRows, taskDay, workKind, WORK_KINDS, WORK_LABEL, type WorkKind } from '@sprout/schema/projects'
import { chipResize, isSpan, laneHint, mdWeek, NO_LANE, type TagLane } from '@sprout/schema/planView'
import { setWorkKind } from '../../../data/projectEdit'
import { addLane, laneOutsideCount, moveToLane, removeLane, renameLane } from '../../../data/projectDirect'
import { openTarget, openWikiTopic } from '../../../data/wiki'
import { useQuery } from '../../../data/useQuery'
import { dayKey } from '../../../lib/dates'
import { dateDrag, dragDays } from '../../../lib/projectEdit'
import type { DragChange } from '../../../lib/calendarDrag'
import { DatePicker, EMPTY_SCHEDULE } from '../../DatePicker'
import { MenuItem, Popover } from '../../Popover'
import { useToast } from '../../Toast'
import { TASK_DND } from './ProjectBoard'
import { PanelClose } from '../../PanelClose'
import { useLocalState } from '../../../data/preferences'
import { DayPop, nextMonday } from './DirectBits'
import { ProjectTaskMenu, QuickAddInput, type ProjectEdit } from './edit'
import type { PlanData, ProjectView, PTaskRow } from './useProjects'
import './direct.css'

const LANE_W = 120
const SOMEDAY_W = 172
const SOMEDAY_MIN = 84
const ROW = 32
const CHIP_MAX = 160
const ZOOM_PX = { week: 40, month: 12 } as const
export type Zoom = keyof typeof ZOOM_PX
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
/** 점 칩 폭 어림(글자 수) — 겹침 쌓기용 */
const chipW = (t: PTaskRow) => Math.min(CHIP_MAX, 40 + [...t.title].length * 11.5 + (t.due_at || t.completed_at ? 28 : 0))
const typing = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.('input,textarea,[contenteditable],.app__detail,.pc,.popover')
/** 기본 배율: 오늘~끝(⚑ 핵심 날짜 포함)이 5주를 넘으면 월(한 화면에 보이게), 아니면 주 */
export const defaultZoom = (p: ProjectView): Zoom => {
  const today = dayKey()
  const days = [today, p.span?.from, p.span?.to, p.deadline?.day].filter((x): x is string => !!x).sort()
  return daysBetween(days[0], days[days.length - 1]) > 35 ? 'month' : 'week'
}

type LaneDef = { key: string; label: string; items: PTaskRow[]; tag?: TagLane; kind?: WorkKind }
type Placed = { t: PTaskRow; lane: string; s: string | null; e: string | null; bar: boolean; x: number; w: number; row: number; someday: boolean }
type Drag = { id: string; ids: string[]; mode: 'move' | 'start' | 'end'; sx: number; sy: number; dx: number; dy: number; on: boolean; px: number; py: number; offX: number; offY: number; left0: number }
type Linking = { from: string; x1: number; y1: number; x2: number; y2: number; over: string | null }
type Path = { key: string; d: string; guess: boolean; link?: { id: string; a: string; b: string }; mid: { x: number; y: number } }
const TOPIC_SQL = "SELECT id, name FROM tags WHERE COALESCE(kind, 'topic') = 'topic' AND name IS NOT NULL AND name != '' ORDER BY sort_order"

export function ProjectTimeline({ p, data, selected, onSelect, edit, autoOnly, picked = [], onPick, laneBy, zoom, onOrder, laneInput, onLaneInputClosed }: {
  p: ProjectView; data: PlanData; selected: string | null; onSelect: (id: string | null) => void; edit: ProjectEdit; autoOnly: boolean
  /** 31 §12.12.2 여러 개 고름 · 누름(⌘/Shift) */
  picked?: PTaskRow[]; onPick?: (id: string, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => void
  /** 41 §4.1 줄 기준 · 배율 · 줄 순서 저장 */
  laneBy: 'tag' | 'kind'; zoom: Zoom; onOrder: (order: string[]) => void
  /** 바깥(줄 나누기 제안 [＋ 과목 추가])에서 `＋ 줄 추가` 입력을 연다 — 값이 바뀔 때마다 */
  laneInput?: { n: number; placeholder?: string }; onLaneInputClosed?: () => void
}) {
  const toast = useToast()
  const pickedSet = useMemo(() => new Set(picked.map((t) => t.id)), [picked])
  const [laneAdd, setLaneAdd] = useState<{ key: string; day?: string | null } | null>(null)
  const today = dayKey()
  const wrap = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const somedayRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [scrollX, setScrollX] = useState(0)
  const [paths, setPaths] = useState<Path[]>([])
  const [menu, setMenu] = useState<{ t: PTaskRow; point: { x: number; y: number } }>()
  const [linkMenu, setLinkMenu] = useState<{ id: string; a: string; b: string; point: { x: number; y: number } }>()
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [linking, setLinking] = useState<Linking | null>(null)
  const [selLink, setSelLink] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; day: string | null; lane: string } | null>(null)
  const [dropLane, setDropLane] = useState<string | null>(null)
  const [datePop, setDatePop] = useState<{ t: PTaskRow; anchor: HTMLElement } | null>(null)
  const [fullDate, setFullDate] = useState<{ t: PTaskRow; anchor: HTMLElement } | null>(null)
  const [laneName, setLaneName] = useState<string | null>(null)
  const [laneDrag, setLaneDrag] = useState<{ key: string; y0: number; y: number } | null>(null)
  const [newLane, setNewLane] = useState<{ placeholder?: string } | null>(null)
  const suppressClick = useRef(false)
  const byTag = laneBy === 'tag'
  useEffect(() => { if (laneInput?.n) setNewLane({ placeholder: laneInput.placeholder }) }, [laneInput?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // ── 줄 ──
  const dragging = !!drag?.on && drag.mode === 'move'
  const laneOf = (t: PTaskRow) => (byTag ? p.tagLanes.laneOf.get(t.id) ?? NO_LANE : p.kindOf.get(t.id) ?? 'other')
  const lanes: LaneDef[] = useMemo(() => {
    if (byTag) {
      const all = p.tagLanes.lanes
      const only = all.length === 1
      return all.filter((l) => l.id !== NO_LANE || l.items.length || dragging || only).map((l) => ({ key: l.id, label: l.id === NO_LANE ? '태그 없음' : `#${l.name}`, items: l.items, tag: l }))
    }
    const shown = WORK_KINDS.filter((k) => p.members.some((m) => (p.kindOf.get(m.id) ?? 'other') === k))
    return WORK_KINDS.filter((k) => shown.includes(k) || dragging || (!shown.length && k === 'other'))
      .map((k) => ({ key: k, label: WORK_LABEL[k], kind: k, items: p.members.filter((m) => (p.kindOf.get(m.id) ?? 'other') === k) }))
  }, [p, byTag, dragging])

  // ── 배치 ──
  const layout = useMemo(() => {
    const someW = p.members.some((m) => !taskDay(m)) ? SOMEDAY_W : SOMEDAY_MIN
    const all: string[] = [today]
    for (const m of p.members) { const d = taskDay(m); if (d) all.push(d); if (m.start_at) all.push(m.start_at.slice(0, 10)) }
    if (p.deadline) all.push(p.deadline.day)
    all.sort()
    const from = addDays(all[0], -3), to = addDays(all[all.length - 1], 10)
    const days = Math.max(14, daysBetween(from, to) + 1)
    const avail = Math.max(240, width - LANE_W - someW)
    const px = Math.max(ZOOM_PX[zoom], avail / days)
    const trackW = Math.ceil(days * px)
    const xOf = (d: string) => LANE_W + (daysBetween(from, d) + 0.5) * px
    const leftOf = (d: string) => LANE_W + daysBetween(from, d) * px
    const dayAt = (x: number) => addDays(from, Math.max(0, Math.min(days - 1, Math.floor((x - LANE_W) / px))))
    const geo = (t: PTaskRow, s: string | null, e: string | null) => {
      const bar = !!s && !!e && s < e
      if (bar) return { x: leftOf(s!) + 2, w: Math.max(28, (daysBetween(s!, e!) + 1) * px - 4), bar }
      return { x: Math.min(xOf(e!) - 5, LANE_W + trackW - chipW(t) - 4), w: chipW(t), bar }
    }
    const dayOf = (t: PTaskRow) => { const e = taskDay(t); return { e, s: e && isSpan(t) ? t.start_at!.slice(0, 10) : e } }
    const placed: Placed[] = []
    const laneRows = new Map<string, number>()
    for (const lane of lanes) {
      const dated = lane.items.filter((t) => taskDay(t))
      const geos = dated.map((t) => { const { s, e } = dayOf(t); return { t, s, e, ...geo(t, s, e) } })
      const rows = stackRows(geos.map((g) => ({ id: g.t.id, x: g.x, w: g.w })))
      let n = 0
      for (const g of geos) { const r = rows.get(g.t.id)!; n = Math.max(n, r + 1); placed.push({ ...g, lane: lane.key, row: r, someday: false }) }
      const sd = lane.items.filter((t) => !taskDay(t))
      sd.forEach((t, k) => placed.push({ t, lane: lane.key, s: null, e: null, bar: false, x: 8, w: someW - 16, row: k, someday: true }))
      laneRows.set(lane.key, Math.max(1, n, sd.length) + 1) // +1 = 맨 아래 `＋ 할 일 추가` 행(§12.12.1)
    }
    const ticks: { x: number; label: string; major: boolean }[] = []
    const marks = [today, p.deadline?.day].filter((x): x is string => !!x && x >= from && x <= to).map(xOf)
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const dd = Number(d.slice(8, 10)), wd = new Date(`${d}T00:00:00Z`).getUTCDay()
      const label = px >= 24 ? (wd === 1 ? md(d) : '') : (dd === 1 ? `${Number(d.slice(5, 7))}월` : dd === 15 ? md(d) : '')
      if (!label) continue
      const x = xOf(d)
      if (!marks.some((m) => x > m - 34 && x < m + 70)) ticks.push({ x, label, major: dd === 1 })
    }
    return { placed, laneRows, ticks, xOf, leftOf, dayAt, geo, from, to, trackW, px, someW, avail }
  }, [p, lanes, width, today, zoom])

  const laneTop = useMemo(() => {
    const m = new Map<string, number>()
    const list: { key: string; top: number; height: number }[] = []
    let y = 0
    for (const l of lanes) { const h = layout.laneRows.get(l.key)! * ROW + 12; m.set(l.key, y); list.push({ key: l.key, top: y, height: h }); y += h }
    return { m, list, height: y }
  }, [lanes, layout])
  const laneAtY = (y: number) => { const l = laneTop.list; if (!l.length) return null; for (const x of l) if (y >= x.top && y < x.top + x.height) return x.key; return y < l[0].top ? l[0].key : l[l.length - 1].key }
  const byId = useMemo(() => new Map(layout.placed.map((x) => [x.t.id, x])), [layout])

  // 처음 열 때·배율을 바꿀 때 오늘이 보이게(왼쪽에서 1/4)
  const scrolledFor = useRef('')
  useLayoutEffect(() => {
    const el = scroller.current
    const key = `${p.tag.id}|${zoom}`
    if (!el || scrolledFor.current === key || width < 300) return
    scrolledFor.current = key
    el.scrollLeft = Math.max(0, layout.xOf(today) - LANE_W - layout.avail * 0.25)
    setScrollX(el.scrollLeft)
  }, [p.tag.id, zoom, layout, today, width])
  const raf = useRef(0)
  const onScroll = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => setScrollX(scroller.current?.scrollLeft ?? 0)) }

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
    const box = (id: string) => root.querySelector<HTMLElement>(`[data-tid="${id}"]`)?.getBoundingClientRect()
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
  }, [pairs, layout, laneTop, byId, renaming, scrollX])

  // ── 키보드: Delete = 선 끊기 · Esc = 끌기 취소·선택 풀기 ──
  const keyState = useRef({ selLink, edit, drag, linking, laneDrag })
  keyState.current = { selLink, edit, drag, linking, laneDrag }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = keyState.current
      if (e.key === 'Escape') {
        if (k.drag || k.linking || k.laneDrag) { e.preventDefault(); e.stopImmediatePropagation(); dragRef.current = null; setDrag(null); setLinking(null); setLaneDrag(null); return }
        if (k.selLink) { e.stopImmediatePropagation(); setSelLink(null) }
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (typing(e.target) || document.querySelector('.popover,[aria-modal="true"]')) return
      if (k.selLink) { e.preventDefault(); const id = k.selLink; setSelLink(null); void k.edit.unorder(id) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  // ── 칩 끌기(몸통 = 날짜·줄, 끝 = 기간) ──
  const local = (cx: number, cy: number) => { const r = lanesRef.current!.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top } }
  const inSomedayAt = (cx: number) => { const r = somedayRef.current?.getBoundingClientRect(); return !!r && cx >= r.left }
  const startDrag = (e: RPointerEvent, it: Placed, mode: Drag['mode']) => {
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('.plan-tk')!
    const r = el.getBoundingClientRect()
    const group = mode === 'move' && pickedSet.has(it.t.id) && picked.length > 1 ? picked.map((x) => x.id) : [it.t.id]
    const d: Drag = { id: it.t.id, ids: group, mode, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, on: false, px: e.clientX, py: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, left0: r.left }
    dragRef.current = d
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (!cur) return
      const dx = ev.clientX - cur.sx, dy = ev.clientY - cur.sy
      const on = cur.on || Math.hypot(dx, dy) > 4
      const next = { ...cur, dx, dy, on, px: ev.clientX, py: ev.clientY }
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
      if (cur.mode === 'move') void finishMove(it, cur)
      else { const c = resizeOf(it, cur); if (c) void edit.resize(c) }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onChipDown = (e: RPointerEvent, it: Placed) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,input,em,.plan-tk__h,.plan-tk__e')) return
    startDrag(e, it, 'move')
  }
  const onEdgeDown = (e: RPointerEvent, it: Placed, edge: 'start' | 'end') => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    startDrag(e, it, edge)
  }
  /** 끝 끌기 결과 */
  const resizeOf = (it: Placed, d: Drag) => {
    if (!it.e) return null
    const delta = dragDays(d.dx, layout.px)
    const base = d.mode === 'end' ? it.e : (it.s ?? it.e)
    return chipResize(it.t, d.mode === 'end' ? 'end' : 'start', addDays(base, delta))
  }
  /** 몸통 끌기 결과(미리 보기·놓기 같은 값) — 고른 것 모두 같은 날 수 */
  const dropOf = (it: Placed, d: Drag) => {
    const pt = local(d.px, d.py)
    const lane = laneAtY(pt.y) ?? it.lane
    const inSomeday = inSomedayAt(d.px)
    const group = d.ids.map((id) => p.members.find((m) => m.id === id)).filter((x): x is PTaskRow => !!x)
    const open = group.filter((t) => t.status === 0)
    let changes: DragChange[] = []
    let day: string | null = it.e
    let delta = 0
    if (inSomeday) { changes = open.map((t) => dateDrag(t, { day: null })).filter((c): c is DragChange => !!c); day = null }
    else if (it.someday) { day = layout.dayAt(pt.x); changes = open.map((t) => dateDrag(t, { day })).filter((c): c is DragChange => !!c) }
    else { delta = dragDays(d.dx, layout.px); day = addDays(it.e!, delta); changes = open.map((t) => dateDrag(t, { delta })).filter((c): c is DragChange => !!c) }
    if (it.t.status !== 0) { day = it.e; delta = 0 }
    return { lane, day, delta, changes, inSomeday, group }
  }
  const finishMove = async (it: Placed, d: Drag) => {
    const r = dropOf(it, d)
    const laneChanged = r.lane !== it.lane
    await edit.moveMany(r.group, r.changes, laneChanged ? (byTag ? { tag: r.lane } : { kind: r.lane as WorkKind }) : {})
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

  // ── 줄 이름 칸 끌기 = 줄 순서(태그 줄만) ──
  const tagKeys = lanes.filter((l) => l.key !== NO_LANE).map((l) => l.key)
  const onLaneGrip = (e: RPointerEvent, key: string) => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const y0 = local(e.clientX, e.clientY).y
    let cur = { key, y0, y: y0 }
    setLaneDrag(cur)
    const move = (ev: PointerEvent) => { cur = { ...cur, y: local(ev.clientX, ev.clientY).y }; setLaneDrag(cur) }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLaneDrag(null)
      const to = laneAtY(cur.y)
      if (!to || to === key || to === NO_LANE || Math.abs(cur.y - cur.y0) < 6) return
      const order = tagKeys.filter((k) => k !== key)
      order.splice(order.indexOf(to) + (tagKeys.indexOf(to) > tagKeys.indexOf(key) ? 1 : 0), 0, key)
      onOrder(order)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── 빈 곳 더블클릭 = 새 할 일 ──
  const onLanesDbl = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.plan-tk,.plan-draft,.plan-lane__h,.plan-newlane')) return
    const pt = local(e.clientX, e.clientY)
    if (pt.x < scrollX + LANE_W) return
    const lane = laneAtY(pt.y) ?? lanes[0]?.key
    if (!lane) return
    const day = layout.dayAt(pt.x)
    setDraft({ x: Math.min(pt.x, scrollX + layout.avail + LANE_W - 230), y: (laneTop.m.get(lane) ?? 0) + 6, day, lane })
  }
  const onDraftSave = async (raw: string, at: { day: string | null; lane: string }) => {
    const id = await edit.quick(raw, byTag ? { day: at.day, laneTag: at.lane === NO_LANE ? null : at.lane } : { day: at.day, kind: at.lane as WorkKind })
    if (id) onSelect(id)
  }
  // ── 할 일 넣기에서 끌어 온 할 일 놓기 ──
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(TASK_DND)) return
    e.preventDefault()
    setDropLane(laneAtY(local(e.clientX, e.clientY).y))
  }
  const onDrop = async (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DND)
    const lane = laneAtY(local(e.clientX, e.clientY).y)
    setDropLane(null)
    if (!id) return
    e.preventDefault()
    if (p.members.some((m) => m.id === id)) return
    await edit.add([id])
    const t = data.byId.get(id)
    if (!t || !lane) return
    if (byTag) { if (lane !== NO_LANE) await moveToLane([{ id, tags: [], from: NO_LANE }], lane) }
    else if (workKind(t.title) !== lane) await setWorkKind(id, lane as WorkKind)
  }

  const laneKeyMove = (lane: string) => (byTag ? { laneTag: lane === NO_LANE ? null : lane } : { kind: lane as WorkKind })

  const chip = (it: Placed, opts: { float?: { left: number; top: number; label: string | null }; prev?: DragChange | null } = {}) => {
    const { float, prev } = opts
    const done = it.t.status !== 0
    const late = !done && !!it.t.due_at && it.t.due_at.slice(0, 10) < today
    const via = p.via.get(it.t.id)
    const isRen = renaming === it.t.id && !float
    const isKey = p.keyTask?.id === it.t.id
    const sel = (selected === it.t.id || pickedSet.has(it.t.id)) && !float
    const ghost = !float && drag?.on && drag.mode === 'move' && drag.ids.includes(it.t.id)
    // 끝 끌기 중이면 그 칩은 바뀐 기간으로 그린다
    let x = it.x, w = it.w, bar = it.bar, s = it.s, e = it.e
    if (prev && !float) {
      const ns = prev.start_at?.slice(0, 10) ?? null, ne = prev.due_at!.slice(0, 10)
      const g = layout.geo(it.t, ns ?? ne, ne); x = g.x; w = g.w; bar = g.bar; s = ns ?? ne; e = ne
    }
    const cls = [
      'plan-tk', done ? 'is-done' : 'is-open', via === 'auto' ? 'is-auto' : '', bar ? 'is-bar' : '', isKey ? 'is-key' : '',
      sel ? 'is-selected' : '', float ? 'is-float' : '', ghost ? 'is-ghost' : '', prev ? 'is-resize' : '',
      linking?.over === it.t.id ? 'is-target' : '', autoOnly && via !== 'auto' ? 'is-faded' : '', isRen ? 'is-renaming' : ''
    ].filter(Boolean).join(' ')
    const top = (laneTop.m.get(it.lane) ?? 0) + 6 + it.row * ROW
    const style: React.CSSProperties = float ? { position: 'fixed', left: float.left, top: float.top, maxWidth: 420 } : it.someday ? { left: 8, top, width: it.w, maxWidth: it.w } : bar ? { left: x, top, ['--w' as string]: `${w}px` } : { left: x, top }
    const more = p.tagLanes.more.get(it.t.id)
    // 기간 막대가 좁으면(월 배율) 날짜 글자를 빼서 제목 자리를 둔다 — 막대 길이가 곧 기간
    const dateText = s && e && s < e ? (w >= 120 ? `~${md(e)}` : null) : e ? md(e) : null
    const canEdge = !done && !isKey && !it.someday && !float && !isRen
    return (
      <div key={float ? 'float' : it.t.id} data-tid={float ? undefined : it.t.id} className={cls} style={style} title={bar && !float ? `${it.t.title} · ${s ? md(s) : ''}–${e ? md(e) : ''}` : undefined}
        role="button" tabIndex={float ? -1 : 0} aria-label={it.t.title}
        onPointerDown={float ? undefined : (ev) => onChipDown(ev, it)}
        onClick={(ev) => {
          if (suppressClick.current) return
          setSelLink(null)
          // 41 §5 고른 칩의 제목을 한 번 더 누르면 그 자리에서 이름 고치기
          const plain = !ev.metaKey && !ev.ctrlKey && !ev.shiftKey
          if (plain && selected === it.t.id && !picked.length && (ev.target as HTMLElement).closest('.plan-tk__t')) { setRenaming(it.t.id); return }
          if (onPick) onPick(it.t.id, ev); else onSelect(it.t.id)
        }}
        onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) { if (selected === it.t.id) setRenaming(it.t.id); else onSelect(it.t.id) } }}
        onDoubleClick={(ev) => { if ((ev.target as HTMLElement).closest('.plan-tk__t')) { ev.stopPropagation(); setRenaming(it.t.id) } }}
        onContextMenu={(ev: MouseEvent) => { ev.preventDefault(); setMenu({ t: it.t, point: { x: ev.clientX, y: ev.clientY } }) }}>
        {isKey ? <span className="plan-tk__flag" aria-label="핵심 날짜">⚑</span> : (
          <button className={`plan-tk__ck${done ? ' is-on' : ''}`} aria-label={done ? '완료 취소' : '완료'} tabIndex={-1}
            onClick={(ev) => { ev.stopPropagation(); void edit.complete(it.t) }}>{done && <Check strokeWidth={3} />}</button>
        )}
        {isRen ? (
          <input autoFocus className="plan-tk__in" defaultValue={it.t.title} aria-label="이름 고치기"
            onKeyDown={(ev) => {
              if (ev.nativeEvent.isComposing) return
              if (ev.key === 'Enter') {
                const el = ev.currentTarget
                const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length
                void edit.rename(it.t, el.value); setRenaming(null)
                // 끝에서 Enter = 같은 줄 `＋ 할 일 추가`(날짜 기본값 = 이 칩의 날짜)
                if (atEnd) setLaneAdd({ key: it.lane, day: it.e })
              } else if (ev.key === 'Escape') { ev.stopPropagation(); setRenaming(null) }
            }}
            onBlur={(ev) => { if (renaming === it.t.id) { void edit.rename(it.t, ev.currentTarget.value); setRenaming(null) } }} onClick={(ev) => ev.stopPropagation()} onPointerDown={(ev) => ev.stopPropagation()} />
        ) : <span className="plan-tk__t">{it.t.title}</span>}
        {float ? (float.label && <em className="plan-tk__drop">{float.label}</em>)
          : dateText && <em className={`plan-tk__d${late ? ' is-late' : ''}`} title="눌러서 날짜 고르기"
              onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); setDatePop({ t: it.t, anchor: ev.currentTarget }) }}>{dateText}</em>}
        {more && !float && <span className="plan-tk__more" title={`줄 태그 ${more + 1}개 — 앞 줄에만 보여요`}>+{more}</span>}
        {prev && <span className="plan-tk__tip">{s && e && s < e ? `${md(s)}–${md(e)}` : e ? md(e) : ''}</span>}
        {!float && !isRen && <>
          <span className="plan-tk__acts">
            {via === 'auto' && <button aria-label="맞아" title="맞아 — 이 프로젝트에 둬요" onClick={(ev) => { ev.stopPropagation(); void edit.confirm(it.t) }}><Check /></button>}
            {via === 'auto' && <button aria-label="프로젝트에서 빼기" title="이 프로젝트에서 빼기 — 리스트엔 남아요" onClick={(ev) => { ev.stopPropagation(); void edit.out(it.t) }}><X /></button>}
            <button aria-label="메뉴" title="메뉴 — 날짜·우선순위·빼기·삭제" onClick={(ev) => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); setMenu({ t: it.t, point: { x: r.left, y: r.bottom + 4 } }) }}><MoreHorizontal /></button>
            <button aria-label="삭제" title={isKey ? '핵심 날짜는 머리의 ⚑ 알약에서 지워요' : '삭제 — 휴지통으로 (Delete)'} className="is-danger" onClick={(ev) => {
              ev.stopPropagation()
              if (isKey) { toast.show('핵심 날짜는 머리의 ⚑ 알약에서 지워요'); return }
              void edit.trash(pickedSet.has(it.t.id) && picked.length > 1 ? picked : [it.t])
            }}><Trash2 /></button>
          </span>
          {canEdge && <>
            <i className="plan-tk__e is-l" title="끌어서 시작일" onPointerDown={(ev) => onEdgeDown(ev, it, 'start')} />
            <i className="plan-tk__e is-r" title="끌어서 끝날 — 기간이 돼요" onPointerDown={(ev) => onEdgeDown(ev, it, 'end')} />
          </>}
          {!it.someday && <i className="plan-tk__h" title="끌어서 다음 일과 잇기" onPointerDown={(ev) => onHandleDown(ev, it)} />}
        </>}
      </div>
    )
  }

  const xToday = today >= layout.from && today <= layout.to ? layout.xOf(today) : null
  const xDl = p.deadline && p.deadline.day >= layout.from && p.deadline.day <= layout.to ? layout.xOf(p.deadline.day) : null
  // 끄는 칩 미리 보기(화면 고정 좌표)
  let floatEl: React.ReactNode = null
  let targetLane: string | null = dropLane
  let resizeId: string | null = null, resizeChange: DragChange | null = null
  if (drag?.on) {
    const it = byId.get(drag.id)
    if (it && drag.mode === 'move') {
      const r = dropOf(it, drag)
      targetLane = r.lane
      const someR = somedayRef.current?.getBoundingClientRect()
      const left = r.inSomeday && someR ? someR.left + 8 : it.someday ? drag.px - drag.offX : drag.left0 + r.delta * layout.px
      const n = r.group.length > 1 ? ` · ${r.group.length}개` : ''
      const label = it.t.status !== 0 ? (n ? n.slice(3) : null) : r.inSomeday ? `언젠가${n}` : r.day ? `${mdWeek(r.day)}${n}` : null
      floatEl = chip(it, { float: { left, top: drag.py - drag.offY, label } })
    } else if (it) { resizeId = it.t.id; resizeChange = resizeOf(it, drag) }
  }
  if (laneDrag) targetLane = laneAtY(laneDrag.y)

  const memberIds = p.members.map((m) => m.id)
  const hint = byTag ? (() => { const none = p.tagLanes.lanes.find((l) => l.id === NO_LANE); return none && none.items.length >= 3 ? laneHint(none.items.filter((t) => t.id !== p.keyTask?.id), p.tagLanes.lanes.map((l) => l.name)) : null })() : null
  const makeHintLane = async (word: string) => {
    const none = p.tagLanes.lanes.find((l) => l.id === NO_LANE)
    const made = await addLane(p.tag.id, word)
    if (!made) return
    const items = (none?.items ?? []).filter((t) => t.title.includes(word))
    const u = await moveToLane(items.map((t) => ({ id: t.id, tags: [], from: NO_LANE })), made.tagId)
    toast.show(`'#${made.name}' 줄을 만들고 ${items.length}개를 옮겼어요`, async () => { await u(); await made.undo() })
  }
  const dropLaneRow = async (l: LaneDef) => {
    if (!l.tag || l.key === NO_LANE) return
    const r = await removeLane(p.tag.id, l.key, memberIds)
    toast.show(`'#${l.tag.name}' 줄을 지웠어요${r.n ? ` · 할 일 ${r.n}개는 태그 없음으로` : ''} · 태그는 남아요`, r.undo)
  }

  const [sideOpen, setSideOpen] = useLocalState('sprout.map.planSide.open', true)
  const innerW = LANE_W + layout.trackW
  const lanesH = Math.max(laneTop.height + (byTag ? 40 : 34), 120)
  const addLeft = scrollX + LANE_W + 6
  return (
    <div className={`plan-proj__body${sideOpen ? '' : ' is-side-closed'}`}>
      <div className={`plan-tl${drag?.on ? ' is-dragging' : ''}${linking ? ' is-linking' : ''}${laneDrag ? ' is-lanedrag' : ''}`} ref={wrap}>
        <div className="plan-tl__scroll" ref={scroller} onScroll={onScroll} style={{ marginRight: layout.someW }}>
          <div className="plan-tl__inner" style={{ width: innerW }}>
            <div className="plan-tl__axis">
              <span className="plan-tl__corner" style={{ left: scrollX }} />
              {layout.ticks.map((t) => <span key={t.label + t.x} className={t.major ? 'is-major' : ''} style={{ left: t.x }}>{t.label}</span>)}
            </div>
            <div className="plan-tl__lanes" ref={lanesRef} style={{ height: lanesH }} onDoubleClick={onLanesDbl}
              onDragOver={onDragOver} onDragLeave={() => setDropLane(null)} onDrop={(e) => void onDrop(e)}
              onClick={(e) => { if (!(e.target as HTMLElement).closest('.plan-tk')) setSelLink(null) }}>
              {lanes.map((l) => (
                <div key={l.key} className={`plan-lane${targetLane === l.key ? ' is-drop' : ''}${!l.items.length ? ' is-empty' : ''}${laneDrag?.key === l.key ? ' is-moving' : ''}`}
                  style={{ top: laneTop.m.get(l.key), height: layout.laneRows.get(l.key)! * ROW + 12 }}>
                  <div className="plan-lane__h">
                    {byTag && l.key !== NO_LANE && <i className="plan-lane__grip" title="끌어서 줄 순서 바꾸기" onPointerDown={(e) => onLaneGrip(e, l.key)}><GripVertical /></i>}
                    {laneName === l.key && l.tag
                      ? <LaneRename p={p} lane={l.tag} memberIds={memberIds} onDone={() => setLaneName(null)} />
                      : <button className={`plan-lane__n${byTag && l.key !== NO_LANE ? ' is-edit' : ''}`} title={byTag && l.key !== NO_LANE ? '눌러서 태그 이름 고치기' : undefined}
                          onClick={() => { if (byTag && l.key !== NO_LANE) setLaneName(l.key) }} onDoubleClick={(e) => e.stopPropagation()}>{l.label}</button>}
                    <small className="plan-lane__c">{l.items.length}</small>
                    {byTag && l.key !== NO_LANE && laneName !== l.key && <button className="plan-lane__x" aria-label="줄 지우기" title="줄 지우기 — 태그는 남아요" onClick={() => void dropLaneRow(l)}><X /></button>}
                  </div>
                </div>
              ))}
              {!drag?.on && lanes.map((l) => {
                const top = (laneTop.m.get(l.key) ?? 0) + 6 + (layout.laneRows.get(l.key)! - 1) * ROW
                return laneAdd?.key === l.key
                  ? <QuickAddInput key={`add-${l.key}`} className="plan-qa--lane" placeholder={`${l.label}에 새 할 일 · '10/12~10/18'처럼 날짜도`}
                      style={{ left: addLeft, top: top - 3 }} onClose={() => setLaneAdd(null)} onSubmit={(raw) => edit.quick(raw, { ...laneKeyMove(l.key), day: laneAdd.day ?? null })} />
                  : <button key={`add-${l.key}`} className="plan-laneadd" style={{ left: addLeft, top }} onClick={(e) => { e.stopPropagation(); setLaneAdd({ key: l.key }) }} onDoubleClick={(e) => e.stopPropagation()}>
                      <Plus />할 일 추가
                    </button>
              })}
              {hint && !drag?.on && (() => { const top = (laneTop.m.get(NO_LANE) ?? -999) + 6 + (layout.laneRows.get(NO_LANE)! - 1) * ROW; return top < 0 ? null : (
                <span className="plan-lanehint" style={{ left: addLeft + 110, top: top + 3 }}>‘{hint.word}’로 줄을 만들까요? {hint.n}개 <button onClick={() => void makeHintLane(hint.word)}>만들기</button></span>) })()}
              <div className="plan-newlane" style={{ top: laneTop.height, left: scrollX, width: Math.min(layout.avail + LANE_W, innerW) }}>
                {byTag
                  ? newLane ? <NewLaneInput p={p} placeholder={newLane.placeholder} onClose={() => { setNewLane(null); onLaneInputClosed?.() }} onMade={(id) => { setNewLane(null); onLaneInputClosed?.(); setLaneAdd({ key: id }) }} />
                    : <button onClick={() => setNewLane({})}><Plus />줄 추가</button>
                  : <small>일의 종류 줄은 정해져 있어요. 줄을 직접 만들려면 줄: 태그로 바꿔요.</small>}
              </div>
              {layout.placed.filter((it) => !it.someday).map((it) => chip(it, { prev: it.t.id === resizeId ? resizeChange : null }))}
              {draft && <DraftInput draft={draft} label={lanes.find((l) => l.key === draft.lane)?.label ?? ''} onClose={() => setDraft(null)} onSave={(raw) => { const d = draft; setDraft(null); void onDraftSave(raw, d) }} />}
            </div>
            {xToday !== null && <div className="plan-vline is-today" style={{ left: xToday }}><span>오늘 {md(today)}</span></div>}
            {xDl !== null && p.deadline && <div className="plan-vline is-dl" style={{ left: xDl, height: lanesH + 22 }}><span>⚑ {p.deadline.word} {md(p.deadline.day)}</span></div>}
          </div>
        </div>
        <div className="plan-tl__someday" ref={somedayRef} style={{ width: layout.someW }}>
          <div className="plan-tl__axis"><span className="is-someday">언젠가</span></div>
          <div className="plan-tl__sdlanes" style={{ height: lanesH }}>
            {lanes.map((l) => <div key={l.key} className={`plan-sdlane${targetLane === l.key && drag?.on && inSomedayAt(drag.px) ? ' is-drop' : ''}`} style={{ top: laneTop.m.get(l.key), height: layout.laneRows.get(l.key)! * ROW + 12 }} />)}
            {layout.placed.filter((it) => it.someday).map((it) => chip(it))}
          </div>
        </div>
        {floatEl}
        <svg className="plan-rel" aria-hidden="true" style={{ clipPath: `inset(0 0 0 ${LANE_W}px)` }}>
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
          <span><i className="plan-lgd is-done" />끝냄</span><span><i className="plan-lgd" />남음</span><span>⚑ 핵심 날짜</span>
          {p.autoCount > 0 && <span><i className="plan-lgd is-auto" />자동으로 넣음(확인 전)</span>}
          <span><i className="plan-lgd is-rel" />먼저 해야 함{pairs.some((x) => x.guess) ? ' · 점선 = 추정' : ''}</span>
          <span className="plan-legend__tip">＋로 추가 · 끌어서 날짜·줄 · 끝 끌기 = 기간 · 날짜 글자 = 날짜 고르기 · 고른 칩 제목 다시 누르기 = 이름 · ⌘누름 여러 개</span>
          {!sideOpen && <button className="plan-side__reopen" onClick={() => setSideOpen(true)}>관련 보기</button>}
        </div>
      </div>
      {sideOpen && <aside className="plan-side">
        {/* 01 §2.1 오른쪽 패널 닫기 — 닫은 상태는 기기에 기억(프로젝트마다 같게) */}
        <header className="plan-side__head"><h6>관련</h6><PanelClose onClose={() => setSideOpen(false)} label="관련 패널 닫기" /></header>
        {p.people.length > 0 && <section><h6>관련 사람</h6><div className="plan-side__rows">{p.people.map((x) => <button key={x.id} onClick={() => openTarget({ view: `tag:${x.id}` })}><span>{x.name}</span><small>{x.label}</small></button>)}</div></section>}
        {p.memos.length > 0 && <section><h6>관련 메모</h6><div className="plan-side__rows">{p.memos.map((m) => <button key={m.kind + m.id} onClick={() => m.kind === 'topic' ? openWikiTopic(m.id) : openTarget({ view: 'notes' })}><span>{m.title}</span><small>{m.kind === 'topic' ? '위키' : '수집함'}</small></button>)}</div></section>}
        {p.lists.length > 0 && <section><h6>리스트 {p.lists.length}곳에서 모음</h6><div className="plan-side__rows">{p.lists.map((l) => <button key={l.id} onClick={() => openTarget({ view: `list:${l.id}` })}><span>{l.emoji ? `${l.emoji} ` : ''}{l.name}</span><small>{l.count}</small></button>)}</div></section>}
        {!p.people.length && !p.memos.length && !p.lists.length && <p className="plan-side__none">관계도에서 사람·메모를 이을 수 있어요</p>}
      </aside>}
      {menu && <ProjectTaskMenu all={data.projects} t={menu.t} p={p} edit={edit} point={menu.point} many={picked} onOpen={() => onSelect(menu.t.id)} onClose={() => setMenu(undefined)} onRename={() => setRenaming(menu.t.id)} />}
      {linkMenu && (
        <Popover point={linkMenu.point} onClose={() => setLinkMenu(undefined)} className="menu" width={170}>
          <MenuItem label="방향 바꾸기" onClick={() => { const l = linkMenu; setLinkMenu(undefined); void edit.flip(l.id) }} />
          <MenuItem label="관련 선으로 바꾸기" onClick={() => { const l = linkMenu; setLinkMenu(undefined); void edit.toRelated(l.id, l.a, l.b) }} />
          <div className="menu__divider" />
          <MenuItem label="순서 끊기" danger onClick={() => { const l = linkMenu; setLinkMenu(undefined); setSelLink(null); void edit.unorder(l.id) }} />
        </Popover>
      )}
      {datePop && (() => {
        const t = datePop.t
        const cur = taskDay(t)
        const pick = (d: string | null) => { setDatePop(null); void edit.date(t, d) }
        return (
          <DayPop anchor={datePop.anchor} day={cur} onPick={(d) => pick(d)} onClose={() => setDatePop(null)}
            top={<>
              <MenuItem label="오늘" onClick={() => pick(today)} />
              <MenuItem label="내일" onClick={() => pick(dayKey(1))} />
              <MenuItem label="다음 주 월요일" onClick={() => pick(nextMonday())} />
              <div className="menu__divider" />
            </>}
            bottom={<>
              <div className="menu__divider" />
              <MenuItem label="시각·반복 ›" onClick={() => { const a = datePop.anchor; setDatePop(null); setFullDate({ t, anchor: a }) }} />
              <MenuItem label="날짜 지우기" disabled={p.keyTask?.id === t.id || (!t.due_at && !t.start_at)} onClick={() => pick(null)} />
              <p className="daypop__hint">칩 끝을 끌면 기간이 돼요</p>
            </>} />
        )
      })()}
      {fullDate && <DatePicker anchor={fullDate.anchor} initial={{ ...EMPTY_SCHEDULE, start_at: fullDate.t.start_at ?? null, due_at: fullDate.t.due_at ?? null, is_all_day: fullDate.t.due_at?.includes('T') ? 0 : 1 }}
        onSave={(s) => void edit.schedule(fullDate.t, s)} onClose={() => setFullDate(null)} />}
    </div>
  )
}

/** 줄 이름 그 자리 고치기(태그 이름) — 다른 곳에도 붙은 태그면 안내, 같은 이름 태그가 있으면 합치기 묻기 */
function LaneRename({ p, lane, memberIds, onDone }: { p: ProjectView; lane: TagLane; memberIds: string[]; onDone: () => void }) {
  const toast = useToast()
  const [v, setV] = useState(lane.name)
  const [outside, setOutside] = useState(0)
  const [conflict, setConflict] = useState<string | null>(null)
  const done = useRef(false)
  useEffect(() => { let on = true; void laneOutsideCount(lane.id, memberIds).then((n) => { if (on) setOutside(n) }); return () => { on = false } }, [lane.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (merge = false) => {
    const r = await renameLane(p.tag.id, lane.id, v, { merge })
    if (r.result === 'conflict') { setConflict(projectTitle2(r.into!.name)); return }
    done.current = true
    onDone()
    if (r.result === 'ok') toast.show(`'#${v.replace(/^#/, '').trim()}'(으)로 이름을 바꿨어요`, r.undo)
    if (r.result === 'merged') toast.show(`'#${projectTitle2(r.into!.name)}'와 합쳤어요`, r.undo)
  }
  return (
    <div className="plan-lane__ren" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <span className="plan-lane__hash">#</span>
      <input autoFocus value={v} aria-label="줄 이름" onChange={(e) => { setV(e.target.value); setConflict(null) }}
        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); void save() } else if (e.key === 'Escape') { e.stopPropagation(); done.current = true; onDone() } }}
        onBlur={() => { window.setTimeout(() => { if (!done.current && !conflict) void save() }, 120) }} />
      {(outside > 0 || conflict) && <div className="plan-lane__tip">
        {conflict ? <>'#{conflict}'와 합칠까요? <button onMouseDown={(e) => e.preventDefault()} onClick={() => void save(true)}>합치기</button><button onMouseDown={(e) => e.preventDefault()} onClick={() => { done.current = true; onDone() }}>취소</button></>
          : `다른 할 일 ${outside}개에도 붙어 있어요 — 모두 바뀌어요`}
      </div>}
    </div>
  )
}
const projectTitle2 = (n: string) => n.replace(/^(?:\p{Extended_Pictographic})️?\s*/u, '').trim()

/** `＋ 줄 추가` 입력: 앞에 `#`, 있는 태그 먼저 자동 완성(33 §6.2). Enter = 줄이 생기고 그 줄 `＋ 할 일 추가`로 */
function NewLaneInput({ p, placeholder, onClose, onMade }: { p: ProjectView; placeholder?: string; onClose: () => void; onMade: (tagId: string) => void }) {
  const toast = useToast()
  const tags = useQuery<{ id: string; name: string }>(TOPIC_SQL)
  const [v, setV] = useState('')
  const [hi, setHi] = useState(0)
  const busy = useRef(false)
  const taken = new Set(p.tagLanes.lanes.map((l) => l.id))
  const q = v.replace(/^#/, '').trim().toLowerCase()
  const sugg = q ? (tags ?? []).filter((t) => !taken.has(t.id) && t.name.toLowerCase().includes(q)).slice(0, 5) : []
  const make = async (name: string) => {
    if (!name.replace(/^#/, '').trim() || busy.current) { if (!name.trim()) onClose(); return }
    busy.current = true
    try {
      const r = await addLane(p.tag.id, name)
      if (!r) return
      toast.show(`'#${r.name}' 줄을 만들었어요`, r.undo)
      onMade(r.tagId)
    } finally { busy.current = false }
  }
  return (
    <span className="plan-newlane__in" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <span className="plan-lane__hash">#</span>
      <input autoFocus value={v} placeholder={placeholder ?? '줄 이름 (태그)'} aria-label="줄 이름"
        onChange={(e) => { setV(e.target.value); setHi(0) }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'ArrowDown' && sugg.length) { e.preventDefault(); setHi((h) => Math.min(sugg.length, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
          else if (e.key === 'Enter') { e.preventDefault(); void make(hi > 0 ? sugg[hi - 1].name : v) }
          else if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        }}
        onBlur={() => { window.setTimeout(() => { if (!busy.current) onClose() }, 150) }} />
      <small>Enter = 줄 만들기 · 있는 태그도 돼요</small>
      {sugg.length > 0 && <span className="plan-newlane__sugg" role="listbox">
        {sugg.map((t, i) => <button key={t.id} role="option" aria-selected={hi === i + 1} className={hi === i + 1 ? 'is-hi' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => void make(t.name)}>#{t.name}</button>)}
      </span>}
    </span>
  )
}

function DraftInput({ draft, label, onSave, onClose }: { draft: { x: number; y: number; day: string | null }; label: string; onSave: (title: string) => void; onClose: () => void }) {
  const done = useRef(false)
  return (
    <div className="plan-draft" style={{ left: draft.x, top: draft.y }}>
      <input autoFocus placeholder={`새 할 일 · ${draft.day ? md(draft.day) : '날짜 없음'} · ${label}`} aria-label="새 할 일"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') { done.current = true; const v = e.currentTarget.value.trim(); if (v) onSave(v); else onClose() }
          else if (e.key === 'Escape') { e.stopPropagation(); done.current = true; onClose() }
        }}
        onBlur={(e) => { if (done.current) return; const v = e.currentTarget.value.trim(); if (v) onSave(v); else onClose() }} />
    </div>
  )
}
