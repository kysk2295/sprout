import { useMemo } from 'react'
import { addDays } from '@sprout/schema/time'
import { canGrantTaskXp, kpiEarnsXp, progressFromEvents, XP, xpEventId, type Species } from '@sprout/schema/growth'
import { getDb } from './db'
import { insert, run, update, uuid } from './mutations'
import type { Stmt } from './db'
import { useQuery } from './useQuery'
import { dayKey } from '../lib/dates'
import { weekStart } from '../lib/calendar'

// 10 성장 — XP 원장·캐릭터·주간 목표. 레벨은 원장에서 계산한다.
export type XpRow = { id: string; kind: string; amount: number; ref_id: string; day: string; created_at: string }
export type CharacterRow = { id: string; name: string | null; species: Species | null; type_code: string | null; assessed_at: string | null }
export type GoalRow = { id: string; week_start: string; title: string; target: number; progress: number; status: string; source: string; achieved_at: string | null; sort_order: number }

export const thisWeek = () => weekStart(dayKey())
export const nextWeek = () => addDays(thisWeek(), 7)

/** XP가 들어오면 레일·사이드바가 "+1"을 띄운다 */
const announce = (amount: number) => { if (amount) window.dispatchEvent(new CustomEvent('sprout:xp', { detail: amount })) }

// ── 캐릭터 ──
// 행이 여러 개면(두 기기가 따로 만든 경우 등) 배정된 캐릭터, 그다음 먼저 만든 것을 쓴다
const CHARACTER_SQL = 'SELECT id, name, species, type_code, assessed_at FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'
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
/** 완료한 할 일마다 +1, 하루 10까지. 같은 할 일은 하루 한 번 */
export async function grantTaskXp(taskIds: string[]) {
  const db = await getDb()
  const day = dayKey()
  const today = await db.getAll<{ id: string; kind: string; amount: number }>('SELECT id, kind, amount FROM xp_events WHERE day = ?', [day])
  const stmts: Stmt[] = []
  for (const id of taskIds) {
    const eid = xpEventId.task(id, day)
    if (today.some((e) => e.id === eid)) continue
    if (!canGrantTaskXp(today)) break
    stmts.push(insert('xp_events', { id: eid, kind: 'task', amount: XP.task, ref_id: id, day }))
    today.push({ id: eid, kind: 'task', amount: XP.task })
  }
  await run(...stmts)
  announce(stmts.length * XP.task)
}
/** 같은 날 완료를 취소하면 그날 받은 XP를 되돌린다(다음 날 취소는 되돌리지 않는다) */
export async function revokeTaskXp(taskIds: string[]) {
  const db = await getDb()
  const day = dayKey()
  const stmts: Stmt[] = []
  for (const id of taskIds) {
    const got = await db.get('SELECT 1 FROM xp_events WHERE id = ?', [xpEventId.task(id, day)])
    const rid = xpEventId.taskRevoke(id, day)
    if (got && !(await db.get('SELECT 1 FROM xp_events WHERE id = ?', [rid]))) stmts.push(insert('xp_events', { id: rid, kind: 'task_revoke', amount: -XP.task, ref_id: id, day }))
  }
  await run(...stmts)
}

// ── 주간 목표 (10 §4) ──
/** "운동 3번" → 목표 3 [임시] */
export function parseGoal(raw: string): { title: string; target: number } {
  const m = raw.trim().match(/^(.*\S)\s*(\d{1,2})\s*(번|회)$/)
  return m ? { title: raw.trim(), target: Math.max(1, Math.min(99, Number(m[2]))) } : { title: raw.trim(), target: 1 }
}
export async function addGoal(week: string, raw: string): Promise<'ok' | 'full'> {
  const db = await getDb()
  const n = (await db.get<{ n: number }>('SELECT count(*) n FROM kpis WHERE week_start = ?', [week]))?.n ?? 0
  if (n >= XP.goalsPerWeek) return 'full'
  const { title, target } = parseGoal(raw)
  await run(insert('kpis', { id: uuid(), week_start: week, title, target, progress: 0, link_kind: 'none', link_id: null, status: 'active', source: 'manual', achieved_at: null, sort_order: Date.now() }))
  return 'ok'
}
export const removeGoal = (id: string) => run({ sql: 'DELETE FROM kpis WHERE id = ?', params: [id] })

/** 그 목표로 받은 XP 합계(지급·되돌림) */
const netOf = async (ref: string) => (await (await getDb()).get<{ n: number | null }>('SELECT sum(amount) n FROM xp_events WHERE ref_id = ?', [ref]))?.n ?? 0
const seqOf = async (ref: string) => (await (await getDb()).get<{ n: number }>('SELECT count(*) n FROM xp_events WHERE ref_id = ?', [ref]))?.n ?? 0

/** 진행을 바꾼다. 목표에 닿으면 달성(+30, 그 주 3개까지 + 모두 달성 보너스), 내려가면 되돌린다 */
export async function setGoalProgress(goal: GoalRow, progress: number) {
  const db = await getDb()
  const p = Math.max(0, Math.min(goal.target, progress))
  const reached = p >= goal.target
  const stmts: Stmt[] = [update('kpis', goal.id, { progress: p, status: reached ? 'achieved' : 'active', achieved_at: reached ? (goal.achieved_at ?? new Date().toISOString()) : null })]
  const day = dayKey()
  const character = await ensureCharacter()
  const bonusRef = `bonus:${goal.week_start}`
  let gained = 0
  if (reached && goal.status !== 'achieved') {
    // 이번 주에 먼저 이룬 목표 수(이 목표 제외)로 XP 대상인지 본다
    const before = (await db.get<{ n: number }>("SELECT count(*) n FROM kpis WHERE week_start = ? AND status = 'achieved' AND id != ?", [goal.week_start, goal.id]))?.n ?? 0
    if (kpiEarnsXp(before) && (await netOf(goal.id)) <= 0) {
      stmts.push(insert('xp_events', { id: xpEventId.kpi(goal.id, await seqOf(goal.id)), kind: 'kpi', amount: XP.kpi, ref_id: goal.id, day }))
      gained += XP.kpi
    }
    const all = await db.getAll<{ id: string; status: string }>('SELECT id, status FROM kpis WHERE week_start = ?', [goal.week_start])
    const allDone = all.length >= 2 && all.every((g) => g.id === goal.id || g.status === 'achieved')
    if (allDone && (await netOf(bonusRef)) <= 0) {
      const seq = await seqOf(bonusRef)
      stmts.push(insert('xp_events', { id: seq ? `${xpEventId.kpiAll(character.id, goal.week_start)}:${seq}` : xpEventId.kpiAll(character.id, goal.week_start), kind: 'kpi_all', amount: XP.kpiAll, ref_id: bonusRef, day }))
      gained += XP.kpiAll
    }
  } else if (!reached && goal.status === 'achieved') {
    if ((await netOf(goal.id)) > 0) stmts.push(insert('xp_events', { id: xpEventId.kpi(goal.id, await seqOf(goal.id)), kind: 'kpi_revoke', amount: -XP.kpi, ref_id: goal.id, day }))
    if ((await netOf(bonusRef)) > 0) stmts.push(insert('xp_events', { id: `${xpEventId.kpiAll(character.id, goal.week_start)}:${await seqOf(bonusRef)}`, kind: 'kpi_all', amount: -XP.kpiAll, ref_id: bonusRef, day }))
  }
  await run(...stmts)
  announce(gained)
}

/** 다음 주로 넘기기(10 §4.5) */
export const carryOver = (goal: GoalRow) => run(update('kpis', goal.id, { week_start: addDays(goal.week_start, 7), status: 'active', progress: 0, achieved_at: null }))

// ── 화면에서 쓰는 상태 ──
export function useGrowth() {
  const raw = useQuery<XpRow>('SELECT id, kind, amount, ref_id, day, created_at FROM xp_events ORDER BY created_at')
  const events = useMemo(() => raw ?? [], [raw])
  const character = useQuery<CharacterRow>(CHARACTER_SQL)?.[0]
  const progress = useMemo(() => progressFromEvents(events), [events])
  return { events, character, progress, loaded: raw !== undefined }
}
