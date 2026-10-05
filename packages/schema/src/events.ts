// 06 §14.4 sprout 자체 일정 — 데스크톱·모바일이 같이 쓰는 순수 함수(DB·화면 없음).
// 표기는 태스크와 같은 floating: 종일 'YYYY-MM-DD'(끝 = 마지막 날, 포함), 시각 'YYYY-MM-DDTHH:mm'.
import { addDays, addMinutes, datePart, daysBetween, hasTime, minutesBetween, nextOccurrence, parseRule, reminderFireTime, timePart } from './time.ts'

export interface EventRecord {
  id: string
  title: string | null
  notes: string | null
  start_at: string
  end_at: string
  is_all_day: number | null
  repeat_rule: string | null
  location: string | null
  reminders: string | null
  color: string | null
  deleted_at?: string | null
}

/** "내 일정" 기본 색 — 06 §14.3 스타일 미리 보기의 "일정" 노랑 */
export const MY_CAL_COLOR = '#E9A23B'
/** 시각 일정에 길이가 없을 때 쓰는 길이(06 §14.4.2) */
export const DEFAULT_EVENT_MINUTES = 60

/** 날짜 선택기·캘린더 끌기 값(start_at 없음 = 한 시각/하루) → 일정의 시작·끝(늘 둘 다) */
export function eventSpan(start_at: string | null, due_at: string): { start_at: string; end_at: string; is_all_day: number } {
  const timed = hasTime(due_at)
  let start = start_at ?? due_at
  let end = due_at
  if (timed && !hasTime(start)) start = `${datePart(start)}T${timePart(end)}`
  if (!timed && hasTime(start)) start = datePart(start)
  if (end < start) end = start
  if (timed && start === end) end = addMinutes(start, DEFAULT_EVENT_MINUTES)
  return { start_at: start, end_at: end, is_all_day: timed ? 0 : 1 }
}

/** 일정 → 날짜 선택기·캘린더가 쓰는 태스크 모양(start 없음 = 하루짜리 종일) */
export function eventToSchedule(e: Pick<EventRecord, 'start_at' | 'end_at'>): { start_at: string | null; due_at: string } {
  return { start_at: e.start_at === e.end_at ? null : e.start_at, due_at: e.end_at }
}

export function parseReminders(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
export const stringifyReminders = (list: string[]) => (list.length ? JSON.stringify([...new Set(list)]) : null)

export interface Occurrence { start: string; end: string; date: string; virtual: boolean }
/**
 * 보이는 기간 [from, to](날짜)와 겹치는 회차들. 첫 회차 = 저장된 값(virtual false), 나머지는 계산(virtual true).
 * 일정은 완료가 없어서 반복 기준은 늘 날짜 기준이다.
 */
export function occurrences(e: Pick<EventRecord, 'start_at' | 'end_at' | 'repeat_rule'>, from: string, to: string, max = 400): Occurrence[] {
  const out: Occurrence[] = []
  const overlaps = (s: string, en: string) => datePart(s) <= to && datePart(en) >= from
  if (overlaps(e.start_at, e.end_at)) out.push({ start: e.start_at, end: e.end_at, date: datePart(e.start_at), virtual: false })
  const rule = parseRule(e.repeat_rule)
  if (!rule) return out
  const len = hasTime(e.start_at) ? minutesBetween(e.start_at, e.end_at) : 0
  const spanDays = daysBetween(e.start_at, e.end_at)
  let cur = datePart(e.start_at)
  let count = rule.count
  for (let i = 0; i < max; i++) {
    const next = nextOccurrence({ ...rule, count }, cur, 'due')
    if (!next || next > to) break
    if (count !== undefined) count -= 1
    cur = next
    const s = hasTime(e.start_at) ? `${next}T${timePart(e.start_at)}` : next
    const en = hasTime(e.start_at) ? addMinutes(s, len) : addDays(next, spanDays)
    if (overlaps(s, en)) out.push({ start: s, end: en, date: next, virtual: true })
  }
  return out
}

/** 오늘 이후(끝이 아직 안 지난) 첫 회차 — 알림 예약용. 없으면 null */
export function upcomingOccurrence(e: Pick<EventRecord, 'start_at' | 'end_at' | 'repeat_rule'>, today: string): Occurrence | null {
  if (datePart(e.end_at) >= today) return { start: e.start_at, end: e.end_at, date: datePart(e.start_at), virtual: false }
  return occurrences(e, today, addDays(today, 400), 2000).find((o) => o.date >= today || datePart(o.end) >= today) ?? null
}

/** 일정 알림 시각들(앞으로 올 회차 하나 기준). 태스크 알림과 같은 계산(03 §7) */
export function eventReminderTimes(e: Pick<EventRecord, 'start_at' | 'end_at' | 'repeat_rule' | 'reminders'>, today: string): { trigger: string; at: Date; occ: Occurrence }[] {
  const occ = upcomingOccurrence(e, today)
  if (!occ) return []
  return parseReminders(e.reminders).flatMap((trigger) => {
    const at = reminderFireTime({ start_at: occ.start === occ.end ? null : occ.start, due_at: occ.end }, trigger)
    return at ? [{ trigger, at, occ }] : []
  })
}

/** 할 일 → 일정(06 §14.4.6): 날짜 없으면 오늘 종일, 체크 항목은 "- " 줄로 설명에 붙인다 */
export function taskToEventFields(t: { title: string | null; content: string | null; start_at: string | null; due_at: string | null; repeat_rule: string | null }, checkItems: string[], today: string, reminders: string[]) {
  const span = eventSpan(t.start_at, t.due_at ?? today)
  const lines = [t.content?.trim() || '', ...checkItems.filter((c) => c.trim()).map((c) => `- ${c.trim()}`)].filter(Boolean)
  return {
    title: t.title?.trim() || '제목 없음',
    notes: lines.join('\n') || null,
    ...span,
    time_zone: 'floating',
    repeat_rule: t.repeat_rule,
    location: null,
    reminders: stringifyReminders(t.due_at ? reminders : []),
    color: null
  }
}

/** 일정 → 할 일(06 §14.4.6): 장소는 설명 첫 줄 "📍 장소" */
export function eventToTaskFields(e: EventRecord) {
  const s = eventToSchedule(e)
  const content = [e.location?.trim() ? `📍 ${e.location.trim()}` : '', e.notes?.trim() || ''].filter(Boolean).join('\n')
  return {
    title: e.title?.trim() || '제목 없음',
    content,
    content_mode: 'text',
    status: 0,
    priority: 0,
    start_at: s.start_at,
    due_at: s.due_at,
    is_all_day: hasTime(s.due_at) ? 0 : 1,
    time_zone: 'floating',
    repeat_rule: e.repeat_rule,
    repeat_from: e.repeat_rule ? 'due' : null,
    reminders: parseReminders(e.reminders)
  }
}

/** 검색(06 §14.4.3): 제목·설명·장소에 검색어(대소문자 무시) */
export function eventMatches(e: Pick<EventRecord, 'title' | 'notes' | 'location'>, q: string): boolean {
  const k = q.trim().toLowerCase()
  if (!k) return false
  return [e.title, e.notes, e.location].some((v) => !!v && v.toLowerCase().includes(k))
}
