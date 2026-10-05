// 16 §5 외부 캘린더 캐시(기기 전용 SQLite, 동기화 대상 아님). Electron 없이 시험할 수 있게 작은 SQL 접점만 쓴다.
import { APPLE_LABEL, calendarWritable, judgeWritable, MAX_EVENTS_PER_CAL, type AccountStatus, type AccountView, type CalendarTarget, type CalendarView, type EventRow, type ExtEvent, type Provider } from '../shared/calendars'
import { calHash } from './calendarLink'

/** better-sqlite3(앱)·sql.js(시험) 둘 다 맞출 수 있는 최소 접점 */
export interface SqlDb {
  exec(sql: string): void
  run(sql: string, params?: unknown[]): void
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  tx<T>(fn: () => T): T
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ext_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS ext_accounts (id TEXT PRIMARY KEY, provider TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'syncing', connected_at TEXT, last_sync_at TEXT, last_error TEXT, error_since TEXT, fail_count INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER, can_write INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ext_calendars (account_id TEXT NOT NULL, calendar_id TEXT NOT NULL, name TEXT, color_bg TEXT, color_fg TEXT, access_role TEXT, group_label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'hide', panel_on INTEGER NOT NULL DEFAULT 1, sync_token TEXT, full_synced_at TEXT, sort INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account_id, calendar_id));
`
// 16 §12.10 캐시 판 2: 일정 칸이 늘었다. 캐시라서 판이 바뀌면 일정만 비우고 다시 받는다
const EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS ext_events (account_id TEXT NOT NULL, calendar_id TEXT NOT NULL, event_id TEXT NOT NULL, recurring INTEGER NOT NULL DEFAULT 0, status TEXT, title TEXT, description TEXT, location TEXT, start TEXT NOT NULL, "end" TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0, time_zone TEXT, link TEXT, declined INTEGER NOT NULL DEFAULT 0, updated TEXT,
  base_id TEXT, etag TEXT, event_type TEXT, organizer_self INTEGER NOT NULL DEFAULT 1, guests_can_modify INTEGER NOT NULL DEFAULT 0, has_attendees INTEGER NOT NULL DEFAULT 0, original_start TEXT,
  PRIMARY KEY (account_id, calendar_id, event_id));
CREATE INDEX IF NOT EXISTS ext_events_start ON ext_events (start);
CREATE INDEX IF NOT EXISTS ext_events_end ON ext_events ("end");
CREATE INDEX IF NOT EXISTS ext_events_base ON ext_events (account_id, calendar_id, base_id);
`
const CACHE_VERSION = '2'
const EVENT_COLS = ['account_id', 'calendar_id', 'event_id', 'recurring', 'status', 'title', 'description', 'location', 'start', 'end', 'all_day', 'time_zone', 'link', 'declined', 'updated', 'base_id', 'etag', 'event_type', 'organizer_self', 'guests_can_modify', 'has_attendees', 'original_start'] as const

export interface AccountRow { id: string; provider: Provider; label: string; status: AccountStatus; connected_at: string | null; last_sync_at: string | null; last_error: string | null; error_since: string | null; fail_count: number; next_retry_at: number | null; can_write: number }
export interface CalendarRow { account_id: string; calendar_id: string; name: string; color_bg: string; color_fg: string; access_role: string; group_label: string | null; is_primary: number; visibility: 'show' | 'hide'; panel_on: number; sync_token: string | null; full_synced_at: string | null; sort: number }
export interface CalendarInput { calendar_id: string; name: string; color_bg: string; color_fg: string; access_role: string; group_label: string | null; is_primary: boolean; initiallyVisible: boolean; sort: number }

export class CalendarStore {
  /** 연결된 일정(§12.0)의 캐시 사본 — `${account}|${calendar}|${base_id}`. 화면에 두 번 그리지 않는다 */
  private hidden = new Set<string>()
  constructor(readonly db: SqlDb) {
    db.exec(SCHEMA)
    try { db.run('ALTER TABLE ext_accounts ADD COLUMN can_write INTEGER NOT NULL DEFAULT 0') } catch { /* 이미 있음 */ }
    if (this.meta('schema') !== CACHE_VERSION) {
      db.exec('DROP TABLE IF EXISTS ext_events')
      db.run('UPDATE ext_calendars SET sync_token = NULL, full_synced_at = NULL')
      db.exec(EVENTS_SCHEMA)
      this.setMeta('schema', CACHE_VERSION)
    } else db.exec(EVENTS_SCHEMA)
  }
  setHidden(keys: Iterable<string>) { this.hidden = new Set(keys) }
  isHidden(accountId: string, calendarId: string, baseId: string | null) { return !!baseId && this.hidden.has(`${accountId}|${calendarId}|${baseId}`) }
  setCanWrite(id: string, on: boolean) { this.db.run('UPDATE ext_accounts SET can_write = ? WHERE id = ?', [on ? 1 : 0, id]) }
  /** 해시(events.ext_calendar)로 이 기기 캐시의 캘린더 찾기 */
  calendarByHash(accountId: string, hash: string): CalendarRow | undefined { return this.calendars(accountId).find((c) => calHash(c.calendar_id) === hash) }
  calendar(accountId: string, calendarId: string): CalendarRow | undefined { return this.db.all<CalendarRow>('SELECT * FROM ext_calendars WHERE account_id = ? AND calendar_id = ?', [accountId, calendarId])[0] }
  /** 반복 원본(또는 단일 일정)의 캐시 행들 */
  eventsByBase(accountId: string, calendarId: string, baseId: string): EventRow[] {
    return this.db.all<EventRow>('SELECT * FROM ext_events WHERE account_id = ? AND calendar_id = ? AND (base_id = ? OR event_id = ?) ORDER BY start', [accountId, calendarId, baseId, baseId])
  }
  deleteEventRows(accountId: string, calendarId: string, eventIds: string[]) {
    this.db.tx(() => { for (const id of eventIds) this.db.run('DELETE FROM ext_events WHERE account_id = ? AND calendar_id = ? AND event_id = ?', [accountId, calendarId, id]) })
  }
  /** §12.4 쓸 수 있고 보이는 캘린더(빠른 만들기 고르기) */
  targets(): CalendarTarget[] {
    const out: CalendarTarget[] = []
    for (const a of this.accounts()) {
      for (const c of this.calendars(a.id)) {
        if (c.visibility !== 'show' || !calendarWritable(a.provider, c.access_role, c.calendar_id, a.status)) continue
        out.push({ key: `${a.id}|${calHash(c.calendar_id)}`, provider: a.provider, accountId: a.id, accountLabel: a.provider === 'apple' ? APPLE_LABEL : a.label, calendarHash: calHash(c.calendar_id), name: c.name, color: c.color_bg || '#4E75F2', group: a.provider === 'apple' ? `${APPLE_LABEL} · ${c.group_label ?? '이 Mac'}` : a.label, primary: !!c.is_primary, canWrite: a.provider === 'apple' || !!a.can_write })
      }
    }
    return out
  }

  meta(key: string): string | null { return this.db.all<{ value: string }>('SELECT value FROM ext_meta WHERE key = ?', [key])[0]?.value ?? null }
  setMeta(key: string, value: string) { this.db.run('INSERT INTO ext_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]) }
  /** 기기 시간대가 바뀌면 일정 캐시를 비우고 다시 받는다(16 §5.2) */
  ensureTimeZone(tz: string): boolean {
    const prev = this.meta('time_zone')
    if (prev === tz) return false
    this.db.tx(() => {
      if (prev) { this.db.run('DELETE FROM ext_events'); this.db.run('UPDATE ext_calendars SET sync_token = NULL, full_synced_at = NULL') }
      this.setMeta('time_zone', tz)
    })
    return !!prev
  }

  // ── 계정 ──
  accounts(): AccountRow[] { return this.db.all<AccountRow>('SELECT * FROM ext_accounts ORDER BY provider DESC, connected_at') }
  account(id: string): AccountRow | undefined { return this.db.all<AccountRow>('SELECT * FROM ext_accounts WHERE id = ?', [id])[0] }
  upsertAccount(id: string, provider: Provider, label: string): boolean {
    const existed = !!this.account(id)
    if (existed) this.db.run('UPDATE ext_accounts SET label = ? WHERE id = ?', [label, id])
    else this.db.run("INSERT INTO ext_accounts (id, provider, label, status, connected_at) VALUES (?, ?, ?, 'syncing', ?)", [id, provider, label, new Date().toISOString()])
    return existed
  }
  setStatus(id: string, status: AccountStatus, patch: { error?: string | null; synced?: boolean; nextRetryAt?: number | null } = {}) {
    const a = this.account(id)
    if (!a) return
    const failing = ['retrying', 'offline'].includes(status)
    const errorSince = failing ? a.error_since ?? new Date().toISOString() : null
    this.db.run('UPDATE ext_accounts SET status = ?, last_error = ?, error_since = ?, fail_count = ?, next_retry_at = ?, last_sync_at = COALESCE(?, last_sync_at) WHERE id = ?', [
      status,
      patch.error === undefined ? (failing || status === 'syncing' ? a.last_error : null) : patch.error,
      errorSince,
      status === 'retrying' ? a.fail_count + 1 : status === 'syncing' ? a.fail_count : 0,
      patch.nextRetryAt ?? null,
      patch.synced ? new Date().toISOString() : null,
      id
    ])
  }
  removeAccount(id: string) {
    this.db.tx(() => {
      this.db.run('DELETE FROM ext_events WHERE account_id = ?', [id])
      this.db.run('DELETE FROM ext_calendars WHERE account_id = ?', [id])
      this.db.run('DELETE FROM ext_accounts WHERE id = ?', [id])
    })
  }

  // ── 캘린더 ──
  calendars(accountId: string): CalendarRow[] { return this.db.all<CalendarRow>('SELECT * FROM ext_calendars WHERE account_id = ? ORDER BY is_primary DESC, sort, name', [accountId]) }
  /** 목록 갈아 끼우기: 새 캘린더는 initiallyVisible, 사라진 캘린더는 일정까지 지움 */
  replaceCalendars(accountId: string, list: CalendarInput[]) {
    this.db.tx(() => {
      const old = new Map(this.calendars(accountId).map((c) => [c.calendar_id, c]))
      for (const c of list) {
        if (old.has(c.calendar_id)) {
          this.db.run('UPDATE ext_calendars SET name = ?, color_bg = ?, color_fg = ?, access_role = ?, group_label = ?, is_primary = ?, sort = ? WHERE account_id = ? AND calendar_id = ?', [c.name, c.color_bg, c.color_fg, c.access_role, c.group_label, c.is_primary ? 1 : 0, c.sort, accountId, c.calendar_id])
          old.delete(c.calendar_id)
        } else {
          this.db.run('INSERT INTO ext_calendars (account_id, calendar_id, name, color_bg, color_fg, access_role, group_label, is_primary, visibility, panel_on, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)', [accountId, c.calendar_id, c.name, c.color_bg, c.color_fg, c.access_role, c.group_label, c.is_primary ? 1 : 0, c.initiallyVisible ? 'show' : 'hide', c.sort])
        }
      }
      for (const gone of old.keys()) this.dropCalendar(accountId, gone)
    })
  }
  dropCalendar(accountId: string, calendarId: string) {
    this.db.run('DELETE FROM ext_events WHERE account_id = ? AND calendar_id = ?', [accountId, calendarId])
    this.db.run('DELETE FROM ext_calendars WHERE account_id = ? AND calendar_id = ?', [accountId, calendarId])
  }
  /** 숨기면 그 캘린더 캐시를 지운다 → 다시 보이게 하면 전체 받기(16 §7.4) */
  setVisibility(accountId: string, changes: { calendarId: string; visibility: 'show' | 'hide' }[]): boolean {
    let needSync = false
    this.db.tx(() => {
      for (const ch of changes) {
        const cur = this.db.all<CalendarRow>('SELECT * FROM ext_calendars WHERE account_id = ? AND calendar_id = ?', [accountId, ch.calendarId])[0]
        if (!cur || cur.visibility === ch.visibility) continue
        this.db.run('UPDATE ext_calendars SET visibility = ? WHERE account_id = ? AND calendar_id = ?', [ch.visibility, accountId, ch.calendarId])
        if (ch.visibility === 'hide') this.clearEvents(accountId, ch.calendarId)
        else needSync = true
      }
    })
    return needSync
  }
  setPanel(accountId: string, calendarId: string | null, on: boolean) {
    if (calendarId) this.db.run('UPDATE ext_calendars SET panel_on = ? WHERE account_id = ? AND calendar_id = ?', [on ? 1 : 0, accountId, calendarId])
    else this.db.run(`UPDATE ext_calendars SET panel_on = ? ${accountId ? 'WHERE account_id = ?' : ''}`, accountId ? [on ? 1 : 0, accountId] : [on ? 1 : 0])
  }
  setSyncToken(accountId: string, calendarId: string, token: string | null) {
    this.db.run('UPDATE ext_calendars SET sync_token = ?, full_synced_at = COALESCE(full_synced_at, ?) WHERE account_id = ? AND calendar_id = ?', [token, new Date().toISOString(), accountId, calendarId])
  }
  clearEvents(accountId: string, calendarId: string) {
    this.db.run('DELETE FROM ext_events WHERE account_id = ? AND calendar_id = ?', [accountId, calendarId])
    this.db.run('UPDATE ext_calendars SET sync_token = NULL, full_synced_at = NULL WHERE account_id = ? AND calendar_id = ?', [accountId, calendarId])
  }

  // ── 일정 ──
  applyEvents(accountId: string, calendarId: string, rows: (EventRow | { delete: string })[]) {
    this.db.tx(() => {
      for (const r of rows) {
        if ('delete' in r) { this.db.run('DELETE FROM ext_events WHERE account_id = ? AND calendar_id = ? AND event_id = ?', [accountId, calendarId, r.delete]); continue }
        this.db.run(`INSERT OR REPLACE INTO ext_events (${EVENT_COLS.map((c) => `"${c}"`).join(', ')}) VALUES (${EVENT_COLS.map(() => '?').join(', ')})`, EVENT_COLS.map((c) => r[c] ?? (['organizer_self'].includes(c) ? 1 : ['guests_can_modify', 'has_attendees', 'recurring', 'all_day', 'declined'].includes(c) ? 0 : null)))
      }
    })
  }
  /** Apple: 캘린더 단위로 통째 갈아 끼우기 */
  replaceEvents(accountId: string, calendarId: string, rows: EventRow[]) {
    this.db.tx(() => {
      this.db.run('DELETE FROM ext_events WHERE account_id = ? AND calendar_id = ?', [accountId, calendarId])
      this.applyEvents(accountId, calendarId, rows)
      this.db.run('UPDATE ext_calendars SET full_synced_at = ? WHERE account_id = ? AND calendar_id = ?', [new Date().toISOString(), accountId, calendarId])
    })
  }
  /** 범위 밖(6개월보다 오래된) 일정 지우기 + 캘린더당 상한(가장 먼 미래부터 버림) */
  prune(from: string) {
    this.db.run('DELETE FROM ext_events WHERE substr("end", 1, 10) < ?', [from])
    const over = this.db.all<{ account_id: string; calendar_id: string; n: number }>('SELECT account_id, calendar_id, count(*) AS n FROM ext_events GROUP BY account_id, calendar_id HAVING n > ?', [MAX_EVENTS_PER_CAL])
    for (const o of over) this.db.run('DELETE FROM ext_events WHERE account_id = ? AND calendar_id = ? AND event_id IN (SELECT event_id FROM ext_events WHERE account_id = ? AND calendar_id = ? ORDER BY start DESC LIMIT ?)', [o.account_id, o.calendar_id, o.account_id, o.calendar_id, o.n - MAX_EVENTS_PER_CAL])
  }
  event(accountId: string, calendarId: string, eventId: string): EventRow | undefined {
    return this.db.all<EventRow>('SELECT * FROM ext_events WHERE account_id = ? AND calendar_id = ? AND event_id = ?', [accountId, calendarId, eventId])[0]
  }
  /** 범위 일정(보이는 캘린더만, panel이면 패널 체크까지, 거절 제외) */
  events(from: string, to: string, opts: { panel?: boolean; accountId?: string; includeLinked?: boolean } = {}): ExtEvent[] {
    const cond = ['c.visibility = \'show\'', 'e.declined = 0', 'substr(e.start, 1, 10) <= ?', 'substr(e."end", 1, 10) >= ?']
    const params: unknown[] = [to, from]
    if (opts.panel) cond.push('c.panel_on = 1')
    if (opts.accountId) { cond.push('e.account_id = ?'); params.push(opts.accountId) }
    const rows = this.db.all<EventRow & { color_bg: string; name: string; label: string; provider: Provider; acct_status: AccountStatus; access_role: string; can_write: number }>(
      `SELECT e.*, c.color_bg, c.name, c.access_role, a.label, a.provider, a.status AS acct_status, a.can_write FROM ext_events e JOIN ext_calendars c ON c.account_id = e.account_id AND c.calendar_id = e.calendar_id JOIN ext_accounts a ON a.id = e.account_id WHERE ${cond.join(' AND ')} ORDER BY e.start`,
      params
    )
    const shown = opts.includeLinked || opts.accountId ? rows : rows.filter((r) => !this.isHidden(r.account_id, r.calendar_id, r.base_id ?? r.event_id))
    return shown.map((r) => this.toView(r))
  }
  /** 캐시 행 → 화면 모양(§12.2 판정 포함) */
  toView(r: EventRow & { color_bg: string; name: string; label: string; provider: Provider; acct_status: AccountStatus; access_role: string; can_write: number }): ExtEvent {
    const w = judgeWritable({ provider: r.provider, accessRole: r.access_role, calendarId: r.calendar_id, acctStatus: r.acct_status, eventType: r.event_type, organizerSelf: r.organizer_self, guestsCanModify: r.guests_can_modify })
    return {
      key: `${r.account_id}|${r.calendar_id}|${r.event_id}`,
      accountId: r.account_id,
      provider: r.provider,
      calendarId: r.calendar_id,
      eventId: r.event_id,
      title: r.title,
      description: r.description,
      location: r.location,
      start: r.start,
      end: r.end,
      allDay: !!r.all_day,
      recurring: !!r.recurring,
      color: r.color_bg || '#4E75F2',
      calendarName: r.name,
      accountLabel: r.label,
      stale: ['reauth', 'scope_missing', 'denied', 'restricted'].includes(r.acct_status),
      hasLink: !!r.link,
      writable: w.writable,
      readonlyReason: w.reason,
      needsGrant: r.provider === 'google' && !r.can_write,
      askNotify: r.provider === 'google' && !!r.has_attendees && !!r.organizer_self
    }
  }
  /** 한 일정의 화면 모양(쓰기 후 되돌리기·팝오버 새로 읽기) */
  viewOf(accountId: string, calendarId: string, eventId: string): ExtEvent | undefined {
    const r = this.db.all<EventRow & { color_bg: string; name: string; label: string; provider: Provider; acct_status: AccountStatus; access_role: string; can_write: number }>(
      'SELECT e.*, c.color_bg, c.name, c.access_role, a.label, a.provider, a.status AS acct_status, a.can_write FROM ext_events e JOIN ext_calendars c ON c.account_id = e.account_id AND c.calendar_id = e.calendar_id JOIN ext_accounts a ON a.id = e.account_id WHERE e.account_id = ? AND e.calendar_id = ? AND e.event_id = ?',
      [accountId, calendarId, eventId])[0]
    return r ? this.toView(r) : undefined
  }
  counts(from: string, to: string): Record<string, number> {
    const rows = this.db.all<{ account_id: string; n: number }>('SELECT e.account_id, count(*) AS n FROM ext_events e JOIN ext_calendars c ON c.account_id = e.account_id AND c.calendar_id = e.calendar_id WHERE c.visibility = \'show\' AND e.declined = 0 AND substr(e.start, 1, 10) <= ? AND substr(e."end", 1, 10) >= ? GROUP BY e.account_id', [to, from])
    return Object.fromEntries(rows.map((r) => [r.account_id, r.n]))
  }

  view(memoryOnly: (id: string) => boolean): AccountView[] {
    return this.accounts().map((a) => ({
      id: a.id,
      provider: a.provider,
      label: a.provider === 'apple' ? APPLE_LABEL : a.label,
      status: a.status,
      firstSync: !a.last_sync_at,
      lastSyncAt: a.last_sync_at,
      lastError: a.last_error,
      errorSince: a.error_since,
      memoryOnly: memoryOnly(a.id),
      canWrite: a.provider === 'apple' || !!a.can_write,
      calendars: this.calendars(a.id).map((c): CalendarView => ({
        accountId: a.id,
        calendarId: c.calendar_id,
        hash: calHash(c.calendar_id),
        name: c.name,
        color: c.color_bg || '#4E75F2',
        colorFg: c.color_fg || '#ffffff',
        accessRole: c.access_role,
        group: c.group_label ?? (c.access_role === 'owner' ? '내 캘린더' : '다른 캘린더'),
        primary: !!c.is_primary,
        visibility: c.visibility,
        panelOn: !!c.panel_on
      }))
    }))
  }
}
