// 15 일기 화면 공용 날짜 도우미(화면 전용, 계산은 data/diary.ts)
import { dayKey } from '../../lib/dates'

const DAY = ['일', '월', '화', '수', '목', '금', '토']
export const parse = (d: string) => new Date(`${d}T00:00:00`)
export const monthOf = (d: string) => d.slice(0, 7)
export const shiftMonth = (m: string, n: number) => { const d = new Date(`${m}-01T00:00:00`); d.setMonth(d.getMonth() + n); return dayKey(0, d).slice(0, 7) }
export const firstLine = (s: string | null) => (s ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
export const dayName = (d: string) => DAY[parse(d).getDay()]
export function dateLabel(d: string, today: string, long = false) {
  const x = parse(d)
  const year = d.slice(0, 4) === today.slice(0, 4) ? '' : `${x.getFullYear()}년 `
  return `${year}${x.getMonth() + 1}월 ${x.getDate()}일 ${DAY[x.getDay()]}${long ? '요일' : ''}`
}
export const timeKo = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
export const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
