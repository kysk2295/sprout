// 38 §6 휴대폰 다리 — 이 휴대폰이 주인인 연결된 일정(ext_provider = device-ios|device-android, ext_account = 이 설치의 연결 id)만
// 휴대폰 캘린더와 맞춘다. 데스크톱 다리(16 §12.0.2)는 google·apple만, 이 다리는 device-*만 — 두 기기가 같은 일정을 올리지 않는다.
import { useLiveQuery } from '../data/rows'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { db } from '../data/db'
import * as Dev from './device'
import { calHash, decide, deviceInput, fieldsFromDevice, fingerprint, judgeDevice, providerFor, type DevEvent, type LinkedRow } from './link'
import { calendarByHash, getDeviceCal, isActive, myLinkAccount, useDeviceCal } from './store'

export const CONFLICT_TOAST = '다른 곳에서도 바뀐 일정이라 나중에 고친 내용으로 맞췄어요'
const RULE_LOST = '반복 규칙을 휴대폰 캘린더에 옮기지 못했어요'

let toastFn: ((m: string) => void) | null = null
const toasted = new Set<string>()
const toastOnce = (key: string, m: string) => { if (toasted.has(key)) return; toasted.add(key); toastFn?.(m) }
const adoptChecked = new Set<string>()

let running = false
let again = false
/** 한 번 돌기(겹치면 끝난 뒤 한 번 더) */
export async function bridgePass(): Promise<void> {
  if (running) { again = true; return }
  running = true
  try {
    do { again = false; await once() } while (again)
  } catch (e) {
    console.warn('[device-cal] 다리 실패:', e)
  } finally { running = false }
}

const iso = (v: string | Date | null | undefined) => { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString() }
const minutes = (r: LinkedRow) => { const a = new Date(r.start_at).getTime(); const b = new Date(r.end_at).getTime(); return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60000) : 60 }

async function once() {
  const provider = providerFor(Dev.PF)
  const account = await myLinkAccount()
  const rows = await db.getAll<LinkedRow>('SELECT * FROM events WHERE ext_provider = ?', [provider])
  const s = getDeviceCal()
  for (const row of rows) {
    let mine = row.ext_account === account
    // §6.2 다시 설치: 옛 연결 id인데 그 일정이 이 휴대폰 같은 캘린더에 그대로 있으면 이 휴대폰 것
    if (!mine && row.ext_id && isActive(s) && !adoptChecked.has(row.id)) {
      adoptChecked.add(row.id)
      const ev = await Dev.getEvent(row.ext_id)
      if (ev && calHash(ev.calendarId) === row.ext_calendar) {
        await db.execute('UPDATE events SET ext_account = ? WHERE id = ?', [account, row.id])
        row.ext_account = account
        mine = true
      }
    }
    if (!mine) continue // 다른 휴대폰 — 그 휴대폰이 맡는다
    try { await handle(row) } catch (e) { await setError(row, '잠시 뒤 다시 할게요', false); console.warn('[device-cal] 행 실패:', row.id, e) }
  }
}

async function handle(row: LinkedRow) {
  const deleted = !!row.deleted_at
  const cur = fingerprint(row, deleted)
  const s = getDeviceCal()
  const waiting = cur !== row.ext_hash
  if (!s.prefs.connected) { if (waiting) await setError(row, '휴대폰 캘린더 연결이 꺼져 있어요', true); return }
  if (s.perm?.state !== 'granted') { if (waiting) await setError(row, '캘린더 접근을 다시 허용해 주세요', true); return }
  const cal = calendarByHash(row.ext_calendar)
  if (!cal) { if (waiting) await setError(row, '휴대폰에서 이 캘린더를 찾을 수 없어요', true); return }
  const dev: DevEvent | null = row.ext_id ? await Dev.getEvent(row.ext_id) : null
  const devFields = dev ? fieldsFromDevice(dev, Dev.PF, minutes(row)) : null
  const devFp = devFields ? fingerprint(devFields) : null
  const devModified = Dev.PF === 'ios' ? iso(dev?.lastModifiedDate) : null
  let act = decide(row, cur, devFp, devModified)
  if (act.kind === 'conflict') {
    toastOnce(`conflict:${row.id}:${devFp}`, CONFLICT_TOAST)
    act = act.winner === 'theirs' ? { kind: 'pull' } : deleted ? { kind: 'delete' } : { kind: 'update' }
  }
  const pushing = act.kind === 'create' || act.kind === 'update' || act.kind === 'delete'
  if (pushing && !judgeDevice(cal).writable) { await setError(row, '이 캘린더는 이제 보기만 할 수 있어요', true); return }
  const tz = Dev.deviceTimeZone()
  switch (act.kind) {
    case 'none': return
    case 'record': return record(row, row.ext_id, devModified, cur, null)
    case 'create': {
      const { input, ruleLost } = deviceInput(row, Dev.PF, tz)
      const id = await Dev.createEvent(cal.id, input)
      const made = Dev.PF === 'ios' ? await Dev.getEvent(id) : null
      return record(row, id, iso(made?.lastModifiedDate), cur, ruleLost ? RULE_LOST : null)
    }
    case 'update': {
      const { input, ruleLost } = deviceInput(row, Dev.PF, tz)
      await Dev.updateEvent(row.ext_id!, input, { span: 'all' })
      const after = Dev.PF === 'ios' ? await Dev.getEvent(row.ext_id!) : null
      return record(row, row.ext_id, iso(after?.lastModifiedDate), cur, ruleLost ? RULE_LOST : null)
    }
    case 'delete':
      await Dev.deleteEvent(row.ext_id!, { span: 'all' }).catch(() => {}) // 이미 없으면 그대로
      return record(row, row.ext_id, null, cur, null)
    case 'pull': {
      const f = devFields!
      await db.execute(
        'UPDATE events SET title = ?, notes = ?, location = ?, start_at = ?, end_at = ?, is_all_day = ?, repeat_rule = ?, deleted_at = NULL, modified_at = ?, ext_updated = ?, ext_hash = ?, ext_error = NULL WHERE id = ?',
        [f.title, f.notes, f.location, f.start_at, f.end_at, f.is_all_day, f.repeat_rule, new Date().toISOString(), devModified, fingerprint(f), row.id]
      )
      return
    }
    case 'remoteDeleted': {
      const at = new Date().toISOString()
      await db.execute('UPDATE events SET deleted_at = ?, modified_at = ?, ext_hash = ?, ext_error = NULL WHERE id = ?', [at, at, fingerprint(row, true), row.id])
      return
    }
  }
}

async function record(row: LinkedRow, id: string | null, updated: string | null, hash: string, error: string | null) {
  if (row.ext_id === id && row.ext_hash === hash && row.ext_updated === updated && row.ext_error === error) return
  await db.execute('UPDATE events SET ext_id = ?, ext_updated = ?, ext_hash = ?, ext_error = ? WHERE id = ?', [id, updated, hash, error, row.id])
}
async function setError(row: LinkedRow, message: string, toast: boolean) {
  if (row.ext_error !== message) await db.execute('UPDATE events SET ext_error = ? WHERE id = ?', [message, row.id])
  if (toast) toastOnce(`err:${row.id}:${message}`, `일정을 연결한 캘린더에 저장하지 못했어요: ${message}`)
}

let timer: ReturnType<typeof setTimeout> | undefined
export function scheduleBridge(ms = 400) {
  clearTimeout(timer)
  timer = setTimeout(() => { void bridgePass() }, ms)
}

/** 앱 뿌리(PowerSync 안): 연결된 일정이 바뀔 때·앞으로 올 때·권한/목록이 바뀔 때·5분마다 돈다(§6.3) */
export function useDeviceCalBridge(signedIn: boolean, toast: (m: string) => void) {
  const toastRef = useRef(toast)
  toastRef.current = toast
  useEffect(() => { toastFn = (m) => toastRef.current(m); return () => { toastFn = null } }, [])
  const provider = providerFor(Dev.PF)
  const rows = useLiveQuery<{ id: string; modified_at: string | null; deleted_at: string | null; ext_hash: string | null; ext_id: string | null; ext_error: string | null }>(
    signedIn ? 'SELECT id, modified_at, deleted_at, ext_hash, ext_id, ext_error FROM events WHERE ext_provider = ?' : 'SELECT 1 AS id WHERE 0',
    signedIn ? [provider] : []
  ).data
  const s = useDeviceCal()
  const key = rows.map((r) => `${r.id}${r.modified_at}${r.deleted_at}${r.ext_hash}${r.ext_id}`).join('|')
  const ready = signedIn && s.perm !== null
  useEffect(() => { if (ready && rows.length) scheduleBridge() }, [ready, key, s.prefs.connected, s.perm?.state, s.calendars.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!signedIn) return
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') scheduleBridge(800) })
    const t = setInterval(() => { if (AppState.currentState === 'active') scheduleBridge(0) }, 5 * 60_000)
    return () => { sub.remove(); clearInterval(t) }
  }, [signedIn])
}
