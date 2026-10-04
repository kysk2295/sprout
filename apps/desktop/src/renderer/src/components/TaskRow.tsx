import { AlarmClock, Check, ChevronDown, ChevronRight, GripVertical, ListChecks, MoreHorizontal, Repeat, X } from 'lucide-react'
import type { MouseEvent, PointerEvent } from 'react'
import type { TagRow, TaskRow } from '../data/types'
import { rowDateLabel } from '../lib/dates'
import { checkboxColor } from '../lib/priority'

// 02 §6 행: 손잡이 · 체크박스 · 제목 · 펼침 · 메타(태그·리스트·⟲·날짜) · 호버 `...`
export const INDENT = 24

type Props = {
  task: TaskRow
  depth: number
  hasChildren: boolean
  collapsed: boolean
  tags: TagRow[]
  today: string
  showList: boolean
  showDetails: boolean
  selected: boolean
  done: boolean
  editing: boolean
  dragSource: boolean
  rowRef: (el: HTMLDivElement | null) => void
  onRowClick: (e: MouseEvent) => void
  onTitleClick: (e: MouseEvent) => void
  onContextMenu: (e: MouseEvent) => void
  onToggle: () => void
  onExpand: () => void
  onEditEnd: (title: string | null, viaEnter: boolean) => void
  onGripDown: (e: PointerEvent) => void
  onRowDown: (e: PointerEvent) => void
}

export function TaskRowView(p: Props) {
  const { task } = p
  const date = rowDateLabel(task, p.today)
  const rowTags = (task.tag_ids?.split(',') ?? []).map((id) => p.tags.find((t) => t.id === id)).filter(Boolean) as TagRow[]
  const wontDo = task.status === 2
  const checklist = task.content_mode === 'checklist' && task.check_total > 0
  const preview = p.showDetails && task.content_mode !== 'checklist' ? (task.content ?? '').split('\n').find((l) => l.trim()) : undefined
  const cls = ['row', p.selected && 'is-selected', p.done && 'is-done', wontDo && 'is-wontdo', p.dragSource && 'is-drag-source', p.showDetails && 'is-detailed']
  return (
    <div
      ref={p.rowRef}
      data-id={task.id}
      className={cls.filter(Boolean).join(' ')}
      style={{ paddingLeft: 12 + p.depth * INDENT }}
      onClick={p.onRowClick}
      onContextMenu={p.onContextMenu}
      onPointerDown={p.onRowDown}
    >
      <span className="row__grip" style={{ left: -16 + p.depth * INDENT }} onPointerDown={(e) => { e.stopPropagation(); p.onGripDown(e) }}>
        <GripVertical />
      </span>
      <button
        className="checkbox"
        style={{ ['--checkbox-color' as string]: checkboxColor(task.priority) }}
        onClick={(e) => { e.stopPropagation(); p.onToggle() }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={p.done ? '완료 취소' : '완료'}
        disabled={!!task.deleted_at}
      >
        {p.done && <Check strokeWidth={3} />}
        {wontDo && <X strokeWidth={3} />}
      </button>
      <div className="row__main">
        {p.editing ? (
          <input
            className="row__title row__title-input"
            defaultValue={task.title}
            autoFocus
            placeholder="제목 없음"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') { e.preventDefault(); p.onEditEnd(e.currentTarget.value, true) }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); p.onEditEnd(null, false) }
            }}
            onBlur={(e) => p.onEditEnd(e.currentTarget.value, false)}
          />
        ) : (
          <span className="row__title" onClick={p.onTitleClick}>{task.title || <span className="row__untitled">제목 없음</span>}</span>
        )}
        {preview && <span className="row__preview">{preview}</span>}
      </div>
      {p.hasChildren && (
        <button className="row__expand" aria-label={p.collapsed ? '하위 태스크 펼치기' : '하위 태스크 접기'} onClick={(e) => { e.stopPropagation(); p.onExpand() }} onPointerDown={(e) => e.stopPropagation()}>
          {p.collapsed ? <ChevronRight /> : <ChevronDown />}
        </button>
      )}
      <span className="row__meta">
        {rowTags.map((t) => (
          <span key={t.id} className="tag-pill" style={{ ['--tag-color' as string]: t.color ?? 'var(--color-priority-none)' }}>{t.name}</span>
        ))}
        {checklist && <span className="row__progress"><ListChecks className="row__icon" />{task.check_done}/{task.check_total}</span>}
        {p.showList && task.list_name && <span className="row__list">{task.list_kind === 'inbox' ? '기본함' : `${task.list_emoji ? `${task.list_emoji} ` : ''}${task.list_name}`}</span>}
        {task.repeat_rule && <Repeat className="row__icon" />}
        {task.reminder_count > 0 && <AlarmClock className="row__icon" />}
        {date && <span className={`row__date is-${date.tone}`}>{date.label}</span>}
      </span>
    </div>
  )
}
