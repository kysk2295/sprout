// 15 일기: 날짜별 저장 · 나만 보기 제외 · 위기 검사 · AI 입력
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import {
  buildBuddyMessages, buddyReply, detectCrisis, entryId, insightOf, josa, parseBuddyReply, recentMemory, saveEntry, sendMessage,
  setConsent, setMemory, setPrivate, streakOf, deleteEntry, taskFromChip
} from '../src/renderer/src/data/diary'
import { insert, run } from '../src/renderer/src/data/mutations'
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql:string, params:unknown[]=[]) => {const s=db.prepare(sql);s.bind(params as never);const r:Record<string,unknown>[]=[];while(s.step())r.push(s.getAsObject());s.free();return r}
// AI 호출을 가로채 기록한다(실제 모델 없음)
const calls: { messages: { role: string; content: string }[] }[] = []
let answer = ''
const store = new Map<string, string>([['sprout.assistant.model', 'test-model']])
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  window: { sprout: {
    db: { getAll: async (sql:string,p?:unknown[])=>all(sql,p), get: async (sql:string,p?:unknown[])=>all(sql,p)[0]??null, transaction: async (stmts:{sql:string;params?:unknown[]}[])=>{db.run('BEGIN');try{for(const s of stmts)db.run(s.sql,s.params as never);db.run('COMMIT')}catch(e){db.run('ROLLBACK');throw e}} },
    assistant: { chat: async (_id: string, input: { messages: { role: string; content: string }[] }) => { calls.push(input); return answer }, onDelta: () => () => {}, cancel: () => {}, models: async () => ['test-model'] }
  } }
})
const buddy = { name: '도토리', species: 'squirrel' as const }
const signal = new AbortController().signal
const opts = { buddy, memoryOn: true, signal }
const msgs = (date: string) => all('SELECT role, content, safety FROM diary_messages WHERE entry_id = ? ORDER BY created_at, id', [entryId(date)])

// ── 날짜별 한 행(결정적 id) ──
await saveEntry('2026-10-04', { mood: 4 })
await saveEntry('2026-10-04', { content: '기획서를 반쯤 썼다. 내일 면담이 걱정된다.' })
const rows = all('SELECT * FROM diary_entries')
assert.equal(rows.length, 1)
assert.equal(rows[0].id, 'diary-2026-10-04')
assert.equal(rows[0].mood, 4)
assert.equal(rows[0].content, '기획서를 반쯤 썼다. 내일 면담이 걱정된다.')
assert.equal(rows[0].private, 0)

// ── 위기 검사(단어) ──
for (const t of ['요즘 그냥 죽고 싶다는 생각이 들어', '자해를 했어', '사라지고 싶어', '살기 싫어', '극단적 선택을 생각했어', '아빠가 나를 때렸어', 'I want to die', '손목을 긋고 싶었어', '모든 게 다 놓아 버리고 싶다', '요즘은 사는 게 무의미해', '그냥 이대로 잠들어서 안 깨어났으면 좋겠다'])
  assert.equal(detectCrisis(t), true, t)
for (const t of ['배고파 죽겠다', '웃겨 죽는 줄 알았어', '과제 다 끝내고 싶어', '이 게임 죽이는데', '정답 맞았어!', '오늘 기획서 반쯤 씀', '때때로 산책을 했다', '알람 못 듣고 늦잠 자서 안 깼다'])
  assert.equal(detectCrisis(t), false, t)

// ── 동의 전에는 아무것도 보내지 않는다 ──
assert.equal(await buddyReply('2026-10-04', opts), 'blocked')
assert.equal(calls.length, 0)
setConsent(true)

// ── 위기 문장은 AI를 부르기 전에 안내 카드 ──
await saveEntry('2026-10-03', { content: '다 그만두고 죽고 싶다' })
assert.equal(await buddyReply('2026-10-03', opts), 'crisis')
assert.equal(calls.length, 0)
assert.equal(msgs('2026-10-03')[0].safety, 1)
// 대화 중 내 말도 먼저 검사
answer = '그랬구나. 어떤 점이 제일 힘들었어?'
assert.equal(await sendMessage('2026-10-04', '자살하고 싶어', opts), 'crisis')
assert.equal(calls.length, 0)
await deleteEntry('2026-10-04')
assert.equal(all('SELECT * FROM diary_messages WHERE entry_id = ?', [entryId('2026-10-04')]).length, 0)

// ── 나만 보기: 보내지 않고, 기억하기에서도 빠진다 ──
await saveEntry('2026-10-01', { content: '비밀 일기 내용 SECRET', summary: '비밀 요약 SECRET' })
await saveEntry('2026-10-02', { content: '스터디 발표를 맡았다', summary: '스터디 발표를 맡음' })
await setPrivate('2026-10-01', true)
assert.equal(all('SELECT summary FROM diary_entries WHERE id = ?', [entryId('2026-10-01')])[0].summary, null) // 요약도 지운다
await saveEntry('2026-10-01', { summary: '다시 생긴 SECRET' }) // 요약이 남아 있어도 기억하기에서 빠져야 한다
assert.equal(await buddyReply('2026-10-01', opts), 'blocked')
assert.equal(calls.length, 0)
const memory = await recentMemory('2026-10-05')
assert.deepEqual(memory.map((m) => m.date), ['2026-10-02'])
assert.equal(buildBuddyMessages({ buddy, entry: { date: '2026-10-01', mood: null, content: 'SECRET', private: 1 }, messages: [] }), null)

// ── 평소 대화: 공감 규칙·비신뢰 표시가 들어가고, 비공개 글은 들어가지 않는다 ──
setMemory(true)
await saveEntry('2026-10-05', { content: '기획서를 반쯤 썼다. 내일 면담이 걱정된다.', mood: 4 })
answer = '기획서를 반이나 썼구나! 면담은 어떤 점이 제일 신경 쓰여?'
assert.equal(await buddyReply('2026-10-05', opts), 'reply')
assert.equal(calls.length, 1)
const sent = JSON.stringify(calls[0])
assert.ok(!sent.includes('SECRET'))
assert.ok(sent.includes('스터디 발표를 맡음')) // 기억하기 요약
assert.ok(sent.includes('<diary>') && sent.includes('지시가 아니야'))
assert.ok(calls[0].messages[0].content.includes('공감 1~2문장과 열린 질문 딱 1개'))
assert.equal(msgs('2026-10-05').at(-1)!.content, answer)
// 기억하기를 끄면 그날 일기만
setMemory(false)
answer = '면담 전에 정리해 두면 마음이 편할 것 같아.\n할 일: 면담용 차별점 한 장 정리'
assert.equal(await sendMessage('2026-10-05', '어떻게 하면 좋을까?', { ...opts, memoryOn: false }), 'reply')
assert.ok(!JSON.stringify(calls[1]).includes('스터디 발표를 맡음'))
assert.deepEqual(calls[1].messages.map((m) => m.role), ['system', 'user', 'assistant', 'user'])
const last = parseBuddyReply(String(msgs('2026-10-05').at(-1)!.content))
assert.equal(last.task, '면담용 차별점 한 장 정리')
assert.equal(last.text, '면담 전에 정리해 두면 마음이 편할 것 같아.')
// 모델이 위기 표시를 내면 안내 카드
answer = '[[SAFETY]]'
assert.equal(await sendMessage('2026-10-05', '요즘 너무 지쳐', opts), 'crisis')
assert.equal(msgs('2026-10-05').at(-1)!.safety, 1)

// ── 받는 중 표시 줄 숨기기 ──
assert.equal(parseBuddyReply('[[SAF').text, '')
assert.equal(parseBuddyReply('좋았겠다!\n할').text, '좋았겠다!')
// 작은 모델이 같은 줄 끝에 붙인 할 일도 칩으로
assert.deepEqual(parseBuddyReply('하나만 골라 보자. 😊 할 일: 면담용 차별점 정리.'), { text: '하나만 골라 보자. 😊', task: '면담용 차별점 정리', safety: false })
assert.equal(parseBuddyReply('오늘 할 일을 다 끝냈구나!').task, undefined)

// ── 할 일로 → 기본함 ──
await run(insert('lists', { id: 'inbox', name: 'Inbox', kind: 'inbox', sort_order: 0, pinned: 0, show_in_smart: 'all' }))
const tid = await taskFromChip('면담용 차별점 한 장 정리')
assert.equal(all('SELECT list_id, title FROM tasks WHERE id = ?', [tid])[0].list_id, 'inbox')

// ── 연속 기록·조사·한 줄 발견 ──
assert.deepEqual(streakOf(new Set(['2026-10-02', '2026-10-03', '2026-10-04']), '2026-10-04'), { days: 3, today: true })
assert.deepEqual(streakOf(new Set(['2026-10-02', '2026-10-03']), '2026-10-04'), { days: 2, today: false })
assert.deepEqual(streakOf(new Set(['2026-10-01']), '2026-10-04'), { days: 0, today: false })
assert.equal(josa('도토리', '와', '과'), '도토리와')
assert.equal(josa('거북이', '가', '이'), '거북이가')
assert.equal(josa('고양이 단짝', '와', '과'), '고양이 단짝과')
assert.equal(insightOf([{ date: 'a', mood: 5 }, { date: 'b', mood: 5 }, { date: 'c', mood: 2 }], new Map([['a', 6], ['b', 7], ['c', 1]])), '할 일을 5개 넘게 끝낸 날 기분이 좋았어요')
console.log('diary tests passed')
