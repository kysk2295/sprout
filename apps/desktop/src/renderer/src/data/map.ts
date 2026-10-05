// 14 작업 지도 v2.0 — 내 폴더 › 리스트 › 할 일을 그래프·보드로 보고 틱틱처럼 직접 고친다(2026-10-05 사용자 결정: 리스트와 AI 정리를 하나로).
// AI는 리스트를 만들거나 옮기지 않고 제안만 한다(data/listSuggest.ts). 순서·목표 선(map_links)은 그대로.
// map_areas · task_areas는 동기화 표로 남아 있지만 더는 읽고 쓰지 않는다(데이터는 건드리지 않음).
// 계산(나무·배치·고리 검사·리스트 옮기기·순서)은 순수 함수로 두고 시험한다(tests/map.test.ts).
import dagre from '@dagrejs/dagre'
import { getDb, type Stmt } from './db'
import { insert, remove, run, update, uuid } from './mutations'
import { weekStart } from '../lib/calendar'
import { dayKey } from '../lib/dates'
import { addDays } from '@sprout/schema/time'
import { splitEmoji } from '../../../shared/emoji'

// ── 행 모양 ──
export type MapLink = { id: string; kind: 'sequence' | 'goal'; from_type: 'task' | 'kpi'; from_id: string; to_id: string; source: string; state: 'suggested' | 'accepted' | 'dismissed'; created_at?: string | null }
export type MapTask = { id: string; title: string; status: number; due_at: string | null; start_at: string | null; priority: number; list_id: string | null; completed_at: string | null; created_at: string | null; parent_id?: string | null }
export type MapGoal = { id: string; title: string; target: number; progress: number; status: string; week_start: string; achieved_at: string | null; source: string; sort_order: number }
export type MapFolder = { id: string; name: string; sort_order: number }
export type MapList = { id: string; name: string; emoji: string | null; color: string | null; folder_id: string | null; kind: string; sort_order: number; archived_at?: string | null }

export const NAME_MAX = 100
/** 리스트·폴더 이름 규칙: 앞뒤 공백·연속 공백 정리, 빈칸·100자 넘음 거부(null) — 05 편집 창과 같은 길이 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/\s+/g, ' ').trim()
  return s && [...s].length <= NAME_MAX ? s : null
}
/** 폴더 표시: 이름 앞 이모지를 아이콘으로(30 §A.4) */
export const folderView = (name: string) => splitEmoji(name)
export const listTitle = (l: Pick<MapList, 'kind' | 'name'>) => (l.kind === 'inbox' ? '기본함' : l.name)

// ── 순서 선: 고리 검사 ──
/** from → to 순서 선을 더하면 고리가 생기는가. 무시한 제안은 셈하지 않는다 */
export function wouldCycle(links: Pick<MapLink, 'kind' | 'from_id' | 'to_id' | 'state'>[], from: string, to: string): boolean {
  if (from === to) return true
  const next = new Map<string, string[]>()
  for (const l of links) {
    if (l.kind !== 'sequence' || l.state === 'dismissed') continue
    next.set(l.from_id, [...(next.get(l.from_id) ?? []), l.to_id])
  }
  const seen = new Set<string>()
  const stack = [to]
  while (stack.length) {
    const id = stack.pop()!
    if (id === from) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(next.get(id) ?? []))
  }
  return false
}

// ── 폴더 › 리스트 › 할 일 나무 ──
export type ListGroup = { list: MapList; tasks: MapTask[]; count: number }
/** 맨 위 묶음: 폴더(안에 리스트들) 또는 폴더 밖 리스트(틱틱 사이드바처럼 폴더 없는 리스트가 먼저, 기본함이 맨 앞) */
export type MapGroup =
  | { kind: 'folder'; id: string; folder: MapFolder; lists: ListGroup[]; count: number }
  | { kind: 'list'; id: string; list: MapList; tasks: MapTask[]; count: number }
export type MapTree = { groups: MapGroup[] }
/**
 * 보관한 리스트는 빼고, 리스트가 없는 할 일(list_id 비었거나 모름)은 기본함으로.
 * only = 거름틀 `범위: 고른 리스트`(그 리스트만, 빈 폴더 숨김). 빈 리스트·빈 폴더도 보인다(끌어 넣을 수 있게).
 */
export function buildMapTree(folders: MapFolder[], lists: MapList[], tasks: MapTask[], opts: { only?: string[] | null } = {}): MapTree {
  const live = lists.filter((l) => !l.archived_at && (!opts.only || opts.only.includes(l.id)))
  const inbox = lists.find((l) => l.kind === 'inbox')
  const byList = new Map<string, MapTask[]>(live.map((l) => [l.id, []]))
  for (const t of tasks) {
    const id = t.list_id && byList.has(t.list_id) ? t.list_id : !t.list_id || !lists.some((l) => l.id === t.list_id) ? inbox?.id : undefined
    if (id && byList.has(id)) byList.get(id)!.push(t)
  }
  const open = (ts: MapTask[]) => ts.filter((t) => t.status === 0).length
  const group = (l: MapList): ListGroup => ({ list: l, tasks: byList.get(l.id) ?? [], count: open(byList.get(l.id) ?? []) })
  const folderIds = new Set(folders.map((f) => f.id))
  const sorted = [...live].sort((a, b) => a.sort_order - b.sort_order)
  const groups: MapGroup[] = []
  const inboxShown = inbox && sorted.find((l) => l.id === inbox.id)
  if (inboxShown) {
    const g = group(inboxShown)
    groups.push({ kind: 'list', id: inboxShown.id, list: inboxShown, tasks: g.tasks, count: g.count })
  }
  for (const l of sorted) {
    if (l.kind === 'inbox' || (l.folder_id && folderIds.has(l.folder_id))) continue
    const g = group(l)
    groups.push({ kind: 'list', id: l.id, list: l, tasks: g.tasks, count: g.count })
  }
  for (const f of [...folders].sort((a, b) => a.sort_order - b.sort_order)) {
    const inside = sorted.filter((l) => l.kind !== 'inbox' && l.folder_id === f.id).map(group)
    if (opts.only && !inside.length) continue
    groups.push({ kind: 'folder', id: f.id, folder: f, lists: inside, count: inside.reduce((n, g) => n + g.count, 0) })
  }
  return { groups }
}
export const treeTaskCount = (tree: MapTree) => tree.groups.reduce((n, g) => n + (g.kind === 'list' ? g.tasks.length : g.lists.reduce((m, l) => m + l.tasks.length, 0)), 0)

// ── 기간·거름틀 ──
/** keepDone = 31 §11 같이 짜는 큰 할 일 — 그 하위의 끝낸 단계는 완료 숨김이어도 보인다(줄 그어) */
export type MapFilter = { period: 'week' | 'all'; showDone: boolean; showNoDate: boolean; lists: string[] | null; keepDone?: string | null }
/** 이번 주 = 이번 주 마감·일정 + 날짜 없는 미완료 + 이번 주 완료. 전체 = 미완료 전부(+완료 보이기) */
export function filterTasks(tasks: MapTask[], f: MapFilter, today = dayKey()): MapTask[] {
  const ws = weekStart(today)
  const we = addDays(ws, 7)
  const wsIso = new Date(`${ws}T00:00`).toISOString()
  return tasks.filter((t) => {
    if (!t.title.trim()) return false
    if (!t.due_at && !f.showNoDate) return false
    if (t.status === 1) {
      if (f.keepDone && t.parent_id === f.keepDone) return true
      if (f.period === 'week') return !!t.completed_at && t.completed_at >= wsIso
      return f.showDone
    }
    if (t.status !== 0) return false
    if (f.period === 'all' || !t.due_at) return true
    const start = (t.start_at ?? t.due_at).slice(0, 10)
    const end = t.due_at.slice(0, 10)
    return start < we && end >= ws
  })
}

// ── 그래프 배치(dagre) ──
export const SIZE = { root: { w: 120, h: 28 }, group: { w: 180, h: 40 }, goalGroup: { w: 280, h: 52 }, list: { w: 140, h: 34 }, task: { w: 170, h1: 40, h2: 56 }, goal: { h: 30, hPath: 46 }, memo: { w: 140, h: 40 }, indent: 12, gap: 8, under: 16, memoGap: 24 }
/** goalgroup·nogoal = 31 목표로 묶기의 1층(목표 노드 · 목표 없는 할 일) */
export type LayoutNode = { id: string; kind: 'root' | 'folder' | 'list' | 'task' | 'goal' | 'goalgroup' | 'nogoal' | 'anchor' | 'lane' | 'memo'; x: number; y: number; w: number; h: number; ref?: string; group?: string; level?: 1 | 2; sub?: number }
export type LayoutEdge = { id: string; kind: 'contain' | 'stem' | 'seq' | 'goal' | 'memo'; source: string; target: string; link?: MapLink }
/** 끌어 놓는 자리: 리스트(할 일을 놓음) · 폴더(리스트를 놓음) */
export type LayoutZone = { kind: 'list' | 'folder' | 'goal'; id: string; x: number; y: number; w: number; h: number }
export type LayoutInput = {
  tree: MapTree
  links: MapLink[]
  goals: MapGoal[]
  collapsed: Record<string, boolean>
  memos?: { id: string; title: string; task_id: string }[]
  hasDate: (taskId: string) => boolean
  /** 31 목표로 묶기: 있으면 tree 대신 목표 → 리스트 → 할 일로 배치(목표 줄은 그리지 않는다) */
  goalTree?: { sections: ({ kind: 'goal'; id: string; lists: ListGroup[] } | { kind: 'nogoal'; id: 'nogoal'; lists: ListGroup[] })[] }
  /** 목표 노드 아래 남은 길 글자가 있는 목표(목표 줄 노드 높이) */
  pathGoals?: Set<string>
}
/** 하위 할 일 깊이(부모가 같은 열에 있을 때만, 최대 3) — 순서는 mapGrouping.nestTasks가 맞춘다 */
function nestDepth(tasks: MapTask[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out = new Map<string, number>()
  for (const t of tasks) {
    let d = 0
    let cur = t
    while (cur.parent_id && byId.has(cur.parent_id) && d < 3) { d++; cur = byId.get(cur.parent_id)! }
    if (d) out.set(t.id, d)
  }
  return out
}
const taskH = (input: LayoutInput, id: string) => (input.hasDate(id) ? SIZE.task.h2 : SIZE.task.h1)
/** 할 일 노드가 300개를 넘으면 폴더 안 리스트를 기본으로 접는다(14 §0.5) */
export const autoCollapse = (tree: MapTree) => treeTaskCount(tree) > 300
/** id = `folder:…` · `list:…`. 자동 접기는 폴더 안 리스트(2층)에만 */
export function isCollapsed(collapsed: Record<string, boolean>, id: string, auto: boolean, nested = false) {
  return collapsed[id] ?? (auto && nested)
}

/** 뿌리 → 폴더·폴더 밖 리스트 → 폴더 안 리스트(열)를 dagre로 위→아래 배치하고, 할 일은 리스트 아래 세로로 쌓는다 */
export function layoutMap(input: LayoutInput): { nodes: LayoutNode[]; edges: LayoutEdge[]; zones: LayoutZone[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: 56, nodesep: 24, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  const auto = autoCollapse(input.tree)
  const memoOf = new Map<string, { id: string; title: string; task_id: string }[]>()
  for (const m of input.memos ?? []) memoOf.set(m.task_id, [...(memoOf.get(m.task_id) ?? []), m])
  type Col = { id: string; group: string; head?: MapList; listId: string; tasks: MapTask[]; w: number; h: number }
  const cols: Col[] = []
  const subOf = new Map<string, number>() // 하위 할 일 들여쓰기 깊이(31 §4.3: 부모 노드 아래 12씩)
  const colSize = (tasks: MapTask[], head: boolean) => {
    const memo = tasks.some((t) => memoOf.has(t.id))
    for (const [id, d] of nestDepth(tasks)) subOf.set(id, d)
    const deep = Math.max(0, ...tasks.map((t) => subOf.get(t.id) ?? 0))
    const w = SIZE.indent + deep * SIZE.indent + SIZE.task.w + (memo ? SIZE.memoGap + SIZE.memo.w : 0)
    const stack = tasks.reduce((n, t) => n + taskH(input, t.id) + SIZE.gap, 0)
    return { w: Math.max(w, SIZE.list.w), h: (head ? SIZE.list.h : 0) + (tasks.length ? SIZE.under + stack - SIZE.gap : 0) }
  }
  g.setNode('root', { width: input.goalTree ? 260 : SIZE.root.w, height: SIZE.root.h })
  // 1층: 리스트 묶기 = 폴더·폴더 밖 리스트, 목표 묶기 = 목표·목표 없음
  type Top = { id: string; kind: 'folder' | 'list' | 'goalgroup' | 'nogoal'; ref: string; tasks?: MapTask[]; lists?: ListGroup[] }
  const tops: Top[] = input.goalTree
    ? input.goalTree.sections.map((s) => (s.kind === 'goal' ? { id: `goal:${s.id}`, kind: 'goalgroup' as const, ref: s.id, lists: s.lists } : { id: 'nogoal', kind: 'nogoal' as const, ref: 'nogoal', lists: s.lists }))
    : input.tree.groups.map((grp) => (grp.kind === 'list' ? { id: `list:${grp.id}`, kind: 'list' as const, ref: grp.id, tasks: grp.tasks } : { id: `folder:${grp.id}`, kind: 'folder' as const, ref: grp.id, lists: grp.lists }))
  for (const t of tops) {
    const big = t.kind === 'goalgroup' || t.kind === 'nogoal'
    g.setNode(t.id, { width: big ? SIZE.goalGroup.w : SIZE.group.w, height: big ? SIZE.goalGroup.h : SIZE.group.h })
    g.setEdge('root', t.id)
    // 목표 없는 할 일은 처음 접힘(31 §3.2)
    if (input.collapsed[t.id] ?? t.kind === 'nogoal') continue
    if (t.kind === 'list') {
      if (t.tasks!.length) cols.push({ id: `col:${t.id}`, group: t.id, listId: t.ref, tasks: t.tasks!, ...colSize(t.tasks!, false) })
    } else {
      for (const l of t.lists!) {
        const lid = t.kind === 'folder' ? `list:${l.list.id}` : `${t.id}/list:${l.list.id}`
        const shown = isCollapsed(input.collapsed, lid, auto, true) ? [] : l.tasks
        cols.push({ id: lid, group: t.id, head: l.list, listId: l.list.id, tasks: shown, ...colSize(shown, true) })
      }
    }
  }
  for (const c of cols) {
    g.setNode(c.id, { width: c.w, height: c.h })
    g.setEdge(c.group, c.id)
  }
  dagre.layout(g)
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  const zones: LayoutZone[] = []
  // dagre가 순서를 바꿀 수 있어서, 묶음(위 노드 + 그 열들)을 정한 순서(사이드바 순서)로 다시 늘어놓는다
  const shift = new Map<string, number>()
  let cursor = Infinity
  const spans = tops.map((t) => {
    const ids = [t.id, ...cols.filter((c) => c.group === t.id).map((c) => c.id)]
    const xs = ids.map((id) => g.node(id)).flatMap((n) => [n.x - n.width / 2, n.x + n.width / 2])
    cursor = Math.min(cursor, ...xs)
    return { ids, min: Math.min(...xs), max: Math.max(...xs) }
  })
  for (const sp of spans) {
    for (const id of sp.ids) shift.set(id, cursor - sp.min)
    cursor += sp.max - sp.min + 32
  }
  if (spans.length) {
    const lo = Math.min(...spans.map((sp) => sp.min + shift.get(sp.ids[0])!))
    const hi = Math.max(...spans.map((sp) => sp.max + shift.get(sp.ids[0])!))
    shift.set('root', (lo + hi) / 2 - g.node('root').x)
  }
  const box = (id: string) => { const n = g.node(id); return { x: n.x - n.width / 2 + (shift.get(id) ?? 0), y: n.y - n.height / 2, w: n.width, h: n.height } }
  nodes.push({ id: 'root', kind: 'root', ...box('root') })
  const colTop = cols.length ? Math.min(...cols.map((c) => box(c.id).y)) : 0
  const colBoxes = new Map(cols.map((c) => [c.id, { ...box(c.id), y: colTop + (c.head ? 0 : SIZE.under) }]))
  for (const t of tops) {
    const b = box(t.id)
    nodes.push({ id: t.id, kind: t.kind, ref: t.ref, level: 1, ...b })
    edges.push({ id: `e:root:${t.id}`, kind: 'contain', source: 'root', target: t.id })
    // 놓는 자리: 위 노드 + 그 열들을 감싼 상자
    const mine = cols.filter((c) => c.group === t.id).map((c) => colBoxes.get(c.id)!)
    const x0 = Math.min(b.x, ...mine.map((m) => m.x)), x1 = Math.max(b.x + b.w, ...mine.map((m) => m.x + m.w))
    const y1 = Math.max(b.y + b.h, ...mine.map((m) => m.y + m.h))
    zones.push({ kind: t.kind === 'goalgroup' || t.kind === 'nogoal' ? 'goal' : t.kind, id: t.ref, x: x0 - 8, y: b.y - 4, w: x1 - x0 + 16, h: y1 - b.y + 12 })
  }
  for (const c of cols) {
    const b = colBoxes.get(c.id)!
    let y = b.y
    let stemFrom: string
    if (c.head) {
      nodes.push({ id: c.id, kind: 'list', ref: c.head.id, group: c.group, level: 2, x: b.x, y: b.y, w: SIZE.list.w, h: SIZE.list.h })
      edges.push({ id: `e:${c.group}:${c.id}`, kind: 'contain', source: c.group, target: c.id })
      y += SIZE.list.h + SIZE.under
      stemFrom = c.id
      zones.push({ kind: 'list', id: c.listId, x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 })
    } else {
      // 폴더 밖 리스트의 할 일: 보이지 않는 닻에서 줄기선을 내린다
      stemFrom = `anchor:${c.group}`
      nodes.push({ id: stemFrom, kind: 'anchor', group: c.group, x: b.x, y: b.y - SIZE.under, w: 4, h: 4 })
      edges.push({ id: `e:${c.group}:${stemFrom}`, kind: 'contain', source: c.group, target: stemFrom })
    }
    for (const t of c.tasks) {
      const h = taskH(input, t.id)
      const sub = subOf.get(t.id) ?? 0
      nodes.push({ id: `task:${t.id}`, kind: 'task', ref: t.id, group: c.group, x: b.x + SIZE.indent + sub * SIZE.indent, y, w: SIZE.task.w, h, ...(sub ? { sub } : {}) })
      edges.push({ id: `e:${stemFrom}:${t.id}`, kind: 'stem', source: stemFrom, target: `task:${t.id}` })
      for (const m of memoOf.get(t.id) ?? []) {
        nodes.push({ id: `memo:${m.id}`, kind: 'memo', ref: m.id, x: b.x + SIZE.indent + SIZE.task.w + SIZE.memoGap, y, w: SIZE.memo.w, h: SIZE.memo.h })
        edges.push({ id: `e:memo:${m.id}`, kind: 'memo', source: `memo:${m.id}`, target: `task:${t.id}` })
      }
      y += h + SIZE.gap
    }
  }
  // 순서 선(보이는 할 일끼리)
  const shown = new Set(nodes.filter((n) => n.kind === 'task').map((n) => n.ref))
  for (const l of input.links) {
    if (l.state === 'dismissed' || !shown.has(l.to_id)) continue
    if (l.kind === 'sequence' && shown.has(l.from_id)) edges.push({ id: `link:${l.id}`, kind: 'seq', source: `task:${l.from_id}`, target: `task:${l.to_id}`, link: l })
  }
  // 목표 줄: 맨 아래 가로줄. 연결된 할 일들의 가운데 아래에 놓고 겹치면 오른쪽으로 민다
  if (input.goals.length && !input.goalTree) {
    const bottom = Math.max(...nodes.map((n) => n.y + n.h)) + 56
    nodes.push({ id: 'lane', kind: 'lane', x: 20, y: bottom - 22, w: 240, h: 16 })
    const center = new Map(nodes.filter((n) => n.kind === 'task').map((n) => [n.ref!, n.x + n.w / 2]))
    const placed = input.goals.map((goal, i) => {
      const xs = input.links.filter((l) => l.kind === 'goal' && l.from_id === goal.id && l.state !== 'dismissed' && center.has(l.to_id)).map((l) => center.get(l.to_id)!)
      const w = input.pathGoals?.has(goal.id) ? 220 : Math.min(220, Math.max(120, [...goal.title].length * 12 + 44))
      return { goal, w, want: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length - w / 2 : Infinity, i }
    }).sort((a, b) => a.want - b.want || a.i - b.i)
    let gx = 20
    for (const p of placed) {
      const x = Math.max(gx, Number.isFinite(p.want) ? p.want : gx)
      nodes.push({ id: `goal:${p.goal.id}`, kind: 'goal', ref: p.goal.id, x, y: bottom, w: p.w, h: input.pathGoals?.has(p.goal.id) ? SIZE.goal.hPath : SIZE.goal.h })
      gx = x + p.w + 16
    }
    for (const l of input.links) {
      if (l.kind === 'goal' && l.state !== 'dismissed' && shown.has(l.to_id) && input.goals.some((gg) => gg.id === l.from_id)) {
        edges.push({ id: `link:${l.id}`, kind: 'goal', source: `goal:${l.from_id}`, target: `task:${l.to_id}`, link: l })
      }
    }
  }
  return { nodes, edges, zones }
}
/** 놓은 점에 맞는 가장 작은 자리 */
export function zoneAt(zones: LayoutZone[], kind: LayoutZone['kind'], p: { x: number; y: number }): LayoutZone | undefined {
  return zones.filter((z) => z.kind === kind && p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]
}

/** 노드를 눌렀을 때 강조할 것: 뿌리까지의 길 + 바로 아래 노드 */
export function highlightSet(edges: Pick<LayoutEdge, 'kind' | 'source' | 'target'>[], id: string): Set<string> {
  const contain = edges.filter((e) => e.kind === 'contain' || e.kind === 'stem')
  const out = new Set([id])
  let cur = id
  for (let i = 0; i < 6; i++) {
    const up = contain.find((e) => e.target === cur)
    if (!up) break
    out.add(up.source)
    cur = up.source
  }
  for (const e of contain) if (e.source === id) out.add(e.target)
  for (const e of contain) if (e.source === id && e.target.startsWith('anchor:')) for (const s of contain) if (s.source === e.target) out.add(s.target)
  return out
}

// ── 직접 고치기(틱틱처럼): 리스트를 폴더로 옮기기 · 순서 바꾸기 ──
/**
 * 리스트를 폴더(null = 폴더 밖)로 옮기고, 새 자리 형제들 사이에서 before 앞(없으면 맨 끝)에 둔다.
 * 기본함은 옮기지 않는다. 형제 순서는 1..n으로 다시 매긴다(같은 폴더 안 순서만 의미가 있다)
 */
export function moveListStmts(lists: MapList[], listId: string, folderId: string | null, beforeId?: string | null): Stmt[] {
  const l = lists.find((x) => x.id === listId)
  if (!l || l.kind === 'inbox') return []
  const siblings = lists.filter((x) => x.id !== listId && x.kind !== 'inbox' && !x.archived_at && (x.folder_id ?? null) === folderId).sort((a, b) => a.sort_order - b.sort_order)
  const at = beforeId ? siblings.findIndex((x) => x.id === beforeId) : -1
  const order = [...siblings]
  order.splice(at >= 0 ? at : order.length, 0, l)
  const stmts: Stmt[] = []
  order.forEach((x, i) => {
    const patch: Record<string, unknown> = {}
    if (x.sort_order !== i + 1) patch.sort_order = i + 1
    if (x.id === listId && (l.folder_id ?? null) !== folderId) patch.folder_id = folderId
    if (Object.keys(patch).length) stmts.push(update('lists', x.id, patch))
  })
  return stmts
}
/** 폴더 순서 바꾸기: id 순서대로 1..n */
export function reorderFoldersStmts(folders: MapFolder[], ids: string[]): Stmt[] {
  return ids.map((id, i) => ({ id, i })).filter(({ id, i }) => folders.find((f) => f.id === id)?.sort_order !== i + 1).map(({ id, i }) => update('folders', id, { sort_order: i + 1 }))
}
/** 폴더 이름 바꾸기: 앞 이모지(아이콘)는 그대로 두고 이름만 */
export function renameFolderStmts(folder: MapFolder, rawName: string): Stmt[] | null {
  const name = cleanName(rawName)
  if (!name) return null
  const { emoji } = splitEmoji(folder.name)
  return [update('folders', folder.id, { name: emoji ? `${emoji}${name}` : name })]
}
export function renameListStmts(list: MapList, rawName: string): Stmt[] | null {
  const name = cleanName(rawName)
  if (!name || list.kind === 'inbox') return null
  return [update('lists', list.id, { name })]
}
/** 새 폴더(이름만, 맨 끝) */
export function createFolderStmts(folders: MapFolder[], rawName: string): { id: string; stmts: Stmt[] } | null {
  const name = cleanName(rawName)
  if (!name) return null
  const id = uuid()
  return { id, stmts: [insert('folders', { id, name, sort_order: folders.reduce((m, f) => Math.max(m, f.sort_order), 0) + 1 })] }
}

// ── 순서·목표 선(map_links) ──
const LINK_SQL = 'SELECT id, kind, from_type, from_id, to_id, source, state, created_at FROM map_links'
export async function readLinks() {
  return (await getDb()).getAll<MapLink>(LINK_SQL)
}
/** 순서·목표 선 잇기(사용자). 고리면 'cycle' */
export async function connect(kind: 'sequence' | 'goal', from: string, to: string): Promise<'ok' | 'cycle' | 'exists'> {
  const links = await readLinks()
  const same = links.find((l) => l.kind === kind && l.from_id === from && l.to_id === to)
  if (same?.state === 'accepted') return 'exists'
  if (kind === 'sequence' && wouldCycle(links.filter((l) => l !== same && l.state === 'accepted'), from, to)) return 'cycle'
  await run(same ? update('map_links', same.id, { state: 'accepted', source: 'user' }) : insert('map_links', { id: uuid(), kind, from_type: kind === 'goal' ? 'kpi' : 'task', from_id: from, to_id: to, source: 'user', state: 'accepted' }))
  return 'ok'
}
/** 예전 AI 제안 ✓ — 순서 선은 받아들일 때 다시 고리 검사 */
export async function acceptLink(id: string): Promise<'ok' | 'cycle'> {
  const links = await readLinks()
  const l = links.find((x) => x.id === id)
  if (!l) return 'ok'
  if (l.kind === 'sequence' && wouldCycle(links.filter((x) => x.id !== id && x.state === 'accepted'), l.from_id, l.to_id)) return 'cycle'
  await run(update('map_links', id, { state: 'accepted' }))
  return 'ok'
}
/** ✕ 무시 = dismissed로 남겨 다시 제안하지 않음. 받아들인 선 끊기 = 지움 */
export async function dropLink(id: string, state: string) {
  await run(state === 'suggested' ? update('map_links', id, { state: 'dismissed' }) : remove('map_links', id))
}
