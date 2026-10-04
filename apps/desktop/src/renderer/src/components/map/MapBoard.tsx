// 14 §2~§4 보드 보기 v2.0 — 틱틱 칸반 모양(열 폭 258, 간격 16): 열 = 폴더(안에 리스트 그룹) 또는 폴더 밖 리스트, 카드 = 할 일.
// 끌어서: 할 일 → 다른 리스트(list_id) · 리스트 → 다른 폴더/순서 · 폴더 열 → 폴더 순서
import { ChevronDown, ChevronRight, FolderPlus, MoreHorizontal, Plus, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { SUGGEST } from '../../data/listSuggest'
import { folderView, listTitle, type ListGroup, type MapFolder, type MapGroup, type MapList, type MapTask } from '../../data/map'
import type { MapData } from './useMapData'
import { useStored } from './useMapData'
import { CardMenu, FolderIcon, FolderMenu, ListIcon, ListMenu, NameInput, TaskCard, type MapActions } from './parts'

const TASK = 'application/x-sprout-task'
const LIST = 'application/x-sprout-list'
const FOLDER = 'application/x-sprout-folder'
type Drop = { kind: 'list' | 'folder' | 'listHead' | 'folderHead'; id: string } | null

export function MapBoard({ data, actions, onReorderFolders }: { data: MapData; actions: MapActions; onReorderFolders: (ids: string[]) => void }) {
  const [fold, setFold] = useStored<Record<string, boolean>>('boardFold', {})
  const [menu, setMenu] = useState<{ kind: 'folder'; folder: MapFolder; anchor: HTMLElement } | { kind: 'list'; list: MapList; anchor: HTMLElement } | { kind: 'card'; task: MapTask; point: { x: number; y: number } }>()
  const [adding, setAdding] = useState<string | null>(null) // 리스트 + → 입력 카드
  const [newFolder, setNewFolder] = useState(false)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Drop>(null)
  const board = useRef<HTMLDivElement>(null)

  // 열 순서대로 보이는 카드 — 키보드 이동(←→ 열, ↑↓ 카드)
  const columns: { id: string; tasks: MapTask[] }[] = data.tree.groups.map((g) => ({ id: g.id, tasks: g.kind === 'list' ? g.tasks : g.lists.flatMap((l) => (fold[l.list.id] ? [] : l.tasks)) }))
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

  const accepts = (d: NonNullable<Drop>, types: readonly string[]) =>
    (types.includes(TASK) && d.kind === 'list') ||
    (types.includes(LIST) && (d.kind === 'folder' || d.kind === 'listHead')) ||
    (types.includes(FOLDER) && d.kind === 'folderHead')
  const target = (d: NonNullable<Drop>) => ({
    onDragOver: (e: DragEvent) => {
      if (!accepts(d, e.dataTransfer.types)) return
      e.preventDefault()
      e.stopPropagation()
      if (over?.kind !== d.kind || over?.id !== d.id) setOver(d)
    },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null) },
    onDrop: (e: DragEvent) => {
      if (!accepts(d, e.dataTransfer.types)) return
      e.preventDefault()
      e.stopPropagation()
      setOver(null)
      const taskId = e.dataTransfer.getData(TASK)
      const listId = e.dataTransfer.getData(LIST)
      const folderId = e.dataTransfer.getData(FOLDER)
      if (taskId && d.kind === 'list') {
        const t = data.byId.get(taskId)
        if (t && t.list_id !== d.id) void actions.moveTask(taskId, d.id)
      }
      if (listId && listId !== d.id) {
        if (d.kind === 'folder') void actions.moveList(listId, d.id)
        if (d.kind === 'listHead') {
          const at = data.lists.find((l) => l.id === d.id)
          if (at && at.kind !== 'inbox') void actions.moveList(listId, at.folder_id ?? null, at.id)
        }
      }
      if (folderId && d.kind === 'folderHead' && folderId !== d.id) {
        const ids = data.folders.map((f) => f.id).filter((x) => x !== folderId)
        ids.splice(ids.indexOf(d.id), 0, folderId)
        onReorderFolders(ids)
      }
    }
  })
  const isOver = (kind: string, id: string) => over?.kind === kind && over.id === id
  const dragList = (l: MapList) => (e: DragEvent) => { e.stopPropagation(); e.dataTransfer.setData(LIST, l.id); e.dataTransfer.effectAllowed = 'move' }

  const card = (t: MapTask) => (
    <div key={t.id} className={`map-card-slot${drag === t.id ? ' is-drag-source' : ''}`}>
      <TaskCard task={t} data={data} actions={actions} variant="board" draggable
        onDragStart={(e) => { e.dataTransfer.setData(TASK, t.id); e.dataTransfer.effectAllowed = 'move'; setDrag(t.id) }}
        onDragEnd={() => { setDrag(null); setOver(null) }}
        onContextMenu={(e) => { e.preventDefault(); actions.open(t.id); setMenu({ kind: 'card', task: t, point: { x: e.clientX, y: e.clientY } }) }} />
    </div>
  )
  const listName = (l: MapList, cls: string) => actions.editing === `list:${l.id}`
    ? <NameInput initial={l.name} onSave={(v) => actions.renameList(l, v)} onCancel={() => actions.setEditing(null)} />
    : <span className={cls}>{listTitle(l)}</span>

  /** 폴더 밖 리스트 = 열 하나 */
  const listColumn = (g: Extract<MapGroup, { kind: 'list' }>) => {
    const l = g.list
    const inbox = l.kind === 'inbox'
    return (
      <section key={l.id} className={`map-col${isOver('list', l.id) ? ' is-over' : ''}`} {...target({ kind: 'list', id: l.id })}>
        <header className={`map-col__head${isOver('listHead', l.id) ? ' is-col-over' : ''}`} draggable={!inbox && actions.editing !== `list:${l.id}`} onDragStart={dragList(l)} {...target({ kind: 'listHead', id: l.id })}
          onDoubleClick={() => { if (!inbox) actions.setEditing(`list:${l.id}`) }}>
          <ListIcon list={l} />
          {listName(l, 'map-col__name')}
          <span className="map-col__count">{g.count}</span>
          {l.color && <span className="map-dot" style={{ background: l.color }} />}
          {inbox && g.count > SUGGEST.inboxCard && <button className="icon-btn map-col__btn map-col__btn--ai" aria-label="기본함 정리" title="기본함 정리 — AI가 리스트를 제안해요" onClick={actions.organize}><Sparkles /></button>}
          <button className="icon-btn map-col__btn" aria-label="할 일 추가" onClick={() => setAdding(l.id)}><Plus /></button>
          <button className="icon-btn map-col__btn" aria-label="리스트 메뉴" onClick={(e) => setMenu({ kind: 'list', list: l, anchor: e.currentTarget })}><MoreHorizontal /></button>
        </header>
        <div className="map-col__body">
          {adding === l.id && <AddCard onAdd={(title) => actions.addTask(l.id, title)} onClose={() => setAdding(null)} />}
          {g.tasks.map(card)}
        </div>
      </section>
    )
  }
  /** 폴더 안 리스트 = 접히는 그룹 머리(research 08) */
  const listGroup = ({ list: l, tasks, count }: ListGroup) => (
    <div key={l.id} className={`map-group${isOver('list', l.id) ? ' is-over' : ''}`} {...target({ kind: 'list', id: l.id })}>
      <div className={`map-group__head${isOver('listHead', l.id) ? ' is-col-over' : ''}`} draggable={actions.editing !== `list:${l.id}`} onDragStart={dragList(l)} {...target({ kind: 'listHead', id: l.id })}
        onClick={() => setFold((f) => ({ ...f, [l.id]: !f[l.id] }))} onDoubleClick={(e) => { e.stopPropagation(); actions.setEditing(`list:${l.id}`) }}>
        {fold[l.id] ? <ChevronRight /> : <ChevronDown />}
        <ListIcon list={l} />
        {listName(l, 'map-group__name')}
        <span className="map-group__count">{count}</span>
        <button className="icon-btn map-group__more" aria-label="할 일 추가" onClick={(e) => { e.stopPropagation(); setFold((f) => ({ ...f, [l.id]: false })); setAdding(l.id) }}><Plus /></button>
        <button className="icon-btn map-group__more" aria-label="리스트 메뉴" onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'list', list: l, anchor: e.currentTarget }) }}><MoreHorizontal /></button>
      </div>
      {adding === l.id && <AddCard onAdd={(title) => actions.addTask(l.id, title)} onClose={() => setAdding(null)} />}
      {!fold[l.id] && tasks.map(card)}
    </div>
  )
  const folderColumn = (g: Extract<MapGroup, { kind: 'folder' }>) => {
    const f = g.folder
    const fv = folderView(f.name)
    return (
      <section key={f.id} className={`map-col map-col--folder${isOver('folder', f.id) ? ' is-over' : ''}`} {...target({ kind: 'folder', id: f.id })}>
        <header className={`map-col__head${isOver('folderHead', f.id) ? ' is-col-over' : ''}`} draggable={actions.editing !== `folder:${f.id}`}
          onDragStart={(e) => { e.dataTransfer.setData(FOLDER, f.id); e.dataTransfer.effectAllowed = 'move' }} {...target({ kind: 'folderHead', id: f.id })}
          onDoubleClick={() => actions.setEditing(`folder:${f.id}`)}>
          <FolderIcon name={f.name} />
          {actions.editing === `folder:${f.id}`
            ? <NameInput initial={fv.name} onSave={(v) => actions.renameFolder(f, v)} onCancel={() => actions.setEditing(null)} />
            : <span className="map-col__name">{fv.name}</span>}
          <span className="map-col__count">{g.count}</span>
          <button className="icon-btn map-col__btn" aria-label="목록 추가" onClick={() => actions.editList(undefined, f.id)}><Plus /></button>
          <button className="icon-btn map-col__btn" aria-label="폴더 메뉴" onClick={(e) => setMenu({ kind: 'folder', folder: f, anchor: e.currentTarget })}><MoreHorizontal /></button>
        </header>
        <div className="map-col__body">
          {g.lists.map(listGroup)}
          {!g.lists.length && <p className="map-col__empty">리스트를 끌어 넣거나 + 로 추가하세요</p>}
        </div>
      </section>
    )
  }

  return (
    <div className="map-board" ref={board} tabIndex={0} onKeyDown={onKey}>
      {data.tree.groups.map((g) => (g.kind === 'list' ? listColumn(g) : folderColumn(g)))}
      <div className="map-board__new">
        <button className="map-newcol" onClick={() => actions.editList()}><Plus />새로운 리스트</button>
        {newFolder
          ? <NameInput placeholder="폴더 이름" onSave={async (v) => { const ok = await actions.createFolder(v); if (ok) setNewFolder(false); return ok }} onCancel={() => setNewFolder(false)} />
          : <button className="map-newcol" onClick={() => setNewFolder(true)}><FolderPlus />새 폴더</button>}
      </div>
      {menu?.kind === 'folder' && <FolderMenu folder={menu.folder} data={data} actions={actions} anchor={menu.anchor} onClose={() => setMenu(undefined)} />}
      {menu?.kind === 'list' && <ListMenu list={menu.list} data={data} actions={actions} anchor={menu.anchor} onClose={() => setMenu(undefined)} />}
      {menu?.kind === 'card' && <CardMenu task={menu.task} data={data} actions={actions} point={menu.point} onClose={() => setMenu(undefined)} />}
    </div>
  )
}

/** 리스트 맨 위 입력 카드: Enter = 이 리스트에 할 일 만들기, 계속 입력 */
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
