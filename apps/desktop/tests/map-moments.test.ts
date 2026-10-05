// 31 §10 작업 지도 쓰는 순간·모드 — 모드 묶음 · ① 큰 일 · ② ⚡ 줄 · ③ 주간 점검 창 · 점검 7칸·밀린 일 · 기기 기억 · 지도 열기 요청
import assert from 'node:assert/strict'
import {
  bigTaskKind, loadMoments, markBigSeen, MODE_PRESET, modeGroupBy, modeView, nextMonday, nowLineDue, openMap, overdueOf, pickBigTask, reviewDue, reviewWeek, saveMoments, takeMapIntent, weekColumns, isMapMode, takeScreen
} from '../src/renderer/src/data/mapMoments'

const today = '2026-10-07' // 수요일
const t = (id: string, title: string, o: Partial<{ status: number; parent_id: string | null; due_at: string | null; deleted_at: string | null }> = {}) =>
  ({ id, title, status: 0, parent_id: null, due_at: null, deleted_at: null, ...o })

// ── 모드 묶음 ──
assert.deepEqual(['plan', 'review', 'tidy'].map((m) => modeView(m as 'plan', 'graph')), ['graph', 'timeline', 'graph'])
assert.deepEqual(['plan', 'review', 'tidy'].map((m) => modeView(m as 'plan', 'board')), ['board', 'timeline', 'graph']) // 보드는 계획에서만
assert.equal(modeView('plan', 'timeline'), 'graph') // 예전 기억(타임라인)은 계획에서 그래프로
assert.deepEqual([modeGroupBy('review', 2), modeGroupBy('review', 0), modeGroupBy('plan', 2), modeGroupBy('tidy', 2)], ['goal', 'list', 'list', 'list'])
assert.deepEqual([MODE_PRESET.plan.showDone, MODE_PRESET.review.showDone, MODE_PRESET.review.timeline?.scale, MODE_PRESET.tidy.showDone], [false, true, 'week', false])
assert.ok(isMapMode('review') && !isMapMode('board') && !isMapMode(undefined))

// ── ① 큰 일 ──
assert.equal(bigTaskKind(t('a', '사업계획서 작성'), 0, today), 'split') // 덩어리 낱말
assert.equal(bigTaskKind(t('a', 'Write project plan'), 0, today), 'split') // 영어 낱말
assert.equal(bigTaskKind(t('a', '세탁소 맡기기'), 0, today), null)
assert.equal(bigTaskKind(t('a', '세탁소 맡기기', { due_at: '2026-10-14' }), 0, today), 'split') // 마감 7일 뒤
assert.equal(bigTaskKind(t('a', '세탁소 맡기기', { due_at: '2026-10-13T09:00:00' }), 0, today), null) // 6일 뒤
assert.equal(bigTaskKind(t('a', '사업계획서 작성'), 1, today), null) // 하위 1~2개 = 이미 쪼갬
assert.equal(bigTaskKind(t('a', '장보기'), 3, today), 'order') // 하위 ≥3 = 순서 잡기
assert.equal(bigTaskKind(t('a', '보고서 작성', { status: 1 }), 0, today), null) // 끝냄
assert.equal(bigTaskKind(t('a', '보고서 작성', { parent_id: 'p' }), 0, today), null) // 하위 할 일
assert.equal(bigTaskKind(t('a', '보고서 작성', { deleted_at: '2026-10-01' }), 0, today), null) // 휴지통
assert.equal(bigTaskKind(t('a', '   '), 0, today), null)
// 한 목록에 하나: 보이는 순서대로 첫 큰 일, 본 것은 건너뜀, 목록 안 하위로 수를 센다
const rows = [t('x', '피부과 예약'), t('b1', '발표 준비'), t('b2', '논문 작성'), t('c', '장보기'), t('c1', '우유', { parent_id: 'c' }), t('c2', '빵', { parent_id: 'c' }), t('c3', '달걀', { parent_id: 'c' })]
assert.deepEqual(pickBigTask(rows, today, new Set()), { id: 'b1', kind: 'split' })
assert.deepEqual(pickBigTask(rows, today, new Set(['b1'])), { id: 'b2', kind: 'split' })
assert.deepEqual(pickBigTask(rows, today, new Set(['b1', 'b2'])), { id: 'c', kind: 'order' })
assert.equal(pickBigTask(rows.slice(0, 1), today, new Set()), null)
// 신호가 센 것 우선: 덩어리 낱말 + 먼 마감(2) > 덩어리 낱말만(1), 위에 있어도
assert.deepEqual(pickBigTask([t('i', '인스타 릴스 기획 3개'), t('s', '사업계획서 작성', { due_at: '2026-10-19' })], today, new Set()), { id: 's', kind: 'split' })
// 화면이 센 하위 수가 우선(오늘 목록엔 하위가 안 보일 수 있다)
assert.deepEqual(pickBigTask([t('b1', '발표 준비')], today, new Set(), new Map([['b1', 1]])), null)

// ── ② ⚡ 줄 ──
assert.equal(nowLineDue({ open: 12, overdue: 0, today, firstOpenDay: today }), true) // 10개 이상
assert.equal(nowLineDue({ open: 4, overdue: 5, today, firstOpenDay: today }), true) // 기한 지남 5개
assert.equal(nowLineDue({ open: 4, overdue: 1, today, firstOpenDay: '2026-10-06' }), true) // 오늘 처음
assert.equal(nowLineDue({ open: 4, overdue: 1, today, firstOpenDay: today }), false) // 오늘 이미 봄
assert.equal(nowLineDue({ open: 2, overdue: 0, today }), false) // 너무 적음
assert.equal(nowLineDue({ open: 30, overdue: 9, today, dismissedDay: today }), false) // 오늘 닫음
assert.equal(nowLineDue({ open: 30, overdue: 9, today, dismissedDay: '2026-10-06' }), true) // 어제 닫음

// ── ③ 주간 점검 창: 일요일 20:00 ~ 월요일 12:00 ──
assert.equal(reviewWeek(new Date(2026, 9, 11, 19, 59)), null) // 일 19:59
assert.equal(reviewWeek(new Date(2026, 9, 11, 20, 0)), '2026-10-05') // 일 20:00 → 이번 주
assert.equal(reviewWeek(new Date(2026, 9, 12, 9, 0)), '2026-10-05') // 월 9시 → 지난주
assert.equal(reviewWeek(new Date(2026, 9, 12, 12, 0)), null) // 월 12시
assert.equal(reviewWeek(new Date(2026, 9, 7, 21, 0)), null) // 수요일
assert.equal(reviewDue(new Date(2026, 9, 11, 21, 0), '2026-10-05'), null) // 그 주 이미 봄
assert.equal(reviewDue(new Date(2026, 9, 11, 21, 0), '2026-09-28'), '2026-10-05')

// ── 점검 띠 7칸 · 밀린 일 ──
const wk = [
  { id: '1', title: '끝냄', status: 1, due_at: '2026-10-05T09:00:00' },
  { id: '2', title: '밀림', status: 0, due_at: '2026-10-06' },
  { id: '3', title: '남음', status: 0, due_at: '2026-10-07' },
  { id: '4', title: '취소', status: 2, due_at: '2026-10-07' },
  { id: '5', title: '일요일', status: 0, due_at: '2026-10-11' }
]
const cols = weekColumns(wk, '2026-10-05', today)
assert.deepEqual(cols.map((c) => c.day), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
assert.deepEqual(cols.map((c) => c.bars.map((b) => b.tone)), [['done'], ['miss'], ['open'], [], [], [], ['open']])
const late = overdueOf([{ id: 'a', status: 0, due_at: '2026-10-01', parent_id: null }, { id: 'b', status: 0, due_at: '2026-10-01', parent_id: 'a' }, { id: 'c', status: 1, due_at: '2026-10-01', parent_id: null }, { id: 'd', status: 0, due_at: today, parent_id: null }], today)
assert.deepEqual(late.map((x) => x.id), ['a'])
assert.equal(nextMonday(today), '2026-10-12')
assert.equal(nextMonday('2026-10-11'), '2026-10-12') // 일요일 → 바로 다음 날 월요일

// ── 기기 기억 ──
const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }
assert.deepEqual(loadMoments(store), { big: [] })
markBigSeen('t1', store); markBigSeen('t2', store); markBigSeen('t1', store)
assert.deepEqual(loadMoments(store).big, ['t2', 't1'])
saveMoments({ nowLine: today, review: '2026-10-05' }, store)
assert.deepEqual(loadMoments(store), { big: ['t2', 't1'], nowLine: today, review: '2026-10-05' })
for (let i = 0; i < 320; i++) markBigSeen(`x${i}`, store)
assert.equal(loadMoments(store).big.length, 300)
mem.set('sprout.map.moments', '{망가짐')
assert.deepEqual(loadMoments(store), { big: [] })

// ── 지도 열기 요청: 들고 있다가 한 번만 ──
openMap({ mode: 'plan', task: 't1' })
assert.deepEqual(takeMapIntent(), { mode: 'plan', task: 't1' })
assert.equal(takeMapIntent(), null)
// 사용자 결정 2026-10-05 프로젝트 한 화면: 예전 점검·정리 요청은 지도가 아니라 성장 › 주간 점검 · 정리 화면으로
openMap({ mode: 'review' })
assert.equal(takeMapIntent(), null, '지도로 안 감')
assert.equal(takeScreen('tidy'), false)
assert.equal(takeScreen('review'), true)
assert.equal(takeScreen('review'), false, '한 번만')
openMap({ mode: 'tidy' })
assert.equal(takeMapIntent(), null)
assert.equal(takeScreen('tidy'), true)

console.log('map-moments: ok')
