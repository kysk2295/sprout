// 14 §0 그래프 보기(기본) v2.0 — 뿌리 → 폴더·리스트 → 폴더 안 리스트 → 할 일을 위→아래로(dagre), 선 3종(포함·순서·목표 연결)
import '@xyflow/react/dist/style.css'
import {
  Background, BackgroundVariant, BaseEdge, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, getBezierPath, useInternalNode, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps, type OnConnectEnd, type Viewport
} from '@xyflow/react'
import { Check, Maximize2, Minus, Plus, Sparkles, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { autoCollapse, folderView, highlightSet, isCollapsed, layoutMap, listTitle, zoneAt, type LayoutEdge, type LayoutNode, type MapFolder, type MapGoal, type MapList, type MapTask, type MapTree } from '../../data/map'
import { goalPathText, GoalHead, GoalMenu, renameGoal, toggleGoal } from './GoalBits'
import { SUGGEST } from '../../data/listSuggest'
import { CardMenu, FolderIcon, FolderMenu, ListIcon, ListMenu, NameInput, Ring, TaskCard, twoLine, type MapActions } from './parts'
import { useStored, type LinkRow, type MapData } from './useMapData'
import { MenuItem, Popover } from '../Popover'
import { Unlink } from 'lucide-react'

export type LinkActions = {
  connect: (kind: 'sequence' | 'goal', from: string, to: string) => void
  accept: (linkId: string) => void
  drop: (linkId: string, state: string) => void
}
type Ctx = {
  data: MapData
  actions: MapActions
  links: LinkActions
  hl: Set<string> | null
  collapsed: Record<string, boolean>
  toggle: (id: string) => void
  listOf: Map<string, MapList>
  folderOf: Map<string, MapFolder>
  goalOf: Map<string, MapGoal>
  taskOf: Map<string, MapTask>
  hidden: Map<string, number>
  listCount: Map<string, number>
  /** 31 v3: 지금 집중으로 흐린 묶음 노드 · 끌어 놓을 목표 노드 */
  quiet: Set<string>
  dropGoal: string | null
}
const GraphCtx = createContext<Ctx>(null as never)
type N = Node<{ l: LayoutNode }>
const dim = (ctx: Ctx, id: string) => (ctx.hl && !ctx.hl.has(id) ? ' is-dim' : '') + (ctx.quiet.has(id) ? ' is-quiet' : '')
/** 2026-10-05 → `10월 5일–11일`(달이 바뀌면 `9월 29일–10월 5일`) */
export function weekRange(ws: string) {
  const a = new Date(`${ws}T00:00`)
  const b = new Date(a); b.setDate(b.getDate() + 6)
  return `${a.getMonth() + 1}월 ${a.getDate()}일–${a.getMonth() === b.getMonth() ? '' : `${b.getMonth() + 1}월 `}${b.getDate()}일`
}

function RootNode({ id }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const goal = ctx.data.grouped.by === 'goal'
  return <div className={`map-node map-node--root${goal ? ' map-node--root-goal' : ''}${dim(ctx, id)}`}>{goal ? `🌱 이번 주 목표 · ${weekRange(ctx.data.goalWeek)}` : '나의 할 일'}<Handle type="source" position={Position.Bottom} isConnectable={false} /></div>
}
/** 31 §3.2 목표 노드(목표 묶기 1층): 체크 · 🎯 제목 · 남은 길 · 진행 고리 · 보상 */
function GoalGroupNode({ id, data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const g = ctx.goalOf.get(l.ref!)
  const folded = ctx.hidden.has(id)
  if (!g) return null
  return (
    <div className={`map-node map-node--goalgroup${g.status === 'achieved' ? ' is-achieved' : ''}${ctx.dropGoal === g.id ? ' is-drop' : ''}${dim(ctx, id)}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <GoalHead goal={g} data={ctx.data} editing={ctx.actions.editing === id} onRename={async (v) => { const ok = await renameGoal(g, v); if (ok) ctx.actions.setEditing(null); return ok }} onCancel={() => ctx.actions.setEditing(null)} />
      {(ctx.hidden.get(id) ?? 0) > 0 || !folded ? <button className="map-fold nodrag" onClick={(e) => { e.stopPropagation(); ctx.toggle(id) }} title={folded ? '펼치기' : '접기'}>{folded ? `+${ctx.hidden.get(id) ?? 0}` : '−'}</button> : null}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}
/** 목표 없는 할 일 N(처음 접힘) */
function NoGoalNode({ id }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const folded = ctx.hidden.has(id)
  const sec = ctx.data.grouped.by === 'goal' ? ctx.data.grouped.tree.sections.find((s) => s.kind === 'nogoal') : undefined
  return (
    <div className={`map-node map-node--nogoal${ctx.dropGoal === 'nogoal' ? ' is-drop' : ''}${dim(ctx, id)}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <span className="map-node__name">목표 없는 할 일</span>
      <span className="map-node__count">{sec?.count ?? 0}</span>
      <button className="map-fold nodrag" onClick={(e) => { e.stopPropagation(); ctx.toggle(id) }} title={folded ? '펼치기' : '접기'}>{folded ? `+${ctx.hidden.get(id) ?? 0}` : '−'}</button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}
function FolderNode({ id, data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const folder = ctx.folderOf.get(l.ref!)
  const group = ctx.data.tree.groups.find((g) => g.kind === 'folder' && g.id === l.ref)
  const folded = ctx.hidden.has(id)
  if (!folder) return null
  return (
    <div className={`map-node map-node--area${dim(ctx, id)}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <FolderIcon name={folder.name} />
      {ctx.actions.editing === id
        ? <NameInput initial={folderView(folder.name).name} onSave={(v) => ctx.actions.renameFolder(folder, v)} onCancel={() => ctx.actions.setEditing(null)} />
        : <span className="map-node__name">{folderView(folder.name).name}</span>}
      <span className="map-node__count">{group?.count ?? 0}</span>
      <button className="map-fold nodrag" onClick={(e) => { e.stopPropagation(); ctx.toggle(id) }} title={folded ? '펼치기' : '접기'}>{folded ? `+${ctx.hidden.get(id) ?? 0}` : '−'}</button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}
/** 리스트 노드: 폴더 밖(1층) = 폴더 노드 크기 + 개수, 폴더 안(2층) = 진행 고리 + 완료/전체 */
function ListNode({ id, data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const list = ctx.listOf.get(l.ref!)
  const folded = ctx.hidden.has(id)
  if (!list) return null
  const name = ctx.actions.editing === id
    ? <NameInput initial={list.name} onSave={(v) => ctx.actions.renameList(list, v)} onCancel={() => ctx.actions.setEditing(null)} />
    : <span className="map-node__name">{listTitle(list)}</span>
  const n = ctx.listCount.get(list.id) ?? 0
  const fold = n > 0 && <button className="map-fold nodrag" onClick={(e) => { e.stopPropagation(); ctx.toggle(id) }} title={folded ? '펼치기' : '접기'}>{folded ? `+${ctx.hidden.get(id) ?? 0}` : '−'}</button>
  if (l.level === 1) {
    const group = ctx.data.tree.groups.find((g) => g.kind === 'list' && g.id === list.id)
    const inbox = list.kind === 'inbox'
    return (
      <div className={`map-node map-node--area${dim(ctx, id)}`}>
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <ListIcon list={list} />
        {name}
        {list.color && <span className="map-dot" style={{ background: list.color }} />}
        <span className="map-node__count">{group?.count ?? 0}</span>
        {inbox && (group?.count ?? 0) > SUGGEST.inboxCard && <button className="map-fold map-fold--ai nodrag" title="기본함 정리 — AI가 리스트를 제안해요" aria-label="기본함 정리" onClick={(e) => { e.stopPropagation(); ctx.actions.organize() }}><Sparkles /></button>}
        {fold}
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
      </div>
    )
  }
  const p = ctx.data.progress.get(list.id) ?? { done: 0, total: 0 }
  return (
    <div className={`map-node map-node--topic${dim(ctx, id)}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Ring done={p.done} total={p.total} />
      <ListIcon list={list} />
      {name}
      <span className="map-node__prog">{p.done}/{p.total}</span>
      {fold}
      <Handle id="stem" type="source" position={Position.Bottom} isConnectable={false} className="map-handle--stem" />
    </div>
  )
}
function AnchorNode() {
  return <div className="map-node--anchor"><Handle type="target" position={Position.Top} isConnectable={false} /><Handle id="stem" type="source" position={Position.Bottom} isConnectable={false} /></div>
}
function TaskNode({ id, data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const task = ctx.taskOf.get(l.ref!)
  if (!task) return null
  return (
    <div className={`map-node--task${dim(ctx, id)}${ctx.hl?.has(id) && ctx.hl.size > 1 ? ' is-hl' : ''}`}>
      <Handle id="stem" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="in" type="target" position={Position.Top} isConnectable={false} />
      <TaskCard task={task} data={ctx.data} actions={ctx.actions} variant="graph" />
      <Handle id="out" type="source" position={Position.Bottom} className="map-handle--seq" title="끌어서 다른 할 일에 놓으면 '먼저 해야 함' 선" />
      <Handle id="goal" type="target" position={Position.Bottom} isConnectable={false} className="map-handle--goal" />
      <Handle id="memo" type="target" position={Position.Right} isConnectable={false} />
    </div>
  )
}
function GoalNode({ id, data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const g = ctx.goalOf.get(l.ref!)
  if (!g) return null
  const path = goalPathText(g, ctx.data)
  return (
    <div className={`map-node map-node--goal${path ? ' has-path' : ''}${g.status === 'achieved' ? ' is-achieved' : ''}${dim(ctx, id)}`} title={g.status === 'achieved' ? '달성한 목표' : '손잡이를 끌어 할 일에 놓으면 목표 연결 · 누르면 남은 길'}>
      <Handle id="out" type="source" position={Position.Top} className="map-handle--goal-out" />
      <span className="map-node__name">🎯 {g.title}</span>
      {path && <span className="map-goal__path">{path}</span>}
    </div>
  )
}
function LaneNode() {
  return <div className="map-lane">🎯 이번 주 하고 싶은 일 (성장 탭)</div>
}
function MemoNode({ data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const m = ctx.data.memos.find((x) => x.id === l.ref)
  return <div className="map-node--memo"><Handle type="source" position={Position.Left} isConnectable={false} />{m?.title}</div>
}
const nodeTypes = { root: RootNode, folder: FolderNode, list: ListNode, anchor: AnchorNode, task: TaskNode, goal: GoalNode, goalgroup: GoalGroupNode, nogoal: NoGoalNode, lane: LaneNode, memo: MemoNode }

/** 줄기선: 주제 왼쪽 아래에서 내려와 할 일 왼쪽으로 꺾인다 */
function StemEdge({ sourceX, sourceY, targetX, targetY, style, className }: EdgeProps & { className?: string }) {
  const x = sourceX
  const d = targetY - sourceY > 8 ? `M${x} ${sourceY} L${x} ${targetY - 8} Q${x} ${targetY} ${x + 8} ${targetY} L${targetX} ${targetY}` : `M${x} ${sourceY} L${targetX} ${targetY}`
  return <path d={d} className={`react-flow__edge-path ${className ?? ''}`} style={style} fill="none" />
}
/** 순서·목표 선. AI 제안은 점선 + ✓ ✕ */
function LinkEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps<Edge<{ link: LinkRow }>>) {
  const ctx = useContext(GraphCtx)
  const link = data!.link
  const from = useInternalNode(source)
  const to = useInternalNode(target)
  let [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  // 같은 주제 열에 쌓인 할 일끼리의 순서 선은 카드 사이 8px 틈에 묻힌다 → 시안 ③-b처럼 오른쪽으로 휘어 오른쪽 가운데로 들어간다
  if (link.kind === 'sequence' && from && to && Math.abs(sourceX - targetX) < 40) {
    const right = (n: NonNullable<typeof from>) => ({ x: n.internals.positionAbsolute.x + (n.measured.width ?? 0), y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2 })
    const a = right(from), b = right(to)
    const bulge = 22 + Math.min(40, Math.abs(b.y - a.y) / 6)
    path = `M ${a.x} ${a.y} C ${a.x + bulge} ${a.y}, ${b.x + bulge} ${b.y}, ${b.x + 2} ${b.y}`
    lx = Math.max(a.x, b.x) + bulge * 0.75
    ly = (a.y + b.y) / 2
  }
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={14} />
      {link.state === 'suggested' && (
        <EdgeLabelRenderer>
          <div className="map-sugg nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            <button title="연결 받아들이기" onClick={() => ctx.links.accept(link.id)}><Check /></button>
            <button title="무시" onClick={() => ctx.links.drop(link.id, 'suggested')}><X /></button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
const edgeTypes = { stem: StemEdge, link: LinkEdge }

type Props = { data: MapData; actions: MapActions; links: LinkActions; onBlank: () => void; reveal?: { id: string; n: number }; say: (text: string) => void; onGrowth?: () => void }
export function MapGraph(props: Props) {
  return <ReactFlowProvider><Graph {...props} /></ReactFlowProvider>
}

function Graph({ data, actions, links, onBlank, reveal, say, onGrowth }: Props) {
  const flow = useReactFlow()
  const [collapsed, setCollapsed] = useStored<Record<string, boolean>>('collapsed', {})
  const [viewport, setViewport] = useStored<Viewport | { none: true }>('viewport', { none: true })
  const [hlId, setHlId] = useState<string | null>(null)
  const [edgeSel, setEdgeSel] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ node: LayoutNode; point: { x: number; y: number } } | { edge: LinkRow; point: { x: number; y: number } }>()
  const [dropGoal, setDropGoal] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const goalMode = data.grouped.by === 'goal'
  const tree: MapTree = data.grouped.by === 'list' ? data.grouped.tree : data.tree

  // 31 §1.2 지금 집중: 지금 할 일이 없는 묶음은 자동으로 접는다(접힘 기억은 건드리지 않음)
  const { quiet, focusFold } = useMemo(() => {
    const q = new Set<string>()
    const f: Record<string, boolean> = {}
    if (!actions.focusNow) return { quiet: q, focusFold: f }
    const hasNow = (ts: MapTask[]) => ts.some((t) => data.state.get(t.id) === 'now')
    const mark = (key: string, ts: MapTask[]) => { if (!hasNow(ts)) { q.add(key); f[key] = true } }
    if (data.grouped.by === 'goal') {
      for (const s of data.grouped.tree.sections) {
        const key = s.kind === 'goal' ? `goal:${s.id}` : 'nogoal'
        mark(key, s.lists.flatMap((l) => l.tasks))
        for (const l of s.lists) mark(`${key}/list:${l.list.id}`, l.tasks)
      }
    } else {
      for (const g of tree.groups) {
        if (g.kind === 'list') mark(`list:${g.id}`, g.tasks)
        else { mark(`folder:${g.id}`, g.lists.flatMap((l) => l.tasks)); for (const l of g.lists) mark(`list:${l.list.id}`, l.tasks) }
      }
    }
    return { quiet: q, focusFold: f }
  }, [actions.focusNow, data, tree])
  const shownCollapsed = useMemo(() => ({ ...collapsed, ...focusFold }), [collapsed, focusFold])

  const layout = useMemo(() => layoutMap({
    tree, links: data.links, goals: goalMode ? [] : data.goals, collapsed: shownCollapsed, memos: data.memos,
    hasDate: (id) => { const t = data.byId.get(id); return !!t && twoLine(t, data) },
    goalTree: data.grouped.by === 'goal' ? data.grouped.tree : undefined,
    pathGoals: new Set(data.goals.filter((g) => data.goalLinks.has(g.id)).map((g) => g.id))
  }), [data, shownCollapsed, tree, goalMode])
  // 접힌 노드의 +N(숨은 할 일 수)
  const auto = useMemo(() => autoCollapse(tree), [tree])
  const { hidden, listCount } = useMemo(() => {
    const m = new Map<string, number>()
    const lc = new Map<string, number>()
    const collapsed = shownCollapsed
    if (data.grouped.by === 'goal') {
      for (const s of data.grouped.tree.sections) {
        const key = s.kind === 'goal' ? `goal:${s.id}` : 'nogoal'
        const n = s.lists.reduce((k, l) => k + l.tasks.length, 0)
        if (collapsed[key] ?? s.kind === 'nogoal') m.set(key, n)
        for (const l of s.lists) {
          lc.set(l.list.id, (lc.get(l.list.id) ?? 0) + l.tasks.length)
          if (isCollapsed(collapsed, `${key}/list:${l.list.id}`, auto, true)) m.set(`${key}/list:${l.list.id}`, l.tasks.length)
        }
      }
      return { hidden: m, listCount: lc }
    }
    for (const g of tree.groups) {
      const key = `${g.kind}:${g.id}`
      if (g.kind === 'list') {
        lc.set(g.id, g.tasks.length)
        if (isCollapsed(collapsed, key, auto)) m.set(key, g.tasks.length)
        continue
      }
      if (isCollapsed(collapsed, key, auto)) m.set(key, g.lists.reduce((n, l) => n + l.tasks.length, 0))
      for (const l of g.lists) {
        lc.set(l.list.id, l.tasks.length)
        if (isCollapsed(collapsed, `list:${l.list.id}`, auto, true)) m.set(`list:${l.list.id}`, l.tasks.length)
      }
    }
    return { hidden: m, listCount: lc }
  }, [data.grouped, tree, shownCollapsed, auto])
  // 폴더 안 리스트는 자동 접기 대상(2층) — 노드 id만으로는 층을 몰라서 지금 보이는 상태를 뒤집는다
  const toggle = useCallback((id: string) => setCollapsed((c) => ({ ...c, [id]: !(c[id] ?? hidden.has(id)) })), [setCollapsed, hidden])

  // 목표 노드를 누르면 남은 길(가장 긴 사슬)만 강조(31 §1.2), 그 밖은 뿌리까지의 길
  const hl = useMemo(() => {
    if (!hlId) return null
    if (hlId.startsWith('goal:')) {
      const p = data.paths.get(hlId.slice(5))
      return new Set([hlId, ...(p?.chain ?? []).map((t) => `task:${t}`)])
    }
    return highlightSet(layout.edges, hlId)
  }, [hlId, layout, data.paths])
  const [nodes, setNodes] = useState<N[]>([])
  const inboxId = useMemo(() => new Set(data.lists.filter((x) => x.kind === 'inbox').map((x) => x.id)), [data.lists])
  const baseNodes = useMemo<N[]>(() => layout.nodes.map((l) => ({
    id: l.id, type: l.kind, position: { x: l.x, y: l.y }, data: { l }, width: l.w, height: l.h,
    draggable: l.kind === 'task' || (l.kind === 'list' && !inboxId.has(l.ref!) && !goalMode), selectable: l.kind !== 'lane' && l.kind !== 'anchor', connectable: l.kind === 'task' || l.kind === 'goal',
    className: `map-rf map-rf--${l.kind}`
  })), [layout, inboxId, goalMode])
  useEffect(() => setNodes(baseNodes), [baseNodes])

  const edges = useMemo<Edge[]>(() => layout.edges.map((e: LayoutEdge) => {
    const on = hl ? hl.has(e.source) && hl.has(e.target) : false
    const cls = `map-edge map-edge--${e.kind}${e.link?.state === 'suggested' ? ' is-sugg' : ''}${on ? ' is-hl' : hl ? ' is-dim' : ''}${edgeSel === e.id ? ' is-sel' : ''}`
    if (e.kind === 'seq' || e.kind === 'goal') {
      const color = e.kind === 'goal' ? 'var(--map-goal)' : 'var(--color-text-secondary)'
      return { id: e.id, source: e.source, target: e.target, type: 'link', sourceHandle: 'out', targetHandle: e.kind === 'goal' ? 'goal' : 'in', className: cls, data: { link: e.link }, markerEnd: { type: 'arrowclosed' as never, color, width: 14, height: 14 }, selectable: true }
    }
    if (e.kind === 'stem') return { id: e.id, source: e.source, target: e.target, type: 'stem', sourceHandle: 'stem', targetHandle: 'stem', className: cls, selectable: false }
    if (e.kind === 'memo') return { id: e.id, source: e.source, target: e.target, targetHandle: 'memo', className: cls, selectable: false }
    return { id: e.id, source: e.source, target: e.target, className: cls, selectable: false }
  }), [layout, hl, edgeSel])

  const ctx: Ctx = useMemo(() => ({
    data, actions, links, hl, collapsed: shownCollapsed, toggle, hidden, listCount, quiet, dropGoal,
    listOf: new Map(data.lists.map((x) => [x.id, x])), folderOf: new Map(data.folders.map((f) => [f.id, f])), goalOf: new Map(data.goals.map((g) => [g.id, g])), taskOf: data.byId
  }), [data, actions, links, hl, shownCollapsed, toggle, hidden, listCount, quiet, dropGoal])

  // 지금 띠 알약 클릭 → 그 노드로 0.25초 이동(접혀 있으면 펼친다)
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!reveal) return
    const n = layout.nodes.find((x) => x.id === `task:${reveal.id}`)
    if (n) { setHlId(null); void flow.setCenter(n.x + n.w / 2, n.y + n.h / 2, { zoom: Math.max(flow.getZoom(), 0.8), duration: 250 }); pending.current = null; return }
    if (pending.current === reveal.id) return
    pending.current = reveal.id
    const t = data.byId.get(reveal.id)
    if (!t) return
    const open: Record<string, boolean> = {}
    if (data.grouped.by === 'goal') {
      for (const s of data.grouped.tree.sections) {
        const key = s.kind === 'goal' ? `goal:${s.id}` : 'nogoal'
        for (const l of s.lists) if (l.tasks.some((x) => x.id === t.id)) { open[key] = false; open[`${key}/list:${l.list.id}`] = false }
      }
    } else {
      const l = data.lists.find((x) => x.id === t.list_id)
      if (l) { open[`list:${l.id}`] = false; if (l.folder_id) open[`folder:${l.folder_id}`] = false }
    }
    setCollapsed((c) => ({ ...c, ...open }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, layout])

  // 집중 보기: 영역을 두 번 누르면 그 영역만 화면에 맞춤. Esc · ⤢ = 전체
  // 전체 맞춤(⤢·Esc): 다 들어가게, 단 0.5배 아래로는 줄이지 않는다. 처음 열 때는 글자를 읽을 수 있게 0.8배에서 멈춘다.
  // 세로는 위에 붙인다(시안 ③-b: 뿌리가 맨 위), 가로는 가운데(뿌리)
  const fitAll = useCallback((floor = 0.5, duration = 250, fixed?: number) => {
    const el = wrap.current
    const ns = flow.getNodes()
    if (!el || !ns.length) return
    const b = flow.getNodesBounds(ns)
    const pad = 24
    const zoom = fixed ?? Math.max(floor, Math.min(1, (el.clientWidth - pad * 2) / b.width, (el.clientHeight - pad * 2) / b.height))
    const x = (el.clientWidth - b.width * zoom) / 2 - b.x * zoom // 넘치면 가운데(뿌리)를 기준으로
    void flow.setViewport({ x, y: pad - b.y * zoom, zoom }, { duration })
  }, [flow])
  const focusArea = (id: string) => {
    const ids = new Set([id])
    let grew = true
    while (grew) { grew = false; for (const e of layout.edges) if ((e.kind === 'contain' || e.kind === 'stem') && ids.has(e.source) && !ids.has(e.target)) { ids.add(e.target); grew = true } }
    void flow.fitView({ nodes: [...ids].map((x) => ({ id: x })), padding: 0.15, duration: 300, maxZoom: 1.25 })
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,textarea,[contenteditable]') || document.querySelector('.popover,[aria-modal="true"]')) return
      if (e.key === 'Escape') { setHlId(null); setEdgeSel(null); fitAll() }
      // 목표 노드에서 Space = 달성 표시(31 §3.3)
      if (e.key === ' ' && hlId?.startsWith('goal:')) { const g = data.goals.find((x) => x.id === hlId.slice(5)); if (g) { e.preventDefault(); void toggleGoal(g) } }
      if ((e.key === 'Delete' || e.key === 'Backspace') && edgeSel) {
        const l = layout.edges.find((x) => x.id === edgeSel)?.link
        if (l) { links.drop(l.id, l.state); setEdgeSel(null) }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); void flow.zoomIn({ duration: 150 }) }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); void flow.zoomOut({ duration: 150 }) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [edgeSel, layout, links, flow, fitAll, hlId, data.goals])

  // 처음(기억한 배율이 없을 때)은 전체 맞춤
  const first = useRef(true)
  useEffect(() => {
    if (!first.current || !baseNodes.length) return
    first.current = false
    // 배율만 기억한다(14 §0.5). 위치는 지도가 바뀌면 의미가 없어서 매번 뿌리 기준으로 맞춘다
    window.setTimeout(() => fitAll(0.8, 0, 'zoom' in viewport ? Math.min(2, Math.max(0.25, viewport.zoom)) : undefined), 30)
  }, [baseNodes, viewport, fitAll])

  // 끌어 옮기기: 할 일 → 놓은 자리의 리스트(list_id), 리스트 → 놓은 자리의 폴더(뿌리에 놓으면 폴더 밖). 아니면 제자리로
  const onDragStop = (e: MouseEvent | TouchEvent, node: N) => {
    const l = node.data.l
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    const p = flow.screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
    setDropGoal(null)
    if (l.kind === 'task') {
      // 목표 묶기: 다른 목표(또는 목표 없음) 묶음에 놓으면 목표 선을 옮긴다(31 §3.3)
      if (goalMode) {
        const gz = zoneAt(layout.zones, 'goal', p)
        const curGoal = sectionOf(l.group)
        if (gz && gz.id !== curGoal) { void actions.linkGoal(l.ref!, gz.id === 'nogoal' ? null : gz.id); return }
      }
      const zone = zoneAt(layout.zones, 'list', p)
      const cur = data.byId.get(l.ref!)?.list_id
      if (zone && zone.id !== cur) { void actions.moveTask(l.ref!, zone.id); return }
    }
    if (l.kind === 'list') {
      const list = data.lists.find((x) => x.id === l.ref)
      const root = layout.nodes.find((n) => n.kind === 'root')!
      const onRoot = p.x >= root.x - 20 && p.x <= root.x + root.w + 20 && p.y >= root.y - 20 && p.y <= root.y + root.h + 20
      const zone = zoneAt(layout.zones, 'folder', p)
      if (list && zone && zone.id !== list.folder_id) { void actions.moveList(list.id, zone.id); return }
      if (list && onRoot && list.folder_id) { void actions.moveList(list.id, null); return }
    }
    setNodes(baseNodes)
  }
  const sectionOf = (group?: string) => (!group ? null : group === 'nogoal' ? 'nogoal' : group.startsWith('goal:') ? group.slice(5) : null)
  const onDrag = (e: MouseEvent | TouchEvent, node: N) => {
    if (!goalMode || node.data.l.kind !== 'task') return
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    const gz = zoneAt(layout.zones, 'goal', flow.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }))
    const next = gz && gz.id !== sectionOf(node.data.l.group) ? gz.id : null
    if (next !== dropGoal) setDropGoal(next)
  }
  // 손잡이를 끌어 할 일에 놓기: 할 일 → 할 일 = 순서, 목표 → 할 일 = 목표 연결
  const onConnectEnd: OnConnectEnd = (e, state) => {
    const from = state.fromNode
    if (!from) return
    let toId = state.toNode?.id
    if (!toId) {
      const pt = 'changedTouches' in e ? e.changedTouches[0] : e
      toId = (document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node') as HTMLElement | null)?.dataset.id
    }
    if (!toId?.startsWith('task:') || toId === from.id) return
    const to = toId.slice(5)
    if (from.id.startsWith('task:')) links.connect('sequence', from.id.slice(5), to)
    else if (from.id.startsWith('goal:')) links.connect('goal', from.id.slice(5), to)
  }

  return (
    <GraphCtx.Provider value={ctx}>
      <div className="map-canvas" ref={wrap}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={(changes) => setNodes((ns) => {
            const pos = new Map(changes.filter((c) => c.type === 'position' && c.position).map((c) => [(c as { id: string }).id, (c as { position: { x: number; y: number } }).position]))
            return pos.size ? ns.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)) : ns
          })}
          onNodeClick={(_, n) => {
            setEdgeSel(null)
            if (n.type === 'lane' || n.type === 'anchor') return
            setHlId(n.id)
            if (n.type === 'task') actions.open(n.data.l.ref!)
          }}
          onNodeDoubleClick={(_, n) => { if (n.type === 'folder' || n.type === 'goalgroup' || n.type === 'nogoal' || (n.type === 'list' && n.data.l.level === 1)) focusArea(n.id) }}
          onNodeContextMenu={(e, n) => {
            e.preventDefault()
            const l = n.data.l
            if (l.kind === 'folder' || l.kind === 'list' || l.kind === 'task' || l.kind === 'goal' || l.kind === 'goalgroup') setMenu({ node: l, point: { x: e.clientX, y: e.clientY } })
          }}
          onEdgeClick={(_, e) => { if (e.type === 'link') { setEdgeSel(e.id); setHlId(null) } }}
          onEdgeContextMenu={(ev, e) => { if (e.type === 'link') { ev.preventDefault(); setEdgeSel(e.id); setMenu({ edge: (e.data as { link: LinkRow }).link, point: { x: ev.clientX, y: ev.clientY } }) } }}
          onPaneClick={() => { setHlId(null); setEdgeSel(null); onBlank() }}
          onNodeDragStop={onDragStop}
          onNodeDrag={onDrag}
          onConnectEnd={onConnectEnd}
          isValidConnection={(c) => c.target !== c.source && c.target.startsWith('task:')}
          onMoveEnd={(_, vp) => setViewport(vp)}
          minZoom={0.25}
          maxZoom={2}
          panOnScroll
          zoomOnScroll={false}
          zoomActivationKeyCode={['Meta', 'Control']}
          zoomOnPinch
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          nodesFocusable={false}
          elevateEdgesOnSelect={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} className="map-dots" />
          <MiniMap className="map-minimap" pannable zoomable nodeBorderRadius={2} nodeColor={(n) => (n.type === 'task' ? 'var(--color-text-quaternary)' : n.type === 'goal' ? 'var(--map-goal)' : n.type === 'lane' || n.type === 'anchor' ? 'transparent' : 'var(--color-text-tertiary)')} maskColor="rgba(0,0,0,0.08)" />
        </ReactFlow>
        <div className="map-zoom">
          <button aria-label="확대" title="확대 (⌘+)" onClick={() => void flow.zoomIn({ duration: 150 })}><Plus /></button>
          <button aria-label="축소" title="축소 (⌘−)" onClick={() => void flow.zoomOut({ duration: 150 })}><Minus /></button>
          <button aria-label="전체 보기" title="전체 보기 (Esc)" onClick={() => { setHlId(null); fitAll() }}><Maximize2 /></button>
        </div>
      </div>
      {menu && 'node' in menu && menu.node.kind === 'folder' && (() => { const f = ctx.folderOf.get(menu.node.ref!); return f && <FolderMenu folder={f} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} /> })()}
      {menu && 'node' in menu && menu.node.kind === 'list' && (() => { const x = ctx.listOf.get(menu.node.ref!); return x && <ListMenu list={x} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} /> })()}
      {menu && 'node' in menu && menu.node.kind === 'task' && (() => { const t = data.byId.get(menu.node.ref!); return t && <CardMenu task={t} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} /> })()}
      {menu && 'node' in menu && (menu.node.kind === 'goal' || menu.node.kind === 'goalgroup') && (() => {
        const g = ctx.goalOf.get(menu.node.ref!)
        const nodeId = menu.node.id
        return g && <GoalMenu goal={g} point={menu.point} onClose={() => setMenu(undefined)} say={say} onGrowth={onGrowth}
          onRename={() => { if (menu.node.kind === 'goalgroup') actions.setEditing(nodeId); else say('목표 이름은 목표로 묶기나 성장 탭에서 바꿀 수 있어요') }} />
      })()}
      {menu && 'edge' in menu && (
        <Popover point={menu.point} onClose={() => setMenu(undefined)} width={170} className="menu">
          {menu.edge.state === 'suggested' && <MenuItem icon={<Check />} label="연결 받아들이기" onClick={() => { setMenu(undefined); links.accept(menu.edge.id) }} />}
          <MenuItem icon={<Unlink />} label={menu.edge.state === 'suggested' ? '무시' : '연결 끊기'} onClick={() => { setMenu(undefined); links.drop(menu.edge.id, menu.edge.state); setEdgeSel(null) }} />
        </Popover>
      )}
    </GraphCtx.Provider>
  )
}
