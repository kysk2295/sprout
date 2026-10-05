// 06 §7.2 캘린더 끌기 계산 — 틱틱 실측(research 17 §끌기)에 맞춘 2026-10-05 끌기 정리
import assert from 'node:assert/strict'
import type { CalItem } from '../src/renderer/src/lib/calendar'
import { packBars } from '../src/renderer/src/lib/calendar'
import { autoScrollDelta, freeLane, gridMoveChanges, monthMoveChanges, previewOf, resizeBar, resizeTime, shiftF, snapMin, spanDays } from '../src/renderer/src/lib/calendarDrag'
import { scheduledDrop } from '../src/renderer/src/lib/calendarDrop'
import type { TaskRow } from '../src/renderer/src/data/types'

const item = (key: string, start: string, end: string, startAt: string | null = start === end ? null : start): CalItem => ({
  key, task: { id: key, start_at: startAt, due_at: end } as TaskRow, start, end, allDay: !start.includes('T'), virtual: false
})

// ── 15분 칸 · 자정 넘기기 ──
assert.equal(snapMin(37), 30)
assert.equal(snapMin(38), 45)
assert.equal(snapMin(-20), 0)
assert.equal(snapMin(24 * 60), 24 * 60 - 15, '마지막 칸은 23:45')
assert.equal(shiftF('2026-10-07T23:30', 0, 45), '2026-10-08T00:15')
assert.equal(shiftF('2026-10-07T00:15', 0, -30), '2026-10-06T23:45')
assert.equal(shiftF('2026-10-07', 2, 90), '2026-10-09', '날짜만 있는 값은 날짜만 옮긴다')

// ── 주·일: 시간 칸 블록 옮기기(길이 유지, 다른 날 열로) ──
const block = item('b', '2026-10-07T13:00', '2026-10-07T14:00')
assert.deepEqual(gridMoveChanges([block], block, { dayDelta: 2, zone: 'grid', min: 14 * 60 + 30 }), [{ id: 'b', start_at: '2026-10-09T14:30', due_at: '2026-10-09T15:30' }])
// 한 점(기간 없는 시각) 할 일은 한 점 그대로
const point = item('p', '2026-10-05T15:00', '2026-10-05T15:00')
assert.deepEqual(gridMoveChanges([point], point, { dayDelta: 0, zone: 'grid', min: 18 * 60 + 45 }), [{ id: 'p', start_at: null, due_at: '2026-10-05T18:45' }])
// 블록 → 종일 영역 = 그날 종일
assert.deepEqual(gridMoveChanges([block], block, { dayDelta: 1, zone: 'allday', min: 0 }), [{ id: 'b', start_at: null, due_at: '2026-10-08' }])
// 종일 막대 → 시간 칸: 할 일 = 그 시각 한 점(틱틱 실측 — 놓은 뒤에도 한 줄 막대), 일정 = 1시간(06 §14.4)
const allday = item('a', '2026-10-05', '2026-10-05')
assert.deepEqual(gridMoveChanges([allday], allday, { dayDelta: 3, zone: 'grid', min: 8 * 60 }), [{ id: 'a', start_at: null, due_at: '2026-10-08T08:00' }])
assert.deepEqual(gridMoveChanges([allday], allday, { dayDelta: 3, zone: 'grid', min: 8 * 60 }, () => true), [{ id: 'a', start_at: '2026-10-08T08:00', due_at: '2026-10-08T09:00' }])
// 여러 날 종일 막대는 종일 영역 안에서 날짜만(기간 유지)
const multi = item('m', '2026-10-05', '2026-10-07')
assert.deepEqual(gridMoveChanges([multi], multi, { dayDelta: 2, zone: 'allday', min: 0 }), [{ id: 'm', start_at: '2026-10-07', due_at: '2026-10-09' }])
// 여러 날 시각 막대: 종일 영역에서 끌어도 시각을 지운 종일로 바뀌지 않는다(이전 버그), 시간 칸에 놓으면 길이 유지
const multiTimed = item('mt', '2026-10-05T22:00', '2026-10-06T02:00')
assert.deepEqual(gridMoveChanges([multiTimed], multiTimed, { dayDelta: 1, zone: 'allday', min: 0 }), [{ id: 'mt', start_at: '2026-10-06T22:00', due_at: '2026-10-07T02:00' }])
assert.deepEqual(gridMoveChanges([multiTimed], multiTimed, { dayDelta: 0, zone: 'grid', min: 9 * 60 }), [{ id: 'mt', start_at: '2026-10-05T09:00', due_at: '2026-10-05T13:00' }])
// 여러 개 선택: 잡은 블록과 같은 만큼(시각 블록은 분까지, 막대는 날짜만)
assert.deepEqual(gridMoveChanges([block, point, allday], block, { dayDelta: 1, zone: 'grid', min: 13 * 60 + 30 }), [
  { id: 'b', start_at: '2026-10-08T13:30', due_at: '2026-10-08T14:30' },
  { id: 'p', start_at: null, due_at: '2026-10-06T15:30' },
  { id: 'a', start_at: null, due_at: '2026-10-06' }
])
// 막대를 잡고 함께 옮기면 다른 시각 블록은 날짜만(분 이동 없음)
assert.deepEqual(gridMoveChanges([allday, block], allday, { dayDelta: 1, zone: 'allday', min: 0 })[1], { id: 'b', start_at: '2026-10-08T13:00', due_at: '2026-10-08T14:00' })

// ── 월: 날짜만, 시각·기간 유지 ──
assert.deepEqual(monthMoveChanges([block, multi, point], -2), [
  { id: 'b', start_at: '2026-10-05T13:00', due_at: '2026-10-05T14:00' },
  { id: 'm', start_at: '2026-10-03', due_at: '2026-10-05' },
  { id: 'p', start_at: null, due_at: '2026-10-03T15:00' }
])

// ── 시간 칸 가장자리(최소 15분, 한 점은 늘리면 기간) ──
assert.deepEqual(resizeTime(block, 'bottom', 15 * 60 + 45), { day: '2026-10-07', a: 13 * 60, b: 15 * 60 + 45 })
assert.deepEqual(resizeTime(block, 'bottom', 12 * 60), { day: '2026-10-07', a: 13 * 60, b: 13 * 60 + 15 }, '시작보다 위로 끌어도 15분')
assert.deepEqual(resizeTime(block, 'top', 14 * 60), { day: '2026-10-07', a: 13 * 60 + 45, b: 14 * 60 })
assert.deepEqual(resizeTime(point, 'bottom', 16 * 60), { day: '2026-10-05', a: 15 * 60, b: 16 * 60 })

// ── 막대 왼쪽·오른쪽 끝 = 시작·끝 날짜(틱틱 도움말: 막대 끝을 끌면 여러 날) ──
assert.deepEqual(resizeBar(allday, 'end', 2), { id: 'a', start_at: '2026-10-05', due_at: '2026-10-07' })
assert.deepEqual(resizeBar(allday, 'start', -1), { id: 'a', start_at: '2026-10-04', due_at: '2026-10-05' })
assert.deepEqual(resizeBar(multi, 'end', -5), { id: 'm', start_at: null, due_at: '2026-10-05' }, '끝을 시작보다 앞으로 끌면 하루짜리')
assert.deepEqual(resizeBar(multi, 'start', 5), { id: 'm', start_at: null, due_at: '2026-10-07' })
// 시각 있는 막대는 시각을 지킨다(한 점 → 여러 날 기간)
assert.deepEqual(resizeBar(point, 'end', 1), { id: 'p', start_at: '2026-10-05T15:00', due_at: '2026-10-06T15:00' })
assert.deepEqual(resizeBar(multiTimed, 'end', -1), { id: 'mt', start_at: null, due_at: '2026-10-05T02:00' }, '같은 날로 줄여 시작이 끝보다 늦으면 한 점')

// ── 미리 보기 항목: 원래 모양 그대로, 새 자리 ──
const pv = previewOf(block, { start_at: null, due_at: '2026-10-09' })
assert.equal(pv.key, 'b#drag')
assert.equal(pv.allDay, true)
assert.equal(pv.start, '2026-10-09')
assert.equal(pv.task, block.task, '색·제목·아이콘은 원래 할 일 그대로')
assert.equal(spanDays(multi), 3)
assert.equal(spanDays(block), 1)

// ── 종일 영역 미리 보기 줄: 빈 줄, 끄는 원래 막대 자리는 빈 것으로 ──
const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
const bars = packBars([multi, item('x', '2026-10-06', '2026-10-06')], week)
assert.equal(freeLane(bars, 1, 1), 2, '화요일은 0·1줄이 차 있다')
assert.equal(freeLane(bars, 1, 1, 'm'), 0, '원래 막대(m)는 비운 것으로')
assert.equal(freeLane(bars, 4, 2), 0)

// ── 가장자리 자동 스크롤 ──
assert.equal(autoScrollDelta(500, 100, 900), 0)
assert.ok(autoScrollDelta(105, 100, 900) < 0)
assert.ok(autoScrollDelta(895, 100, 900) > 0)
assert.equal(autoScrollDelta(40, 100, 900), -14, '칸 밖으로 나가면 가장 빠르게')
assert.ok(Math.abs(autoScrollDelta(130, 100, 900)) < Math.abs(autoScrollDelta(101, 100, 900)), '가까울수록 빠르게')

// ── 할일 정렬 칸에서 놓기(06 §9): 시간 칸 = 한 점, 종일·월 칸 = 날짜, 기간 있던 할 일은 길이 유지, 타임라인 = 1시간 ──
assert.deepEqual(scheduledDrop({ id: 'n', start_at: null, due_at: null }, { day: '2026-10-08', minute: 14 * 60, zone: 'grid' }), { id: 'n', start_at: null, due_at: '2026-10-08T14:00' })
assert.deepEqual(scheduledDrop({ id: 'n', start_at: null, due_at: null }, { day: '2026-10-08', zone: 'allday' }), { id: 'n', start_at: null, due_at: '2026-10-08' })
assert.deepEqual(scheduledDrop({ id: 'n', start_at: '2026-10-01T09:00', due_at: '2026-10-01T09:45' }, { day: '2026-10-08', minute: 600, zone: 'grid' }), { id: 'n', start_at: '2026-10-08T10:00', due_at: '2026-10-08T10:45' })
assert.deepEqual(scheduledDrop({ id: 'n', start_at: null, due_at: null }, { day: '2026-10-08', minute: 600, zone: 'timeline' }), { id: 'n', start_at: '2026-10-08T10:00', due_at: '2026-10-08T11:00' })

console.log('calendar-drag ok')
