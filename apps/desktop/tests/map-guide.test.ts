// 34 §2 첫 둘러보기 — 2026-10-05 사용자 앱 버그: 점검 모드로 처음 열자 1단계 대상(지도 본문)이 없어 카드가 -9999px에 놓이고 막만 남아 지도 전체가 막혔다.
import assert from 'node:assert/strict'
import { placeTourCard, shouldAutoTour } from '../src/renderer/src/components/map/tourLayout'

const base = { loaded: true, done: false, closedThisRun: false, open: false }
assert.equal(shouldAutoTour({ ...base, mode: 'plan' }), true)
assert.equal(shouldAutoTour({ ...base, mode: 'review' }), false, '점검에선 저절로 안 뜸')
assert.equal(shouldAutoTour({ ...base, mode: 'tidy' }), false, '정리에선 저절로 안 뜸')
assert.equal(shouldAutoTour({ ...base, mode: 'plan', done: true }), false)
assert.equal(shouldAutoTour({ ...base, mode: 'plan', closedThisRun: true }), false)
assert.equal(shouldAutoTour({ ...base, mode: 'plan', loaded: false }), false)

// 대상이 없으면 화면 가운데 — 언제나 화면 안(막만 남는 일 없음)
const view = { W: 1378, H: 884 }, card = { w: 300, h: 180 }
const c = placeTourCard(null, card, view)
assert.deepEqual(c, { left: (1378 - 300) / 2, top: (884 - 180) / 2 })
for (const v of [{ W: 400, H: 300 }, { W: 200, H: 120 }]) {
  const p = placeTourCard(null, card, v)
  assert.ok(p.left >= 8 && p.top >= 8, `작은 창도 화면 안: ${JSON.stringify(p)}`)
}
// 대상 아래 → 자리 없으면 위 → 그것도 없으면 안쪽 아래
assert.deepEqual(placeTourCard({ left: 100, top: 100, width: 200, height: 40 }, card, view), { left: 50, top: 154 })
assert.equal(placeTourCard({ left: 100, top: 700, width: 200, height: 40 }, card, view).top, 700 - 14 - 180)
assert.equal(placeTourCard({ left: 0, top: 50, width: 1378, height: 820 }, card, view).top, 50 + 820 - 180 - 28)
// 화면 밖 대상도 카드는 화면 안으로
const off = placeTourCard({ left: 1360, top: 870, width: 400, height: 400 }, card, view)
assert.ok(off.left <= 1378 - 300 - 8 && off.top <= 884 - 180 - 8)
console.log('map-guide ok')
