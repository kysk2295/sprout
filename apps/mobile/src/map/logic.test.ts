// 29 모바일 작업 지도 계산 시험: 폴더 › 리스트 › 할 일 묶음(기본함 따로, 보관 리스트 제외), 기간, 순서 사슬·고리, 목표 꼬리표
import assert from 'node:assert/strict'
import {
  acceptStmts, buildListTree, chainView, cleanName, connectStmts, dropStmts, filterTasks, goalLinkedCount, goalsAllDone, goalTags, moveTargets, pathOf,
  progressOf, suggestionsFor, unlockedBy, waitingMap, wouldCycle, DEFAULT_FILTER, type MapFolder, type MapLink, type MapList, type MapTask
} from './logic.ts'

let n = 0
const env = { owner: 'u1', uuid: () => `id${++n}`, now: '2026-10-05T00:00:00.000Z' }
const list = (id: string, name: string, folder: string | null = null, extra: Partial<MapList> = {}): MapList => ({ id, name, emoji: null, color: null, kind: 'normal', folder_id: folder, sort_order: 1, ...extra })
const task = (id: string, extra: Partial<MapTask> = {}): MapTask => ({ id, title: `할 일 ${id}`, status: 0, due_at: null, start_at: null, priority: 0, list_id: 'l1', completed_at: null, created_at: null, ...extra })
const link = (id: string, kind: 'sequence' | 'goal', from: string, to: string, state: MapLink['state'] = 'accepted'): MapLink => ({ id, kind, from_type: kind === 'goal' ? 'kpi' : 'task', from_id: from, to_id: to, source: 'ai', state })

// ── 폴더 › 리스트 › 할 일 ──
const folders: MapFolder[] = [{ id: 'f2', name: '회사', sort_order: 2 }, { id: 'f1', name: '학교', sort_order: 1 }]
const lists = [
  list('inbox', '기본함', null, { kind: 'inbox' }),
  list('os', '운영체제', 'f1', { sort_order: 2 }), list('grad', '졸업 프로젝트', 'f1', { sort_order: 1 }),
  list('rel', 'sprout 출시', 'f2'), list('home', '집안일', null, { sort_order: 5 }), list('old', '지난 학기', 'f1', { archived_at: '2026-09-01' }),
  list('orphan', '고아', 'gone', { sort_order: 6 })
]
const tasks = [task('a', { list_id: 'os' }), task('b', { list_id: 'os', status: 1 }), task('c', { list_id: 'grad' }), task('d', { list_id: 'inbox' }), task('e', { list_id: 'old' }), task('g', { list_id: 'home' }), task('h', { list_id: null })]
const tree = buildListTree(folders, lists, tasks)
assert.deepEqual(tree.folders.map((f) => f.folder?.name ?? '(폴더 없음)'), ['(폴더 없음)', '학교', '회사'])
assert.deepEqual(tree.folders[0].lists.map((l) => l.list.name), ['집안일', '고아']) // 지워진 폴더를 가리키는 리스트도 여기로
assert.deepEqual(tree.folders[1].lists.map((l) => l.list.name), ['졸업 프로젝트', '운영체제']) // 보관 리스트 숨김, sort_order
assert.equal(tree.folders[1].open, 2) // a, c (b는 완료)
assert.deepEqual(tree.folders[1].lists[1].tasks.map((t) => t.id), ['a', 'b'])
assert.equal(tree.inbox?.list.id, 'inbox')
assert.deepEqual(tree.inbox?.tasks.map((t) => t.id), ['d'])
assert.ok(!tree.folders.flatMap((f) => f.lists.flatMap((l) => l.tasks)).some((t) => t.id === 'e' || t.id === 'h'))
assert.deepEqual(moveTargets(tree).map((m) => [m.folder?.name ?? null, m.lists.map((l) => l.name)]), [[null, ['집안일', '고아']], ['학교', ['졸업 프로젝트', '운영체제']], ['회사', ['sprout 출시']]])
assert.equal(pathOf(folders, lists, 'os'), '학교 › 운영체제')
assert.equal(pathOf(folders, lists, 'home'), '집안일')
assert.equal(pathOf(folders, lists, 'inbox'), '기본함')
assert.equal(pathOf(folders, lists, 'nope'), null)
assert.deepEqual(progressOf(tree.folders[1].lists[1].tasks), { done: 1, total: 2 })
assert.equal(cleanName('  새   리스트 '), '새 리스트')
assert.equal(cleanName('   '), null)

// ── 기간(이번 주 = 월요일 시작) ──
const today = '2026-10-07' // 수
const ft = [task('w1', { due_at: '2026-10-05' }), task('w2', { due_at: '2026-10-12' }), task('w3'), task('w4', { status: 1, completed_at: new Date('2026-10-04T12:00').toISOString() }), task('w5', { status: 1, completed_at: new Date('2026-10-06T12:00').toISOString() }), task('w6', { title: '  ' })]
assert.deepEqual(filterTasks(ft, DEFAULT_FILTER, today).map((t) => t.id), ['w1', 'w3', 'w5'])
assert.deepEqual(filterTasks(ft, { ...DEFAULT_FILTER, period: 'all' }, today).map((t) => t.id), ['w1', 'w2', 'w3'])
assert.deepEqual(filterTasks(ft, { ...DEFAULT_FILTER, period: 'all', showDone: true }, today).map((t) => t.id), ['w1', 'w2', 'w3', 'w4', 'w5'])
assert.deepEqual(filterTasks(ft, { ...DEFAULT_FILTER, period: 'all', showDone: true, showNoDate: false }, today).map((t) => t.id), ['w1', 'w2'])

// ── 순서 사슬·고리 ──
const links = [link('l1', 'sequence', 'a', 'b'), link('l2', 'sequence', 'b', 'd'), link('l3', 'sequence', 'x', 'y', 'dismissed'), link('g1', 'goal', 'k1', 'a'), link('s1', 'sequence', 'd', 'e', 'suggested')]
assert.equal(wouldCycle(links, 'd', 'a'), true)
assert.equal(wouldCycle(links, 'a', 'd'), false)
assert.equal(wouldCycle(links, 'y', 'x'), false)
assert.equal(connectStmts(env, links, 'sequence', 'd', 'a'), 'cycle')
assert.equal(connectStmts(env, links, 'sequence', 'a', 'b'), 'exists')
const made = connectStmts(env, links, 'sequence', 'a', 'e')
assert.ok(Array.isArray(made) && made[0].params!.includes('user') && made[0].params!.includes('u1'))
assert.equal(acceptStmts(env, [...links, link('s2', 'sequence', 'd', 'a', 'suggested')], 's2'), 'cycle')
assert.match(dropStmts(env, { id: 's1', state: 'suggested' })[0].sql, /^UPDATE map_links/)
assert.match(dropStmts(env, { id: 'l1', state: 'accepted' })[0].sql, /^DELETE FROM map_links/)
const cv = chainView([task('d'), task('b'), task('a', { status: 1 }), task('q')], links)
assert.deepEqual(cv.chain.map((c) => [c.task.id, c.n, c.waiting]), [['a', 1, 0], ['b', 2, 0], ['d', 3, 1]])
assert.deepEqual(cv.rest.map((t) => t.id), ['q'])
const status = new Map([['a', 0], ['b', 0], ['d', 0], ['e', 0]])
assert.equal(waitingMap(links, status).get('b'), 1)
assert.equal(unlockedBy('a', links, new Map([['a', 1], ['b', 0]])), 'b')
assert.equal(unlockedBy('a', links, new Map([['a', 1], ['b', 1]])), null)
assert.deepEqual(goalTags('a', links, [{ id: 'k1', title: '포트폴리오 첫 장' }]), ['포트폴리오 첫 장'])
assert.deepEqual(goalsAllDone([{ id: 'k1', status: 'active' }], links, new Map([['a', 1]])), ['k1'])
assert.deepEqual(goalsAllDone([{ id: 'k1', status: 'achieved' }], links, new Map([['a', 1]])), [])
assert.equal(goalLinkedCount([{ id: 'k1' }], links, status), 1)
assert.deepEqual(suggestionsFor(new Set(['e']), links).map((l) => l.id), ['s1'])

console.log('map logic ok')
