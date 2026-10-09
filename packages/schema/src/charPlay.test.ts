// 49 §5.3 만지기 v3 시험: 누르기 판정(깡충·두 번·3번째·간지럼·쉼), 움직임 키, 회전 컷, 착지, 움직임 줄이기
import assert from 'node:assert/strict'
import { DIZZY, GIGGLE, HOP, IDLE, PET, PULSE, SPIN, WOBBLE, landAt, newTapState, nextIdleMs, onTap, pickIdle, sample, spinFrame, track, type Motion } from './charPlay.ts'

const seq = (times: number[], reduced = false) => { let s = newTapState(); return times.map((t) => { const r = onTap(s, t, reduced); s = r.state; return r.motion.kind }) }
// 천천히 누르기: 깡충 · 깡충 · 한 바퀴(3번째) · 깡충 …
assert.deepEqual(seq([0, 2000, 4000, 6000, 8000, 10000]), ['hop', 'hop', 'spin', 'hop', 'hop', 'spin'])
// 두 번 연달아(< 300ms) = 한 바퀴
assert.deepEqual(seq([0, 200]), ['hop', 'spin'])
// 빠르게 4번 = 간지럼, 그 뒤 4초 동안은 깡충만(되풀이 막기)
assert.deepEqual(seq([0, 500, 900, 1100]).slice(-1), ['giggle'])
const g = seq([0, 500, 900, 1100, 1300, 1500, 1700, 1900])
assert.equal(g.filter((k) => k === 'giggle').length, 1)
assert.ok(g.slice(4).every((k) => k === 'hop'))
// 움직임 줄이기 = 맥박뿐
assert.deepEqual(seq([0, 100, 200, 300], true), ['pulse', 'pulse', 'pulse', 'pulse'])
assert.equal(pickIdle(0.9, true).kind, 'blink')

// 움직임 키: 0과 1에서 제자리, 깡충 ≈ 500ms, 한 바퀴는 공중에서 돈다
for (const m of [HOP, SPIN, GIGGLE, PET, WOBBLE, DIZZY, PULSE, ...Object.values(IDLE)] as Motion[]) {
  const a = sample(m, 0), b = sample(m, 1)
  assert.ok(Math.abs(b.y) < 1e-6 && Math.abs(b.sx - 1) < 0.04 && Math.abs(b.sy - 1) < 0.04 && Math.abs(b.rot) < 1e-6, `${m.kind} 끝 ${JSON.stringify(b)}`)
  assert.ok(Math.abs(a.y) < 0.07, m.kind)
  for (let t = 0; t <= 1; t += 0.05) { const v = sample(m, t); assert.ok(v.y <= 0.001 && v.y > -0.4 && v.sx > 0.8 && v.sx < 1.2 && Math.abs(v.rot) <= 10.5, `${m.kind} ${t}`) }
  assert.ok(m.keys[0].t === 0 && m.keys[m.keys.length - 1].t === 1)
}
assert.ok(HOP.ms >= 450 && HOP.ms <= 560)
assert.ok(sample(HOP, 0.16).sy < 0.92, '준비 웅크림'); assert.ok(sample(HOP, 0.42).sy > 1.05 && sample(HOP, 0.42).y < -0.1, '위로 늘어남'); assert.ok(sample(HOP, 0.66).sy < 0.9, '착지 눌림')
assert.equal(spinFrame(SPIN, 0.1, 12), 0); assert.equal(spinFrame(SPIN, 0.9, 12), 0)
const frames = new Set<number>(); for (let t = 0.22; t < 0.72; t += 0.01) frames.add(spinFrame(SPIN, t, 12))
assert.equal(frames.size, 12)
for (let t = SPIN.spin!.from; t <= SPIN.spin!.to; t += 0.02) assert.ok(sample(SPIN, t).y < -0.02 || t > 0.7, `돌 때는 공중 ${t}`)
assert.equal(landAt(HOP), Math.round(0.66 * HOP.ms)); assert.ok(landAt(SPIN)! > SPIN.spin!.to * SPIN.ms); assert.equal(landAt(GIGGLE), null)
const tr = track(HOP, 'y', 0); assert.equal(tr.reduce((a, b) => a + b.ms, 0), HOP.ms)
assert.ok(nextIdleMs(0) === 8000 && nextIdleMs(1) === 15000)
console.log('charPlay ok')
