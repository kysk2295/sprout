// 36 §7.4·§7.5 앱 쪽 위젯 연결 — 앱 뿌리(_layout)에서 한 번.
// - 위젯 표가 바뀌면 1초 모아 저장 파일 다시 쓰기 → 내용이 바뀌었을 때만 위젯 새로 고침
// - 앞으로 올 때·시작·자정 + 5초·백그라운드 새로 고침·(Android) 위젯 체크 신호 → 대기열 반영(정상 완료 경로) + 다시 쓰기
// - 로그아웃 → 로그아웃 형태 + 그림·대기열 지움(25 §8.8)
// - 캐릭터 그림: 보이지 않는 곳에 CharacterArt를 그려 PNG로 굽는다(WidgetArtBaker, §7.3)
import { planWidgetActions, signedOutSnapshot, widgetSnapshotKey, type WidgetMood } from '@sprout/schema/widget'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, View } from 'react-native'
import type Svg from 'react-native-svg'
import type { Species } from '@sprout/schema/growth'
import { useAuth } from '../data/auth'
import { coreDb, db } from '../data/db'
import { completeTasks, reopenTasks } from '../data/tasks'
import { dayKey } from '../lib/dates'
import { CharacterArt } from '../growth/art/CharacterArt'
import { clearWidgetData, hasArt, onWidgetAction, readActions, removeActions, widgetsAvailable, writeArt, writeSnapshot } from './native'
import { composeWidgetSnapshot, readWidgetData, WIDGET_TABLES } from './snapshot'

let lastKey: string | null = null
let applied: string[] = []
let running: Promise<void> | null = null
let again = false

// ── 굽기 요청(그림이 저장 칸에 없을 때) ──
type ArtJob = { rel: string; species: Species | null; stage: number; mood: WidgetMood }
let artJob: ArtJob | null = null
const artListeners = new Set<() => void>()
const setArtJob = (j: ArtJob | null) => { artJob = j; artListeners.forEach((l) => l()) }

/** 저장 파일 다시 쓰기(한 번에 하나, 도중에 또 부르면 끝나고 한 번 더) */
export function refreshWidgets(signedIn: boolean): Promise<void> {
  if (running) { again = true; return running }
  running = (async () => {
    try {
      do {
        again = false
        if (!widgetsAvailable()) return
        const now = new Date()
        const today = dayKey()
        const snap = signedIn ? composeWidgetSnapshot(await readWidgetData(coreDb, today), { today, now, signedIn, appliedActions: applied }) : signedOutSnapshot(now)
        const key = widgetSnapshotKey(snap)
        if (key === lastKey) continue
        if (await writeSnapshot(JSON.stringify(snap), true)) lastKey = key
        const g = snap.growth
        if (g && !hasArt(g.art)) setArtJob({ rel: g.art, species: g.species as Species | null, stage: g.stage, mood: g.mood })
      } while (again)
    } catch (e) {
      console.warn('[widgets] refresh failed:', e)
    } finally {
      running = null
    }
  })()
  return running
}

/** 위젯 체크 대기열 반영(25 §8.5): 내 DB에 있는 미완료 할 일만 완료 — XP·반복 다음 회차는 completeTasks 그대로 */
export async function applyWidgetActions(): Promise<number> {
  const files = await readActions()
  if (!files.length) return 0
  const raws = files.map((f) => { try { return JSON.parse(f.raw) as unknown } catch { return null } })
  const plan = planWidgetActions(raws, applied, new Date())
  let done = 0
  const openIds = plan.complete.map((a) => a.taskId)
  if (openIds.length) {
    const marks = openIds.map(() => '?').join(',')
    const rows = await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE id IN (${marks}) AND status = 0 AND deleted_at IS NULL`, openIds)
    if (rows.length) { await completeTasks(rows.map((r) => r.id)); done = rows.length }
  }
  const reopen = plan.uncomplete.map((a) => a.taskId)
  if (reopen.length) {
    const marks = reopen.map(() => '?').join(',')
    const rows = await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE id IN (${marks}) AND status != 0 AND deleted_at IS NULL`, reopen)
    if (rows.length) await reopenTasks(rows.map((r) => r.id))
  }
  applied = [...applied, ...plan.ids].slice(-50)
  await removeActions(files.map((f) => f.name)) // 깨진 것·오래된 것·반영한 것 모두
  return done
}

/** 백그라운드 새로 고침 작업(notifications/background.ts)에서 */
export async function widgetsBackgroundTick(): Promise<void> {
  if (!widgetsAvailable()) return
  await applyWidgetActions().catch(() => 0)
  await refreshWidgets(true)
}

export function useWidgets() {
  const { status } = useAuth()
  useEffect(() => {
    if (status === 'loading' || !widgetsAvailable()) return
    if (status === 'signedOut') {
      applied = []
      void clearWidgetData().then(() => refreshWidgets(false))
      return
    }
    let alive = true
    const tick = async () => {
      await applyWidgetActions().catch((e) => console.warn('[widgets] actions failed:', e))
      if (alive) await refreshWidgets(true)
    }
    void tick()
    let timer: ReturnType<typeof setTimeout> | undefined
    const stopChange = db.onChange({ onChange: () => { clearTimeout(timer); timer = setTimeout(() => void refreshWidgets(true), 1000) } }, { tables: [...WIDGET_TABLES], throttleMs: 1000 })
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void tick() })
    const stopAction = onWidgetAction(() => void tick())
    // 자정 + 5초: 오늘 목록·오늘 원
    let midnight: ReturnType<typeof setTimeout> | undefined
    const armMidnight = () => {
      const n = new Date()
      const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5)
      midnight = setTimeout(() => { void refreshWidgets(true); armMidnight() }, next.getTime() - n.getTime())
    }
    armMidnight()
    return () => {
      alive = false
      clearTimeout(timer)
      clearTimeout(midnight)
      stopChange()
      app.remove()
      stopAction()
    }
  }, [status])
}

/** §7.3 캐릭터 그림 굽기: 굽기 요청이 있을 때만 화면 밖에 192pt로 그려 PNG(base64)로 저장 칸에 쓴다 */
export function WidgetArtBaker() {
  const job = useSyncExternalStore((l) => { artListeners.add(l); return () => { artListeners.delete(l) } }, () => artJob)
  const ref = useRef<Svg | null>(null)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!job) return
    const t = setTimeout(() => {
      const svg = ref.current as unknown as { toDataURL?: (cb: (b64: string) => void, o?: object) => void } | null
      if (!svg?.toDataURL) { if (tries < 3) setTries(tries + 1); return }
      svg.toDataURL(async (b64) => {
        const ok = await writeArt(job.rel, b64)
        if (artJob === job) setArtJob(null)
        if (ok) { lastKey = null; void refreshWidgets(true) }
      }, { width: 192, height: 192 })
    }, 300)
    return () => clearTimeout(t)
  }, [job, tries])
  if (!job) return null
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -1000, top: -1000, width: 192, height: 192, opacity: 0 }} importantForAccessibility="no-hide-descendants">
      <CharacterArt species={job.species} stage={job.stage} mood={job.mood} size={192} svgRef={ref} />
    </View>
  )
}
