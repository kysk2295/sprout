import { CalendarDays, Check, Repeat } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { addDays, datePart, daysBetween } from '@sprout/schema/time'
import { hourLabel, isBarItem, layoutDay, minutesOfDay, packBars, shortRange, type CalItem, type ItemStyle } from '../../lib/calendar'
import { timeSelection } from '../../lib/calendarSelection'
import { extOf } from '../../lib/calendarExt'
import type { CalHandlers } from './types'

// 06 §4 주 보기 · 일 보기 (실측 research 17): 요일 줄 · 날짜 숫자 줄 · 종일 영역 · 시간 눈금 · 블록 · 현재 시각
const GUTTER = 55
const NUMROW = 34 // 종일 영역 위 날짜 숫자 줄
const LANE = 19 // 막대 16 + 간격 3
const BAR = 16
const BAND = 40 // 접힌 구간 높이
const HIDDEN_END = 7 * 60 // 00:00–07:00
const SNAP = 15
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

type Props = CalHandlers & {
  days: string[]
  items: CalItem[]
  today: string
  hourH: number
  collapsed: boolean
  onCollapsed: (v: boolean) => void
  onDayClick: (day: string) => void
  itemStyle: ItemStyle
}
type Drag =
  | { kind: 'create-time'; day: string; a: number; b: number }
  | { kind: 'create-allday'; a: number; b: number }
  | { kind: 'move'; item: CalItem; grabDate: string; grabMin: number; zone: 'grid' | 'allday'; date: string; min: number; moved: boolean; dup: boolean; x: number; y: number }
  | { kind: 'resize'; item: CalItem; edge: 'top' | 'bottom'; min: number }

const pad = (n: number) => String(n).padStart(2, '0')
const at = (day: string, min: number) => `${day}T${pad(Math.floor(min / 60))}:${pad(min % 60)}`
const snap = (m: number) => Math.max(0, Math.min(24 * 60 - SNAP, Math.round(m / SNAP) * SNAP))
const shiftF = (f: string, days: number, mins: number) => {
  if (!f.includes('T')) return addDays(f, days)
  const total = minutesOfDay(f) + mins
  const d = addDays(datePart(f), days + Math.floor(total / 1440))
  return at(d, ((total % 1440) + 1440) % 1440)
}

export function TimeGrid(p: Props) {
  const { days, items, today, hourH, collapsed } = p
  const n = days.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const alldayRef = useRef<HTMLDivElement>(null)
  const daysRef = useRef(days)
  daysRef.current = days
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag | undefined>(undefined)
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

  const bars = packBars(items.filter(isBarItem), days)
  const lanes = Math.max(1, ...bars.map((b) => b.lane + 1))
  // 06 §4.1: 종일 영역 높이는 내용에 맞춰 자동(최대 화면의 40%)
  const alldayH = Math.min(NUMROW + lanes * LANE + 6, Math.round(window.innerHeight * 0.4))
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

  // ── 끌기 공통 ──
  const edgeTimer = useRef<number>(undefined)
  const start = (e: RPointerEvent, d: Drag) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = d
    setDrag(d)
    const x0 = e.clientX
    const y0 = e.clientY
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (!cur) return
      let next: Drag = cur
      if (cur.kind === 'create-time') next = { ...cur, b: snap(minAt(ev.clientY)) }
      else if (cur.kind === 'create-allday') next = { ...cur, b: colOf(ev.clientX, alldayRef.current) }
      else if (cur.kind === 'resize') next = { ...cur, min: snap(minAt(ev.clientY)) }
      else if (cur.kind === 'move') {
        const moved = cur.moved || Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4
        const zone = inAllday(ev.clientY) ? 'allday' : 'grid'
        const date = daysRef.current[colOf(ev.clientX, zone === 'allday' ? alldayRef.current : gridRef.current)]
        next = { ...cur, moved, zone, date, min: snap(minAt(ev.clientY) - cur.grabMin), dup: ev.altKey, x: ev.clientX, y: ev.clientY }
        // 06 §7.2: 가장자리에 0.6초 머물면 이전·다음 범위로
        const r = gridRef.current!.getBoundingClientRect()
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
        const edge = !inside ? 0 : ev.clientX < r.left + GUTTER + 16 ? -1 : ev.clientX > r.right - 16 ? 1 : 0
        if (moved && edge && !edgeTimer.current) edgeTimer.current = window.setTimeout(() => { edgeTimer.current = undefined; p.onEdgeShift(edge) }, 600)
        if (!edge && edgeTimer.current) { clearTimeout(edgeTimer.current); edgeTimer.current = undefined }
      }
      dragRef.current = next
      setDrag(next)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      clearTimeout(edgeTimer.current)
      edgeTimer.current = undefined
      const d2 = dragRef.current
      dragRef.current = undefined
      setDrag(undefined)
      if (d2) finish(d2, ev)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const finish = (d: Drag, ev: PointerEvent) => {
    const rect = { left: ev.clientX, top: ev.clientY, right: ev.clientX, bottom: ev.clientY }
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
      const t = d.item
      const s = minutesOfDay(t.start)
      const e = t.start !== t.end ? minutesOfDay(t.end) : s + 30
      const day = datePart(t.start)
      const ns = d.edge === 'top' ? Math.min(d.min, e - SNAP) : s
      const ne = d.edge === 'bottom' ? Math.max(d.min, s + SNAP) : e
      p.onMove([{ id: t.task.id, start_at: at(day, ns), due_at: at(day, ne) }], false)
    } else if (d.kind === 'move') {
      const it = d.item
      if (!d.moved) {
        if (ev.metaKey || ev.ctrlKey) p.onSelect(it.task.id, true)
        else p.onOpen(it, (ev.target as HTMLElement).closest('.cal-item')?.getBoundingClientRect() ?? rect)
        return
      }
      if (it.virtual) return
      const listId = document.elementFromPoint(ev.clientX,ev.clientY)?.closest<HTMLElement>('[data-list-target]')?.dataset.listTarget
      if(listId){p.onMoveToList(p.selection.includes(it.task.id)?p.selection:[it.task.id],listId);return}
      const dayDelta = daysBetween(d.grabDate, d.date)
      const group = p.selection.includes(it.task.id) ? p.itemsById(p.selection) : [it]
      const changes = group.map((g) => {
        const isGrabbed = g.task.id === it.task.id
        // 블록 → 종일 영역: 종일 태스크(날짜 유지)
        if (d.zone === 'allday' && !g.allDay && isGrabbed) return { id: g.task.id, start_at: null, due_at: addDays(datePart(g.start), dayDelta) }
        // 종일 막대 → 시간 칸: 그 시각부터 1시간
        if (d.zone === 'grid' && g.allDay && isGrabbed) {
          const s = at(addDays(datePart(g.start), dayDelta), d.min)
          return { id: g.task.id, start_at: s, due_at: shiftF(s, 0, 60) }
        }
        const minDelta = !g.allDay && d.zone === 'grid' && !isBarItem(g) ? d.min - minutesOfDay(it.start) : 0
        const hasRange = !!g.task.start_at
        const ns = shiftF(g.start, dayDelta, minDelta)
        const ne = shiftF(g.end, dayDelta, minDelta)
        return { id: g.task.id, start_at: hasRange ? ns : null, due_at: hasRange ? ne : ns }
      })
      p.onMove(changes, d.dup)
    }
  }

  // 끄는 동안 그릴 미리보기
  const preview = (() => {
    if (!drag) return null
    if (drag.kind === 'create-time') {
      const a = Math.min(drag.a, drag.b)
      const b = drag.a === drag.b ? drag.a : Math.min(1439, Math.max(drag.a, drag.b) + SNAP)
      return { kind: 'range' as const, day: drag.day, a, b }
    }
    if (drag.kind === 'resize') {
      const s = minutesOfDay(drag.item.start)
      const e = drag.item.start !== drag.item.end ? minutesOfDay(drag.item.end) : s + 30
      return { kind: 'ghost' as const, item: drag.item, day: datePart(drag.item.start), a: drag.edge === 'top' ? Math.min(drag.min, e - SNAP) : s, b: drag.edge === 'bottom' ? Math.max(drag.min, s + SNAP) : e }
    }
    if (drag.kind === 'move' && drag.moved && drag.zone === 'grid' && !drag.item.virtual) {
      const len = drag.item.allDay ? 60 : drag.item.start !== drag.item.end ? minutesOfDay(drag.item.end) - minutesOfDay(drag.item.start) : 0
      return { kind: 'ghost' as const, item: drag.item, day: drag.date, a: drag.min, b: drag.min + len }
    }
    return null
  })()
  const pendingStart = p.pending?.start_at ?? p.pending?.due_at
  const pendingDay = pendingStart?.includes('T') ? datePart(pendingStart) : null
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => !collapsed || h * 60 >= HIDDEN_END)

  return (
    <div className="tg">
      <div className="tg__head" style={{ gridTemplateColumns: `${GUTTER}px repeat(${n}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => <div key={d} className="tg__dayhead">{WEEK[new Date(`${d}T00:00`).getDay()]}</div>)}
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
            const moveHere = drag?.kind === 'move' && drag.moved && drag.zone === 'allday' && drag.date === d
            return (
              <div key={d} data-cal-day={d} className={`tg__allday-col${sel || pend || moveHere ? ' is-target' : ''}`}>
                <button className={`tg__num${d === today ? ' is-today' : ''}`} onClick={() => p.onDayClick(d)}>{Number(d.slice(8))}</button>
              </div>
            )
          })}
        </div>
        <div className="tg__bars" style={{ left: GUTTER, top: NUMROW, height: lanes * LANE }}>
          {bars.map((b) => (
            <div key={b.item.key} className="cal-item-wrap" style={{ left: `calc(${(b.col / n) * 100}% + 2px)`, width: `calc(${(b.span / n) * 100}% - 4px)`, top: b.lane * LANE, height: BAR }}>
              <Item item={b.item} kind="bar" {...p} contLeft={b.contLeft} contRight={b.contRight}
                onDown={(e) => start(e, { kind: 'move', item: b.item, grabDate: days[colOf(e.clientX, alldayRef.current)], grabMin: 0, zone: 'allday', date: days[colOf(e.clientX, alldayRef.current)], min: 0, moved: false, dup: false, x: e.clientX, y: e.clientY })}
              />
            </div>
          ))}
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
          {days.map((d) => (
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
                const isDragging = drag && (drag.kind === 'resize' || (drag.kind === 'move' && drag.moved)) && drag.item.key === b.item.key
                return (
                  <div
                    key={b.item.key}
                    className={`cal-item-wrap is-block${isDragging ? ' is-drag-source' : ''}`}
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
                      {...p}
                      onDown={(e) => {
                        const edge = (e.target as HTMLElement).dataset.edge as 'top' | 'bottom' | undefined
                        if (edge && !b.item.virtual) return start(e, { kind: 'resize', item: b.item, edge, min: edge === 'top' ? b.startMin : b.endMin })
                        start(e, { kind: 'move', item: b.item, grabDate: d, grabMin: minAt(e.clientY) - b.startMin, zone: 'grid', date: d, min: b.startMin, moved: false, dup: false, x: e.clientX, y: e.clientY })
                      }}
                    />
                  </div>
                )
              })}
              {preview?.kind === 'range' && preview.day === d && <div className="tg__select" style={{ top: yOf(preview.a), height: Math.max(BAR, yOf(preview.b) - yOf(preview.a)) }} />}
              {!drag && pendingDay === d && pendingStart && (
                <div className="tg__select" style={{ top: yOf(minutesOfDay(pendingStart)), height: Math.max(BAR, yOf(minutesOfDay(p.pending!.due_at!)) - yOf(minutesOfDay(pendingStart))) }} />
              )}
              {preview?.kind === 'ghost' && preview.day === d && (
                <div className="tg__ghost" style={{ top: yOf(preview.a), height: preview.b > preview.a ? Math.max(yOf(preview.b) - yOf(preview.a), BAR) : BAR, ['--item-color' as string]: p.colorOf(preview.item) }}>
                  <span>{preview.item.task.title || '제목 없음'}</span>
                  {preview.b > preview.a && <span className="tg__ghost-time">{shortRange(at(d, preview.a), at(d, preview.b), true)}</span>}
                </div>
              )}
              {/* 06 §4.1 실측: 현재 시각은 오늘 열에만, 왼쪽 끝 점 */}
              {d === today && <div className="tg__now" style={{ top: yOf(nowMin) }} />}
            </div>
          ))}
        </div>
      </div>
      {drag?.kind === 'move' && drag.moved && drag.zone === 'allday' && (
        <div className="cal-drag-chip" style={{ left: drag.x + 12, top: drag.y + 8 }}>{drag.item.task.title || '제목 없음'}</div>
      )}
    </div>
  )
}

/** 막대·블록 한 개(06 §4.2). 스타일 "간결한"은 체크박스 아이콘 없음, "상세한"은 있음.
 * 외부 일정(16 §3.1): 체크박스·가장자리 없음, 제목 앞 작은 캘린더 아이콘, 끌기·빈 칸 만들기 없이 누르면 읽기 전용 팝오버 */
export function Item({ item, kind, contLeft, contRight, onDown, ...p }: CalHandlers & { item: CalItem; kind: 'block' | 'bar'; contLeft?: boolean; contRight?: boolean; onDown: (e: RPointerEvent) => void; itemStyle?: ItemStyle }) {
  const t = item.task
  const ext = extOf(item)
  const done = t.status !== 0
  const now = new Date()
  const nowF = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  const past = (item.end.includes('T') ? item.end : `${item.end}T23:59`) < nowF
  const hasRange = item.start !== item.end
  const timeText = item.start.includes('T') ? shortRange(item.start, item.end, hasRange && datePart(item.start) === datePart(item.end)) : ''
  const detailed = p.itemStyle === 'detailed' && !ext
  const editable = !item.virtual && !ext
  const cls = ['cal-item', `is-${kind}`, done && 'is-done', (past || item.virtual || ext?.stale) && 'is-past', item.virtual && 'is-virtual', ext && 'is-ext', p.selection.includes(t.id) && 'is-selected', contLeft && 'cont-left', contRight && 'cont-right']
  const extDown = (e: RPointerEvent) => { e.stopPropagation(); if (e.button !== 0) return; e.preventDefault() }
  return (
    <div
      className={cls.filter(Boolean).join(' ')}
      style={{ ['--item-color' as string]: p.colorOf(item) }}
      onPointerDown={ext ? extDown : onDown}
      onClick={ext ? (e) => { e.stopPropagation(); p.onOpen(item, e.currentTarget.getBoundingClientRect()) } : undefined}
      onDoubleClick={ext ? (e) => e.stopPropagation() : undefined}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); p.onContext(item, e) }}
      role={ext ? 'button' : undefined}
      aria-label={ext ? `${ext.provider === 'google' ? '구글' : 'Apple'} 일정: ${ext.title}, ${ext.allDay ? ext.start : timeText || ext.start}, 읽기 전용` : undefined}
    >
      {kind === 'block' && editable && <span className="cal-item__edge is-top" data-edge="top" />}
      <span className="cal-item__row">
        {detailed && (
          <button
            className={`cal-item__check${done ? ' is-on' : ''}`}
            aria-label={done ? '완료 취소' : '완료'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!item.virtual) p.onToggle(item) }}
          >
            {done && <Check strokeWidth={3} />}
          </button>
        )}
        {ext ? <CalendarDays className="cal-item__icon" /> : t.repeat_rule && <Repeat className="cal-item__icon" />}
        <span className="cal-item__title">{t.title || '제목 없음'}</span>
        {kind === 'bar' && timeText && <span className="cal-item__time">{timeText.replace(/-.*/, '')}</span>}
      </span>
      {kind === 'block' && hasRange && timeText && <span className="cal-item__sub">{timeText}</span>}
      {kind === 'block' && editable && <span className="cal-item__edge is-bottom" data-edge="bottom" />}
    </div>
  )
}
