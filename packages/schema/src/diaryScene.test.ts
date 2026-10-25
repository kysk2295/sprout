import assert from 'node:assert/strict'
import { lookbackDates, sceneCardOf, topWords } from './diaryScene.ts'

const base = { date: '2026-10-25', mood: null, content: null, photos: [], doneTitles: [], eventTitles: [] }
assert.equal(sceneCardOf(base), null)
// 장 제목이 있으면 그것
let c = sceneCardOf({ ...base, mood: 4, content: '## 21:10 — 한강 바람, 숨 돌린 토요일\n\n한강에 갔다.' })!
assert.equal(c.title, '한강 바람, 숨 돌린 토요일'); assert.equal(c.titleFrom, 'section'); assert.equal(c.sceneKey, 'scene-sunset'); assert.equal(c.pages, 1)
// 제목 없으면 본문 첫 문장
c = sceneCardOf({ ...base, content: '## 10:00 ✎\n\n오랜만에 친구를 만났다. 즐거웠다.' })!
assert.equal(c.title, '오랜만에 친구를 만났다.'); assert.equal(c.titleFrom, 'body')
// 글이 없으면 할 일·일정으로
c = sceneCardOf({ ...base, doneTitles: ['주간 회의 정리', '운동 30분(헬스장)'], eventTitles: ['저녁 약속'] })!
assert.equal(c.title, '주간 회의 정리 · 운동 30분'); assert.equal(c.titleFrom, 'tasks'); assert.equal(c.done, 2); assert.equal(c.firstEvent, '저녁 약속')
c = sceneCardOf({ ...base, doneTitles: ['보고서'], eventTitles: ['저녁 약속'] })!
assert.equal(c.title, '보고서 · 저녁 약속')
c = sceneCardOf({ ...base, eventTitles: ['치과'] })!
assert.equal(c.title, '치과')
// 기분 없는 날 장면이 날짜로 섞임
assert.ok(new Set(['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06'].map((d) => sceneCardOf({ ...base, date: d, eventTitles: ['x'] })!.sceneKey)).size >= 3)
// 기분만 → 조용히 지나간 하루 + 기분 한 줄
c = sceneCardOf({ ...base, mood: 1 })!
assert.equal(c.title, '조용히 지나간 하루'); assert.equal(c.sceneKey, 'scene-rain'); assert.ok(c.buddyLine.length > 0)
// 사진
c = sceneCardOf({ ...base, photos: [{ media_id: 'a' }, { media_id: 'b' }] })!
assert.equal(c.photo?.media_id, 'a'); assert.equal(c.photoCount, 2); assert.equal(c.title, '사진 한 장으로 남긴 하루')
// '(기분만 남겼어요)'는 글이 아니다
c = sceneCardOf({ ...base, mood: 3, content: '## 09:00\n\n(기분만 남겼어요)', doneTitles: ['빨래'] })!
assert.equal(c.titleFrom, 'tasks')
// 다크 장면
assert.equal(sceneCardOf({ ...base, mood: 5 }, { dark: true })!.sceneKey, 'scene-flowers-n')
// 1년·한 달 전
assert.deepEqual(lookbackDates('2026-10-25'), [{ label: '1년 전 오늘', date: '2025-10-25' }, { label: '한 달 전 오늘', date: '2026-09-25' }])
assert.deepEqual(lookbackDates('2026-03-31').map((x) => x.date), ['2025-03-31'])
// 많이 쓴 말
assert.deepEqual(topWords(['퀴즈를 봤다. 친구랑 밥.', '퀴즈 공부. 친구가 왔다.', '퀴즈 끝']).slice(0, 2), ['퀴즈', '친구'])
console.log('diaryScene ok')

// 28 §10.9 장면 카드 v2 — 기분별 표정·몸짓
{
  const { cardPoseOf } = await import('./diaryScene.ts')
  if (cardPoseOf(1).face !== 'sad' || cardPoseOf(5).motion !== 'hop' || cardPoseOf(null).face !== 'default' || cardPoseOf(2).face !== 'sleepy') throw new Error('cardPoseOf')
  console.log('diaryScene pose ok')
}
