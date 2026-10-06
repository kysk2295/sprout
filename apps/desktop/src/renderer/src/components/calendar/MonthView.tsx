import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react'
import { addDays, datePart, daysBetween } from '@sprout/schema/time'
import { calWeekHead, packBars, visibleDays, weekHeadClass, weekendClass, type CalItem, type ItemStyle } from '../../lib/calendar'
import { monthAtCenter, monthTopWeek, snapTop, TOTAL_WEEKS, weekAt, weeksInMonth, windowRows } from '../../lib/monthScroll'
import type { DayMarks } from '@sprout/schema/holidays'
import { headWeekday, type WeekStart } from '@sprout/schema/weekStart'
import { SideLabel } from './DayMark'
import { monthMoveChanges, previewOf, resizeBar, spanDays } from '../../lib/calendarDrag'
import { outsideDrag } from '../../lib/calendarDrop'
import { Item } from './TimeGrid'
import type { CalHandlers, Rect } from './types'
import { popoverOpen, quickCreateOpen } from './dismiss'
import { dragSession } from './dragSession'

// 06 §5 월 보기(실측 research 17): 필요한 주만큼 · 칸 날짜 · 막대 · "+N" · 여러 날 막대 · 오늘 칸 칠
// 06 §5.1 세로 스크롤(research 17 §17): 주 줄이 이어서 흐르는 가상 스크롤. 멈추면 주 경계에 맞추고, 제목 달은 화면 가운데 줄을 따른다
const LANE = 19 // 막대 16 + 간격 3
const BAR = 16
const HEAD = 30 // 칸 위쪽 날짜 줄

type Props = CalHandlers & {
  /** 06 §16.1 주 시작(0 일 · 1 월 · 6 토). 바뀌면 부모가 key로 다시 만든다 */
  weekStart: WeekStart
  /** 06 §8 주말 표시(끄면 한 줄 5칸) */
  weekends: boolean
  /** 기준 달(YYYY-MM) — navKey가 바뀔 때 이 달 첫 주로 스크롤한다 */
  month: string
  /** ‹ › ← → 오늘·달 고르기처럼 "이동"할 때만 늘어난다(스크롤로 바뀐 달은 늘리지 않음) */
  navKey: number
  /** 스크롤로 머리 제목 달이 바뀌었을 때 */
  onMonthChange: (ym: string) => void
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

const FADE_MS = 600 // 06 §5.1 떠 있는 달 이름: 멈추고 0.6초 뒤 흐려짐 [임시]
const SMOOTH_ROWS = 8 // 이보다 멀면 부드럽게 말고 바로 이동
const SNAP_WAIT_MS = 90
const labelOf = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`

export function MonthView(p: Props) {
  const { items, today } = p
  const cols = p.weekends ? 7 : 5
  const ws = p.weekStart
  const daysOf = (row: number) => visibleDays(Array.from({ length: 7 }, (_, i) => addDays(weekAt(row, ws), i)), p.weekends)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [viewH, setViewH] = useState(0)
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    setViewH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // 기준 달: 처음 열 때·이동할 때만 바뀐다 → 스크롤하는 동안 줄 높이가 그대로(research 17 §17.2)
  const navSeen = useRef<number | undefined>(undefined)
  const anchor = useRef(p.month)
  const pending = useRef<{ month: string; first: boolean } | undefined>(undefined)
  if (navSeen.current !== p.navKey) {
    pending.current = { month: p.month, first: navSeen.current === undefined }
    navSeen.current = p.navKey
    anchor.current = p.month
  }
  const rowH = viewH ? viewH / weeksInMonth(anchor.current, ws) : 100
  const rowHRef = useRef(rowH)
  const topIdx = useRef(monthTopWeek(p.month, ws)) // 맨 윗줄 번호(소수) — 창 크기가 바뀌어도 같은 주가 맨 위에
  const [win, setWin] = useState<[number, number]>(() => [topIdx.current - 2, topIdx.current + 8])
  const [viewMonth, setViewMonth] = useState(p.month)
  const viewMonthRef = useRef(p.month)
  const programmatic = useRef<number | undefined>(undefined) // 이동 스크롤의 목표 위치 — 그동안 달 바뀜을 알리지 않음(닿으면 한 번)
  const snapping = useRef(false)
  const gesture = useRef<{ start: number; wheels: number; max: number } | undefined>(undefined)
  const fade = useRef<number | undefined>(undefined)
  const silentTop = useRef<number | undefined>(undefined) // 바로 이동(처음 열기·먼 이동)으로 생긴 scroll은 달 이름을 띄우지 않는다
  const requestSnap = useRef<() => void>(() => {}) // 끌기가 끝나면 미뤄 둔 주 경계 맞춤
  const onMonthChange = useRef(p.onMonthChange)
  onMonthChange.current = p.onMonthChange

  // 스크롤 위치 → 그릴 주·제목 달. 줄 경계를 넘거나 달이 바뀔 때만 상태를 바꾼다
  const sync = (report: boolean) => {
    const el = bodyRef.current
    if (!el || !el.clientHeight) return
    const h = rowHRef.current
    const [a, b] = windowRows(el.scrollTop, el.clientHeight, h)
    setWin((w) => (w[0] === a && w[1] === b ? w : [a, b]))
    const m = monthAtCenter(el.scrollTop, el.clientHeight, h, ws)
    if (m !== viewMonthRef.current) {
      viewMonthRef.current = m
      setViewMonth(m)
    }
    if (report) onMonthChange.current(m)
  }

  // 줄 높이가 바뀌면(창 크기·이동) 같은 주를 맨 위에 두고, 이동 요청이 있으면 그 달 첫 주로
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el || !viewH) return
    rowHRef.current = rowH
    el.scrollTop = topIdx.current * rowH
    const nav = pending.current
    if (!nav) programmatic.current = undefined // 창 크기가 바뀌어 이동 움직임이 끊김
    if (nav) {
      pending.current = undefined
      const target = monthTopWeek(nav.month, ws)
      const dist = Math.abs(target - el.scrollTop / rowH)
      viewMonthRef.current = nav.month
      setViewMonth(nav.month)
      if (!nav.first && dist > 0.01 && dist <= SMOOTH_ROWS) {
        programmatic.current = target * rowH
        snapping.current = false
        el.classList.add('is-scrolling')
        el.scrollTo({ top: target * rowH, behavior: 'smooth' })
      } else {
        programmatic.current = undefined
        el.scrollTop = target * rowH
        topIdx.current = target
      }
    }
    if (programmatic.current === undefined) silentTop.current = el.scrollTop
    sync(false)
  }, [rowH, viewH, p.navKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 스크롤·휠은 모두 passive(가로채지 않음 — 트랙패드 관성 그대로). 멈추면(scrollend) 주 경계에 맞춘다
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      window.clearTimeout(snapTimer)
      snapping.current = false
      programmatic.current = undefined
      silentTop.current = undefined
      const g = gesture.current ?? (gesture.current = { start: el.scrollTop, wheels: 0, max: 0 })
      g.wheels += 1
      g.max = Math.max(g.max, Math.abs(e.deltaY))
    }
    const onScroll = () => {
      topIdx.current = el.scrollTop / rowHRef.current
      if (silentTop.current !== undefined && Math.abs(el.scrollTop - silentTop.current) < 0.5) { sync(false); return }
      silentTop.current = undefined
      if (!el.classList.contains('is-scrolling')) el.classList.add('is-scrolling')
      window.clearTimeout(fade.current)
      sync(programmatic.current === undefined)
    }
    const settle = () => { window.clearTimeout(fade.current); fade.current = window.setTimeout(() => el.classList.remove('is-scrolling'), FADE_MS) }
    // 멈춤 맞춤은 scrollend 뒤 잠깐 기다렸다가 — 그사이 휠이 또 오면(같은 손짓·빠르게 굴린 휠) 취소하고 한 손짓으로 이어 센다
    let snapTimer: number | undefined
    const snap = () => {
      snapTimer = undefined
      const g = gesture.current
      gesture.current = undefined
      if (dragRef.current) { settle(); return } // 끄는 중에는 맞추지 않는다(놓일 칸이 흔들리지 않게)
      const h = rowHRef.current
      const top = el.scrollTop
      // 휠 한 칸(이벤트 몇 개 · 큰 delta)은 움직인 방향의 다음 주로, 트랙패드는 가장 가까운 주로
      const target = Math.max(0, Math.min((TOTAL_WEEKS - 1) * h, snapTop(top, g?.start ?? top, h, !!g && g.wheels <= 3 && g.max >= 30)))
      if (Math.abs(target - top) > 0.5) {
        snapping.current = true
        el.scrollTo({ top: target, behavior: 'smooth' })
        return
      }
      settle()
    }
    const onEnd = () => {
      if (silentTop.current !== undefined) return
      if (programmatic.current !== undefined) {
        if (Math.abs(el.scrollTop - programmatic.current) > 1) return // 다음 이동이 앞 움직임을 끊었을 때 — 목표에 닿을 때까지 기다림
        programmatic.current = undefined
        sync(true)
        settle()
        return
      }
      if (snapping.current) { snapping.current = false; settle(); return }
      window.clearTimeout(snapTimer)
      snapTimer = window.setTimeout(snap, SNAP_WAIT_MS)
    }
    requestSnap.current = () => { window.clearTimeout(snapTimer); snapTimer = window.setTimeout(snap, SNAP_WAIT_MS) }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', onEnd)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', onEnd)
      window.clearTimeout(fade.current)
      window.clearTimeout(snapTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const maxLanes = Math.max(1, Math.floor((rowH - HEAD - 4) / LANE))
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag | undefined>(undefined)

  // 스크롤 위치를 반영한 칸(끄는 도중 스크롤해도 맞다)
  const dateAt = (x: number, y: number) => {
    const el = bodyRef.current!
    const r = el.getBoundingClientRect()
    const row = Math.max(0, Math.min(TOTAL_WEEKS - 1, Math.floor((y - r.top + el.scrollTop) / rowHRef.current)))
    const col = Math.max(0, Math.min(cols - 1, Math.floor(((x - r.left) / el.clientWidth) * cols)))
    return daysOf(row)[col]
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
      requestSnap.current()
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
    if (t && t.zone === 'day') return [t.day, t.day]
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
        {calWeekHead(ws).map((w, i) => { const dow = headWeekday(i, ws); return p.weekends || (dow > 0 && dow < 6) ? <span key={w} className={`mv__wd${weekHeadClass(i, ws)}`}>{w}</span> : null })}
      </div>
      <div className="mv__body" ref={bodyRef}>
        <div className="mv__track" style={{ height: TOTAL_WEEKS * rowH }}>
        {Array.from({ length: Math.max(0, win[1] - win[0] + 1) }, (_, k) => win[0] + k).map((r) => {
          const row = daysOf(r)
          const first = Array.from({ length: 7 }, (_, i) => addDays(weekAt(r, ws), i)).find((d) => d.endsWith('-01'))
          const bars = packBars(laidItems, row)
          const covering = row.map((_, c) => bars.filter((b) => b.col <= c && c < b.col + b.span))
          const overflow = covering.some((cv) => cv.length > maxLanes)
          const limit = overflow ? maxLanes - 1 : maxLanes
          return (
            <div key={r} className="mv__row" style={{ top: r * rowH, height: rowH, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {row.map((d, c) => {
                const other = d.slice(0, 7) !== viewMonth
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
              {first && <div className="mv__monthlabel" aria-hidden>{labelOf(first.slice(0, 7))}</div>}
            </div>
          )
        })}
        </div>
      </div>
      {drag?.kind === 'move' && drag.moved && !drag.item.virtual && (
        <div className="cal-drag-ghost" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w, height: drag.h }}>
          <Item item={drag.item} kind="bar" {...p} onDown={noop} />
        </div>
      )}
    </div>
  )
}
