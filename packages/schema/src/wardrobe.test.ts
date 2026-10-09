// 43 옷장 · 해금 · 트로피 · 하루 장면 — 순수 함수 시험
import assert from 'node:assert/strict'
import {
  activeDayList, babyHidesSlot, baseName, conditionText, dayJustDone, decorOn, DEFAULT_LOOK, equipItem, evolutionGift, evolutionHint, giftsAt, growthTags,
  ITEMS, ITEM_BY_ID, itemRowId, lookKey, newUnlocks, ownedItems, parseLook, pickDayMoment, projectFinished, raiseStateFrom, reviewCount, seasonsOn, seasonWindow,
  serializeLook, setPath, stageBoxSize, tapLines, toggleDecor, trophyLine, trophyRowId, trophyShape, unequipSlot, unlocksFor, wornEquip, budsOf, marksOf, type RaiseState
} from './wardrobe.ts'

// ── 옷 23개, id 겹침 없음, 칸 5종 ──
assert.equal(ITEMS.length, 23)
assert.equal(new Set(ITEMS.map((i) => i.id)).size, 23)
assert.deepEqual([...new Set(ITEMS.map((i) => i.slot))].sort(), ['back', 'bg', 'hand', 'hat', 'neck'])
// Lv 2~13은 레벨마다 옷 하나(Lv 14 없음, 15 잎 날개)
for (let lv = 1; lv <= 13; lv++) assert.equal(giftsAt(lv).length, 1, `Lv ${lv}`)
assert.equal(giftsAt(14).length, 0)
assert.equal(giftsAt(15)[0].id, 'wings')
assert.equal(evolutionGift(3)!.id, 'sunset')
assert.equal(evolutionGift(1), null)

// ── 한 날 누적: 할 일 XP(되돌림 반영) ≥ 1인 날. 연속이 아니라 누적 ──
const xp = [
  { kind: 'task', amount: 1, day: '2026-10-01' },
  { kind: 'task', amount: 1, day: '2026-10-01' },
  { kind: 'task', amount: 1, day: '2026-10-03' }, // 하루 건너뜀 — 그래도 센다
  { kind: 'task', amount: 1, day: '2026-10-04' },
  { kind: 'task_revoke', amount: -1, day: '2026-10-04' }, // 취소로 0 → 그날은 안 센다
  { kind: 'kpi', amount: 30, day: '2026-10-05' }, // 목표 XP는 한 날이 아니다
  { kind: 'review', amount: 30, day: '2026-10-05' },
  { kind: 'review', amount: 30, day: '2026-10-12' }
]
assert.deepEqual(activeDayList(xp), ['2026-10-01', '2026-10-03'])
assert.equal(reviewCount(xp), 2)

// ── 계절 기간: 추석·설 앞뒤 7일(음력 표), 크리스마스 12/18–31 ──
assert.deepEqual(seasonWindow('chuseok', 2026), { from: '2026-09-18', to: '2026-10-02' })
assert.deepEqual(seasonWindow('seollal', 2027), { from: '2027-01-31', to: '2027-02-14' })
assert.deepEqual(seasonWindow('xmas', 2026), { from: '2026-12-18', to: '2026-12-31' })
assert.equal(seasonWindow('chuseok', 2099), null) // 표 밖
assert.deepEqual(seasonsOn('2026-10-01'), ['chuseok'])
assert.deepEqual(seasonsOn('2026-12-25'), ['xmas'])
assert.deepEqual(seasonsOn('2026-11-01'), [])

// ── 프로젝트가 끝났나: 열린 0 + 끝낸 3 이상 ──
const m = (status: number, at?: string, del?: string) => ({ status, completed_at: at ?? null, deleted_at: del ?? null })
assert.deepEqual(projectFinished([m(1, '2026-10-02T10:00'), m(1, '2026-10-05T09:00'), m(1, '2026-10-03T09:00')]), { done: true, day: '2026-10-05' })
assert.equal(projectFinished([m(1, '2026-10-02'), m(1, '2026-10-02'), m(0)]).done, false) // 열린 것 남음
assert.equal(projectFinished([m(1, '2026-10-02'), m(1, '2026-10-02')]).done, false) // 끝낸 것 2개
assert.equal(projectFinished([m(1, '2026-10-02'), m(1, '2026-10-02'), m(1, '2026-10-02'), m(0, undefined, '2026-10-03')]).done, true) // 지운 할 일은 빼고
assert.equal(projectFinished([m(1, '2026-10-02'), m(1, '2026-10-02'), m(1, '2026-10-02'), m(2)]).done, true) // 하지 않음은 열린 것이 아니다

// ── 해금: 레벨·한 날·점검·프로젝트·계절 ──
const s0 = raiseStateFrom(8, xp)
assert.equal(s0.days, 2)
assert.deepEqual(s0.seasons, ['chuseok']) // 10/1은 2026 추석 기간
const rows0 = unlocksFor('c1', s0)
const ids0 = rows0.filter((r) => r.kind === 'item').map((r) => r.item_id)
assert.deepEqual(ids0.sort(), ['acorn-cap', 'bandana', 'grass', 'leaf-hat', 'moon', 'pencil', 'ribbon', 'songpyeon', 'straw', 'sunset'].sort())
assert.ok(rows0.every((r) => r.character_id === 'c1'))
assert.equal(rows0.find((r) => r.item_id === 'straw')!.id, 'item:c1:straw')
assert.equal(rows0.find((r) => r.item_id === 'moon')!.source, 'season')

const many: RaiseState = { level: 15, days: 31, reviews: 12, projects: [{ id: 'p1', title: '공모전', day: '2026-10-10' }], seasons: ['xmas', 'seollal', 'chuseok'] }
const all = unlocksFor('c1', many)
assert.equal(all.filter((r) => r.kind === 'item').length, 23) // 다 열림
const trophies = all.filter((r) => r.kind === 'trophy')
assert.deepEqual(trophies.map((r) => r.id), [
  trophyRowId.project('c1', 'p1'), trophyRowId.days('c1', 7), trophyRowId.days('c1', 30), trophyRowId.review('c1', 4), trophyRowId.review('c1', 12)
])
assert.equal(trophies[0].id, 'trophy:c1:project:p1')
assert.equal(trophies[0].title, '공모전')
assert.equal(trophies[2].id, 'trophy:c1:days:30')

// 이미 있는 행은 다시 넣지 않는다 — 두 기기에서 같이 열려도 같은 id라 한 행(43 §16)
const have = all.map((r) => r.id)
assert.equal(newUnlocks('c1', many, have).length, 0)
assert.deepEqual(newUnlocks('c1', many, have.filter((id) => id !== itemRowId('c1', 'lantern'))).map((r) => r.item_id), ['lantern'])
// 같은 상태 → 같은 id(기기 무관)
assert.deepEqual(unlocksFor('c1', many).map((r) => r.id), have)

// 받은 것은 잃지 않는다: 완료 취소로 조건 아래로 내려가도 표에 남은 옷은 그대로(ownedItems는 행 ∪ 규칙)
const after = raiseStateFrom(8, [...xp, { kind: 'task_revoke', amount: -1, day: '2026-10-03' }])
assert.equal(after.days, 1)
const owned = ownedItems([{ item_id: 'mug', kind: 'item' }, { item_id: 'cup', kind: 'trophy' }], after)
assert.ok(owned.has('mug')) // 7일 아래로 내려갔어도 받은 머그컵은 남는다
assert.ok(!owned.has('cup')) // 트로피는 옷이 아니다
assert.ok(owned.has('straw')) // 규칙으로 열린 것(행이 아직 안 와도)
assert.ok(owned.has('grass'))
assert.ok(!owned.has('wings'))

// 만지기로는 아무것도 늘지 않는다: 해금 입력에 만지기가 없다(상태 = 레벨·XP 원장·프로젝트뿐)
assert.deepEqual(Object.keys(s0).sort(), ['days', 'level', 'projects', 'reviews', 'seasons'])

// ── 조건 글(재촉 없는 기간 표기) ──
assert.equal(conditionText(ITEM_BY_ID.beanie), 'Lv 12')
assert.equal(conditionText(ITEM_BY_ID.lantern, many), '한 날 30일 · 지금 31일')
assert.equal(conditionText(ITEM_BY_ID.lei), '주간 점검 4번')
assert.equal(conditionText(ITEM_BY_ID.santa), '12/18–12/31에 할 일 하나')
assert.equal(conditionText(ITEM_BY_ID.flag), '프로젝트 하나 끝내기')

// ── 트로피 모양·말 ──
assert.deepEqual(trophyShape({ item_id: 'cup', source: 'project' }), { k: 'cup' })
assert.deepEqual(trophyShape({ item_id: 'medal-30', source: 'days' }), { k: 'medal', n: 30 })
assert.deepEqual(trophyShape({ item_id: 'stamp-4', source: 'review' }), { k: 'stamp', n: 4 })
assert.equal(trophyLine({ title: '공모전', source: 'project' }), '공모전 끝낸 기념이야!')
assert.equal(trophyLine({ title: '한 날 7일', source: 'days' }), '한 날 7일! 같이 쌓았지')

// ── look_json ──
assert.deepEqual(parseLook(null), DEFAULT_LOOK)
assert.deepEqual(parseLook('{bad'), DEFAULT_LOOK)
assert.deepEqual(parseLook('{"path":"b","eq":{"hat":"straw","neck":"mug","bg":"dragon"},"decorOff":["tent","x"]}'), { path: 'b', eq: { hat: 'straw', neck: null, hand: null, back: null, bg: 'grass' }, decorOff: ['tent'] })
const l1 = equipItem(DEFAULT_LOOK, 'straw')
assert.equal(l1.eq.hat, 'straw')
assert.equal(equipItem(l1, 'straw').eq.hat, null) // 다시 누르면 벗는다
assert.equal(equipItem(l1, 'beanie').eq.hat, 'beanie') // 같은 칸은 바꿔 입는다
assert.equal(equipItem(equipItem(l1, 'sunset'), 'sunset').eq.bg, 'sunset') // 배경은 벗지 않는다
assert.equal(unequipSlot(l1, 'hat').eq.hat, null)
assert.equal(setPath(l1, 'b').path, 'b')
assert.deepEqual(toggleDecor(toggleDecor(l1, 'pot'), 'pot').decorOff, [])
assert.deepEqual(parseLook(serializeLook(equipItem(setPath(l1, 'b'), 'mug'))), { path: 'b', eq: { hat: 'straw', neck: null, hand: 'mug', back: null, bg: 'grass' }, decorOff: [] })
assert.deepEqual(wornEquip(equipItem(l1, 'mug'), new Set(['grass', 'straw'])), { hat: 'straw', neck: null, hand: null, back: null, bg: 'grass' })
assert.deepEqual(decorOn(5, toggleDecor(DEFAULT_LOOK, 'fence')), ['pot', 'mushlamp', 'butterfly'])
assert.equal(lookKey(l1), lookKey({ ...DEFAULT_LOOK, eq: { ...DEFAULT_LOOK.eq, hat: 'straw', bg: 'night' } })) // 배경은 열쇠에 안 들어감
assert.notEqual(lookKey(l1), lookKey(DEFAULT_LOOK))

// ── 레벨 안 성장(43 §3 · §18.5) ──
assert.equal(stageBoxSize(1), stageBoxSize(20)) // 크기는 늘 같다(2026-10-09 사용자 결정)
assert.deepEqual([6, 7, 8, 9, 10].map(budsOf), [0, 1, 2, 3, 0]) // 진화하면 다시 0
assert.deepEqual([1, 2, 3, 12, 13, 20].map(marksOf), [0, 1, 1, 6, 6, 6])
assert.deepEqual(growthTags(9, 'worm'), ['새싹 잎 +1'])
assert.deepEqual(growthTags(8, 'snail'), ['새싹 잎 +1', '주근깨 +1'])
assert.deepEqual(growthTags(10, 'frog'), ['단짝으로 진화'])
assert.deepEqual(growthTags(6, 'bee'), ['친구로 진화'])
assert.equal(evolutionHint(8), '단짝까지 2레벨')
assert.equal(evolutionHint(9), '다음 레벨에 진화!')
assert.equal(evolutionHint(16), '전설')
// Lv 2~13은 레벨마다 잎·점·진화 중 하나가 바뀐다(키는 자라지 않음 — 2026-10-09)
for (let lv = 2; lv <= 13; lv++) assert.ok(growthTags(lv, 'snail').length >= 1, `Lv ${lv}`)

// ── 옷장 기본 칸 · 아기 ──
assert.equal(baseName('hat', 'bee', 4), '진화 관')
assert.equal(baseName('hat', 'frog', 2), '잎 모자')
assert.equal(baseName('back', 'snail', 3), '껍데기(그대로 남음)')
assert.equal(baseName('back', 'worm', 3), '잎 가방')
assert.equal(baseName('hand', 'worm', 5), '없음')
assert.ok(babyHidesSlot('neck', 1) && babyHidesSlot('back', 1) && !babyHidesSlot('hat', 1) && !babyHidesSlot('neck', 2))

// ── 하루 장면: 마감 날 > 바쁜 날 > 아침, 하루 한 번, 밤엔 없음 ──
const ctx = { hour: 8, dueOpen: 3, dueTotal: 4, eventMinutes: 60, projectDeadline: false, shownToday: false }
assert.equal(pickDayMoment(ctx), 'morning')
assert.equal(pickDayMoment({ ...ctx, hour: 14 }), null)
assert.equal(pickDayMoment({ ...ctx, dueTotal: 8 }), 'busy')
assert.equal(pickDayMoment({ ...ctx, hour: 15, eventMinutes: 360 }), 'busy')
assert.equal(pickDayMoment({ ...ctx, dueTotal: 9, projectDeadline: true }), 'deadline')
assert.equal(pickDayMoment({ ...ctx, shownToday: true }), null)
assert.equal(pickDayMoment({ ...ctx, hour: 23, projectDeadline: true }), null)
assert.ok(dayJustDone({ dueOpen: 1, dueTotal: 3 }, { dueOpen: 0 }))
assert.ok(!dayJustDone({ dueOpen: 0, dueTotal: 0 }, { dueOpen: 0 })) // 0개인 날은 장면 없음
// 바쁜 날엔 재촉 문장을 뺀다
assert.ok(!tapLines({ level: 8, dueOpen: 5, xpLeft: 30, busy: true }).some((l) => l.includes('하나만 같이')))
assert.ok(tapLines({ level: 8, dueOpen: 5, xpLeft: 30 }).some((l) => l.includes('하나만 같이')))
assert.ok(tapLines({ level: 8, dueOpen: 0, xpLeft: 5 }).includes('레벨업까지 5 XP!'))
assert.ok(tapLines({ level: 8, dueOpen: 0, xpLeft: 30 }).includes('Lv 9엔 작은 배낭 받아'))

console.log('wardrobe ok')
