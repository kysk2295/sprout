// 10 성장 §4.3·§5: 주간 마감 숫자 · AI 답 검사 · 주 1회 한도 · 다시 마감해도 XP 그대로
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { addDays } from '@sprout/schema/time'
import { readTextJson, type WeeklyStats } from '@sprout/schema/growth'
import {
  addGoal, carryMissed, closeWeek, dismissDraft, draftGoals, ensureCharacter, runWeeklyClose, setGoalProgress, thisWeek, writeReportText, type GoalRow
} from '../src/renderer/src/data/growth'
import { insert, run } from '../src/renderer/src/data/mutations'
import { dayKey } from '../src/renderer/src/lib/dates'
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql:string, params:unknown[]=[]) => {const s=db.prepare(sql);s.bind(params as never);const r:Record<string,unknown>[]=[];while(s.step())r.push(s.getAsObject());s.free();return r}
// AI 호출을 가로챈다(실제 모델 없음): answers 차례대로 돌려주고, Error면 던진다
const calls: { messages: { role: string; content: string }[]; format?: unknown }[] = []
const answers: (string | Error)[] = []
const store = new Map<string, string>([['sprout.assistant.model', 'test-model']])
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  window: {
    dispatchEvent: () => true,
    sprout: {
      db: { getAll: async (sql:string,p?:unknown[])=>all(sql,p), get: async (sql:string,p?:unknown[])=>all(sql,p)[0]??null, transaction: async (stmts:{sql:string;params?:unknown[]}[])=>{db.run('BEGIN');try{for(const s of stmts)db.run(s.sql,s.params as never);db.run('COMMIT')}catch(e){db.run('ROLLBACK');throw e}} },
      assistant: {
        chat: async (_id: string, input: { messages: { role: string; content: string }[] }) => { calls.push(input); const a = answers.shift(); if (a === undefined) throw new Error('no answer'); if (a instanceof Error) throw a; return a },
        onDelta: () => () => {}, cancel: () => {}, models: async () => ['test-model']
      }
    }
  },
  CustomEvent: class { constructor(public type: string, public init?: unknown) {} }
})
const signal = new AbortController().signal
const goalsOf = (week: string) => all('SELECT id, week_start, title, target, progress, status, source, achieved_at, sort_order FROM kpis WHERE week_start = ? ORDER BY sort_order', [week]) as unknown as GoalRow[]
const xpSum = () => Number(all('SELECT coalesce(sum(amount),0) n FROM xp_events')[0].n)
const report = (week: string) => all('SELECT * FROM weekly_reports WHERE week_start = ?', [week])

const W = addDays(thisWeek(), -7) // 지난주(일요일)
const at = (day: string, hm = '10:00') => new Date(`${day}T${hm}`).toISOString() // 로컬 시각 → completed_at(UTC ISO)
await ensureCharacter()
await run(
  insert('lists', { id: 'l1', name: '업무' }), insert('lists', { id: 'l2', name: '건강' }), insert('tags', { id: 'g1', name: '운동' }),
  insert('tasks', { id: 't1', list_id: 'l1', title: '기획서 정리', status: 1, completed_at: at(addDays(W, 1)), start_at: `${addDays(W, 1)}T09:00`, due_at: `${addDays(W, 1)}T10:30` }),
  insert('tasks', { id: 't2', list_id: 'l2', title: '달리기', status: 1, completed_at: at(addDays(W, 2)) }),
  insert('tasks', { id: 't3', list_id: 'l2', title: '헬스', status: 1, completed_at: at(addDays(W, 6), '23:30') }), // 토요일 밤(로컬) — UTC로는 다른 날일 수 있다
  insert('tasks', { id: 't4', list_id: 'l1', title: '이번 주 일', status: 1, completed_at: at(thisWeek()) }), // 주 밖
  insert('tasks', { id: 't5', list_id: 'l1', title: '못 한 일', status: 0, due_at: addDays(W, 3) }),
  insert('task_tags', { id: 'x1', task_id: 't2', tag_id: 'g1' }), insert('task_tags', { id: 'x2', task_id: 't3', tag_id: 'g1' }),
  insert('xp_events', { id: 'task:t1', kind: 'task', amount: 1, ref_id: 't1', day: addDays(W, 1) }),
  insert('xp_events', { id: 'task:t2', kind: 'task', amount: 1, ref_id: 't2', day: addDays(W, 2) })
)
// 지난주 목표: 하나는 이룸(+30), 하나는 진행 중, 하나는 진행이 목표에 닿았는데 표시가 안 된 것(동기화 어긋남)
await addGoal(W, '운동 2번'); await addGoal(W, '논문 하나 읽기'); await addGoal(W, '독서')
const [g1, , g3] = goalsOf(W)
await setGoalProgress(g1, 2)
await run({ sql: 'UPDATE kpis SET progress = 1 WHERE id = ?', params: [g3.id] })
const xpBefore = xpSum()
assert.equal(xpBefore, 32)

// ── ①② 마감: 목표 판정 + 숫자 ──
const row = await closeWeek(W)
assert.ok(row)
const st = JSON.parse(row.stats_json) as WeeklyStats
assert.equal(st.completed, 3)
assert.equal(st.perDay.reduce((a, b) => a + b, 0), 3)
assert.equal(st.perDay[6], 1) // 토요일 밤 완료는 로컬 날짜로 센다
assert.deepEqual(st.topTags, [{ name: '운동', count: 2 }])
assert.deepEqual(st.topLists, [{ name: '건강', count: 2 }, { name: '업무', count: 1 }])
assert.equal(st.scheduledMinutes, 90)
const after = goalsOf(W)
assert.deepEqual(after.map((g) => g.status), ['achieved', 'missed', 'achieved']) // 닿은 목표는 달성 처리, 나머지 missed
assert.equal(xpSum(), xpBefore + 30 + 0) // 셋째 목표 +30(XP 3개 이내), 모두 달성은 아니라 보너스 없음
assert.equal(st.goalsAchieved, 2)
assert.equal(row.xp_total, st.xp.total)

// 다시 마감해도 숫자·XP가 그대로(중복 지급 없음)
const xpClosed = xpSum()
const again = await closeWeek(W)
assert.equal(again?.stats_json, row.stats_json)
assert.equal(report(W).length, 1)
assert.equal(xpSum(), xpClosed)

// ── ③ 리포트 문장: 연결 실패 → 숫자만, 시도로 안 침 ──
answers.push(new Error('connect ECONNREFUSED 127.0.0.1:11434'))
assert.equal(await writeReportText(W, signal), 'unavailable')
assert.deepEqual(readTextJson(report(W)[0].text_json as string), {})
// 다시 시도 → 엉뚱한 답이 아니라 올바른 답
answers.push('{"done":"할 일 3개를 끝냈어요","goals":"목표 3개 중 2개를 이뤘어요","next":["운동 3번","논문 하나 읽기"]}')
assert.equal(await writeReportText(W, signal), 'ok')
const sent = calls.at(-1)!
assert.match(sent.messages[1].content, /기획서 정리/) // 할 일 제목은 보낸다
assert.match(sent.messages[1].content, /못 한 일/)
assert.ok(sent.format)
let text = readTextJson(report(W)[0].text_json as string)
assert.deepEqual(text.report?.next, ['운동 3번', '논문 하나 읽기'])
assert.equal(text.reportTried, true)
// 주 1회: 또 부르지 않는다
const n = calls.length
assert.equal(await writeReportText(W, signal), 'capped')
assert.equal(calls.length, n)
assert.equal(xpSum(), xpClosed)

// ── ④ KPI 초안: 이번 주 목표가 비어 있을 때만, 확정 전에는 목표가 아니다 ──
answers.push('{"goals":[{"title":"운동","target":3},{"title":"논문 하나 읽기","target":1},{"title":"","target":1}]}')
assert.equal(await draftGoals(W, signal), 'ok')
assert.match(calls.at(-1)!.messages[1].content, /운동 3번/) // 리포트 제안이 재료로 간다
text = readTextJson(report(W)[0].text_json as string)
assert.deepEqual(text.draft, [{ title: '운동 3번', target: 3 }, { title: '논문 하나 읽기', target: 1 }])
assert.equal(text.draftWeek, thisWeek())
assert.equal(text.report?.done, '할 일 3개를 끝냈어요') // 리포트 문장은 그대로 남는다
assert.equal(goalsOf(thisWeek()).length, 0) // 자동으로 추가하지 않는다
assert.equal(await draftGoals(W, signal), 'capped')
// 확정 = source 'ai'
assert.equal(await addGoal(thisWeek(), text.draft![0].title, 'ai'), 'ok')
assert.deepEqual(goalsOf(thisWeek()).map((g) => [g.title, g.target, g.source]), [['운동 3번', 3, 'ai']])
await dismissDraft(W, '논문 하나 읽기')
assert.deepEqual(readTextJson(report(W)[0].text_json as string).dismissed, ['논문 하나 읽기'])

// 못 이룬 목표를 이번 주로 넘기기: 새 목표, 기록은 남는다
await carryMissed(after[1])
assert.equal(goalsOf(W)[1].status, 'missed')
assert.equal(goalsOf(thisWeek()).length, 2)

// ── 엉뚱한 답은 시도로 친다 · 전체 마감은 몇 번 불러도 같은 결과 ──
const W2 = addDays(W, -7)
await run(insert('tasks', { id: 't9', list_id: 'l1', title: '옛 일', status: 1, completed_at: at(addDays(W2, 2)) }))
assert.ok(await closeWeek(W2))
answers.push('리포트입니다!')
assert.equal(await writeReportText(W2, signal), 'invalid')
assert.equal(readTextJson(report(W2)[0].text_json as string).reportTried, true)
assert.equal(readTextJson(report(W2)[0].text_json as string).report, undefined)
assert.equal(await draftGoals(W2, signal), 'none') // 지난지난주 마감은 이번 주 초안을 만들지 않는다

const c = calls.length, x = xpSum(), reports = all('SELECT count(*) n FROM weekly_reports')[0].n
await runWeeklyClose(signal)
await runWeeklyClose(signal)
assert.equal(calls.length, c) // 한도를 다 써서 더 부르지 않는다
assert.equal(xpSum(), x)
assert.equal(all('SELECT count(*) n FROM weekly_reports')[0].n, reports)

// 빈 주는 리포트를 만들지 않는다
assert.equal(await closeWeek(addDays(W, -70)), null)
assert.equal(dayKey().length, 10)
console.log('growth: ok')
