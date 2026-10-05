import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { eventWhen, type ExtEvent } from '../../data/calendars'
import { isPastExt, extSpan } from '../../lib/calendarExt'
import { rowDateLabel } from '../../lib/dates'
import type { Rect } from '../calendar/types'
import { ExtEventMenu, ExtEventPopover } from './ExtEventCard'
import './calendars.css'

// 06 §14.3.1: 오늘·내일·다음 7일 목록 안의 구독 일정 행(읽기 전용).
// 체크박스 자리에 회색 캘린더 아이콘, 제목, 오른쪽 날짜(할 일 행과 같은 글자 규칙), 왼쪽 캘린더 색 줄.
// 선택·끌기·키보드 이동·일괄 편집에 들어가지 않는다 — 누르면 읽기 전용 팝오버, 우클릭은 "…에서 열기"
export function ExtListRow({ ev, today }: { ev: ExtEvent; today: string }) {
  const [pop, setPop] = useState<{ kind: 'card'; rect: Rect } | { kind: 'menu'; point: { x: number; y: number } }>()
  const date = rowDateLabel(extSpan(ev), today)
  const past = isPastExt(ev)
  // 목록 행은 넓어서 옆이 아니라 행 아래(제목 시작에 맞춰)에 띄운다
  const open = (el: HTMLElement) => { const r = (el.querySelector('.ext-row__title') ?? el).getBoundingClientRect(); setPop({ kind: 'card', rect: { left: r.left, top: r.top, right: r.left + 400, bottom: r.bottom + 6 } }) }
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-ext={ev.key}
        className={`ext-row is-in-list${pop?.kind === 'card' ? ' is-selected' : ''}${ev.stale || past ? ' is-stale' : ''}`}
        style={{ ['--ext-color' as string]: ev.color }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); open(e.currentTarget) }}
        onKeyDown={(k) => { if (k.key === 'Enter') { k.stopPropagation(); open(k.currentTarget) } }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setPop({ kind: 'menu', point: { x: e.clientX, y: e.clientY } }) }}
        aria-label={`일정: ${ev.title}, ${eventWhen(ev)}, 읽기 전용`}
      >
        <CalendarDays className="ext-row__icon" aria-hidden />
        <span className="ext-row__title">{ev.title || '제목 없음'}</span>
        {date && <span className={`row__date is-${date.tone}`}>{date.label}</span>}
      </div>
      {pop?.kind === 'card' && <ExtEventPopover ev={ev} rect={pop.rect} placement="below" onClose={() => setPop(undefined)} />}
      {pop?.kind === 'menu' && <ExtEventMenu ev={ev} point={pop.point} onClose={() => setPop(undefined)} />}
    </>
  )
}
