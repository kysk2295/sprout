// 25 맥 위젯 — 메인 프로세스 쪽(§7·§8): ① 저장 파일(snapshot.json) 쓰기 ② 위젯 새로 고침 요청 ③ 위젯 체크 대기열 반영 ④ 로그아웃 정리
// 저장 칸: ~/Library/Group Containers/<팀ID>.app.sprout.desktop/widget/ (위젯 확장과 같이 쓰는 App Group)
//
// 켜지는 조건: macOS + 패키지 앱 + 기본 프로필. 개발 실행·SPROUT_PROFILE 실행은 끈다(저장 칸은 기기에 하나라 시험 계정이
// 실제 위젯을 덮어쓰지 않게). SPROUT_WIDGET=1이면 강제로 켜고, SPROUT_WIDGET=0이면 끈다.
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { planCompleteWithXp, planReopenWithXp, type CoreDb } from '@sprout/schema/taskCore'
import { db } from './db'
import { actionTooOld, buildSnapshot, MAX_APPLIED, parseAction, snapshotKey, type WidgetAction, type WidgetSnapshot } from './widgetSnapshot'
import { bakeArt } from './widgetArt'
import type { Species } from '@sprout/schema/growth'
import { onCalendarsChanged, panelEvents } from './calendars'

/** App Group 이름 = 팀 ID + 번들 ID. 팀 ID는 서명 인증서의 OU(지금 개발 인증서: BU697KN34B).
 *  같은 값이 build/entitlements.mac.plist, native/widget/SproutWidget/SproutWidget.entitlements, native/widget/build.sh에 있다 */
export const WIDGET_TEAM_ID = 'BU697KN34B'
export const WIDGET_GROUP_ID = `${WIDGET_TEAM_ID}.app.sprout.desktop`
const DEBOUNCE_MS = 800 // §7: 0.8초 모아서
const RELOAD_GAP_MS = 10_000 // §7: 새로 고침 요청은 최소 10초 간격 [임시]

// 공개 내려받기 빌드(ad-hoc 서명, 위젯 확장 없음 — docs/release/desktop-download.md)는 App Group을 검증받지 못해
// 저장 칸(Group Containers)을 건드리면 macOS 15+가 "다른 앱의 데이터에 접근" 확인 창을 띄운다 → 확장이 들어 있을 때만 켠다.
const hasWidgetExtension = () => existsSync(join(process.resourcesPath, '..', 'PlugIns', 'SproutWidget.appex'))
export const widgetEnabled = () =>
  process.platform === 'darwin' && process.env.SPROUT_WIDGET !== '0' &&
  (process.env.SPROUT_WIDGET === '1' || (app.isPackaged && !process.env.SPROUT_PROFILE && hasWidgetExtension()))

const root = () => join(homedir(), 'Library', 'Group Containers', WIDGET_GROUP_ID, 'widget')
const actionsDir = () => join(root(), 'actions')
const appliedFile = () => join(app.getPath('userData'), 'widget-applied.json')
const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const coreDb: CoreDb = { getAll: (sql, params = []) => db.getAll(sql, params), get: (sql, params = []) => db.getOptional(sql, params) }

let signedIn: () => boolean = () => false
let started = false
let lastKey = ''
let lastSignedIn: boolean | undefined
let writeTimer: NodeJS.Timeout | undefined
let reloadTimer: NodeJS.Timeout | undefined
let lastReloadAt = 0
let actionsTimer: NodeJS.Timeout | undefined
let actionsWatcher: FSWatcher | undefined
let processing: Promise<void> = Promise.resolve()

// ── 반영한 대기열 id(멱등 — 같은 id가 다시 와도 두 번 반영하지 않는다) ──
let applied: string[] = []
function loadApplied() {
  try { applied = (JSON.parse(readFileSync(appliedFile(), 'utf8')) as string[]).filter((x) => typeof x === 'string').slice(-MAX_APPLIED) } catch { applied = [] }
}
function rememberApplied(id: string) {
  applied = [...applied.filter((x) => x !== id), id].slice(-MAX_APPLIED)
  try { writeFileSync(appliedFile(), JSON.stringify(applied)) } catch { /* 기록 실패해도 반영은 이미 끝났다 */ }
}

// ── ② 위젯 새로 고침(네이티브 모듈 widget_bridge.node → WidgetCenter.reloadAllTimelines) ──
type Bridge = { reloadAll: () => boolean; reload?: (kind: string) => boolean }
let bridge: Bridge | null | undefined
function loadBridge(): Bridge | null {
  if (bridge !== undefined) return bridge
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'widget_bridge.node')]
    : [join(app.getAppPath(), 'native', 'widget', 'out', 'widget_bridge.node')]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      const m = { exports: {} as Bridge }
      process.dlopen(m, file)
      bridge = m.exports
      return bridge
    } catch (e) {
      console.warn('[widget] 새로 고침 모듈을 불러오지 못함(위젯 시간표만으로 갱신됨):', e)
    }
  }
  console.warn('[widget] widget_bridge.node 없음 — 위젯은 자기 시간표(시각마다·자정)로만 갱신된다')
  bridge = null
  return bridge
}
function reloadNow() {
  lastReloadAt = Date.now()
  try { loadBridge()?.reloadAll() } catch (e) { console.warn('[widget] reload 실패:', e) }
}
/** 10초 안에 여러 번 부르면 한 번으로 묶는다(앞쪽은 바로, 뒤쪽은 간격이 지난 뒤 한 번) */
export function requestReload(force = false) {
  if (force) { clearTimeout(reloadTimer); reloadTimer = undefined; reloadNow(); return }
  const wait = lastReloadAt + RELOAD_GAP_MS - Date.now()
  if (wait <= 0) { reloadNow(); return }
  if (!reloadTimer) reloadTimer = setTimeout(() => { reloadTimer = undefined; reloadNow() }, wait)
}

// ── ① 저장 파일 쓰기 ──
function writeAtomic(file: string, text: string) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file) // 위젯이 반쯤 쓴 파일을 읽지 않게
}
async function writeSnapshot(force = false) {
  const isIn = signedIn()
  const snap: WidgetSnapshot = await buildSnapshot(coreDb, { today: localDay(), now: new Date(), signedIn: isIn, appliedActions: applied, extEvents: panelEvents })
  mkdirSync(root(), { recursive: true })
  if (snap.growth) {
    const g = snap.growth
    // 43 §17: 입은 옷·갈래까지 같이 굽는다(파일 이름에 모습 열쇠가 들어 있다)
    const look = await coreDb.get<{ look_json: string | null }>('SELECT look_json FROM characters ORDER BY species IS NULL, assessed_at DESC, created_at, id LIMIT 1').catch(() => null)
    try { await bakeArt(join(root(), g.art), g.species as Species | null, g.stage, g.mood, look?.look_json) } catch (e) { console.warn('[widget] 캐릭터 그림 굽기 실패:', e) }
  }
  const key = snapshotKey(snap)
  if (!force && key === lastKey && existsSync(join(root(), 'snapshot.json'))) return
  writeAtomic(join(root(), 'snapshot.json'), JSON.stringify(snap, null, 1))
  const accountChanged = lastSignedIn !== undefined && lastSignedIn !== isIn
  lastKey = key
  lastSignedIn = isIn
  requestReload(force || accountChanged)
}
/** 데이터가 바뀌면 0.8초 모아서 다시 쓴다 */
export function scheduleWidgetWrite(force = false) {
  if (!started) return
  clearTimeout(writeTimer)
  writeTimer = setTimeout(() => { void writeSnapshot(force).catch((e) => console.warn('[widget] 저장 파일 쓰기 실패:', e)) }, DEBOUNCE_MS)
}

// ── ③ 위젯 체크 대기열 반영(§8.5) ──
async function uncompleteTarget(taskId: string): Promise<string[]> {
  const t = await db.getOptional<{ id: string; status: number; repeat_rule: string | null }>('SELECT id, status, repeat_rule FROM tasks WHERE id = ? AND deleted_at IS NULL', [taskId])
  if (!t) return []
  if (t.status === 1) return [t.id]
  // 반복 할 일: 위젯은 원래 할 일 id만 안다 → 오늘 남긴 가장 최근 완료 기록을 되돌린다
  if (t.repeat_rule) {
    const rec = await db.getOptional<{ id: string }>('SELECT id FROM tasks WHERE repeat_origin_id = ? AND status = 1 ORDER BY completed_at DESC LIMIT 1', [taskId])
    return rec ? [rec.id] : []
  }
  return []
}
async function applyAction(a: WidgetAction): Promise<void> {
  // 이 기기 DB에 있는(= 로그인한 내 계정의, 로그아웃하면 지워진다) 지워지지 않은 할 일만 받는다
  const exists = await db.getOptional<{ id: string; owner_id: string | null }>('SELECT id, owner_id FROM tasks WHERE id = ? AND deleted_at IS NULL', [a.taskId])
  if (!exists) return
  const env = { today: localDay() } // XP는 반영하는 날 기준(10 §6 로컬 날짜)
  const plan = a.kind === 'complete'
    ? await planCompleteWithXp(coreDb, [a.taskId], env)
    : { stmts: await planReopenWithXp(coreDb, await uncompleteTarget(a.taskId), env), granted: 0 }
  const { stmts, granted } = plan
  if (!stmts.length) return // 이미 완료됨 등 — 파일만 지운다
  await db.writeTransaction(async (tx) => { for (const s of stmts) await tx.execute(s.sql, s.params ?? []) })
  if (granted > 0) announceXp(granted)
}
/** 앱 안 완료와 같은 "+1"(사이드바 캐릭터 카드·성장 화면) — 렌더러가 `growth:xp`를 `sprout:xp` 이벤트로 바꾼다 */
function announceXp(amount: number) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('growth:xp', amount)
}
async function processActions() {
  const dir = actionsDir()
  if (!existsSync(dir)) return
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  if (!files.length) return
  const items: { file: string; action: WidgetAction | null }[] = files.map((f) => {
    let raw = ''
    try { raw = readFileSync(join(dir, f), 'utf8') } catch { /* 지워졌거나 쓰는 중 */ }
    return { file: f, action: parseAction(raw) }
  })
  items.sort((x, y) => (x.action?.at ?? '').localeCompare(y.action?.at ?? ''))
  let changed = false
  for (const { file, action } of items) {
    const path = join(dir, file)
    if (!existsSync(path)) continue
    if (!action) {
      mkdirSync(join(dir, 'bad'), { recursive: true })
      try { renameSync(path, join(dir, 'bad', file)) } catch { rmSync(path, { force: true }) }
      continue
    }
    if (!signedIn() || actionTooOld(action, new Date()) || applied.includes(action.id)) { rmSync(path, { force: true }); continue }
    try {
      await applyAction(action)
    } catch (e) {
      console.warn('[widget] 체크 반영 실패(다음에 다시 시도):', e)
      continue
    }
    rmSync(path, { force: true })
    rememberApplied(action.id)
    changed = true
  }
  if (changed) scheduleWidgetWrite()
}
function queueActions() {
  clearTimeout(actionsTimer)
  actionsTimer = setTimeout(() => { processing = processing.then(processActions).catch((e) => console.warn('[widget] 대기열 처리 실패:', e)) }, 150)
}
function watchActions() {
  mkdirSync(actionsDir(), { recursive: true })
  actionsWatcher?.close()
  try {
    actionsWatcher = watch(actionsDir(), () => queueActions()) // FSEvents
  } catch (e) {
    console.warn('[widget] 대기열 감시 실패 — 1분마다 확인:', e)
  }
}

// ── ④ 로그아웃 정리(§8.8): 저장 파일을 로그아웃 형태로, 그림·대기열 삭제, 바로 새로 고침 ──
export async function clearWidget() {
  if (!started) return
  clearTimeout(writeTimer)
  rmSync(join(root(), 'art'), { recursive: true, force: true })
  for (const f of existsSync(actionsDir()) ? readdirSync(actionsDir()) : []) rmSync(join(actionsDir(), f), { recursive: true, force: true })
  applied = []
  try { rmSync(appliedFile(), { force: true }) } catch { /* 없음 */ }
  const snap: WidgetSnapshot = { schema: 1, generatedAt: new Date().toISOString(), account: { signedIn: false } }
  mkdirSync(root(), { recursive: true })
  writeAtomic(join(root(), 'snapshot.json'), JSON.stringify(snap))
  lastKey = snapshotKey(snap)
  lastSignedIn = false
  requestReload(true)
}

// ── 시작 ──
let midnightTimer: NodeJS.Timeout | undefined
function scheduleMidnight() {
  clearTimeout(midnightTimer)
  const next = new Date()
  next.setHours(24, 0, 5, 0) // 자정 + 5초(§7)
  midnightTimer = setTimeout(() => { scheduleWidgetWrite(true); scheduleMidnight() }, next.getTime() - Date.now())
}

/** index.ts가 DB·동기화 시작 뒤 한 번 부른다 */
export function startWidget(opts: { isSignedIn: () => boolean }) {
  if (started || !widgetEnabled()) return
  started = true
  signedIn = opts.isSignedIn
  loadApplied()
  try { mkdirSync(root(), { recursive: true }) } catch (e) { console.warn('[widget] 저장 칸을 만들 수 없음:', e); started = false; return }
  // 할 일·XP·캐릭터·목표·테마·리스트·일정·캘린더 보기 설정이 바뀌면(앱 화면·미니 창·동기화로 들어온 변경 모두) 다시 쓴다
  db.onChangeWithCallback({ onChange: () => scheduleWidgetWrite() }, { tables: ['tasks', 'lists', 'xp_events', 'characters', 'kpis', 'user_prefs', 'check_items', 'events', 'view_settings', 'tags', 'task_tags'], throttleMs: 200 })
  onCalendarsChanged(() => scheduleWidgetWrite()) // §15 구글·Apple 일정(월 캘린더 위젯)
  // 로그인·로그아웃은 표 변경 없이 바뀔 수 있다 → 상태가 바뀌면 다시 쓰기(로그아웃 자체는 sync.ts가 clearWidget을 부른다)
  setInterval(() => { if (lastSignedIn !== undefined && lastSignedIn !== signedIn()) scheduleWidgetWrite(true) }, 5_000).unref()
  powerMonitor.on('resume', () => { scheduleWidgetWrite(true); queueActions(); scheduleMidnight() })
  scheduleMidnight()
  watchActions()
  setInterval(queueActions, 60_000).unref() // FSEvents를 놓쳤을 때를 위한 안전망
  queueActions() // 앱이 꺼져 있던 동안 쌓인 체크(D4)
  scheduleWidgetWrite(true) // 앱 시작
}

/** 로그인 항목을 바꿀 수 있는 실행인가: 패키지 앱 + 기본 프로필(개발·시험 프로필 실행은 남의 로그인 항목을 건드리지 않게) */
const loginItemAvailable = () => (process.platform === 'darwin' || process.platform === 'win32') && app.isPackaged && !process.env.SPROUT_PROFILE
const loginItemMarker = () => join(app.getPath('userData'), 'login-item-default')
const loginItemState = () => ({ available: loginItemAvailable(), openAtLogin: loginItemAvailable() ? app.getLoginItemSettings().openAtLogin : false })

/** 설정 › 일반 "로그인할 때 sprout 열기"(25 D4·§14) */
export function registerLoginItemIpc() {
  ipcMain.handle('desktop:login-item', () => loginItemState())
  ipcMain.handle('desktop:set-login-item', (_e, open: unknown) => {
    if (!loginItemAvailable()) return loginItemState()
    try {
      app.setLoginItemSettings({ openAtLogin: open === true })
      if (!existsSync(loginItemMarker())) writeFileSync(loginItemMarker(), new Date().toISOString()) // 사용자가 정했으니 기본값을 다시 넣지 않는다
    } catch (e) {
      console.warn('[widget] 로그인 항목 변경 실패:', e)
    }
    return loginItemState()
  })
}

/** 25 D4: 패키지 앱 첫 실행 때 "로그인할 때 sprout 열기"를 한 번 켠다(사용자가 끄면 다시 켜지 않는다) */
export function ensureLoginItemDefault() {
  if (process.platform !== 'darwin' || !app.isPackaged || process.env.SPROUT_PROFILE) return
  const marker = loginItemMarker()
  if (existsSync(marker)) return
  try {
    app.setLoginItemSettings({ openAtLogin: true })
    writeFileSync(marker, new Date().toISOString())
  } catch (e) {
    console.warn('[widget] 로그인 항목 등록 실패:', e)
  }
}
