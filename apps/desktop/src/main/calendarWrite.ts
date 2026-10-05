// 16 §12.5~§12.9 캐시 전용 외부 일정(구글·Apple에서 직접 만든 일정) 쓰기 — 화면 먼저(캐시) · 바로 쓰기 · 실패 시 되돌림.
// Electron 없음(시험은 가짜 구글 서버·가짜 도우미). 연결된 일정(꿈틀 events)은 calendarBridge.ts가 맡는다.
import { addDays, addMinutes, daysBetween, minutesBetween } from '@sprout/schema/time'
import { fromFloating, isoNoMs, mapGoogleEvent, mapAppleEvent, type EventRow, type ExtPatch, type ExtSnapshot, type GoogleEvent, type WriteCode, type WriteResult, type WriteScope } from '../shared/calendars'
import type { CalendarStore } from './calendarStore'
import { fieldsFromGoogle, googleTimes } from './calendarLink'
import { GoogleError, type GoogleSync } from './googleSync'
import { AppleWriteError, type AppleSync } from './appleSync'

export interface WriteDeps {
  store: CalendarStore
  google: () => GoogleSync
  apple: () => AppleSync
  timeZone: () => string
  online: () => boolean
  /** 쓰기 뒤 그 계정 새로 고침(반복 범위 변경 — 회차를 다시 받는다) */
  refresh: (accountId: string) => Promise<unknown> | void
  changed: () => void
}

export function parseKey(key: string): { accountId: string; calendarId: string; eventId: string } | null {
  const a = key.indexOf('|')
  const b = key.lastIndexOf('|')
  if (a < 0 || b <= a) return null
  return { accountId: key.slice(0, a), calendarId: key.slice(a + 1, b), eventId: key.slice(b + 1) }
}

const fail = (code: WriteCode, message: string): WriteResult => ({ ok: false, code, message })
const MESSAGES: Record<WriteCode, string> = {
  offline: '인터넷에 연결되면 고칠 수 있어요',
  reauth: '구글 계정을 다시 연결해 주세요',
  scope: '구글 캘린더에 쓰기 권한이 필요해요',
  readonly: '이 캘린더는 이제 보기만 할 수 있어요',
  gone: '이미 삭제된 일정이에요',
  notfound: '이미 삭제된 일정이에요',
  conflict: '다른 곳에서 먼저 바뀐 일정이라 최신 내용으로 바꿨어요. 다시 고쳐 주세요.',
  rate: '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  helper: '캘린더 앱에 저장하지 못했어요',
  http: '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}
function codeOf(e: unknown): WriteCode {
  if (e instanceof GoogleError) {
    switch (e.kind) {
      case 'offline': case 'timeout': return 'offline'
      case 'reauth': return 'reauth'
      case 'scope': return 'scope'
      case 'forbidden': return 'readonly'
      case 'gone': case 'notfound': return 'gone'
      case 'conflict': return 'conflict'
      case 'rate': return 'rate'
      default: return 'http'
    }
  }
  if (e instanceof AppleWriteError) return e.code === 'notfound' ? 'gone' : e.code
  return 'http'
}

/** 바뀐 시작·끝·종일(없으면 그대로) */
function span(row: EventRow, p: ExtPatch) {
  const allDay = p.allDay ?? !!row.all_day
  let start = p.start ?? row.start
  let end = p.end ?? row.end
  if (allDay) { start = start.slice(0, 10); end = end.slice(0, 10) }
  if (end < start) end = start
  return { start, end, allDay }
}
const appleTimes = (start: string, end: string, allDay: boolean, tz: string) => allDay
  ? { start: isoNoMs(fromFloating(start, tz)), end: isoNoMs(new Date(fromFloating(addDays(end, 1), tz).getTime() - 1000)), allDay: true }
  : { start: isoNoMs(fromFloating(start, tz)), end: isoNoMs(fromFloating(end, tz)), allDay: false }

/** RRULE 줄을 그 날 앞에서 끊는다(UNTIL), COUNT는 지운다 */
function cutRecurrence(lines: string[], until: string): string[] {
  return lines.map((l) => {
    if (!l.startsWith('RRULE:')) return l
    const parts = l.slice(6).split(';').filter((p) => !p.startsWith('UNTIL=') && !p.startsWith('COUNT='))
    return `RRULE:${[...parts, `UNTIL=${until}`].join(';')}`
  })
}
const dropEnd = (lines: string[]) => lines.map((l) => (l.startsWith('RRULE:') ? `RRULE:${l.slice(6).split(';').filter((p) => !p.startsWith('COUNT=')).join(';')}` : l))

export class CalendarWriter {
  constructor(private d: WriteDeps) {}

  private pre(accountId: string, calendarId: string, eventId: string): { row: EventRow; provider: 'google' | 'apple' } | WriteResult {
    const view = this.d.store.viewOf(accountId, calendarId, eventId)
    const row = this.d.store.event(accountId, calendarId, eventId)
    if (!view || !row) return fail('gone', MESSAGES.gone)
    if (!view.writable) return fail('readonly', view.readonlyReason ?? MESSAGES.readonly)
    if (view.provider === 'google') {
      if (!this.d.online()) return fail('offline', MESSAGES.offline)
      if (!this.d.google().canWrite(accountId)) return fail('scope', MESSAGES.scope)
    }
    return { row, provider: view.provider }
  }

  async update(key: string, patch: ExtPatch, o: { scope?: WriteScope; notify?: boolean } = {}): Promise<WriteResult> {
    const k = parseKey(key)
    if (!k) return fail('gone', MESSAGES.gone)
    const pre = this.pre(k.accountId, k.calendarId, k.eventId)
    if ('ok' in pre) return pre
    const { row, provider } = pre
    const scope: WriteScope = row.recurring ? o.scope ?? 'this' : 'this'
    const tz = this.d.timeZone()
    const t = span(row, patch)
    const timeChanged = patch.start !== undefined || patch.end !== undefined || patch.allDay !== undefined
    // 1. 화면 먼저
    const next: EventRow = { ...row, title: patch.title ?? row.title, description: patch.description !== undefined ? patch.description : row.description, location: patch.location !== undefined ? patch.location : row.location, start: t.start, end: t.end, all_day: t.allDay ? 1 : 0 }
    this.d.store.applyEvents(k.accountId, k.calendarId, [next])
    this.d.changed()
    try {
      if (provider === 'google') await this.googleUpdate(k.accountId, k.calendarId, row, patch, t, timeChanged, scope, !!o.notify, tz)
      else await this.appleUpdate(k.accountId, k.calendarId, row, patch, t, timeChanged, scope, tz)
      if (scope !== 'this') await this.d.refresh(k.accountId)
      this.d.changed()
      return { ok: true }
    } catch (e) {
      return this.rollback(k.accountId, k.calendarId, [row], e, row)
    }
  }

  private async googleUpdate(acc: string, cal: string, row: EventRow, patch: ExtPatch, t: { start: string; end: string; allDay: boolean }, timeChanged: boolean, scope: WriteScope, notify: boolean, tz: string) {
    const g = this.d.google()
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.summary = patch.title
    if (patch.description !== undefined) body.description = patch.description ?? ''
    if (patch.location !== undefined) body.location = patch.location ?? ''
    if (scope === 'this') {
      if (timeChanged) Object.assign(body, googleTimes({ start_at: t.start, end_at: t.end, is_all_day: t.allDay ? 1 : 0 }, tz))
      const ev = await g.patchEvent(acc, cal, row.event_id, body, { etag: row.etag, notify })
      const m = mapGoogleEvent(ev, acc, cal, tz)
      if (m && m !== 'delete') this.d.store.applyEvents(acc, cal, [m])
      return
    }
    const base = row.base_id ?? row.event_id
    const master = await g.getEvent(acc, cal, base)
    const mf = fieldsFromGoogle(master, tz)
    if (!mf) throw new GoogleError('반복 원본을 읽지 못했어요', 'http')
    // 원본 시간: 이 회차에서 옮긴 만큼 원본도 옮긴다(모든 회차) / 새 반복은 이 회차 시간에서 시작(이후 모든 회차)
    let shifted = { start_at: mf.start_at, end_at: mf.end_at, is_all_day: mf.is_all_day }
    if (timeChanged) {
      if (t.allDay) {
        const dd = daysBetween(row.start.slice(0, 10), t.start)
        shifted = { start_at: addDays(mf.start_at.slice(0, 10), dd), end_at: addDays(mf.start_at.slice(0, 10), dd + daysBetween(t.start, t.end)), is_all_day: 1 }
      } else {
        const dm = row.all_day ? 0 : minutesBetween(row.start, t.start)
        const baseStart = row.all_day ? `${mf.start_at.slice(0, 10)}T${t.start.slice(11, 16)}` : addMinutes(mf.start_at.length > 10 ? mf.start_at : `${mf.start_at}T00:00`, dm)
        shifted = { start_at: baseStart, end_at: addMinutes(baseStart, minutesBetween(t.start, t.end)), is_all_day: 0 }
      }
    }
    const occDate = (row.original_start ?? row.start).slice(0, 10)
    if (scope === 'all' || occDate <= mf.start_at.slice(0, 10)) {
      if (timeChanged) Object.assign(body, googleTimes(shifted, tz))
      await g.patchEvent(acc, cal, base, body, { etag: master.etag, notify })
      return
    }
    // 이후 모든 회차: 원본을 이 회차 앞에서 끊고, 이 회차부터 새 반복 일정
    const lines = master.recurrence ?? []
    const until = untilBefore(row, tz)
    await g.patchEvent(acc, cal, base, { recurrence: cutRecurrence(lines, until) }, { etag: master.etag, notify })
    const times = timeChanged ? { start_at: t.start, end_at: t.end, is_all_day: t.allDay ? 1 : 0 } : { start_at: row.start, end_at: row.end, is_all_day: row.all_day }
    try {
      await g.insertEvent(acc, cal, {
        summary: patch.title ?? master.summary ?? '', description: patch.description !== undefined ? patch.description ?? '' : master.description ?? '', location: patch.location !== undefined ? patch.location ?? '' : master.location ?? '',
        ...googleTimes(times, tz), recurrence: dropEnd(lines)
      }, { notify })
    } catch (e) {
      await g.patchEvent(acc, cal, base, { recurrence: lines }, { notify: false }).catch(() => {}) // 원본 되돌리기
      throw e
    }
  }

  private async appleUpdate(acc: string, cal: string, row: EventRow, patch: ExtPatch, t: { start: string; end: string; allDay: boolean }, timeChanged: boolean, scope: WriteScope, tz: string) {
    const p: Record<string, unknown> = {}
    if (patch.title !== undefined) p.title = patch.title
    if (patch.description !== undefined) p.notes = patch.description
    if (patch.location !== undefined) p.location = patch.location
    if (timeChanged) Object.assign(p, appleTimes(t.start, t.end, t.allDay, tz))
    const ev = await this.d.apple().updateEvent({ id: row.base_id ?? row.link ?? row.event_id, occurrence: row.original_start, span: scope === 'this' ? 'this' : scope === 'all' ? 'all' : 'future', expectModified: row.updated, patch: p })
    if (ev && scope === 'this') {
      const m = mapAppleEvent(ev, tz)
      if (m && m.event_id !== row.event_id) this.d.store.deleteEventRows(acc, cal, [row.event_id]) // 시작이 바뀌면 캐시 키(id@시작)도 바뀐다
      if (m) this.d.store.applyEvents(acc, cal, [m])
    }
  }

  async delete(key: string, o: { scope?: WriteScope; notify?: boolean } = {}): Promise<WriteResult> {
    const k = parseKey(key)
    if (!k) return fail('gone', MESSAGES.gone)
    const pre = this.pre(k.accountId, k.calendarId, k.eventId)
    if ('ok' in pre) return pre
    const { row, provider } = pre
    const scope: WriteScope = row.recurring ? o.scope ?? 'this' : 'this'
    const base = row.base_id ?? row.event_id
    const all = this.d.store.eventsByBase(k.accountId, k.calendarId, base)
    const gone = scope === 'this' ? [row] : scope === 'all' ? all : all.filter((r) => r.start >= row.start)
    this.d.store.deleteEventRows(k.accountId, k.calendarId, gone.map((r) => r.event_id))
    this.d.changed()
    const tz = this.d.timeZone()
    try {
      if (provider === 'google') {
        const g = this.d.google()
        if (scope === 'this') await g.deleteEvent(k.accountId, k.calendarId, row.event_id, { etag: row.etag, notify: !!o.notify })
        else {
          const master = await g.getEvent(k.accountId, k.calendarId, base)
          const mf = fieldsFromGoogle(master, tz)
          if (scope === 'all' || !mf || (row.original_start ?? row.start).slice(0, 10) <= mf.start_at.slice(0, 10)) await g.deleteEvent(k.accountId, k.calendarId, base, { etag: master.etag, notify: !!o.notify })
          else await g.patchEvent(k.accountId, k.calendarId, base, { recurrence: cutRecurrence(master.recurrence ?? [], untilBefore(row, tz)) }, { etag: master.etag, notify: !!o.notify })
        }
      } else {
        await this.d.apple().deleteEvent({ id: base, occurrence: row.original_start, span: scope === 'this' ? 'this' : scope === 'all' ? 'all' : 'future', expectModified: row.updated })
      }
      if (scope !== 'this') await this.d.refresh(k.accountId)
      this.d.changed()
      return { ok: true, undo: scope === 'this' && !row.recurring ? { key, row } : undefined }
    } catch (e) {
      if (codeOf(e) === 'gone') { this.d.changed(); return { ok: true } } // 이미 지워져 있음 = 원하는 결과
      return this.rollback(k.accountId, k.calendarId, gone, e, row)
    }
  }

  /** 지운 일정 되돌리기: 구글은 같은 id를 되살리고, Apple은 같은 내용으로 다시 만든다 */
  async restore(snap: ExtSnapshot): Promise<WriteResult> {
    const k = parseKey(snap.key)
    if (!k) return fail('gone', MESSAGES.gone)
    const r = snap.row
    const tz = this.d.timeZone()
    const acct = this.d.store.account(k.accountId)
    if (!acct) return fail('gone', MESSAGES.gone)
    this.d.store.applyEvents(k.accountId, k.calendarId, [r])
    this.d.changed()
    try {
      if (acct.provider === 'google') {
        if (!this.d.online()) throw new GoogleError(MESSAGES.offline, 'offline')
        const ev = await this.d.google().patchEvent(k.accountId, k.calendarId, r.event_id, { status: 'confirmed' })
        const m = mapGoogleEvent(ev, k.accountId, k.calendarId, tz)
        if (m && m !== 'delete') this.d.store.applyEvents(k.accountId, k.calendarId, [m])
      } else {
        const ev = await this.d.apple().createEvent({ calendarId: k.calendarId, title: r.title, notes: r.description, location: r.location, ...appleTimes(r.start, r.end, !!r.all_day, tz), rrule: null })
        this.d.store.deleteEventRows(k.accountId, k.calendarId, [r.event_id])
        const m = ev && mapAppleEvent(ev, tz)
        if (m) this.d.store.applyEvents(k.accountId, k.calendarId, [m])
      }
      this.d.changed()
      return { ok: true }
    } catch (e) {
      this.d.store.deleteEventRows(k.accountId, k.calendarId, [r.event_id])
      this.d.changed()
      const code = codeOf(e)
      return fail(code, MESSAGES[code])
    }
  }

  private async rollback(acc: string, cal: string, rows: EventRow[], e: unknown, row: EventRow): Promise<WriteResult> {
    const code = codeOf(e)
    this.d.store.applyEvents(acc, cal, rows)
    if (code === 'gone') this.d.store.deleteEventRows(acc, cal, rows.map((r) => r.event_id))
    if (code === 'conflict') await this.d.refresh(acc) // 최신 내용으로
    if (code === 'scope' && this.d.store.account(acc)?.provider === 'google') this.d.store.setCanWrite(acc, false)
    if (code === 'readonly') await this.d.refresh(acc)
    this.d.changed()
    if (code === 'http' || code === 'helper') console.warn('[calendars] 쓰기 실패:', row.event_id, e)
    return fail(code, MESSAGES[code])
  }
}

/** "이후 모든 회차"에서 원본을 끊을 UNTIL: 종일 = 그 회차 전날(날짜), 시각 = 그 회차 1초 전(UTC) */
function untilBefore(row: EventRow, tz: string): string {
  const occ = row.original_start ?? row.start
  if (row.all_day || occ.length <= 10) return addDays(occ.slice(0, 10), -1).replace(/-/g, '')
  const at = /[zZ]|[+-]\d\d:\d\d$/.test(occ) ? new Date(occ) : fromFloating(occ, tz)
  return isoNoMs(new Date(at.getTime() - 1000)).replace(/[-:]/g, '')
}
export type { GoogleEvent }
