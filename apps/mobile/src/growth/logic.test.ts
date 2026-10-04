// 23 모바일 성장 계산 시험: 말풍선(실제 숫자)·밥그릇·XP 방울·레벨업/진화 감지·주 막대·목표 표시·초안 줄·리포트·조사 흐름
import assert from 'node:assert/strict'
import { cumulativeXp, XP } from '@sprout/schema/growth'
import {
  bowlOf, catchUpOf, checkTarget, dotTarget, evolveText, gainedSince, goalBadge, greetingLine, idleDaysOf, iGa, isSleepy, levelChange, levelOfTotal,
  moodLabel, baseMoodOf, nextStageHint, orbsOf, pickLine, placedDecor, reportHeadline, reportLead, ro, stageLines, streakOf, surveyQueue, taskXpOfDay,
  timeOfDay, typeCodeOf, visibleDrafts, weekBars, weekRange, weekStartOf, xpDayGroups, xpLabel, axisView, defaultName, hm, type StageStats, type XpRow
} from './logic.ts'
import { scoreSurvey, speciesFrom, type Pick2 } from '@sprout/schema/growth'

let n = 0
const ev = (kind: string, amount: number, day: string, at = `${day}T0${(n % 9) + 1}:00:00.000Z`): XpRow => ({ id: `e${++n}`, kind, amount, ref_id: `r${n}`, day, created_at: at })

// ── 주: 월요일 시작 ──
assert.equal(weekStartOf('2026-10-04'), '2026-09-28') // 일요일 → 그 주 월요일
assert.equal(weekStartOf('2026-10-05'), '2026-10-05') // 월요일
assert.equal(weekStartOf('2026-10-11'), '2026-10-05')
assert.equal(weekRange('2026-10-05'), '10월 5일 – 11일')
assert.equal(weekRange('2026-09-28'), '9월 28일 – 10월 4일')

// ── 조사 ──
assert.equal(iGa('도토리'), '도토리가')
assert.equal(iGa('고양이'), '고양이가')
assert.equal(iGa('5'), '5가')
assert.equal(iGa('3'), '3이')
assert.equal(ro('꼬마'), '꼬마로')
assert.equal(ro('전설'), '전설로') // ㄹ 받침
assert.equal(ro('단짝'), '단짝으로')

// ── 밥그릇(오늘 할 일 XP / 10) ──
const today = '2026-10-07'
const day = [ev('task', 1, today), ev('task', 1, today), ev('task', 1, today), ev('task_revoke', -1, today), ev('kpi', 30, today), ev('task', 1, '2026-10-06')]
assert.equal(taskXpOfDay(day, today), 2) // 목표 XP·다른 날은 빼고, 되돌림은 반영
assert.deepEqual(bowlOf(2), { filled: 2, full: false, cap: 10, line: '오늘 할 일로 2 XP 먹었어. 8 더 먹을 수 있어' })
assert.equal(bowlOf(10).full, true)
assert.equal(bowlOf(10).line, '오늘은 배불러! 남은 건 내일 먹을게')
assert.equal(bowlOf(-1).filled, 0)
assert.equal(bowlOf(14).filled, 10)

// ── 연속 · 쉰 날 · 졸림 · 기분 ──
const streakEv = ['2026-10-04', '2026-10-05', '2026-10-06'].map((d) => ev('task', 1, d))
assert.equal(streakOf(streakEv, '2026-10-07'), 3) // 오늘 없으면 어제부터
assert.equal(streakOf([...streakEv, ev('task', 1, today)], today), 4)
assert.equal(streakOf(streakEv, '2026-10-08'), 0)
assert.equal(idleDaysOf(streakEv, '2026-10-09'), 3)
assert.equal(idleDaysOf([], today), 0) // 처음 쓰는 사람은 졸지 않는다
assert.equal(isSleepy(23, 0), true)
assert.equal(isSleepy(5, 0), true)
assert.equal(isSleepy(14, 2), true)
assert.equal(isSleepy(14, 1), false)
assert.equal(timeOfDay(7), 'morning')
assert.equal(timeOfDay(12), 'day')
assert.equal(timeOfDay(18), 'evening')
assert.equal(timeOfDay(21), 'night')
assert.equal(baseMoodOf({ sleepy: true, todayTaskXp: 10, todayDone: 3 }), 'sleepy')
assert.equal(baseMoodOf({ sleepy: false, todayTaskXp: 10, todayDone: 10 }), 'content')
assert.equal(baseMoodOf({ sleepy: false, todayTaskXp: 1, todayDone: 1 }), 'smile')
assert.equal(moodLabel('smile'), '기분 좋아요')
assert.equal(moodLabel('sleepy'), '졸려요')

// ── 말풍선: 실제 숫자 ──
const base: StageStats = { todayDone: 0, todayOpen: 0, todayTaskXp: 0, streak: 0, idleDays: 0, level: 1, into: 0, toNext: 40, diaryUnseen: false, goals: [] }
const l1 = stageLines({ ...base, todayDone: 3, level: 2, into: 55, toNext: 60, streak: 4, goals: [{ title: '운동 3번', target: 3, progress: 1, achieved: false }, { title: '논문 읽기', target: 1, progress: 1, achieved: true }] })
assert.equal(l1[0], '오늘 3개나 했어, 최고야')
assert.ok(l1.includes("'운동 3번' 2번 남았어!"))
assert.ok(l1.includes('레벨업까지 5 XP! 거의 다 왔어'))
assert.ok(l1.includes('Lv 3이 되면 나무 울타리가 생겨'))
assert.ok(l1.includes('4일 연속이야!'))
const l2 = stageLines({ ...base, todayOpen: 4, diaryUnseen: true })
assert.equal(l2[0], '일기 썼어! 읽어 줄래?')
assert.equal(l2[1], '오늘 할 일 4개 있어. 하나만 같이 해 볼까?')
assert.ok(l2.includes('Lv 2가 되면 꽃 화분이 생겨'))
const l3 = stageLines({ ...base, todayDone: 1, todayTaskXp: 10, goals: [{ title: 'a', target: 1, progress: 1, achieved: true }, { title: 'b', target: 1, progress: 1, achieved: true }] })
assert.ok(l3.includes('오늘 1개 했어!'))
assert.ok(l3.includes(`이번 주 목표 다 했다! 보너스 +${XP.kpiAll}`))
assert.ok(l3.includes('오늘은 배불러! 남은 건 내일 먹을게'))
assert.equal(greetingLine('morning', { todayDone: 0, todayOpen: 5 }), '좋은 아침! 오늘 할 일 5개 있어')
assert.equal(greetingLine('day', { todayDone: 3, todayOpen: 0 }), '오늘 벌써 3개 했어!')
// 바로 전 문장은 다시 안 고른다
const pick1 = pickLine(['a', 'b'], 0, 'a')
assert.equal(pick1.line, 'b')

// ── XP 방울 ──
assert.deepEqual(catchUpOf([ev('task', 1, today, '2026-10-07T01:00:00Z')], null), { tasks: 0, xp: 0, orbs: [] }) // 처음 쓰는 기기는 날리지 않는다
const cu = catchUpOf([
  ev('task', 1, today, '2026-10-07T01:00:00Z'), ev('task', 1, today, '2026-10-07T02:00:00Z'), ev('task_revoke', -1, today, '2026-10-07T02:30:00Z'),
  ev('kpi', 30, today, '2026-10-07T03:00:00Z'), ev('task', 1, today, '2026-10-06T23:00:00Z')
], '2026-10-07T00:00:00Z')
assert.deepEqual(cu, { tasks: 2, xp: 32, orbs: [1, 1, 30] })
const many = catchUpOf(Array.from({ length: 13 }, (_, i) => ev('task', 1, today, `2026-10-07T01:${String(i).padStart(2, '0')}:00Z`)), '2026-10-07T00:00:00Z')
assert.equal(many.orbs.length, 10)
assert.equal(many.orbs[9], 4) // 넘으면 마지막 방울에 모은다
assert.deepEqual(orbsOf(3), [1, 1, 1])
assert.deepEqual(orbsOf(30), [30])
assert.deepEqual(orbsOf(0), [])

// ── 레벨 · 단계 ──
assert.deepEqual(levelOfTotal(0), { level: 1, into: 0, toNext: 40 })
assert.deepEqual(levelOfTotal(90), { level: 2, into: 50, toNext: 60 })
assert.deepEqual(levelOfTotal(100), { level: 3, into: 0, toNext: 80 })
assert.equal(cumulativeXp(3), 100)
assert.equal(nextStageHint(4), '친구까지 2레벨')
assert.equal(nextStageHint(15), null)

// ── 레벨업 · 진화 감지(기기에 본 레벨) ──
assert.deepEqual(levelChange(null, 4), { kind: 'baseline', level: 4 }) // 처음 보는 기기: 기준만
assert.deepEqual(levelChange(4, 4), { kind: 'none' })
assert.deepEqual(levelChange(5, 4), { kind: 'none' }) // 레벨은 내려가지 않는다
assert.deepEqual(levelChange(3, 4), { kind: 'levelup', prev: 3, level: 4, prevStage: 2, stage: 2 })
assert.deepEqual(levelChange(2, 3), { kind: 'evolve', prev: 2, level: 3, prevStage: 1, stage: 2 })
assert.deepEqual(levelChange(4, 11), { kind: 'evolve', prev: 4, level: 11, prevStage: 2, stage: 4 }) // 여러 단계를 건너도 한 번
const et = evolveText('squirrel', 1, 2, 3)
assert.equal(et.title, '아기 다람쥐가 꼬마로 자랐어요')
assert.equal(et.sub, '떡잎이 한 장 더 났어요. 다음 모습은 Lv 6!')
assert.equal(evolveText('cat', 4, 5, 15).sub, '나무에 꽃이 피었어요. 이제 전설이에요!')
// 이번에 받은 XP 내역: 본 때 뒤 사건을 종류별 순합
const gs = [ev('task', 1, today, '2026-10-07T01:00:00Z'), ev('task', 1, today, '2026-10-07T05:00:00Z'), ev('kpi', 30, today, '2026-10-07T06:00:00Z'), ev('kpi_all', 20, today, '2026-10-07T06:00:01Z'), ev('task_revoke', -1, today, '2026-10-07T07:00:00Z')]
assert.deepEqual(gainedSince(gs, 1, '2026-10-07T02:00:00Z'), [{ label: '목표 달성', amount: 30 }, { label: '모두 달성 보너스', amount: 20 }])
assert.deepEqual(gainedSince(gs, 1, null), [{ label: '할 일 완료', amount: 1 }, { label: '목표 달성', amount: 30 }, { label: '모두 달성 보너스', amount: 20 }])

// ── 장식(기기에만) ──
assert.deepEqual([...placedDecor(4, new Set(['fence']), true)], ['sign', 'flowers', 'lamp'])
assert.equal(placedDecor(15, new Set(), false).size, 0) // 알에는 장식 없음

// ── 이번 주 XP 카드 ──
const wk = '2026-10-05'
const wev = [ev('task', 1, '2026-10-05'), ev('kpi', 30, '2026-10-07'), ev('task', 1, '2026-10-07'), ev('task_revoke', -1, '2026-10-06'), ev('task', 1, '2026-10-04')]
const bars = weekBars(wev, wk, '2026-10-07')
assert.deepEqual(bars.map((b) => b.label), ['월', '화', '수', '목', '금', '토', '일'])
assert.deepEqual(bars.map((b) => b.xp), [1, 0, 31, 0, 0, 0, 0]) // 음수는 0, 지난주는 빼고
assert.equal(bars[2].today, true)
assert.equal(bars[3].future, true)
const groups = xpDayGroups(wev, wk, '2026-10-07')
assert.deepEqual(groups.map((g) => g.label), ['오늘', '어제', '월요일'])
assert.equal(groups[0].total, 31)
const capped = xpDayGroups(Array.from({ length: 10 }, () => ev('task', 1, '2026-10-07')), wk, '2026-10-07')
assert.equal(capped[0].note, '오늘 할 일 XP 다 받았어요(10/10)')
assert.equal(xpLabel({ kind: 'task', amount: 1 }, '기획서 정리'), '할 일 완료 · 기획서 정리')
assert.equal(xpLabel({ kind: 'kpi', amount: 30 }, undefined), '목표 달성')
assert.equal(xpLabel({ kind: 'kpi_all', amount: -20 }, undefined), '모두 달성 취소')

// ── 목표 행 ──
assert.deepEqual(goalBadge({ id: 'g1', status: 'achieved' }, new Set(['g1'])), { reward: '+30', note: '' })
assert.deepEqual(goalBadge({ id: 'g4', status: 'achieved' }, new Set(['g1', 'g2', 'g3'])), { reward: '', note: 'XP는 3개까지' })
assert.deepEqual(goalBadge({ id: 'g5', status: 'active' }, new Set(['g1', 'g2', 'g3'])), { reward: '', note: 'XP는 3개까지' })
assert.deepEqual(goalBadge({ id: 'g5', status: 'active' }, new Set(['g1'])), { reward: '', note: '' })
assert.equal(checkTarget({ status: 'active', target: 3 }), 3)
assert.equal(checkTarget({ status: 'achieved', target: 3 }), 2)
assert.equal(checkTarget({ status: 'achieved', target: 1 }), 0)
assert.equal(dotTarget(2, 1), 1) // 이미 2번째 점까지 찼는데 2번째를 누르면 하나 뺀다
assert.equal(dotTarget(1, 2), 3)

// ── AI 초안 줄(읽기 전용 제안) ──
const tj = JSON.stringify({ draft: [{ title: '운동 3번', target: 3 }, { title: '책 읽기', target: 1 }, { title: '정리', target: 1 }], draftWeek: wk, dismissed: ['정리'] })
assert.deepEqual(visibleDrafts(tj, wk, []).map((d) => d.title), ['운동 3번', '책 읽기'])
assert.deepEqual(visibleDrafts(tj, wk, [{ title: '운동 3 번' }]).map((d) => d.title), ['책 읽기']) // 이미 받은 것은 빼고
assert.deepEqual(visibleDrafts(tj, '2026-10-12', []), []) // 다른 주 초안은 안 보인다
assert.deepEqual(visibleDrafts(tj, wk, Array.from({ length: 5 }, (_, i) => ({ title: `g${i}` }))), []) // 5개가 차면 없음
assert.deepEqual(visibleDrafts(null, wk, []), [])

// ── 리포트 ──
assert.equal(reportHeadline(JSON.stringify({ report: { done: '이번 주에 우리 같이 12개나 했어! 수요일이 최고였지.', goals: 'x', next: ['a'] } }), { completed: 12 }), '이번 주에 우리 같이 12개나 했어!')
assert.equal(reportHeadline('{}', { completed: 23 }), '이번 주 23개를 끝냈어!')
assert.equal(reportLead({ topTags: [{ name: '운동', count: 4 }], topLists: [{ name: '업무', count: 6 }] }), '많이 한 태그 #운동 4 · 리스트 업무 6')
assert.equal(hm(390), '6시간 30분')
assert.equal(hm(45), '45분')

// ── 성향 조사 흐름 ──
const allA: Record<string, Pick2> = { q1: 'A', q2: 'A', q3: 'A', q4: 'A', q5: 'A', q6: 'A', q7: 'A', q8: 'A' }
assert.equal(surveyQueue({}).length, 8)
assert.equal(surveyQueue(allA).length, 8)
const tiePlan: Record<string, Pick2> = { ...allA, q1: 'B', q3: 'B' } // 계획 2:2 → 동점 문항 하나 더
assert.deepEqual(surveyQueue(tiePlan).map((q) => q.id).slice(8), ['t-plan'])
const sc = scoreSurvey({ ...tiePlan, 't-plan': 'B' })
assert.equal(speciesFrom(sc), 'cat')
assert.equal(typeCodeOf(sc), 'flow-deep')
assert.equal(typeCodeOf(scoreSurvey(allA)), 'plan-deep')
assert.equal(defaultName('squirrel'), '다람쥐')
assert.equal(defaultName('squirrel', '도토리'), '도토리')
assert.deepEqual(axisView({ ratioA: 0.75, leanA: true }), { pctA: 75, pctB: 25, strongA: true })
assert.deepEqual(axisView({ ratioA: 0.5, leanA: false }), { pctA: 50, pctB: 50, strongA: false }) // 동점은 동점 문항으로 정한 쪽

console.log('growth logic ok')
