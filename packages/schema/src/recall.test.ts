import assert from 'node:assert/strict'
import { answerFace, answerKindOf } from './companion.ts'
import { agoLine, occurrenceOf, periodOf, recallAsk, recallFromModel, recallLine, recallResult, recallSql, type RecallRow } from './recall.ts'

// 2026-10-09(금) 15:00
const now = new Date(2026, 9, 9, 15, 0)
const ask = (t: string) => recallAsk(t, now)

// ── 말 → 물음(앞 규칙) ──
// 사용자 예: "미용실을 내가 간지 얼마나 지났지"
const hair = ask('미용실을 내가 간지 얼마나 지났지')!
assert.equal(hair.mode, 'last')
assert.deepEqual(hair.words, ['미용실'])
assert.equal(hair.phrase, '미용실 간')
assert.equal(hair.verb, true)
assert.deepEqual(ask('마지막으로 치과 간 게 언제야?')?.words, ['치과'])
assert.equal(ask('마지막으로 치과 간 게 언제야?')?.phrase, '치과 간')
const gym = ask('운동한 지 며칠 됐지')!
assert.deepEqual([gym.mode, gym.words, gym.phrase], ['last', ['운동'], '운동한'])
assert.equal(ask('헬스장 언제 갔지')?.phrase, '헬스장 간')
assert.deepEqual(ask('마지막 미용실 언제였지') && [ask('마지막 미용실 언제였지')!.phrase, ask('마지막 미용실 언제였지')!.verb], ['미용실', false])
assert.equal(ask('세차한 지 얼마나 됐어?')?.phrase, '세차한')
assert.equal(ask('부모님께 전화한 지 몇 달 됐지')?.words.join(','), '부모님,전화')
// 횟수
const cnt = ask('이번 달 운동 몇 번 했지')!
assert.deepEqual([cnt.mode, cnt.words, cnt.scope, cnt.from, cnt.to, cnt.past], ['count', ['운동'], '이번 달', '2026-10-01', '2026-10-31', '했어'])
const cnt2 = ask('미용실 몇 번 갔어?')!
assert.deepEqual([cnt2.mode, cnt2.words, cnt2.scope, cnt2.past], ['count', ['미용실'], undefined, '갔어'])
assert.equal(ask('이번 달에 운동 몇 번 했어')?.words.join(','), '운동')
// 기록 묻기가 아닌 말: 그대로 모델로
assert.equal(ask('이번 주 남은 할 일 보여줘'), null)
assert.equal(ask('이번 주에 완료한 거 몇 개야?'), null)
assert.equal(ask('내일 미용실 언제 가지?'), null)
assert.equal(ask('미용실 몇 번 가야 할까'), null)
assert.equal(ask('내일 오후 3시 미용실 등록해 줘'), null)
assert.equal(ask('얼마나 지났지'), null) // 찾을 말 없음 → 모델

// 기간
assert.deepEqual(periodOf('지난주', now), { scope: '지난 주', from: '2026-09-28', to: '2026-10-04' })
assert.deepEqual(periodOf('올해', now), { scope: '올해', from: '2026-01-01', to: '2026-12-31' })
assert.equal(periodOf('미용실', now), null)

// 모델이 잡은 물음
assert.deepEqual(recallFromModel({ message: 'recall:last', keyword: '미용실', from: '', to: '' }, '그거 언제였더라', now)?.words, ['미용실'])
assert.equal(recallFromModel({ message: '', keyword: '미용실', from: '', to: '' }, 'x', now), null)

// ── 행 → 답 ──
const rows: RecallRow[] = [
  { id: 't1', title: '미용실', source: 'task', status: 1, completed_at: '2026-09-20T03:00:00.000Z', due_at: '2026-09-20' },
  { id: 't2', title: '다음에 미용실 갈때 조금만 자르기', source: 'task', status: 1, completed_at: '2026-10-08T01:00:00.000Z', due_at: null },
  { id: 't3', title: '미용실', source: 'task', status: 1, completed_at: '2026-08-02T03:00:00.000Z', due_at: '2026-08-02' },
  { id: 't4', title: '미용실 예약', source: 'task', status: 0, due_at: '2026-10-25' },
  { id: 't5', title: '미용실', source: 'task', status: 0, due_at: '2026-09-01' }, // 지난 날짜인데 안 한 것: 기록 아님
  { id: 'e1', title: '미용실 커트', source: 'event', start_at: '2026-07-11T11:00', open: 'ev:e1' }
]
const r = recallResult(hair, rows, now)
assert.equal(r.last?.id, 't1') // 계획 메모(t2)는 더 최근에 완료했어도 빠진다
assert.equal(r.last?.date, '2026-09-20')
assert.equal(r.days, 19)
assert.equal(r.next?.id, 't4')
assert.equal(r.next?.date, '2026-10-25')
assert.equal(recallLine(hair, r, now), '마지막으로 미용실 간 건 9월 20일이야. 19일 지났어.')
// 다른 말 꼴
const plain = ask('마지막 미용실 언제였지')!
assert.equal(recallLine(plain, recallResult(plain, rows, now), now), '마지막 미용실은 9월 20일이야. 19일 지났어.')
// 완료 시각이 없으면 마감 날짜
const noStamp = recallResult(hair, [{ id: 'x', title: '미용실', source: 'task', status: 1, completed_at: null, due_at: '2026-10-08' }], now)
assert.equal(recallLine(hair, noStamp, now), '마지막으로 미용실 간 건 어제야. 하루 지났어.')
// 오늘
assert.equal(recallLine(hair, recallResult(hair, [{ id: 'x', title: '미용실', source: 'event', start_at: '2026-10-09T10:00' }], now), now), '마지막으로 미용실 간 건 오늘이야.')
// 일정(지난 일정 = 한 일)
const ev = recallResult(hair, [rows[5], rows[3]], now)
assert.deepEqual([ev.last?.open, ev.last?.date], ['ev:e1', '2026-07-11'])
assert.equal(recallLine(hair, ev, now), '마지막으로 미용실 간 건 7월 11일이야. 3달 넘게 지났어.')
// 작년
assert.equal(recallLine(hair, recallResult(hair, [{ id: 'y', title: '미용실', source: 'task', status: 1, completed_at: '2025-10-25T03:00:00.000Z' }], now), now), '마지막으로 미용실 간 건 2025년 10월 25일이야. 11달 넘게 지났어.')
// 못 찾음
const none = recallResult(hair, [rows[1]], now)
assert.equal(recallLine(hair, none, now), '기록에서 미용실 다녀온 걸 못 찾았어.')
assert.equal(recallLine(hair, recallResult(hair, [rows[3]], now), now), '기록에서 미용실 다녀온 걸 못 찾았어. 다음 예정은 10월 25일이야.')
assert.equal(recallLine(gym, recallResult(gym, [], now), now), '기록에서 운동한 걸 못 찾았어.')
assert.equal(recallLine(plain, recallResult(plain, [], now), now), '기록에서 미용실을 못 찾았어.')
// 횟수
const workout: RecallRow[] = [
  { id: 'w1', title: '운동', source: 'task', status: 1, completed_at: '2026-10-02T10:00:00.000Z' },
  { id: 'w2', title: '아침 운동', source: 'task', status: 1, completed_at: '2026-10-05T10:00:00.000Z' },
  { id: 'w3', title: '운동', source: 'task', status: 1, completed_at: '2026-09-29T10:00:00.000Z' },
  { id: 'w4', title: '운동', source: 'event', start_at: '2026-10-07T19:00' },
  { id: 'w5', title: '운동', source: 'task', status: 0, due_at: '2026-10-12' }
]
const c = recallResult(cnt, workout, now)
assert.equal(c.count, 3)
assert.equal(recallLine(cnt, c, now), '이번 달 운동 3번 했어.')
assert.equal(recallLine(cnt2, recallResult(cnt2, rows, now), now), '지금까지 미용실 3번 갔어.')
assert.equal(recallLine(cnt, recallResult(cnt, [], now), now), '이번 달은 운동 기록을 못 찾았어.')

// 날 수 말
assert.equal(agoLine(0), '')
assert.equal(agoLine(45), '45일 지났어.')
assert.equal(agoLine(400), '1년 넘게 지났어.')
// 지난 날짜인데 안 한 할 일은 기록도 예정도 아님
assert.equal(occurrenceOf(rows[4], now), null)
// SQL: 찾을 말 하나라도(정확한 거르기는 앱)
assert.match(recallSql(gym).tasks.sql, /status <> 2/)
assert.deepEqual(recallSql(ask('부모님께 전화한 지 몇 달 됐지')!).events.args, ['부모님', '전화'])

// 캐릭터 얼굴: 앱이 고른 한 줄 그대로, 예전 기록도 recall 칸으로 종류를 짐작
assert.deepEqual(answerFace({ kind: 'recall', text: '마지막으로 미용실 간 건 9월 20일이야. 19일 지났어.' }), { mood: 'smile', move: null, line: '마지막으로 미용실 간 건 9월 20일이야. 19일 지났어.' })
assert.equal(answerKindOf({ recall: r }), 'recall')

console.log('recall ok')
