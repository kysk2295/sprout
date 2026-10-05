import './profile'
import { registerAssistant } from './assistant'
import { registerCollect } from './collect'
import { registerTickTick } from './ticktick'
import { registerCalendars } from './calendars'
import { app, BrowserWindow, shell, ipcMain, globalShortcut } from 'electron'
import { join } from 'node:path'
import { db } from './db'
import { registerDbIpc } from './ipc'
import { ensureSeed } from './seed'
import { startReminders } from './reminders'
import { registerNotices } from './notices'
import { isSignedIn, startSync } from './sync'
import { handleAuthLink, registerSocialAuth } from './auth-social'
import { hasTray, startMini } from './mini'
import { ensureLoginItemDefault, registerLoginItemIpc, startWidget } from './widget'

// 01-app-shell §2 창: 최소 800×560, Mac은 제목 표시줄을 숨기고 신호등이 레일 위에 놓인다.
let mainWindow: BrowserWindow | undefined
let settingsWindow: BrowserWindow | undefined
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return }
  settingsWindow = new BrowserWindow({ width:800,height:680,minWidth:700,minHeight:560,title:'설정',backgroundColor:'#ffffff',webPreferences:{preload:join(__dirname,'../preload/index.js'),sandbox:false} })
  settingsWindow.on('closed',()=>{settingsWindow=undefined})
  if(process.env.ELECTRON_RENDERER_URL) settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=settings`)
  else settingsWindow.loadFile(join(__dirname,'../renderer/index.html'),{query:{window:'settings'}})
}
function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    backgroundColor: '#FFFFFF',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 10, y: 10 } } // 틱틱 8.0 실측: 빨강 중심 (15, 16)pt
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#7D7D7D', height: 40 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow = win
  win.on('closed', () => { mainWindow = undefined })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

// 한 번에 앱 하나만(같은 데이터 폴더에 앱 둘이 붙으면 DB·로그인이 섞인다 — 2026-10-05 실제로 겪음).
// 프로필(SPROUT_PROFILE)마다 데이터 폴더가 달라 잠금도 따로라 E2E 동시 실행은 그대로 된다
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

// sprout:// 링크(25 맥 위젯·17 등): sprout://task/<id> → 그 할 일 상세, 그 밖 → 앱만 앞으로
let linkReady = false
const pendingLinks: string[] = []
async function openLink(url: string) {
  if (!linkReady) { pendingLinks.push(url); return }
  const win = await getWindow()
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
  if (url.startsWith('sprout://auth/')) { handleAuthLink(url); return } // 08 §3.1 애플 로그인에서 돌아옴
  const task = /^sprout:\/\/task\/([\w-]{1,100})\/?$/.exec(url)
  let m: RegExpExecArray | null
  if (task) win.webContents.send('reminder:open', task[1]) // 알림·미니 창과 같은 "할 일 열기" 통로
  else if (/^sprout:\/\/quick-add\/?$/.test(url)) win.webContents.send('desktop:quick-add') // 25 위젯 `+` = ⌃⇧A와 같은 빠른 추가
  else if (/^sprout:\/\/growth\/?$/.test(url)) showView(win, 'growth') // 25 캐릭터 위젯
  else if (/^sprout:\/\/today\/?$/.test(url)) showView(win, 'tasks', 'smart:today') // 25 오늘 할 일 위젯 머리·"+N개 더"
  else if ((m = /^sprout:\/\/calendar(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(url))) win.webContents.send('desktop:navigate', m[1] ? { view: 'calendar', date: m[1] } : { view: 'calendar' }) // 25 §15 월 캘린더 위젯 날짜 칸
  else if ((m = /^sprout:\/\/event\/([\w-]{1,100})\/?$/.exec(url))) win.webContents.send('desktop:navigate', { view: 'calendar', event: m[1] }) // 25 §15 내 일정 막대
  else if (/^sprout:\/\/map\/?(\?.*)?$/.test(url)) { // 31 §10.4 sprout://map?mode=plan|review|tidy&task=<id>
    const q = new URLSearchParams(url.split('?')[1] ?? '')
    const mode = q.get('mode'); const task = q.get('task')
    win.webContents.send('desktop:navigate', { view: 'map', ...(mode && /^(plan|review|tidy)$/.test(mode) ? { mode } : {}), ...(task && /^[\w-]{1,100}$/.test(task) ? { task } : {}) })
  }
}
/** 레일 보기 전환(25 §14): 렌더러가 `desktop:navigate`를 받아 보기·목록만 바꾼다(다시 불러오지 않아 깜빡이지 않음) */
function showView(win: BrowserWindow, view: string, selected?: string) {
  win.webContents.send('desktop:navigate', selected ? { view, selected } : { view })
}
app.on('open-url', (e, url) => { e.preventDefault(); void openLink(url) }) // 첫 실행 링크도 받게 whenReady 전에 등록
app.on('second-instance', (_e, argv) => { void openLink(argv.find((a) => a.startsWith('sprout://')) ?? 'sprout://') })
if (!process.defaultApp) app.setAsDefaultProtocolClient('sprout') // 개발 실행(electron .)은 등록하지 않는다

/** 알림을 눌렀을 때: 창이 없으면 새로 열고 화면이 뜰 때까지 기다린다 */
async function getWindow(): Promise<BrowserWindow> {
  const existing = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
  if (existing) return existing
  const win = createWindow()
  await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
  return win
}

app.whenReady().then(async () => {
  if (!gotLock) return
  await db.init()
  await startSync()
  // 로그인한 기기는 서버 데이터를 내려받으므로 시드를 넣지 않는다(기본함이 두 개 생기지 않게)
  if (!isSignedIn()) await ensureSeed(process.env.SPROUT_SEED !== '0' && (!app.isPackaged || process.env.SPROUT_SEED === '1'))
  registerDbIpc()
  registerAssistant()
  registerCollect()
  registerTickTick()
  registerCalendars() // 16 캘린더 연동(구글·Apple 읽기)
  registerSocialAuth() // 08 §3.1 구글·애플로 계속하기
  registerNotices() // 01 §3.3 레일 종 알림 패널
  ipcMain.on('desktop:settings', openSettings)
  createWindow()
  startReminders(getWindow)
  // 09 메뉴바 미니 창 + 메인 창 단축키(⇧⌘E). 메인 창을 닫아도 메뉴 막대에 남는다
  const showMain = async () => { const win = await getWindow(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); return win }
  startMini(async (taskId) => { const win = await showMain(); win.webContents.send('reminder:open', taskId) }, () => void showMain())
  linkReady = true
  for (const url of pendingLinks.splice(0)) void openLink(url)
  startWidget({ isSignedIn }) // 25 맥 위젯: 저장 파일·체크 대기열·새로 고침
  ensureLoginItemDefault() // 25 D4: 로그인할 때 sprout 열기(기본 켬)
  registerLoginItemIpc() // 설정 › 일반 토글
  globalShortcut.register(process.platform === 'darwin' ? 'Shift+Command+E' : 'Alt+Shift+E', () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    if (win?.isVisible() && win.isFocused()) win.hide()
    else void showMain()
  })
  const shortcut = process.platform === 'darwin' ? 'Control+Shift+A' : 'Alt+Shift+A'
  if (!globalShortcut.register(shortcut, async () => { const win = await getWindow(); if(win.isMinimized())win.restore();win.show();win.focus();win.webContents.send('desktop:quick-add') })) console.warn('[shortcuts] Quick add shortcut unavailable')
  app.on('activate', () => {
    if (!mainWindow) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 트레이가 있으면(Windows) 창을 다 닫아도 계속 돈다. Mac은 원래 메뉴 막대·Dock에 남는다
  if (process.platform !== 'darwin' && !hasTray()) app.quit()
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  void db.close()
})
