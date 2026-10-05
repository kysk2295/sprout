// 18 첫 실행 안내: 단계 상태 머신(순수 함수) + 기기 저장.
// - 새 계정(가입·구글·애플 첫 로그인)일 때 한 번 시작한다. 끝내거나 건너뛰면 다시 저절로 뜨지 않는다.
// - 중간에 앱을 끄면 다음 실행에 그 단계부터 이어서 연다(진행 기록 = 기기 localStorage, 계정 id별 키).
// - 동기화 스키마는 바꾸지 않는다(18 §6): 다른 기기에서는 "이미 쓰던 계정"이라 안내를 띄우지 않는다.

// 2026-10-05 사용자 결정: 틱틱 가져오기 단계는 뺐다(가져오기는 ⌘K에 그대로). 옛 기록의 'import'는 성향 조사로 잇는다(loadState)
export type Step = 'welcome' | 'calendar' | 'survey' | 'first-task'
export const STEPS: Step[] = ['welcome', 'calendar', 'survey', 'first-task']

export type OnboardingState = {
  v: 1
  step: Step
  done: boolean
  completed: Step[] // 실제로 한 것(연결함·조사함·할 일 만듦)
  skipped: Step[]
  startedAt: string
  finishedAt: string | null
}

export const initialState = (now = new Date()): OnboardingState => ({ v: 1, step: 'welcome', done: false, completed: [], skipped: [], startedAt: now.toISOString(), finishedAt: null })

const add = (list: Step[], s: Step) => (list.includes(s) ? list : [...list, s])
const without = (list: Step[], s: Step) => list.filter((x) => x !== s)

/** 다음 단계로. 마지막 단계 다음이면 끝 */
export function advance(s: OnboardingState, outcome: 'done' | 'skip', now = new Date()): OnboardingState {
  if (s.done) return s
  const completed = outcome === 'done' ? add(s.completed, s.step) : without(s.completed, s.step)
  const skipped = outcome === 'skip' ? add(s.skipped, s.step) : without(s.skipped, s.step)
  const i = STEPS.indexOf(s.step)
  const next = STEPS[i + 1]
  return next ? { ...s, step: next, completed, skipped } : { ...s, completed, skipped, done: true, finishedAt: now.toISOString() }
}

/** 이전 단계(첫 단계에서는 그대로) */
export function back(s: OnboardingState): OnboardingState {
  const i = STEPS.indexOf(s.step)
  return i > 0 && !s.done ? { ...s, step: STEPS[i - 1] } : s
}

/** 오른쪽 위 "건너뛰기"(전체): 남은 단계를 모두 건너뛴 것으로 하고 끝 */
export function skipAll(s: OnboardingState, now = new Date()): OnboardingState {
  if (s.done) return s
  const rest = STEPS.slice(STEPS.indexOf(s.step)).filter((x) => !s.completed.includes(x))
  return { ...s, skipped: [...new Set([...s.skipped, ...rest])], done: true, finishedAt: now.toISOString() }
}

/** 설정·⌘K에서 다시 열기: 처음 단계부터, 이전에 한 기록은 남긴다 */
export const reopen = (s: OnboardingState | null, now = new Date()): OnboardingState =>
  s ? { ...s, step: 'welcome', done: false, finishedAt: null } : initialState(now)

/** 이미 한 단계(예: 성향 조사가 이미 끝남)는 그 단계에 들어설 때 저절로 넘긴다 */
export function autoSkip(s: OnboardingState, isDone: (step: Step) => boolean, now = new Date()): OnboardingState {
  let cur = s
  for (let guard = 0; guard < STEPS.length && !cur.done && cur.step !== 'welcome' && isDone(cur.step); guard++) cur = advance(cur, 'done', now)
  return cur
}

/** 언제 저절로 여나: 진행 중 기록이 있으면 이어서, 기록이 없고 이번에 새로 만든 계정이면 처음부터, 그 밖에는 열지 않는다 */
export function shouldOpen(stored: OnboardingState | null, newAccount: boolean): 'resume' | 'start' | null {
  if (stored) return stored.done ? null : 'resume'
  return newAccount ? 'start' : null
}

export const progress = (s: OnboardingState) => ({ index: STEPS.indexOf(s.step), total: STEPS.length })

// ── 저장 (기기, 계정별) ──
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const store = (): Storage | null => { try { return globalThis.localStorage ?? null } catch { return null } }
export const storageKey = (userId: string) => `sprout.onboarding.${userId}`

export function loadState(userId: string, s: Storage | null = store()): OnboardingState | null {
  try {
    const raw = s?.getItem(storageKey(userId))
    if (!raw) return null
    const v = JSON.parse(raw) as OnboardingState
    if ((v?.step as string) === 'import') v.step = 'survey'
    return v?.v === 1 && STEPS.includes(v.step) ? v : null
  } catch { return null }
}
export function saveState(userId: string, value: OnboardingState, s: Storage | null = store()) {
  try { s?.setItem(storageKey(userId), JSON.stringify(value)) } catch { /* 저장 못 해도 이번 실행은 계속 */ }
}

// ── 다시 열기 신호 (⌘K·설정 → OnboardingHost) ──
export const OPEN_EVENT = 'sprout:onboarding-open'
export const openOnboarding = () => window.dispatchEvent(new Event(OPEN_EVENT))

// ── 캘린더 연결(16, 캘린더 담당 모듈의 preload API) ──
export type CalendarProvider = 'google' | 'apple'
export type CalendarAvailability = { google: { usable: boolean; reason?: string }; apple: { usable: boolean; reason?: string } }

export function calendarsApi() {
  return window.sprout?.calendars ?? null
}
export async function calendarAvailability(): Promise<CalendarAvailability> {
  const api = calendarsApi()
  if (!api) return { google: { usable: false, reason: '이 화면에서는 연결할 수 없어요' }, apple: { usable: false, reason: '이 화면에서는 연결할 수 없어요' } }
  try {
    const st = await api.status()
    return {
      google: st.providers.google.configured ? { usable: true } : { usable: false, reason: '아직 준비 중이에요' },
      apple: st.providers.apple.available ? { usable: true } : { usable: false, reason: 'Mac에서만 쓸 수 있어요' }
    }
  } catch {
    return { google: { usable: false, reason: '상태를 읽지 못했어요' }, apple: { usable: false, reason: '상태를 읽지 못했어요' } }
  }
}
/** 연결한 계정 공급자 목록(이미 연결돼 있으면 "연결됨"으로 보인다) */
export async function connectedCalendars(): Promise<CalendarProvider[]> {
  try { return [...new Set(((await calendarsApi()?.status())?.accounts ?? []).map((a) => a.provider))] } catch { return [] }
}
export async function connectCalendar(provider: CalendarProvider): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = calendarsApi()
  if (!api) return { ok: false, error: '이 화면에서는 연결할 수 없어요' }
  try {
    const r = await api.connect(provider)
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  } catch (e) { return { ok: false, error: String(e) } }
}
