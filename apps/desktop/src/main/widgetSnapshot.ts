// 25 맥 위젯 §8.3 — 위젯에 넘기는 저장 파일(snapshot.json v1)을 만드는 순수 함수와 대기열 파일 검사.
// Electron에 기대지 않아 시험(tests/widget.test.ts)이 sql.js로 그대로 돌린다. 쓰기·감시는 main/widget.ts.
// 15 월 캘린더 위젯의 `calendar`(이번 달 격자)도 여기서 만든다(앱 06 캘린더와 같은 보기 설정·쿼리).
// Swift 쪽 Codable: native/widget/SproutWidget/Snapshot.swift — 두 쪽이 같은 예시 native/widget/fixtures/snapshot.v1.json을 읽는다.
import { normalizeSpecies, progressFromEvents, SPECIES, STAGES, type Species } from '@sprout/schema/growth'
import type { CoreDb } from '@sprout/schema/taskCore'
import { defaultSettings, openTasksSql } from '../renderer/src/data/views'
import { rowDateLabel, timeGroup } from '../renderer/src/lib/dates'
import { findTheme, parseTheme } from '../renderer/src/data/theme'
import type { TaskRow } from '../renderer/src/data/types'
import { displayTitle } from '@sprout/schema/wikiLink'
import { MY_CAL_COLOR, occurrences } from '@sprout/schema/events'
import { holidayMap } from '@sprout/schema/holidays'
import { toWeekStart, type WeekStart } from '@sprout/schema/weekStart'
import { addDays, datePart, daysBetween, hasTime } from '@sprout/schema/time'
import { widgetArtPath, widgetLookKey } from '@sprout/schema/widget'
import { colorOf, DEFAULT_OPTIONS, itemsOf, rangeOf, type CalOptions } from '../renderer/src/lib/calendar'
import { TASK_COLUMNS } from '../renderer/src/data/taskQueries'
import type { ExtEvent } from '../shared/calendars'

export const SNAPSHOT_SCHEMA = 1
/** 위젯에 넘기는 할 일 최대 수(크게 13행 + 여유, §8.3) */
export const MAX_TASKS = 20
/** 반영한 대기열 id를 기억하는 수(§8.3 appliedActions) */
export const MAX_APPLIED = 50
/** 월 캘린더 위젯: 하루에 넣는 막대 최대 수(중간 크기 6줄, §15.5) */
export const MAX_DAY_ITEMS = 6
/** 이보다 오래된 대기열 항목은 반영하지 않고 버린다(§8.5 [임시]) */
export const ACTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type WidgetTask = {
  id: string
  title: string
  priority: number
  depth: 0 | 1
  label: string | null
  labelTone: 'accent' | 'danger'
  overdueAt: string | null
  repeat: boolean
}
export type WidgetMood = 'default' | 'happy' | 'sleepy'
export type WidgetGrowth = {
  hasCharacter: boolean
  name: string | null
  species: Species | null
  level: number
  stage: number
  stageName: string
  xpInto: number
  xpToNext: number
  todayTaskXp: number
  todayTaskXpCap: number
  mood: WidgetMood
  art: string
}
/** 15 월 캘린더 위젯 — 칸 하나의 막대 */
export type WidgetCalItem = {
  id: string | null // task·event만(ext는 null — 날짜 링크)
  kind: 'task' | 'event' | 'ext'
  title: string
  color: string | null // null = 테마 강조색
  done: boolean
  allDay: boolean
  repeat: boolean
}
export type WidgetCalDay = { d: string; other?: true; holiday?: string; count: number; items: WidgetCalItem[] }
/** weekStart = 06 §16.1 주 시작(0 일 · 1 월 · 6 토) — days가 이 요일부터 7칸씩. 예전 위젯(필드 모름)은 일요일로 읽는다 */
export type WidgetCalendar = { month: string; title: string; weekStart: WeekStart; days: WidgetCalDay[] }
export type WidgetSnapshot = {
  schema: 1
  generatedAt: string
  day?: string
  account: { signedIn: boolean }
  prefs?: { clock24h: boolean }
  theme?: { accentLight: string; accentDark: string }
  today?: { count: number; tasks: WidgetTask[] }
  growth?: WidgetGrowth
  calendar?: WidgetCalendar
  appliedActions?: string[]
}

// 00 §5 테마 강조색(packages/tokens/tokens.css의 --color-accent). sky는 기본 강조색을 그대로 쓴다.
export const THEME_ACCENT: Record<string, string> = {
  default: '#4E75F2', sky: '#4E75F2', turquoise: '#117B58', teal: '#237973', matcha: '#55793D', sunshine: '#AB5C00',
  peach: '#C4286A', lilac: '#775DBE', ebony: '#87634A', navy: '#2B3455', gray: '#363B41', dark: '#545DFA', black: '#5A62FA'
}
/** §5.2: 밝게 = 기본 테마가 라이트 계열이면 그 강조색(아니면 #4E75F2), 어둡게 = 다크일 때 테마의 강조색 */
export function widgetAccents(stored: string | null | undefined): { accentLight: string; accentDark: string } {
  const { main, dark } = parseTheme(stored)
  const light = findTheme(main)?.family === 'light' ? THEME_ACCENT[main] : THEME_ACCENT.default
  return { accentLight: light ?? THEME_ACCENT.default, accentDark: THEME_ACCENT[dark] ?? THEME_ACCENT.dark }
}

/** 저장 칸 안 캐릭터 그림 경로(§8.4) — 조합마다 한 장 */
/** 저장 칸 안 그림 경로 — 공용 widgetArtPath(그림 판 v3 + 입은 모습 열쇠, 휴대폰과 같은 이름) */
export const artPath = widgetArtPath

/** 09 미니 창 "오늘"과 같은 쿼리·순서: 만료됨 먼저, 그다음 오늘. 하위 할 일은 부모 바로 아래 한 단계 */
export function todayItems(rows: TaskRow[], today: string): WidgetTask[] {
  const ids = new Set(rows.map((r) => r.id))
  const roots = rows.filter((t) => !t.parent_id || !ids.has(t.parent_id))
  const rank = (t: TaskRow) => (timeGroup(t, today) === 'overdue' ? 0 : 1)
  const ordered = roots.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t)
  const item = (t: TaskRow, depth: 0 | 1): WidgetTask => {
    const date = rowDateLabel(t, today)
    return {
      id: t.id,
      title: displayTitle(t.title) || '제목 없음', // 33 §6.6
      priority: Math.max(0, Math.min(3, Number(t.priority) || 0)),
      depth,
      label: date?.label ?? null,
      labelTone: date?.tone === 'overdue' ? 'danger' : 'accent',
      overdueAt: null, // 02·09 규칙은 날짜로만 만료를 본다(시각이 지나도 오늘) — §13 열린 질문 2
      repeat: !!t.repeat_rule
    }
  }
  const out: WidgetTask[] = []
  for (const r of ordered) {
    out.push(item(r, 0))
    for (const c of rows.filter((x) => x.parent_id === r.id)) out.push(item(c, 1))
  }
  return out
}

type XpRow = { kind: string; amount: number; day: string; created_at: string }
export function growthOf(character: { name: string | null; species: string | null; look_json?: string | null } | null, events: XpRow[], today: string): WidgetGrowth {
  const p = progressFromEvents(events.map((e) => ({ amount: Number(e.amount) || 0, created_at: e.created_at ?? '' })))
  const ofToday = events.filter((e) => e.day === today)
  const todayTaskXp = ofToday.filter((e) => e.kind === 'task' || e.kind === 'task_revoke').reduce((s, e) => s + Number(e.amount), 0)
  const todayAny = ofToday.reduce((s, e) => s + Number(e.amount), 0)
  const lastDay = events.filter((e) => Number(e.amount) > 0).map((e) => e.day).sort().at(-1)
  // 10 §3.1: 오늘 XP가 있으면 기쁨, 이틀 넘게 없으면 졸림, 그 밖은 보통
  const mood: WidgetMood = todayAny > 0 ? 'happy' : lastDay && daysBetween(lastDay, today) >= 2 ? 'sleepy' : 'default'
  const species = normalizeSpecies(character?.species) // 옛 종 id도 새 종으로(43 결정 ⑥)
  return {
    hasCharacter: !!species,
    name: character?.name || (species ? SPECIES[species].name : null),
    species,
    level: p.level,
    stage: p.stage,
    stageName: STAGES.find((s) => s.stage === p.stage)?.name ?? '',
    xpInto: p.into,
    xpToNext: p.toNext,
    todayTaskXp: Math.max(0, todayTaskXp),
    todayTaskXpCap: 10,
    mood,
    art: artPath(species, p.stage, mood, widgetLookKey(character?.look_json))
  }
}

// 렌더러 data/growth.ts CHARACTER_SQL과 같은 순서(배정된 캐릭터 먼저)
const CHARACTER_SQL = 'SELECT name, species, look_json FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'

/** DB → 저장 파일. 로그아웃이면 로그아웃 형태만(§8.3·§8.8) */
export async function buildSnapshot(db: CoreDb, opts: { today: string; now: Date; signedIn: boolean; appliedActions?: string[]; extEvents?: (from: string, to: string) => ExtEvent[] }): Promise<WidgetSnapshot> {
  const generatedAt = isoLocal(opts.now)
  if (!opts.signedIn) return { schema: 1, generatedAt, account: { signedIn: false } }
  const q = openTasksSql('smart:today', defaultSettings('smart:today'), opts.today)
  const rows = await db.getAll<TaskRow>(q.sql, q.params)
  const items = todayItems(rows, opts.today)
  const prefs = await db.get<{ theme: string | null }>('SELECT theme FROM user_prefs ORDER BY created_at LIMIT 1')
  const character = await db.get<{ name: string | null; species: string | null; look_json?: string | null }>(CHARACTER_SQL)
  const events = await db.getAll<XpRow>('SELECT kind, amount, day, created_at FROM xp_events')
  return {
    schema: 1,
    generatedAt,
    day: opts.today,
    account: { signedIn: true },
    prefs: { clock24h: false }, // 앱에 12/24시간 설정이 아직 없다 — 앱과 같은 "오전 8:00"
    theme: widgetAccents(prefs?.theme),
    today: { count: items.length, tasks: items.slice(0, MAX_TASKS) },
    growth: growthOf(character, events, opts.today),
    calendar: await calendarOf(db, opts.today, opts.extEvents),
    appliedActions: (opts.appliedActions ?? []).slice(-MAX_APPLIED)
  }
}

/** "2026-10-04T09:12:03+09:00" — 로컬 시각 + 오프셋 */
export function isoLocal(d: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`
}

/** 내용이 같은지 볼 때 generatedAt은 빼고 비교한다(바뀌었을 때만 위젯 새로 고침 — §7) */
export const snapshotKey = (s: WidgetSnapshot) => JSON.stringify({ ...s, generatedAt: undefined })

// ── 대기열(위젯 → 앱, §8.5) ──
export type WidgetAction = { schema: 1; id: string; kind: 'complete' | 'uncomplete'; taskId: string; at: string; day?: string }
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const TASK_RE = /^[A-Za-z0-9_-]{1,100}$/
/** 파일 내용 검사. 깨졌거나 모르는 형식이면 null(→ actions/bad/로) */
export function parseAction(raw: string): WidgetAction | null {
  try {
    const a = JSON.parse(raw) as Partial<WidgetAction>
    if (a.schema !== 1 || typeof a.id !== 'string' || !ID_RE.test(a.id)) return null
    if (a.kind !== 'complete' && a.kind !== 'uncomplete') return null
    if (typeof a.taskId !== 'string' || !TASK_RE.test(a.taskId)) return null
    if (typeof a.at !== 'string' || Number.isNaN(Date.parse(a.at))) return null
    return { schema: 1, id: a.id, kind: a.kind, taskId: a.taskId, at: a.at, day: typeof a.day === 'string' ? a.day : undefined }
  } catch {
    return null
  }
}
export const actionTooOld = (a: WidgetAction, now: Date) => now.getTime() - Date.parse(a.at) > ACTION_MAX_AGE_MS

// ── 15 월 캘린더 위젯 ──
type EvRow = { id: string; title: string | null; start_at: string; end_at: string; repeat_rule: string | null; color: string | null }
const CAL_S = 'substr(COALESCE(t.start_at, t.due_at), 1, 10)'
const CAL_E = 'substr(t.due_at, 1, 10)'

/** 06 캘린더 보기 설정(동기화 view_settings 'calendar') — 앱 월 보기와 같은 항목을 고른다 */
export async function calendarOptionsOf(db: CoreDb): Promise<CalOptions> {
  const row = await db.get<{ options_json: string | null }>("SELECT options_json FROM view_settings WHERE view_key = 'calendar'")
  try { return { ...DEFAULT_OPTIONS, ...(row?.options_json ? JSON.parse(row.options_json) : {}) } } catch { return DEFAULT_OPTIONS }
}

/** 칸 안 순서(§15.2): 종일(여러 날 먼저) → 시각 순. 같은 자리는 들어온 순서 */
type Raw = WidgetCalItem & { start: string; end: string; seq: number }
const order = (a: Raw, b: Raw) => {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  if (a.allDay) return a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.seq - b.seq
  return a.start.localeCompare(b.start) || a.seq - b.seq
}

/** 이번 달 격자(주 시작 설정 기준, 그 달에 필요한 주만큼) + 날마다 막대. 앱 06 CalendarView의 쿼리·옵션과 같은 규칙 */
export async function calendarOf(db: CoreDb, today: string, extEvents?: (from: string, to: string) => ExtEvent[]): Promise<WidgetCalendar> {
  const opts = await calendarOptionsOf(db)
  const ws = toWeekStart(opts.weekStart)
  const { from, to, days } = rangeOf('month', today, ws)
  // 할 일 — CalendarView와 같은 조건(보관한 리스트 제외 · 완료 보기 · 반복 회차 · 리스트/태그 필터)
  const cond = ['t.due_at IS NOT NULL', 't.deleted_at IS NULL', 'l.archived_at IS NULL']
  const ps: unknown[] = []
  if (!opts.completed) cond.push('t.status = 0')
  let when = `(${CAL_S} <= ? AND ${CAL_E} >= ?)`
  ps.push(to, from)
  if (opts.repeats) { when = `(${when} OR (t.repeat_rule IS NOT NULL AND t.status = 0 AND ${CAL_S} <= ?))`; ps.push(to) }
  cond.push(when)
  if (opts.lists.length || opts.tags.length) {
    const parts: string[] = []
    if (opts.lists.length) { parts.push(`t.list_id IN (${opts.lists.map(() => '?').join(',')})`); ps.push(...opts.lists) }
    if (opts.tags.length) { parts.push(`EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id IN (${opts.tags.map(() => '?').join(',')}))`); ps.push(...opts.tags) }
    cond.push(`(${parts.join(' OR ')})`)
  }
  const tasks = await db.getAll<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE ${cond.join(' AND ')} ORDER BY t.due_at, t.priority DESC, t.sort_order`, ps)
  const tagRows = opts.color === 'tag' ? await db.getAll<{ id: string; color: string | null }>('SELECT id, color FROM tags') : []
  const tagColor = (id: string) => tagRows.find((t) => t.id === id)?.color
  const raws: Raw[] = []
  let seq = 0
  const hex = (c: string | null | undefined) => (c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : null) // 'var(--color-accent)' 등은 null → 위젯 강조색
  for (const it of itemsOf(tasks, from, to, !!opts.repeats)) {
    raws.push({ id: it.task.id, kind: 'task', title: displayTitle(it.task.title) || '제목 없음', color: hex(colorOf(it.task, opts.color, tagColor)), done: it.task.status !== 0 && !it.virtual, allDay: !hasTime(it.end), repeat: !!it.task.repeat_rule, start: it.start, end: it.end, seq: seq++ })
  }
  // 내 일정(06 §14.4) — "내 일정" 체크를 끄면 없음
  if (opts.myCal !== 0) {
    const evs = await db.getAll<EvRow>(`SELECT id, title, start_at, end_at, repeat_rule, color FROM events WHERE deleted_at IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL
      AND ((substr(start_at, 1, 10) <= ? AND substr(end_at, 1, 10) >= ?) OR (repeat_rule IS NOT NULL AND substr(start_at, 1, 10) <= ?)) ORDER BY start_at`, [to, from, to])
    for (const e of evs) {
      const color = hex(e.color || opts.myColor || MY_CAL_COLOR)
      for (const o of occurrences(e, from, to)) raws.push({ id: e.id, kind: 'event', title: e.title || '제목 없음', color, done: false, allDay: !hasTime(o.start), repeat: !!e.repeat_rule, start: o.start, end: o.end, seq: seq++ })
    }
  }
  // 구글·Apple(16) — 왼쪽 패널에 체크된 캘린더만(앱 캘린더와 같다)
  let ext: ExtEvent[] = []
  try { ext = extEvents?.(from, to) ?? [] } catch { ext = [] }
  for (const e of ext) raws.push({ id: null, kind: 'ext', title: e.title || '제목 없음', color: hex(e.color), done: false, allDay: e.allDay, repeat: e.recurring, start: e.start, end: e.end, seq: seq++ })
  raws.sort(order)

  const holidays = opts.holidays !== 0 ? holidayMap(from, to) : new Map<string, string>()
  const month = today.slice(0, 7)
  const byDay = new Map<string, Raw[]>(days.map((d) => [d, []]))
  for (const r of raws) {
    // 여러 날 항목은 날마다 막대 하나(§15.2). 시각 항목이 자정을 넘기면 끝 날짜까지
    const s = datePart(r.start) < from ? from : datePart(r.start)
    const e = datePart(r.end) > to ? to : datePart(r.end)
    for (let d = s, i = 0; d <= e && i < 60; d = addDays(d, 1), i++) byDay.get(d)?.push(r)
  }
  return {
    month,
    title: `${Number(month.slice(5, 7))}월`,
    weekStart: ws,
    days: days.map((d) => {
      const list = byDay.get(d) ?? []
      const day: WidgetCalDay = { d, count: list.length, items: list.slice(0, MAX_DAY_ITEMS).map(({ start: _s, end: _e, seq: _q, ...it }) => it) }
      if (d.slice(0, 7) !== month) day.other = true
      const h = holidays.get(d)
      if (h) day.holiday = h
      return day
    })
  }
}
