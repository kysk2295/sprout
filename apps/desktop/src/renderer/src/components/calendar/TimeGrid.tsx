import { CalendarDays, Check, Repeat } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react'
import { datePart, daysBetween } from '@sprout/schema/time'
import { weekendClass } from '../../lib/calendar'
import { hourLabel, inkOn, isBarItem, layoutDay, minutesOfDay, packBars, shortRange, type CalItem, type ItemStyle } from '../../lib/calendar'
import { timeSelection } from '../../lib/calendarSelection'
import { extOf } from '../../lib/calendarExt'
import { evtOf } from '../../lib/calendarEvents'
import { at, autoScrollDelta, freeLane, gridMoveChanges, previewOf, resizeBar, resizeTime, SNAP, snapMin as snap } from '../../lib/calendarDrag'
import { outsideDrag, scheduledDrop } from '../../lib/calendarDrop'
import type { CalHandlers } from './types'
import type { DayMarks } from '@sprout/schema/holidays'
import { weekLabel } from '@sprout/schema/holidays'
import type { WeekStart } from '@sprout/schema/weekStart'
import { SideLabel } from './DayMark'
import { popoverOpen, quickCreateOpen } from './dismiss'
import { dragSession, type DragPoint } from './dragSession'

// 06 §4 주 보기 · 일 보기 (실측 research 17): 요일 줄 · 날짜 숫자 줄 · 종일 영역 · 시간 눈금 · 블록 · 현재 시각
const GUTTER = 55
const NUMROW = 34 // 종일 영역 위 날짜 숫자 줄
const LANE = 19 // 막대 16 + 간격 3
const BAR = 16
const BAND = 40 // 접힌 구간 높이
const HIDDEN_END = 7 * 60 // 00:00–07:00
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const noop = () => {}
const pad = (n: number) => String(n).padStart(2, '0')

type Props = CalHandlers & {
  days: string[]
  items: CalItem[]
  today: string
  hourH: number
  /** 06 §16 날짜 줄 오른쪽 글자(휴일 이름 > 음력). 주 번호는 왼쪽 위 칸에 */
  marks?: (day: string, firstOfRow: boolean) => DayMarks
  weekNumbers?: boolean
  /** 06 §16.1 주 시작(주 번호를 셀 줄) */
  weekStart?: WeekStart
  collapsed: boolean
  onCollapsed: (v: boolean) => void
  onDayClick: (day: string) => void
  itemStyle: ItemStyle
}
type Drag =
  | { kind: 'create-time'; day: string; a: number; b: number }
  | { kind: 'create-allday'; a: number; b: number }
  | { kind: 'move'; item: CalItem; grabDate: string; grabMin: number; zone: 'grid' | 'allday'; date: string; min: number; moved: boolean; dup: boolean }
  | { kind: 'resize'; item: CalItem; edge: 'top' | 'bottom'; min: number; moved: boolean }
  | { kind: 'resize-bar'; item: CalItem; edge: 'start' | 'end'; grabDate: string; date: string; moved: boolean }

export function TimeGrid(p: Props) {
  const { days, items, today, hourH, collapsed } = p
  const n = days.length
  // 주 번호는 왼쪽 위 칸에 따로 쓰므로 날짜 줄에서는 휴일 이름 > 음력만(firstOfRow = false)
  const mk = (d: string) => p.marks?.(d, false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const alldayRef = useRef<HTMLDivElement>(null)
  const daysRef = useRef(days)
  daysRef.current = days
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag | undefined>(undefined)
  const outside = useSyncExternalStore(outsideDrag.subscribe, outsideDrag.get)
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes())
  useEffect(() => {
    const t = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 30_000)
    return () => clearInterval(t)
  }, [])

  // 세로 위치 ↔ 분 (접힌 구간 포함)
  const yOf = (min: number) => (collapsed ? (min <= HIDDEN_END ? (BAND * min) / HIDDEN_END : BAND + ((min - HIDDEN_END) * hourH) / 60) : (min * hourH) / 60)
  const minOf = (y: number) => (collapsed ? (y <= BAND ? (y / BAND) * HIDDEN_END : HIDDEN_END + ((y - BAND) * 60) / hourH) : (y * 60) / hourH)
  const totalH = yOf(24 * 60)

  // 06 §4.1 처음 스크롤: 오늘이 보이면 현재 시각 1시간 전, 아니면 오전 8시
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = Math.max(0, yOf(days.includes(today) ? nowMin - 60 : 8 * 60) - 8)
  }, [days[0], n]) // eslint-disable-line react-hooks/exhaustive-deps

  const colOf = (clientX: number, el: HTMLElement | null) => {
    const r = el!.getBoundingClientRect()
    const x = clientX - r.left - GUTTER
    return Math.max(0, Math.min(n - 1, Math.floor((x / (r.width - GUTTER)) * n)))
  }
  const minAt = (clientY: number) => minOf(clientY - gridRef.current!.getBoundingClientRect().top)
  const inAllday = (clientY: number) => {
    const r = alldayRef.current?.getBoundingClientRect()
    return !!r && clientY >= r.top && clientY <= r.bottom
  }

  // ── 끌기 공통(06 §7.2): 15분 칸에 붙는 미리 보기, Esc 취소, 위·아래 가장자리 자동 스크롤, 좌우 가장자리 0.6초 = 이전·다음 범위 ──
  const edgeTimer = useRef<number>(undefined)
  const clearEdge = () => { clearTimeout(edgeTimer.current); edgeTimer.current = undefined }
  const start = (e: RPointerEvent, d: Drag) => {
    if (e.button !== 0) return
    if (d.kind === 'create-time' || d.kind === 'create-allday' ? popoverOpen() : quickCreateOpen()) { e.stopPropagation(); return } // 06 §14.2
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = d
    setDrag(d)
    const x0 = e.clientX
    const y0 = e.clientY
    let last: DragPoint = { clientX: e.clientX, clientY: e.clientY, altKey: e.altKey }
    const far = (ev: DragPoint) => Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4
    const move = (ev: DragPoint) => {
      last = { clientX: ev.clientX, clientY: ev.clientY, altKey: ev.altKey }
      const cur = dragRef.current
      if (!cur) return
      let next: Drag = cur
      if (cur.kind === 'create-time') next = { ...cur, b: snap(minAt(ev.clientY)) }
      else if (cur.kind === 'create-allday') next = { ...cur, b: colOf(ev.clientX, alldayRef.current) }
      else if (cur.kind === 'resize') next = { ...cur, min: snap(minAt(ev.clientY)), moved: cur.moved || far(ev) }
      else if (cur.kind === 'resize-bar') next = { ...cur, date: daysRef.current[colOf(ev.clientX, alldayRef.current)], moved: cur.moved || far(ev) }
      else if (cur.kind === 'move') {
        const moved = cur.moved || far(ev)
        const zone = inAllday(ev.clientY) ? 'allday' : 'grid'
        const date = daysRef.current[colOf(ev.clientX, zone === 'allday' ? alldayRef.current : gridRef.current)]
        next = { ...cur, moved, zone, date, min: snap(minAt(ev.clientY) - cur.grabMin), dup: ev.altKey }
        const r = gridRef.current!.getBoundingClientRect()
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
        const edge = !inside ? 0 : ev.clientX < r.left + GUTTER + 16 ? -1 : ev.clientX > r.right - 16 ? 1 : 0
        if (moved && edge && !edgeTimer.current) edgeTimer.current = window.setTimeout(() => { edgeTimer.current = undefined; p.onEdgeShift(edge) }, 600)
        if (!edge && edgeTimer.current) clearEdge()
      }
      dragRef.current = next
      setDrag(next)
    }
    // 시간 칸 위·아래 가장자리에 가면 저절로 스크롤(틱틱처럼 끌면서 보이지 않는 시각까지)
    let raf = 0
    let armed = false
    const tick = () => {
      const cur = dragRef.current
      const sc = scrollRef.current
      if (!cur || !sc) return
      const vertical = cur.kind === 'create-time' || (cur.kind === 'resize' && cur.moved) || (cur.kind === 'move' && cur.moved && cur.zone === 'grid')
      const r = sc.getBoundingClientRect()
      const dy = autoScrollDelta(last.clientY, r.top, r.bottom)
      // 가장자리 띠 안에서 시작했거나 종일 영역에서 내려오는 길이면 아직 스크롤하지 않는다(가운데를 한 번 지나야 켜짐)
      if (last.clientY < r.top || last.clientY > r.bottom) armed = false
      else if (!dy) armed = true
      if (vertical && armed && dy) {
        const before = sc.scrollTop
        sc.scrollTop = before + dy
        if (sc.scrollTop !== before) move(last)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const stop = () => {
      cancelAnimationFrame(raf)
      clearEdge()
      const d2 = dragRef.current
      dragRef.current = undefined
      setDrag(undefined)
      return d2
    }
    dragSession({
      cursor: d.kind === 'resize' ? 'ns-resize' : d.kind === 'resize-bar' ? 'ew-resize' : 'default',
      onMove: move,
      onUp: (ev) => { const d2 = stop(); if (d2) finish(d2, ev) },
      onCancel: () => { stop() }
    })
  }

  const finish = (d: Drag, ev: PointerEvent) => {
    const rect = { left: ev.clientX, top: ev.clientY, right: ev.clientX, bottom: ev.clientY }
    const openOrSelect = (it: CalItem) => {
      if (ev.metaKey || ev.ctrlKey) p.onSelect(it.task.id, true)
      else p.onOpen(it, (ev.target as HTMLElement).closest('.cal-item')?.getBoundingClientRect() ?? rect)
    }
    if (d.kind === 'create-time') {
      const a = Math.min(d.a, d.b)
      const bounds = gridRef.current!.getBoundingClientRect()
      const width = (bounds.width - GUTTER) / n
      const left = bounds.left + GUTTER + days.indexOf(d.day) * width
      p.onCreate(timeSelection(d.day, d.a, d.b), { left, right: left + width, top: bounds.top + yOf(a), bottom: bounds.top + yOf(a) + BAR })
    } else if (d.kind === 'create-allday') {
      const a = Math.min(d.a, d.b)
      const b = Math.max(d.a, d.b)
      p.onCreate({ start_at: a === b ? null : days[a], due_at: days[b] }, rect)
    } else if (d.kind === 'resize') {
      if (!d.moved) return openOrSelect(d.item)
      const r = resizeTime(d.item, d.edge, d.min)
      p.onMove([{ id: d.item.task.id, start_at: at(r.day, r.a), due_at: at(r.day, r.b) }], false)
    } else if (d.kind === 'resize-bar') {
      if (!d.moved) return openOrSelect(d.item)
      const delta = daysBetween(d.grabDate, d.date)
      if (delta) p.onMove([resizeBar(d.item, d.edge, delta)], false)
    } else if (d.kind === 'move') {
      const it = d.item
      if (!d.moved) return openOrSelect(it)
      if (it.virtual) return
      const listId = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-list-target]')?.dataset.listTarget
      if (listId) { p.onMoveToList(p.selection.includes(it.task.id) ? p.selection : [it.task.id], listId); return }
      const group = p.selection.includes(it.task.id) ? p.itemsById(p.selection) : [it]
      p.onMove(gridMoveChanges(group, it, { dayDelta: daysBetween(d.grabDate, d.date), zone: d.zone, min: d.min }, (g) => !!evtOf(g) || !!extOf(g)), d.dup)
    }
  }

  // ── 끄는 동안 그릴 미리 보기: 원래 항목과 같은 모양(Item)을 놓일 자리에 그린다. 원래 자리는 옅게(옮기기) / 숨김(길이 바꾸기) ──
  const preview = ((): { item: CalItem; live: boolean; key: string } | undefined => {
    if (drag?.kind === 'move' && drag.moved && !drag.item.virtual) {
      const c = gridMoveChanges([drag.item], drag.item, { dayDelta: daysBetween(drag.grabDate, drag.date), zone: drag.zone, min: drag.min }, (g) => !!evtOf(g) || !!extOf(g))[0]
      return { item: previewOf(drag.item, c), live: false, key: drag.item.key }
    }
    if (drag?.kind === 'resize' && drag.moved) {
      const r = resizeTime(drag.item, drag.edge, drag.min)
      return { item: previewOf(drag.item, { start_at: at(r.day, r.a), due_at: at(r.day, r.b) }), live: true, key: drag.item.key }
    }
    if (drag?.kind === 'resize-bar' && drag.moved) return { item: previewOf(drag.item, resizeBar(drag.item, drag.edge, daysBetween(drag.grabDate, drag.date))), live: true, key: drag.item.key }
    // 06 §9 할일 정렬 칸에서 끌어 오는 중: 시간 칸이면 15분 칸에 붙은 한 줄 막대, 종일 영역이면 막대
    const t = outside?.target
    if (outside && t && days.includes(t.day) && (t.zone === 'grid' || t.zone === 'allday')) {
      const base: CalItem = { key: 'outside', task: outside.task, start: t.day, end: t.day, allDay: true, virtual: false }
      return { item: previewOf(base, scheduledDrop(outside.task, t)), live: false, key: 'outside' }
    }
    return undefined
  })()
  const sourceKey = drag && (drag.kind === 'move' ? (drag.moved ? drag.item.key : undefined) : drag.kind === 'resize' || drag.kind === 'resize-bar' ? (drag.moved ? drag.item.key : undefined) : undefined)
  const hideSource = drag?.kind === 'resize' || drag?.kind === 'resize-bar'
  const srcCls = (key: string) => (key === sourceKey ? (hideSource ? ' is-resize-source' : ' is-drag-source') : '')

  const bars = packBars(items.filter(isBarItem), days)
  const barPreview = preview && isBarItem(preview.item) ? packBars([preview.item], days)[0] : undefined
  const barPreviewLane = barPreview ? freeLane(bars, barPreview.col, barPreview.span, preview!.key) : -1
  const lanes = Math.max(1, barPreviewLane + 1, ...bars.map((b) => b.lane + 1))
  // 06 §4.1: 종일 영역 높이는 내용에 맞춰 자동(최대 화면의 40%)
  const alldayH = Math.min(NUMROW + lanes * LANE + 6, Math.round(window.innerHeight * 0.4))
  const gridPreview = preview && !isBarItem(preview.item) ? preview : undefined

  const pendingStart = p.pending?.start_at ?? p.pending?.due_at
  const pendingDay = pendingStart?.includes('T') ? datePart(pendingStart) : null
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => !collapsed || h * 60 >= HIDDEN_END)
  const range = drag?.kind === 'create-time' ? { day: drag.day, a: Math.min(drag.a, drag.b), b: drag.a === drag.b ? drag.a : Math.min(1439, Math.max(drag.a, drag.b) + SNAP) } : undefined

  return (
    <div className="tg">
      <div className="tg__head" style={{ gridTemplateColumns: `${GUTTER}px repeat(${n}, minmax(0, 1fr))` }}>
        <div className="tg__weeknum">{p.weekNumbers && days.length ? weekLabel(days[0], p.weekStart ?? 0) : null}</div>
        {days.map((d) => <div key={d} className={`tg__dayhead${weekendClass(d)}`}>{WEEK[new Date(`${d}T00:00`).getDay()]}</div>)}
      </div>
      <div
        ref={alldayRef}
        className="tg__allday"
        style={{ height: alldayH }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.cal-item, .tg__num')) return
          const c = colOf(e.clientX, alldayRef.current)
          start(e, { kind: 'create-allday', a: c, b: c })
        }}
      >
        <div className="tg__allday-cols" style={{ gridTemplateColumns: `${GUTTER}px repeat(${n}, minmax(0, 1fr))`, minHeight: NUMROW + lanes * LANE + 6 }}>
          <div />
          {days.map((d, i) => {
            const sel = drag?.kind === 'create-allday' && i >= Math.min(drag.a, drag.b) && i <= Math.max(drag.a, drag.b)
            const pend = p.pending && !p.pending.due_at?.includes('T') && d >= (p.pending.start_at ?? p.pending.due_at!) && d <= p.pending.due_at!
            const drop = !!barPreview && !preview!.live && i >= barPreview.col && i < barPreview.col + barPreview.span
            return (
              <div key={d} data-cal-day={d} className={`tg__allday-col${sel || pend ? ' is-target' : ''}${drop ? ' is-drop' : ''}`}>
                <button className={`tg__num${d === today ? ' is-today' : ''}${mk(d)?.holiday ? ' is-holiday' : ''}${weekendClass(d)}`} onClick={() => p.onDayClick(d)} title={mk(d)?.holiday ?? undefined}>{Number(d.slice(8))}</button>
                <SideLabel marks={mk(d)} className="tg__side" />
              </div>
            )
          })}
        </div>
        <div className="tg__bars" style={{ left: GUTTER, top: NUMROW, height: lanes * LANE }}>
          {bars.map((b) => (
            <div key={b.item.key} className={`cal-item-wrap${srcCls(b.item.key)}`} style={{ left: `calc(${(b.col / n) * 100}% + 2px)`, width: `calc(${(b.span / n) * 100}% - 4px)`, top: b.lane * LANE, height: BAR }}>
              <Item item={b.item} kind="bar" {...p} contLeft={b.contLeft} contRight={b.contRight} edges="horizontal"
                onDown={(e) => {
                  const day = days[colOf(e.clientX, alldayRef.current)]
                  const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined
                  if (edge && !b.item.virtual) return start(e, { kind: 'resize-bar', item: b.item, edge, grabDate: day, date: day, moved: false })
                  start(e, { kind: 'move', item: b.item, grabDate: day, grabMin: 0, zone: 'allday', date: day, min: 0, moved: false, dup: false })
                }}
              />
            </div>
          ))}
          {barPreview && (
            <div className={`cal-item-wrap is-ghost${preview!.live ? ' is-live' : ''}`} style={{ left: `calc(${(barPreview.col / n) * 100}% + 2px)`, width: `calc(${(barPreview.span / n) * 100}% - 4px)`, top: barPreviewLane * LANE, height: BAR }}>
              <Item item={barPreview.item} kind="bar" {...p} contLeft={barPreview.contLeft} contRight={barPreview.contRight} onDown={noop} />
            </div>
          )}
        </div>
      </div>
      <div className="tg__scroll" ref={scrollRef}>
        <div className="tg__grid" ref={gridRef} style={{ height: totalH, gridTemplateColumns: `${GUTTER}px repeat(${n}, minmax(0, 1fr))` }}>
          <div className="tg__gutter">
            {collapsed && <button className="tg__band" style={{ height: BAND - 4 }} onClick={() => p.onCollapsed(false)} title="펼치기">00:00<br />- 07:00</button>}
            {hours.map((h) => (
              <span key={h} className={`tg__hour${h * 60 < HIDDEN_END ? ' is-hidable' : ''}`} style={{ top: yOf(h * 60) }} onDoubleClick={() => h * 60 < HIDDEN_END && p.onCollapsed(true)}>
                {h === 0 || (collapsed && h * 60 === HIDDEN_END) ? '' : hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const gp = gridPreview && datePart(gridPreview.item.start) === d ? gridPreview : undefined
            const gpPoint = gp && gp.item.start === gp.item.end
            const gpS = gp ? minutesOfDay(gp.item.start) : 0
            const gpE = gp && !gpPoint ? (datePart(gp.item.end) === d ? minutesOfDay(gp.item.end) : 24 * 60) : gpS
            return (
              <div
                key={d}
                data-cal-day={d}
                data-hour-height={hourH}
                data-collapsed={collapsed}
                className="tg__col"
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('.cal-item')) return
                  const m = snap(Math.floor(minAt(e.clientY) / SNAP) * SNAP)
                  start(e, { kind: 'create-time', day: d, a: m, b: m })
                }}
              >
                {hours.map((h) => <div key={h} className="tg__line" style={{ top: yOf(h * 60) }} />)}
                {collapsed && <div className="tg__band-fill" style={{ height: BAND }} />}
                {layoutDay(items, d).map((b) => {
                  const isPoint = b.item.start === b.item.end
                  return (
                    <div
                      key={b.item.key}
                      className={`cal-item-wrap is-block${srcCls(b.item.key)}`}
                      style={{
                        top: yOf(b.startMin),
                        height: isPoint ? BAR : Math.max(yOf(b.endMin) - yOf(b.startMin) - 1, BAR),
                        left: `calc(${(b.col / b.cols) * 100}% + 2px)`,
                        width: `calc(${100 / b.cols}% - 4px)`
                      }}
                    >
                      <Item
                        item={b.item}
                        kind={isPoint ? 'bar' : 'block'}
                        edges="vertical"
                        {...p}
                        onDown={(e) => {
                          const edge = (e.target as HTMLElement).dataset.edge as 'top' | 'bottom' | undefined
                          if (edge && !b.item.virtual) return start(e, { kind: 'resize', item: b.item, edge, min: edge === 'top' ? b.startMin : b.endMin, moved: false })
                          start(e, { kind: 'move', item: b.item, grabDate: d, grabMin: minAt(e.clientY) - b.startMin, zone: 'grid', date: d, min: b.startMin, moved: false, dup: false })
                        }}
                      />
                    </div>
                  )
                })}
                {range?.day === d && <div className="tg__select" style={{ top: yOf(range.a), height: Math.max(BAR, yOf(range.b) - yOf(range.a)) }} />}
                {!drag && pendingDay === d && pendingStart && (
                  <div className="tg__select" style={{ top: yOf(minutesOfDay(pendingStart)), height: Math.max(BAR, yOf(minutesOfDay(p.pending!.due_at!)) - yOf(minutesOfDay(pendingStart))) }} />
                )}
                {gp && (
                  <div className={`cal-item-wrap is-block is-ghost${gp.live ? ' is-live' : ''}`} style={{ top: yOf(gpS), height: gpPoint ? BAR : Math.max(yOf(gpE) - yOf(gpS) - 1, BAR), left: 2, right: 2 }}>
                    <Item item={gp.item} kind={gpPoint ? 'bar' : 'block'} {...p} onDown={noop} />
                  </div>
                )}
                {/* 06 §4.1 실측: 현재 시각은 오늘 열에만, 왼쪽 끝 점 */}
                {d === today && <div className="tg__now" style={{ top: yOf(nowMin) }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 막대·블록 한 개(06 §4.2). 스타일 "간결한"은 체크박스 아이콘 없음, "상세한"은 있음.
 * 외부 일정(16 §3.1): 체크박스·가장자리 없음, 제목 앞 작은 캘린더 아이콘, 끌기·빈 칸 만들기 없이 누르면 읽기 전용 팝오버 */
export function Item({ item, kind, contLeft, contRight, edges, onDown, ...p }: CalHandlers & { item: CalItem; kind: 'block' | 'bar'; contLeft?: boolean; contRight?: boolean; edges?: 'vertical' | 'horizontal'; onDown: (e: RPointerEvent) => void; itemStyle?: ItemStyle }) {
  const t = item.task
  const ext = extOf(item)
  const evt = evtOf(item) // 06 §14.4 sprout 자체 일정: 구독 일정처럼 캘린더 아이콘, 하지만 끌기·길이·팝오버로 고친다
  const done = t.status !== 0
  const now = new Date()
  const nowF = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  const past = (item.end.includes('T') ? item.end : `${item.end}T23:59`) < nowF
  const hasRange = item.start !== item.end
  const timeText = item.start.includes('T') ? shortRange(item.start, item.end, hasRange && datePart(item.start) === datePart(item.end)) : ''
  // 06 §14.2·§14.3 항목 아이콘(종류별): 할 일 = 체크박스, 구독 일정 = 같은 자리·같은 크기의 회색 캘린더 아이콘
  // ("상세한" 스타일은 늘, 아니면 종류별 토글·⌥ 누르는 동안)
  const detailedStyle = p.itemStyle === 'detailed'
  const detailed = !ext && !evt && (detailedStyle || !!p.showIcons)
  const calIcon = (!!ext || !!evt) && (detailedStyle || !!p.showCalIcons)
  const editable = !item.virtual && (!ext || ext.writable) // 16 §12.6 쓸 수 있는 외부 일정은 끌고 길이를 바꾼다
  const lockedExt = !!ext && !ext.writable
  // 06 §7.2 가장자리 끌기: 시간 칸 블록 = 위·아래(한 점 막대는 아래만 — 늘리면 기간), 막대 = 왼쪽·오른쪽(여러 날)
  const vEdges = editable && edges === 'vertical'
  const hEdges = editable && edges === 'horizontal' && kind === 'bar'
  // 06 §14.2(2026-10-09): 안 한 할 일 = 리스트 색 채운 막대(지난 날이어도 그대로), 한 할 일·지난 일정·반복 미래 회차 = 옅은 면(is-faded)
  const isEvt = !!ext || !!evt
  const pastLike = past || (item.virtual && !evt) || !!ext?.stale
  const faded = done || (item.virtual && !evt) || (isEvt && pastLike)
  const color = p.colorOf(item)
  const cls = ['cal-item', `is-${kind}`, done && 'is-done', !done && pastLike && 'is-past', faded && 'is-faded', item.virtual && !evt && 'is-virtual', ext && 'is-ext', evt && 'is-event', p.selection.includes(t.id) && 'is-selected', contLeft && 'cont-left', contRight && 'cont-right']
  const extDown = (e: RPointerEvent) => { e.stopPropagation(); if (e.button !== 0) return; e.preventDefault() }
  return (
    <div
      className={cls.filter(Boolean).join(' ')}
      style={{ ['--item-color' as string]: color, ['--item-ink' as string]: inkOn(color) }}
      onPointerDown={lockedExt ? extDown : onDown}
      onClick={lockedExt ? (e) => { e.stopPropagation(); p.onOpen(item, e.currentTarget.getBoundingClientRect()) } : undefined}
      onDoubleClick={lockedExt ? (e) => e.stopPropagation() : undefined}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); p.onContext(item, e) }}
      role={ext || evt ? 'button' : undefined}
      aria-label={ext ? `${ext.provider === 'google' ? '구글' : 'Apple'} 일정: ${ext.title}, ${ext.allDay ? ext.start : timeText || ext.start}${ext.writable ? '' : ', 읽기 전용'}` : evt ? `일정: ${t.title || '제목 없음'}, ${item.allDay ? item.start : timeText || item.start}` : undefined}
    >
      {vEdges && kind === 'block' && <span className="cal-item__edge is-top" data-edge="top" />}
      {hEdges && !contLeft && <span className="cal-item__edge is-left" data-edge="start" />}
      <span className="cal-item__row">
        {detailed && (
          <button
            className={`cal-item__check${done ? ' is-on' : ''}`}
            disabled={item.virtual}
            aria-label={done ? '완료 취소' : '완료'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!item.virtual) p.onToggle(item) }}
          >
            {done && <Check strokeWidth={3} />}
          </button>
        )}
        {calIcon && <CalendarDays className="cal-item__kind" aria-hidden />}
        {!ext && t.repeat_rule && <Repeat className="cal-item__icon" />}
        <span className="cal-item__title">{t.title || '제목 없음'}</span>
        {kind === 'bar' && timeText && <span className="cal-item__time">{timeText.replace(/-.*/, '')}</span>}
      </span>
      {kind === 'block' && hasRange && timeText && <span className="cal-item__sub">{timeText}</span>}
      {vEdges && <span className="cal-item__edge is-bottom" data-edge="bottom" />}
      {hEdges && !contRight && <span className="cal-item__edge is-right" data-edge="end" />}
    </div>
  )
}
