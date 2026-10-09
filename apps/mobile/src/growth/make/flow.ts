// 49 §5 캐릭터 만들기 흐름(휴대폰) — 화면이 쓰는 순수 계산(시험: flow.test.ts).
// 단계 전이·씨앗 회전 컷·성향 카드 진행·두드림 상태·추천 이름/할 일 칩·문구. 문항·점수·종은 10 §2.2 그대로(@sprout/schema/growth + ../logic).
import { scoreSurvey, SPECIES, speciesFrom, type Pick2, type Species } from '@sprout/schema/growth'
import { SEED_COUNT, SEED_FRAMES, SEED_NAMES } from '@sprout/schema/characterArt'
import { axisView, surveyQueue, typeCodeOf } from '../logic.ts'

// ── 단계 ──
/** 0 시작 · 1 씨앗 고르기 · 2 성향 카드 · 3 부화 · 4 이름 · 5 첫 할 일 · 6 정원 */
export type MakeStep = 0 | 1 | 2 | 3 | 4 | 5 | 6
export const LAST_STEP: MakeStep = 6
/** 오른쪽 위 `나중에`(18 그대로) — 0·1·2단계만 */
export const canSkip = (step: MakeStep) => step <= 2
/** 위 진행 점 6개 중 켜진 것(정원 단계에서는 점을 감춘다) */
export const dotOf = (step: MakeStep) => (step >= 6 ? -1 : Math.min(step, 5))
export const nextStep = (step: MakeStep): MakeStep => Math.min(LAST_STEP, step + 1) as MakeStep

// ── 1 씨앗 회전: 30°씩 12컷, 18px당 한 컷(왼쪽으로 끌면 다음 컷) ──
export const TURN_PX = 18
/** 컷 번호를 0~11로 */
export const wrapTurn = (t: number) => {
  'worklet'
  return ((Math.round(t) % SEED_FRAMES) + SEED_FRAMES) % SEED_FRAMES
}
/** 끌기 시작 컷 + 끈 거리(px, 오른쪽 +) → 지금 컷 */
export const turnFromDrag = (start: number, dx: number) => {
  'worklet'
  return wrapTurn(start + Math.round(-dx / TURN_PX))
}
/** 들어오면 한 바퀴 저절로(컷마다 70ms) — "돌릴 수 있다"를 알려 준다 */
export const INTRO_SPIN_MS = SEED_FRAMES * 70
export const clampSeed = (s: number) => (Number.isInteger(s) && s >= 0 && s < SEED_COUNT ? s : 0)
/** 화면 읽기: "흙빛 씨앗, 4개 중 1번째, 고르기" */
export const seedA11yLabel = (seed: number) => `${SEED_NAMES[clampSeed(seed)].name}, ${SEED_COUNT}개 중 ${clampSeed(seed) + 1}번째, 고르기`

// ── 2 성향 카드 ──
export type Quiz = { answers: Record<string, Pick2>; index: number }
export const QUIZ0: Quiz = { answers: {}, index: 0 }
/** 지금 카드(동점이면 동점 문항이 뒤에 붙는다 — 8장이 9·10장이 될 수 있다) */
export function quizCard(q: Quiz) {
  const queue = surveyQueue(q.answers)
  const card = queue[q.index] ?? null
  return { card, n: q.index + 1, total: queue.length, label: `${Math.min(q.index + 1, queue.length)} / ${queue.length}` }
}
/** 고르기: 다음 카드로 가거나, 종이 정해지면 done */
export function answerQuiz(q: Quiz, pick: Pick2): { quiz: Quiz; done: Species | null } {
  const { card } = quizCard(q)
  if (!card) return { quiz: q, done: quizSpecies(q.answers) }
  const answers = { ...q.answers, [card.id]: pick }
  const sp = quizSpecies(answers)
  if (sp) return { quiz: { answers, index: q.index }, done: sp }
  return { quiz: { answers, index: q.index + 1 }, done: null }
}
/** ‹ 이전: 앞 카드로(그 답은 지운다 — 다시 고른다) */
export function backQuiz(q: Quiz): Quiz {
  if (q.index <= 0) return q
  const prev = surveyQueue(q.answers)[q.index - 1]
  const answers = { ...q.answers }
  if (prev) delete answers[prev.id]
  // 동점 문항을 지우면 그 뒤 동점 문항 답도 뜻이 없어진다
  for (const k of Object.keys(answers)) if (!surveyQueue(answers).some((x) => x.id === k)) delete answers[k]
  return { answers, index: q.index - 1 }
}
/** 8문항(+동점 문항)을 다 답해 종이 정해졌으면 그 종 */
export function quizSpecies(answers: Record<string, Pick2>): Species | null {
  const queue = surveyQueue(answers)
  if (!queue.every((x) => answers[x.id])) return null
  return speciesFrom(scoreSurvey(answers))
}
/** 위 작은 씨앗 흔들림 한 번 길이(ms): 첫 카드 1.6초 → 마지막 카드 0.5초(두근) */
export function wobbleMs(index: number, total: number) {
  const t = total <= 1 ? 1 : Math.max(0, Math.min(1, index / (total - 1)))
  return Math.round(1600 - 1100 * t)
}

// ── 3 부화: 두드림 세 번 ──
export type Hatch = { taps: number; cracks: 0 | 1 | 2; sub: string; hatched: boolean }
export const HATCH0: Hatch = { taps: 0, cracks: 0, sub: '세 번이면 깨어나요.', hatched: false }
export function tapSeed(h: Hatch): Hatch {
  if (h.hatched) return h
  const taps = h.taps + 1
  if (taps === 1) return { taps, cracks: 1, sub: '조금만 더…', hatched: false }
  if (taps === 2) return { taps, cracks: 2, sub: '거의 다 왔어요!', hatched: false }
  return { taps: 3, cracks: 2, sub: h.sub, hatched: true }
}
/** 화면 읽기 `씨앗 깨우기` 한 번 = 세 번 두드린 것 */
export const wakeSeed = (): Hatch => ({ taps: 3, cracks: 2, sub: HATCH0.sub, hatched: true })
/** 부화 시각표(ms) — 빛 0.9초(가장 밝은 때 0.3초쯤) · 씨앗 사라짐 · 아기 등장 · 유형 카드 */
export const HATCH_T = { flash: 900, flashPeak: 0.35, seedOut: 300, baby: 320, babyDur: 640, ring: 760, ring2Delay: 120, card: 560, reduced: 300 } as const

/** 유형 카드: `당신은 / 꾸준한 달팽이형` + 한 줄 + 축 막대 둘(A쪽 비율 %) */
export function typeCardOf(species: Species, answers: Record<string, Pick2>) {
  const score = scoreSurvey(answers)
  return {
    title: `${SPECIES[species].name}형`,
    line: SPECIES[species].line,
    typeCode: typeCodeOf(score),
    plan: axisView(score.plan).pctA,
    focus: axisView(score.focus).pctA
  }
}

// ── 4 이름 ──
export const NAME_MAX = 10
/** 종 별명(이름 칸 기본값·첫 칩) */
export const PET_NAME: Record<Species, string> = { snail: '도토', bee: '꿀이', worm: '꼼지', frog: '퐁' }
export const nameChips = (sp: Species) => [PET_NAME[sp], '몽글', '새싹']
export const cleanName = (s: string) => Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('')
export const nameCount = (s: string) => `${Array.from(s).length}/${NAME_MAX}`

// ── 5 첫 할 일 ──
export const TASK_CHIPS = ['물 한 잔 마시기', '책상 5분 정리', '내일 일정 보기'] as const
export const FIRST_DONE_LINE = '하나 끝! 같이 자랐어'
/** 와/과 — 받침 있으면 '과'(@sprout/schema/josa에 와/과가 없어 여기 둔다) */
export function waGwa(w: string) {
  const ch = w.trim().slice(-1)
  const code = ch.charCodeAt(0) - 0xac00
  const batchim = code >= 0 && code <= 11171 ? code % 28 !== 0 : /[013678]$/.test(ch)
  return `${w}${batchim ? '과' : '와'}`
}
export const firstTitle = (name: string) => `${waGwa(name)} 함께\n첫 할 일 하나만`
export const cleanTask = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 200)
