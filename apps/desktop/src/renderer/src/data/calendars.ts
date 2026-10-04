// 16 캘린더 연동(구글·Apple 읽기) — 화면 쪽 접점. 토큰은 보지 않고 상태·범위 일정만 받는다.
// 온보딩(다른 명세)은 connectCalendar(provider)·calendarProviders()만 부른다(16 §11.5).
import { useEffect, useState } from 'react'
import type { CalendarsStatus, ExtEvent, Provider, ProvidersInfo } from '../../../shared/calendars'

export type { AccountView, CalendarView, CalendarsStatus, ExtEvent, Provider } from '../../../shared/calendars'
export const calendarsApi = () => window.sprout?.calendars

/** 메인이 "바뀜"을 알리면 다시 읽는다 */
function useChanged(): number {
  const [n, setN] = useState(0)
  useEffect(() => calendarsApi()?.onChanged(() => setN((x) => x + 1)), [])
  return n
}

export function useCalendarsStatus(): CalendarsStatus | undefined {
  const tick = useChanged()
  const [s, setS] = useState<CalendarsStatus>()
  // 상태 글자("N분 전에 동기화")가 흐르게 1분마다 다시 읽는다
  const [clock, setClock] = useState(0)
  useEffect(() => { const t = setInterval(() => setClock((c) => c + 1), 60_000); return () => clearInterval(t) }, [])
  useEffect(() => {
    let live = true
    void calendarsApi()?.status().then((v) => { if (live) setS(v) })
    return () => { live = false }
  }, [tick, clock])
  return s
}

const EMPTY: ExtEvent[] = []
export function useExtEvents(from: string, to: string, opts: { panel?: boolean; accountId?: string } = {}): ExtEvent[] {
  const tick = useChanged()
  const [evs, setEvs] = useState<ExtEvent[]>(EMPTY)
  useEffect(() => {
    const api = calendarsApi()
    if (!api) return
    let live = true
    void api.events(from, to, opts).then((v) => { if (live) setEvs(v) })
    return () => { live = false }
  }, [from, to, opts.panel, opts.accountId, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return evs
}

export function useExtCounts(): Record<string, number> {
  const tick = useChanged()
  const [c, setC] = useState<Record<string, number>>({})
  useEffect(() => { void calendarsApi()?.counts().then(setC) }, [tick])
  return c
}

// ── 연결 시작(어느 창·화면에서든): 연결 진행 모달 호스트가 받는다 ──
export const CONNECT_EVENT = 'sprout:calendar-connect'
export const NOTICE_EVENT = 'sprout:calendar-notice'
/** 공급자별 연결 시작 — 연결 진행 모달(16 §3.4)까지 띄운다. 끝나면 결과를 돌려준다 */
export function connectCalendar(provider: Provider): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent(CONNECT_EVENT, { detail: { provider, resolve } })))
}
/** 이 기기에서 쓸 수 있는 공급자·준비 상태(데스크톱 앱이 아니면 null) */
export async function calendarProviders(): Promise<ProvidersInfo | null> {
  return (await calendarsApi()?.status())?.providers ?? null
}
export const providerName = (p: Provider) => (p === 'google' ? '구글 캘린더' : 'Apple 캘린더')

/** 설정 › 연동 탭 열기(설정은 별도 창이라 탭 이름을 localStorage로 넘긴다) */
export const SETTINGS_TAB_KEY = 'sprout.settings.tab'
export function openCalendarSettings() {
  try { localStorage.setItem(SETTINGS_TAB_KEY, 'integrations') } catch { /* 탭만 못 고름 */ }
  window.sprout?.desktop?.openSettings()
}

// ── 표기 ──
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`
const clock = (f: string) => { const h = Number(f.slice(11, 13)); const m = f.slice(14, 16); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}` }
const dow = (d: string) => WEEK[new Date(`${d.slice(0, 10)}T00:00`).getDay()]
/** 16 §3.3: "10월 12일 (월) 오후 2:00 - 3:00", 종일은 날짜만, 여러 날은 "10월 12일 - 10월 14일" */
export function eventWhen(e: Pick<ExtEvent, 'start' | 'end' | 'allDay'>): string {
  const sd = e.start.slice(0, 10)
  const ed = e.end.slice(0, 10)
  if (e.allDay) return sd === ed ? `${md(sd)} (${dow(sd)})` : `${md(sd)} - ${md(ed)}`
  if (sd !== ed) return `${md(sd)} ${clock(e.start)} - ${md(ed)} ${clock(e.end)}`
  if (e.start === e.end) return `${md(sd)} (${dow(sd)}) ${clock(e.start)}`
  const a = clock(e.start), b = clock(e.end)
  return `${md(sd)} (${dow(sd)}) ${a} - ${a.slice(0, 2) === b.slice(0, 2) ? b.slice(3) : b}`
}
