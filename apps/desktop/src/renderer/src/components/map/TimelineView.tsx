// 31 작업 지도 v3 §2 타임라인 보기 — 틱틱 타임라인(research 29): 일·주·월 배율, 막대 몸통 끌기 = 옮기기(시각까지), 가장자리 = 기간,
// 빈 곳 클릭 = 그 날짜로 새 할 일(06 빠른 만들기 팝오버), 빈 곳 끌기 = 가로 이동, 날짜 없는 할 일 = 오른쪽 할일 정렬 칸(06 §9 패널 그대로).
// [sprout] 순서 화살표(map_links) + 날짜가 순서와 어긋나면 경고색(자동으로 밀지 않음).
// 줄 묶기는 세 보기 공통 함수(data/mapGrouping: groupMap → mapRows), 날짜 쓰기는 캘린더 끌기와 같은 taskActions.reschedule(⌘Z 되돌리기).
import { Check, Repeat2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { addDays, datePart } from '@sprout/schema/time'
import { colorOf } from '../../lib/calendar'
import { dayKey } from '../../lib/dates'
import { checkboxColor } from '../../lib/priority'
import {
  arrowsOf, barOf, BAR_H, DAY_MIN, DAY_PX, draftAt, dragDates, fromMin, HEAD_H, headCells, isOverdue, isWeekend, minOf, nextScale, pageDays,
  rangeLabel, ROW_HEAD, rowAt, rowBoxes, toMin, visibleRange, windowAround, xOf, type Bar, type DragMode, type Scale
} from '../../lib/timeline'
import { groupMap, mapRows, type GroupBy, type MapRow } from '../../data/mapGrouping'
import { folderView, listTitle, type MapTask } from '../../data/map'
import { run, update } from '../../data/mutations'
import { useQuery } from '../../data/useQuery'
import type { ListRow, TagRow, TaskRow } from '../../data/types'
import type { TaskActions } from '../../lib/taskActions'
import { ArrangePanel } from '../calendar/ArrangePanel'
import { QuickCreate } from '../calendar/QuickCreate'
import { popoverOpen, quickCreateOpen } from '../calendar/dismiss'
import type { Draft, Rect } from '../calendar/types'
import { Resizer } from '../Resizer'
import { useToast } from '../Toast'
import type { LinkActions } from './MapGraph'
import { CardMenu, FolderIcon, ListIcon, NameInput, type MapActions } from './parts'
import type { TimelineNav } from './TimelineControls'
import { useStored, type MapData } from './useMapData'
import './timeline.css'

type Extra = { id: string; repeat_rule: string | null; tag_ids: string | null }
const EXTRA_SQL = `SELECT t.id, t.repeat_rule, (SELECT group_concat(tt.tag_id) FROM task_tags tt WHERE tt.task_id = t.id) AS tag_ids
  FROM tasks t WHERE t.deleted_at IS NULL AND t.due_at IS NOT NULL`
const NARROW = 900
type Placed = { task: MapTask; bar: Bar; row: number }
type Drag =
  | { kind: 'bar'; id: string; mode: DragMode; x0: number; y0: number; moved: boolean; delta: number; overPanel: boolean }
  | { kind: 'pan'; x0: number; y0: number; last: number; moved: boolean }
  | { kind: 'link'; from: string; x: number; y: number }
  | { kind: 'row'; id: string; x0: number; y0: number; moved: boolean; x: number; y: number; target?: string }
type Pending = { at: string; frac: number }

const pad = (n: number) => String(n).padStart(2, '0')
const nowFloating = () => { const d = new Date(); return `${dayKey()}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
const rowGoal = (key: string) => (key.startsWith('goal:') ? key.slice(5).split('/')[0] : null)

export function TimelineView({ data, actions, links, nav, lists, tags, taskActions, groupBy, only = null, collapsedKey = 'collapsed' }: {
  data: MapData; actions: MapActions; links: LinkActions; nav: TimelineNav; lists: ListRow[]; tags: TagRow[]; taskActions: TaskActions; groupBy: GroupBy; only?: string[] | null; collapsedKey?: string
}) {
  const toast = useToast()
  const scale = nav.scale
  const W = DAY_PX[scale]
  const today = dayKey()
  const [center, setCenter] = useState(today)
  const win = useMemo(() => windowAround(center, scale), [center, scale])
  const canvasW = win.days * W
  const scroller = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pending = useRef<Pending | null>({ at: nowFloating(), frac: 0.3 })
  const [scroll, setScroll] = useState({ left: 0, top: 0 })
  const [size, setSize] = useState({ w: 1000, h: 600, root: 1200 })
  const [collapsed, setCollapsed] = useStored<Record<string, boolean>>(collapsedKey, {})
  const [focus, setFocus] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag | undefined>(undefined)
  const [hover, setHover] = useState<{ row: number; min: number } | null>(null)
  const [hoverBar, setHoverBar] = useState<string | null>(null)
  const [create, setCreate] = useState<{ draft: Draft; rect: Rect; listId: string; goalId: string | null; row: number }>()
  const [menu, setMenu] = useState<{ task: MapTask; point: { x: number; y: number } }>()
  const [editing, setEditing] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const narrow = size.root < NARROW
  const rowHeadW = narrow ? ROW_HEAD.narrow : nav.rowHead
  const extras = useQuery<Extra>(EXTRA_SQL)
  const extra = useMemo(() => new Map((extras ?? []).map((e) => [e.id, e])), [extras])
  const tagColor = useCallback((id: string) => tags.find((t) => t.id === id)?.color, [tags])
  const listById = useMemo(() => new Map(data.lists.map((l) => [l.id, l])), [data.lists])
  const inboxId = data.inbox?.id ?? data.lists[0]?.id ?? ''

  // ── 줄: 날짜 있는 할 일만 축에(날짜 없는 할 일은 할일 정렬 칸) ──
  const dated = useMemo(() => data.tasks.filter((t) => t.due_at), [data.tasks])
  const rows = useMemo(() => {
    const grouped = groupMap(groupBy, { folders: data.folders, lists: data.lists, tasks: dated, links: data.links, goals: data.goals, only })
    return mapRows(grouped, collapsed)
  }, [groupBy, only, data.folders, data.lists, data.links, data.goals, dated, collapsed])
  const { boxes, height: rowsH } = useMemo(() => rowBoxes(rows.map((r) => (r.kind === 'task' ? 'task' : 'head'))), [rows])
  const states = data.state // 31 §1 지금·막힘·나중(useMapData가 mapNow.taskStates로 계산)

  const placed = useMemo(() => {
    const m = new Map<string, Placed>()
    rows.forEach((r, i) => {
      if (r.kind !== 'task') return
      const bar = barOf(r.task, scale, win.from)
      if (bar) m.set(r.task.id, { task: r.task, bar, row: i })
    })
    return m
  }, [rows, scale, win.from])
  const arrows = useMemo(() => (nav.arrows ? arrowsOf(data.links.filter((l) => l.kind === 'sequence'), new Map([...placed].map(([id, p]) => [id, p.bar]))) : []), [nav.arrows, data.links, placed])
  const warnOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of arrows) if (a.warn) m.set(a.to, data.byId.get(a.from)?.title ?? '')
    return m
  }, [arrows, data.byId])
  const taskRows = useMemo(() => rows.flatMap((r) => (r.kind === 'task' ? [r.task.id] : [])), [rows])

  // ── 크기·스크롤 ──
  useLayoutEffect(() => {
    const el = scroller.current
    const root = rootRef.current
    if (!el || !root) return
    const ro = new ResizeObserver(() => setSize({ w: Math.max(100, el.clientWidth - rowHeadW), h: el.clientHeight, root: root.clientWidth }))
    ro.observe(el)
    ro.observe(root)
    return () => ro.disconnect()
  }, [rowHeadW])
  // 창(win)이 바뀌면 기다리던 위치로(오늘·배율 바꿈·가장자리 이어 붙이기)
  useLayoutEffect(() => {
    const el = scroller.current
    const p = pending.current
    if (!el || !p) return
    pending.current = null
    el.scrollLeft = Math.max(0, xOf(toMin(p.at, win.from), scale) - p.frac * size.w)
    setScroll({ left: el.scrollLeft, top: el.scrollTop })
  }, [win.from, scale, size.w])
  const viewAt = (frac: number) => fromMin(minOf((scroller.current?.scrollLeft ?? 0) + frac * size.w, scale), win.from)
  const goTo = useCallback((at: string, frac: number) => {
    pending.current = { at, frac }
    const d = datePart(at)
    if (d === center) { const el = scroller.current; if (el) { el.scrollLeft = Math.max(0, xOf(toMin(at, win.from), scale) - frac * size.w); pending.current = null } }
    else setCenter(d)
  }, [center, win.from, scale, size.w])
  const onScroll = () => {
    const el = scroller.current!
    setScroll({ left: el.scrollLeft, top: el.scrollTop })
    // 가장자리에 가까우면 창을 옮겨 이어 그린다(무한 가로 스크롤)
    if (dragRef.current?.kind === 'bar' || dragRef.current?.kind === 'link') return
    if (el.scrollLeft < size.w * 0.5 || el.scrollLeft > canvasW - size.w * 1.5) {
      const at = viewAt(0.5)
      if (datePart(at) !== center) { pending.current = { at, frac: 0.5 }; setCenter(datePart(at)) }
    }
  }

  // 배율이 바뀌면 가운데 날짜를 고정한다(31 §2.5)
  const prevScale = useRef(scale)
  const lastCenterAt = useRef<string>(nowFloating())
  useEffect(() => { lastCenterAt.current = viewAt(0.5) })
  useLayoutEffect(() => {
    if (prevScale.current === scale) return
    prevScale.current = scale
    goTo(lastCenterAt.current, 0.5)
  }, [scale]) // eslint-disable-line react-hooks/exhaustive-deps

  // 머리 버튼 명령: 오늘 · ‹ ›
  useEffect(() => {
    const c = nav.cmd
    if (!c) return
    if (c.kind === 'today') goTo(nowFloating(), 0.3)
    else {
      const el = scroller.current
      if (el) el.scrollBy({ left: c.dir * pageDays(size.w, scale) * W, behavior: 'smooth' })
    }
  }, [nav.cmd]) // eslint-disable-line react-hooks/exhaustive-deps

  // 선택(띠 알약·상세)이 바뀌면 그 막대가 보이게
  const reveal = useCallback((id: string) => {
    const p = placed.get(id)
    const el = scroller.current
    if (!p || !el) return
    const b = boxes[p.row]
    if (b.top < el.scrollTop || b.top + b.height > el.scrollTop + el.clientHeight - HEAD_H) el.scrollTop = Math.max(0, b.top - (el.clientHeight - HEAD_H) / 2)
    const x1 = xOf(p.bar.start, scale)
    const x2 = xOf(p.bar.end, scale)
    if (x2 < el.scrollLeft || x1 > el.scrollLeft + size.w) goTo(fromMin(p.bar.start, win.from), 0.25)
  }, [placed, boxes, scale, size.w, goTo, win.from])
  useEffect(() => { if (actions.selected) { setFocus(actions.selected); reveal(actions.selected) } }, [actions.selected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 좌표 ──
  const local = (cx: number, cy: number) => {
    const r = bodyRef.current!.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top }
  }
  const rowListId = (r: MapRow | undefined): string => {
    if (!r) return inboxId
    if (r.kind === 'task') return r.listId || inboxId
    if (r.kind === 'list') return r.list.id
    return inboxId
  }

  // ── 막대 끌기 (몸통·가장자리) ──
  const startBar = (e: RPointerEvent, p: Placed) => {
    if (e.button !== 0) return
    if (quickCreateOpen()) return // 06 §14.2: 빠른 만들기가 떠 있으면 닫기만(쓴 제목을 잃지 않게)
    if (editing === p.task.id) return
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    const r = el.getBoundingClientRect()
    const off = e.clientX - r.left
    const edge = Math.min(6, r.width / 4)
    const mode: DragMode = p.task.status !== 0 ? 'move' : off <= edge ? 'start' : off >= r.width - edge ? 'end' : 'move'
    const d: Drag = { kind: 'bar', id: p.task.id, mode, x0: e.clientX, y0: e.clientY, moved: false, delta: 0, overPanel: false }
    dragRef.current = d
    setDrag(d)
    document.body.classList.add('is-dragging')
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (cur?.kind !== 'bar') return
      const moved = cur.moved || Math.hypot(ev.clientX - cur.x0, ev.clientY - cur.y0) > 4
      const overPanel = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.arrange-panel')
      const next: Drag = { ...cur, moved, delta: minOf(ev.clientX - cur.x0, scale), overPanel }
      dragRef.current = next
      setDrag(next)
    }
    const finish = (ev: PointerEvent | null) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key, true)
      document.body.classList.remove('is-dragging')
      const cur = dragRef.current
      dragRef.current = undefined
      setDrag(undefined)
      if (!ev || cur?.kind !== 'bar') return
      if (!cur.moved) {
        setFocus(p.task.id)
        if (ev.detail >= 2) return // 두 번 클릭은 onDoubleClick이 처리
        actions.open(p.task.id)
        return
      }
      if (cur.overPanel) { void taskActions.moveDates([p.task.id], null).catch(() => toast.show('바꾸지 못했어요')); return }
      const ch = dragDates(p.task, cur.mode, cur.delta, scale)
      if (ch) void taskActions.reschedule([ch]).catch(() => toast.show('바꾸지 못했어요'))
    }
    const up = (ev: PointerEvent) => finish(ev)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); finish(null) } } // 끄는 중 Esc = 취소
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key, true)
  }

  // ── 순서 선 손잡이: 막대 오른쪽 점 → 다른 막대에 놓기 ──
  const startLink = (e: RPointerEvent, from: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const p0 = local(e.clientX, e.clientY)
    const d: Drag = { kind: 'link', from, x: p0.x, y: p0.y }
    dragRef.current = d
    setDrag(d)
    const move = (ev: PointerEvent) => { const p = local(ev.clientX, ev.clientY); const n: Drag = { kind: 'link', from, x: p.x, y: p.y }; dragRef.current = n; setDrag(n) }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dragRef.current = undefined
      setDrag(undefined)
      const to = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-tl-bar]')?.dataset.tlBar
      if (to && to !== from) links.connect('sequence', from, to)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── 빈 곳: 누른 채 끌기 = 가로 이동, 클릭 = 그 날짜로 새 할 일 ──
  const startBlank = (e: RPointerEvent) => {
    if (e.button !== 0) return
    if (popoverOpen()) return // 06 §14.2: 떠 있는 팝오버만 닫는다(Popover의 바깥 클릭 닫기가 돌게 막지 않는다)
    e.preventDefault()
    const d: Drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, last: e.clientX, moved: false }
    dragRef.current = d
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (cur?.kind !== 'pan') return
      const moved = cur.moved || Math.abs(ev.clientX - cur.x0) > 4
      if (moved && scroller.current) scroller.current.scrollLeft -= ev.clientX - cur.last
      dragRef.current = { ...cur, moved, last: ev.clientX }
      if (moved && !cur.moved) { setDrag(dragRef.current); document.body.classList.add('is-panning') }
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('is-panning')
      const cur = dragRef.current
      dragRef.current = undefined
      setDrag(undefined)
      if (cur?.kind !== 'pan' || cur.moved) return
      const p = local(ev.clientX, ev.clientY)
      const i = rowAt(boxes, p.y)
      const row = rows[i]
      const min = minOf(p.x, scale)
      const draft = draftAt(min, scale, win.from)
      const r = bodyRef.current!.getBoundingClientRect()
      const b = i >= 0 ? boxes[i] : { top: Math.max(0, p.y - 18), height: 36 }
      const span = barOf({ id: '', ...draft }, scale, win.from)!
      const rect = { left: r.left + xOf(span.start, scale), right: r.left + xOf(span.end, scale), top: r.top + b.top, bottom: r.top + b.top + b.height }
      setFocus(null)
      setCreate({ draft, rect, listId: rowListId(row), goalId: row ? rowGoal(row.key) : null, row: i })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── 줄 머리 끌기: 할 일 줄을 다른 리스트 머리에 = 그 리스트로 옮기기(14 끌기 규칙) ──
  const startRow = (e: RPointerEvent, taskId: string) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input')) return
    e.preventDefault()
    const d: Drag = { kind: 'row', id: taskId, x0: e.clientX, y0: e.clientY, moved: false, x: e.clientX, y: e.clientY }
    dragRef.current = d
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (cur?.kind !== 'row') return
      const moved = cur.moved || Math.hypot(ev.clientX - cur.x0, ev.clientY - cur.y0) > 4
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-tl-list]')?.dataset.tlList
      const n: Drag = { ...cur, moved, x: ev.clientX, y: ev.clientY, target }
      dragRef.current = n
      if (moved) setDrag(n)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const cur = dragRef.current
      dragRef.current = undefined
      setDrag(undefined)
      if (cur?.kind !== 'row') return
      if (!cur.moved) { setFocus(taskId); actions.open(taskId); reveal(taskId); return }
      const t = data.byId.get(taskId)
      if (cur.target && t && t.list_id !== cur.target) void actions.moveTask(taskId, cur.target)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── 키보드 (31 §2.5) — 입력 중·팝오버·창이 열려 있으면 동작하지 않는다 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return
      if (document.querySelector('.popover, .modal-scrim, [role=dialog]')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { if (toast.undoLast()) e.preventDefault(); return }
      if (mod || e.altKey) return
      const el = scroller.current
      const k = e.key.toLowerCase()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const dir = e.key === 'ArrowLeft' ? -1 : 1
        el?.scrollBy({ left: dir * (e.shiftKey ? pageDays(size.w, scale) : 1) * W, behavior: 'smooth' })
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!taskRows.length) return
        e.preventDefault()
        const i = focus ? taskRows.indexOf(focus) : -1
        const next = taskRows[Math.max(0, Math.min(taskRows.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))]
        setFocus(next)
        reveal(next)
      } else if (k === 't') goTo(nowFloating(), 0.3)
      else if (k === '1' || k === '2' || k === '3') nav.set('scale', (['day', 'week', 'month'] as Scale[])[Number(k) - 1])
      else if (e.key === 'Enter' && focus) { e.preventDefault(); actions.open(focus) }
      else if (e.key === ' ' && focus) { e.preventDefault(); const t = data.byId.get(focus); if (t?.status === 0) actions.complete(focus) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && focus) { e.preventDefault(); void actions.trash(focus); setFocus(null) }
      else if (e.key === 'Escape') setFocus(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ⌘/Ctrl + 휠 = 배율 단계 바꾸기 [임시 — 캘린더 규칙] · ⇧ + 휠 = 가로 이동(브라우저 기본)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let acc = 0
    let lock = 0
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      acc += e.deltaY
      if (Math.abs(acc) < 40 || Date.now() < lock) return
      const s = nextScale(scale, acc > 0 ? 1 : -1)
      acc = 0
      lock = Date.now() + 250
      if (s !== scale) nav.set('scale', s)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scale, nav])

  // ── 그리기 ──
  const [r0, r1] = rows.length > 300 ? visibleRange(boxes, scroll.top, size.h) : [0, rows.length - 1]
  const head = useMemo(() => headCells(scale, win, today), [scale, win, today])
  const nowX = xOf(toMin(nowFloating(), win.from), scale)
  const days = useMemo(() => Array.from({ length: win.days }, (_, i) => addDays(win.from, i)), [win])
  const colorFor = (t: MapTask) => {
    const l = t.list_id ? listById.get(t.list_id) : undefined
    return colorOf({ list_color: l?.color ?? null, tag_ids: extra.get(t.id)?.tag_ids ?? null, priority: t.priority } as TaskRow, nav.colorBy, tagColor)
  }
  const nowF = nowFloating()
  const preview = (p: Placed): Bar => {
    if (drag?.kind !== 'bar' || drag.id !== p.task.id || !drag.moved || drag.overPanel) return p.bar
    const ch = dragDates(p.task, drag.mode, drag.delta, scale)
    return ch ? barOf(ch, scale, win.from) ?? p.bar : p.bar
  }
  const dragTip = (() => {
    if (drag?.kind !== 'bar' || !drag.moved) return null
    const p = placed.get(drag.id)
    if (!p) return null
    if (drag.overPanel) return { p, text: '놓으면 날짜를 지워요' }
    const ch = dragDates(p.task, drag.mode, drag.delta, scale)
    return { p, text: ch ? rangeLabel(ch.start_at, ch.due_at) : rangeLabel(p.task.start_at, p.task.due_at) }
  })()
  const visiblePlaced = [...placed.values()].filter((p) => p.row >= r0 && p.row <= r1)
  const yMid = (row: number) => boxes[row].top + boxes[row].height / 2
  const pendingBar = create ? barOf({ id: '', ...create.draft }, scale, win.from) : null
  const showEmpty = !placed.size

  const rowHead = (r: MapRow, i: number) => {
    const b = boxes[i]
    const style = { top: b.top, height: b.height, paddingLeft: 10 + r.depth * 12 + (r.kind === 'task' ? r.sub * 12 : 0) }
    if (r.kind === 'task') {
      const t = r.task
      const done = t.status !== 0 || actions.checking.has(t.id)
      const cls = ['tl-rh', 'tl-rh--task', (focus === t.id || actions.selected === t.id) && 'is-selected', done && 'is-done', drag?.kind === 'row' && drag.moved && drag.id === t.id && 'is-dragging']
      return (
        <div key={r.key} className={cls.filter(Boolean).join(' ')} style={style} onPointerDown={(e) => startRow(e, t.id)}
          onContextMenu={(e) => { e.preventDefault(); setFocus(t.id); setMenu({ task: t, point: { x: e.clientX, y: e.clientY } }) }}>
          <button className={`checkbox${done ? ' is-checked' : ''}`} style={{ ['--checkbox-color' as string]: checkboxColor(t.priority) }} aria-label={done ? '완료됨' : '완료'}
            onClick={(e) => { e.stopPropagation(); if (t.status === 0) actions.complete(t.id); else void taskActions.reopen([t.id]) }}>
            {done && <Check strokeWidth={3} />}
          </button>
          <span className="tl-rh__title">{t.title || '제목 없음'}</span>
        </div>
      )
    }
    const toggle = () => setCollapsed((c) => ({ ...c, [r.key]: !r.collapsed }))
    const label = r.kind === 'folder' ? <><FolderIcon name={r.folder.name} /><span className="tl-rh__title">{folderView(r.folder.name).name}</span></>
      : r.kind === 'list' ? <><ListIcon list={r.list} /><span className="tl-rh__title">{listTitle(r.list)}</span></>
      : r.kind === 'goal' ? <><span className="map-icon">🎯</span><span className="tl-rh__title">{r.goal.title}</span></>
      : <span className="tl-rh__title">목표 없는 할 일</span>
    const isListTarget = r.kind === 'list' && drag?.kind === 'row' && drag.moved && drag.target === r.list.id
    return (
      <div key={r.key} className={`tl-rh tl-rh--${r.kind}${isListTarget ? ' is-target' : ''}`} style={style} data-tl-list={r.kind === 'list' ? r.list.id : undefined}>
        <button className="tl-rh__fold" aria-label={r.collapsed ? '펼치기' : '접기'} aria-expanded={!r.collapsed} onClick={toggle}>{r.collapsed ? '▸' : '▾'}</button>
        {label}
        {r.count > 0 && <span className="tl-rh__count">{r.count}</span>}
      </div>
    )
  }

  const barEl = (p: Placed) => {
    const t = p.task
    const bar = preview(p)
    const x = xOf(bar.start, scale)
    const w = Math.max(6, xOf(bar.end, scale) - x)
    const done = t.status !== 0 || actions.checking.has(t.id)
    const overdue = !done && isOverdue(t, nowF)
    const st = states.get(t.id)
    const warn = warnOf.get(t.id)
    const repeat = !!extra.get(t.id)?.repeat_rule
    const fits = w >= Math.min(260, t.title.length * 12 + 40)
    const dragging = drag?.kind === 'bar' && drag.id === t.id && drag.moved
    const cls = ['tl-bar', done && 'is-done', overdue && 'is-overdue', st === 'blocked' && 'is-blocked', st === 'now' && 'is-now', st === 'later' && 'is-later',
      (focus === t.id || actions.selected === t.id) && 'is-selected', dragging && 'is-dragging', w < 24 && 'is-tiny']
    const tip = [rangeLabel(t.start_at, t.due_at), overdue && '기한 지남', warn && `'${warn}'보다 먼저 시작해요`].filter(Boolean).join(' · ')
    return (
      <div key={t.id} className={cls.filter(Boolean).join(' ')} data-tl-bar={t.id} title={tip}
        style={{ left: x, width: w, top: boxes[p.row].top + (boxes[p.row].height - BAR_H) / 2, ['--c' as string]: colorFor(t) }}
        onPointerDown={(e) => startBar(e, p)}
        onPointerEnter={() => setHoverBar(t.id)} onPointerLeave={() => setHoverBar((h) => (h === t.id ? null : h))}
        onDoubleClick={(e) => { e.stopPropagation(); if (t.status === 0) setEditing(t.id) }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setFocus(t.id); setMenu({ task: t, point: { x: e.clientX, y: e.clientY } }) }}>
        <button className={`tl-bar__check${done ? ' is-on' : ''}`} aria-label={done ? '완료 취소' : '완료'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (t.status === 0) actions.complete(t.id); else void taskActions.reopen([t.id]) }}>
          {done && <Check strokeWidth={3} />}
        </button>
        {repeat && <Repeat2 className="tl-bar__icon" aria-label="반복" />}
        {editing === t.id ? (
          <NameInput className="tl-bar__input" initial={t.title} onCancel={() => setEditing(null)}
            onSave={async (v) => { const s = v.trim(); if (!s) return false; await run(update('tasks', t.id, { title: s })); setEditing(null); return true }} />
        ) : fits ? <span className="tl-bar__title">{t.title || '제목 없음'}</span> : <span className="tl-bar__out">{t.title || '제목 없음'}</span>}
        {t.status === 0 && hoverBar === t.id && !drag && <span className="tl-bar__handle" title="끌어서 다른 막대에 놓으면 순서 선" onPointerDown={(e) => startLink(e, t.id)} />}
      </div>
    )
  }

  const arrowPath = (a: { from: string; to: string }) => {
    const A = placed.get(a.from)!
    const B = placed.get(a.to)!
    const ba = preview(A)
    const bb = preview(B)
    const x1 = xOf(ba.end, scale)
    const y1 = yMid(A.row)
    const x2 = xOf(bb.start, scale)
    const y2 = yMid(B.row)
    const k = Math.max(18, Math.min(60, Math.abs(x2 - x1) / 2))
    return { d: `M${x1} ${y1} C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2 - 2} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 }
  }

  const panelEl = nav.panel && (
    <div className={`tl-panel${narrow ? ' is-drawer' : ''}${narrow && !drawer ? ' is-closed' : ''}`}>
      <ArrangePanel lists={lists} tags={tags} actions={taskActions} onClose={() => (narrow ? setDrawer(false) : nav.set('panel', false))} />
    </div>
  )

  return (
    <div className="tl" ref={rootRef}>
      <div className="tl-scroll" ref={scroller} onScroll={onScroll}>
        <div className="tl-grid" style={{ width: rowHeadW + canvasW }}>
          <div className="tl-hrow">
          <div className="tl-corner" style={{ width: rowHeadW }}>
            {narrow && nav.panel && !drawer && <button className="map-btn map-btn--text tl-corner__panel" onClick={() => setDrawer(true)}>할일 정렬</button>}
          </div>
          <div className="tl-dh" style={{ width: canvasW }}>
            {head.top.map((c) => <div key={`t${c.x}`} className="tl-dh__top" style={{ left: c.x }}><span className="tl-dh__sticky" style={{ left: 0 }}>{c.label}</span></div>)}
            {head.bottom.map((c) => (
              <div key={`b${c.x}`} className={`tl-dh__cell${c.weekend ? ' is-weekend' : ''}${c.today ? ' is-today' : ''}`} style={{ left: c.x, width: scale === 'month' ? undefined : c.w }}>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
          </div>
          <div className="tl-brow" style={{ height: Math.max(rowsH, size.h - HEAD_H) }}>
          <div className="tl-rows" style={{ width: rowHeadW }}>
            {rows.slice(r0, r1 + 1).map((r, j) => rowHead(r, r0 + j))}
            {!narrow && <Resizer side="right" width={nav.rowHead} min={ROW_HEAD.min} max={ROW_HEAD.max} defaultWidth={ROW_HEAD.def} onChange={(w) => nav.set('rowHead', w)} />}
          </div>
          <div className="tl-body" ref={bodyRef} style={{ width: canvasW }} onPointerDown={startBlank}
            onPointerMove={(e) => { if (drag) return; const p = local(e.clientX, e.clientY); setHover({ row: rowAt(boxes, p.y), min: minOf(p.x, scale) }) }}
            onPointerLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <div key={d} className={`tl-day${isWeekend(d) && scale !== 'month' ? ' is-weekend' : ''}`} style={{ left: i * W, width: W }} data-cal-day={d}
                data-minute-width={scale === 'day' ? W / DAY_MIN : undefined} />
            ))}
            {scale === 'month' && days.map((d, i) => (isWeekend(d) ? <div key={`w${d}`} className="tl-day-shade" style={{ left: i * W, width: W }} /> : null))}
            {rows.slice(r0, r1 + 1).map((r, j) => {
              const b = boxes[r0 + j]
              const sel = r.kind === 'task' && (focus === r.task.id || actions.selected === r.task.id)
              return <div key={r.key} className={`tl-line${r.kind !== 'task' ? ' is-head' : ''}${sel ? ' is-selected' : ''}`} style={{ top: b.top, height: b.height }} />
            })}
            {hover && hover.row >= 0 && !drag && !create && (() => {
              const span = barOf({ id: '', ...draftAt(hover.min, scale, win.from) }, scale, win.from)!
              const b = boxes[hover.row]
              return <div className="tl-plus" style={{ left: xOf(span.start, scale), width: xOf(span.end, scale) - xOf(span.start, scale), top: b.top, height: b.height }}><span>+</span></div>
            })()}
            {nowX >= 0 && nowX <= canvasW && <div className="tl-today" style={{ left: nowX }} />}
            {pendingBar && create && <div className="tl-ghost" style={{ left: xOf(pendingBar.start, scale), width: xOf(pendingBar.end, scale) - xOf(pendingBar.start, scale), top: (create.row >= 0 ? boxes[create.row].top + (boxes[create.row].height - BAR_H) / 2 : 6) }} />}
            {(arrows.length > 0 || drag?.kind === 'link') && (
              <svg className="tl-arrows" width={canvasW} height={Math.max(rowsH, 1)}>
                <defs>
                  <marker id="tl-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" className="tl-ah" /></marker>
                  <marker id="tl-ah-warn" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" className="tl-ah is-warn" /></marker>
                </defs>
                {arrows.map((a) => {
                  const p = arrowPath(a)
                  return <path key={a.id} d={p.d} className={`tl-arrow${a.warn ? ' is-warn' : ''}${a.suggested ? ' is-suggested' : ''}`} markerEnd={`url(#${a.warn ? 'tl-ah-warn' : 'tl-ah'})`} />
                })}
                {drag?.kind === 'link' && (() => { const A = placed.get(drag.from); if (!A) return null; const x1 = xOf(A.bar.end, scale); const y1 = yMid(A.row); return <path d={`M${x1} ${y1} L${drag.x} ${drag.y}`} className="tl-arrow is-drawing" markerEnd="url(#tl-ah)" /> })()}
              </svg>
            )}
            {arrows.filter((a) => a.suggested).map((a) => {
              const p = arrowPath(a)
              return (
                <span key={`s${a.id}`} className="tl-suggest" style={{ left: p.mx, top: p.my }} onPointerDown={(e) => e.stopPropagation()}>
                  <button aria-label="순서 선 받기" onClick={() => links.accept(a.id)}>✓</button>
                  <button aria-label="순서 선 버리기" onClick={() => links.drop(a.id, 'suggested')}>✕</button>
                </span>
              )
            })}
            {visiblePlaced.map(barEl)}
            {dragTip && <div className="tl-tip" style={{ left: xOf(preview(dragTip.p).start, scale), top: boxes[dragTip.p.row].top - 22 }}>{dragTip.text}</div>}
            {showEmpty && (
              <div className="tl-empty" style={{ left: scroll.left + size.w / 2 }}>
                <p className="tl-empty__title">날짜가 있는 할 일이 없어요</p>
                <p className="tl-empty__hint">오른쪽 할일 정렬 칸에서 끌어다 놓거나 빈 칸을 눌러 추가하세요</p>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
      {panelEl}
      {drag?.kind === 'row' && drag.moved && <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>{data.byId.get(drag.id)?.title}</div>}
      {create && (
        <QuickCreate key={`${create.draft.start_at}:${create.draft.due_at}:${create.rect.left}:${create.rect.top}`} draft={create.draft} rect={create.rect} lists={lists}
          defaultListId={create.listId} onClose={() => setCreate((c) => (c === create ? undefined : c))}
          onCreated={(id) => { setFocus(id); if (create.goalId) links.connect('goal', create.goalId, id) }} />
      )}
      {menu && <CardMenu task={menu.task} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} />}
    </div>
  )
}
