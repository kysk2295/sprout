import { contextBridge, ipcRenderer } from 'electron'

type Row = Record<string, unknown>

const dbApi = {
  getAll: <T = Row>(sql: string, params: unknown[] = []) => ipcRenderer.invoke('db:getAll', sql, params) as Promise<T[]>,
  get: <T = Row>(sql: string, params: unknown[] = []) => ipcRenderer.invoke('db:get', sql, params) as Promise<T | null>,
  transaction: (stmts: { sql: string; params?: unknown[] }[]) => ipcRenderer.invoke('db:transaction', stmts) as Promise<void>,
  /** 쿼리 결과가 바뀔 때마다 onRows가 불린다. 반환 함수를 부르면 감시를 멈춘다. */
  watch: (sql: string, params: unknown[], onRows: (rows: Row[]) => void, onError?: (e: string) => void) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = (e) => (e.data.error ? onError?.(e.data.error) : onRows(e.data.rows))
    ipcRenderer.postMessage('db:watch', { sql, params }, [channel.port2])
    return () => channel.port1.close()
  }
}

// 03 §7 알림: 메인 프로세스가 울리고, 화면은 열기·완료·앱 안 카드를 맡는다
type Fired = { key: string; taskId: string; title: string; body: string }
const on = <T>(channel: string, cb: (payload: T) => void) => {
  const listener = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return (): void => { ipcRenderer.removeListener(channel, listener) }
}
const remindersApi = {
  onOpen: (cb: (taskId: string) => void) => on('reminder:open', cb),
  onComplete: (cb: (taskId: string) => void) => on('reminder:complete', cb),
  onFired: (cb: (f: Fired) => void) => on('reminder:fired', cb),
  snooze: (fired: Fired, minutes: number) => ipcRenderer.send('reminder:snooze', { fired, minutes })
}

const desktopApi = { openSettings: () => ipcRenderer.send('desktop:settings'), onQuickAdd: (cb: () => void) => on('desktop:quick-add', cb) }
contextBridge.exposeInMainWorld('sprout', { platform: process.platform, db: dbApi, reminders: remindersApi, desktop: desktopApi })
export type SproutDesktopApi = typeof desktopApi
export type SproutDbApi = typeof dbApi
export type SproutRemindersApi = typeof remindersApi
