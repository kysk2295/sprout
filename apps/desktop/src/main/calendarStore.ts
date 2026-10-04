// 16 §5 외부 캘린더 캐시(기기 전용 SQLite, 동기화 대상 아님). Electron 없이 시험할 수 있게 작은 SQL 접점만 쓴다.
import { APPLE_LABEL, MAX_EVENTS_PER_CAL, type AccountStatus, type AccountView, type CalendarView, type EventRow, type ExtEvent, type Provider } from '../shared/calendars'

/** better-sqlite3(앱)·sql.js(시험) 둘 다 맞출 수 있는 최소 접점 */
export interface SqlDb {
  exec(sql: string): void
  run(sql: string, params?: unknown[]): void
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  tx<T>(fn: () => T): T
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ext_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS ext_accounts (id TEXT PRIMARY KEY, provider TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'syncing', connected_at TEXT, last_sync_at TEXT, last_error TEXT, error_since TEXT, fail_count INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER);
CREATE TABLE IF NOT EXISTS ext_calendars (account_id TEXT NOT NULL, calendar_id TEXT NOT NULL, name TEXT, color_bg TEXT, color_fg TEXT, access_role TEXT, group_label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'hide', panel_on INTEGER NOT NULL DEFAULT 1, sync_token TEXT, full_synced_at TEXT, sort INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account_id, calendar_id));
CREATE TABLE IF NOT EXISTS ext_events (account_id TEXT NOT NULL, calendar_id TEXT NOT NULL, event_id TEXT NOT NULL, recurring INTEGER NOT NULL DEFAULT 0, status TEXT, title TEXT, description TEXT, location TEXT, start TEXT NOT NULL, "end" TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0, time_zone TEXT, link TEXT, declined INTEGER NOT NULL DEFAULT 0, updated TEXT, PRIMARY KEY (account_id, calendar_id, event_id));
CREATE INDEX IF NOT EXISTS ext_events_start ON ext_events (start);
CREATE INDEX IF NOT EXISTS ext_events_end ON ext_events ("end");
`

export interface AccountRow { id: string; provider: Provider; label: string; status: AccountStatus; connected_at: string | null; last_sync_at: string | null; last_error: string | null; error_since: string | null; fail_count: number; next_retry_at: number | null }
export interface CalendarRow { account_id: string; calendar_id: string; name: string; color_bg: string; color_fg: string; access_role: string; group_label: string | null; is_primary: number; visibility: 'show' | 'hide'; panel_on: number; sync_token: string | null; full_synced_at: string | null; sort: number }
export interface CalendarInput { calendar_id: string; name: string; color_bg: string; color_fg: string; access_role: string; group_label: string | null; is_primary: boolean; initiallyVisible: boolean; sort: number }

export class CalendarStore {
  constructor(readonly db: SqlDb) { db.exec(SCHEMA) }

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
        this.db.run('INSERT OR REPLACE INTO ext_events (account_id, calendar_id, event_id, recurring, status, title, description, location, start, "end", all_day, time_zone, link, declined, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          r.account_id, r.calendar_id, r.event_id, r.recurring, r.status, r.title, r.description, r.location, r.start, r.end, r.all_day, r.time_zone, r.link, r.declined, r.updated
        ])
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
  events(from: string, to: string, opts: { panel?: boolean; accountId?: string } = {}): ExtEvent[] {
    const cond = ['c.visibility = \'show\'', 'e.declined = 0', 'substr(e.start, 1, 10) <= ?', 'substr(e."end", 1, 10) >= ?']
    const params: unknown[] = [to, from]
    if (opts.panel) cond.push('c.panel_on = 1')
    if (opts.accountId) { cond.push('e.account_id = ?'); params.push(opts.accountId) }
    const rows = this.db.all<EventRow & { color_bg: string; name: string; label: string; provider: Provider; acct_status: AccountStatus }>(
      `SELECT e.*, c.color_bg, c.name, a.label, a.provider, a.status AS acct_status FROM ext_events e JOIN ext_calendars c ON c.account_id = e.account_id AND c.calendar_id = e.calendar_id JOIN ext_accounts a ON a.id = e.account_id WHERE ${cond.join(' AND ')} ORDER BY e.start`,
      params
    )
    return rows.map((r) => ({
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
      hasLink: !!r.link
    }))
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
      calendars: this.calendars(a.id).map((c): CalendarView => ({
        accountId: a.id,
        calendarId: c.calendar_id,
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
