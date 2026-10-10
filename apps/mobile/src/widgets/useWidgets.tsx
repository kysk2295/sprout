// 36 §7.4·§7.5 앱 쪽 위젯 연결 — 앱 뿌리(_layout)에서 한 번.
// - 위젯 표가 바뀌면 1초 모아 저장 파일 다시 쓰기 → 내용이 바뀌었을 때만 위젯 새로 고침
// - 앞으로 올 때·시작·자정 + 5초·백그라운드 새로 고침·(Android) 위젯 체크 신호 → 대기열 반영(정상 완료 경로) + 다시 쓰기
// - 로그아웃 → 로그아웃 형태 + 그림·대기열 지움(25 §8.8)
// - 캐릭터 그림: 보이지 않는 곳에 3D 그림 층(layers3d, 49 §8.1)을 Svg 안 Image로 겹쳐 그려 PNG로 굽는다(WidgetArtBaker, §7.3)
import { planWidgetActions, signedOutSnapshot, widgetSnapshotKey, type WidgetMood } from '@sprout/schema/widget'
import { parseLook, type Look } from '@sprout/schema/wardrobe'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, View } from 'react-native'
import Svg, { ClipPath, Defs, G, Image as SvgImage, Rect } from 'react-native-svg'
import { bodyBox, bodyKey, layers3d, MASCOT, sceneBehind, SCENE_LOW_PX, SCENES3D, type Box } from '@sprout/schema/characterArt'
import { widgetSceneKey } from '@sprout/schema/widget'
import type { Species } from '@sprout/schema/growth'
import { useAuth } from '../data/auth'
import { coreDb, db } from '../data/db'
import { completeTasks, reopenTasks } from '../data/tasks'
import { dayKey } from '../lib/dates'
import { artSource } from '../growth/art/CharacterArt'
import { clearWidgetData, hasArt, onWidgetAction, readActions, removeActions, widgetsAvailable, writeArt, writeSnapshot } from './native'
import { composeWidgetSnapshot, readWidgetData, WIDGET_TABLES } from './snapshot'

let lastKey: string | null = null
let applied: string[] = []
let running: Promise<void> | null = null
let again = false

// ── 굽기 요청(그림이 저장 칸에 없을 때) ──
type ArtJob = { rel: string; species: Species | null; stage: number; level: number; mood: WidgetMood; look: Look; scene: string }
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
        const data = signedIn ? await readWidgetData(coreDb, today) : null
        const snap = data ? composeWidgetSnapshot(data, { today, now, signedIn, appliedActions: applied }) : signedOutSnapshot(now)
        const key = widgetSnapshotKey(snap)
        if (key === lastKey) continue
        if (await writeSnapshot(JSON.stringify(snap), true)) lastKey = key
        const g = snap.growth
        // 43 §17 6: 입힌 모습(look_json)까지 같이 굽는다 — 파일 이름에 모습 열쇠가 들어 있어 옷을 바꾸면 새로 굽는다
        if (g && !hasArt(g.art)) setArtJob({ rel: g.art, species: g.species as Species | null, stage: g.stage, level: g.level, mood: g.mood, look: parseLook(data?.character?.look_json), scene: widgetSceneKey(data?.character?.look_json) })
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

/** 굽는 그림 층(뒤 → 앞)과 꽉 채울 상자 — 앱 CharacterArt와 같은 층(공용 layers3d), 몸 테두리(bodyBox)로 192 칸을 채운다 */
type ArtSrc = NonNullable<ReturnType<typeof artSource>>
/** 49 §6.1: 캐릭터 뒤 장면(고른 배경의 낮 짝 — 공용 widgetSceneKey) 390 미리보기 + 자리(sceneBehind, 캔버스 비율). 둥근 칸으로 자른다(모서리 = 칸의 20%) */
type SceneBack = { src: ArtSrc; at: { x: number; y: number; w: number; h: number } }
function sceneBack(job: ArtJob): SceneBack | null {
  const src = SCENES3D[job.scene] ? artSource(job.scene, SCENE_LOW_PX) : null
  return src ? { src, at: sceneBehind(job.scene) } : null
}
function widgetLayers(job: ArtJob): { srcs: ArtSrc[]; box: Box; scene: SceneBack | null } {
  const scene = sceneBack(job)
  // 종 모름(성향 조사 전) = 마스코트 아기 달팽이(49 §15) — 옷·고른 씨앗 없이
  const sp = job.species ?? MASCOT.sp
  const st = job.species ? job.stage : MASCOT.st
  const seed = job.species ? job.look.seed ?? 0 : MASCOT.seed
  const path = job.species ? job.look.path : 'a'
  const L = layers3d(sp, st, { path, seed, eq: job.species ? job.look.eq : undefined, mood: job.mood, size: 192 })
  const srcs = L.map((l) => artSource(l.key, 768)).filter((x): x is ArtSrc => x != null)
  return { srcs, box: bodyBox(bodyKey(sp, st, path, seed)), scene }
}

/** §7.3 캐릭터 그림 굽기: 굽기 요청이 있을 때만 화면 밖에 192pt로 그려 PNG(base64)로 저장 칸에 쓴다.
 *  49 §8.1: 3D 그림(WebP)을 react-native-svg <Image>로 겹쳐 그리고 그 Svg의 toDataURL로 굽는다(네이티브 변경 없음).
 *  층이 모두 올라온 뒤(onLoad) 굽는다 — iOS는 onLoad 뒤에 그림을 붙이므로 한 박자 쉬고, onLoad가 안 오면 2.5초 뒤 그대로 굽는다. */
export function WidgetArtBaker() {
  const job = useSyncExternalStore((l) => { artListeners.add(l); return () => { artListeners.delete(l) } }, () => artJob)
  const ref = useRef<Svg | null>(null)
  const [tries, setTries] = useState(0)
  const [loaded, setLoaded] = useState(0)
  const art = useMemo(() => (job ? widgetLayers(job) : null), [job])
  useEffect(() => { setLoaded(0); setTries(0) }, [job])
  const ready = !!art && loaded >= art.srcs.length + (art.scene ? 1 : 0)
  useEffect(() => {
    if (!job || !art) return
    if (!art.srcs.length) { if (artJob === job) setArtJob(null); return } // 그림 파일이 없다 — 위젯은 그림 없이
    const t = setTimeout(() => {
      const svg = ref.current as unknown as { toDataURL?: (cb: (b64: string) => void, o?: object) => void } | null
      if (!svg?.toDataURL) { if (tries < 3) setTries(tries + 1); return }
      svg.toDataURL(async (b64) => {
        const ok = await writeArt(job.rel, b64)
        if (artJob === job) setArtJob(null)
        if (ok) { lastKey = null; void refreshWidgets(true) }
      }, { width: 192, height: 192 })
    }, ready ? 300 : 2500)
    return () => clearTimeout(t)
  }, [job, art, ready, tries])
  if (!job || !art) return null
  const U = 1000, b = art.box
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -1000, top: -1000, width: 192, height: 192, opacity: 0 }} importantForAccessibility="no-hide-descendants">
      <Svg key={job.rel} ref={ref} width={192} height={192} viewBox={`${b.x * U} ${b.y * U} ${b.w * U} ${b.h * U}`}>
        <Defs><ClipPath id="wclip"><Rect x={b.x * U} y={b.y * U} width={b.w * U} height={b.h * U} rx={b.w * U * 0.2} /></ClipPath></Defs>
        <G clipPath={art.scene ? 'url(#wclip)' : undefined}>
          {art.scene ? <SvgImage href={art.scene.src} x={art.scene.at.x * U} y={art.scene.at.y * U} width={art.scene.at.w * U} height={art.scene.at.h * U} preserveAspectRatio="none" onLoad={() => setLoaded((n) => n + 1)} /> : null}
          {art.srcs.map((src, i) => <SvgImage key={i} href={src} x={0} y={0} width={U} height={U} preserveAspectRatio="none" onLoad={() => setLoaded((n) => n + 1)} />)}
        </G>
      </Svg>
    </View>
  )
}
