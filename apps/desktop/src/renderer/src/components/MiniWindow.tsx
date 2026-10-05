import { ChevronDown, MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createTask } from '../data/mutations'
import { useQuery } from '../data/useQuery'
import type { ListRow, TaskRow } from '../data/types'
import { addbarPlaceholder, defaultSettings, grouping, newTaskDefaults, openTasksSql, viewTitle } from '../data/views'
import { useLocalState } from '../data/preferences'
import { dayKey, rowDateLabel } from '../lib/dates'
import { checkboxColor } from '../lib/priority'
import { useTaskActions } from '../lib/taskActions'
import { MenuItem, Popover } from './Popover'
import { displayTitle } from '@sprout/schema/wikiLink' // 33 §6.6 메뉴바는 괄호 뺀 글

// 09 메뉴바 미니 창: 목록 전환 · 추가 바 · 할 일(체크·누르면 메인 창에서 열기)
const SMART = ['smart:today', 'smart:tomorrow', 'smart:next7', 'smart:inbox']

/** 09 §2 빈 상태 한 줄 [임시]: 시간대별 */
function moodLine(h = new Date().getHours()) {
  if (h < 11) return '좋은 하루 시작해요'
  if (h < 18) return '잠깐 쉬어가요'
  return '오늘도 수고했어요'
}

export function MiniWindow({ signedIn }: { signedIn: boolean }) {
  const [view, setView] = useLocalState('sprout.mini.view', 'smart:today')
  const [menu, setMenu] = useState<'view' | 'more'>()
  const viewRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const actions = useTaskActions()
  const today = dayKey()
  const lists = useQuery<ListRow>('SELECT id, name, emoji, color, kind, sort_order FROM lists WHERE archived_at IS NULL ORDER BY sort_order') ?? []
  const inboxId = lists.find((l) => l.kind === 'inbox')?.id
  const settings = useMemo(() => defaultSettings(view), [view])
  const q = useMemo(() => openTasksSql(view, settings, today), [view, settings, today])
  const tasks = useQuery<TaskRow>(q.sql, q.params)
  const roots = (tasks ?? []).filter((t) => !t.parent_id || !(tasks ?? []).some((p) => p.id === t.parent_id))
  const g = grouping(view.startsWith('list:') ? 'none' : 'time', lists, today)
  const groups = g.defs.map((d) => ({ ...d, rows: roots.filter((t) => g.of(t) === d.id) })).filter((d) => d.rows.length)

  useEffect(() => window.sprout?.mini?.onShown(() => requestAnimationFrame(() => inputRef.current?.focus())), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !menu) window.sprout?.mini?.hide() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [menu])

  if (!signedIn) {
    return (
      <div className="mini mini--empty">
        <p className="mini__empty-title">로그인이 필요해요</p>
        <button className="mini__main-btn" onClick={() => window.sprout?.mini?.showMain()}>메인 창 열기</button>
      </div>
    )
  }

  return (
    <div className="mini">
      <header className="mini__head">
        <button ref={viewRef} className="mini__view" onClick={() => setMenu(menu === 'view' ? undefined : 'view')}>
          {viewTitle(view, lists)}<ChevronDown />
        </button>
        <button ref={moreRef} className="icon-btn" aria-label="더 보기" onClick={() => setMenu(menu === 'more' ? undefined : 'more')}><MoreHorizontal /></button>
      </header>
      {menu === 'view' && (
        <Popover anchor={viewRef.current} width={200} className="menu" onClose={() => setMenu(undefined)}>
          {SMART.map((v) => <MenuItem key={v} label={viewTitle(v, lists)} active={view === v} onClick={() => { setView(v); setMenu(undefined) }} />)}
          <div className="menu__divider" />
          {lists.filter((l) => l.kind !== 'inbox').map((l) => (
            <MenuItem key={l.id} label={`${l.emoji ? `${l.emoji} ` : ''}${l.name}`} active={view === `list:${l.id}`} onClick={() => { setView(`list:${l.id}`); setMenu(undefined) }} />
          ))}
        </Popover>
      )}
      {menu === 'more' && (
        <Popover anchor={moreRef.current} align="end" width={180} className="menu" onClose={() => setMenu(undefined)}>
          <MenuItem label="메인 창 열기" trail={<span className="menu__key">⇧⌘E</span>} onClick={() => { setMenu(undefined); window.sprout?.mini?.showMain() }} />
          <MenuItem label="설정" onClick={() => { setMenu(undefined); window.sprout?.desktop?.openSettings() }} />
          <div className="menu__divider" />
          <MenuItem label="sprout 종료" onClick={() => window.sprout?.mini?.quit()} />
        </Popover>
      )}
      <div className="mini__add">
        <Plus className="addbar__icon" />
        <input
          ref={inputRef}
          className="addbar__input"
          placeholder={addbarPlaceholder(view)}
          onKeyDown={async (e) => {
            if (e.nativeEvent.isComposing || e.key !== 'Enter' || !inboxId) return
            const title = e.currentTarget.value.trim()
            if (!title) return
            e.currentTarget.value = ''
            await createTask({ title, ...newTaskDefaults(view, inboxId) })
          }}
        />
      </div>
      <div className="mini__list">
        {tasks && !groups.length && (
          <div className="mini__empty">
            <p className="mini__empty-title">{view === 'smart:today' ? '오늘 할 일이 없어요' : '할 일이 없어요'}</p>
            <p className="mini__empty-hint">{moodLine()}</p>
          </div>
        )}
        {groups.map((grp) => (
          <section key={grp.id}>
            {grp.name && <div className="mini__group">{grp.name} <span>{grp.rows.length}</span></div>}
            {grp.rows.map((t) => {
              const date = rowDateLabel(t, today)
              return (
                <div key={t.id} className="row mini__row">
                  <button
                    className="checkbox"
                    style={{ ['--checkbox-color' as string]: checkboxColor(t.priority) }}
                    aria-label="완료"
                    onClick={() => void actions.complete([t.id])}
                  />
                  <button className="row__title mini__title" onClick={() => window.sprout?.mini?.openTask(t.id)}>{displayTitle(t.title) || '제목 없음'}</button>
                  {date && <span className="row__meta"><span className={`row__date is-${date.tone}`}>{date.label}</span></span>}
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
