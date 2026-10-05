// 31 §12 정리 = 분류 책상 — 상자(폴더 › 리스트) · 더미 탭 · 프로젝트 제안 · 제안 고르기 · 다중 선택 · 말풍선 · DB 동작과 되돌리기
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { insert, run } from '../src/renderer/src/data/mutations'
import {
  addProjectTag, applyProposals, bubbleFor, buildBuckets, buildPiles, dragSet, lateGroups, membersOf, moveToList, nextSelection, projectTargets, proposalsFor,
  rowMeta, snapshotLate, suggestProjects, type TidyFolder, type TidyLink, type TidyList, type TidyTag, type TidyTask
} from '../src/renderer/src/data/tidy'
import { applyCleanup } from '../src/renderer/src/data/overdue'

const today = '2026-10-05'

// ── 상자: 사용자의 실제 구조(폴더 순서 › 리스트 순서), 기본함·보관·빈 폴더 빼고, 폴더 밖 리스트는 각자 ──
const folders: TidyFolder[] = [{ id: 'F2', name: '🎓 학교', sort_order: 2 }, { id: 'F1', name: '🏠 생활', sort_order: 1 }, { id: 'F3', name: '빈 폴더', sort_order: 3 }]
const lists: TidyList[] = [
  { id: 'IN', name: 'Inbox', emoji: null, folder_id: null, kind: 'inbox', sort_order: 0 },
  { id: 'L1', name: '병원·건강', emoji: null, folder_id: 'F1', kind: 'normal', sort_order: 3 },
  { id: 'L2', name: '돈·구독', emoji: null, folder_id: 'F1', kind: 'normal', sort_order: 1 },
  { id: 'L3', name: '수업·과제', emoji: null, folder_id: 'F2', kind: 'normal', sort_order: 2 },
  { id: 'L4', name: '🛠 사이드', emoji: null, folder_id: null, kind: 'normal', sort_order: 4 },
  { id: 'L5', name: '옛 리스트', emoji: null, folder_id: 'F1', kind: 'normal', sort_order: 5, archived_at: '2026-01-01' }
]
const buckets = buildBuckets(folders, lists, new Map([['L1', 2], ['L3', 5], ['IN', 9]]))
assert.deepEqual(buckets.map((b) => (b.kind === 'folder' ? `${b.name}:${b.lists.map((l) => `${l.list.id}=${l.count}`).join(',')}:${b.count}` : `list:${b.box.list.id}`)),
  ['🏠 생활:L2=0,L1=2:2', '🎓 학교:L3=5:5', 'list:L4'])

// ── 프로젝트 제안 ──
const tags: TidyTag[] = [
  { id: 'P1', name: '공모전', kind: 'project', aliases: '["데이터 공모전"]', home_type: null, home_id: null },
  { id: 'P2', name: 'UniPort', kind: 'project', aliases: null, home_type: 'list', home_id: 'L4' },
  { id: 'P3', name: 'SQLD', kind: 'project', aliases: null, home_type: null, home_id: null },
  { id: 'G1', name: '병원', kind: 'place', aliases: null, home_type: null, home_id: null }
]
const examples = { P1: ['공모전 EDA 결과 정리', '데이터 전처리 코드', '모델 성능 비교 리포트', '발표 자료 만들기'], P2: ['투자 대시보드 기획', '마케팅 카드뉴스'], P3: ['SQLD 기출 1회'] }
const T = (id: string, title: string, extra: Partial<TidyTask> = {}): TidyTask => ({ id, title, list_id: 'L3', parent_id: null, due_at: null, start_at: null, is_all_day: 1, created_at: '2026-10-01T00:00:00Z', ...extra })
const tasks: TidyTask[] = [
  T('a', '공모전 제출 서류'), // 이름이 제목에 → P1
  T('b', 'EDA 결과 다시 보기'), // 낱말 1개만 겹침(EDA) → 없음? (결과는 공용) — 아래 확인
  T('c', '데이터 전처리 마무리 · 모델 성능 튜닝'), // 데이터·전처리·모델·성능 → P1 할 일 2개와 겹침
  T('d', 'UniPort 회의록', { list_id: 'L4' }), // 프로젝트 집 안 → 없음
  T('e', 'UniPort 회의록 공유', { list_id: 'L3' }), // 집 밖 → P2
  T('f', 'SQLD 기출 2회'), // 이미 P3 → 없음
  T('g', '공모전·SQLD 둘 다'), // 두 프로젝트 이름 → 애매 → 없음
  T('h', '공모전 회고'), // 공모전 태그를 뗀 적 있음(dismissed) → 없음
  T('i', '공모전 포스터'), // 정리에서 "아니" → 없음
  T('j', '우유 사기')
]
const links: TidyLink[] = [{ task_id: 'f', tag_id: 'P3', state: null }, { task_id: 'h', tag_id: 'P1', state: 'dismissed' }, { task_id: 'j', tag_id: 'G1', state: 'accepted' }]
const projects = suggestProjects(tasks, tags, links, lists, examples, { i: 'P1' })
assert.deepEqual(Object.fromEntries(projects), { a: 'P1', c: 'P1', e: 'P2' })
assert.equal(suggestProjects(tasks, tags.filter((t) => t.kind !== 'project'), links, lists, examples).size, 0, '프로젝트 태그가 없으면 제안 없음')
// 별칭도 이름처럼
assert.equal(suggestProjects([T('k', '데이터 공모전 접수')], tags, [], lists, {}).get('k'), 'P1')
// 폴더 집
assert.equal(suggestProjects([T('m', '공모전 서류', { list_id: 'L2' })], [{ ...tags[0], home_type: 'folder', home_id: 'F1' }], [], lists, {}).size, 0)

// ── 프로젝트 상자: 구성원(31 §12.1 — 태그 ∪ 집 ∪ 하위 − ✕) 많은 순, 프로젝트 종류만 ──
const memLinks: TidyLink[] = [...links, { task_id: 'a', tag_id: 'P1', state: 'accepted' }, { task_id: 'c', tag_id: 'P1', state: null }, { task_id: 'zz', tag_id: 'P2', state: null }]
const members = membersOf(tags, [...tasks, T('a1', '하위', { parent_id: 'a' })], memLinks, lists)
assert.deepEqual([...members.get('P1')!].sort(), ['a', 'a1', 'c'], '하위 할 일도 구성원')
assert.deepEqual([...members.get('P2')!], ['d'], '집(리스트 L4) 안 할 일, 닫힌 할 일(zz)은 빠짐')
assert.deepEqual(projectTargets(tags, members).map((x) => `${x.tag.id}=${x.count}`), ['P1=3', 'P3=1', 'P2=1'], '같으면 이름순')
// 넓히기(expandProject): 같은 리스트에 구성원 2개 이상 + 기간 안 + 일의 종류가 있음 → 그 프로젝트
const ex = suggestProjects([
  T('m1', '공모전 데이터 수집', { list_id: 'L2', due_at: '2026-10-01' }), T('m2', '공모전 EDA', { list_id: 'L2', due_at: '2026-10-03' }),
  T('n1', '교수님 미팅', { list_id: 'L2', due_at: '2026-10-04' })
], tags, [{ task_id: 'm1', tag_id: 'P1', state: null }, { task_id: 'm2', tag_id: 'P1', state: null }], lists, {}, {}, folders)
assert.deepEqual(Object.fromEntries(ex), { n1: 'P1' })

// ── 더미 탭 ──
const pileTasks: TidyTask[] = [
  T('i1', '발표 리허설 잡기', { list_id: 'IN', created_at: '2026-10-04T01:00:00Z' }),
  T('i2', '패캠 강의 돌려놓기', { list_id: 'IN', created_at: '2026-10-02T01:00:00Z' }),
  T('i2k', '하위', { list_id: 'IN', parent_id: 'i2' }),
  T('o1', '교정치과 상담', { due_at: '2026-08-12', list_id: 'L1' }),
  T('o2', '퀀트 연락', { due_at: '2026-10-03T15:00', is_all_day: 0 }),
  T('o2k', '하위도 밀림', { due_at: '2026-10-01', parent_id: 'o2' }),
  T('o3k', '부모는 안 밀림', { due_at: '2026-09-20', parent_id: 'x' }),
  T('x', '부모', { due_at: '2026-11-01' }),
  T('p1', '공모전 제출 서류'),
  T('t1', '태그 있음'),
  T('blank', '   ')
]
const piles = buildPiles({ tasks: pileTasks, links: [{ task_id: 't1', tag_id: 'G1', state: null }], inboxId: 'IN', today, projects: new Map([['p1', 'P1'], ['i1', 'P1']]) })
assert.deepEqual(piles.inbox.map((t) => t.id), ['i1', 'i2'], '기본함 = 열린 최상위, 새것 먼저')
assert.deepEqual(piles.overdue.map((t) => t.id), ['o1', 'o3k', 'o2'], '기한 지난 일 = 오래된 것 먼저, 밀린 부모 밑 하위는 부모와 함께')
assert.deepEqual(piles.outside.map((t) => t.id), ['p1'], '프로젝트 밖 = 기본함 밖 + 프로젝트 제안 있음')
assert.deepEqual(piles.untagged.map((t) => t.id).sort(), ['o1', 'o2', 'p1', 'x'].sort(), '태그 없음 = 기본함 밖 최상위, 태그 연결 없음')
assert.deepEqual(lateGroups(piles.overdue, today).map((g) => `${g.key}:${g.tasks.map((t) => t.id).join(',')}`), ['old:o1', 'month:o3k', 'week:o2'])

// ── 제안: 기본함은 리스트 먼저, 없으면 프로젝트. 기한 지난 일엔 없음. 보관 리스트로는 안 감 ──
const live = new Set(['L1', 'L2', 'L3', 'L4'])
const listOf = (id: string) => ({ i2: 'L2', i1: 'L5' } as Record<string, string>)[id] ?? null
assert.deepEqual(proposalsFor('inbox', piles.inbox, listOf, new Map([['i1', 'P1']]), live).map((p) => `${p.taskId}>${p.to.kind}:${p.to.id}`), ['i1>project:P1', 'i2>list:L2'])
assert.deepEqual(proposalsFor('overdue', piles.overdue, listOf, projects, live), [])
assert.deepEqual(proposalsFor('outside', piles.outside, listOf, new Map([['p1', 'P1']]), live).map((p) => p.to.id), ['P1'])

// ── 여러 개 고르기(틱틱 목록과 같음) ──
const order = ['a', 'b', 'c', 'd', 'e']
let s = nextSelection(order, [], null, 'b', {})
assert.deepEqual(s, { sel: ['b'], anchor: 'b' })
assert.deepEqual(nextSelection(order, ['b'], 'b', 'b', {}).sel, [], '같은 것만 다시 누르면 해제')
s = nextSelection(order, s.sel, s.anchor, 'd', { shift: true })
assert.deepEqual(s.sel, ['b', 'c', 'd'])
s = nextSelection(order, s.sel, s.anchor, 'c', { meta: true })
assert.deepEqual(s.sel, ['b', 'd'])
assert.deepEqual(nextSelection(order, ['b', 'd'], 'b', 'a', { toggle: true }).sel, ['b', 'd', 'a'], '체크 칸 = 더하기')
assert.deepEqual(dragSet(order, ['d', 'b'], 'd'), ['b', 'd'], '고른 것 안에서 끌면 고른 것 전부(목록 순서)')
assert.deepEqual(dragSet(order, ['d', 'b'], 'a'), ['a'])

// ── 말풍선(31 §11.9 같은 목소리) ──
assert.deepEqual(bubbleFor('inbox', 3, 2), { text: '기본함 3개, 이렇게 나눠 볼게. 괜찮아?', chips: ['apply', 'one'] })
assert.deepEqual(bubbleFor('inbox', 3, 0, { aiOk: false }).chips, [])
assert.equal(bubbleFor('inbox', 0, 0).text, '기본함이 깨끗해! ✓')
assert.equal(bubbleFor('overdue', 111, 0, { old: 64 }).text, '밀린 게 111개야. 한 달 넘은 건 정리해도 괜찮아.')
assert.equal(bubbleFor('overdue', 0, 0).text, '밀린 일이 없어 ✓')
assert.equal(bubbleFor('untagged', 0, 0).text, '태그 없는 일이 없어 ✓')
assert.equal(rowMeta('overdue', T('z', 'x', { due_at: '2026-08-12' }), '🏠 생활 › 병원·건강', today), '🏠 생활 › 병원·건강 · 8/12 (54일 지남)')
assert.equal(rowMeta('inbox', T('z', 'x', { created_at: '2026-10-04' }), '기본함', today), '기본함 · 어제 추가')

// ── DB 동작 ──
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const st = db.prepare(sql); st.bind(params as never); const r: Record<string, unknown>[] = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r }
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  window: {
    dispatchEvent: () => true,
    sprout: { db: { getAll: async (sql: string, p?: unknown[]) => all(sql, p), get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null, transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const x of stmts) db.run(x.sql, x.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } } } }
  }
})
await run(insert('lists', { id: 'IN', name: 'Inbox', kind: 'inbox', sort_order: 0 }), insert('lists', { id: 'L', name: '돈·구독', kind: 'normal', sort_order: 1 }), insert('lists', { id: 'M', name: '수업', kind: 'normal', sort_order: 2 }))
await run(insert('tags', { id: 'P', name: '공모전', kind: 'project', sort_order: 1 }))
const task = (id: string, extra: Record<string, unknown> = {}) => insert('tasks', { id, list_id: 'IN', parent_id: null, title: id, status: 0, priority: 0, sort_order: 0, due_at: null, start_at: null, is_all_day: 1, deleted_at: null, completed_at: null, repeat_rule: null, ...extra })
await run(task('A'), task('A1', { parent_id: 'A' }), task('B'), task('C', { list_id: 'M', due_at: '2026-08-12' }), task('D', { list_id: 'M', due_at: '2026-09-30T10:00', is_all_day: 0 }), task('E', { list_id: 'M', due_at: '2026-09-01', repeat_rule: 'FREQ=WEEKLY', repeat_from: 'due' }))
const listOfTask = (id: string) => all('SELECT list_id FROM tasks WHERE id = ?', [id])[0].list_id

// 리스트로 옮기기: 하위 함께, 되돌리면 그대로
const mv = await moveToList(['A'], 'L')
assert.equal(mv.moved, 1)
assert.deepEqual([listOfTask('A'), listOfTask('A1')], ['L', 'L'])
await mv.undo()
assert.deepEqual([listOfTask('A'), listOfTask('A1')], ['IN', 'IN'])
// 하위만 옮기면 부모와의 연결이 풀린다(taskActions.move와 같음)
const mk = await moveToList(['A1'], 'M')
assert.deepEqual(all('SELECT list_id, parent_id FROM tasks WHERE id = ?', ['A1']), [{ list_id: 'M', parent_id: null }])
await mk.undo()
assert.deepEqual(all('SELECT list_id, parent_id FROM tasks WHERE id = ?', ['A1']), [{ list_id: 'IN', parent_id: 'A' }])

// 프로젝트에 묶기 = 태그만(리스트 그대로). 뗀 적 있는(dismissed) 자동 태그는 user·accepted로 되살리고, 되돌리면 이전 값
await run(insert('task_tags', { id: 'old', task_id: 'B', tag_id: 'P', source: 'ai', state: 'dismissed', confidence: 90 }))
const tagged = await addProjectTag(['A', 'B'], 'P')
assert.equal(tagged.added, 2)
assert.equal(listOfTask('A'), 'IN', '리스트는 그대로')
assert.deepEqual(all("SELECT task_id, source, state FROM task_tags WHERE tag_id = 'P' ORDER BY task_id"), [{ task_id: 'A', source: 'user', state: 'accepted' }, { task_id: 'B', source: 'user', state: 'accepted' }])
await tagged.undo()
assert.deepEqual(all("SELECT task_id, source, state, confidence FROM task_tags WHERE tag_id = 'P'"), [{ task_id: 'B', source: 'ai', state: 'dismissed', confidence: 90 }])
assert.equal((await addProjectTag([], 'P')).added, 0)

// 제안 모두 옮기기: 리스트·프로젝트 섞여도 한 번에 되돌림
const ap = await applyProposals([{ taskId: 'A', to: { kind: 'list', id: 'L' } }, { taskId: 'B', to: { kind: 'project', id: 'P' } }, { taskId: 'C', to: { kind: 'project', id: 'P' } }])
assert.deepEqual([ap.lists, ap.projects], [1, 2])
assert.equal(all("SELECT count(*) AS n FROM task_tags WHERE tag_id = 'P' AND state = 'accepted'")[0].n, 2)
await ap.undo()
assert.equal(listOfTask('A'), 'IN')
assert.equal(all("SELECT count(*) AS n FROM task_tags WHERE tag_id = 'P' AND state = 'accepted'")[0].n, 0)

// 기한 지난 일 한꺼번에(19 applyCleanup) + 이 동작만 되돌리기
const snap = await snapshotLate(['C', 'D'], false)
await applyCleanup(['C', 'D'], { kind: 'date', date: today }, today)
assert.deepEqual(all("SELECT id, due_at FROM tasks WHERE id IN ('C','D') ORDER BY id"), [{ id: 'C', due_at: today }, { id: 'D', due_at: `${today}T10:00` }], '오늘로(시각 유지)')
await snap()
assert.deepEqual(all("SELECT id, due_at FROM tasks WHERE id IN ('C','D') ORDER BY id"), [{ id: 'C', due_at: '2026-08-12' }, { id: 'D', due_at: '2026-09-30T10:00' }])
// 완료 처리 = XP 없음(xp_events 안 생김), 반복은 다음 회차로
const snap2 = await snapshotLate(['C', 'E'], true)
await applyCleanup(['C', 'E'], { kind: 'done' }, today)
assert.equal(all("SELECT status FROM tasks WHERE id = 'C'")[0].status, 1)
assert.equal(all("SELECT status FROM tasks WHERE id = 'E'")[0].status, 0, '반복은 다음 회차')
assert.ok((all("SELECT due_at FROM tasks WHERE id = 'E'")[0].due_at as string) >= today)
assert.equal(all('SELECT count(*) AS n FROM xp_events')[0].n, 0, 'XP 없음')
await snap2()
assert.deepEqual(all("SELECT id, status, due_at FROM tasks WHERE id IN ('C','E') ORDER BY id"), [{ id: 'C', status: 0, due_at: '2026-08-12' }, { id: 'E', status: 0, due_at: '2026-09-01' }])
// 지우기 = 휴지통(하위 함께), 되돌리기
await run(task('C1', { parent_id: 'C', list_id: 'M' }))
const snap3 = await snapshotLate(['C'], true)
await applyCleanup(['C'], { kind: 'trash' }, today)
assert.equal(all("SELECT count(*) AS n FROM tasks WHERE deleted_at IS NOT NULL AND id IN ('C','C1')")[0].n, 2)
await snap3()
assert.equal(all("SELECT count(*) AS n FROM tasks WHERE deleted_at IS NOT NULL")[0].n, 0)

console.log('tidy: ok')
