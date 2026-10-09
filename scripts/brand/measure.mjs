// 각 기호의 실제 픽셀 경계를 재서 glyph-bounds.json에 저장한다(기호를 고친 뒤 한 번 돌린다).
//   node scripts/brand/measure.mjs
// compose.mjs가 이 값으로 기호를 가운데 맞추고 크기를 정한다.
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONCEPTS } from './glyphs.mjs'
import { renderSvg, alphaBounds } from './render.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'sprout-measure-'))
const out = {}
for (const k of Object.values(CONCEPTS).filter((x) => !x.mark)) { // mark 기호(씨앗 친구)는 100 판 좌표 그대로라 잴 필요 없다
  // 1000 상자를 1024 캔버스에 (12,12) 옮겨 그대로 그린다
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><mask id="m" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="1400"><rect x="-200" y="-200" width="1400" height="1400" fill="#fff"/>${k.cut}</mask></defs><g transform="translate(12 12)"><g mask="url(#m)">${k.shape.replaceAll('{FG}', '#000')}</g></g></svg>`
  const png = join(tmp, `${k.id}.png`)
  renderSvg(svg, png)
  const b = alphaBounds(png)
  out[k.id] = { x0: b.x0 - 12, y0: b.y0 - 12, x1: b.x1 - 12, y1: b.y1 - 12 }
}
rmSync(tmp, { recursive: true, force: true })
writeFileSync(join(here, 'glyph-bounds.json'), JSON.stringify(out, null, 2) + '\n')
console.log(out)
