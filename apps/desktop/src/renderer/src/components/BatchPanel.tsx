import { ArrowRightToLine, CalendarDays, Check, Clock, Flag, Tag, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useQuery } from '../data/useQuery'
import type { ListRow, TagRow, TaskRow } from '../data/types'
import { openTasksSqlById } from '../data/taskQueries'
import type { TaskActions } from '../lib/taskActions'
import { ListPickerBody, PriorityRow, TagPickerBody } from './Pickers'
import { MenuItem, Popover, SubMenu } from './Popover'
import { DateRow, tagState } from './TaskMenu'
import { DatePicker, EMPTY_SCHEDULE } from './DatePicker'

// 02 §10 일괄 편집: 2개 이상 고르면 상세 패널 자리에 뜬다.
const POSTPONE: [string, { minutes?: number; days?: number }][] = [
  ['15분', { minutes: 15 }], ['30분', { minutes: 30 }], ['1시간', { minutes: 60 }], ['2시간', { minutes: 120 }], ['1일', { days: 1 }], ['1주', { days: 7 }]
]

export function BatchPanel({ ids, lists, tags, actions, onClear }: { ids: string[]; lists: ListRow[]; tags: TagRow[]; actions: TaskActions; onClear: () => void }) {
  const { sql, params } = openTasksSqlById(ids)
  const tasks = useQuery<TaskRow>(sql, params) ?? []
  const [menu, setMenu] = useState<'date' | 'priority' | 'list' | 'tag' | 'picker'>()
  const refs = { date: useRef<HTMLButtonElement>(null), priority: useRef<HTMLButtonElement>(null), list: useRef<HTMLButtonElement>(null), tag: useRef<HTMLButtonElement>(null) }
  const close = () => setMenu(undefined)
  const toggle = (m: NonNullable<typeof menu>) => setMenu(menu === m ? undefined : m)
  const shown = tasks.slice(0, 10)
  return (
    <aside className="detail batch">
      <header className="detail__header batch__header">
        <span className="batch__count">{ids.length}개 선택됨</span>
        <button className="icon-btn" aria-label="선택 해제" onClick={onClear}><X /></button>
      </header>
      <div className="batch__tools">
        <button ref={refs.date} className="batch__tool" onClick={() => toggle('date')}><CalendarDays /><span>날짜</span></button>
        <button ref={refs.priority} className="batch__tool" onClick={() => toggle('priority')}><Flag /><span>우선순위</span></button>
        <button ref={refs.list} className="batch__tool" onClick={() => toggle('list')}><ArrowRightToLine /><span>이동</span></button>
        <button ref={refs.tag} className="batch__tool" onClick={() => toggle('tag')}><Tag /><span>태그</span></button>
        <button className="batch__tool" onClick={() => { void actions.complete(ids); onClear() }}><Check /><span>완료</span></button>
        <button className="batch__tool is-danger" onClick={() => { void actions.trash(ids); onClear() }}><Trash2 /><span>삭제</span></button>
      </div>
      {menu === 'date' && (
        <Popover anchor={refs.date.current} onClose={close} width={232} className="menu">
          <DateRow tasks={tasks} actions={actions} onDone={close} onPick={() => setMenu('picker')} />
          <div className="menu__divider" />
          <SubMenu icon={<Clock />} label="미루기" width={160}>
            {POSTPONE.map(([label, opt]) => <MenuItem key={label} label={label} onClick={() => { close(); void actions.postpone(ids, opt) }} />)}
          </SubMenu>
        </Popover>
      )}
      {menu === 'picker' && (
        <DatePicker initial={EMPTY_SCHEDULE} anchor={refs.date.current} onSave={(s) => void actions.applySchedule(ids, s)} onClose={close} />
      )}
      {menu === 'priority' && (
        <Popover anchor={refs.priority.current} onClose={close} className="menu">
          <PriorityRow value={tasks.every((t) => t.priority === tasks[0]?.priority) ? tasks[0]?.priority : undefined} onPick={(p) => { close(); void actions.setPriority(ids, p) }} />
        </Popover>
      )}
      {menu === 'list' && (
        <Popover anchor={refs.list.current} onClose={close} width={240} className="menu">
          <ListPickerBody lists={lists} onPick={(l) => { close(); void actions.move(ids, l) }} />
        </Popover>
      )}
      {menu === 'tag' && (
        <Popover anchor={refs.tag.current} onClose={close} width={220} className="menu">
          <TagPickerBody tags={tags} state={(id) => tagState(tasks, id)} onToggle={(id, on) => void actions.toggleTag(ids, id, on)} />
        </Popover>
      )}
      <ul className="batch__list">
        {shown.map((t) => <li key={t.id}>{t.title || '제목 없음'}</li>)}
        {tasks.length > shown.length && <li className="batch__more">외 {tasks.length - shown.length}개</li>}
      </ul>
    </aside>
  )
}
