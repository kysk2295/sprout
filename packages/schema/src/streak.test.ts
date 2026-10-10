// 43 §19 연속 불꽃 시험: 시간대 경계 · 오늘 아직 · 끊김 · 이정표 · 완료 취소 · 누적 해금은 그대로
import assert from 'node:assert/strict'
import { cheerLine, cheerStamp, cheerToShow, dayOfIn, flameSvg, streakOf, streakText, STREAK_MILESTONES } from './streak.ts'
import { activeDayList, raiseStateFrom } from './wardrobe.ts'

const task = (day: string, amount = 1) => ({ kind: 'task', amount, day })

// ── 오늘 했음 / 오늘 아직 ──
const four = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
assert.deepEqual(streakOf(four, '2026-10-09'), { days: 4, today: true, next: 4, milestone: null })
// 오늘(10일) 아직 → 어제까지 4일 그대로, 오늘 하면 5일
assert.deepEqual(streakOf(four, '2026-10-10'), { days: 4, today: false, next: 5, milestone: null })
assert.deepEqual(streakText(streakOf(four, '2026-10-10')), { main: '4일 연속', sub: '오늘 하면 5일', a11y: '4일 연속. 오늘 하면 5일' })
assert.equal(streakText(streakOf(four, '2026-10-09')).main, '4일 연속')
assert.equal(streakText(streakOf(four, '2026-10-09')).sub, null)

// ── 하루를 통째로 건너뛰면 끊긴다(봐주는 날 없음) → 다시 1부터 ──
assert.deepEqual(streakOf(four, '2026-10-11'), { days: 0, today: false, next: 1, milestone: null })
assert.equal(streakText(streakOf(four, '2026-10-11')).main, '오늘 하면 1일')
assert.deepEqual(streakOf([...four, '2026-10-11'], '2026-10-11'), { days: 1, today: true, next: 1, milestone: null })
// 가운데 구멍: 10/7이 빠지면 10/8~9만
assert.equal(streakOf(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'], '2026-10-09').days, 2)
// 처음 쓰는 사람
assert.deepEqual(streakOf([], '2026-10-10'), { days: 0, today: false, next: 1, milestone: null })
// 순서 무관 · Set도 받음
assert.equal(streakOf(new Set([...four].reverse()), '2026-10-09').days, 4)
// 달·해 넘김
assert.equal(streakOf(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01').days, 3)

// ── 이정표: 3·7·14·30, 오늘 닿았을 때만 · 하루 한 번 ──
assert.deepEqual([...STREAK_MILESTONES], [3, 7, 14, 30])
const three = ['2026-10-08', '2026-10-09', '2026-10-10']
const s3 = streakOf(three, '2026-10-10')
assert.equal(s3.milestone, 3)
assert.equal(cheerToShow(s3, '2026-10-10', null), 3)
assert.equal(cheerToShow(s3, '2026-10-10', cheerStamp('2026-10-10', 3)), null) // 이미 본 날
assert.equal(cheerToShow(s3, '2026-10-10', cheerStamp('2026-09-01', 3)), 3) // 지난번 3일(다른 날)은 상관없음
assert.equal(streakOf(three, '2026-10-11').milestone, null) // 오늘 아직이면 축하 없음
const days = (n: number, end: string) => Array.from({ length: n }, (_, i) => { const d = new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - i); return d.toISOString().slice(0, 10) })
for (const n of [7, 14, 30]) assert.equal(streakOf(days(n, '2026-10-10'), '2026-10-10').milestone, n)
for (const n of [1, 2, 4, 8, 31]) assert.equal(streakOf(days(n, '2026-10-10'), '2026-10-10').milestone, null)
assert.equal(cheerLine(7), '7일 연속! 일주일 내내 했네')
// 축하·글에 재촉·아쉬움 말 없음(§19.4)
for (const n of [3, 7, 14, 30]) assert.doesNotMatch(cheerLine(n), /아쉽|끊|다시 도전|놓쳤/)
for (const s of [streakOf([], '2026-10-10'), streakOf(four, '2026-10-11'), streakOf(four, '2026-10-10')]) assert.doesNotMatch(Object.values(streakText(s)).join(' '), /아쉽|끊|놓쳤/)

// ── 시간대 경계: 같은 순간이 서울에선 다음 날, 뉴욕에선 그날 ──
const at = '2026-10-09T15:30:00Z' // 서울 10/10 00:30 · 뉴욕 10/9 11:30
assert.equal(dayOfIn(at, 'Asia/Seoul'), '2026-10-10')
assert.equal(dayOfIn(at, 'America/New_York'), '2026-10-09')
// 서울 사람: 10/8 · 10/9 낮 + 10/9 자정 넘어 끝낸 것 → 10/10이 한 날이라 오늘(10/10) 3일
const seoul = ['2026-10-08T03:00:00Z', '2026-10-09T03:00:00Z', at].map((x) => dayOfIn(x, 'Asia/Seoul'))
assert.deepEqual(streakOf(seoul, dayOfIn('2026-10-10T05:00:00Z', 'Asia/Seoul')), { days: 3, today: true, next: 3, milestone: 3 })
// 뉴욕 사람: 같은 순간이 10/9 → 10/9가 두 번(하나로 셈) → 오늘(10/10 뉴욕) 아직, 어제까지 2일
const ny = ['2026-10-08T15:00:00Z', '2026-10-09T13:00:00Z', at].map((x) => dayOfIn(x, 'America/New_York'))
assert.deepEqual(streakOf(ny, dayOfIn('2026-10-10T15:00:00Z', 'America/New_York')), { days: 2, today: false, next: 3, milestone: null })
// 자정 바로 전/후(서울 23:59 → 10/9, 00:01 → 10/10)
assert.equal(dayOfIn('2026-10-09T14:59:00Z', 'Asia/Seoul'), '2026-10-09')
assert.equal(dayOfIn('2026-10-09T15:01:00Z', 'Asia/Seoul'), '2026-10-10')

// ── 완료 취소: 그날 XP가 0으로 돌아가면 한 날이 아니다(43 §6과 같은 계산) ──
const xp = [task('2026-10-08'), task('2026-10-09'), task('2026-10-10'), { kind: 'task_revoke', amount: -1, day: '2026-10-10' }]
assert.deepEqual(streakOf(activeDayList(xp), '2026-10-10'), { days: 2, today: false, next: 3, milestone: null })
// 목표 XP는 한 날이 아니다
assert.equal(streakOf(activeDayList([{ kind: 'kpi', amount: 30, day: '2026-10-10' }]), '2026-10-10').days, 0)

// ── 끊겨도 누적 해금은 그대로(§19.1) ──
const long = [...days(10, '2026-09-30').map((d) => task(d)), task('2026-10-05')]
const st = raiseStateFrom(5, long)
assert.equal(st.days, 11) // 누적
assert.equal(streakOf(activeDayList(long), '2026-10-10').days, 0) // 연속은 끊김

// ── 불꽃 그림 ──
assert.match(flameSvg(true), /<svg[^>]+viewBox="0 0 32 32"/)
assert.match(flameSvg(true), /#FF8A34/)
assert.doesNotMatch(flameSvg(false), /#FF8A34/)
assert.notEqual(flameSvg(true, 'a'), flameSvg(true, 'b')) // id 접두어

console.log('streak ok')
