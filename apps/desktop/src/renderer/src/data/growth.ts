import { useEffect, useMemo, useState } from 'react'
import { addDays } from '@sprout/schema/time'
import {
  aiLeft, parseGoalDraft, parseReportText, progressFromEvents, readTextJson, SPECIES, weekHasActivity, weekLabel, weeklyStats, XP, xpEventId, xpToNext,
  type GoalDraft, type ReportTextJson, type Species, type WeeklyStats, type WeekTask
} from '@sprout/schema/growth'
import { planGrantTaskXp, planReviewXp, planRevokeTaskXp, planTidyXp } from '@sprout/schema/taskCore'
import {
  GOAL_COLS, moveGoal, parseGoal as parseGoalCore, planCreateGoal, planRemoveGoal, planRenameGoal, planReorderGoals, planRestoreGoal, planSetGoalLink,
  planSetGoalProgress, planSetGoalTarget, syncLinkedGoals, weekBounds, type GoalEnv, type GoalLinkKind, type GoalRow as CoreGoalRow, type GoalTitleError, type NewGoal
} from '@sprout/schema/goalCore'
import { askGrowthAi } from './growth-ai'
import { getDb } from './db'
import { insert, run, update, uuid } from './mutations'
import type { Stmt } from './db'
import { useQuery } from './useQuery'
import { dayKey } from '../lib/dates'
import { weekStart } from '../lib/calendar'

// 10 성장 — XP 원장·캐릭터·주간 목표. 레벨은 원장에서 계산한다.
export type XpRow = { id: string; kind: string; amount: number; ref_id: string; day: string; created_at: string }
export type CharacterRow = { id: string; name: string | null; species: Species | null; type_code: string | null; assessed_at: string | null; look_json?: string | null }
export type GoalRow = CoreGoalRow

export const thisWeek = () => weekStart(dayKey())
export const nextWeek = () => addDays(thisWeek(), 7)

/** XP가 들어오면 레일·사이드바가 "+1"을 띄운다 */
const announce = (amount: number) => { if (amount) window.dispatchEvent(new CustomEvent('sprout:xp', { detail: amount })) }

// ── 캐릭터 ──
// 행이 여러 개면(두 기기가 따로 만든 경우 등) 배정된 캐릭터, 그다음 먼저 만든 것을 쓴다
const CHARACTER_SQL = 'SELECT id, name, species, type_code, assessed_at, look_json FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'
let creating: Promise<CharacterRow> | undefined
export async function ensureCharacter(): Promise<CharacterRow> {
  const db = await getDb()
  const row = await db.get<CharacterRow>(CHARACTER_SQL)
  if (row) return row
  // 동시에 여러 번 불려도 한 번만 만든다
  creating ??= (async () => {
    const id = uuid()
    await run(insert('characters', { id, name: null, species: null, type_code: null, answers_json: null, assessed_at: null }))
    return { id, name: null, species: null, type_code: null, assessed_at: null }
  })().finally(() => { creating = undefined })
  return creating
}
export async function assignCharacter(species: Species, typeCode: string, answers: Record<string, string>, name: string) {
  const c = await ensureCharacter()
  await run(update('characters', c.id, { species, type_code: typeCode, answers_json: JSON.stringify(answers), assessed_at: new Date().toISOString(), name }))
}
export const renameCharacter = async (name: string) => run(update('characters', (await ensureCharacter()).id, { name }))

// ── 할 일 XP (10 §6) ──
/** 완료한 할 일마다 +1, 하루 10까지. 같은 할 일은 하루 한 번 (규칙: @sprout/schema/taskCore — 위젯 체크도 같은 경로) */
export async function grantTaskXp(taskIds: string[]) {
  const { stmts, granted } = await planGrantTaskXp(await getDb(), taskIds, { today: dayKey() })
  await run(...stmts)
  announce(granted)
}
/** 같은 날 완료를 취소하면 그날 받은 XP를 되돌린다(다음 날 취소는 되돌리지 않는다) */
export async function revokeTaskXp(taskIds: string[]) {
  await run(...(await planRevokeTaskXp(await getDb(), taskIds, { today: dayKey() })))
}

// ── 점검·정리 XP (10 §6, 31 R.5·T.7) ──
/** 주간 점검을 끝내면 +30 — 점검한 주(ISO 주)마다 한 번. 새로 받았으면 받은 양(아니면 0) */
export async function grantReviewXp(week: string): Promise<number> {
  const c = await ensureCharacter()
  const { stmts, granted } = await planReviewXp(await getDb(), c.id, week, { today: dayKey() })
  if (stmts.length) await run(...stmts)
  announce(granted)
  return granted
}
/** 정리에서 "다 정리했어!"에 닿으면 +20 — 하루 한 번. 이번 정리에서 1개 이상 처리했을 때만 부른다 */
export async function grantTidyXp(): Promise<number> {
  const c = await ensureCharacter()
  const { stmts, granted } = await planTidyXp(await getDb(), c.id, { today: dayKey() })
  if (stmts.length) await run(...stmts)
  announce(granted)
  return granted
}

// ── 주간 목표 (10 §4 · §4.6) — 쓰기는 공용 @sprout/schema/goalCore(휴대폰과 같은 문장·같은 XP id) ──
const goalEnv = (): GoalEnv => ({ today: dayKey() })
/** "운동 3번" → 목표 3 [임시] */
export const parseGoal = parseGoalCore
/** source 'ai' = AI 초안을 사용자가 확정한 목표(10 §4.3). 검사 없이 넣는다(점검·초안·넘기기 — 예전 동작) */
export async function addGoal(week: string, raw: string, source: 'manual' | 'ai' = 'manual'): Promise<'ok' | 'full'> {
  const { title, target } = parseGoal(raw)
  return addGoalRow(week, title, target, source)
}
async function addGoalRow(week: string, title: string, target: number, source: string): Promise<'ok' | 'full'> {
  const db = await getDb()
  const n = (await db.get<{ n: number }>('SELECT count(*) n FROM kpis WHERE week_start = ?', [week]))?.n ?? 0
  if (n >= XP.goalsPerWeek) return 'full'
  await run(insert('kpis', { id: uuid(), week_start: week, title, target, progress: 0, link_kind: 'none', link_id: null, status: 'active', source, achieved_at: null, sort_order: Date.now() }))
  return 'ok'
}
/** 10 §4.6 만들기: 검사(빈 제목·60자·같은 제목·5개). 'ok' 또는 이유 */
export async function createGoal(week: string, input: NewGoal): Promise<'ok' | GoalTitleError | 'full'> {
  const r = await planCreateGoal(await getDb(), goalEnv(), week, input)
  if ('error' in r) return r.error
  await run(...r.stmts)
  return 'ok'
}
export async function renameGoal(goal: GoalRow, title: string): Promise<'ok' | GoalTitleError> {
  const r = await planRenameGoal(await getDb(), goalEnv(), goal, title)
  if (!Array.isArray(r)) return r.error
  await run(...r)
  return 'ok'
}
const runGained = async (r: { stmts: Stmt[]; gained: number }) => { await run(...r.stmts); announce(r.gained); return r.gained }
/** 목표 수(1~99) — 진행이 닿으면 그 순간 달성, 올려서 진행보다 커지면 풀림 */
export const setGoalTarget = async (goal: GoalRow, target: number) => runGained(await planSetGoalTarget(await getDb(), goalEnv(), goal, target))
/** 세는 방법(직접 · 끝낸 할 일 · 태그 · 리스트) */
export const setGoalLink = async (goal: GoalRow, link: { kind: GoalLinkKind; id?: string | null }) => runGained(await planSetGoalLink(await getDb(), goalEnv(), goal, link))
/** 끈 목표를 before 앞(없으면 맨 아래)으로 */
export const reorderGoal = async (ids: string[], id: string, before: string | null) => run(...planReorderGoals(goalEnv(), moveGoal(ids, id, before)))
/** 목표 삭제. 그 목표로 받은 XP는 되돌린다(10 §9). 되돌리기 함수를 돌려준다(같은 id·진행으로 되살리고 다시 판정) */
export async function removeGoal(id: string): Promise<() => Promise<void>> {
  const { stmts, row } = await planRemoveGoal(await getDb(), goalEnv(), id)
  await run(...stmts)
  return async () => {
    if (!row) return
    const back = planRestoreGoal(goalEnv(), row)
    await run(...back.stmts)
    await runGained(await planSetGoalProgress(await getDb(), goalEnv(), back.goal, row.progress))
  }
}
/** 진행을 바꾼다. 목표에 닿으면 달성(+30, 그 주 3개까지 + 모두 달성 보너스), 내려가면 되돌린다 */
export async function setGoalProgress(goal: GoalRow, progress: number) {
  await runGained(await planSetGoalProgress(await getDb(), goalEnv(), goal, progress))
}
/** 10 §4.6 연결 목표를 센 수로 맞춘다(한 번에 하나씩 — 겹치지 않게 줄 세움) */
let syncing: Promise<unknown> = Promise.resolve()
export function syncLinked(week = thisWeek()): Promise<unknown> {
  const go = async () => announce(await syncLinkedGoals(await getDb(), goalEnv(), week, (stmts) => run(...stmts)))
  syncing = syncing.then(go, go).catch((e) => console.warn('[growth] 연결 목표', e))
  return syncing
}
/** 앱에 늘 붙은 감시자(LevelUpWatcher)에서: 이번 주 끝낸 할 일·연결 목표가 바뀌면 맞춘다 */
export function useLinkedGoalSync() {
  const week = thisWeek()
  const [from, to] = weekBounds(week)
  const sig = useQuery<{ n: number; m: string | null; g: number }>(
    'SELECT count(*) n, max(t.modified_at) m, (SELECT count(*) FROM task_tags) g FROM tasks t WHERE t.status = 1 AND t.deleted_at IS NULL AND t.completed_at >= ? AND t.completed_at < ?', [from, to]
  )?.[0]
  const linked = useQuery<{ k: string | null }>(
    "SELECT group_concat(id || ':' || link_kind || ':' || COALESCE(link_id, '') || ':' || target || ':' || progress || ':' || status, '|') k FROM kpis WHERE week_start = ? AND link_kind IS NOT NULL AND link_kind != 'none'", [week]
  )?.[0]?.k
  const key = `${sig?.n ?? 0}|${sig?.m ?? ''}|${sig?.g ?? 0}|${linked ?? ''}`
  useEffect(() => { if (linked) void syncLinked(week) }, [key, week]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** 다음 주로 넘기기(10 §4.5) */
export const carryOver = (goal: GoalRow) => run(update('kpis', goal.id, { week_start: addDays(goal.week_start, 7), status: 'active', progress: 0, achieved_at: null, sort_order: Date.now() }))

// ── 주간 마감 · AI 주간 리포트 · KPI 초안 (10 §4.3, §5) ──
export type ReportRow = { id: string; week_start: string; stats_json: string; text_json: string | null; xp_total: number; seen_at: string | null }
/** 'ok' 문장·초안 저장 · 'unavailable' 연결 안 됨(시도로 안 침) · 'invalid' 엉뚱한 답(시도로 침) · 'capped' 이번 주 한도 · 'none' 부를 일 없음 */
export type AiResult = 'ok' | 'unavailable' | 'invalid' | 'capped' | 'none'

const REPORT_COLS = 'id, week_start, stats_json, text_json, xp_total, seen_at'
// 두 기기가 캐릭터를 따로 만들었을 때를 대비해 id 대신 주로 찾는다
const reportOf = async (week: string) => (await getDb()).get<ReportRow>(`SELECT ${REPORT_COLS} FROM weekly_reports WHERE week_start = ? ORDER BY created_at, id LIMIT 1`, [week])
async function patchText(week: string, patch: ReportTextJson) {
  const row = await reportOf(week)
  if (row) await run(update('weekly_reports', row.id, { text_json: JSON.stringify({ ...readTextJson(row.text_json), ...patch }) }))
}

/** 한 주의 재료: 완료 할 일(로컬 완료 날짜)·목표·XP·못 끝낸 할 일 제목 */
async function weekData(week: string) {
  const db = await getDb()
  const end = addDays(week, 7)
  // completed_at은 UTC ISO라 앞뒤 하루를 넉넉히 읽고 로컬 날짜로 거른다
  const rows = await db.getAll<{ id: string; title: string; list: string | null; start_at: string | null; due_at: string | null; completed_at: string }>(
    'SELECT t.id, t.title, l.name list, t.start_at, t.due_at, t.completed_at FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 1 AND t.deleted_at IS NULL AND t.completed_at >= ? AND t.completed_at < ? ORDER BY t.completed_at',
    [addDays(week, -1), addDays(end, 1)]
  )
  const tags = rows.length
    ? await db.getAll<{ task_id: string; name: string }>(`SELECT tt.task_id, g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE COALESCE(tt.state, 'accepted') = 'accepted' AND tt.task_id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id))
    : []
  const tasks: WeekTask[] = rows.map((r) => ({
    title: r.title ?? '', list: r.list, tags: tags.filter((t) => t.task_id === r.id).map((t) => t.name), day: dayKey(0, new Date(r.completed_at)), start_at: r.start_at, due_at: r.due_at
  }))
  const goals = await db.getAll<GoalRow>(`SELECT ${GOAL_COLS} FROM kpis WHERE week_start = ? ORDER BY sort_order`, [week])
  const xp = await db.getAll<{ kind: string; amount: number; day: string }>('SELECT kind, amount, day FROM xp_events WHERE day >= ? AND day < ?', [week, end])
  const open = await db.getAll<{ title: string }>("SELECT title FROM tasks WHERE status = 0 AND deleted_at IS NULL AND due_at >= ? AND due_at < ? ORDER BY due_at LIMIT 15", [week, end])
  return { tasks, goals, xp, open: open.map((t) => t.title) }
}

/** ① 목표 판정: until 이전 주의 진행 중 목표 — 목표 수에 닿았으면 §6 규칙대로 달성(XP 한 번만), 아니면 missed */
async function settleGoals(until: string) {
  const db = await getDb()
  // 10 §4.6: 판정 전에 지난주 연결 목표를 한 번 센 수로 맞춘다(그 전 주는 이미 닫혔거나 그때 맞춘 진행 그대로)
  await syncLinked(addDays(until, -7))
  const open = await db.getAll<GoalRow>(`SELECT ${GOAL_COLS} FROM kpis WHERE week_start < ? AND status = 'active'`, [until])
  for (const g of open) {
    if (g.progress >= g.target) await setGoalProgress(g, g.progress)
    else await run(update('kpis', g.id, { status: 'missed' }))
  }
}

/** 한 주를 마감한다: 목표 판정 → 숫자 저장. 이미 마감했으면 그대로 둔다(숫자·XP를 다시 쓰지 않는다). 빈 주는 null */
export async function closeWeek(week: string): Promise<ReportRow | null> {
  await settleGoals(addDays(week, 7))
  const existing = await reportOf(week)
  if (existing) return existing
  const { tasks, goals, xp } = await weekData(week)
  const stats = weeklyStats(week, tasks, goals, xp)
  if (!weekHasActivity(stats)) return null
  const id = xpEventId.report((await ensureCharacter()).id, week)
  await run(insert('weekly_reports', { id, week_start: week, stats_json: JSON.stringify(stats), text_json: '{}', xp_total: stats.xp.total, seen_at: null }))
  return (await reportOf(week)) ?? null
}

const speciesInfo = async () => {
  const sp = (await ensureCharacter()).species
  return sp ? `${SPECIES[sp].name}(${SPECIES[sp].type}) — ${SPECIES[sp].line}` : '아직 모름'
}
const clip = (titles: string[], n: number) => titles.slice(0, n).map((t) => t.slice(0, 60))

/** 서버 AI 프록시의 주간 상한 오류(server/api ai.ts MESSAGES.weekly) */
export const isWeeklyCap = (e: unknown) => /이번 주에는 이미 사용/.test(e instanceof Error ? e.message : String(e))

/** 공통: 부르고, 결과를 검사해 저장한다. 연결 실패는 시도로 치지 않는다 */
async function callAi<T>(kind: 'weekly_report' | 'kpi_draft', payload: unknown, signal: AbortSignal, parse: (raw: string) => T): Promise<{ result: AiResult; value?: T }> {
  let raw: string
  try {
    raw = await askGrowthAi(kind, payload, signal)
  } catch (e) {
    // 서버 프록시의 주간 상한(429 weekly: "이번 주에는 이미 사용했어요…")만 시도로 친다.
    // 하루 상한·잦은 요청·대기열·연결 실패는 잠깐 문제라 다음 실행 때 다시 한다
    return { result: isWeeklyCap(e) ? 'capped' : 'unavailable' }
  }
  try { return { result: 'ok', value: parse(raw) } } catch { return { result: 'invalid' } }
}

/** ③ 리포트 문장(주 1회). 숫자는 저장한 stats 그대로 보내고, AI는 문장만 쓴다 */
export async function writeReportText(week: string, signal: AbortSignal): Promise<AiResult> {
  const row = await reportOf(week)
  if (!row) return 'none'
  if (!aiLeft(readTextJson(row.text_json)).report) return 'capped'
  const stats = JSON.parse(row.stats_json) as WeeklyStats
  const { tasks, open } = await weekData(week)
  const payload = {
    week: weekLabel(week), character: await speciesInfo(),
    stats: { completed: stats.completed, perDay: stats.perDay, topTags: stats.topTags, topLists: stats.topLists, scheduledMinutes: stats.scheduledMinutes, xp: stats.xp, goals: stats.goals.map(({ title, target, progress, achieved }) => ({ title, target, progress, achieved })) },
    doneTitles: clip(tasks.map((t) => t.title), 30), openTitles: clip(open, 15)
  }
  const { result, value } = await callAi('weekly_report', payload, signal, parseReportText)
  if (result === 'unavailable') return result
  await patchText(week, { reportTried: true, ...(value ? { report: value } : {}) })
  return result
}

/** ④ 이번 주 KPI 초안(주 1회): reportWeek 다음 주가 이번 주이고, 이번 주 목표가 비어 있을 때만 */
export async function draftGoals(reportWeek: string, signal: AbortSignal): Promise<AiResult> {
  const target = addDays(reportWeek, 7)
  const row = await reportOf(reportWeek)
  if (!row || target !== thisWeek()) return 'none'
  const text = readTextJson(row.text_json)
  if (!aiLeft(text).draft) return 'capped'
  const db = await getDb()
  if (((await db.get<{ n: number }>('SELECT count(*) n FROM kpis WHERE week_start = ?', [target]))?.n ?? 0) > 0) return 'none'
  const { tasks, goals } = await weekData(reportWeek)
  const stats = JSON.parse(row.stats_json) as WeeklyStats
  const payload = {
    character: await speciesInfo(), lastWeekCompleted: stats.completed, topTags: stats.topTags, topLists: stats.topLists,
    doneTitles: clip(tasks.map((t) => t.title), 30),
    achievedGoals: goals.filter((g) => g.status === 'achieved').map((g) => g.title), missedGoals: goals.filter((g) => g.status !== 'achieved').map((g) => g.title),
    reportSuggestions: text.report?.next ?? []
  }
  const { result, value } = await callAi('kpi_draft', payload, signal, (raw) => parseGoalDraft(raw))
  if (result === 'unavailable') return result
  await patchText(reportWeek, { draftTried: true, ...(value ? { draft: value, draftWeek: target } : {}) })
  return result
}

/** 새 주 첫 실행: 지난주 마감 → 리포트 문장 → 이번 주 초안. 여러 주 만이면 지난주만 리포트, 그 전 주 목표는 닫기만 */
let closing: Promise<void> | undefined
export function runWeeklyClose(signal: AbortSignal): Promise<void> {
  closing ??= (async () => {
    const last = addDays(thisWeek(), -7)
    await settleGoals(thisWeek())
    const row = await closeWeek(last)
    if (!row) return
    const r = await writeReportText(last, signal)
    if (r !== 'unavailable') await draftGoals(last, signal)
  })().finally(() => { closing = undefined })
  return closing
}
/** 앱 전체에서 주마다 한 번 마감을 시도한다(창에 다시 들어올 때 주가 바뀌었으면 다시) */
let triedWeek = ''
export function useWeeklyClose() {
  useEffect(() => {
    const go = () => {
      const week = thisWeek()
      if (triedWeek === week) return
      triedWeek = week
      void runWeeklyClose(new AbortController().signal).catch((e) => console.warn('[growth] 주간 마감', e))
    }
    go()
    window.addEventListener('focus', go)
    return () => window.removeEventListener('focus', go)
  }, [])
}

/** 리포트 화면의 [다시 시도] */
export async function retryReport(week: string) {
  const signal = new AbortController().signal
  const r = await writeReportText(week, signal)
  if (r !== 'unavailable') await draftGoals(week, signal)
  return r
}
export const markReportSeen = (id: string) => run(update('weekly_reports', id, { seen_at: new Date().toISOString() }))
/** 초안 줄 숨기기(×) */
export async function dismissDraft(reportWeek: string, title: string) {
  const row = await reportOf(reportWeek)
  const t = readTextJson(row?.text_json)
  await patchText(reportWeek, { dismissed: [...new Set([...(t.dismissed ?? []), title])] })
}
/** 못 이룬 목표를 이번 주 목표로 새로 만든다(기록은 남김, 10 §4.5) */
export const carryMissed = (goal: { title: string; target: number }) => addGoalRow(thisWeek(), goal.title, goal.target, 'manual')

/** 주간 리포트 목록(최근 주부터, 주마다 한 행) */
export function useWeeklyReports() {
  const rows = useQuery<ReportRow>(`SELECT ${REPORT_COLS} FROM weekly_reports ORDER BY week_start DESC, created_at, id`)
  return useMemo(() => rows?.filter((r, i) => rows.findIndex((x) => x.week_start === r.week_start) === i), [rows])
}
/** 그 주에 보여줄 AI 초안 줄(숨긴 것 빼고) */
export function useGoalDraft(week: string): { reportWeek: string; items: GoalDraft[]; tried: boolean } {
  const reportWeek = addDays(week, -7)
  const row = useQuery<{ text_json: string | null }>('SELECT text_json FROM weekly_reports WHERE week_start = ? ORDER BY created_at, id LIMIT 1', [reportWeek])?.[0]
  return useMemo(() => {
    const t = readTextJson(row?.text_json)
    const items = t.draftWeek === week ? (t.draft ?? []).filter((d) => !(t.dismissed ?? []).includes(d.title)) : []
    // tried = 그 주 초안을 이미 만들어 봄(주 1회 상한, 40 §5.2)
    return { reportWeek, items, tried: !!t.draftTried }
  }, [row?.text_json, week, reportWeek])
}

// ── 화면에서 쓰는 상태 ──
export function useGrowth() {
  const raw = useQuery<XpRow>('SELECT id, kind, amount, ref_id, day, created_at FROM xp_events ORDER BY created_at')
  const events = useMemo(() => raw ?? [], [raw])
  const character = useQuery<CharacterRow>(CHARACTER_SQL)?.[0]
  const progress = useMemo(() => progressFromEvents(events), [events])
  return { events, character, progress, loaded: raw !== undefined }
}

// ── 10 §3.2 캐릭터 중심 v3: 무대가 쓰는 계산(순수 함수) · 기기 저장 ──
/** §3.2.7 레벨로 열리는 장식(자리는 고정) */
export const DECOR = [
  { id: 'sign', lv: 1, name: '이름 팻말' }, { id: 'flowers', lv: 2, name: '꽃 화분' }, { id: 'fence', lv: 3, name: '나무 울타리' },
  { id: 'lamp', lv: 4, name: '버섯 등' }, { id: 'butterfly', lv: 5, name: '나비' }, { id: 'ball', lv: 6, name: '공' },
  { id: 'bunting', lv: 8, name: '깃발 줄' }, { id: 'tent', lv: 10, name: '작은 텐트' }, { id: 'fireflies', lv: 12, name: '반딧불' }, { id: 'arch', lv: 15, name: '꽃 아치' }
] as const
export type DecorId = (typeof DECOR)[number]['id']
/** prev 레벨 다음부터 now 레벨까지 새로 열린 장식 */
export const newlyUnlocked = (prev: number, now: number) => DECOR.filter((d) => d.lv > prev && d.lv <= now)
export const nextDecor = (level: number) => DECOR.find((d) => d.lv > level)

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
/** 아침 6–11 · 낮 11–17 · 저녁 17–20 · 밤 20–6 */
export const timeOfDay = (h: number): TimeOfDay => (h < 6 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 20 ? 'evening' : 'night')
/** §3.2.3 졸림: 밤 23–6시 또는 이틀 넘게 XP 없음 */
export const isSleepy = (h: number, idleDays: number) => h >= 23 || h < 6 || idleDays >= 2

export type StageStats = {
  todayDone: number; todayOpen: number; todayTaskXp: number; streak: number; idleDays: number
  /** 43 하루 장면: 오늘 마감 할 일 전체(완료 포함) · 오늘 일정 합(분) · 할 일을 한 날 누적 */
  dueTotal?: number; eventMinutes?: number; activeDays?: number
  level: number; into: number; toNext: number; diaryUnseen: boolean
  goals: { title: string; target: number; progress: number; achieved: boolean }[]
}
const josaOf = (w: string, withBatchim: string, without: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return w + (c >= 0 && c < 11172 && c % 28 ? withBatchim : without)
}
/** §3.2.4 말풍선 문장: 실제 숫자로 채운다(우선순위 순) */
export function stageLines(s: StageStats): string[] {
  const out: string[] = []
  if (s.diaryUnseen) out.push('일기 썼어! 읽어 줄래?')
  if (s.todayDone >= 3) out.push(`오늘 ${s.todayDone}개나 했어, 최고야`)
  else if (s.todayDone > 0) out.push(`오늘 ${s.todayDone}개 했어!`)
  else if (s.todayOpen > 0) out.push(`오늘 할 일 ${s.todayOpen}개 있어. 하나만 같이 해 볼까?`)
  const left = s.goals.filter((g) => !g.achieved)
  if (s.goals.length && !left.length) out.push(`이번 주 퀘스트 다 했다!${s.goals.length >= 2 ? ` 보너스 +${XP.kpiAll}` : ''}`)
  else if (left.length) {
    const near = left.filter((g) => g.target > 1).sort((a, b) => a.target - a.progress - (b.target - b.progress))[0]
    out.push(near ? `'${near.title}' ${near.target - near.progress}번 남았어!` : `이번 주 퀘스트 ${left.length}개 남았어, 응원할게`)
  }
  const gap = s.toNext - s.into
  if (gap <= 10) out.push(`레벨업까지 ${gap} XP! 거의 다 왔어`)
  const nd = nextDecor(s.level)
  if (nd) out.push(`Lv ${nd.lv}${'이이가이가가이이이가'[nd.lv % 10]} 되면 ${josaOf(nd.name, '이', '가')} 생겨`)
  if (s.todayTaskXp >= XP.taskDailyCap) out.push('오늘은 배불러! 남은 건 내일 먹을게')
  out.push('네가 끝낸 일만큼 자라', '잠깐 쉬어도 괜찮아')
  return out
}
/** §3.2.4 하루 첫 인사 */
export function greetingLine(t: TimeOfDay, s: Pick<StageStats, 'todayDone' | 'todayOpen'>): string {
  if (t === 'morning') return s.todayOpen ? `좋은 아침! 오늘 할 일 ${s.todayOpen}개 있어` : '좋은 아침! 오늘도 같이 자라자'
  if (t === 'day') return s.todayDone ? `오늘 벌써 ${s.todayDone}개 했어!` : '안녕! 오늘 첫 할 일, 같이 해 볼까?'
  if (t === 'evening') return s.todayDone ? `오늘 ${s.todayDone}개 했네, 수고했어` : '오늘도 수고했어'
  return '늦었네… 오늘은 이만 쉬자'
}
/** §3.2.5 자리 비운 사이 받은 XP: since 뒤에 들어온 +XP 사건. since가 없으면(처음 쓰는 기기) 없음 */
export function catchUpOf(events: Pick<XpRow, 'kind' | 'amount' | 'created_at'>[], since: string | null) {
  if (!since) return { tasks: 0, xp: 0, orbs: [] as number[] }
  const got = events.filter((e) => e.amount > 0 && e.created_at > since)
  const tasks = got.filter((e) => e.kind === 'task').length
  const xp = got.reduce((s, e) => s + e.amount, 0)
  // 할 일 +1은 작은 방울, 목표·보너스는 큰 방울. 합쳐 최대 10개 — 넘으면 마지막 방울에 나머지를 모은다
  const all = got.map((e) => e.amount)
  const orbs = all.length > 10 ? [...all.slice(0, 9), all.slice(9).reduce((a, b) => a + b, 0)] : all
  return { tasks, xp, orbs }
}
/** 누적 XP → 그 레벨 안의 진행(방울이 닿을 때마다 막대를 채우는 표시용) */
export function levelOfTotal(total: number) {
  let level = 1
  let rest = Math.max(0, total)
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++ }
  return { level, into: rest, toNext: xpToNext(level) }
}

// 기기 저장(동기화하지 않는다 — 10 §3.2.12)
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 저장 꺼짐 */ } }
}
/** 치운 장식 id(새로 열린 것은 놓인 채로 시작) */
export function readRoomOff(characterId: string): Set<string> {
  try { return new Set(JSON.parse(ls.get(`sprout.room.${characterId}`) ?? '[]') as string[]) } catch { return new Set() }
}
export const writeRoomOff = (characterId: string, off: Set<string>) => ls.set(`sprout.room.${characterId}`, JSON.stringify([...off]))
export const readSeenAt = (characterId: string) => ls.get(`sprout.growthSeenAt.${characterId}`)
export const writeSeenAt = (characterId: string, iso = new Date().toISOString()) => ls.set(`sprout.growthSeenAt.${characterId}`, iso)
/** 하루 첫 인사를 했는지(했으면 false), 안 했으면 표시하고 true */
export function takeGreeting(day: string): boolean {
  if (ls.get('sprout.greetedDay') === day) return false
  ls.set('sprout.greetedDay', day)
  return true
}
export const readLogOpen = () => ls.get('sprout.growthLogOpen') === '1'
export const writeLogOpen = (open: boolean) => ls.set('sprout.growthLogOpen', open ? '1' : '0')

/** §3.2.11 움직임 줄이기: OS 설정 또는 성장 화면 ⋯ 스위치(기기별) */
export const readMotionPref = () => ls.get('sprout.growthMotion') === 'reduce'
export function writeMotionPref(reduce: boolean) {
  ls.set('sprout.growthMotion', reduce ? 'reduce' : 'full')
  window.dispatchEvent(new CustomEvent('sprout:growth-motion'))
}
export const motionReduced = () => readMotionPref() || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
export function useMotionReduced() {
  const [r, setR] = useState(motionReduced)
  useEffect(() => {
    const on = () => setR(motionReduced())
    const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null
    window.addEventListener('sprout:growth-motion', on)
    mq?.addEventListener?.('change', on)
    return () => { window.removeEventListener('sprout:growth-motion', on); mq?.removeEventListener?.('change', on) }
  }, [])
  return r
}

/** §3.2.6 성장 화면이 열려 있으면 레벨업 창 대신 무대가 연출한다 */
let stageActive = 0
export const setGrowthStageActive = (on: boolean) => { stageActive = Math.max(0, stageActive + (on ? 1 : -1)) }
export const isGrowthStageActive = () => stageActive > 0
