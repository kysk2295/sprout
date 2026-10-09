// 10 성장 §4.3·§5: 주간 마감 숫자 · AI 답 검사 · 주 1회 한도 · 다시 마감해도 XP 그대로
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { addDays } from '@sprout/schema/time'
import { readTextJson, type WeeklyStats } from '@sprout/schema/growth'
import {
  addGoal, carryMissed, closeWeek, dismissDraft, draftGoals, ensureCharacter, isWeeklyCap, removeGoal, runWeeklyClose, setGoalProgress, thisWeek, writeReportText, type GoalRow
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
// 2026-10-04 E2E: 서버 주간 상한(429 "이번 주에는 이미 사용했어요…")만 시도로 친다. 하루 상한·대기열은 다음에 다시
assert.equal(isWeeklyCap(new Error("Error invoking remote method 'assistant:chat': Error: 이번 주에는 이미 사용했어요. 다음 주 월요일에 다시 쓸 수 있어요.")), true)
assert.equal(isWeeklyCap(new Error('오늘 AI 사용 한도를 다 썼어요. 내일 다시 시도해 주세요.')), false)
assert.equal(isWeeklyCap(new Error('지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.')), false)

// 2026-10-04 E2E: 목표 XP 3개 상한은 "XP를 가진 목표" 수로 센다 + 지운 목표의 XP는 되돌린다
{
  const NW = addDays(thisWeek(), 21) // 다른 시험과 겹치지 않는 주
  for (const t of ['가', '나', '다', '라']) await addGoal(NW, t)
  const goalsOf = () => all('SELECT id, week_start, title, target, progress, status, source, achieved_at, sort_order FROM kpis WHERE week_start = ? ORDER BY sort_order', [NW]) as unknown as GoalRow[]
  const net = (id: string) => (all('SELECT sum(amount) n FROM xp_events WHERE ref_id = ?', [id])[0].n as number | null) ?? 0
  for (const t of ['가', '나', '다', '라']) await setGoalProgress(goalsOf().find((g) => g.title === t)!, 1)
  const byT = (t: string) => goalsOf().find((g) => g.title === t)!
  assert.deepEqual(['가', '나', '다', '라'].map((t) => net(byT(t).id)), [30, 30, 30, 0])
  await setGoalProgress(byT('가'), 0) // 취소 → XP 되돌림
  await setGoalProgress(byT('가'), 1) // 다시 이룸: XP 가진 목표가 2개라 다시 받는다(예전: 달성 수 3이라 못 받음)
  assert.equal(net(byT('가').id), 30)
  const nId = byT('나').id
  const before = xpSum()
  await removeGoal(nId) // 지우면 그 목표 XP를 되돌린다(적고·이루고·지우기로 상한 넘기 방지)
  assert.equal(net(nId), 0)
  assert.equal(xpSum(), before - 30)
}
// 10 §3.2 캐릭터 중심 v3: 무대 계산(순수 함수)·기기 저장
{
  const { DECOR, newlyUnlocked, nextDecor, timeOfDay, isSleepy, stageLines, greetingLine, catchUpOf, levelOfTotal, readRoomOff, writeRoomOff, takeGreeting, readMotionPref, writeMotionPref, setGrowthStageActive, isGrowthStageActive } = await import('../src/renderer/src/data/growth')
  const { cumulativeXp, progressFromEvents } = await import('@sprout/schema/growth')
  // 장식: 레벨로 열린다, 건너뛴 레벨 사이 것도 모두
  assert.deepEqual(newlyUnlocked(4, 6).map((d) => d.id), ['butterfly', 'ball'])
  assert.deepEqual(newlyUnlocked(6, 6), [])
  assert.equal(nextDecor(15), undefined)
  assert.equal(nextDecor(6)?.id, 'bunting')
  assert.equal(DECOR.length, 10)
  // 시간대 · 졸림(밤 23–6시 또는 이틀 넘게 XP 없음)
  assert.deepEqual([5, 6, 11, 17, 20].map(timeOfDay), ['night', 'morning', 'day', 'evening', 'night'])
  assert.equal(isSleepy(23, 0), true)
  assert.equal(isSleepy(5, 0), true)
  assert.equal(isSleepy(14, 1), false)
  assert.equal(isSleepy(14, 2), true)
  // 말풍선: 실제 숫자
  const base = { todayDone: 3, todayOpen: 2, todayTaskXp: 3, streak: 3, idleDays: 0, level: 4, into: 92, toNext: 100, diaryUnseen: true, goals: [{ title: '운동 3번', target: 3, progress: 2, achieved: false }, { title: '논문 읽기', target: 1, progress: 0, achieved: false }] }
  const l = stageLines(base)
  assert.equal(l[0], '일기 썼어! 읽어 줄래?')
  assert.ok(l.includes('오늘 3개나 했어, 최고야'))
  assert.ok(l.includes("'운동 3번' 1번 남았어!"))
  assert.ok(l.includes('레벨업까지 8 XP! 거의 다 왔어'))
  assert.ok(l.includes('Lv 5가 되면 나비가 생겨'))
  assert.ok(!l.some((x) => x.includes('연속'))) // 43 §12: 연속 기록은 어디에도 보이지 않는다(누적만)
  const l2 = stageLines({ ...base, todayDone: 0, todayTaskXp: 10, diaryUnseen: false, streak: 0, goals: [{ title: 'a', target: 1, progress: 1, achieved: true }, { title: 'b', target: 1, progress: 1, achieved: true }] })
  assert.ok(l2.includes('오늘 할 일 2개 있어. 하나만 같이 해 볼까?'))
  assert.ok(l2.includes('이번 주 퀘스트 다 했다! 보너스 +20'))
  assert.ok(l2.includes('오늘은 배불러! 남은 건 내일 먹을게'))
  assert.ok(!l2.some((x) => x.includes('연속')))
  assert.equal(greetingLine('morning', { todayDone: 0, todayOpen: 4 }), '좋은 아침! 오늘 할 일 4개 있어')
  assert.equal(greetingLine('evening', { todayDone: 3, todayOpen: 0 }), '오늘 3개 했네, 수고했어')
  // 자리 비운 사이: since 뒤 +XP만, 처음 쓰는 기기(since 없음)는 날리지 않는다, 방울은 10개까지
  const ev = (kind: string, amount: number, at: string) => ({ kind, amount, created_at: at })
  const evs = [ev('task', 1, '2026-10-04T01:00:00Z'), ev('task', 1, '2026-10-04T03:00:00Z'), ev('task_revoke', -1, '2026-10-04T03:10:00Z'), ev('kpi', 30, '2026-10-04T04:00:00Z')]
  assert.deepEqual(catchUpOf(evs, null), { tasks: 0, xp: 0, orbs: [] })
  assert.deepEqual(catchUpOf(evs, '2026-10-04T02:00:00Z'), { tasks: 1, xp: 31, orbs: [1, 30] })
  const many = Array.from({ length: 13 }, (_, i) => ev('task', 1, `2026-10-04T05:${String(i).padStart(2, '0')}:00Z`))
  assert.deepEqual(catchUpOf(many, '2026-10-04T00:00:00Z').orbs, [1, 1, 1, 1, 1, 1, 1, 1, 1, 4])
  // 표시용 레벨 계산은 원장 계산과 같다
  for (const t of [0, 39, 40, 99, 100, cumulativeXp(6), cumulativeXp(6) + 5]) {
    const p = progressFromEvents([{ amount: t, created_at: '2026-10-04T00:00:00Z' }])
    assert.deepEqual(levelOfTotal(t), { level: p.level, into: p.into, toNext: p.toNext })
  }
  // 기기 저장: 치운 장식 · 하루 첫 인사 한 번 · 움직임 줄이기
  assert.equal(readRoomOff('c1').size, 0)
  writeRoomOff('c1', new Set(['ball']))
  assert.deepEqual([...readRoomOff('c1')], ['ball'])
  assert.equal(takeGreeting('2026-10-04'), true)
  assert.equal(takeGreeting('2026-10-04'), false)
  assert.equal(takeGreeting('2026-10-05'), true)
  assert.equal(readMotionPref(), false)
  writeMotionPref(true)
  assert.equal(readMotionPref(), true)
  writeMotionPref(false)
  // 성장 화면이 열려 있는 동안만 무대가 레벨업을 맡는다
  assert.equal(isGrowthStageActive(), false)
  setGrowthStageActive(true)
  assert.equal(isGrowthStageActive(), true)
  setGrowthStageActive(false)
  setGrowthStageActive(false)
  assert.equal(isGrowthStageActive(), false)
}
console.log('growth: ok')
