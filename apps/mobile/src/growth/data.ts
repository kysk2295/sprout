// 23 모바일 성장 — 읽기(useQuery)와 쓰기(goalCore 문장 → run). 계산은 logic.ts, 문장 만들기는 goalCore.ts.
// 휴대폰은 AI를 부르지 않고 주간 마감도 하지 않는다(23 M-G2) — 데스크톱이 만든 리포트·초안을 동기화로 받아 읽기만 한다.
import { useLiveQuery } from '../data/rows'
import { progressFromEvents, readTextJson, reviewXpEvent, tidyXpEvent, type XpEventRow } from '@sprout/schema/growth'
import { insertStmt } from '@sprout/schema/taskCore'
import { addDays } from '@sprout/schema/time'
import { useMemo } from 'react'
import { currentUserId } from '../data/auth'
import { coreDb, run } from '../data/db'
import { xpGained } from '../data/events'
import { CHARACTER_SQL, planAddGoal, planEnsureCharacter, planAssignCharacter, planDismissDraft, planMarkSeen, planRename, planSetGoalProgress, type GrowthEnv } from './goalCore'
import {
  idleDaysOf, streakOf, taskXpOfDay, uniqueWeeks, visibleDrafts, weekStartOf,
  type CharacterRow, type GoalRow, type ReportRow, type StageStats, type XpRow
} from './logic'

const env = (today: string): GrowthEnv => ({ today, owner: currentUserId() })
const GOAL_COLS = 'id, week_start, title, target, progress, status, source, achieved_at, sort_order'
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
export async function dismissDraft(today: string, reportWeek: string, title: string) {
  await run(await planDismissDraft(coreDb, env(today), reportWeek, title))
}
export const markReportSeen = (today: string, id: string) => run(planMarkSeen(env(today), id))
export async function assignCharacter(today: string, a: Parameters<typeof planAssignCharacter>[2]) {
  await run(await planAssignCharacter(coreDb, env(today), a))
}
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
