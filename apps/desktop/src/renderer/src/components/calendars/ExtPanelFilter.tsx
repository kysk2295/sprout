import { AlertTriangle, Check, ChevronRight, Loader2 } from 'lucide-react'
import { statusText } from '../../../../shared/calendars'
import { calendarsApi, connectCalendar, openCalendarSettings, useCalendarsStatus } from '../../data/calendars'
import './calendars.css'

// 16 §2.3 캘린더 왼쪽 패널 `› 캘린더 구독`: 계정 줄 + 캘린더 체크(캘린더 보기에서만 거르는 필터, 기기에만 기억)
export function ExtPanelFilter({ open, onOpen, cursor }: { open: boolean; onOpen: () => void; cursor: string }) {
  const s = useCalendarsStatus()
  const api = calendarsApi()
  const accounts = s?.accounts ?? []
  const shown = accounts.flatMap((a) => a.calendars.filter((c) => c.visibility === 'show'))
  const allOn = shown.length > 0 && shown.every((c) => c.panelOn)
  return (
    <>
      <div className="cal-side__row is-group">
        <button className="cal-side__group" onClick={onOpen}>
          <ChevronRight className={open ? 'is-open' : ''} />
          <span>캘린더 구독</span>
        </button>
        {shown.length > 0 && <button className={`cal-side__box${allOn ? ' is-on' : ''}`} aria-label="캘린더 구독 전체" onClick={() => void api?.setPanel(null, null, !allOn)}>{allOn && <Check strokeWidth={3} />}</button>}
      </div>
      {open && (
        <>
          {!api && <p className="cal-side__hint">캘린더 연동은 데스크톱 앱에서만 쓸 수 있어요</p>}
          {api && !accounts.length && (
            <>
              <button className="cal-side__row is-indent is-strong" onClick={() => void connectCalendar('google')}>구글 캘린더 연결</button>
              {s?.providers.apple.available && <button className="cal-side__row is-indent is-strong" onClick={() => void connectCalendar('apple')}>Apple 캘린더 연결</button>}
            </>
          )}
          {accounts.map((a) => {
            const st = statusText(a)
            const cals = a.calendars.filter((c) => c.visibility === 'show')
            return (
              <div key={a.id} className="ext-panel__account">
                <div className="ext-panel__label" title={st.danger ? st.text : undefined}>
                  <span>{a.label}</span>
                  {a.status === 'syncing' && a.firstSync && <Loader2 className="cal-spin" aria-label="일정을 가져오는 중" />}
                  {st.danger && <AlertTriangle className="ext-panel__warn" aria-label={st.text} />}
                </div>
                {cals.map((c) => (
                  <button key={c.calendarId} className="cal-side__row is-indent" onClick={() => void api?.setPanel(a.id, c.calendarId, !c.panelOn)}>
                    <span className="cal-side__label">{c.name}</span>
                    <span className="cal-side__box ext-panel__box" style={c.panelOn ? { background: c.color, borderColor: c.color } : { borderColor: c.color }}>{c.panelOn && <Check strokeWidth={3} />}</span>
                  </button>
                ))}
                {!cals.length && a.calendars.length > 0 && <p className="cal-side__hint">보이는 캘린더가 없어요 · <button className="ext-panel__link" onClick={openCalendarSettings}>설정</button></p>}
              </div>
            )
          })}
          {accounts.some((a) => a.provider === 'google') && s && cursor.slice(0, 7) < s.cacheFrom.slice(0, 7) && <p className="cal-side__hint">구글 일정은 6개월 전부터 보여요</p>}
        </>
      )}
    </>
  )
}
