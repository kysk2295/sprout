// 31 작업 지도 v3: ① 지금 할 일(상태·띠 순서·열어 주는 수·남은 길) ③ 목표로 묶기(묶기 함수·줄 목록·배치·목표 선 옮기기·D3 횟수 목표 +1)
// ④ AI 쪼개기(답 검증·순서 이어 붙이기·만들기 한 트랜잭션·24시간 되돌리기·손댄 할 일 남김·용도 breakdown)
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { insert, run } from '../src/renderer/src/data/mutations'
import { layoutMap, type MapGoal, type MapLink, type MapList, type MapTask } from '../src/renderer/src/data/map'
import { buildGoalTree, groupMap, mapRows, nestTasks } from '../src/renderer/src/data/mapGrouping'
import { nowStrip, pathLabel, remainingPath, taskStates, unlockCounts } from '../src/renderer/src/data/mapNow'
import { countLinkedGoals, linkedGoalDeltas, moveGoalLink, moveGoalLinkStmts } from '../src/renderer/src/data/mapGoals'
import {
  addStep, applyBreakdown, askBreakdown, breakdownPayload, breakdownStmts, bridgedAfter, countNew, loadBreakdownUndo, removeStep, reorderSteps, stepWouldCycle, undoBreakdown, undoPlan, validateBreakdown, type Step
} from '../src/renderer/src/data/breakdown'
import { thisWeek } from '../src/renderer/src/data/growth'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const store = new Map<string, string>([['sprout.assistant.model', 'test-model']])
const chats: { purpose?: string; messages: { role: string; content: string }[]; format?: unknown }[] = []
const answers: string[] = []
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  window: {
    dispatchEvent: () => true,
    sprout: {
      db: { getAll: async (sql: string, p?: unknown[]) => all(sql, p), get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null, transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } } },
      assistant: {
        chat: async (_id: string, input: { purpose?: string; messages: { role: string; content: string }[] }) => { chats.push(input); const a = answers.shift(); if (a === undefined) throw new Error('no answer'); return a },
        onDelta: () => () => {}, cancel: () => {}, models: async () => ['test-model']
      }
    }
  }
})

const T = (id: string, o: Partial<MapTask> = {}): MapTask => ({ id, title: id, status: 0, due_at: null, start_at: null, priority: 0, list_id: 'a', completed_at: null, created_at: null, ...o })
const seq = (from_id: string, to_id: string, state: MapLink['state'] = 'accepted') => ({ kind: 'sequence' as const, from_id, to_id, state })
const gl = (from_id: string, to_id: string, state: MapLink['state'] = 'accepted') => ({ kind: 'goal' as const, from_id, to_id, state })
const today = '2026-10-07'

// ── ① 지금 할 일: A→B→C에서 A만 지금, B·C는 막힘(먼저 1) ──
{
  const tasks = [T('A'), T('B'), T('C'), T('D', { start_at: '2026-10-09' }), T('E', { status: 1 })]
  const links = [seq('A', 'B'), seq('B', 'C'), seq('E', 'D'), seq('X', 'A', 'suggested')]
  const { state, wait } = taskStates(tasks, links, today)
  assert.equal(state.get('A'), 'now', '제안 선(suggested)은 막지 않는다')
  assert.equal(state.get('B'), 'blocked')
  assert.equal(state.get('C'), 'blocked')
  assert.equal(wait.get('B'), 1)
  assert.equal(state.get('D'), 'later', '앞 할 일을 끝냈어도 시작일이 내일 이후면 나중')
  assert.equal(state.get('E'), 'done')
  // A 완료 → B가 지금
  const after = taskStates([T('A', { status: 1 }), T('B'), T('C')], links, today)
  assert.equal(after.state.get('B'), 'now')
  assert.equal(after.state.get('C'), 'blocked')
  // 보이지 않는 앞 할 일(다른 리스트)이 열려 있으면 막힘
  assert.equal(taskStates([T('B')], [seq('Z', 'B')], today, new Set(['Z', 'B'])).state.get('B'), 'blocked')
  // 열어 주는 수 = 뒤로 이어진 열린 사슬의 가장 긴 길이
  const open = new Set(['A', 'B', 'C', 'F'])
  const un = unlockCounts([seq('A', 'B'), seq('B', 'C'), seq('A', 'F')], open)
  assert.equal(un.get('A'), 2)
  assert.equal(un.get('B'), 1)
  assert.equal(un.has('C'), false)
  assert.equal(unlockCounts([seq('a', 'b'), seq('b', 'a')], new Set(['a', 'b'])).get('a')! >= 1, true, '고리가 있어도 멈춘다')
}
// 띠 순서: 기한 지남 → 오늘 마감 → 열어 주는 수 → 목표 연결 → 우선순위 → 지도 순서, 위에서 5개
{
  const tasks = [
    T('plain'), T('prio', { priority: 3 }), T('goal'), T('opener'), T('today', { due_at: '2026-10-07' }), T('late', { due_at: '2026-10-01T09:00' }),
    T('next'), T('blocked'), T('p2', { priority: 1 })
  ]
  const links = [seq('opener', 'next'), seq('next', 'blocked')]
  const { state } = taskStates(tasks, links, today)
  const opts = { unlock: unlockCounts(links, new Set(tasks.map((t) => t.id))), goalLinked: new Set(['goal']), today, hasSeq: true }
  const s = nowStrip(tasks, state, opts)
  assert.deepEqual(s.items.map((x) => x.task.id), ['late', 'today', 'opener', 'goal', 'prio'])
  assert.deepEqual(s.items.map((x) => x.reason.label), ['기한 지남', '오늘 마감', '2단계를 열어요', '🎯', ''])
  assert.equal(s.total, 7, '막힌 할 일(next·blocked)은 빼고 센다')
  // 순서 선이 하나도 없으면 ③(열어 주는 수)은 건너뛴다
  const noSeq = nowStrip(tasks, state, { ...opts, hasSeq: false })
  assert.deepEqual(noSeq.items.map((x) => x.task.id).slice(0, 4), ['late', 'today', 'goal', 'prio'])
}
// 목표까지 남은 길: 목표 선이 닿는 열린 할 일 + 그 앞(거꾸로) → 가장 긴 사슬, 다음 = 첫 지금
{
  const tasks = [T('plan'), T('draft'), T('review', { due_at: '2026-10-10' }), T('side'), T('qa', { start_at: '2026-10-20' })]
  const links = [seq('plan', 'draft'), seq('draft', 'review'), seq('side', 'review'), gl('g', 'review'), gl('g2', 'qa'), gl('g3', 'done1')]
  const open = new Set(tasks.map((t) => t.id))
  const { state } = taskStates(tasks, links, today, open)
  const p = remainingPath('g', links, open, state, (id) => tasks.find((t) => t.id === id)?.due_at ?? null)!
  assert.deepEqual(p.chain, ['plan', 'draft', 'review'])
  assert.equal(p.steps, 3)
  assert.equal(p.next, 'plan')
  assert.equal(pathLabel(p, (id) => id), '남은 3단계 · 다음: plan')
  const q = remainingPath('g2', links, open, state, () => null)!
  assert.equal(q.next, null)
  assert.equal(pathLabel(q, (id) => id), '남은 1단계 · 다음: 막힘 없음 — 날짜를 기다려요')
  assert.equal(remainingPath('g3', links, open, state, () => null), null, '연결 할 일을 다 끝내면 없음')
  assert.equal(pathLabel(null, () => ''), '연결된 할 일을 다 끝냈어요')
  // 같은 길이면 마감 이른 사슬
  const t2 = [T('x1'), T('x2', { due_at: '2026-10-20' }), T('y1'), T('y2', { due_at: '2026-10-09' })]
  const l2 = [seq('x1', 'x2'), seq('y1', 'y2'), gl('h', 'x2'), gl('h', 'y2')]
  const o2 = new Set(t2.map((t) => t.id))
  assert.deepEqual(remainingPath('h', l2, o2, taskStates(t2, l2, today, o2).state, (id) => t2.find((t) => t.id === id)?.due_at ?? null)!.chain, ['y1', 'y2'])
}

// ── ③ 목표로 묶기 ──
const L = (id: string, name: string, o: Partial<MapList> = {}): MapList => ({ id, name, emoji: null, color: null, folder_id: null, kind: 'normal', sort_order: 1, archived_at: null, ...o })
const G = (id: string, o: Partial<MapGoal> = {}): MapGoal => ({ id, title: id, target: 1, progress: 0, status: 'active', week_start: '2026-10-05', achieved_at: null, source: 'manual', sort_order: 1, ...o })
{
  const lists = [L('in', 'Inbox', { kind: 'inbox', sort_order: 0 }), L('a', '졸업', { sort_order: 1 }), L('b', '회사', { folder_id: 'f', sort_order: 2 })]
  const folders = [{ id: 'f', name: 'Work', sort_order: 1 }]
  const tasks = [T('t1', { list_id: 'a' }), T('t2', { list_id: 'b' }), T('t3', { list_id: 'a' }), T('sub', { list_id: 'a', parent_id: 't1' }), T('t4', { list_id: null }), T('both', { list_id: 'b' })]
  const goals = [G('g2', { sort_order: 2 }), G('g1', { sort_order: 1 })]
  const links = [gl('g1', 't1'), gl('g1', 't2'), gl('g2', 't3'), gl('g2', 'both'), gl('g1', 'both'), gl('g1', 't4', 'dismissed')]
  const tree = buildGoalTree({ folders, lists, tasks, links, goals })
  assert.deepEqual(tree.sections.map((s) => s.id), ['g1', 'g2', 'nogoal'], '목표 순서(성장 탭) + 맨 끝 목표 없음')
  const g1 = tree.sections[0]
  assert.deepEqual(g1.lists.map((l) => l.list.id), ['a', 'b'], '연결 할 일이 있는 리스트만, 사이드바 순서')
  assert.deepEqual(g1.lists[0].tasks.map((t) => t.id), ['t1', 'sub'], '하위 할 일은 부모를 따라 부모 바로 아래')
  assert.ok(g1.lists[1].tasks.some((t) => t.id === 'both'), '두 목표에 연결된 할 일은 첫 목표 아래')
  assert.equal(tree.sections[1].lists.flatMap((l) => l.tasks).some((t) => t.id === 'both'), false)
  assert.equal(tree.multi.get('both'), 2)
  assert.deepEqual(tree.sections[2].lists.flatMap((l) => l.tasks.map((t) => t.id)), ['t4'], '무시한 목표 선은 연결이 아니다, 리스트 없는 할 일은 기본함')
  assert.equal(g1.count, 4)
  // 줄 목록(타임라인): 키·깊이·목표 없음 처음 접힘
  const rows = mapRows({ by: 'goal', tree })
  assert.deepEqual(rows.slice(0, 4).map((r) => r.key), ['goal:g1', 'goal:g1/list:a', 'task:t1', 'task:sub'])
  const sub = rows.find((r) => r.key === 'task:sub')!
  assert.ok(sub.kind === 'task' && sub.sub === 1 && sub.depth === 2)
  assert.ok(rows.at(-1)!.kind === 'nogoal' && rows.at(-1)!.collapsed, '목표 없는 할 일은 처음 접힘')
  assert.ok(mapRows({ by: 'goal', tree }, { nogoal: false }).some((r) => r.key === 'task:t4'))
  assert.equal(mapRows({ by: 'goal', tree }, { 'goal:g1': true }).some((r) => r.key === 'task:t1'), false)
  // 리스트 묶기도 같은 함수: 폴더 › 리스트 › 할 일(+ 하위 들여쓰기)
  const byList = groupMap('list', { folders, lists, tasks, links, goals })
  const lr = mapRows(byList)
  assert.deepEqual(lr.filter((r) => r.kind !== 'task').map((r) => r.key), ['list:in', 'list:a', 'folder:f', 'list:b'])
  assert.deepEqual(lr.filter((r) => r.kind === 'task' && r.listId === 'a').map((r) => r.key), ['task:t1', 'task:sub', 'task:t3'])
  assert.deepEqual(nestTasks([T('c', { parent_id: 'p' }), T('p'), T('x', { parent_id: 'x' })]).tasks.map((t) => t.id), ['p', 'c', 'x'], '자기 자신을 가리키는 부모는 무시')
  // 배치: 뿌리 → 목표 노드(1층) → 리스트(2층) → 할 일, 목표 줄 없음, 같은 리스트가 두 목표 아래 있어도 노드 id가 겹치지 않는다
  const lay = layoutMap({ tree: { groups: [] }, links: [], goals, collapsed: {}, hasDate: () => false, goalTree: tree })
  const ids = lay.nodes.map((n) => n.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('goal:g1') && ids.includes('goal:g1/list:a') && ids.includes('goal:g2/list:a'))
  assert.equal(lay.nodes.find((n) => n.id === 'goal:g1')!.kind, 'goalgroup')
  assert.equal(lay.nodes.some((n) => n.kind === 'lane'), false)
  assert.equal(ids.includes('task:t4'), false, '목표 없는 할 일은 처음 접힘')
  const subNode = lay.nodes.find((n) => n.id === 'task:sub')!, parentNode = lay.nodes.find((n) => n.id === 'task:t1')!
  assert.equal(subNode.x - parentNode.x, 12, '하위 할 일은 부모 아래 들여쓰기 12')
  const t3 = lay.nodes.find((n) => n.id === 'task:t3')!
  assert.equal(lay.zones.filter((z) => z.kind === 'goal' && t3.x >= z.x && t3.x <= z.x + z.w && t3.y >= z.y && t3.y <= z.y + z.h).map((z) => z.id)[0], 'g2', '할 일을 놓으면 목표 자리')
}
// 목표 선 옮기기(끌어 다른 목표로) · 끊기
{
  const links = [{ id: 'l1', ...gl('g1', 't') }, { id: 'l2', ...gl('g2', 't', 'dismissed') }, { id: 'l3', ...gl('g1', 'u') }]
  let n = 0
  const r = moveGoalLinkStmts(links, 't', 'g2', () => `new${++n}`)
  assert.deepEqual(r.removed.map((l) => l.id), ['l1'])
  assert.equal(r.added, 'new1')
  assert.equal(r.stmts.length, 3, '원래 선 지우기 + 같은 쌍의 무시한 선 지우기 + 새 선')
  assert.equal(moveGoalLinkStmts(links, 't', 'g1').stmts.length, 0, '이미 그 목표면 그대로')
  assert.equal(moveGoalLinkStmts(links, 'zz', null).stmts.length, 0)
  assert.equal(moveGoalLinkStmts(links, 'u', null).stmts.length, 1)
  // DB: 옮기고 ⟲로 되돌린다
  await run(insert('map_links', { id: 'ml1', kind: 'goal', from_type: 'kpi', from_id: 'G1', to_id: 'T1', source: 'user', state: 'accepted' }))
  const undo = (await moveGoalLink('T1', 'G2'))!
  assert.deepEqual(all("SELECT from_id FROM map_links WHERE to_id = 'T1'").map((x) => x.from_id), ['G2'])
  await undo()
  assert.deepEqual(all("SELECT id, from_id FROM map_links WHERE to_id = 'T1'"), [{ id: 'ml1', from_id: 'G1' }])
  await run({ sql: 'DELETE FROM map_links', params: [] })
}
// D3: 횟수 목표는 연결 할 일 완료마다 +1(1회 목표는 제안 유지), 취소하면 −1 — XP는 setGoalProgress 그대로
{
  const goals = [{ id: 'c', target: 3, progress: 1, status: 'active' }, { id: 'one', target: 1, progress: 0, status: 'active' }, { id: 'full', target: 2, progress: 2, status: 'achieved' }, { id: 'old', target: 3, progress: 1, status: 'missed' }]
  const links = [gl('c', 't1'), gl('c', 't2'), gl('one', 't1'), gl('full', 't1'), gl('old', 't1'), gl('c', 't9', 'suggested')]
  assert.deepEqual([...linkedGoalDeltas(goals, links, ['t1', 't2', 't9'], 1)], [['c', 3]], '두 개 끝내면 +2, 제안 선은 세지 않음, 1회·달성·못 이룸은 그대로')
  assert.deepEqual([...linkedGoalDeltas(goals, links, ['t1'], -1)], [['c', 0], ['full', 1]], '취소는 달성 목표도 내린다(XP 되돌림은 setGoalProgress)')
  // DB 끝까지: 운동 3번 목표 + 연결 할 일 3개 완료 → 달성 + XP 30
  const week = thisWeek()
  await run(insert('characters', { id: 'ch', name: 'n', species: null, type_code: null, answers_json: null, assessed_at: null }))
  await run(insert('kpis', { id: 'K', week_start: week, title: '운동 3번', target: 3, progress: 0, link_kind: 'none', link_id: null, status: 'active', source: 'manual', achieved_at: null, sort_order: 1 }))
  for (const t of ['r1', 'r2', 'r3']) await run(insert('map_links', { id: `k-${t}`, kind: 'goal', from_type: 'kpi', from_id: 'K', to_id: t, source: 'user', state: 'accepted' }))
  await countLinkedGoals(['r1'], 1)
  assert.equal(all("SELECT progress FROM kpis WHERE id = 'K'")[0].progress, 1)
  await countLinkedGoals(['r2', 'r3'], 1)
  assert.deepEqual(all("SELECT progress, status FROM kpis WHERE id = 'K'")[0], { progress: 3, status: 'achieved' })
  assert.equal(all("SELECT sum(amount) n FROM xp_events WHERE ref_id = 'K'")[0].n, 30, '목표 달성 순간 +30(성장 규칙 그대로)')
  await countLinkedGoals(['r3'], -1)
  assert.deepEqual(all("SELECT progress, status FROM kpis WHERE id = 'K'")[0], { progress: 2, status: 'active' })
  assert.equal(all("SELECT sum(amount) n FROM xp_events WHERE ref_id = 'K'")[0].n, 0, '완료 취소로 목표가 내려가면 XP도 되돌린다')
  await run({ sql: 'DELETE FROM map_links', params: [] }, { sql: 'DELETE FROM kpis', params: [] }, { sql: 'DELETE FROM xp_events', params: [] })
}

// ── ④ AI로 쪼개기 ──
{
  // 검증: 2~8개, key 겹침·빈 제목·existing과 같은 제목 버림, after는 앞 key만, days 1~30, 60자 자름, note 120자, 설명 글 걷어 내기
  const raw = 'Here you go:\n```json\n' + JSON.stringify({
    steps: [
      { key: 's1', title: '목차 정하기', days: 1, after: [] },
      { key: 's2', title: '초안 쓰기', days: 3, after: ['s1', 's3'] },
      { key: 's2', title: '겹친 키', days: 1, after: [] },
      { key: 's3', title: '  자료  조사 ', days: 2, after: [] },
      { key: 's4', title: '', days: 1, after: [] },
      { key: 's5', title: '가'.repeat(80), days: 99, after: ['s2', 'nope'] },
      { key: 's6', title: '검토 받기', days: '2', after: ['s5'] },
      ...Array.from({ length: 6 }, (_, i) => ({ key: `x${i}`, title: `더 ${i}`, days: 1, after: [] }))
    ],
    note: '검'.repeat(200)
  }) + '\n```'
  const r = validateBreakdown(raw, ['자료 조사'])
  assert.deepEqual(r.steps.map((s) => s.title), ['목차 정하기', '초안 쓰기', '가'.repeat(60), '검토 받기', '더 0', '더 1', '더 2', '더 3'])
  assert.deepEqual(r.steps.map((s) => s.key), ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'], 'key는 다시 매긴다')
  assert.deepEqual(r.steps[1].after, ['s1'], '뒤를 가리키는 선·버린 단계를 가리키는 선은 버린다')
  assert.deepEqual(r.steps[2], { key: 's3', title: '가'.repeat(60), days: null, after: ['s2'], on: true })
  assert.equal(r.steps[3].days, 2)
  assert.equal(r.note.length, 120)
  assert.throws(() => validateBreakdown('그냥 문장'), /형식/)
  assert.deepEqual(validateBreakdown({ steps: [] }).steps, [])
  // 보내는 것: 제목 120자·existing 8개×60자·hint 200자, memo는 체크했을 때만
  const pay = breakdownPayload({ id: 'p', title: '큰'.repeat(200), list_id: 'a', due_at: '2026-10-17', start_at: null, content: '메모 내용' }, { list: '졸업', existing: Array.from({ length: 10 }, (_, i) => `${i}`.repeat(70)), hint: 'h'.repeat(300), memo: false, today })
  assert.equal(pay.task.title.length, 120)
  assert.equal(pay.task.existing.length, 8)
  assert.equal(pay.task.existing[0].length, 60)
  assert.equal(pay.hint.length, 200)
  assert.equal(pay.task.memo, null)
  assert.equal(pay.task.due, '2026-10-17')
  assert.equal(pay.max_steps, 8)
}
{
  // 끄기·지우기: A→B→C에서 B를 끄면 A→C, 군더더기 선은 빼고, 끌어 순서 뒤집기는 거부
  const S = (key: string, after: string[] = [], on = true): Step => ({ key, title: key, days: null, after, on })
  const steps = [S('a'), S('b', ['a']), S('c', ['b'])]
  assert.deepEqual([...bridgedAfter(steps)], [['a', []], ['b', ['a']], ['c', ['b']]])
  const off = [S('a'), S('b', ['a'], false), S('c', ['b'])]
  assert.deepEqual([...bridgedAfter(off)], [['a', []], ['c', ['a']]])
  assert.deepEqual(countNew(off), { tasks: 2, links: 1 })
  assert.deepEqual(removeStep(steps, 'b').map((s) => [s.key, s.after]), [['a', []], ['c', ['a']]])
  assert.deepEqual([...bridgedAfter([S('a'), S('b', ['a']), S('c', ['a', 'b'])])].at(-1), ['c', ['b']], 'A→C는 A→B→C로 이미 이어진다')
  assert.equal(reorderSteps(steps, 2, 0), null, 'C를 맨 앞으로 = 먼저가 뒤를 가리킴 → 거부')
  assert.deepEqual(reorderSteps([S('a'), S('b'), S('c', ['a'])], 2, 1)!.map((s) => s.key), ['a', 'c', 'b'])
  assert.equal(stepWouldCycle(steps, 'a', 'c'), true)
  assert.equal(stepWouldCycle(steps, 'c', 'a'), false)
  assert.equal(addStep(steps).at(-1)!.key, 's4')
  // 만들기 문장: 하위 할 일(같은 리스트, 기존 하위 뒤) + 순서 선(ai·accepted)
  let n = 0
  const { stmts, snapshot } = breakdownStmts({ id: 'P', title: '졸업 기획서', list_id: 'a' }, off, { sortBase: 10, at: '2026-10-07T00:00:00.000Z', newId: () => `id${++n}` })
  assert.equal(stmts.length, 3)
  assert.deepEqual(snapshot, { at: '2026-10-07T00:00:00.000Z', parentId: 'P', parentTitle: '졸업 기획서', tasks: ['id1', 'id2'], links: ['id3'] })
  assert.match(stmts[2].sql, /INSERT INTO map_links/)
  assert.ok((stmts[2].params as unknown[]).includes('ai') && (stmts[2].params as unknown[]).includes('accepted'))
  // 되돌리기 고르기: 손대지 않은 것만 지운다
  const plan = undoPlan(snapshot, [
    { id: 'id1', status: 0, modified_at: snapshot.at, deleted_at: null },
    { id: 'id2', status: 1, modified_at: '2026-10-08', deleted_at: null }
  ], new Set())
  assert.deepEqual(plan, { remove: ['id1'], kept: 1 })
  assert.deepEqual(undoPlan(snapshot, [{ id: 'id1', status: 0, modified_at: snapshot.at, deleted_at: null }], new Set(['id1'])), { remove: [], kept: 1 }, '자기 하위를 단 것은 손댄 것')
}
{
  // DB 끝까지: AI(가짜) → 미리 보기 → 만들기 한 트랜잭션 → 24시간 되돌리기(손댄 것 남김)
  await run(insert('tasks', { id: 'BIG', list_id: 'L', parent_id: null, title: '졸업 기획서 마무리', status: 0, priority: 0, due_at: '2026-10-17', is_all_day: 1, sort_order: 5, content: '' }))
  await run(insert('tasks', { id: 'OLD', list_id: 'L', parent_id: 'BIG', title: '자료 조사', status: 0, priority: 0, sort_order: 7 }))
  answers.push(JSON.stringify({ steps: [{ key: 's1', title: '목차 정하기', days: 1, after: [] }, { key: 's2', title: '자료 조사', days: 1, after: [] }, { key: 's3', title: '초안 쓰기', days: 3, after: ['s1'] }, { key: 's4', title: '검토 받기', days: 2, after: ['s3'] }], note: '' }))
  const r = await askBreakdown({ id: 'BIG', title: '졸업 기획서 마무리', list_id: 'L', due_at: '2026-10-17', start_at: null }, { list: '졸업', existing: ['자료 조사'], hint: '하루 2시간', memo: false, today }, { signal: new AbortController().signal })
  assert.equal(chats.at(-1)!.purpose, 'breakdown', '서버 용도 breakdown')
  assert.ok(chats.at(-1)!.format, '형식(JSON 스키마)을 함께 보낸다')
  assert.ok(chats.at(-1)!.messages[0].content.includes('untrusted'), '메모·제목 속 지시는 따르지 않게')
  assert.deepEqual(r.steps.map((s) => s.title), ['목차 정하기', '초안 쓰기', '검토 받기'], '이미 있는 하위 할 일은 다시 만들지 않는다')
  const snap = await applyBreakdown({ id: 'BIG', title: '졸업 기획서 마무리', list_id: 'L', due_at: null, start_at: null }, r.steps)
  const kids = all("SELECT id, title, list_id, sort_order FROM tasks WHERE parent_id = 'BIG' ORDER BY sort_order")
  assert.deepEqual(kids.map((k) => k.title), ['자료 조사', '목차 정하기', '초안 쓰기', '검토 받기'], '기존 하위 할 일 뒤에')
  assert.ok(kids.every((k) => k.list_id === 'L'))
  assert.deepEqual(all("SELECT source, state FROM map_links WHERE kind = 'sequence'"), [{ source: 'ai', state: 'accepted' }, { source: 'ai', state: 'accepted' }])
  assert.ok(loadBreakdownUndo(), '되돌리기는 24시간')
  assert.equal(loadBreakdownUndo(Date.parse(snap.at) + 25 * 3600_000), null)
  // 하나는 손댄다(제목 고침) → 되돌려도 남는다
  // modified_at을 만든 때와 확실히 다르게(같은 밀리초에 고치면 손대지 않은 것으로 보인다 — 시험이 들쭉날쭉하지 않게)
  await run({ sql: 'UPDATE tasks SET title = ?, modified_at = ? WHERE id = ?', params: ['검토 받기(교수님)', new Date(Date.parse(snap.at) + 1000).toISOString(), snap.tasks[2]] })
  const u = await undoBreakdown()
  assert.deepEqual(u, { removed: 2, kept: 1 })
  assert.deepEqual(all("SELECT title FROM tasks WHERE parent_id = 'BIG' ORDER BY sort_order").map((x) => x.title), ['자료 조사', '검토 받기(교수님)'])
  assert.equal(all("SELECT count(*) n FROM map_links WHERE kind = 'sequence'")[0].n, 0, '만든 순서 선은 모두 지운다')
  assert.equal(loadBreakdownUndo(), null, '마지막 1회만')
}

console.log('map-v3: ok')
