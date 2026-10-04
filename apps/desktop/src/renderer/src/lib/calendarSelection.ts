import type { Draft } from '../components/calendar/types'
/** Native calendar: click is a point; dragging includes the final 15-minute slot. */
export function timeSelection(day: string, a: number, b: number): Draft {
  const at = (m: number) => `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  if (a === b) return { start_at: null, due_at: at(a) }
  return { start_at: at(Math.min(a, b)), due_at: at(Math.min(1439, Math.max(a, b) + 15)) }
}
