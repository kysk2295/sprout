import assert from 'node:assert/strict'
import {
  aiLeft, canGrantTaskXp, cumulativeXp, kpiEarnsXp, levelFromXp, levelsToNextStage, parseGoalDraft, parseReportText, progressFromEvents, QUESTIONS, readTextJson,
  scoreSurvey, speciesFrom, stageOf, weekHasActivity, weekLabel, weeklyStats, xpEventId, xpToNext, isoWeekStart, reviewXpEvent, tidyXpEvent, xpKindLabel
} from './growth.ts'

// 레벨 곡선: 40, 60, 80 …
assert.equal(xpToNext(1), 40)
assert.equal(xpToNext(2), 60)
assert.deepEqual(levelFromXp(0), { level: 1, into: 0, toNext: 40 })
assert.deepEqual(levelFromXp(39), { level: 1, into: 39, toNext: 40 })
assert.deepEqual(levelFromXp(40), { level: 2, into: 0, toNext: 60 })
assert.deepEqual(levelFromXp(100), { level: 3, into: 0, toNext: 80 })
assert.equal(cumulativeXp(10), 1080) // 명세 §2.1: Lv10까지 1080
assert.equal(levelFromXp(1080).level, 10)

// 진화 단계: 1~2 아기, 3~5 꼬마, 6~9 친구, 10~14 단짝, 15~ 전설
assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 14, 15, 30].map(stageOf), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
assert.equal(levelsToNextStage(4), 2)
assert.equal(levelsToNextStage(15), null)

// 하루 할 일 XP 상한 10, 되돌림 반영
const day = (n: number) => Array.from({ length: n }, () => ({ kind: 'task' as const, amount: 1 }))
assert.ok(canGrantTaskXp(day(9)))
assert.ok(!canGrantTaskXp(day(10)))
assert.ok(canGrantTaskXp([...day(10), { kind: 'task_revoke', amount: -1 }]))

// 같은 사건은 같은 id (두 기기 이중 지급 방지)
assert.equal(xpEventId.task('t1', '2026-10-04'), xpEventId.task('t1', '2026-10-04'))

// 점검·정리 XP(10 §6): ISO 주(월요일 시작)·하루 단위 id
assert.equal(isoWeekStart('2026-10-05'), '2026-10-05') // 월
assert.equal(isoWeekStart('2026-10-11'), '2026-10-05') // 일 → 그 주 월요일
assert.equal(isoWeekStart('2026-10-04'), '2026-09-28')
assert.equal(isoWeekStart('2027-01-01'), '2026-12-28') // 해 넘김
assert.deepEqual(reviewXpEvent('c1', '2026-10-08', '2026-10-11'), { id: 'review:c1:2026-10-05', kind: 'review', amount: 30, ref_id: 'review:2026-10-05', day: '2026-10-11' })
assert.equal(reviewXpEvent('c1', '2026-10-05', 'x').id, reviewXpEvent('c1', '2026-10-11', 'y').id)
assert.deepEqual(tidyXpEvent('c1', '2026-10-05'), { id: 'tidy:c1:2026-10-05', kind: 'tidy', amount: 20, ref_id: 'tidy:2026-10-05', day: '2026-10-05' })
assert.equal(xpKindLabel('review'), '주간 점검')
assert.equal(xpKindLabel('tidy'), '정리 보너스')

// 레벨은 내려가지 않는다: 40 받아 Lv2 → 되돌림 −1 → 여전히 Lv2, 진행 0
const ev = (amount: number, t: string) => ({ amount, created_at: `2026-10-04T0${t}` })
const p = progressFromEvents([...Array.from({ length: 40 }, (_, i) => ev(1, `1:${String(i).padStart(2, '0')}`)), ev(-1, '2:00')])
assert.equal(p.level, 2)
assert.equal(p.total, 39)
assert.equal(p.into, 0)

// 주간 목표 XP는 3개까지
assert.deepEqual([0, 1, 2, 3, 4].map(kpiEarnsXp), [true, true, true, false, false])

// 성향 조사
assert.equal(QUESTIONS.filter((q) => !q.tiebreak).length, 8)
const all = (plan: 'A' | 'B', focus: 'A' | 'B') => Object.fromEntries(QUESTIONS.filter((q) => !q.tiebreak).map((q) => [q.id, q.axis === 'plan' ? plan : focus]))
assert.equal(speciesFrom(scoreSurvey(all('A', 'A'))), 'turtle')
assert.equal(speciesFrom(scoreSurvey(all('A', 'B'))), 'squirrel')
assert.equal(speciesFrom(scoreSurvey(all('B', 'A'))), 'cat')
assert.equal(speciesFrom(scoreSurvey(all('B', 'B'))), 'otter')
// 계획 축 2:2 동점 → 동점 문항 전에는 결정 못 함, 답하면 결정
const tie = { ...all('A', 'A'), q1: 'B', q3: 'B' } as Record<string, 'A' | 'B'>
assert.equal(scoreSurvey(tie).plan.tie, true)
assert.equal(speciesFrom(scoreSurvey(tie)), null)
assert.equal(speciesFrom(scoreSurvey({ ...tie, 't-plan': 'B' })), 'cat')
assert.equal(scoreSurvey(all('A', 'B')).plan.ratioA, 1)

// ── 주간 리포트 숫자(10 §5) ──
{
  const W = '2026-10-04' // 일요일
  const tasks = [
    { title: '운동', list: '건강', tags: ['운동'], day: '2026-10-04' },
    { title: '회의', list: '업무', tags: [], day: '2026-10-06', start_at: '2026-10-06T10:00', due_at: '2026-10-06T11:30' },
    { title: '운동', list: '건강', tags: ['운동', '아침'], day: '2026-10-10' },
    { title: '지난주', list: '업무', tags: ['운동'], day: '2026-10-03' }, // 주 밖
    { title: '종일', list: null, tags: [], day: '2026-10-07', start_at: '2026-10-07', due_at: '2026-10-08' } // 시각 없음 → 일정 시간 0
  ]
  const goals = [
    { id: 'g1', title: '운동 3번', target: 3, progress: 3, status: 'achieved' },
    { id: 'g2', title: '논문', target: 1, progress: 0, status: 'missed' }
  ]
  const xp = [
    { kind: 'task', amount: 1, day: '2026-10-04' }, { kind: 'task', amount: 1, day: '2026-10-06' }, { kind: 'task_revoke', amount: -1, day: '2026-10-06' },
    { kind: 'kpi', amount: 30, day: '2026-10-09' }, { kind: 'task', amount: 1, day: '2026-10-11' } // 다음 주
  ]
  const s = weeklyStats(W, tasks, goals, xp)
  assert.equal(s.completed, 4)
  assert.deepEqual(s.perDay, [1, 0, 1, 1, 0, 0, 1])
  assert.deepEqual(s.topTags, [{ name: '운동', count: 2 }, { name: '아침', count: 1 }])
  assert.deepEqual(s.topLists, [{ name: '건강', count: 2 }, { name: '업무', count: 1 }])
  assert.equal(s.scheduledMinutes, 90)
  assert.equal(s.goalsAchieved, 1)
  assert.deepEqual(s.xp, { total: 31, task: 1, kpi: 30 })
  assert.deepEqual(weeklyStats(W, tasks, goals, xp), s) // 결정적
  assert.equal(weekHasActivity(weeklyStats(W, [], [], [])), false)
  assert.equal(weekLabel('2026-09-27'), '9월 다섯째 주') // 수요일 9/30
  assert.equal(weekLabel('2026-10-04'), '10월 첫째 주')
}

// ── AI 답 검사 ──
assert.deepEqual(parseReportText('```json\n{"done":" 할 일 12개를\\n끝냈어요 ","goals":"운동을 이뤘어요","next":["논문 읽기","운동 3번","논문 읽기",""]}\n```'),
  { done: '할 일 12개를 끝냈어요', goals: '운동을 이뤘어요', next: ['논문 읽기', '운동 3번'] })
assert.throws(() => parseReportText('그냥 문장'), /형식/)
assert.throws(() => parseReportText('{"done":"","goals":"x","next":["a"]}'), /형식/)
assert.throws(() => parseReportText('{"done":"a","goals":"b","next":[]}'), /형식/)
assert.throws(() => parseReportText('[1,2]'), /형식/)
assert.deepEqual(parseGoalDraft('{"goals":[{"title":"운동","target":3},{"title":"논문 하나 읽기","target":1},{"title":"독서 2회","target":1},{"title":"기획서","target":1}]}', ['기획서']),
  [{ title: '운동 3번', target: 3 }, { title: '논문 하나 읽기', target: 1 }, { title: '독서 2회', target: 2 }])
assert.deepEqual(parseGoalDraft('{"goals":[{"title":"a","target":99},{"title":" A 10번 ","target":1}]}'), [{ title: 'a 10번', target: 10 }])
assert.throws(() => parseGoalDraft('{"goals":[{"title":"","target":1}]}'), /형식/)
assert.throws(() => parseGoalDraft('{"goals":"x"}'), /형식/)
// 작은 모델이 목록만 답해도 받는다(실측)
assert.deepEqual(parseGoalDraft('[{"title":"기획서 수정하기"},{"target":3,"title":"운동"}]'), [{ title: '기획서 수정하기', target: 1 }, { title: '운동 3번', target: 3 }])
assert.throws(() => parseGoalDraft('[]'), /형식/)

// ── 주 2회 한도 기록 ──
assert.deepEqual(aiLeft(readTextJson(null)), { report: true, draft: true })
assert.deepEqual(aiLeft(readTextJson('{"reportTried":true}')), { report: false, draft: true })
assert.deepEqual(readTextJson('깨진 값'), {})
console.log('growth: ok')
