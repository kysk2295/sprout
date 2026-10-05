// 29 §9.3 주간 점검(성장 탭) — DB 효과. 계산은 공용 @sprout/schema/review(데스크톱과 같은 코드). 밀린 일 정하기는 XP 없음(19 §3.3).
import { descendantsOf, deleteStmt, moveSpanToDate, planCompleteNoXp, type Stmt } from '@sprout/schema/taskCore'
import { freshProgress, REVIEW_KEY, type Created, type Decision, type LinkRow, type ReviewProgress, type SnapRow, type Suggestion } from '@sprout/schema/review'
import { coreDb, db, run } from '../../data/db'
import { insert, update } from '../../data/tasks'
import { addGoal } from '../../growth/data'
import { kvGet, kvSet } from './kv'

const SNAP = ['status', 'due_at', 'start_at', 'is_all_day', 'repeat_rule', 'repeat_from', 'completed_at', 'deleted_at'] as const
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')

/** 진행 기억(그 주 안에서만) — 기기 SecureStore */
export function loadProgressKv(week: string): ReviewProgress {
  const o = kvGet<Partial<ReviewProgress> | null>(REVIEW_KEY, null)
  return o && o.week === week ? { ...freshProgress(week), ...o, week } : freshProgress(week)
}
export const saveProgressKv = (p: ReviewProgress) => kvSet(REVIEW_KEY, p)

/** 밀린 일 하나를 정한다(XP 없음). 바꾸기 전 값(하위 포함)을 돌려준다 */
export async function applyDecision(id: string, d: Decision, planWeek: string, today: string): Promise<SnapRow[]> {
  const at = new Date().toISOString()
  const touched = d === 'done' || d === 'trash' ? await descendantsOf(coreDb, [id]) : [id]
  const snap = await db.getAll<SnapRow>(`SELECT id, ${SNAP.join(', ')} FROM tasks WHERE id IN (${marks(touched.length)})`, touched)
  let stmts: Stmt[] = []
  if (d === 'next') {
    const r = await db.getOptional<{ start_at: string | null; due_at: string | null }>('SELECT start_at, due_at FROM tasks WHERE id = ?', [id])
    if (r) stmts = [update('tasks', id, moveSpanToDate(r, planWeek))]
  } else if (d === 'someday') stmts = [update('tasks', id, { start_at: null, due_at: null, is_all_day: 1, repeat_rule: null, repeat_from: null })]
  else if (d === 'trash') stmts = touched.map((x) => update('tasks', x, { deleted_at: at }))
  else stmts = (await planCompleteNoXp(coreDb, [id], { today, now: () => at })).stmts
  await run(stmts)
  return snap
}
export const restoreSnap = (rows: SnapRow[]) => run(rows.map(({ id, ...patch }) => update('tasks', id, patch)))

/** ③ 끝내기: 고른 것마다 고를 주 목표(성장 addGoal — 주 5개 상한). 할 일이 딸리면 목표 선으로 잇고 횟수 = 할 일 수 */
export async function createGoals(today: string, planWeek: string, picks: Suggestion[]): Promise<Created[]> {
  const out: Created[] = []
  for (const s of picks) {
    if ((await addGoal(today, planWeek, s.title, Math.max(1, s.target), 'manual')) === 'full') break
    const row = await db.getOptional<{ id: string; target: number }>('SELECT id, target FROM kpis WHERE week_start = ? AND title = ? ORDER BY created_at DESC, sort_order DESC LIMIT 1', [planWeek, s.title])
    if (!row) continue
    const stmts: Stmt[] = []
    const removed: LinkRow[] = []
    for (const taskId of s.taskIds) {
      const links = await db.getAll<LinkRow>("SELECT id, kind, from_id, to_id, state FROM map_links WHERE kind = 'goal' AND to_id = ?", [taskId])
      const mine = links.filter((l) => l.state === 'accepted')
      if (mine.length === 1 && mine[0].from_id === row.id) continue
      for (const l of links) if (l.state === 'accepted' || l.from_id === row.id) stmts.push(deleteStmt('map_links', l.id))
      removed.push(...mine)
      stmts.push(insert('map_links', { id: crypto.randomUUID(), kind: 'goal', from_type: 'kpi', from_id: row.id, to_id: taskId, source: 'user', state: 'accepted' }))
    }
    if (stmts.length) await run(stmts)
    out.push({ goalId: row.id, title: s.title, removed })
  }
  return out
}
/** 끝내기 되돌리기: 만든 목표와 그 선을 지우고, 옮기며 끊은 원래 목표 선을 되살린다 */
export async function undoGoals(created: Created[]) {
  for (const c of created) {
    const mine = await db.getAll<{ id: string }>("SELECT id FROM map_links WHERE kind = 'goal' AND from_id = ?", [c.goalId])
    await run([
      ...mine.map((l) => deleteStmt('map_links', l.id)),
      ...c.removed.map((l) => insert('map_links', { id: l.id, kind: 'goal', from_type: 'kpi', from_id: l.from_id, to_id: l.to_id, source: 'user', state: 'accepted' })),
      deleteStmt('kpis', c.goalId)
    ])
  }
}
