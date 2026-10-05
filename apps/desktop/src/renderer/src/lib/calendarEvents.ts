// 06 §14.4 sprout 자체 일정 → 06 캘린더 항목·목록 행. 구독 일정(calendarExt)처럼 가짜 TaskRow를 붙여
// 배치·겹침 계산을 그대로 쓰되, 고칠 수 있다(끌기·길이·팝오버). 회차는 늘 계산해서 그린다(§14.4.3).
import { MY_CAL_COLOR, occurrences, type Occurrence } from '@sprout/schema/events'
import type { EventRow } from '../data/events'
import { EV_PREFIX } from '../data/events'
import type { TaskRow } from '../data/types'
import type { CalItem } from './calendar'

export type EventCalItem = CalItem & { evt: EventRow; occ: Occurrence }
export const evtOf = (it: CalItem): EventRow | undefined => (it as Partial<EventCalItem>).evt
export const eventColor = (e: Pick<EventRow, 'color'>, myColor?: string | null) => e.color || myColor || MY_CAL_COLOR

function fakeTask(e: EventRow, o: Occurrence, color: string): TaskRow {
  return {
    id: `${EV_PREFIX}${e.id}`, list_id: null, parent_id: null, title: e.title ?? '', content: e.notes, content_mode: null, status: 0, priority: 0,
    start_at: o.start === o.end ? null : o.start, due_at: o.end, is_all_day: e.is_all_day, sort_order: null, repeat_rule: e.repeat_rule, repeat_from: null, repeat_origin_id: null,
    pinned_at: null, created_at: e.created_at, modified_at: e.modified_at, completed_at: null, deleted_at: null, list_name: null, list_emoji: null, list_color: color, list_kind: null,
    tag_ids: null, check_total: 0, check_done: 0, reminder_count: 0
  }
}

export function eventItems(rows: EventRow[], from: string, to: string, myColor?: string | null): EventCalItem[] {
  const out: EventCalItem[] = []
  for (const e of rows) {
    const color = eventColor(e, myColor)
    for (const o of occurrences(e, from, to)) {
      out.push({ key: `${EV_PREFIX}${e.id}${o.virtual ? `@${o.date}` : ''}`, task: fakeTask(e, o, color), start: o.start, end: o.end, allDay: !o.start.includes('T'), virtual: o.virtual, evt: e, occ: o })
    }
  }
  return out
}

/** 목록(오늘·내일·다음 7일) 한 줄 — 구독 일정 행과 섞어 정렬할 수 있게 같은 칸 이름(start·allDay·title) */
export interface EventListItem { key: string; start: string; end: string; allDay: boolean; title: string; color: string; evt: EventRow }
export function eventListItems(rows: EventRow[], from: string, to: string, myColor?: string | null): EventListItem[] {
  return eventItems(rows, from, to, myColor).map((it) => ({ key: it.key, start: it.start, end: it.end, allDay: it.allDay, title: it.evt.title ?? '', color: eventColor(it.evt, myColor), evt: it.evt }))
}
