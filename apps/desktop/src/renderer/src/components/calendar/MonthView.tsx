import { useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react'
import { addDays, datePart, daysBetween } from '@sprout/schema/time'
import { isWeekend, packBars, weekHeadClass, weekendClass, type CalItem, type ItemStyle } from '../../lib/calendar'
import type { DayMarks } from '@sprout/schema/holidays'
import { SideLabel } from './DayMark'
import { monthMoveChanges, previewOf, resizeBar, spanDays } from '../../lib/calendarDrag'
import { outsideDrag } from '../../lib/calendarDrop'
import { Item } from './TimeGrid'
import type { CalHandlers, Rect } from './types'
import { popoverOpen, quickCreateOpen } from './dismiss'
import { dragSession } from './dragSession'

// 06 §5 월 보기(실측 research 17): 필요한 주만큼 · 칸 날짜 · 막대 · "+N" · 여러 날 막대 · 오늘 칸 칠
const LANE = 19 // 막대 16 + 간격 3
const BAR = 16
const HEAD = 30 // 칸 위쪽 날짜 줄
const WEEK = ['월', '화', '수', '목', '금', '토', '일'] // 주 시작 = 월요일(2026-10-05 사용자 결정)

type Props = CalHandlers & {
  days: string[] // 5주 또는 6주
  month: string // YYYY-MM
  items: CalItem[]
  today: string
  itemStyle: ItemStyle
  /** 06 §16 칸 오른쪽 글자(휴일 이름 > 주 번호 > 음력) */
  marks?: (day: string, firstOfRow: boolean) => DayMarks
  onDayClick: (day: string) => void
  onMore: (day: string, rect: Rect) => void
}
// 06 §7.2 월 칸 끌기(틱틱 실측 — research 17 §끌기): 원래 막대와 같은 모양이 포인터를 따라 떠다니고(잡은 자리 유지·그림자),
// 놓일 칸이 칠해지고, 원래 막대는 제자리에 옅게. 막대 왼쪽·오른쪽 끝 = 시작·끝 날짜(여러 날)
type Drag =
  | { kind: 'create'; a: string; b: string }
  | { kind: 'move'; item: CalItem; grab: string; date: string; moved: boolean; dup: boolean; x: number; y: number; offX: number; offY: number; w: number; h: number }
  | { kind: 'resize'; item: CalItem; edge: 'start' | 'end'; grab: string; date: string; moved: boolean }
const noop = () => {}

export function MonthView(p: Props) {
  const { month, items, today } = p
  // 06 §8 주말 표시를 끄면 한 줄 5칸(토·일 빠짐)
  const cols = p.days.some(isWeekend) ? 7 : 5
  const nRows = p.days.length / cols
  const rows = Array.from({ length: nRows }, (_, r) => p.days.slice(r * cols, r * cols + cols))
  const bodyRef = useRef<HTMLDivElement>(null)
  const [rowH, setRowH] = useState(100)
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setRowH(el.clientHeight / nRows))
    ro.observe(el)
    setRowH(el.clientHeight / nRows)
    return () => ro.disconnect()
  }, [nRows])
  const maxLanes = Math.max(1, Math.floor((rowH - HEAD - 4) / LANE))
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag | undefined>(undefined)

  const dateAt = (x: number, y: number) => {
    const r = bodyRef.current!.getBoundingClientRect()
    const row = Math.max(0, Math.min(nRows - 1, Math.floor(((y - r.top) / r.height) * nRows)))
    const col = Math.max(0, Math.min(cols - 1, Math.floor(((x - r.left) / r.width) * cols)))
    return rows[row][col]
  }
  const start = (e: RPointerEvent, d: Drag) => {
    if (e.button !== 0) return
    if (d.kind === 'create' ? popoverOpen() : quickCreateOpen()) return // 06 §14.2: 떠 있는 팝오버만 닫는다
    e.preventDefault()
    dragRef.current = d
    setDrag(d)
    const x0 = e.clientX
    const y0 = e.clientY
    const far = (x: number, y: number) => Math.hypot(x - x0, y - y0) > 4
    const stop = () => {
      const d2 = dragRef.current
      dragRef.current = undefined
      setDrag(undefined)
      return d2
    }
    dragSession({
      cursor: d.kind === 'resize' ? 'ew-resize' : 'default',
      onCancel: () => { stop() },
      onMove: (ev) => {
        const cur = dragRef.current
        if (!cur) return
        const date = dateAt(ev.clientX, ev.clientY)
        const next: Drag = cur.kind === 'create' ? { ...cur, b: date }
          : cur.kind === 'resize' ? { ...cur, date, moved: cur.moved || far(ev.clientX, ev.clientY) }
          : { ...cur, date, moved: cur.moved || far(ev.clientX, ev.clientY), dup: ev.altKey, x: ev.clientX, y: ev.clientY }
        dragRef.current = next
        setDrag(next)
      },
      onUp: (ev) => {
        const d2 = stop()
        if (!d2) return
        const rect = { left: ev.clientX, top: ev.clientY, right: ev.clientX, bottom: ev.clientY }
        if (d2.kind === 'create') {
          if (far(ev.clientX, ev.clientY)) return
          const cell = bodyRef.current!.querySelector<HTMLElement>(`[data-cal-day="${d2.a}"]`)!
          p.onCreate({ start_at: null, due_at: d2.a }, cell.getBoundingClientRect())
          return
        }
        const it = d2.item
        if (!d2.moved) {
          if (ev.metaKey || ev.ctrlKey) p.onSelect(it.task.id, true)
          else p.onOpen(it, (ev.target as HTMLElement).closest('.cal-item')?.getBoundingClientRect() ?? rect)
          return
        }
        if (it.virtual) return
        const delta = daysBetween(d2.grab, d2.date)
        if (d2.kind === 'resize') { if (delta) p.onMove([resizeBar(it, d2.edge, delta)], false); return }
        const listId = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-list-target]')?.dataset.listTarget
        if (listId) { p.onMoveToList(p.selection.includes(it.task.id) ? p.selection : [it.task.id], listId); return }
        if (!delta) return
        // 06 §7.2: 날짜만 옮기고 시각·기간은 유지
        const group = p.selection.includes(it.task.id) ? p.itemsById(p.selection) : [it]
        p.onMove(monthMoveChanges(group, delta), d2.dup)
      }
    })
  }

  // 놓일 칸: 옮기는 막대가 새로 차지할 날들(여러 날 막대는 전부) · 할일 정렬 칸에서 끌어 오는 날
  const outside = useSyncExternalStore(outsideDrag.subscribe, outsideDrag.get)
  const dropRange = ((): [string, string] | undefined => {
    if (drag?.kind === 'move' && drag.moved && !drag.item.virtual) {
      const s0 = addDays(datePart(drag.item.start), daysBetween(drag.grab, drag.date))
      return [s0, addDays(s0, spanDays(drag.item) - 1)]
    }
    const t = outside?.target
    if (t && t.zone === 'day' && p.days.includes(t.day)) return [t.day, t.day]
    return undefined
  })()
  // 길이 바꾸기는 막대 자체를 바로 늘여 그린다(원래 자리 대신)
  const resized = drag?.kind === 'resize' && drag.moved ? previewOf(drag.item, resizeBar(drag.item, drag.edge, daysBetween(drag.grab, drag.date))) : undefined
  const laidItems = resized ? items.map((it) => (it.key === (drag as { item: CalItem }).item.key ? resized : it)) : items

  const inCreate = (d: string) => {
    if (drag?.kind === 'create') {
      const [a, b] = drag.a <= drag.b ? [drag.a, drag.b] : [drag.b, drag.a]
      return a === b && d === a
    }
    const pd = p.pending
    return !!pd && !pd.due_at?.includes('T') && d >= (pd.start_at ?? pd.due_at!) && d <= pd.due_at!
  }

  return (
    <div className="mv">
      <div className="mv__head" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {WEEK.slice(0, cols).map((w, i) => <span key={w} className={`mv__wd${weekHeadClass(i)}`}>{w}</span>)}
      </div>
      <div className="mv__body" ref={bodyRef} style={{ gridTemplateRows: `repeat(${nRows}, minmax(0, 1fr))` }}>
        {rows.map((row, r) => {
          const bars = packBars(laidItems, row)
          const covering = row.map((_, c) => bars.filter((b) => b.col <= c && c < b.col + b.span))
          const overflow = covering.some((cv) => cv.length > maxLanes)
          const limit = overflow ? maxLanes - 1 : maxLanes
          return (
            <div key={r} className="mv__row" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {row.map((d, c) => {
                const other = d.slice(0, 7) !== month
                const label = d.endsWith('-01') ? `${Number(d.slice(5, 7))}월 1일` : String(Number(d.slice(8)))
                const hidden = covering[c].filter((b) => b.lane >= limit).length
                const mk = p.marks?.(d, c === 0)
                return (
                  <div
                    key={d}
                    data-cal-day={d}
                    className={`mv__cell${other ? ' is-other' : ''}${d === today ? ' is-today' : ''}${inCreate(d) ? ' is-target' : ''}${dropRange && d >= dropRange[0] && d <= dropRange[1] ? ' is-drop' : ''}`}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('.cal-item, .mv__num, .mv__more')) return
                      start(e, { kind: 'create', a: d, b: d })
                    }}
                  >
                    <button className={`mv__num${d === today ? ' is-today' : ''}${d.endsWith('-01') ? ' is-first' : ''}${mk?.holiday ? ' is-holiday' : ''}${weekendClass(d)}`} onClick={() => p.onDayClick(d)} title={mk?.holiday ?? undefined}>{label}</button>
                    <SideLabel marks={mk} className="mv__side" />
                    {hidden > 0 && (
                      <button
                        className="mv__more"
                        style={{ top: HEAD + limit * LANE }}
                        onClick={(e) => p.onMore(d, e.currentTarget.getBoundingClientRect())}
                      >
                        +{hidden}
                      </button>
                    )}
                  </div>
                )
              })}
              <div className="mv__bars">
                {bars.filter((b) => b.lane < limit).map((b) => (
                  <div
                    key={b.item.key}
                    className={`cal-item-wrap${drag?.kind === 'move' && drag.moved && drag.item.key === b.item.key ? ' is-drag-source' : ''}${resized && resized.key === b.item.key ? ' is-live' : ''}`}
                    style={{ left: `calc(${(b.col / cols) * 100}% + 3px)`, width: `calc(${(b.span / cols) * 100}% - 6px)`, top: HEAD + b.lane * LANE, height: BAR }}
                  >
                    <Item item={b.item} kind="bar" {...p} contLeft={b.contLeft} contRight={b.contRight} edges={resized ? undefined : 'horizontal'}
                      onDown={(e) => {
                        e.stopPropagation()
                        const day = dateAt(e.clientX, e.clientY)
                        const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined
                        if (edge && !b.item.virtual) return start(e, { kind: 'resize', item: b.item, edge, grab: day, date: day, moved: false })
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        start(e, { kind: 'move', item: b.item, grab: day, date: day, moved: false, dup: false, x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height })
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {drag?.kind === 'move' && drag.moved && !drag.item.virtual && (
        <div className="cal-drag-ghost" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w, height: drag.h }}>
          <Item item={drag.item} kind="bar" {...p} onDown={noop} />
        </div>
      )}
    </div>
  )
}
