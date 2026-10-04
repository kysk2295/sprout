import assert from 'node:assert/strict'
import {
  canGrantTaskXp, cumulativeXp, kpiEarnsXp, levelFromXp, levelsToNextStage, progressFromEvents, QUESTIONS, scoreSurvey, speciesFrom, stageOf, xpEventId, xpToNext
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
console.log('growth: ok')
