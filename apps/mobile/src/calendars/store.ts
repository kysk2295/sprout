// 38 휴대폰 캘린더 — 이 휴대폰 설정(연결됨·숨긴 캘린더·마지막 캘린더)과 권한·캘린더 목록 상태, 화면 훅.
// 설정은 파일 sprout-device-cal.json(이 휴대폰에만 — 서버로 가지 않는다). 일정은 저장하지 않고 OS에서 그때그때 읽는다(§5.2).
import { File, Paths } from 'expo-file-system'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { deviceId } from '../data/device'
import * as Dev from './device'
import { calHash, judgeDevice, linkAccountFor, type DevCalendar, type DevEvent } from './link'

interface Prefs { connected: boolean; hidden: string[]; lastTarget: string | null }
const EMPTY: Prefs = { connected: false, hidden: [], lastTarget: null }
const file = () => new File(Paths.document, 'sprout-device-cal.json')
function loadPrefs(): Prefs {
  try {
    const f = file()
    if (!f.exists) return EMPTY
    const v = JSON.parse(f.textSync()) as Partial<Prefs>
    return { connected: !!v.connected, hidden: Array.isArray(v.hidden) ? v.hidden.filter((x) => typeof x === 'string') : [], lastTarget: typeof v.lastTarget === 'string' ? v.lastTarget : null }
  } catch { return EMPTY }
}
function savePrefs(p: Prefs) {
  try { const f = file(); if (!f.exists) f.create(); f.write(JSON.stringify(p)) } catch { /* 기기 저장 실패는 무시 */ }
}

export interface DeviceCalState {
  prefs: Prefs
  perm: Dev.Perm | null
  calendars: DevCalendar[]
  loading: boolean
  /** 휴대폰 캘린더에 쓰거나 앞으로 올 때마다 +1 — 일정 다시 읽기 */
  version: number
}
let state: DeviceCalState = { prefs: loadPrefs(), perm: null, calendars: [], loading: false, version: 0 }
const subs = new Set<() => void>()
const set = (patch: Partial<DeviceCalState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const getDeviceCal = () => state
export function useDeviceCal(): DeviceCalState { return useSyncExternalStore(subscribe, getDeviceCal, getDeviceCal) }

/** 연결해서 읽을 수 있나 */
export const isActive = (s: DeviceCalState = state) => s.prefs.connected && s.perm?.state === 'granted'
export const bumpDeviceCal = () => set({ version: state.version + 1 })

/** 권한·캘린더 목록 다시 읽기(앞으로 올 때·설정 화면 열 때) */
let refreshing: Promise<void> | null = null
export function refreshDeviceCal(): Promise<void> {
  refreshing ??= (async () => {
    set({ loading: true })
    try {
      const perm = await Dev.permission()
      const calendars = state.prefs.connected && perm.state === 'granted' ? await Dev.listCalendars().catch(() => []) : []
      set({ perm, calendars, version: state.version + 1 })
    } finally {
      set({ loading: false })
      refreshing = null
    }
  })()
  return refreshing
}

/** §5.1 연결: OS 권한 창 → 허용이면 연결됨(캘린더 모두 켬) */
export async function connectDeviceCal(): Promise<Dev.Perm> {
  let perm = await Dev.permission()
  if (perm.state !== 'granted' && perm.canAskAgain) perm = await Dev.requestPermission()
  if (perm.state === 'granted') {
    const prefs = { ...state.prefs, connected: true, hidden: [] }
    savePrefs(prefs)
    set({ prefs })
  }
  set({ perm })
  await refreshDeviceCal()
  return perm
}
export function disconnectDeviceCal() {
  const prefs = { ...EMPTY }
  savePrefs(prefs)
  set({ prefs, calendars: [], version: state.version + 1 })
}
export function setCalendarShown(id: string, shown: boolean) {
  const hidden = new Set(state.prefs.hidden)
  if (shown) hidden.delete(id)
  else hidden.add(id)
  const prefs = { ...state.prefs, hidden: [...hidden] }
  savePrefs(prefs)
  set({ prefs, version: state.version + 1 })
}
export function setLastTarget(id: string | null) {
  const prefs = { ...state.prefs, lastTarget: id }
  savePrefs(prefs)
  set({ prefs })
}

/** 켜 둔 캘린더 */
export const shownCalendars = (s: DeviceCalState = state) => (isActive(s) ? s.calendars.filter((c) => !s.prefs.hidden.includes(c.id)) : [])
/** 빠른 입력 고르기(§2.4): 쓸 수 있고 켜 둔 것 */
export const targetCalendars = (s: DeviceCalState = state) => shownCalendars(s).filter((c) => judgeDevice(c).writable)
export const calendarByHash = (hash: string | null | undefined, s: DeviceCalState = state) => (hash ? s.calendars.find((c) => calHash(c.id) === hash) : undefined)
/** 출처(계정) 이름 — 설정 묶음 머리·빠른 입력 메뉴 머리 */
export const sourceName = (c: DevCalendar) => c.source?.name || c.ownerAccount || '이 휴대폰'

let account: Promise<string> | null = null
/** 이 앱 설치의 연결 id(§6.1) */
export function myLinkAccount(): Promise<string> {
  account ??= deviceId().then(linkAccountFor).catch((e) => { account = null; throw e })
  return account
}

/** 보이는 기간의 휴대폰 일정(켜 둔 캘린더). 연결 전·권한 없음이면 빈 배열 */
export function useDeviceEvents(from: string, to: string): { events: DevEvent[]; calendars: DevCalendar[] } {
  const s = useDeviceCal()
  const cals = shownCalendars(s)
  const ids = cals.map((c) => c.id).join(',')
  const [events, setEvents] = useState<DevEvent[]>([])
  useEffect(() => {
    if (!ids) { setEvents([]); return }
    let alive = true
    const [y1, m1, d1] = from.split('-').map(Number)
    const [y2, m2, d2] = to.split('-').map(Number)
    Dev.listEvents(ids.split(','), new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2 + 1))
      .then((ev) => { if (alive) setEvents(ev) })
      .catch(() => { if (alive) setEvents([]) })
    return () => { alive = false }
  }, [ids, from, to, s.version])
  return { events: ids ? events : [], calendars: cals }
}

/** 앱 뿌리: 앞으로 올 때 권한·목록을 다시 읽는다. 로그아웃하면 이 휴대폰 설정을 지운다(§3) */
export function useDeviceCalLifecycle(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) { if (state.prefs.connected) disconnectDeviceCal(); return }
    void refreshDeviceCal()
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void refreshDeviceCal() })
    return () => sub.remove()
  }, [signedIn])
}
