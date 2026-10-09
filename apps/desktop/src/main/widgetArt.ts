// 25 §8.4 · 49 §8.1 위젯 캐릭터 그림 굽기(v3): 앱과 같은 미리 구운 3D 층(layers3d — 몸·칸 소품·얼굴·옷)을
// 보이지 않는(offscreen) 창에서 <img>로 겹쳐 찍어 PNG로 저장한다. 위젯은 PNG만 읽는다.
// 조합(종·단계·갈래·입은 옷·씨앗·기분)마다 한 번만 굽고 파일 이름(widgetArtPath, 그림 판 v5 + 모습 열쇠)을 캐시로 쓴다.
// 그림 파일: 개발 = 저장소 packages/schema/art3d · 패키지 앱 = process.resourcesPath/art3d(electron-builder.yml extraResources).
// 파일을 base64 data: URL로 HTML에 넣어 찍는다 — 창이 디스크를 읽지 않아 권한·경로 문제가 없다.
import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Species } from '@sprout/schema/growth'
import { WIDGET_ART_PX as PX, widgetArtHtml, widgetArtPlan, type WidgetArtMood } from './widgetArt3d'

let queue: Promise<unknown> = Promise.resolve()

/** 그림 폴더(개발 = 저장소 · 패키지 = resources) */
export function art3dDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'art3d') : join(app.getAppPath(), '../../packages/schema/art3d')
}
function dataUrl(file: string): string | null {
  const p = join(art3dDir(), file)
  if (!existsSync(p)) return null
  return `data:image/webp;base64,${readFileSync(p).toString('base64')}`
}

async function render(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    width: PX, height: PX, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, javascript: false, sandbox: true }
  })
  try {
    // load 이벤트는 <img>(data:)가 다 읽힌 뒤 — 그다음 한 번 그릴 때까지 조금 기다린다
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
    await new Promise((r) => setTimeout(r, 150))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: PX, height: PX })
    return img.resize({ width: PX, height: PX }).toPNG()
  } finally {
    win.destroy()
  }
}

/** file이 없을 때만 굽는다. 동시에 여러 번 불려도 한 장씩 차례로. 그림 파일이 하나도 없으면 굽지 않는다(빈 PNG 캐시 방지) */
export function bakeArt(file: string, species: Species | null, stage: number, mood: WidgetArtMood, lookJson?: string | null): Promise<void> {
  if (existsSync(file)) return Promise.resolve()
  const job = queue.then(async () => {
    if (existsSync(file)) return
    const plan = widgetArtPlan(species, stage, mood, lookJson)
    const urls = new Map(plan.files.map((f) => [f, dataUrl(f)]))
    if (![...urls.values()].some(Boolean)) throw new Error(`3D 그림 파일이 없어요: ${art3dDir()}`)
    const png = await render(widgetArtHtml(plan, (f) => urls.get(f) ?? null))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, png)
  })
  queue = job.catch(() => undefined)
  return job
}
