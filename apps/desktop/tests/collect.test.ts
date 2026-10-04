// 11 수집함 v3: 카톡 파싱·중복·AI 응답 검증·위키 반영
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { dateRef, fingerprint, fixWeekday, hasDateWords, isBareLink, parseClassified, parseKakao, type ClassifyItem } from '../src/shared/collect'
import { applyToWiki, contentOf, editSection, importKakao, lockedOf, registerSuggestion, saveItem, setKind, type CollectItem, type WikiTopic } from '../src/renderer/src/data/collect'
import { insert, run } from '../src/renderer/src/data/mutations'
const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql:string, params:unknown[]=[]) => {const s=db.prepare(sql);s.bind(params as never);const r:Record<string,unknown>[]=[];while(s.step())r.push(s.getAsObject());s.free();return r}
Object.assign(globalThis,{window:{sprout:{db:{getAll:async(sql:string,p?:unknown[])=>all(sql,p),get:async(sql:string,p?:unknown[])=>all(sql,p)[0]??null,transaction:async(stmts:{sql:string;params?:unknown[]}[])=>{db.run('BEGIN');try{for(const s of stmts)db.run(s.sql,s.params as never);db.run('COMMIT')}catch(e){db.run('ROLLBACK');throw e}}}}}})
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString()

// ── 카톡 파싱: PC ──
const pc = parseKakao(`﻿홍길동 님과 카카오톡 대화
저장한 날짜 : 2026-10-04 15:30:00

--------------- 2026년 10월 2일 금요일 ---------------
[홍길동] [오후 3:12] 내일 3시 치과
[홍길동] [오전 12:05] 자정 메모
[홍길동] [오후 12:30] 점심 메모
[홍길동] [오후 4:00] 첫 줄
둘째 줄
[홍길동] [오후 4:01] 사진
[홍길동] [오후 4:02] 이모티콘
[홍길동] [오후 4:03] 파일: 보고서.pdf
[홍길동] [오후 4:04] https://youtu.be/abc
`)
assert.equal(pc.messages.length, 5)
assert.equal(pc.skipped, 3)
assert.equal(pc.links, 1)
assert.deepEqual(pc.messages[0], { at: at(2026, 10, 2, 15, 12), author: '홍길동', text: '내일 3시 치과', fingerprint: pc.messages[0].fingerprint })
assert.equal(pc.messages[1].at, at(2026, 10, 2, 0, 5), '오전 12시 = 0시')
assert.equal(pc.messages[2].at, at(2026, 10, 2, 12, 30), '오후 12시 = 12시')
assert.equal(pc.messages[3].text, '첫 줄\n둘째 줄', '여러 줄 메시지는 이어 붙인다')
assert.equal(pc.from, at(2026, 10, 2, 0, 5))
assert.equal(pc.to, at(2026, 10, 2, 16, 4))

// ── iOS · 안드로이드 · macOS CSV ──
const ios = parseKakao(`2026. 10. 3. 오후 3:12, 홍길동 : iOS 메시지
이어지는 줄
2026. 10. 3. 오후 3:13: 김철수님이 들어왔습니다.
2026. 10. 3. 오후 3:14, 홍길동 : 사진 2장`)
assert.deepEqual(ios.messages.map((m) => [m.at, m.text]), [[at(2026, 10, 3, 15, 12), 'iOS 메시지\n이어지는 줄']])
assert.equal(ios.skipped, 1)
const android = parseKakao(`2026년 10월 3일 토요일
2026년 10월 3일 오전 9:05, 홍길동 : 안드로이드 메시지
2026년 10월 3일 오전 12:00, 홍길동 : 자정`)
assert.deepEqual(android.messages.map((m) => [m.at, m.text]), [[at(2026, 10, 3, 9, 5), '안드로이드 메시지'], [at(2026, 10, 3, 0, 0), '자정']])
const csv = parseKakao('Date,User,Message\r\n2026-10-03 21:40:00,"홍길동","CSV ""따옴표""\n여러 줄"\r\n2026-10-03 21:41:00,"홍길동","이모티콘"\r\n')
assert.deepEqual(csv.messages.map((m) => [m.at, m.text]), [[at(2026, 10, 3, 21, 40), 'CSV "따옴표"\n여러 줄']])
assert.equal(csv.skipped, 1)
assert.equal(parseKakao('그냥 글\n아무 형식 아님').messages.length, 0)
assert.equal(fingerprint('a'), fingerprint('a'))
assert.notEqual(fingerprint('a'), fingerprint('b'))

// ── 링크만 있는 글 ──
assert.equal(isBareLink('https://youtu.be/abc'), true)
assert.equal(isBareLink('파이썬 비동기 정리 https://youtu.be/abc'), true)
assert.equal(isBareLink('이 영상 보고 금요일까지 요약 https://youtu.be/abc'), false)
assert.equal(isBareLink('내일 3시 치과'), false)

// ── 가져오기: 원래 시각 유지 · 두 번 올려도 중복 없음 · 같은 파일 안 같은 메시지도 한 번 ──
const dup = parseKakao(`--------------- 2026년 10월 2일 금요일 ---------------
[홍길동] [오후 3:12] 내일 3시 치과
[홍길동] [오후 3:12] 내일 3시 치과`)
assert.equal(dup.messages.length, 2)
assert.equal(await importKakao([...pc.messages, ...dup.messages]), 5)
assert.equal(await importKakao(pc.messages), 0)
assert.equal(all("SELECT COUNT(*) AS n FROM notes WHERE source='kakao_import'")[0].n, 5)
const imported = all("SELECT * FROM notes WHERE content='내일 3시 치과'")[0]
assert.equal(imported.created_at, at(2026, 10, 2, 15, 12))
assert.equal(imported.captured_at, at(2026, 10, 2, 15, 12))
assert.equal(imported.ai_state, 'pending')
const link = all("SELECT * FROM notes WHERE content='https://youtu.be/abc'")[0]
assert.deepEqual([link.kind, link.ai_state, link.url], ['link', 'done', 'https://youtu.be/abc'])

// ── AI 응답 검증 ──
const items: ClassifyItem[] = [{ id: 'a', text: '내일 3시 치과', sent: '' }, { id: 'b', text: 'RAG', sent: '' }, { id: 'c', text: '고정', sent: '', fixedKind: 'memo' }]
assert.throws(() => parseClassified('not json', items, ['l1']), /형식/)
const base = { title: '', start: '', due: '', listId: '', topic: '', section: 'key', point: '', overview: '', related: [] }
const out = parseClassified('```json\n' + JSON.stringify({ items: [
  { ...base, id: 'a', kind: 'task', title: '치과', due: '2026-10-05T15:00', listId: 'nope' },
  { ...base, id: 'a', kind: 'memo' },
  { ...base, id: 'b', kind: 'wiki', topic: 'LLM 공부', section: 'bad', point: '청크는 512~1024', related: ['x', 3] },
  { ...base, id: 'c', kind: 'task' },
  { ...base, id: 'zzz', kind: 'memo' },
  { ...base, id: 'b', kind: 'weird' }
] }) + '\n```', items, ['l1'])
assert.deepEqual(out.map((c) => [c.id, c.kind]), [['a', 'task'], ['b', 'wiki'], ['c', 'memo']])
assert.equal(out[0].due, '2026-10-05T15:00')
assert.equal(out[0].listId, '')
assert.equal(out[1].section, 'key')
assert.deepEqual(out[1].related, ['x'])
const dates = parseClassified(JSON.stringify({ items: [
  { ...base, id: 'a', kind: 'task', due: '2026-02-30' },
  { ...base, id: 'b', kind: 'task', start: '2026-10-05T15:00', due: '' }
] }), [items[0], { id: 'b', text: '월요일 3시 회의', sent: '' }], [])
assert.deepEqual(dates.map((c) => [c.start, c.due]), [['', ''], ['', '2026-10-05T15:00']])

// 서버가 스키마를 강제하지 못할 때(Ollama think=false) 작은 모델이 내는 모양: 맨 배열·빠진 칸·앞뒤 설명 글
const bare = parseClassified('[{"id":"a","kind":"task","title":"치과","due":"2026-10-05T15:00"},{"id":"b","kind":"wiki","topic":"LLM"}]', items, [])
assert.deepEqual(bare.map((c) => [c.id, c.kind, c.due, c.topic, c.section]), [['a', 'task', '2026-10-05T15:00', '', 'key'], ['b', 'wiki', '', 'LLM', 'key']])
assert.deepEqual(parseClassified('결과입니다:\n{"results":[{"id":"a","kind":"memo"}]}\n끝', items, []).map((c) => c.kind), ['memo'])
assert.deepEqual(parseClassified('{"id":"b","kind":"memo"}', items, []).map((c) => c.id), ['b'])
// 날짜 말이 없는 글에 모델이 지어낸 날짜는 버린다
const invented = parseClassified('[{"id":"x","kind":"task","title":"수요 조사","due":"2026-09-30T10:00"}]', [{ id: 'x', text: '카페 창업 아이디어: 수요 조사하기', sent: '' }], [])
assert.equal(invented[0].due, '')
assert.equal(hasDateWords('다음주 월요일 10시 팀 회의'), true)
assert.equal(hasDateWords('카페 창업 아이디어'), false)
// 요일 말은 앱이 날짜를 정한다(보낸 시각 기준, 주는 월요일 시작)
const sentFri = new Date(2026, 9, 2, 15, 12).toISOString() // 2026-10-02 금
const sentSat = new Date(2026, 9, 3, 9, 30).toISOString() // 2026-10-03 토
assert.equal(fixWeekday('금요일까지 운영체제 과제 제출', '2026-10-04T23:59', sentFri), '2026-10-02T23:59')
assert.equal(fixWeekday('다음주 월요일 10시 팀 회의', '2026-10-12T10:00', sentSat), '2026-10-05T10:00')
assert.equal(fixWeekday('이번 주 수요일 보고', '2026-10-07', sentSat), '2026-09-30')
assert.equal(fixWeekday('월요일이랑 화요일', '2026-10-07', sentSat), '2026-10-07') // 요일이 둘이면 손대지 않는다
const fri = parseClassified('[{"id":"k","kind":"task","title":"과제","due":"2026-10-04T23:59"}]', [{ id: 'k', text: '금요일까지 과제', sent: '', sentIso: sentFri }], [])
assert.equal(fri[0].due, '2026-10-02T23:59')
const ref = dateRef(sentSat)
assert.equal(ref['내일'], '2026-10-04 일')
assert.ok(ref['다음 주'].startsWith('월 2026-10-05'))

// ── 위키 반영 ──
const n1 = await saveItem('RAG 청크는 512~1024 토큰')
const n2 = await saveItem('LangGraph는 상태 그래프')
const n3 = await saveItem('평가셋 없이 프롬프트를 고치면 알 수 없다')
const note = (id: string) => all('SELECT * FROM notes WHERE id=?', [id])[0] as unknown as CollectItem
const topicByName = (name: string) => all('SELECT * FROM wiki_topics WHERE name=?', [name])[0] as unknown as WikiTopic
const wiki = { topic: 'LLM 공부', section: 'key' as const, point: '청크는 512~1024 토큰이 무난하다', overview: 'LLM을 공부하며 모은 것', related: [] }
const topicId = await applyToWiki(note(n1), wiki)
let topic = topicByName('LLM 공부')
assert.equal(topic.id, topicId)
assert.equal(topic.version, 1)
assert.equal(contentOf(topic).sections.overview[0].text, 'LLM을 공부하며 모은 것')
assert.deepEqual(contentOf(topic).sections.key.map((l) => [l.text, l.src]), [['청크는 512~1024 토큰이 무난하다', n1]])
assert.deepEqual([note(n1).topic_id, note(n1).kind, note(n1).ai_state], [topicId, 'wiki', 'done'])
assert.equal(all('SELECT COUNT(*) AS n FROM wiki_versions WHERE topic_id=?', [topicId])[0].n, 1)
// 같은 자료를 다시 정리하면 줄을 바꿔 끼운다(이름은 띄어쓰기·대소문자 무시)
await applyToWiki(note(n1), { ...wiki, topic: 'llm공부', point: '청크는 겹침 10%', overview: '' })
topic = topicByName('LLM 공부')
assert.deepEqual(contentOf(topic).sections.key.map((l) => l.text), ['청크는 겹침 10%'])
assert.equal(contentOf(topic).sections.overview.length, 1)
assert.equal(all('SELECT COUNT(*) AS n FROM wiki_topics')[0].n, 1)
await applyToWiki(note(n2), { ...wiki, point: 'LangGraph는 상태 그래프로 흐름을 짠다', overview: '' })
// 직접 고친 구역은 덮어쓰지 않고 제안으로
topic = topicByName('LLM 공부')
await editSection(topic, 'key', '- 청크는 겹침 10%\n내가 쓴 줄')
topic = topicByName('LLM 공부')
assert.deepEqual(lockedOf(topic), ['key'])
assert.deepEqual(contentOf(topic).sections.key.map((l) => [l.text, l.by, l.src ?? null]), [['청크는 겹침 10%', 'ai', n1], ['내가 쓴 줄', 'user', null]])
await applyToWiki(note(n3), { ...wiki, point: '평가셋이 먼저다', overview: '' })
topic = topicByName('LLM 공부')
assert.deepEqual(contentOf(topic).sections.key.map((l) => l.text), ['청크는 겹침 10%', '내가 쓴 줄'])
assert.deepEqual(contentOf(topic).suggestions.map((s) => [s.text, s.section, s.src]), [['평가셋이 먼저다', 'key', n3]])
// 위키에서 다른 종류로 바꾸면 그 자료의 AI 줄은 빠진다(직접 쓴 줄은 남는다)
await setKind(note(n1), 'memo')
topic = topicByName('LLM 공부')
assert.deepEqual(contentOf(topic).sections.key.map((l) => l.text), ['내가 쓴 줄'])
assert.equal(contentOf(topic).sections.overview.length, 0, '개요 줄도 그 자료 것이면 빠진다')
assert.deepEqual([note(n1).kind, note(n1).kind_source, note(n1).topic_id], ['memo', 'user', null])
await setKind(note(n3), 'link')
assert.equal(contentOf(topicByName('LLM 공부')).suggestions.length, 0)

// ── 할 일 제안 등록 = v2 전환과 같은 경로(중복 없음) ──
await run(insert('lists', { id: 'inbox', name: '기본함', kind: 'inbox', sort_order: 0 }))
const t1 = await saveItem('내일 3시 치과')
await run({ sql: 'UPDATE notes SET kind=?, suggestion=? WHERE id=?', params: ['task', JSON.stringify({ title: '치과', start: '', due: '2026-10-05T15:00', listId: '' }), t1] })
const taskId = await registerSuggestion(note(t1), [{ id: 'inbox', kind: 'inbox' }])
assert.equal(await registerSuggestion(note(t1), [{ id: 'inbox', kind: 'inbox' }]), taskId)
assert.deepEqual(all('SELECT title, due_at, list_id, is_all_day FROM tasks')[0], { title: '치과', due_at: '2026-10-05T15:00', list_id: 'inbox', is_all_day: 0 })
console.log('collect tests passed')
