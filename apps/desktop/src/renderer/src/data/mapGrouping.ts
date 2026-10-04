// 31 작업 지도 v3 §3 묶기: `리스트`(폴더 › 리스트 › 할 일, 14 v2.0 그대로) · `목표`(이번 주 목표 → 리스트 → 할 일 + 목표 없는 할 일).
// 그래프·보드·타임라인이 같은 함수를 쓴다(타임라인은 mapRows로 줄 목록을 받는다). 순수 함수 — tests/map-v3.test.ts.
//
// 안정 계약(타임라인이 import):
//   groupMap(by, input) → Grouped            묶음 나무
//   mapRows(grouped, collapsed) → MapRow[]   위→아래 줄(머리·할 일, 깊이, 접힘 반영)
//   nestTasks(tasks) → { tasks, depth }      하위 할 일을 부모 바로 아래로(들여쓰기 깊이)
import { buildMapTree, type ListGroup, type MapFolder, type MapGoal, type MapLink, type MapList, type MapTask, type MapTree } from './map'

export type GroupBy = 'list' | 'goal'

/** 목표 묶음: 그 목표에 목표 선으로 연결된 할 일을 리스트별로 */
export type GoalSection = { kind: 'goal'; id: string; goal: MapGoal; lists: ListGroup[]; count: number }
/** 목표 없는 할 일(맨 끝) — 리스트별 */
export type NoGoalSection = { kind: 'nogoal'; id: 'nogoal'; lists: ListGroup[]; count: number }
export type GoalTree = { sections: (GoalSection | NoGoalSection)[]; /** 두 목표 이상에 연결된 할 일 → 연결 수(카드 `🎯2`) */ multi: Map<string, number> }

export type GroupInput = {
  folders: MapFolder[]
  lists: MapList[]
  tasks: MapTask[]
  links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[]
  goals: MapGoal[]
  only?: string[] | null
}
export type Grouped = { by: 'list'; tree: MapTree } | { by: 'goal'; tree: GoalTree }

/** 하위 할 일(parent_id)을 부모 바로 아래로. 부모가 목록에 없으면 그 자리 그대로(깊이 0). 고리·깊이 4 이상은 끊는다 */
export function nestTasks<T extends Pick<MapTask, 'id'> & { parent_id?: string | null }>(tasks: T[]): { tasks: T[]; depth: Map<string, number> } {
  const ids = new Set(tasks.map((t) => t.id))
  const kids = new Map<string, T[]>()
  const roots: T[] = []
  for (const t of tasks) {
    if (t.parent_id && ids.has(t.parent_id) && t.parent_id !== t.id) kids.set(t.parent_id, [...(kids.get(t.parent_id) ?? []), t])
    else roots.push(t)
  }
  const out: T[] = []
  const depth = new Map<string, number>()
  const seen = new Set<string>()
  const walk = (t: T, d: number) => {
    if (seen.has(t.id)) return
    seen.add(t.id)
    out.push(t)
    depth.set(t.id, Math.min(d, 3))
    for (const k of kids.get(t.id) ?? []) walk(k, d + 1)
  }
  for (const r of roots) walk(r, 0)
  for (const t of tasks) if (!seen.has(t.id)) walk(t, 0) // 고리(부모끼리 서로 가리킴)
  return { tasks: out, depth }
}

const openCount = (ts: MapTask[]) => ts.filter((t) => t.status === 0).length
const nestGroup = (g: ListGroup): ListGroup => ({ ...g, tasks: nestTasks(g.tasks).tasks })

/** 리스트 순서(기본함 → 폴더 밖 → 폴더 안, 사이드바 순서)로 할 일을 리스트별로 나눈다. 할 일 없는 리스트는 뺀다 */
function byList(lists: MapList[], folders: MapFolder[], tasks: MapTask[]): ListGroup[] {
  const tree = buildMapTree(folders, lists, tasks)
  const out: ListGroup[] = []
  for (const g of tree.groups) {
    if (g.kind === 'list') { if (g.tasks.length) out.push(nestGroup({ list: g.list, tasks: g.tasks, count: g.count })) }
    else for (const l of g.lists) if (l.tasks.length) out.push(nestGroup(l))
  }
  return out
}

/**
 * 목표로 묶기: 목표(성장 탭 순서) → 연결 할 일이 있는 리스트 → 할 일. 한 할 일이 두 목표에 연결돼 있으면 첫 목표 아래에만(31 §3.4).
 * 하위 할 일은 부모를 따라간다(부모가 연결돼 있으면 부모 묶음 아래). 목표 없는 할 일은 맨 끝 `nogoal`.
 */
export function buildGoalTree(input: GroupInput): GoalTree {
  const only = input.only ? new Set(input.only) : null
  const lists = input.lists.filter((l) => !l.archived_at && (!only || only.has(l.id)))
  const inboxId = input.lists.find((l) => l.kind === 'inbox')?.id
  const listIds = new Set(lists.map((l) => l.id))
  const tasks = input.tasks.filter((t) => {
    const lid = t.list_id && input.lists.some((l) => l.id === t.list_id) ? t.list_id : inboxId
    return !!lid && listIds.has(lid)
  })
  const goals = [...input.goals].sort((a, b) => a.sort_order - b.sort_order)
  const goalIds = new Set(goals.map((g) => g.id))
  const linkedTo = new Map<string, string[]>() // task → 목표들(목표 순서)
  for (const g of goals) {
    for (const l of input.links) {
      if (l.kind !== 'goal' || l.state !== 'accepted' || l.from_id !== g.id || !goalIds.has(l.from_id)) continue
      const cur = linkedTo.get(l.to_id) ?? []
      if (!cur.includes(g.id)) linkedTo.set(l.to_id, [...cur, g.id])
    }
  }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  // 하위 할 일은 부모(가장 위 조상)가 속한 목표를 따른다 — 자기 연결이 있으면 그것
  const goalOf = (t: MapTask): string | undefined => {
    let cur: MapTask | undefined = t
    for (let i = 0; cur && i < 5; i++) {
      const own = linkedTo.get(cur.id)?.[0]
      if (own) return own
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return undefined
  }
  const bucket = new Map<string, MapTask[]>()
  const rest: MapTask[] = []
  for (const t of tasks) {
    const g = goalOf(t)
    if (g) bucket.set(g, [...(bucket.get(g) ?? []), t])
    else rest.push(t)
  }
  const multi = new Map<string, number>()
  for (const [id, gs] of linkedTo) if (gs.length > 1) multi.set(id, gs.length)
  const sections: GoalTree['sections'] = goals.map((goal) => {
    const ls = byList(lists, input.folders, bucket.get(goal.id) ?? [])
    return { kind: 'goal' as const, id: goal.id, goal, lists: ls, count: ls.reduce((n, l) => n + openCount(l.tasks), 0) }
  })
  const restLists = byList(lists, input.folders, rest)
  sections.push({ kind: 'nogoal', id: 'nogoal', lists: restLists, count: restLists.reduce((n, l) => n + openCount(l.tasks), 0) })
  return { sections, multi }
}

/** 묶기 하나로 세 보기를 맞춘다 */
export function groupMap(by: GroupBy, input: GroupInput): Grouped {
  if (by === 'goal') return { by, tree: buildGoalTree(input) }
  const tree = buildMapTree(input.folders, input.lists, input.tasks, { only: input.only })
  return {
    by,
    tree: { groups: tree.groups.map((g) => (g.kind === 'list' ? { ...g, tasks: nestTasks(g.tasks).tasks } : { ...g, lists: g.lists.map(nestGroup) })) }
  }
}

/**
 * 위→아래 줄 목록(타임라인 줄 머리·가상 스크롤용). key는 그래프 접힘 기억과 같은 모양:
 *   리스트 묶기: `folder:<id>` · `list:<id>` · 할 일 `task:<id>`
 *   목표 묶기: `goal:<id>` · `nogoal` · 그 아래 리스트 `goal:<gid>/list:<lid>` · 할 일 `task:<id>`
 * depth: 머리 0~1, 할 일은 묶음 깊이 + 하위 할 일 들여쓰기(sub).
 */
export type MapRow =
  | { kind: 'folder'; key: string; depth: number; folder: MapFolder; count: number; collapsed: boolean }
  | { kind: 'list'; key: string; depth: number; list: MapList; count: number; collapsed: boolean }
  | { kind: 'goal'; key: string; depth: number; goal: MapGoal; count: number; collapsed: boolean }
  | { kind: 'nogoal'; key: string; depth: number; count: number; collapsed: boolean }
  | { kind: 'task'; key: string; depth: number; task: MapTask; listId: string; sub: number }

export function mapRows(g: Grouped, collapsed: Record<string, boolean> = {}): MapRow[] {
  const rows: MapRow[] = []
  const pushTasks = (tasks: MapTask[], listId: string, depth: number) => {
    const { depth: sub } = nestTasks(tasks)
    for (const t of tasks) rows.push({ kind: 'task', key: `task:${t.id}`, depth, task: t, listId, sub: sub.get(t.id) ?? 0 })
  }
  const pushList = (l: ListGroup, key: string, depth: number) => {
    const c = !!collapsed[key]
    rows.push({ kind: 'list', key, depth, list: l.list, count: l.count, collapsed: c })
    if (!c) pushTasks(l.tasks, l.list.id, depth + 1)
  }
  if (g.by === 'list') {
    for (const grp of g.tree.groups) {
      if (grp.kind === 'list') {
        const key = `list:${grp.id}`
        const c = !!collapsed[key]
        rows.push({ kind: 'list', key, depth: 0, list: grp.list, count: grp.count, collapsed: c })
        if (!c) pushTasks(grp.tasks, grp.id, 1)
      } else {
        const key = `folder:${grp.id}`
        const c = !!collapsed[key]
        rows.push({ kind: 'folder', key, depth: 0, folder: grp.folder, count: grp.count, collapsed: c })
        if (!c) for (const l of grp.lists) pushList(l, `list:${l.list.id}`, 1)
      }
    }
    return rows
  }
  for (const s of g.tree.sections) {
    const key = s.kind === 'goal' ? `goal:${s.id}` : 'nogoal'
    // 목표 없는 할 일은 처음 접힘(31 §3.2) — 기억이 있으면 그것
    const c = collapsed[key] ?? s.kind === 'nogoal'
    rows.push(s.kind === 'goal' ? { kind: 'goal', key, depth: 0, goal: s.goal, count: s.count, collapsed: c } : { kind: 'nogoal', key, depth: 0, count: s.count, collapsed: c })
    if (!c) for (const l of s.lists) pushList(l, `${key}/list:${l.list.id}`, 1)
  }
  return rows
}
