// 23 모바일 성장 — 읽기(useQuery)와 쓰기(goalCore 문장 → run). 계산은 logic.ts, 문장 만들기는 goalCore.ts.
// 휴대폰은 AI를 부르지 않고 주간 마감도 하지 않는다(23 M-G2) — 데스크톱이 만든 리포트·초안을 동기화로 받아 읽기만 한다.
import { useLiveQuery } from '../data/rows'
import { progressFromEvents, readTextJson, reviewXpEvent, tidyXpEvent, type XpEventRow } from '@sprout/schema/growth'
import { insertStmt, updateStmt } from '@sprout/schema/taskCore'
import { planSaveLook } from '@sprout/schema/raiseCore'
import { parseLook, setSeed } from '@sprout/schema/wardrobe'
import { addDays } from '@sprout/schema/time'
import { useEffect, useMemo } from 'react'
import { GOAL_COLS as GOAL_COLS_ALL, moveGoal, weekBounds, type GoalLinkKind, type GoalTitleError, type NewGoal } from '@sprout/schema/goalCore'
import { currentUserId } from '../data/auth'
import { coreDb, run } from '../data/db'
import { xpGained } from '../data/events'
import {
  CHARACTER_SQL, planAddGoal, planCreateGoal, planEnsureCharacter, planAssignCharacter, planDismissDraft, planMarkSeen, planRemoveGoal, planRename, planRenameGoal,
  planReorderGoals, planRestoreGoal, planSetGoalLink, planSetGoalProgress, planSetGoalTarget, syncLinkedGoals, type GrowthEnv
} from './goalCore'
import {
  idleDaysOf, streakOf, taskXpOfDay, uniqueWeeks, visibleDrafts, weekStartOf,
  type CharacterRow, type GoalRow, type ReportRow, type StageStats, type XpRow
} from './logic'

const env = (today: string): GrowthEnv => ({ today, owner: currentUserId() })
const GOAL_COLS = GOAL_COLS_ALL
const REPORT_COLS = 'id, week_start, stats_json, text_json, xp_total, seen_at'

/** 성장 탭 한 화면에 필요한 것 전부. today는 부르는 쪽이 넘긴다(자정·앞으로 올 때 바꾸려고) */
export function useGrowthData(today: string) {
  const week = weekStartOf(today)
  const ev = useLiveQuery<XpRow>('SELECT id, kind, amount, ref_id, day, created_at FROM xp_events ORDER BY created_at')
  const events = ev.data
  const character = useLiveQuery<CharacterRow>(CHARACTER_SQL).data[0]
  const todayStart = new Date(`${today}T00:00`).toISOString()
  const todayDone = useLiveQuery<{ n: number }>('SELECT count(*) n FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ?', [todayStart]).data[0]?.n ?? 0
  const todayOpen = useLiveQuery<{ n: number }>('SELECT count(*) n FROM tasks WHERE status = 0 AND deleted_at IS NULL AND due_at >= ? AND due_at < ?', [today, addDays(today, 1)]).data[0]?.n ?? 0
  const goals = useLiveQuery<GoalRow>(`SELECT ${GOAL_COLS} FROM kpis WHERE week_start = ? ORDER BY sort_order`, [week]).data
  const earned = useLiveQuery<{ ref_id: string }>('SELECT x.ref_id FROM xp_events x JOIN kpis k ON k.id = x.ref_id WHERE k.week_start = ? GROUP BY x.ref_id HAVING sum(x.amount) > 0', [week]).data
  const reportRows = useLiveQuery<ReportRow>(`SELECT ${REPORT_COLS} FROM weekly_reports ORDER BY week_start DESC, created_at, id`).data
  const draftRow = useLiveQuery<{ text_json: string | null }>('SELECT text_json FROM weekly_reports WHERE week_start = ? ORDER BY created_at, id LIMIT 1', [addDays(week, -7)]).data[0]

  useLinkedGoalSync(today, week, goals)
  const progress = useMemo(() => progressFromEvents(events), [events])
  const reports = useMemo(() => uniqueWeeks(reportRows), [reportRows])
  const xpIds = useMemo(() => new Set(earned.map((e) => e.ref_id)), [earned])
  const drafts = useMemo(() => visibleDrafts(draftRow?.text_json, week, goals), [draftRow?.text_json, week, goals])
  // 40 §5.2: 이번 주 AI 초안을 이미 만들었다(주 2회 상한 중 KPI 초안 1 — 10 §4.3 draftTried)
  const draftUsed = useMemo(() => { const t = readTextJson(draftRow?.text_json); return !!t.draftTried && (t.draftWeek ?? week) === week }, [draftRow?.text_json, week])
  const stats: StageStats = useMemo(() => ({
    todayDone, todayOpen,
    todayTaskXp: taskXpOfDay(events, today),
    streak: streakOf(events, today),
    idleDays: idleDaysOf(events, today),
    level: progress.level, into: progress.into, toNext: progress.toNext,
    diaryUnseen: reports.some((r) => !r.seen_at),
    goals: goals.map((g) => ({ title: g.title, target: g.target, progress: g.progress, achieved: g.status === 'achieved' }))
  }), [todayDone, todayOpen, events, today, progress, reports, goals])
  const weekDone = useMemo(() => events.filter((e) => e.kind === 'task' && e.amount > 0 && e.day >= week).length, [events, week])

  return { loaded: !ev.isLoading, week, events, character, progress, goals, xpIds, drafts, draftUsed, reports, stats, weekDone }
}

/** 10 §4.6 연결 목표 진행 맞추기: 이번 주 끝낸 할 일(수·마지막 고친 때·태그 줄)이 바뀌면 연결 목표를 센 수로 맞춘다(+30 / 되돌림).
 *  두 기기가 같이 맞춰도 XP id가 결정적이라 한 번. 연결 목표가 없으면 읽기만 하고 아무것도 안 한다 */
let syncing: Promise<unknown> | undefined
function useLinkedGoalSync(today: string, week: string, goals: GoalRow[]) {
  const [from, to] = weekBounds(week)
  const sig = useLiveQuery<{ n: number; m: string | null; g: number }>(
    "SELECT count(*) n, max(t.modified_at) m, (SELECT count(*) FROM task_tags) g FROM tasks t WHERE t.status = 1 AND t.deleted_at IS NULL AND t.completed_at >= ? AND t.completed_at < ?",
    [from, to]
  ).data[0]
  const linked = goals.filter((g) => g.link_kind && g.link_kind !== 'none').map((g) => `${g.id}:${g.link_kind}:${g.link_id}:${g.target}:${g.progress}:${g.status}`).join('|')
  const key = `${sig?.n ?? 0}|${sig?.m ?? ''}|${sig?.g ?? 0}|${linked}`
  useEffect(() => {
    if (!linked) return
    const go = async () => { const gained = await syncLinkedGoals(coreDb, env(today), week, run); if (gained) xpGained.emit(gained) }
    syncing = (syncing ?? Promise.resolve()).then(go, go).catch((e) => console.warn('[growth] 연결 목표', e))
  }, [key, today, week]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** 한 주 목표(10 §4.6 편집기 — 이번 주·다음 주 탭) + 그 주 XP 받은 목표 */
export function useWeekGoals(week: string) {
  const goals = useLiveQuery<GoalRow>(`SELECT ${GOAL_COLS} FROM kpis WHERE week_start = ? ORDER BY sort_order`, [week]).data
  const earned = useLiveQuery<{ ref_id: string }>('SELECT x.ref_id FROM xp_events x JOIN kpis k ON k.id = x.ref_id WHERE k.week_start = ? GROUP BY x.ref_id HAVING sum(x.amount) > 0', [week]).data
  const xpIds = useMemo(() => new Set(earned.map((e) => e.ref_id)), [earned])
  return { goals, xpIds }
}
/** 세는 방법 고르기·꼬리표: 태그·리스트(보관 안 한 것) */
export function useLinkTargets() {
  const tags = useLiveQuery<{ id: string; name: string }>('SELECT id, name FROM tags ORDER BY sort_order, name').data
  const lists = useLiveQuery<{ id: string; name: string; kind: string | null }>("SELECT id, name, kind FROM lists WHERE archived_at IS NULL ORDER BY kind = 'inbox' DESC, sort_order, name").data
  return useMemo(() => ({
    tags, lists,
    names: { tags: new Map(tags.map((t) => [t.id, t.name])), lists: new Map(lists.map((l) => [l.id, l.kind === 'inbox' ? '기본함' : l.name])) }
  }), [tags, lists])
}

/** XP 내역 행 제목(할 일·목표). 지운 것은 제목 없이 종류만 */
export function useRefTitles(ids: string[]) {
  const marks = ids.map(() => '?').join(',') || "''"
  const rows = useLiveQuery<{ id: string; title: string }>(`SELECT id, title FROM tasks WHERE id IN (${marks}) UNION ALL SELECT id, title FROM kpis WHERE id IN (${marks})`, [...ids, ...ids]).data
  return useMemo(() => new Map(rows.map((r) => [r.id, r.title])), [rows])
}

export function useReport(week: string) {
  const row = useLiveQuery<ReportRow>(`SELECT ${REPORT_COLS} FROM weekly_reports WHERE week_start = ? ORDER BY created_at, id LIMIT 1`, [week]).data[0]
  return row
}
export function useWeekGoalTitles(week: string) {
  return useLiveQuery<{ title: string }>('SELECT title FROM kpis WHERE week_start = ?', [week]).data
}

// ── 쓰기 ──
/** 목표 체크·횟수 점(23 §4). 새로 받은 XP는 탭 바 +N·캐릭터 방울로 알린다 */
export async function setGoalProgress(today: string, goal: GoalRow, progress: number): Promise<number> {
  const { stmts, gained } = await planSetGoalProgress(coreDb, env(today), goal, progress)
  await run(stmts)
  if (gained) xpGained.emit(gained)
  return gained
}
/** AI 초안 + = 그 제목·횟수 그대로(source 'ai', 5개 한도) · 리포트 "이번 주로 넘기기" = source 'manual'(데스크톱 carryMissed와 같음) */
export async function addGoal(today: string, week: string, title: string, target: number, source: 'manual' | 'ai'): Promise<'ok' | 'full'> {
  const r = await planAddGoal(coreDb, env(today), week, title, target, source)
  if (r === 'full') return r
  await run(r)
  return 'ok'
}
// ── 10 §4.6 목표 고치기(공용 goalCore) ──
/** 만들기: 검사(빈 제목·60자·같은 제목·5개). 'ok' 또는 이유 */
export async function createGoal(today: string, week: string, input: NewGoal): Promise<'ok' | GoalTitleError | 'full'> {
  const r = await planCreateGoal(coreDb, env(today), week, input)
  if ('error' in r) return r.error
  await run(r.stmts)
  return 'ok'
}
export async function renameGoal(today: string, goal: GoalRow, title: string): Promise<'ok' | GoalTitleError> {
  const r = await planRenameGoal(coreDb, env(today), goal, title)
  if (!Array.isArray(r)) return r.error
  await run(r)
  return 'ok'
}
async function runGained(r: { stmts: Parameters<typeof run>[0]; gained: number }) {
  await run(r.stmts)
  if (r.gained) xpGained.emit(r.gained)
  return r.gained
}
export const setGoalTarget = async (today: string, goal: GoalRow, target: number) => runGained(await planSetGoalTarget(coreDb, env(today), goal, target))
export const setGoalLink = async (today: string, goal: GoalRow, link: { kind: GoalLinkKind; id?: string | null }) => runGained(await planSetGoalLink(coreDb, env(today), goal, link))
/** 지우기 — 되돌리기 함수를 돌려준다(같은 id·진행으로 되살리고 다시 판정) */
export async function removeGoal(today: string, id: string): Promise<() => Promise<void>> {
  const { stmts, row } = await planRemoveGoal(coreDb, env(today), id)
  await run(stmts)
  return async () => {
    if (!row) return
    const back = planRestoreGoal(env(today), row)
    await run(back.stmts)
    await runGained(await planSetGoalProgress(coreDb, env(today), back.goal, row.progress))
  }
}
/** 끈 목표를 before 앞(없으면 맨 아래)으로 */
export async function reorderGoal(today: string, ids: string[], id: string, before: string | null) {
  await run(planReorderGoals(env(today), moveGoal(ids, id, before)))
}
/** 다음 주로 넘기기(10 §4.5 — 행 자체를 옮김, 데스크톱 carryOver와 같음) */
export async function carryOverGoal(today: string, goal: GoalRow) {
  await run([updateStmt('kpis', goal.id, { week_start: addDays(goal.week_start, 7), status: 'active', progress: 0, achieved_at: null, sort_order: Date.now() })])
}
export async function dismissDraft(today: string, reportWeek: string, title: string) {
  await run(await planDismissDraft(coreDb, env(today), reportWeek, title))
}
export const markReportSeen = (today: string, id: string) => run(planMarkSeen(env(today), id))
/** 조사 결과 쓰기. seed(49 §5.2 만들기 흐름에서 고른 씨앗 0~3)가 있으면 look_json에 병합한다(입힌 옷·갈래·장식은 그대로) — 데스크톱과 같은 칸 */
export async function assignCharacter(today: string, a: Parameters<typeof planAssignCharacter>[2] & { seed?: number }) {
  const { seed, ...rest } = a
  await run(await planAssignCharacter(coreDb, env(today), rest))
  if (seed === undefined) return
  const row = await coreDb.get<{ id: string; look_json: string | null }>(LOOK_SQL)
  if (row) await run(planSaveLook(row.id, setSeed(parseLook(row.look_json), seed), { owner: currentUserId() }))
}
const LOOK_SQL = 'SELECT id, look_json FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'
export async function renameCharacter(today: string, name: string) {
  await run(await planRename(coreDb, env(today), name))
}

// ── 주간 점검 +30 · 정리 +20(10 §6, 2026-10-05 결정) — 공용 reviewXpEvent·tidyXpEvent(id가 결정적이라 두 기기·다시 끝내기에도 한 번만) ──
async function grantOnce(today: string, make: (characterId: string) => XpEventRow): Promise<number> {
  const { character, stmts } = await planEnsureCharacter(coreDb, env(today))
  const ev = make(character.id)
  if (await coreDb.get('SELECT id FROM xp_events WHERE id = ?', [ev.id])) { if (stmts.length) await run(stmts); return 0 }
  await run([...stmts, insertStmt('xp_events', { owner_id: currentUserId(), ...ev })])
  xpGained.emit(ev.amount)
  return ev.amount
}
/** 주간 점검을 끝내면 — 점검한 주(ISO 주)마다 한 번 */
export const grantReviewXp = (today: string, week: string) => grantOnce(today, (c) => reviewXpEvent(c, week, today))
/** 정리 "다 정리했어!" — 하루 한 번(이번 정리에서 1개 이상 처리했을 때만 부른다) */
export const grantTidyXp = (today: string) => grantOnce(today, (c) => tidyXpEvent(c, today))
