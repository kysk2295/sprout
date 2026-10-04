import { app, BrowserWindow, shell, ipcMain, globalShortcut } from 'electron'
import { join } from 'node:path'
import { db } from './db'
import { registerDbIpc } from './ipc'
import { ensureSeed } from './seed'
import { startReminders } from './reminders'

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

/** 알림을 눌렀을 때: 창이 없으면 새로 열고 화면이 뜰 때까지 기다린다 */
async function getWindow(): Promise<BrowserWindow> {
  const existing = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
  if (existing) return existing
  const win = createWindow()
  await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
  return win
}

app.whenReady().then(async () => {
  await db.init()
  await ensureSeed(!app.isPackaged || process.env.SPROUT_SEED === '1')
  registerDbIpc()
  ipcMain.on('desktop:settings', openSettings)
  createWindow()
  startReminders(getWindow)
  const shortcut = process.platform === 'darwin' ? 'Control+Shift+A' : 'Alt+Shift+A'
  if (!globalShortcut.register(shortcut, async () => { const win = await getWindow(); if(win.isMinimized())win.restore();win.show();win.focus();win.webContents.send('desktop:quick-add') })) console.warn('[shortcuts] Quick add shortcut unavailable')
  app.on('activate', () => {
    if (!mainWindow) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  void db.close()
})
