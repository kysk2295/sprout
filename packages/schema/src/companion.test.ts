import assert from 'node:assert/strict'
import {
  allDoneLine, answerFace, answerKindOf, companionLabel, errorFace, isQuestion, levelLine, pickLine, quickReplies, scopeOf, tapSpeaks, todayEmptyLines, whenLabel, EGG_PREFIX
} from './companion.ts'

// 2026-10-06(화) 13:20
const now = new Date(2026, 9, 6, 13, 20)

// 날짜·시각 말
assert.equal(whenLabel('2026-10-07T15:00', now), '내일 오후 3시')
assert.equal(whenLabel('2026-10-06T09:30', now), '오늘 오전 9시 30분')
assert.equal(whenLabel('2026-10-09', now), '금요일')
assert.equal(whenLabel('2026-10-08T00:00', now), '모레 오전 12시')
assert.equal(whenLabel('2026-10-20T12:00', now), '10월 20일 오후 12시')
assert.equal(scopeOf('이번주 공부 몇 시간 했어?'), '이번 주')
assert.equal(scopeOf('오늘 남은 일 보여 줘'), '오늘')
assert.equal(scopeOf('치과'), null)

// 등록 성공: happy + 깡충, 받침 따라 야/이야
assert.deepEqual(answerFace({ kind: 'create', count: 1, first: { start_at: '2026-10-07T15:00', due_at: '2026-10-07T16:00' }, now }), { mood: 'happy', move: 'hop', line: '넣어 뒀어. 내일 오후 3시야.' })
assert.equal(answerFace({ kind: 'create', count: 1, first: { start_at: null, due_at: '2026-10-09' }, now }).line, '넣어 뒀어. 금요일이야.')
assert.equal(answerFace({ kind: 'create', count: 1, first: { start_at: null, due_at: '2026-10-06T09:30' }, now }).line, '넣어 뒀어. 오늘 오전 9시 30분이야.')
assert.equal(answerFace({ kind: 'create', count: 1, first: { start_at: null, due_at: null }, now }).line, '넣어 뒀어.')
assert.equal(answerFace({ kind: 'create', count: 3, now }).line, '3개 넣어 뒀어.')
// 알이면 톡톡…
assert.equal(answerFace({ kind: 'create', count: 3, egg: true, now }).line, `${EGG_PREFIX}3개 넣어 뒀어.`)

// 조회·집계
assert.deepEqual(answerFace({ kind: 'query', count: 2, status: 'open', request: '오늘 남은 일 보여 줘' }), { mood: 'smile', move: null, line: '오늘 남은 건 2개야.' })
assert.equal(answerFace({ kind: 'query', count: 0, status: 'open', request: '오늘 할 일 알려 줘' }).line, '오늘은 남은 게 없어.')
assert.equal(answerFace({ kind: 'query', count: 4, status: 'completed', request: '이번 주 끝낸 일' }).line, '이번 주 끝낸 건 4개야.')
assert.equal(answerFace({ kind: 'query', count: 0, status: 'all', request: '치과 찾아 줘' }).line, '찾은 게 없어.')
assert.equal(answerFace({ kind: 'stats', count: 4, request: '이번 주 공부 몇 시간 했어?' }).line, '이번 주는 이만큼 했어.')

// 되묻기 = puzzled + 갸웃, 안내 답 = smile. 글은 모델 문장 그대로
assert.deepEqual(answerFace({ kind: 'reply', text: '몇 시로 할까?' }), { mood: 'puzzled', move: 'tilt', line: '몇 시로 할까?' })
assert.equal(answerFace({ kind: 'chat', text: '할 일을 말로 등록할 수 있어.' }).mood, 'smile')
assert.equal(answerFace({ kind: 'reply', text: '등록할 일정이나 조회할 기간을 알려 주세요.' }).mood, 'puzzled')
// 되돌리기
assert.deepEqual(answerFace({ kind: 'create', undone: true }), { mood: 'smile', move: 'tilt', line: '알겠어, 지웠어.' })
// 예전 기록(종류 칸 없음)
assert.equal(answerKindOf({ created: { id: 'a' } }), 'create')
assert.equal(answerKindOf({ stats: {} }), 'stats')
assert.equal(answerKindOf({ tasks: [] }), 'query')
assert.equal(answerKindOf(undefined), 'reply')
assert.ok(isQuestion('몇 시로 할까?'))
assert.ok(!isQuestion('넣어 뒀어.'))

// 13 §6 오류 → 얼굴. sleepy가 가장 어두운 얼굴
assert.deepEqual(errorFace('지금은 AI를 쓸 수 없어요. 할 일·캘린더는 그대로 쓸 수 있어요.'), { mood: 'sleepy', move: null, line: '나 지금 잠깐 쉬는 중이야.', dim: true })
assert.equal(errorFace('꿈틀 AI에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.').line, '연결이 끊겼어. 다시 불러 줘.')
assert.equal(errorFace('AI 응답이 너무 오래 걸려요. 다시 시도해 주세요.').line, '생각이 너무 길어졌어.')
assert.equal(errorFace('AI 요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요. (오늘 남은 요청 63회)').line, '숨 좀 고르고 다시 할게.')
assert.equal(errorFace('지금은 AI를 쓰는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.').line, '숨 좀 고르고 다시 할게.')
assert.equal(errorFace('오늘 AI 사용 한도를 다 썼어요. 내일 다시 시도해 주세요.').line, '오늘은 여기까지! 내일 또 불러 줘.')
assert.equal(errorFace('요청을 멈췄어요. 내용을 확인한 뒤 다시 보내 주세요.').line, '멈췄어.')
assert.deepEqual(errorFace('AI가 해석한 날짜가 올바르지 않아요. 날짜를 다시 알려 주세요.'), { mood: 'puzzled', move: 'tilt', line: '잘 못 알아들었어.' })
for (const e of ['멈췄어요', '오늘 AI 사용 한도', '지금은 AI를 쓸 수 없어요', '연결하지 못했어요', '너무 오래 걸려요', '너무 잦아요', '형식']) {
  assert.ok(!['happy', 'content'].includes(errorFace(e).mood), e)
}

// 빠른 답 칩: 되묻기에만, 빠진 칸을 보고
const fri = quickReplies({ request: '금요일에 치과', question: '몇 시로 할까?', now })
assert.deepEqual(fri.map((c) => c.label), ['오전 10시', '오후 2시', '오후 6시', '시간 없이 금요일'])
assert.equal(fri[1].send, '금요일에 치과 오후 2시로 등록해 줘')
assert.equal(fri[3].ghost, true)
// 오늘이면 지난 시각을 빼고 다음 세 시각
assert.deepEqual(quickReplies({ request: '치과 등록해 줘', question: '몇 시에 갈까?', now }).map((c) => c.label), ['오후 2시', '오후 3시', '오후 4시', '시간 없이'])
assert.equal(quickReplies({ request: '치과 등록해 줘', question: '몇 시에 갈까?', now })[0].send, '치과 오후 2시로 등록해 줘')
assert.deepEqual(quickReplies({ request: '치과 예약', question: '언제로 할까?', now }).map((c) => c.label), ['오늘', '내일', '이번 주 금요일', '날짜 없이'])
assert.deepEqual(quickReplies({ request: '장보기', question: '어느 리스트에 넣을까?', lists: ['생활', '업무', '기본함', '공부', '운동'] }).map((c) => c.label), ['생활', '업무', '공부', '기본함'])
assert.deepEqual(quickReplies({ request: '금요일에 치과', question: '넣어 뒀어.', now }), [])
assert.ok(quickReplies({ request: '금요일에 치과', question: '몇 시로 할까?', now }).length <= 4)

// 누르기: 바로 전 문장은 다시 안 고름 · 10초 안 다섯 번 넘으면 말 없음
assert.equal(pickLine(['a', 'b', 'c'], 1, () => 0.4), 2)
assert.equal(pickLine(['a', 'b', 'c'], 0, () => 0.4), 1)
assert.equal(pickLine(['only'], 0), 0)
const taps: number[] = []
assert.deepEqual([0, 1000, 2000, 3000, 4000, 5000].map((t) => tapSpeaks(taps, t)), [true, true, true, true, true, false])
assert.equal(tapSpeaks(taps, 16000), true)

// 이름·단계
assert.equal(levelLine('squirrel', 7, 3), '차곡차곡 다람쥐 · Lv 7 친구')
assert.equal(levelLine(null, 1, 1), '성향 조사를 하면 깨어나요')
assert.equal(companionLabel('squirrel', '도토리', 7, 3), '도토리, Lv 7 친구. 눌러서 말 걸기')

// 빈 상태 한 줄(실제 숫자)
assert.deepEqual(todayEmptyLines({ todayDone: 0, hour: 14 }), ['하고 싶은 일이 생기면 적어 줘', '잠깐 쉬어도 괜찮아'])
assert.deepEqual(todayEmptyLines({ todayDone: 3, hour: 14 }), ['오늘 3개 했어. 남은 건 없어', '하고 싶은 일이 생기면 적어 줘'])
assert.equal(todayEmptyLines({ todayDone: 0, hour: 23 })[0], '오늘은 이만 쉬자')
assert.equal(allDoneLine(5), '오늘 5개 했어. 푹 쉬어')
assert.equal(allDoneLine(0), '다 끝났다!')

// 한 줄은 24자 안팎(앱이 고르는 문장 — 모델 글 제외)
const lines = [
  answerFace({ kind: 'create', count: 1, first: { start_at: '2026-10-07T15:30', due_at: null }, now }).line!,
  ...['지금은 AI를 쓸 수 없어요', '연결하지 못했어요', '오늘 AI 사용 한도', '너무 잦아요'].map((e) => errorFace(e, true).line!),
  ...todayEmptyLines({ todayDone: 12, hour: 23 }), allDoneLine(12)
]
for (const l of lines) assert.ok(l.length <= 28, `${l} (${l.length}자)`)

console.log('companion ok')
