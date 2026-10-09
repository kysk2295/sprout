// 49 §8.1 사이트 캐릭터 그림 = 앱과 같은 미리 구운 3D 층(packages/schema/art3d)을 겹친 WebP(512).
// 그림을 다시 구우면 이 스크립트만 다시 돌리면 된다: npm run characters -w sprout-site 또는
//   node --experimental-strip-types --no-warnings site/scripts/gen-characters.mjs (Node 22, 레포 루트)
// 꿈틀 정원 친구들 4종 × 5단계(갈래 a, 씨앗 껍질 0) 몸 + 웃음 얼굴 + 씨앗(앞모습). 크기 비교가 필요 없는 자리라 그려진 테두리로 꽉 채운다.
// 겹치기는 scripts/characters3d/.venv의 파이썬(PIL — composite3d.py)으로 한다(node에 sharp 의존성을 더하지 않으려고).
import { readdirSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const art = join(root, 'packages/schema/art3d')
const out = join(here, '../public/assets/characters')
const PX = 512
const py = join(root, 'scripts/characters3d/.venv/bin/python')
if (!existsSync(py)) { console.error('파이썬 환경이 없어요:', py, '— scripts/characters3d 안내대로 .venv를 만드세요'); process.exit(1) }

const A = await import(pathToFileURL(join(root, 'packages/schema/src/art3d.ts')).href)
mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) if (/\.(svg|webp|png)$/.test(f)) rmSync(join(out, f)) // v2 SVG 그림도 지운다

const PAD = 0.04
const square = ([x0, y0, x1, y1]) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const side = Math.min(1, Math.max(x1 - x0, y1 - y0) + PAD * 2)
  return { x: Math.min(1 - side, Math.max(0, cx - side / 2)), y: Math.min(1 - side, Math.max(0, cy - side / 2)), w: side, h: side }
}
const pick = (key) => {
  for (const px of [768, 512, 384, 160]) { const f = join(art, A.artFile(key, px)); if (existsSync(f)) return f }
  return join(art, A.artFile(key, 768))
}

const jobs = []
const seedKey = A.SEEDS3D.includes(A.seedTurnKey(0, 0)) ? A.seedTurnKey(0, 0) : A.SEEDS3D[0]
jobs.push({ out: join(out, 'egg.webp'), files: [pick(seedKey)], box: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }, px: PX })
for (const sp of ['snail', 'bee', 'worm', 'frog'])
  for (let st = 1; st <= 5; st++) {
    const L = A.layers3d(sp, st, { path: 'a', seed: 0, mood: 'happy', size: 256 })
    let bb = A.BODIES[A.bodyKey(sp, st, 'a', 0)]?.box ?? [0, 0, 1, 1]
    for (const l of L) {
      const r = l.kind === 'face' ? A.FACES[l.key] : l.kind === 'prop' ? A.PROPS[l.key] : null
      if (r) bb = [Math.min(bb[0], r[0]), Math.min(bb[1], r[1]), Math.max(bb[2], r[2]), Math.max(bb[3], r[3])]
    }
    jobs.push({ out: join(out, `${sp}-${st}.webp`), files: L.map((l) => pick(l.key)), box: square(bb), px: PX })
  }

const r = spawnSync(py, [join(here, 'composite3d.py')], { input: JSON.stringify(jobs), stdio: ['pipe', 'inherit', 'inherit'] })
if (r.status !== 0) process.exit(r.status ?? 1)
console.log(`characters (${A.ART3D_VERSION}, ${jobs.length}장) ->`, out)
