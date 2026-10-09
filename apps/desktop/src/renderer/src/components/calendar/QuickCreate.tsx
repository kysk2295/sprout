import { Check, ChevronDown, CalendarDays, Flag, Inbox, ListChecks, MapPin } from 'lucide-react'
import { useRef, useState } from 'react'
import { createCalendarTask } from '../../data/calendarCreate'
import { createEvent } from '../../data/events'
import { askGrant, loadTarget, saveTarget, useCalendarTargets } from '../../data/calendars'
import { eventSpan, MY_CAL_COLOR } from '@sprout/schema/events'
import '../events/events.css'
import { DatePicker, EMPTY_SCHEDULE } from '../DatePicker'
import type { Schedule } from '../../lib/taskActions'
import { listLabel, type ListRow } from '../../data/types'
import { dayKey, formatTime } from '../../lib/dates'
import { flagColor } from '../../lib/priority'
import { ListPickerBody, PriorityRow } from '../Pickers'
import { MenuItem, Popover } from '../Popover'
import type { Draft, Rect } from './types'

// 06 §7.1 빠른 만들기 팝오버: 📅 날짜 … ⚑ / "무엇을 할까요?" / ⇥ 리스트
// Enter = 만들기, ↓ = 리스트 고르기, Esc = 취소, 제목을 쓴 채 바깥을 누르면 만든다
/** "10월 8일" · "10월 8일, 오후 2:00 - 3:00" · "10월 13일 - 10월 15일" (06 §7.1) */
function draftLabel(d: Draft): string {
  // 실측: 오늘·내일은 앞에 붙인다 — "오늘, 10월 3일"
  const md = (f: string) => {
    const base = `${Number(f.slice(5, 7))}월 ${Number(f.slice(8, 10))}일`
    const day = f.slice(0, 10)
    return day === dayKey() ? `오늘, ${base}` : day === dayKey(1) ? `내일, ${base}` : `${['일','월','화','수','목','금','토'][new Date(`${day}T00:00`).getDay()]}, ${base}`
  }
  if (!d.due_at) return ''
  const s = d.start_at ?? d.due_at
  if (s.slice(0, 10) !== d.due_at.slice(0, 10)) return `${md(s)} - ${md(d.due_at)}`
  if (!s.includes('T')) return md(s)
  return `${md(s)}, ${formatTime(s.slice(11, 16))}${d.start_at ? ` - ${formatTime(d.due_at.slice(11, 16)).replace(formatTime(s.slice(11, 16)).slice(0, 3), '')}` : ''}`
}

/** 일정은 시각 하나 = 1시간(06 §14.4.2) — 머리 날짜 글자도 그 길이로 */
const eventDraft = (d: Schedule): Draft => { const s = eventSpan(d.start_at, d.due_at!); return { start_at: s.start_at === s.end_at ? null : s.start_at, due_at: s.end_at } }

/** 47 §19.2 AI 비서 확인 카드 [고치기]: 카드 값으로 채워 연다(종류·제목·반복). 이때 고른 종류·캘린더는 이 기기에 기억하지 않고, 캘린더는 내 일정 */
export type QuickCreateInitial = { kind: CreateKind; title: string; repeat?: string | null }
type Props = { draft: Draft; rect: Rect; lists: ListRow[]; defaultListId: string; myColor?: string | null; onClose: () => void; onCreated: (id: string) => void; onCreatedEvent?: (id: string) => void; initial?: QuickCreateInitial }
// 06 §14.4.2: 할 일 · 일정 — 이 기기에서 마지막으로 고른 쪽을 기억한다
export type CreateKind = 'task' | 'event'
const KIND_KEY = 'sprout.cal.qc.kind'
const loadKind = (): CreateKind => { try { return localStorage.getItem(KIND_KEY) === 'event' ? 'event' : 'task' } catch { return 'task' } }
const saveKind = (k: CreateKind) => { try { localStorage.setItem(KIND_KEY, k) } catch { /* 기억만 못 함 */ } }

export function QuickCreate({ draft, rect, lists, defaultListId, myColor, onClose, onCreated, onCreatedEvent, initial }: Props) {
  const [kind, setKindState] = useState<CreateKind>(() => initial?.kind ?? loadKind())
  const setKind = (k: CreateKind) => { setKindState(k); if (!initial) saveKind(k); input.current?.focus() }
  const [place, setPlace] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const dateBtn = useRef<HTMLButtonElement>(null)
  const [title,setTitle] = useState(initial?.title ?? '')
  const [content,setContent] = useState('')
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [schedule,setSchedule] = useState<Schedule>(()=>({...EMPTY_SCHEDULE,...draft,is_all_day:draft.due_at?.includes('T')?0:1,reminders:draft.due_at?.includes('T')?['-PT0M']:[],...(initial?.repeat&&draft.due_at?{repeat_rule:initial.repeat,repeat_from:'due' as const}:{})}))
  const listBtn = useRef<HTMLButtonElement>(null)
  const flagBtn = useRef<HTMLButtonElement>(null)
  const [listId, setListId] = useState(defaultListId)
  const [priority, setPriority] = useState(0)
  const [menu, setMenu] = useState<'list' | 'priority' | 'date' | 'target'>()
  // 16 §12.4.1 일정을 저장할 캘린더: 내 일정 / 구글 / Apple — 이 기기에서 마지막으로 고른 것
  const targets = useCalendarTargets()
  const [targetKey, setTargetKey] = useState(() => (initial ? '' : loadTarget()))
  const target = targets.find((t) => t.key === targetKey)
  const targetBtn = useRef<HTMLButtonElement>(null)
  const asking = useRef(false)
  const pickTarget = async (key: string) => {
    const t = targets.find((x) => x.key === key)
    if (t && !t.canWrite) {
      asking.current = true // 권한 대화가 떠 있는 동안 바깥 클릭으로 저장되지 않게
      const ok = await askGrant(t.accountId, t.accountLabel).finally(() => { asking.current = false })
      if (!ok) { setMenu(undefined); input.current?.focus(); return }
    }
    setTargetKey(key); if (!initial) saveTarget(key); setMenu(undefined); input.current?.focus()
  }
  const done = useRef(false)
  const list = lists.find((l) => l.id === listId)
  const create = async () => {
    if (done.current || menu || asking.current) return
    if (!title.trim()) return onClose()
    done.current = true
    setBusy(true);setError('')
    try {
      if (kind === 'event') {
        const link = target ? { provider: target.provider, account: target.accountId, calendar: target.calendarHash, color: target.color } : null
        // 날짜 없는 일정 = 오늘 종일(06 §14.4.6) — [고치기]로 날짜 없는 할 일 카드를 일정으로 바꾼 경우
        const id = await createEvent({ title, start_at: schedule.start_at, due_at: schedule.due_at ?? dayKey(), repeat_rule: schedule.repeat_rule, reminders: schedule.reminders, notes: content, location: place, link })
        onCreatedEvent?.(id)
      } else {
        const id=await createCalendarTask(title,listId,priority,schedule,content,{undated:!!initial})
        onCreated(id)
      }
      onClose()
    } catch {
      done.current=false
      setError('저장하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.')
    } finally {setBusy(false)}
  }
  const cancel = () => { if(busy)return;done.current = true; onClose() }
  return (
    <Popover rect={rect} placement="side" onClose={() => void create()} onEscape={cancel} width={400} className={`qc${kind === 'event' ? ' is-event' : ''}`}>
      <div className="qc__kind" role="tablist" aria-label="만들 종류">
        <button role="tab" aria-selected={kind === 'task'} className={kind === 'task' ? 'is-on' : ''} onClick={() => setKind('task')}>할 일</button>
        <button role="tab" aria-selected={kind === 'event'} className={kind === 'event' ? 'is-on' : ''} onClick={() => setKind('event')}>일정</button>
      </div>
      <div className="qc__head">
        <button ref={dateBtn} className="qc__date" aria-label="일정 날짜·시간" onClick={()=>setMenu(menu==='date'?undefined:'date')}><CalendarDays />{(kind === 'event' && schedule.due_at ? draftLabel(eventDraft(schedule)) : draftLabel(schedule))||'날짜 선택'}</button>
        {kind === 'task' && <button ref={flagBtn} className="icon-btn" aria-label="우선순위" style={{ color: flagColor(priority) }} onClick={() => setMenu(menu === 'priority' ? undefined : 'priority')}>
          <Flag fill={priority ? 'currentColor' : 'none'} />
        </button>}
      </div>
      <div className="qc__title-row">
      <input
        ref={input}
        className="qc__input"
        autoFocus
        value={title}
        onChange={e=>setTitle(e.target.value)}
        disabled={busy}
        placeholder={kind === 'event' ? '일정 제목' : '무엇을 하고 싶으신가요?'}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if ((e.metaKey || e.ctrlKey) && (e.key === '1' || e.key === '2')) { e.preventDefault(); setKind(e.key === '1' ? 'task' : 'event'); return }
          if (menu) return
          if (e.key === 'Enter') { e.preventDefault(); void create() }
          if (e.key === 'ArrowDown' && kind === 'task') { e.preventDefault(); setMenu('list') }
        }}
      />
      {kind === 'task' && <ListChecks className="qc__checklist" aria-hidden />}
      </div>
      {kind === 'event' && <label className="qc__place"><MapPin /><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="장소" aria-label="장소" disabled={busy}
        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); void create() } }} /></label>}
      <textarea className="qc__notes" aria-label="설명" placeholder={title ? '설명' : ''} value={content} onChange={e=>setContent(e.target.value)} disabled={busy} />
      {error&&<p role="alert" className="form-error">{error}</p>}
      <div className="qc__foot">
        {kind === 'task' ? (
          <button ref={listBtn} className="detail__list" onClick={() => setMenu(menu === 'list' ? undefined : 'list')}>
            <Inbox />{list ? listLabel(list) : '기본함'}
          </button>
        ) : (
          <button ref={targetBtn} className="qc__target" aria-label="저장할 캘린더" onClick={() => setMenu(menu === 'target' ? undefined : 'target')}>
            <i style={{ background: target?.color ?? (myColor || MY_CAL_COLOR) }} /><span>{target?.name ?? '내 일정'}</span><ChevronDown />
          </button>
        )}
      </div>
      {menu === 'date' && <DatePicker initial={schedule} anchor={dateBtn.current} onSave={setSchedule} onClose={()=>{setMenu(undefined);input.current?.focus()}}/>}
      {menu === 'target' && (
        <Popover anchor={targetBtn.current} onClose={() => setMenu(undefined)} width={240} className="menu cal-target">
          <MenuItem icon={<span className="cal-target__dot" style={{ background: myColor || MY_CAL_COLOR }} />} label="내 일정" trail={!target ? <Check className="menu__check" /> : undefined} onClick={() => void pickTarget('sprout')} />
          {[...new Set(targets.map((t) => t.group))].map((g) => (
            <div key={g}>
              <div className="menu__divider" />
              <div className="menu__caption">{g}</div>
              {targets.filter((t) => t.group === g).map((t) => (
                <MenuItem key={t.key} icon={<span className="cal-target__dot" style={{ background: t.color }} />} label={t.name}
                  trail={t.key === target?.key ? <Check className="menu__check" /> : !t.canWrite ? <span className="cal-target__need">권한 필요</span> : undefined}
                  onClick={() => void pickTarget(t.key)} />
              ))}
            </div>
          ))}
        </Popover>
      )}
      {menu === 'list' && (
        <Popover anchor={listBtn.current} onClose={() => setMenu(undefined)} width={240} className="menu">
          <ListPickerBody lists={lists} current={listId} onPick={(l) => { setListId(l.id); setMenu(undefined); input.current?.focus() }} />
        </Popover>
      )}
      {menu === 'priority' && (
        <Popover anchor={flagBtn.current} onClose={() => setMenu(undefined)} align="end" className="menu">
          <PriorityRow value={priority} onPick={(v) => { setPriority(v); setMenu(undefined); input.current?.focus() }} />
        </Popover>
      )}
    </Popover>
  )
}
