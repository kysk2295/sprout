import { AlertTriangle, CalendarDays, ChevronDown, PanelLeft, Plus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { addDaysStr, statusText } from '../../../../shared/calendars'
import { askGrant, calendarsApi, connectCalendar, eventWhen, useCalendarsStatus, useCalendarTargets, useExtCounts, useExtEvents, type ExtEvent } from '../../data/calendars'
import { createEvent } from '../../data/events'
import { parseAdd } from '../../lib/addParse'
import { useToast } from '../Toast'
import { useLocalState } from '../../data/preferences'
import { dayKey } from '../../lib/dates'
import { DetailEmptyArt, EmptyState } from '../EmptyState'
import { MenuItem, Popover } from '../Popover'
import { ExtEventCard } from './ExtEventCard'
import './calendars.css'

// 16 §2.4 (G2) 사이드바 "구독 캘린더" 구역 + 계정을 누르면 가운데 목록(오늘 / 다음 7일 / 나중에, 앞으로 3개월)
export function ExtSidebarSection({ item, collapsed, toggle }: {
  item: (key: string, label: string, icon: ReactNode, count?: number) => ReactNode
  collapsed: string[]
  toggle: (key: string) => void
}) {
  const s = useCalendarsStatus()
  const counts = useExtCounts()
  const [add, setAdd] = useState<HTMLElement>()
  if (!s?.accounts.length) return null
  const closed = collapsed.includes('ext')
  return (
    <>
      <div className="sidebar__section">
        <button className="sidebar-section-toggle" onClick={() => toggle('ext')} aria-expanded={!closed}>구독 캘린더<ChevronDown size={12} style={{ transform: closed ? 'rotate(-90deg)' : undefined }} /></button>
        <span className="sidebar__section-actions"><button aria-label="캘린더 구독 추가" onClick={(e) => setAdd(e.currentTarget)}><Plus /></button></span>
      </div>
      {!closed && s.accounts.map((a) => {
        const st = statusText(a)
        return <div key={a.id} className="ext-sidebar__item" title={st.danger ? st.text : undefined}>{item(`ext:${a.id}`, a.label, st.danger ? <AlertTriangle className="ext-panel__warn" /> : <CalendarDays />, counts[a.id] ?? 0)}</div>
      })}
      {add && (
        <Popover anchor={add} className="menu" width={180} onClose={() => setAdd(undefined)}>
          <MenuItem icon={<CalendarDays />} label="구글 캘린더" disabled={!s.providers.google.configured} onClick={() => { setAdd(undefined); void connectCalendar('google') }} />
          {s.providers.apple.available && <MenuItem icon={<CalendarDays />} label="Apple 캘린더" disabled={s.accounts.some((a) => a.provider === 'apple')} onClick={() => { setAdd(undefined); void connectCalendar('apple') }} />}
        </Popover>
      )}
    </>
  )
}

const md = (d: string) => (d === dayKey() ? '오늘' : d === dayKey(1) ? '내일' : `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`)
const shortTime = (f: string) => { const h = Number(f.slice(11, 13)); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${f.slice(14, 16)}` }

/** 가운데 목록 + 오른쪽 상세. 위에 틱틱처럼 추가 바 `"<계정>"에 일정 추가`(16 §12.4.2 — 만든 일정은 연결된 일정) */
export function ExtAgenda({ accountId, onToggleSidebar, detailWidth }: { accountId: string; onToggleSidebar: () => void; detailWidth: number }) {
  const s = useCalendarsStatus()
  const account = s?.accounts.find((a) => a.id === accountId)
  const today = dayKey()
  const until = addDaysStr(today, 90)
  const events = useExtEvents(today, until, { accountId })
  const [picked, setPicked] = useState<string>()
  const [closed, setClosed] = useLocalState<string[]>('sprout.ext.collapsed', ['later'])
  const groups = useMemo(() => {
    const in7 = addDaysStr(today, 7)
    const g: { id: string; name: string; items: ExtEvent[] }[] = [{ id: 'today', name: '오늘', items: [] }, { id: 'next7', name: '다음 7일', items: [] }, { id: 'later', name: '나중에', items: [] }]
    for (const e of events) {
      const d = e.start.slice(0, 10) < today ? today : e.start.slice(0, 10)
      g[d === today ? 0 : d <= in7 ? 1 : 2].items.push(e)
    }
    return g.filter((x) => x.items.length)
  }, [events, today])
  const ev = events.find((e) => e.key === picked)
  const st = account ? statusText(account) : undefined
  return (
    <>
      <main className="list ext-agenda">
        <header className="pane-header">
          <button className="icon-btn" onClick={onToggleSidebar} aria-label="사이드바 접기 (⌘\)"><PanelLeft /></button>
          <h1 className="pane-header__title">{account?.label ?? ''}</h1>
        </header>
        {account && <AddBar accountId={account.id} label={account.label} />}
        {st?.danger && <p className="ext-agenda__warn"><AlertTriangle />{st.text}{st.action === 'reconnect' && account && <button onClick={() => void connectCalendar(account.provider)}>다시 연결</button>}{st.action === 'settings' && <button onClick={() => void calendarsApi()?.openPrivacy()}>시스템 설정 열기</button>}</p>}
        <div className="list__scroll">
          {!groups.length && <EmptyState icon="calendar" title="앞으로 3개월 동안 일정이 없어요." />}
          {groups.map((g) => (
            <section key={g.id} className="group">
              <div className="group__header" onClick={() => setClosed((c) => (c.includes(g.id) ? c.filter((x) => x !== g.id) : [...c, g.id]))}>
                <ChevronDown className={`group__chevron${closed.includes(g.id) ? ' is-collapsed' : ''}`} />
                <span className="group__name">{g.name}</span>
                <span className="group__count">{g.items.length}</span>
              </div>
              {!closed.includes(g.id) && g.items.map((e) => (
                <div key={e.key} role="button" tabIndex={0} className={`ext-row${picked === e.key ? ' is-selected' : ''}${account && ['reauth', 'scope_missing', 'denied'].includes(account.status) ? ' is-stale' : ''}`} style={{ ['--ext-color' as string]: e.color }} onClick={() => setPicked(e.key)} onKeyDown={(k) => { if (k.key === 'Enter') setPicked(e.key) }} aria-label={`일정: ${e.title}, ${eventWhen(e)}${e.writable ? '' : ', 읽기 전용'}`}>
                  <CalendarDays className="ext-row__icon" />
                  <span className="ext-row__title">{e.title}</span>
                  <span className={`ext-row__date${e.start.slice(0, 10) <= today ? ' is-today' : ''}`}>{md(e.start.slice(0, 10) < today ? today : e.start.slice(0, 10))}{!e.allDay && ` ${shortTime(e.start)}`}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </main>
      <div className="app__detail" style={{ width: detailWidth }}>
        <div className="detail ext-agenda__detail">{ev ? <ExtEventCard ev={ev} /> : <div className="ext-agenda__empty"><DetailEmptyArt /></div>}</div>
      </div>
    </>
  )
}

/** 16 §12.4.2 계정 목록 위 추가 바: 날짜 인식("내일 3시 치과"), 날짜 없으면 오늘 종일, 대상 = 그 계정 기본 캘린더 */
function AddBar({ accountId, label }: { accountId: string; label: string }) {
  const toast = useToast()
  const targets = useCalendarTargets().filter((t) => t.accountId === accountId)
  const target = targets.find((t) => t.primary) ?? targets[0]
  const [text, setText] = useState('')
  if (!target) return <p className="ext-agenda__readonly">이 계정은 보기만 해요</p>
  const submit = async () => {
    const raw = text.trim()
    if (!raw) return
    if (!target.canWrite && !(await askGrant(accountId, label))) return
    const p = parseAdd(raw, [], [], { keepDate: false })
    try {
      await createEvent({ title: p.title.trim() || raw, start_at: null, due_at: p.due_at ?? dayKey(), repeat_rule: p.repeat_rule, link: { provider: target.provider, account: target.accountId, calendar: target.calendarHash, color: target.color } })
      setText('')
      toast.show(`"${target.name}"에 일정을 추가했어요`)
    } catch { toast.show('저장하지 못했어요. 다시 시도해 주세요.') }
  }
  return (
    <label className="ext-agenda__add">
      <Plus />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`"${label}"에 일정 추가`} aria-label={`${label}에 일정 추가`}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }} />
    </label>
  )
}
