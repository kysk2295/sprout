// sprout 자체 일정의 휴대폰판(20 §7.1, 06 §14.4) — 순수 계산(DB·화면 없음, 시험: eventsModel.test.ts).
// 회차·기간 계산은 공용 @sprout/schema/events. 여기서는 캘린더 항목(가짜 할 일 행)·목록 묶음·행 글자만 만든다.
import { MY_CAL_COLOR, occurrences, type EventRecord, type Occurrence } from '@sprout/schema/events'
import { addDays, dateKey, datePart, formatTimeKo, hasTime, timePart, toDate, WEEKDAY_KO } from '@sprout/schema/time'
import type { CalItem } from './calendar.ts'
import type { Group, TaskRow } from './views.ts'

export interface EventRow extends EventRecord {
  time_zone?: string | null
  created_at?: string | null
  modified_at?: string | null
  // 16 §12.0 · 38 §6 연결된 일정(SELECT * 라 함께 온다)
  ext_provider?: string | null
  ext_account?: string | null
  ext_calendar?: string | null
  ext_id?: string | null
  ext_error?: string | null
}
/** 캘린더 항목 id 앞붙이 — 할 일 id와 섞여도 구분(데스크톱과 같음) */
export const EV_PREFIX = 'ev:'
export const isEventId = (id: string) => id.startsWith(EV_PREFIX)
export const eventIdOf = (id: string) => (isEventId(id) ? id.slice(EV_PREFIX.length) : id)
export const eventColor = (e: Pick<EventRecord, 'color'>, myColor?: string | null) => e.color || myColor || MY_CAL_COLOR

/** "내 일정" 색: view_settings('calendar').options_json.myColor */
export function myColorOf(optionsJson: string | null | undefined): string | null {
  if (!optionsJson) return null
  try {
    const v = (JSON.parse(optionsJson) as { myColor?: unknown }).myColor
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

export type EventCalItem = CalItem<TaskRow> & { evt: EventRow; occ: Occurrence; color: string }
export const evtOf = (it: CalItem<TaskRow>): EventRow | undefined => (it as Partial<EventCalItem>).evt

function fakeTask(e: EventRow, o: Occurrence, color: string, calName: string): TaskRow {
  return {
    id: `${EV_PREFIX}${e.id}`, list_id: null, parent_id: null, section_id: null, title: e.title ?? '', content: e.notes, content_mode: null, status: 0, priority: 0,
    start_at: o.start === o.end ? null : o.start, due_at: o.end, is_all_day: e.is_all_day, sort_order: null, repeat_rule: e.repeat_rule, pinned_at: null,
    created_at: e.created_at ?? null, completed_at: null, deleted_at: null, list_name: calName, list_emoji: null, list_color: color, list_kind: 'event',
    check_total: 0, check_done: 0, reminder_count: 0, tag_ids: null
  }
}

/** 보이는 기간의 회차마다 캘린더 항목(06 §14.4.3 — 반복은 늘 계산해서 그린다). nameOf = 연결된 일정의 캘린더 이름(38 §2.2) */
export function eventItems(rows: EventRow[], from: string, to: string, myColor?: string | null, nameOf?: (e: EventRow) => string | null): EventCalItem[] {
  const out: EventCalItem[] = []
  for (const e of rows) {
    const color = eventColor(e, myColor)
    const calName = nameOf?.(e) ?? '내 일정'
    for (const o of occurrences(e, from, to)) {
      out.push({ key: `${EV_PREFIX}${e.id}${o.virtual ? `@${o.date}` : ''}`, task: fakeTask(e, o, color, calName), start: o.start, end: o.end, allDay: !hasTime(o.start), virtual: o.virtual, evt: e, occ: o, color })
    }
  }
  return out
}

/** 지난 일정인가(끝이 지금보다 앞) — 옅게 그리고, "완료 숨기기"면 숨긴다 */
export function isPast(end: string, now: Date): boolean {
  if (!end.includes('T')) return end < dateKey(now)
  return toDate(end).getTime() <= now.getTime()
}

// ── 목록(오늘·내일·다음 7일 — 06 §14.3.1) ──
/** 일정이 함께 보이는 스마트 목록과 그 기간 */
export function eventListRange(view: string, today: string): { from: string; to: string } | null {
  if (view === 'smart:today') return { from: today, to: today }
  if (view === 'smart:tomorrow') { const d = addDays(today, 1); return { from: d, to: d } }
  if (view === 'smart:next7') return { from: today, to: addDays(today, 6) }
  return null
}
/** 날짜 묶음 id(할 일 날짜 묶음과 같은 이름). 이미 시작한 일정은 오늘 */
export function eventTimeGroup(start: string, today: string): 'today' | 'tomorrow' | 'next7' | 'later' {
  const d = datePart(start)
  if (d <= today) return 'today'
  if (d === addDays(today, 1)) return 'tomorrow'
  return d <= addDays(today, 6) ? 'next7' : 'later'
}
/** 묶음 안 순서: 날짜 → 종일 먼저 → 시작 시각 → 제목 */
export function sortEvents<T extends { start: string; allDay: boolean; task: { title: string } }>(list: T[]): T[] {
  const k = (e: T) => `${datePart(e.start)}${e.allDay ? ' ' : e.start.slice(10)}`
  return [...list].sort((a, b) => k(a).localeCompare(k(b)) || a.task.title.localeCompare(b.task.title, 'ko'))
}
/** 묶음 id → 그 묶음에 놓일 일정(날짜 묶기가 아니면 모두 'events') */
export function eventsByGroup<T extends { start: string; allDay: boolean; task: { title: string } }>(list: T[], today: string, byTime: boolean): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const e of sortEvents(list)) {
    const id = byTime ? eventTimeGroup(e.start, today) : 'events'
    m.set(id, [...(m.get(id) ?? []), e])
  }
  return m
}
const TIME_ORDER = ['pinned', 'overdue', 'today', 'tomorrow', 'next7', 'later', 'nodate']
const TIME_TITLE: Record<string, string> = { today: '오늘', tomorrow: '내일', next7: '다음 7일', later: '나중' }
/**
 * 할 일 묶음에 일정 묶음을 합친다: 날짜 묶음이 있으면 개수에 더하고, 할 일이 없는 날짜면 묶음을 새로 만든다(06 §14.3.1).
 * 날짜 묶기가 아니면 '완료' 앞에 "일정" 묶음 하나.
 */
export function mergeEventGroups(groups: Group[], byGroup: Map<string, unknown[]>, byTime: boolean): Group[] {
  if (!byGroup.size) return groups
  const out = groups.map((g) => (byGroup.has(g.id) ? { ...g, count: g.count + byGroup.get(g.id)!.length } : g))
  const doneAt = out.findIndex((g) => g.done)
  const insertAt = (g: Group) => {
    if (!byTime) { out.splice(doneAt < 0 ? out.length : out.findIndex((x) => x.done), 0, g); return }
    const rank = TIME_ORDER.indexOf(g.id)
    const i = out.findIndex((x) => x.done || TIME_ORDER.indexOf(x.id) > rank)
    out.splice(i < 0 ? out.length : i, 0, g)
  }
  for (const [id, list] of byGroup) {
    if (out.some((g) => g.id === id)) continue
    insertAt({ id, title: byTime ? TIME_TITLE[id] ?? id : '일정', rows: [], count: list.length })
  }
  return out
}

// ── 행 글자 ──
/** 목록 행 오른쪽 시각: "종일" / "오후 3:00-4:00" / 여러 날 "10월 12일-14일" */
export function eventTimeLabel(start: string, end: string): string {
  const days = datePart(start) !== datePart(end)
  if (days) {
    const s = toDate(datePart(start))
    const e = toDate(datePart(end))
    return s.getMonth() === e.getMonth() ? `${s.getMonth() + 1}월 ${s.getDate()}일-${e.getDate()}일` : `${s.getMonth() + 1}월 ${s.getDate()}일-${e.getMonth() + 1}월 ${e.getDate()}일`
  }
  if (!hasTime(start)) return '종일'
  const a = formatTimeKo(timePart(start)!)
  if (!hasTime(end) || start === end) return a
  const b = formatTimeKo(timePart(end)!)
  return a.slice(0, 2) === b.slice(0, 2) ? `${a}-${b.slice(3)}` : `${a}-${b}`
}
/** 일정 시트 날짜 줄: "10월 12일 (월) 오후 2:00-3:00" / "10월 12일 (월) · 종일" / "10월 12일 (월) - 10월 14일 (수)" */
export function eventSheetLabel(start: string, end: string): string {
  const d = (x: string) => { const t = toDate(datePart(x)); return `${t.getMonth() + 1}월 ${t.getDate()}일 (${WEEKDAY_KO[t.getDay()]})` }
  if (datePart(start) !== datePart(end)) {
    if (!hasTime(start)) return `${d(start)} - ${d(end)}`
    return `${d(start)} ${formatTimeKo(timePart(start)!)} - ${d(end)} ${formatTimeKo(timePart(end)!)}`
  }
  if (!hasTime(start)) return `${d(start)} · 종일`
  return `${d(start)} ${eventTimeLabel(start, end)}`
}

// ── 빠른 입력 `할 일 · 일정`(22 §3.5) ──
/** 빠른 입력 값 → 일정 날짜·알림: 날짜가 없으면 오늘 종일, 보기 기본값이 시각이면(캘린더 빈 시간) 알림 "정각에" */
export function quickEventFields(input: { start_at: string | null; due_at: string | null; repeat_rule: string | null; reminders: string[] }, manual: boolean, today: string) {
  const due = input.due_at ?? today
  const reminders = !manual && hasTime(due) && !input.reminders.length ? ['-PT0M'] : input.due_at ? input.reminders : []
  return { start_at: input.due_at ? input.start_at : null, due_at: due, repeat_rule: input.repeat_rule, reminders }
}
/** 보낸 뒤 토스트: 오늘이면 "일정을 추가했어요", 아니면 "내일에 …" / "10월 12일에 일정을 추가했어요" */
export function eventAddedToast(start: string, today: string): string {
  const d = datePart(start)
  if (d === today) return '일정을 추가했어요'
  const n = Math.round((toDate(d).getTime() - toDate(today).getTime()) / 86400000)
  const t = toDate(d)
  return `${n === 1 ? '내일' : n === 2 ? '모레' : `${t.getMonth() + 1}월 ${t.getDate()}일`}에 일정을 추가했어요`
}
