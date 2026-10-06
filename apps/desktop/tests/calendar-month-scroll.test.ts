// 06 §5.1 월 보기 세로 스크롤(research 17 §17): 주 번호·달의 주 수·제목 달·멈춤 맞춤·그릴 범위·데이터 범위
import assert from 'node:assert/strict'
import { EPOCH, monthAtCenter, monthDataRange, monthTopWeek, snapTop, TOTAL_WEEKS, weekAt, weekIndexOf, weeksInMonth, windowRows } from '../src/renderer/src/lib/monthScroll'
import { rangeOf } from '../src/renderer/src/lib/calendar'

assert.equal(weekIndexOf(EPOCH), 0)
assert.equal(weekAt(0), EPOCH)
assert.equal(weekIndexOf('2000-01-08'), 0) // 토요일까지 같은 주(일요일 시작, 2026-10-06)
assert.equal(weekIndexOf('2000-01-09'), 1)
const w = weekIndexOf('2026-10-06')
assert.equal(weekAt(w), '2026-10-04')
assert.ok(weekIndexOf('2060-12-31') < TOTAL_WEEKS)

// 주 수는 rangeOf('month')와 같다
for (const ym of ['2026-10', '2025-06', '2026-02', '2027-02', '2025-05']) {
  assert.equal(weeksInMonth(ym), rangeOf('month', `${ym}-01`).days.length / 7, ym)
}
assert.equal(weeksInMonth('2025-08'), 6) // 7/27~9/6
assert.equal(weeksInMonth('2026-10'), 5)
assert.equal(weekAt(monthTopWeek('2025-08')), '2025-07-27')

// 제목 달 = 화면 가운데 줄(수요일)의 달 — 틱틱 영상 f0009 · f0016과 같은 결과
const H = 120
const view = 6 * H
const topOf = (d: string) => weekIndexOf(d) * H
assert.equal(monthAtCenter(topOf('2025-05-12'), view, H), '2025-06') // 5/12~6/22이 보이면 June
assert.equal(monthAtCenter(topOf('2025-05-05'), view, H), '2025-05') // 5/5~6/15이면 May
assert.equal(monthAtCenter(topOf('2025-05-26'), view, H), '2025-06') // 그 달 첫 주가 맨 위면 그 달
assert.equal(monthAtCenter(topOf('2026-09-28'), 5 * H, H), '2026-10')

// 멈춤 맞춤: 가장 가까운 주, 휠 한 칸은 움직인 방향의 다음 주로
assert.equal(snapTop(130, 0, H, false), 120)
assert.equal(snapTop(50, 0, H, false), 0) // 트랙패드로 조금 → 제자리
assert.equal(snapTop(40, 0, H, true), 120) // 휠 한 칸(40px) → 다음 주
assert.equal(snapTop(240 - 40, 240, H, true), 120) // 위로 한 칸 → 이전 주
assert.equal(snapTop(241, 240, H, true), 240) // 2px 이하 떨림은 무시
assert.equal(snapTop(400, 0, H, true), 360) // 크게 움직였으면 가장 가까운 주
assert.equal(snapTop(360, 360, H, false), 360)

// 그릴 범위: 보이는 주 + 위아래 2주
assert.deepEqual(windowRows(1200, 600, 120), [8, 17])
assert.deepEqual(windowRows(0, 600, 120), [0, 7])

// 데이터 범위: 기준 달 앞뒤 6주, 날짜 목록은 빠짐없이
const r = monthDataRange('2026-10-15')
assert.equal(r.from, '2026-08-16')
assert.equal(r.to, '2026-12-12')
assert.equal(r.days[0], r.from)
assert.equal(r.days[r.days.length - 1], r.to)
assert.equal(r.days.length % 7, 0)

console.log('calendar-month-scroll ok')
