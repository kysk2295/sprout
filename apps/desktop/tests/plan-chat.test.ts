// 31 §11 같이 계획 짜기 — 대화 엔진(상태 기계) · 날짜 읽기 · 단계 맞춰 보기 · 직접 적은 단계 · 지도 반영(다음 걸음·없어짐) · 이어 보기
import assert from 'node:assert/strict'
import {
  chipsOf, initPlan, inputOpen, matchSteps, parseWhen, planReduce, splitManual, splitTitleWhen, dueLabel, type Effect, type PlanEvent, type PlanState, type PlanStep
} from '../src/renderer/src/data/planChat'

const today = '2026-10-05' // 월요일
// ── 날짜 읽기 ──
const W = (s: string) => parseWhen(s, today)
assert.equal(W('오늘'), today)
assert.equal(W('내일까지'), '2026-10-06')
assert.equal(W('모레요'), '2026-10-07')
assert.equal(W('이번 주 금요일'), '2026-10-09')
assert.equal(W('다음 주 금요일까지'), '2026-10-16')
assert.equal(W('다음주 금'), '2026-10-16')
assert.equal(W('금요일에'), '2026-10-09')
assert.equal(W('월요일'), today, '요일만 = 가장 가까운 그 요일(오늘 포함)')
assert.equal(W('다음 주'), '2026-10-16', '다음 주 = 그 주 금요일')
assert.equal(W('이번 주말'), '2026-10-10')
assert.equal(W('주말쯤'), '2026-10-10')
assert.equal(W('이번 달 말'), '2026-10-31')
assert.equal(W('월말'), '2026-10-31')
assert.equal(W('3일 뒤'), '2026-10-08')
assert.equal(W('2주 후'), '2026-10-19')
assert.equal(W('10/16'), '2026-10-16')
assert.equal(W('10월 16일까지요'), '2026-10-16')
assert.equal(W('9/1'), '2027-09-01', '지난 날짜(M/D)는 내년')
assert.equal(W('2026-12-24'), '2026-12-24')
assert.equal(W('2/30'), null)
assert.equal(W('언젠가'), null)
assert.equal(parseWhen('이번 주 월요일', '2026-10-08'), '2026-10-12', '이번 주의 지난 요일 → 다음 주')
assert.equal(parseWhen('이번 주말', '2026-10-11'), '2026-10-17', '일요일에 이번 주말 → 다음 토요일')
assert.deepEqual(splitTitleWhen('사업계획서 다음 주 금요일까지', today), { title: '사업계획서', due: '2026-10-16' })
assert.deepEqual(splitTitleWhen('사업계획서 작성', today), { title: '사업계획서 작성', due: null })
assert.deepEqual(splitTitleWhen('발표 준비 10/20', today), { title: '발표 준비', due: '2026-10-20' })
assert.equal(dueLabel('2026-10-16'), '10월 16일(금)')

// ── 단계 맞춰 보기 · 직접 적은 단계 ──
const steps: PlanStep[] = [
  { id: 'a', title: '자료 조사', done: false }, { id: 'b', title: '경쟁사 3곳 정리', done: false },
  { id: 'c', title: '목차 잡기', done: false }, { id: 'd', title: '초안 다듬기', done: false }
]
assert.deepEqual(matchSteps('자료조사는 이미 했어', steps), ['a'])
assert.deepEqual(matchSteps('자료 조사하고 목차 잡기 했어', steps), ['a', 'c'])
assert.deepEqual(matchSteps('경쟁사, 목차', steps), ['b', 'c'])
assert.deepEqual(matchSteps('초안 다듬기는 했어', steps), ['d'], '낱말 안의 "다"는 지우지 않는다')
assert.deepEqual(matchSteps('아무것도', steps), [])
assert.deepEqual(splitManual('1. 자료 조사, 목차 잡기 → 초안 쓰기\n- 검토'), ['자료 조사', '목차 잡기', '초안 쓰기', '검토'])
assert.deepEqual(splitManual('a,a, ,b'), ['a', 'b'])
assert.equal(splitManual(Array.from({ length: 12 }, (_, i) => `s${i}`).join(',')).length, 8)

// ── 대화 흐름(시안 그대로): ① 사업계획서 작성 → ② 다음 주 금요일 → 단계 → ③ 자료조사는 이미 했어 → ④ 내일 → ⚡ ──
type Run = { s: PlanState; fx: Effect[] }
const go = (r: Run, ev: PlanEvent): Run => { const o = planReduce(r.s, ev); return { s: o.state, fx: o.effects } }
const last = (s: PlanState) => s.msgs.at(-1)!
let r: Run = { s: initPlan('수달', today), fx: [] }
r = go(r, { type: 'start', candidates: [{ id: 'x', title: '졸업 기획서' }] })
assert.equal(r.s.phase, 'goal')
assert.equal(last(r.s).text, '이번 주에 제일 중요한 게 뭐야?')
assert.deepEqual(chipsOf(r.s).chips.map((c) => c.label), ['졸업 기획서'])
assert.ok(chipsOf(r.s).skip && inputOpen(r.s))
r = go(r, { type: 'answer', text: '사업계획서 작성' })
assert.deepEqual(r.fx, [{ kind: 'createGoal', title: '사업계획서 작성', due: null }])
assert.ok(r.s.busy && !inputOpen(r.s), '만드는 동안 입력 막음')
assert.equal(last(r.s).who, 'me')
r = go(r, { type: 'goalReady', goal: { id: 'G', title: '사업계획서 작성', due: null }, steps: [] })
assert.equal(r.s.phase, 'due')
assert.equal(last(r.s).text, "'사업계획서 작성'은 언제까지야?")
assert.deepEqual(r.fx, [{ kind: 'focus', id: 'G' }])
assert.equal(chipsOf(r.s).chips.length, 4)
r = go(r, { type: 'answer', text: '언젠가' })
assert.equal(r.s.phase, 'due', '못 읽으면 같은 물음')
assert.match(last(r.s).text, /잘 모르겠어/)
r = go(r, { type: 'answer', text: '다음 주 금요일' })
assert.deepEqual(r.fx, [{ kind: 'setDue', taskId: 'G', due: '2026-10-16' }, { kind: 'split', taskId: 'G' }])
assert.equal(r.s.phase, 'split')
assert.equal(last(r.s).text, '그럼 이렇게 나눠 볼게. 지도 봐 봐!')
r = go(r, { type: 'queue', position: 2 })
assert.equal(r.s.queue, 2)
r = go(r, { type: 'stepsReady', steps: steps.slice(0, 3).concat({ id: 'e', title: '초안 쓰기', done: false }) })
assert.equal(r.s.phase, 'done')
assert.equal(last(r.s).text, '이 중에 이미 한 거 있어?')
assert.deepEqual(chipsOf(r.s).chips.map((c) => c.id), ['step:a', 'step:b', 'step:c', 'step:e', 'none', 'resplit'])
r = go(r, { type: 'answer', text: '자료조사는 이미 했어' })
assert.deepEqual(r.fx, [{ kind: 'complete', ids: ['a'] }, { kind: 'light', id: 'b' }])
assert.equal(r.s.msgs.at(-2)!.text, '오, 벌써? 그건 끝낸 걸로 둘게 ✓')
assert.equal(r.s.phase, 'first')
assert.equal(last(r.s).text, "첫 걸음 '경쟁사 3곳 정리'는 언제 할래?")
r = go(r, { type: 'chip', id: 'tomorrow' })
assert.equal(r.s.msgs.at(-2)!.text, '내일', '칩 = 내 말로 남김')
assert.deepEqual(r.fx, [{ kind: 'setDue', taskId: 'b', due: '2026-10-06' }, { kind: 'light', id: 'b' }, { kind: 'focus', id: 'b' }])
assert.equal(r.s.phase, 'end')
assert.deepEqual([last(r.s).text, last(r.s).strong], ["좋아, 첫 걸음은 '경쟁사 3곳 정리'야 ⚡", true])
assert.ok(r.s.changed)
// 물음 수: 캐릭터가 물은 것(?로 끝나는 말) 4개 이하
assert.ok(r.s.msgs.filter((m) => m.who === 'bud' && /\?$/.test(m.text)).length <= 5)
// 지도에서 첫 걸음을 끝내면 다음 걸음
r = go(r, { type: 'observed', goal: { id: 'G', title: '사업계획서 작성', due: '2026-10-16' }, steps: r.s.steps.map((x) => (x.id === 'b' ? { ...x, done: true } : x)) })
assert.equal(r.s.msgs.at(-2)!.who, 'sys')
assert.equal(r.s.msgs.at(-2)!.text, '경쟁사 3곳 정리 ✓')
assert.equal(last(r.s).text, "잘했어! 다음은 '목차 잡기'야 ⚡")
assert.deepEqual(r.fx, [{ kind: 'light', id: 'c' }])
// 지도에서 이름을 고치면 칩·말이 따라간다(새 말은 없음)
r = go(r, { type: 'observed', goal: { id: 'G', title: '사업계획서 작성', due: '2026-10-16' }, steps: r.s.steps.map((x) => (x.id === 'c' ? { ...x, title: '목차 정하기' } : x)) })
assert.equal(r.fx.length, 0)
assert.equal(r.s.steps.find((x) => x.id === 'c')!.title, '목차 정하기')
// 닫기 칩
assert.deepEqual(go(r, { type: 'chip', id: 'close' }).fx, [{ kind: 'close' }])
// 큰 할 일이 없어지면
r = go(r, { type: 'observed', goal: null, steps: [] })
assert.equal(r.s.phase, 'gone')
assert.match(last(r.s).text, /'사업계획서 작성'이 없어졌어/)
r = go(r, { type: 'chip', id: 'new' })
assert.equal(r.s.phase, 'goal')

// ── 날짜를 같이 말하면 ②를 건너뛴다 · 입구에서 할 일이 정해지면 ①을 건너뛴다 ──
r = go({ s: initPlan('도토리', today), fx: [] }, { type: 'start' })
r = go(r, { type: 'answer', text: '사업계획서 다음 주 금요일까지' })
assert.deepEqual(r.fx, [{ kind: 'createGoal', title: '사업계획서', due: '2026-10-16' }])
r = go(r, { type: 'goalReady', goal: { id: 'G', title: '사업계획서', due: '2026-10-16' }, steps: [] })
assert.equal(r.s.phase, 'split')
assert.equal(r.s.msgs.at(-2)!.text, '10월 16일(금)까지구나')
r = go({ s: initPlan('도토리', today), fx: [] }, { type: 'start', goal: { id: 'T', title: '졸업 기획서', due: null }, steps: [] })
assert.equal(r.s.phase, 'due')
assert.deepEqual(r.fx, [{ kind: 'focus', id: 'T' }])
assert.equal(r.s.msgs[0].text, "'졸업 기획서' 같이 짜 보자!")
r = go(r, { type: 'skip' })
assert.deepEqual(r.fx, [{ kind: 'split', taskId: 'T' }], '건너뛰면 날짜 없이')

// ── AI 없음 → 직접 적기 → 그대로 끝까지 ──
r = go(r, { type: 'splitFailed', reason: 'down' })
assert.equal(r.s.phase, 'split-manual')
assert.ok(inputOpen(r.s))
r = go(r, { type: 'answer', text: '자료 조사, 목차 잡기, 초안 쓰기' })
assert.deepEqual(r.fx, [{ kind: 'manualSteps', taskId: 'T', titles: ['자료 조사', '목차 잡기', '초안 쓰기'] }])
r = go(r, { type: 'stepsReady', steps: [{ id: '1', title: '자료 조사', done: false }, { id: '2', title: '목차 잡기', done: false }] })
r = go(r, { type: 'chip', id: 'none' })
assert.equal(r.s.phase, 'first')
assert.deepEqual(r.fx, [{ kind: 'light', id: '1' }])
r = go(r, { type: 'answer', text: '어제' })
assert.equal(r.s.phase, 'first')
r = go(r, { type: 'answer', text: '나중에' })
assert.equal(r.s.phase, 'end')
assert.deepEqual(r.fx.map((f) => f.kind), ['light', 'focus'])
assert.match(planReduce({ ...initPlan('a', today), goal: { id: 'T', title: 't', due: null }, phase: 'split', busy: true }, { type: 'splitFailed', reason: 'stopped' }).state.msgs.at(-1)!.text, /^알겠어, 그만할게/, '멈추기')
// 한도(429) 문구는 서버 문구 그대로 한 줄
r = go({ s: { ...initPlan('a', today), goal: { id: 'T', title: 't', due: null }, phase: 'split', busy: true }, fx: [] }, { type: 'splitFailed', reason: 'limit', message: '오늘은 쪼개기를 다 썼어요.' })
assert.match(last(r.s).text, /^오늘은 쪼개기를 다 썼어요\./)
// 직접 적기도 건너뛰면 큰 할 일 자체가 첫 걸음
r = go(r, { type: 'chip', id: 'later' })
assert.equal(r.s.phase, 'end')
assert.deepEqual(r.fx, [{ kind: 'light', id: 'T' }])

// ── 다시 나눠 줘 ──
r = go({ s: { ...initPlan('a', today), goal: { id: 'T', title: 't', due: null }, phase: 'done', steps }, fx: [] }, { type: 'chip', id: 'resplit' })
assert.deepEqual(r.fx, [{ kind: 'light', id: null }, { kind: 'resplit', taskId: 'T' }])
assert.ok(r.s.busy && r.s.phase === 'split')

// ── 이미 나눠 둔 할 일 · 이어 보기 ──
r = go({ s: initPlan('a', today), fx: [] }, { type: 'start', goal: { id: 'T', title: '졸업 기획서', due: '2026-10-16' }, steps: steps.slice(0, 2) })
assert.equal(r.s.phase, 'done', '하위 2개 이상이면 AI 없이 그걸로')
assert.ok(r.s.msgs.some((m) => m.text === '이미 나눠 둔 게 있네. 이걸로 볼게'))
assert.ok(!r.fx.some((f) => f.kind === 'split'))
r = go({ s: initPlan('a', today), fx: [] }, { type: 'start', goal: { id: 'T', title: '졸업 기획서', due: null }, steps: [{ ...steps[0], done: true }, steps[1], steps[2]] })
assert.equal(r.s.phase, 'follow')
assert.equal(last(r.s).text, "'졸업 기획서' 이어서 보자. 1/3 했네! 다음은 '경쟁사 3곳 정리'야 ⚡")
assert.deepEqual(r.fx, [{ kind: 'focus', id: 'T' }, { kind: 'light', id: 'b' }])
r = go({ s: initPlan('a', today), fx: [] }, { type: 'start', goal: { id: 'T', title: '졸업 기획서', due: null }, steps: steps.map((x) => ({ ...x, done: true })) })
assert.deepEqual(chipsOf(r.s).chips.map((c) => c.id), ['finish', 'close'])
r = go(r, { type: 'chip', id: 'finish' })
assert.deepEqual(r.fx, [{ kind: 'complete', ids: ['T'] }])
assert.equal(last(r.s).text, '수고했어! 🎉')

// ── ① 건너뛰기 = 닫기 · 빈 답 무시 · 기다리는 동안 답 무시 ──
r = go({ s: initPlan('a', today), fx: [] }, { type: 'start' })
assert.deepEqual(go(r, { type: 'skip' }).fx, [{ kind: 'close' }])
assert.equal(go(r, { type: 'answer', text: '   ' }).s, r.s)
const busy = { ...r.s, busy: true }
assert.equal(go({ s: busy, fx: [] }, { type: 'answer', text: 'x' }).s, busy)
assert.deepEqual(go(r, { type: 'chip', id: 'cand:x' }).fx, [{ kind: 'useGoal', id: 'x' }])

console.log('plan-chat ok')
