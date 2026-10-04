// 로컬 알림 예약 계획(20 §4.4, 03 §7) — 어떤 알림을 언제 OS에 맡길지 계산하는 순수 함수.
// 규칙: 앞으로 48시간 안, 가까운 것부터 최대 50개(iOS 대기 알림 한도 64 아래). 시각 계산은 공용 reminderFireTime().
// 순수 모듈(시험: plan.test.ts). OS 호출은 schedule.ts.
import { datePart, formatTimeKo, hasTime, reminderFireTime, timePart } from '@sprout/schema/time'

export const HORIZON_MS = 48 * 3600_000
export const MAX_SCHEDULED = 50
/** 알림 동작(카테고리 sprout-task) — 시안 J: 완료 · 10분 뒤 · 1시간 뒤 · 내일 */
export const CATEGORY = 'sprout-task'
export const ACTION_DONE = 'done'
export const SNOOZE_ACTIONS: { id: string; label: string; minutes: number }[] = [
  { id: 'snooze-10', label: '10분 뒤 다시 알림', minutes: 10 },
  { id: 'snooze-60', label: '1시간 뒤 다시 알림', minutes: 60 },
  { id: 'snooze-tomorrow', label: '내일 다시 알림', minutes: 24 * 60 }
]

export type ReminderRow = {
  rid: string
  trigger: string
  tid: string
  title: string | null
  start_at: string | null
  due_at: string | null
  list_name: string | null
  list_kind: string | null
}
export type Planned = { id: string; taskId: string; at: number; title: string; body: string }

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** 본문 "오늘 오후 3:00 · 업무" — 날짜는 알림이 울리는 날 기준(오늘·내일·M월 D일) */
export function bodyOf(row: Pick<ReminderRow, 'start_at' | 'due_at' | 'list_name' | 'list_kind'>, fireAt: number): string {
  const start = row.start_at ?? row.due_at
  if (!start) return ''
  const day = datePart(start)
  const fireDay = dayOf(fireAt)
  const diff = Math.round((new Date(`${day}T00:00`).getTime() - new Date(`${fireDay}T00:00`).getTime()) / 86400000)
  const d = new Date(`${day}T00:00`)
  const head = diff === 0 ? '오늘' : diff === 1 ? '내일' : `${d.getMonth() + 1}월 ${d.getDate()}일`
  const time = hasTime(start) ? ` ${formatTimeKo(timePart(start)!)}` : ''
  const list = row.list_kind === 'inbox' ? '기본함' : row.list_name
  return `${head}${time}${list ? ` · ${list}` : ''}`
}

/** 알림 식별자: 같은 알림·같은 시각이면 같은 id → 다시 계산해도 바뀐 것만 예약을 고친다 */
export const reminderId = (rid: string, at: number) => `r:${rid}@${at}`
export const snoozeId = (taskId: string, at: number) => `s:${taskId}@${at}`
export const isReminderId = (id: string) => id.startsWith('r:')
export const isSnoozeId = (id: string) => id.startsWith('s:')

export function planReminders(rows: ReminderRow[], now: number, opts: { horizonMs?: number; max?: number } = {}): Planned[] {
  const horizon = now + (opts.horizonMs ?? HORIZON_MS)
  const seen = new Set<string>()
  const out: Planned[] = []
  for (const r of rows) {
    if (!r.due_at) continue
    const at = reminderFireTime(r, r.trigger)?.getTime()
    if (at === undefined || Number.isNaN(at) || at <= now || at > horizon) continue
    // 한 할 일의 두 알림이 같은 순간이면 하나만
    const dedupe = `${r.tid}@${at}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({ id: reminderId(r.rid, at), taskId: r.tid, at, title: r.title?.trim() || '제목 없음', body: bodyOf(r, at) })
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, opts.max ?? MAX_SCHEDULED)
}

/** 지금 예약된 것과 새 계획의 차이: 지울 id, 새로 넣을 것(제목·본문·시각이 바뀌면 다시 넣는다) */
export function diffSchedule(
  pending: { id: string; title?: string | null; body?: string | null }[],
  planned: Planned[]
): { cancel: string[]; add: Planned[] } {
  const want = new Map(planned.map((p) => [p.id, p]))
  const have = new Map(pending.filter((p) => isReminderId(p.id)).map((p) => [p.id, p]))
  const cancel: string[] = []
  for (const [id, p] of have) {
    const w = want.get(id)
    if (!w || w.title !== p.title || w.body !== p.body) cancel.push(id)
  }
  const add = planned.filter((p) => !have.has(p.id) || cancel.includes(p.id))
  return { cancel, add }
}

/** 다시 알림 시각 */
export const snoozeAt = (minutes: number, now: number) => now + minutes * 60_000
/** 다시 알림 중 사라진(완료·휴지통·삭제) 할 일 것은 지운다 */
export const staleSnoozes = (pending: { id: string; taskId?: string }[], openTaskIds: Set<string>) =>
  pending.filter((p) => isSnoozeId(p.id) && (!p.taskId || !openTaskIds.has(p.taskId))).map((p) => p.id)
