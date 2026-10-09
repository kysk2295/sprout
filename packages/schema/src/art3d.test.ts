// 49 §12 · 3D 그림 목록·기준점 시험: 모든 종·단계·갈래·씨앗·표정·옷 층이 목록과 디스크에 있다, 기준점이 캔버스 안, 층 순서, 예산.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ACCS, BODIES, DECOR3D, FACES, FILE_BYTES, PROPS, SCENES3D, SEEDS3D, MOODS5, MOOD_MAP, accIcon, accKey, artBytes, artFile, bodyKey, cropBox, faceKey,
  layers3d, mobileTier, mood5, packFiles, pickPx, propKey, tierBytes, sceneKeyFor, sceneLayout, seedCrackKey, seedTurnKey, standOnPerch, wornSlots3d, DECOR_SPOTS, decorKey, bandKeyFor, headTop3d
} from './art3d.ts'
import { ART_MOODS } from './characterArt.ts'
import { SPECIES_IDS } from './growth.ts'
import { BG_IDS, DECOR, ITEMS } from './wardrobe.ts'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'art3d')
const inUnit = (v: number) => v >= 0 && v <= 1
const onDisk = (key: string, px: number) => existsSync(join(DIR, artFile(key, px)))

// ── 몸: 4종 × 5단계 × (갈래 2 · 아기 씨앗 4) ──
for (const sp of SPECIES_IDS) for (let st = 1; st <= 5; st++) for (const path of ['a', 'b'] as const) for (let seed = 0; seed < 4; seed++) {
  const k = bodyKey(sp, st, path, seed)
  const b = BODIES[k]
  assert.ok(b, `몸 ${k}`)
  assert.ok(onDisk(k, 512) && onDisk(k, 160), `파일 ${k}`)
  for (const f of ['head', 'face', 'top'] as const) assert.ok(b[f].slice(0, 2).every(inUnit), `${k} ${f} ${b[f]}`)
  assert.ok(b.top[1] < b.head[1], `${k} 새싹이 머리 위`)
  assert.ok(b.face[1] > b.top[1] && b.face[1] < 0.9, `${k} 얼굴 높이 ${b.face}`)
  // 같은 크기 규칙(42 §10.6.1): 발밑 = 아래 10% 근처, 그려진 상자가 위·옆 여백 안
  assert.ok(b.box[3] > 0.84 && b.box[3] <= 0.97, `${k} 바닥 ${b.box}`)
  assert.ok(b.box[1] >= 0.02, `${k} 위 여백 ${b.box}`)
  if (st >= 2 && !(sp === 'frog' && st === 2) && !(sp === 'bee' && st === 2)) assert.ok(b.neck, `${k} 목 자리`)
  assert.ok(b.hand, `${k} 손 자리`)
}
// 단계 1·2는 갈래와 상관없이 같다, 3~5는 다르다
for (const sp of SPECIES_IDS) {
  assert.equal(bodyKey(sp, 2, 'a'), bodyKey(sp, 2, 'b'))
  for (const st of [3, 4, 5]) assert.notEqual(bodyKey(sp, st, 'a'), bodyKey(sp, st, 'b'))
}
assert.equal(bodyKey('frog', 1, 'a', 3), 'frog-1') // 물방울 알은 씨앗 껍질이 없다
assert.equal(bodyKey('otter', 3), 'frog-3a') // 옛 종 id

// ── 얼굴 5 × 4종 × 5단계 ──
for (const sp of SPECIES_IDS) for (let st = 1; st <= 5; st++) for (const m of MOODS5) {
  const k = faceKey(sp, st, m)
  assert.ok(FACES[k], `얼굴 ${k}`); assert.ok(onDisk(k, 512) && onDisk(k, 160), `파일 ${k}`)
}
// 옛 표정 11 → 5(49 결정 ④)
for (const m of ART_MOODS) assert.ok(MOODS5.includes(MOOD_MAP[m]), `표정 ${m}`)
assert.equal(mood5('happy'), 'happy'); assert.equal(mood5('puzzled'), 'think'); assert.equal(mood5('smile'), 'happy'); assert.equal(mood5('wow'), 'wow'); assert.equal(mood5(undefined), 'default')

// ── 옷 18 × 4종 × 단계(아기는 모자·손만) ──
const WEAR = ITEMS.filter((i) => i.slot !== 'bg')
assert.equal(WEAR.length, 18)
for (const sp of SPECIES_IDS) for (let st = 1; st <= 5; st++) for (const it of WEAR) {
  const k = accKey(sp, st, it.id)
  const want = st === 1 ? it.slot === 'hat' || it.slot === 'hand' : !(it.slot === 'neck' && ((sp === 'frog' || sp === 'bee') && st === 2))
  if (!want) { assert.ok(!ACCS[k], `없어야 할 옷 ${k}`); continue }
  assert.ok(ACCS[k], `옷 ${k}`); assert.ok(onDisk(k, 512) && onDisk(k, 160), `파일 ${k}`)
  const [x0, y0, x1, y1] = ACCS[k]
  assert.ok(x1 > x0 && y1 > y0 && [x0, y0, x1, y1].every(inUnit), `${k} 상자 ${ACCS[k]}`)
}
for (const it of WEAR) assert.ok(accIcon(it.id), `옷장 칸 ${it.id}`)

// ── 칸 소품(같은 칸 옷을 입으면 숨는다 — 43 §5.1) ──
for (const [sp, st, slot] of [['frog', 5, 'hat'], ['bee', 4, 'hat'], ['bee', 5, 'hand'], ['worm', 3, 'back']] as const) for (const path of ['a', 'b'] as const) {
  assert.ok(PROPS[propKey(sp, st, path)], `소품 ${sp} ${st}${path}`)
  assert.deepEqual(BODIES[bodyKey(sp, st, path)].props, [slot])
  const bare = layers3d(sp, st, { path }).map((l) => l.kind)
  assert.deepEqual(bare, ['body', 'prop', 'face'])
  const item = WEAR.find((i) => i.slot === slot)!.id
  const worn = layers3d(sp, st, { path, eq: { [slot]: item }, size: 240 })
  assert.ok(!worn.some((l) => l.kind === 'prop'), `${sp} ${st} ${slot} 옷이 소품을 가린다`)
}

// ── 층 순서: 몸 · 소품 · 등 · 얼굴 · 목 · 손 · 모자 ──
const eqAll = { hat: 'straw', neck: 'bowtie', hand: 'mug', back: 'backpack' }
assert.deepEqual(layers3d('snail', 3, { eq: eqAll, size: 240 }).map((l) => l.slot ?? l.kind), ['body', 'back', 'face', 'neck', 'hand', 'hat'])
// 작은 자리(< 64): 모자만
assert.deepEqual(wornSlots3d('snail', 3, { eq: eqAll, size: 30 }), ['hat'])
// 아기: 목·등 칸 없음
assert.deepEqual(wornSlots3d('bee', 1, { eq: eqAll, size: 240 }), ['hand', 'hat'])
// 없는 옷 id는 건너뛴다
assert.deepEqual(wornSlots3d('snail', 3, { eq: { hat: 'nope' } }), [])
// 표정이 얼굴 층 이름을 바꾼다
assert.equal(layers3d('worm', 4, { mood: 'giggle' }).find((l) => l.kind === 'face')!.key, 'worm-4-face-happy')

// ── 자르기·머리 위 ──
for (const sp of SPECIES_IDS) for (let st = 1; st <= 5; st++) {
  const c = cropBox(sp, st, 'bust')
  assert.ok(c.w > 0.25 && c.w <= 1 && c.x >= 0 && c.y >= 0 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, `${sp} ${st} bust ${JSON.stringify(c)}`)
  const h = BODIES[bodyKey(sp, st)].head
  assert.ok(h[0] > c.x && h[0] < c.x + c.w && h[1] > c.y && h[1] < c.y + c.h, `${sp} ${st} 머리가 bust 안`)
  assert.ok(headTop3d(sp, st).y < h[1])
}
assert.deepEqual(cropBox('bee', 3, 'full'), { x: 0, y: 0, w: 1, h: 1 })
assert.equal(pickPx(30), 160); assert.equal(pickPx(250), 512); assert.equal(pickPx(80, 2), 160)

// ── 씨앗: 4 × 12컷 + 금 2단계 ──
for (let s = 0; s < 4; s++) {
  for (let t = 0; t < 12; t++) assert.ok(SEEDS3D.includes(seedTurnKey(s, t)) && onDisk(seedTurnKey(s, t), 320), `씨앗 ${s} ${t}`)
  for (const c of [1, 2]) assert.ok(SEEDS3D.includes(seedCrackKey(s, c)), `금 ${s} ${c}`)
}
assert.equal(seedTurnKey(0, 13), 'seed0-t01'); assert.equal(seedTurnKey(0, -1), 'seed0-t11'); assert.equal(seedCrackKey(2, 9), 'seed2-crack2'); assert.equal(seedCrackKey(2, 0), 'seed2-t00')

// ── 장면: 방 배경 5 + 새벽 + 띠 2 ──
for (const bg of BG_IDS) for (const night of [false, true]) { const k = sceneKeyFor(bg, night); assert.ok(SCENES3D[k] && onDisk(k, 780), `장면 ${bg} ${night} → ${k}`) }
assert.ok(SCENES3D['scene-dawn'])
for (const d of [false, true]) assert.ok(SCENES3D[bandKeyFor(d)] && onDisk(bandKeyFor(d), 1170))
for (const [k, m] of Object.entries(SCENES3D)) assert.ok(m.perch.every(inUnit) && m.unit > 0 && m.aspect > 0, k)
// cover 배치: 칸을 꽉 채우고, 아래를 맞추면 받침이 칸 안에
const L = sceneLayout('scene-day', 390, 844)
assert.ok(L.w >= 390 - 0.01 && L.h >= 844 - 0.01 && Math.abs(L.y + L.h - 844) < 0.01)
assert.ok(L.perchX > 0 && L.perchX < 390 && L.perchY > 0 && L.perchY < 844, JSON.stringify(L))
const st = standOnPerch(L.perchX, L.perchY, 250)
assert.ok(Math.abs(st.top + 250 * 0.9 - L.perchY) < 0.01)

// ── 방 장식 9 ──
for (const d of DECOR) { assert.ok(DECOR3D[decorKey(d.id)] && onDisk(decorKey(d.id), 256), `장식 ${d.id}`); assert.ok(DECOR_SPOTS[d.id]) }

// ── 목록 = 디스크 · 예산(49 §4.4·§12) ──
for (const f of Object.keys(FILE_BYTES)) assert.ok(existsSync(join(DIR, f)), `목록에 있는데 파일 없음 ${f}`)
const all = artBytes()
assert.ok(all < 6.5 * 1024 * 1024, `전체 ${Math.round(all / 1024)} KB`)
// 휴대폰: 기본 묶음 ≤ 2 MB(목표 ≈ 1 MB), 종 묶음 ≤ 1.5 MB, 기본 + 종 묶음이 그 종의 모든 자리를 덮는다
const base = tierBytes('base')
assert.ok(base <= 2 * 1024 * 1024, `기본 묶음 ${Math.round(base / 1024)} KB`)
for (const sp of SPECIES_IDS) {
  const pk = tierBytes('pack', sp)
  assert.ok(pk > 0 && pk <= 1.5 * 1024 * 1024, `${sp} 종 묶음 ${Math.round(pk / 1024)} KB`)
  assert.ok(packFiles(sp).every((f) => f.startsWith(sp + '-') && f.endsWith('@512.webp')))
  for (let st = 1; st <= 5; st++) for (const path of ['a', 'b'] as const) {
    const L = layers3d(sp, st, { path, eq: { hat: 'straw', neck: 'bowtie', hand: 'mug', back: 'backpack' }, size: 240 })
    for (const l of L) {
      const t512 = mobileTier(artFile(l.key, 512)), t160 = mobileTier(artFile(l.key, 160))
      assert.ok(t512 !== 'none' && (t512 === 'base' || t512 === 'pack'), `${l.key} 512 ${t512}`)
      // 내려받기 전 대체: 몸·얼굴·소품·모자는 160이 앱 안에 있다
      if (l.kind !== 'acc' || l.slot === 'hat') assert.equal(t160, 'base', `${l.key} 160`)
    }
  }
}
assert.equal(mobileTier('seed0-t03@320.webp'), 'base'); assert.equal(mobileTier('scene-day@780.webp'), 'base')
assert.equal(mobileTier('snail-1s2@512.webp'), 'base'); assert.equal(mobileTier('snail-3a@512.webp'), 'pack')
assert.equal(mobileTier('bee-3-acc-mug@160.webp'), 'none'); assert.equal(mobileTier('bee-3-acc-straw@160.webp'), 'base'); assert.equal(mobileTier('frog-5a-prop@512.webp'), 'pack')
console.log(`art3d ok — 파일 ${Object.keys(FILE_BYTES).length}개 · 전체 ${Math.round(all / 1024)} KB · 휴대폰 기본 ${Math.round(base / 1024)} KB · 종 묶음 ${SPECIES_IDS.map((s) => Math.round(tierBytes('pack', s) / 1024)).join('/')} KB`)
