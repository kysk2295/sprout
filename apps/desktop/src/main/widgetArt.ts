// 25 §8.4 캐릭터 그림 굽기: 공용 그림 데이터(@sprout/schema/characterArt — 앱 CharacterArt와 같은 글)를 보이지 않는(offscreen) 창에서 그려 PNG로 저장한다.
// 위젯은 PNG만 읽는다. 조합(종·단계·갈래·입은 옷·기분)마다 한 번만 굽고 파일 이름(widgetArtPath, 그림 판 v4(2026-10-09 단계마다 같은 크기) + 모습 열쇠)을 캐시로 쓴다.
// 크기(43 결정 ⑨): 위젯은 상자를 채운다(fit), 전설 배경은 끈다(42 결정 ③).
import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { art, seedArt } from '@sprout/schema/characterArt'
import type { Species } from '@sprout/schema/growth'
import { parseLook } from '@sprout/schema/wardrobe'

const PX = 192 // 96pt @2x (§3.4 중간 캐릭터 96)

let queue: Promise<unknown> = Promise.resolve()

/** lookJson = characters.look_json(입힌 옷·갈래). 받은 것인지는 앱이 저장할 때 이미 거른다 */
export function characterSvg(species: Species | null, stage: number, mood: 'default' | 'happy' | 'sleepy', lookJson?: string | null): string {
  if (!species) return seedArt({ size: PX })
  const l = parseLook(lookJson)
  return art(species, stage, { size: PX, mood, fit: true, noAura: true, path: l.path, eq: l.eq })
}

async function render(svg: string): Promise<Buffer> {
  const win = new BrowserWindow({
    width: PX, height: PX, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, javascript: false, sandbox: true }
  })
  try {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((r) => setTimeout(r, 120)) // 첫 그리기 대기
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: PX, height: PX })
    return img.resize({ width: PX, height: PX }).toPNG()
  } finally {
    win.destroy()
  }
}

/** file이 없을 때만 굽는다. 동시에 여러 번 불려도 한 장씩 차례로 */
export function bakeArt(file: string, species: Species | null, stage: number, mood: 'default' | 'happy' | 'sleepy', lookJson?: string | null): Promise<void> {
  if (existsSync(file)) return Promise.resolve()
  const job = queue.then(async () => {
    if (existsSync(file)) return
    const png = await render(characterSvg(species, stage, mood, lookJson))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, png)
  })
  queue = job.catch(() => undefined)
  return job
}
