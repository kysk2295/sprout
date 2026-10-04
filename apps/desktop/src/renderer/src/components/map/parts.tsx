// 14 작업 지도 — 그래프·보드가 같이 쓰는 부품: 할 일 카드(시안 ③ 칸반 카드), 진행 고리, 이름 입력칸, 영역·주제·카드 메뉴
import { Archive, ArchiveRestore, Check, Combine, ExternalLink, FolderInput, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { rowDateLabel, dayKey } from '../../lib/dates'
import { checkboxColor } from '../../lib/priority'
import type { MapArea, MapTask } from '../../data/map'
import type { MapData } from './useMapData'
import { MenuItem, Popover, SubMenu } from '../Popover'

export type MapActions = {
  open: (taskId: string) => void
  complete: (taskId: string) => void
  place: (taskId: string, areaId: string | null) => Promise<void>
  createArea: (name: string, parentId?: string | null) => Promise<string | null>
  rename: (id: string, name: string) => Promise<boolean>
  merge: (fromId: string, intoId: string) => Promise<void>
  remove: (area: MapArea) => void
  archive: (id: string, on: boolean) => Promise<void>
  addTask: (areaId: string, title: string) => Promise<void>
  trash: (taskId: string) => Promise<void>
  editing: string | null
  setEditing: (id: string | null) => void
  /** 처리 중(체크 후 0.4초)인 할 일 — 체크 표시만 먼저 보인다 */
  checking: Set<string>
  selected: string | null
  changed: Set<string>
  flash: Set<string>
}

/** 둘째 줄이 있는가(날짜·꼬리표) → 카드 높이 56, 없으면 40 */
export const twoLine = (t: MapTask, data: MapData) => !!t.due_at || (data.wait.get(t.id) ?? 0) > 0 || data.goalOf.has(t.id) || data.rowOf.get(t.id)?.state === 'review'

export function TaskCard({ task, data, actions, variant, draggable, onDragStart, onDragEnd, onContextMenu }: {
  task: MapTask; data: MapData; actions: MapActions; variant: 'board' | 'graph'
  draggable?: boolean; onDragStart?: (e: DragEvent) => void; onDragEnd?: () => void; onContextMenu?: (e: MouseEvent) => void
}) {
  const row = data.rowOf.get(task.id)
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
        <div className="map-card__title">
          <span className="map-card__text">{task.title}</span>
          {row?.source === 'user' && row.area_id && <span className="map-card__pin" title="직접 옮긴 항목 — AI가 다시 정리해도 그대로예요"><Pin /></span>}
          {actions.changed.has(task.id) && <span className="map-card__dot" title="최근 정리로 바뀜" />}
        </div>
        {twoLine(task, data) && (
          <div className="map-card__meta">
            {date && <span className={`map-card__date is-${date.tone}`}>{date.label}</span>}
            {wait > 0 && <span className="map-chip" title="앞선 할 일이 아직 안 끝났어요">{variant === 'board' ? '⛓ ' : ''}먼저 {wait}</span>}
            {data.goalOf.has(task.id) && <span className="map-chip">🎯 목표</span>}
            {row?.state === 'review' && !row.area_id && <span className="map-badge">확인 필요</span>}
          </div>
        )}
      </div>
    </div>
  )
}

/** 주제 진행 고리(16px, 완료/전체) */
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

/** 그 자리 이름 입력칸: Enter 저장 · Esc 취소 · 빈칸/20자 넘음 거부(흔들고 그대로) */
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
      maxLength={40}
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

/** 열(영역) ⋯ 메뉴 — 14 §3 */
export function AreaMenu({ area, data, actions, anchor, point, onClose, onAddTopic }: { area: MapArea; data: MapData; actions: MapActions; anchor?: HTMLElement | null; point?: { x: number; y: number }; onClose: () => void; onAddTopic: () => void }) {
  const others = data.areas.filter((a) => !a.parent_id && a.id !== area.id)
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  return (
    <Popover anchor={anchor} point={point} onClose={onClose} width={200} className="menu">
      <MenuItem icon={<Pencil />} label="이름 바꾸기" onClick={done(() => actions.setEditing(area.id))} />
      <SubMenu icon={<Combine />} label="다른 영역과 합치기" disabled={!others.length} width={200}>
        {others.map((o) => <MenuItem key={o.id} icon={<span className="map-dot" style={{ background: o.color ?? 'var(--color-text-tertiary)' }} />} label={o.name} onClick={done(() => actions.merge(area.id, o.id))} />)}
      </SubMenu>
      <MenuItem icon={<Plus />} label="세부 주제 추가" onClick={done(onAddTopic)} />
      <div className="menu__divider" />
      <MenuItem icon={<Trash2 />} label="영역 삭제" danger onClick={done(() => actions.remove(area))} />
    </Popover>
  )
}

/** 세부 주제 ⋯ 메뉴 — 14 §3·§0.5 */
export function TopicMenu({ topic, data, actions, anchor, point, onClose }: { topic: MapArea; data: MapData; actions: MapActions; anchor?: HTMLElement | null; point?: { x: number; y: number }; onClose: () => void }) {
  const others = data.areas.filter((a) => a.parent_id === topic.parent_id && a.id !== topic.id && !a.archived_at)
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  return (
    <Popover anchor={anchor} point={point} onClose={onClose} width={200} className="menu">
      <MenuItem icon={<Pencil />} label="이름 바꾸기" onClick={done(() => actions.setEditing(topic.id))} />
      <SubMenu icon={<Combine />} label="다른 주제와 합치기" disabled={!others.length} width={200}>
        {others.map((o) => <MenuItem key={o.id} label={o.name} onClick={done(() => actions.merge(topic.id, o.id))} />)}
      </SubMenu>
      <MenuItem icon={topic.archived_at ? <ArchiveRestore /> : <Archive />} label={topic.archived_at ? '보관 풀기' : '보관'} onClick={done(() => actions.archive(topic.id, !topic.archived_at))} />
      <div className="menu__divider" />
      <MenuItem icon={<Trash2 />} label="주제 삭제" danger onClick={done(() => actions.remove(topic))} />
    </Popover>
  )
}

/** 카드 우클릭: 맨 위 `영역 옮기기 ›` + 열기·완료·휴지통 */
export function CardMenu({ task, data, actions, point, onClose }: { task: MapTask; data: MapData; actions: MapActions; point: { x: number; y: number }; onClose: () => void }) {
  const current = data.rowOf.get(task.id)?.area_id ?? null
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  return (
    <Popover point={point} onClose={onClose} width={194} className="menu">
      <SubMenu icon={<FolderInput />} label="영역 옮기기" width={220}>
        <div className="map-move-list">
          {data.areas.filter((a) => !a.parent_id).map((a) => (
            <div key={a.id}>
              <MenuItem icon={<span className="map-dot" style={{ background: a.color ?? 'var(--color-text-tertiary)' }} />} label={a.name} active={current === a.id} onClick={done(() => actions.place(task.id, a.id))} />
              {data.areas.filter((t) => t.parent_id === a.id && !t.archived_at).map((t) => (
                <MenuItem key={t.id} icon={<span className="map-indent" />} label={t.name} active={current === t.id} onClick={done(() => actions.place(task.id, t.id))} />
              ))}
            </div>
          ))}
          <MenuItem icon={<span className="map-dot" />} label="미분류" active={!current} onClick={done(() => actions.place(task.id, null))} />
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
