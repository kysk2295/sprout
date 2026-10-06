// 36 모바일 위젯 §7.2 — 저장 파일(snapshot.json schema 1) 만들기. 모양은 맥 위젯(25 §8.3)과 같고 `calendar`(월 캘린더)를 더한다.
// - readWidgetData = DB 읽기(SQL만), composeWidgetSnapshot = 순수 조립(시험: snapshot.test.ts)
// - 오늘 목록 = 할 일 탭 smart:today와 같은 범위·날짜 문구(만료됨 먼저 → 오늘, 하위 할 일 한 단계)
// - 월 칸 = 캘린더 탭 월 보기와 같은 항목·순서(itemsOf + 일정 eventItems → itemsOnDay), 색 = 리스트 색/일정 색
import { progressFromEvents, SPECIES, STAGES, type Species } from '@sprout/schema/growth'
import { addDays, daysBetween } from '@sprout/schema/time'
import type { CoreDb } from '@sprout/schema/taskCore'
import {
  buildWidgetCalendar, isoLocal, widgetAccents, widgetArtPath, widgetCalendarRange, WIDGET_MAX_APPLIED, WIDGET_MAX_TASKS,
  type WidgetCalItem, type WidgetGrowth, type WidgetMood, type WidgetSnapshot, type WidgetTask
} from '@sprout/schema/widget'
import { displayTitle } from '@sprout/schema/wikiLink'
import { WEEK_START_OPTIONS, weekStartOfOptions } from '@sprout/schema/weekStart'
import { itemsOf, itemsOnDay, type CalItem } from '../data/calendar.ts'
import { markPrefsOf } from '../data/calendarMarks.ts'
import { eventIdOf, eventItems, isEventId, isPast, myColorOf, type EventRow } from '../data/eventsModel.ts'
import { bySmartDate, COLUMNS, openSql, type TaskRow } from '../data/views.ts'
import { rowDateLabel, timeGroup } from '../lib/dates.ts'

type XpRow = { kind: string; amount: number; day: string; created_at: string }
export type WidgetData = {
  todayRows: TaskRow[]
  calTasks: TaskRow[]
  events: EventRow[]
  calendarOptions: string | null
  theme: string | null
  character: { name: string | null; species: string | null } | null
  xp: XpRow[]
}

const CHARACTER_SQL = 'SELECT name, species FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'
/** 캘린더 탭과 같은 조건(보관한 리스트 제외, 완료도 보임 — 완료 보기 기본 켬) */
const CAL_SQL = `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
  WHERE t.deleted_at IS NULL AND t.due_at IS NOT NULL AND (l.archived_at IS NULL) AND t.status IN (0, 1)
    AND substr(COALESCE(t.start_at, t.due_at), 1, 10) <= ? AND substr(t.due_at, 1, 10) >= ?`
const EVENTS_SQL = `SELECT * FROM events WHERE deleted_at IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL
  AND ((substr(start_at, 1, 10) <= ? AND substr(end_at, 1, 10) >= ?) OR (repeat_rule IS NOT NULL AND substr(start_at, 1, 10) <= ?))
  ORDER BY start_at`

/** 위젯이 다시 그려야 하는 표(바뀌면 저장 파일을 다시 쓴다) */
export const WIDGET_TABLES = ['tasks', 'lists', 'events', 'view_settings', 'user_prefs', 'characters', 'xp_events'] as const

export async function readWidgetData(db: CoreDb, today: string): Promise<WidgetData> {
  const q = openSql('smart:today', today)
  // 주 시작 설정(06 §16.1)은 같이 읽으므로, 세 가지(토·일·월) 범위를 모두 덮게 읽는다
  const rs = WEEK_START_OPTIONS.map((o) => widgetCalendarRange(today, undefined, o.value))
  const r = { from: rs.map((x) => x.from).sort()[0], to: rs.map((x) => x.to).sort().reverse()[0] }
  const [todayRows, calTasks, events, cal, prefs, character, xp] = await Promise.all([
    db.getAll<TaskRow>(q.sql, q.params),
    db.getAll<TaskRow>(CAL_SQL, [r.to, r.from]),
    db.getAll<EventRow>(EVENTS_SQL, [r.to, r.from, r.to]),
    db.get<{ options_json: string | null }>("SELECT options_json FROM view_settings WHERE view_key = 'calendar' LIMIT 1"),
    db.get<{ theme: string | null }>('SELECT theme FROM user_prefs ORDER BY created_at LIMIT 1'),
    db.get<{ name: string | null; species: string | null }>(CHARACTER_SQL),
    db.getAll<XpRow>('SELECT kind, amount, day, created_at FROM xp_events')
  ])
  return { todayRows, calTasks, events, calendarOptions: cal?.options_json ?? null, theme: prefs?.theme ?? null, character: character ?? null, xp }
}

/** 오늘 목록(25 §3.2 순서): 만료됨 먼저 → 오늘(할 일 탭과 같은 날짜순), 하위 할 일은 부모 바로 아래 한 단계 */
export function todayItems(rows: TaskRow[], today: string): WidgetTask[] {
  const ids = new Set(rows.map((r) => r.id))
  const roots = rows.filter((t) => !t.parent_id || !ids.has(t.parent_id))
  const rank = (t: TaskRow) => (timeGroup(t, today) === 'overdue' ? 0 : 1)
  const ordered = [...roots].sort((a, b) => rank(a) - rank(b) || bySmartDate(a, b))
  const item = (t: TaskRow, depth: 0 | 1): WidgetTask => {
    const date = rowDateLabel(t, today)
    return {
      id: t.id,
      title: displayTitle(t.title) || '제목 없음',
      priority: Math.max(0, Math.min(3, Number(t.priority) || 0)),
      depth,
      label: date?.label ?? null,
      labelTone: date?.tone === 'overdue' ? 'danger' : 'accent',
      overdueAt: null, // 02 규칙은 날짜로만 만료를 본다(25 §13-2)
      repeat: !!t.repeat_rule
    }
  }
  const out: WidgetTask[] = []
  for (const r of ordered) {
    out.push(item(r, 0))
    for (const c of rows.filter((x) => x.parent_id === r.id).sort(bySmartDate)) out.push(item(c, 1))
  }
  return out
}

export function growthOf(character: WidgetData['character'], events: XpRow[], today: string): WidgetGrowth {
  const p = progressFromEvents(events.map((e) => ({ amount: Number(e.amount) || 0, created_at: e.created_at ?? '' })))
  const ofToday = events.filter((e) => e.day === today)
  const todayTaskXp = ofToday.filter((e) => e.kind === 'task' || e.kind === 'task_revoke').reduce((s, e) => s + Number(e.amount), 0)
  const todayAny = ofToday.reduce((s, e) => s + Number(e.amount), 0)
  const lastDay = events.filter((e) => Number(e.amount) > 0).map((e) => e.day).sort().at(-1)
  // 10 §3.1: 오늘 XP가 있으면 기쁨, 이틀 넘게 없으면 졸림, 그 밖은 보통(맥 위젯과 같다)
  const mood: WidgetMood = todayAny > 0 ? 'happy' : lastDay && daysBetween(lastDay, today) >= 2 ? 'sleepy' : 'default'
  const species = character?.species && character.species in SPECIES ? (character.species as Species) : null
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
    art: widgetArtPath(species, p.stage, mood)
  }
}

/** 월 칸 항목: 캘린더 탭 월 보기와 같은 항목·순서. 일정 id는 앞붙이 없이 */
export function calendarItems(data: Pick<WidgetData, 'calTasks' | 'events' | 'calendarOptions'>, today: string, now: Date): (day: string) => WidgetCalItem[] {
  const r = widgetCalendarRange(today, undefined, weekStartOfOptions(data.calendarOptions))
  const items: CalItem<TaskRow>[] = [...itemsOf(data.calTasks, r.from, r.to), ...eventItems(data.events, r.from, r.to, myColorOf(data.calendarOptions))]
  // 날마다 한 번 거르는 대신 날짜별로 미리 나눈다(4달 × 42칸)
  const byDay = new Map<string, CalItem<TaskRow>[]>()
  for (const it of items) {
    const s = it.start.slice(0, 10)
    const e = it.end.slice(0, 10)
    for (let d = s < r.from ? r.from : s, i = 0; d <= e && d <= r.to && i < 200; d = addDays(d, 1), i++) {
      const list = byDay.get(d) ?? []
      list.push(it)
      byDay.set(d, list)
    }
  }
  return (day) =>
    itemsOnDay(byDay.get(day) ?? [], day).map((it) => {
      const ev = isEventId(it.task.id)
      return {
        id: ev ? eventIdOf(it.task.id) : it.task.id,
        kind: ev ? 'event' : 'task',
        title: displayTitle(it.task.title) || '제목 없음',
        color: it.task.list_color ? it.task.list_color.slice(0, 7) : null,
        faded: (!ev && it.task.status !== 0) || isPast(it.end, now)
      }
    })
}

/** 저장 파일 조립. 로그아웃이면 로그아웃 형태만(25 §8.8) */
export function composeWidgetSnapshot(data: WidgetData | null, opts: { today: string; now: Date; signedIn: boolean; appliedActions?: string[] }): WidgetSnapshot {
  const generatedAt = isoLocal(opts.now)
  if (!opts.signedIn || !data) return { schema: 1, generatedAt, account: { signedIn: false } }
  const items = todayItems(data.todayRows, opts.today)
  return {
    schema: 1,
    generatedAt,
    day: opts.today,
    account: { signedIn: true },
    prefs: { clock24h: false }, // 앱에 12/24시간 설정이 아직 없다 — "오전 8:00"
    theme: widgetAccents(data.theme),
    today: { count: items.length, tasks: items.slice(0, WIDGET_MAX_TASKS) },
    growth: growthOf(data.character, data.xp, opts.today),
    calendar: buildWidgetCalendar({ today: opts.today, dayItems: calendarItems(data, opts.today, opts.now), showHolidays: markPrefsOf(data.calendarOptions).holidays, weekStart: weekStartOfOptions(data.calendarOptions) }),
    appliedActions: (opts.appliedActions ?? []).slice(-WIDGET_MAX_APPLIED)
  }
}
