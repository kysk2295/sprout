import { Clock, ExternalLink, FileText, MapPin, Repeat, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { eventSpan } from '@sprout/schema/events'
import { calendarsApi, deleteExt, editExt, eventWhen, type ExtEvent, type ExtPatch } from '../../data/calendars'
import { DatePicker } from '../DatePicker'
import { MenuItem, Popover } from '../Popover'
import { useToast } from '../Toast'
import type { Rect } from '../calendar/types'
import '../events/events.css'
import './calendars.css'

// 16 §3.3 외부 일정 팝오버 내용(캘린더 팝오버·사이드바 목록 상세가 같이 씀). 체크박스·우선순위·리스트·태그 없음.
// §12.5: 쓸 수 있는 캘린더의 캐시 전용 일정은 꿈틀 일정 카드와 같은 줄 구성으로 고친다(반복 범위·참석자 메일은 editExt가 묻는다)
export const openExt = (e: ExtEvent) => void calendarsApi()?.open(e.accountId, e.calendarId, e.eventId)
export const openLabel = (e: ExtEvent) => (e.provider === 'google' ? '구글 캘린더에서 열기' : '캘린더 앱에서 열기')

/** 설명 글자의 주소는 눌러서 기본 브라우저로 연다 */
function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : part
  )
}

/** 팝오버를 연 뒤 바뀐 내용(쓰기·새로 고침)을 다시 읽는다 */
export function useExtEvent(ev: ExtEvent): ExtEvent {
  const [cur, setCur] = useState(ev)
  useEffect(() => { setCur(ev) }, [ev])
  useEffect(() => {
    const api = calendarsApi()
    if (!api) return
    let key = ev.key
    const read = () => void api.event(key).then((v) => { if (v) { key = v.key; setCur(v) } })
    return api.onChanged(read)
  }, [ev.key])
  return cur
}

export function ExtEventCard({ ev: initial, onClose }: { ev: ExtEvent; onClose?: () => void }) {
  const ev = useExtEvent(initial)
  if (ev.writable) return <ExtEditCard key={ev.key} ev={ev} onClose={onClose} />
  return (
    <div className="ext-card" aria-label={`${ev.provider === 'google' ? '구글' : 'Apple'} 일정: ${ev.title}, ${eventWhen(ev)}, 읽기 전용`}>
      <h3 className="ext-card__title">{ev.title}</h3>
      <div className="ext-card__line"><Clock /><span>{eventWhen(ev)}</span>{ev.recurring && <Repeat className="ext-card__repeat" aria-label="반복 일정" />}</div>
      {ev.location && <div className="ext-card__line"><MapPin /><span>{ev.location}</span></div>}
      {ev.description && <div className="ext-card__line is-desc"><FileText /><p>{linkify(ev.description)}</p></div>}
      <footer className="ext-card__foot">
        <span className="ext-card__dot" style={{ background: ev.color }} />
        <span className="ext-card__cal">{ev.calendarName}</span>
        {ev.accountLabel !== ev.calendarName && <span className="ext-card__acct">· {ev.accountLabel}</span>}
        {ev.hasLink && <button className="ext-card__open" onClick={() => openExt(ev)}>{openLabel(ev)}<ExternalLink /></button>}
      </footer>
      {ev.readonlyReason && <p className="ext-card__why">{ev.readonlyReason}</p>}
    </div>
  )
}

/** §12.5 고치는 카드: 칸을 벗어날 때(날짜는 확인) 바로 저장 */
function ExtEditCard({ ev, onClose }: { ev: ExtEvent; onClose?: () => void }) {
  const toast = useToast()
  const [title, setTitle] = useState<string>()
  const [location, setLocation] = useState<string>()
  const [notes, setNotes] = useState<string>()
  const [picker, setPicker] = useState(false)
  const whenBtn = useRef<HTMLButtonElement>(null)
  const latest = useRef({ ev, title, location, notes })
  latest.current = { ev, title, location, notes }
  const saving = useRef(false)
  const commit = async () => {
    const { ev: e, title: t, location: l, notes: n } = latest.current
    const patch: ExtPatch = {}
    if (t !== undefined && t.trim() && t.trim() !== e.title) patch.title = t.trim()
    if (l !== undefined && (l.trim() || null) !== (e.location || null)) patch.location = l.trim() || null
    if (n !== undefined && (n.trim() || null) !== (e.description || null)) patch.description = n.trim() || null
    if (!Object.keys(patch).length || saving.current) return
    saving.current = true
    const ok = await editExt(e, patch, toast).finally(() => { saving.current = false })
    if (!ok) { setTitle(undefined); setLocation(undefined); setNotes(undefined) } // 실패·취소 = 원래 값
  }
  useEffect(() => () => void commit(), []) // eslint-disable-line react-hooks/exhaustive-deps
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur() }
  const remove = async () => { onClose?.(); await deleteExt(ev, toast) }
  return (
    <div className="ext-card evt-card" aria-label={`${ev.provider === 'google' ? '구글' : 'Apple'} 일정: ${ev.title}, ${eventWhen(ev)}`}>
      <input className="evt-card__title" aria-label="일정 제목" value={title ?? ev.title} placeholder="일정 제목" onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { void commit(); if (title !== undefined && !title.trim()) setTitle(undefined) }} onKeyDown={blurOnEnter} />
      <div className="ext-card__line">
        <Clock />
        <button ref={whenBtn} className="evt-card__when" onClick={() => setPicker(true)} aria-label="날짜·시간 바꾸기">{eventWhen(ev)}</button>
        {ev.recurring && <Repeat className="ext-card__repeat" aria-label="반복 일정" />}
      </div>
      <label className="ext-card__line evt-card__field">
        <MapPin />
        <input value={location ?? ev.location ?? ''} placeholder="장소" aria-label="장소" onChange={(e) => setLocation(e.target.value)} onBlur={() => void commit()} onKeyDown={blurOnEnter} />
      </label>
      <label className="ext-card__line evt-card__field is-desc">
        <FileText />
        <textarea value={notes ?? ev.description ?? ''} placeholder="설명" aria-label="설명" rows={Math.min(8, Math.max(2, (notes ?? ev.description ?? '').split('\n').length))} onChange={(e) => setNotes(e.target.value)} onBlur={() => void commit()} />
      </label>
      <footer className="ext-card__foot">
        <span className="ext-card__dot" style={{ background: ev.color }} />
        <span className="ext-card__cal">{ev.calendarName}</span>
        {ev.accountLabel !== ev.calendarName && <span className="ext-card__acct">· {ev.accountLabel}</span>}
        {ev.hasLink && <button className="ext-card__open" onClick={() => openExt(ev)}>{openLabel(ev)}<ExternalLink /></button>}
        <button className="icon-btn evt-card__del" aria-label="일정 삭제" title="삭제" onClick={() => void remove()}><Trash2 /></button>
      </footer>
      {picker && (
        <DatePicker
          datesOnly
          initial={{ start_at: ev.start === ev.end ? null : ev.start, due_at: ev.end, is_all_day: ev.allDay ? 1 : 0, repeat_rule: null, repeat_from: null, reminders: [] }}
          anchor={whenBtn.current}
          onSave={(s) => {
            if (!s.due_at) return // 외부 일정은 날짜가 꼭 있다
            const sp = eventSpan(s.start_at, s.due_at)
            if (sp.start_at === ev.start && sp.end_at === ev.end && !!sp.is_all_day === ev.allDay) return
            void editExt(ev, { start: sp.start_at, end: sp.end_at, allDay: !!sp.is_all_day }, toast)
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  )
}

export function ExtEventPopover({ ev, rect, onClose, placement = 'side' }: { ev: ExtEvent; rect: Rect; onClose: () => void; placement?: 'side' | 'below' }) {
  return (
    <Popover rect={rect} placement={placement} width={400} className={`task-pop ext-pop${ev.writable ? ' evt-pop' : ''}`} onClose={onClose}>
      <ExtEventCard ev={ev} onClose={onClose} />
    </Popover>
  )
}

/** 16 §4.3·§12.5 우클릭: 열기 · (쓸 수 있으면) 삭제 */
export function ExtEventMenu({ ev, point, onClose, onOpen }: { ev: ExtEvent; point: { x: number; y: number }; onClose: () => void; onOpen?: () => void }) {
  const toast = useToast()
  return (
    <Popover point={point} className="menu" width={200} onClose={onClose}>
      {ev.writable && onOpen && <MenuItem label="열기" onClick={() => { onClose(); onOpen() }} />}
      <MenuItem icon={<ExternalLink />} label={openLabel(ev)} disabled={!ev.hasLink} onClick={() => { onClose(); openExt(ev) }} />
      {ev.writable && <div className="menu__divider" />}
      {ev.writable && <MenuItem icon={<Trash2 />} label="삭제" danger onClick={() => { onClose(); void deleteExt(ev, toast) }} />}
    </Popover>
  )
}
