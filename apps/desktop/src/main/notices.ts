// 01 §3.3 알림 패널: 이 기기의 앱 알림 기록(서버 없음). userData/notices.json에 두고, 바뀌면 모든 창에 'notices:changed'.
// 메인(reminders.ts)은 addNotice를 바로 부르고, 화면(레벨업·주간 리포트·AI 태그·자동 프로젝트)은 'notices:add'로 넣는다.
import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { markRead, markUndone, mergeNotice, prune, type Notice, type NoticeInput } from '../shared/notices'

const file = () => join(app.getPath('userData'), 'notices.json')
let items: Notice[] | undefined

function list(): Notice[] {
  if (!items) {
    try { items = prune(JSON.parse(readFileSync(file(), 'utf8')).items ?? [], new Date().toISOString()) } catch { items = [] }
  }
  return items
}
function set(next: Notice[]) {
  if (next === items) return
  items = next
  try { writeFileSync(file(), JSON.stringify({ items: next })) } catch (e) { console.error('[notices] save failed', e) }
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('notices:changed', next)
}

export function addNotice(input: NoticeInput) {
  set(mergeNotice(list(), input, new Date().toISOString(), randomUUID()))
}

/** 로그아웃·계정 삭제: 할 일 제목이 다음 사람에게 남지 않게 */
export function clearNotices() {
  items = []
  if (existsSync(file())) rmSync(file())
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('notices:changed', [])
}

export function registerNotices() {
  ipcMain.handle('notices:list', () => list())
  ipcMain.handle('notices:add', (_e, input: NoticeInput) => { if (input && typeof input.key === 'string' && typeof input.title === 'string') addNotice(input) })
  ipcMain.handle('notices:read', (_e, id?: string) => set(markRead(list(), typeof id === 'string' ? id : undefined)))
  ipcMain.handle('notices:undone', (_e, id: string) => set(markUndone(list(), id)))
}
