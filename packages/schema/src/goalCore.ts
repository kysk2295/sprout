// 10 §4 · §4.6 주간 목표(kpis) 쓰기 — 두 앱(데스크톱 data/growth.ts · 휴대폰 src/growth/goalCore.ts)이 같이 부르는 순수 함수.
// DB를 읽기만 하고 실행할 문 목록을 돌려준다(부르는 쪽이 한 트랜잭션으로 실행). XP id가 결정적이라 두 기기가 같이 써도 한 번.
// 규칙: +30 달성 즉시 / 같은 주에 내려가면 되돌림, 그 주 XP 3개(지금 XP를 가진 목표 수로 셈 — §9), 2개 이상 모두 달성 +20, 한 주 5개.
import { addDays } from './time.ts'
import { kpiEarnsXp, XP, xpEventId } from './growth.ts'
import { deleteStmt, insertStmt, updateStmt, type CoreDb, type Stmt } from './taskCore.ts'

export type GoalLinkKind = 'none' | 'tasks' | 'tag' | 'list'
export type GoalRow = {
  id: string; week_start: string; title: string; target: number; progress: number; status: string; source: string
  achieved_at: string | null; sort_order: number; link_kind?: string | null; link_id?: string | null
}
export const GOAL_COLS = 'id, week_start, title, target, progress, status, source, achieved_at, sort_order, link_kind, link_id'
export const GOAL_TITLE_MAX = 60
export const GOAL_TARGET_MAX = 99

export type GoalEnv = {
  /** 로컬 날짜 'YYYY-MM-DD'(XP 사건의 day) */
  today: string
  /** 새 행의 owner_id(없으면 LOCAL_OWNER — 서버는 어차피 토큰 사용자로 강제) */
  owner?: string
  now?: () => string
  uuid?: () => string
}
const nowOf = (env: GoalEnv) => (env.now ?? (() => new Date().toISOString()))()
const uuidOf = (env: GoalEnv) => (env.uuid ?? (() => crypto.randomUUID()))()
const ins = (env: GoalEnv, table: string, row: Record<string, unknown>) => insertStmt(table, env.owner ? { owner_id: env.owner, ...row } : row, nowOf(env))
const upd = (env: GoalEnv, table: string, id: string, patch: Record<string, unknown>) => updateStmt(table, id, patch, nowOf(env))

// ── 캐릭터(주 단위 보너스 XP id에 캐릭터 id가 필요하다) ──
/** 행이 여러 개면(두 기기가 따로 만든 경우 등) 배정된 캐릭터, 그다음 먼저 만든 것(두 앱 같은 순서) */
export const CHARACTER_SQL = 'SELECT id, name, species, type_code, assessed_at FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1'
export type GoalCharacter = { id: string; name: string | null; species: string | null; type_code: string | null; assessed_at: string | null }
export async function planEnsureCharacter(db: CoreDb, env: GoalEnv): Promise<{ character: GoalCharacter; stmts: Stmt[] }> {
  const row = await db.get<GoalCharacter>(CHARACTER_SQL)
  if (row) return { character: row, stmts: [] }
  const character: GoalCharacter = { id: uuidOf(env), name: null, species: null, type_code: null, assessed_at: null }
  return { character, stmts: [ins(env, 'characters', { ...character, answers_json: null })] }
}

// ── 글 ──
const key = (t: string) => t.replace(/\s+/g, '').toLowerCase()
export const sameGoalTitle = (a: string, b: string) => key(a) === key(b)
/** "운동 3번" → 목표 3 [임시](10 §4.1). 제목은 그대로 둔다 */
export function parseGoal(raw: string): { title: string; target: number } {
  const title = raw.trim().replace(/\s+/g, ' ')
  const m = title.match(/^(.*\S)\s*(\d{1,2})\s*(번|회|개)$/)
  // 끝이 아니어도 `N번/회/개`가 하나뿐이면 그 수(`운동 2번 하기` = 2 — 10 §4.6.1, 제목과 목표 수가 어긋나지 않게)
  const mid = m ? null : [...title.matchAll(/(^|[^\d])(\d{1,2})\s*(번|회|개)/g)]
  const n = m ? Number(m[2]) : mid && mid.length === 1 ? Number(mid[0][2]) : 1
  return { title, target: Math.max(1, Math.min(GOAL_TARGET_MAX, n)) }
}
export type GoalTitleError = 'empty' | 'long' | 'dup'
export const GOAL_TITLE_ERROR: Record<GoalTitleError, string> = {
  empty: '목표 이름을 적어 주세요',
  long: `${GOAL_TITLE_MAX}자까지 적을 수 있어요`,
  dup: '이미 있는 목표예요'
}
/** 10 §4.6 검사: 빈 제목 · 60자 · 같은 주 같은 제목(띄어쓰기·대소문자 무시). self = 이름 바꾸는 목표(자기 자신과는 겹쳐도 된다) */
export function checkGoalTitle(raw: string, others: Pick<GoalRow, 'id' | 'title'>[], selfId?: string): { ok: true; title: string } | { ok: false; error: GoalTitleError } {
  const title = raw.trim().replace(/\s+/g, ' ')
  if (!title) return { ok: false, error: 'empty' }
  if (title.length > GOAL_TITLE_MAX) return { ok: false, error: 'long' }
  if (others.some((g) => g.id !== selfId && sameGoalTitle(g.title, title))) return { ok: false, error: 'dup' }
  return { ok: true, title }
}
export const clampTarget = (n: number) => Math.max(1, Math.min(GOAL_TARGET_MAX, Math.round(n) || 1))
export const isLinked = (g: Pick<GoalRow, 'link_kind'>) => !!g.link_kind && g.link_kind !== 'none'

/** 고정 칸(49 §6.0) 막대: 각 목표 진행/목표 수(1까지)의 평균 0~1 */
export function goalsRatio(goals: Pick<GoalRow, 'progress' | 'target' | 'status'>[]): number {
  if (!goals.length) return 0
  return goals.reduce((s, g) => s + (g.status === 'achieved' ? 1 : Math.min(1, Math.max(0, g.progress) / Math.max(1, g.target))), 0) / goals.length
}

// ── XP 원장 ──
const netOf = async (db: CoreDb, ref: string) => (await db.get<{ n: number | null }>('SELECT sum(amount) n FROM xp_events WHERE ref_id = ?', [ref]))?.n ?? 0
const seqOf = async (db: CoreDb, ref: string) => (await db.get<{ n: number }>('SELECT count(*) n FROM xp_events WHERE ref_id = ?', [ref]))?.n ?? 0
const bonusId = (characterId: string, week: string, seq: number) => (seq ? `${xpEventId.kpiAll(characterId, week)}:${seq}` : xpEventId.kpiAll(characterId, week))

/** 진행을 바꾼다(10 §4.2). 목표에 닿으면 달성(+30, 그 주 XP 3개까지 + 2개 이상 모두 달성 +20), 내려가면 되돌린다. gained = 새로 받은 XP.
 *  patch = 같은 문에 함께 쓸 칸(목표 수 바꾸기 등) */
export async function planSetGoalProgress(db: CoreDb, env: GoalEnv, goal: GoalRow, progress: number, patch: Record<string, unknown> = {}): Promise<{ stmts: Stmt[]; gained: number }> {
  const p = Math.max(0, Math.min(goal.target, progress))
  const reached = p >= goal.target
  const stmts: Stmt[] = [upd(env, 'kpis', goal.id, { ...patch, progress: p, status: reached ? 'achieved' : 'active', achieved_at: reached ? (goal.achieved_at ?? nowOf(env)) : null })]
  const day = env.today
  const ensured = await planEnsureCharacter(db, env)
  stmts.unshift(...ensured.stmts)
  const characterId = ensured.character.id
  const bonusRef = `bonus:${goal.week_start}`
  let gained = 0
  if (reached && goal.status !== 'achieved') {
    // 지금 XP를 갖고 있는 목표 수(이 목표 제외)로 XP 대상인지 본다 — "달성 수"로 세면 취소·재달성 때 어긋난다(10 §9)
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
      stmts.push(ins(env, 'xp_events', { id: bonusId(characterId, goal.week_start, await seqOf(db, bonusRef)), kind: 'kpi_all', amount: XP.kpiAll, ref_id: bonusRef, day }))
      gained += XP.kpiAll
    }
  } else if (!reached && goal.status === 'achieved') {
    if ((await netOf(db, goal.id)) > 0) stmts.push(ins(env, 'xp_events', { id: xpEventId.kpi(goal.id, await seqOf(db, goal.id)), kind: 'kpi_revoke', amount: -XP.kpi, ref_id: goal.id, day }))
    if ((await netOf(db, bonusRef)) > 0) stmts.push(ins(env, 'xp_events', { id: bonusId(characterId, goal.week_start, await seqOf(db, bonusRef)), kind: 'kpi_all', amount: -XP.kpiAll, ref_id: bonusRef, day }))
  }
  return { stmts, gained }
}

// ── 만들기 ──
/** 새 목표는 맨 아래: 지금 시각(ms)과 그 주 마지막 순서 + 1 중 큰 것 — 같은 ms에 둘을 만들어도 순서가 갈린다 */
const lastOrder = (env: GoalEnv, rows: { sort_order: number | null }[]) => Math.max(Date.parse(nowOf(env)), ...rows.map((r) => (r.sort_order ?? 0) + 1))
export type NewGoal = { title: string; target?: number; source?: 'manual' | 'ai'; link?: { kind: GoalLinkKind; id?: string | null } }
/** 검사하고 한 줄 넣는다(10 §4.6). 5개가 차면 'full', 제목 검사에 걸리면 그 이유 */
export async function planCreateGoal(db: CoreDb, env: GoalEnv, week: string, input: NewGoal): Promise<{ stmts: Stmt[]; id: string } | { error: GoalTitleError | 'full' }> {
  const others = await db.getAll<{ id: string; title: string; sort_order: number | null }>('SELECT id, title, sort_order FROM kpis WHERE week_start = ?', [week])
  if (others.length >= XP.goalsPerWeek) return { error: 'full' }
  const c = checkGoalTitle(input.title, others)
  if (!c.ok) return { error: c.error }
  const id = uuidOf(env)
  const link = input.link && input.link.kind !== 'none' ? input.link : null
  const stmts = [ins(env, 'kpis', {
    id, week_start: week, title: c.title, target: clampTarget(input.target ?? 1), progress: 0, link_kind: link?.kind ?? 'none', link_id: link?.id ?? null,
    status: 'active', source: input.source ?? 'manual', achieved_at: null, sort_order: lastOrder(env, others)
  })]
  return { stmts, id }
}
/** 검사 없이 한 줄(AI 초안 +, 리포트 "이번 주로 넘기기" — 예전 동작 그대로). 5개가 차면 'full' */
export async function planAddGoal(db: CoreDb, env: GoalEnv, week: string, title: string, target: number, source: 'manual' | 'ai'): Promise<Stmt[] | 'full'> {
  const rows = await db.getAll<{ sort_order: number | null }>('SELECT sort_order FROM kpis WHERE week_start = ?', [week])
  if (rows.length >= XP.goalsPerWeek) return 'full'
  return [ins(env, 'kpis', { id: uuidOf(env), week_start: week, title, target, progress: 0, link_kind: 'none', link_id: null, status: 'active', source, achieved_at: null, sort_order: lastOrder(env, rows) })]
}

// ── 고치기 ──
export async function planRenameGoal(db: CoreDb, env: GoalEnv, goal: Pick<GoalRow, 'id' | 'week_start'>, raw: string): Promise<Stmt[] | { error: GoalTitleError }> {
  const others = await db.getAll<{ id: string; title: string }>('SELECT id, title FROM kpis WHERE week_start = ?', [goal.week_start])
  const c = checkGoalTitle(raw, others, goal.id)
  if (!c.ok) return { error: c.error }
  return [upd(env, 'kpis', goal.id, { title: c.title })]
}
/** 10 §4.6: 제목 속 `N번`·`N회`·`N개`의 N이 지난 목표 수와 같으면 새 목표 수로(`운동 2번 하기` 2 → 1 = `운동 1번 하기`). 아니면 null */
export function retitleForTarget(title: string, prev: number, next: number): string | null {
  if (prev === next) return null
  const re = /(^|[^\d])(\d{1,2})(\s*)(번|회|개)/g
  const hits = [...title.matchAll(re)].filter((m) => Number(m[2]) === prev)
  if (hits.length !== 1) return null // 없거나 여럿이면(어느 것인지 모름) 그대로
  const m = hits[0], at = m.index! + m[1].length
  return title.slice(0, at) + String(next) + title.slice(at + m[2].length)
}
/** 목표 수를 바꾼다(1~99). 진행이 새 목표 수에 닿으면 그 순간 달성, 이룬 목표의 수를 올려 진행보다 커지면 달성 풀림(같은 주 XP 되돌림).
 *  제목의 숫자가 지난 목표 수와 같으면 같이 바꾼다(retitleForTarget — 같은 주 같은 제목이 생기면 제목은 그대로) */
export async function planSetGoalTarget(db: CoreDb, env: GoalEnv, goal: GoalRow, target: number): Promise<{ stmts: Stmt[]; gained: number }> {
  const t = clampTarget(target)
  const counted = isLinked(goal) ? await linkedCount(db, goal) : goal.progress
  const patch: Record<string, unknown> = { target: t }
  const nt = retitleForTarget(goal.title, goal.target, t)
  if (nt) {
    const others = await db.getAll<{ id: string; title: string }>('SELECT id, title FROM kpis WHERE week_start = ?', [goal.week_start])
    const c = checkGoalTitle(nt, others, goal.id)
    if (c.ok) patch.title = c.title
  }
  return planSetGoalProgress(db, env, { ...goal, target: t }, counted, patch)
}
/** 세는 방법(10 §4.6 연결). 연결하면 센 수로 진행을 맞추고, 직접 체크로 되돌리면 지금 진행을 그대로 둔다 */
export async function planSetGoalLink(db: CoreDb, env: GoalEnv, goal: GoalRow, link: { kind: GoalLinkKind; id?: string | null }): Promise<{ stmts: Stmt[]; gained: number }> {
  const patch = { link_kind: link.kind, link_id: link.kind === 'tag' || link.kind === 'list' ? (link.id ?? null) : null }
  if (link.kind === 'none') return { stmts: [upd(env, 'kpis', goal.id, patch)], gained: 0 }
  const next = { ...goal, ...patch }
  return planSetGoalProgress(db, env, next, await linkedCount(db, next), patch)
}
/** 순서(그 주 안 1, 2, 3…). ids = 화면에 보이는 새 순서 */
export const planReorderGoals = (env: GoalEnv, ids: string[]): Stmt[] => ids.map((id, i) => upd(env, 'kpis', id, { sort_order: i + 1 }))
/** 끈 행을 before 앞(없으면 맨 아래)에 넣은 새 순서 */
export function moveGoal(ids: string[], id: string, before: string | null): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = before ? rest.indexOf(before) : -1
  rest.splice(at < 0 ? rest.length : at, 0, id)
  return rest
}

// ── 지우기 · 되돌리기 ──
/** 목표 삭제. 그 목표로 받은 XP는 되돌린다 — 안 그러면 "적고·이루고·지우기"로 주 3개 상한을 넘겨 XP를 벌 수 있다(10 §9).
 *  모두 달성 보너스는 남은 목표가 2개 미만이거나 다 이룬 상태가 아니게 되면 되돌린다. row = 되돌리기에 쓸 지운 행 */
export async function planRemoveGoal(db: CoreDb, env: GoalEnv, id: string): Promise<{ stmts: Stmt[]; row: GoalRow | null }> {
  const row = await db.get<GoalRow>(`SELECT ${GOAL_COLS} FROM kpis WHERE id = ?`, [id])
  const stmts: Stmt[] = [deleteStmt('kpis', id)]
  if (!row) return { stmts, row }
  const day = env.today
  if ((await netOf(db, id)) > 0) stmts.push(ins(env, 'xp_events', { id: xpEventId.kpi(id, await seqOf(db, id)), kind: 'kpi_revoke', amount: -XP.kpi, ref_id: id, day }))
  const bonusRef = `bonus:${row.week_start}`
  if ((await netOf(db, bonusRef)) > 0) {
    const rest = await db.getAll<{ status: string }>('SELECT status FROM kpis WHERE week_start = ? AND id != ?', [row.week_start, id])
    if (rest.length < 2 || rest.some((g) => g.status !== 'achieved')) {
      const ensured = await planEnsureCharacter(db, env)
      stmts.unshift(...ensured.stmts)
      stmts.push(ins(env, 'xp_events', { id: bonusId(ensured.character.id, row.week_start, await seqOf(db, bonusRef)), kind: 'kpi_all', amount: -XP.kpiAll, ref_id: bonusRef, day }))
    }
  }
  return { stmts, row }
}
/** 되돌리기 1단계: 같은 id·제목·목표 수·세는 방법·순서로 다시 넣는다(아직 못 이룬 상태). 2단계 = planSetGoalProgress(row, row.progress)로 다시 판정 */
export function planRestoreGoal(env: GoalEnv, row: GoalRow): { stmts: Stmt[]; goal: GoalRow } {
  const goal: GoalRow = { ...row, status: 'active', achieved_at: null }
  const { id, week_start, title, target, source, sort_order, link_kind, link_id } = row
  return { goal, stmts: [ins(env, 'kpis', { id, week_start, title, target, progress: 0, link_kind: link_kind ?? 'none', link_id: link_id ?? null, status: 'active', source, achieved_at: null, sort_order })] }
}

// ── 연결 진행(10 §4.6) ──
/** 그 목표 주(로컬 월요일 0시 ~ 다음 월요일 0시)에 끝낸 할 일 범위 — completed_at은 UTC ISO */
export const weekBounds = (week: string): [string, string] => [new Date(`${week}T00:00`).toISOString(), new Date(`${addDays(week, 7)}T00:00`).toISOString()]
/** 연결 목표가 센 수(목표 수로 자르지 않은 값) */
export async function linkedCount(db: CoreDb, goal: Pick<GoalRow, 'week_start' | 'link_kind' | 'link_id'>): Promise<number> {
  const [from, to] = weekBounds(goal.week_start)
  const base = 'SELECT count(*) n FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ?'
  if (goal.link_kind === 'tasks') return (await db.get<{ n: number }>(base, [from, to]))?.n ?? 0
  if (!goal.link_id) return 0
  if (goal.link_kind === 'list') return (await db.get<{ n: number }>(`${base} AND list_id = ?`, [from, to, goal.link_id]))?.n ?? 0
  if (goal.link_kind === 'tag') {
    return (await db.get<{ n: number }>(`${base} AND id IN (SELECT task_id FROM task_tags WHERE tag_id = ? AND COALESCE(state, 'accepted') = 'accepted')`, [from, to, goal.link_id]))?.n ?? 0
  }
  return 0
}
/** 그 주 연결 목표 중 센 수가 진행과 다른 것을 하나씩 맞춘다(한 목표씩 실행해야 다음 판정이 앞 결과를 본다). 받은 XP 합 */
export async function syncLinkedGoals(db: CoreDb, env: GoalEnv, week: string, run: (stmts: Stmt[]) => Promise<unknown>): Promise<number> {
  const goals = await db.getAll<GoalRow>(`SELECT ${GOAL_COLS} FROM kpis WHERE week_start = ? AND link_kind IS NOT NULL AND link_kind != 'none' AND status != 'missed' ORDER BY sort_order`, [week])
  let gained = 0
  for (const g of goals) {
    const n = Math.min(g.target, await linkedCount(db, g))
    if (n === g.progress && (n >= g.target) === (g.status === 'achieved')) continue
    const fresh = await db.get<GoalRow>(`SELECT ${GOAL_COLS} FROM kpis WHERE id = ?`, [g.id])
    if (!fresh) continue
    const r = await planSetGoalProgress(db, env, fresh, n)
    await run(r.stmts)
    gained += r.gained
  }
  return gained
}
/** 연결 꼬리표 이름(태그·리스트 이름을 넘긴다. 지워져 없으면 '연결 끊김') */
export function linkLabel(g: Pick<GoalRow, 'link_kind' | 'link_id'>, names: { tags: Map<string, string>; lists: Map<string, string> }): string {
  if (g.link_kind === 'tasks') return '끝낸 할 일'
  if (g.link_kind === 'tag') { const n = g.link_id ? names.tags.get(g.link_id) : undefined; return n ? `#${n}` : '연결 끊김' }
  if (g.link_kind === 'list') { const n = g.link_id ? names.lists.get(g.link_id) : undefined; return n ?? '연결 끊김' }
  return ''
}
/** 빈 상태 예시 칩(10 §4.6) */
export const GOAL_TEMPLATES: NewGoal[] = [
  { title: '할 일 10개 끝내기', target: 10, link: { kind: 'tasks' } },
  { title: '운동 3번', target: 3 },
  { title: '책 한 권 읽기', target: 1 }
]
