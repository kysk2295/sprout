// 15 일기: 날짜별 저장 · 나만 보기 제외 · AI 입력
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import {
  buildBuddyMessages, buddyReply, entryId, insightOf, josa, parseBuddyReply, recentMemory, saveEntry, sendMessage,
  setConsent, setMemory, setPrivate, streakOf, deleteEntry, taskFromChip,
  averageMood, buddyLine, DONE_SQL, highlightsOf, longestStreak, monthGrid, moodFaceOf, moodTrend, skyOf, WEEK_MON, weekdayMon, weekOf
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
// 주 시작 = 월요일(2026-10-04 사용자 결정)
assert.deepEqual([...WEEK_MON], ['월', '화', '수', '목', '금', '토', '일'])
assert.equal(weekdayMon('2026-10-05'), 0) // 월
assert.equal(weekdayMon('2026-10-04'), 6) // 일
const grid = monthGrid('2026-10') // 10월 1일 = 목
assert.equal(grid.length, 42)
assert.equal(grid[0], '2026-09-28') // 월요일부터
assert.equal(grid[3], '2026-10-01')
assert.ok(grid.every((d, i) => weekdayMon(d) === i % 7))
assert.equal(monthGrid('2026-06')[0], '2026-06-01') // 1일이 월요일이면 앞 칸 없음
assert.deepEqual(weekOf('2026-10-04'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
assert.equal(weekOf('2026-10-05')[0], '2026-10-05')
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

// ── §9.9 종이 대비: 13개 테마 모두 본문 글자 / 종이 ≥ 4.5:1, 보조 글자 / 종이 ≥ 3.8:1 ──
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
    // diary.css의 --diary-paper와 같은 식
    const paper = variant === 'black' ? hex('#0d0d0d') : theme === 'dark' ? mix(hex(get('--color-bg-card')), hex('#3a3226'), 0.94) : mix(hex(get('--color-bg-app')), hex('#f3e6cf'), 0.92)
    assert.ok(ratio(hex(get('--color-text-primary')), paper) >= 4.5, `${t.id}: 본문 / 종이`)
    assert.ok(ratio(hex(get('--color-text-secondary')), paper) >= 3.8, `${t.id}: 보조 / 종이 ${ratio(hex(get('--color-text-secondary')), paper).toFixed(2)}`)
  }
}
console.log('diary tests passed')
