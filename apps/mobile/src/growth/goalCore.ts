// 23 모바일 성장 — DB 쓰기 문장을 만드는 순수 함수(읽기만 하고 실행할 문 목록을 돌려준다, 시험: goalCore.test.ts).
// 규칙은 데스크톱 apps/desktop/src/renderer/src/data/growth.ts의 setGoalProgress·addGoalRow·dismissDraft·assignCharacter와
// 한 줄씩 같다(+30 / 되돌림, 그 주 XP 3개, 2개 이상 모두 달성 +20, 5개 한도, 결정적 XP id).
// 주간 목표 쓰기는 2026-10-10에 공용 @sprout/schema/goalCore로 옮겼다(데스크톱도 같은 것을 부른다). 여기는 캐릭터·리포트만.
import { readTextJson, type ReportTextJson, type Species } from '@sprout/schema/growth'
import { insertStmt, updateStmt, type CoreDb, type Stmt } from '@sprout/schema/taskCore'
import type { CharacterRow } from './logic.ts'

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

// ── 주간 목표: 공용 @sprout/schema/goalCore(10 §4.6 — 데스크톱과 같은 문장·같은 XP id) ──
export {
  planAddGoal, planCreateGoal, planRemoveGoal, planRenameGoal, planReorderGoals, planRestoreGoal, planSetGoalLink, planSetGoalProgress, planSetGoalTarget, syncLinkedGoals
} from '@sprout/schema/goalCore'

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
