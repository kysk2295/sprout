// 31 작업 지도 v3 §2 타임라인 — 날짜 ↔ x, 배율, 막대 모양(종일·시각·시각만), 끌기 붙기(옮기기·기간), 빈 곳 클릭 초안,
// 줄 배치·가상 스크롤, 순서 화살표 어긋남, 날짜 머리, 만료 판단, 할일 정렬 칸 → 일 배율 시각 놓기.
import assert from 'node:assert/strict'
import {
  arrowsOf, barOf, DAY_MIN, DAY_PX, draftAt, dragDates, fromMin, headCells, isOverdue, keepCenter, minOf, nextScale, pageDays, rangeLabel,
  rowAt, rowBoxes, snapUnit, toMin, visibleRange, weekHead, windowAround, xOf
} from '../src/renderer/src/lib/timeline'
import { scheduledDrop } from '../src/renderer/src/lib/calendarDrop'

const O = '2026-10-01'
// ── 날짜 ↔ 분 ↔ x ──
assert.equal(toMin('2026-10-01', O), 0)
assert.equal(toMin('2026-10-02', O), DAY_MIN)
assert.equal(toMin('2026-10-02T06:30', O), DAY_MIN + 390)
assert.equal(fromMin(DAY_MIN + 390, O), '2026-10-02T06:30')
assert.equal(xOf(DAY_MIN, 'week'), 44)
assert.equal(xOf(60, 'day'), 12) // 일 배율 = 시간당 12px
assert.equal(xOf(DAY_MIN * 2, 'month'), 28)
assert.equal(minOf(44, 'week'), DAY_MIN)
assert.deepEqual(DAY_PX, { day: 288, week: 44, month: 14 })
assert.equal(snapUnit('day', true), 15)
assert.equal(snapUnit('day', false), DAY_MIN)
assert.equal(snapUnit('week', true), DAY_MIN)
assert.deepEqual(windowAround('2026-10-05', 'day'), { from: '2026-09-14', days: 43 })
assert.equal(pageDays(440, 'week'), 10)
assert.equal(nextScale('day', -1), 'day')
assert.equal(nextScale('week', 1), 'month')

// ── 막대 모양 (31 §2.2) ──
// 종일 기간: 시작일 0시 ~ 마감일 24시(마감일 포함)
assert.deepEqual(barOf({ id: 'a', start_at: '2026-10-05', due_at: '2026-10-07' }, 'week', O), { start: 4 * DAY_MIN, end: 7 * DAY_MIN, allDay: true, point: false })
// 종일 하루(시작 없음)
assert.deepEqual(barOf({ id: 'a', start_at: null, due_at: '2026-10-05' }, 'month', O), { start: 4 * DAY_MIN, end: 5 * DAY_MIN, allDay: true, point: false })
// 시각 기간: 일 배율은 그 시각 그대로, 주는 날 단위로
assert.deepEqual(barOf({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T12:30' }, 'day', O), { start: 4 * DAY_MIN + 600, end: 4 * DAY_MIN + 750, allDay: false, point: false })
assert.deepEqual(barOf({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-06T12:30' }, 'week', O), { start: 4 * DAY_MIN, end: 6 * DAY_MIN, allDay: false, point: false })
// 시각만: 일 배율 = 마감에 끝나는 1시간, 주 = 그날 하루
assert.deepEqual(barOf({ id: 'a', start_at: null, due_at: '2026-10-05T15:00' }, 'day', O), { start: 4 * DAY_MIN + 840, end: 4 * DAY_MIN + 900, allDay: false, point: true })
assert.deepEqual(barOf({ id: 'a', start_at: null, due_at: '2026-10-05T15:00' }, 'week', O), { start: 4 * DAY_MIN, end: 5 * DAY_MIN, allDay: false, point: false })
// 날짜 없음 = 축에 없음(할일 정렬 칸)
assert.equal(barOf({ id: 'a', start_at: null, due_at: null }, 'week', O), null)

// ── 끌기 (31 §2.5) ──
const D = DAY_MIN
// 종일 옮기기: 기간 유지
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05', due_at: '2026-10-07' }, 'move', 2 * D + 100, 'week'), { id: 'a', start_at: '2026-10-07', due_at: '2026-10-09' })
// 반 칸 못 미치면 그대로(하루 단위로 붙음)
assert.equal(dragDates({ id: 'a', start_at: null, due_at: '2026-10-05' }, 'move', 0.4 * D, 'week'), null)
assert.deepEqual(dragDates({ id: 'a', start_at: null, due_at: '2026-10-05' }, 'move', 0.6 * D, 'month'), { id: 'a', start_at: null, due_at: '2026-10-06' })
// 오른쪽 가장자리: 하루짜리 → 기간이 생긴다
assert.deepEqual(dragDates({ id: 'a', start_at: null, due_at: '2026-10-05' }, 'end', 2 * D, 'week'), { id: 'a', start_at: '2026-10-05', due_at: '2026-10-07' })
// 왼쪽 가장자리: 시작만
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05', due_at: '2026-10-07' }, 'start', -1 * D, 'week'), { id: 'a', start_at: '2026-10-04', due_at: '2026-10-07' })
// 최소 한 단위: 끝을 시작보다 앞으로 끌면 하루짜리로(시작 비움)
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05', due_at: '2026-10-07' }, 'end', -5 * D, 'week'), { id: 'a', start_at: null, due_at: '2026-10-05' })
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05', due_at: '2026-10-07' }, 'start', 9 * D, 'week'), { id: 'a', start_at: null, due_at: '2026-10-07' })
// 시각 할 일, 주 배율: 날짜만 옮기고 시각은 그대로
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' }, 'move', D, 'week'), { id: 'a', start_at: '2026-10-06T10:00', due_at: '2026-10-06T11:00' })
// 시각 할 일, 일 배율: 15분 단위
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' }, 'move', 37, 'day'), { id: 'a', start_at: '2026-10-05T10:30', due_at: '2026-10-05T11:30' })
assert.equal(dragDates({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' }, 'move', 6, 'day'), null)
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' }, 'end', 45, 'day'), { id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:45' })
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' }, 'end', -120, 'day'), { id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T10:15' })
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' }, 'start', 30, 'day'), { id: 'a', start_at: '2026-10-05T10:30', due_at: '2026-10-05T11:00' })
// 시각만(시작 없음), 일 배율: 옮기면 마감만, 가장자리면 시작이 생긴다(1시간 막대 그대로)
assert.deepEqual(dragDates({ id: 'a', start_at: null, due_at: '2026-10-05T15:00' }, 'move', 60, 'day'), { id: 'a', start_at: null, due_at: '2026-10-05T16:00' })
assert.deepEqual(dragDates({ id: 'a', start_at: null, due_at: '2026-10-05T15:00' }, 'end', 30, 'day'), { id: 'a', start_at: '2026-10-05T14:00', due_at: '2026-10-05T15:30' })
// 자정을 넘겨 옮기기
assert.deepEqual(dragDates({ id: 'a', start_at: '2026-10-05T23:00', due_at: '2026-10-05T23:45' }, 'move', 90, 'day'), { id: 'a', start_at: '2026-10-06T00:30', due_at: '2026-10-06T01:15' })

// ── 빈 곳 클릭 초안: 주·월 = 그날 종일, 일 = 그 시각(15분 내림)부터 1시간 ──
assert.deepEqual(draftAt(4 * D + 700, 'week', O), { start_at: null, due_at: '2026-10-05' })
assert.deepEqual(draftAt(4 * D + 607, 'day', O), { start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' })
assert.deepEqual(draftAt(4 * D + 620, 'day', O), { start_at: '2026-10-05T10:15', due_at: '2026-10-05T11:15' })

// ── 줄 배치·가상 스크롤 ──
{
  const { boxes, height } = rowBoxes(['head', 'head', 'task', 'task', 'head', 'task'])
  assert.equal(height, 30 * 3 + 36 * 3)
  assert.deepEqual(boxes[2], { top: 60, height: 36 })
  assert.equal(rowAt(boxes, 0), 0)
  assert.equal(rowAt(boxes, 61), 2)
  assert.equal(rowAt(boxes, 131), 3)
  assert.equal(rowAt(boxes, 140), 4)
  assert.equal(rowAt(boxes, 9999), -1)
  const many = rowBoxes(Array.from({ length: 1000 }, () => 'task' as const)).boxes
  const [a, b] = visibleRange(many, 3600, 720, 0)
  assert.equal(a, 100)
  assert.equal(b, 120)
  assert.deepEqual(visibleRange([], 0, 100), [0, -1])
}

// ── 순서 화살표: 둘 다 축 위에 있을 때만, 뒤 할 일이 앞 할 일 끝보다 먼저 시작하면 경고 ──
{
  const bars = new Map([['a', { start: 0, end: 2 * D }], ['b', { start: D, end: 3 * D }], ['c', { start: 3 * D, end: 4 * D }]])
  const links = [
    { id: 'l1', from_id: 'a', to_id: 'b', state: 'accepted' },
    { id: 'l2', from_id: 'b', to_id: 'c', state: 'accepted' },
    { id: 'l3', from_id: 'a', to_id: 'x', state: 'accepted' }, // 날짜 없는 쪽 → 그리지 않음
    { id: 'l4', from_id: 'c', to_id: 'a', state: 'dismissed' },
    { id: 'l5', from_id: 'b', to_id: 'a', state: 'suggested' }
  ]
  assert.deepEqual(arrowsOf(links, bars), [
    { id: 'l1', from: 'a', to: 'b', suggested: false, warn: true },
    { id: 'l2', from: 'b', to: 'c', suggested: false, warn: false },
    { id: 'l5', from: 'b', to: 'a', suggested: true, warn: false }
  ])
}

// ── 날짜 머리 ──
{
  const win = { from: '2026-10-05', days: 14 } // 월요일부터
  const w = headCells('week', win, '2026-10-07')
  assert.equal(w.top.length, 2)
  assert.equal(w.top[0].label, '2026년 10월 · 1주')
  assert.equal(w.top[1].label, '2주')
  assert.equal(w.bottom[2].today, true)
  assert.equal(w.bottom[2].label, '7 수')
  assert.equal(w.bottom[5].weekend, true)
  assert.equal(weekHead('2026-10-12', false), '2주')
  const d = headCells('day', { from: '2026-10-05', days: 1 }, '2026-10-05')
  assert.equal(d.top[0].label, '10월 5일 월요일')
  assert.equal(d.bottom.length, 8)
  const m = headCells('month', { from: '2026-09-28', days: 40 }, '2026-10-07')
  assert.deepEqual(m.top.map((c) => c.label), ['2026년 9월', '2026년 10월', '2026년 11월'])
  assert.ok(m.bottom.some((c) => c.today && c.label === '7'))
}

// ── 글자·만료 ──
assert.equal(rangeLabel('2026-10-07', '2026-10-09'), '10월 7일 – 10월 9일')
assert.equal(rangeLabel(null, '2026-10-07'), '10월 7일')
assert.equal(rangeLabel('2026-10-07T14:00', '2026-10-07T15:30'), '10월 7일 오후 2:00 – 오후 3:30')
assert.equal(rangeLabel(null, null), '날짜 없음')
assert.equal(isOverdue({ status: 0, due_at: '2026-10-04' }, '2026-10-05T09:00'), true)
assert.equal(isOverdue({ status: 0, due_at: '2026-10-05' }, '2026-10-05T23:00'), false, '종일은 그날이 지나야 만료')
assert.equal(isOverdue({ status: 0, due_at: '2026-10-05T08:00' }, '2026-10-05T09:00'), true)
assert.equal(isOverdue({ status: 1, due_at: '2026-10-01' }, '2026-10-05T09:00'), false, '완료는 만료 아님')

// ── 배율 바꿈: 가운데 날짜 고정 ──
{
  const viewW = 880
  const sl = keepCenter(0, viewW, 'week', 'month', O, O) // 가운데 = 10일째(440px/44) → 월 배율 140px 지점이 가운데
  assert.equal(sl, 0) // 140 - 440 < 0 → 0
  const sl2 = keepCenter(4400, viewW, 'week', 'day', O, '2026-11-01')
  // 가운데 = (4400+440)/44 = 110일째 = 2027-01-19 → 새 원점 기준 79일 * 288 - 440
  assert.equal(sl2, 79 * 288 - 440)
}

// ── 할일 정렬 칸 → 타임라인 일 배율 칸: 놓은 시각부터 1시간(06 §9와 같은 scheduledDrop) ──
assert.deepEqual(scheduledDrop({ id: 'n', start_at: null, due_at: null }, { day: '2026-10-05', minute: 600, zone: 'timeline' }), { id: 'n', start_at: '2026-10-05T10:00', due_at: '2026-10-05T11:00' })
assert.deepEqual(scheduledDrop({ id: 'n', start_at: null, due_at: null }, { day: '2026-10-05' }), { id: 'n', start_at: null, due_at: '2026-10-05' })

console.log('timeline tests passed')
