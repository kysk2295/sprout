import { ArrowRightLeft, CalendarDays, Clock, Copy, FileText, MapPin, PanelTopOpen, Repeat, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { eventToSchedule, MY_CAL_COLOR, parseReminders } from '@sprout/schema/events'
import { eventWhen, useLinkedCalendars } from '../../data/calendars'
import { applyEventSchedule, convertEventToTask, deleteEvents, duplicateEvents, updateEvent, useEvent, type EventRow } from '../../data/events'
import { eventColor } from '../../lib/calendarEvents'
import { isPastExt } from '../../lib/calendarExt'
import { rowDateLabel } from '../../lib/dates'
import { DatePicker } from '../DatePicker'
import { MenuItem, Popover } from '../Popover'
import { useToast } from '../Toast'
import type { Rect } from '../calendar/types'
import '../calendars/calendars.css'
import './events.css'

// 06 §14.4.4 sprout 자체 일정 카드 — 구독 일정 카드(16 §3.3)와 같은 줄 구성이지만 모든 칸을 고친다.
// 제목·장소·설명은 칸을 벗어날 때(또는 팝오버가 닫힐 때) 저장, 날짜는 03 날짜 선택기 OK 때 저장. 반복 일정은 늘 전체를 고친다.

type CardProps = { id: string; myColor?: string | null; onClose: () => void }

export function EventCard({ id, myColor, onClose }: CardProps) {
  const ev = useEvent(id)
  const toast = useToast()
  const linked = useLinkedCalendars() // 16 §12.0 연결된 일정의 캘린더 이름
  const [title, setTitle] = useState<string>()
  const [location, setLocation] = useState<string>()
  const [notes, setNotes] = useState<string>()
  const [picker, setPicker] = useState(false)
  const whenBtn = useRef<HTMLButtonElement>(null)
  // 마지막 값을 닫힐 때도 저장하려고 ref에 둔다(바깥 클릭은 blur보다 먼저 팝오버를 없앤다)
  const latest = useRef({ ev, title, location, notes })
  latest.current = { ev, title, location, notes }
  const commit = async () => {
    const { ev: e, title: t, location: l, notes: n } = latest.current
    if (!e) return
    const patch: Partial<EventRow> = {}
    if (t !== undefined && t.trim() && t.trim() !== (e.title ?? '')) patch.title = t.trim()
    if (l !== undefined && (l.trim() || null) !== (e.location || null)) patch.location = l.trim() || null
    if (n !== undefined && (n.trim() || null) !== (e.notes || null)) patch.notes = n.trim() || null
    if (Object.keys(patch).length) toast.registerUndo(await updateEvent(e.id, patch))
  }
  useEffect(() => () => void commit(), []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ev) return <div className="ext-card evt-card"><p className="evt-card__gone">일정을 찾을 수 없어요</p></div>
  if (ev.deleted_at) return null
  const color = eventColor(ev, myColor)
  const link = ev.ext_provider ? linked.get(`${ev.ext_account}|${ev.ext_calendar}`) : undefined
  const sched = eventToSchedule(ev)
  const remove = async () => {
    onClose()
    toast.show('일정을 삭제했어요', await deleteEvents([ev.id]))
  }
  return (
    <div className="ext-card evt-card" aria-label={`일정: ${ev.title}`}>
      <input
        className="evt-card__title"
        aria-label="일정 제목"
        value={title ?? ev.title ?? ''}
        placeholder="일정 제목"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { void commit(); if (title !== undefined && !title.trim()) setTitle(undefined) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur() }}
      />
      <div className="ext-card__line">
        <Clock />
        <button ref={whenBtn} className="evt-card__when" onClick={() => setPicker(true)} aria-label="날짜·시간 바꾸기">
          {eventWhen({ start: ev.start_at, end: ev.end_at, allDay: !ev.start_at.includes('T') })}
        </button>
        {ev.repeat_rule && <Repeat className="ext-card__repeat" aria-label="반복 일정" />}
      </div>
      <label className="ext-card__line evt-card__field">
        <MapPin />
        <input value={location ?? ev.location ?? ''} placeholder="장소" aria-label="장소" onChange={(e) => setLocation(e.target.value)} onBlur={() => void commit()}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur() }} />
      </label>
      <label className="ext-card__line evt-card__field is-desc">
        <FileText />
        <textarea value={notes ?? ev.notes ?? ''} placeholder="설명" aria-label="설명" rows={Math.min(8, Math.max(2, (notes ?? ev.notes ?? '').split('\n').length))} onChange={(e) => setNotes(e.target.value)} onBlur={() => void commit()} />
      </label>
      <footer className="ext-card__foot">
        <span className="ext-card__dot" style={{ background: color }} />
        <span className="ext-card__cal">{ev.ext_provider ? (link?.name ?? (ev.ext_provider === 'google' ? '구글 캘린더' : ev.ext_provider === 'apple' ? 'Apple 캘린더' : ev.ext_provider === 'device-ios' ? 'iPhone 캘린더' : 'Android 캘린더')) : '내 일정'}</span>
        <span className="ext-card__acct">{link && link.accountLabel !== link.name ? `· ${link.accountLabel}` : ''}</span>
        <button className="icon-btn evt-card__del" aria-label="일정 삭제" title="삭제" onClick={() => void remove()}><Trash2 /></button>
      </footer>
      {ev.ext_error ? <p className="ext-card__err" role="status">{ev.ext_error}</p> : ev.ext_provider && !ev.ext_id ? <p className="ext-card__why">연결한 캘린더에 아직 올리지 않았어요</p> : null}
      {picker && (
        <DatePicker
          initial={{ start_at: sched.start_at, due_at: sched.due_at, is_all_day: ev.start_at.includes('T') ? 0 : 1, repeat_rule: ev.repeat_rule, repeat_from: ev.repeat_rule ? 'due' : null, reminders: parseReminders(ev.reminders) }}
          anchor={whenBtn.current}
          onSave={(s) => void applyEventSchedule(ev.id, s).then((r) => toast.registerUndo(r))}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  )
}

export function EventPopover({ id, rect, myColor, onClose, placement = 'side' }: { id: string; rect: Rect; myColor?: string | null; onClose: () => void; placement?: 'side' | 'below' }) {
  return (
    <Popover rect={rect} placement={placement} width={400} className="task-pop ext-pop evt-pop" onClose={onClose}>
      <EventCard id={id} myColor={myColor} onClose={onClose} />
    </Popover>
  )
}

/** 06 §14.4.4 우클릭: 열기 · 할 일로 바꾸기 · 복제 · 삭제 */
export function EventMenu({ id, point, inboxId, onOpen, onClose, onConverted }: { id: string; point: { x: number; y: number }; inboxId?: string; onOpen: () => void; onClose: () => void; onConverted?: (taskId: string) => void }) {
  const toast = useToast()
  const act = (fn: () => Promise<void>) => () => { onClose(); void fn() }
  return (
    <Popover point={point} className="menu" width={200} onClose={onClose}>
      <MenuItem icon={<PanelTopOpen />} label="열기" onClick={() => { onClose(); onOpen() }} />
      <MenuItem icon={<ArrowRightLeft />} label="할 일로 바꾸기" disabled={!inboxId} onClick={act(async () => {
        const r = await convertEventToTask(id, inboxId!)
        if (r) { toast.show('할 일로 바꿨어요', r.restore); onConverted?.(r.id) }
      })} />
      <MenuItem icon={<Copy />} label="복제" onClick={act(async () => toast.show('복제했어요', await duplicateEvents([{ id, start_at: null, due_at: null }])))} />
      <div className="menu__divider" />
      <MenuItem icon={<Trash2 />} label="삭제" danger onClick={act(async () => toast.show('일정을 삭제했어요', await deleteEvents([id])))} />
    </Popover>
  )
}

/** 06 §14.4.3 오늘·내일·다음 7일 목록의 일정 행 — 구독 일정 행(ExtListRow)과 같은 모양, 누르면 고칠 수 있는 팝오버 */
export function EventListRow({ ev, start, end, color, today, myColor, inboxId }: { ev: EventRow; start: string; end: string; color: string; today: string; myColor?: string | null; inboxId?: string }) {
  const [pop, setPop] = useState<{ kind: 'card'; rect: Rect } | { kind: 'menu'; point: { x: number; y: number } }>()
  const date = rowDateLabel({ start_at: start === end ? null : start, due_at: end }, today)
  const past = isPastExt({ end })
  const open = (el: HTMLElement) => { const r = (el.querySelector('.ext-row__title') ?? el).getBoundingClientRect(); setPop({ kind: 'card', rect: { left: r.left, top: r.top, right: r.left + 400, bottom: r.bottom + 6 } }) }
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-event={ev.id}
        className={`ext-row is-in-list evt-row${pop?.kind === 'card' ? ' is-selected' : ''}${past ? ' is-stale' : ''}`}
        style={{ ['--ext-color' as string]: color || MY_CAL_COLOR }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); open(e.currentTarget) }}
        onKeyDown={(k) => { if (k.key === 'Enter') { k.stopPropagation(); open(k.currentTarget) } }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setPop({ kind: 'menu', point: { x: e.clientX, y: e.clientY } }) }}
        aria-label={`일정: ${ev.title}, ${eventWhen({ start, end, allDay: !start.includes('T') })}`}
      >
        <CalendarDays className="ext-row__icon" aria-hidden />
        <span className="ext-row__title">{ev.title || '제목 없음'}</span>
        {date && <span className={`row__date is-${date.tone}`}>{date.label}</span>}
      </div>
      {pop?.kind === 'card' && <EventPopover id={ev.id} rect={pop.rect} myColor={myColor} placement="below" onClose={() => setPop(undefined)} />}
      {pop?.kind === 'menu' && (
        <EventMenu id={ev.id} point={pop.point} inboxId={inboxId} onClose={() => setPop(undefined)}
          onOpen={() => { const el = document.querySelector<HTMLElement>(`[data-event="${ev.id}"]`); if (el) open(el) }} />
      )}
    </>
  )
}
