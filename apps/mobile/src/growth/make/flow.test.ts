// 49 §5 만들기 흐름 순수 계산 시험: 단계·회전 컷·성향 카드 진행(동점 문항 포함)·흔들림 빨라짐·두드림·유형 카드·이름·조사
import assert from 'node:assert/strict'
import { MAIN_QUESTIONS } from '../logic.ts'
import {
  answerQuiz, backQuiz, canSkip, cleanName, dotOf, firstTitle, HATCH0, nameChips, nameCount, nextStep, QUIZ0, quizCard, quizSpecies,
  seedA11yLabel, tapSeed, turnFromDrag, typeCardOf, waGwa, wakeSeed, wobbleMs, wrapTurn, type Quiz
} from './flow.ts'

// 단계
assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((s) => canSkip(s as never)), [true, true, true, false, false, false, false])
assert.equal(dotOf(0), 0); assert.equal(dotOf(5), 5); assert.equal(dotOf(6), -1)
assert.equal(nextStep(5), 6); assert.equal(nextStep(6), 6)

// 회전: 18px당 한 컷, 왼쪽으로 끌면 다음 컷, 0~11로 감김
assert.equal(turnFromDrag(0, 0), 0)
assert.equal(turnFromDrag(0, -18), 1)
assert.equal(turnFromDrag(0, -8), 0)
assert.equal(turnFromDrag(0, -10), 1)
assert.equal(turnFromDrag(0, 18), 11)
assert.equal(turnFromDrag(5, -18 * 12), 5)
assert.equal(turnFromDrag(11, -18), 0)
assert.equal(wrapTurn(-1), 11); assert.equal(wrapTurn(12), 0); assert.equal(wrapTurn(25), 1)
assert.equal(seedA11yLabel(0), '흙빛 씨앗, 4개 중 1번째, 고르기')
assert.equal(seedA11yLabel(3), '새벽 씨앗, 4개 중 4번째, 고르기')
assert.equal(seedA11yLabel(9), '흙빛 씨앗, 4개 중 1번째, 고르기')

// 성향 카드: 8장 모두 A → 달팽이(동점 없음)
let q: Quiz = QUIZ0
assert.equal(quizCard(q).label, '1 / 8')
assert.equal(quizCard(q).card?.id, MAIN_QUESTIONS[0].id)
let done = null as ReturnType<typeof answerQuiz>['done']
for (let i = 0; i < 8; i++) { const r = answerQuiz(q, 'A'); q = r.quiz; done = r.done; if (i < 7) assert.equal(done, null) }
assert.equal(done, 'snail')
assert.equal(quizSpecies(q.answers), 'snail')

// 계획 A·몰입 B(q 홀수 = 계획, 짝수 = 몰입) → 꿀벌
q = QUIZ0
for (let i = 0; i < 8; i++) { const r = answerQuiz(q, i % 2 === 0 ? 'A' : 'B'); q = r.quiz; done = r.done }
assert.equal(done, 'bee')

// 계획 축 동점(A·B·A·B) → 동점 문항이 9번째 카드로 붙는다
q = QUIZ0
const planPicks = ['A', 'B', 'A', 'B'] as const
for (let i = 0; i < 8; i++) { const r = answerQuiz(q, i % 2 === 0 ? planPicks[i / 2] : 'A'); q = r.quiz; done = r.done }
assert.equal(done, null)
assert.equal(quizCard(q).label, '9 / 9')
assert.equal(quizCard(q).card?.id, 't-plan')
const tb = answerQuiz(q, 'B')
assert.equal(tb.done, 'worm')

// ‹ 이전: 앞 카드로 + 그 답 지움
q = QUIZ0
q = answerQuiz(q, 'A').quiz
q = answerQuiz(q, 'B').quiz
assert.equal(q.index, 2)
q = backQuiz(q)
assert.equal(q.index, 1)
assert.equal(q.answers[MAIN_QUESTIONS[1].id], undefined)
assert.equal(q.answers[MAIN_QUESTIONS[0].id], 'A')
assert.deepEqual(backQuiz(QUIZ0), QUIZ0)

// 흔들림이 문항마다 빨라짐: 1.6초 → 0.5초
assert.equal(wobbleMs(0, 8), 1600)
assert.equal(wobbleMs(7, 8), 500)
assert.ok(wobbleMs(3, 8) < wobbleMs(2, 8))
assert.equal(wobbleMs(9, 10), 500)

// 두드림: 금 한 줄 → 두 줄 + 거의 다 → 깨어남, 그 뒤엔 그대로
let h = HATCH0
assert.equal(h.sub, '세 번이면 깨어나요.')
h = tapSeed(h); assert.deepEqual([h.cracks, h.hatched], [1, false])
h = tapSeed(h); assert.deepEqual([h.cracks, h.hatched, h.sub], [2, false, '거의 다 왔어요!'])
h = tapSeed(h); assert.equal(h.hatched, true)
assert.equal(tapSeed(h), h)
assert.equal(wakeSeed().hatched, true)

// 유형 카드
const all = Object.fromEntries(MAIN_QUESTIONS.map((x) => [x.id, 'A'])) as Record<string, 'A'>
const tc = typeCardOf('snail', all)
assert.equal(tc.title, '꾸준한 달팽이형')
assert.equal(tc.typeCode, 'plan-deep')
assert.equal(tc.plan, 100); assert.equal(tc.focus, 100)

// 이름
assert.deepEqual(nameChips('snail'), ['도토', '몽글', '새싹'])
assert.equal(cleanName('  가나다라마바사아자차카타  '), '가나다라마바사아자차')
assert.equal(cleanName(' 도  토 '), '도 토')
assert.equal(nameCount('도토'), '2/10')

// 와/과
assert.equal(waGwa('도토'), '도토와')
assert.equal(waGwa('몽글'), '몽글과')
assert.equal(waGwa('퐁'), '퐁과')
assert.equal(waGwa('Kim'), 'Kim와')
assert.equal(firstTitle('꿀이'), '꿀이와 함께\n첫 할 일 하나만')

console.log('make flow ok')
