// 14 §0 그래프 보기(기본) — 뿌리 → 영역 → 세부 주제 → 할 일을 위→아래로(dagre), 선 3종(포함·순서·목표 연결)
import '@xyflow/react/dist/style.css'
import {
  Background, BackgroundVariant, BaseEdge, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, getBezierPath, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps, type OnConnectEnd, type Viewport
} from '@xyflow/react'
import { Check, Maximize2, Minus, Plus, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { autoCollapse, highlightSet, isCollapsed, layoutMap, UNCLASSIFIED, type LayoutEdge, type LayoutNode, type MapArea, type MapGoal, type MapTask } from '../../data/map'
import { AreaMenu, CardMenu, NameInput, Ring, TaskCard, TopicMenu, twoLine, type MapActions } from './parts'
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
  areaOf: Map<string, MapArea>
  goalOf: Map<string, MapGoal>
  taskOf: Map<string, MapTask>
  hidden: Map<string, number>
  topicCount: Map<string, number>
}
const GraphCtx = createContext<Ctx>(null as never)
type N = Node<{ l: LayoutNode }>
const dim = (ctx: Ctx, id: string) => (ctx.hl && !ctx.hl.has(id) ? ' is-dim' : '')

function RootNode({ id }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  return <div className={`map-node map-node--root${dim(ctx, id)}`}>나의 할 일<Handle type="source" position={Position.Bottom} isConnectable={false} /></div>
}
function AreaNode({ id, data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const area = l.ref ? ctx.areaOf.get(l.ref) : undefined
  const group = ctx.data.tree.areas.find((g) => g.area.id === l.ref)
  const count = group ? group.count : ctx.data.tree.unclassified.filter((t) => t.status === 0).length
  const folded = ctx.hidden.has(id)
  return (
    <div className={`map-node map-node--area${l.ref ? '' : ' is-none'}${dim(ctx, id)}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <span className="map-dot" style={{ background: area?.color ?? 'var(--color-text-quaternary)' }} />
      {area && ctx.actions.editing === area.id
        ? <NameInput initial={area.name} onSave={(v) => ctx.actions.rename(area.id, v)} onCancel={() => ctx.actions.setEditing(null)} />
        : <span className="map-node__name">{area?.name ?? '미분류'}</span>}
      <span className="map-node__count">{count}</span>
      <button className="map-fold nodrag" onClick={(e) => { e.stopPropagation(); ctx.toggle(id) }} title={folded ? '펼치기' : '접기'}>{folded ? `+${ctx.hidden.get(id) ?? 0}` : '−'}</button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}
function TopicNode({ id, data: { l } }: NodeProps<N>) {
  const ctx = useContext(GraphCtx)
  const topic = ctx.areaOf.get(l.ref!)!
  const p = ctx.data.progress.get(l.ref!) ?? { done: 0, total: 0 }
  const folded = ctx.hidden.has(id)
  if (!topic) return null
  return (
    <div className={`map-node map-node--topic${topic.archived_at ? ' is-archived' : ''}${dim(ctx, id)}`} title={topic.archived_at ? '보관한 주제' : undefined}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Ring done={p.done} total={p.total} />
      {ctx.actions.editing === topic.id
        ? <NameInput initial={topic.name} onSave={(v) => ctx.actions.rename(topic.id, v)} onCancel={() => ctx.actions.setEditing(null)} />
        : <span className="map-node__name">{topic.name}</span>}
      <span className="map-node__prog">{p.done}/{p.total}</span>
      {(ctx.topicCount.get(topic.id) ?? 0) > 0 && (
        <button className="map-fold nodrag" onClick={(e) => { e.stopPropagation(); ctx.toggle(id) }} title={folded ? '펼치기' : '접기'}>{folded ? `+${ctx.hidden.get(id)}` : '−'}</button>
      )}
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
    <div className={`map-node--task${dim(ctx, id)}`}>
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
  return (
    <div className={`map-node map-node--goal${g.status === 'achieved' ? ' is-achieved' : ''}${dim(ctx, id)}`} title={g.status === 'achieved' ? '달성한 목표' : '손잡이를 끌어 할 일에 놓으면 목표 연결'}>
      <Handle id="out" type="source" position={Position.Top} className="map-handle--goal-out" />
      <span className="map-node__name">🎯 {g.title}</span>
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
const nodeTypes = { root: RootNode, area: AreaNode, topic: TopicNode, anchor: AnchorNode, task: TaskNode, goal: GoalNode, lane: LaneNode, memo: MemoNode }

/** 줄기선: 주제 왼쪽 아래에서 내려와 할 일 왼쪽으로 꺾인다 */
function StemEdge({ sourceX, sourceY, targetX, targetY, style, className }: EdgeProps & { className?: string }) {
  const x = sourceX
  const d = targetY - sourceY > 8 ? `M${x} ${sourceY} L${x} ${targetY - 8} Q${x} ${targetY} ${x + 8} ${targetY} L${targetX} ${targetY}` : `M${x} ${sourceY} L${targetX} ${targetY}`
  return <path d={d} className={`react-flow__edge-path ${className ?? ''}`} style={style} fill="none" />
}
/** 순서·목표 선. AI 제안은 점선 + ✓ ✕ */
function LinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps<Edge<{ link: LinkRow }>>) {
  const ctx = useContext(GraphCtx)
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const link = data!.link
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

type Props = { data: MapData; actions: MapActions; links: LinkActions; onBlank: () => void }
export function MapGraph(props: Props) {
  return <ReactFlowProvider><Graph {...props} /></ReactFlowProvider>
}

function Graph({ data, actions, links, onBlank }: Props) {
  const flow = useReactFlow()
  const [collapsed, setCollapsed] = useStored<Record<string, boolean>>('collapsed', {})
  const [viewport, setViewport] = useStored<Viewport | { none: true }>('viewport', { none: true })
  const [hlId, setHlId] = useState<string | null>(null)
  const [edgeSel, setEdgeSel] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ node: LayoutNode; point: { x: number; y: number } } | { edge: LinkRow; point: { x: number; y: number } }>()
  const [addingTopic, setAddingTopic] = useState<{ id: string; point: { x: number; y: number } } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  const layout = useMemo(() => layoutMap({
    tree: data.tree, links: data.links, goals: data.goals, collapsed, memos: data.memos,
    hasDate: (id) => { const t = data.byId.get(id); return !!t && twoLine(t, data) }
  }), [data, collapsed])
  // 접힌 노드의 +N(숨은 할 일 수)
  const auto = useMemo(() => autoCollapse(data.tree), [data.tree])
  const { hidden, topicCount } = useMemo(() => {
    const m = new Map<string, number>()
    const tc = new Map<string, number>()
    for (const g of data.tree.areas) {
      const n = g.direct.length + g.topics.reduce((s, t) => s + t.tasks.length, 0)
      if (isCollapsed({ collapsed }, `area:${g.area.id}`, auto)) m.set(`area:${g.area.id}`, n)
      for (const t of g.topics) {
        tc.set(t.topic.id, t.tasks.length)
        if (isCollapsed({ collapsed }, `topic:${t.topic.id}`, auto)) m.set(`topic:${t.topic.id}`, t.tasks.length)
      }
    }
    if (collapsed[UNCLASSIFIED]) m.set(UNCLASSIFIED, data.tree.unclassified.length)
    return { hidden: m, topicCount: tc }
  }, [data.tree, collapsed, auto])
  const toggle = useCallback((id: string) => setCollapsed((c) => ({ ...c, [id]: !isCollapsed({ collapsed: c }, id, auto) })), [setCollapsed, auto])

  const hl = useMemo(() => (hlId ? highlightSet(layout.edges, hlId) : null), [hlId, layout])
  const [nodes, setNodes] = useState<N[]>([])
  const baseNodes = useMemo<N[]>(() => layout.nodes.map((l) => ({
    id: l.id, type: l.kind, position: { x: l.x, y: l.y }, data: { l }, width: l.w, height: l.h,
    draggable: l.kind === 'task', selectable: l.kind !== 'lane' && l.kind !== 'anchor', connectable: l.kind === 'task' || l.kind === 'goal',
    className: `map-rf map-rf--${l.kind}`
  })), [layout])
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
    data, actions, links, hl, collapsed, toggle, hidden, topicCount,
    areaOf: new Map(data.areas.map((a) => [a.id, a])), goalOf: new Map(data.goals.map((g) => [g.id, g])), taskOf: data.byId
  }), [data, actions, links, hl, collapsed, toggle, hidden, topicCount])

  // 집중 보기: 영역을 두 번 누르면 그 영역만 화면에 맞춤. Esc · ⤢ = 전체
  const fitAll = useCallback(() => { void flow.fitView({ padding: 0.12, duration: 250, maxZoom: 1 }) }, [flow])
  const focusArea = (id: string) => {
    const ids = new Set([id])
    let grew = true
    while (grew) { grew = false; for (const e of layout.edges) if ((e.kind === 'contain' || e.kind === 'stem') && ids.has(e.source) && !ids.has(e.target)) { ids.add(e.target); grew = true } }
    void flow.fitView({ nodes: [...ids].map((x) => ({ id: x })), padding: 0.15, duration: 300 })
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,textarea,[contenteditable]') || document.querySelector('.popover,[aria-modal="true"]')) return
      if (e.key === 'Escape') { setHlId(null); setEdgeSel(null); fitAll() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && edgeSel) {
        const l = layout.edges.find((x) => x.id === edgeSel)?.link
        if (l) { links.drop(l.id, l.state); setEdgeSel(null) }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); void flow.zoomIn({ duration: 150 }) }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); void flow.zoomOut({ duration: 150 }) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [edgeSel, layout, links, flow, fitAll])

  // 처음(기억한 배율이 없을 때)은 전체 맞춤
  const first = useRef(true)
  useEffect(() => {
    if (!first.current || !baseNodes.length) return
    first.current = false
    if ('none' in viewport) window.setTimeout(fitAll, 30)
  }, [baseNodes, viewport, fitAll])

  // 끌어 옮기기: 놓은 자리의 주제 열·영역으로. 아니면 제자리로
  const onDragStop = (e: MouseEvent | TouchEvent, node: N) => {
    const l = node.data.l
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    const p = flow.screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
    const zone = layout.zones.filter((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]
    const current = data.rowOf.get(l.ref!)?.area_id ?? null
    if (zone && zone.areaId !== current) void actions.place(l.ref!, zone.areaId)
    else setNodes(baseNodes)
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
          onNodeDoubleClick={(_, n) => { if (n.type === 'area') focusArea(n.id) }}
          onNodeContextMenu={(e, n) => {
            e.preventDefault()
            const l = n.data.l
            if ((l.kind === 'area' && l.ref) || l.kind === 'topic' || l.kind === 'task') setMenu({ node: l, point: { x: e.clientX, y: e.clientY } })
          }}
          onEdgeClick={(_, e) => { if (e.type === 'link') { setEdgeSel(e.id); setHlId(null) } }}
          onEdgeContextMenu={(ev, e) => { if (e.type === 'link') { ev.preventDefault(); setEdgeSel(e.id); setMenu({ edge: (e.data as { link: LinkRow }).link, point: { x: ev.clientX, y: ev.clientY } }) } }}
          onPaneClick={() => { setHlId(null); setEdgeSel(null); onBlank() }}
          onNodeDragStop={onDragStop}
          onConnectEnd={onConnectEnd}
          isValidConnection={(c) => c.target !== c.source && c.target.startsWith('task:')}
          onMoveEnd={(_, vp) => setViewport(vp)}
          defaultViewport={'none' in viewport ? undefined : viewport}
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
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--color-border-divider)" />
          <MiniMap className="map-minimap" pannable zoomable nodeBorderRadius={2} nodeColor={(n) => (n.type === 'task' ? 'var(--color-text-quaternary)' : n.type === 'goal' ? 'var(--map-goal)' : n.type === 'lane' || n.type === 'anchor' ? 'transparent' : 'var(--color-text-tertiary)')} maskColor="rgba(0,0,0,0.08)" />
        </ReactFlow>
        <div className="map-zoom">
          <button aria-label="확대" title="확대 (⌘+)" onClick={() => void flow.zoomIn({ duration: 150 })}><Plus /></button>
          <button aria-label="축소" title="축소 (⌘−)" onClick={() => void flow.zoomOut({ duration: 150 })}><Minus /></button>
          <button aria-label="전체 보기" title="전체 보기 (Esc)" onClick={() => { setHlId(null); fitAll() }}><Maximize2 /></button>
        </div>
      </div>
      {menu && 'node' in menu && menu.node.kind === 'area' && (() => { const a = ctx.areaOf.get(menu.node.ref!); return a && <AreaMenu area={a} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} onAddTopic={() => setAddingTopic({ id: a.id, point: menu.point })} /> })()}
      {menu && 'node' in menu && menu.node.kind === 'topic' && (() => { const a = ctx.areaOf.get(menu.node.ref!); return a && <TopicMenu topic={a} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} /> })()}
      {menu && 'node' in menu && menu.node.kind === 'task' && (() => { const t = data.byId.get(menu.node.ref!); return t && <CardMenu task={t} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} /> })()}
      {menu && 'edge' in menu && (
        <Popover point={menu.point} onClose={() => setMenu(undefined)} width={170} className="menu">
          {menu.edge.state === 'suggested' && <MenuItem icon={<Check />} label="연결 받아들이기" onClick={() => { setMenu(undefined); links.accept(menu.edge.id) }} />}
          <MenuItem icon={<Unlink />} label={menu.edge.state === 'suggested' ? '무시' : '연결 끊기'} onClick={() => { setMenu(undefined); links.drop(menu.edge.id, menu.edge.state); setEdgeSel(null) }} />
        </Popover>
      )}
      {addingTopic && (
        <Popover point={addingTopic.point} onClose={() => setAddingTopic(null)} width={220} className="map-pop-input">
          <NameInput placeholder="세부 주제 이름" onSave={async (v) => { const ok = !!(await actions.createArea(v, addingTopic.id)); if (ok) setAddingTopic(null); return ok }} onCancel={() => setAddingTopic(null)} />
        </Popover>
      )}
    </GraphCtx.Provider>
  )
}
