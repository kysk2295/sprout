// 16 캘린더 연동(구글·Apple) — 화면 쪽 접점. 토큰은 보지 않고 상태·범위 일정·쓰기 결과만 받는다.
// 온보딩(다른 명세)은 connectCalendar(provider)·calendarProviders()만 부른다(16 §11.5).
import { useEffect, useState } from 'react'
import type { CalendarsStatus, CalendarTarget, ExtEvent, ExtPatch, Provider, ProvidersInfo, WriteScope } from '../../../shared/calendars'

export type { AccountView, CalendarTarget, CalendarView, CalendarsStatus, ExtEvent, ExtPatch, Provider, WriteScope } from '../../../shared/calendars'
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

// ── 16 §12 양방향 ──
/** 빠른 만들기·추가 바의 캘린더 고르기(쓸 수 있고 보이는 캘린더) */
export function useCalendarTargets(): CalendarTarget[] {
  const tick = useChanged()
  const [t, setT] = useState<CalendarTarget[]>([])
  useEffect(() => { let live = true; void calendarsApi()?.targets().then((v) => { if (live) setT(v) }); return () => { live = false } }, [tick])
  return t
}
/** 연결된 일정(events.ext_*)의 캘린더 이름·색 — `${계정}|${캘린더 해시}` */
export function useLinkedCalendars(): Map<string, { name: string; color: string; provider: Provider; accountLabel: string }> {
  const s = useCalendarsStatus()
  const m = new Map<string, { name: string; color: string; provider: Provider; accountLabel: string }>()
  for (const a of s?.accounts ?? []) for (const c of a.calendars) m.set(`${a.id}|${c.hash}`, { name: c.name, color: c.color, provider: a.provider, accountLabel: a.label })
  return m
}

/** 마지막으로 고른 만들기 캘린더(이 기기) — 'sprout' | `${계정}|${해시}` (§12.4.1) */
export const TARGET_KEY = 'sprout.cal.qc.target'
export const loadTarget = (): string => { try { return localStorage.getItem(TARGET_KEY) || 'sprout' } catch { return 'sprout' } }
export const saveTarget = (k: string) => { try { localStorage.setItem(TARGET_KEY, k) } catch { /* 기억만 못 함 */ } }

// 확인 대화(쓰기 권한 §12.3.2 · 반복 범위 §12.8 · 참석자 메일): 연결 진행 모달 호스트가 받는다
export const ASK_EVENT = 'sprout:calendar-ask'
export type AskReq =
  | { kind: 'grant'; accountId: string; label: string; resolve: (ok: boolean) => void }
  | { kind: 'scope'; action: 'edit' | 'delete'; resolve: (s: WriteScope | null) => void }
  | { kind: 'notify'; resolve: (send: boolean | null) => void }
type Without<T> = T extends unknown ? Omit<T, 'resolve'> : never
function ask<T>(req: Without<AskReq>): Promise<T> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { ...req, resolve } })))
}
export const askGrant = (accountId: string, label: string) => ask<boolean>({ kind: 'grant', accountId, label })
export const askScope = (action: 'edit' | 'delete') => ask<WriteScope | null>({ kind: 'scope', action })
export const askNotify = () => ask<boolean | null>({ kind: 'notify' })

type ToastLike = { show: (message: string, undo?: () => unknown) => void; registerUndo: (undo: () => unknown) => void }
/** 캐시 전용 외부 일정 고치기(§12.5~§12.8): 권한 → 반복 범위 → 참석자 메일 → 쓰기 → 실패 토스트 · 되돌리기 등록 */
export async function editExt(ev: ExtEvent, patch: ExtPatch, toast: ToastLike, opts: { scope?: WriteScope } = {}): Promise<boolean> {
  const api = calendarsApi()
  if (!api || !Object.keys(patch).length) return false
  if (!ev.writable) { toast.show(ev.readonlyReason ?? '이 캘린더는 보기만 할 수 있어요'); return false }
  if (ev.needsGrant && !(await askGrant(ev.accountId, ev.accountLabel))) return false
  let scope = opts.scope
  if (ev.recurring && !scope) { const s = await askScope('edit'); if (!s) return false; scope = s }
  let notify = false
  if (ev.askNotify) { const n = await askNotify(); if (n === null) return false; notify = n }
  const r = await api.update(ev.key, patch, { scope, notify })
  if (!r.ok) {
    if (r.code === 'scope' && (await askGrant(ev.accountId, ev.accountLabel))) return editExt({ ...ev, needsGrant: false }, patch, toast, { scope })
    toast.show(r.message)
    return false
  }
  // 반복 아닌 구글 일정은 ⌘Z로 되돌린다(Apple은 시작이 바뀌면 캐시 키가 바뀌어 시간 변경은 되돌리지 않는다)
  const timeChanged = patch.start !== undefined || patch.end !== undefined || patch.allDay !== undefined
  if (!ev.recurring && (ev.provider === 'google' || !timeChanged)) {
    const back: ExtPatch = {}
    if (patch.title !== undefined) back.title = ev.title
    if (patch.description !== undefined) back.description = ev.description
    if (patch.location !== undefined) back.location = ev.location
    if (timeChanged) Object.assign(back, { start: ev.start, end: ev.end, allDay: ev.allDay })
    toast.registerUndo(async () => { const u = await api.update(ev.key, back, { notify }); if (!u.ok) toast.show('되돌리지 못했어요. 구글 캘린더에서 확인해 주세요.') })
  }
  return true
}
/** 캐시 전용 외부 일정 지우기(§12.6) */
export async function deleteExt(ev: ExtEvent, toast: ToastLike): Promise<boolean> {
  const api = calendarsApi()
  if (!api) return false
  if (!ev.writable) { toast.show(ev.readonlyReason ?? '이 캘린더는 보기만 할 수 있어요'); return false }
  if (ev.needsGrant && !(await askGrant(ev.accountId, ev.accountLabel))) return false
  let scope: WriteScope | undefined
  if (ev.recurring) { const s = await askScope('delete'); if (!s) return false; scope = s }
  let notify = false
  if (ev.askNotify) { const n = await askNotify(); if (n === null) return false; notify = n }
  const r = await api.remove(ev.key, { scope, notify })
  if (!r.ok) { toast.show(r.message); return false }
  if (r.undo) { const snap = r.undo; toast.show('일정을 삭제했어요', async () => { const u = await api.restore(snap); if (!u.ok) toast.show(u.message) }) }
  else toast.show('일정을 삭제했어요')
  return true
}
