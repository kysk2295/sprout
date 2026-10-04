import { app, BrowserWindow, Notification, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { reminderFireTime } from '@sprout/schema/time'
import { db } from './db'

// 03-date-picker §7 알림: 기기에서 예약한다(로컬 퍼스트, 서버 푸시 없음).
// 로컬 DB를 watch해서 앞으로 48시간 안의 알림을 예약하고, 값이 바뀌면(다른 기기에서 동기화된 변경 포함) 다시 계산한다.
const HORIZON_MS = 48 * 3600_000
const MISSED_MS = 3600_000 // 앱이 꺼져 있는 동안 지나간 알림은 지난 1시간 것만 띄운다
const SNOOZE: [string, number][] = [['5분 후', 5], ['15분 후', 15], ['30분 후', 30], ['1시간 후', 60], ['내일', 24 * 60]]

type Item = { rid: string; trigger: string; tid: string; title: string; start_at: string | null; due_at: string; list_name: string | null }
type Fired = { key: string; taskId: string; title: string; body: string }
type State = { fired: string[]; snoozes: { key: string; taskId: string; title: string; body: string; at: number }[] }

const statePath = () => join(app.getPath('userData'), 'reminder-state.json')
let state: State = { fired: [], snoozes: [] }
const timers = new Map<string, NodeJS.Timeout>()
let rows: Item[] = []
const live = new Set<Notification>() // 알림 객체가 GC되면 클릭이 안 오므로 붙잡아 둔다

function load() {
  try { state = { fired: [], snoozes: [], ...JSON.parse(readFileSync(statePath(), 'utf8')) } } catch { /* 처음 실행 */ }
}
function save() {
  state.fired = state.fired.slice(-500)
  try { writeFileSync(statePath(), JSON.stringify(state)) } catch (e) { console.error('[reminders] save failed', e) }
}

function bodyOf(it: Item): string {
  const start = it.start_at ?? it.due_at
  const time = start.includes('T') ? ` ${start.slice(11, 16)}` : ''
  const d = new Date(start.includes('T') ? start : `${start}T00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일${time}${it.list_name ? ` · ${it.list_name}` : ''}`
}

type WindowGetter = () => Promise<BrowserWindow>
let getWindow: WindowGetter

async function send(channel: string, payload: unknown) {
  const win = await getWindow()
  win.webContents.send(channel, payload)
  return win
}

function fire(f: Fired) {
  if (!state.fired.includes(f.key)) state.fired.push(f.key)
  save()
  const win = BrowserWindow.getAllWindows()[0]
  // 앱이 앞에 있으면 앱 안 팝업 카드도 함께(03 §7)
  if (win?.isFocused()) win.webContents.send('reminder:fired', f)
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: f.title || '제목 없음',
    body: f.body,
    // macOS: 첫 버튼은 그대로, 나머지는 드롭다운으로 묶인다
    actions: [{ type: 'button', text: '완료' }, ...SNOOZE.map(([text]) => ({ type: 'button' as const, text }))]
  })
  live.add(n)
  n.on('click', async () => {
    const w = await send('reminder:open', f.taskId)
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  })
  n.on('action', (_e, index) => {
    if (index === 0) void send('reminder:complete', f.taskId)
    else snooze(f, SNOOZE[index - 1][1])
  })
  n.on('close', () => live.delete(n))
  n.show()
}

function snooze(f: Fired, minutes: number) {
  const at = Date.now() + minutes * 60_000
  state.snoozes.push({ key: `snooze:${f.key}:${at}`, taskId: f.taskId, title: f.title, body: f.body, at })
  save()
  reschedule()
}

function arm(key: string, at: number, f: Fired) {
  const ms = at - Date.now()
  if (ms > HORIZON_MS) return
  timers.set(key, setTimeout(() => fire(f), Math.max(0, ms)))
}

function reschedule() {
  timers.forEach(clearTimeout)
  timers.clear()
  const now = Date.now()
  for (const it of rows) {
    const at = reminderFireTime(it, it.trigger)?.getTime()
    if (at === undefined) continue
    const key = `${it.rid}@${it.trigger}@${it.start_at ?? ''}@${it.due_at}`
    if (state.fired.includes(key)) continue
    if (at < now - MISSED_MS) continue
    arm(key, at, { key, taskId: it.tid, title: it.title, body: bodyOf(it) })
  }
  // 완료·휴지통으로 사라진 태스크의 다시 알림은 버린다
  const liveTasks = new Set(rows.map((r) => r.tid))
  const before = state.snoozes.length
  state.snoozes = state.snoozes.filter((s) => liveTasks.has(s.taskId) && s.at > now - MISSED_MS && !state.fired.includes(s.key))
  for (const s of state.snoozes) arm(s.key, s.at, { key: s.key, taskId: s.taskId, title: s.title, body: s.body })
  if (state.snoozes.length !== before) save()
}

export function startReminders(windowGetter: WindowGetter) {
  getWindow = windowGetter
  load()
  db.watchWithCallback(
    `SELECT r.id AS rid, r.trigger, t.id AS tid, t.title, t.start_at, t.due_at, l.name AS list_name
     FROM reminders r JOIN tasks t ON t.id = r.task_id LEFT JOIN lists l ON l.id = t.list_id
     WHERE t.status = 0 AND t.deleted_at IS NULL AND t.due_at IS NOT NULL`,
    [],
    {
      onResult: (r) => {
        rows = (r.rows?._array ?? []) as Item[]
        reschedule()
      },
      onError: (e) => console.error('[reminders] watch failed', e)
    }
  )
  // 48시간 창 안으로 들어오는 알림을 잡기 위해 30분마다 다시 계산
  setInterval(reschedule, 30 * 60_000)
  // 앱 안 팝업 카드의 다시 알림
  ipcMain.on('reminder:snooze', (_e, payload: { fired: Fired; minutes: number }) => snooze(payload.fired, payload.minutes))
}
