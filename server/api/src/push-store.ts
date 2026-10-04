// 32 푸시 알림 — 저장소: Postgres(pgPushStore)와 시험용 메모리(memoryPushStore). 같은 약속(PushStore)을 지킨다.
// 서버 전용 테이블 device_tokens·push_sent·push_state·push_cursor(db/migrations/20261007-push.sql) + 동기화 테이블 읽기.
import type { DailyTask } from '../../../packages/schema/src/notify.ts'
import type { Device, ReminderRow } from './push-plan.ts'

export type DeviceInput = Pick<Device, 'token' | 'platform' | 'app_version' | 'caps' | 'timezone' | 'locale' | 'push_reminders'>
export type PushState = { last_stage: number | null; last_report_week: string | null; last_draft_week: string | null; last_inbox_nudge_at: number | null }
export type ReportRow = { id: string; week_start: string; stats_json: string | null; text_json: string | null }

export interface PushStore {
  /** 기기 등록·갱신. 같은 토큰을 가진 다른 행(다른 기기 id·다른 사용자)은 지운다. 같은 id가 다른 사용자 것이면 새로 만든다(그 기기 기록도 지움) */
  upsertDevice(userId: string, id: string, d: DeviceInput, now: number): Promise<void>
  setLocalKeys(userId: string, id: string, keys: string[], now: number): Promise<boolean>
  deleteDevice(userId: string, id: string): Promise<boolean>
  /** 로그아웃: 그 리프레시 토큰의 사용자 기기일 때만 지운다 */
  deleteDeviceBySession(id: string, refreshHash: string): Promise<boolean>
  /** FCM이 쓸 수 없다고 한 토큰 */
  dropDevice(id: string): Promise<void>
  markResult(id: string, ok: boolean, now: number): Promise<void>
  devices(opts: { userId?: string; seenSince: number }): Promise<Device[]>
  device(userId: string, id: string): Promise<Device | null>
  prefs(userIds: string[]): Promise<Map<string, string | null>>
  reminderRows(userIds: string[], fromDay: string, toDay: string): Promise<ReminderRow[]>
  dailyTasks(userId: string, today: string): Promise<DailyTask[]>
  /** 보낸 기록을 남긴다. 이미 있으면 false(보내지 않는다) */
  claim(deviceId: string, key: string, kind: string, taskId: string | null, now: number): Promise<boolean>
  unclaim(deviceId: string, key: string): Promise<void>
  /** 지운·바뀐 알림 id → 그 알림을 받은 할 일 id(push_sent) */
  tasksOfReminders(userId: string, rids: string[]): Promise<string[]>
  getCursor(): Promise<number | null>
  setCursor(at: number): Promise<void>
  prune(before: number): Promise<number>
  xpEvents(userId: string): Promise<{ amount: number; created_at: string }[]>
  character(userId: string): Promise<{ name: string | null; species: string | null } | null>
  getState(userId: string): Promise<PushState>
  setState(userId: string, patch: Partial<PushState>): Promise<void>
  reports(userId: string, ids: string[]): Promise<ReportRow[]>
  openGoals(userId: string, weekStart: string): Promise<number>
  inboxOpen(userId: string): Promise<number>
  /** 여러 api 프로세스가 떠도 스케줄러는 하나만(advisory lock). 못 잡으면 undefined */
  withLock<T>(fn: () => Promise<T>): Promise<T | undefined>
}

const EMPTY_STATE: PushState = { last_stage: null, last_report_week: null, last_draft_week: null, last_inbox_nudge_at: null }

// ── Postgres ──
type Query = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>
type Pool = { query: Query; connect: () => Promise<{ query: Query; release: () => void }> }
const LOCK_KEY = 32_0001 // 스케줄러 advisory lock 번호(아무 값이나 고정)
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : v == null ? null : new Date(v as string).getTime())
const DEVICE_COLS = 'id, user_id, provider, token, platform, app_version, caps, timezone, locale, local_keys, push_reminders, last_seen_at'
const toDevice = (r: any): Device => ({ ...r, caps: r.caps ?? [], local_keys: r.local_keys ?? [], last_seen_at: ms(r.last_seen_at)! })

export function pgPushStore(pool: Pool, iosEnabled = false): PushStore {
  const q: Query = (sql, params) => pool.query(sql, params)
  const platforms = iosEnabled ? ['android', 'ios'] : ['android']
  // S = 시작(없으면 마감) 날짜, E = 마감 날짜 — 스마트 목록 오늘과 같은 계산(views.ts)
  const S = 'left(COALESCE(t.start_at, t.due_at), 10)'
  const E = 'left(t.due_at, 10)'
  return {
    async upsertDevice(userId, id, d, now) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM device_tokens WHERE token = $1 AND (id <> $2 OR user_id <> $3)', [d.token, id, userId])
        await client.query('DELETE FROM device_tokens WHERE id = $1 AND user_id <> $2', [id, userId])
        await client.query(
          `INSERT INTO device_tokens (id, user_id, provider, token, platform, app_version, caps, timezone, locale, push_reminders, last_seen_at)
           VALUES ($1, $2, 'fcm', $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))
           ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, platform = EXCLUDED.platform, app_version = EXCLUDED.app_version, caps = EXCLUDED.caps,
             timezone = EXCLUDED.timezone, locale = EXCLUDED.locale, push_reminders = EXCLUDED.push_reminders, last_seen_at = EXCLUDED.last_seen_at,
             fail_count = CASE WHEN device_tokens.token = EXCLUDED.token THEN device_tokens.fail_count ELSE 0 END`,
          [id, userId, d.token, d.platform, d.app_version, d.caps, d.timezone, d.locale, d.push_reminders, now]
        )
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally { client.release() }
    },
    async setLocalKeys(userId, id, keys, now) {
      const r = await q('UPDATE device_tokens SET local_keys = $3, local_keys_at = to_timestamp($4 / 1000.0), last_seen_at = to_timestamp($4 / 1000.0) WHERE id = $1 AND user_id = $2', [id, userId, keys, now])
      return !!r.rowCount
    },
    async deleteDevice(userId, id) {
      return !!(await q('DELETE FROM device_tokens WHERE id = $1 AND user_id = $2', [id, userId])).rowCount
    },
    async deleteDeviceBySession(id, refreshHash) {
      return !!(await q('DELETE FROM device_tokens d USING sessions s WHERE d.id = $1 AND s.token_hash = $2 AND d.user_id = s.user_id', [id, refreshHash])).rowCount
    },
    async dropDevice(id) { await q('DELETE FROM device_tokens WHERE id = $1', [id]) },
    async markResult(id, ok, now) {
      await q(ok
        ? 'UPDATE device_tokens SET last_ok_at = to_timestamp($2 / 1000.0), fail_count = 0 WHERE id = $1'
        : 'UPDATE device_tokens SET fail_count = fail_count + 1 WHERE id = $1', ok ? [id, now] : [id])
    },
    async devices({ userId, seenSince }) {
      const r = await q(`SELECT ${DEVICE_COLS} FROM device_tokens WHERE provider = 'fcm' AND platform = ANY($1) AND last_seen_at >= to_timestamp($2 / 1000.0) ${userId ? 'AND user_id = $3' : ''}`,
        userId ? [platforms, seenSince, userId] : [platforms, seenSince])
      return r.rows.map(toDevice)
    },
    async device(userId, id) {
      const r = await q(`SELECT ${DEVICE_COLS} FROM device_tokens WHERE id = $1 AND user_id = $2`, [id, userId])
      return r.rowCount ? toDevice(r.rows[0]) : null
    },
    async prefs(userIds) {
      const out = new Map<string, string | null>()
      if (!userIds.length) return out
      // 사용자당 행이 여럿이면 가장 최근 것
      const r = await q('SELECT DISTINCT ON (owner_id) owner_id, notify_json FROM user_prefs WHERE owner_id = ANY($1) ORDER BY owner_id, modified_at DESC NULLS LAST', [userIds])
      for (const row of r.rows) out.set(row.owner_id, row.notify_json)
      return out
    },
    async reminderRows(userIds, fromDay, toDay) {
      if (!userIds.length) return []
      const r = await q(
        `SELECT t.owner_id, r.id AS rid, r.trigger, t.id AS tid, t.title, t.start_at, t.due_at, l.name AS list_name, l.kind AS list_kind
           FROM tasks t JOIN reminders r ON r.task_id = t.id AND r.owner_id = t.owner_id
           LEFT JOIN lists l ON l.id = t.list_id AND l.owner_id = t.owner_id
          WHERE t.owner_id = ANY($1) AND t.status = 0 AND t.deleted_at IS NULL AND t.due_at IS NOT NULL
            AND ((${S} BETWEEN $2 AND $3) OR (${E} BETWEEN $2 AND $3))`,
        [userIds, fromDay, toDay]
      )
      return r.rows
    },
    async dailyTasks(userId, today) {
      const r = await q(
        `SELECT t.title, t.status, t.start_at, t.due_at, t.priority, t.sort_order
           FROM tasks t LEFT JOIN lists l ON l.id = t.list_id AND l.owner_id = t.owner_id
          WHERE t.owner_id = $1 AND t.deleted_at IS NULL AND t.due_at IS NOT NULL AND ${S} <= $2
            AND l.archived_at IS NULL AND COALESCE(l.show_in_smart, 'all') = 'all'
            AND (t.status = 0 OR (t.status = 1 AND ${E} >= $2))
          LIMIT 2000`,
        [userId, today]
      )
      return r.rows
    },
    async claim(deviceId, key, kind, taskId, now) {
      const r = await q('INSERT INTO push_sent (device_id, key, kind, task_id, sent_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0)) ON CONFLICT DO NOTHING', [deviceId, key, kind, taskId, now])
      return !!r.rowCount
    },
    async unclaim(deviceId, key) { await q('DELETE FROM push_sent WHERE device_id = $1 AND key = $2', [deviceId, key]) },
    async tasksOfReminders(userId, rids) {
      if (!rids.length) return []
      const r = await q(
        `SELECT DISTINCT p.task_id FROM push_sent p JOIN device_tokens d ON d.id = p.device_id
          WHERE d.user_id = $1 AND p.task_id IS NOT NULL AND p.key LIKE 'r:%' AND substring(p.key from 3 for position('@' in p.key) - 3) = ANY($2)`,
        [userId, rids]
      )
      return r.rows.map((x) => x.task_id)
    },
    async getCursor() {
      const r = await q('SELECT at FROM push_cursor WHERE id = 1')
      return r.rowCount ? ms(r.rows[0].at) : null
    },
    async setCursor(at) {
      await q('INSERT INTO push_cursor (id, at) VALUES (1, to_timestamp($1 / 1000.0)) ON CONFLICT (id) DO UPDATE SET at = EXCLUDED.at', [at])
    },
    async prune(before) {
      return (await q('DELETE FROM push_sent WHERE sent_at < to_timestamp($1 / 1000.0)', [before])).rowCount ?? 0
    },
    async xpEvents(userId) {
      return (await q('SELECT amount, created_at FROM xp_events WHERE owner_id = $1', [userId])).rows.map((r) => ({ amount: Number(r.amount) || 0, created_at: r.created_at ?? '' }))
    },
    async character(userId) {
      const r = await q('SELECT name, species FROM characters WHERE owner_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT 1', [userId])
      return r.rowCount ? r.rows[0] : null
    },
    async getState(userId) {
      const r = await q('SELECT last_stage, last_report_week, last_draft_week, last_inbox_nudge_at FROM push_state WHERE user_id = $1', [userId])
      return r.rowCount ? { ...r.rows[0], last_inbox_nudge_at: ms(r.rows[0].last_inbox_nudge_at) } : { ...EMPTY_STATE }
    },
    async setState(userId, patch) {
      const cols = Object.keys(patch) as (keyof PushState)[]
      if (!cols.length) return
      const vals = cols.map((c) => (c === 'last_inbox_nudge_at' && patch[c] != null ? new Date(patch[c] as number) : patch[c]))
      await q(
        `INSERT INTO push_state (user_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`,
        [userId, ...vals]
      )
    },
    async reports(userId, ids) {
      if (!ids.length) return []
      return (await q('SELECT id, week_start, stats_json, text_json FROM weekly_reports WHERE owner_id = $1 AND id = ANY($2)', [userId, ids])).rows
    },
    async openGoals(userId, weekStart) {
      const r = await q(`SELECT count(*)::int AS n FROM kpis WHERE owner_id = $1 AND week_start = $2 AND COALESCE(status, 'active') = 'active'`, [userId, weekStart])
      return r.rows[0]?.n ?? 0
    },
    async inboxOpen(userId) {
      const r = await q(`SELECT count(*)::int AS n FROM tasks t JOIN lists l ON l.id = t.list_id AND l.owner_id = t.owner_id
                          WHERE t.owner_id = $1 AND l.kind = 'inbox' AND t.status = 0 AND t.deleted_at IS NULL AND t.parent_id IS NULL`, [userId])
      return r.rows[0]?.n ?? 0
    },
    async withLock(fn) {
      const client = await pool.connect()
      try {
        const got = (await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY])).rows[0]?.ok
        if (!got) return undefined
        try { return await fn() } finally { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {}) }
      } finally { client.release() }
    }
  }
}

// ── 메모리(시험) ──
export type MemTask = { id: string; owner_id: string; title: string | null; status: number; start_at: string | null; due_at: string | null; deleted_at?: string | null; list_id?: string | null; priority?: number; parent_id?: string | null }
export type MemData = {
  devices: (Device & { last_ok_at?: number; fail_count: number; session?: string })[]
  sent: { device_id: string; key: string; kind: string; task_id: string | null; sent_at: number }[]
  state: Map<string, PushState>
  cursor: number | null
  prefs: Map<string, string | null>
  tasks: MemTask[]
  reminders: { id: string; owner_id: string; task_id: string; trigger: string }[]
  lists: { id: string; owner_id: string; name: string; kind: string; archived_at?: string | null; show_in_smart?: string | null }[]
  xp: { owner_id: string; amount: number; created_at: string }[]
  characters: { owner_id: string; name: string | null; species: string | null }[]
  reports: (ReportRow & { owner_id: string })[]
  kpis: { owner_id: string; week_start: string; status: string }[]
  sessions: { user_id: string; token_hash: string }[]
  locked: boolean
}
export function memoryPushStore(iosEnabled = false): PushStore & { data: MemData } {
  const data: MemData = { devices: [], sent: [], state: new Map(), cursor: null, prefs: new Map(), tasks: [], reminders: [], lists: [], xp: [], characters: [], reports: [], kpis: [], sessions: [], locked: false }
  const S = (t: MemTask) => (t.start_at ?? t.due_at ?? '').slice(0, 10)
  const E = (t: MemTask) => (t.due_at ?? '').slice(0, 10)
  const strip = (d: MemData['devices'][number]): Device => {
    const { last_ok_at: _a, fail_count: _f, session: _s, ...rest } = d
    return { ...rest, caps: [...rest.caps], local_keys: [...rest.local_keys] }
  }
  const dropSent = (deviceId: string) => { data.sent = data.sent.filter((s) => s.device_id !== deviceId) }
  return {
    data,
    async upsertDevice(userId, id, d, now) {
      for (const x of data.devices.filter((x) => (x.token === d.token && (x.id !== id || x.user_id !== userId)) || (x.id === id && x.user_id !== userId))) dropSent(x.id)
      data.devices = data.devices.filter((x) => !((x.token === d.token && (x.id !== id || x.user_id !== userId)) || (x.id === id && x.user_id !== userId)))
      const cur = data.devices.find((x) => x.id === id)
      if (cur) Object.assign(cur, { ...d, caps: [...d.caps], last_seen_at: now, fail_count: cur.token === d.token ? cur.fail_count : 0 })
      else data.devices.push({ id, user_id: userId, provider: 'fcm', ...d, caps: [...d.caps], local_keys: [], last_seen_at: now, fail_count: 0 })
    },
    async setLocalKeys(userId, id, keys, now) {
      const cur = data.devices.find((x) => x.id === id && x.user_id === userId)
      if (!cur) return false
      cur.local_keys = [...keys]
      cur.last_seen_at = now
      return true
    },
    async deleteDevice(userId, id) {
      const n = data.devices.length
      data.devices = data.devices.filter((x) => !(x.id === id && x.user_id === userId))
      if (data.devices.length < n) dropSent(id)
      return data.devices.length < n
    },
    async deleteDeviceBySession(id, refreshHash) {
      const s = data.sessions.find((x) => x.token_hash === refreshHash)
      return s ? this.deleteDevice(s.user_id, id) : false
    },
    async dropDevice(id) { data.devices = data.devices.filter((x) => x.id !== id); dropSent(id) },
    async markResult(id, ok, now) {
      const d = data.devices.find((x) => x.id === id)
      if (!d) return
      if (ok) { d.last_ok_at = now; d.fail_count = 0 } else d.fail_count++
    },
    async devices({ userId, seenSince }) {
      return data.devices
        .filter((d) => d.provider === 'fcm' && (d.platform === 'android' || (iosEnabled && d.platform === 'ios')) && d.last_seen_at >= seenSince && (!userId || d.user_id === userId))
        .map(strip)
    },
    async device(userId, id) {
      const d = data.devices.find((x) => x.id === id && x.user_id === userId)
      return d ? strip(d) : null
    },
    async prefs(userIds) { return new Map(userIds.filter((u) => data.prefs.has(u)).map((u) => [u, data.prefs.get(u)!])) },
    async reminderRows(userIds, fromDay, toDay) {
      const out: ReminderRow[] = []
      for (const r of data.reminders) {
        const t = data.tasks.find((x) => x.id === r.task_id && x.owner_id === r.owner_id)
        if (!t || !userIds.includes(t.owner_id) || t.status !== 0 || t.deleted_at || !t.due_at) continue
        if (!((S(t) >= fromDay && S(t) <= toDay) || (E(t) >= fromDay && E(t) <= toDay))) continue
        const l = data.lists.find((x) => x.id === t.list_id && x.owner_id === t.owner_id)
        out.push({ owner_id: t.owner_id, rid: r.id, trigger: r.trigger, tid: t.id, title: t.title, start_at: t.start_at, due_at: t.due_at, list_name: l?.name ?? null, list_kind: l?.kind ?? null })
      }
      return out
    },
    async dailyTasks(userId, today) {
      return data.tasks
        .filter((t) => {
          if (t.owner_id !== userId || t.deleted_at || !t.due_at || S(t) > today) return false
          const l = data.lists.find((x) => x.id === t.list_id)
          if (l && (l.archived_at || (l.show_in_smart ?? 'all') !== 'all')) return false
          return t.status === 0 || (t.status === 1 && E(t) >= today)
        })
        .map((t) => ({ title: t.title, status: t.status, start_at: t.start_at, due_at: t.due_at, priority: t.priority ?? 0 }))
    },
    async claim(deviceId, key, kind, taskId, now) {
      if (data.sent.some((s) => s.device_id === deviceId && s.key === key)) return false
      data.sent.push({ device_id: deviceId, key, kind, task_id: taskId, sent_at: now })
      return true
    },
    async unclaim(deviceId, key) { data.sent = data.sent.filter((s) => !(s.device_id === deviceId && s.key === key)) },
    async tasksOfReminders(userId, rids) {
      const mine = new Set(data.devices.filter((d) => d.user_id === userId).map((d) => d.id))
      return [...new Set(data.sent.filter((s) => mine.has(s.device_id) && s.task_id && s.key.startsWith('r:') && rids.includes(s.key.slice(2, s.key.lastIndexOf('@')))).map((s) => s.task_id!))]
    },
    async getCursor() { return data.cursor },
    async setCursor(at) { data.cursor = at },
    async prune(before) { const n = data.sent.length; data.sent = data.sent.filter((s) => s.sent_at >= before); return n - data.sent.length },
    async xpEvents(userId) { return data.xp.filter((x) => x.owner_id === userId).map(({ amount, created_at }) => ({ amount, created_at })) },
    async character(userId) { const c = data.characters.filter((x) => x.owner_id === userId).at(-1); return c ? { name: c.name, species: c.species } : null },
    async getState(userId) { return { ...EMPTY_STATE, ...data.state.get(userId) } },
    async setState(userId, patch) { data.state.set(userId, { ...EMPTY_STATE, ...data.state.get(userId), ...patch }) },
    async reports(userId, ids) { return data.reports.filter((r) => r.owner_id === userId && ids.includes(r.id)) },
    async openGoals(userId, weekStart) { return data.kpis.filter((k) => k.owner_id === userId && k.week_start === weekStart && (k.status ?? 'active') === 'active').length },
    async inboxOpen(userId) {
      const inbox = new Set(data.lists.filter((l) => l.owner_id === userId && l.kind === 'inbox').map((l) => l.id))
      return data.tasks.filter((t) => t.owner_id === userId && inbox.has(t.list_id ?? '') && t.status === 0 && !t.deleted_at && !t.parent_id).length
    },
    async withLock(fn) {
      if (data.locked) return undefined
      data.locked = true
      try { return await fn() } finally { data.locked = false }
    }
  }
}
