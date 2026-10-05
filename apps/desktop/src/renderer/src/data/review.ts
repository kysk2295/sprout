// 31 §12 점검 — 주간 점검 3단계(① 이번 주 돌아보기 → ② 밀린 일 정하기 → ③ 다음 주 고르기).
// 계산은 공용 @sprout/schema/review(모바일과 같은 코드, 시험 tests/review.test.ts), 여기는 DB 효과. 진행 기억은 기기 localStorage `sprout.map.review`.
// 밀린 일 처리는 XP 없음(19 §3.3과 같은 규칙 — 끝냄은 planCompleteNoXp). 목표는 성장 10 §4 주간 목표(kpis) 그대로, addGoal로 만든다.
import { descendantsOf, moveSpanToDate, planCompleteNoXp } from '@sprout/schema/taskCore'
import type { Decision, SnapRow, Suggestion, Created, LinkRow } from '@sprout/schema/review'
import { getDb, type Stmt } from './db'
import { insert, now, remove, run, update } from './mutations'
import { addGoal, removeGoal } from './growth'
import { moveGoalLinkStmts } from './mapGoals'
export * from '@sprout/schema/review'

// ── DB ──
const SNAP = ['status', 'due_at', 'start_at', 'is_all_day', 'repeat_rule', 'repeat_from', 'completed_at', 'deleted_at'] as const
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')

/** 밀린 일 하나를 정한다(XP 없음). 바꾸기 전 값(하위 포함)을 돌려준다 — 진행 기억에 남겨 되돌린다 */
export async function applyDecision(id: string, d: Decision, planWeek: string, today: string): Promise<SnapRow[]> {
  const db = await getDb()
  const at = now()
  const touched = d === 'done' || d === 'trash' ? await descendantsOf(db, [id]) : [id]
  const snap = await db.getAll<SnapRow>(`SELECT id, ${SNAP.join(', ')} FROM tasks WHERE id IN (${marks(touched.length)})`, touched)
  let stmts: Stmt[] = []
  if (d === 'next') {
    const r = await db.get<{ start_at: string | null; due_at: string | null }>('SELECT start_at, due_at FROM tasks WHERE id = ?', [id])
    if (r) stmts = [update('tasks', id, moveSpanToDate(r, planWeek))] // 시각 유지, 다음 주 월요일
  } else if (d === 'someday') stmts = [update('tasks', id, { start_at: null, due_at: null, is_all_day: 1, repeat_rule: null, repeat_from: null })]
  else if (d === 'trash') stmts = touched.map((x) => update('tasks', x, { deleted_at: at }))
  else stmts = (await planCompleteNoXp(db, [id], { today, now: () => at })).stmts
  await run(...stmts)
  return snap
}
/** 정하기 전 값으로 */
export const restoreSnap = (rows: SnapRow[]) => run(...rows.map(({ id, ...patch }) => update('tasks', id, patch)))

/** ③ 끝내기: 고른 것마다 고를 주 목표를 만든다(addGoal — 주 5개 상한 그대로). 할 일이 딸린 제안은 목표 선으로 잇고 횟수 = 할 일 수 */
export async function createGoals(planWeek: string, picks: Suggestion[]): Promise<Created[]> {
  const db = await getDb()
  const out: Created[] = []
  for (const s of picks) {
    if ((await addGoal(planWeek, s.title)) === 'full') break
    const row = await db.get<{ id: string; target: number }>('SELECT id, target FROM kpis WHERE week_start = ? AND title = ? ORDER BY created_at DESC, sort_order DESC LIMIT 1', [planWeek, s.title])
    if (!row) continue
    const stmts: Stmt[] = []
    const target = Math.max(1, s.target)
    if (row.target !== target && (s.kind !== 'custom' || s.taskIds.length)) stmts.push(update('kpis', row.id, { target }))
    const removed: LinkRow[] = []
    for (const taskId of s.taskIds) {
      const links = await db.getAll<LinkRow>("SELECT id, kind, from_id, to_id, state FROM map_links WHERE kind = 'goal' AND to_id = ?", [taskId])
      const r = moveGoalLinkStmts(links, taskId, row.id)
      stmts.push(...r.stmts)
      removed.push(...(r.removed as LinkRow[]))
    }
    if (stmts.length) await run(...stmts)
    out.push({ goalId: row.id, title: s.title, removed })
  }
  return out
}
/** 끝내기 되돌리기: 만든 목표와 그 선을 지우고, 옮기면서 끊은 원래 목표 선을 되살린다 */
export async function undoGoals(created: Created[]) {
  for (const c of created) {
    const db = await getDb()
    const mine = await db.getAll<{ id: string }>("SELECT id FROM map_links WHERE kind = 'goal' AND from_id = ?", [c.goalId])
    await run(...mine.map((l) => remove('map_links', l.id)),
      ...c.removed.map((l) => insert('map_links', { id: l.id, kind: 'goal', from_type: 'kpi', from_id: l.from_id, to_id: l.to_id, source: 'user', state: 'accepted' })))
    await removeGoal(c.goalId)
  }
}
