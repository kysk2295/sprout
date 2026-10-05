// sprout 자체 일정 읽기·쓰기(20 §7.1, 06 §14.4 — 데스크톱 data/events.ts와 같은 쓰기). 쓰기는 되돌리기 함수를 돌려준다(토스트 ⟲).
import { useQuery } from '@powersync/react-native'
import { eventSpan, eventToSchedule, eventToTaskFields, parseReminders, stringifyReminders, taskToEventFields } from '@sprout/schema/events'
import { deleteStmt, type Stmt } from '@sprout/schema/taskCore'
import { db, run } from './db'
import { eventIdOf, myColorOf, type EventRow } from './eventsModel'
import { defaultListId, insert, update, type Undo } from './tasks'

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const FIELDS = ['title', 'notes', 'start_at', 'end_at', 'is_all_day', 'time_zone', 'repeat_rule', 'location', 'reminders', 'color', 'deleted_at'] as const
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')

/** 기간 [from, to]와 겹치는 일정 + 그 전에 시작한 반복 일정(회차는 화면에서 계산) */
const IN_RANGE = `SELECT * FROM events WHERE deleted_at IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL
  AND ((substr(start_at, 1, 10) <= ? AND substr(end_at, 1, 10) >= ?) OR (repeat_rule IS NOT NULL AND substr(start_at, 1, 10) <= ?))
  ORDER BY start_at`
export function useEvents(from: string, to: string, enabled = true): EventRow[] {
  return useQuery<EventRow>(enabled ? IN_RANGE : 'SELECT * FROM events WHERE 0', enabled ? [to, from, to] : []).data
}
export function useEvent(id: string | undefined): EventRow | undefined {
  return useQuery<EventRow>('SELECT * FROM events WHERE id = ?', [id ?? '']).data[0]
}
/** "내 일정" 색(동기화 — 데스크톱 왼쪽 패널에서 고름) */
export function useMyCalColor(): string | null {
  const row = useQuery<{ options_json: string | null }>("SELECT options_json FROM view_settings WHERE view_key = 'calendar' LIMIT 1").data[0]
  return myColorOf(row?.options_json)
}

async function snapshot(ids: string[]): Promise<Undo> {
  if (!ids.length) return async () => {}
  const rows = await db.getAll<Record<string, unknown>>(`SELECT id, ${FIELDS.join(', ')} FROM events WHERE id IN (${marks(ids.length)})`, ids)
  return () => run(rows.map(({ id, ...rest }) => update('events', id as string, rest)))
}

export interface NewEvent { title: string; start_at: string | null; due_at: string; repeat_rule?: string | null; reminders?: string[]; notes?: string; location?: string }
/** 빠른 입력(22 §3.5): 한 트랜잭션, 시각 하나 = 1시간 */
export async function createEvent(input: NewEvent): Promise<string> {
  if (!input.title.trim()) throw new Error('제목을 입력해 주세요.')
  const id = uuid()
  await run([insert('events', {
    id, title: input.title.trim(), notes: input.notes?.trim() || null, location: input.location?.trim() || null, ...eventSpan(input.start_at, input.due_at),
    time_zone: 'floating', repeat_rule: input.repeat_rule ?? null, reminders: stringifyReminders(input.reminders ?? []), color: null, deleted_at: null
  })])
  return id
}

export async function updateEvent(id: string, patch: Record<string, unknown>): Promise<Undo> {
  const undo = await snapshot([id])
  await run([update('events', id, patch)])
  return undo
}

/** 날짜 시트에 넣을 지금 값(할 일 Schedule 모양 — 하루짜리 = start 없음) */
export async function getEventSchedule(id: string) {
  const e = await db.getOptional<EventRow>('SELECT * FROM events WHERE id = ?', [eventIdOf(id)])
  if (!e) return null
  const s = eventToSchedule(e)
  return { ...s, is_all_day: e.is_all_day ?? 1, repeat_rule: e.repeat_rule, repeat_from: null, reminders: parseReminders(e.reminders) }
}

/** 날짜 시트 값 → 일정(날짜를 지우는 것은 무시 — 일정은 날짜가 꼭 있다) */
export async function applyEventSchedule(id: string, s: { start_at: string | null; due_at: string | null; repeat_rule: string | null; reminders: string[] }): Promise<Undo> {
  if (!s.due_at) return async () => {}
  return updateEvent(id, { ...eventSpan(s.start_at, s.due_at), repeat_rule: s.repeat_rule, reminders: stringifyReminders(s.reminders) })
}

/** 캘린더 끌기(20 §7.1): 할 일과 같은 모양(start_at·due_at) → 일정 시작·끝 */
export async function rescheduleEvent(id: string, v: { start_at: string | null; due_at: string }): Promise<Undo> {
  return updateEvent(eventIdOf(id), eventSpan(v.start_at, v.due_at))
}

/** 메뉴 "복제": 같은 일정 하나 더. 되돌리면 지운다 */
export async function duplicateEvent(id: string): Promise<Undo> {
  const e = await db.getOptional<Record<string, unknown>>('SELECT * FROM events WHERE id = ?', [eventIdOf(id)])
  if (!e) return async () => {}
  const copy = uuid()
  const { id: _i, owner_id: _o, created_at: _c, modified_at: _m, ...rest } = e
  await run([insert('events', { ...rest, id: copy })])
  return () => run([deleteStmt('events', copy)])
}

/** 삭제 = deleted_at(되돌리기로 살린다 — 06 §14.4.5) */
export async function deleteEvent(id: string): Promise<Undo> {
  const eid = eventIdOf(id)
  const undo = await snapshot([eid])
  await run([update('events', eid, { deleted_at: now() })])
  return undo
}

/** 할 일 → 일정(06 §14.4.6). 하위 할 일이 있으면 'has-children' */
export async function convertTaskToEvent(taskId: string, today: string): Promise<{ id: string; undo: Undo } | 'has-children' | null> {
  const t = await db.getOptional<{ title: string | null; content: string | null; content_mode: string | null; start_at: string | null; due_at: string | null; repeat_rule: string | null; deleted_at: string | null }>(
    'SELECT title, content, content_mode, start_at, due_at, repeat_rule, deleted_at FROM tasks WHERE id = ?', [taskId])
  if (!t) return null
  const kids = await db.getOptional<{ n: number }>('SELECT count(*) AS n FROM tasks WHERE parent_id = ? AND deleted_at IS NULL', [taskId])
  if (kids?.n) return 'has-children'
  const checks = t.content_mode === 'checklist' ? (await db.getAll<{ title: string }>('SELECT title FROM check_items WHERE task_id = ? ORDER BY sort_order', [taskId])).map((c) => c.title) : []
  const reminders = (await db.getAll<{ trigger: string }>('SELECT trigger FROM reminders WHERE task_id = ?', [taskId])).map((r) => r.trigger)
  const id = uuid()
  await run([
    insert('events', { id, ...taskToEventFields({ ...t, content: t.content_mode === 'checklist' ? null : t.content }, checks, today, reminders), deleted_at: null }),
    update('tasks', taskId, { deleted_at: now() })
  ])
  return { id, undo: () => run([deleteStmt('events', id), update('tasks', taskId, { deleted_at: t.deleted_at })]) }
}

/** 일정 → 할 일(기본함). 반복 일정은 반복 규칙째로 */
export async function convertEventToTask(eventId: string): Promise<{ id: string; undo: Undo } | null> {
  const e = await db.getOptional<EventRow>('SELECT * FROM events WHERE id = ?', [eventIdOf(eventId)])
  if (!e) return null
  const listId = await defaultListId()
  const { reminders, ...fields } = eventToTaskFields(e)
  const id = uuid()
  const stmts: Stmt[] = [
    insert('tasks', { id, list_id: listId, ...fields, sort_order: -Date.now() }),
    ...reminders.map((trigger) => insert('reminders', { id: uuid(), task_id: id, trigger })),
    update('events', e.id, { deleted_at: now() })
  ]
  await run(stmts)
  return {
    id,
    undo: async () => {
      const rems = await db.getAll<{ id: string }>('SELECT id FROM reminders WHERE task_id = ?', [id])
      await run([...rems.map((r) => deleteStmt('reminders', r.id)), deleteStmt('tasks', id), update('events', e.id, { deleted_at: null })])
    }
  }
}
