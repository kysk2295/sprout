import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import type { ConfirmCard } from './assistantExec.ts'
import { decisionPolicy } from './assistantDecision.ts'
import { route, emptyMemory } from './assistantRouter.ts'
import { runTurn, type TurnInput } from './assistantAgent.ts'
import { createTables, seedFixture, FIXTURE_NOW as now } from './assistantFixture.ts'
const SQL = await initSqlJs()
const database = new SQL.Database()
createTables((sql, args) => database.run(sql, args as never))
seedFixture((sql, args) => database.run(sql, args as never))
const input: TurnInput = {
  text: '나 오늘 기분이 좋아', now, history: [], memory: emptyMemory(), diary: false, name: '도토리', turn: 'routing-test',
  db: { getAll: async (sql, args = []) => { const q = database.prepare(sql); q.bind(args as never); const rows: any[] = []; while (q.step()) rows.push(q.getAsObject()); q.free(); return rows } },
  chat: async req => { assert.deepEqual(req.tools, []); return { content: '좋네! 산책해 볼까?', tool_calls: [] } },
  routeDecision: { intent: 'chat', confidence: 0.99 },
}
const chat = await runTurn(input)
assert.equal(chat.calls, 1)
assert.equal(chat.nudged, false)
assert.equal(chat.chips.length, 0)
const legacy = route('오늘 할 일 뭐 있어?', { now, diary: false, memory: emptyMemory() })
assert.equal(decisionPolicy(legacy).routed, legacy)
assert.equal(decisionPolicy(legacy, { intent: 'chat', confidence: 0.4 }).routed, legacy)
assert.equal(decisionPolicy(legacy, { intent: 'chat', confidence: NaN }).routed, legacy)
const pending: ConfirmCard = { type: 'confirm', key: 'pending', op: 'create', title: '일정', start: '', due: '', listId: '', listName: '', repeat: '', state: 'pending' }
for (const [text, card, kind] of [['응', pending, 'confirm'], ['취소', pending, 'cancel'], ['응', { ...pending, op: 'delete' }, 'fixed']] as const) {
  const original = route(text, { now, diary: false, memory: emptyMemory(), pending: card })
  assert.equal(original.route.kind, kind)
  assert.equal(decisionPolicy(original, { intent: 'write', confidence: 0.99 }).routed, original)
}
const noDiary = route('지난주 일기 보여줘', { now, diary: false, memory: emptyMemory() })
assert.equal(decisionPolicy(noDiary, { intent: 'read', confidence: 0.99 }).routed, noDiary)
const denied = await runTurn({ ...input, chat: async () => ({ content: '', tool_calls: [{ name: 'find_tasks', args: {} }] }) }).then(() => false, e => /routing-tool-denied/.test(String(e)))
assert.equal(denied, true)
const read = await runTurn({ ...input, text: '오늘 할 일 뭐 있어?', routeDecision: { intent: 'read', confidence: 0.99 }, chat: async () => ({ content: '조회했어.', tool_calls: [] }) })
assert.ok(read.chips.some(c => c.tool === 'find_tasks'))
const write = await runTurn({ ...input, text: '내일 3시에 교수님 면담 잡아줘', routeDecision: { intent: 'write', confidence: 0.99 } })
assert.ok(write.cards.some(c => c.type === 'confirm'))
assert.equal(write.confirm, undefined)
const clarify = await runTurn({ ...input, text: '그걸 처리해', routeDecision: { intent: 'clarify', confidence: 0.99 } })
assert.equal(clarify.calls, 0)
assert.equal(clarify.chips.length, 0)
database.close()
console.log('assistantDecision: policy, retry, tool enforcement, diary, read, write and clarify passed')
