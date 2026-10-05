// 25 맥 위젯 §8.3 — 위젯에 넘기는 저장 파일(snapshot.json v1)을 만드는 순수 함수와 대기열 파일 검사.
// Electron에 기대지 않아 시험(tests/widget.test.ts)이 sql.js로 그대로 돌린다. 쓰기·감시는 main/widget.ts.
// Swift 쪽 Codable: native/widget/SproutWidget/Snapshot.swift — 두 쪽이 같은 예시 native/widget/fixtures/snapshot.v1.json을 읽는다.
import { progressFromEvents, SPECIES, STAGES, type Species } from '@sprout/schema/growth'
import { daysBetween } from '@sprout/schema/time'
import type { CoreDb } from '@sprout/schema/taskCore'
import { defaultSettings, openTasksSql } from '../renderer/src/data/views'
import { rowDateLabel, timeGroup } from '../renderer/src/lib/dates'
import { findTheme, parseTheme } from '../renderer/src/data/theme'
import type { TaskRow } from '../renderer/src/data/types'
import { displayTitle } from '@sprout/schema/wikiLink'

export const SNAPSHOT_SCHEMA = 1
/** 위젯에 넘기는 할 일 최대 수(크게 13행 + 여유, §8.3) */
export const MAX_TASKS = 20
/** 반영한 대기열 id를 기억하는 수(§8.3 appliedActions) */
export const MAX_APPLIED = 50
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
export type WidgetSnapshot = {
  schema: 1
  generatedAt: string
  day?: string
  account: { signedIn: boolean }
  prefs?: { clock24h: boolean }
  theme?: { accentLight: string; accentDark: string }
  today?: { count: number; tasks: WidgetTask[] }
  growth?: WidgetGrowth
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
export const artPath = (species: Species | null, stage: number, mood: WidgetMood) => (species ? `art/${species}-${stage}-${mood}@2x.png` : 'art/egg@2x.png')

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
export function growthOf(character: { name: string | null; species: string | null } | null, events: XpRow[], today: string): WidgetGrowth {
  const p = progressFromEvents(events.map((e) => ({ amount: Number(e.amount) || 0, created_at: e.created_at ?? '' })))
  const ofToday = events.filter((e) => e.day === today)
  const todayTaskXp = ofToday.filter((e) => e.kind === 'task' || e.kind === 'task_revoke').reduce((s, e) => s + Number(e.amount), 0)
  const todayAny = ofToday.reduce((s, e) => s + Number(e.amount), 0)
  const lastDay = events.filter((e) => Number(e.amount) > 0).map((e) => e.day).sort().at(-1)
  // 10 §3.1: 오늘 XP가 있으면 기쁨, 이틀 넘게 없으면 졸림, 그 밖은 보통
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
    art: artPath(species, p.stage, mood)
  }
}

// 렌더러 data/growth.ts CHARACTER_SQL과 같은 순서(배정된 캐릭터 먼저)
const CHARACTER_SQL = 'SELECT name, species FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'

/** DB → 저장 파일. 로그아웃이면 로그아웃 형태만(§8.3·§8.8) */
export async function buildSnapshot(db: CoreDb, opts: { today: string; now: Date; signedIn: boolean; appliedActions?: string[] }): Promise<WidgetSnapshot> {
  const generatedAt = isoLocal(opts.now)
  if (!opts.signedIn) return { schema: 1, generatedAt, account: { signedIn: false } }
  const q = openTasksSql('smart:today', defaultSettings('smart:today'), opts.today)
  const rows = await db.getAll<TaskRow>(q.sql, q.params)
  const items = todayItems(rows, opts.today)
  const prefs = await db.get<{ theme: string | null }>('SELECT theme FROM user_prefs ORDER BY created_at LIMIT 1')
  const character = await db.get<{ name: string | null; species: string | null }>(CHARACTER_SQL)
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
