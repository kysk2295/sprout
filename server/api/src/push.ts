// 32 푸시 알림(FCM) — 기기 등록 경로 · 스케줄러(할 일 알림·하루 요약·목표 마감) · 업로드 효과(조용한 동기화·알림 지우기·성장 소식)
//   PUT    /push/devices/:id        (Bearer) {token, platform, app_version, caps[], timezone, locale, push_reminders} → {ok, push:{enabled, ios}}
//   PUT    /push/devices/:id/local  (Bearer) {keys[], until?}  → {ok}   이 기기가 로컬로 예약한 알림 id(서버는 이것을 보내지 않는다)
//   DELETE /push/devices/:id        (Bearer)                   → {ok, deleted}
//   POST   /push/test               (Bearer) {device_id}       → {ok} | 404 | 429 | 503(푸시 꺼짐) | 502(FCM 실패)
// FCM_PROJECT_ID가 비면 푸시 전체가 꺼진다: 등록은 받아 두되(나중에 켜면 바로 쓴다) 아무것도 보내지 않고, 응답은 push.enabled=false.
// 원문(할 일 제목 등)은 저장도 로그도 하지 않는다 — 로그는 "기기 2대에 1건" 같은 숫자만.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { growthCopy, INBOX_NUDGE, parseNotifyPrefs, TEST_NOTICE, CHANNELS, dailySummary, type NotifyPrefs } from '../../../packages/schema/src/notify.ts'
import { isTimeZone } from '../../../packages/schema/src/time.ts'
import { progressFromEvents, SPECIES, STAGES, type Species } from '../../../packages/schema/src/growth.ts'
import { enforce, RateLimiter, RateLimitError, type Rule } from './ratelimit.ts'
import type { FcmSender } from './fcm.ts'
import {
  can, candidateDays, fcmMessage, localMomentsIn, noticeOut, planReminderPushes, pushEffects, reportNumbers, syncOut, TTL, weekStartOf,
  type Device, type Outgoing
} from './push-plan.ts'
import type { DeviceInput, PushStore } from './push-store.ts'

export type PushConfig = {
  tickMs: number // 스케줄러 간격(30초) [임시]
  syncMinSec: number // 기기마다 조용한 동기화 푸시 최소 간격(30초) [임시]
  ios: boolean // PUSH_IOS — iOS 등록은 받아 두고, 켜야 보낸다(§11)
  catchUpMs: number // 할 일 알림 따라잡기 1시간
  summaryCatchUpMs: number // 하루 요약·목표 마감 따라잡기 2시간 [임시]
  staleDays: number // 이 기간 동안 안 보인 기기에는 보내지 않는다
  keepSentDays: number // push_sent 보관
  concurrency: number // 동시 전송
}
export function pushConfigFromEnv(env: Record<string, string | undefined> = process.env): PushConfig {
  const n = (k: string, d: number) => { const v = Number(env[k]); return env[k] !== undefined && env[k] !== '' && Number.isFinite(v) && v >= 0 ? v : d }
  return {
    tickMs: Math.max(1000, n('PUSH_TICK_MS', 30_000)),
    syncMinSec: n('PUSH_SYNC_MIN_SEC', 30),
    ios: env.PUSH_IOS === '1' || env.PUSH_IOS === 'true',
    catchUpMs: 3600_000,
    summaryCatchUpMs: 2 * 3600_000,
    staleDays: 30,
    keepSentDays: 7,
    concurrency: 10
  }
}

export class PushError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

export type PushDeps = {
  config: PushConfig
  store: PushStore
  /** null = 푸시 꺼짐(FCM_PROJECT_ID 없음) */
  sender: FcmSender | null
  auth: (req: IncomingMessage) => Promise<string>
  now?: () => number
  log?: (msg: string) => void
  limits?: { register: Rule; local: Rule; test: Rule }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY_RE = /^[rs]:[^\s]{1,120}$/

async function readJson(req: IncomingMessage, limit = 20_000): Promise<any> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new PushError('body too large', 413)
    chunks.push(c)
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} } catch { throw new PushError('bad json') }
}

/** 등록 본문 검사 → DeviceInput */
export function parseDevice(b: any): DeviceInput {
  if (!b || typeof b !== 'object') throw new PushError('bad request')
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null)
  const token = str(b.token, 4096)
  if (!token || token.length < 8) throw new PushError('bad token')
  if (b.platform !== 'android' && b.platform !== 'ios') throw new PushError('bad platform')
  if (!isTimeZone(b.timezone)) throw new PushError('bad timezone')
  const caps = Array.isArray(b.caps) ? [...new Set(b.caps.filter((c: unknown) => typeof c === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(c)))].slice(0, 20) as string[] : []
  return {
    token,
    platform: b.platform,
    app_version: str(b.app_version, 64),
    caps,
    timezone: b.timezone,
    locale: str(b.locale, 35),
    push_reminders: typeof b.push_reminders === 'boolean' ? b.push_reminders : true
  }
}

export function createPush(deps: PushDeps) {
  const { config, store } = deps
  const now = deps.now ?? Date.now
  const log = deps.log ?? ((m: string) => console.log(`[push] ${m}`))
  const enabled = !!deps.sender
  const limiter = new RateLimiter(now)
  const limits = deps.limits ?? { register: { max: 10, windowMs: 60_000 }, local: { max: 10, windowMs: 60_000 }, test: { max: 3, windowMs: 10 * 60_000 } }
  const seenSince = () => now() - config.staleDays * 86400_000

  // ── 보내기 ──
  /** 한 기기에 하나. 토큰이 죽었으면 기기 행을 지운다 */
  async function deliver(device: Device, o: Outgoing): Promise<boolean> {
    return (await deliverResult(device, o)) === 'sent'
  }
  async function deliverResult(device: Device, o: Outgoing): Promise<'sent' | 'dead' | 'fail'> {
    if (!deps.sender) return 'fail'
    const r = await deps.sender.send(device.token, fcmMessage(device, o))
    if (r.ok) { await store.markResult(device.id, true, now()); return 'sent' }
    if (r.invalid) { await store.dropDevice(device.id); log(`쓸 수 없는 토큰 1개 정리(${r.code ?? r.status})`); return 'dead' }
    await store.markResult(device.id, false, now())
    return 'fail'
  }
  /** push_sent에 먼저 기록(중복 막기)하고 보낸다. 실패하면 기록을 지운다(다음 tick에 다시) */
  async function deliverOnce(device: Device, o: Outgoing): Promise<'sent' | 'dup' | 'fail' | 'dead'> {
    if (!(await store.claim(device.id, o.key!, o.kind, o.taskId ?? null, now()))) return 'dup'
    const r = await deliverResult(device, o).catch(() => 'fail' as const)
    if (r === 'fail') await store.unclaim(device.id, o.key!).catch(() => {})
    return r
  }
  async function pool<T>(items: T[], fn: (x: T) => Promise<unknown>) {
    let i = 0
    const run = async () => { while (i < items.length) { const x = items[i++]; await fn(x).catch((e) => log(`보내기 오류 ${(e as Error).message}`)) } }
    await Promise.all(Array.from({ length: Math.min(config.concurrency, items.length) }, run))
  }
  const prefsOf = async (userIds: string[]) => {
    const raw = await store.prefs(userIds)
    return new Map(userIds.map((u) => [u, parseNotifyPrefs(raw.get(u))]))
  }

  // ── 스케줄러 (32 §4.2·§5·§8) ──
  type Retry = { device: Device; o: Outgoing; until: number }
  let retries: Retry[] = []
  let lastPrune = 0

  /** 한 번 돌기. 창 (max(cursor, now-1h), now]의 할 일 알림 · 하루 요약 · 일요일 20:00 목표 마감 */
  async function tick(): Promise<{ sent: number; failed: number } | undefined> {
    if (!enabled) return undefined
    return store.withLock(async () => {
      const t = now()
      const cursor = (await store.getCursor()) ?? t - config.tickMs
      const from = Math.max(cursor, t - config.catchUpMs)
      const fromSummary = Math.max(cursor, t - config.summaryCatchUpMs)
      const devices = await store.devices({ seenSince: seenSince() })
      const userIds = [...new Set(devices.map((d) => d.user_id))]
      const prefs = await prefsOf(userIds)
      const days = candidateDays(t)
      const rows = userIds.length ? await store.reminderRows(userIds, days.from, days.to) : []
      const jobs: { device: Device; o: Outgoing }[] = []
      for (const r of retries) if (r.until > t) jobs.push({ device: r.device, o: r.o })
      retries = []
      const dailyCache = new Map<string, Awaited<ReturnType<PushStore['dailyTasks']>>>()
      for (const d of devices) {
        const p = prefs.get(d.user_id)!
        for (const o of planReminderPushes(rows, d, p, from, t)) jobs.push({ device: d, o })
        // 하루 요약: 그 기기 시각 p.daily.time, 주말 건너뛰기
        if (p.daily.on && can(d, 'daily')) {
          for (const m of localMomentsIn(d.timezone, p.daily.time, fromSummary, t, p.daily.skipWeekends ? [1, 2, 3, 4, 5] : undefined)) {
            const ck = `${d.user_id}|${m.day}`
            if (!dailyCache.has(ck)) dailyCache.set(ck, await store.dailyTasks(d.user_id, m.day))
            const s = dailySummary(dailyCache.get(ck)!, m.day, p.hideTitles)
            if (s) jobs.push({ device: d, o: noticeOut({ kind: 'daily', title: s.title, body: s.body, url: 'sprout://today' }, `daily:${m.day}`, CHANNELS.daily, TTL.daily) })
          }
        }
        // 이번 주 목표 마감: 일요일 20:00, 남은 목표가 있을 때 주 1번
        if (p.growth.goalDue && can(d, 'growth')) {
          for (const m of localMomentsIn(d.timezone, '20:00', fromSummary, t, [0])) {
            const week = weekStartOf(m.day)
            const left = await store.openGoals(d.user_id, week)
            if (left > 0) jobs.push({ device: d, o: noticeOut(growthCopy.goalDue(left), `goaldue:${week}`, CHANNELS.growth, TTL.growth) })
          }
        }
      }
      let sent = 0
      let failed = 0
      await pool(jobs, async ({ device, o }) => {
        const r = await deliverOnce(device, o)
        if (r === 'sent') sent++
        if (r === 'dead') failed++
        if (r === 'fail') {
          failed++
          // 할 일 알림은 울릴 시각 뒤 1시간까지만 다시(그보다 늦은 알림은 소음)
          const at = Number(o.data.at)
          retries.push({ device, o, until: Number.isFinite(at) ? at + config.catchUpMs : t + config.summaryCatchUpMs })
        }
      })
      await store.setCursor(t)
      if (t - lastPrune > 3600_000) { lastPrune = t; await store.prune(t - config.keepSentDays * 86400_000) }
      if (sent || failed) log(`tick: 기기 ${devices.length}대 · 보냄 ${sent} · 실패 ${failed}`)
      return { sent, failed }
    })
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let running = false
  function start() {
    if (!enabled || timer) return
    timer = setInterval(() => {
      if (running) return
      running = true
      tick().catch((e) => log(`tick 오류 ${(e as Error).message}`)).finally(() => { running = false })
    }, config.tickMs)
    timer.unref?.()
    log(`켜짐 · ${config.tickMs / 1000}초마다${config.ios ? ' · iOS 포함' : ''}`)
  }
  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    for (const s of syncState.values()) if (s.timer) clearTimeout(s.timer)
    syncState.clear()
  }

  // ── 조용한 동기화 푸시 모으기 (32 §6): 기기마다 syncMinSec에 1번, 그 안에 또 오면 끝에 한 번 ──
  const syncState = new Map<string, { last: number; timer: ReturnType<typeof setTimeout> | null; device: Device }>()
  function requestSync(device: Device) {
    const t = now()
    const s = syncState.get(device.id) ?? { last: 0, timer: null, device }
    s.device = device
    syncState.set(device.id, s)
    if (s.timer) return // 이미 꼬리 전송이 잡혀 있다
    const gap = config.syncMinSec * 1000
    if (t - s.last >= gap) {
      s.last = t
      void deliver(device, syncOut()).catch(() => {})
    } else {
      s.timer = setTimeout(() => {
        s.timer = null
        s.last = now()
        void deliver(s.device, syncOut()).catch(() => {})
      }, s.last + gap - t)
      s.timer.unref?.()
    }
  }
  /** 알림 지우기는 기다리지 않고 바로. 앱은 이것으로 동기화도 하므로 잡혀 있던 꼬리 전송은 거둔다 */
  async function sendDismiss(device: Device, taskIds: string[]) {
    const s = syncState.get(device.id)
    if (s?.timer) { clearTimeout(s.timer); s.timer = null }
    syncState.set(device.id, { last: now(), timer: null, device })
    await deliver(device, syncOut(taskIds))
  }

  // ── 업로드 효과 (32 §4.5·§6·§8) — 커밋 뒤에 부른다. 실패해도 업로드 응답과 무관 ──
  async function afterUpload(userId: string, uploaderDevice: string | undefined | null, batch: unknown): Promise<void> {
    if (!enabled) return
    const e = pushEffects(batch)
    if (!e.sync && !e.xp && !e.reports.length && !e.tasks) return
    const all = await store.devices({ userId, seenSince: seenSince() })
    const others = all.filter((d) => d.id !== uploaderDevice)
    if (!others.length) return
    const syncable = others.filter((d) => can(d, 'sync'))
    // 알림 지우기 + 조용한 동기화
    const dismiss = [...new Set([...e.dismiss, ...(await store.tasksOfReminders(userId, e.deletedReminders))])]
    if (dismiss.length) await Promise.all(syncable.map((d) => sendDismiss(d, dismiss).catch(() => {})))
    else if (e.sync) for (const d of syncable) requestSync(d)
    // 성장 소식 — 올린 기기(그 화면에서 이미 연출을 본 기기)에는 보내지 않는다
    const growthDevs = others.filter((d) => can(d, 'growth'))
    if (!growthDevs.length) return
    const p = (await prefsOf([userId])).get(userId)!
    if (e.xp && p.growth.evolve) await evolveCheck(userId, growthDevs)
    if (e.reports.length && p.growth.report) await reportCheck(userId, e.reports, growthDevs)
    if (e.tasks && p.growth.inboxCleanup) await inboxCheck(userId, growthDevs.filter((d) => can(d, 'inbox-cleanup')))
  }

  async function characterName(userId: string): Promise<string> {
    const c = await store.character(userId)
    return c?.name?.trim() || (c?.species && SPECIES[c.species as Species]?.name) || '캐릭터'
  }
  const sendAll = (devs: Device[], o: Outgoing) => pool(devs, (d) => deliverOnce(d, o))

  async function evolveCheck(userId: string, devs: Device[]) {
    const { stage } = progressFromEvents(await store.xpEvents(userId))
    const st = await store.getState(userId)
    if (st.last_stage === null || stage < st.last_stage) { await store.setState(userId, { last_stage: stage }); return } // 처음 보는 사용자: 기준만 잡는다
    if (stage === st.last_stage) return
    await store.setState(userId, { last_stage: stage })
    const name = await characterName(userId)
    const stageName = STAGES.find((s) => s.stage === stage)!.name
    await sendAll(devs, noticeOut(growthCopy.evolve(name, stageName), `evolve:${stage}`, CHANNELS.growth, TTL.growth))
  }
  async function reportCheck(userId: string, ids: string[], devs: Device[]) {
    const st = await store.getState(userId)
    for (const r of await store.reports(userId, ids)) {
      if (!r.week_start) continue
      const n = reportNumbers(r.stats_json, r.text_json)
      if (n.hasReport && (!st.last_report_week || r.week_start > st.last_report_week)) {
        await store.setState(userId, { last_report_week: r.week_start, ...(n.drafts ? { last_draft_week: r.week_start } : {}) })
        st.last_report_week = r.week_start
        if (n.drafts) st.last_draft_week = r.week_start
        await sendAll(devs, noticeOut(growthCopy.report(r.week_start, n.completed, n.goals, n.achieved, n.drafts), `report:${r.week_start}`, CHANNELS.growth, TTL.growth))
      } else if (!n.hasReport && n.drafts && (!st.last_draft_week || r.week_start > st.last_draft_week)) {
        await store.setState(userId, { last_draft_week: r.week_start })
        st.last_draft_week = r.week_start
        await sendAll(devs, noticeOut(growthCopy.draft(await characterName(userId), n.drafts), `draft:${r.week_start}`, CHANNELS.growth, TTL.growth))
      }
    }
  }
  async function inboxCheck(userId: string, devs: Device[]) {
    if (!devs.length) return
    const st = await store.getState(userId)
    if (st.last_inbox_nudge_at && now() - st.last_inbox_nudge_at < INBOX_NUDGE.everyDays * 86400_000) return
    const n = await store.inboxOpen(userId)
    if (n <= INBOX_NUDGE.over) return
    await store.setState(userId, { last_inbox_nudge_at: now() })
    await sendAll(devs, noticeOut(growthCopy.inboxCleanup(n), `inbox:${new Date(now()).toISOString().slice(0, 10)}`, CHANNELS.growth, TTL.growth))
  }

  // ── 경로 ──
  const status = () => ({ enabled, ios: enabled && config.ios })
  async function route(req: IncomingMessage, path: string): Promise<[number, unknown]> {
    const m = path.match(/^\/push\/devices\/([^/]+)(\/local)?$/)
    if (m) {
      const id = decodeURIComponent(m[1])
      if (!UUID_RE.test(id)) throw new PushError('bad device id')
      const userId = await deps.auth(req)
      if (!m[2] && req.method === 'PUT') {
        enforce(limiter, [[`push:reg:${userId}`, limits.register]], '기기 등록')
        limiter.hit(`push:reg:${userId}`, limits.register)
        const d = parseDevice(await readJson(req))
        await store.upsertDevice(userId, id.toLowerCase(), d, now())
        return [200, { ok: true, push: status() }]
      }
      if (m[2] && req.method === 'PUT') {
        enforce(limiter, [[`push:local:${id}`, limits.local]], '알림 목록 보고')
        limiter.hit(`push:local:${id}`, limits.local)
        const b = await readJson(req, 50_000)
        if (!Array.isArray(b?.keys) || b.keys.length > 200 || !b.keys.every((k: unknown) => typeof k === 'string' && KEY_RE.test(k))) throw new PushError('bad keys')
        if (!(await store.setLocalKeys(userId, id.toLowerCase(), b.keys, now()))) throw new PushError('device not found', 404)
        return [200, { ok: true }]
      }
      if (!m[2] && req.method === 'DELETE') {
        const deleted = await store.deleteDevice(userId, id.toLowerCase())
        const s = syncState.get(id.toLowerCase())
        if (s?.timer) clearTimeout(s.timer)
        syncState.delete(id.toLowerCase())
        return [200, { ok: true, deleted }]
      }
      throw new PushError('not found', 404)
    }
    if (path === '/push/test' && req.method === 'POST') {
      const userId = await deps.auth(req)
      const { device_id } = await readJson(req)
      if (typeof device_id !== 'string' || !UUID_RE.test(device_id)) throw new PushError('bad device id')
      if (!enabled) throw new PushError('push disabled', 503)
      enforce(limiter, [[`push:test:${userId}`, limits.test]], '시험 알림')
      const device = await store.device(userId, device_id.toLowerCase())
      if (!device) throw new PushError('device not found', 404)
      limiter.hit(`push:test:${userId}`, limits.test)
      const ok = await deliver(device, noticeOut(TEST_NOTICE, `test:${now()}`, CHANNELS.tasks, TTL.test))
      if (!ok) throw new PushError('send failed', 502)
      return [200, { ok: true }]
    }
    throw new PushError('not found', 404)
  }

  /** server.ts에서 부른다: /push/로 시작하면 처리하고 true */
  async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/push/')) return false
    const send = (s: number, body: unknown, headers: Record<string, string> = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)) }
    try {
      const [s, body] = await route(req, path)
      send(s, body)
    } catch (e) {
      if (e instanceof RateLimitError) send(429, { error: e.message, code: e.code, retry_after: e.retryAfter }, { 'retry-after': String(e.retryAfter) })
      else if (typeof (e as { status?: unknown })?.status === 'number') send((e as { status: number }).status, { error: (e as Error).message })
      else { log(`${req.method} ${path} 오류 ${(e as Error)?.message}`); send(500, { error: 'server error' }) }
    }
    return true
  }

  return { handle, tick, start, stop, afterUpload, status, enabled, _syncState: syncState }
}
export type Push = ReturnType<typeof createPush>
export type { NotifyPrefs }
