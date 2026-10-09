// 28 §8 대화로 쓰기 — 정해진 말·초안·되살리기 시험
import assert from 'node:assert/strict'
import { buildBuddyMessages, josa } from './logic.ts'
import {
  composeDraft, DRAFT_LINE, DRAFT_LINE_EMPTY, endLine, greetingOf, introLine, isSkip, moodShort, NOTHING, nextLines, questionOf, REACT, REACT_TEXT,
  replay, SCRIPTED, SKIP, timeOfDay, warmLineOf, weekLineOf, type DayStats,
  asksDistill, BYE_ME, chatTurns, clock, isWarm, MORE_LINE, nudgeOf, OPEN_LINE, ownWords, sessionOf
} from './talk.ts'

const stats: DayStats = { total: 5, done: 4, doneTitles: ['기획서 초안 1~3장', '디자인 리뷰 답장', '택배 반품'], nextTitles: ['면담 자료 한 장 정리', '치과 예약 전화'] }
const T = '2026-10-09'

// ── 시간대·인사 ──
assert.equal(timeOfDay(8), 'morning')
assert.equal(timeOfDay(12), 'day')
assert.equal(timeOfDay(19), 'evening')
assert.equal(timeOfDay(23), 'night')
assert.equal(timeOfDay(2), 'night')
assert.equal(greetingOf({ date: T, today: T, hour: 21, stats }), '저녁이네. 오늘 할 일 5개 중 4개 끝냈네! 어땠어?')
assert.equal(greetingOf({ date: T, today: T, hour: 21, stats: { ...stats, done: 5 } }), '저녁이네. 오늘 할 일 5개 다 끝냈어! 어땠어?')
assert.equal(greetingOf({ date: T, today: T, hour: 21, stats: { ...stats, done: 0 } }), '저녁이네. 오늘 할 일이 5개 있었네. 어떤 하루였어?', '하나도 못 끝낸 날은 0개라고 세지 않는다')
assert.equal(greetingOf({ date: T, today: T, hour: 13, stats: { ...stats, total: 0, done: 0 } }), '점심은 먹었어? 오늘은 할 일 없이 지나갔네. 어떤 하루였어?')
assert.equal(greetingOf({ date: T, today: T, hour: 8, stats }), '좋은 아침! 오늘 할 일이 5개 있어. 지금 기분은 어때?')
assert.equal(greetingOf({ date: T, today: T, hour: 8, stats: { ...stats, total: 0 } }), '좋은 아침! 오늘 기분부터 적어 둘까?')
assert.equal(greetingOf({ date: T, today: T, hour: 23, stats }).startsWith('늦게까지 수고했어.'), true)
assert.equal(greetingOf({ date: '2026-10-04', today: T, hour: 21, stats: { ...stats, total: 1, done: 1 } }), '10월 4일 이야기구나. 그날 할 일 1개 중 1개 끝냈더라. 그날은 어땠어?')
assert.equal(greetingOf({ date: '2026-10-03', today: T, hour: 21, stats: { ...stats, total: 0 } }), '10월 3일 이야기구나. 그날은 어땠어?')
assert.equal(greetingOf({ date: '2026-10-03', today: T, hour: 21, stats: { ...stats, total: 2, done: 0 } }), '10월 3일 이야기구나. 그날 할 일이 2개 있었더라. 그날은 어땠어?')
// 정원 친구 4종 이름·조사(40 §3.5, 28 §8.8)
assert.equal(introLine('느리'), '안녕, 나는 느리야. 오늘 하루를 편하게 이야기해 줘. 같이 일기로 남겨 줄게.')
assert.ok(introLine('퐁').includes('나는 퐁이야.'))
assert.ok(introLine('꿈틀').includes('나는 꿈틀이야.'))
assert.ok(introLine('모아').includes('나는 모아야.'))
assert.equal(josa('퐁', '와', '과'), '퐁과')
assert.equal(josa('모아', '가', '이'), '모아가')
assert.equal(moodShort(1), '힘들')
assert.equal(moodShort(3), '그저 그래')
assert.equal(moodShort(5), '최고')

// ── 질문·칩 ──
assert.deepEqual(questionOf('q1', { mood: 4, past: false, stats }), { q: '제일 좋았던 순간은 뭐였어?', chips: ['기획서 초안 1~3장 끝냄', '디자인 리뷰 답장 끝냄', '산책했어'] })
assert.deepEqual(questionOf('q1', { mood: 2, past: false, stats }).chips, ['일이 많았어', '사람 때문에', '몸이 안 좋았어'])
assert.equal(questionOf('q1', { mood: null, past: false, stats }).q, '제일 좋았던 순간은 뭐였어?')
assert.deepEqual(questionOf('q2', { mood: 5, past: false, stats }), { q: '힘들었던 건 없었어?', chips: [NOTHING] })
assert.equal(questionOf('q2', { mood: 1, past: false, stats }).q, '그래도 괜찮았던 거 하나만 꼽자면?')
assert.deepEqual(questionOf('q3', { mood: 4, past: false, stats }), { q: '내일 하나만 정한다면 뭐 할래?', chips: ['면담 자료 한 장 정리', '치과 예약 전화', '일찍 자기'] })
assert.deepEqual(questionOf('q3', { mood: 4, past: true, stats }), { q: '그다음 날 하고 싶었던 건 뭐였어?', chips: ['일찍 자기'] })
assert.equal(questionOf('q1', { mood: 4, past: false, stats: { ...stats, doneTitles: ['아주아주 긴 할 일 제목이라서 칩에 다 들어가지 않는 경우'] } }).chips[0].length <= 27, true)

// ── 초안: 내 말 그대로, 건너뛴 답은 빠짐, 앱이 넣는 말은 "내일은 "과 마침표뿐 ──
assert.equal(endLine('산책했어'), '산책했어.')
assert.equal(endLine('좋았다'), '좋았다')
assert.equal(endLine('정말?'), '정말?')
assert.equal(isSkip(SKIP) && isSkip(NOTHING) && !isSkip('산책'), true)
const answers = { mood: 4, lead: null, q1: '기획서 초안 1~3장 끝냄', q2: '차별점에서 한참 막혔는데 저녁 먹고 산책하고 나니 좀 정리됐어', q3: '면담 자료 한 장 정리' }
assert.equal(composeDraft(answers), '기획서 초안 1~3장 끝냄.\n차별점에서 한참 막혔는데 저녁 먹고 산책하고 나니 좀 정리됐어.\n내일은 면담 자료 한 장 정리.')
assert.equal(composeDraft({ ...answers, q2: NOTHING }), '기획서 초안 1~3장 끝냄.\n내일은 면담 자료 한 장 정리.')
assert.equal(composeDraft({ ...answers, q3: '내일은 일찍 자기' }).split('\n').at(-1), '내일은 일찍 자기.', '"내일은"을 두 번 붙이지 않는다')
assert.equal(composeDraft({ ...answers, q3: '일찍 자기' }, { past: true }).split('\n').at(-1), '다음 날은 일찍 자기.')
assert.equal(composeDraft({ mood: 3, lead: null, q1: SKIP, q2: SKIP, q3: SKIP }), '')
assert.equal(composeDraft({ mood: null, lead: '그냥 피곤한 하루', q1: SKIP, q2: SKIP, q3: SKIP }), '그냥 피곤한 하루.')
// 직접 쓴 답이 글자 그대로 들어간다(앞뒤 공백만 정리)
const typed = '  오늘은 ㅋㅋ 진짜 별일 없었음  '
assert.ok(composeDraft({ ...answers, q1: typed }).includes('오늘은 ㅋㅋ 진짜 별일 없었음.'))

// ── 되살리기(앱을 다시 열어도 그날 대화에서 단계·초안을 다시 만든다) ──
assert.deepEqual(replay([]), { answers: { mood: null, lead: null }, step: 'mood', count: 0 })
assert.equal(replay(['좋았어요']).step, 'q1')
assert.equal(replay(['좋았어요']).answers.mood, 4)
assert.equal(replay(['그냥 그랬음']).answers.lead, '그냥 그랬음')
assert.equal(replay(['그냥 그랬음']).answers.mood, null)
assert.equal(replay(['좋았어요', 'a']).step, 'q2')
assert.equal(replay(['좋았어요', 'a', 'b']).step, 'q3')
const done = replay(['좋았어요', answers.q1, answers.q2, answers.q3])
assert.equal(done.step, 'draft')
assert.deepEqual(done.answers, answers)

// ── 다음 정해진 행: 기분 → 반응 + 질문 1 / 질문 → 다음 질문 / 질문 3 → 초안 한 줄 ──
const base = { date: T, today: T, hour: 21, stats, name: '느리', intro: false }
let lines = nextLines({ ...base, mine: [], answer: { mood: 4 } })
assert.deepEqual(lines, [
  { role: 'buddy', content: '저녁이네. 오늘 할 일 5개 중 4개 끝냈네! 어땠어?' },
  { role: 'me', content: '좋았어요' },
  { role: 'buddy', content: REACT[4] },
  { role: 'buddy', content: '제일 좋았던 순간은 뭐였어?' }
])
assert.equal(nextLines({ ...base, intro: true, mine: [], answer: { mood: 1 } })[0].content, introLine('느리'))
assert.equal(nextLines({ ...base, mine: [], answer: { mood: 1 } }).at(-1)!.content, '뭐가 제일 마음에 걸렸어?')
lines = nextLines({ ...base, mine: [], answer: { text: '피곤했어' } })
assert.deepEqual(lines.slice(1), [{ role: 'me', content: '피곤했어' }, { role: 'buddy', content: REACT_TEXT }, { role: 'buddy', content: '제일 좋았던 순간은 뭐였어?' }])
assert.deepEqual(nextLines({ ...base, mine: [], answer: {} }), [])
assert.deepEqual(nextLines({ ...base, mine: ['좋았어요'], answer: { text: '  ' } }), [])
assert.deepEqual(nextLines({ ...base, mine: ['좋았어요'], answer: { text: '산책했어' } }), [{ role: 'me', content: '산책했어' }, { role: 'buddy', content: '힘들었던 건 없었어?' }])
assert.deepEqual(nextLines({ ...base, mine: ['좋았어요', 'a'], answer: { text: NOTHING } }), [{ role: 'me', content: NOTHING }, { role: 'buddy', content: '내일 하나만 정한다면 뭐 할래?' }])
assert.deepEqual(nextLines({ ...base, mine: ['좋았어요', 'a', NOTHING], answer: { text: '일찍 자기' } }), [{ role: 'me', content: '일찍 자기' }, { role: 'buddy', content: DRAFT_LINE }])
assert.equal(nextLines({ ...base, mine: ['좋았어요', SKIP, SKIP], answer: { text: SKIP } }).at(-1)!.content, DRAFT_LINE_EMPTY)
assert.deepEqual(nextLines({ ...base, mine: ['좋았어요', 'a', 'b', 'c'], answer: { text: 'x' } }), [], '초안 뒤에는 정해진 행 없음')
// 지난 날: 인사·질문 3이 그날 기준
lines = nextLines({ ...base, date: '2026-10-04', mine: [], answer: { mood: 3 } })
assert.ok(lines[0].content.startsWith('10월 4일 이야기구나.'))
assert.equal(nextLines({ ...base, date: '2026-10-04', mine: ['좋았어요', 'a'], answer: { text: 'b' } }).at(-1)!.content, '그다음 날 하고 싶었던 건 뭐였어?')
// 기분 6번 누르기 안에 끝남: 기분 1 + 칩 3 + 저장 = 5
let mine: string[] = []
for (const a of [{ mood: 4 }, { text: '산책했어' }, { text: NOTHING }, { text: '일찍 자기' }]) {
  const l = nextLines({ ...base, mine, answer: a })
  mine = [...mine, ...l.filter((x) => x.role === 'me').map((x) => x.content)]
}
assert.equal(replay(mine).step, 'draft')
assert.equal(composeDraft(replay(mine).answers), '산책했어.\n내일은 일찍 자기.')

// ── 저장 뒤 한 줄 ──
assert.equal(warmLineOf({ mood: 4, past: false, done: 4 }), '잘 남겼어. 오늘 4개나 해낸 거 잊지 마.')
assert.equal(warmLineOf({ mood: 2, past: false, done: 4 }), '잘 남겼어. 오늘은 푹 쉬자.')
assert.equal(warmLineOf({ mood: 4, past: false, done: 0 }), '잘 남겼어. 내일 또 이야기해.')
assert.ok(!warmLineOf({ mood: 4, past: true, done: 3 }).includes('오늘'))

// ── AI 입력: 정해진 질문·답(safety 2)은 보내지 않는다 — 일기 글과 AI 대화만(환각 §8.1-7) ──
const buddy = { name: '느리', species: 'snail' as const }
const msgs = buildBuddyMessages({
  buddy,
  entry: { date: T, mood: 4, content: '기획서를 반쯤 썼다. 산책하고 나니 정리됐다.', private: 0 },
  messages: [
    { role: 'buddy', content: '저녁이네. 오늘 할 일 5개 중 4개 끝냈네! 어땠어?', safety: SCRIPTED },
    { role: 'me', content: '좋았어요', safety: SCRIPTED },
    { role: 'buddy', content: '잘 남겼어.', safety: SCRIPTED }
  ]
})!
assert.equal(msgs.length, 2)
assert.equal(msgs.at(-1)!.role, 'user', '마지막은 사용자(일기) — 정해진 말로 끝나지 않는다')
assert.ok(!JSON.stringify(msgs).includes('할 일 5개'))
// 지시문: 일기에 있는 말만, 지어내지 않기, 모르면 묻기, 예시 문장 없음(예시가 답에 섞이던 문제)
const sys = msgs[0].content
for (const must of ['일기에 적힌 말', '지어내거나', '짐작', '모르면 물어봐', '<diary>']) assert.ok(sys.includes(must), `지시문에 "${must}"`)
assert.ok(!sys.includes('면담') && !sys.includes('예:'), '구체 예시 문장 없음')

// ── 이번 주 돌아보기(AI 없음) ──
assert.equal(weekLineOf([]), '이번 주는 아직 비어 있어. 오늘 한 줄부터 남겨 볼까?')
const wk = [
  { date: '1', mood: 4, written: true, done: 5 }, { date: '2', mood: 5, written: true, done: 4 }, { date: '3', mood: 2, written: true, done: 0 },
  { date: '4', mood: null, written: false, done: 0 }, { date: '5', mood: 3, written: true, done: 1 }
]
assert.equal(weekLineOf(wk), '이번 주는 4일 남겼고, 좋았던 날이 2번, 힘들었던 날이 1번이었어. 할 일을 많이 끝낸 날 기분이 좋았네.')
assert.ok(!/연속|XP/.test(weekLineOf(wk)), '연속·XP 숫자 없음')

// ── 28 §8.10 대화로 쓰기(스킬) ──
// 기분 뒤: AI와 이야기면 편하게 말해 달라는 한 줄, 동의 전이면 카드부터(질문 없음), 다음 편은 인사 없이
assert.equal(nextLines({ ...base, mine: [], answer: { mood: 4 }, follow: 'open' }).at(-1)!.content, OPEN_LINE)
assert.equal(nextLines({ ...base, mine: [], answer: { mood: 4 }, follow: 'none' }).at(-1)!.content, REACT[4])
assert.deepEqual(nextLines({ ...base, intro: true, mine: [], answer: { mood: 2 }, greet: false }).map((l) => l.role), ['me', 'buddy', 'buddy'])
// 편 나누기: 저장 한 줄(잘 남겼어.) 뒤가 이번 편
assert.ok(isWarm(warmLineOf({ mood: 1, past: true, done: 0 })) && isWarm(warmLineOf({ mood: 4, past: false, done: 3 })) && isWarm(warmLineOf({ mood: 4, past: false, done: 0 })))
const row = (role: string, content: string, safety = 0) => ({ role, content, safety, created_at: '' })
const rows = [row('buddy', '저녁이네.', SCRIPTED), row('me', '시험이 코앞이야'), row('buddy', '잘 남겼어. 오늘은 푹 쉬자.', SCRIPTED), row('buddy', MORE_LINE, SCRIPTED), row('me', '사실 하나 더')]
assert.deepEqual(sessionOf(rows), { rows: rows.slice(3), boundaries: 1 })
assert.deepEqual(sessionOf(rows.slice(0, 2)), { rows: rows.slice(0, 2), boundaries: 0 })
// 머뭇거릴 때 질문: 이미 물은 건 건너뜀, 다 물었으면 null
const o = { mood: 4, past: false, stats }
assert.equal(nudgeOf([], o)!.q, '제일 좋았던 순간은 뭐였어?')
assert.equal(nudgeOf(['제일 좋았던 순간은 뭐였어?'], o)!.q, '힘들었던 건 없었어?')
assert.equal(nudgeOf(['제일 좋았던 순간은 뭐였어?', '힘들었던 건 없었어?', '내일 하나만 정한다면 뭐 할래?'], o), null)
// AI 없이 옮기기: 내 말만(기분 이름·건너뜀·정리 부탁·마침 인사 빠짐)
assert.equal(ownWords(['좋았어요', '시험이 코앞인데 손에 안 잡혀', SKIP, '일기로 정리해 줘', BYE_ME, '그래도 밥은 먹었다']), '시험이 코앞인데 손에 안 잡혀.\n그래도 밥은 먹었다')
assert.ok(asksDistill('이제 일기로 정리해 줘') && asksDistill('저장해줘') && asksDistill('일기로 써 줘') && !asksDistill('정리가 안 돼'))
// 이야기 입력: 같은 쪽 합침, 마지막은 사용자, 아니면 null
assert.deepEqual(chatTurns('S', [row('buddy', 'a'), row('buddy', 'b'), row('me', 'c')]), [{ role: 'system', content: 'S' }, { role: 'assistant', content: 'a\nb' }, { role: 'user', content: 'c' }])
assert.equal(chatTurns('S', [row('me', 'c'), row('buddy', 'd')]), null)
assert.equal(clock(new Date(2026, 9, 9, 9, 5)), '09:05')

console.log('diary talk: ok')
