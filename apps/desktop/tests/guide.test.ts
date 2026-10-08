// 37 탭 사용법 공통 — 등록(탭별 내용) · 기기 기억 · 한 번에 하나 · 가리킬 곳(없으면 가운데) 시험.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  GUIDE_TABS, GUIDES_VIEW_KEY, activeTour, boxVisible, claimTour, encodeGuidesSeen, guideTabOf, loadSeen, localSeenTabs, mergeGuidesSeen, pickTarget, placeTourCard,
  releaseTour, requestGuide, resetGuideRun, saveSeen, seenKey, shouldAutoTour, type TourBox
} from '../src/renderer/src/components/guide/core'
import { GUIDES, LIMITS } from '../src/renderer/src/components/guide/content'

// ── 레일 보기 → 사용법 탭 ──
assert.equal(guideTabOf('tasks'), 'tasks')
assert.equal(guideTabOf('notes'), 'collect')
assert.equal(guideTabOf('watch'), 'collect')
assert.equal(guideTabOf('wiki'), 'collect')
assert.equal(guideTabOf('map'), 'map')
assert.equal(guideTabOf('settings'), null, '설정은 사용법 없음')

// ── 기기 기억 ──
const mem = new Map<string, string>()
const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
for (const t of GUIDE_TABS) assert.deepEqual(loadSeen(t, fake), { tour: 'new' }, `${t} 처음은 new`)
saveSeen('calendar', { tour: 'done' }, fake)
assert.equal(loadSeen('calendar', fake).tour, 'done')
assert.equal(loadSeen('tasks', fake).tour, 'new', '탭마다 따로')
// 작업 지도는 34 때 키를 그대로 — 이미 끝낸 사람에게 다시 뜨지 않고, 옛 hints는 남는다
assert.equal(seenKey('map'), 'sprout.map.guide')
mem.set('sprout.map.guide', JSON.stringify({ tour: 'done', hints: ['nogoal'] }))
assert.equal(loadSeen('map', fake).tour, 'done')
saveSeen('map', { tour: 'new' }, fake)
assert.deepEqual(JSON.parse(mem.get('sprout.map.guide')!), { tour: 'new', hints: ['nogoal'] })
mem.set(seenKey('diary'), '{깨짐')
assert.equal(loadSeen('diary', fake).tour, 'new', '깨진 값은 new')
saveSeen('diary', { tour: 'done' }, fake)
assert.equal(loadSeen('diary', fake).tour, 'done', '깨진 값은 덮는다')
assert.equal(loadSeen('growth', null).tour, 'new', '저장소가 없어도')

// ── 예전 기기 기억 → 동기화 행으로 옮길 탭 ──
assert.deepEqual(localSeenTabs(fake), ['calendar', 'diary'], '예전 `다시 보지 않기`·`시작하기`로 done인 탭(map은 위에서 new로 되돌림)')
assert.deepEqual(localSeenTabs(null), [])

// ── 동기화 행(view_settings guides) — 합집합 · 깨진 값 · 모르는 탭 ──
assert.equal(GUIDES_VIEW_KEY, 'guides')
assert.deepEqual(mergeGuidesSeen([]), [])
assert.deepEqual(mergeGuidesSeen([{ options_json: encodeGuidesSeen(['map', 'tasks']) }, { options_json: '{"seen":["tasks","diary","settings",3]}' }, { options_json: '{깨짐' }, { options_json: null }]),
  ['tasks', 'diary', 'map'], '기기마다 만든 행을 합치고, 모르는 탭·깨진 행은 버린다')
assert.equal(encodeGuidesSeen(new Set(['map', 'tasks', 'map'] as const)), '{"seen":["tasks","map"]}', '탭 순서로 한 번씩')
// 기기 A가 쓰고 기기 B가 읽는다
assert.deepEqual(mergeGuidesSeen([{ options_json: encodeGuidesSeen(['growth']) }]), ['growth'])

// ── 한 번에 하나 ──
resetGuideRun()
assert.equal(claimTour('growth'), true)
assert.equal(claimTour('growth'), true, '같은 탭은 다시 잡아도 된다')
assert.equal(claimTour('diary'), false, '다른 탭 둘러보기가 떠 있으면 안 됨')
assert.equal(activeTour(), 'growth')
releaseTour('diary') // 남의 자리는 못 놓는다
assert.equal(activeTour(), 'growth')
releaseTour('growth')
assert.equal(activeTour(), null)
assert.equal(claimTour('diary'), true)
resetGuideRun()

// ── 언제 뜨나 — 평생 한 번 ──
const base = { ready: true, done: false, open: false }
assert.equal(shouldAutoTour(base), true, '처음은 뜬다')
assert.equal(shouldAutoTour({ ...base, ready: false }), false, '자료(본 기억 포함)가 다 읽히기 전엔 안 뜸')
assert.equal(shouldAutoTour({ ...base, done: true }), false, '한 번 본 뒤엔(✕로 닫았어도) 다시 안 뜸')
// 한 번 보고 ✕로 닫은 흐름: 닫기 = 본 것으로 저장 → 다음 실행(새로 읽기)에도 done
{
  const m = new Map<string, string>()
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  assert.equal(shouldAutoTour({ ...base, done: loadSeen('tasks', st).tour === 'done' }), true)
  saveSeen('tasks', { tour: 'done' }, st) // closeTour·finishTour 모두 이렇게 저장
  assert.equal(shouldAutoTour({ ...base, done: loadSeen('tasks', st).tour === 'done' }), false, '다음 실행에도 안 뜸')
  assert.equal(shouldAutoTour({ ...base, done: mergeGuidesSeen([{ options_json: encodeGuidesSeen(localSeenTabs(st)) }]).includes('tasks') }), false, '다른 기기(동기화 행)에서도 안 뜸')
}
assert.equal(shouldAutoTour({ ...base, open: true }), false)
assert.equal(shouldAutoTour({ ...base, allowed: false }), false, '탭별 조건(작업 지도 = 계획 화면)')
assert.equal(requestGuide('tasks'), false, '창이 없으면(노드) 처리 안 됨 → 단축키 시트')
assert.equal(requestGuide(null), false)

// ── 가리킬 곳 ──
const view = { W: 1378, H: 884 }
const doc: Record<string, TourBox[]> = {
  '.hidden': [{ left: 0, top: 0, width: 0, height: 0 }],
  '.offscreen': [{ left: 2000, top: 10, width: 100, height: 40 }],
  '.addbar': [{ left: 300, top: 60, width: 600, height: 36 }, { left: 300, top: 900, width: 600, height: 36 }],
  '.side-item': [{ left: 60, top: 40, width: 200, height: 32 }, { left: 60, top: 72, width: 200, height: 32 }, { left: 60, top: 104, width: 180, height: 32 }]
}
const q = (s: string) => doc[s] ?? []
assert.equal(boxVisible({ left: 0, top: 0, width: 0, height: 0 }, view), false)
assert.deepEqual(pickTarget(['.missing', '.hidden', '.offscreen', '.addbar'], q, view), doc['.addbar'][0], '보이는 첫 후보')
assert.deepEqual(pickTarget(['@all:.side-item'], q, view), { left: 60, top: 40, width: 200, height: 96 }, '@all = 모두 감싸기')
assert.equal(pickTarget(['.missing', '.hidden'], q, view), null, '없으면 null')
const card = { w: 300, h: 180 }
assert.deepEqual(placeTourCard(null, card, view), { left: (1378 - 300) / 2, top: (884 - 180) / 2 }, '없으면 가운데 카드(막만 남지 않음)')
for (const v of [{ W: 400, H: 300 }, { W: 200, H: 120 }]) {
  const p = placeTourCard(null, card, v)
  assert.ok(p.left >= 8 && p.top >= 8, `작은 창도 화면 안: ${JSON.stringify(p)}`)
}

// ── 등록(탭별 내용) — 한도 · 해 보기 id(탭 코드가 이 id로 동작을 고른다) · 표시 짝 ──
const RECIPES: Record<string, string[]> = {
  tasks: ['quick', 'natural', 'tidy'], calendar: ['arrange', 'options', 'subscribe'], growth: ['review', 'quest', 'diary'],
  assistant: ['add', 'week', 'plan'], collect: ['throw', 'watch', 'wiki'], diary: ['today', 'review', 'talk'], map: ['split', 'morning', 'goal']
}
const balanced = (t: string, where: string) => {
  assert.equal((t.match(/\*\*/g) ?? []).length % 2, 0, `${where}: ** 짝`)
  assert.equal((t.match(/`/g) ?? []).length % 2, 0, `${where}: \` 짝`)
  for (const [, b] of t.matchAll(/\*\*([^*]+)\*\*/g)) assert.ok(!b.includes('`'), `${where}: 굵게 안에 키 표시를 겹치지 않는다(그대로 보임)`)
}
for (const tab of GUIDE_TABS) {
  const g = GUIDES[tab]
  assert.ok(g, `${tab} 사용법이 있다`)
  assert.ok(g.title.endsWith('사용법') && g.lead.length > 0, `${tab} 제목·한 줄`)
  assert.ok(g.steps.length >= 1 && g.steps.length <= LIMITS.steps, `${tab} 둘러보기 1~3단계`)
  assert.ok(g.sections.length >= LIMITS.sectionsMin && g.sections.length <= LIMITS.sectionsMax, `${tab} 절 4~6개`)
  assert.ok(g.recipes.length >= LIMITS.recipesMin && g.recipes.length <= LIMITS.recipesMax, `${tab} 해 보기 2~3개`)
  assert.deepEqual(g.recipes.map((r) => r.id), RECIPES[tab], `${tab} 해 보기 id`)
  assert.equal(new Set(g.sections.map((s) => s.id)).size, g.sections.length, `${tab} 절 id 겹침 없음`)
  for (const s of g.sections) { assert.ok(s.ill.length > 0 && s.body.length <= 260, `${tab}/${s.id} 그림·짧은 글`); balanced(s.body, `${tab}/${s.id}`) }
  for (const r of g.recipes) { assert.ok(r.steps.length === 3 && r.cta.length <= 12, `${tab}/${r.id} 3단계·짧은 단추`); r.steps.forEach((x) => balanced(x, `${tab}/${r.id}`)) }
  for (const [i, st] of g.steps.entries()) {
    assert.ok(st.targets.length >= 1, `${tab} ${i + 1}단계 가리킬 곳`)
    assert.ok(st.title.length <= 20, `${tab} ${i + 1}단계 제목 짧게: ${st.title}`)
    balanced(st.body, `${tab} ${i + 1}단계`)
  }
  if (tab !== 'map') assert.ok(g.steps.at(-1)!.body.includes('**?**'), `${tab} 마지막 단계는 ?로 다시 보는 법`)
}

// ── 가리키는 선택자가 실제 화면 코드에 있다(클래스 · data-view · aria-label) ──
const root = 'apps/desktop/src/renderer/src'
const files: string[] = []
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx$/.test(f) && !p.includes('/guide/')) files.push(p) } }
walk(root)
const source = files.map((f) => readFileSync(f, 'utf8')).join('\n')
for (const tab of GUIDE_TABS) {
  for (const st of GUIDES[tab].steps) {
    for (const t of st.targets) {
      const sel = t.replace(/^@all:/, '')
      for (const cls of sel.match(/\.[a-z][\w-]*/g) ?? []) assert.ok(new RegExp(`["'\` ]${cls.slice(1)}["'\` $]`).test(source), `${tab}: ${cls} 클래스가 화면 코드에 있다`)
      for (const [, attr, val] of sel.matchAll(/\[([\w-]+)[\^]?="([^"]+)"\]/g)) {
        if (attr === 'data-view') assert.ok(source.includes('data-view={key}'), 'data-view가 사이드바에 있다')
        else assert.ok(source.includes(`${attr}="${val}"`), `${tab}: [${attr}="${val}"]가 화면 코드에 있다`)
      }
    }
  }
}
// `다시 보지 않기` 단추는 없다(닫으면 곧 본 것) · 닫기와 끝내기는 같은 저장
const guideSrc = readFileSync(join(root, 'components/guide/Guide.tsx'), 'utf8')
assert.ok(!guideSrc.includes('다시 보지 않기'), '둘러보기 카드에 `다시 보지 않기`가 없다')
assert.ok(/closeTour: finish\b/.test(guideSrc), '✕ · Esc · 막 누르기도 본 것으로 저장')
console.log('guide ok')
