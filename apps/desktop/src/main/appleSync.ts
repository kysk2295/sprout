// 16 §11 Apple 캘린더 읽기: 네이티브 도우미(sprout-calendar, EventKit)를 부르고 캐시에 넣는다. Electron 없음(시험은 가짜 도우미).
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { addDaysStr, APPLE_ACCOUNT_ID, APPLE_LABEL, cacheFrom, floating, mapAppleEvent, type AppleCalendar, type AppleEvent } from '../shared/calendars'
import type { CalendarStore } from './calendarStore'

export type AppleAuth = 'notDetermined' | 'fullAccess' | 'writeOnly' | 'denied' | 'restricted' | 'missing'
export type RunHelper = (args: string[], timeoutMs: number) => Promise<unknown>

/** 도우미 실행: 표준 출력 JSON 한 개 */
export function helperRunner(path: () => string | null): RunHelper {
  return (args, timeoutMs) => new Promise((resolve, reject) => {
    const bin = path()
    if (!bin || !existsSync(bin)) { reject(Object.assign(new Error('캘린더 도우미가 없어요'), { code: 'MISSING' })); return }
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) { reject(err); return }
      try { resolve(JSON.parse(stdout)) } catch { reject(new Error(`도우미 응답을 읽지 못했어요: ${String(stdout).slice(0, 200)}`)) }
    })
  })
}

export class AppleSync {
  constructor(private d: { store: CalendarStore; run: RunHelper; timeZone: () => string; now?: () => Date }) {}

  async auth(): Promise<AppleAuth> {
    try { return ((await this.d.run(['status'], 10_000)) as { status: AppleAuth }).status }
    catch (e) { if ((e as { code?: string }).code === 'MISSING') return 'missing'; throw e }
  }
  /** 권한 요청(macOS 권한 창) — 사용자가 누를 때까지 기다린다 */
  async request(): Promise<AppleAuth> {
    try { return ((await this.d.run(['request'], 120_000)) as { status: AppleAuth }).status }
    catch (e) { if ((e as { code?: string }).code === 'MISSING') return 'missing'; throw e }
  }

  /** 연결: 권한 → 계정 행 → 첫 동기화. 실패는 메시지 */
  async connect(): Promise<{ ok: true } | { ok: false; error: string; code: AppleAuth }> {
    let status = await this.auth()
    if (status === 'notDetermined') status = await this.request()
    if (status === 'missing') return { ok: false, error: '캘린더 도우미가 없어요. 앱을 다시 설치해 주세요.', code: status }
    if (status === 'restricted') return { ok: false, error: '이 Mac에서는 캘린더 접근이 제한돼 있어요.', code: status }
    if (status !== 'fullAccess') return { ok: false, error: '캘린더 접근을 허용해야 볼 수 있어요. 시스템 설정 › 개인정보 보호 및 보안 › 캘린더에서 sprout를 켜 주세요.', code: status }
    const first = !this.d.store.upsertAccount(APPLE_ACCOUNT_ID, 'apple', APPLE_LABEL)
    await this.sync(first)
    return { ok: true }
  }

  async sync(first = false): Promise<string | null> {
    const store = this.d.store
    if (!store.account(APPLE_ACCOUNT_ID)) return null
    store.setStatus(APPLE_ACCOUNT_ID, 'syncing')
    const tz = this.d.timeZone()
    store.ensureTimeZone(tz)
    const now = this.d.now?.() ?? new Date()
    const from = cacheFrom(now, tz)
    try {
      const st = await this.auth()
      if (st === 'missing') { store.setStatus(APPLE_ACCOUNT_ID, 'helper_missing', { error: '도우미 없음' }); return st }
      if (st === 'restricted') { store.setStatus(APPLE_ACCOUNT_ID, 'restricted', { error: '제한됨' }); return st }
      if (st !== 'fullAccess') { store.setStatus(APPLE_ACCOUNT_ID, 'denied', { error: '권한 꺼짐' }); return st }
      const { calendars } = (await this.d.run(['calendars'], 20_000)) as { calendars: AppleCalendar[] }
      store.replaceCalendars(APPLE_ACCOUNT_ID, calendars.map((c, i) => ({
        calendar_id: c.id,
        name: c.title,
        color_bg: c.color || '#4E75F2',
        color_fg: '#ffffff',
        access_role: c.allowsModify ? 'owner' : 'reader',
        group_label: c.source || '이 Mac',
        is_primary: false,
        initiallyVisible: first && c.type !== 'birthday', // 16 §11.2: 처음엔 생일만 빼고 전부
        sort: i
      })))
      const visible = store.calendars(APPLE_ACCOUNT_ID).filter((c) => c.visibility === 'show')
      if (visible.length) {
        // 16 §11.3: 6개월 전 ~ 2년 뒤, 1년씩 나눠 묻는다
        const today = floating(now, tz).slice(0, 10)
        const end = addDaysStr(today, 730)
        const events: AppleEvent[] = []
        for (let a = from; a < end; a = addDaysStr(a, 365)) {
          const b = addDaysStr(a, 365) < end ? addDaysStr(a, 365) : end
          const r = (await this.d.run(['events', '--from', new Date(`${a}T00:00:00`).toISOString(), '--to', new Date(`${b}T00:00:00`).toISOString(), '--calendars', visible.map((c) => c.calendar_id).join(',')], 30_000)) as { events: AppleEvent[] }
          events.push(...r.events)
        }
        for (const cal of visible) {
          const seen = new Set<string>()
          const rows = events.filter((e) => e.calendarId === cal.calendar_id).map((e) => mapAppleEvent(e, tz)).filter((r): r is NonNullable<typeof r> => !!r && !seen.has(r.event_id) && !!seen.add(r.event_id))
          store.replaceEvents(APPLE_ACCOUNT_ID, cal.calendar_id, rows)
        }
      }
      store.prune(from)
      store.setStatus(APPLE_ACCOUNT_ID, 'ok', { synced: true, error: null })
      return null
    } catch (e) {
      const a = store.account(APPLE_ACCOUNT_ID)
      store.setStatus(APPLE_ACCOUNT_ID, 'retrying', { error: e instanceof Error ? e.message : String(e), nextRetryAt: Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (a?.fail_count ?? 0)) })
      return 'error'
    }
  }
}
