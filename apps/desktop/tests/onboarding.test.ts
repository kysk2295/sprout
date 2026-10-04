// 18 첫 실행 안내: 단계 상태 머신 — 건너뛰기·이어 하기·계정당 한 번
import assert from 'node:assert/strict'
import { advance, autoSkip, back, initialState, loadState, progress, reopen, saveState, shouldOpen, skipAll, STEPS, storageKey, type OnboardingState } from '../src/renderer/src/data/onboarding'

const t0 = new Date('2026-10-06T09:00:00Z')
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m } }

// 순서
assert.deepEqual(STEPS, ['welcome', 'calendar', 'import', 'survey', 'first-task'])
let s = initialState(t0)
assert.equal(s.step, 'welcome')
assert.deepEqual(progress(s), { index: 0, total: 5 })

// 한 단계씩: 한 것·건너뛴 것이 따로 남는다
s = advance(s, 'done', t0) // 환영
s = advance(s, 'skip', t0) // 캘린더 건너뜀
assert.equal(s.step, 'import')
assert.deepEqual(s.completed, ['welcome'])
assert.deepEqual(s.skipped, ['calendar'])
// 이전으로 가서 다시 하면 건너뜀 → 함으로 바뀐다
s = back(s)
assert.equal(s.step, 'calendar')
s = advance(s, 'done', t0)
assert.deepEqual(s.skipped, [])
assert.ok(s.completed.includes('calendar'))
assert.equal(back(initialState(t0)).step, 'welcome') // 첫 단계에서 이전은 그대로

// 끝까지 가면 done
s = advance(advance(advance(s, 'skip'), 'done'), 'done', t0)
assert.equal(s.done, true)
assert.equal(s.finishedAt, t0.toISOString())
assert.equal(advance(s, 'done'), s) // 끝난 뒤에는 바뀌지 않는다

// 전체 건너뛰기: 남은 단계를 모두 건너뜀으로
let k = skipAll(advance(initialState(t0), 'done'), t0)
assert.equal(k.done, true)
assert.deepEqual(k.skipped, ['calendar', 'import', 'survey', 'first-task'])

// 이미 한 단계(성향 조사 끝남)는 들어서는 순간 넘긴다. 환영 단계는 넘기지 않는다
let a = { ...initialState(t0), step: 'survey' as const }
a = autoSkip(a, (st) => st === 'survey')
assert.equal(a.step, 'first-task')
assert.ok(a.completed.includes('survey'))
assert.equal(autoSkip(initialState(t0), () => true).step, 'welcome')
const same = { ...initialState(t0), step: 'calendar' as const }
assert.equal(autoSkip(same, () => false), same) // 바뀔 게 없으면 같은 객체(화면이 다시 그리지 않게)

// 언제 여나: 새 계정이면 시작, 진행 중이면 이어서, 끝났거나 기존 계정이면 열지 않음
assert.equal(shouldOpen(null, true), 'start')
assert.equal(shouldOpen(null, false), null) // 다른 기기에서 기존 계정으로 로그인
assert.equal(shouldOpen({ ...initialState(t0), step: 'import' }, false), 'resume') // 중간에 앱을 껐다 켬
assert.equal(shouldOpen(s, true), null) // 끝냈으면 새 계정 표시가 남아 있어도 다시 안 뜬다
assert.equal(shouldOpen(k, false), null)

// 저장: 계정별 키, 깨진 값은 무시
const st = mem()
saveState('user-a', { ...initialState(t0), step: 'survey' }, st)
assert.equal(loadState('user-a', st)?.step, 'survey')
assert.equal(loadState('user-b', st), null) // 같은 기기의 다른 계정은 따로
assert.equal(storageKey('user-a'), 'sprout.onboarding.user-a')
st.setItem(storageKey('bad'), '{oops')
assert.equal(loadState('bad', st), null)
st.setItem(storageKey('old'), JSON.stringify({ v: 0, step: 'welcome' }))
assert.equal(loadState('old', st), null)
st.setItem(storageKey('weird'), JSON.stringify({ ...initialState(t0), step: 'nope' }))
assert.equal(loadState('weird', st), null)
assert.equal(loadState('x', null), null) // 저장소를 못 쓰는 환경

// 이어 하기 왕복: 저장 → 다시 읽기 → 다음 단계
saveState('user-a', advance(loadState('user-a', st)!, 'skip'), st)
const resumed = loadState('user-a', st)!
assert.equal(resumed.step, 'first-task')
assert.equal(shouldOpen(resumed, false), 'resume')

// 다시 열기(⌘K·설정): 처음부터, 지난 기록은 남는다
const r: OnboardingState = reopen(s, t0)
assert.equal(r.step, 'welcome')
assert.equal(r.done, false)
assert.deepEqual(r.completed, s.completed)
assert.equal(reopen(null, t0).step, 'welcome')
console.log('onboarding: ok')
