import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { MY_CAL_COLOR } from '@sprout/schema/events'
import { ORG_COLORS } from '../../lib/orgColors'
import './events.css'
import '../calendars/calendars.css'

// 06 §14.4.3 캘린더 왼쪽 패널 "내 일정": 체크 = 캘린더 보기에 보이기, 색 점 = 9색 줄(동기화 — view_settings 'calendar')
const PALETTE = [MY_CAL_COLOR, ...ORG_COLORS.filter(Boolean)]
export function MyCalRow({ on, color, onChange }: { on: boolean; color: string | null | undefined; onChange: (patch: { myCal?: number; myColor?: string | null }) => void }) {
  const [open, setOpen] = useState(false)
  const c = color || MY_CAL_COLOR
  return (
    <>
      <div className="cal-side__row is-group my-cal">
        <button className="cal-side__group" onClick={() => onChange({ myCal: on ? 0 : 1 })} aria-pressed={on}>
          <ChevronRight aria-hidden style={{ visibility: 'hidden' }} />{/* 리스트·태그 줄과 글자 시작을 맞춘다 */}
          <span>내 일정</span>
        </button>
        <button className="my-cal__dot" style={{ background: c }} aria-label="내 일정 색 바꾸기" aria-expanded={open} onClick={() => setOpen(!open)} />
        <button className="cal-side__box ext-panel__box" aria-label="내 일정 보이기" style={on ? { background: c, borderColor: c } : { borderColor: c }} onClick={() => onChange({ myCal: on ? 0 : 1 })}>
          {on && <Check strokeWidth={3} />}
        </button>
      </div>
      {open && (
        <div className="my-cal__palette" role="radiogroup" aria-label="내 일정 색">
          {PALETTE.map((p) => (
            <button key={p} role="radio" aria-checked={p === c} aria-label={p} className={p === c ? 'is-on' : ''} style={{ background: p }} onClick={() => { onChange({ myColor: p === MY_CAL_COLOR ? null : p }); setOpen(false) }} />
          ))}
        </div>
      )}
    </>
  )
}
