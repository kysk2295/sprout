// 15 §10 데스크톱·휴대폰 같이 쓰는 대화 상태 시험(정해진 말·초안 자체는 휴대폰 talk.test.ts)
import assert from 'node:assert/strict'
import { BYE_BUDDY, BYE_ME, leadingSections, MORE_LINE, SCRIPTED, sessionLinesOf, talkPhase, talkStateOf, warmCountOf } from './diaryTalk.ts'
import { MOODS, previewOf } from './diary.ts'

const row = (role: string, content: string, safety = 0) => ({ role, content, safety, created_at: '' })
// 시작 전 → 기분
let st = talkStateOf([])
assert.equal(talkPhase({ draft: false, started: st.started, bye: st.bye, boundaries: st.boundaries, sections: 0, again: false, consentPending: true, aiFlow: false, step: st.r.step }), 'mood')
// 기분만 골랐고 동의 전 → 동의 카드
st = talkStateOf([row('buddy', '저녁이네.', SCRIPTED), row('me', '좋았어요', SCRIPTED), row('buddy', '좋았다니 나도 좋다!', SCRIPTED)])
assert.equal(st.mood, 4)
const base = { draft: false, started: st.started, bye: st.bye, boundaries: st.boundaries, sections: 0, again: false, step: st.r.step }
assert.equal(talkPhase({ ...base, consentPending: true, aiFlow: false }), 'consent')
assert.equal(talkPhase({ ...base, consentPending: false, aiFlow: true }), 'talk')
assert.equal(talkPhase({ ...base, consentPending: false, aiFlow: false }), 'q1')
// 위기 행(safety 1)은 버림, 정해진 말(2)·AI(0)은 남김
st = talkStateOf([row('buddy', '옛 카드', 1), row('me', '시험이 코앞이야'), row('buddy', '그랬구나'), row('me', '좋았어요', SCRIPTED)])
assert.ok(!st.all.some((m) => m.content === '옛 카드'))
assert.equal(st.myTalk.length, 1)
// 저장 한 줄 뒤 → 저장 뒤, 더 이야기 → 새 편 시작
const saved = [row('me', '시험이 코앞이야'), row('buddy', '잘 남겼어. 오늘은 푹 쉬자.', SCRIPTED)]
st = talkStateOf(saved)
assert.equal(st.boundaries, 1)
assert.equal(talkPhase({ draft: false, started: st.started, bye: st.bye, boundaries: st.boundaries, sections: 1, again: false, consentPending: false, aiFlow: true, step: st.r.step }), 'after')
st = talkStateOf([...saved, row('buddy', MORE_LINE, SCRIPTED)])
assert.equal(st.started, true)
st = talkStateOf([...saved, row('me', BYE_ME, SCRIPTED), row('buddy', BYE_BUDDY, SCRIPTED)])
assert.equal(talkPhase({ draft: false, started: st.started, bye: st.bye, boundaries: st.boundaries, sections: 1, again: false, consentPending: false, aiFlow: true, step: st.r.step }), 'end')
// 옮기기 입력: 마침 인사·할 일 줄 빠짐
assert.deepEqual(sessionLinesOf([row('me', '어떻게 하지'), row('buddy', '같이 보자.\n할 일: 운동화 꺼내 두기'), row('me', BYE_ME, SCRIPTED)]), [{ who: 'me', text: '어떻게 하지' }, { who: 'buddy', text: '같이 보자.' }])
// 대화 없이 쓴 편은 맨 위
assert.equal(leadingSections(3, 1), 2)
assert.equal(leadingSections(0, 2), 0)
assert.equal(warmCountOf(saved), 1)
// 미리보기 = 첫 편 제목(머리·태그 줄은 글자로 안 보임), 나만 보기 숨김
const content = '## 21:45 — 손에 잡히지 않는 하루\n#감정/무기력 #영역/공부\n\n시험이 코앞인데 손에 안 잡혔다.'
assert.equal(previewOf({ content, private: 0 }), '손에 잡히지 않는 하루')
assert.equal(previewOf({ content, private: 1 }), '🔒 나만 보기')
assert.deepEqual(MOODS.map((m) => m.color), ['#8797AE', '#8EC1D6', '#F2B84B', '#62BF7E', '#F08A5D'])
console.log('diary talk shared: ok')
