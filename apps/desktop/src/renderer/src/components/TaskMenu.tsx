import {
  ArrowRightLeft, ArrowUpToLine, CalendarDays, CalendarX, Copy, Link, ListTree, PinOff, SquareArrowRight, SquareX, Sun, Sunrise, Tag, Trash2
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ListRow, TagRow, TaskRow } from '../data/types'
import { dayKey } from '../lib/dates'
import type { TaskActions } from '../lib/taskActions'
import { ListPickerBody, PriorityRow, TagPickerBody } from './Pickers'
import { MenuItem, Popover, SubMenu } from './Popover'
import { CalendarPlus7 } from './icons'
import { useToast } from './Toast'
import { useQuery } from '../data/useQuery'
import { convertTaskToEvent } from '../data/events'

// 02 §0·§9 태스크 우클릭 메뉴(실측 문구). 여러 개를 고른 상태면 선택 전체에 적용한다.
type Props = {
  tasks: TaskRow[]
  lists: ListRow[]
  tags: TagRow[]
  actions: TaskActions
  point?: { x: number; y: number }
  anchor?: HTMLElement | null
  onClose: () => void
  onAddSubtask: (parentId: string) => void
  onPickDate: (ids: string[], at: { point?: { x: number; y: number }; anchor?: HTMLElement | null }) => void
}

export function tagState(tasks: TaskRow[], tagId: string): 'all' | 'some' | 'none' {
  const n = tasks.filter((t) => t.tag_ids?.split(',').includes(tagId)).length
  return n === 0 ? 'none' : n === tasks.length ? 'all' : 'some'
}

export function DateRow({ tasks, actions, onDone, onPick }: { tasks: TaskRow[]; actions: TaskActions; onDone: () => void; onPick?: () => void }) {
  const setEach = async (date: string | null) => {
    onDone()
    await actions.moveDates(tasks.map((t) => t.id), date) // 시각·기간은 유지하고 날짜만 바꾼다(03 §5)
  }
  const btn = (icon: ReactNode, label: string, onClick: () => void, disabled = false) => (
    <button className="menu__flag" title={label} aria-label={label} onClick={onClick} disabled={disabled}>{icon}</button>
  )
  return (
    <>
      <div className="menu__caption">날짜</div>
      <div className="menu__flags">
        {btn(<Sun />, '오늘', () => setEach(dayKey()))}
        {btn(<Sunrise />, '내일', () => setEach(dayKey(1)))}
        {btn(<CalendarPlus7 />, '다음 주', () => setEach(dayKey(7)))}
        {btn(<CalendarDays />, '날짜 지정', () => onPick?.(), !onPick)}
        {btn(<CalendarX />, '날짜 지우기', () => setEach(null))}
      </div>
    </>
  )
}

export function TaskMenu({ tasks, lists, tags, actions, point, anchor, onClose, onAddSubtask, onPickDate }: Props) {
  const ids = tasks.map((t) => t.id)
  const single = tasks.length === 1 ? tasks[0] : undefined
  const allPinned = tasks.every((t) => t.pinned_at)
  const allWontDo = tasks.every((t) => t.status === 2)
  const priority = tasks.every((t) => t.priority === tasks[0].priority) ? tasks[0].priority : undefined
  const done = (fn: () => unknown) => () => { onClose(); void fn() }
  // 06 §14.4.6 할 일 → 일정: 한 개만, 하위 할 일이 없을 때
  const toast = useToast()
  const kids = useQuery<{ n: number }>('SELECT count(*) AS n FROM tasks WHERE parent_id = ? AND deleted_at IS NULL', [single?.id ?? ''])?.[0]?.n ?? 0
  const toEvent = async () => {
    if (!single) return
    const r = await convertTaskToEvent(single.id, dayKey())
    if (r === 'has-children') toast.show('하위 할 일이 있으면 일정으로 바꿀 수 없어요')
    else if (r) toast.show('일정으로 바꿨어요', r.restore)
  }
  return (
    <Popover point={point} anchor={anchor} onClose={onClose} width={194} className="menu">
      <DateRow tasks={tasks} actions={actions} onDone={onClose} onPick={() => { onClose(); onPickDate(ids, { point, anchor }) }} />
      <PriorityRow value={priority} onPick={(p) => done(() => actions.setPriority(ids, p))()} />
      <div className="menu__divider" />
      <MenuItem icon={<ListTree />} label="하위 할일 추가" disabled={!single} onClick={done(() => single && onAddSubtask(single.id))} />
      <MenuItem icon={allPinned ? <PinOff /> : <ArrowUpToLine />} label={allPinned ? '고정 해제' : '상단 고정'} onClick={done(() => actions.pin(ids, !allPinned))} />
      <MenuItem icon={<SquareX />} label={allWontDo ? '계획 취소 해제' : '계획 취소'} onClick={done(() => actions.wontDo(ids, !allWontDo))} />
      <SubMenu icon={<SquareArrowRight />} label="이동" width={240}>
        <ListPickerBody lists={lists} current={single?.list_id} onPick={(l) => done(() => actions.move(ids, l))()} />
      </SubMenu>
      <SubMenu icon={<Tag />} label="태그">
        <TagPickerBody tags={tags} state={(id) => tagState(tasks, id)} onToggle={(id, on) => void actions.toggleTag(ids, id, on)} />
      </SubMenu>
      <div className="menu__divider" />
      <MenuItem icon={<Copy />} label="복사" onClick={done(() => actions.duplicate(ids))} />
      <MenuItem icon={<Link />} label="링크 복사" disabled={!single} onClick={done(() => single && actions.copyLink(single.id))} />
      <MenuItem icon={<ArrowRightLeft />} label={single && kids ? '일정으로 바꾸기 (하위 할 일 있음)' : '일정으로 바꾸기'} disabled={!single || kids > 0} onClick={done(toEvent)} />
      <MenuItem icon={<Trash2 />} label="삭제" onClick={done(() => actions.trash(ids))} />
    </Popover>
  )
}

