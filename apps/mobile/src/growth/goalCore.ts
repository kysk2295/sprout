// 23 모바일 성장 — DB 쓰기 문장을 만드는 순수 함수(읽기만 하고 실행할 문 목록을 돌려준다, 시험: goalCore.test.ts).
// 규칙은 데스크톱 apps/desktop/src/renderer/src/data/growth.ts의 setGoalProgress·addGoalRow·dismissDraft·assignCharacter와
// 한 줄씩 같다(+30 / 되돌림, 그 주 XP 3개, 2개 이상 모두 달성 +20, 5개 한도, 결정적 XP id).
// TODO(공용화): 이 파일 전체를 packages/schema(예: @sprout/schema/goalCore)로 옮기고 데스크톱 data/growth.ts도 이것을 부르게 한다.
//   지금은 packages/·apps/desktop/을 고치지 않는 범위라 모바일에 둔다.
import { readTextJson, XP, xpEventId, kpiEarnsXp, type ReportTextJson, type Species } from '@sprout/schema/growth'
import { insertStmt, updateStmt, type CoreDb, type Stmt } from '@sprout/schema/taskCore'
import type { CharacterRow, GoalRow } from './logic.ts'

export type GrowthEnv = {
  /** 로컬 날짜 'YYYY-MM-DD'(XP 사건의 day) */
  today: string
  /** 새 행의 owner_id(서버는 어차피 토큰 사용자로 강제) */
  owner: string
  now?: () => string
  uuid?: () => string
}
const nowOf = (env: GrowthEnv) => (env.now ?? (() => new Date().toISOString()))()
const uuidOf = (env: GrowthEnv) => (env.uuid ?? (() => crypto.randomUUID()))()
const ins = (env: GrowthEnv, table: string, row: Record<string, unknown>) => insertStmt(table, { owner_id: env.owner, ...row }, nowOf(env))
const upd = (env: GrowthEnv, table: string, id: string, patch: Record<string, unknown>) => updateStmt(table, id, patch, nowOf(env))

// ── 캐릭터 ──
/** 행이 여러 개면(두 기기가 따로 만든 경우 등) 배정된 캐릭터, 그다음 먼저 만든 것(데스크톱과 같은 순서) */
export const CHARACTER_SQL = 'SELECT id, name, species, type_code, assessed_at FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'
/** 캐릭터 행이 없으면 만드는 문(주 단위 XP id에 캐릭터 id가 필요하다) */
export async function planEnsureCharacter(db: CoreDb, env: GrowthEnv): Promise<{ character: CharacterRow; stmts: Stmt[] }> {
  const row = await db.get<CharacterRow>(CHARACTER_SQL)
  if (row) return { character: row, stmts: [] }
  const character: CharacterRow = { id: uuidOf(env), name: null, species: null, type_code: null, assessed_at: null }
  return { character, stmts: [ins(env, 'characters', { ...character, answers_json: null })] }
}
/** 조사 결과 쓰기(데스크톱 assignCharacter와 같은 칸). 다시 조사해도 레벨·XP는 원장이라 그대로 */
export async function planAssignCharacter(db: CoreDb, env: GrowthEnv, a: { species: Species; typeCode: string; answers: Record<string, string>; name: string }): Promise<Stmt[]> {
  const { character, stmts } = await planEnsureCharacter(db, env)
  return [...stmts, upd(env, 'characters', character.id, { species: a.species, type_code: a.typeCode, answers_json: JSON.stringify(a.answers), assessed_at: nowOf(env), name: a.name })]
}
export async function planRename(db: CoreDb, env: GrowthEnv, name: string): Promise<Stmt[]> {
  const { character, stmts } = await planEnsureCharacter(db, env)
  return [...stmts, upd(env, 'characters', character.id, { name })]
}

// ── 주간 목표 ──
const netOf = async (db: CoreDb, ref: string) => (await db.get<{ n: number | null }>('SELECT sum(amount) n FROM xp_events WHERE ref_id = ?', [ref]))?.n ?? 0
const seqOf = async (db: CoreDb, ref: string) => (await db.get<{ n: number }>('SELECT count(*) n FROM xp_events WHERE ref_id = ?', [ref]))?.n ?? 0

/** 진행을 바꾼다(10 §4.2). 목표에 닿으면 달성(+30, 그 주 XP 3개까지 + 2개 이상 모두 달성 +20), 내려가면 되돌린다. gained = 새로 받은 XP */
export async function planSetGoalProgress(db: CoreDb, env: GrowthEnv, goal: GoalRow, progress: number): Promise<{ stmts: Stmt[]; gained: number }> {
  const p = Math.max(0, Math.min(goal.target, progress))
  const reached = p >= goal.target
  const stmts: Stmt[] = [upd(env, 'kpis', goal.id, { progress: p, status: reached ? 'achieved' : 'active', achieved_at: reached ? (goal.achieved_at ?? nowOf(env)) : null })]
  const day = env.today
  const ensured = await planEnsureCharacter(db, env)
  stmts.unshift(...ensured.stmts)
  const characterId = ensured.character.id
  const bonusRef = `bonus:${goal.week_start}`
  let gained = 0
  if (reached && goal.status !== 'achieved') {
    // 지금 XP를 갖고 있는 목표 수(이 목표 제외)로 XP 대상인지 본다(데스크톱 주석 참고 — "달성 수"로 세면 취소·재달성 때 어긋난다)
    const before = (await db.get<{ n: number }>(
      'SELECT count(*) n FROM (SELECT k.id FROM kpis k JOIN xp_events x ON x.ref_id = k.id WHERE k.week_start = ? AND k.id != ? GROUP BY k.id HAVING sum(x.amount) > 0)',
      [goal.week_start, goal.id]
    ))?.n ?? 0
    if (kpiEarnsXp(before) && (await netOf(db, goal.id)) <= 0) {
      stmts.push(ins(env, 'xp_events', { id: xpEventId.kpi(goal.id, await seqOf(db, goal.id)), kind: 'kpi', amount: XP.kpi, ref_id: goal.id, day }))
      gained += XP.kpi
    }
    const all = await db.getAll<{ id: string; status: string }>('SELECT id, status FROM kpis WHERE week_start = ?', [goal.week_start])
    const allDone = all.length >= 2 && all.every((g) => g.id === goal.id || g.status === 'achieved')
    if (allDone && (await netOf(db, bonusRef)) <= 0) {
      const seq = await seqOf(db, bonusRef)
      stmts.push(ins(env, 'xp_events', { id: seq ? `${xpEventId.kpiAll(characterId, goal.week_start)}:${seq}` : xpEventId.kpiAll(characterId, goal.week_start), kind: 'kpi_all', amount: XP.kpiAll, ref_id: bonusRef, day }))
      gained += XP.kpiAll
    }
  } else if (!reached && goal.status === 'achieved') {
    if ((await netOf(db, goal.id)) > 0) stmts.push(ins(env, 'xp_events', { id: xpEventId.kpi(goal.id, await seqOf(db, goal.id)), kind: 'kpi_revoke', amount: -XP.kpi, ref_id: goal.id, day }))
    if ((await netOf(db, bonusRef)) > 0) stmts.push(ins(env, 'xp_events', { id: `${xpEventId.kpiAll(characterId, goal.week_start)}:${await seqOf(db, bonusRef)}`, kind: 'kpi_all', amount: -XP.kpiAll, ref_id: bonusRef, day }))
  }
  return { stmts, gained }
}

/** 목표 한 줄 추가(AI 초안 +, 리포트 "이번 주로 넘기기"). 그 주 5개가 차면 'full' */
export async function planAddGoal(db: CoreDb, env: GrowthEnv, week: string, title: string, target: number, source: 'manual' | 'ai'): Promise<Stmt[] | 'full'> {
  const n = (await db.get<{ n: number }>('SELECT count(*) n FROM kpis WHERE week_start = ?', [week]))?.n ?? 0
  if (n >= XP.goalsPerWeek) return 'full'
  return [ins(env, 'kpis', { id: uuidOf(env), week_start: week, title, target, progress: 0, link_kind: 'none', link_id: null, status: 'active', source, achieved_at: null, sort_order: Date.parse(nowOf(env)) })]
}

// ── 주간 리포트 ──
const reportOf = (db: CoreDb, week: string) =>
  db.get<{ id: string; text_json: string | null }>('SELECT id, text_json FROM weekly_reports WHERE week_start = ? ORDER BY created_at, id LIMIT 1', [week])
async function planPatchText(db: CoreDb, env: GrowthEnv, week: string, patch: (t: ReportTextJson) => ReportTextJson): Promise<Stmt[]> {
  const row = await reportOf(db, week)
  if (!row) return []
  const t = readTextJson(row.text_json)
  return [upd(env, 'weekly_reports', row.id, { text_json: JSON.stringify({ ...t, ...patch(t) }) })]
}
/** 초안 줄 숨기기(×) = 지난주 리포트 text_json.dismissed에 제목 추가(데스크톱 dismissDraft와 같음) */
export const planDismissDraft = (db: CoreDb, env: GrowthEnv, reportWeek: string, title: string) =>
  planPatchText(db, env, reportWeek, (t) => ({ dismissed: [...new Set([...(t.dismissed ?? []), title])] }))
/** 리포트를 열면 본 것으로 */
export const planMarkSeen = (env: GrowthEnv, reportId: string): Stmt[] => [upd(env, 'weekly_reports', reportId, { seen_at: nowOf(env) })]
