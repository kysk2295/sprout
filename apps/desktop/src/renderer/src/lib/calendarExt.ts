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
