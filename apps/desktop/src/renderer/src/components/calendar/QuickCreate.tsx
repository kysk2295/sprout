import { CalendarDays, Flag, Inbox, ListChecks } from 'lucide-react'
import { useRef, useState } from 'react'
import { createCalendarTask } from '../../data/calendarCreate'
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

type Props = { draft: Draft; rect: Rect; lists: ListRow[]; defaultListId: string; onClose: () => void; onCreated: (id: string) => void }

export function QuickCreate({ draft, rect, lists, defaultListId, onClose, onCreated }: Props) {
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
      const id=await createCalendarTask(title,listId,priority,schedule,content)
      onCreated(id)
      onClose()
    } catch {
      done.current=false
      setError('저장하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.')
    } finally {setBusy(false)}
  }
  const cancel = () => { if(busy)return;done.current = true; onClose() }
  return (
    <Popover rect={rect} placement="side" onClose={() => void create()} onEscape={cancel} width={400} className="qc">
      <div className="qc__head">
        <button ref={dateBtn} className="qc__date" aria-label="일정 날짜·시간" onClick={()=>setMenu(menu==='date'?undefined:'date')}><CalendarDays />{draftLabel(schedule)||'날짜 선택'}</button>
        <button ref={flagBtn} className="icon-btn" aria-label="우선순위" style={{ color: flagColor(priority) }} onClick={() => setMenu(menu === 'priority' ? undefined : 'priority')}>
          <Flag fill={priority ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="qc__title-row">
      <input
        ref={input}
        className="qc__input"
        autoFocus
        value={title}
        onChange={e=>setTitle(e.target.value)}
        disabled={busy}
        placeholder="무엇을 하고 싶으신가요?"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (menu) return
          if (e.key === 'Enter') { e.preventDefault(); void create() }
          if (e.key === 'ArrowDown') { e.preventDefault(); setMenu('list') }
        }}
      />
      <ListChecks className="qc__checklist" aria-hidden />
      </div>
      <textarea className="qc__notes" aria-label="설명" placeholder={title ? '설명' : ''} value={content} onChange={e=>setContent(e.target.value)} disabled={busy} />
      {error&&<p role="alert" className="form-error">{error}</p>}
      <div className="qc__foot">
        <button ref={listBtn} className="detail__list" onClick={() => setMenu(menu === 'list' ? undefined : 'list')}>
          <Inbox />{list ? listLabel(list) : '기본함'}
        </button>
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
