// 31 §12.9.5 관계도(프로젝트 안 두 번째 보기) — 프로젝트를 가운데 둔 방사형 캔버스(@xyflow/react, 전체 지도 그래프와 같은 바탕).
// 노드 = 프로젝트 · 할 일 · 사람 · 메모 · 리스트 · 관련 프로젝트, 선 = 구성 · 먼저 해야 함(→) · 관련(─) · 사람 · 메모 · 리스트 · 관련 프로젝트.
// 편집: 노드 끌기(자리 기억 sprout.map.relpos.v1) · 핸들로 잇기 · 선 클릭 → 종류 바꾸기·끊기 · Delete · ＋ 할 일·사람·메모 · 확대·맞춤·미니맵.
// 모양은 §12.9.0 차분한 디자인(회색 + 강조색 하나).
import '@xyflow/react/dist/style.css'
import {
  Background, BackgroundVariant, BaseEdge, ConnectionMode, EdgeLabelRenderer, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useInternalNode, useReactFlow,
  type Connection, type Edge, type EdgeProps, type InternalNode, type Node, type NodeChange, type NodeProps
} from '@xyflow/react'
import { Check, FileText, Folder, List, LocateFixed, Maximize2, Minus, Plus, RotateCcw, User, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent } from 'react'
import { createNoteFor, ensurePerson, projectPersonId, unlinkRelation } from '../../../data/projectEdit'
import { openTarget } from '../../../data/wiki'
import { dayKey } from '../../../lib/dates'
import { buildRelationGraph, connectPlan, NID, overlapping, radialLayout, type RelEdge, type RelNode } from '../../../lib/projectEdit'
import type { TaskActions } from '../../../lib/taskActions'
import { MenuItem, Popover } from '../../Popover'
import { useToast } from '../../Toast'
import { ProjectTaskMenu, type ProjectEdit } from './edit'
import { useRelationRows, type PlanData, type ProjectView, type PTaskRow } from './useProjects'
import './relgraph.css'

// ── 자리 기억(프로젝트마다) ──
type XY = { x: number; y: number }
const POS_KEY = 'sprout.map.relpos.v1'
const readPos = (projectId: string): Record<string, XY> => { try { return (JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') ?? {})[projectId] ?? {} } catch { return {} } }
const writePos = (projectId: string, pos: Record<string, XY> | null) => {
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') ?? {}
    if (pos) all[projectId] = pos; else delete all[projectId]
    localStorage.setItem(POS_KEY, JSON.stringify(all))
  } catch { /* 기억만 못 한다 */ }
}
/** 노드 크기 어림(방사형 가운데 좌표 → 왼쪽 위) */
const SIZE: Record<RelNode['kind'], { w: number; h: number }> = { project: { w: 220, h: 62 }, task: { w: 184, h: 58 }, person: { w: 150, h: 40 }, note: { w: 170, h: 40 }, list: { w: 150, h: 40 }, other: { w: 170, h: 40 } }
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const strip = (s: string) => s.replace(/^(👤|📄)\s*/u, '')

type Sel = { type: 'node' | 'edge'; id: string } | null
type Ctx = {
  p: ProjectView; edit: ProjectEdit; today: string; autoOnly: boolean
  selectedTask: string | null; sel: Sel; renaming: string | null
  setRenaming: (id: string | null) => void
  cutEdge: (e: RelEdge) => void
  nodeOf: Map<string, RelNode>
}
const GCtx = createContext<Ctx>(null as never)
type RN = Node<{ n: RelNode }>
type RE = Edge<{ e: RelEdge }>

function Handles() {
  return <>
    <Handle type="source" position={Position.Top} id="t" className="rg-h" />
    <Handle type="source" position={Position.Right} id="r" className="rg-h" />
    <Handle type="source" position={Position.Bottom} id="b" className="rg-h" />
    <Handle type="source" position={Position.Left} id="l" className="rg-h" />
  </>
}
const dimmed = (ctx: Ctx, n: RelNode) => ctx.autoOnly && !(n.kind === 'task' && n.auto)

function ProjectNode({ data: { n } }: NodeProps<RN>) {
  const ctx = useContext(GCtx)
  return (
    <div className={`rg-node rg-node--project${ctx.sel?.id === n.id ? ' is-sel' : ''}`}>
      <b>{n.label}</b>
      <small>{ctx.p.members.length}개 중 {ctx.p.done}개 완료</small>
      <Handles />
    </div>
  )
}
function TaskNode({ data: { n } }: NodeProps<RN>) {
  const ctx = useContext(GCtx)
  const t = n.task!
  const done = t.status !== 0
  const day = t.due_at ?? t.start_at ?? (done ? t.completed_at : null)
  const late = !done && !!t.due_at && t.due_at.slice(0, 10) < ctx.today
  const [draft, setDraft] = useState(t.title)
  const editing = ctx.renaming === n.id
  useEffect(() => { if (editing) setDraft(t.title) }, [editing, t.title])
  const finish = (save: boolean) => { if (save) void ctx.edit.rename(t, draft); ctx.setRenaming(null) }
  const cls = ['rg-node', 'rg-node--task', done && 'is-done', n.auto && 'is-auto', (ctx.selectedTask === t.id || ctx.sel?.id === n.id) && 'is-sel', dimmed(ctx, n) && 'is-dim'].filter(Boolean).join(' ')
  return (
    <div className={cls} title={t.title}>
      <button className={`rg-ring nodrag${done ? ' is-on' : ''}`} aria-label={done ? '완료 취소' : '완료'} onClick={(e) => { e.stopPropagation(); void ctx.edit.complete(t) }}>{done && <Check strokeWidth={3} />}</button>
      <div className="rg-task__body">
        {editing
          ? <input className="rg-rename nodrag" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onClick={(e) => e.stopPropagation()}
              onKeyDown={(e: RKeyboardEvent) => { e.stopPropagation(); if (e.key === 'Enter' && !e.nativeEvent.isComposing) finish(true); if (e.key === 'Escape') finish(false) }} onBlur={() => finish(true)} />
          : <span className="rg-task__t">{t.title}</span>}
        {day && <em className={late ? 'is-late' : ''}>{md(day.slice(0, 10))}</em>}
      </div>
      {n.auto && (
        <span className="rg-auto nodrag">
          <button title="맞아 — 프로젝트에 둠" aria-label="맞아" onClick={(e) => { e.stopPropagation(); void ctx.edit.confirm(t) }}><Check /></button>
          <button title="이건 아니야 — 프로젝트에서 빼기" aria-label="이건 아니야" onClick={(e) => { e.stopPropagation(); void ctx.edit.out(t) }}><X /></button>
        </span>
      )}
      <Handles />
    </div>
  )
}
const ICON = { person: User, note: FileText, list: List, other: Folder } as const
function SideNode({ data: { n } }: NodeProps<RN>) {
  const ctx = useContext(GCtx)
  const Icon = ICON[n.kind as keyof typeof ICON] ?? Folder
  const label = n.kind === 'person' || n.kind === 'note' ? strip(n.label) : n.label
  return (
    <div className={`rg-node rg-node--side rg-node--${n.kind}${ctx.sel?.id === n.id ? ' is-sel' : ''}${dimmed(ctx, n) ? ' is-dim' : ''}`} title={label}>
      {(n.kind === 'person' || n.kind === 'note') && <Icon className="rg-ic" />}
      <span className="rg-side__t">{label}</span>
      {n.sub && <small>{n.sub}</small>}
      <Handles />
    </div>
  )
}
const nodeTypes = { project: ProjectNode, task: TaskNode, person: SideNode, note: SideNode, list: SideNode, other: SideNode }

// ── 선: 노드 가운데끼리 잇고 테두리에서 끊는 떠 있는 선 ──
function border(n: InternalNode, toward: XY): XY {
  const w = n.measured.width ?? 0, h = n.measured.height ?? 0
  const cx = n.internals.positionAbsolute.x + w / 2, cy = n.internals.positionAbsolute.y + h / 2
  const dx = toward.x - cx, dy = toward.y - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const s = Math.min(dx ? (w / 2 + 3) / Math.abs(dx) : Infinity, dy ? (h / 2 + 3) / Math.abs(dy) : Infinity)
  return { x: cx + dx * s, y: cy + dy * s }
}
const center = (n: InternalNode): XY => ({ x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2, y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2 })

function RelEdgeView({ id, source, target, markerEnd, data, selected }: EdgeProps<RE>) {
  const ctx = useContext(GCtx)
  const a = useInternalNode(source), b = useInternalNode(target)
  if (!a || !b || !data) return null
  const e = data.e
  const p1 = border(a, center(b)), p2 = border(b, center(a))
  const path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
  const dim = ctx.autoOnly && !(e.kind === 'member' && ctx.nodeOf.get(target)?.auto)
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={16} className={`rg-edge rg-edge--${e.kind}${selected ? ' is-sel' : ''}${dim ? ' is-dim' : ''}`} />
      {(e.label || selected) && (
        <EdgeLabelRenderer>
          <div className="rg-elabel nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }}>
            {selected ? <EdgePill e={e} /> : <span className="rg-count">{e.label}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
const edgeTypes = { rel: RelEdgeView }

/** 선 위 작은 알약(§12.9.5): 할 일↔할 일은 종류 바꾸기, 나머지는 끊기 */
function EdgePill({ e }: { e: RelEdge }) {
  const ctx = useContext(GCtx)
  const from = ctx.nodeOf.get(e.source)?.ref ?? '', to = ctx.nodeOf.get(e.target)?.ref ?? ''
  const stop = (f: () => unknown) => (ev: RMouseEvent) => { ev.stopPropagation(); void f() }
  if (e.kind === 'order') return (
    <span className="rg-pill">
      <button className="is-on">먼저 해야 함 →</button>
      <button onClick={stop(() => ctx.edit.toRelated(e.ref!, from, to))}>관련 ─</button>
      <button onClick={stop(() => ctx.edit.flip(e.ref!))}>⇄ 방향</button>
      <button className="is-danger" onClick={stop(() => ctx.cutEdge(e))}>끊기</button>
    </span>
  )
  if (e.kind === 'related') return (
    <span className="rg-pill">
      <button onClick={stop(() => ctx.edit.toOrder(e.ref!, from, to))}>먼저 해야 함 →</button>
      <button className="is-on">관련 ─</button>
      <button className="is-danger" onClick={stop(() => ctx.cutEdge(e))}>끊기</button>
    </span>
  )
  if (e.kind === 'member') return <span className="rg-pill"><button className="is-danger" onClick={stop(() => ctx.cutEdge(e))}>프로젝트에서 빼기</button></span>
  if ((e.kind === 'person' || e.kind === 'note') && !e.id.startsWith('w:')) return <span className="rg-pill"><button className="is-danger" onClick={stop(() => ctx.cutEdge(e))}>끊기</button></span>
  return e.label ? <span className="rg-count">{e.label}</span> : null
}

export function RelationGraph(props: {
  p: ProjectView; data: PlanData; edit: ProjectEdit; actions: TaskActions
  selected: string | null; onSelect: (taskId: string | null) => void
  autoOnly: boolean
}) {
  return <ReactFlowProvider><Graph {...props} /></ReactFlowProvider>
}

function Graph({ p, data, edit, selected, onSelect, autoOnly }: Parameters<typeof RelationGraph>[0]) {
  const toast = useToast()
  const flow = useReactFlow()
  const rows = useRelationRows()
  const today = dayKey()
  const pid = p.tag.id

  // ── 노드·선 계산 ──
  const graph = useMemo(() => buildRelationGraph({
    p,
    personLinks: rows?.personLinks ?? [],
    projectPeople: (rows?.projectPeople ?? []).filter((x) => x.project_id === pid),
    notes: rows?.notes ?? [],
    topics: p.memos.filter((m) => m.kind === 'topic').map((m) => ({ id: m.id, title: m.title })),
    related: rows?.related ?? [],
    others: overlapping(p, data.projects)
  }), [p, rows, pid, data.projects])
  const nodeOf = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])
  const radial = useMemo(() => radialLayout(graph), [graph])

  // 손으로 옮긴 자리(기억) — 프로젝트가 바뀌면 다시 읽는다
  const saved = useRef<Record<string, XY>>(readPos(pid))
  const [posVer, setPosVer] = useState(0)
  useEffect(() => { saved.current = readPos(pid); setPosVer((v) => v + 1) }, [pid])
  const topLeft = useCallback((n: RelNode): XY => {
    const s = saved.current[n.id]
    if (s) return s
    const c = radial.get(n.id) ?? { x: 0, y: 0 }
    return { x: c.x - SIZE[n.kind].w / 2, y: c.y - SIZE[n.kind].h / 2 }
  }, [radial])

  const [sel, setSel] = useState<Sel>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [nodes, setNodes] = useState<RN[]>([])
  // 데이터가 바뀌어도 끌어 놓은 자리는 그대로, 새 노드만 방사형 자리에
  useEffect(() => {
    setNodes((cur) => {
      const was = new Map(cur.map((n) => [n.id, n.position]))
      return graph.nodes.map((n) => ({ id: n.id, type: n.kind, position: was.get(n.id) ?? topLeft(n), data: { n }, draggable: true, selectable: false }))
    })
  }, [graph, topLeft, posVer])
  const edges = useMemo<RE[]>(() => graph.edges.map((e) => {
    const on = sel?.type === 'edge' && sel.id === e.id
    const color = on ? 'var(--color-accent)' : 'var(--color-text-secondary)'
    return {
      id: e.id, source: e.source, target: e.target, type: 'rel', data: { e }, selected: on,
      markerEnd: e.kind === 'order' ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined
    }
  }), [graph, sel])

  const onNodesChange = (changes: NodeChange<RN>[]) => setNodes((ns) => {
    const pos = new Map<string, XY>()
    for (const c of changes) if (c.type === 'position' && c.position) pos.set(c.id, c.position)
    return pos.size ? ns.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)) : ns
  })
  const onDragStop = (_: unknown, _n: RN, moved: RN[]) => {
    const next = { ...saved.current }
    for (const m of moved) next[m.id] = { x: Math.round(m.position.x), y: Math.round(m.position.y) }
    saved.current = next
    writePos(pid, next)
  }
  const resetPos = () => {
    saved.current = {}
    writePos(pid, null)
    setNodes(graph.nodes.map((n) => ({ id: n.id, type: n.kind, position: topLeft(n), data: { n }, draggable: true, selectable: false })))
    window.setTimeout(() => void flow.fitView({ padding: 0.15, duration: 250 }), 30)
  }
  const first = useRef(true)
  useEffect(() => {
    if (!first.current || !nodes.length) return
    first.current = false
    window.setTimeout(() => void flow.fitView({ padding: 0.15, maxZoom: 1.1 }), 40)
  }, [nodes, flow])

  // ── 끊기·빼기 ──
  const taskOf = (id: string): PTaskRow | undefined => p.members.find((m) => m.id === id)
  const cutEdge = useCallback((e: RelEdge) => {
    setSel(null)
    const src = nodeOf.get(e.source), tgt = nodeOf.get(e.target)
    if (e.kind === 'order') void edit.unorder(e.ref!)
    else if (e.kind === 'related') void edit.unrelate(e.ref!)
    else if (e.kind === 'member') { const t = p.members.find((m) => m.id === e.ref); if (t) void edit.out(t) }
    else if (e.kind === 'person' && tgt) {
      if (src?.kind === 'project') void unlinkRelation(projectPersonId(pid, tgt.ref)).then((u) => toast.show('사람 연결을 끊었어요', u))
      else void edit.unperson(e.ref!, tgt.ref)
    } else if (e.kind === 'note' && src && !e.id.startsWith('w:')) void edit.unnote(src.ref, e.ref!)
  }, [nodeOf, edit, p.members, pid, toast])

  // Delete·Backspace: 선택한 선 끊기 / 할 일 = 프로젝트에서 빼기 / 사람·메모 = 이 프로젝트의 그 노드 선 모두
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement
      if (el.closest?.('input,textarea,select,[contenteditable],.app__detail') || document.querySelector('.popover,[aria-modal="true"]')) return
      if (ev.key === 'Escape' && sel) { ev.preventDefault(); setSel(null); return }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === '=' || ev.key === '+')) { ev.preventDefault(); void flow.zoomIn({ duration: 150 }); return }
      if ((ev.metaKey || ev.ctrlKey) && ev.key === '-') { ev.preventDefault(); void flow.zoomOut({ duration: 150 }); return }
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
      if (sel?.type === 'edge') { const e = graph.edges.find((x) => x.id === sel.id); if (e) { ev.preventDefault(); cutEdge(e) } return }
      const nid = sel?.type === 'node' ? sel.id : selected ? NID.task(selected) : null
      const n = nid ? nodeOf.get(nid) : undefined
      if (!n) return
      ev.preventDefault()
      if (n.kind === 'task') { const t = taskOf(n.ref); if (t) void edit.out(t); setSel(null); return }
      if (n.kind === 'person' || n.kind === 'note') { for (const e of graph.edges.filter((x) => x.source === n.id || x.target === n.id)) cutEdge(e); setSel(null) }
    }
    window.addEventListener('keydown', key, true) // 잡기 단계 — 프로젝트 화면의 Esc(모든 프로젝트)보다 먼저
    return () => window.removeEventListener('keydown', key, true)
  }) // 매 그리기마다 최신 값으로

  // ── 잇기 ──
  const onConnect = (c: Connection) => {
    const plan = connectPlan(nodeOf.get(c.source), nodeOf.get(c.target))
    if (plan.kind === 'order') void edit.order(plan.from, plan.to)
    else if (plan.kind === 'person') void edit.person(plan.task, plan.person, strip(nodeOf.get(NID.person(plan.person))?.label ?? ''))
    else if (plan.kind === 'projectPerson') void edit.projectPerson(plan.person, strip(nodeOf.get(NID.person(plan.person))?.label ?? ''))
    else if (plan.kind === 'note') void edit.note(plan.note, plan.to)
    else toast.show('이 둘은 이을 수 없어요')
  }
  // 프로젝트 밖 할 일을 끌어 놓기(할 일 넣기 결과 행 · ⚡ 칩)
  const TYPE = 'application/x-sprout-task'
  const [dropOn, setDropOn] = useState(false)
  const onDragOver = (e: DragEvent) => { if (e.dataTransfer.types.includes(TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropOn(true) } }
  const onDrop = (e: DragEvent) => { setDropOn(false); const id = e.dataTransfer.getData(TYPE); if (id) { e.preventDefault(); void edit.add([id]) } }

  // ── 메뉴 ──
  const [menu, setMenu] = useState<{ n: RelNode; point: XY }>()
  const [pop, setPop] = useState<{ kind: 'task' | 'person' | 'note'; anchor: HTMLElement }>()

  const ctx: Ctx = { p, edit, today, autoOnly, selectedTask: selected, sel, renaming, setRenaming, cutEdge, nodeOf }
  const empty = p.members.length === 0

  return (
    <GCtx.Provider value={ctx}>
      <div className={`rg${dropOn ? ' is-drop' : ''}`} onDragOver={onDragOver} onDragLeave={() => setDropOn(false)} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onDragStop}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          isValidConnection={(c) => c.source !== c.target}
          onNodeClick={(_, n) => { const r = n.data.n; setSel({ type: 'node', id: r.id }); if (r.kind === 'task') onSelect(r.ref) }}
          onNodeDoubleClick={(_, n) => { if (n.data.n.kind === 'task') setRenaming(n.id) }}
          onNodeContextMenu={(e, n) => { e.preventDefault(); setSel({ type: 'node', id: n.id }); if (n.data.n.kind !== 'project') setMenu({ n: n.data.n, point: { x: e.clientX, y: e.clientY } }) }}
          onEdgeClick={(_, e) => setSel({ type: 'edge', id: e.id })}
          onPaneClick={() => setSel(null)}
          minZoom={0.2} maxZoom={2}
          panOnScroll zoomOnScroll={false} zoomActivationKeyCode={['Meta', 'Control']} zoomOnPinch zoomOnDoubleClick={false}
          deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null}
          nodesFocusable={false} elevateEdgesOnSelect={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} className="rg-dots" />
          <MiniMap className="rg-minimap" pannable zoomable nodeBorderRadius={3}
            nodeClassName={(n) => `rg-mm rg-mm--${n.type}`} maskColor="rgba(127,127,127,0.12)" />
        </ReactFlow>

        <div className="rg-tools" role="toolbar" aria-label="관계도 도구">
          <button onClick={(e) => setPop({ kind: 'task', anchor: e.currentTarget })}><Plus />할 일</button>
          <button onClick={(e) => setPop({ kind: 'person', anchor: e.currentTarget })}><Plus />사람</button>
          <button onClick={(e) => setPop({ kind: 'note', anchor: e.currentTarget })}><Plus />메모</button>
          <i />
          <button onClick={resetPos} title="자리 처음대로"><RotateCcw />자리 처음대로</button>
        </div>
        <div className="rg-zoom">
          <button aria-label="확대" title="확대 (⌘+)" onClick={() => void flow.zoomIn({ duration: 150 })}><Plus /></button>
          <button aria-label="축소" title="축소 (⌘−)" onClick={() => void flow.zoomOut({ duration: 150 })}><Minus /></button>
          <button aria-label="맞춤" title="맞춤" onClick={() => void flow.fitView({ padding: 0.15, duration: 250 })}><Maximize2 /></button>
          <button aria-label="가운데로" title="프로젝트로" onClick={() => void flow.fitView({ nodes: [{ id: NID.project(pid) }], maxZoom: 1, duration: 250 })}><LocateFixed /></button>
        </div>
        {empty && <p className="rg-hint">＋ 할 일로 시작하거나 할 일 넣기에서 끌어 놓아요</p>}
        {dropOn && <p className="rg-hint rg-hint--drop">여기에 놓으면 프로젝트에 넣어요</p>}
      </div>

      {menu && menu.n.kind === 'task' && (() => {
        const t = taskOf(menu.n.ref)
        return t && <ProjectTaskMenu all={data.projects} t={t} p={p} edit={edit} point={menu.point} onClose={() => setMenu(undefined)} onOpen={() => onSelect(t.id)} onRename={() => setRenaming(menu.n.id)} />
      })()}
      {menu && menu.n.kind !== 'task' && (
        <Popover point={menu.point} onClose={() => setMenu(undefined)} className="menu" width={180}>
          {menu.n.kind === 'person' && <MenuItem label="태그 페이지" onClick={() => { const id = menu.n.ref; setMenu(undefined); openTarget({ view: `tag:${id}` }) }} />}
          {menu.n.kind === 'note' && <MenuItem label="수집함에서 열기" onClick={() => { setMenu(undefined); openTarget({ view: 'notes' }) }} />}
          {menu.n.kind === 'list' && <MenuItem label="리스트 열기" onClick={() => { const id = menu.n.ref; setMenu(undefined); openTarget({ view: `list:${id}` }) }} />}
          {menu.n.kind === 'other' && <MenuItem label="태그 페이지" onClick={() => { const id = menu.n.ref; setMenu(undefined); openTarget({ view: `tag:${id}` }) }} />}
          {(menu.n.kind === 'person' || (menu.n.kind === 'note' && menu.n.id.startsWith('n:'))) && <>
            <div className="menu__divider" />
            <MenuItem label="관계 끊기" danger onClick={() => { const id = menu.n.id; setMenu(undefined); for (const e of graph.edges.filter((x) => x.source === id || x.target === id)) cutEdge(e) }} />
          </>}
        </Popover>
      )}
      {pop?.kind === 'task' && <LineInput anchor={pop.anchor} placeholder="새 할 일 이름" onClose={() => setPop(undefined)} onSubmit={(v) => void edit.create(v, null, null)} />}
      {pop?.kind === 'note' && <LineInput anchor={pop.anchor} placeholder="메모 한 줄 — 수집함에 저장하고 이어요" onClose={() => setPop(undefined)}
        onSubmit={(v) => void createNoteFor(v, { type: 'tag', id: pid }).then((r) => toast.show('메모를 만들어 이었어요', r.undo))} />}
      {pop?.kind === 'person' && <PersonPicker anchor={pop.anchor} persons={rows?.persons ?? []} target={selected ? taskOf(selected) : undefined} onClose={() => setPop(undefined)}
        onPick={async (id, name) => {
          const t = selected ? taskOf(selected) : undefined
          if (t) await edit.person(t.id, id, name); else await edit.projectPerson(id, name)
        }} />}
    </GCtx.Provider>
  )
}

/** 한 줄 입력 팝오버(Enter = 저장, Esc = 닫기) */
function LineInput({ anchor, placeholder, onSubmit, onClose }: { anchor: HTMLElement; placeholder: string; onSubmit: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState('')
  return (
    <Popover anchor={anchor} onClose={onClose} width={280} className="rg-pop">
      <input autoFocus className="rg-pop__in" placeholder={placeholder} aria-label={placeholder} value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && v.trim()) { onSubmit(v.trim()); onClose() } }} />
    </Popover>
  )
}
/** ＋ 사람: 사람 태그 고르기 · 새 이름. 선택한 할 일이 있으면 그 할 일에, 없으면 프로젝트에 */
function PersonPicker({ anchor, persons, target, onPick, onClose }: { anchor: HTMLElement; persons: { id: string; name: string }[]; target?: PTaskRow; onPick: (id: string, name: string) => Promise<void>; onClose: () => void }) {
  const [q, setQ] = useState('')
  const k = q.trim().toLowerCase()
  const rows = persons.filter((x) => !k || x.name.toLowerCase().includes(k)).slice(0, 12)
  const exact = persons.some((x) => x.name.toLowerCase() === k)
  const pick = (id: string, name: string) => { onClose(); void onPick(id, name) }
  return (
    <Popover anchor={anchor} onClose={onClose} width={280} className="rg-pop">
      <input autoFocus className="rg-pop__in" placeholder="사람 이름" aria-label="사람 이름" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && k) { if (rows[0] && rows[0].name.toLowerCase() === k) pick(rows[0].id, rows[0].name); else void ensurePerson(q).then((r) => pick(r.id, q.trim())) } }} />
      <p className="rg-pop__hint">{target ? `'${target.title.slice(0, 16)}'에 붙여요` : '프로젝트에 이어요 — 할 일을 고르고 누르면 그 할 일에'}</p>
      <div className="rg-pop__list">
        {rows.map((x) => <button key={x.id} onClick={() => pick(x.id, x.name)}><User />{x.name}</button>)}
        {k && !exact && <button onClick={() => void ensurePerson(q).then((r) => pick(r.id, q.trim()))}><Plus />새 사람 '{q.trim()}'</button>}
        {!rows.length && !k && <p className="rg-pop__hint">아직 사람 태그가 없어요. 이름을 적어 만들어요</p>}
      </div>
    </Popover>
  )
}
