// 47 AI 비서 B안 — 길잡이·도구 실행·근거 검사·루프·넣기/되돌리기(모델 없이, 가짜 chat). research 39 22문항을 고정 시험으로(§12).
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { AGENT_SYSTEM, agentContext, dateLabel, toolsFor, TOOL_NAMES, TOOL_SPECS } from './assistantTools.ts'
import { eventFieldsOf, runTool, type ConfirmCard } from './assistantExec.ts'
import { ground, tidyAnswer } from './assistantGround.ts'
import { route, emptyMemory, dateNotes, periodIn } from './assistantRouter.ts'
import { runTurn, saveCard, undoCard, pendingCard, savedFromEditor, type ChatFn, type AgentWrites, type AgentMessage } from './assistantAgent.ts'
import { createTables, seedFixture, FIXTURE_NOW as now } from './assistantFixture.ts'

const SQL = await initSqlJs()
const sdb = new SQL.Database()
const exec = (sql: string, params: unknown[] = []) => sdb.run(sql, params as never)
createTables(exec)
seedFixture(exec)
const all = <T = any>(sql: string, params: unknown[] = []): T[] => { const s = sdb.prepare(sql); s.bind(params as never); const r: T[] = []; while (s.step()) r.push(s.getAsObject() as T); s.free(); return r }
const db = { getAll: async <T = any>(sql: string, args: unknown[] = []) => all<T>(sql, args) }
const ctx = () => ({ db, now, aliases: {}, diary: false })

// ── 도구 목록·지시문 ──
assert.equal(toolsFor({ diary: false }).length, 9)
assert.ok(!toolsFor({ diary: false }).some((t) => t.function.name === 'find_diary'), '일기 꺼짐이면 도구 목록에 find_diary 없음(§16)')
assert.equal(toolsFor({ diary: true }).length, 10)
assert.equal(TOOL_NAMES.length, 10)
assert.ok(AGENT_SYSTEM.length < 700, `지시문은 짧게(${AGENT_SYSTEM.length}자)`)
const c0 = agentContext(now, { name: '도토리', timeZone: 'Asia/Seoul' })
assert.match(c0, /10-14\(수\)/)
assert.match(c0, /10-09\(금\)=오늘/)
assert.match(c0, /일기 도구 없음/)
assert.equal(dateLabel('2026-10-11', now), '모레 10월 11일(일)')
assert.equal(dateLabel('2026-10-14T19:00', now), '10월 14일(수) 오후 7:00')

// ── 길잡이(§2.2) — research 39 문항 ──
const R = (t: string, o: Partial<Parameters<typeof route>[1]> = {}) => route(t, { now, diary: false, memory: emptyMemory(), ...o }).route
assert.deepEqual(R('미용실 간 지 얼마나 지났지'), { kind: 'prefetch', calls: [{ name: 'when_last', args: { query: '미용실' } }] }, 'a')
const b = R('이번 주 뭐가 제일 급해?')
assert.equal(b.kind, 'prefetch'); assert.deepEqual((b as any).calls[0], { name: 'find_tasks', args: { status: 'open', from: '2026-10-05', to: '2026-10-11', sort: 'urgent' } }, 'b')
const c = R('내일 3시에 교수님 면담 잡아줘') as any
assert.deepEqual([c.kind, c.title, c.due, c.assumedPm], ['create', '교수님 면담', '2026-10-10T15:00', true], 'c')
assert.equal(R('시험 공부 집중 잘 되는 법 알려줘').kind, 'model', 'd')
assert.equal(R('오늘 비트코인 가격 알려줘').kind, 'model', 'e')
assert.deepEqual(route('오늘 비트코인 가격 알려줘', { now, diary: false, memory: emptyMemory() }).bands, ['noweb'])
const g = R('그럼 다음 주 토요일 오후 2시로 예약 잡아줘', { memory: { ...emptyMemory(), subject: '미용실' } }) as any
assert.deepEqual([g.kind, g.title, g.due, g.basis], ['create', '미용실 예약', '2026-10-17T14:00', '이전 대화의 “미용실”을 이어 받음'], 'g')
assert.deepEqual(R('올해 운동 몇 번 했어?'), { kind: 'prefetch', calls: [{ name: 'when_last', args: { query: '운동', from: '2026-01-01' } }] }, 'h')
assert.deepEqual((R('오늘 할 일 뭐 있어?') as any).calls, [{ name: 'find_tasks', args: { status: 'open', from: '2026-10-09', to: '2026-10-09' } }], 'i')
assert.deepEqual((R('다음 주 수요일에 일정 있어?') as any).calls, [{ name: 'find_events', args: { from: '2026-10-14', to: '2026-10-14' } }], 'j')
assert.equal(R('공모전 킥오프 회의록 어디 적어 뒀지?').kind, 'model', 'k')
assert.equal(R('지난주 일기에 내가 뭐 힘들다고 했었지?').kind, 'fixed', 'n 일기 꺼짐')
assert.deepEqual(R('지난주 일기에 내가 뭐 힘들다고 했었지?', { diary: true }), { kind: 'prefetch', calls: [{ name: 'find_diary', args: { from: '2026-09-28', to: '2026-10-04' } }] }, 'n 일기 켬')
const o = R('보고서 최종본 제출 끝냈어, 완료로 해줘') as any
assert.deepEqual([o.kind, o.op, o.query], ['update', 'complete', '보고서 최종본 제출'], 'o')
assert.equal(R('두통이 3일째인데 무슨 약 먹으면 돼?').kind, 'model', 's')
assert.deepEqual(route('두통이 3일째인데 무슨 약 먹으면 돼?', { now, diary: false, memory: emptyMemory() }).bands, ['care'])
assert.deepEqual(route('테슬라 주식 지금 사도 될까?', { now, diary: false, memory: emptyMemory() }).bands, ['care'])
assert.equal((R('이번 주 할 일 보고 시험 공부 계획 짜줘') as any).calls[0].name, 'find_tasks', 'u')
assert.equal(R('3월 14일부터 오늘까지 며칠이야?').kind, 'model', 'v')
assert.deepEqual(R('빨래 내일로 미뤄줘'), { kind: 'update', op: 'move', query: '빨래', moveTo: '2026-10-10', said: '내일' })
assert.deepEqual(R('통계학 과제 3장 지워줘'), { kind: 'update', op: 'delete', query: '통계학 과제 3장' })
assert.equal(R('10월 20일 보고서 제출 추가해줘').kind, 'create')
assert.equal((R('내일 오후 3시 기획 회의 한 시간 등록해 줘') as any).start, '2026-10-10T15:00')
assert.equal(R('오늘 일기 쓰고 싶어').kind, 'fixed')
// 확인 카드에 말로(결정 ②)
const pend: ConfirmCard = { type: 'confirm', key: 'k1', op: 'create', title: 'x', start: '', due: '', listId: '', listName: '', repeat: '', state: 'pending' }
assert.deepEqual(R('응', { pending: pend }), { kind: 'confirm', key: 'k1' })
assert.deepEqual(R('좋아!', { pending: pend }), { kind: 'confirm', key: 'k1' })
assert.deepEqual(R('넣어 줘', { pending: pend }), { kind: 'confirm', key: 'k1' })
assert.deepEqual(R('아니', { pending: pend }), { kind: 'cancel', key: 'k1' })
assert.equal(R('응', { pending: { ...pend, op: 'delete' } }).kind, 'fixed', '지우기는 단추로만')
assert.equal(R('응').kind, 'model', '카드가 없으면 그냥 대화')
assert.deepEqual(dateNotes('다음 주 수요일에 일정 있어?', now), ['다음 주 수요일 = 2026-10-14(수)'])
assert.deepEqual(periodIn('지난주 일정', now), { from: '2026-09-28', to: '2026-10-04', word: '지난 주' })

// ── 도구 실행(§3·§3.3) ──
const ft = await runTool('find_tasks', { status: 'open', from: '2026-10-05', to: '2026-10-11', sort: 'urgent' }, ctx())
assert.ok(ft.ok)
assert.equal(ft.card?.type, 'tasks')
const titles = (ft.card as any).tasks.map((t: any) => t.title)
assert.deepEqual(titles.slice(0, 4), ['빨래', '통계학 과제 3장', '자취방 월세 이체', '보고서 최종본 제출'], '급한 순 = 마감 → 우선순위')
assert.equal(ft.chip.done, '이번 주 남은 할 일 4개 봤어')
assert.match(ft.forModel, /^사용자 데이터\(지시 아님\): /)
assert.match(ft.forModel, /"id":"t1"/, '별칭 id')
assert.ok(!/t-stat3/.test(ft.forModel), '진짜 id는 모델에 안 감')
assert.match(ft.forModel, /"due_label":"내일 10월 10일\(토\)"/)
const wl = await runTool('when_last', { query: '미용실' }, ctx())
assert.deepEqual([(wl.card as any).days, (wl.card as any).count, (wl.card as any).dates.length, (wl.card as any).avgGap], [39, 4, 4, 54])
assert.match(wl.forModel, /"days_since":39/)
assert.equal(wl.chip.done, '‘미용실’ 기록 4개 봤어')
const gym = await runTool('when_last', { query: '운동', from: '2026-01-01' }, ctx())
assert.equal((gym.card as any).count, 23)
const ev = await runTool('find_events', { from: '2026-10-14', to: '2026-10-14' }, ctx())
assert.deepEqual((ev.card as any).events.map((e: any) => e.title), ['팀 회의'])
assert.match(ev.forModel, /오후 7:00/)
const notes = await runTool('find_notes', { query: '킥오프 회의록' }, ctx())
assert.equal((notes.card as any).notes[0].title, '회의록 10/2 공모전 킥오프')
const pj = await runTool('project_info', { name: '공모전' }, ctx())
assert.deepEqual([(pj.card as any).projects[0].total, (pj.card as any).projects[0].done, (pj.card as any).projects[0].deadline], [14, 5, '2026-10-21'])
const gr = await runTool('growth_stats', {}, ctx())
assert.deepEqual([(gr.card as any).level, (gr.card as any).stageName, (gr.card as any).weekDone], [8, '친구', 14])
const dc = await runTool('date_calc', { op: 'days_between', a: '2026-03-14', b: '2026-10-09' }, ctx())
assert.match(dc.forModel, /"days":209/)
assert.match((await runTool('date_calc', { op: 'weekday', a: '10-14' }, ctx())).forModel, /"weekday":"수"/, 'MM-DD도 올해로')
// 일기: 꺼짐이면 실패, 켜도 나만 보기·대화 원문 없음
assert.equal((await runTool('find_diary', {}, ctx())).ok, false)
const dy = await runTool('find_diary', {}, { ...ctx(), diary: true })
assert.ok(dy.ok && /힘들었다/.test(dy.forModel))
assert.ok(!/비밀 이야기|대화 원문/.test(dy.forModel), '나만 보기 날·일기 대화 원문은 결과에 없다')
// 외부 캘린더: 도구는 events 표(꿈틀 일정)만 — 앱 캐시를 읽는 길이 없다. events 표 밖 행이 결과에 없는지
exec("CREATE TABLE IF NOT EXISTS external_cache (id TEXT, title TEXT, start_at TEXT)")
exec("INSERT INTO external_cache VALUES ('g1', '구글 일정 비밀', '2026-10-14T10:00')")
assert.ok(!/구글 일정 비밀/.test((await runTool('find_events', { from: '2026-10-14', to: '2026-10-14' }, ctx())).forModel))
const pc = await runTool('propose_create', { title: '교수님 면담', due: '2026-10-10T15:00' }, ctx())
assert.equal((pc.card as any).length, '시각만 (길이 말 안 해서 안 붙였어요)')
const up = await runTool('propose_update', { id: 't1', action: 'complete' }, { ...ctx(), aliases: { t1: { id: 't-report', title: '보고서 최종본 제출', kind: 'task' } } })
assert.equal((up.card as any).targets[0].id, 't-report')

// ── 근거 검사(§8.2) ──
const facts = { dates: ['2026-08-31'], titles: ['미용실 가기'], numbers: [39, 4] }
const G = (text: string, extra: Partial<Parameters<typeof ground>[0]> = {}) => ground({ text, facts, user: '미용실 간 지 얼마나 지났지', now, aliases: { t6: { id: 'x', title: '보고서 최종본 제출', kind: 'task' } }, usedTools: true, hasCards: true, ...extra }).text
assert.equal(G('마지막으로 미용실 간 건 8월 31일이야. 39일 지났어.'), '마지막으로 미용실 간 건 8월 31일이야. 39일 지났어.')
assert.equal(G('마지막은 8월 30일이야. 39일 지났어.'), '39일 지났어.', '결과에 없는 날짜 문장 빼기')
assert.equal(G('8월 31일(토)에 갔어.'), '찾은 건 카드에 있어.', '요일이 틀리면 빼기(8/31 = 월)')
assert.equal(G('‘미용실 가기’는 40일 전이야.'), '찾은 건 카드에 있어.', '숫자가 결과에 없음')
assert.equal(G('‘미용실가기’ 했지.'), '‘미용실가기’ 했지.')
assert.equal(G('‘미용실 갔기’ 기록이 있어.'), '‘미용실 가기’ 기록이 있어.', '가까운 제목으로 바꿈')
assert.equal(G('‘헤어 컷 예약’ 기록이 있어.'), '찾은 건 카드에 있어.')
assert.equal(G('내일 3시로 넣었어.', { usedTools: false, proposed: true }), '이렇게 넣을까?', '저장 없이 저장 말')
assert.equal(G('할 일 id는 t6야.'), '할 일 id는 ‘보고서 최종본 제출’야.')
assert.equal(G('14개 중已完成한 것이 4개야.', { facts: { ...facts, numbers: [14, 4] } }), '14개 중한 것이 4개야.')
assert.equal(G('비트코인은 지금 9,800만 원 정도야. 인터넷을 못 봐.', { usedTools: false }), '인터넷을 못 봐.')
assert.equal(G('하루 2시간씩 공부해 봐.', { usedTools: true }), '하루 2시간씩 공부해 봐.', '일반 시간 말은 그대로')
assert.equal(G('내일(10/11)까지야.', { facts: { ...facts, dates: ['2026-10-11'] } }), '찾은 건 카드에 있어.', '내일인데 모레 날짜')
assert.equal(G('공부법은 메모나 할 일 목록에 있는 게 없네. 25분 집중하고 5분 쉬어 봐.', { usedTools: false }), '25분 집중하고 5분 쉬어 봐.', '도구 없이 데이터를 본 척하는 문장 빼기')
assert.equal(tidyAnswer('미용실은 8 월 31 일 (월) 에 갔어'), '미용실은 8월 31일(월)에 갔어')
assert.equal(tidyAnswer('**좋아!** 🎉 # 제목'), '좋아! 제목')

// ── 루프(§4) — 가짜 모델 ──
const script = (steps: ((m: AgentMessage[], tools: string[]) => { content?: string; calls?: { name: string; args: any }[] })[]): { chat: ChatFn; log: { tools: string[]; n: number }[] } => {
  const log: { tools: string[]; n: number }[] = []
  let k = 0
  return { log, chat: async (req, h) => { log.push({ tools: req.tools, n: req.messages.length }); const s = steps[Math.min(k++, steps.length - 1)](req.messages, req.tools); if (s.content) h.onDelta(s.content); return { content: s.content ?? '', tool_calls: s.calls ?? [] } } }
}
const base = { history: [], memory: emptyMemory(), diary: false, name: '도토리', db, turn: 'turn-0001', now }
// a: 길잡이 when_last → 모델 1번(도구 없이)
{
  const s = script([() => ({ content: '마지막으로 미용실 간 건 8월 31일이야. 39일 지났어.' })])
  const r = await runTurn({ ...base, text: '미용실 간 지 얼마나 지났지', chat: s.chat })
  assert.deepEqual([r.calls, r.route, s.log[0].tools.length, r.text], [1, 'prefetch', 0, '마지막으로 미용실 간 건 8월 31일이야. 39일 지났어.'])
  assert.equal(r.cards[0].type, 'since')
  assert.equal(r.memory.subject, '미용실')
  // ⓖ 이어 받기 → 확인 카드(모델 0번)
  const r2 = await runTurn({ ...base, memory: r.memory, text: '그럼 다음 주 토요일 오후 2시로 예약 잡아줘', chat: s.chat })
  const cc = r2.cards[0] as ConfirmCard
  assert.deepEqual([r2.calls, cc.title, cc.due, cc.basis, r2.text], [0, '미용실 예약', '2026-10-17T14:00', '이전 대화의 “미용실”을 이어 받음', '이렇게 넣을까?'])
  // 응 → 넣기(모델 0번, 상한 안 셈)
  const r3 = await runTurn({ ...base, memory: r2.memory, pending: pendingCard([r2.cards]), text: '응', chat: s.chat })
  assert.deepEqual(r3.confirm, { key: cc.key, action: 'save' })
}
// 일반 질문: 도구 없이 답
{
  const s = script([() => ({ content: '25분 집중하고 5분 쉬어 봐.' })])
  const r = await runTurn({ ...base, text: '시험 공부 집중 잘 되는 법 알려줘', chat: s.chat })
  assert.deepEqual([r.calls, r.nudged, s.log[0].tools.length], [1, false, 9])
}
// 재촉 한 번: 데이터 질문인데 도구 없이 → 재촉 → 도구 → 답
{
  const s = script([
    () => ({ content: '찾아볼까?' }),
    () => ({ calls: [{ name: 'find_notes', args: { query: '킥오프' } }] }),
    () => ({ content: '‘회의록 10/2 공모전 킥오프’ 메모에 적어 뒀어.' })
  ])
  const r = await runTurn({ ...base, text: '공모전 킥오프 회의록 어디 적어 뒀지?', chat: s.chat })
  assert.deepEqual([r.calls, r.nudged, r.chips[0].done, r.text], [3, true, '메모 1개 봤어', '‘회의록 10/2 공모전 킥오프’ 메모에 적어 뒀어.'])
}
// 재촉해도 도구가 없으면 앱이 직접 찾고 카드로
{
  const s = script([() => ({ content: '기록에 없어.' })])
  const r = await runTurn({ ...base, text: '내 동아리 회비 정리 했나?', chat: s.chat })
  assert.deepEqual([r.calls, r.text, r.cards[0]?.type], [2, '찾아본 건 카드에 있어.', 'tasks'])
}
// 최대 4번: 도구를 계속 부르면 넷째는 도구 없이 → 답
{
  const s = script([() => ({ calls: [{ name: 'growth_stats', args: {} }] }), () => ({ calls: [{ name: 'growth_stats', args: {} }] }), () => ({ calls: [{ name: 'growth_stats', args: {} }] }), () => ({ content: '레벨 8이야.' })])
  const r = await runTurn({ ...base, text: '나 지금 레벨 몇이야?', chat: s.chat })
  assert.deepEqual([r.calls, s.log[3].tools.length, r.text], [4, 0, '레벨 8이야.'])
}
// 한 번에 도구 3개까지
{
  const s = script([() => ({ calls: Array.from({ length: 5 }, () => ({ name: 'growth_stats', args: {} })) }), () => ({ content: '레벨 8이야.' })])
  const r = await runTurn({ ...base, text: '나 레벨 몇이야?', chat: s.chat })
  assert.equal(r.chips.length, 3)
}
// 완료 길잡이 → 확인 카드(후보 하나)
{
  const s = script([() => ({ content: 'x' })])
  const r = await runTurn({ ...base, text: '보고서 최종본 제출 끝냈어, 완료로 해줘', chat: s.chat })
  const cc = r.cards[0] as ConfirmCard
  assert.deepEqual([r.calls, cc.op, cc.targets?.map((t) => t.id), r.text], [0, 'complete', ['t-report'], '이거 완료로 바꿀까?'])
}
// 대기열 503: 길잡이로 찾은 카드 + 정해진 문장
{
  const chat: ChatFn = async () => { throw Object.assign(new Error('지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.'), { status: 503 }) }
  const r = await runTurn({ ...base, text: '이번 주 뭐가 제일 급해?', chat })
  assert.deepEqual([r.busyFallback, r.text, r.cards[0].type], [true, '지금 AI가 바빠서 찾은 것만 보여 줄게.', 'tasks'])
}
// 멈춤: 나온 칩·카드는 남는다
{
  const stop = new AbortController()
  const chat: ChatFn = async (_r, h) => { stop.abort(); h.signal.throwIfAborted(); return { content: '', tool_calls: [] } }
  const r = await runTurn({ ...base, text: '이번 주 뭐가 제일 급해?', chat, signal: stop.signal })
  assert.deepEqual([r.stopped, r.cards.length > 0, r.error], [true, true, '요청을 멈췄어요. 내용을 확인한 뒤 다시 보내 주세요.'])
}
// 일기 꺼짐: 모델 0번, 안내
{
  const s = script([() => ({ content: 'x' })])
  const r = await runTurn({ ...base, text: '지난주 일기에 뭐 썼지?', chat: s.chat })
  assert.deepEqual([r.calls, r.text, r.action], [0, '일기는 AI가 못 보게 해 뒀어.', 'settings'])
}

// ── 넣기·되돌리기(§5.3·§6, 13 규칙) ──
let seq = 0
const tick = () => new Date(Date.UTC(2026, 9, 9, 1, 0, seq++)).toISOString()
const writes: AgentWrites = {
  newId: () => `new-${seq}`,
  stamp: tick,
  create: async (card, id, stamp) => exec('INSERT INTO tasks (id, title, list_id, status, start_at, due_at, modified_at) VALUES (?, ?, ?, 0, ?, ?, ?)', [id, card.title, card.listId || 'in', card.start || null, card.due || null, stamp]),
  complete: async (ids) => { const s = tick(); for (const id of ids) exec('UPDATE tasks SET status = 1, completed_at = ?, modified_at = ? WHERE id = ?', [s, s, id]) },
  uncomplete: async (ids) => { const s = tick(); for (const id of ids) exec('UPDATE tasks SET status = 0, completed_at = NULL, modified_at = ? WHERE id = ?', [s, id]) },
  run: async (stmts) => { for (const st of stmts) exec(st.sql, st.params) },
  read: async (ids) => all(`SELECT id, modified_at, status, deleted_at, start_at, due_at FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
}
const mk = (op: ConfirmCard['op'], extra: Partial<ConfirmCard> = {}): ConfirmCard => ({ type: 'confirm', key: 'k', op, title: '면담', start: '', due: '2026-10-10T15:00', listId: '', listName: '기본함', repeat: '', state: 'pending', ...extra })
const saved = await saveCard(mk('create'), writes)
assert.equal(all('SELECT title FROM tasks WHERE id = ?', [saved.saved!.ids[0]])[0].title, '면담')
const undone = await undoCard(saved, writes)
assert.equal(undone.state, 'undone')
assert.ok(all('SELECT deleted_at FROM tasks WHERE id = ?', [saved.saved!.ids[0]])[0].deleted_at)
const s2 = await saveCard(mk('create'), writes)
exec('UPDATE tasks SET title = ?, modified_at = ? WHERE id = ?', ['바뀜', tick(), s2.saved!.ids[0]])
await assert.rejects(undoCard(s2, writes), /등록 뒤에 바뀐 항목은 되돌릴 수 없어요/)
const mv = await saveCard(mk('move', { targets: [{ id: 't-laundry', title: '빨래', start_at: null, due_at: '2026-10-09', picked: true }], moveTo: '2026-10-12' }), writes)
assert.equal(all("SELECT due_at FROM tasks WHERE id = 't-laundry'")[0].due_at, '2026-10-12')
await undoCard(mv, writes)
assert.equal(all("SELECT due_at FROM tasks WHERE id = 't-laundry'")[0].due_at, '2026-10-09')
const del = await saveCard(mk('delete', { targets: [{ id: 't-rent', title: '자취방 월세 이체', start_at: null, due_at: '2026-10-10', picked: true }] }), writes)
assert.ok(all("SELECT deleted_at FROM tasks WHERE id = 't-rent'")[0].deleted_at)
await undoCard(del, writes)
assert.equal(all("SELECT deleted_at FROM tasks WHERE id = 't-rent'")[0].deleted_at, null)
const done = await saveCard(mk('complete', { targets: [{ id: 't-club', title: '동아리 회비 정리', start_at: null, due_at: null, picked: true }] }), writes)
assert.equal(all("SELECT status FROM tasks WHERE id = 't-club'")[0].status, 1)
await undoCard(done, writes)
assert.equal(all("SELECT status FROM tasks WHERE id = 't-club'")[0].status, 0)
console.log('assistantAgent: ok')
// 실측(research 39 §8)에서 나온 것
assert.equal(G('보고서는 다음 주 일요일까지야.', { facts: { dates: ['2026-10-11'], titles: ['보고서 최종본 제출'], numbers: [] } }), '찾은 건 카드에 있어.', '이번 주 일요일(10/11)을 다음 주라고 함')
assert.equal(G('보고서는 이번 주 일요일까지야.', { facts: { dates: ['2026-10-11'], titles: ['보고서 최종본 제출'], numbers: [] } }), '보고서는 이번 주 일요일까지야.')
assert.equal(G('‘공모전 킥오프 회의록’ 메모에 있어.', { facts: { dates: [], titles: ['회의록 10/2 공모전 킥오프'], numbers: [] } }), '‘공모전 킥오프 회의록’ 메모에 있어.', '낱말이 다 들어 있는 제목은 허용')
assert.equal(tidyAnswer('저녁 7 시에 시작해서 39 일이 지났어. 오늘 10월 9일(금) 에 해.'), '저녁 7시에 시작해서 39일이 지났어. 오늘 10월 9일(금)에 해.')
assert.deepEqual(R('도구 쓰지 말고 그냥 내가 지난달에 운동 몇 번 했는지 대충 맞춰봐'), { kind: 'prefetch', calls: [{ name: 'when_last', args: { query: '운동', from: '2026-09-01', to: '2026-09-30' } }] })
assert.equal(route('오늘 비트코인 가격 알려줘', { now, diary: false, memory: emptyMemory() }).dataQuestion, false)
assert.equal((R('작년에 내가 뭐 했어?') as any).calls[0].args.status, 'completed')
const gymSep = await runTool('when_last', { query: '운동', from: '2026-09-01', to: '2026-09-30' }, ctx())
assert.match(gymSep.forModel, /"count_label":"9월 \d+번"/)
console.log('assistantAgent (실측 보강): ok')
assert.equal(G('엄마 생일은 기록에 없어. 일기 도구가 없으니까 AI가 못 보게 해 뒀어.', { facts: { dates: [], titles: [], numbers: [] }, user: '엄마 생일 언제였지?' }), '엄마 생일은 기록에 없어.', '묻지 않은 일기 이야기')
assert.equal(G('다음 주 수요일 저녁 7시에 팀 회의가 있네. 넣을까?', { facts: { dates: ['2026-10-14'], titles: ['팀 회의'], numbers: [] }, user: '다음 주 수요일에 일정 있어?' }), '다음 주 수요일 저녁 7시에 팀 회의가 있네.')
assert.equal(G('운동은 올해 23번 했어. 그제서야 두 번째로 운동했지!', { facts: { dates: [], titles: ['헬스장 운동'], numbers: [23, 2] }, user: '올해 운동 몇 번 했어?' }), '운동은 올해 23번 했어.')
assert.equal((R('내일 3시에 교수님 면담 잡아줘') as any).said, '내일 3시')
console.log('assistantAgent (실측 2차): ok')
assert.equal(G('레벨 8이야. 등록했어!', { facts: { dates: [], titles: [], numbers: [8] }, user: '나 레벨 몇이야?' }), '레벨 8이야.')
assert.equal(G('작년에 할 일 기록은 없어. AI가 못 보게 해 뒀어.', { facts: { dates: [], titles: [], numbers: [] }, user: '작년에 뭐 했어?' }), '작년에 할 일 기록은 없어.')
assert.deepEqual(R('내 할 일 목록 기억나는 대로 5개만 말해줘. 확인 안 해도 돼'), { kind: 'prefetch', calls: [{ name: 'find_tasks', args: { status: 'open', sort: 'due' } }] })
console.log('assistantAgent (실측 3차): ok')

// ── 47 §19.3 꿈틀 일정 넣기: 길잡이 갈래 · 카드 · 넣기 · 되돌리기 ──
{
  const E = (t: string) => R(t) as any
  const a = E('내일 3시~5시 팀 회의 잡아줘')
  assert.deepEqual([a.kind, a.event, a.title, a.start, a.due, a.said], ['create', true, '팀 회의', '2026-10-10T15:00', '2026-10-10T17:00', '내일 3시~5시'], '시간 범위 = 일정')
  const b2 = E('내일 오후 2시부터 4시 디자인 리뷰 넣어줘')
  assert.deepEqual([b2.event, b2.start, b2.due, b2.said], [true, '2026-10-10T14:00', '2026-10-10T16:00', '내일 오후 2시~4시'], '~부터 ~ = 일정')
  assert.deepEqual([E('내일 3시부터 5시까지 동아리 모임 잡아줘').event, E('내일 3시부터 5시까지 동아리 모임 잡아줘').said], [true, '내일 3시~5시'])
  const c2 = E('토요일 친구 약속 일정으로 잡아줘')
  assert.deepEqual([c2.event, c2.title, c2.due], [true, '친구 약속', '2026-10-10'], "'일정' 말 = 일정(날짜만 = 종일)")
  assert.deepEqual([E('금요일 3시-5시 스터디 일정 잡아줘').event, E('금요일 3시-5시 스터디 일정 잡아줘').title], [true, '스터디'], "제목에서 '일정' 떼기")
  assert.equal(E('내일 3시에 교수님 면담 잡아줘').event, true, '약속 낱말 + 시각 = 일정')
  assert.equal(E('내일 7시 저녁 약속 잡아줘').event, true)
  assert.equal(E('내일 오후 3시 기획 회의 한 시간 등록해 줘').event, true, '시각 + 길이 = 일정')
  assert.equal(E('10월 20일 보고서 제출 추가해줘').event, undefined, '날짜만 할 일 = 할 일')
  assert.equal(E('내일 회의록 정리 추가해줘').event, undefined, '약속 낱말이어도 시각이 없으면 할 일')
  const t2 = E('보고서 할 일로 내일 추가해줘')
  assert.deepEqual([t2.event, t2.title], [undefined, '보고서'], "'할 일로'면 늘 할 일")
  assert.equal(E('내일 3시 회의 할 일로 넣어줘').event, undefined)
  // 카드: 머리 말·길이·캘린더 줄
  const s = script([() => ({ content: 'x' })])
  const r1 = await runTurn({ ...base, text: '내일 3시~5시 팀 회의 잡아줘', chat: s.chat })
  const ec = r1.cards[0] as ConfirmCard
  assert.deepEqual([r1.calls, ec.kind, ec.length, ec.listName, r1.chips[0].done, r1.text], [0, 'event', '2시간', '내 일정', '일정 하나 준비했어', '이렇게 넣을까?'])
  const r2 = await runTurn({ ...base, text: '내일 3시에 교수님 면담 잡아줘', chat: s.chat })
  assert.equal((r2.cards[0] as ConfirmCard).length, '1시간 (길이를 말 안 해서 기본 1시간)')
  const r3 = await runTurn({ ...base, text: '10월 20일 보고서 제출 추가해줘', chat: s.chat })
  assert.deepEqual([(r3.cards[0] as ConfirmCard).kind, (r3.cards[0] as ConfirmCard).listName, r3.chips[0].done], [undefined, '기본함', '할 일 하나 준비했어'])
  // 모델 경로 propose_create kind
  const pe = await runTool('propose_create', { title: '팀 회의', kind: 'event', start: '2026-10-14T19:00', due: '2026-10-14T20:00' }, ctx())
  assert.deepEqual([(pe.card as ConfirmCard).kind, pe.chip.done, /"kind":"event"/.test(pe.forModel)], ['event', '일정 하나 준비했어', true])
  const pt = await runTool('propose_create', { title: '보고서', due: '2026-10-14' }, ctx())
  assert.equal((pt.card as ConfirmCard).kind, undefined)
  const pd = await runTool('propose_create', { title: '워크숍', kind: 'event' }, ctx())
  assert.deepEqual([(pd.card as ConfirmCard).due, (pd.card as ConfirmCard).length], ['2026-10-09', '하루 종일'], '날짜 없는 일정 = 오늘 종일')
  assert.ok(TOOL_SPECS.propose_create.function.parameters.properties.kind, '서버로 가는 도구 정의에 kind')
  // 일정 행 칸(06 §14.4 eventSpan): 시각 하나 = 1시간, 알림·색 없음
  assert.deepEqual(eventFieldsOf({ title: ' 면담 ', start: '', due: '2026-10-10T15:00', repeat: '' }, '2026-10-09'), { title: '면담', notes: null, location: null, start_at: '2026-10-10T15:00', end_at: '2026-10-10T16:00', is_all_day: 0, time_zone: 'floating', repeat_rule: null, reminders: null, color: null, deleted_at: null })
  assert.deepEqual([eventFieldsOf({ title: 'x', start: '', due: '2026-10-10', repeat: 'FREQ=WEEKLY;BYDAY=SA' }, '2026-10-09').is_all_day, eventFieldsOf({ title: 'x', start: '', due: '2026-10-10', repeat: 'FREQ=WEEKLY;BYDAY=SA' }, '2026-10-09').repeat_rule], [1, 'FREQ=WEEKLY;BYDAY=SA'])
  // 넣기 → events 한 행 → 되돌리기(넣은 직후와 같을 때만)
  const ew: AgentWrites = {
    ...writes,
    createEvent: async (card, id, st) => { const f = eventFieldsOf(card, '2026-10-09'); exec('INSERT INTO events (id, title, start_at, end_at, is_all_day, repeat_rule, deleted_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)', [id, f.title, f.start_at, f.end_at, f.is_all_day, f.repeat_rule, st]) },
    readEvents: async (ids) => all(`SELECT id, modified_at, deleted_at FROM events WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  }
  const es = await saveCard(ec, ew)
  const evId = es.saved!.ids[0]
  assert.deepEqual(all('SELECT title, start_at, end_at, is_all_day FROM events WHERE id = ?', [evId])[0], { title: '팀 회의', start_at: '2026-10-10T15:00', end_at: '2026-10-10T17:00', is_all_day: 0 })
  assert.equal(all('SELECT COUNT(*) AS n FROM tasks WHERE id = ?', [evId])[0].n, 0, '일정 카드는 할 일을 만들지 않는다')
  const found = await runTool('find_events', { from: '2026-10-10', to: '2026-10-10' }, ctx())
  assert.ok((found.card as any).events.some((e: any) => e.id === evId), '넣은 일정은 find_events에 나온다')
  const eu = await undoCard(es, ew)
  assert.equal(eu.state, 'undone')
  assert.ok(all('SELECT deleted_at FROM events WHERE id = ?', [evId])[0].deleted_at)
  const es2 = await saveCard(ec, ew)
  exec('UPDATE events SET title = ?, modified_at = ? WHERE id = ?', ['바뀐 회의', tick(), es2.saved!.ids[0]])
  await assert.rejects(undoCard(es2, ew), /등록 뒤에 바뀐 항목은 되돌릴 수 없어요/)
  await assert.rejects(saveCard(ec, writes), /일정을 넣지 못했어요/, 'createEvent 없는 앱은 일정 카드를 넣지 않는다')
  // 말로 확인('응')도 일정 카드
  assert.deepEqual(R('응', { pending: ec }), { kind: 'confirm', key: ec.key })
  // [고치기] 편집기에서 넣은 것 → 카드 저장 상태 + 같은 되돌리기
  const fromEd = savedFromEditor(ec, { id: 'ed-1', stamp: '2026-10-09T02:00:00.000Z', kind: 'task', title: '팀 회의 준비', start: null, due: '2026-10-10' })
  assert.deepEqual([fromEd.state, fromEd.kind, fromEd.title, fromEd.start, fromEd.due, fromEd.saved], ['saved', undefined, '팀 회의 준비', '', '2026-10-10', { ids: ['ed-1'], stamp: '2026-10-09T02:00:00.000Z' }])
  exec("INSERT INTO tasks (id, title, list_id, status, due_at, modified_at) VALUES ('ed-1', '팀 회의 준비', 'in', 0, '2026-10-10', '2026-10-09T02:00:00.000Z')")
  assert.equal((await undoCard(fromEd, ew)).state, 'undone')
  assert.ok(all("SELECT deleted_at FROM tasks WHERE id = 'ed-1'")[0].deleted_at)
}
console.log('assistantAgent (일정 넣기 · 고치기 47 §19): ok')
