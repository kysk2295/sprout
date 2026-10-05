import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Loader2, MoreHorizontal, Plus } from 'lucide-react'
import { statusText, type AccountView } from '../../../../shared/calendars'
import { askGrant, calendarsApi, connectCalendar, NOTICE_EVENT, useCalendarsStatus, type CalendarView } from '../../data/calendars'
import { Dialog } from '../Dialog'
import { MenuItem, Popover } from '../Popover'
import { CalendarConnectHost } from './ConnectHost'
import './calendars.css'

// 16 §2.1 설정 › 연동: 캘린더 카드(계정 행) + §2.2 계정 편집 모달 + §4.4 연결 끊기
export function IntegrationsPane() {
  const s = useCalendarsStatus()
  const [addAt, setAddAt] = useState<HTMLElement>()
  const [edit, setEdit] = useState<string>()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const on = (e: Event) => setNotice((e as CustomEvent<string>).detail)
    window.addEventListener(NOTICE_EVENT, on)
    return () => window.removeEventListener(NOTICE_EVENT, on)
  }, [])
  const api = calendarsApi()
  const accounts = s?.accounts ?? []
  const hasApple = accounts.some((a) => a.provider === 'apple')
  const editing = accounts.find((a) => a.id === edit)
  return (
    <>
      <CalendarConnectHost />
      <h2>연동</h2>
      <h3 className="integrations__title">캘린더</h3>
      <div className="settings-card integrations">
        <div className="settings-row integrations__head">
          <span>다른 캘린더를 꿈틀에 구독해요.</span>
          <button className="integrations__add" disabled={!api} onClick={(e) => setAddAt(e.currentTarget)}><Plus />캘린더 추가</button>
        </div>
        {accounts.map((a) => <AccountRow key={a.id} a={a} onEdit={() => setEdit(a.id)} />)}
      </div>
      {!api && <p className="settings-caption">캘린더 연동은 데스크톱 앱에서만 쓸 수 있어요.</p>}
      {s && !s.providers.google.configured && <p className="integrations__warn">구글 캘린더 연결은 준비 중이에요.</p>}
      {s && !s.providers.encryption && <p className="integrations__warn">이 컴퓨터에는 로그인 정보를 안전하게 저장할 곳이 없어요. 앱을 다시 켜면 구글 캘린더를 다시 연결해야 해요.</p>}
      {notice && <p className="integrations__notice" role="status">{notice}</p>}
      <p className="integrations__caption">꿈틀에서 만든 일정은 연결한 캘린더에도 저장돼요.</p>
      {addAt && (
        <Popover anchor={addAt} align="end" width={180} className="menu" onClose={() => setAddAt(undefined)}>
          <MenuItem icon={<CalendarDays />} label="구글 캘린더" disabled={!s?.providers.google.configured} onClick={() => { setAddAt(undefined); void connectCalendar('google') }} />
          {s?.providers.apple.available && <MenuItem icon={<CalendarDays />} label="Apple 캘린더" disabled={hasApple} onClick={() => { setAddAt(undefined); void connectCalendar('apple') }} />}
        </Popover>
      )}
      {editing && <AccountDialog a={editing} onClose={() => setEdit(undefined)} />}
    </>
  )
}

function AccountRow({ a, onEdit }: { a: AccountView; onEdit: () => void }) {
  const st = statusText(a)
  const busy = a.status === 'syncing' && a.firstSync
  return (
    <div className="settings-row integrations__account" data-account={a.id}>
      <CalendarDays className="integrations__icon" />
      <span className="integrations__label">{a.label}</span>
      <span className={`integrations__status${st.danger ? ' is-danger' : ''}`}>
        {busy && <Loader2 className="cal-spin" />}
        {st.danger && <AlertTriangle />}
        {st.text}
        {a.provider === 'google' && !a.canWrite && !st.danger && <span className="integrations__readonly"> · 읽기만</span>}
      </span>
      {a.provider === 'google' && !a.canWrite && !st.danger && <button className="integrations__btn" onClick={() => void askGrant(a.id, a.label)}>쓰기 허용</button>}
      {st.action === 'reconnect' && <button className="integrations__btn" onClick={() => void connectCalendar(a.provider)}>다시 연결</button>}
      {st.action === 'settings' && <button className="integrations__btn" onClick={() => void calendarsApi()?.openPrivacy()}>시스템 설정 열기</button>}
      <button className="integrations__btn" onClick={onEdit}>편집</button>
    </div>
  )
}

/** 16 §2.2: 제목 = 계정, 묶음별 캘린더 + 보이기/숨기기, 확인을 눌러야 반영 */
function AccountDialog({ a, onClose }: { a: AccountView; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, 'show' | 'hide'>>(() => Object.fromEntries(a.calendars.map((c) => [c.calendarId, c.visibility])))
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const groups = new Map<string, CalendarView[]>()
  for (const c of a.calendars) groups.set(c.group, [...(groups.get(c.group) ?? []), c])
  const order = [...groups.keys()].sort((x, y) => (x === '내 캘린더' ? -1 : y === '내 캘린더' ? 1 : x === '다른 캘린더' ? 1 : y === '다른 캘린더' ? -1 : x.localeCompare(y)))
  const save = async () => {
    const changes = a.calendars.filter((c) => draft[c.calendarId] && draft[c.calendarId] !== c.visibility).map((c) => ({ calendarId: c.calendarId, visibility: draft[c.calendarId] }))
    if (changes.length) await calendarsApi()?.setVisibility(a.id, changes)
    onClose()
  }
  const st = statusText(a)
  if (confirm) return (
    <Dialog label="연결 끊기" className="organization-dialog" onClose={() => setConfirm(false)}>
      <h2>{a.provider === 'google' ? '구글 계정 연결을 끊을까요?' : 'Apple 캘린더 연결을 끊을까요?'}</h2>
      <p>{a.provider === 'google' ? '이 기기에 저장한 구글 일정이 지워져요. 구글 캘린더의 일정은 그대로예요.' : '이 기기에 저장한 Apple 캘린더 일정이 지워져요. 캘린더 앱의 일정은 그대로예요. 접근 권한은 시스템 설정에서 끌 수 있어요.'}</p>
      <footer>
        <button onClick={() => setConfirm(false)}>취소</button>
        <button className="integrations__danger" onClick={async () => { await calendarsApi()?.disconnect(a.id); onClose() }}>연결 끊기</button>
      </footer>
    </Dialog>
  )
  return (
    <Dialog label={a.label} className="cal-account" onClose={onClose}>
      <header>
        <h2>{a.label}</h2>
        <button ref={moreRef} className="icon-btn" aria-label="계정 메뉴" onClick={() => setMenu(true)}><MoreHorizontal /></button>
      </header>
      <p className={`cal-account__status${st.danger ? ' is-danger' : ''}`}>{a.status === 'syncing' ? '일정을 가져오는 중…' : st.text}</p>
      <div className="cal-account__body">
        {!a.calendars.length && <p className="cal-account__empty">{a.firstSync ? '캘린더 목록을 가져오는 중…' : '캘린더가 없어요'}</p>}
        {order.map((g) => (
          <section key={g}>
            <h3>{g}</h3>
            <div className="settings-card">
              {groups.get(g)!.map((c) => (
                <label key={c.calendarId} className="settings-row cal-account__row">
                  <span className="cal-account__dot" style={{ background: c.color }} />
                  <span className="cal-account__name">{c.name}</span>
                  <select aria-label={`${c.name} 표시`} value={draft[c.calendarId] ?? c.visibility} onChange={(e) => setDraft({ ...draft, [c.calendarId]: e.target.value as 'show' | 'hide' })}>
                    <option value="show">보이기</option>
                    <option value="hide">숨기기</option>
                  </select>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer>
        <button onClick={onClose}>취소</button>
        <button className="entry-primary" onClick={() => void save()}>확인</button>
      </footer>
      {menu && (
        <Popover anchor={moreRef.current} align="end" width={160} className="menu" onClose={() => setMenu(false)}>
          <MenuItem label="지금 새로 고침" onClick={() => { setMenu(false); void calendarsApi()?.refresh(a.id, true) }} />
          <MenuItem label="연결 끊기" danger onClick={() => { setMenu(false); setConfirm(true) }} />
        </Popover>
      )}
    </Dialog>
  )
}
