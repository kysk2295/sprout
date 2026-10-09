// 48 만료 2주 지난 할 일 자동 정리 — 서버 작업. 사용자마다 그 시간대의 날이 바뀐 뒤 처음 돌 때 한 번,
// 열린 할 일 중 마감이 오늘−14일보다 앞인 것을 휴지통으로(tasks.deleted_at·modified_at — 동기화 열이라 PowerSync가 모든 기기에 내린다).
// 옮길 때마다 view_settings에 묶음 행(view_key 'autoTrash:batch')을 만들어 앱이 다음에 열 때 토스트·되돌리기를 보인다.
// 고르는 규칙은 packages/schema/src/autoTrash.ts(pickAutoTrash, 시험 있음). 서버 전용 표: auto_trash_log·auto_trash_state(db/migrations/20261014-auto-trash.sql).
// XP·완료는 건드리지 않는다(xp_events 쓰지 않음).
import { randomUUID } from 'node:crypto'
import {
  AUTO_TRASH, autoTrashSettingsId, batchJson, cutoffDay, parseAutoTrashSettings, pickAutoTrash, pickTimeZone, todayIn, type AtInput
} from '../../../packages/schema/src/autoTrash.ts'
import { addDays } from '../../../packages/schema/src/time.ts'

export type AtUser = { id: string; settings_json: string | null; device_tz: string | null; last_day: string | null }
export type AtBatchWrite = { batchId: string; at: string; day: string; ids: string[]; dues: Map<string, string | null> }

export interface AutoTrashStore {
  /** 마감이 beforeDay보다 앞인 열린 할 일이 있는 사용자 + 설정·기기 시간대·마지막으로 돈 날 */
  candidates(beforeDay: string): Promise<AtUser[]>
  load(userId: string): Promise<AtInput>
  /** 한 트랜잭션: 아직 열려 있고 휴지통이 아닌 것만 옮기고(실제로 옮긴 id를 돌려준다), 묶음 행·기록을 남긴다 */
  apply(userId: string, b: AtBatchWrite): Promise<string[]>
  setDay(userId: string, day: string): Promise<void>
  /** 오래된 묶음 행 지우기 */
  prune(beforeIso: string): Promise<number>
  withLock<T>(fn: () => Promise<T>): Promise<T | undefined>
}

export type AutoTrashDeps = { store: AutoTrashStore; now?: () => number; log?: (m: string) => void; tickMs?: number }

export function createAutoTrash(deps: AutoTrashDeps) {
  const now = deps.now ?? Date.now
  const log = deps.log ?? ((m: string) => console.log(`[auto-trash] ${m}`))
  const { store } = deps
  let lastPrune = 0

  /** 한 번 돌기. 옮긴 사용자 수·할 일 수 */
  async function tick(): Promise<{ users: number; tasks: number } | undefined> {
    return store.withLock(async () => {
      const t = now()
      // UTC 날짜 기준으로 넉넉히 거른다(시간대는 UTC±14시간 → 어느 사용자의 오늘이든 UTC 날짜+1 이하)
      const loose = cutoffDay(addDays(new Date(t).toISOString().slice(0, 10), 1))
      let users = 0
      let tasks = 0
      for (const u of await store.candidates(loose)) {
        const s = parseAutoTrashSettings(u.settings_json)
        if (!s.on) continue
        const today = todayIn(t, pickTimeZone(s.tz, u.device_tz))
        if (u.last_day && u.last_day >= today) continue
        try {
          const input = await store.load(u.id)
          const pick = pickAutoTrash(input, today)
          if (pick.ids.length) {
            const dues = new Map(input.tasks.map((x) => [x.id, x.due_at]))
            const moved = await store.apply(u.id, { batchId: `atb-${randomUUID()}`, at: new Date(t).toISOString(), day: today, ids: pick.ids, dues })
            if (moved.length) { users++; tasks += moved.length }
          }
          await store.setDay(u.id, today)
        } catch (e) {
          log(`사용자 1명 실패: ${(e as Error).message}`) // 다음 tick에 다시
        }
      }
      if (t - lastPrune > 6 * 3600_000) { lastPrune = t; await store.prune(new Date(t - AUTO_TRASH.keepBatchDays * 86400_000).toISOString()).catch(() => 0) }
      if (tasks) log(`사용자 ${users}명 · 할 일 ${tasks}개를 휴지통으로`)
      return { users, tasks }
    })
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let running = false
  function start() {
    if (timer) return
    const run = () => {
      if (running) return
      running = true
      tick().catch((e) => log(`tick 오류 ${(e as Error).message}`)).finally(() => { running = false })
    }
    timer = setInterval(run, deps.tickMs ?? 10 * 60_000)
    setTimeout(run, 15_000) // 켜자마자 한 번(조금 뒤 — DB 준비)
  }
  function stop() { if (timer) clearInterval(timer); timer = null }
  return { tick, start, stop }
}

// ── Postgres ──
type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>
type Pool = { query: Q; connect(): Promise<{ query: Q; release(): void }> }
const LOCK_KEY = 48_0001

export const CANDIDATES_SQL =
  `SELECT u.owner_id AS id, s.options_json AS settings_json, st.last_day,
          (SELECT d.timezone FROM device_tokens d WHERE d.user_id = u.owner_id ORDER BY d.last_seen_at DESC LIMIT 1) AS device_tz
     FROM (SELECT DISTINCT owner_id FROM tasks
            WHERE status = 0 AND deleted_at IS NULL AND due_at IS NOT NULL AND substr(due_at, 1, 10) < $1
              AND (repeat_rule IS NULL OR repeat_rule = '')) u
     LEFT JOIN view_settings s ON s.owner_id = u.owner_id AND s.view_key = '${AUTO_TRASH.viewKey}'
     LEFT JOIN auto_trash_state st ON st.owner_id = u.owner_id`

export function pgAutoTrashStore(pool: Pool): AutoTrashStore {
  const q: Q = (sql, params) => pool.query(sql, params)
  return {
    async candidates(beforeDay) {
      const r = await q(CANDIDATES_SQL, [beforeDay])
      // 설정 행이 두 개 생긴 옛 경우(무작위 id) — 사용자당 하나로(끔이 하나라도 있으면 끔)
      const by = new Map<string, AtUser>()
      for (const row of r.rows as AtUser[]) {
        const prev = by.get(row.id)
        if (!prev || parseAutoTrashSettings(row.settings_json).on === false) by.set(row.id, row)
      }
      return [...by.values()]
    },
    async load(userId) {
      const [tasks, lists, tags, links, deadlines, done] = await Promise.all([
        q(`SELECT id, parent_id, status, deleted_at, due_at, repeat_rule, pinned_at, list_id FROM tasks WHERE owner_id = $1 AND deleted_at IS NULL`, [userId]),
        q(`SELECT id FROM lists WHERE owner_id = $1 AND archived_at IS NOT NULL`, [userId]),
        q(`SELECT id FROM tags WHERE owner_id = $1 AND kind = 'project'`, [userId]),
        q(`SELECT tt.task_id, tt.tag_id, tt.state FROM task_tags tt JOIN tags g ON g.id = tt.tag_id AND g.owner_id = $1 AND g.kind = 'project' WHERE tt.owner_id = $1`, [userId]),
        q(`SELECT from_id AS tag_id, to_id AS task_id FROM relations WHERE owner_id = $1 AND from_type = 'tag' AND to_type = 'task' AND field = 'deadline' AND (state IS NULL OR state = 'accepted')`, [userId]),
        q(`SELECT task_id, due_at FROM auto_trash_log WHERE owner_id = $1`, [userId])
      ])
      return {
        tasks: tasks.rows.map((t) => ({ ...t, status: t.status === null ? null : Number(t.status) })),
        archivedLists: lists.rows.map((x) => x.id),
        projectTags: tags.rows.map((x) => x.id),
        taskTags: links.rows,
        deadlines: deadlines.rows,
        done: done.rows
      }
    },
    async apply(userId, b) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const r = await client.query(
          `UPDATE tasks SET deleted_at = $3, modified_at = $3
            WHERE owner_id = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL AND status = 0 RETURNING id, due_at`,
          [userId, b.ids, b.at])
        const moved = r.rows.map((x) => x.id as string)
        if (moved.length) {
          await client.query(
            `INSERT INTO view_settings (id, owner_id, created_at, modified_at, view_key, options_json) VALUES ($1, $2, $3, $3, $4, $5)`,
            [b.batchId, userId, b.at, AUTO_TRASH.batchKey, batchJson({ at: b.at, day: b.day, ids: moved, count: moved.length, seen: false, undone: false })])
          await client.query(
            `INSERT INTO auto_trash_log (owner_id, task_id, due_at, batch_id) SELECT $1, x.id, x.due, $2 FROM unnest($3::text[], $4::text[]) AS x(id, due) ON CONFLICT DO NOTHING`,
            [userId, b.batchId, r.rows.map((x) => x.id), r.rows.map((x) => x.due_at)])
        }
        await client.query('COMMIT')
        return moved
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
    async setDay(userId, day) {
      await q(`INSERT INTO auto_trash_state (owner_id, last_day, updated_at) VALUES ($1, $2, now()) ON CONFLICT (owner_id) DO UPDATE SET last_day = EXCLUDED.last_day, updated_at = now()`, [userId, day])
    },
    async prune(beforeIso) {
      const r = await q(`DELETE FROM view_settings WHERE view_key = '${AUTO_TRASH.batchKey}' AND created_at < $1`, [beforeIso])
      return r.rowCount ?? 0
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
export type MemAt = {
  tasks: (AtInput['tasks'][number] & { owner_id: string; modified_at?: string | null })[]
  lists: { id: string; owner_id: string; archived_at: string | null }[]
  tags: { id: string; owner_id: string; kind: string | null }[]
  taskTags: { owner_id: string; task_id: string; tag_id: string; state?: string | null }[]
  relations: { owner_id: string; from_type: string; from_id: string; to_type: string; to_id: string; field: string | null; state?: string | null }[]
  viewSettings: { id: string; owner_id: string; created_at: string; view_key: string; options_json: string | null }[]
  devices: { user_id: string; timezone: string; last_seen_at: number }[]
  log: { owner_id: string; task_id: string; due_at: string | null; batch_id: string }[]
  state: Map<string, string>
  xpEvents: { owner_id: string; amount: number }[]
}
export function memAt(): MemAt {
  return { tasks: [], lists: [], tags: [], taskTags: [], relations: [], viewSettings: [], devices: [], log: [], state: new Map(), xpEvents: [] }
}
export function memoryAutoTrashStore(d: MemAt): AutoTrashStore {
  const open = (t: MemAt['tasks'][number]) => (t.status ?? 0) === 0 && !t.deleted_at
  return {
    async candidates(beforeDay) {
      const ids = [...new Set(d.tasks.filter((t) => open(t) && t.due_at && t.due_at.slice(0, 10) < beforeDay && !t.repeat_rule).map((t) => t.owner_id))]
      return ids.map((id) => ({
        id,
        settings_json: d.viewSettings.find((v) => v.owner_id === id && v.view_key === AUTO_TRASH.viewKey)?.options_json ?? null,
        device_tz: [...d.devices].filter((x) => x.user_id === id).sort((a, b) => b.last_seen_at - a.last_seen_at)[0]?.timezone ?? null,
        last_day: d.state.get(id) ?? null
      }))
    },
    async load(u) {
      const projects = new Set(d.tags.filter((t) => t.owner_id === u && t.kind === 'project').map((t) => t.id))
      return {
        tasks: d.tasks.filter((t) => t.owner_id === u && !t.deleted_at),
        archivedLists: d.lists.filter((l) => l.owner_id === u && l.archived_at).map((l) => l.id),
        projectTags: [...projects],
        taskTags: d.taskTags.filter((l) => l.owner_id === u && projects.has(l.tag_id)),
        deadlines: d.relations.filter((r) => r.owner_id === u && r.from_type === 'tag' && r.to_type === 'task' && r.field === 'deadline' && (r.state ?? 'accepted') === 'accepted').map((r) => ({ tag_id: r.from_id, task_id: r.to_id })),
        done: d.log.filter((l) => l.owner_id === u).map((l) => ({ task_id: l.task_id, due_at: l.due_at }))
      }
    },
    async apply(u, b) {
      const want = new Set(b.ids)
      const moved = d.tasks.filter((t) => t.owner_id === u && want.has(t.id) && open(t))
      for (const t of moved) { t.deleted_at = b.at; t.modified_at = b.at }
      if (moved.length) {
        d.viewSettings.push({ id: b.batchId, owner_id: u, created_at: b.at, view_key: AUTO_TRASH.batchKey, options_json: batchJson({ at: b.at, day: b.day, ids: moved.map((t) => t.id), count: moved.length, seen: false, undone: false }) })
        for (const t of moved) d.log.push({ owner_id: u, task_id: t.id, due_at: t.due_at, batch_id: b.batchId })
      }
      return moved.map((t) => t.id)
    },
    async setDay(u, day) { d.state.set(u, day) },
    async prune(before) {
      const n = d.viewSettings.length
      d.viewSettings = d.viewSettings.filter((v) => !(v.view_key === AUTO_TRASH.batchKey && v.created_at < before))
      return n - d.viewSettings.length
    },
    async withLock(fn) { return fn() }
  }
}
export { autoTrashSettingsId }
