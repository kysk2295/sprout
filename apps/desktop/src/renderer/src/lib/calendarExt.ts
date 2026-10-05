// 16 §5.2 외부 일정(구글·Apple) → 06 캘린더 항목. 태스크 배치·겹침 계산을 그대로 쓰도록 읽기 전용 가짜 TaskRow를 붙인다.
import type { ExtEvent } from '../../../shared/calendars'
import type { TaskRow } from '../data/types'
import type { CalItem } from './calendar'

export type ExtCalItem = CalItem & { ext: ExtEvent }
export const extOf = (it: CalItem): ExtEvent | undefined => (it as Partial<ExtCalItem>).ext

export function extItems(events: ExtEvent[]): ExtCalItem[] {
  return events.map((e) => {
    const task = {
      id: `ext:${e.key}`, list_id: null, parent_id: null, title: e.title, content: null, content_mode: null, status: 0, priority: 0,
      start_at: e.start === e.end ? null : e.start, due_at: e.end, is_all_day: e.allDay ? 1 : 0, sort_order: null, repeat_rule: null, repeat_from: null, repeat_origin_id: null,
      pinned_at: null, created_at: null, modified_at: null, completed_at: null, deleted_at: null, list_name: null, list_emoji: null, list_color: e.color, list_kind: null,
      tag_ids: null, check_total: 0, check_done: 0, reminder_count: 0
    } satisfies TaskRow
    return { key: `ext:${e.key}`, task, start: e.start, end: e.end, allDay: e.allDay, virtual: false, ext: e }
  })
}

/** 16 §3.1: "완료된 할일 보기"를 끄면 지난 외부 일정도 숨긴다 */
export function isPastExt(e: Pick<ExtEvent, 'end'>, now = new Date()): boolean {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nowF = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  return (e.end.includes('T') ? e.end : `${e.end}T23:59`) < nowF
}

// ── 06 §14.3.1 스마트 리스트(오늘·내일·다음 7일)의 구독 일정 ──
const addDay = (d: string, n: number) => { const x = new Date(`${d}T00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
/** 일정을 보여 주는 스마트 리스트면 그 기간, 아니면 null */
export function smartExtRange(view: string, today: string): { from: string; to: string } | null {
  if (view === 'smart:today') return { from: today, to: today }
  if (view === 'smart:tomorrow') { const d = addDay(today, 1); return { from: d, to: d } }
  if (view === 'smart:next7') return { from: today, to: addDay(today, 6) }
  return null
}
/** 날짜 그룹 id(02 시간 그룹과 같은 이름). 이미 시작한 일정은 오늘 */
export function extTimeGroup(e: Pick<ExtEvent, 'start'>, today: string): 'today' | 'tomorrow' | 'next7' | 'later' {
  const d = e.start.slice(0, 10)
  if (d <= today) return 'today'
  if (d === addDay(today, 1)) return 'tomorrow'
  return d <= addDay(today, 6) ? 'next7' : 'later'
}
/** 그룹 안 순서: 종일 먼저, 그다음 시작 시각, 같으면 제목 */
export function sortExt<T extends Pick<ExtEvent, 'start' | 'allDay' | 'title'>>(evs: T[]): T[] {
  const k = (e: T) => `${e.start.slice(0, 10)}${e.allDay ? ' ' : e.start.slice(10)}`
  return [...evs].sort((a, b) => k(a).localeCompare(k(b)) || a.title.localeCompare(b.title))
}
/** 할 일 행 날짜 글자 규칙(rowDateLabel)에 넣을 모양 */
export const extSpan = (e: Pick<ExtEvent, 'start' | 'end'>) => ({ start_at: e.start === e.end ? null : e.start, due_at: e.end })
