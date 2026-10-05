// 앱의 CharacterArt(데스크톱 성장 화면 그림)를 그대로 정적 SVG로 뽑는다.
// 그림을 바꾸면 이 스크립트만 다시 돌리면 된다: node site/scripts/gen-characters.mjs (Node 22, 레포 루트에서 node_modules 사용)
import { build } from 'esbuild'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const out = join(here, '../public/assets/characters')
mkdirSync(out, { recursive: true })
const entry = `
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { CharacterArt } from ${JSON.stringify(join(root, 'apps/desktop/src/renderer/src/components/growth/CharacterArt.tsx'))}
export const render = (p) => renderToStaticMarkup(createElement(CharacterArt, p))
`
const tmp = mkdtempSync(join(root, 'node_modules/.chr-'))
const file = join(tmp, 'b.mjs')
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'tsx' },
  bundle: true, format: 'esm', platform: 'node', outfile: file, jsx: 'automatic',
  loader: { '.css': 'empty' }, logLevel: 'warning', external: ['react', 'react-dom', 'react/*', 'react-dom/*'],
  alias: { '@sprout/schema/growth': join(root, 'packages/schema/src/growth.ts') }
})
const { render } = await import(pathToFileURL(file).href)
const clean = (s) => s.replace(/<g class="character__eyes-closed">(<path[^>]*><\/path>)+<\/g>/, '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/ class="[^"]*"/g, '').replace(/ (width|height)="\d+"/g, '')
writeFileSync(join(out, 'egg.svg'), clean(render({ species: null, size: 120 })))
for (const sp of ['turtle', 'squirrel', 'cat', 'otter'])
  for (let st = 1; st <= 5; st++)
    writeFileSync(join(out, `${sp}-${st}.svg`), clean(render({ species: sp, stage: st, size: 120, mood: st >= 4 ? 'happy' : 'smile' })))
rmSync(tmp, { recursive: true, force: true })
console.log('characters ->', out)
