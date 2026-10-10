// 49 §7.2 말풍선 따라가기 계산 시험
import assert from 'node:assert/strict'
import { applyTf, clampBubble, FOLLOW, headShift, springStep, type Tf } from './follow.ts'

const I: Tf = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 }
const near = (a: number, b: number, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`)

// 아무 움직임 없음 → 0
const z = headShift(200, 50, 0.9, I, I, I)
near(z.x, 0); near(z.y, 0)
// 깡충(몸 translateY −32px) → 머리도 −32
near(headShift(200, 50, 0.9, { ...I, ty: -32 }, I, I).y, -32)
// 무대 깡충 hopY −14 + 끌기 (30, −10)
const d = headShift(200, 50, 0.9, I, { ...I, tx: 30, ty: -10 }, { ...I, ty: -14 })
near(d.x, 30); near(d.y, -24)
// 기울기: 발(50%·90%) 기준 +10° → 머리는 오른쪽으로(발에서 머리까지 130px × sin10°)
const r = headShift(200, 50, 0.9, { ...I, rot: 10 }, I, I)
near(r.x, 130 * Math.sin(Math.PI / 18), 1e-6); assert.ok(r.y > 0) // 기울면 살짝 내려옴
// 세로로 늘기(scaleY 1.1, 발 기준) → 머리가 13px 위로
near(headShift(200, 50, 0.9, { ...I, sy: 1.1 }, I, I).y, -13)
// 무대 숨쉬기(바닥 기준 scaleY 0.972) → 머리 150 × 0.028 = 4.2 아래로
near(headShift(200, 50, 0.9, I, I, { ...I, sy: 0.972 }).y, 4.2)
// applyTf: 가운데 기준 90° 회전
const p = applyTf(10, 0, 0, 0, 0, 0, 90, 1, 1); near(p.x, 0); near(p.y, 10)

// 스프링: 목표로 가고, 살짝 넘쳤다 돌아오며(감쇠비 0.7), 오래 지나면 닿는다
let s = { pos: 0, vel: 0 }, peak = 0
for (let i = 0; i < 120; i++) { s = springStep(s.pos, s.vel, 100, 1 / 60); peak = Math.max(peak, s.pos) }
near(s.pos, 100, 0.05)
assert.ok(peak > 100 && peak < 110, `peak ${peak}`)
// 0.1초 뒤에는 아직 다 못 감(늦음이 보임)
let q = { pos: 0, vel: 0 }
for (let i = 0; i < 6; i++) q = springStep(q.pos, q.vel, 100, 1 / 60)
assert.ok(q.pos > 20 && q.pos < 90, `0.1초 ${q.pos}`)
// 긴 멈춤(dt 1초)도 maxDt로 잘라 튀지 않음
const j = springStep(0, 0, 100, 1); assert.ok(j.pos < 100)
assert.equal(FOLLOW.maxDt, 1 / 30)

// 가두기: 화면 375, 말풍선 200 — 가운데 187.5에서 오른쪽으로 120 끌면 오른쪽 끝(375−12−100 = 263)에 멈추고 꼬리가 머리 쪽(+44.5)으로
const c = clampBubble(187.5, 300, 120, 0, 200, 40, 375, 50)
near(c.x, 263 - 187.5); near(c.tail, 307.5 - 263)
// 꼬리는 말풍선 모서리 18 안쪽까지만(±82)
near(clampBubble(187.5, 300, 300, 0, 200, 40, 375, 50).tail, 82)
// 왼쪽 끝
near(clampBubble(187.5, 300, -150, 0, 200, 40, 375, 50).x, 112 - 187.5)
// 가운데면 그대로, 꼬리 0
const m = clampBubble(187.5, 300, 10, -5, 200, 40, 375, 50); near(m.x, 10); near(m.y, -5); near(m.tail, 0)
// 위로: 쉬는 자리 위끝 80에서 −60 올라가면 위 한계 50에서 멈춤
near(clampBubble(187.5, 80, 0, -60, 200, 40, 375, 50).y, -30)
// 크기를 아직 모르면 가두지 않음
const u = clampBubble(187.5, 80, 999, -999, 0, 0, 375, 50); near(u.x, 999); near(u.y, -999)
console.log('follow ok')
