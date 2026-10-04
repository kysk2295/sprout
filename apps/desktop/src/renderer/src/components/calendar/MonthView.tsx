import { useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { addDays, datePart, daysBetween } from '@sprout/schema/time'
import { packBars, type CalItem, type ItemStyle } from '../../lib/calendar'
import { Item } from './TimeGrid'
import type { CalHandlers, Rect } from './types'

// 06 §5 월 보기(실측 research 17): 필요한 주만큼 · 칸 날짜 · 막대 · "+N" · 여러 날 막대 · 오늘 칸 칠
const LANE = 19 // 막대 16 + 간격 3
const BAR = 16
const HEAD = 30 // 칸 위쪽 날짜 줄
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

type Props = CalHandlers & {
  days: string[] // 5주 또는 6주
  month: string // YYYY-MM
  items: CalItem[]
  today: string
  itemStyle: ItemStyle
  onDayClick: (day: string) => void
  onMore: (day: string, rect: Rect) => void
}
type Drag =
  | { kind: 'create'; a: string; b: string }
  | { kind: 'move'; item: CalItem; grab: string; date: string; moved: boolean; dup: boolean }

export function MonthView(p: Props) {
  const { month, items, today } = p
  const nRows = p.days.length / 7
  const rows = Array.from({ length: nRows }, (_, r) => p.days.slice(r * 7, r * 7 + 7))
  const cols = 7
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
    e.preventDefault()
    dragRef.current = d
    setDrag(d)
    const x0 = e.clientX
    const y0 = e.clientY
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current!
      const date = dateAt(ev.clientX, ev.clientY)
      const next: Drag = cur.kind === 'create' ? { ...cur, b: date } : { ...cur, date, moved: cur.moved || Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4, dup: ev.altKey }
      dragRef.current = next
      setDrag(next)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const d2 = dragRef.current!
      dragRef.current = undefined
      setDrag(undefined)
      const rect = { left: ev.clientX, top: ev.clientY, right: ev.clientX, bottom: ev.clientY }
      if (d2.kind === 'create') {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) return
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
      const listId = document.elementFromPoint(ev.clientX,ev.clientY)?.closest<HTMLElement>('[data-list-target]')?.dataset.listTarget
      if(listId){p.onMoveToList(p.selection.includes(it.task.id)?p.selection:[it.task.id],listId);return}
      const delta = daysBetween(d2.grab, d2.date)
      if (!delta) return
      // 06 §7.2: 날짜만 옮기고 시각·기간은 유지
      const group = p.selection.includes(it.task.id) ? p.itemsById(p.selection) : [it]
      p.onMove(group.map((g) => {
        const shift = (f: string) => (f.includes('T') ? `${addDays(datePart(f), delta)}T${f.slice(11)}` : addDays(f, delta))
        return { id: g.task.id, start_at: g.task.start_at ? shift(g.start) : null, due_at: shift(g.end) }
      }), d2.dup)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const inCreate = (d: string) => {
    if (drag?.kind === 'create') {
      const [a, b] = drag.a <= drag.b ? [drag.a, drag.b] : [drag.b, drag.a]
      return a === b && d === a
    }
    if (drag?.kind === 'move' && drag.moved) return d === drag.date
    const pd = p.pending
    return !!pd && !pd.due_at?.includes('T') && d >= (pd.start_at ?? pd.due_at!) && d <= pd.due_at!
  }

  return (
    <div className="mv">
      <div className="mv__head" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {WEEK.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="mv__body" ref={bodyRef} style={{ gridTemplateRows: `repeat(${nRows}, 1fr)` }}>
        {rows.map((row, r) => {
          const bars = packBars(items, row)
          const covering = row.map((_, c) => bars.filter((b) => b.col <= c && c < b.col + b.span))
          const overflow = covering.some((cv) => cv.length > maxLanes)
          const limit = overflow ? maxLanes - 1 : maxLanes
          return (
            <div key={r} className="mv__row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {row.map((d, c) => {
                const other = d.slice(0, 7) !== month
                const label = d.endsWith('-01') ? `${Number(d.slice(5, 7))}월 1일` : String(Number(d.slice(8)))
                const hidden = covering[c].filter((b) => b.lane >= limit).length
                return (
                  <div
                    key={d}
                    data-cal-day={d}
                    className={`mv__cell${other ? ' is-other' : ''}${d === today ? ' is-today' : ''}${inCreate(d) ? ' is-target' : ''}`}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('.cal-item, .mv__num, .mv__more')) return
                      start(e, { kind: 'create', a: d, b: d })
                    }}
                  >
                    <button className={`mv__num${d === today ? ' is-today' : ''}${d.endsWith('-01') ? ' is-first' : ''}`} onClick={() => p.onDayClick(d)}>{label}</button>
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
                    className={`cal-item-wrap${drag?.kind === 'move' && drag.moved && drag.item.key === b.item.key ? ' is-drag-source' : ''}`}
                    style={{ left: `calc(${(b.col / cols) * 100}% + 3px)`, width: `calc(${(b.span / cols) * 100}% - 6px)`, top: HEAD + b.lane * LANE, height: BAR }}
                  >
                    <Item item={b.item} kind="bar" {...p} contLeft={b.contLeft} contRight={b.contRight}
                      onDown={(e) => { e.stopPropagation(); start(e, { kind: 'move', item: b.item, grab: dateAt(e.clientX, e.clientY), date: dateAt(e.clientX, e.clientY), moved: false, dup: false }) }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
