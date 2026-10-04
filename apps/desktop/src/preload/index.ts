import type { UsageProvider, UsageSnapshot, UsageLogin } from '../shared/usage'
import type { ChatInput } from '../shared/assistant'
import type { TTBundle, TTConnectInput, TTProgress, TTResult, TTStatus } from '../shared/ticktick'
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

type AuthState = { user: { id: string; email: string } | null; sync: { connected: boolean; uploading: boolean; downloading: boolean; lastSyncedAt: string | null; error: string | null } }
type AuthResult = { ok: true; state: AuthState } | { ok: false; error: string }
const authApi = {
  state: () => ipcRenderer.invoke('auth:state') as Promise<AuthState>,
  login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password) as Promise<AuthResult>,
  signup: (email: string, password: string) => ipcRenderer.invoke('auth:signup', email, password) as Promise<AuthResult>,
  logout: () => ipcRenderer.invoke('auth:logout') as Promise<AuthState>,
  syncNow: () => ipcRenderer.invoke('auth:sync-now') as Promise<void>,
  onState: (cb: (s: AuthState) => void) => on('auth:state', cb)
}

const miniApi = {
  toggle: () => ipcRenderer.send('mini:toggle'),
  hide: () => ipcRenderer.send('mini:hide'),
  openTask: (taskId: string) => ipcRenderer.send('mini:open-task', taskId),
  showMain: () => ipcRenderer.send('mini:show-main'),
  quit: () => ipcRenderer.send('mini:quit'),
  onShown: (cb: () => void) => on('mini:shown', cb)
}

const usageApi={read:(provider:UsageProvider,force=false)=>ipcRenderer.invoke('usage:read',provider,force) as Promise<UsageSnapshot>,login:(provider:UsageProvider)=>ipcRenderer.invoke('usage:login:start',provider) as Promise<UsageLogin>,loginStatus:(id:string)=>ipcRenderer.invoke('usage:login:status',id) as Promise<UsageLogin>,submitLoginCode:(id:string,code:string)=>ipcRenderer.invoke('usage:login:code',id,code) as Promise<UsageLogin>,cancelLogin:(id:string)=>ipcRenderer.invoke('usage:login:cancel',id) as Promise<UsageLogin>,disconnect:(accountId:string)=>ipcRenderer.invoke('usage:disconnect',accountId) as Promise<{provider:UsageProvider}>}
export type SproutUsageApi=typeof usageApi
const assistantApi = { onDelta:(cb:(data:{id:string;text:string})=>void)=>on('assistant:delta',cb), models:()=>ipcRenderer.invoke('assistant:models') as Promise<string[]>, chat:(id:string,input:ChatInput)=>ipcRenderer.invoke('assistant:chat',id,input) as Promise<string>, cancel:(id:string)=>ipcRenderer.send('assistant:cancel',id) }
export type SproutAssistantApi = typeof assistantApi
// 17 틱틱에서 가져오기: 연결·토큰은 메인 프로세스에만, 화면은 진행 상황과 결과만 받는다
const ticktickApi = {
  status: () => ipcRenderer.invoke('ticktick:status') as Promise<TTStatus>,
  connect: (input: TTConnectInput) => ipcRenderer.invoke('ticktick:connect', input) as Promise<TTResult<TTStatus>>,
  cancel: () => ipcRenderer.invoke('ticktick:cancel') as Promise<TTStatus>,
  fetch: () => ipcRenderer.invoke('ticktick:fetch') as Promise<TTResult<TTBundle>>,
  disconnect: () => ipcRenderer.invoke('ticktick:disconnect') as Promise<TTStatus>,
  onProgress: (cb: (p: TTProgress) => void) => on('ticktick:progress', cb)
}
export type SproutTickTickApi = typeof ticktickApi
const collectApi = { linkTitle: (url: string) => ipcRenderer.invoke('collect:link-title', url) as Promise<string> }
export type SproutCollectApi = typeof collectApi
const desktopApi = { openSettings: () => ipcRenderer.send('desktop:settings'), onQuickAdd: (cb: () => void) => on('desktop:quick-add', cb) }
contextBridge.exposeInMainWorld('sprout', { platform: process.platform, assistant: assistantApi, collect: collectApi, ticktick: ticktickApi, usage: usageApi, db: dbApi, reminders: remindersApi, desktop: desktopApi, auth: authApi, mini: miniApi })
export type SproutMiniApi = typeof miniApi
export type SproutAuthApi = typeof authApi
export type SproutDesktopApi = typeof desktopApi
export type SproutDbApi = typeof dbApi
export type SproutRemindersApi = typeof remindersApi
