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

// ── 28 §8.11 받는 글 ──
{
  const { createTextStream, revealNext, partialDistill, replyFaceOf, nearBottom, REVEAL } = await import('./diaryTalk.ts')
  // 드러내기: 한 프레임에 다 보이지 않고, 180ms 안에 따라잡는다
  let pos = 0, shown = 0, t = 0
  const text = '시험 끝났다니 정말 고생 많았어. 친구랑 떡볶이 먹은 거 좋았겠다.'
  ;({ pos, shown } = revealNext(pos, text, 16))
  assert.ok(shown > 0 && shown < text.length, '첫 프레임은 조금만')
  while (shown < text.length && t < 1000) { ({ pos, shown } = revealNext(pos, text, 16)); t += 16 }
  assert.ok(t <= REVEAL.catchupMs * 3.5, `따라잡기 ${t}ms`) // 지수로 다가가고 끝은 초당 40자
  // 밀린 글이 적어도 최소 속도(초당 40자)
  assert.equal(revealNext(0, 'ab', 16).shown, 0, '1/40초 미만은 아직')
  assert.equal(revealNext(0, '가나다라마바사아자차카타파하'.repeat(10), 100).shown > 0, true)
  // 큰 dt(탭이 쉬다 옴)는 100ms로 묶음
  assert.ok(revealNext(0, 'x'.repeat(10000), 5000).shown < 10000)
  // 이모지 가운데서 자르지 않음
  const emo = '좋아😊'
  for (let p = 0; p <= emo.length; p += 0.5) { const r = revealNext(p, emo, 0.1); const c = emo.charCodeAt(r.shown - 1); assert.ok(!(c >= 0xd800 && c <= 0xdbff && r.shown < emo.length)) }
  assert.deepEqual(revealNext(5, 'abc', 16), { pos: 3, shown: 3 })

  // 옮기기 JSON → 제목·본문만(이스케이프·반쯤 온 조각)
  assert.deepEqual(partialDistill(''), { title: null, entry: null })
  assert.deepEqual(partialDistill('{"title": "시험 앞'), { title: '시험 앞', entry: null })
  assert.deepEqual(partialDistill('{"title": "시험 앞에서 멈춘 하루", "tags": ["#감정/불안"], "entry": "오늘은 \\"정말\\" 손에'), { title: '시험 앞에서 멈춘 하루', entry: '오늘은 "정말" 손에' })
  assert.equal(partialDistill('{"entry": "첫 줄\\n둘째\\').entry, '첫 줄\n둘째', '반쯤 온 이스케이프는 기다림')
  assert.equal(partialDistill('{"entry": "\\uAC00\\uAC').entry, '가')
  assert.equal(partialDistill('{"entry": "2026 년 10 월 9 일, 시험이 끝났다.", "title": "x"}').entry, '시험이 끝났다.', '날짜 머리 빼기(parseDistill과 같음)')
  assert.equal(partialDistill('```json\n{"title":"a","entry":"b"}```').entry, 'b')

  // 저장소: 구독자만 깨우고, 드러낸 글자 수를 기다릴 수 있다
  const s = createTextStream()
  let n = 0
  const off = s.subscribe(() => n++)
  s.set('안녕'); s.set('안녕'); s.set('안녕하')
  assert.equal(n, 2, '같은 글은 다시 안 그림')
  assert.equal(s.get().text, '안녕하')
  let done = false
  const w = s.whenShown(1000).then(() => { done = true })
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(done, false)
  s.mark(3)
  await w
  assert.equal(done, true)
  s.set('다른 글', '제목')
  assert.equal(s.get().title, '제목')
  s.reset()
  assert.deepEqual([s.get().text, s.get().title, s.get().shown], ['', '', 0])
  off()
  s.set('구독 없음')
  const t0 = Date.now(); await s.whenShown(1000); assert.ok(Date.now() - t0 < 50, '구독자가 없으면 바로')

  assert.equal(replyFaceOf('들려줘서 고마워'), 'happy')
  assert.equal(replyFaceOf('그랬구나, 피곤했겠다'), null)
  assert.equal(nearBottom({ scrollTop: 900, scrollHeight: 1500, clientHeight: 560 }), true)
  assert.equal(nearBottom({ scrollTop: 400, scrollHeight: 1500, clientHeight: 560 }), false)
  console.log('diary stream shared: ok')
}
