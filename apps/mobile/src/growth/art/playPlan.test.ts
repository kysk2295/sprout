// 49 §7.1 만지기 v3(휴대폰) 순수 계산 시험
import assert from 'node:assert/strict'
import { GIGGLE, HOP, PET, SPIN, WOBBLE, IDLE } from '@sprout/schema/charPlay'
import { dustBits, faceHoldMs, petBit, shouldStart, spinCut, steps, withStrip } from './playPlan.ts'

// ── 겹치기: 진행 중보다 높을 때만 끊고 시작 ──
assert.equal(shouldStart(null, 'hop'), true)
assert.equal(shouldStart('hop', 'hop'), false) // 깡충 중 또 깡충 = 버림
assert.equal(shouldStart('hop', 'spin'), true) // 두 번 연달아 = 깡충을 끊고 한 바퀴
assert.equal(shouldStart('spin', 'hop'), false)
assert.equal(shouldStart('spin', 'giggle'), true)
assert.equal(shouldStart('minihop', 'hop'), true) // 딴짓은 누르기에 진다
assert.equal(shouldStart('hop', 'look'), false)

// ── 띠 없으면 한 바퀴 대신 깡충 ──
assert.equal(withStrip(SPIN, false), HOP)
assert.equal(withStrip(SPIN, true), SPIN)
assert.equal(withStrip(GIGGLE, false), GIGGLE)

// ── 키 → withSequence 단계: 시간 합 = 움직임 길이, 기본값으로 끝남 ──
for (const m of [HOP, SPIN, GIGGLE, WOBBLE, IDLE.minihop, IDLE.stretch]) {
  for (const [f, d] of [['y', 0], ['sx', 1], ['sy', 1], ['rot', 0]] as const) {
    const s = steps(m, f, d)
    assert.ok(s.length >= 1)
    assert.equal(s[s.length - 1].v, d, `${m.kind} ${f} 끝`)
    if (m.keys.some((k) => k[f] !== undefined)) assert.ok(Math.abs(s.reduce((a, b) => a + b.ms, 0) - m.ms) <= 70, `${m.kind} ${f} 길이`)
  }
}
assert.deepEqual(steps(HOP, 'rot', 0), [{ v: 0, ms: 120 }]) // 키 없음 → 제자리로 짧게
// 쓰다듬기 되풀이: 끝에 기본값을 덧붙이지 않아 처음과 같은 값으로 이어진다
const pr = steps(PET, 'sy', 1, true)
assert.equal(pr[0].v, pr[pr.length - 1].v)
assert.equal(pr.reduce((a, b) => a + b.ms, 0), PET.ms)

// ── 회전 띠 컷: 돌기 구간(22%~72%)에서만 0 → 11, 밖은 -1 ──
const { from, to } = SPIN.spin!
assert.equal(spinCut(0, from, to, 12), -1)
assert.equal(spinCut(from, from, to, 12), -1)
assert.equal(spinCut(from + 0.001, from, to, 12), 0)
assert.equal(spinCut((from + to) / 2, from, to, 12), 6)
assert.equal(spinCut(to - 0.0001, from, to, 12), 11)
assert.equal(spinCut(to, from, to, 12), -1)
assert.equal(spinCut(0.5, from, to, 0), -1)
let prev = -1
for (let t = from + 0.001; t < to; t += 0.01) { const c = spinCut(t, from, to, 12); assert.ok(c >= prev && c <= 11); prev = c }

// ── 얼굴 유지 ──
assert.equal(faceHoldMs(HOP), 700)
assert.equal(faceHoldMs(SPIN), 980)

// ── 흙·잎 조각 4~6개, 양옆으로 ──
for (let sd = 0; sd < 9; sd++) {
  const b = dustBits(sd)
  assert.ok(b.length >= 4 && b.length <= 6)
  assert.ok(b.some((x) => x.dx < 0) && b.some((x) => x.dx > 0))
  assert.ok(b.every((x) => x.dy < 0 && Math.abs(x.dx) < 0.5))
}
assert.deepEqual(dustBits(3), dustBits(3))
// 쓰다듬기 조각: 하트·반짝 번갈아
assert.equal(petBit(0).kind, 'heart'); assert.equal(petBit(1).kind, 'spark')
assert.ok(petBit(0).dx < 0 && petBit(1).dx > 0)

console.log('playPlan ok')
