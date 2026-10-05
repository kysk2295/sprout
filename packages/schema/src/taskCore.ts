// 할 일 완료·완료 취소·XP의 "정상 경로" — 화면·Electron·React에 기대지 않는 순수 모듈.
// 데스크톱 렌더러(lib/taskActions.ts·data/growth.ts), 데스크톱 메인 프로세스(맥 위젯 체크 반영, 25 §8.5),
// 나중의 모바일 앱이 같이 쓴다. 규칙: 03 §8(반복 다음 회차·완료 기록), 02 §6(하위 할 일 함께 완료), 10 §6(할 일 XP +1, 하루 10).
//
// 함수들은 DB를 읽기만 하고, 실행할 SQL 문 목록을 돌려준다. 부르는 쪽이 한 트랜잭션으로 실행한다.
import { LOCAL_OWNER } from './index.ts'
import { addDays, datePart, daysBetween, nextOccurrence, parseRule, stringifyRule, withDate } from './time.ts'
import { canGrantTaskXp, reviewXpEvent, tidyXpEvent, XP, xpEventId, type XpEventRow } from './growth.ts'

export type Row = Record<string, unknown>
export type Stmt = { sql: string; params?: unknown[] }
/** 읽기만 하는 최소 DB 인터페이스(렌더러 getDb(), 메인 PowerSync 모두 맞춘다) */
export interface CoreDb {
  getAll<T = Row>(sql: string, params?: unknown[]): Promise<T[]>
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | null>
}
/** 시각·id·오늘(로컬 날짜 'YYYY-MM-DD')을 밖에서 받는다 — 시험에서 고정하려고 */
export interface CoreEnv {
  today: string
  now?: () => string
  uuid?: () => string
}
const nowOf = (env: CoreEnv) => (env.now ?? (() => new Date().toISOString()))()
const uuidOf = (env: CoreEnv) => (env.uuid ?? (() => crypto.randomUUID()))()
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')

// ── 문 만들기(렌더러 data/mutations.ts의 insert·update와 같은 모양) ──
export function insertStmt(table: string, row: Record<string, unknown>, at = new Date().toISOString()): Stmt {
  const full = { owner_id: LOCAL_OWNER, created_at: at, modified_at: at, ...row }
  const cols = Object.keys(full)
  return { sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${marks(cols.length)})`, params: Object.values(full) }
}
export function updateStmt(table: string, id: string, patch: Record<string, unknown>, at = new Date().toISOString()): Stmt {
  const full = { ...patch, modified_at: at }
  const cols = Object.keys(full)
  return { sql: `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, params: [...Object.values(full), id] }
}
export const deleteStmt = (table: string, id: string): Stmt => ({ sql: `DELETE FROM ${table} WHERE id = ?`, params: [id] })

/** ids와 그 하위 할 일 전부(02 §6) */
export async function descendantsOf(db: CoreDb, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const rows = await db.getAll<{ id: string }>(
    `WITH RECURSIVE d(id) AS (SELECT id FROM tasks WHERE id IN (${marks(ids.length)})
       UNION SELECT t.id FROM tasks t JOIN d ON t.parent_id = d.id)
     SELECT id FROM d`,
    ids
  )
  return rows.map((r) => r.id)
}

/** 날짜만 바꾼다: 시각·기간 길이는 유지(03 §5) — 렌더러 lib/dates.ts moveToDate와 같은 규칙 */
export function moveSpanToDate(s: { start_at?: string | null; due_at: string | null }, date: string): { start_at: string | null; due_at: string | null; is_all_day?: number } {
  if (!s.due_at) return { start_at: null, due_at: date, is_all_day: 1 }
  if (!s.start_at) return { start_at: null, due_at: withDate(s.due_at, date) }
  const days = daysBetween(datePart(s.start_at), date)
  return { start_at: addDays(s.start_at, days), due_at: addDays(s.due_at, days) }
}

export interface CompletePlan {
  stmts: Stmt[]
  /** 완료로 바뀌는 일반 할 일(하위 포함, 이미 완료된 것 제외) */
  open: string[]
  /** 다음 회차로 넘어가는 반복 할 일(마지막 회차 포함) */
  repeating: string[]
  /** 반복 할 일의 체크 항목(되돌리기용 원래 값) */
  checks: Row[]
  /** 새로 만든 완료 기록 할 일 id */
  created: string[]
}

/** 완료(03 §8): 일반 할 일은 하위와 함께 완료, 반복 할 일은 완료 기록을 남기고 다음 회차로(체크 항목 초기화) */
export async function planComplete(db: CoreDb, ids: string[], env: CoreEnv): Promise<CompletePlan> {
  const empty: CompletePlan = { stmts: [], open: [], repeating: [], checks: [], created: [] }
  if (!ids.length) return empty
  const at = nowOf(env)
  const rows = await db.getAll<Row>(`SELECT * FROM tasks WHERE id IN (${marks(ids.length)}) AND status = 0`, ids)
  const repeating = rows.filter((r) => r.repeat_rule && r.due_at)
  const plainTop = rows.filter((r) => !repeating.includes(r)).map((r) => r.id as string)
  const all = await descendantsOf(db, plainTop)
  const open = all.length ? (await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE status = 0 AND id IN (${marks(all.length)})`, all)).map((r) => r.id) : []
  const repIds = repeating.map((r) => r.id as string)
  const checks = repIds.length ? await db.getAll<Row>(`SELECT id, task_id, done, completed_at FROM check_items WHERE task_id IN (${marks(repIds.length)})`, repIds) : []
  const created: string[] = []
  const stmts: Stmt[] = open.map((id) => updateStmt('tasks', id, { status: 1, completed_at: at }, at))
  for (const t of repeating) {
    const rule = parseRule(t.repeat_rule as string)
    const start = (t.start_at ?? t.due_at) as string
    const mode = t.repeat_from === 'completion' ? 'completion' : 'due'
    const next = rule ? nextOccurrence(rule, mode === 'completion' ? env.today : datePart(start), mode) : null
    if (!rule || !next) {
      // 마지막 회차(또는 읽을 수 없는 규칙): 반복 없이 끝난다
      stmts.push(updateStmt('tasks', t.id as string, { status: 1, completed_at: at }, at))
      continue
    }
    // 이번 회차 → 완료 기록 태스크(03 §8: 제목·본문·우선순위·리스트·태그 복사, 알림·반복 없음)
    const rec = uuidOf(env)
    created.push(rec)
    stmts.push(insertStmt('tasks', {
      id: rec, list_id: t.list_id, parent_id: t.parent_id, title: t.title, content: t.content, content_mode: 'text', status: 1, priority: t.priority,
      start_at: t.start_at, due_at: t.due_at, is_all_day: t.is_all_day, time_zone: t.time_zone, repeat_origin_id: t.id, sort_order: t.sort_order, completed_at: at
    }, at))
    for (const tag of await db.getAll<{ tag_id: string }>('SELECT tag_id FROM task_tags WHERE task_id = ?', [t.id])) stmts.push(insertStmt('task_tags', { id: uuidOf(env), task_id: rec, tag_id: tag.tag_id }, at))
    // 원래 태스크 → 다음 회차(시각·기간 유지), 남은 횟수 1 줄임, 체크 항목 초기화
    const shift = daysBetween(datePart(start), next)
    const nextRule = rule.count ? stringifyRule({ ...rule, count: rule.count - 1 }) : t.repeat_rule
    stmts.push(updateStmt('tasks', t.id as string, {
      start_at: t.start_at ? addDays(t.start_at as string, shift) : null, due_at: addDays(t.due_at as string, shift), repeat_rule: nextRule
    }, at))
    checks.filter((c) => c.task_id === t.id && c.done).forEach((c) => stmts.push(updateStmt('check_items', c.id as string, { done: 0, completed_at: null }, at)))
  }
  return { stmts, open, repeating: repIds, checks, created }
}

/** 영구 삭제(하위·태그·알림·체크 항목 포함) */
export async function planDeleteHard(db: CoreDb, ids: string[]): Promise<Stmt[]> {
  const all = await descendantsOf(db, ids)
  const stmts: Stmt[] = []
  for (const id of all) {
    for (const table of ['task_tags', 'reminders', 'check_items']) {
      const rows = await db.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE task_id = ?`, [id])
      rows.forEach((r) => stmts.push(deleteStmt(table, r.id)))
    }
    stmts.push(deleteStmt('tasks', id))
  }
  return stmts
}

export interface ReopenPlan {
  stmts: Stmt[]
  /** 지워야 할 반복 완료 기록(부르는 쪽이 planDeleteHard로 지운다 — 렌더러는 XP 회수 뒤에 지운다) */
  records: string[]
  /** XP를 되돌릴 할 일 id(기록이면 원래 반복 할 일 id도 포함) */
  xpIds: string[]
}

/** 완료 취소(03 §8): 반복의 완료 기록이면 기록을 지우고 원래 태스크를 그 회차로 되돌린다 */
export async function planReopen(db: CoreDb, ids: string[], env: CoreEnv): Promise<ReopenPlan> {
  if (!ids.length) return { stmts: [], records: [], xpIds: [] }
  const at = nowOf(env)
  const rows = await db.getAll<Row>(`SELECT id, repeat_origin_id, start_at, due_at FROM tasks WHERE id IN (${marks(ids.length)})`, ids)
  const records = rows.filter((r) => r.repeat_origin_id)
  const plain = rows.filter((r) => !r.repeat_origin_id).map((r) => r.id as string)
  const stmts: Stmt[] = plain.map((id) => updateStmt('tasks', id, { status: 0, completed_at: null }, at))
  for (const rec of records) {
    const origin = await db.get<Row>('SELECT id, start_at, due_at, repeat_rule FROM tasks WHERE id = ?', [rec.repeat_origin_id])
    if (origin?.due_at && origin.repeat_rule) {
      const rule = parseRule(origin.repeat_rule as string)
      const back = moveSpanToDate(origin as { start_at: string | null; due_at: string }, datePart((rec.start_at ?? rec.due_at) as string))
      stmts.push(updateStmt('tasks', origin.id as string, { ...back, repeat_rule: rule?.count ? stringifyRule({ ...rule, count: rule.count + 1 }) : origin.repeat_rule }, at))
    }
  }
  return { stmts, records: records.map((r) => r.id as string), xpIds: [...ids, ...records.map((r) => r.repeat_origin_id as string)] }
}

/** 할 일 XP(10 §6): 완료한 할 일마다 +1, 하루 10까지, 같은 할 일은 하루 한 번. granted = 새로 준 XP 합 */
export async function planGrantTaskXp(db: CoreDb, taskIds: string[], env: CoreEnv): Promise<{ stmts: Stmt[]; granted: number }> {
  const day = env.today
  const at = nowOf(env)
  const today = await db.getAll<{ id: string; kind: string; amount: number }>('SELECT id, kind, amount FROM xp_events WHERE day = ?', [day])
  const stmts: Stmt[] = []
  for (const id of taskIds) {
    const eid = xpEventId.task(id, day)
    if (today.some((e) => e.id === eid)) continue
    if (!canGrantTaskXp(today)) break
    stmts.push(insertStmt('xp_events', { id: eid, kind: 'task', amount: XP.task, ref_id: id, day }, at))
    today.push({ id: eid, kind: 'task', amount: XP.task })
  }
  return { stmts, granted: stmts.length * XP.task }
}

/** 사건 XP 한 줄(이미 같은 id가 있으면 아무것도 안 한다 — 두 기기·다시 끝내기에도 한 번) */
async function planOnce(db: CoreDb, ev: XpEventRow, env: CoreEnv): Promise<{ stmts: Stmt[]; granted: number }> {
  if (await db.get('SELECT id FROM xp_events WHERE id = ?', [ev.id])) return { stmts: [], granted: 0 }
  return { stmts: [insertStmt('xp_events', ev, nowOf(env))], granted: ev.amount }
}
/** 주간 점검 완료 +30(10 §6) — 점검한 주(ISO 주)마다 한 번. week = 점검한 주의 아무 날. 모바일도 이것을 부른다(31 R.5) */
export const planReviewXp = (db: CoreDb, characterId: string, week: string, env: CoreEnv) => planOnce(db, reviewXpEvent(characterId, week, env.today), env)
/** 정리 완료 +20(10 §6) — 하루 한 번. "다 정리했어!"에 닿고 이번 정리에서 1개 이상 처리했을 때만 부른다(31 T.7) */
export const planTidyXp = (db: CoreDb, characterId: string, env: CoreEnv) => planOnce(db, tidyXpEvent(characterId, env.today), env)

/** 같은 날 완료를 취소하면 그날 받은 XP를 되돌린다(다음 날 취소는 되돌리지 않는다) */
export async function planRevokeTaskXp(db: CoreDb, taskIds: string[], env: CoreEnv): Promise<Stmt[]> {
  const day = env.today
  const at = nowOf(env)
  const stmts: Stmt[] = []
  const seen = new Set<string>()
  for (const id of taskIds) {
    const rid = xpEventId.taskRevoke(id, day)
    if (seen.has(rid)) continue
    const got = await db.get('SELECT 1 FROM xp_events WHERE id = ?', [xpEventId.task(id, day)])
    if (got && !(await db.get('SELECT 1 FROM xp_events WHERE id = ?', [rid]))) {
      seen.add(rid)
      stmts.push(insertStmt('xp_events', { id: rid, kind: 'task_revoke', amount: -XP.task, ref_id: id, day }, at))
    }
  }
  return stmts
}

/** 한 번에: 완료 + XP(위젯 체크 반영처럼 되돌리기 토스트가 없는 곳). XP는 실제로 완료된 할 일에만 준다 */
export async function planCompleteWithXp(db: CoreDb, ids: string[], env: CoreEnv): Promise<CompletePlan & { granted: number }> {
  const plan = await planComplete(db, ids, env)
  const done = ids.filter((id) => plan.open.includes(id) || plan.repeating.includes(id))
  const xp = await planGrantTaskXp(db, done, env)
  return { ...plan, stmts: [...plan.stmts, ...xp.stmts], granted: xp.granted }
}

/** 한 번에: 완료 취소 + 같은 날 XP 회수 + 반복 완료 기록 삭제 */
export async function planReopenWithXp(db: CoreDb, ids: string[], env: CoreEnv): Promise<Stmt[]> {
  const plan = await planReopen(db, ids, env)
  const revoke = await planRevokeTaskXp(db, plan.xpIds, env)
  const del = await planDeleteHard(db, plan.records)
  return [...plan.stmts, ...revoke, ...del]
}

/** 반복 할 일의 "오늘 이후 첫 회차"(오늘 포함). 반복이 끝났으면 null */
export function nextOccurrenceOnOrAfter(rule: string, from: string, today: string): string | null {
  const r = parseRule(rule)
  if (!r) return null
  let d = datePart(from)
  for (let i = 0; i < 2000 && d < today; i++) {
    const n = nextOccurrence(r, d, 'due')
    if (!n) return null
    d = n
  }
  return d
}

/**
 * XP 없는 완료(19 밀린 일 정리 §3.3): 정리 과정의 완료·"지난 일정 완료 처리"는 XP를 주지 않는다 — xp_events를 쓰지 않는 별도 경로.
 * 일반 할 일은 하위와 함께 완료(planComplete와 같음). 반복 할 일은 완료 기록 없이 오늘 이후 첫 회차로 넘기고,
 * 남은 회차가 없으면 완료한다. 부르는 쪽은 성장 반응(sprout:task-done)을 보내지 않는다.
 */
export async function planCompleteNoXp(db: CoreDb, ids: string[], env: CoreEnv): Promise<{ stmts: Stmt[]; open: string[]; repeating: string[] }> {
  if (!ids.length) return { stmts: [], open: [], repeating: [] }
  const at = nowOf(env)
  const rows = await db.getAll<Row>(`SELECT id, start_at, due_at, repeat_rule FROM tasks WHERE id IN (${marks(ids.length)}) AND status = 0`, ids)
  const repeating = rows.filter((r) => r.repeat_rule && r.due_at)
  const plainTop = rows.filter((r) => !repeating.includes(r)).map((r) => r.id as string)
  const all = await descendantsOf(db, plainTop)
  const open = all.length ? (await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE status = 0 AND id IN (${marks(all.length)})`, all)).map((r) => r.id) : []
  const stmts: Stmt[] = open.map((id) => updateStmt('tasks', id, { status: 1, completed_at: at }, at))
  for (const t of repeating) {
    const start = (t.start_at ?? t.due_at) as string
    // 이번 회차 다음부터, 오늘 이후 첫 회차로(지난 회차는 기록 없이 건너뜀)
    const rule = parseRule(t.repeat_rule as string)
    const after = rule ? nextOccurrence(rule, datePart(start), 'due') : null
    const next = after ? nextOccurrenceOnOrAfter(t.repeat_rule as string, after, env.today) : null
    if (!next) { stmts.push(updateStmt('tasks', t.id as string, { status: 1, completed_at: at }, at)); continue }
    stmts.push(updateStmt('tasks', t.id as string, { ...moveSpanToDate(t as { start_at: string | null; due_at: string }, next) }, at))
  }
  return { stmts, open, repeating: repeating.map((r) => r.id as string) }
}
