import { DetailEmptyArt } from './EmptyState'
import {
  Baseline, CalendarDays, Repeat, Check, ChevronUp, ArrowUpToLine, Copy, Flag, GripVertical, Link, List, ListTree, MoreHorizontal, PinOff, Plus, SquareArrowRight, SquareX, Tag, Trash2, X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '../data/useQuery'
import { addCheckItem, createTask, removeCheckItem, toggleContentMode, updateCheckItem, updateTask } from '../data/mutations'
import { openTasksSqlById } from '../data/taskQueries'
import { listLabel, type CheckItemRow, type ListRow, type TagRow, type TaskRow } from '../data/types'
import { dayKey, detailDateLabel, rowDateLabel } from '../lib/dates'
import { checkboxColor, flagColor } from '../lib/priority'
import type { TaskActions } from '../lib/taskActions'
import { SuggestChip } from './listSuggest/ListSuggest'
import { ListPickerBody, PriorityRow, TagPickerBody } from './Pickers'
import { MenuItem, Popover } from './Popover'
import { DatePicker } from './DatePicker'
import { loadSchedule } from '../data/schedule'
import type { Schedule } from '../lib/taskActions'
import { tagState } from './TaskMenu'
import { WikiComplete } from './wiki/WikiComplete'
import { removeTaskTag } from '../data/wiki'
import { tagText } from '../../../shared/emoji'
import { useToast } from './Toast'
import { PanelClose, panelEsc } from './PanelClose'

// 02-task-list §13: 머리(체크·날짜·깃발) · 제목 · 태그 · 본문/체크 항목 · 하위 태스크 · 하단 바. 편집은 300ms 디바운스로 바로 저장(§13.4).
const SAVE_DEBOUNCE = 300

type Props = { taskId?: string; lists: ListRow[]; tags: TagRow[]; actions: TaskActions; onSelect: (id: string) => void; onClose: () => void
  /** 01 §2.1 오른쪽 패널 닫기(✕ · Esc): 주면 머리 오른쪽 끝에 ✕를 둔다(캘린더 할 일 팝업처럼 바깥 클릭으로 닫히는 곳은 안 줌) */
  onHide?: () => void }

export function DetailPane({ taskId, ...rest }: Props) {
  const q = openTasksSqlById(taskId ? [taskId] : [])
  const task = useQuery<TaskRow>(q.sql, q.params)?.[0]
  if (!task) {
    return (
      <aside className="detail detail--empty" onKeyDown={rest.onHide ? panelEsc(rest.onHide) : undefined}>
        <div className="detail__drag" />
        {rest.onHide && <PanelClose onClose={rest.onHide} className="detail__close-float" />}
        <DetailEmptyArt />
        <p className="detail__empty-text">태스크 제목을 누르면 자세히 볼 수 있어요</p>
      </aside>
    )
  }
  return <DetailBody key={task.id} task={task} {...rest} />
}

function DetailBody({ task, lists, tags, actions, onSelect, onClose, onHide }: Omit<Props, 'taskId'> & { task: TaskRow }) {
  const [menu, setMenu] = useState<'priority' | 'list' | 'more' | 'tag'>()
  const [picker, setPicker] = useState<Schedule>()
  const dateRef = useRef<HTMLButtonElement>(null)
  const flagRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const tagAddRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  // 33 §6.6: 자동(ai·rule) 태그는 알약 왼쪽 작은 ✦ + 툴팁, ✕ = 한 번에 떼기(dismissed — 다시 안 붙음)
  const tagSources = useQuery<{ tag_id: string; source: string | null; confidence: number | null }>(
    "SELECT tag_id, source, confidence FROM task_tags WHERE task_id = ? AND COALESCE(state, 'accepted') = 'accepted'", [task.id]
  ) ?? []
  const [addingSub, setAddingSub] = useState(false)
  const parent = useQuery<{ id: string; title: string }>('SELECT id, title FROM tasks WHERE id = ?', [task.parent_id ?? ''])?.[0]
  const date = detailDateLabel(task, dayKey())
  const done = task.status === 1
  const wontDo = task.status === 2
  const trashed = !!task.deleted_at
  const checklist = task.content_mode === 'checklist'
  const taskTags = (task.tag_ids?.split(',') ?? []).map((id) => tags.find((t) => t.id === id)).filter(Boolean) as TagRow[]
  const close = () => setMenu(undefined)

  return (
    <aside className="detail" onKeyDown={onHide ? panelEsc(onHide) : undefined}>
      {trashed && (
        <div className="detail__band">
          휴지통에 있는 태스크입니다
          <button onClick={() => actions.restore([task.id])}>복원</button>
          <button className="is-danger" onClick={() => { onClose(); void actions.deleteForever([task.id]) }}>영구 삭제</button>
        </div>
      )}
      <header className="detail__header">
        <button
          className={`checkbox${done ? ' is-checked' : ''}`}
          style={{ ['--checkbox-color' as string]: checkboxColor(task.priority) }}
          onClick={() => (task.status === 0 ? actions.complete([task.id]) : actions.reopen([task.id]))}
          disabled={trashed}
          aria-label={done ? '완료 취소' : '완료'}
        >
          {done && <Check strokeWidth={3} />}
          {wontDo && <X strokeWidth={3} />}
        </button>
        <span className="detail__sep" />
        <button ref={dateRef} className={`detail__date is-${date.tone}`} disabled={trashed} onClick={async () => setPicker(await loadSchedule(task.id))}>
          <CalendarDays />
          <span className="detail__date-text">{date.label}</span>
          {task.repeat_rule && <Repeat className="detail__date-icon" />}
        </button>
        {picker && <DatePicker initial={picker} anchor={dateRef.current} onSave={(s) => void actions.applySchedule([task.id], s)} onClose={() => setPicker(undefined)} />}
        <button ref={flagRef} className="icon-btn detail__flag" aria-label="우선순위" style={{ color: flagColor(task.priority) }} onClick={() => setMenu(menu === 'priority' ? undefined : 'priority')}>
          <Flag fill={task.priority ? 'currentColor' : 'none'} />
        </button>
        {menu === 'priority' && (
          <Popover anchor={flagRef.current} onClose={close} align="end" className="menu">
            <PriorityRow value={task.priority} onPick={(p) => { close(); void actions.setPriority([task.id], p) }} />
          </Popover>
        )}
        {onHide && <PanelClose onClose={onHide} />}
      </header>
      <div className="detail__body">
        {/* 02 §13.4: 하위 태스크면 부모 이름을 작은 링크로 */}
        {parent && (
          <button className="detail__parent" onClick={() => onSelect(parent.id)}>
            <ChevronUp />
            {parent.title || '제목 없음'}
          </button>
        )}
        <div className="detail__title-row">
          <DebouncedText
            ref={titleRef}
            className="detail__title"
            value={task.title}
            placeholder="제목 없음"
            onSave={(title) => updateTask(task.id, { title })}
            onEnter={() => (checklist ? document.querySelector<HTMLElement>('.check__text')?.focus() : contentRef.current?.focus())}
          />
          <button
            className={`icon-btn${checklist ? ' is-on' : ''}`}
            aria-label={checklist ? '본문으로 전환' : '체크 항목으로 전환'}
            title={checklist ? '본문으로 전환' : '체크 항목으로 전환'}
            onClick={() => toggleContentMode(task.id)}
          >
            <List />
          </button>
        </div>
        {taskTags.length > 0 && (
          <div className="detail__tags">
            {taskTags.map((t) => {
              const src = tagSources.find((x) => x.tag_id === t.id)
              const auto = src && ['ai', 'rule'].includes(src.source ?? 'user')
              const tip = auto ? `AI가 붙였어요${src.confidence != null ? ` · ${src.confidence}점` : ''} · ✕로 떼면 다시 안 붙여요` : src?.source === 'link' ? `[[${t.name}]] 링크로 붙었어요` : undefined
              return (
                <span key={t.id} className="tag-pill" title={tip} style={{ ['--tag-color' as string]: t.color ?? 'var(--color-priority-none)' }}>
                  {auto && <span className="tag-pill__ai" aria-label="AI가 붙인 태그">✦</span>}
                  {tagText(t)}
                  <button
                    className="tag-pill__x"
                    aria-label={`${t.name} 태그 빼기`}
                    onClick={async () => {
                      if (!src || (src.source ?? 'user') === 'user') return void actions.toggleTag([task.id], t.id, false)
                      const undo = await removeTaskTag(task.id, t.id)
                      toast.show(`'${t.name}' 태그를 뗐어요`, undo)
                    }}
                  ><X /></button>
                </span>
              )
            })}
            <button ref={tagAddRef} className="detail__tag-add" aria-label="태그 추가" onClick={() => setMenu(menu === 'tag' ? undefined : 'tag')}><Plus /></button>
          </div>
        )}
        {menu === 'tag' && (
          <Popover anchor={tagAddRef.current ?? moreRef.current} align={tagAddRef.current ? undefined : 'end'} onClose={close} width={220} className="menu">
            <TagPickerBody tags={tags} state={(id) => tagState([task], id)} onToggle={(id, on) => void actions.toggleTag([task.id], id, on)} />
          </Popover>
        )}
        <WikiComplete target={titleRef} modes={['[[']} />
        {!checklist && <WikiComplete target={contentRef} modes={['[[']} />}
        {checklist ? (
          <CheckItems taskId={task.id} />
        ) : (
          <DebouncedText
            ref={contentRef}
            className="detail__content"
            value={task.content ?? ''}
            placeholder="무언가를 쓰세요"
            multiline
            onSave={(content) => updateTask(task.id, { content })}
          />
        )}
        <Subtasks task={task} onSelect={onSelect} actions={actions} adding={addingSub} setAdding={setAddingSub} />
      </div>
      {task.list_kind === 'inbox' && task.status === 0 && !task.deleted_at && !task.parent_id && <div className="ls-detail"><SuggestChip taskId={task.id} variant="detail" /></div>}
      <footer className="detail__footer">
        <button ref={listRef} className="detail__list" onClick={() => setMenu(menu === 'list' ? undefined : 'list')}>
          <SquareArrowRight />
          {listLabel({ kind: task.list_kind, name: task.list_name, emoji: task.list_emoji })}
        </button>
        {menu === 'list' && (
          <Popover anchor={listRef.current} onClose={close} width={240} className="menu">
            <ListPickerBody lists={lists} current={task.list_id} onPick={(l) => { close(); void actions.move([task.id], l) }} />
          </Popover>
        )}
        <span className="detail__footer-actions">
          <button className="icon-btn" aria-label="서식"><Baseline /></button>
          <button ref={moreRef} className="icon-btn" aria-label="더 보기" onClick={() => setMenu(menu === 'more' ? undefined : 'more')}><MoreHorizontal /></button>
        </span>
        {menu === 'more' && (
          <Popover anchor={moreRef.current} onClose={close} align="end" width={173} className="menu">
            {/* 02 §0 상세 `...` 메뉴(실측, v1 범위): 하위 할일 추가 · 상단 고정 · 계획 취소 · 태그 / 복사 · 링크 복사 · 삭제 */}
            {!trashed && (
              <>
                <MenuItem icon={<ListTree />} label="하위 할일 추가" onClick={() => { close(); setAddingSub(true) }} />
                <MenuItem icon={task.pinned_at ? <PinOff /> : <ArrowUpToLine />} label={task.pinned_at ? '고정 해제' : '상단 고정'} onClick={() => { close(); void actions.pin([task.id], !task.pinned_at) }} />
                <MenuItem icon={<SquareX />} label={wontDo ? '계획 취소 해제' : '계획 취소'} onClick={() => { close(); void actions.wontDo([task.id], !wontDo) }} />
                <MenuItem icon={<Tag />} label="태그" onClick={() => setMenu('tag')} />
                <div className="menu__divider" />
                <MenuItem icon={<Copy />} label="복사" onClick={() => { close(); void actions.duplicate([task.id]) }} />
                <MenuItem icon={<Link />} label="링크 복사" onClick={() => { close(); void actions.copyLink(task.id) }} />
                <MenuItem icon={<Trash2 />} label="삭제" onClick={() => { close(); void actions.trash([task.id]) }} />
              </>
            )}
            {trashed && <MenuItem icon={<Trash2 />} label="복원" onClick={() => { close(); void actions.restore([task.id]) }} />}
          </Popover>
        )}
      </footer>
    </aside>
  )
}

/** 02 §13.2 체크 항목: Enter = 다음 항목, 빈 항목에서 Backspace = 삭제 후 윗 항목으로 */
function CheckItems({ taskId }: { taskId: string }) {
  const items = useQuery<CheckItemRow>('SELECT id, task_id, title, done, sort_order FROM check_items WHERE task_id = ? ORDER BY sort_order', [taskId]) ?? []
  const [focusId, setFocusId] = useState<string>()
  useEffect(() => {
    if (!focusId) return
    const el = document.querySelector<HTMLElement>(`[data-check="${focusId}"]`)
    if (el) {
      el.focus()
      setFocusId(undefined)
    }
  }, [focusId, items])
  const insertAfter = async (idx: number) => {
    const cur = items[idx]
    const next = items[idx + 1]
    const so = next ? (cur.sort_order + next.sort_order) / 2 : (cur?.sort_order ?? 0) + 1
    setFocusId(await addCheckItem(taskId, '', so))
  }
  return (
    <div className="check">
      {items.map((it, i) => (
        <div key={it.id} className={`check__row${it.done ? ' is-done' : ''}`}>
          <GripVertical className="check__grip" />
          <button
            className={`checkbox check__box${it.done ? ' is-checked' : ''}`}
            aria-label={it.done ? '체크 해제' : '체크'}
            onClick={() => updateCheckItem(it.id, { done: it.done ? 0 : 1, completed_at: it.done ? null : new Date().toISOString() })}
          >
            {it.done ? <Check strokeWidth={3} /> : null}
          </button>
          <DebouncedText
            className="check__text"
            data-check={it.id}
            value={it.title}
            placeholder="항목"
            onSave={(title) => updateCheckItem(it.id, { title })}
            onEnter={() => void insertAfter(i)}
            onBackspaceEmpty={() => {
              if (items.length <= 1) return
              void removeCheckItem(it.id)
              setFocusId(items[i - 1]?.id ?? items[i + 1]?.id)
            }}
          />
          <button className="check__remove" aria-label="항목 삭제" onClick={() => removeCheckItem(it.id)}><X /></button>
        </div>
      ))}
      <button className="check__add" onClick={() => void insertAfter(items.length - 1)}><Plus />항목 추가</button>
    </div>
  )
}

/** 02 §13.2 하위 태스크 목록 + "하위 태스크 추가" (Enter로 계속 추가) */
function Subtasks({ task, onSelect, actions, adding, setAdding }: { task: TaskRow; onSelect: (id: string) => void; actions: TaskActions; adding: boolean; setAdding: (v: boolean) => void }) {
  const kids = useQuery<TaskRow>(
    `SELECT id, title, status, priority, start_at, due_at FROM tasks WHERE parent_id = ? AND deleted_at IS NULL ORDER BY status, sort_order, created_at`,
    [task.id]
  ) ?? []
  const today = dayKey()
  if (!kids.length && !adding) return null
  return (
    <div className="subtasks">
      {kids.length > 0 && <div className="subtasks__caption">하위 태스크 {kids.filter((k) => k.status !== 0).length}/{kids.length}</div>}
      {kids.map((k) => {
        const d = rowDateLabel(k, today)
        return (
          <div key={k.id} className={`subtasks__row${k.status === 1 ? ' is-done' : ''}`}>
            <button
              className={`checkbox${k.status === 1 ? ' is-checked' : ''}`}
              style={{ ['--checkbox-color' as string]: checkboxColor(k.priority) }}
              onClick={() => (k.status === 0 ? actions.complete([k.id]) : actions.reopen([k.id]))}
              aria-label="완료"
            >
              {k.status === 1 && <Check strokeWidth={3} />}
              {k.status === 2 && <X strokeWidth={3} />}
            </button>
            <button className="subtasks__title" onClick={() => onSelect(k.id)}>{k.title || '제목 없음'}</button>
            {d && <span className={`row__date is-${d.tone}`}>{d.label}</span>}
          </div>
        )
      })}
      <div className="subtasks__add">
        <Plus />
        <input
          placeholder="하위 태스크 추가"
          autoFocus={adding}
          onBlur={(e) => { if (!e.currentTarget.value) setAdding(false) }}
          onKeyDown={async (e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              const title = e.currentTarget.value.trim()
              if (!title) return
              e.currentTarget.value = ''
              await createTask({ title, list_id: task.list_id!, parent_id: task.id, sort_order: Date.now() })
            } else if (e.key === 'Escape') e.currentTarget.blur()
          }}
        />
      </div>
    </div>
  )
}

// 입력은 그 자리에서 고치고 300ms 뒤 저장한다. 바깥에서 값이 바뀌면(다른 화면에서 편집) 포커스가 없을 때만 따라간다.
type DebouncedProps = {
  value: string
  onSave: (v: string) => unknown
  className: string
  placeholder: string
  multiline?: boolean
  onEnter?: () => void
  onBackspaceEmpty?: () => void
  ref?: React.Ref<HTMLDivElement>
  'data-check'?: string
}
function DebouncedText({ value, onSave, className, placeholder, multiline, onEnter, onBackspaceEmpty, ref, ...rest }: DebouncedProps) {
  const el = useRef<HTMLDivElement>(null)
  const timer = useRef<number>(undefined)
  const pending = useRef<string>(undefined)
  const save = useRef(onSave)
  save.current = onSave
  const flush = () => {
    window.clearTimeout(timer.current)
    if (pending.current !== undefined) void save.current(pending.current)
    pending.current = undefined
  }
  useEffect(() => {
    if (el.current && document.activeElement !== el.current && el.current.innerText !== value) el.current.innerText = value
  }, [value])
  useEffect(() => flush, []) // 다른 태스크로 넘어가면 남은 입력을 저장
  return (
    <div
      ref={(node) => {
        el.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = node
      }}
      className={className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-check={rest['data-check']}
      onInput={(e) => {
        pending.current = e.currentTarget.innerText.replace(/\n$/, '')
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(flush, SAVE_DEBOUNCE)
      }}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (!multiline && e.key === 'Enter') {
          e.preventDefault()
          flush()
          onEnter?.()
        }
        if (e.key === 'Backspace' && onBackspaceEmpty && !e.currentTarget.innerText.trim()) {
          e.preventDefault()
          onBackspaceEmpty()
        }
      }}
    />
  )
}
