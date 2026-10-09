// 47 AI 비서 B안(데스크톱): NDJSON 도구 호출 줄 읽기 · askAgent(공용 runTurn + 메인 IPC 흉내) · 확인 카드 넣기/되돌리기(agentWrites) ·
// 서버가 agent를 모를 때(400) 13 의도 경로로 돌아가는 신호 · 일기 보기 설정(동의 없으면 꺼짐).
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { createTables, seedFixture } from '../../../packages/schema/src/assistantFixture'
import { AgentUnsupportedError, saveCard, undoCard } from '@sprout/schema/assistantAgent'
import { emptyMemory } from '@sprout/schema/assistantRouter'
import { readAgentStream, parseToolCalls, AGENT_UNSUPPORTED } from '../src/shared/assistant'

const SQL = await initSqlJs()
const db = new SQL.Database()
createTables((sql, p) => db.run(sql, p as never))
seedFixture((sql, p) => db.run(sql, p as never))
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, any>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const store = new Map<string, string>()
type Delta = { id: string; text: string; queue?: number }
let deltaCb: ((d: Delta) => void) | null = null
let agentImpl: (id: string, input: any) => Promise<any> = async () => ({ content: '', tool_calls: [] })
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  window: { sprout: {
    db: {
      getAll: async (sql: string, p?: unknown[]) => all(sql, p),
      get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
      transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
    },
    assistant: {
      onDelta: (cb: (d: Delta) => void) => { deltaCb = cb; return () => { deltaCb = null } },
      cancel: () => {},
      features: async () => ({ agent: true, daily: { used: 3, limit: 40 } }),
      agent: (id: string, input: any) => agentImpl(id, input)
    }
  } }
})
const A = await import('../src/renderer/src/data/assistant')

// ── NDJSON: 글 조각 · 대기열 · 도구 호출(arguments 글/객체) · 끝 ──
const lines = [
  { queue: { position: 2, waiting: 3 } },
  { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'find_tasks', arguments: '{"status":"open"}' } }, { function: { name: 'growth_stats', arguments: {} } }] } },
  { message: { role: 'assistant', content: '좋아' } },
  { message: { role: 'assistant', content: '!' }, done: true, prompt_eval_count: 812 }
].map((l) => JSON.stringify(l)).join('\n')
const body = new ReadableStream({ start(c) { const b = new TextEncoder().encode(lines); c.enqueue(b.slice(0, 37)); c.enqueue(b.slice(37)); c.close() } })
const deltas: string[] = [], queues: number[] = []
const got = await readAgentStream(new Response(body), (d) => deltas.push(d), undefined, (q) => queues.push(q.position))
assert.deepEqual(got, { content: '좋아!', tool_calls: [{ name: 'find_tasks', args: { status: 'open' } }, { name: 'growth_stats', args: {} }], prompt_tokens: 812 })
assert.deepEqual([deltas, queues], [['좋아', '!'], [2]])
assert.deepEqual(parseToolCalls([{ function: { name: 'x', arguments: 'not json' } }, { nope: 1 }]), [{ name: 'x', args: {} }])
await assert.rejects(readAgentStream(new Response(JSON.stringify({ error: '오늘 AI 사용 한도를 다 썼어요.', code: 'rate_day' })), () => {}), /한도/)

// ── features ──
assert.deepEqual(await A.agentFeatures(), { agent: true, daily: { used: 3, limit: 40 } })

// ── askAgent: 길잡이 when_last → 모델 한 번(도구 없이), 같은 턴 id, 글 조각은 IPC 통로로 ──
const calls: any[] = []
agentImpl = async (id, input) => { calls.push(input); deltaCb?.({ id, text: '마지막으로 미용실 간 건 8월 31일이야.' }); return { content: '마지막으로 미용실 간 건 8월 31일이야.', tool_calls: [] } }
const events: string[] = []
const r1 = await A.askAgent({ text: '미용실 간 지 얼마나 지났지', model: 'qwen3.5:9b', history: [], memory: emptyMemory(), pending: null, diary: false, name: '도토리', signal: new AbortController().signal, onEvent: (e) => events.push(e.type) })
assert.equal(calls.length, 1)
assert.deepEqual([calls[0].tools, calls[0].call, /^[A-Za-z0-9_-]{8,64}$/.test(calls[0].turn), calls[0].model], [[], 1, true, 'qwen3.5:9b'])
assert.ok(events.includes('delta') && events.includes('chip'))
assert.equal(r1.cards[0].type, 'since')
assert.match(r1.text, /8월 31일/)

// ── 확인 카드: 길잡이 만들기(모델 0번) → 넣기 → 되돌리기 ──
// 47 §19.3 약속 낱말 + 시각 = 꿈틀 일정(events)
calls.length = 0
const r2 = await A.askAgent({ text: '내일 3시에 교수님 면담 잡아줘', model: '', history: [], memory: r1.memory, pending: null, diary: false, name: '도토리', signal: new AbortController().signal })
assert.equal(calls.length, 0, '쓰기 길잡이는 모델을 부르지 않는다')
const card = r2.cards[0]
assert.ok(card.type === 'confirm' && card.kind === 'event')
assert.equal(all("SELECT count(*) AS n FROM events WHERE title = '교수님 면담'")[0].n, 0, '넣기 전엔 저장 없음')
const completed: string[] = []
const writes = A.agentWrites({ complete: async (ids) => { completed.push(...ids); for (const id of ids) db.run("UPDATE tasks SET status = 1, modified_at = ? WHERE id = ?", [new Date().toISOString(), id]) } })
const saved = await saveCard(card, writes)
assert.match(saved.due, /T15:00$/, '3시 = 오후 3시')
const ev = all("SELECT id, start_at, end_at, is_all_day, reminders, ext_provider, deleted_at FROM events WHERE title = '교수님 면담'")
assert.deepEqual([ev.length, ev[0].start_at, ev[0].end_at.slice(11), ev[0].is_all_day, ev[0].reminders, ev[0].ext_provider ?? null], [1, saved.due, '16:00', 0, null, null], '시각 하나 = 1시간, 알림·외부 캘린더 없음')
assert.equal(all("SELECT count(*) AS n FROM tasks WHERE title = '교수님 면담'")[0].n, 0, '할 일은 안 생김')
assert.deepEqual(await A.editedRow(ev[0].id, 'event'), { title: '교수님 면담', start_at: saved.due, due_at: ev[0].end_at, modified_at: saved.saved!.stamp })
await undoCard(saved, writes)
assert.ok(all("SELECT deleted_at FROM events WHERE title = '교수님 면담'")[0].deleted_at, '되돌리면 지움(deleted_at)')
// 날짜만 할 일 = 할 일(tasks)
const rt = await A.askAgent({ text: '10월 20일 보고서 제출 추가해줘', model: '', history: [], memory: emptyMemory(), pending: null, diary: false, name: '도토리', signal: new AbortController().signal })
const tc = rt.cards[0]
assert.ok(tc.type === 'confirm' && tc.kind === undefined)
const ts = await saveCard(tc, writes)
const row = all("SELECT id, due_at, status, list_id, is_all_day FROM tasks WHERE title = '보고서 제출'")
assert.deepEqual([row.length, row[0].due_at, row[0].status, row[0].list_id, row[0].is_all_day], [1, ts.due, 0, 'in', 1])
await undoCard(ts, writes)
assert.ok(all("SELECT deleted_at FROM tasks WHERE title = '보고서 제출'")[0].deleted_at, '되돌리면 휴지통')
// 완료 카드 → 앱의 완료(XP 경로)로
const r3 = await A.askAgent({ text: '보고서 최종본 제출 끝냈어, 완료로 해줘', model: '', history: [], memory: emptyMemory(), pending: null, diary: false, name: '도토리', signal: new AbortController().signal })
assert.ok(r3.cards[0].type === 'confirm')
await saveCard(r3.cards[0], writes)
assert.deepEqual(completed, ['t-report'])

// ── 서버가 agent를 모름(배포 전 400 → 메인이 AGENT_UNSUPPORTED) → AgentUnsupportedError(13 의도 경로로) ──
agentImpl = async () => { throw new Error(`Error invoking remote method 'assistant:agent': Error: ${AGENT_UNSUPPORTED}`) }
await assert.rejects(A.askAgent({ text: '시험 공부 집중 잘 되는 법 알려줘', model: '', history: [], memory: emptyMemory(), pending: null, diary: false, name: '도토리', signal: new AbortController().signal }), (e) => e instanceof AgentUnsupportedError)

// ── 일기 보기(결정 ③): 기본 꺼짐, 동의 없으면 켜도 꺼짐 ──
assert.equal(A.assistantDiaryOn('a@example.com'), false)
A.setAssistantDiary('a@example.com', true)
assert.equal(A.assistantDiaryOn('a@example.com'), false, '일기 AI 동의가 없으면 꺼짐')
store.set('sprout.diary.consent', 'on')
assert.equal(A.assistantDiaryOn('a@example.com'), true)
assert.equal(A.assistantDiaryOn('b@example.com'), false, '계정마다 따로')
// ── 47 §19.4 근거 검사 횟수: 숫자만 메인 IPC로(1~20으로 자름) ──
const grounds: unknown[] = []
;(globalThis as any).window.sprout.assistant.ground = (n: unknown) => grounds.push(n)
A.reportGround(3); A.reportGround(99)
assert.deepEqual(grounds, [3, 20])
// ── 47 §19.1 메모 카드 → 수집함이 받아 갈 메모 id(한 번만) ──
const N = await import('../src/renderer/src/data/notes')
let fired = 0
;(globalThis as any).window.dispatchEvent = (e: { type: string }) => { if (e.type === N.OPEN_NOTE) fired++; return true }
;(globalThis as any).CustomEvent ??= class { type: string; constructor(t: string) { this.type = t } }
N.requestOpenNote('n-kickoff')
assert.deepEqual([fired, N.takeOpenNote(), N.takeOpenNote()], [1, 'n-kickoff', undefined])
console.log('assistant agent (desktop): ok')
