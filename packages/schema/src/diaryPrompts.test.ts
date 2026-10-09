// 28 §8 대화 → 일기 옮기기: 지시문 규칙·답 해석·여러 편 이어 붙이기 시험
import assert from 'node:assert/strict'
import {
  appendSection, chatSystem, COMPANION_RULES, DIARY_GROUNDING, DISTILL_SYSTEM, distillInput, distillMessages, firstLineOf, formatSection,
  normalizeTag, parseDistill, parseSections, transcriptOf, wantsTranscript
} from './diaryPrompts.ts'

// ── 지시문: 스킬의 대화 원칙 ──
for (const must of ['그 말 그대로', '보고서', '상황 요약 → 판단 → 액션', 'P0', '묻지 않으면 조언하지 마', '형식적', '조언을 바로 멈춰', '반말']) assert.ok(COMPANION_RULES.includes(must), `대화 규칙에 "${must}"`)
for (const must of ['<diary>', '지어내', '짐작', '물어봐', '예시']) assert.ok(DIARY_GROUNDING.includes(must), `들은 말만 규칙에 "${must}"`)
const sys = chatSystem({ name: '느리', tone: '느긋한 말투', date: '2026-10-09', diary: '오늘은 산책했다.' })
assert.ok(sys.includes('"느리"') && sys.includes(COMPANION_RULES) && sys.includes(DIARY_GROUNDING) && sys.includes('<diary>\n오늘은 산책했다.\n</diary>'))
assert.ok(!chatSystem({ name: '퐁', tone: 't', date: 'd' }).includes('<diary>\n'))
// ── 지시문: 옮기기(지어내지 않기·캐릭터 말 빼기·내 생각으로·살리기·제목·태그) ──
for (const must of ['"~요"로 끝나는 존댓말은 쓰지 마', '1인칭', '사용자(나)가 말한 사실', '지어내지 마', '캐릭터의 말·공감·조언·위로', '이야기하면서 정리된 생각은', '특징 있는 표현은 살리고', '뭉뚱그린 요약', '#감정/', '#사건/', '#영역/', 'JSON']) assert.ok(DISTILL_SYSTEM.includes(must), `옮기기 지시에 "${must}"`)
const lines = [{ who: 'me' as const, text: '시험이 코앞인데 손에 안 잡혀' }, { who: 'buddy' as const, text: '코앞이라 더 무겁겠다' }, { who: 'me' as const, text: '  ' }]
const input = distillInput(lines, { date: '2026-10-09', mood: '별로였어요' })
assert.equal(input, '2026-10-09 대화야. 내가 고른 오늘 기분: 별로였다.\n<conversation>\n나: 시험이 코앞인데 손에 안 잡혀\n</conversation>', '캐릭터 말은 물음만')
assert.equal(distillInput([{ who: 'buddy', text: '저녁이네. 오늘 할 일 5개 중 4개 끝냈네! 어땠어?' }, { who: 'me', text: '별로' }], { date: 'd' }), 'd 대화야.\n<conversation>\n캐릭터: 어땠어?\n나: 별로\n</conversation>', '캐릭터가 말한 사실(할 일 개수)은 빠짐')
assert.equal(distillMessages(lines, { date: 'd' })[0].content, DISTILL_SYSTEM)

// ── 답 해석 ──
assert.deepEqual(parseDistill('{"title":"시험 앞에서 멈춘 하루","tags":["#감정/불안","사건/시험","#영역 / 공부","#기분/나쁨","#감정/불안"],"entry":"시험이 코앞인데 손에 안 잡혔다."}'),
  { title: '시험 앞에서 멈춘 하루', tags: ['#감정/불안', '#사건/시험', '#영역/공부'], entry: '시험이 코앞인데 손에 안 잡혔다.' })
assert.equal(parseDistill('```json\n{"title":"t","tags":[],"entry":"본문"}\n```')!.entry, '본문')
assert.equal(parseDistill('설명: {"title":"t","tags":"x","entry":"나: 본문"}')!.entry, '본문', '나: 접두 제거 · 태그가 배열 아니면 빈 배열')
assert.equal(parseDistill('{"title":"t","tags":[],"entry":"  "}'), null)
assert.equal(parseDistill('{"title":"t","tags":[],"entry":"2026 년 10 월 9 일, 자기 전에 산책을 20 분 했다."}')!.entry, '자기 전에 산책을 20 분 했다.', '입력 머리의 날짜는 본문에서 뺀다')
assert.equal(parseDistill('{"title":"t","tags":[],"entry":"너무 지쳤다. 그저 캐릭터의 위로와 함께 있었다. 내일은 한 챕터만 보자."}')!.entry, '너무 지쳤다. 내일은 한 챕터만 보자.', '캐릭터 문장은 뺀다')
assert.equal(parseDistill('그냥 문장'), null)
assert.equal(parseDistill('{broken'), null)
assert.equal(normalizeTag('감정/불안'), '#감정/불안')
assert.equal(normalizeTag('#영역/일'), '#영역/일')
assert.equal(normalizeTag('#프로젝트/x'), null)
assert.equal(normalizeTag('#감정/'), null)

// ── 대화 그대로 저장(부탁할 때만) ──
assert.ok(wantsTranscript('대화 그대로 저장해 줘'))
assert.ok(wantsTranscript('너 답변도 같이 저장해'))
assert.ok(!wantsTranscript('오늘 대화 즐거웠어'))
assert.equal(transcriptOf(lines, '느리'), '나: 시험이 코앞인데 손에 안 잡혀\n느리: 코앞이라 더 무겁겠다')

// ── 하루 여러 편: 이어 붙이고 앞 편은 그대로 ──
const first = { time: '09:10', title: '아침 산책', tags: ['#감정/회복', '#영역/건강'], body: '아침에 산책했다.\n\n기분이 좀 나아졌다.' }
const s1 = formatSection(first)
assert.equal(s1, '## 09:10 — 아침 산책\n#감정/회복 #영역/건강\n\n아침에 산책했다.\n\n기분이 좀 나아졌다.')
const both = appendSection(s1, { time: '21:40', title: '시험 앞에서 멈춘 하루', tags: ['#감정/불안'], body: '손에 안 잡혔다.' })
assert.ok(both.startsWith(s1), '앞 편을 덮지 않는다')
assert.deepEqual(parseSections(both), [first, { time: '21:40', title: '시험 앞에서 멈춘 하루', tags: ['#감정/불안'], body: '손에 안 잡혔다.' }])
// 예전 글(머리 없음) 뒤에 붙여도 예전 글은 머리 없는 첫 편
const legacy = appendSection('예전에 쓴 글.', { time: '22:00', title: '', tags: [], body: '새 글.' })
assert.equal(legacy, '예전에 쓴 글.\n\n## 22:00\n\n새 글.')
assert.deepEqual(parseSections(legacy), [{ time: null, title: '', tags: [], body: '예전에 쓴 글.' }, { time: '22:00', title: '', tags: [], body: '새 글.' }])
assert.deepEqual(parseSections(''), [])
assert.equal(appendSection('', { time: '08:00', title: 't', tags: [], body: 'b' }), '## 08:00 — t\n\nb')
// 본문 첫 줄이 #으로 시작해도 태그 꼴이 아니면 본문
assert.equal(parseSections('## 10:00 — x\n#해시태그같은 말\n본문')[0].body, '#해시태그같은 말\n본문')
assert.equal(firstLineOf(both), '아침 산책')
assert.equal(firstLineOf('그냥 글\n둘째 줄'), '그냥 글')

console.log('diaryPrompts ok')
