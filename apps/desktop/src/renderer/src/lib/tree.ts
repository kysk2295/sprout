import type { TaskRow } from '../data/types'

// 목록 트리: 부모가 같은 결과 안에 있으면 그 아래로, 없으면 맨 위 단계로(02 §6).
export interface FlatRow {
  task: TaskRow
  depth: number
  hasChildren: boolean
  groupId: string
}
export const MAX_DEPTH = 4 // 0부터 — 최대 5단계(02 §6)

export function childrenMap(tasks: TaskRow[]): { roots: TaskRow[]; kids: Map<string, TaskRow[]> } {
  const ids = new Set(tasks.map((t) => t.id))
  const kids = new Map<string, TaskRow[]>()
  const roots: TaskRow[] = []
  for (const t of tasks) {
    if (t.parent_id && ids.has(t.parent_id)) {
      const arr = kids.get(t.parent_id) ?? []
      arr.push(t)
      kids.set(t.parent_id, arr)
    } else roots.push(t)
  }
  return { roots, kids }
}

export function flattenTree(roots: TaskRow[], kids: Map<string, TaskRow[]>, groupId: string, collapsed: Set<string>): FlatRow[] {
  const out: FlatRow[] = []
  const walk = (t: TaskRow, depth: number) => {
    const ch = kids.get(t.id) ?? []
    out.push({ task: t, depth, hasChildren: ch.length > 0, groupId })
    if (!collapsed.has(t.id)) ch.forEach((c) => walk(c, depth + 1))
  }
  roots.forEach((r) => walk(r, 0))
  return out
}
