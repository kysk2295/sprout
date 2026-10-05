import { Check, ChevronDown, ChevronLeft, ChevronRight, Circle, ListChecks, MoreHorizontal, PanelLeft, Plus, Rss, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { datePart } from '@sprout/schema/time'
import { useQuery } from '../../data/useQuery'
import { setViewSetting } from '../../data/mutations'
import { loadSchedule } from '../../data/schedule'
import { TASK_COLUMNS } from '../../data/taskQueries'
import type { ListRow, TagRow, TaskRow } from '../../data/types'
import { colorOf, DEFAULT_OPTIONS, itemsOf, rangeOf, shiftCursor, titleOf, weekStart, type CalItem, type CalOptions, type CalView } from '../../lib/calendar'
import { addDays } from '@sprout/schema/time'
import { dayKey } from '../../lib/dates'
import type { Schedule, TaskActions } from '../../lib/taskActions'
import { DatePicker } from '../DatePicker'
import { DetailPane } from '../DetailPane'
import { MenuItem, Popover } from '../Popover'
import { TaskMenu } from '../TaskMenu'
import { useToast } from '../Toast'
import { CalendarSide } from './CalendarSide'
import { MonthView } from './MonthView'
import { QuickCreate } from './QuickCreate'
import { TimeGrid } from './TimeGrid'
import type { CalHandlers, Change, Draft, Rect } from './types'
import { ArrangePanel } from './ArrangePanel'
import { ViewOptions } from './ViewOptions'
import './calendar.css'
import { calendarsApi, openCalendarSettings, useExtEvents, type ExtEvent } from '../../data/calendars'
import { extItems, extOf, isPastExt } from '../../lib/calendarExt'
import { ExtEventMenu, ExtEventPopover } from '../calendars/ExtEventCard'
import { CalendarConnectHost } from '../calendars/ConnectHost'
import { deleteEvents, duplicateEvents, EV_PREFIX, isEventKey, OPEN_EVENT, rescheduleEvents, takeOpenEvent, useEvents } from '../../data/events'
import { eventItems, evtOf } from '../../lib/calendarEvents'
import { EventMenu, EventPopover } from '../events/EventCard'

// 06-calendar: 머리글 · 일/주/월 보기 · 왼쪽 패널 · 팝오버 · 단축키
type Props = { lists: ListRow[]; tags: TagRow[]; inboxId?: string; actions: TaskActions }
type Pop =
  | { kind: 'task'; id: string; rect: Rect }
  | { kind: 'create'; draft: Draft; rect: Rect }
  | { kind: 'more'; day: string; rect: Rect }
  | { kind: 'menu'; ids: string[]; point: { x: number; y: number } }
  | { kind: 'picker'; ids: string[]; initial: Schedule; point: { x: number; y: number } }
  | { kind: 'months'; rect: Rect }
  | { kind: 'ext'; ev: ExtEvent; rect: Rect }
  | { kind: 'extmenu'; ev: ExtEvent; point: { x: number; y: number } }
  | { kind: 'event'; id: string; rect: Rect }
  | { kind: 'evmenu'; id: string; point: { x: number; y: number }; rect: Rect }
const VIEW_LABEL: Record<CalView, string> = { day: '일', week: '주', month: '월' }
const VIEW_KEYS: [CalView, string][] = [['day', 'D/1'], ['week', 'W/2'], ['month', 'M/3']]
// 실측 메뉴의 나머지 항목(일정·멀티데이·다중 주)은 [후보] — 보이되 비활성
const S = 'substr(COALESCE(t.start_at, t.due_at), 1, 10)'
const E = 'substr(t.due_at, 1, 10)'

// 기기에만 저장하는 값(06 §12)
function useLocal<T>(key: string, init: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : init } catch { return init }
  })
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setV((prev) => {
      const v2 = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      try { localStorage.setItem(key, JSON.stringify(v2)) } catch { /* 저장 못 해도 동작에는 영향 없음 */ }
      return v2
    })
  }, [key])
  return [v, set]
}

export function CalendarView({ lists, tags, inboxId, actions }: Props) {
  const [arrange,setArrange] = useLocal('sprout.cal.arrange',false)
  const today = dayKey()
  const toast = useToast()
  const [cursor, setCursor] = useState(today)
  const [selection, setSelection] = useState<string[]>([])
  const [pop, setPop] = useState<Pop>()
  const [menu, setMenu] = useState<'view' | 'more'>()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useLocal('sprout.cal.panel', false)
  const [hourH, setHourH] = useLocal('sprout.cal.hour.v3', 52) // 06 §4.1 실측 52pt
  const [collapsed, setCollapsed] = useLocal('sprout.cal.collapsed.v2', false) // 실측: 기본 펼침
  const viewBtn = useRef<HTMLButtonElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // 06 §2: 창이 900px보다 좁으면 왼쪽 패널은 겹쳐 뜨는 서랍(밖을 누르면 닫힘)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900)
  useEffect(() => { const on = () => setNarrow(window.innerWidth < 900); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])

  // ── 보기 설정(동기화: view_settings 'calendar' 행의 options_json) ──
  const row = useQuery<{ options_json: string | null }>("SELECT options_json FROM view_settings WHERE view_key = 'calendar'")?.[0]
  const opts: CalOptions = useMemo(() => {
    try { return { ...DEFAULT_OPTIONS, ...(row?.options_json ? JSON.parse(row.options_json) : {}) } } catch { return DEFAULT_OPTIONS }
  }, [row?.options_json])
  const setOpts = useCallback((patch: Partial<CalOptions>) => void setViewSetting('calendar', { options_json: JSON.stringify({ ...opts, ...patch }) }), [opts])
  const view = opts.view

  // ── 범위 · 데이터 ──
  const range = rangeOf(view, cursor)
  const days = range.days
  const { sql, params } = useMemo(() => {
    const cond = ['t.due_at IS NOT NULL', 't.deleted_at IS NULL', 'l.archived_at IS NULL']
    const ps: unknown[] = []
    if (!opts.completed) cond.push('t.status = 0')
    let when = `(${S} <= ? AND ${E} >= ?)`
    ps.push(range.to, range.from)
    if (opts.repeats) { when = `(${when} OR (t.repeat_rule IS NOT NULL AND t.status = 0 AND ${S} <= ?))`; ps.push(range.to) }
    cond.push(when)
    // 06 §6 필터: 고른 리스트에 속하거나 고른 태그가 붙은 태스크(합집합)
    if (opts.lists.length || opts.tags.length) {
      const parts: string[] = []
      if (opts.lists.length) { parts.push(`t.list_id IN (${opts.lists.map(() => '?').join(',')})`); ps.push(...opts.lists) }
      if (opts.tags.length) { parts.push(`EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id IN (${opts.tags.map(() => '?').join(',')}))`); ps.push(...opts.tags) }
      cond.push(`(${parts.join(' OR ')})`)
    }
    return { sql: `SELECT ${TASK_COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE ${cond.join(' AND ')} ORDER BY t.due_at, t.priority DESC, t.sort_order`, params: ps }
  }, [opts.completed, opts.repeats, opts.lists, opts.tags, range.from, range.to])
  const tasks = useQuery<TaskRow>(sql, params) ?? []
  // 06 §6 작은 달력의 태스크 점: 그 달 6주 범위에서 날짜가 있는 날
  const miniFrom = weekStart(`${cursor.slice(0, 7)}-01`)
  const busy = useQuery<{ d: string }>(
    `SELECT DISTINCT substr(COALESCE(start_at, due_at), 1, 10) AS d FROM tasks WHERE deleted_at IS NULL AND status = 0 AND due_at IS NOT NULL AND substr(COALESCE(start_at, due_at), 1, 10) BETWEEN ? AND ?`,
    [miniFrom, addDays(miniFrom, 41)]
  ) ?? []
  const busyDays = useMemo(() => new Set(busy.map((b) => b.d)), [busy])
  // 16: 구글·Apple 일정(보이기 + 왼쪽 패널 체크). "완료된 할일 보기"를 끄면 지난 외부 일정도 숨김
  const extEvents = useExtEvents(range.from, range.to, { panel: true })
  useEffect(() => { void calendarsApi()?.refresh() }, []) // 화면에 들어오면 새로 고침(1분 안 중복은 메인이 건너뜀)
  // 06 §14.4.3 sprout 자체 일정("내 일정" 체크). 회차는 늘 계산, "완료된 할일 보기"를 끄면 지난 일정 숨김
  const myEvents = useEvents(range.from, range.to, opts.myCal !== 0)
  const evItems = useMemo(() => {
    const all = eventItems(myEvents, range.from, range.to, opts.myColor)
    return opts.completed ? all : all.filter((it) => !isPastExt({ end: it.end }))
  }, [myEvents, range.from, range.to, opts.myColor, opts.completed])
  const items = useMemo(() => [...itemsOf(tasks, range.from, range.to, !!opts.repeats), ...evItems, ...extItems(opts.completed ? extEvents : extEvents.filter((e) => !isPastExt(e)))], [tasks, range.from, range.to, opts.repeats, extEvents, opts.completed, evItems])
  const tagColor = useCallback((id: string) => tags.find((t) => t.id === id)?.color, [tags])
  const filtered = opts.lists.length > 0 || opts.tags.length > 0

  // ── 동작 ──
  const go = useCallback((n: number) => setCursor((c) => shiftCursor(view, c, n)), [view])
  const setView = (v: CalView) => { setOpts({ view: v }); setMenu(undefined) }
  const openTask = (it: CalItem, rect: Rect) => {
    const ext = extOf(it)
    if (ext) { setSelection([]); setPop({ kind: 'ext', ev: ext, rect }); return }
    const evt = evtOf(it)
    if (evt) { setSelection([it.task.id]); setPop({ kind: 'event', id: evt.id, rect }); return }
    setSelection([it.task.id]); setPop({ kind: 'task', id: it.task.id, rect })
  }
  // 06 §14.4.5 할 일·일정이 섞인 변경을 나눠 저장(일정은 events, 할 일은 기존 동작)
  const moveMixed = (changes: Change[], dup: boolean) => {
    const evs = changes.filter((c) => isEventKey(c.id))
    const ts = changes.filter((c) => !isEventKey(c.id))
    if (ts.length) void actions.reschedule(ts, { duplicate: dup })
    if (evs.length) void (dup ? duplicateEvents(evs).then((r) => toast.show('복제했어요', r)) : rescheduleEvents(evs).then((r) => toast.registerUndo(r)))
  }
  const trashMixed = (ids: string[]) => {
    const evs = ids.filter(isEventKey)
    const ts = ids.filter((id) => !isEventKey(id))
    if (ts.length) void actions.trash(ts)
    if (evs.length) void deleteEvents(evs).then((r) => toast.show(ts.length ? '삭제했어요' : '일정을 삭제했어요', r))
  }
  // 06 §14.2: 항목 아이콘을 꺼도 ⌥(Option)을 누르고 있는 동안은 보인다(틱틱 데스크톱)
  const [altHeld, setAltHeld] = useState(false)
  useEffect(() => {
    const on = (e: KeyboardEvent) => setAltHeld(e.altKey)
    const off = () => setAltHeld(false)
    window.addEventListener('keydown', on)
    window.addEventListener('keyup', on)
    window.addEventListener('blur', off)
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off) }
  }, [])
  const handlers: CalHandlers = {
    selection,
    pending: pop?.kind === 'create' ? pop.draft : undefined,
    showIcons: opts.icons !== 0 || altHeld,
    showCalIcons: opts.calIcons !== 0 || altHeld,
    colorOf: (it) => extOf(it)?.color ?? (evtOf(it) ? it.task.list_color! : colorOf(it.task, opts.color, tagColor)),
    itemsById: (ids) => items.filter((i) => !i.virtual && !extOf(i) && ids.includes(i.task.id)),
    onSelect: (id, toggle) => id.startsWith('ext:') ? undefined : setSelection((s) => (toggle ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id])),
    onOpen: openTask,
    onContext: (it, e) => {
      const ext = extOf(it)
      if (ext) { setPop({ kind: 'extmenu', ev: ext, point: { x: e.clientX, y: e.clientY } }); return }
      const evt = evtOf(it)
      if (evt) { setSelection([it.task.id]); setPop({ kind: 'evmenu', id: evt.id, point: { x: e.clientX, y: e.clientY }, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); return }
      const ids = selection.includes(it.task.id) ? selection : [it.task.id]
      if (!selection.includes(it.task.id)) setSelection([it.task.id])
      setPop({ kind: 'menu', ids, point: { x: e.clientX, y: e.clientY } })
    },
    onToggle: (it) => extOf(it) || evtOf(it) ? undefined : void (it.task.status === 0 ? actions.complete([it.task.id]) : actions.reopen([it.task.id])),
    onCreate: (draft, rect) => { setSelection([]); setPop({ kind: 'create', draft, rect }) },
    onMove: moveMixed,
    onMoveToList: (ids,listId) => { const l=lists.find(x=>x.id===listId);const ts=ids.filter((id)=>!isEventKey(id));if(l&&ts.length)void actions.move(ts,l) },
    onEdgeShift: go
  }

  // 06 §14.4.3 ⌘F 검색에서 고른 일정: 그 날짜로 가서 팝오버를 연다
  useEffect(() => {
    const take = () => {
      const req = takeOpenEvent()
      if (!req) return
      setCursor(req.date)
      const r = bodyRef.current?.getBoundingClientRect()
      const x = r ? r.left + r.width / 2 : window.innerWidth / 2
      const y = r ? r.top + 80 : 120
      setSelection([`${EV_PREFIX}${req.id}`])
      setPop({ kind: 'event', id: req.id, rect: { left: x - 200, right: x + 200, top: y, bottom: y } })
    }
    take()
    window.addEventListener(OPEN_EVENT, take)
    return () => window.removeEventListener(OPEN_EVENT, take)
  }, [])

  // 06 §7.4 단축키 — 입력 중·팝오버가 열려 있을 때는 동작하지 않는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if(e.defaultPrevented)return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return
      if (document.querySelector('.popover, .modal-scrim, [role=dialog]')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { if (toast.undoLast()) e.preventDefault(); return }
      if (mod && e.key === '\\') { e.preventDefault(); setPanelOpen(!panelOpen); return }
      if (mod || e.altKey) return
      const k = e.key.toLowerCase()
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (k === 't') setCursor(today)
      else if (k === 'd' || k === '1') setOpts({ view: 'day' })
      else if (k === 'w' || k === '2') setOpts({ view: 'week' })
      else if (k === 'm' || k === '3') setOpts({ view: 'month' })
      else if (e.key === 'Escape') setSelection([])
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) { e.preventDefault(); trashMixed(selection); setSelection([]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 06 §7.4 트랙패드: 주·일은 좌우, 월은 위아래로 이전·다음. ⌘+휠은 시간 칸 확대
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    let acc = 0
    let lock = 0
    const onWheel = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && view !== 'month') {
        e.preventDefault()
        const f = e.deltaY > 0 ? 0.92 : 1.08
        setHourH((h) => Math.max(36, Math.min(120, Math.round(h * f))))
        return
      }
      const d = view === 'month' ? e.deltaY : Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0
      if (!d) return
      if (view !== 'month') e.preventDefault()
      if (Date.now() < lock) return
      acc += d
      if (Math.abs(acc) > 60) {
        go(acc > 0 ? 1 : -1)
        acc = 0
        lock = Date.now() + 450
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [view, go, setHourH])

  const menuTasks = pop?.kind === 'menu' ? (pop.ids.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as TaskRow[]) : []
  const defaultList = opts.lists.length === 1 ? opts.lists[0] : inboxId

  return (
    <div className="cal">
      {panelOpen && narrow && <div className="cal__scrim" onPointerDown={() => setPanelOpen(false)} />}
      {panelOpen && (
        <div className={`app__sidebar cal__side${narrow ? ' is-overlay' : ''}`}>
          <CalendarSide
            cursor={cursor}
            today={today}
            rangeDays={view === 'month' ? [] : range.days}
            busyDays={busyDays}
            lists={lists}
            tags={tags}
            filterLists={opts.lists}
            filterTags={opts.tags}
            onPick={(d) => { setCursor(d); if (narrow) setPanelOpen(false) }}
            onFilter={(l, t) => setOpts({ lists: l, tags: t })}
            myCal={{ on: opts.myCal !== 0, color: opts.myColor, onChange: setOpts }}
            calendarCursor={cursor}
          />
        </div>
      )}
      <main className="cal__main">
        <header className="cal__header">
          <button className="icon-btn" onClick={() => setPanelOpen(!panelOpen)} aria-label="왼쪽 패널 (⌘\)"><PanelLeft /></button>
          <button className="cal__title" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPop({ kind: 'months', rect: { left: r.left, top: r.bottom + 6, right: r.left, bottom: r.bottom + 6 } }) }}>
            {titleOf(view, cursor)}
          </button>
          {filtered && (
            <button className="cal__filter-chip" onClick={() => setOpts({ lists: [], tags: [] })}>필터 적용 중 ×</button>
          )}
          <div className="cal__tools">
            <button className="cal__btn cal__btn--square" aria-label="태스크 추가" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const day = view === 'day' ? cursor : today
              setPop({ kind: 'create', draft: { start_at: null, due_at: day }, rect: { left: r.left, top: r.bottom, right: r.left, bottom: r.bottom } })
            }}><Plus /></button>
            <button ref={viewBtn} className="cal__btn" onClick={() => setMenu(menu === 'view' ? undefined : 'view')}>{VIEW_LABEL[view]}<ChevronDown /></button>
            <div className="cal__seg">
              <button aria-label="이전" onClick={() => go(-1)}><ChevronLeft /></button>
              <button onClick={() => setCursor(today)}>오늘</button>
              <button aria-label="다음" onClick={() => go(1)}><ChevronRight /></button>
            </div>
            <button ref={moreBtn} className="icon-btn" aria-label="캘린더 메뉴" onClick={() => setMenu(menu === 'more' ? undefined : 'more')}><MoreHorizontal /></button>
          </div>
        </header>
        {menu === 'view' && (
          <Popover anchor={viewBtn.current} onClose={() => setMenu(undefined)} width={190} className="menu cal-viewmenu">
            {VIEW_KEYS.map(([v, key]) => (
              <MenuItem key={v} active={false} icon={view === v ? <Check className="menu__check" /> : <span />} label={VIEW_LABEL[v]} onClick={() => setView(v)} trail={<span className="menu__key">{key}</span>} />
            ))}
            <MenuItem icon={<span />} label="일정" disabled onClick={() => {}} trail={<span className="menu__key">A/4</span>} />
            <div className="menu__divider" />
            <MenuItem icon={<span />} label="멀티데이" disabled onClick={() => {}} trail={<span className="menu__key">5 날들</span>} />
            <MenuItem icon={<span />} label="다중 주" disabled onClick={() => {}} trail={<span className="menu__key">2 주</span>} />
          </Popover>
        )}
        {menu === 'more' && (
          <Popover anchor={moreBtn.current} onClose={() => setMenu(undefined)} align="end" width={200} className="menu">
            <MenuItem icon={<Settings2 />} label="옵션 보기" onClick={() => { setMenu(undefined); setOptionsOpen(true) }} />
            <MenuItem icon={<ListChecks />} label="할일 정렬" onClick={() => {setMenu(undefined);setArrange(!arrange)}} />
            
            <MenuItem icon={<Rss />} label="캘린더 구독" onClick={() => { setMenu(undefined); openCalendarSettings() }} />
          </Popover>
        )}
        <div className="cal__body" ref={bodyRef}>
          {view === 'month' ? (
            <MonthView {...handlers} days={range.days} month={cursor.slice(0, 7)} items={items} today={today} itemStyle={opts.style}
              onDayClick={(d) => { setCursor(d); setOpts({ view: 'day' }) }}
              onMore={(day, r) => setPop({ kind: 'more', day, rect: r })}
            />
          ) : (
            <TimeGrid {...handlers} days={days} items={items} today={today} hourH={hourH} collapsed={collapsed} onCollapsed={setCollapsed} itemStyle={opts.style}
              onDayClick={(d) => { setCursor(d); setOpts({ view: 'day' }) }}
            />
          )}
        </div>
      </main>

      {arrange && <ArrangePanel lists={lists} tags={tags} actions={actions} onClose={()=>setArrange(false)}/>}
      {pop?.kind === 'task' && (
        <Popover rect={pop.rect} placement="side" width={400} className="task-pop" onClose={() => setPop(undefined)}>
          <DetailPane taskId={pop.id} lists={lists} tags={tags} actions={actions} onSelect={(id) => setPop({ ...pop, id })} onClose={() => setPop(undefined)} />
        </Popover>
      )}
      {pop?.kind === 'create' && inboxId && (
        <QuickCreate key={`${pop.draft.start_at}:${pop.draft.due_at}:${pop.rect.left}:${pop.rect.top}`} draft={pop.draft} rect={pop.rect} lists={lists} defaultListId={defaultList ?? inboxId} myColor={opts.myColor} onClose={() => setPop(current=>current===pop?undefined:current)} onCreated={(id) => setSelection([id])} onCreatedEvent={(id) => setSelection([`${EV_PREFIX}${id}`])} />
      )}
      {pop?.kind === 'more' && (
        <Popover rect={pop.rect} placement="side" width={260} className="menu day-pop" onClose={() => setPop(undefined)}>
          <div className="menu__caption">{Number(pop.day.slice(5, 7))}월 {Number(pop.day.slice(8))}일</div>
          {items.filter((i) => datePart(i.start) <= pop.day && datePart(i.end) >= pop.day).map((i) => (
            <MenuItem
              key={i.key}
              icon={<span className="day-pop__dot" style={{ background: handlers.colorOf(i) }} />}
              label={i.task.title || '제목 없음'}
              trail={i.start.includes('T') ? <span className="menu__key">{i.start.slice(11, 16)}</span> : undefined}
              onClick={() => openTask(i, pop.rect)}
            />
          ))}
        </Popover>
      )}
      {pop?.kind === 'menu' && menuTasks.length > 0 && (
        <TaskMenu
          tasks={menuTasks}
          lists={lists}
          tags={tags}
          actions={actions}
          point={pop.point}
          onClose={() => setPop(undefined)}
          onAddSubtask={(id) => setPop({ kind: 'task', id, rect: { left: pop.point.x, top: pop.point.y, right: pop.point.x, bottom: pop.point.y } })}
          onPickDate={async (ids, at) => setPop({ kind: 'picker', ids, initial: await loadSchedule(ids[0]), point: at.point ?? pop.point })}
        />
      )}
      {pop?.kind === 'picker' && (
        <DatePicker initial={pop.initial} point={pop.point} onSave={(s) => void actions.applySchedule(pop.ids, s)} onClose={() => setPop(undefined)} />
      )}
      {pop?.kind === 'months' && (
        <MonthPicker rect={pop.rect} cursor={cursor} today={today} onPick={(m) => { setCursor(`${m}-01`); setPop(undefined) }} onClose={() => setPop(undefined)} />
      )}
      {pop?.kind === 'ext' && <ExtEventPopover ev={pop.ev} rect={pop.rect} onClose={() => setPop(undefined)} />}
      {pop?.kind === 'extmenu' && <ExtEventMenu ev={pop.ev} point={pop.point} onClose={() => setPop(undefined)} />}
      {pop?.kind === 'event' && <EventPopover key={pop.id} id={pop.id} rect={pop.rect} myColor={opts.myColor} onClose={() => setPop(undefined)} />}
      {pop?.kind === 'evmenu' && (
        <EventMenu id={pop.id} point={pop.point} inboxId={inboxId} onClose={() => setPop((cur) => (cur === pop ? undefined : cur))}
          onOpen={() => setPop({ kind: 'event', id: pop.id, rect: pop.rect })}
          onConverted={(taskId) => setSelection([taskId])} />
      )}
      <CalendarConnectHost />
      {optionsOpen && <ViewOptions opts={opts} lists={lists} tags={tags} onChange={setOpts} onClose={() => setOptionsOpen(false)} />}
      {tasks.length === 0 && extEvents.length === 0 && evItems.length === 0 && view === 'month' && !filtered && <div className="cal__empty">이번 달 일정이 없어요</div>}
    </div>
  )
}

/** 06 §3 실측: 제목을 누르면 월 고르기 — "2026 ‹ ○ ›" + 1월~12월 */
function MonthPicker({ rect, cursor, today, onPick, onClose }: { rect: Rect; cursor: string; today: string; onPick: (ym: string) => void; onClose: () => void }) {
  const [year, setYear] = useState(Number(cursor.slice(0, 4)))
  const cur = cursor.slice(0, 7)
  return (
    <Popover rect={rect} width={244} className="menu monthpick" onClose={onClose}>
      <div className="monthpick__head">
        <span>{year}</span>
        <span className="monthpick__nav">
          <button aria-label="이전 해" onClick={() => setYear(year - 1)}><ChevronLeft /></button>
          <button aria-label="올해" onClick={() => setYear(Number(today.slice(0, 4)))}><Circle /></button>
          <button aria-label="다음 해" onClick={() => setYear(year + 1)}><ChevronRight /></button>
        </span>
      </div>
      <div className="monthpick__grid">
        {Array.from({ length: 12 }, (_, i) => {
          const ym = `${year}-${String(i + 1).padStart(2, '0')}`
          return <button key={ym} className={`monthpick__m${ym === cur ? ' is-on' : ''}`} onClick={() => onPick(ym)}>{i + 1}월</button>
        })}
      </div>
    </Popover>
  )
}
