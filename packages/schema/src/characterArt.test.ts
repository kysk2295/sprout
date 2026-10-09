// 42 §8 · 43 §16 그림 데이터 시험: 단계마다 다른 실루엣·크기, 작은 그림에서 빠지는 것, bust 칸, 옷 기준점, 실루엣·잠김, 휴대폰용 글
import assert from 'node:assert/strict'
import { anchors, art, BACK, compose, forNative, HAND, HAT, hatchTop, itemIcon, NECK, newPartOf, PATHS, FILL, artScale, artTop, scene, seedArt, standBottom, titleOf, wearable, ART_MOODS, decorIcon, trophyIcon, bitSvg } from './characterArt.ts'
import { ITEMS, DECOR } from './wardrobe.ts'
import { SPECIES_IDS } from './growth.ts'
import { parseSvg, rnProps } from './svgTree.ts'

const bad = (s: string) => /NaN|undefined|null|\[object/.test(s)

// ── 4종 × 5단계 × 갈래 2 × 얼굴 전부: 깨진 값 없이 그린다 ──
for (const sp of SPECIES_IDS) for (let st = 1; st <= 5; st++) for (const path of ['a', 'b'] as const) for (const mood of ART_MOODS) {
  const s = art(sp, st, { path, mood, lv: 20 })
  assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), `${sp} ${st}`)
  assert.ok(!bad(s), `${sp} ${st} ${path} ${mood}: ${s.match(/.{40}(NaN|undefined|null).{20}/)?.[0]}`)
}

// ── 단계마다 실루엣(그림 글)이 다르다 · 같은 종 안에서 20장이 모두 다르다 ──
for (const sp of SPECIES_IDS) {
  const bodies = [1, 2, 3, 4, 5].map((st) => compose(sp, st, { mood: 'smile' }).inner)
  assert.equal(new Set(bodies).size, 5, sp)
}
// 갈래 B는 친구부터 다르다(1·2단계는 같다)
for (const sp of SPECIES_IDS) {
  assert.equal(compose(sp, 2, { path: 'a' }).inner, compose(sp, 2, { path: 'b' }).inner)
  for (const st of [3, 4, 5]) assert.notEqual(compose(sp, st, { path: 'a' }).inner, compose(sp, st, { path: 'b' }).inner, `${sp} ${st}`)
}

// ── 크기: 단계마다 같은 상자를 채운다(2026-10-09 사용자 결정 "항상 같은 크기"). fit 인자와 상관없이 같은 배율 ──
for (const sp of ['snail', 'bee', 'worm', 'frog'] as const) for (let st = 1; st <= 5; st++) {
  const k = artScale(sp, st)
  assert.ok(k > 0.8 && k < 1.45, `${sp} ${st} 배율 ${k}`)
  assert.ok(art(sp, st).includes(`scale(${k})`) && art(sp, st, { fit: false }).includes(`scale(${k})`), `${sp} ${st} fit 무관`)
  assert.ok(artTop(sp, st) >= 11.9 && artTop(sp, st) <= 24, `${sp} ${st} 꼭대기 ${artTop(sp, st)}`)
}
assert.equal(FILL.bee.length, 6)
assert.equal(artScale('squirrel', 1), artScale('bee', 1)) // 옛 종 id도 같은 표
assert.ok(seedArt().includes('scale(1)') && seedArt({ fit: false }).includes('scale(1)'))
assert.ok(hatchTop('frog').includes(`scale(${artScale('frog', 1)})`))

// ── 작은 그림(≤ 40): bust 자르기 · 무늬 점 빠짐 · 목·손·등 옷 안 그림, 모자는 보임 ──
const eqAll = { hat: 'straw', neck: 'bowtie', hand: 'mug', back: 'backpack' }
const big = compose('snail', 3, { size: 240, lv: 9, eq: eqAll })
const tiny = compose('snail', 3, { size: 30, lv: 9, eq: eqAll })
assert.equal(big.crop, 'full'); assert.equal(tiny.crop, 'bust')
assert.equal(big.d, 'full'); assert.equal(tiny.d, 'small')
assert.deepEqual(big.worn, { hat: true, neck: true, hand: true, back: true })
assert.deepEqual(tiny.worn, { hat: true, neck: false, hand: false, back: false })
assert.ok(art('snail', 3, { size: 30 }).includes('viewBox="') && !art('snail', 3, { size: 30 }).includes('viewBox="0 0 120 120"'))
assert.ok(!art('bee', 4, { size: 30 }).includes('c-aura') && !art('bee', 4, { size: 30 }).includes('c-mat'))
assert.ok(art('bee', 5, { size: 240 }).includes('c-aura'))
assert.ok(!art('bee', 5, { size: 240, noAura: true }).includes('c-aura'))
// 무늬 점: 큰 그림에만, 짝수 레벨마다(Lv 12 = 6점)
const dots = (s: string) => (s.match(/r="1\.1" fill="#E9A56F"/g) ?? []).length
assert.equal(dots(compose('snail', 4, { lv: 12 }).inner), 6)
assert.equal(dots(compose('snail', 4, { lv: 12, size: 30 }).inner), 0)
// 새싹 잎눈: 단계 안 레벨마다(Lv 6 → 0, 9 → 3)
const buds = (lv: number) => (compose('worm', 3, { lv }).inner.match(/c-sprout[\s\S]*?<\/g>/)![0].match(/<path d="M[^"]*c/g) ?? []).length
assert.equal(buds(9) - buds(6), 3)

// bust 칸: 머리 중심 기준 정사각형(새싹·모자가 보이게 머리 위 13, 아래 8)
for (const sp of SPECIES_IDS) for (let st = 1; st <= 5; st++) {
  const vb = art(sp, st, { size: 30 }).match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
  assert.equal(vb.length, 4); assert.ok(vb[2] > 10 && vb[2] === vb[3], `${sp} ${st} ${vb}`)
}

// ── 옷 기준점: 4종 × 5단계, 상자 안 · 머리 꼭대기 < 목 < 등 · 23개가 모두 그려진다 ──
for (const sp of SPECIES_IDS) for (let st = 1; st <= 5; st++) {
  const A = anchors(st, sp)
  for (const k of ['top', 'hy', 'hr', 'ny', 'hx', 'hy2', 'by', 'brx', 'bry'] as const) assert.ok(Number.isFinite(A[k]), `${sp} ${st} ${k}`)
  assert.ok(A.top >= 0 && A.top < A.hy && A.hy < A.ny && A.ny <= A.by + 2 && A.by < 112, `${sp} ${st} ${JSON.stringify(A)}`)
  for (const id of Object.keys(HAT)) { const h = HAT[id](A); assert.ok(h.tip < A.hy && h.tip > -20, `${id} tip ${sp} ${st}`) } // 새싹이 모자 위로 뚫고 나온다
  for (const it of ITEMS) if (it.slot !== 'bg') {
    const s = art(sp, st, { eq: { [it.slot]: it.id }, size: 240 })
    assert.ok(!bad(s), `${it.id} on ${sp} ${st}`)
  }
}
assert.equal(anchors(3, 'snail').dx, -10) // 달팽이 머리는 가운데서 비켜난다(머리 층만 옮김)
// 같은 칸에 옷을 입히면 그 칸의 진화 소품이 숨는다(꿀벌 4단계 꿀 국자 → 머그컵)
const held = compose('bee', 4, {}).inner, mugged = compose('bee', 4, { eq: { hand: 'mug' } }).inner
assert.ok(held.includes('#D98A12') && !mugged.includes('#D98A12'))
// 등 옷은 애벌레 잎 가방(pack)을 덮지만 꿀벌 날개(back = 몸)는 남는다
assert.ok(compose('worm', 3, {}).inner.includes('c-swing') && !compose('worm', 3, { eq: { back: 'wings' } }).inner.includes('M84 76 C79 58'))
assert.ok(compose('bee', 3, { eq: { back: 'backpack' } }).inner.includes('c-flap'))
// 모든 옷(배경 빼고)에 그림이 있다
for (const it of ITEMS) assert.ok(it.slot === 'bg' || wearable(it.id), it.id)
assert.equal(Object.keys(HAT).length + Object.keys(NECK).length + Object.keys(HAND).length + Object.keys(BACK).length, ITEMS.filter((i) => i.slot !== 'bg').length)
// 아기는 목·등 옷을 안 그린다(씨앗 껍질 안)
assert.deepEqual(compose('bee', 1, { eq: eqAll, size: 240 }).worn, { hat: true, neck: false, hand: true, back: false })

// ── 실루엣·잠김: 한 색, 하이라이트·그림자·defs 없음 ──
const sil = art('frog', 4, { sil: true })
assert.ok(!sil.includes('<defs>') && !sil.includes('c-gl') && !sil.includes('c-shadow') && !sil.includes('url(#'))
assert.deepEqual([...new Set(sil.match(/(?:fill|stroke)="(?!none)[^"]*"/g)!.map((x) => x.split('=')[1]))], ['"#FFFFFF"'])
assert.ok(art('frog', 4, { lock: true }).includes('#C9D0CB'))
assert.ok(itemIcon('santa', { locked: true }).includes('#C9D0CB') && !itemIcon('santa', { locked: true }).includes('url(#'))

// ── 그라데이션 id: 그림마다 defs가 안에 있고, uid로 앞머리를 바꾼다 ──
const a1 = art('bee', 3, { uid: 'one' }), a2 = art('bee', 3, { uid: 'two' })
const refs = (s: string) => [...s.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])
const defs = (s: string) => new Set([...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))
for (const s of [a1, a2, scene({ bg: 'sunset', decor: DECOR.map((d) => d.id), trophies: [{ k: 'cup' }] }), seedArt({ cracks: 3 }), hatchTop('snail'), itemIcon('lantern'), decorIcon('mushlamp'), trophyIcon({ k: 'medal', n: 30 })]) {
  const d = defs(s); for (const r of refs(s)) assert.ok(d.has(r), `missing def ${r}`)
}
assert.ok(refs(a1).every((r) => r.startsWith('one')) && refs(a2).every((r) => r.startsWith('two')))
assert.ok(!art('bee', 3, { uid: ':r1:' }).includes(':r1:')) // React useId 글자는 걸러진다

// ── 휴대폰용(rn): class·style을 뺀다(SvgXml이 모르는 CSS) ──
const rn = art('worm', 5, { rn: true, live: true })
assert.ok(!rn.includes('class=') && !rn.includes('style=') && rn.includes('<defs>'))
assert.equal(forNative('<g class="a" style="x:1"></g>'), '<g></g>')

// ── 옛 종 id도 그린다(서버 마이그레이션 전) ──
assert.equal(art('otter', 3), art('frog', 3))
assert.equal(art('turtle', 2, { size: 30 }), art('snail', 2, { size: 30 }))

// ── 이름 ──
assert.equal(titleOf('snail', 1), '씨앗 달팽이')
assert.equal(titleOf('worm', 5, 'b'), '노을날개 나비')
assert.equal(titleOf('frog', 3, 'a'), PATHS.frog.a.t[0])
assert.equal(newPartOf('bee', 4, 'b'), '데이지 관')
assert.equal(newPartOf('snail', 2), '배발 · 나선 껍데기')
for (const sp of SPECIES_IDS) for (let i = 0; i < 16; i++) assert.ok(bitSvg(sp, i).startsWith('<svg'))

// ── 무대에 세우기: 장면 아래 120이 보이는 칸에서 상자 bottom ──
assert.equal(standBottom(600, 420, 240), 100)
assert.equal(standBottom(390, 392, 200), +(120 * Math.max(390 / 600, 392 / 420) - 200 / 12).toFixed(2))

// ── 휴대폰 나무 변환: 그림 글이 빠짐없이 요소 나무가 된다(요소 수 = 여는 태그 수) ──
const count = (n: ReturnType<typeof parseSvg>): number => 1 + n.children.reduce((a, c) => a + count(c), 0)
for (const s of [art('bee', 5, { rn: true, eq: eqAll }), scene({ trophies: [{ k: 'medal', n: 7 }], rn: true }), seedArt({ rn: true, cracks: 2 })]) {
  const t = parseSvg(s)
  assert.equal(t.tag, 'svg')
  assert.equal(count(t), (s.match(/<[a-zA-Z]/g) ?? []).length)
}
assert.equal(parseSvg(scene({ trophies: [{ k: 'medal', n: 30 }] })).children.flatMap(function walk(n): any[] { return [n, ...n.children.flatMap(walk)] }).find((n: any) => n.tag === 'text')!.text, '30')
assert.deepEqual(rnProps({ 'stroke-width': '2', class: 'x', 'stop-color': '#fff', 'aria-label': 'a', d: 'M0 0' }), { strokeWidth: '2', stopColor: '#fff', d: 'M0 0' })

console.log('characterArt ok')
