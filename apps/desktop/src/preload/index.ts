import type { AgentInput, AgentToolCall, ChatInput } from '../shared/assistant'
import type { TTBundle, TTConnectInput, TTProgress, TTResult, TTStatus } from '../shared/ticktick'
import type { CalendarsStatus, ConnectProgress, ConnectResult, ExtEvent, Provider, CalendarTarget, CalendarToast, ExtPatch, ExtSnapshot, WriteResult, WriteScope } from '../shared/calendars'
import type { Notice, NoticeInput } from '../shared/notices'
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

type AuthState = { user: { id: string; email: string } | null; newAccount?: boolean; notice?: 'account-deleted'; sync: { connected: boolean; uploading: boolean; downloading: boolean; lastSyncedAt: string | null; error: string | null } }
type SyncNowResult = { ok: true; pending: number; lastSyncedAt: string | null } | { ok: false; reason: 'signed-out' | 'offline' | 'timeout' } | { ok: false; reason: 'error'; message: string }
type AuthResult = { ok: true; state: AuthState } | { ok: false; error: string }
type LinkedIdentity = { provider: 'google' | 'apple'; email: string | null }
type LinkFail = { ok: false; error: string; code: string }
const authApi = {
  state: () => ipcRenderer.invoke('auth:state') as Promise<AuthState>,
  login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password) as Promise<AuthResult>,
  signup: (email: string, password: string) => ipcRenderer.invoke('auth:signup', email, password) as Promise<AuthResult>,
  logout: () => ipcRenderer.invoke('auth:logout') as Promise<AuthState>,
  // 01 §3.2.1: 다시 연결하고 가라앉을 때까지 기다려 결과를 준다
  syncNow: () => ipcRenderer.invoke('auth:sync-now') as Promise<SyncNowResult>,
  // 08 §3.1 구글·애플로 계속하기 (토큰은 메인 프로세스에만)
  social: (provider: 'google' | 'apple') => ipcRenderer.invoke('auth:social', provider) as Promise<AuthResult | { ok: false; error: string; code: string }>,
  socialCancel: () => ipcRenderer.invoke('auth:social-cancel') as Promise<void>,
  socialStatus: () => ipcRenderer.invoke('auth:social-status') as Promise<{ google: boolean; apple: boolean | null; waiting: 'google' | 'apple' | null }>,
  onState: (cb: (s: AuthState) => void) => on('auth:state', cb),
  // 08 §7.1 계정 삭제: 다시 확인 방법 고르기 → (소셜이면 reauthBegin 후 social로 다시 로그인) → 삭제
  account: () => ipcRenderer.invoke('auth:account') as Promise<{ ok: true; hasPassword: boolean; providers: string[] } | { ok: false; error: string }>,
  reauthBegin: () => ipcRenderer.invoke('auth:reauth-begin') as Promise<void>,
  reauthEnd: () => ipcRenderer.invoke('auth:reauth-end') as Promise<void>,
  deleteAccount: (password?: string) => ipcRenderer.invoke('auth:delete-account', password) as Promise<{ ok: true } | { ok: false; error: string; status: number }>,
  // 08 §3.1.1 로그인 방법 연결(설정 › 계정): 브라우저 흐름은 로그인과 같고, 토큰은 메인 프로세스에만
  loginMethods: () => ipcRenderer.invoke('auth:login-methods') as Promise<{ ok: true; hasPassword: boolean; identities: LinkedIdentity[] } | LinkFail>,
  link: (provider: 'google' | 'apple') => ipcRenderer.invoke('auth:link', provider) as Promise<{ ok: true; linked: boolean; identities: LinkedIdentity[] } | LinkFail>,
  unlink: (provider: 'google' | 'apple') => ipcRenderer.invoke('auth:unlink', provider) as Promise<{ ok: true; linked: boolean; identities: LinkedIdentity[] } | LinkFail>
}

// 01 §3.3 레일 종 알림 패널: 기록은 메인 프로세스(userData/notices.json)
const noticesApi = {
  list: () => ipcRenderer.invoke('notices:list') as Promise<Notice[]>,
  add: (input: NoticeInput) => ipcRenderer.invoke('notices:add', input) as Promise<void>,
  read: (id?: string) => ipcRenderer.invoke('notices:read', id) as Promise<void>,
  undone: (id: string) => ipcRenderer.invoke('notices:undone', id) as Promise<void>,
  onChanged: (cb: (items: Notice[]) => void) => on('notices:changed', cb)
}
export type SproutNoticesApi = typeof noticesApi

const miniApi = {
  toggle: () => ipcRenderer.send('mini:toggle'),
  hide: () => ipcRenderer.send('mini:hide'),
  openTask: (taskId: string) => ipcRenderer.send('mini:open-task', taskId),
  showMain: () => ipcRenderer.send('mini:show-main'),
  quit: () => ipcRenderer.send('mini:quit'),
  onShown: (cb: () => void) => on('mini:shown', cb)
}

const assistantApi = { onDelta:(cb:(data:{id:string;text:string})=>void)=>on('assistant:delta',cb), models:()=>ipcRenderer.invoke('assistant:models') as Promise<string[]>, chat:(id:string,input:ChatInput)=>ipcRenderer.invoke('assistant:chat',id,input) as Promise<string>, cancel:(id:string)=>ipcRenderer.send('assistant:cancel',id), daily:(key:string)=>ipcRenderer.invoke('assistant:daily',key) as Promise<{used:number;limit:number}|null>, features:()=>ipcRenderer.invoke('assistant:features') as Promise<{agent:boolean;daily:{used:number;limit:number}|null}>, agent:(id:string,input:AgentInput&{model?:string;call?:number})=>ipcRenderer.invoke('assistant:agent',id,input) as Promise<{content:string;tool_calls:AgentToolCall[];prompt_tokens?:number}>, ground:(hits:number)=>ipcRenderer.send('assistant:ground',hits) }
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
// 16 캘린더 연동(구글·Apple): 토큰은 메인 프로세스에만, 화면은 상태·범위 일정·쓰기 결과만 받는다
const calendarsApi = {
  status: () => ipcRenderer.invoke('calendars:status') as Promise<CalendarsStatus>,
  connect: (provider: Provider) => ipcRenderer.invoke('calendars:connect', provider) as Promise<ConnectResult>,
  cancel: () => ipcRenderer.invoke('calendars:cancel') as Promise<void>,
  reopen: () => ipcRenderer.invoke('calendars:reopen') as Promise<void>,
  events: (from: string, to: string, opts?: { panel?: boolean; accountId?: string }) => ipcRenderer.invoke('calendars:events', from, to, opts) as Promise<ExtEvent[]>,
  counts: () => ipcRenderer.invoke('calendars:counts') as Promise<Record<string, number>>,
  setVisibility: (accountId: string, changes: { calendarId: string; visibility: 'show' | 'hide' }[]) => ipcRenderer.invoke('calendars:setVisibility', accountId, changes) as Promise<void>,
  setPanel: (accountId: string | null, calendarId: string | null, on: boolean) => ipcRenderer.invoke('calendars:setPanel', accountId, calendarId, on) as Promise<void>,
  refresh: (accountId?: string, force?: boolean) => ipcRenderer.invoke('calendars:refresh', accountId, force) as Promise<void>,
  disconnect: (accountId: string) => ipcRenderer.invoke('calendars:disconnect', accountId) as Promise<void>,
  open: (accountId: string, calendarId: string, eventId: string) => ipcRenderer.invoke('calendars:open', accountId, calendarId, eventId) as Promise<void>,
  openPrivacy: () => ipcRenderer.invoke('calendars:openPrivacy') as Promise<void>,
  onChanged: (cb: () => void) => on('calendars:changed', cb),
  onProgress: (cb: (p: ConnectProgress) => void) => on('calendars:progress', cb),
  // 16 §12 양방향
  targets: () => ipcRenderer.invoke('calendars:targets') as Promise<CalendarTarget[]>,
  grantWrite: (accountId: string) => ipcRenderer.invoke('calendars:grantWrite', accountId) as Promise<ConnectResult>,
  event: (key: string) => ipcRenderer.invoke('calendars:event', key) as Promise<ExtEvent | null>,
  update: (key: string, patch: ExtPatch, opts?: { scope?: WriteScope; notify?: boolean }) => ipcRenderer.invoke('calendars:update', key, patch, opts) as Promise<WriteResult>,
  remove: (key: string, opts?: { scope?: WriteScope; notify?: boolean }) => ipcRenderer.invoke('calendars:delete', key, opts) as Promise<WriteResult>,
  restore: (snap: ExtSnapshot) => ipcRenderer.invoke('calendars:restore', snap) as Promise<WriteResult>,
  onToast: (cb: (t: CalendarToast) => void) => on('calendars:toast', cb)
}
export type SproutCalendarsApi = typeof calendarsApi
const collectApi = { linkTitle: (url: string) => ipcRenderer.invoke('collect:link-title', url) as Promise<string>, linkPage: (url: string) => ipcRenderer.invoke('collect:link-page', url) as Promise<import('@sprout/schema/linkSummary').LinkPage | null> }
export type SproutCollectApi = typeof collectApi
const desktopApi = {
  openSettings: () => ipcRenderer.send('desktop:settings'),
  onQuickAdd: (cb: () => void) => on('desktop:quick-add', cb),
  // 25 §14·§15: 위젯 딥 링크(sprout://today·growth·calendar/<날짜>·event/<id>) → 다시 불러오지 않고 레일 보기·목록만 바꾼다
  onNavigate: (cb: (to: { view: string; selected?: string; mode?: string; task?: string; date?: string; event?: string }) => void) => on('desktop:navigate', cb),
  // 25 §14: 메인 프로세스(위젯 체크)가 준 XP → 앱 안 완료와 같은 "+1"
  onXp: (cb: (amount: number) => void) => on('growth:xp', cb),
  // 25 D4·§14: 설정 › 일반 "로그인할 때 sprout 열기"(패키지 앱만 바꿀 수 있다)
  loginItem: () => ipcRenderer.invoke('desktop:login-item') as Promise<{ available: boolean; openAtLogin: boolean }>,
  setLoginItem: (open: boolean) => ipcRenderer.invoke('desktop:set-login-item', open) as Promise<{ available: boolean; openAtLogin: boolean }>
}
contextBridge.exposeInMainWorld('sprout', { platform: process.platform, calendars: calendarsApi, assistant: assistantApi, collect: collectApi, ticktick: ticktickApi, db: dbApi, reminders: remindersApi, notices: noticesApi, desktop: desktopApi, auth: authApi, mini: miniApi })
export type SproutMiniApi = typeof miniApi
export type SproutAuthApi = typeof authApi
export type SproutDesktopApi = typeof desktopApi
export type SproutDbApi = typeof dbApi
export type SproutRemindersApi = typeof remindersApi
