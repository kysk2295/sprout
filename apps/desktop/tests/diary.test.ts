// 15 일기: 날짜별 저장 · 나만 보기 제외 · AI 입력
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import {
  buildBuddyMessages, buddyReply, entryId, insightOf, josa, parseBuddyReply, recentMemory, saveEntry, sendMessage,
  setConsent, setMemory, setPrivate, streakOf, deleteEntry, taskFromChip,
  averageMood, buddyLine, DONE_SQL, highlightsOf, longestStreak, monthGrid, moodFaceOf, moodTrend, skyOf, WEEK_DAYS, weekDaysHead, weekdayIdx, weekOf
} from '../src/renderer/src/data/diary'
import { addScripted, chatTurn, clearScripted, distillSession, isDailyCap, previewOf, replaceSection, saveSection, setSolo } from '../src/renderer/src/data/diary'
import { SCRIPTED, sessionLinesOf, talkStateOf } from '@sprout/schema/diaryTalk'
import { parseSections } from '@sprout/schema/diaryPrompts'
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

// ── 동의 전에는 아무것도 보내지 않는다 ──
assert.equal(await buddyReply('2026-10-04', opts), 'blocked')
assert.equal(calls.length, 0)
setConsent(true)

// ── 지우면 그날 대화도 함께 ──
await run(insert('diary_messages', { id: 'm-del', entry_id: entryId('2026-10-04'), role: 'me', content: '지울 말', safety: 0, created_at: '2026-10-04T10:00:00.000Z' }))
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
// 위기 카드는 제외(2026-10-05): [[SAFETY]] 지시는 없고, 자해 방법·의료 조언 금지 한 줄만 남는다. 새 말은 safety=0
assert.ok(!JSON.stringify(calls).includes('SAFETY'))
assert.ok(calls[0].messages[0].content.includes('자해 방법이나 진단·치료·약 같은 의료 조언은 절대 하지 마'))
assert.ok(msgs('2026-10-05').every((m) => m.safety === 0))
// 예전 위기 카드 행(safety=1)은 AI 입력에서 건너뛴다
const old = buildBuddyMessages({ buddy, entry: { date: '2026-10-05', mood: null, content: '일기', private: 0 }, messages: [{ role: 'me', content: '안녕', safety: 0 }, { role: 'buddy', content: '옛 카드', safety: 1 }] })!
assert.ok(!JSON.stringify(old).includes('옛 카드'))
assert.equal(old.length, 2)
assert.ok(old.at(-1)!.content.endsWith('\n\n안녕'))

// ── 받는 중 표시 줄 숨기기 ──
assert.equal(parseBuddyReply('좋았겠다!\n할').text, '좋았겠다!')
// 작은 모델이 같은 줄 끝에 붙인 할 일도 칩으로
assert.deepEqual(parseBuddyReply('하나만 골라 보자. 😊 할 일: 면담용 차별점 정리.'), { text: '하나만 골라 보자. 😊', task: '면담용 차별점 정리' })
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
// 2026-10-04 E2E: 서버 id는 모든 사용자가 같이 쓰는 키 → 로그인 사용자 id를 붙인다(없으면 예전 모양)
assert.equal(entryId('2026-10-04', 'u-1'), 'diary-2026-10-04-u-1')
assert.equal(entryId('2026-10-04'), 'diary-2026-10-04')

// ── 15 §9 v1 디자인 계산 ──
// 주 시작 = 일요일(2026-10-06 사용자 결정, 캘린더와 같음)
assert.deepEqual([...WEEK_DAYS], ['일', '월', '화', '수', '목', '금', '토'])
assert.equal(weekdayIdx('2026-10-04'), 0) // 일
assert.equal(weekdayIdx('2026-10-10'), 6) // 토
const grid = monthGrid('2026-10') // 10월 1일 = 목
assert.equal(grid.length, 42)
assert.equal(grid[0], '2026-09-27') // 일요일부터
assert.equal(grid[4], '2026-10-01')
assert.ok(grid.every((d, i) => weekdayIdx(d) === i % 7))
assert.equal(monthGrid('2026-11')[0], '2026-11-01') // 1일이 일요일이면 앞 칸 없음
assert.deepEqual(weekOf('2026-10-10'), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
assert.equal(weekOf('2026-10-04')[0], '2026-10-04')
// 06 §16.1 주 시작 설정을 따른다(월요일 · 토요일 시작)
assert.equal(monthGrid('2026-10', 1)[0], '2026-09-28')
assert.equal(monthGrid('2026-10', 6)[0], '2026-09-26')
assert.equal(weekdayIdx('2026-10-01', 1), 3) // 월요일 시작이면 목 = 넷째 칸
assert.deepEqual(weekOf('2026-10-04', 1)[0], '2026-09-28')
assert.deepEqual([...weekDaysHead(6)], ['토', '일', '월', '화', '수', '목', '금'])
// 가장 긴 연속(순서·중복·달 경계 무관)
assert.equal(longestStreak([]), 0)
assert.equal(longestStreak(['2026-10-03', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-02', '2026-10-09', '2026-10-10']), 4)
assert.equal(longestStreak(['2026-02-28', '2026-03-01']), 2)
// 기분 흐름: 그 달 날짜마다, 빈 날 null
const trend = moodTrend([{ date: '2026-10-02', mood: 4 }, { date: '2026-09-30', mood: 1 }, { date: '2026-10-03', mood: null }], '2026-10')
assert.equal(trend.length, 31)
assert.deepEqual(trend.slice(0, 3), [{ date: '2026-10-01', mood: null }, { date: '2026-10-02', mood: 4 }, { date: '2026-10-03', mood: null }])
assert.equal(averageMood([{ mood: 5 }, { mood: 4 }]), null) // 3개 미만
assert.equal(averageMood([{ mood: 5 }, { mood: 4 }, { mood: 3 }, { mood: null }]), 4)
// 기억에 남는 날: 나만 보기·글 없는 날·다른 달은 빼고, 기분 높은 순 → 글 긴 순
const hl = highlightsOf([
  { date: '2026-10-01', mood: 5, content: '짧음', private: 0 },
  { date: '2026-10-02', mood: 5, content: '조금 더 긴 하루 이야기', private: 0 },
  { date: '2026-10-03', mood: 5, content: '비밀 SECRET', private: 1 },
  { date: '2026-10-04', mood: 3, content: '그저 그런 날', private: 0 },
  { date: '2026-10-05', mood: 4, content: '', private: 0 },
  { date: '2026-09-30', mood: 5, content: '지난달', private: 0 },
  { date: '2026-10-06', mood: 2, content: '힘든 날', private: null }
], '2026-10')
assert.deepEqual(hl.map((e) => e.date), ['2026-10-02', '2026-10-01', '2026-10-04'])
assert.ok(!JSON.stringify(hl).includes('SECRET'))
// 시간대(성장 무대와 같은 경계)
assert.deepEqual([0, 5, 6, 10, 11, 16, 17, 19, 20, 23].map(skyOf), ['night', 'night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night'])
// 곁자리 말풍선: 낮은 기분엔 웃는 말·웃는 얼굴이 아니다
assert.equal(buddyLine({ kind: 'mood', mood: 1 }), '곁에 있을게')
assert.equal(buddyLine({ kind: 'mood', mood: 2 }), '곁에 있을게')
assert.equal(buddyLine({ kind: 'mood', mood: 5 }), '좋았구나!')
assert.equal(moodFaceOf(1), 'default')
assert.equal(moodFaceOf(2), 'default')
assert.equal(moodFaceOf(4), 'happy')
assert.equal(buddyLine({ kind: 'private' }), '안 볼게. 너만의 페이지야')
assert.equal(buddyLine({ kind: 'open', hour: 23 }), '늦게까지 고생했어')
// 오늘 한 일 타임라인은 완료 시각도 읽는다
assert.ok(DONE_SQL.includes('completed_at FROM tasks'))


// ── 15 §10 v2: 대화로 쓰고 일기로 옮기기(28 §8.10과 같은 데이터) ──
{
  const D = '2026-10-09'
  const sentBefore = calls.length
  // 정해진 말(safety 2) — 그날 행이 없어도 만든다
  const ids = await addScripted(D, [{ role: 'buddy', content: '저녁이네. 오늘 할 일 5개 중 4개 끝냈네! 어땠어?' }, { role: 'me', content: '좋았어요' }, { role: 'buddy', content: '좋았다니 나도 좋다!' }, { role: 'buddy', content: '무슨 일 있었어? 편하게 말해 줘. 한 줄도 괜찮아.' }])
  assert.equal(ids.length, 4)
  assert.ok(msgs(D).every((m) => m.safety === SCRIPTED))
  // 이야기 한 턴: mode chat, 정해진 말은 대화 맥락으로 가지만 일기 글이 비어 있으면 <diary> 없음, 대화 규칙·들은 말만
  answer = '시험이 코앞인데 손에 안 잡혔구나. 그 마음 무겁겠다.'
  assert.equal(await chatTurn(D, '시험이 코앞인데 손에 안 잡혀', { buddy, signal }), 'reply')
  const chat = calls.at(-1) as unknown as { mode?: string; purpose?: string; messages: { role: string; content: string }[] }
  assert.equal(chat.mode, 'chat')
  assert.equal(chat.purpose, 'diary')
  assert.equal(chat.messages.at(-1)!.role, 'user')
  assert.ok(chat.messages[0].content.includes('묻지 않으면 조언하지 마') && chat.messages[0].content.includes('들은 말만'))
  assert.equal(msgs(D).at(-1)!.safety, 0)
  // 옮기기: mode distill · 서버 스키마 · 캐릭터 말은 물음만
  answer = JSON.stringify({ title: '손에 잡히지 않는 하루', tags: ['감정/무기력', '#영역/공부', '이상한태그'], entry: '시험이 코앞인데 손에 잡히지 않았다.' })
  const st = talkStateOf(all('SELECT * FROM diary_messages WHERE entry_id = ? ORDER BY created_at, id', [entryId(D)]) as never[])
  const d = await distillSession(D, sessionLinesOf(st.S), 4, signal)
  const dist = calls.at(-1) as unknown as { mode?: string; format?: unknown; temperature?: number; messages: { role: string; content: string }[] }
  assert.equal(dist.mode, 'distill')
  assert.ok(dist.format && dist.temperature === 0.2)
  assert.ok(!dist.messages[1].content.includes('할 일 5개'), '캐릭터가 말한 사실은 옮기기 입력에 없다')
  assert.deepEqual(d, { title: '손에 잡히지 않는 하루', tags: ['#감정/무기력', '#영역/공부'], entry: '시험이 코앞인데 손에 잡히지 않았다.' })
  // 저장 = 편 이어 붙이기, 두 번째 편도 앞 편 그대로
  await saveSection(D, { time: '21:45', title: d.title, tags: d.tags, body: d.entry }, 4)
  await saveSection(D, { time: '22:10', title: '두 번째', tags: [], body: '그래도 밥은 먹었다.' }, null)
  const content = String(all('SELECT content FROM diary_entries WHERE id = ?', [entryId(D)])[0].content)
  assert.equal(content, '## 21:45 — 손에 잡히지 않는 하루\n#감정/무기력 #영역/공부\n\n시험이 코앞인데 손에 잡히지 않았다.\n\n## 22:10 — 두 번째\n\n그래도 밥은 먹었다.')
  assert.equal(all('SELECT mood FROM diary_entries WHERE id = ?', [entryId(D)])[0].mood, 4)
  assert.equal(previewOf({ content, private: 0 }), '손에 잡히지 않는 하루', '목록 미리보기 = 제목(머리 줄이 글자로 안 보임)')
  await replaceSection(D, 1, { time: '22:10', title: '두 번째 편', tags: ['#감정/안도'], body: '그래도 밥은 먹었다.' })
  const ss = parseSections(String(all('SELECT content FROM diary_entries WHERE id = ?', [entryId(D)])[0].content))
  assert.deepEqual(ss.map((x) => x.title), ['손에 잡히지 않는 하루', '두 번째 편'])
  assert.deepEqual(ss[1].tags, ['#감정/안도'])
  // 첫 답(예전 흐름)·기억하기 입력에 정해진 말(safety 2)은 없다
  answer = '그랬구나.'
  await buddyReply(D, opts)
  assert.ok(!JSON.stringify(calls.at(-1)).includes('할 일 5개'), '정해진 말은 AI 입력에 없다')
  // 처음부터 다시 묻기 = 정해진 행만 지움
  await clearScripted(D)
  assert.ok(msgs(D).length > 0 && msgs(D).every((m) => m.safety === 0))
  // 나만 보기·오늘은 혼자 = 호출 0
  const n = calls.length
  await setPrivate(D, true)
  assert.equal(await chatTurn(D, '비밀 이야기', { buddy, signal }), 'blocked')
  await assert.rejects(distillSession(D, [{ who: 'me', text: '비밀' }], null, signal))
  await setPrivate(D, false)
  setSolo(D, true)
  assert.equal(await chatTurn(D, '혼자', { buddy, signal }), 'blocked')
  setSolo(D, false)
  assert.equal(calls.length, n, '나만 보기·혼자 쓰기에서는 AI 호출 0')
  assert.ok(calls.length > sentBefore)
  // 하루 한도(429 daily) 서버 문구
  assert.ok(isDailyCap(new Error("Error invoking remote method 'assistant:chat': Error: 오늘은 이 AI 기능을 다 썼어요. 내일 다시 쓸 수 있어요.")))
  assert.ok(!isDailyCap(new Error('지금은 AI를 쓸 수 없어요.')))
}

// ── §10 대비: 대화 말풍선·카드(흰 면)와 바닥 위 글자 — 13개 테마 ──
{
  const { readFileSync } = await import('node:fs')
  const { THEMES, themeAttrs } = await import('../src/renderer/src/data/theme')
  const css = readFileSync('packages/tokens/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = new Map<string, Record<string, string>>()
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars: Record<string, string> = {}
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim()
    for (const sel of m[1].split(',')) blocks.set(sel.trim(), { ...blocks.get(sel.trim()), ...vars })
  }
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x * t + b[i] * (1 - t))
  const lum = (c: number[]) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  for (const t of THEMES) {
    const { theme, variant } = themeAttrs(t.id)
    const v: Record<string, string> = { ...blocks.get(':root'), ...blocks.get(`[data-theme="${theme}"]`), ...(variant ? blocks.get(`[data-theme="${theme}"][data-theme-variant="${variant}"]`) : {}) }
    const get = (n: string): string => { const r = v[n]; const ref = r?.match(/^var\((--[\w-]+)\)$/); return ref ? get(ref[1]) : r }
    for (const face of ['--color-bg-app', '--color-bg-ground', '--color-bg-card', '--color-accent-subtle']) {
      const bg = get(face)
      if (!bg?.startsWith('#')) continue
      assert.ok(ratio(hex(get('--color-text-primary')), hex(bg)) >= 4.5, `${t.id}: 본문 / ${face}`)
    }
    void mix
  }
}
console.log('diary tests passed')
