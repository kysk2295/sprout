import { CalendarDays, Flag, Inbox, ListChecks, MapPin } from 'lucide-react'
import { useRef, useState } from 'react'
import { createCalendarTask } from '../../data/calendarCreate'
import { createEvent } from '../../data/events'
import { eventSpan, MY_CAL_COLOR } from '@sprout/schema/events'
import '../events/events.css'
import { DatePicker, EMPTY_SCHEDULE } from '../DatePicker'
import type { Schedule } from '../../lib/taskActions'
import { listLabel, type ListRow } from '../../data/types'
import { dayKey, formatTime } from '../../lib/dates'
import { flagColor } from '../../lib/priority'
import { ListPickerBody, PriorityRow } from '../Pickers'
import { Popover } from '../Popover'
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

type Props = { draft: Draft; rect: Rect; lists: ListRow[]; defaultListId: string; myColor?: string | null; onClose: () => void; onCreated: (id: string) => void; onCreatedEvent?: (id: string) => void }
// 06 §14.4.2: 할 일 · 일정 — 이 기기에서 마지막으로 고른 쪽을 기억한다
export type CreateKind = 'task' | 'event'
const KIND_KEY = 'sprout.cal.qc.kind'
const loadKind = (): CreateKind => { try { return localStorage.getItem(KIND_KEY) === 'event' ? 'event' : 'task' } catch { return 'task' } }
const saveKind = (k: CreateKind) => { try { localStorage.setItem(KIND_KEY, k) } catch { /* 기억만 못 함 */ } }

export function QuickCreate({ draft, rect, lists, defaultListId, myColor, onClose, onCreated, onCreatedEvent }: Props) {
  const [kind, setKindState] = useState<CreateKind>(loadKind)
  const setKind = (k: CreateKind) => { setKindState(k); saveKind(k); input.current?.focus() }
  const [place, setPlace] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const dateBtn = useRef<HTMLButtonElement>(null)
  const [title,setTitle] = useState('')
  const [content,setContent] = useState('')
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [schedule,setSchedule] = useState<Schedule>(()=>({...EMPTY_SCHEDULE,...draft,is_all_day:draft.due_at?.includes('T')?0:1,reminders:draft.due_at?.includes('T')?['-PT0M']:[]}))
  const listBtn = useRef<HTMLButtonElement>(null)
  const flagBtn = useRef<HTMLButtonElement>(null)
  const [listId, setListId] = useState(defaultListId)
  const [priority, setPriority] = useState(0)
  const [menu, setMenu] = useState<'list' | 'priority' | 'date'>()
  const done = useRef(false)
  const list = lists.find((l) => l.id === listId)
  const create = async () => {
    if (done.current || menu) return
    if (!title.trim()) return onClose()
    done.current = true
    setBusy(true);setError('')
    try {
      if (kind === 'event') {
        const id = await createEvent({ title, start_at: schedule.start_at, due_at: schedule.due_at!, repeat_rule: schedule.repeat_rule, reminders: schedule.reminders, notes: content, location: place })
        onCreatedEvent?.(id)
      } else {
        const id=await createCalendarTask(title,listId,priority,schedule,content)
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
          <span className="qc__mycal"><i style={{ background: myColor || MY_CAL_COLOR }} />내 일정</span>
        )}
      </div>
      {menu === 'date' && <DatePicker initial={schedule} anchor={dateBtn.current} onSave={setSchedule} onClose={()=>{setMenu(undefined);input.current?.focus()}}/>}
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
