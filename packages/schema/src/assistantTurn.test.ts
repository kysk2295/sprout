// 47 §20 서버 턴 받기·이어 받기(followTurn)와 시작 요청 검사(parseTurnStart)
import assert from 'node:assert/strict'
import { followTurn, parseTurnStart, TurnLostError, type TurnStart, type TurnTransport } from './assistantTurn.ts'
import { emptyMemory } from './assistantRouter.ts'
import type { TurnEvent, TurnResult } from './assistantAgent.ts'

const body: TurnStart = { turn: 'turn-abc-123', text: '미용실 언제 갔지?', history: [], memory: emptyMemory(), pending: null, diary: false, name: '꿈틀이', timeZone: 'Asia/Seoul' }
const result = { text: '10월 12일이야.', chips: [], cards: [], bands: [], route: 'model', calls: 1, nudged: false, grounding: { hits: 0, reasons: [] }, memory: emptyMemory(), ms: 5 } as unknown as TurnResult
const ev = (seq: number, event: TurnEvent) => JSON.stringify({ seq, event })
const all = [ev(1, { type: 'phase', phase: 'model' }), '{"ping":1}', ev(2, { type: 'phase', phase: 'tools' }), ev(3, { type: 'phase', phase: 'answer' }), JSON.stringify({ seq: 4, result })]
const drop = () => Object.assign(new Error('네트워크 연결이 유실되었습니다.'))
const http = (status: number) => Object.assign(new Error('x'), { status })
async function* lines(list: string[], failAfter?: number) {
  for (let i = 0; i < list.length; i++) { if (failAfter !== undefined && i === failAfter) throw drop(); yield list[i] }
  if (failAfter !== undefined && failAfter >= list.length) throw drop()
}
const noWait = async () => {}

// 1) 끊김 없이
{
  const seen: string[] = []
  const t: TurnTransport = { start: async () => lines(all), resume: async () => { throw new Error('no resume') }, cancel: async () => {} }
  const r = await followTurn({ transport: t, body, signal: new AbortController().signal, onEvent: (e) => seen.push(e.type === 'phase' ? e.phase : e.type), wait: noWait })
  assert.equal(r.text, '10월 12일이야.')
  assert.deepEqual(seen, ['model', 'tools', 'answer'])
}

// 2) 두 번째 사건 뒤 끊김(앱을 나감) → 마지막 seq 다음부터 이어 받기, 같은 사건 두 번 안 받음
{
  const seen: string[] = [], afters: number[] = [], reconnects: number[] = []
  const t: TurnTransport = {
    start: async () => lines(all, 3),
    resume: async (_turn, after) => { afters.push(after); return lines(all) }, // 서버는 after 다음부터 보내지만 처음부터 와도 걸러야 한다
    cancel: async () => {}
  }
  const r = await followTurn({ transport: t, body, signal: new AbortController().signal, onEvent: (e) => seen.push(e.type === 'phase' ? e.phase : e.type), onReconnecting: (n) => reconnects.push(n), wait: noWait })
  assert.equal(r.text, '10월 12일이야.')
  assert.deepEqual(seen, ['model', 'tools', 'answer'])
  assert.deepEqual(afters, [2])
  assert.deepEqual(reconnects, [1])
}

// 3) 시작 요청이 서버에 닿았는지 모름(줄 0개) → 이어 받기로 확인 → 404면 다시 시작
{
  let starts = 0
  const t: TurnTransport = {
    start: async () => { starts++; if (starts === 1) throw drop(); return lines(all) },
    resume: async () => { throw http(404) },
    cancel: async () => {}
  }
  const r = await followTurn({ transport: t, body, signal: new AbortController().signal, onEvent: () => {}, wait: noWait })
  assert.equal(r.text, '10월 12일이야.')
  assert.equal(starts, 2)
}

// 4) 받던 턴이 서버에서 사라짐(10분 지남·서버 재시작) → TurnLostError
{
  const t: TurnTransport = { start: async () => lines(all, 1), resume: async () => { throw http(404) }, cancel: async () => {} }
  await assert.rejects(followTurn({ transport: t, body, signal: new AbortController().signal, onEvent: () => {}, wait: noWait }), TurnLostError)
}

// 5) 계속 끊김 → 정한 횟수 뒤 TurnLostError
{
  let resumes = 0
  const t: TurnTransport = { start: async () => lines(all, 1), resume: async () => { resumes++; throw drop() }, cancel: async () => {} }
  await assert.rejects(followTurn({ transport: t, body, signal: new AbortController().signal, onEvent: () => {}, wait: noWait, delays: [1, 1, 1] }), TurnLostError)
  assert.equal(resumes, 3)
}

// 6) 상한(429)·서버가 보낸 오류 줄은 다시 붙지 않고 그대로
{
  const t: TurnTransport = { start: async () => { throw http(429) }, resume: async () => { throw new Error('no') }, cancel: async () => {} }
  await assert.rejects(followTurn({ transport: t, body, signal: new AbortController().signal, onEvent: () => {}, wait: noWait }), (e: { status?: number }) => e.status === 429)
  const t2: TurnTransport = { start: async () => lines([JSON.stringify({ seq: 1, error: '오늘 AI 사용 한도를 다 썼어요.', code: 'daily', status: 429 })]), resume: async () => { throw new Error('no') }, cancel: async () => {} }
  await assert.rejects(followTurn({ transport: t2, body, signal: new AbortController().signal, onEvent: () => {}, wait: noWait }), /한도/)
}

// 7) ■ 멈춤 → 서버에도 멈춤을 보낸다
{
  const cancelled: string[] = []
  const abort = new AbortController()
  const t: TurnTransport = {
    start: async (_b, signal) => (async function* () { yield ev(1, { type: 'phase', phase: 'model' }); await new Promise((_, rej) => { if (signal.aborted) rej(new Error('aborted')); signal.addEventListener('abort', () => rej(new Error('aborted'))) }) })(),
    resume: async () => { throw new Error('no') },
    cancel: async (turn) => { cancelled.push(turn) }
  }
  const p = followTurn({ transport: t, body, signal: abort.signal, onEvent: () => abort.abort(), wait: noWait })
  await assert.rejects(p)
  assert.deepEqual(cancelled, ['turn-abc-123'])
}

// 8) 앱을 다시 켜서 받아 오기(resumeOnly) — 시작 요청 없이
{
  let started = false
  const t: TurnTransport = { start: async () => { started = true; return lines(all) }, resume: async (_t, after) => { assert.equal(after, 0); return lines(all) }, cancel: async () => {} }
  const r = await followTurn({ transport: t, body: { turn: 'turn-abc-123' } as TurnStart, signal: new AbortController().signal, onEvent: () => {}, wait: noWait, resumeOnly: true })
  assert.equal(r.text, '10월 12일이야.')
  assert.equal(started, false)
}

// 9) 시작 요청 검사
{
  assert.ok(parseTurnStart(body))
  assert.equal(parseTurnStart({ ...body, turn: 'bad id!' }), null)
  assert.equal(parseTurnStart({ ...body, text: '' }), null)
  assert.equal(parseTurnStart({ ...body, history: Array(7).fill({ user: 'a', assistant: 'b' }) }), null)
  assert.equal(parseTurnStart({ ...body, memory: { aliases: {}, recent: [], big: 'x'.repeat(70_000) } }), null)
  assert.equal(parseTurnStart({ ...body, pending: { type: 'tasks' } }), null)
  assert.equal(parseTurnStart({ ...body, persona: 'nope' }), null)
  assert.equal(parseTurnStart({ ...body, diary: 'yes' }), null)
  assert.equal(parseTurnStart({ ...body, history: [{ user: 'u'.repeat(900), assistant: 'a' }] })!.history[0].user.length, 600)
}

console.log('assistantTurn: 이어 받기·시작 재시도·잃음·상한·멈춤·다시 켜기·요청 검사 ok')
