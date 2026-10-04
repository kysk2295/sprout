import { Clock, ExternalLink, FileText, MapPin, Repeat } from 'lucide-react'
import type { ReactNode } from 'react'
import { calendarsApi, eventWhen, type ExtEvent } from '../../data/calendars'
import { MenuItem, Popover } from '../Popover'
import type { Rect } from '../calendar/types'
import './calendars.css'

// 16 §3.3 읽기 전용 팝오버 내용(캘린더 팝오버·사이드바 목록 상세가 같이 씀). 체크박스·우선순위·리스트·태그 없음
export const openExt = (e: ExtEvent) => void calendarsApi()?.open(e.accountId, e.calendarId, e.eventId)
export const openLabel = (e: ExtEvent) => (e.provider === 'google' ? '구글 캘린더에서 열기' : '캘린더 앱에서 열기')

/** 설명 글자의 주소는 눌러서 기본 브라우저로 연다 */
function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : part
  )
}

export function ExtEventCard({ ev }: { ev: ExtEvent }) {
  return (
    <div className="ext-card" aria-label={`${ev.provider === 'google' ? '구글' : 'Apple'} 일정: ${ev.title}, ${eventWhen(ev)}, 읽기 전용`}>
      <h3 className="ext-card__title">{ev.title}</h3>
      <div className="ext-card__line"><Clock /><span>{eventWhen(ev)}</span>{ev.recurring && <Repeat className="ext-card__repeat" aria-label="반복 일정" />}</div>
      {ev.location && <div className="ext-card__line"><MapPin /><span>{ev.location}</span></div>}
      {ev.description && <div className="ext-card__line is-desc"><FileText /><p>{linkify(ev.description)}</p></div>}
      <footer className="ext-card__foot">
        <span className="ext-card__dot" style={{ background: ev.color }} />
        <span className="ext-card__cal">{ev.calendarName}</span>
        <span className="ext-card__acct">· {ev.accountLabel}</span>
        {ev.hasLink && <button className="ext-card__open" onClick={() => openExt(ev)}>{openLabel(ev)}<ExternalLink /></button>}
      </footer>
    </div>
  )
}

export function ExtEventPopover({ ev, rect, onClose }: { ev: ExtEvent; rect: Rect; onClose: () => void }) {
  return (
    <Popover rect={rect} placement="side" width={400} className="task-pop ext-pop" onClose={onClose}>
      <ExtEventCard ev={ev} />
    </Popover>
  )
}

/** 16 §4.3 우클릭: 작은 메뉴 하나 */
export function ExtEventMenu({ ev, point, onClose }: { ev: ExtEvent; point: { x: number; y: number }; onClose: () => void }) {
  return (
    <Popover point={point} className="menu" width={200} onClose={onClose}>
      <MenuItem icon={<ExternalLink />} label={openLabel(ev)} disabled={!ev.hasLink} onClick={() => { onClose(); openExt(ev) }} />
    </Popover>
  )
}
