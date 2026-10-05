// SVG → PNG 렌더링(Chrome 헤드리스, 투명 배경). 새 의존성 없이 macOS에 있는 Chrome을 쓴다.
// 다른 경로의 Chrome/Chromium은 CHROME 환경 변수로 지정한다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].filter(Boolean)

export function chromePath() {
  const p = CANDIDATES.find((c) => existsSync(c))
  if (!p) throw new Error('Chrome을 찾지 못했습니다. CHROME=/path/to/chrome 으로 지정하세요.')
  return p
}

/** svg 문자열을 size×size PNG로 저장. 1024에서 그린 뒤 작은 크기는 sips로 줄이는 쪽이 선명도가 더 고르다. */
export function renderSvg(svg, outPng, size = 1024, height = size) {
  const dir = mkdtempSync(join(tmpdir(), 'sprout-brand-'))
  try {
    const html = join(dir, 'i.html')
    writeFileSync(
      html,
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${height}px}</style></head><body>${svg}</body></html>`
    )
    execFileSync(
      chromePath(),
      ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${height}`, `--screenshot=${outPng}`, `file://${html}`],
      { stdio: 'ignore' }
    )
    if (!existsSync(outPng)) throw new Error(`렌더 실패: ${outPng}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** PNG의 불투명 픽셀 경계(알파 > 8). pngjs는 저장소 node_modules에 이미 있다(Expo 의존성). */
export function alphaBounds(png) {
  const require = createRequire(import.meta.url)
  const { PNG } = require('pngjs')
  const img = PNG.sync.read(readFileSync(png))
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return { x0, y0, x1, y1, w: img.width, h: img.height }
}

/** sips로 정사각 리사이즈 */
export function resize(src, out, size) {
  execFileSync('sips', ['-z', String(size), String(size), src, '--out', out], { stdio: 'ignore' })
}
