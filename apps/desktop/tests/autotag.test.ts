// 33 §7 자동 태그 v1.0(손 안 드는 자동): 정규화·사전 검사·학습 낱말·상한·리스트 겹침·집·넓은 태그·dismissed,
// AI 답 검증(지어낸 이름·리스트 이름·같은 뜻), 새 태그 문턱·속도·60개, AI 태그끼리 합치기,
// 그리고 DB(sql.js)로 새 할 일 경로·태그 새로 생김 다시 훑기·일괄(이어 하기·하루 상한·24시간 되돌리기)·이번 주 되돌리기.
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import {
  AUTO_TAG, addCandidates, aiTagId, autoTagRowId, cleanTagName, dictionaryPass, findSynonym, learnedWords, nameInTitle, planAiMerges, planAssign,
  parseTagItemsLoose, readyCandidates, sameMeaning, score, tagKey, TAG_ACCEPTED, validateTagAnswer, type Assign, type Ctx
} from '@sprout/schema/autoTag'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, any>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  window: { sprout: { db: {
    getAll: async (sql: string, p?: unknown[]) => all(sql, p),
    get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
    transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
  } } }
})
const { tagTasks, runBackfill, undoBackfill, canUndoBackfill, weeklySummary, undoWeek, rescanNewTagKeys, autoTagStore, setAutoTagPerson, setAutoTagEnabled, _test } = await import('../src/renderer/src/data/autoTag')
const { autoTag } = await import('../src/renderer/src/data/wiki')

// ── 순수: 정규화 ──
assert.equal(tagKey('🎓 SQL 개발자'), 'sql개발자')
assert.equal(tagKey('#UniPort'), 'uniport')
assert.equal(cleanTagName('#📜 SQLD '), 'SQLD')
assert.equal(cleanTagName('가'), null)
assert.equal(cleanTagName('가'.repeat(21)), null)
assert.equal(score('87%'), 87)
assert.equal(score(0.9), 90)
assert.equal(score('x'), null)
assert.ok(nameInTitle('교수님', '교수님께 중간 보고 메일'), '조사 뗌')
assert.ok(nameInTitle('SQLD', 'SQLD를 3회 풀기'))
assert.ok(nameInTitle('SQL 개발자', 'SQL개발자 접수'), '여러 낱말 이름은 공백 무시')
assert.ok(nameInTitle('교수님', '[[교수님]] 면담'), '링크 괄호는 뗀다')
assert.ok(nameInTitle('IR', 'IR 자료 만들기'))
assert.ok(!nameInTitle('IR', 'ir 자료'), '영문 1~2글자는 대문자 그대로만')
assert.ok(!nameInTitle('IR', 'FIRE 운동'))
assert.ok(!nameInTitle('운동', '운동화 사기'), '한 낱말 이름은 낱말이 같아야')
assert.ok(sameMeaning('SQLD', 'SQLD시험'))
assert.ok(sameMeaning('SQLD', 'sqld 공부'))
assert.ok(sameMeaning('지원사업', '지원 사업'))
assert.ok(sameMeaning('LangGraph', 'LangGrap'), '4글자 이상 한 글자 차이')
assert.ok(!sameMeaning('운동', '운동화'))
assert.ok(!sameMeaning('교수님', '교수'), '짧은 이름의 한 글자 차이는 같은 뜻 아님')
assert.equal(TAG_ACCEPTED, "COALESCE(tt.state,'accepted')='accepted'")
assert.equal(autoTagRowId('t1', 'g1'), autoTagRowId('t1', 'g1'))
assert.notEqual(autoTagRowId('t1', 'g1'), autoTagRowId('t1', 'g2'))
assert.equal(aiTagId('SQLD'), aiTagId('sqld'), '같은 이름 = 같은 id(두 기기)')

// ── 순수: 사전 검사·상한·겹침 ──
const ctx0 = (): Ctx => ({
  person: true,
  folders: [{ id: 'fu', name: '🚀 UniPort' }, { id: 'fs', name: '🎓 학교' }],
  lists: [{ id: 'in', name: 'Inbox', kind: 'inbox' }, { id: 'lc', name: '자격증', folder_id: 'fs' }, { id: 'lk', name: '💼 커리어' }, { id: 'lm', name: '마케팅', folder_id: 'fu' }, { id: 'lz', name: '창업 준비' }],
  tags: [
    { id: 'gp', name: '교수님', kind: 'person', aliases: '["지도교수님"]' },
    { id: 'gs', name: 'SQLD', kind: 'topic', aliases: '["SQL 개발자"]' },
    { id: 'gu', name: 'UniPort', kind: 'project', home_type: 'folder', home_id: 'fu' },
    { id: 'gc', name: '자격증', kind: 'topic' },
    { id: 'ga', name: '면접', kind: 'topic' },
    { id: 'gb', name: '면접', kind: 'topic' }
  ],
  tasks: [
    { id: 't1', title: '교수님께 중간 보고 메일', list_id: 'lc', status: 0 },
    { id: 't2', title: 'SQLD 기출 3회', list_id: 'lc', status: 0 },
    { id: 't3', title: 'UniPort 사업계획서 초안', list_id: 'lz', status: 0 },
    { id: 't4', title: 'UniPort 카드뉴스', list_id: 'lm', status: 0 },
    { id: 't5', title: '자격증 칸에 SQLD 넣기', list_id: 'lc', status: 0 },
    { id: 't6', title: '면접 준비', list_id: 'lk', status: 0 },
    { id: 't7', title: '지도교수님 SQLD UniPort 면담', list_id: 'lk', status: 0 }
  ],
  links: []
})
{
  const ctx = ctx0()
  const raw = dictionaryPass(ctx.tasks.map((t) => t.id), ctx)
  const plan = planAssign(raw, ctx)
  const has = (t: string, g: string) => plan.some((a) => a.taskId === t && a.tagId === g)
  assert.ok(has('t1', 'gp') && plan.find((a) => a.taskId === 't1')!.source === 'rule', '교수님께 → 👤 교수님 자동(rule)')
  assert.ok(has('t2', 'gs'))
  assert.ok(has('t3', 'gu'), '폴더 밖 할 일엔 프로젝트 태그')
  assert.ok(!has('t4', 'gu'), '프로젝트 태그의 집(폴더) 안엔 안 붙음')
  assert.ok(!has('t5', 'gc') && has('t5', 'gs'), '리스트 이름과 같은 태그는 안 붙음')
  assert.ok(!plan.some((a) => a.taskId === 't6'), '두 태그가 같은 이름 = 애매 → 사전으로는 안 붙임')
  assert.equal(plan.filter((a) => a.taskId === 't7' && a.tagId !== 'gu').length, 2, '할 일당 자동 2개까지')
  assert.ok(has('t7', 'gu'), '31 §12.1 프로젝트 태그는 자동 2개 상한과 따로(프로젝트 1개까지 더)')
  // 사람 끔
  const noPerson = { ...ctx0(), person: false }
  assert.ok(!planAssign(dictionaryPass(['t1'], noPerson), noPerson).length, '사람 태그 자동 끔')
  // dismissed는 다시 안 붙임, 총 3개 상한
  const c2 = ctx0()
  c2.links = [{ id: 'x', task_id: 't2', tag_id: 'gs', source: 'ai', state: 'dismissed' }, { id: 'u1', task_id: 't1', tag_id: 'ga', source: 'user' }, { id: 'u2', task_id: 't1', tag_id: 'gb', source: null }, { id: 'u3', task_id: 't1', tag_id: 'gc', source: 'link' }]
  const p2 = planAssign(dictionaryPass(['t1', 't2'], c2), c2)
  assert.equal(p2.length, 0, 'dismissed 다시 안 붙음 · 직접 3개면 더 안 붙음')
  // 너무 넓은 태그: 열린 할 일 30개 이상에서 20% 넘게
  const c3 = ctx0()
  for (let i = 0; i < 30; i++) c3.tasks.push({ id: `w${i}`, title: `SQLD ${i}`, list_id: 'lk', status: 0 })
  c3.links = c3.tasks.slice(0, 9).map((t, i) => ({ id: `b${i}`, task_id: t.id, tag_id: 'gs', source: 'user' }))
  assert.ok(!planAssign(dictionaryPass(['w20'], c3), c3).some((a) => a.tagId === 'gs'), '넓은 태그는 더 안 붙임')
}
// 학습 낱말: 사용자가 '#운동' 붙인 할 일에 늘 '헬스'
{
  const ctx: Ctx = { person: true, folders: [], lists: [{ id: 'l', name: '생활' }], tags: [{ id: 'gw', name: '운동' }], links: [], tasks: [] }
  for (let i = 0; i < 3; i++) { ctx.tasks.push({ id: `h${i}`, title: `헬스 ${i}회차`, list_id: 'l' }); ctx.links.push({ id: `l${i}`, task_id: `h${i}`, tag_id: 'gw', source: 'user' }) }
  ctx.tasks.push({ id: 'hn', title: '헬스 가기', list_id: 'l' })
  assert.equal(learnedWords(ctx).get('헬스'), 'gw')
  const p = planAssign(dictionaryPass(['hn'], ctx), ctx)
  assert.deepEqual(p.map((a) => [a.tagId, a.confidence]), [['gw', 80]])
  ctx.tags.push({ id: 'gx', name: '친구' })
  ctx.tasks.push({ id: 'h8', title: '헬스 친구 연락', list_id: 'l' })
  ctx.links.push({ id: 'l8', task_id: 'h8', tag_id: 'gx', source: 'user' })
  assert.equal(learnedWords(ctx).get('헬스'), undefined, '사람이 붙인 할 일 중 80% 아래로 떨어지면 학습 안 함')
}

// ── 순수: AI 답 검증 ──
{
  const ctx = ctx0()
  ctx.tasks.push({ id: 't8', title: 'SQLD시험 접수', list_id: 'lk', status: 0 })
  const taskKeys = new Map([['t1', 't1'], ['t2', 't3'], ['t3', 't6'], ['t4', 't2'], ['t5', 't8'], ['t6', 't7']])
  const tagKeys = new Map([['g1', 'gp'], ['g2', 'gs'], ['g3', 'ga']])
  const out = {
    items: [
      { key: 't1', tags: [{ tag: 'g1', confidence: 95 }, { tag: 'g9', confidence: 99 }], new: [] },
      { key: 't2', tags: [{ tag: 'g2', confidence: 70 }], new: [{ name: '사업계획서', kind: 'topic', confidence: 88 }] },
      { key: 't3', tags: [{ tag: 'g3', confidence: '92' }], new: [{ name: '취업박람회', kind: 'place', confidence: 90 }] },
      { key: 't4', tags: [{ tag: 'SQLD', confidence: 0.93 }], new: [] },
      { key: 't5', tags: [], new: [{ name: 'SQLD시험', kind: 'weird', confidence: 91 }] },
      { key: 't6', tags: [{ tag: '면접', confidence: 99 }], new: [] },
      { key: 't1', tags: [{ tag: 'g2', confidence: 99 }] },
      { key: 'zz', tags: [{ tag: 'g1', confidence: 99 }] }
    ]
  }
  const r = validateTagAnswer(out, taskKeys, tagKeys, ctx)
  assert.deepEqual(r.assign.map((a) => `${a.taskId}:${a.tagId}:${a.confidence}`), ['t1:gp:95', 't6:ga:92', 't2:gs:93', 't8:gs:91'], '모르는 키·85 미만·같은 할 일 두 번째 답·애매한 이름 버림, 이름으로도 받음, 같은 뜻 새 이름 → 있는 태그')
  assert.deepEqual(r.fresh.map((f) => [f.taskId, f.name, f.kind]), [['t3', '사업계획서', 'topic']], '제목에 없는 이름(취업박람회)은 거부')
  assert.deepEqual(r.alias, [{ tagId: 'gs', name: 'SQLD시험' }], '비슷한 새 이름은 별칭으로')
  const bad = validateTagAnswer({ items: [{ key: 't1', tags: [], new: [{ name: '자격증', kind: 'topic', confidence: 99 }] }, { key: 't2', tags: [], new: [{ name: '정리', confidence: 99 }] }] }, taskKeys, tagKeys, ctx)
  assert.equal(bad.fresh.length, 0, '리스트 이름·흔한 낱말은 새 태그 안 됨')
  assert.equal(validateTagAnswer({ items: 'x' } as never, taskKeys, tagKeys, ctx).assign.length, 0)
  assert.deepEqual(findSynonym('지도교수님', ctx.tags)?.tag.id, 'gp')
}

// 모델이 JSON을 깨뜨려도 항목을 건짐(2026-10-05 qwen3.5:9b 실측: 괄호 하나 더, 맨 문자열 태그)
{
  const broken = '{"items":[{"key":"t1","tags":[{"tag":"g1","confidence":95}],"new":[]},{"key":"t2","tags":["g3"],"new":[{"name":"병원","kind":"place","confidence":95}]}]}]'
  const p = parseTagItemsLoose(broken)
  assert.equal(p.items.length, 2)
  assert.deepEqual(parseTagItemsLoose('```json\n[{"key":"t1","tags":[]}]\n```').items.length, 1)
  assert.deepEqual(parseTagItemsLoose('{"items":[{"key":"t1","tags":[]},{"key":"t2","tags":[{"tag":"g1"').items.length, 1, '잘린 마지막 항목만 버림')
  assert.equal(parseTagItemsLoose('모르겠어요').items.length, 0)
}

// ── 순수: 새 태그 후보·문턱 ──
{
  const at = '2026-10-05T00:00:00.000Z'
  let c = addCandidates({}, [{ taskId: 'a', name: '지원사업', kind: 'topic', confidence: 80 }, { taskId: 'b', name: '지원 사업', kind: 'topic', confidence: 75 }], at)
  assert.equal(Object.keys(c).length, 1, '같은 뜻 후보는 하나로')
  const opts = { tagCount: 10, room: 10, backfill: false, blocked: new Set<string>(), person: true }
  assert.equal(readyCandidates(c, opts).length, 0, '2개 + 최고 80 → 아직')
  c = addCandidates(c, [{ taskId: 'c', name: '지원사업', kind: 'topic', confidence: 72 }], at)
  const r = readyCandidates(c, opts)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].taskIds.sort(), ['a', 'b', 'c'])
  assert.equal(readyCandidates(c, { ...opts, backfill: true }).length, 0, '일괄 중엔 4개')
  assert.equal(readyCandidates(c, { ...opts, tagCount: AUTO_TAG.maxTags }).length, 0, '태그 60개 이상이면 새 태그 없음')
  assert.equal(readyCandidates(c, { ...opts, room: 0 }).length, 0, '속도 상한')
  assert.equal(readyCandidates(c, { ...opts, blocked: new Set([tagKey('지원사업')]) }).length, 0, '되돌린 이름')
  const fast = addCandidates({}, [{ taskId: 'a', name: 'IR', kind: 'topic', confidence: 92 }, { taskId: 'b', name: 'IR', kind: 'topic', confidence: 75 }], at)
  assert.equal(readyCandidates(fast, opts).length, 1, '2개 + 90점이면 바로')
  const person = addCandidates({}, [{ taskId: 'a', name: '대표님', kind: 'person', confidence: 95 }, { taskId: 'b', name: '대표님', kind: 'person', confidence: 95 }], at)
  assert.equal(readyCandidates(person, opts).length, 0, '사람은 빠른 길 없음')
  const p3 = addCandidates(person, [{ taskId: 'c', name: '대표님', kind: 'person', confidence: 80 }], at)
  assert.equal(readyCandidates(p3, opts).length, 0, '사람은 85점 이상만 셈')
  const p4 = addCandidates(p3, [{ taskId: 'd', name: '대표님', kind: 'person', confidence: 90 }], at)
  assert.equal(readyCandidates(p4, opts).length, 1)
  assert.equal(readyCandidates(p4, { ...opts, person: false }).length, 0)
  const old = addCandidates({ x: { name: 'x', kinds: {}, tasks: {}, at: '2026-01-01T00:00:00.000Z' } }, [], at)
  assert.equal(Object.keys(old).length, 0, '60일 넘은 후보는 버림')
  // AI 태그끼리만 합치기
  const merges = planAiMerges([{ id: 'a', name: 'SQLD', source: 'ai' }, { id: 'b', name: 'SQLD시험', source: 'ai' }, { id: 'c', name: 'sqld', source: 'user' }], new Map([['a', 1], ['b', 5]]))
  assert.deepEqual(merges.map((m) => `${m.from.id}>${m.into.id}`), ['a>b'], '할 일 많은 쪽으로, 사용자 태그는 안 건드림')
}

// ── DB ──
const T0 = '2026-10-05T09:00:00.000Z'
const ins = (table: string, row: Record<string, unknown>) => { const cols = Object.keys(row); db.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, Object.values(row) as never) }
ins('folders', { id: 'fu', name: '🚀 UniPort' })
for (const l of [{ id: 'in', name: 'Inbox', kind: 'inbox' }, { id: 'lc', name: '자격증', kind: 'normal' }, { id: 'lk', name: '커리어', kind: 'normal' }, { id: 'lz', name: '창업 준비', kind: 'normal' }, { id: 'lm', name: '마케팅', kind: 'normal', folder_id: 'fu' }]) ins('lists', l)
ins('tags', { id: 'gp', name: '교수님', kind: 'person', aliases: '["지도교수님"]', sort_order: 1 })
ins('tags', { id: 'gs', name: 'SQLD', kind: 'topic', sort_order: 2 })
const task = (id: string, title: string, list_id: string, o: Record<string, unknown> = {}) => ins('tasks', { id, title, list_id, status: 0, created_at: T0, modified_at: T0, ...o })
task('a1', '교수님께 중간 보고 메일', 'lc')
task('a2', '예비창업패키지 서류 마감', 'lz')
task('a3', '예비창업패키지 발표 연습', 'lk')
task('a4', '오늘 할 일 정리', 'in')
const tagsOf = (id: string) => all(`SELECT tag_id, source, state, confidence, run_id FROM task_tags tt WHERE task_id = ? ORDER BY tag_id`, [id])

// 가짜 AI: 보낸 본문을 기억하고 정해 둔 답
const sent: any[] = []
let reply: (payload: any) => unknown = () => ({ items: [] })
let fail: Error | null = null
const chat = (async (input: any) => {
  if (fail) throw fail
  const payload = JSON.parse(input.messages[1].content)
  sent.push({ purpose: input.purpose, payload, format: input.format })
  return JSON.stringify(reply(payload))
}) as never
const keyOf = (payload: any, title: string) => payload.items.find((i: any) => i.title === title)?.key
const gKey = (payload: any, name: string) => payload.tags.find((g: any) => g.name === name)?.key

// 새 할 일 경로: ① 사전 → ② 나머지만 AI(용도 tag, 본문·날짜 없음), 새 이름은 후보
{
  reply = (p) => ({ items: [
    { key: keyOf(p, '예비창업패키지 서류 마감'), tags: [], new: [{ name: '예비창업패키지', kind: 'topic', confidence: 88 }] },
    { key: keyOf(p, '예비창업패키지 발표 연습'), tags: [], new: [{ name: '예비창업패키지', kind: 'topic', confidence: 80 }] }
  ] })
  const r = await tagTasks(['a1', 'a2', 'a3', 'a4'], { chat, at: T0 })
  assert.equal(r.applied, 1)
  assert.deepEqual(tagsOf('a1').map((x) => [x.tag_id, x.source, x.state, x.confidence]), [['gp', 'rule', 'accepted', 100]])
  assert.equal(sent.length, 1)
  assert.equal(sent[0].purpose, 'tag')
  assert.deepEqual(sent[0].payload.items.map((i: any) => i.title).sort(), ['예비창업패키지 발표 연습', '예비창업패키지 서류 마감', '오늘 할 일 정리'], '사전으로 붙은 할 일은 AI에 안 보냄')
  assert.equal(sent[0].payload.items.find((i: any) => i.title === '오늘 할 일 정리').list, '', '기본함 이름은 안 보냄')
  assert.ok(!JSON.stringify(sent[0].payload).includes('content') && !JSON.stringify(sent[0].payload).includes('due'), '본문·날짜는 안 보냄')
  assert.equal(all("SELECT count(*) AS c FROM tags WHERE source = 'ai'")[0].c, 0, '2개 + 88점 → 아직 안 만듦')
  // 같은 제목은 다시 안 물음
  sent.length = 0
  await tagTasks(['a2', 'a3'], { chat, at: T0 })
  assert.equal(sent.length, 0, '이 제목으로 이미 물음')
  // 세 번째 할 일이 나오면 새 태그 자동 생성 + 후보 할 일 전부에
  task('a5', '예비창업패키지 사업계획서 보강', 'lz')
  task('a6', '[[예비창업패키지]] 결과 확인', 'lk')
  reply = (p) => ({ items: [{ key: keyOf(p, '예비창업패키지 사업계획서 보강'), tags: [], new: [{ name: '예비창업패키지', kind: 'topic', confidence: 76 }] }] })
  const r2 = await tagTasks(['a5'], { chat, at: T0 })
  assert.equal(r2.created, 1)
  const made = all("SELECT id, name, kind, source FROM tags WHERE source = 'ai'")
  assert.deepEqual(made, [{ id: aiTagId('예비창업패키지'), name: '예비창업패키지', kind: 'topic', source: 'ai' }])
  for (const id of ['a2', 'a3', 'a5']) assert.deepEqual(tagsOf(id).map((x) => [x.tag_id, ['ai', 'rule'].includes(x.source)]), [[made[0].id, true]], `후보 할 일 ${id}에 자동으로 붙음`)
  assert.equal(tagsOf('a6')[0]?.source, 'rule', '새 태그가 생기면 다른 할 일도 사전으로 다시 훑음')
  assert.equal(autoTagStore.get().created.length, 1, '7일 속도 기록')
}
// AI 실패: 사전 결과는 쓰고 aiError, 그 할 일은 seen 안 됨(나중에 다시)
{
  task('a7', 'SQLD 오답 노트', 'lk')
  task('a8', '대표님 미팅 준비', 'lz')
  fail = new Error('연결할 수 없어요')
  const r = await tagTasks(['a7', 'a8'], { chat, at: T0 })
  fail = null
  assert.ok(r.aiError)
  assert.deepEqual(tagsOf('a7').map((x) => x.tag_id), ['gs'])
  assert.ok(!autoTagStore.get().seen.a8 && autoTagStore.get().seen.a7)
}
// 자동 끔 = 아무것도 안 함
{
  setAutoTagEnabled(false)
  task('a9', 'SQLD 접수', 'lk')
  assert.equal((await tagTasks(['a9'], { chat, at: T0 })).applied, 0)
  setAutoTagEnabled(true)
}
// 태그 새로 생김 → 사전으로 다시 훑기(처음엔 기준만)
{
  assert.equal(await rescanNewTagKeys({ at: T0 }), 0, '처음엔 기준만 잡음')
  task('b1', '면접 질문 정리', 'lk')
  task('b2', '모의 면접 보기', 'lz')
  ins('tags', { id: 'gi', name: '면접', kind: 'topic', sort_order: 3, created_at: T0 })
  assert.equal(await rescanNewTagKeys({ at: T0 }), 2)
  assert.equal(tagsOf('b2')[0].tag_id, 'gi')
  assert.equal(await rescanNewTagKeys({ at: T0 }), 0, '바뀐 것 없으면 아무것도')
}
// 이번 주 요약·되돌리기
{
  const w = await weeklySummary('2026-10-06T00:00:00.000Z')
  assert.ok(w.count >= 7 && w.createdTags === 1, JSON.stringify(w))
  const s = await autoTag().summary('2026-10-06T00:00:00.000Z')
  assert.equal(s.lastRun, undefined, '일괄 전엔 lastRun 없음')
  const u = await undoWeek('2026-10-06T00:00:00.000Z')
  assert.equal(u.tags, 1, 'AI가 만든 태그(사람 연결 없음)는 지움')
  assert.equal(all("SELECT count(*) AS c FROM tags WHERE source = 'ai'")[0].c, 0)
  assert.equal(tagsOf('a1')[0].state, 'dismissed', '나머지 자동 연결은 dismissed')
  assert.ok(autoTagStore.get().blocked[tagKey('예비창업패키지')], '지운 이름은 다시 안 만듦')
  assert.equal((await weeklySummary('2026-10-06T00:00:00.000Z')).count, 0)
  assert.equal(all(`SELECT count(*) AS c FROM task_tags tt WHERE ${TAG_ACCEPTED} AND task_id = 'a1'`)[0].c, 0)
}

// 일괄: 처음 한 번 — 사전 전부 → AI 25개씩 → 하루 상한이면 다음 날 → 끝에 새 태그(4개 이상) → 24시간 되돌리기
{
  db.run('DELETE FROM task_tags'); db.run("DELETE FROM tasks"); autoTagStore.reset(); sent.length = 0
  setAutoTagPerson(true)
  for (let i = 0; i < 30; i++) task(`c${i}`, i < 5 ? `LangGraph 예제 ${i}` : i < 8 ? `지도교수님 면담 ${i}` : `할 일 ${i}번`, 'lk')
  task('old', 'LangGraph 옛날 일', 'lk', { status: 1, completed_at: '2026-01-01T00:00:00.000Z' })
  task('recent', 'LangGraph 최근 끝낸 일', 'lk', { status: 1, completed_at: '2026-09-20T00:00:00.000Z' })
  task('gone', 'LangGraph 지운 일', 'lk', { deleted_at: T0 })
  let calls = 0
  reply = (p) => {
    calls++
    return { items: p.items.filter((i: any) => i.title.startsWith('LangGraph')).map((i: any) => ({ key: i.key, tags: [], new: [{ name: 'LangGraph', kind: 'topic', confidence: 90 }] })) }
  }
  let clock = '2026-10-05T10:00:00.000Z'
  fail = null
  // 첫 묶음 뒤 하루 상한
  let n = 0
  const capChat = (async (input: any, signal: AbortSignal) => { if (++n === 2) throw new Error('오늘은 이 AI 기능을 다 썼어요. 내일 다시 쓸 수 있어요.'); return (chat as any)(input, signal) }) as never
  let b = await runBackfill({ signal: new AbortController().signal, chat: capChat, gapMs: 0, at: () => clock })
  assert.equal(b.state, 'paused')
  assert.equal(b.resumeAfter, _test.nextDay(clock))
  assert.deepEqual(tagsOf('c5').map((x) => [x.tag_id, x.source]), [['gp', 'rule']], '사전 검사는 처음에 전부(별칭 지도교수님)')
  assert.ok(tagsOf('c5')[0].run_id?.startsWith('tagrun-'))
  assert.equal(b.total, 28, '열린 것 + 최근 90일 완료, 사전으로 붙은 것 빼고(지운 것·오래된 완료 제외)')
  assert.equal(b.queue!.length, 3, '25개 물음')
  assert.equal((await runBackfill({ signal: new AbortController().signal, chat, gapMs: 0, at: () => clock })).state, 'paused', '다음 날 전엔 그대로')
  clock = '2026-10-06T09:00:00.000Z'
  b = await runBackfill({ signal: new AbortController().signal, chat, gapMs: 0, at: () => clock })
  assert.equal(b.state, 'done')
  const lg = all("SELECT id, name, run_id FROM tags WHERE source = 'ai'")
  assert.equal(lg.length, 1, 'LangGraph 후보 5개(≥4) → 끝에 한 번 만듦')
  assert.equal(lg[0].run_id, b.runId)
  for (const id of ['c0', 'c4', 'recent']) assert.equal(tagsOf(id)[0]?.tag_id, lg[0].id, `${id}에 붙음`)
  assert.equal(tagsOf('old').length, 0)
  assert.ok(canUndoBackfill('2026-10-07T08:00:00.000Z'))
  assert.ok(!canUndoBackfill('2026-10-07T10:00:00.000Z'), '24시간 뒤엔 안 됨')
  const api = await autoTag().summary('2026-10-06T10:00:00.000Z') // 고정 시계(실제 시계면 24시간 지나 lastRun이 사라짐)
  assert.equal(api.lastRun?.id, b.runId)
  // 사용자가 하나는 직접 켬(손댄 것은 남는다)
  db.run("UPDATE task_tags SET source = 'user' WHERE task_id = 'c0'")
  const u = await undoBackfill('2026-10-06T10:00:00.000Z')
  assert.equal(tagsOf('c5').length, 0)
  assert.equal(tagsOf('c0').length, 1, '손댄 것은 남김')
  assert.equal(u.tags, 0, '사용자가 쓰는 태그는 안 지움')
  assert.equal(autoTagStore.get().backfill.state, 'undone')
  assert.equal((await runBackfill({ signal: new AbortController().signal, chat, gapMs: 0, at: () => clock })).state, 'undone', '되돌린 뒤엔 다시 안 함')
  assert.ok(calls >= 2)
}
// 일괄 멈추기(abort) → paused, 다시 부르면 이어 감
{
  db.run('DELETE FROM task_tags'); db.run("DELETE FROM tags WHERE source = 'ai'"); autoTagStore.reset()
  const ac = new AbortController()
  reply = () => { ac.abort(); return { items: [] } }
  const b = await runBackfill({ signal: ac.signal, chat, gapMs: 0, at: () => '2026-10-08T00:00:00.000Z' })
  assert.equal(b.state, 'paused')
  reply = () => ({ items: [] })
  assert.equal((await runBackfill({ signal: new AbortController().signal, chat, gapMs: 0, at: () => '2026-10-08T00:00:00.000Z' })).state, 'done')
}
assert.ok(_test.isDailyCap(new Error('오늘 AI 사용 한도를 다 썼어요. 내일 다시 시도해 주세요.')))
assert.ok(!_test.isDailyCap(new Error('AI 요청이 너무 잦아요.')))
void ({} as Assign)
console.log('autotag: ok')
