import { useMemo, useState, type CSSProperties } from 'react'
import { addDays } from '@sprout/schema/time'
import type { XpRow } from '../../data/growth'
import { motionReduced, thisWeek } from '../../data/growth'
import { dayKey } from '../../lib/dates'

// 10 §3.1·§3.2 공용 조각: 색종이 · 이번 주 막대 · 연속 일수. 무대(캐릭터 방)는 Stage.tsx
const reduced = motionReduced

/** 색종이 한 번 터뜨리기(1.2초 뒤 사라진다) */
export function Confetti({ count = 18, spread = 120 }: { count?: number; spread?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4
    const d = spread * (0.5 + Math.random() * 0.5)
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, r: Math.random() * 360, c: ['#FFD166', '#FF8FA3', '#7BD389', '#7CA7FF', '#C49BFF'][i % 5] }
  }), [count, spread])
  if (reduced()) return null
  return (
    <span className="confetti" aria-hidden>
      {bits.map((b, i) => <i key={i} style={{ '--x': `${b.x}px`, '--y': `${b.y}px`, '--r': `${b.r}deg`, background: b.c } as CSSProperties} />)}
    </span>
  )
}

/** 이번 주 7일 XP 막대 */
export function WeekChart({ events }: { events: XpRow[] }) {
  const start = thisWeek()
  const today = dayKey()
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const totals = days.map((d) => Math.max(0, events.filter((e) => e.day === d).reduce((s, e) => s + e.amount, 0)))
  const max = Math.max(10, ...totals)
  const [hover, setHover] = useState<number>()
  return (
    <div className="weekchart">
      {days.map((d, i) => (
        <div key={d} className="weekchart__col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(undefined)}>
          {hover === i && <span className="weekchart__tip">{totals[i]} XP</span>}
          <div className="weekchart__track"><span className={`weekchart__bar${d === today ? ' is-today' : ''}${d > today ? ' is-future' : ''}`} style={{ height: `${(totals[i] / max) * 100}%`, animationDelay: `${i * 40}ms` }} /></div>
          <span className={`weekchart__day${d === today ? ' is-today' : ''}`}>{['일', '월', '화', '수', '목', '금', '토'][i]}</span>
        </div>
      ))}
    </div>
  )
}

/** 연속 일수: 오늘(없으면 어제)부터 거꾸로 할 일 XP가 있는 날이 이어진 수 */
export function streakOf(events: XpRow[], today = dayKey()): number {
  const days = new Set(events.filter((e) => e.kind === 'task' && e.amount > 0).map((e) => e.day))
  let d = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(d)) { n++; d = addDays(d, -1) }
  return n
}
