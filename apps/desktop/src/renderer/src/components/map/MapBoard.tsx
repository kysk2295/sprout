// 14 §2~§4 보드 보기 — 틱틱 칸반: 열 = 영역(폭 258, 간격 16), 열 안 그룹 = 세부 주제, 카드 = 할 일. 미분류 열은 맨 오른쪽
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { AreaGroup, MapArea, MapTask } from '../../data/map'
import type { MapData } from './useMapData'
import { useStored } from './useMapData'
import { AreaMenu, CardMenu, NameInput, TaskCard, TopicMenu, type MapActions } from './parts'

const TASK = 'application/x-sprout-task'
const AREA = 'application/x-sprout-area'
type Drop = { kind: 'area' | 'topic' | 'none' | 'col'; id: string | null } | null

export function MapBoard({ data, actions, onReorder, autoNewArea }: { data: MapData; actions: MapActions; onReorder: (ids: string[]) => void; autoNewArea?: boolean }) {
  const [fold, setFold] = useStored<Record<string, boolean>>('boardFold', {})
  const [menu, setMenu] = useState<{ kind: 'area' | 'topic'; area: MapArea; anchor?: HTMLElement; point?: { x: number; y: number } } | { kind: 'card'; task: MapTask; point: { x: number; y: number } }>()
  const [adding, setAdding] = useState<string | null>(null) // 열 머리 + → 입력 카드
  const [addingTopic, setAddingTopic] = useState<string | null>(null)
  const [newArea, setNewArea] = useState(!!autoNewArea)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Drop>(null)
  const board = useRef<HTMLDivElement>(null)

  // 열 순서대로 보이는 카드 — 키보드 이동(←→ 열, ↑↓ 카드)
  const columns: { id: string; tasks: MapTask[] }[] = [
    ...data.tree.areas.map((g) => ({ id: g.area.id, tasks: [...g.direct, ...g.topics.flatMap((t) => (fold[t.topic.id] ? [] : t.tasks))] })),
    ...(data.tree.unclassified.length ? [{ id: 'none', tasks: data.tree.unclassified }] : [])
  ]
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea')) return
    const ci = columns.findIndex((c) => c.tasks.some((t) => t.id === actions.selected))
    const ti = ci >= 0 ? columns[ci].tasks.findIndex((t) => t.id === actions.selected) : -1
    const pick = (c: number, t: number) => {
      const col = columns[Math.max(0, Math.min(columns.length - 1, c))]
      const task = col?.tasks[Math.max(0, Math.min(col.tasks.length - 1, t))]
      if (task) { actions.open(task.id); board.current?.querySelector(`[data-task="${task.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
    }
    if (e.key === 'ArrowDown') pick(ci < 0 ? 0 : ci, ti + 1)
    else if (e.key === 'ArrowUp') pick(ci < 0 ? 0 : ci, ti - 1)
    else if (e.key === 'ArrowRight') pick(ci + 1, Math.max(0, ti))
    else if (e.key === 'ArrowLeft') pick(ci - 1, Math.max(0, ti))
    else if (e.key === ' ' && actions.selected) actions.complete(actions.selected)
    else if (e.key === 'Enter' && actions.selected) actions.open(actions.selected)
    else return
    e.preventDefault()
  }

  const dragTask = (t: MapTask) => (e: DragEvent) => { e.dataTransfer.setData(TASK, t.id); e.dataTransfer.effectAllowed = 'move'; setDrag(t.id) }
  const target = (d: NonNullable<Drop>) => ({
    onDragOver: (e: DragEvent) => {
      const isTask = e.dataTransfer.types.includes(TASK)
      const isArea = e.dataTransfer.types.includes(AREA) && d.kind === 'col'
      if (!isTask && !isArea) return
      if (isTask && d.kind === 'col') return
      e.preventDefault()
      e.stopPropagation()
      if (over?.kind !== d.kind || over?.id !== d.id) setOver(d)
    },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null) },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setOver(null)
      const taskId = e.dataTransfer.getData(TASK)
      const areaId = e.dataTransfer.getData(AREA)
      if (taskId && d.kind !== 'col') void actions.place(taskId, d.kind === 'none' ? null : d.id)
      if (areaId && d.kind === 'col' && d.id && areaId !== d.id) {
        const ids = data.tree.areas.map((g) => g.area.id).filter((x) => x !== areaId)
        ids.splice(ids.indexOf(d.id), 0, areaId)
        onReorder(ids)
      }
    }
  })
  const isOver = (kind: string, id: string | null) => over?.kind === kind && over.id === id

  const card = (t: MapTask) => (
    <div key={t.id} className={`map-card-slot${drag === t.id ? ' is-drag-source' : ''}`}>
      <TaskCard task={t} data={data} actions={actions} variant="board" draggable onDragStart={dragTask(t)} onDragEnd={() => { setDrag(null); setOver(null) }}
        onContextMenu={(e) => { e.preventDefault(); actions.open(t.id); setMenu({ kind: 'card', task: t, point: { x: e.clientX, y: e.clientY } }) }} />
    </div>
  )

  const column = (g: AreaGroup) => {
    const a = g.area
    return (
      <section key={a.id} className={`map-col${isOver('area', a.id) ? ' is-over' : ''}${isOver('col', a.id) ? ' is-col-over' : ''}`} {...target({ kind: 'area', id: a.id })}>
        <header className="map-col__head" draggable={actions.editing !== a.id} onDragStart={(e) => { e.dataTransfer.setData(AREA, a.id); e.dataTransfer.effectAllowed = 'move' }} {...target({ kind: 'col', id: a.id })}
          onDoubleClick={() => actions.setEditing(a.id)}>
          {actions.editing === a.id
            ? <NameInput initial={a.name} onSave={(v) => actions.rename(a.id, v)} onCancel={() => actions.setEditing(null)} />
            : <><span className="map-col__name">{a.name}</span><span className="map-col__count">{g.count}</span></>}
          <button className="icon-btn map-col__btn" aria-label="할 일 추가" onClick={() => setAdding(a.id)}><Plus /></button>
          <button className="icon-btn map-col__btn" aria-label="영역 메뉴" onClick={(e) => setMenu({ kind: 'area', area: a, anchor: e.currentTarget })}><MoreHorizontal /></button>
        </header>
        <div className="map-col__body">
          {adding === a.id && <AddCard onAdd={(title) => actions.addTask(a.id, title)} onClose={() => setAdding(null)} />}
          {g.direct.map(card)}
          {g.topics.map(({ topic, tasks }) => (
            <div key={topic.id} className={`map-group${isOver('topic', topic.id) ? ' is-over' : ''}${topic.archived_at ? ' is-archived' : ''}`} {...target({ kind: 'topic', id: topic.id })}>
              <div className="map-group__head" onClick={() => setFold((f) => ({ ...f, [topic.id]: !f[topic.id] }))} onDoubleClick={(e) => { e.stopPropagation(); actions.setEditing(topic.id) }}>
                {fold[topic.id] ? <ChevronRight /> : <ChevronDown />}
                {actions.editing === topic.id
                  ? <NameInput initial={topic.name} onSave={(v) => actions.rename(topic.id, v)} onCancel={() => actions.setEditing(null)} />
                  : <><span className="map-group__name">{topic.name}</span><span className="map-group__count">{tasks.filter((t) => t.status === 0).length}</span></>}
                <button className="icon-btn map-group__more" aria-label="주제 메뉴" onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'topic', area: topic, anchor: e.currentTarget }) }}><MoreHorizontal /></button>
              </div>
              {!fold[topic.id] && tasks.map(card)}
            </div>
          ))}
          {addingTopic === a.id && (
            <div className="map-group__head is-new"><ChevronDown /><NameInput placeholder="세부 주제 이름" onSave={async (v) => { const ok = !!(await actions.createArea(v, a.id)); if (ok) setAddingTopic(null); return ok }} onCancel={() => setAddingTopic(null)} /></div>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="map-board" ref={board} tabIndex={0} onKeyDown={onKey}>
      {data.tree.areas.map(column)}
      {data.tree.unclassified.length > 0 && (
        <section className={`map-col map-col--none${isOver('none', null) ? ' is-over' : ''}`} {...target({ kind: 'none', id: null })}>
          <header className="map-col__head"><span className="map-col__name">미분류</span><span className="map-col__count">{data.tree.unclassified.length}</span></header>
          <div className="map-col__body">{data.tree.unclassified.map(card)}</div>
        </section>
      )}
      <div className="map-board__new">
        {newArea
          ? <NameInput placeholder="영역 이름" onSave={async (v) => { const ok = !!(await actions.createArea(v)); if (ok) setNewArea(false); return ok }} onCancel={() => setNewArea(false)} />
          : <button className="map-newcol" onClick={() => setNewArea(true)}><Plus />새로운 영역</button>}
      </div>
      {menu?.kind === 'area' && <AreaMenu area={menu.area} data={data} actions={actions} anchor={menu.anchor} onClose={() => setMenu(undefined)} onAddTopic={() => setAddingTopic(menu.area.id)} />}
      {menu?.kind === 'topic' && <TopicMenu topic={menu.area} data={data} actions={actions} anchor={menu.anchor} onClose={() => setMenu(undefined)} />}
      {menu?.kind === 'card' && <CardMenu task={menu.task} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} />}
    </div>
  )
}

/** 열 맨 위 입력 카드: Enter = 기본함에 만들고 이 영역에 직접 배치(📌), 계속 입력 */
function AddCard({ onAdd, onClose }: { onAdd: (title: string) => Promise<void>; onClose: () => void }) {
  const [v, setV] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="map-card map-card--board map-card--add">
      <span className="checkbox" />
      <input ref={ref} value={v} placeholder="할 일 추가" onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (!v.trim()) onClose() }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && v.trim()) { const t = v.trim(); setV(''); void onAdd(t) }
        }} />
    </div>
  )
}
