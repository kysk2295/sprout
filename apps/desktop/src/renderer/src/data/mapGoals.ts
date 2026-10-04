// 31 작업 지도 v3 §3 목표로 묶기 — 목표 선(map_links kind='goal') 옮기기·끊기와 D3 규칙(횟수 목표는 연결 할 일 완료마다 +1).
// XP는 성장 setGoalProgress 그대로(10 §6) — 여기서 XP를 따로 주지 않는다.
import { getDb, type Stmt } from './db'
import { insert, remove, run, uuid } from './mutations'
import { setGoalProgress, type GoalRow } from './growth'
import type { MapLink } from './map'

type GoalLink = Pick<MapLink, 'id' | 'kind' | 'from_id' | 'to_id' | 'state'>

/**
 * 할 일 하나를 목표 goalId로 옮긴다(null = 목표 없음). 받아들인 목표 선을 전부 지우고 새로 하나.
 * 이미 그 목표에만 연결돼 있으면 아무것도 안 한다. 되돌리기용 원래 선을 함께 돌려준다.
 */
export function moveGoalLinkStmts(links: GoalLink[], taskId: string, goalId: string | null, newId: () => string = uuid): { stmts: Stmt[]; removed: GoalLink[]; added: string | null } {
  const mine = links.filter((l) => l.kind === 'goal' && l.to_id === taskId && l.state === 'accepted')
  if (goalId && mine.length === 1 && mine[0].from_id === goalId) return { stmts: [], removed: [], added: null }
  if (!goalId && !mine.length) return { stmts: [], removed: [], added: null }
  // 같은 목표·할 일의 무시한 제안 선이 남아 있으면 그것도 지운다(같은 쌍 두 줄 방지)
  const stale = goalId ? links.filter((l) => l.kind === 'goal' && l.to_id === taskId && l.from_id === goalId && l.state !== 'accepted') : []
  const stmts: Stmt[] = [...mine, ...stale].map((l) => remove('map_links', l.id))
  let added: string | null = null
  if (goalId) {
    added = newId()
    stmts.push(insert('map_links', { id: added, kind: 'goal', from_type: 'kpi', from_id: goalId, to_id: taskId, source: 'user', state: 'accepted' }))
  }
  return { stmts, removed: mine, added }
}

export async function moveGoalLink(taskId: string, goalId: string | null): Promise<(() => Promise<void>) | null> {
  const links = await (await getDb()).getAll<GoalLink>("SELECT id, kind, from_id, to_id, state FROM map_links WHERE kind = 'goal' AND to_id = ?", [taskId])
  const { stmts, removed, added } = moveGoalLinkStmts(links, taskId, goalId)
  if (!stmts.length) return null
  await run(...stmts)
  return async () => {
    await run(...(added ? [remove('map_links', added)] : []), ...removed.map((l) => insert('map_links', { id: l.id, kind: 'goal', from_type: 'kpi', from_id: l.from_id, to_id: l.to_id, source: 'user', state: 'accepted' })))
  }
}

/** 목표 하나의 연결을 모두 끊는다(우클릭 `연결 모두 끊기`) */
export async function unlinkGoal(goalId: string) {
  const rows = await (await getDb()).getAll<{ id: string }>("SELECT id FROM map_links WHERE kind = 'goal' AND from_id = ?", [goalId])
  await run(...rows.map((r) => remove('map_links', r.id)))
}

/**
 * D3(31 §8, 2026-10-05 확정): 할 일 완료(delta +1)·완료 취소(−1) 때 그 할 일에 목표 선으로 연결된 **횟수 목표**(target > 1)의 진행을 바꾼다.
 * 1회 목표는 건드리지 않는다(작업 지도의 `달성으로 표시` 제안 유지). 같은 목표에 연결된 할 일이 한꺼번에 여럿 끝나면 그만큼.
 * 이미 달성한 목표는 더 올리지 않고, 진행 중 목표만 바꾼다(취소는 달성 목표도 내려 setGoalProgress가 XP를 되돌린다).
 */
export function linkedGoalDeltas(goals: Pick<GoalRow, 'id' | 'target' | 'progress' | 'status'>[], links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], taskIds: string[], delta: 1 | -1): Map<string, number> {
  const out = new Map<string, number>()
  const ids = new Set(taskIds)
  for (const g of goals) {
    if (g.target <= 1) continue
    if (delta > 0 && g.status !== 'active') continue
    if (delta < 0 && g.status === 'missed') continue
    const n = links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.from_id === g.id && ids.has(l.to_id)).length
    if (!n) continue
    const p = Math.max(0, Math.min(g.target, g.progress + delta * n))
    if (p !== g.progress) out.set(g.id, p)
  }
  return out
}

export async function countLinkedGoals(taskIds: string[], delta: 1 | -1) {
  if (!taskIds.length) return
  const db = await getDb()
  const marks = taskIds.map(() => '?').join(',')
  const links = await db.getAll<GoalLink>(`SELECT id, kind, from_id, to_id, state FROM map_links WHERE kind = 'goal' AND state = 'accepted' AND to_id IN (${marks})`, taskIds)
  if (!links.length) return
  const gids = [...new Set(links.map((l) => l.from_id))]
  const goals = await db.getAll<GoalRow>(`SELECT id, week_start, title, target, progress, status, source, achieved_at, sort_order FROM kpis WHERE id IN (${gids.map(() => '?').join(',')})`, gids)
  for (const [id, p] of linkedGoalDeltas(goals, links, taskIds, delta)) {
    const g = goals.find((x) => x.id === id)
    if (g) await setGoalProgress(g, p)
  }
}
