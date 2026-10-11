// 06 §14.4 sprout 자체 일정 — 읽기·쓰기. 쓰기는 모두 되돌리기 함수(restore)를 돌려준다(토스트·⌘Z는 부르는 쪽이 붙인다).
import { eventSpan, eventToTaskFields, taskToEventFields, type EventRecord } from '@sprout/schema/events'
import { getDb, type Row, type Stmt } from './db'
import { insert, now, remove, run, update, uuid } from './mutations'
import { useQuery } from './useQuery'

export interface EventRow extends EventRecord {
  time_zone: string | null
  created_at: string | null
  modified_at: string | null
  // 16 §12.0 연결된 일정(구글·Apple에도 저장) — 데스크톱 메인의 다리가 맞춘다
  ext_provider?: 'google' | 'apple' | 'device-ios' | 'device-android' | null
  ext_account?: string | null
  ext_calendar?: string | null
  ext_id?: string | null
  ext_error?: string | null
}
/** 연결 대상 캘린더(빠른 만들기 고르기) */
export interface EventLink { provider: 'google' | 'apple'; account: string; calendar: string; color: string }
export type Restore = () => Promise<void>

/** 캘린더 항목·선택 id에서 일정을 가리키는 앞붙이(태스크 id와 섞여도 구분) */
export const EV_PREFIX = 'ev:'
export const isEventKey = (id: string) => id.startsWith(EV_PREFIX)
export const eventIdOf = (id: string) => (isEventKey(id) ? id.slice(EV_PREFIX.length) : id)

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
const FIELDS = ['title', 'notes', 'start_at', 'end_at', 'is_all_day', 'time_zone', 'repeat_rule', 'location', 'reminders', 'color', 'deleted_at'] as const

/** 기간 [from, to]와 겹치는 일정 + 그 전에 시작한 반복 일정(회차는 화면에서 계산) */
export const EVENTS_IN_RANGE = `SELECT * FROM events WHERE deleted_at IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL
  AND ((substr(start_at, 1, 10) <= ? AND substr(end_at, 1, 10) >= ?) OR (repeat_rule IS NOT NULL AND substr(start_at, 1, 10) <= ?))
  ORDER BY start_at`
export function useEvents(from: string, to: string, enabled = true): EventRow[] {
  return useQuery<EventRow>(enabled ? EVENTS_IN_RANGE : 'SELECT * FROM events WHERE 0', enabled ? [to, from, to] : []) ?? EMPTY
}
const EMPTY: EventRow[] = []
// ⌘F 검색 등 캘린더 밖에서 일정 열기: 캘린더 보기가 (지금 또는 열릴 때) 받아서 그 날짜로 가 팝오버를 연다
export const OPEN_EVENT = 'sprout:open-event'
let pendingOpen: { id: string; date: string } | undefined
export function requestOpenEvent(id: string, date: string) {
  pendingOpen = { id, date: date.slice(0, 10) }
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}
/** 알림('ev:<id>')에서 열기: 시작 날짜를 읽어 캘린더로 넘긴다 */
export async function openEventById(id: string) {
  const e = await (await getDb()).get<{ start_at: string }>('SELECT start_at FROM events WHERE id = ?', [eventIdOf(id)])
  if (e) requestOpenEvent(eventIdOf(id), e.start_at)
}
export function takeOpenEvent() { const p = pendingOpen; pendingOpen = undefined; return p }
// 25 §15 월 캘린더 위젯 날짜 칸(sprout://calendar/<날짜>): 캘린더 보기가 (지금 또는 열릴 때) 그 날로 간다(보기 종류는 그대로)
export const OPEN_DATE = 'sprout:calendar-date'
let pendingDate: string | undefined
export function requestCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00`).getTime())) return
  pendingDate = date
  window.dispatchEvent(new CustomEvent(OPEN_DATE))
}
export function takeCalendarDate() { const d = pendingDate; pendingDate = undefined; return d }

/** "내 일정" 색(캘린더 보기 설정 options_json.myColor, 동기화) */
export function useMyCalColor(): string | null {
  const row = useQuery<{ options_json: string | null }>("SELECT options_json FROM view_settings WHERE view_key = 'calendar'")?.[0]
  try { return (row?.options_json ? (JSON.parse(row.options_json) as { myColor?: string | null }).myColor : null) ?? null } catch { return null }
}
export const useEvent = (id: string | undefined) => useQuery<EventRow>('SELECT * FROM events WHERE id = ?', [id ?? ''])?.[0]

async function readEvents(ids: string[]): Promise<Map<string, Row>> {
  const rows = await (await getDb()).getAll<Row>(`SELECT id, ${FIELDS.join(', ')} FROM events WHERE id IN (${marks(ids.length)})`, ids)
  return new Map(rows.map((r) => [r.id as string, r]))
}
/**
 * 고치고 되돌리기 함수를 돌려준다. 되돌리기는 이 작업이 바꾼 칸만, 그 뒤 다른 곳(다른 기기 등)에서 다시 바뀌지 않았을 때만
 * 원래 값으로 — 전체 칸을 덮으면 제목 되돌리기가 다른 기기에서 고친 설명까지 지운다(2026-10-11 Codex 리뷰 #P1)
 */
async function changeEvents(ids: string[], stmts: Stmt[]): Promise<Restore> {
  if (!ids.length) { await run(...stmts); return async () => {} }
  const before = await readEvents(ids)
  await run(...stmts)
  const after = await readEvents(ids)
  return async () => {
    const cur = await readEvents(ids)
    const back: Stmt[] = []
    for (const [id, b] of before) {
      const a = after.get(id), c = cur.get(id)
      if (!a || !c) continue
      const patch = Object.fromEntries(FIELDS.filter((f) => b[f] !== a[f] && c[f] === a[f]).map((f) => [f, b[f]]))
      if (Object.keys(patch).length) back.push(update('events', id, patch))
    }
    if (back.length) await run(...back)
  }
}

export interface NewEvent { title: string; start_at: string | null; due_at: string; repeat_rule?: string | null; reminders?: string[]; notes?: string; location?: string; link?: EventLink | null }
/** 한 트랜잭션으로 만든다(06 §7.1 규칙). 시각 하나 = 1시간 */
export async function createEvent(input: NewEvent): Promise<string> {
  if (!input.title.trim()) throw new Error('제목을 입력해 주세요.')
  const id = uuid()
  await run(insert('events', {
    id, title: input.title.trim(), notes: input.notes?.trim() || null, location: input.location?.trim() || null, ...eventSpan(input.start_at, input.due_at),
    time_zone: 'floating', repeat_rule: input.repeat_rule ?? null, reminders: input.reminders?.length ? JSON.stringify(input.reminders) : null, color: input.link?.color ?? null, deleted_at: null,
    ...(input.link ? { ext_provider: input.link.provider, ext_account: input.link.account, ext_calendar: input.link.calendar } : {})
  }))
  return id
}

export async function updateEvent(id: string, patch: Partial<Omit<EventRow, 'id'>>): Promise<Restore> {
  return changeEvents([id], [update('events', id, patch)])
}

/** 날짜 선택기 값(태스크 Schedule 모양) → 일정 */
export async function applyEventSchedule(id: string, s: { start_at: string | null; due_at: string | null; repeat_rule: string | null; reminders: string[] }): Promise<Restore> {
  if (!s.due_at) return async () => {} // 일정은 날짜가 꼭 있다
  return updateEvent(id, { ...eventSpan(s.start_at, s.due_at), repeat_rule: s.repeat_rule, reminders: s.reminders.length ? JSON.stringify([...new Set(s.reminders)]) : null })
}

/** 캘린더 끌기·길이(06 §7.2): changes는 태스크와 같은 모양(id는 일정 id 또는 'ev:' 붙은 것) */
export async function rescheduleEvents(changes: { id: string; start_at: string | null; due_at: string | null }[]): Promise<Restore> {
  const list = changes.filter((c) => c.due_at).map((c) => ({ ...c, id: eventIdOf(c.id) }))
  return changeEvents(list.map((c) => c.id), list.map((c) => update('events', c.id, eventSpan(c.start_at, c.due_at!))))
}

/** ⌥ 끌기 복제·메뉴 "복제": 새 일정을 만들고, 되돌리면 지운다 */
export async function duplicateEvents(changes: { id: string; start_at: string | null; due_at: string | null }[]): Promise<Restore> {
  const db = await getDb()
  const stmts: Stmt[] = []
  const copies: string[] = []
  for (const c of changes) {
    const e = await db.get<Row>('SELECT * FROM events WHERE id = ?', [eventIdOf(c.id)])
    if (!e) continue
    const copy = uuid()
    copies.push(copy)
    // 연결된 일정의 복제는 같은 캘린더에 새 일정(외부 id·지문은 비운다 — 다리가 새로 올린다)
    const { id: _i, created_at: _c, modified_at: _m, ext_id: _x, ext_etag: _t, ext_updated: _u, ext_hash: _h, ext_error: _r, ...rest } = e
    stmts.push(insert('events', { ...rest, id: copy, ...(c.due_at ? eventSpan(c.start_at, c.due_at) : {}) }))
  }
  await run(...stmts)
  // 연결된 일정의 복제는 다리가 이미 외부에 올렸을 수 있다 → 행을 없애면 외부 사본을 지울 연결 정보도 사라진다.
  // deleted_at으로 지워 다리가 외부에서도 지우게 한다(아직 안 올렸으면 다리는 기록만 한다). 연결 없는 일정만 바로 없앤다(2026-10-11 Codex 리뷰 #P2)
  return async () => {
    if (!copies.length) return
    const linked = new Set((await db.getAll<{ id: string }>(`SELECT id FROM events WHERE ext_provider IS NOT NULL AND id IN (${marks(copies.length)})`, copies)).map((r) => r.id))
    await run(...copies.map((id) => (linked.has(id) ? update('events', id, { deleted_at: now() }) : remove('events', id))))
  }
}

/** 삭제 = deleted_at(되돌리기로 살린다) — 06 §14.4.5 */
export async function deleteEvents(ids: string[]): Promise<Restore> {
  const list = ids.map(eventIdOf)
  return changeEvents(list, list.map((id) => update('events', id, { deleted_at: now() })))
}

/** 할 일 → 일정(06 §14.4.6). 하위 할 일이 있으면 'has-children' */
export async function convertTaskToEvent(taskId: string, today: string): Promise<{ id: string; restore: Restore } | 'has-children' | null> {
  const db = await getDb()
  const t = await db.get<{ title: string | null; content: string | null; content_mode: string | null; start_at: string | null; due_at: string | null; repeat_rule: string | null; deleted_at: string | null }>(
    'SELECT title, content, content_mode, start_at, due_at, repeat_rule, deleted_at FROM tasks WHERE id = ?', [taskId])
  if (!t) return null
  const kids = await db.get<{ n: number }>('SELECT count(*) AS n FROM tasks WHERE parent_id = ? AND deleted_at IS NULL', [taskId])
  if (kids?.n) return 'has-children'
  const checks = t.content_mode === 'checklist' ? (await db.getAll<{ title: string }>('SELECT title FROM check_items WHERE task_id = ? ORDER BY sort_order', [taskId])).map((c) => c.title) : []
  const reminders = (await db.getAll<{ trigger: string }>('SELECT trigger FROM reminders WHERE task_id = ?', [taskId])).map((r) => r.trigger)
  const id = uuid()
  await run(
    insert('events', { id, ...taskToEventFields({ ...t, content: t.content_mode === 'checklist' ? null : t.content }, checks, today, reminders), deleted_at: null }),
    update('tasks', taskId, { deleted_at: now() })
  )
  return { id, restore: () => run(remove('events', id), update('tasks', taskId, { deleted_at: t.deleted_at })) }
}

/** 일정 → 할 일(기본함). 반복 일정은 반복 규칙째로 옮긴다 */
export async function convertEventToTask(eventId: string, listId: string): Promise<{ id: string; restore: Restore } | null> {
  const db = await getDb()
  const e = await db.get<EventRow>('SELECT * FROM events WHERE id = ?', [eventIdOf(eventId)])
  if (!e) return null
  const { reminders, ...fields } = eventToTaskFields(e)
  const id = uuid()
  await run(
    insert('tasks', { id, list_id: listId, ...fields, sort_order: -Date.now() }),
    ...reminders.map((trigger) => insert('reminders', { id: uuid(), task_id: id, trigger })),
    update('events', e.id, { deleted_at: now() })
  )
  return {
    id,
    restore: async () => {
      const rems = await db.getAll<{ id: string }>('SELECT id FROM reminders WHERE task_id = ?', [id])
      await run(...rems.map((r) => remove('reminders', r.id)), remove('tasks', id), update('events', e.id, { deleted_at: null }))
    }
  }
}

/** ⌘F 검색(06 §14.4.3): 제목·설명·장소 */
export async function searchEvents(q: string, limit = 20): Promise<EventRow[]> {
  const k = q.trim()
  if (!k) return []
  const like = `%${k.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  return (await getDb()).getAll<EventRow>(
    `SELECT * FROM events WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\') ORDER BY start_at DESC LIMIT ?`,
    [like, like, like, limit]
  )
}
