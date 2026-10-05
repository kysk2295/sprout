// 31 §11 같이 계획 짜기 — 대화 엔진(순수 상태 기계). 화면(components/map/PlanChat.tsx)은 사건을 넣고 효과(Effect)를 실행한 뒤 결과를 다시 사건으로 넣는다.
// 물음은 최대 4개(① 무엇 ② 언제까지 ③ 이미 한 것 ④ 첫 걸음 언제), 모두 건너뛸 수 있다. 자유 답은 결정적으로 읽는다(AI 없이도 끝까지 — §11.8).
// AI는 단계 만들기(split 효과 → 기존 /ai/breakdown)에만 쓴다. 대화는 저장하지 않는다.
import { addDays, toDate } from '@sprout/schema/time'
import { eulReul, eunNeun, iGa } from '../lib/josa'

export const PLAN = { questions: 4, chipMax: 5, stepChips: 4, candidates: 3, manualMax: 8, title: 60 }

export type Who = 'bud' | 'me' | 'sys'
export type Msg = { id: number; who: Who; text: string; strong?: boolean }
export type Chip = { id: string; label: string }
export type Phase = 'goal' | 'due' | 'split' | 'split-manual' | 'done' | 'first' | 'end' | 'follow' | 'gone'
export type PlanStep = { id: string; title: string; done: boolean }
export type PlanGoal = { id: string; title: string; due: string | null; done?: boolean }
export type PlanState = {
  phase: Phase
  msgs: Msg[]
  seq: number
  name: string
  today: string
  goal: PlanGoal | null
  steps: PlanStep[]
  /** ⚡ 첫 걸음(밝힌 단계) */
  first: string | null
  /** 효과를 기다리는 중(입력·칩 막음) */
  busy: boolean
  queue: number
  candidates: { id: string; title: string }[]
  /** 이번 대화에서 바꾼 것이 있나(머리 되돌리기) */
  changed: boolean
}
export type Effect =
  | { kind: 'createGoal'; title: string; due: string | null }
  | { kind: 'useGoal'; id: string }
  | { kind: 'setDue'; taskId: string; due: string | null }
  | { kind: 'split'; taskId: string }
  | { kind: 'resplit'; taskId: string }
  | { kind: 'manualSteps'; taskId: string; titles: string[] }
  | { kind: 'complete'; ids: string[] }
  | { kind: 'light'; id: string | null }
  | { kind: 'focus'; id: string }
  | { kind: 'close' }
export type SplitFail = 'offline' | 'down' | 'limit' | 'empty' | 'format' | 'stopped'
export type PlanEvent =
  | { type: 'start'; goal?: PlanGoal | null; steps?: PlanStep[]; candidates?: { id: string; title: string }[] }
  | { type: 'answer'; text: string }
  | { type: 'chip'; id: string }
  | { type: 'skip' }
  | { type: 'goalReady'; goal: PlanGoal; steps: PlanStep[] }
  | { type: 'stepsReady'; steps: PlanStep[] }
  | { type: 'splitFailed'; reason: SplitFail; message?: string }
  | { type: 'queue'; position: number }
  /** 지도(로컬 DB)에서 읽은 지금 값. removed = 휴지통으로 간 단계. 읽은 목록에 아직 없는 단계는 그대로 둔다(막 만든 행이 늦게 읽힐 때) */
  | { type: 'observed'; goal: PlanGoal | null; steps: PlanStep[]; removed?: string[] }
export type Step = { state: PlanState; effects: Effect[] }

// ── 날짜 읽기(§11.4) ──
const WD = ['일', '월', '화', '수', '목', '금', '토']
const dow = (d: string) => (toDate(d).getDay() + 6) % 7 // 월 = 0
const mondayOf = (d: string) => addDays(d, -dow(d))
const NONE_RE = /^(정하지\s*않았어|안\s*정했어|몰라|모르겠어|없어|없음|아직|나중에|글쎄|미정|안\s*정함|아니)/
/** 날짜 없음이라고 답했나 */
export const saysNone = (t: string) => NONE_RE.test(t.trim())
const pad = (n: number) => String(n).padStart(2, '0')
function ymd(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d, 12)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}
/**
 * 짧은 날짜 말 → YYYY-MM-DD. 못 읽으면 null. 끝말(까지·쯤·전에·에·요) 떼고 읽는다. 주 시작 월요일.
 * 오늘·내일·모레 · (이번|다음) 주 + 요일 · 요일 · 이번 주/다음 주(= 그 주 금요일) · (이번) 주말(토) · 이번 달 말/월말 · N일 뒤 · M/D · M월 D일 · YYYY-MM-DD
 */
export function parseWhen(raw: string, today: string): string | null {
  let s = raw.trim().replace(/[.!?~]+$/, '').replace(/\s*(까지는|까지|까진|쯤|즈음|전에|전|에|요|이요|야|이야)$/u, '').replace(/\s*(까지|쯤)$/u, '').trim()
  s = s.replace(/\s+/g, ' ')
  if (!s) return null
  if (s === '오늘') return today
  if (s === '내일') return addDays(today, 1)
  if (s === '모레') return addDays(today, 2)
  if (s === '글피') return addDays(today, 3)
  let m = s.match(/^(이번|다음|다다음)\s*주\s*([일월화수목금토])(?:요일)?$/u)
  if (m) {
    const base = addDays(mondayOf(today), m[1] === '다음' ? 7 : m[1] === '다다음' ? 14 : 0)
    let d = addDays(base, (WD.indexOf(m[2]) + 6) % 7)
    if (m[1] === '이번' && d < today) d = addDays(d, 7)
    return d
  }
  m = s.match(/^([일월화수목금토])요일$/u)
  if (m) return addDays(today, ((WD.indexOf(m[1]) + 6) % 7 - dow(today) + 7) % 7)
  m = s.match(/^(이번|다음|다다음)\s*주$/u)
  if (m) {
    const fri = addDays(mondayOf(today), 4 + (m[1] === '다음' ? 7 : m[1] === '다다음' ? 14 : 0))
    return m[1] === '이번' && fri < today ? addDays(fri, 7) : fri
  }
  m = s.match(/^(이번\s*|다음\s*)?주말$/u)
  if (m) {
    const sat = addDays(mondayOf(today), 5 + (m[1]?.startsWith('다음') ? 7 : 0))
    return sat < today ? addDays(sat, 7) : sat
  }
  if (/^(이번\s*달\s*(말|안)|월말|이달\s*말)$/u.test(s)) {
    const d = toDate(today)
    return ymd(d.getFullYear(), d.getMonth() + 1, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
  }
  if (/^다음\s*달\s*말$/u.test(s)) {
    const d = toDate(today)
    return ymd(d.getFullYear() + (d.getMonth() === 11 ? 1 : 0), ((d.getMonth() + 1) % 12) + 1, new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate())
  }
  m = s.match(/^(\d{1,3})\s*일\s*(뒤|후)$/u)
  if (m) return addDays(today, Number(m[1]))
  m = s.match(/^(\d{1,2})\s*주\s*(뒤|후)$/u)
  if (m) return addDays(today, Number(m[1]) * 7)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*\([일월화수목금토]\))?$/u) ?? s.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*[일월화수목금토]요일)?$/u)
  if (m) {
    const y = Number(today.slice(0, 4))
    const d = ymd(y, Number(m[1]), Number(m[2]))
    if (!d) return null
    return d < today ? ymd(y + 1, Number(m[1]), Number(m[2])) : d
  }
  return null
}
/** 글 끝의 날짜 말을 떼어 낸다: '사업계획서 다음 주 금요일까지' → { title: '사업계획서', due } (가장 긴 끝말, 최대 4낱말) */
export function splitTitleWhen(text: string, today: string): { title: string; due: string | null } {
  const words = text.trim().split(/\s+/)
  for (let k = Math.min(4, words.length - 1); k >= 1; k--) {
    const due = parseWhen(words.slice(-k).join(' '), today)
    if (due) return { title: words.slice(0, -k).join(' '), due }
  }
  return { title: text.trim(), due: null }
}
/** 10월 16일(금) */
export function dueLabel(d: string) {
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일(${WD[toDate(d).getDay()]})`
}

// ── 단계 맞춰 보기(③) ──
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
const FILLER = new Set(['이미', '벌써', '다', '전부', '했어', '했어요', '했지', '했음', '했고', '끝냈어', '끝났어', '해놨어', '해뒀어', '했다', '끝', '그건', '그거', '건', '거'])
const tidyWord = (w: string) => w.replace(/(했어요|했어|했음|했지|했고|끝냈어|끝났어|해놨어|해뒀어)$/u, '').replace(/(은요|는요|은|는|도|을|를)$/u, '')
/** 자유 답에서 이미 한 단계 찾기: 공백·대소문자 무시, 서로 포함, '이미·했어' 같은 말과 끝 조사 떼고. 쉼표·'하고'로 여럿 */
export function matchSteps(text: string, steps: PlanStep[]): string[] {
  const parts = text.split(/[,·/]|\s+(?:하고|이랑|랑|그리고|와|과)\s+/u)
    .map((p) => norm(p.trim().split(/\s+/).filter((w) => !FILLER.has(w)).map((w, i, a) => (i === a.length - 1 ? tidyWord(w) : w)).join('')))
    .filter((p) => p.length >= 2)
  const hit = new Set<string>()
  for (const p of parts) {
    for (const s of steps) {
      const t = norm(s.title)
      if (t && (t.includes(p) || p.includes(t))) hit.add(s.id)
    }
  }
  return steps.filter((s) => hit.has(s.id)).map((s) => s.id)
}
/** 직접 적은 단계 나누기(쉼표·가운뎃점·화살표·슬래시·줄바꿈, 번호 떼기, 60자, 8개) */
export function splitManual(text: string): string[] {
  return [...new Set(text.split(/\n|,|·|→|->|\/|;/).map((s) => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean).map((s) => [...s].slice(0, PLAN.title).join('')))].slice(0, PLAN.manualMax)
}

// ── 상태 기계 ──
export function initPlan(name: string, today: string): PlanState {
  return { phase: 'goal', msgs: [], seq: 0, name, today, goal: null, steps: [], first: null, busy: false, queue: 0, candidates: [], changed: false }
}
const say = (s: PlanState, who: Who, text: string, strong?: boolean): PlanState => ({ ...s, seq: s.seq + 1, msgs: [...s.msgs, { id: s.seq + 1, who, text, strong }] })
const bud = (s: PlanState, text: string, strong?: boolean) => say(s, 'bud', text, strong)
const me = (s: PlanState, text: string) => say(s, 'me', text)
const q = (t: string) => `'${t}'`
/** 따옴표 붙인 제목 + 받침에 맞춘 조사: qj('사업계획서 작성', eunNeun) → '사업계획서 작성'은 */
const qj = (t: string, f: (w: string) => string) => `'${t}'${f(t).slice(t.length)}`
const firstOpen = (steps: PlanStep[]) => steps.find((x) => !x.done) ?? null

/** 지금 물음의 답 칩 */
export function chipsOf(s: PlanState): { chips: Chip[]; skip: boolean } {
  if (s.busy) return { chips: [], skip: false }
  switch (s.phase) {
    case 'goal': return { chips: s.candidates.slice(0, PLAN.candidates).map((c) => ({ id: `cand:${c.id}`, label: c.title })), skip: true }
    case 'due': return { chips: [{ id: 'fri', label: '이번 주 금요일' }, { id: 'nextfri', label: '다음 주 금요일' }, { id: 'monthend', label: '이번 달 말' }, { id: 'none', label: '정하지 않았어' }], skip: true }
    case 'split-manual': return { chips: [{ id: 'later', label: '나중에 할래' }], skip: false }
    case 'done': return { chips: [...s.steps.filter((x) => !x.done).slice(0, PLAN.stepChips).map((x) => ({ id: `step:${x.id}`, label: x.title })), { id: 'none', label: '없어' }, { id: 'resplit', label: '다시 나눠 줘' }].slice(0, PLAN.chipMax + 1), skip: true }
    case 'first': return { chips: [{ id: 'today', label: '오늘' }, { id: 'tomorrow', label: '내일' }, { id: 'weekend', label: '이번 주말' }, { id: 'later', label: '나중에' }], skip: true }
    case 'end': return { chips: [{ id: 'close', label: '닫기' }], skip: false }
    case 'follow': return { chips: s.goal && s.steps.length && s.steps.every((x) => x.done) && !s.goal.done ? [{ id: 'finish', label: '완료하기' }, { id: 'close', label: '나중에' }] : [{ id: 'close', label: '좋아' }], skip: false }
    case 'gone': return { chips: [{ id: 'new', label: '새 계획 짜기' }, { id: 'close', label: '닫기' }], skip: false }
    default: return { chips: [], skip: false }
  }
}
/** 지금 물음에서 입력칸이 열려 있나 */
export const inputOpen = (s: PlanState) => !s.busy && s.phase !== 'split' && s.phase !== 'gone'
/** 몇 번째 물음인가(①~④, 머리 진행 점) */
export const questionNo = (p: Phase) => ({ goal: 1, due: 2, done: 3, first: 4 } as Partial<Record<Phase, number>>)[p] ?? null

export function planReduce(s0: PlanState, ev: PlanEvent): Step {
  let s = s0
  const fx: Effect[] = []
  switch (ev.type) {
    case 'start': {
      s = { ...initPlan(s.name, s.today), seq: s.seq, msgs: s.msgs, candidates: ev.candidates ?? [] }
      if (!ev.goal) return { state: bud(s, '이번 주에 제일 중요한 게 뭐야?'), effects: [] }
      s = { ...s, goal: ev.goal, steps: ev.steps ?? [] }
      fx.push({ kind: 'focus', id: ev.goal.id })
      if (s.steps.some((x) => x.done)) return follow(s, fx)
      s = bud(s, `${q(ev.goal.title)} 같이 짜 보자!`)
      return afterGoal(s, fx)
    }
    case 'goalReady': {
      s = { ...s, busy: false, goal: ev.goal, steps: ev.steps, changed: s.changed || ev.goal.id !== s0.goal?.id }
      fx.push({ kind: 'focus', id: ev.goal.id })
      if (ev.steps.some((x) => x.done)) return follow(s, fx)
      return afterGoal(s, fx)
    }
    case 'queue': return { state: { ...s, queue: ev.position }, effects: [] }
    case 'stepsReady': {
      s = { ...s, busy: false, queue: 0, steps: ev.steps, changed: true }
      if (!ev.steps.length) return { state: { ...bud(s, '쪼갤 단계를 못 찾았어. 단계를 쉼표로 적어 줄래?'), phase: 'split-manual' }, effects: [] }
      return askDone(s, fx)
    }
    case 'splitFailed': {
      s = { ...s, busy: false, queue: 0, phase: 'split-manual' }
      const why = ev.reason === 'offline' ? '연결되면 내가 나눠 줄게. 지금은 직접 적어 줘. 쉼표로 나누면 적은 순서대로 이어 둘게'
        : ev.reason === 'limit' ? `${ev.message ? `${ev.message} ` : ''}오늘은 내가 더 못 나눠. 단계를 쉼표로 적어 줄래? 적은 순서대로 이어 둘게`
        : ev.reason === 'empty' ? '쪼갤 단계를 못 찾았어. 단계를 쉼표로 적어 줄래?'
        : ev.reason === 'stopped' ? '알겠어, 그만할게. 대신 단계를 쉼표로 적어 줄래? 적은 순서대로 이어 둘게'
        : '지금은 내가 잘 안 떠올라. 단계를 쉼표로 적어 줄래? 적은 순서대로 이어 둘게'
      return { state: bud(s, why), effects: [] }
    }
    case 'observed': return observe(s, ev)
    case 'skip': return answer(s, { kind: 'skip' })
    case 'chip': return answer(s, { kind: 'chip', id: ev.id })
    case 'answer': {
      const text = ev.text.trim()
      if (!text) return { state: s, effects: [] }
      return answer(s, { kind: 'text', text })
    }
  }
}

type Ans = { kind: 'skip' } | { kind: 'chip'; id: string } | { kind: 'text'; text: string }
function answer(s0: PlanState, a: Ans): Step {
  let s = s0
  const fx: Effect[] = []
  if (s.busy) return { state: s, effects: [] }
  const label = a.kind === 'chip' ? chipsOf(s).chips.find((c) => c.id === a.id)?.label : undefined
  if (a.kind === 'chip' && a.id === 'close') return { state: s, effects: [{ kind: 'close' }] }
  if (a.kind === 'text') s = me(s, a.text)
  else if (a.kind === 'chip' && label) s = me(s, label)
  else if (a.kind === 'skip') s = say(s, 'sys', '건너뛰었어요')
  switch (s.phase) {
    case 'goal': {
      if (a.kind === 'skip') return { state: bud(s, '그럼 생각나면 불러 줘!'), effects: [{ kind: 'close' }] }
      if (a.kind === 'chip' && a.id.startsWith('cand:')) return { state: { ...s, busy: true }, effects: [{ kind: 'useGoal', id: a.id.slice(5) }] }
      if (a.kind !== 'text') return { state: s, effects: [] }
      if (saysNone(a.text)) return { state: bud(s, '괜찮아. 할 일 하나만 떠올려 볼래? 예: 사업계획서 작성'), effects: [] }
      const { title, due } = splitTitleWhen(a.text, s.today)
      const t = [...title.replace(/^(이번\s*주(에는|엔|는)?|음+|그냥)\s*/u, '').replace(/\s*(이야|인\s*것\s*같아|인\s*듯)$/u, '').trim()].slice(0, 120).join('')
      if (!t) return { state: bud(s, '무엇을 할지 한 줄로 적어 줄래?'), effects: [] }
      return { state: { ...s, busy: true }, effects: [{ kind: 'createGoal', title: t, due }] }
    }
    case 'due': {
      const goal = s.goal!
      let due: string | null | undefined
      if (a.kind === 'skip') due = null
      else if (a.kind === 'chip') due = a.id === 'fri' ? parseWhen('이번 주 금요일', s.today) : a.id === 'nextfri' ? parseWhen('다음 주 금요일', s.today) : a.id === 'monthend' ? parseWhen('이번 달 말', s.today) : null
      else if (saysNone(a.text)) due = null
      else {
        due = parseWhen(a.text, s.today) ?? splitTitleWhen(a.text, s.today).due ?? undefined
        if (due === undefined) return { state: bud(s, '언제인지 잘 모르겠어. 이렇게 말해 줄래? 예: 다음 주 금요일, 10/16'), effects: [] }
        if (due < s.today) return { state: bud(s, '지난 날짜야. 다시 말해 줄래?'), effects: [] }
      }
      if (due) { s = { ...s, goal: { ...goal, due }, changed: true }; fx.push({ kind: 'setDue', taskId: goal.id, due }) }
      return toSplit(s, fx)
    }
    case 'split-manual': {
      if (a.kind === 'skip' || (a.kind === 'chip' && a.id === 'later')) return finish({ ...s }, fx)
      if (a.kind !== 'text') return { state: s, effects: [] }
      const titles = splitManual(a.text)
      if (!titles.length) return { state: bud(s, '단계를 쉼표로 나눠 적어 줘. 예: 자료 조사, 목차 잡기, 초안 쓰기'), effects: [] }
      return { state: { ...s, phase: 'split', busy: true }, effects: [{ kind: 'manualSteps', taskId: s.goal!.id, titles }] }
    }
    case 'done': {
      if (a.kind === 'chip' && a.id === 'resplit') {
        s = bud({ ...s, phase: 'split', busy: true, steps: [] }, '다시 나눠 볼게!')
        return { state: s, effects: [{ kind: 'light', id: null }, { kind: 'resplit', taskId: s.goal!.id }] }
      }
      let ids: string[] = []
      if (a.kind === 'chip' && a.id.startsWith('step:')) ids = [a.id.slice(5)]
      else if (a.kind === 'text' && !saysNone(a.text)) {
        ids = matchSteps(a.text, s.steps.filter((x) => !x.done))
        if (!ids.length) return { state: bud(s, '어떤 건지 못 찾았어. 아래에서 골라 줄래?'), effects: [] }
      }
      if (ids.length) {
        s = { ...s, steps: s.steps.map((x) => (ids.includes(x.id) ? { ...x, done: true } : x)), changed: true }
        s = bud(s, ids.length > 1 ? `오, 벌써 ${ids.length}개나? 끝낸 걸로 둘게 ✓` : '오, 벌써? 그건 끝낸 걸로 둘게 ✓')
        fx.push({ kind: 'complete', ids })
      }
      return toFirst(s, fx)
    }
    case 'first': {
      const f = s.steps.find((x) => x.id === s.first) ?? firstOpen(s.steps)
      let due: string | null | undefined = null
      if (a.kind === 'chip') due = a.id === 'today' ? s.today : a.id === 'tomorrow' ? addDays(s.today, 1) : a.id === 'weekend' ? parseWhen('이번 주말', s.today) : null
      else if (a.kind === 'text' && !saysNone(a.text)) {
        due = parseWhen(a.text, s.today) ?? splitTitleWhen(a.text, s.today).due ?? undefined
        if (due === undefined) return { state: bud(s, '언제인지 잘 모르겠어. 예: 오늘, 내일, 수요일'), effects: [] }
        if (due < s.today) return { state: bud(s, '지난 날짜야. 다시 말해 줄래?'), effects: [] }
      }
      if (f && due) { fx.push({ kind: 'setDue', taskId: f.id, due }); s = { ...s, changed: true } }
      return finish(s, fx)
    }
    case 'end': {
      if (a.kind === 'text') return { state: bud(s, '지도에서 끌어 고쳐도 돼. 다 됐으면 닫아 줘'), effects: [] }
      return { state: s, effects: [] }
    }
    case 'follow': {
      if (a.kind === 'chip' && a.id === 'finish' && s.goal) {
        s = bud({ ...s, phase: 'end', goal: { ...s.goal, done: true }, changed: true }, '수고했어! 🎉')
        return { state: s, effects: [{ kind: 'complete', ids: [s.goal!.id] }] }
      }
      if (a.kind === 'text') return { state: bud(s, '지도에서 끌어 고쳐도 돼. 다 됐으면 닫아 줘'), effects: [] }
      return { state: s, effects: [] }
    }
    case 'gone': {
      if (a.kind === 'chip' && a.id === 'new') return planReduce({ ...s, goal: null, steps: [], first: null }, { type: 'start', candidates: s.candidates })
      return { state: s, effects: [] }
    }
    default: return { state: s, effects: [] }
  }
}

function afterGoal(s: PlanState, fx: Effect[]): Step {
  const g = s.goal!
  if (!g.due) return { state: bud({ ...s, phase: 'due' }, `${qj(g.title, eunNeun)} 언제까지야?`), effects: fx }
  return toSplit(bud(s, `${dueLabel(g.due)}까지구나`), fx)
}
function toSplit(s: PlanState, fx: Effect[]): Step {
  if (s.steps.length >= 2) return askDone(bud(s, '이미 나눠 둔 게 있네. 이걸로 볼게'), fx)
  s = bud({ ...s, phase: 'split', busy: true }, '그럼 이렇게 나눠 볼게. 지도 봐 봐!')
  return { state: s, effects: [...fx, { kind: 'split', taskId: s.goal!.id }] }
}
function askDone(s: PlanState, fx: Effect[]): Step {
  if (s.steps.every((x) => x.done)) return toFirst(s, fx)
  return { state: bud({ ...s, phase: 'done' }, '이 중에 이미 한 거 있어?'), effects: fx }
}
function toFirst(s: PlanState, fx: Effect[]): Step {
  const f = firstOpen(s.steps)
  if (!f) return finish(s, fx)
  return { state: bud({ ...s, phase: 'first', first: f.id }, `첫 걸음 ${qj(f.title, eunNeun)} 언제 할래?`), effects: [...fx, { kind: 'light', id: f.id }] }
}
function finish(s: PlanState, fx: Effect[]): Step {
  const f = firstOpen(s.steps)
  if (f) return { state: bud({ ...s, phase: 'end', first: f.id }, `좋아, 첫 걸음은 ${q(f.title)}야 ⚡`, true), effects: [...fx, { kind: 'light', id: f.id }, { kind: 'focus', id: f.id }] }
  const g = s.goal
  if (g && !s.steps.length) return { state: bud({ ...s, phase: 'end', first: g.id }, `좋아, ${qj(g.title, eulReul)} 첫 걸음으로 해 보자 ⚡`, true), effects: [...fx, { kind: 'light', id: g.id }] }
  return { state: bud({ ...s, phase: 'end', first: null }, '다 끝냈네! 🎉'), effects: [...fx, { kind: 'light', id: null }] }
}
function follow(s: PlanState, fx: Effect[]): Step {
  const g = s.goal!
  const n = s.steps.filter((x) => x.done).length
  const f = firstOpen(s.steps)
  if (!f) return { state: bud({ ...s, phase: 'follow', first: null }, `${q(g.title)} 다 끝냈어! 완료로 둘까?`), effects: [...fx, { kind: 'light', id: null }] }
  return { state: bud({ ...s, phase: 'follow', first: f.id }, `${q(g.title)} 이어서 보자. ${n}/${s.steps.length} 했네! 다음은 ${q(f.title)}야 ⚡`, true), effects: [...fx, { kind: 'light', id: f.id }] }
}
/** 지도에서 바뀐 것 반영: 단계 제목·완료, 큰 할 일 없어짐. 밝힌 단계를 끝내면 다음 걸음(§11.3 시안 9번 장면) */
function observe(s0: PlanState, ev: { goal: PlanGoal | null; steps: PlanStep[]; removed?: string[] }): Step {
  let s = s0
  if (!s.goal) return { state: s, effects: [] }
  if (!ev.goal) {
    if (s.phase === 'gone' || s.busy) return { state: s, effects: [] }
    return { state: bud({ ...s, phase: 'gone', first: null }, `${qj(s.goal.title, iGa)} 없어졌어. 새로 짤까?`), effects: [{ kind: 'light', id: null }] }
  }
  if (s.busy) return { state: s, effects: [] } // 만드는 중에는 결과 사건을 기다린다
  const prevFirst = s.steps.find((x) => x.id === s.first)
  const fresh = new Map(ev.steps.map((x) => [x.id, x]))
  const gone = new Set(ev.removed ?? [])
  const merged = [...s.steps.map((x) => fresh.get(x.id) ?? x), ...ev.steps.filter((x) => !s.steps.some((y) => y.id === x.id))].filter((x) => !gone.has(x.id))
  s = { ...s, goal: { ...s.goal, title: ev.goal.title, due: ev.goal.due, done: ev.goal.done }, steps: merged }
  const nowFirst = merged.find((x) => x.id === s.first)
  if (prevFirst && !prevFirst.done && nowFirst?.done && (s.phase === 'end' || s.phase === 'follow' || s.phase === 'first')) {
    s = say(s, 'sys', `${nowFirst.title} ✓`)
    const next = firstOpen(merged)
    if (!next) return { state: bud({ ...s, phase: 'follow', first: null }, `다 끝냈어! 🎉 ${q(s.goal!.title)}도 완료로 둘까?`), effects: [{ kind: 'light', id: null }] }
    return { state: bud({ ...s, phase: s.phase === 'first' ? 'end' : s.phase, first: next.id }, `잘했어! 다음은 ${q(next.title)}야 ⚡`, true), effects: [{ kind: 'light', id: next.id }] }
  }
  return { state: s, effects: [] }
}
