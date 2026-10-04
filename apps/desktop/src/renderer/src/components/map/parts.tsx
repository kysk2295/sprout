// 14 작업 지도 v2.0 — 그래프·보드가 같이 쓰는 부품: 할 일 카드(시안 ③ 칸반 카드), 진행 고리, 이름 입력칸, 폴더·리스트·카드 메뉴, 리스트·폴더 아이콘
import { Check, ExternalLink, Folder, FolderInput, FolderMinus, FolderOutput, ListPlus, Pencil, Sparkles, SquarePen, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { rowDateLabel, dayKey } from '../../lib/dates'
import { checkboxColor } from '../../lib/priority'
import { folderView, listTitle, type MapFolder, type MapList, type MapTask } from '../../data/map'
import type { MapData } from './useMapData'
import { MenuItem, Popover, SubMenu } from '../Popover'
import { SuggestChip } from '../listSuggest/ListSuggest'

export type MapActions = {
  open: (taskId: string) => void
  complete: (taskId: string) => void
  /** 할 일을 다른 리스트로(= tasks.list_id, 토스트 되돌리기) */
  moveTask: (taskId: string, listId: string) => Promise<void>
  /** 리스트를 폴더로(null = 폴더 밖). before = 그 리스트 앞에 */
  moveList: (listId: string, folderId: string | null, beforeId?: string | null) => Promise<void>
  renameList: (list: MapList, name: string) => Promise<boolean>
  renameFolder: (folder: MapFolder, name: string) => Promise<boolean>
  createFolder: (name: string) => Promise<boolean>
  /** 편집 창(05·30: 아이콘·색·폴더) */
  editList: (list?: MapList, folderId?: string | null) => void
  editFolder: (folder?: MapFolder) => void
  removeList: (list: MapList) => void
  ungroup: (folder: MapFolder) => void
  addTask: (listId: string, title: string) => Promise<void>
  trash: (taskId: string) => Promise<void>
  organize: () => void
  editing: string | null
  setEditing: (id: string | null) => void
  /** 처리 중(체크 후 0.4초)인 할 일 — 체크 표시만 먼저 보인다 */
  checking: Set<string>
  selected: string | null
  flash: Set<string>
}

/** 리스트 아이콘: 고른 이모지 · 기본함 📥 · 없으면 ≡ */
export function ListIcon({ list }: { list: Pick<MapList, 'emoji' | 'kind'> }) {
  return <span className="map-icon">{list.kind === 'inbox' ? '📥' : list.emoji ?? <span className="map-icon__glyph">≡</span>}</span>
}
/** 폴더 아이콘: 이름 앞 이모지가 있으면 그것, 없으면 폴더 그림(30 §A.4) */
export function FolderIcon({ name }: { name: string }) {
  const { emoji } = folderView(name)
  return <span className="map-icon">{emoji ?? <Folder className="map-icon__svg" />}</span>
}

/** 둘째 줄이 있는가(날짜·꼬리표·AI 제안) → 카드 높이 56, 없으면 40 */
export const twoLine = (t: MapTask, data: MapData) => !!t.due_at || (data.wait.get(t.id) ?? 0) > 0 || data.goalOf.has(t.id) || data.suggested.has(t.id)

export function TaskCard({ task, data, actions, variant, draggable, onDragStart, onDragEnd, onContextMenu }: {
  task: MapTask; data: MapData; actions: MapActions; variant: 'board' | 'graph'
  draggable?: boolean; onDragStart?: (e: DragEvent) => void; onDragEnd?: () => void; onContextMenu?: (e: MouseEvent) => void
}) {
  const date = rowDateLabel(task, dayKey())
  const wait = data.wait.get(task.id) ?? 0
  const done = task.status === 1 || actions.checking.has(task.id)
  const cls = ['map-card', `map-card--${variant}`, done && 'is-done', actions.selected === task.id && 'is-selected', actions.flash.has(task.id) && 'is-flash', twoLine(task, data) && 'is-two']
  return (
    <div
      className={cls.filter(Boolean).join(' ')}
      data-task={task.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => actions.open(task.id)}
      onContextMenu={onContextMenu}
    >
      <button
        className={`checkbox${done ? ' is-checked' : ''}`}
        style={{ ['--checkbox-color' as string]: checkboxColor(task.priority) }}
        onClick={(e) => { e.stopPropagation(); if (task.status === 0) actions.complete(task.id) }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={done ? '완료됨' : '완료'}
      >
        {done && <Check strokeWidth={3} />}
      </button>
      <div className="map-card__body">
        <div className="map-card__title"><span className="map-card__text">{task.title}</span></div>
        {twoLine(task, data) && (
          <div className="map-card__meta">
            {date && <span className={`map-card__date is-${date.tone}`}>{date.label}</span>}
            {wait > 0 && <span className="map-chip" title="앞선 할 일이 아직 안 끝났어요">{variant === 'board' ? '⛓ ' : ''}먼저 {wait}</span>}
            {data.goalOf.has(task.id) && <span className="map-chip">🎯 목표</span>}
            {data.suggested.has(task.id) && <span className="nodrag"><SuggestChip taskId={task.id} variant="card" /></span>}
          </div>
        )}
      </div>
    </div>
  )
}

/** 리스트 진행 고리(16px, 완료/전체) */
export function Ring({ done, total }: { done: number; total: number }) {
  const c = 2 * Math.PI * 6
  const f = total ? (done / total) * c : 0
  return (
    <svg className="map-ring" viewBox="0 0 16 16" aria-hidden>
      <circle className="map-ring__bg" cx="8" cy="8" r="6" />
      <circle className="map-ring__fg" cx="8" cy="8" r="6" strokeDasharray={`${f.toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 8 8)" />
    </svg>
  )
}

/** 그 자리 이름 입력칸: Enter 저장 · Esc 취소 · 빈칸 거부(흔들고 그대로) */
export function NameInput({ initial = '', placeholder, onSave, onCancel, className }: { initial?: string; placeholder?: string; onSave: (v: string) => Promise<boolean>; onCancel: () => void; className?: string }) {
  const [v, setV] = useState(initial)
  const [bad, setBad] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const saved = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const save = async () => {
    if (saved.current) return
    saved.current = true
    if (!(await onSave(v))) {
      saved.current = false; setBad(true); window.setTimeout(() => setBad(false), 400); ref.current?.focus() }
  }
  return (
    <input
      ref={ref}
      className={`map-name-input${bad ? ' is-bad' : ''}${className ? ` ${className}` : ''}`}
      value={v}
      placeholder={placeholder}
      maxLength={100}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void save() }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => { if (saved.current) return; if (!v.trim() || v === initial) onCancel(); else void save().then(() => { if (saved.current) onCancel() }) }}
    />
  )
}

type MenuProps = { data: MapData; actions: MapActions; anchor?: HTMLElement | null; point?: { x: number; y: number }; onClose: () => void }

/** 폴더 ⋯ 메뉴 — 05 폴더 메뉴(목록 추가 · 편집 · 그룹해제) + 이름 바꾸기 */
export function FolderMenu({ folder, actions, anchor, point, onClose }: MenuProps & { folder: MapFolder }) {
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  return (
    <Popover anchor={anchor} point={point} onClose={onClose} width={190} className="menu">
      <MenuItem icon={<ListPlus />} label="목록 추가" onClick={done(() => actions.editList(undefined, folder.id))} />
      <MenuItem icon={<Pencil />} label="이름 바꾸기" onClick={done(() => actions.setEditing(`folder:${folder.id}`))} />
      <MenuItem icon={<SquarePen />} label="편집" onClick={done(() => actions.editFolder(folder))} />
      <div className="menu__divider" />
      <MenuItem icon={<FolderMinus />} label="그룹해제" onClick={done(() => actions.ungroup(folder))} />
    </Popover>
  )
}

/** 리스트 ⋯ 메뉴 — 05 리스트 메뉴(편집 · 삭제) + 이름 바꾸기 · 폴더로 옮기기 */
export function ListMenu({ list, data, actions, anchor, point, onClose }: MenuProps & { list: MapList }) {
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  if (list.kind === 'inbox') {
    return (
      <Popover anchor={anchor} point={point} onClose={onClose} width={200} className="menu">
        <MenuItem icon={<Sparkles />} label="기본함 정리" onClick={done(actions.organize)} />
      </Popover>
    )
  }
  return (
    <Popover anchor={anchor} point={point} onClose={onClose} width={200} className="menu">
      <MenuItem icon={<Pencil />} label="이름 바꾸기" onClick={done(() => actions.setEditing(`list:${list.id}`))} />
      <MenuItem icon={<SquarePen />} label="편집" onClick={done(() => actions.editList(list))} />
      <SubMenu icon={<FolderInput />} label="폴더로 옮기기" width={200}>
        {data.folders.map((f) => <MenuItem key={f.id} icon={<FolderIcon name={f.name} />} label={folderView(f.name).name} active={list.folder_id === f.id} onClick={done(() => actions.moveList(list.id, f.id))} />)}
        {data.folders.length > 0 && <div className="menu__divider" />}
        <MenuItem icon={<FolderOutput />} label="폴더 밖으로" disabled={!list.folder_id} onClick={done(() => actions.moveList(list.id, null))} />
      </SubMenu>
      <div className="menu__divider" />
      <MenuItem icon={<Trash2 />} label="삭제" danger onClick={done(() => actions.removeList(list))} />
    </Popover>
  )
}

/** 카드 우클릭: 맨 위 `리스트 옮기기 ›` + 열기·완료·휴지통 */
export function CardMenu({ task, data, actions, point, onClose }: MenuProps & { task: MapTask; point: { x: number; y: number } }) {
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  const live = data.lists.filter((l) => !l.archived_at)
  const rootLists = live.filter((l) => !l.folder_id || !data.folders.some((f) => f.id === l.folder_id))
  return (
    <Popover point={point} onClose={onClose} width={194} className="menu">
      <SubMenu icon={<FolderInput />} label="리스트 옮기기" width={220}>
        <div className="map-move-list">
          {rootLists.map((l) => <MenuItem key={l.id} icon={<ListIcon list={l} />} label={listTitle(l)} active={task.list_id === l.id} onClick={done(() => actions.moveTask(task.id, l.id))} />)}
          {data.folders.map((f) => (
            <div key={f.id}>
              <div className="map-move-list__folder"><FolderIcon name={f.name} />{folderView(f.name).name}</div>
              {live.filter((l) => l.folder_id === f.id).map((l) => (
                <MenuItem key={l.id} icon={<span className="map-indent"><ListIcon list={l} /></span>} label={l.name} active={task.list_id === l.id} onClick={done(() => actions.moveTask(task.id, l.id))} />
              ))}
            </div>
          ))}
        </div>
      </SubMenu>
      <div className="menu__divider" />
      <MenuItem icon={<ExternalLink />} label="열기" onClick={done(() => actions.open(task.id))} />
      <MenuItem icon={<Check />} label="완료" disabled={task.status !== 0} onClick={done(() => actions.complete(task.id))} />
      <div className="menu__divider" />
      <MenuItem icon={<Trash2 />} label="삭제" danger onClick={done(() => actions.trash(task.id))} />
    </Popover>
  )
}
