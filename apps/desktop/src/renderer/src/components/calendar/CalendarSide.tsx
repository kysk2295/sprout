import { Check, ChevronLeft, ChevronRight, Circle } from 'lucide-react'
import { useState } from 'react'
import { addDays, toDate } from '@sprout/schema/time'
import { listView, type ListRow, type TagRow } from '../../data/types'
import { CAL_WEEK_HEAD as WEEK, calWeekStart, weekHeadClass, weekendClass } from '../../lib/calendar'
import { dayKey } from '../../lib/dates'
import { ExtPanelFilter } from '../calendars/ExtPanelFilter'
import { MyCalRow } from '../events/MyCalRow'
import type { MarkPrefs } from '@sprout/schema/holidays'
import { useDayMarks } from '../../data/calendarOptions'
import './holidays.css'

// 06 §6 왼쪽 패널(실측 research 17 §8): 작은 달력(이번 주 띠 · 태스크 점) + 필터(전체 · 리스트 · 태그 · 캘린더 구독)
type Props = {
  cursor: string
  today: string
  rangeDays: string[] // 주 보기: 이번 주, 일 보기: 그날, 월 보기: 없음
  busyDays: Set<string> // 태스크가 있는 날(점)
  lists: ListRow[]
  tags: TagRow[]
  filterLists: string[]
  filterTags: string[]
  onPick: (day: string) => void
  onFilter: (lists: string[], tags: string[]) => void
  calendarCursor?: string
  /** 06 §14.4.3 "내 일정" 보이기·색 */
  myCal?: { on: boolean; color: string | null | undefined; onChange: (patch: { myCal?: number; myColor?: string | null }) => void }
  /** 06 §16 작은 달력은 빨간 숫자만(이름은 마우스를 올리면) — "휴" 배지는 뺌(사용자 결정 2026-10-05) */
  markPrefs?: MarkPrefs
}
const NO_MARKS: MarkPrefs = { holidays: false, lunar: false, weekNumbers: false }

export function CalendarSide(p: Props) {
  const [month, setMonth] = useState(p.cursor.slice(0, 7))
  const [open, setOpen] = useState({ lists: false, tags: false, subs: false })
  const all = !p.filterLists.length && !p.filterTags.length
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])
  const allLists = p.lists.length > 0 && p.lists.every((l) => p.filterLists.includes(l.id))
  const allTags = p.tags.length > 0 && p.tags.every((t) => p.filterTags.includes(t.id))
  const shift = (n: number) => {
    const d = toDate(`${month}-01`)
    d.setMonth(d.getMonth() + n)
    setMonth(dayKey(0, d).slice(0, 7))
  }
  const first = toDate(`${month}-01`)
  const start = calWeekStart(`${month}-01`)
  // 실측: 작은 달력은 항상 6줄
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)))
  const inRange = (d: string) => p.rangeDays.includes(d)
  const marks = useDayMarks([weeks[0][0], weeks[5][6]], { ...(p.markPrefs ?? NO_MARKS), lunar: false, weekNumbers: false })

  return (
    <aside className="cal-side">
      <div className="cal-side__head">
        <span className="cal-side__month">{first.getFullYear()}년 {first.getMonth() + 1}월</span>
        <span className="cal-side__nav">
          <button aria-label="이전 달" onClick={() => shift(-1)}><ChevronLeft /></button>
          <button aria-label="이번 달" onClick={() => setMonth(p.today.slice(0, 7))}><Circle /></button>
          <button aria-label="다음 달" onClick={() => shift(1)}><ChevronRight /></button>
        </span>
      </div>
      <div className="cal-side__mini">
        <div className="cal-side__wk">{WEEK.map((w, i) => <span key={w} className={weekHeadClass(i).trim() || undefined}>{w}</span>)}</div>
        {weeks.map((w) => {
          const band = p.rangeDays.length > 1 && w.some(inRange)
          return (
            <div key={w[0]} className={`cal-side__row7${band ? ' is-band' : ''}`}>
              {w.map((d) => (
                <button
                  key={d}
                  className={`cal-side__day${d.slice(0, 7) !== month ? ' is-other' : ''}${d === p.today ? ' is-today' : ''}${!band && inRange(d) && d !== p.today ? ' is-picked' : ''}${marks(d, false).holiday ? ' is-holiday' : ''}${weekendClass(d)}`}
                  onClick={() => { p.onPick(d); setMonth(d.slice(0, 7)) }}
                  title={marks(d, false).holiday ?? undefined}
                >
                  {Number(d.slice(8))}
                  {p.busyDays.has(d) && <i className="cal-side__dot" />}
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <div className="cal-side__filters">
        <Row label="전체" on={all} round onClick={() => p.onFilter([], [])} accent={all} />
        <Group label="리스트" open={open.lists} onOpen={() => setOpen((o) => ({ ...o, lists: !o.lists }))} on={allLists} onCheck={() => p.onFilter(allLists ? [] : p.lists.map((l) => l.id), p.filterTags)} />
        {open.lists && p.lists.map((l) => (
          <Row key={l.id} indent icon={l.kind === 'inbox' ? '📥' : (listView(l).emoji ?? '≡')} label={l.kind === 'inbox' ? '기본함' : listView(l).name} on={p.filterLists.includes(l.id)} onClick={() => p.onFilter(toggle(p.filterLists, l.id), p.filterTags)} />
        ))}
        <Group label="태그" open={open.tags} onOpen={() => setOpen((o) => ({ ...o, tags: !o.tags }))} on={allTags} onCheck={() => p.onFilter(p.filterLists, allTags ? [] : p.tags.map((t) => t.id))} />
        {open.tags && p.tags.map((t) => (
          <Row key={t.id} indent icon="#" label={t.name} on={p.filterTags.includes(t.id)} onClick={() => p.onFilter(p.filterLists, toggle(p.filterTags, t.id))} />
        ))}
        {p.myCal && <MyCalRow on={p.myCal.on} color={p.myCal.color} onChange={p.myCal.onChange} />}
        <ExtPanelFilter open={open.subs} onOpen={() => setOpen((o) => ({ ...o, subs: !o.subs }))} cursor={p.calendarCursor ?? p.cursor} />
      </div>
    </aside>
  )
}

function Group({ label, open, onOpen, on, onCheck }: { label: string; open: boolean; onOpen: () => void; on?: boolean; onCheck?: () => void }) {
  return (
    <div className="cal-side__row is-group">
      <button className="cal-side__group" onClick={onOpen}>
        <ChevronRight className={open ? 'is-open' : ''} />
        <span>{label}</span>
      </button>
      {onCheck && <button className={`cal-side__box${on ? ' is-on' : ''}`} aria-label={`${label} 전체`} onClick={onCheck}>{on && <Check strokeWidth={3} />}</button>}
    </div>
  )
}

function Row({ icon, label, on, onClick, round, accent, indent }: { icon?: string; label: string; on: boolean; onClick: () => void; round?: boolean; accent?: boolean; indent?: boolean }) {
  return (
    <button className={`cal-side__row${accent ? ' is-accent' : ''}${indent ? ' is-indent' : ''}`} onClick={onClick}>
      {icon && <span className="cal-side__icon">{icon}</span>}
      <span className="cal-side__label">{label}</span>
      <span className={`cal-side__box${round ? ' is-round' : ''}${on ? ' is-on' : ''}`}>{on && <Check strokeWidth={3} />}</span>
    </button>
  )
}
