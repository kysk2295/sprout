import { AlarmClock, Check, ChevronLeft, ChevronRight, Circle, Clock, Moon, Repeat, Sun, Sunrise, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ALL_DAY_PRESETS, END_TRIGGER, RR_DAY_CODES, TIMED_PRESETS, addDays, addMinutes, datePart, formatTimeKo, hasTime, minutesBetween, minutesToDuration,
  nextWholeHour, parseRule, parseTimeInput, reminderLabel, repeatPresets, rrDayLabel, ruleSummary, stringifyRule, timePart, toDate, withTimeOf, type Rule
} from '@sprout/schema/time'
import { dayKey, moveToDate } from '../lib/dates'
import type { Schedule } from '../lib/taskActions'
import { Popover } from './Popover'
import { CalendarPlus7 } from './icons'
import { markPrefsOf, useCalendarOptions, useDayMarks } from '../data/calendarOptions'
import './calendar/holidays.css'
import { weekHeadClass, weekendClass } from '../lib/calendar'

// 03-date-picker: 날짜 탭 · 기간 탭 · Time/Reminder/Repeat 하위 화면 · Clear/OK
// 바깥 클릭 = OK(저장 후 닫기), Esc = 취소 후 닫기(03 §2)
type Props = {
  initial: Schedule
  anchor?: HTMLElement | null
  point?: { x: number; y: number }
  /** 'date-only': 날짜만 고른다(미루기 › 날짜 지정 등). 결과는 due_at의 날짜만 쓴다 */
  variant?: 'full' | 'date-only'
  onSave: (s: Schedule) => void
  onClose: () => void
}
type Panel = 'time' | 'reminder' | 'reminder-custom' | 'repeat' | 'repeat-custom' | null

export const EMPTY_SCHEDULE: Schedule = { start_at: null, due_at: null, is_all_day: 1, repeat_rule: null, repeat_from: null, reminders: [] }
const WEEK = ['월', '화', '수', '목', '금', '토', '일'] // 주 시작 = 월요일(2026-10-05 사용자 결정, 앱 전체 통일)
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

export function DatePicker({ initial, anchor, point, variant = 'full', onSave, onClose }: Props) {
  const [d, setD] = useState<Schedule>(initial)
  const [tab, setTab] = useState<'date' | 'duration'>(initial.start_at ? 'duration' : 'date')
  const [panel, setPanel] = useState<Panel>(null)
  const today = dayKey()
  const sel = d.due_at ? datePart(d.start_at ?? d.due_at) : null
  const [month, setMonth] = useState(() => (sel ?? today).slice(0, 7))
  const saved = useRef(false)
  const save = (s: Schedule = d) => {
    if (saved.current) return
    saved.current = true
    onSave(s)
    onClose()
  }
  const cancel = () => { saved.current = true; onClose() }
  const full = variant === 'full'
  const allDay = !hasTime(d.due_at)

  // ── 날짜 바꾸기: 시각·기간 유지 ──
  const pickDate = (date: string) => {
    setD((p) => ({ ...p, ...moveToDate(p, date), is_all_day: p.due_at ? p.is_all_day : 1 }))
    setMonth(date.slice(0, 7))
  }
  /** 시각 정하기/지우기. 시각을 넣으면 알림 "정각에"이 자동으로 붙는다(03 §3.1) */
  const setTime = (time: string | null) => {
    setD((p) => {
      const date = p.due_at ? datePart(p.due_at) : today
      if (time === null) return { ...p, start_at: null, due_at: date, is_all_day: 1, reminders: [] }
      const wasAllDay = !hasTime(p.due_at)
      return { ...p, start_at: null, due_at: `${date}T${time}`, is_all_day: 0, reminders: wasAllDay ? ['-PT0M'] : p.reminders }
    })
  }
  // 빠른 선택은 바로 저장하고 닫는다(03 §3). 시각·기간은 유지
  const quick = (date: string, time?: string) => {
    if (time) save({ ...d, start_at: null, due_at: `${date}T${time}`, is_all_day: 0, reminders: hasTime(d.due_at) ? d.reminders : ['-PT0M'] })
    else save({ ...d, ...moveToDate(d, date), is_all_day: d.due_at ? d.is_all_day : 1 })
  }
  const toDuration = () => {
    setTab('duration')
    setD((p) => {
      if (p.start_at) return p
      const date = p.due_at ? datePart(p.due_at) : today
      const start = p.due_at && hasTime(p.due_at) ? p.due_at : `${date}T${timePart(nextWholeHour())}`
      return { ...p, start_at: start, due_at: addMinutes(start, 60), is_all_day: 0, reminders: p.reminders.length ? p.reminders : ['-PT0M'] }
    })
  }
  const toDate1 = () => {
    setTab('date')
    setD((p) => (p.start_at ? { ...p, start_at: null, due_at: p.start_at } : p))
  }

  // 03 §6 키보드
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input')) return
      if (panel) return
      if (e.key === 'Enter') { e.preventDefault(); save() }
      if (tab !== 'date') return
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
      if (step) { e.preventDefault(); pickDate(addDays(sel ?? today, sel ? step : 0)) }
      if (!full) return
      const k = e.key.toLowerCase()
      if (k === 't') quick(today)
      if (k === 'm') quick(dayKey(1))
      if (k === 'w') quick(dayKey(7))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const reminderText = d.reminders.map((r) => reminderLabel(r, allDay)).join(', ')
  const rule = parseRule(d.repeat_rule)

  return (
    <Popover anchor={anchor} point={point} onClose={() => save()} onEscape={cancel} width={260} className="dp">
      {panel === 'time' && <TimePanel value={timePart(d.due_at ?? '')} onBack={() => setPanel(null)} onPick={(t) => { setTime(t); setPanel(null) }} />}
      {panel === 'reminder' && (
        <ReminderPanel
          allDay={allDay}
          duration={!!d.start_at}
          value={d.reminders}
          onChange={(reminders) => setD((p) => ({ ...p, reminders }))}
          onCustom={() => setPanel('reminder-custom')}
          onBack={() => setPanel(null)}
        />
      )}
      {panel === 'reminder-custom' && (
        <ReminderCustom allDay={allDay} onBack={() => setPanel('reminder')} onAdd={(t) => { setD((p) => ({ ...p, reminders: [...new Set([...p.reminders, t])] })); setPanel('reminder') }} />
      )}
      {panel === 'repeat' && (
        <RepeatPanel
          anchorDate={sel ?? today}
          rule={d.repeat_rule}
          onChange={(repeat_rule, repeat_from = 'due') => setD((p) => ({ ...p, repeat_rule, repeat_from: repeat_rule ? repeat_from : null, ...(repeat_rule && !p.due_at ? { due_at: today, is_all_day: 1 } : {}) }))}
          onCustom={() => setPanel('repeat-custom')}
          onBack={() => setPanel(null)}
        />
      )}
      {panel === 'repeat-custom' && (
        <RepeatCustom
          anchorDate={sel ?? today}
          rule={rule}
          from={d.repeat_from}
          onBack={() => setPanel('repeat')}
          onApply={(r, from) => { setD((p) => ({ ...p, repeat_rule: stringifyRule(r), repeat_from: from, ...(!p.due_at ? { due_at: today, is_all_day: 1 } : {}) })); setPanel('repeat') }}
        />
      )}
      {!panel && (
        <>
          {full && (
            <div className="dp__tabs" role="tablist">
              <button role="tab" className={tab === 'date' ? 'is-on' : ''} onClick={toDate1}>날짜</button>
              <button role="tab" className={tab === 'duration' ? 'is-on' : ''} onClick={toDuration}>지속 시간</button>
            </div>
          )}
          {tab === 'date' ? (
            <>
              <div className="dp__quick">
                <QuickBtn icon={<Sun />} label="오늘 (T)" onClick={() => quick(today)} />
                <QuickBtn icon={<Sunrise />} label="내일 (M)" onClick={() => quick(dayKey(1))} />
                <QuickBtn icon={<CalendarPlus7 />} label="다음 주 (W)" onClick={() => quick(dayKey(7))} />
                {full && <QuickBtn icon={<Moon />} label="오늘 밤 20:00" onClick={() => quick(today, '20:00')} />}
              </div>
              <MonthGrid month={month} onMonth={setMonth} today={today} selected={sel ? [sel] : []} onPick={pickDate} />
              {full && (
                <div className="dp__rows">
                  <Row icon={<Clock />} label="시간" value={hasTime(d.due_at) ? formatTimeKo(timePart(d.due_at!)!) : undefined} onOpen={() => setPanel('time')} onClear={() => setTime(null)} />
                  <Row icon={<AlarmClock />} label="알림" value={reminderText || undefined} onOpen={() => setPanel('reminder')} onClear={() => setD((p) => ({ ...p, reminders: [] }))} />
                  <Row icon={<Repeat />} label="반복" value={rule ? ruleSummary(rule, sel) : undefined} onOpen={() => setPanel('repeat')} onClear={() => setD((p) => ({ ...p, repeat_rule: null, repeat_from: null }))} />
                </div>
              )}
            </>
          ) : (
            <DurationTab d={d} setD={setD} reminderText={reminderText} ruleText={rule ? ruleSummary(rule, sel) : ''} onReminder={() => setPanel('reminder')} onRepeat={() => setPanel('repeat')} />
          )}
          <div className="dp__actions">
            <button className="dp__clear" onClick={() => save(EMPTY_SCHEDULE)}>삭제</button>
            <button className="dp__ok" onClick={() => save()}>확인</button>
          </div>
        </>
      )}
    </Popover>
  )
}

function QuickBtn({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button className="dp__quick-btn" title={label} aria-label={label} onClick={onClick}>{icon}</button>
}

function Row({ icon, label, value, onOpen, onClear }: { icon: ReactNode; label: string; value?: string; onOpen: () => void; onClear: () => void }) {
  return (
    <div className={`dp__row${value ? ' is-set' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className="dp__row-icon">{icon}</span>
      <span className="dp__row-label">{value ?? label}</span>
      {/* 02 §0 실측: 오른쪽은 늘 ›, 값이 있으면 호버 때 × */}
      <span className="dp__row-end">
        <ChevronRight className="dp__row-chev" />
        {value && <button className="dp__row-x" aria-label={`${label} 지우기`} onClick={(e) => { e.stopPropagation(); onClear() }}><X /></button>}
      </span>
    </div>
  )
}

/** 6주 고정 달력(03 §3). selected 여러 개 가능(특정 날짜 반복) */
export function MonthGrid({ month, onMonth, today, selected, onPick, compact, range = [] }: { month: string; onMonth: (m: string) => void; today: string; selected: string[]; onPick: (d: string) => void; compact?: boolean; range?: string[] }) {
  const first = toDate(`${month}-01`)
  const lead = (first.getDay() + 6) % 7 // 월요일 시작
  const days = Array.from({ length: 42 }, (_, i) => addDays(`${month}-01`, i - lead))
  // 06 §16 "휴일 표시"가 켜져 있으면 공휴일 숫자를 빨강으로(이름은 마우스를 올리면, "휴" 배지는 뺌 — 사용자 결정 2026-10-05)
  const [calOpts] = useCalendarOptions()
  const marks = useDayMarks([days[0], days[41]], { ...markPrefsOf(calOpts), lunar: false, weekNumbers: false })
  const shift = (n: number) => {
    const d = new Date(first)
    d.setMonth(d.getMonth() + n)
    onMonth(dayKey(0, d).slice(0, 7))
  }
  return (
    <div className={`dp__cal${compact ? ' is-compact' : ''}`}>
      <div className="dp__cal-head">
        <span className="dp__cal-title">{first.getFullYear()}년 {first.getMonth() + 1}월</span>
        <span className="dp__cal-nav">
          <button aria-label="이전 달" onClick={() => shift(-1)}><ChevronLeft /></button>
          <button aria-label="이번 달" onClick={() => onMonth(today.slice(0, 7))}><Circle /></button>
          <button aria-label="다음 달" onClick={() => shift(1)}><ChevronRight /></button>
        </span>
      </div>
      <div className="dp__week">{WEEK.map((w, i) => <span key={w} className={weekHeadClass(i).trim() || undefined}>{w}</span>)}</div>
      <div className="dp__days">
        {days.map((day) => {
          const cls = ['dp__day', day.slice(0, 7) !== month && 'is-other', range.includes(day) && 'is-range', day === today && 'is-today', selected.includes(day) && 'is-selected']
          const mk = marks(day, false)
          if (mk.holiday) cls.push('is-holiday')
          cls.push(weekendClass(day).trim())
          return <button key={day} className={cls.filter(Boolean).join(' ')} onClick={() => onPick(day)} aria-label={day} title={mk.holiday ?? undefined}>{Number(day.slice(8))}</button>
        })}
      </div>
    </div>
  )
}

function SubHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="dp__sub-head">
      <button className="dp__back" aria-label="뒤로" onClick={onBack}><ChevronLeft /></button>
      <span>{title}</span>
    </div>
  )
}

/** 03 §3.1 시간: 입력칸(1730, 5:30pm, 17시 30분) + 30분 간격 목록 + 시간 없음 */
function TimePanel({ value, onPick, onBack }: { value: string | null; onPick: (t: string | null) => void; onBack: () => void }) {
  const [text, setText] = useState(value ?? '')
  const [bad, setBad] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const near = value ?? `${String(new Date().getHours()).padStart(2, '0')}:00`
    list.current?.querySelector<HTMLElement>(`[data-t="${near.slice(0, 3)}${near.slice(3) < '30' ? '00' : '30'}"]`)?.scrollIntoView({ block: 'center' })
  }, [value])
  return (
    <div className="dp__sub">
      <SubHead title="시간" onBack={onBack} />
      <input
        className={`dp__input${bad ? ' is-bad' : ''}`}
        autoFocus
        placeholder="예: 1730, 5:30pm, 17시 30분"
        value={text}
        onChange={(e) => { setText(e.target.value); setBad(false) }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            const t = parseTimeInput(text)
            if (t) onPick(t)
            else setBad(true)
          }
        }}
      />
      <div className="dp__slots" ref={list}>
        {SLOTS.map((s) => (
          <button key={s} data-t={s} className={`dp__slot${s === value ? ' is-on' : ''}`} onClick={() => onPick(s)}>{formatTimeKo(s)}</button>
        ))}
      </div>
      <button className="dp__plain" onClick={() => onPick(null)}>시간 없음</button>
    </div>
  )
}

/** 03 §3.2 알림: 여러 개 선택 */
function ReminderPanel({ allDay, duration, value, onChange, onCustom, onBack }: { allDay: boolean; duration: boolean; value: string[]; onChange: (v: string[]) => void; onCustom: () => void; onBack: () => void }) {
  const presets = [...(allDay ? ALL_DAY_PRESETS : TIMED_PRESETS), ...(duration && !allDay ? [[END_TRIGGER, '끝날 때'] as [string, string]] : [])]
  const custom = value.filter((v) => !presets.some(([p]) => p === v))
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])
  return (
    <div className="dp__sub">
      <SubHead title="알림" onBack={onBack} />
      <div className="dp__list">
        <ListItem label="없음" on={value.length === 0} onClick={() => onChange([])} />
        {presets.map(([t, label]) => <ListItem key={t} label={label} on={value.includes(t)} onClick={() => toggle(t)} />)}
        {custom.map((t) => <ListItem key={t} label={reminderLabel(t, allDay)} on onClick={() => toggle(t)} />)}
        <ListItem label="직접 설정" chevron onClick={onCustom} />
      </div>
    </div>
  )
}
function ListItem({ label, hint, on, chevron, onClick }: { label: string; hint?: string; on?: boolean; chevron?: boolean; onClick: () => void }) {
  return (
    <button className={`dp__item${on ? ' is-on' : ''}`} onClick={onClick}>
      <span>{label}{hint && <span className="dp__hint"> ({hint})</span>}</span>
      {on && <Check className="dp__check" />}
      {chevron && <ChevronRight className="dp__row-chev" />}
    </button>
  )
}

/** 직접 설정 알림: 시각 태스크 = N분/시간/일 전, 종일 태스크 = N일 전 + 시각 (03 §3.2 — 데스크톱 배치 임시) */
function ReminderCustom({ allDay, onAdd, onBack }: { allDay: boolean; onAdd: (trigger: string) => void; onBack: () => void }) {
  const [n, setN] = useState(allDay ? 1 : 15)
  const [unit, setUnit] = useState<'m' | 'h' | 'd'>('m')
  const [time, setTime] = useState('09:00')
  const trigger = allDay
    ? (() => { const [h, m] = (parseTimeInput(time) ?? '09:00').split(':').map(Number); return minutesToDuration(-n * 1440 + h * 60 + m) })()
    : minutesToDuration(-n * (unit === 'm' ? 1 : unit === 'h' ? 60 : 1440))
  return (
    <div className="dp__sub">
      <SubHead title="알림 직접 설정" onBack={onBack} />
      <div className="dp__form">
        <input className="dp__num" type="number" min={0} value={n} onChange={(e) => setN(Math.max(0, Number(e.target.value)))} />
        {allDay ? (
          <>
            <span>일 전</span>
            <input className="dp__input dp__input--time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" />
          </>
        ) : (
          <>
            <select className="dp__select" value={unit} onChange={(e) => setUnit(e.target.value as 'm' | 'h' | 'd')}>
              <option value="m">분</option><option value="h">시간</option><option value="d">일</option>
            </select>
            <span>전</span>
          </>
        )}
      </div>
      <p className="dp__summary">{reminderLabel(trigger, allDay)}</p>
      <button className="dp__ok dp__ok--wide" onClick={() => onAdd(trigger)}>추가</button>
    </div>
  )
}

/** 03 §3.3 반복 목록 + 반복 종료 */
function RepeatPanel({ anchorDate, rule, onChange, onCustom, onBack }: { anchorDate: string; rule: string | null; onChange: (r: string | null, from?: string) => void; onCustom: () => void; onBack: () => void }) {
  const presets = repeatPresets(anchorDate)
  const parsed = parseRule(rule)
  const base = (r: Rule | null) => (r ? stringifyRule({ ...r, until: undefined, count: undefined }) : null)
  const isPreset = presets.some((p) => p.rule === base(parsed))
  const setEnd = (patch: Partial<Rule>) => parsed && onChange(stringifyRule({ ...parsed, until: undefined, count: undefined, ...patch }))
  const endMode = parsed?.until ? 'until' : parsed?.count ? 'count' : 'never'
  const [month, setMonth] = useState((parsed?.until ?? anchorDate).slice(0, 7))
  const keepEnd = (r: string) => {
    const p = parseRule(r)!
    return stringifyRule({ ...p, until: parsed?.until, count: parsed?.count })
  }
  return (
    <div className="dp__sub">
      <SubHead title="반복" onBack={onBack} />
      <div className="dp__list">
        <ListItem label="없음" on={!parsed} onClick={() => onChange(null)} />
        {presets.map((p) => <ListItem key={p.label} label={p.label} hint={p.hint} on={base(parsed) === p.rule} onClick={() => onChange(keepEnd(p.rule))} />)}
        {parsed && !isPreset && <ListItem label={ruleSummary({ ...parsed, until: undefined, count: undefined }, anchorDate)} on onClick={onCustom} />}
        <ListItem label="직접 설정" chevron onClick={onCustom} />
      </div>
      {parsed && (
        <div className="dp__end">
          <div className="dp__caption">반복 종료</div>
          <div className="dp__seg">
            <button className={endMode === 'never' ? 'is-on' : ''} onClick={() => setEnd({})}>안 함</button>
            <button className={endMode === 'until' ? 'is-on' : ''} onClick={() => setEnd({ until: parsed.until ?? addDays(anchorDate, 30) })}>날짜까지</button>
            <button className={endMode === 'count' ? 'is-on' : ''} onClick={() => setEnd({ count: parsed.count ?? 10 })}>횟수</button>
          </div>
          {endMode === 'until' && <MonthGrid compact month={month} onMonth={setMonth} today={dayKey()} selected={[parsed.until!]} onPick={(day) => setEnd({ until: day })} />}
          {endMode === 'count' && (
            <div className="dp__form">
              <input className="dp__num" type="number" min={1} value={parsed.count} onChange={(e) => setEnd({ count: Math.max(1, Number(e.target.value)) })} />
              <span>회 후 끝</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 03 §3.3 직접 설정: 기준(마감일·완료일·특정 날짜) · 주기 · 요일/월 방식 · 요약 */
function RepeatCustom({ anchorDate, rule, from, onApply, onBack }: { anchorDate: string; rule: Rule | null; from: string | null; onApply: (r: Rule, from: string) => void; onBack: () => void }) {
  const a = toDate(anchorDate)
  const anchorCode = RR_DAY_CODES[(a.getDay() + 6) % 7]
  const nth = Math.ceil(a.getDate() / 7)
  const [basis, setBasis] = useState<'due' | 'completion' | 'dates'>(rule?.rdates ? 'dates' : from === 'completion' ? 'completion' : 'due')
  const [freq, setFreq] = useState<Rule['freq']>(rule && !rule.rdates ? rule.freq : 'WEEKLY')
  const [interval, setInterval] = useState(rule?.interval ?? 1)
  const [days, setDays] = useState<string[]>(rule?.freq === 'WEEKLY' && rule.byday?.length ? rule.byday : [anchorCode])
  const [monthMode, setMonthMode] = useState<'day' | 'nth' | 'last'>(rule?.byday?.length && rule.freq === 'MONTHLY' ? 'nth' : rule?.bymonthday?.[0] === -1 ? 'last' : 'day')
  const [dates, setDates] = useState<string[]>(rule?.rdates ?? [anchorDate])
  const [month, setMonth] = useState(anchorDate.slice(0, 7))
  const built: Rule = useMemo(() => {
    if (basis === 'dates') return { freq: 'DAILY', interval: 1, rdates: [...dates].sort() }
    const r: Rule = { freq, interval: Math.max(1, interval), until: rule?.until, count: rule?.count }
    if (basis === 'completion') return r // 완료일 기준은 주기만(03 §3.3)
    if (freq === 'WEEKLY') r.byday = days
    if (freq === 'MONTHLY') {
      if (monthMode === 'day') r.bymonthday = [a.getDate()]
      if (monthMode === 'last') r.bymonthday = [-1]
      if (monthMode === 'nth') r.byday = [`${nth > 4 ? -1 : nth}${anchorCode}`]
    }
    if (freq === 'YEARLY') { r.bymonth = [a.getMonth() + 1]; r.bymonthday = [a.getDate()] }
    return r
  }, [basis, freq, interval, days, monthMode, dates]) // eslint-disable-line react-hooks/exhaustive-deps
  const unitLabel = { DAILY: '일', WEEKLY: '주', MONTHLY: '개월', YEARLY: '년' }
  return (
    <div className="dp__sub">
      <SubHead title="반복 직접 설정" onBack={onBack} />
      <div className="dp__seg">
        <button className={basis === 'due' ? 'is-on' : ''} onClick={() => setBasis('due')}>마감일 기준</button>
        <button className={basis === 'completion' ? 'is-on' : ''} onClick={() => setBasis('completion')}>완료일 기준</button>
        <button className={basis === 'dates' ? 'is-on' : ''} onClick={() => setBasis('dates')}>특정 날짜</button>
      </div>
      {basis === 'dates' ? (
        <MonthGrid compact month={month} onMonth={setMonth} today={dayKey()} selected={dates} onPick={(day) => setDates((p) => (p.includes(day) ? p.filter((x) => x !== day) : [...p, day]))} />
      ) : (
        <>
          <div className="dp__form">
            <span>매</span>
            <input className="dp__num" type="number" min={1} value={interval} onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))} />
            <select className="dp__select" value={freq} onChange={(e) => setFreq(e.target.value as Rule['freq'])}>
              {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map((f) => <option key={f} value={f}>{unitLabel[f]}</option>)}
            </select>
          </div>
          {basis === 'due' && freq === 'WEEKLY' && (
            <div className="dp__pills">
              {RR_DAY_CODES.map((c) => (
                <button key={c} className={days.includes(c) ? 'is-on' : ''} onClick={() => setDays((p) => (p.includes(c) ? (p.length > 1 ? p.filter((x) => x !== c) : p) : [...p, c]))}>{rrDayLabel(c)}</button>
              ))}
            </div>
          )}
          {basis === 'due' && freq === 'MONTHLY' && (
            <div className="dp__list">
              <ListItem label={`매월 ${a.getDate()}일`} on={monthMode === 'day'} onClick={() => setMonthMode('day')} />
              <ListItem label={ruleSummary({ freq: 'MONTHLY', interval: 1, byday: [`${nth > 4 ? -1 : nth}${anchorCode}`] })} on={monthMode === 'nth'} onClick={() => setMonthMode('nth')} />
              <ListItem label="매월 마지막 날" on={monthMode === 'last'} onClick={() => setMonthMode('last')} />
            </div>
          )}
        </>
      )}
      <p className="dp__summary">{basis === 'completion' ? `완료하고 ${interval}${unitLabel[freq]} 뒤` : ruleSummary(built, anchorDate)}</p>
      <button className="dp__ok dp__ok--wide" disabled={basis === 'dates' && !dates.length} onClick={() => onApply(built, basis === 'completion' ? 'completion' : 'due')}>적용</button>
    </div>
  )
}

/** 03 §4 기간 탭 */
function DurationTab({ d, setD, reminderText, ruleText, onReminder, onRepeat }: {
  d: Schedule; setD: React.Dispatch<React.SetStateAction<Schedule>>; reminderText: string; ruleText: string; onReminder: () => void; onRepeat: () => void
}) {
  const allDay = !hasTime(d.due_at)
  const start = d.start_at ?? d.due_at ?? dayKey()
  const end = d.due_at ?? start
  const [open, setOpen] = useState<'sd' | 'ed' | null>(null)
  const [month, setMonth] = useState(start.slice(0, 7))
  const setStart = (s: string) => setD((p) => {
    const len = p.start_at && p.due_at ? minutesBetween(p.start_at, p.due_at) : 60
    return { ...p, start_at: s, due_at: hasTime(s) ? addMinutes(s, len) : addDays(s, Math.max(0, Math.round(len / 1440))) }
  })
  const setEnd = (e: string) => setD((p) => {
    const s = p.start_at ?? e
    // 03 §4: 끝 < 시작이면 끝 = 시작 + 1시간(종일이면 같은 날)
    if (e < s) return { ...p, due_at: hasTime(s) ? addMinutes(s, 60) : s }
    return { ...p, due_at: e }
  })
  const toggleAllDay = () => setD((p) => {
    const s = p.start_at ?? start
    const e = p.due_at ?? end
    if (!allDay) return { ...p, start_at: datePart(s), due_at: datePart(e), is_all_day: 1, reminders: [] }
    const st = `${datePart(s)}T${timePart(nextWholeHour())}`
    return { ...p, start_at: st, due_at: datePart(e) > datePart(s) ? `${datePart(e)}T${timePart(st)}` : addMinutes(st, 60), is_all_day: 0, reminders: ['-PT0M'] }
  })
  const fmtDate = (f: string) => { const x = toDate(f); return `${x.getMonth() + 1}월 ${x.getDate()}일 (${'일월화수목금토'[x.getDay()]})` }
  return (
    <div className="dp__dur">
      {(['sd', 'ed'] as const).map((which) => {
        const value = which === 'sd' ? start : end
        return (
          <div key={which} className="dp__dur-row">
            <span className="dp__dur-label">{which === 'sd' ? '시작' : '끝'}</span>
            <button className={`dp__field${open === which ? ' is-on' : ''}`} onClick={() => { setMonth(value.slice(0, 7)); setOpen(open === which ? null : which) }}>{fmtDate(value)}</button>
            {!allDay && (
              <TimeField value={timePart(value)!} onChange={(t) => (which === 'sd' ? setStart(`${datePart(value)}T${t}`) : setEnd(`${datePart(value)}T${t}`))} />
            )}
          </div>
        )
      })}
      {open && (
        <MonthGrid compact month={month} onMonth={setMonth} today={dayKey()} selected={[datePart(open === 'sd' ? start : end)]} onPick={(day) => {
          if (open === 'sd') setStart(withTimeOf(day, timePart(start)))
          else setEnd(withTimeOf(day, timePart(end)))
          setOpen(null)
        }} />
      )}
      <div className="dp__toggle-row">
        <span>종일</span>
        <button className={`dp__switch${allDay ? ' is-on' : ''}`} role="switch" aria-checked={allDay} onClick={toggleAllDay}><span /></button>
      </div>
      <select className="dp__select dp__select--wide" disabled value="floating" title="다른 시간대 고정은 v1 이후">
        <option value="floating">유동 시간 (Floating)</option>
      </select>
      <div className="dp__rows">
        <Row icon={<AlarmClock />} label="알림" value={reminderText || undefined} onOpen={onReminder} onClear={() => setD((p) => ({ ...p, reminders: [] }))} />
        <Row icon={<Repeat />} label="반복" value={ruleText || undefined} onOpen={onRepeat} onClear={() => setD((p) => ({ ...p, repeat_rule: null, repeat_from: null }))} />
      </div>
    </div>
  )
}

function TimeField({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  useEffect(() => setText(value), [value])
  const commit = () => {
    const t = parseTimeInput(text)
    if (t) onChange(t)
    else setText(value)
  }
  return (
    <div className="dp__timefield">
      <input
        className="dp__field"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { commit(); window.setTimeout(() => setOpen(false), 120) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur() } }}
      />
      {open && (
        <div className="dp__timelist">
          {SLOTS.map((s) => <button key={s} className={s === value ? 'is-on' : ''} onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false) }}>{s}</button>)}
        </div>
      )}
    </div>
  )
}
