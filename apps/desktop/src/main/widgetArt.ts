// 25 §8.4 캐릭터 그림 굽기: 앱의 CharacterArt(10 §2.2)를 SVG 글자로 만들고, 보이지 않는(offscreen) 창에서 그려 PNG로 저장한다.
// 그림 원본은 렌더러 컴포넌트 한 곳뿐이고, 위젯은 PNG만 읽는다. 조합(종·단계·기분)마다 한 번만 굽고 파일을 캐시로 쓴다.
import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Species } from '@sprout/schema/growth'
import { CharacterArt } from '../renderer/src/components/growth/CharacterArt'

const PX = 192 // 96pt @2x (§3.4 중간 캐릭터 96)

let queue: Promise<unknown> = Promise.resolve()

export function characterSvg(species: Species | null, stage: number, mood: 'default' | 'happy' | 'sleepy'): string {
  return renderToStaticMarkup(createElement(CharacterArt, { species, stage, size: PX, mood }))
}

async function render(svg: string): Promise<Buffer> {
  const win = new BrowserWindow({
    width: PX, height: PX, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, javascript: false, sandbox: true }
  })
  try {
    // 눈 뜬 얼굴은 CSS로 "감은 눈"을 숨긴다(growth-stage.css) — 같은 규칙만 넣는다
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}.character__eyes-closed{display:none}</style></head><body>${svg}</body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((r) => setTimeout(r, 120)) // 첫 그리기 대기
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: PX, height: PX })
    return img.resize({ width: PX, height: PX }).toPNG()
  } finally {
    win.destroy()
  }
}

/** file이 없을 때만 굽는다. 동시에 여러 번 불려도 한 장씩 차례로 */
export function bakeArt(file: string, species: Species | null, stage: number, mood: 'default' | 'happy' | 'sleepy'): Promise<void> {
  if (existsSync(file)) return Promise.resolve()
  const job = queue.then(async () => {
    if (existsSync(file)) return
    const png = await render(characterSvg(species, stage, mood))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, png)
  })
  queue = job.catch(() => undefined)
  return job
}
