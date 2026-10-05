import { AlarmClock, ChevronDown, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MenuItem, Popover } from './Popover'
import { displayTitle } from '@sprout/schema/wikiLink'

// 03 §7 앱이 앞에 있을 때 오른쪽 위 팝업 카드: 제목 · 날짜 · [닫기] [다시 알림 ▾] [완료]
type Fired = { key: string; taskId: string; title: string; body: string }
const SNOOZE: [string, number][] = [['5분 후', 5], ['15분 후', 15], ['30분 후', 30], ['1시간 후', 60], ['내일', 24 * 60]]

export function ReminderCards({ onOpen, onComplete }: { onOpen: (taskId: string) => void; onComplete: (taskId: string) => void }) {
  const [cards, setCards] = useState<Fired[]>([])
  useEffect(() => window.sprout?.reminders?.onFired((f) => setCards((c) => [...c.filter((x) => x.key !== f.key), f])), [])
  const dismiss = (key: string) => setCards((c) => c.filter((x) => x.key !== key))
  if (!cards.length) return null
  return (
    <div className="reminder-cards">
      {cards.map((f) => <Card key={f.key} f={f} onClose={() => dismiss(f.key)} onOpen={onOpen} onComplete={onComplete} />)}
    </div>
  )
}

function Card({ f, onClose, onOpen, onComplete }: { f: Fired; onClose: () => void; onOpen: (id: string) => void; onComplete: (id: string) => void }) {
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <div className="reminder-card" role="alert">
      <AlarmClock className="reminder-card__icon" />
      <button className="reminder-card__text" onClick={() => { onOpen(f.taskId); onClose() }}>
        <strong>{displayTitle(f.title) || '제목 없음'}</strong>
        <span>{f.body}</span>
      </button>
      <button className="reminder-card__x" aria-label="닫기" onClick={onClose}><X /></button>
      <div className="reminder-card__actions">
        <button ref={ref} onClick={() => setMenu(!menu)}>다시 알림 <ChevronDown /></button>
        {!f.taskId.startsWith('ev:') && <button className="is-primary" onClick={() => { onComplete(f.taskId); onClose() }}>완료</button>}{/* 06 §14.4.7 일정은 완료 없음 */}
      </div>
      {menu && (
        <Popover anchor={ref.current} onClose={() => setMenu(false)} width={140} className="menu">
          {SNOOZE.map(([label, min]) => (
            <MenuItem key={label} label={label} onClick={() => { window.sprout?.reminders?.snooze(f, min); setMenu(false); onClose() }} />
          ))}
        </Popover>
      )}
    </div>
  )
}
