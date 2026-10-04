// 32 푸시 알림 공용 계산 시험: 시간대 알림 시각(reminderFireTimeIn = 휴대폰 reminderFireTime과 같은 ms), 설정, 조사, 문구
import assert from 'node:assert/strict'
import { ALL_DAY_PRESETS, END_TRIGGER, TIMED_PRESETS, dayKeyIn, floatingToMs, isTimeZone, msToFloating, reminderFireTime, reminderFireTimeIn, zonedParts } from './time.ts'
import { DEFAULT_NOTIFY, dailySummary, growthCopy, josa, parseNotifyPrefs, reminderBody, reminderKey } from './notify.ts'

// ── 시간대 변환 ──
assert.equal(floatingToMs('2026-10-05T09:00', 'Asia/Seoul'), Date.parse('2026-10-05T00:00:00Z'))
assert.equal(floatingToMs('2026-10-05', 'Asia/Seoul'), Date.parse('2026-10-04T15:00:00Z'))
assert.equal(floatingToMs('2026-07-01T12:00', 'America/New_York'), Date.parse('2026-07-01T16:00:00Z')) // EDT
assert.equal(floatingToMs('2026-12-01T12:00', 'America/New_York'), Date.parse('2026-12-01T17:00:00Z')) // EST
// 서머타임 시작(2026-03-08 02:00 → 03:00): 없는 02:30은 바뀌기 전 오프셋(EST) → 07:30Z = 03:30 EDT
assert.equal(floatingToMs('2026-03-08T02:30', 'America/New_York'), Date.parse('2026-03-08T07:30:00Z'))
// 서머타임 끝(2026-11-01 02:00 → 01:00): 두 번 있는 01:30은 앞의 것(EDT) → 05:30Z
assert.equal(floatingToMs('2026-11-01T01:30', 'America/New_York'), Date.parse('2026-11-01T05:30:00Z'))
assert.equal(msToFloating(Date.parse('2026-10-05T00:00:00Z'), 'Asia/Seoul'), '2026-10-05T09:00')
assert.equal(dayKeyIn(Date.parse('2026-10-04T15:00:00Z'), 'Asia/Seoul'), '2026-10-05')
assert.equal(dayKeyIn(Date.parse('2026-10-04T15:00:00Z'), 'UTC'), '2026-10-04')
assert.equal(zonedParts(Date.parse('2026-10-04T15:00:00Z'), 'Asia/Seoul').weekday, 1) // 월요일
assert.ok(isTimeZone('Asia/Seoul') && isTimeZone('America/New_York') && !isTimeZone('Mars/Base') && !isTimeZone('') && !isTimeZone(42))

// ── reminderFireTimeIn = 그 시간대 기기에서 reminderFireTime ──
// process.env.TZ를 바꾸면 Node가 로컬 시간대를 바로 바꾼다 → 휴대폰(로컬)과 서버(시간대 인자)를 같은 입력으로 비교
const tasks = [
  { due_at: '2026-10-05T15:00', start_at: null },
  { due_at: '2026-10-05T18:00', start_at: '2026-10-05T15:00' },
  { due_at: '2026-10-05', start_at: null },
  { due_at: '2026-10-07', start_at: '2026-10-05' },
  { due_at: '2026-03-08T09:00', start_at: null }, // 뉴욕 서머타임 시작일
  { due_at: '2026-03-08', start_at: null },
  { due_at: '2026-03-09T01:00', start_at: null }, // 하루 전 = 서머타임 날
  { due_at: '2026-03-08T02:30', start_at: null }, // 없는 시각
  { due_at: '2026-11-01T01:30', start_at: null }, // 두 번 있는 시각
  { due_at: '2026-11-01', start_at: null },
  { due_at: '2026-11-02T00:30', start_at: null },
  { due_at: '2026-12-31T23:50', start_at: null }
]
const triggers = [...ALL_DAY_PRESETS, ...TIMED_PRESETS].map(([v]) => v).concat([END_TRIGGER, 'PT0M', '-PT2H30M', 'P0DT23H', '-P1W'])
const prevTz = process.env.TZ
let compared = 0
for (const tz of ['Asia/Seoul', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe']) {
  process.env.TZ = tz
  for (const t of tasks) for (const tr of triggers) {
    const local = reminderFireTime(t, tr)?.getTime() ?? null
    assert.equal(reminderFireTimeIn(t, tr, tz), local, `${tz} ${JSON.stringify(t)} ${tr}`)
    compared++
  }
}
process.env.TZ = prevTz
if (prevTz === undefined) delete process.env.TZ
assert.equal(reminderFireTimeIn({ due_at: null }, 'PT9H', 'Asia/Seoul'), null)
// 종일 '당일 09:00'은 시간대마다 다른 순간
assert.equal(reminderFireTimeIn({ due_at: '2026-10-05' }, 'PT9H', 'Asia/Seoul'), Date.parse('2026-10-05T00:00:00Z'))
assert.equal(reminderFireTimeIn({ due_at: '2026-10-05' }, 'PT9H', 'America/New_York'), Date.parse('2026-10-05T13:00:00Z'))
assert.equal(reminderKey('r1', 123), 'r:r1@123')

// ── 설정 ──
assert.deepEqual(parseNotifyPrefs(null), DEFAULT_NOTIFY)
assert.deepEqual(parseNotifyPrefs('not json'), DEFAULT_NOTIFY)
assert.deepEqual(parseNotifyPrefs('[1]'), DEFAULT_NOTIFY)
const p = parseNotifyPrefs(JSON.stringify({ hideTitles: true, daily: { on: true, time: '07:30' }, growth: { evolve: false, inboxCleanup: 'yes' } }))
assert.equal(p.hideTitles, true)
assert.deepEqual(p.daily, { on: true, time: '07:30', skipWeekends: false })
assert.deepEqual(p.growth, { evolve: false, report: true, goalDue: true, inboxCleanup: false })
assert.equal(parseNotifyPrefs(JSON.stringify({ daily: { time: '25:00' } })).daily.time, '08:00')

// ── 조사 ──
assert.equal(josa('거북이', '이/가'), '거북이가')
assert.equal(josa('콩', '이/가'), '콩이')
assert.equal(josa('꼬마', '으로/로'), '꼬마로')
assert.equal(josa('단짝', '으로/로'), '단짝으로')
assert.equal(josa('전설', '으로/로'), '전설로') // ㄹ 받침은 '로'
assert.equal(josa('목표', '은/는'), '목표는')
assert.equal(josa('Sam', '이/가'), 'Sam이')
assert.equal(josa('Leo', '이/가'), 'Leo가')
assert.equal(josa('3', '이/가'), '3이')
assert.equal(josa('2', '이/가'), '2가')

// ── 할 일 알림 본문 (plan.ts bodyOf와 같은 모양) ──
const fire = floatingToMs('2026-10-05T14:50', 'Asia/Seoul')
assert.equal(reminderBody({ start_at: null, due_at: '2026-10-05T15:00', list_name: '업무', list_kind: 'normal' }, fire, 'Asia/Seoul'), '오늘 오후 3:00 · 업무')
assert.equal(reminderBody({ start_at: null, due_at: '2026-10-06T09:00', list_name: null, list_kind: 'inbox' }, fire, 'Asia/Seoul'), '내일 오전 9:00 · 기본함')
assert.equal(reminderBody({ start_at: null, due_at: '2026-10-12', list_name: '업무', list_kind: 'normal' }, fire, 'Asia/Seoul'), '10월 12일 · 업무')
assert.equal(reminderBody({ start_at: null, due_at: '2026-10-05T15:00', list_name: '업무', list_kind: 'normal' }, fire, 'Asia/Seoul', false), '오늘 오후 3:00')
// 같은 순간이라도 기기 날짜로 "오늘/내일"을 고른다(서울 10-05 = 뉴욕 10-05 01:50)
assert.equal(reminderBody({ start_at: null, due_at: '2026-10-06T09:00', list_name: null, list_kind: null }, fire, 'America/New_York'), '내일 오전 9:00')

// ── 하루 요약 ──
const T = (title: string, status: number, due_at: string | null, extra: Partial<{ start_at: string; priority: number }> = {}) => ({ title, status, due_at, start_at: extra.start_at ?? null, priority: extra.priority ?? 0 })
const today = '2026-10-05'
assert.equal(dailySummary([], today, false), null)
assert.equal(dailySummary([T('내일', 0, '2026-10-06')], today, false), null)
assert.deepEqual(dailySummary([T('밀림1', 0, '2026-10-01'), T('밀림2', 0, '2026-10-04T10:00')], today, false), { title: '밀린 할 일 2개가 있어요', body: '오늘 정리해 볼까요?' })
const many = [
  T('장보기', 0, today), T('보고서 제출', 0, `${today}T10:00`), T('운동', 0, `${today}T18:00`), T('독서', 0, today, { priority: 3 }), T('청소', 0, today),
  T('끝낸 일', 1, today), T('기간', 0, '2026-10-07', { start_at: '2026-10-03' }), T('밀림', 0, '2026-10-02'), T('휴지통 아님·하지 않음', 2, today)
]
assert.deepEqual(dailySummary(many, today, false), { title: '오늘 할 일 7개 중 1개 완료', body: '보고서 제출 · 운동 · 독서 외 3개 · 밀린 할 일 1개' })
assert.deepEqual(dailySummary(many, today, true), { title: '오늘 할 일 7개 중 1개 완료', body: '눌러서 오늘 목록 보기 · 밀린 할 일 1개' })
assert.deepEqual(dailySummary([T('a', 0, today), T('b', 0, today)], today, false), { title: '오늘 할 일 2개', body: 'a · b' })
assert.equal(JSON.stringify(dailySummary(many, today, true)).includes('보고서'), false) // 숨기기면 제목이 없다

// ── 성장 문구 ──
assert.deepEqual(growthCopy.evolve('콩이', '꼬마'), { kind: 'growth_evolve', title: '콩이가 꼬마로 자랐어요!', body: '할 일을 끝낸 덕분이에요. 새 모습을 보러 갈까요?', url: 'sprout://growth' })
assert.equal(growthCopy.evolve('밤', '단짝').title, '밤이 단짝으로 자랐어요!')
assert.equal(growthCopy.report('2026-09-28', 12, 3, 2, 0).body, '할 일 12개 완료 · 목표 3개 중 2개 달성')
assert.equal(growthCopy.report('2026-09-28', 12, 3, 2, 3).body, '할 일 12개 완료 · 목표 3개 중 2개 달성 · 이번 주 목표 초안 3개')
assert.equal(growthCopy.report('2026-09-28', 4, 0, 0, 0).body, '할 일 4개 완료')
assert.equal(growthCopy.report('2026-09-28', 4, 0, 0, 0).url, 'sprout://growth?report=2026-09-28')
assert.equal(growthCopy.draft('콩', 3).body, '콩이 목표 3개를 제안했어요. 골라서 정해 볼까요?')
assert.equal(growthCopy.goalDue(2).title, '이번 주 목표가 2개 남았어요')
assert.equal(growthCopy.inboxCleanup(24).title, '기본함에 할 일이 24개 쌓였어요')

console.log(`notify ok (시간대 비교 ${compared}건)`)
