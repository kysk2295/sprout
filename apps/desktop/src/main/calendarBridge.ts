// 16 §12.0.2 연결된 일정 다리 — 꿈틀 events(ext_*) ⇄ 구글·Apple. 데스크톱 메인 프로세스에서만 돈다(휴대폰에서 고친 것도 동기화로 여기 와서 올라간다).
// 꿈틀 쪽이 바뀌면 올리고, 외부 쪽이 바뀌면 꿈틀 행을 고치고, 양쪽 다 바뀌면 나중에 고친 쪽으로 맞춘다. Electron 없음(시험은 sql.js + 가짜 구글·도우미).
import { addDaysStr, cacheFrom, floating } from '../shared/calendars'
import type { AccountRow, CalendarRow, CalendarStore } from './calendarStore'
import { appleInput, fieldsFromApple, fieldsFromGoogle, fingerprint, googleBody, googleIdFor, type LinkFields, type LinkedRow } from './calendarLink'
import { GoogleError, type GoogleSync } from './googleSync'
import { AppleWriteError, type AppleSync } from './appleSync'

export interface BridgeDb {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<unknown>
}
export interface BridgeDeps {
  db: BridgeDb
  store: CalendarStore
  google: () => GoogleSync
  apple: () => AppleSync
  timeZone: () => string
  online: () => boolean
  toast: (message: string, kind?: 'info' | 'error') => void
  /** 숨김 목록이 바뀌어 화면이 외부 일정을 다시 읽어야 할 때 */
  changed: () => void
  /** 외부에 쓴 뒤(그 계정 캐시를 새로 고쳐 사이드바 목록에도 보이게) */
  pushed?: (accountId: string) => void
  now?: () => Date
}

export const CONFLICT_TOAST = '다른 곳에서도 바뀐 일정이라 나중에 고친 내용으로 맞췄어요'
interface Remote { fields: LinkFields; etag: string | null; updated: string | null }
type Ctx = { row: LinkedRow; acct: AccountRow; cal: CalendarRow; provider: 'google' | 'apple' }

const PERMANENT = new Set(['reauth', 'scope', 'forbidden', 'readonly'])

export class CalendarBridge {
  private running = false
  private again = false
  private hiddenKey = ''
  private missingChecked = new Map<string, number>()
  private toasted = new Set<string>()
  constructor(private d: BridgeDeps) {}
  private now = () => this.d.now?.() ?? new Date()

  /** 한 번 돌기(겹치면 끝난 뒤 한 번 더) */
  async pass(): Promise<void> {
    if (this.running) { this.again = true; return }
    this.running = true
    try {
      do {
        this.again = false
        await this.once()
      } while (this.again)
    } finally { this.running = false }
  }

  private async once() {
    const rows = await this.d.db.getAll<LinkedRow>('SELECT * FROM events WHERE ext_provider IS NOT NULL')
    const ctxs: Ctx[] = []
    const hidden: string[] = []
    for (const row of rows) {
      if (!row.ext_account || !row.ext_calendar || (row.ext_provider !== 'google' && row.ext_provider !== 'apple')) continue
      const acct = this.d.store.account(row.ext_account)
      if (!acct || acct.provider !== row.ext_provider) continue // 이 기기에 없는 계정 — 그 기기가 맡는다
      const cal = this.d.store.calendarByHash(acct.id, row.ext_calendar)
      if (!cal) continue
      if (row.ext_id) hidden.push(`${acct.id}|${cal.calendar_id}|${row.ext_id}`)
      ctxs.push({ row, acct, cal, provider: row.ext_provider })
    }
    const key = hidden.sort().join('\n')
    if (key !== this.hiddenKey) { this.hiddenKey = key; this.d.store.setHidden(hidden); this.d.changed() }
    for (const c of ctxs) {
      try { await this.handle(c) }
      catch (e) { await this.onError(c, e) }
    }
  }

  private ready(c: Ctx): string | null {
    if (c.provider === 'google') {
      if (['reauth', 'scope_missing'].includes(c.acct.status)) return '구글 계정을 다시 연결해 주세요'
      if (!this.d.google().canWrite(c.acct.id)) return '구글 캘린더에 쓰기 권한이 필요해요'
    } else if (['denied', 'restricted', 'helper_missing'].includes(c.acct.status)) return '캘린더 접근을 다시 허용해 주세요'
    if (!['owner', 'writer'].includes(c.cal.access_role)) return '이 캘린더는 이제 보기만 할 수 있어요'
    return null
  }

  private async handle(c: Ctx) {
    const { row } = c
    const deleted = !!row.deleted_at
    const cur = fingerprint(row, deleted)
    if (c.provider === 'google' && !this.d.online()) return // 온라인이 되면 다시
    const notReady = this.ready(c)
    if (notReady) {
      if (cur !== row.ext_hash) await this.setError(row, notReady, true)
      return
    }
    if (!row.ext_id) {
      if (deleted) { if (row.ext_hash !== cur) await this.record(row, { id: null, etag: null, updated: null, hash: cur }); return }
      const r = await this.create(c)
      await this.record(row, { id: r.id, etag: r.etag, updated: r.updated, hash: cur })
      return
    }
    if (cur !== row.ext_hash) {
      // 꿈틀 쪽이 바뀜 → 올린다
      if (deleted) return this.pushDelete(c, cur)
      if (row.ext_hash?.startsWith('x:')) { // 지운 것을 되돌림
        const r = await this.revive(c)
        await this.record(row, { id: r.id, etag: r.etag, updated: r.updated, hash: cur })
        return
      }
      return this.pushUpdate(c, cur)
    }
    if (deleted) return
    // 꿈틀 쪽 그대로 → 외부 쪽이 바뀌었나(캐시)
    const cached = this.d.store.eventsByBase(c.acct.id, c.cal.calendar_id, row.ext_id)
    if (cached.length) {
      const sig = cached.map((r) => r.updated ?? '').sort().at(-1) || null
      if (sig && (!row.ext_updated || sig > row.ext_updated)) {
        const remote = await this.fetch(c)
        if (!remote) return this.remoteDeleted(c)
        if (fingerprint(remote.fields) !== row.ext_hash) await this.pull(row, remote)
        // 내용이 같으면 수정 시각만 맞춘다(반복 회차의 updated가 원본보다 늦어도 다시 묻지 않게 큰 쪽)
        else await this.record(row, { id: row.ext_id, etag: remote.etag, updated: [sig, remote.updated ?? ''].sort().at(-1) ?? sig, hash: row.ext_hash })
      }
      return
    }
    // 캐시에 없음: 보이는 캘린더·캐시 기간 안이면 지워졌는지 확인(10분에 한 번)
    if (c.cal.visibility !== 'show' || !c.cal.full_synced_at) return
    const tz = this.d.timeZone()
    const from = cacheFrom(this.now(), tz)
    const today = floating(this.now(), tz).slice(0, 10)
    const inWindow = !!row.repeat_rule || (row.end_at.slice(0, 10) >= from && (c.provider === 'google' || row.start_at.slice(0, 10) <= addDaysStr(today, 730)))
    if (!inWindow) return
    const last = this.missingChecked.get(row.id) ?? 0
    if (this.now().getTime() - last < 10 * 60_000) return
    this.missingChecked.set(row.id, this.now().getTime())
    const remote = await this.fetch(c)
    if (!remote) return this.remoteDeleted(c)
    if (fingerprint(remote.fields) !== row.ext_hash) await this.pull(row, remote)
  }

  // ── 외부 호출 ──
  private async create(c: Ctx): Promise<{ id: string; etag: string | null; updated: string | null }> {
    const tz = this.d.timeZone()
    if (c.provider === 'google') {
      const g = this.d.google()
      const id = googleIdFor(c.row.id)
      try {
        const ev = await g.insertEvent(c.acct.id, c.cal.calendar_id, { id, ...googleBody(c.row, tz) })
        return { id: ev.id ?? id, etag: ev.etag ?? null, updated: ev.updated ?? null }
      } catch (e) {
        if (!(e instanceof GoogleError) || e.kind !== 'exists') throw e
        // 다른 기기가 먼저 올렸거나 지운 뒤 다시 살림 → 같은 id를 지금 내용으로
        const ev = await g.patchEvent(c.acct.id, c.cal.calendar_id, id, { status: 'confirmed', ...googleBody(c.row, tz) })
        return { id, etag: ev.etag ?? null, updated: ev.updated ?? null }
      }
    }
    const ev = await this.d.apple().createEvent({ calendarId: c.cal.calendar_id, ...appleInput(c.row, tz) })
    if (!ev) throw new AppleWriteError('캘린더 앱에 저장하지 못했어요', 'helper')
    return { id: ev.id, etag: null, updated: ev.modifiedAt ?? null }
  }

  private async revive(c: Ctx): Promise<{ id: string; etag: string | null; updated: string | null }> {
    const tz = this.d.timeZone()
    if (c.provider === 'google') {
      const ev = await this.d.google().patchEvent(c.acct.id, c.cal.calendar_id, c.row.ext_id!, { status: 'confirmed', ...googleBody(c.row, tz) })
      return { id: c.row.ext_id!, etag: ev.etag ?? null, updated: ev.updated ?? null }
    }
    return this.create(c) // Apple은 지운 일정을 살릴 수 없어 새로 만든다(id가 바뀜)
  }

  /** 외부 원본(반복이면 원본 일정). 지워졌으면 null */
  private async fetch(c: Ctx): Promise<Remote | null> {
    const tz = this.d.timeZone()
    try {
      if (c.provider === 'google') {
        const ev = await this.d.google().getEvent(c.acct.id, c.cal.calendar_id, c.row.ext_id!)
        if (ev.status === 'cancelled') return null
        const f = fieldsFromGoogle(ev, tz)
        return f ? { fields: f, etag: ev.etag ?? null, updated: ev.updated ?? null } : null
      }
      const ev = await this.d.apple().getEvent(c.row.ext_id!)
      const f = ev && fieldsFromApple(ev, tz)
      return f ? { fields: f, etag: null, updated: ev!.modifiedAt ?? null } : null
    } catch (e) {
      if ((e instanceof GoogleError && (e.kind === 'notfound' || e.kind === 'gone')) || (e instanceof AppleWriteError && e.code === 'notfound')) return null
      throw e
    }
  }

  private async pushUpdate(c: Ctx, cur: string): Promise<void> {
    const { row } = c
    const tz = this.d.timeZone()
    try {
      if (c.provider === 'google') {
        const ev = await this.d.google().patchEvent(c.acct.id, c.cal.calendar_id, row.ext_id!, googleBody(row, tz), { etag: row.ext_etag })
        await this.record(row, { id: row.ext_id, etag: ev.etag ?? null, updated: ev.updated ?? null, hash: cur })
      } else {
        const a = appleInput(row, tz)
        const ev = await this.d.apple().updateEvent({ id: row.ext_id!, span: 'future', expectModified: row.ext_updated, patch: { title: a.title, notes: a.notes, location: a.location, start: a.start, end: a.end, allDay: a.allDay, rrule: a.rrule } })
        await this.record(row, { id: ev?.id ?? row.ext_id, etag: null, updated: ev?.modifiedAt ?? null, hash: cur })
      }
    } catch (e) {
      if (isConflict(e)) return this.resolve(c, cur)
      if (isGone(e)) { // 외부에서 지웠는데 꿈틀에서 고침 → 고친 내용을 살린다
        const r = await this.revive(c)
        await this.record(row, { id: r.id, etag: r.etag, updated: r.updated, hash: cur })
        return
      }
      throw e
    }
  }

  private async pushDelete(c: Ctx, cur: string): Promise<void> {
    const { row } = c
    try {
      if (c.provider === 'google') await this.d.google().deleteEvent(c.acct.id, c.cal.calendar_id, row.ext_id!, { etag: row.ext_etag })
      else await this.d.apple().deleteEvent({ id: row.ext_id!, span: 'future', expectModified: row.ext_updated })
    } catch (e) {
      if (isConflict(e)) return this.resolve(c, cur)
      if (!isGone(e)) throw e
    }
    await this.record(row, { id: row.ext_id, etag: null, updated: null, hash: cur })
  }

  /** 양쪽 다 바뀜: 나중에 고친 쪽(꿈틀 modified_at vs 외부 수정 시각)으로 맞춘다 */
  private async resolve(c: Ctx, cur: string): Promise<void> {
    const { row } = c
    const remote = await this.fetch(c)
    if (!remote) {
      if (row.deleted_at) return this.record(row, { id: row.ext_id, etag: null, updated: null, hash: cur })
      const r = await this.revive(c) // 외부에서 지웠는데 꿈틀에서 고침 → 살린다
      return this.record(row, { id: r.id, etag: r.etag, updated: r.updated, hash: cur })
    }
    const mine = row.deleted_at ?? row.modified_at ?? ''
    const theirs = remote.updated ?? ''
    this.toastOnce(`conflict:${row.id}:${theirs}`, CONFLICT_TOAST)
    if (mine >= theirs) {
      // 꿈틀이 나중 → 최신 etag로 다시 올린다
      const next: LinkedRow = { ...row, ext_etag: remote.etag, ext_updated: remote.updated }
      if (row.deleted_at) return this.pushDelete({ ...c, row: next }, cur)
      return this.pushUpdate({ ...c, row: next }, cur)
    }
    await this.pull(row, remote) // 외부가 나중
  }

  private async remoteDeleted(c: Ctx) {
    const { row } = c
    const at = this.now().toISOString()
    await this.d.db.execute('UPDATE events SET deleted_at = ?, modified_at = ?, ext_hash = ?, ext_etag = NULL, ext_error = NULL WHERE id = ?', [at, at, fingerprint(row, true), row.id])
  }

  // ── 꿈틀 쪽 기록 ──
  private async record(row: LinkedRow, r: { id: string | null; etag: string | null; updated: string | null; hash: string | null }) {
    if (r.hash !== row.ext_hash && row.ext_account) this.d.pushed?.(row.ext_account)
    await this.d.db.execute('UPDATE events SET ext_id = ?, ext_etag = ?, ext_updated = ?, ext_hash = ?, ext_error = NULL WHERE id = ?', [r.id, r.etag, r.updated, r.hash, row.id])
  }
  private async pull(row: LinkedRow, remote: Remote) {
    const f = remote.fields
    await this.d.db.execute(
      'UPDATE events SET title = ?, notes = ?, location = ?, start_at = ?, end_at = ?, is_all_day = ?, repeat_rule = ?, deleted_at = NULL, modified_at = ?, ext_etag = ?, ext_updated = ?, ext_hash = ?, ext_error = NULL WHERE id = ?',
      [f.title, f.notes, f.location, f.start_at, f.end_at, f.is_all_day, f.repeat_rule, this.now().toISOString(), remote.etag, remote.updated, fingerprint(f), row.id]
    )
  }
  private async setError(row: LinkedRow, message: string, toast: boolean) {
    if (row.ext_error !== message) await this.d.db.execute('UPDATE events SET ext_error = ? WHERE id = ?', [message, row.id])
    if (toast) this.toastOnce(`err:${row.id}:${message}`, `일정을 연결한 캘린더에 저장하지 못했어요: ${message}`, 'error')
  }
  private toastOnce(key: string, message: string, kind: 'info' | 'error' = 'info') {
    if (this.toasted.has(key)) return
    this.toasted.add(key)
    this.d.toast(message, kind)
  }

  private async onError(c: Ctx, e: unknown) {
    if (e instanceof GoogleError) {
      if (e.kind === 'offline' || e.kind === 'timeout') return
      if (e.kind === 'scope') this.d.store.setCanWrite(c.acct.id, false)
      if (e.kind === 'rate') return this.setError(c.row, '잠시 뒤 다시 올릴게요', false)
      // 사람이 읽는 이유만(상태 코드 같은 글자는 보이지 않는다)
      return PERMANENT.has(e.kind) ? this.setError(c.row, e.message, true) : this.setError(c.row, '잠시 뒤 다시 올릴게요', false)
    }
    if (e instanceof AppleWriteError) return PERMANENT.has(e.code) ? this.setError(c.row, e.message, true) : this.setError(c.row, '캘린더 앱에 저장하지 못했어요. 잠시 뒤 다시 할게요', false)
    console.warn('[calendars] 다리 실패:', c.row.id, e)
    return this.setError(c.row, '잠시 뒤 다시 올릴게요', false)
  }
}

const isConflict = (e: unknown) => (e instanceof GoogleError && e.kind === 'conflict') || (e instanceof AppleWriteError && e.code === 'conflict')
const isGone = (e: unknown) => (e instanceof GoogleError && (e.kind === 'notfound' || e.kind === 'gone')) || (e instanceof AppleWriteError && e.code === 'notfound')
