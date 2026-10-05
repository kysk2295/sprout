// 31 §11 같이 계획 짜기 — 대화 효과를 DB에(보통 편집) · 대화 하나 한 번에 되돌리기(손댄 것 남김·이전 마감·다시 열기) · 다시 나눠 줘 · AI 요청 모양
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { insert, run } from '../src/renderer/src/data/mutations'
import {
  applyManualSteps, createGoalTask, journalChanged, loadPlanTask, loadPlanUndo, manualSteps, newJournal, planCandidates, planUndoPick, recordComplete, savePlanUndo, setPlanDue, splitWithAi, undoLastSplit, undoPlanSession
} from '../src/renderer/src/data/planActions'
import { planReduce, initPlan } from '../src/renderer/src/data/planChat'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const store = new Map<string, string>([['sprout.assistant.model', 'test-model']])
const chats: { purpose?: string; messages: { role: string; content: string }[] }[] = []
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
const today = '2026-10-05'
const tick = () => new Promise((r) => setTimeout(r, 3)) // modified_at이 확실히 달라지게
await run(insert('lists', { id: 'IN', name: 'Inbox', kind: 'inbox', sort_order: 0 }), insert('lists', { id: 'L', name: '졸업', kind: 'list', sort_order: 1 }))
await run(insert('tasks', { id: 'OLD', list_id: 'L', parent_id: null, title: '졸업 기획서 작성', status: 0, priority: 0, due_at: '2026-10-07T09:00', start_at: null, is_all_day: 0, sort_order: 1, content: '비밀 메모' }))
await run(insert('tasks', { id: 'SMALL', list_id: 'L', parent_id: null, title: '우유 사기', status: 0, priority: 0, sort_order: 2 }))

// ① 답 칩 후보 = 큰 일만
assert.deepEqual((await planCandidates(today)).map((c) => c.title), ['졸업 기획서 작성'])

// ── 새 큰 할 일 → 마감 → AI 단계 → 이미 한 것 → 첫 걸음 마감 → 한 번에 되돌리기 ──
const j = newJournal()
assert.ok(!journalChanged(j))
const goal = await createGoalTask(j, '사업계획서 작성', null)
assert.deepEqual(all('SELECT list_id, parent_id, title, status FROM tasks WHERE id = ?', [goal.id]), [{ list_id: 'IN', parent_id: null, title: '사업계획서 작성', status: 0 }], '기본함에')
await tick()
await setPlanDue(j, goal.id, '2026-10-16')
assert.equal(all('SELECT due_at FROM tasks WHERE id = ?', [goal.id])[0].due_at, '2026-10-16')
assert.equal(j.dues.length, 0, '대화가 만든 할 일은 이전 값 기록 없음')
answers.push(JSON.stringify({ steps: [{ key: 's1', title: '자료 조사', days: 1, after: [] }, { key: 's2', title: '경쟁사 3곳 정리', days: 1, after: ['s1'] }, { key: 's3', title: '목차 잡기', days: 1, after: ['s2'] }, { key: 's4', title: '초안 쓰기', days: 3, after: ['s3'] }], note: '' }))
const steps = await splitWithAi(j, goal.id, [{ id: 'IN', name: 'Inbox', emoji: null, color: null, folder_id: null, kind: 'inbox', sort_order: 0 }], today, { signal: new AbortController().signal })
assert.deepEqual(steps.map((s) => s.title), ['자료 조사', '경쟁사 3곳 정리', '목차 잡기', '초안 쓰기'])
assert.equal(chats.at(-1)!.purpose, 'breakdown', '기존 용도 하나만(새 서버 용도 없음)')
const sent = JSON.parse(chats.at(-1)!.messages[1].content)
assert.deepEqual([sent.task.title, sent.task.list, sent.task.due, sent.task.memo, sent.hint], ['사업계획서 작성', '기본함', '2026-10-16', null, ''], '제목·리스트 이름·마감만')
assert.deepEqual(all("SELECT source, state FROM map_links WHERE kind = 'sequence'").length, 3)
assert.ok(all("SELECT source FROM map_links").every((l) => l.source === 'ai'))
assert.deepEqual((await loadPlanTask(goal.id))!.steps.map((s) => s.title), ['자료 조사', '경쟁사 3곳 정리', '목차 잡기', '초안 쓰기'], '하위 할 일, 만든 순서')
// 이미 한 것(완료는 화면이 taskActions.complete로 — 여기선 상태만 바꾼다)
await tick()
await run({ sql: "UPDATE tasks SET status = 1, completed_at = ?, modified_at = ? WHERE id = ?", params: [new Date().toISOString(), new Date().toISOString(), steps[0].id] })
await recordComplete(j, [steps[0].id])
await tick()
await setPlanDue(j, steps[1].id, '2026-10-06')
// 기존 할 일 마감도 바꿔 본다(이전 값 기록)
await setPlanDue(j, 'OLD', '2026-10-20')
assert.equal(all("SELECT due_at FROM tasks WHERE id = 'OLD'")[0].due_at, '2026-10-20T09:00', '시각은 유지')
assert.deepEqual(j.dues, [{ id: 'OLD', start_at: null, due_at: '2026-10-07T09:00', is_all_day: 0 }])
savePlanUndo(j)
assert.ok(loadPlanUndo(), '24시간 기록')
assert.equal(loadPlanUndo(Date.parse(j.at) + 25 * 3600_000), null)
// 사용자가 지도에서 하나를 고친다 → 남는다
await tick()
await run({ sql: 'UPDATE tasks SET title = ?, modified_at = ? WHERE id = ?', params: ['목차 정하기', new Date().toISOString(), steps[2].id] })
const reopened: string[] = []
const u = await undoPlanSession(j, async (ids) => { reopened.push(...ids); await run(...ids.map((id) => ({ sql: 'UPDATE tasks SET status = 0, completed_at = NULL WHERE id = ?', params: [id] }))) })
assert.deepEqual(reopened, [steps[0].id], '대화가 끝낸 것은 다시 연다(XP·목표 되돌림)')
assert.deepEqual(u, { removed: 3, kept: 2 }, '손대지 않은 것만 지움(대화가 바꾼 완료·마감은 손댄 것으로 치지 않음) · 고친 하위가 있는 큰 할 일은 남김')
assert.deepEqual(all("SELECT title FROM tasks WHERE id IN (?, ?)", [goal.id, steps[2].id]).map((r) => r.title).sort(), ['목차 정하기', '사업계획서 작성'])
assert.equal(all("SELECT count(*) n FROM map_links")[0].n, 0, '만든 선은 모두 지움')
assert.equal(all("SELECT due_at FROM tasks WHERE id = 'OLD'")[0].due_at, '2026-10-07T09:00', '기존 할 일 마감은 이전 값으로')
assert.equal(loadPlanUndo(), null)

// ── 직접 적은 단계(AI 없음) = 적은 순서 사슬, source user · 다시 나눠 줘는 마지막 단계만 지운다 ──
{
  const j2 = newJournal()
  assert.deepEqual(manualSteps(['a', 'b', 'c']).map((s) => s.after), [[], ['s1'], ['s2']])
  const st = await applyManualSteps(j2, 'OLD', ['자료 조사', '초안 쓰기'])
  assert.deepEqual(st.map((s) => s.title), ['자료 조사', '초안 쓰기'])
  assert.deepEqual(all("SELECT source FROM map_links"), [{ source: 'user' }])
  assert.equal(all("SELECT parent_id FROM tasks WHERE id = ?", [st[0].id])[0].parent_id, 'OLD')
  await undoLastSplit(j2)
  assert.equal(all("SELECT count(*) n FROM tasks WHERE parent_id = 'OLD'")[0].n, 0)
  assert.equal(all("SELECT count(*) n FROM map_links")[0].n, 0)
  assert.ok(!journalChanged(j2))
  assert.equal(all("SELECT count(*) n FROM tasks WHERE id = 'OLD'")[0].n, 1, '기존 큰 할 일은 그대로')
}
// 고르기(순수): 지운 것·고친 것·대화 밖 하위가 생긴 것은 남김
assert.deepEqual(planUndoPick({ tasks: ['a', 'b', 'c', 'd'], stamps: { a: 't1', b: 't1', c: 't1', d: 't1' } },
  [{ id: 'a', modified_at: 't1', deleted_at: null }, { id: 'b', modified_at: 't2', deleted_at: null }, { id: 'c', modified_at: 't1', deleted_at: 'x' }, { id: 'd', modified_at: 't1', deleted_at: null }], [{ id: 'z', parent_id: 'd' }]), { remove: ['a'], kept: 3 })
assert.deepEqual(planUndoPick({ tasks: ['p', 'k1', 'k2'], stamps: { p: 't', k1: 't', k2: 't' } }, [{ id: 'p', modified_at: 't', deleted_at: null }, { id: 'k1', modified_at: 't', deleted_at: null }, { id: 'k2', modified_at: 't9', deleted_at: null }],
  [{ id: 'k1', parent_id: 'p' }, { id: 'k2', parent_id: 'p' }]), { remove: ['k1'], kept: 2 }, '고친 하위가 있으면 부모도 남김')

// ── 지도에서 읽은 값이 늦게 와도(막 만든 단계가 아직 없음) 단계를 잃지 않는다 · 휴지통으로 간 단계는 뺀다 ──
{
  let s = { ...initPlan('a', today), goal: { id: 'G', title: 'g', due: null }, phase: 'end' as const, first: 's1', steps: [{ id: 's1', title: '하나', done: false }, { id: 's2', title: '둘', done: false }] }
  s = planReduce(s, { type: 'observed', goal: { id: 'G', title: 'g', due: null }, steps: [] }).state as typeof s
  assert.equal(s.steps.length, 2)
  s = planReduce(s, { type: 'observed', goal: { id: 'G', title: 'g', due: null }, steps: [{ id: 's1', title: '하나', done: false }], removed: ['s2'] }).state as typeof s
  assert.deepEqual(s.steps.map((x) => x.id), ['s1'])
}
console.log('plan-actions ok')
