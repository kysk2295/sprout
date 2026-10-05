// 09 메뉴바 미니 창: 메뉴 막대(Windows 트레이) 아이콘 → 아이콘 아래 패널. ⇧⌘O / Alt+Shift+O로 열고 닫는다.
import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'

const SIZE = { width: 340, height: 560 } // 09 §2 [임시]
let tray: Tray | undefined
let mini: BrowserWindow | undefined

// macOS: 검은 템플릿 이미지(@2x·@3x는 같은 폴더에서 자동으로 고른다). Windows: 템플릿이 없어 색 있는 tray.ico
const trayFile = () => (process.platform === 'win32' ? 'tray.ico' : 'trayTemplate.png')
const iconPath = () => (app.isPackaged ? join(process.resourcesPath, trayFile()) : join(app.getAppPath(), 'resources', trayFile()))

function createMini(): BrowserWindow {
  const win = new BrowserWindow({
    ...SIZE,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: true,
    backgroundColor: '#00000000',
    transparent: process.platform === 'darwin',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('blur', () => { if (!win.webContents.isDevToolsOpened()) win.hide() }) // 밖을 누르면 닫힌다
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=mini`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query: { window: 'mini' } })
  return win
}

/** 아이콘 바로 아래(아이콘이 화면 아래에 있으면 위)에 패널을 놓는다 */
function place(win: BrowserWindow) {
  const b = tray?.getBounds()
  const area = screen.getDisplayNearestPoint(b ? { x: b.x, y: b.y } : screen.getCursorScreenPoint()).workArea
  if (!b || (b.width === 0 && b.height === 0)) {
    win.setPosition(Math.round(area.x + area.width - SIZE.width - 12), Math.round(area.y + 8))
    return
  }
  const x = Math.min(Math.max(Math.round(b.x + b.width / 2 - SIZE.width / 2), area.x + 4), area.x + area.width - SIZE.width - 4)
  const below = b.y < area.y + area.height / 2
  const y = below ? Math.round(b.y + b.height + 4) : Math.round(b.y - SIZE.height - 4)
  win.setPosition(x, y)
}

export function toggleMini() {
  if (!mini || mini.isDestroyed()) mini = createMini()
  if (mini.isVisible()) { mini.hide(); return }
  place(mini)
  mini.show()
  mini.focus()
  mini.webContents.send('mini:shown')
}

export const hasTray = () => !!tray

export function startMini(openTask: (taskId: string) => void, showMain: () => void) {
  const icon = nativeImage.createFromPath(iconPath())
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('sprout')
  tray.on('click', toggleMini)
  tray.on('right-click', toggleMini)

  const shortcut = process.platform === 'darwin' ? 'Shift+Command+O' : 'Alt+Shift+O'
  if (!globalShortcut.register(shortcut, toggleMini)) console.warn('[mini] shortcut unavailable')

  ipcMain.on('mini:toggle', toggleMini)
  ipcMain.on('mini:hide', () => mini?.hide())
  ipcMain.on('mini:open-task', (_e, taskId: string) => { mini?.hide(); openTask(taskId) })
  ipcMain.on('mini:show-main', () => { mini?.hide(); showMain() })
  ipcMain.on('mini:quit', () => app.quit())
}
