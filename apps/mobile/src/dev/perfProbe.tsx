// 성능 측정(39 §11 성능 규칙의 측정 도구) — EXPO_PUBLIC_SPROUT_PERF=1로 번들할 때만 켜진다(출시 빌드에는 안 들어감).
// UI 스레드: Reanimated useFrameCallback으로 프레임 간격, JS 스레드: requestAnimationFrame 간격을 0.5초 칸으로 모아
// Documents/sprout-perf.log에 한 줄씩(JSON) 쓴다. 시뮬레이터는 simctl get_app_container, 기기는 devicectl copy from으로 꺼낸다.
// 측정 계정(perf-로 시작하는 메일)이면 오늘 할 일 45개를 한 번 넣는다.
import { useEffect } from 'react'
import { useFrameCallback, useSharedValue } from 'react-native-reanimated'
import { File, Paths } from 'expo-file-system'

export const PERF = process.env.EXPO_PUBLIC_SPROUT_PERF === '1'

/** 측정 빌드에서만: 이름별 횟수·시간(ms)을 0.5초 칸에 같이 적는다 */
let counters: Record<string, number> = {}
export const perfCount = (name: string, n = 1) => { if (PERF) counters[name] = (counters[name] ?? 0) + n }

type Bucket = { n: number; sum: number; max: number; over12: number; over20: number; over34: number; hitch8: number; hitch16: number }
const empty = (): Bucket => ({ n: 0, sum: 0, max: 0, over12: 0, over20: 0, over34: 0, hitch8: 0, hitch16: 0 })

export function PerfProbe(props: { seed?: () => Promise<void> }) {
  const ui = useSharedValue<Bucket>(empty())
  useFrameCallback((f) => {
    'worklet'
    const dt = f.timeSincePreviousFrame
    if (dt == null || dt <= 0 || dt > 1000) return
    const b = ui.value
    b.n += 1
    b.sum += dt
    if (dt > b.max) b.max = dt
    if (dt > 12) b.over12 += 1
    if (dt > 20) b.over20 += 1
    if (dt > 34) b.over34 += 1
    // Apple 끊김 비율과 같은 뜻: 기대 간격(120Hz 8.33 · 60Hz 16.67)을 넘은 만큼
    if (dt > 8.34 * 1.5) b.hitch8 += dt - 8.33
    if (dt > 16.67 * 1.5) b.hitch16 += dt - 16.67
    ui.value = b
  })
  useEffect(() => {
    const file = new File(Paths.document, 'sprout-perf.log')
    try { if (!file.exists) file.create(); file.write(JSON.stringify({ hermes: typeof (globalThis as { HermesInternal?: { enableSamplingProfiler?: unknown } }).HermesInternal?.enableSamplingProfiler, dump: typeof (globalThis as { HermesInternal?: { dumpSampledTraceToFile?: unknown } }).HermesInternal?.dumpSampledTraceToFile }) + '\n') } catch {}
    let lines: string[] = []
    let js = empty()
    let last = 0
    let raf = 0
    const tick = (t: number) => {
      if (last) {
        const dt = t - last
        js.n += 1; js.sum += dt; if (dt > js.max) js.max = dt
        if (dt > 20) js.over20 += 1
        if (dt > 34) js.over34 += 1
        if (dt > 25) js.hitch16 += dt - 16.67
      }
      last = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const iv = setInterval(() => {
      const u = ui.value
      ui.value = empty()
      lines.push(JSON.stringify({ t: Date.now(), ui: round(u), js: round(js), c: counters }))
      counters = {}
      js = empty()
    }, 500)
    const flush = setInterval(() => {
      if (!lines.length) return
      try { file.write(lines.join('\n') + '\n', { append: true }) } catch {}
      lines = []
    }, 2000)
    void props.seed?.().catch(() => {})
    // EXPO_PUBLIC_SPROUT_PROFILE=1: Hermes 샘플링 프로파일러를 켜고 50초 뒤 Documents/sprout.cpuprofile로 쏟는다
    const H = (globalThis as { HermesInternal?: { enableSamplingProfiler?: () => void; disableSamplingProfiler?: () => void; dumpSampledTraceToFile?: (f: string) => void } }).HermesInternal
    let prof: ReturnType<typeof setTimeout> | undefined
    if (process.env.EXPO_PUBLIC_SPROUT_PROFILE === '1' && H?.enableSamplingProfiler) {
      H.enableSamplingProfiler()
      prof = setTimeout(() => {
        try { H.dumpSampledTraceToFile?.(new File(Paths.document, 'sprout.cpuprofile').uri.replace('file://', '')); H.disableSamplingProfiler?.() } catch {}
      }, 50_000)
    }
    return () => { cancelAnimationFrame(raf); clearInterval(iv); clearInterval(flush); clearTimeout(prof) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
const round = (b: Bucket) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 10) / 10]))

/** 측정 계정(perf-…@sprout.test)에만: 오늘 할 일이 45개보다 적으면 채운다(제목·우선순위 섞음) */
export async function seedPerfTasks(email: string | undefined) {
  if (!PERF || !email?.startsWith('perf-')) return
  const { db } = await import('../data/db')
  const { createTask, defaultListId } = await import('../data/tasks')
  const { dayKey } = await import('../lib/dates')
  const today = dayKey()
  const row = await db.getOptional<{ n: number }>('SELECT count(*) AS n FROM tasks WHERE status = 0 AND deleted_at IS NULL AND substr(due_at, 1, 10) = ?', [today])
  const have = row?.n ?? 0
  if (have >= 45) return
  const list = await defaultListId()
  const words = ['보고서 정리', '장보기', '운동 30분', '메일 답장', '회의 준비', '책 읽기', '빨래', '코드 리뷰', '병원 예약', '청소']
  for (let i = have; i < 45; i++) {
    await createTask({ title: `${words[i % words.length]} ${i + 1}`, list_id: list, due_at: today, priority: [0, 1, 2, 3][i % 4] })
  }
}

/** 측정 빌드에서만: 지난 렌더와 달라진 값 이름을 센다(무엇이 다시 그리게 했나) */
const lastSeen = new Map<string, unknown[]>()
export function perfWhy(scope: string, vals: Record<string, unknown>) {
  if (!PERF) return
  const keys = Object.keys(vals)
  const prev = lastSeen.get(scope)
  const now = keys.map((k) => vals[k])
  if (prev) keys.forEach((k, i) => { if (prev[i] !== now[i]) perfCount(`${scope}.${k}`) })
  lastSeen.set(scope, now)
}
