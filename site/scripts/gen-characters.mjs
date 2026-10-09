// 앱과 같은 캐릭터 그림(@sprout/schema/characterArt — 데스크톱·휴대폰·위젯이 그리는 그 글)을 정적 SVG로 뽑는다.
// 그림을 바꾸면 이 스크립트만 다시 돌리면 된다: node --experimental-strip-types site/scripts/gen-characters.mjs (Node 22, 레포 루트)
// 꿈틀 정원 친구들 4종 × 5단계(갈래 A) + 씨앗. 크기 비교가 필요 없는 자리라 상자를 채운다(fit).
import { readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const out = join(here, '../public/assets/characters')
mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) if (f.endsWith('.svg')) rmSync(join(out, f)) // 옛 종(turtle·squirrel·cat·otter) 파일도 지운다
const { art, seedArt } = await import(pathToFileURL(join(root, 'packages/schema/src/characterArt.ts')).href)
const clean = (s) => s.replace(/ class="[^"]*"/g, '').replace(/ style="[^"]*"/g, '')
writeFileSync(join(out, 'egg.svg'), clean(seedArt({ uid: 'egg' })))
for (const sp of ['snail', 'bee', 'worm', 'frog'])
  for (let st = 1; st <= 5; st++)
    writeFileSync(join(out, `${sp}-${st}.svg`), clean(art(sp, st, { mood: st >= 4 ? 'happy' : 'smile', fit: true, uid: `${sp}${st}` })))
console.log('characters ->', out)
