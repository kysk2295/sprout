// 41 작은 조각: 달력 팝오버(날짜 글자 · ⚑ 핵심 날짜 · 고른 띠 날짜 고르기가 같은 모양) · 날짜 글자.
import { useState, type ReactNode } from 'react'
import { MonthGrid } from '../../DatePicker'
import { Popover } from '../../Popover'
import { dayKey } from '../../../lib/dates'
import './direct.css'

/** 03 날짜 고르기를 줄인 모양: 위 내용(빠른 날·안내) · 달력 · 아래 내용 */
export function DayPop({ anchor, point, day, onPick, onClose, top, bottom, width = 260, className = '' }: {
  anchor?: HTMLElement | null; point?: { x: number; y: number }; day: string | null; onPick: (day: string) => void; onClose: () => void
  top?: ReactNode; bottom?: ReactNode; width?: number; className?: string
}) {
  const today = dayKey()
  const [month, setMonth] = useState((day ?? today).slice(0, 7))
  return (
    <Popover anchor={anchor ?? undefined} point={point} onClose={onClose} width={width} className={`menu daypop ${className}`}>
      {top}
      <div className="daypop__cal"><MonthGrid month={month} onMonth={setMonth} today={today} selected={day ? [day] : []} onPick={onPick} compact /></div>
      {bottom}
    </Popover>
  )
}
export const nextMonday = () => { const d = new Date(); const n = ((8 - d.getDay()) % 7) || 7; return dayKey(n) }
