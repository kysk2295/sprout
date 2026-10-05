// 빠른 입력 글루 시험(22 §3): 하이라이트 구간 · 인식 취소 · 제안 줄 · 저장 값(데스크톱 추가 바와 같은 규칙)
import assert from 'node:assert/strict'
import { recognize } from '@sprout/schema/recognition'
import { EMPTY_SCHEDULE } from './dateSheetModel.ts'
import { activeTrigger, addedToast, applySuggestion, buildInput, linkListFor, rangeAt, recognizeWith, segments, suggestions, tokenRanges } from './quickAddModel.ts'

const now = new Date('2026-10-04T10:00') // 일요일
const lists = [{ id: 'inbox', name: 'Inbox' }, { id: 'work', name: '업무' }]
const tags = [{ id: 'tw', name: '업무' }, { id: 'tr', name: '운동' }, { id: 'tr2', name: '운동-기록' }]
const defaults = { list_id: 'inbox', due_at: '2026-10-04' }

// 22 §6 완료 기준 문장: 인식 3곳 하이라이트, 제목에서 날짜·기호 빠짐
const raw = '내일 3시 기획 회의 #업무 !높음'
const r = recognizeWith(raw, lists, tags, [], now)
assert.equal(r.title, '기획 회의')
assert.equal(r.due_at!.slice(0, 10), '2026-10-05')
assert.deepEqual(r.tag_ids, ['tw'])
assert.equal(r.priority, 3)
assert.deepEqual(r.ranges.map((x) => x.text), ['내일', '3시', '#업무', '!높음'])
assert.deepEqual(segments(raw, r.ranges).filter((g) => g.hl).map((g) => g.text), ['내일', '3시', '#업무', '!높음'])
assert.equal(segments(raw, r.ranges).map((g) => g.text).join(''), raw, '조각을 이으면 원문')
// 데스크톱과 같은 결과(공용 recognize와 제목·값이 같다)
const desk = recognize(raw, lists, tags, now)
assert.equal(r.title, desk.title)
assert.equal(r.due_at, desk.due_at)
assert.equal(r.repeat_rule, desk.repeat_rule)

// 인식 취소: 그 글자는 제목에 남고 값도 사라진다
const c = recognizeWith(raw, lists, tags, ['내일'], now)
assert.equal(c.title, '내일 기획 회의')
assert.equal(c.due_at!.slice(0, 10), '2026-10-04', '날짜 취소 → 시각만 남아 오늘')
assert.ok(!c.ranges.some((x) => x.text === '내일'))
const c2 = recognizeWith(raw, lists, tags, ['#업무'], now)
assert.equal(c2.title, '기획 회의 #업무')
assert.deepEqual(c2.tag_ids, [])
assert.ok(!c2.title.includes('⁠'), '보이지 않는 글자는 제목에 안 남는다')
// 누른 곳이 하이라이트 안쪽이면 그 구간
assert.equal(rangeAt(r.ranges, 1)?.text, '내일')
assert.equal(rangeAt(r.ranges, 0), null, '끝자리는 아님(이어 쓰기)')
assert.equal(rangeAt(r.ranges, 2), null)
// 같은 글자가 두 번이면 앞에서부터 겹치지 않게
assert.deepEqual(tokenRanges('a 내일 내일', ['내일', '내일']).map((x) => x.start), [2, 5])

// 반복·요일(데스크톱 시험 문장)
assert.equal(recognizeWith('매주 수 운동', lists, tags, [], now).repeat_rule, 'FREQ=WEEKLY;BYDAY=WE')
assert.equal(recognizeWith('매일 물 마시기', lists, tags, [], now).repeat_rule, 'FREQ=DAILY')
assert.equal(recognizeWith('보고서 ~업무', lists, tags, [], now).list_id, 'work')

// 제안 줄
assert.deepEqual(activeTrigger('저녁 러닝 #운'), { kind: '#', query: '운', start: 6, end: 8 })
assert.equal(activeTrigger('저녁 러닝 #운 '), null, '빈칸을 치면 닫힘')
assert.equal(activeTrigger('a#b'), null, '낱말 처음에만')
assert.deepEqual(activeTrigger('#'), { kind: '#', query: '', start: 0, end: 1 })
assert.equal(activeTrigger('할 일 !높', 3)?.kind, undefined, '커서 앞만 본다')
const sg = suggestions({ kind: '#', query: '운', start: 6, end: 8 }, tags, lists)
assert.deepEqual(sg.map((x) => x.label), ['운동', '운동-기록', '새 태그 "운"'])
assert.deepEqual(suggestions({ kind: '#', query: '운동', start: 0, end: 3 }, tags, lists).map((x) => x.label), ['운동', '운동-기록'], '이미 있으면 새 태그 없음')
assert.deepEqual(suggestions({ kind: '#', query: '', start: 0, end: 1 }, tags, lists).length, 3)
assert.deepEqual(suggestions({ kind: '~', query: '업', start: 0, end: 2 }, tags, lists).map((x) => x.insert), ['~업무'])
assert.deepEqual(suggestions({ kind: '!', query: '', start: 0, end: 1 }, tags, lists).map((x) => x.priority), [3, 2, 1, 0])
const applied = applySuggestion('저녁 러닝 #운', { kind: '#', query: '운', start: 6, end: 8 }, '#운동')
assert.deepEqual(applied, { text: '저녁 러닝 #운동 ', cursor: 10 })
assert.equal(applySuggestion('#운 내일', { kind: '#', query: '운', start: 0, end: 2 }, '#운동').text, '#운동 내일')

// 저장 값: 인식 > 기본값, 시각이 있으면 "정각에", 시트 값이 이긴다
const input = buildInput({ r, description: ' 팀장님께 ', defaults })
assert.equal(input.title, '기획 회의')
assert.equal(input.content, '팀장님께')
assert.equal(input.list_id, 'inbox')
assert.equal(input.is_all_day, 0)
assert.deepEqual(input.reminders, ['-PT0M'])
assert.deepEqual(input.tag_ids, ['tw'])
const plain = buildInput({ r: recognizeWith('장보기', lists, tags, [], now), description: '', defaults })
assert.equal(plain.due_at, '2026-10-04', '오늘 탭 기본 = 오늘 종일')
assert.deepEqual(plain.reminders, [])
const manual = buildInput({ r, description: '', defaults, manual: { ...EMPTY_SCHEDULE, due_at: '2026-10-10', reminders: ['PT9H'], repeat_rule: 'FREQ=WEEKLY;BYDAY=SA', repeat_from: 'due' }, priority: 1, listId: 'work' })
assert.equal(manual.due_at, '2026-10-10')
assert.deepEqual(manual.reminders, ['PT9H'])
assert.equal(manual.repeat_rule, 'FREQ=WEEKLY;BYDAY=SA')
assert.equal(manual.priority, 1, '도구 막대 우선순위가 이긴다')
assert.equal(manual.list_id, 'work')
const cleared = buildInput({ r, description: '', defaults, manual: { ...EMPTY_SCHEDULE } })
assert.equal(cleared.due_at, null)
assert.deepEqual(cleared.reminders, [])

// 토스트(오늘 탭에서 오늘 밖으로 보냈을 때만)
assert.equal(addedToast('smart:today', '2026-10-05', null, '2026-10-04'), '내일에 추가했어요')
assert.equal(addedToast('smart:today', '2026-10-12T09:00', null, '2026-10-04'), '10월 12일에 추가했어요')
assert.equal(addedToast('smart:today', '2026-10-04T09:00', null, '2026-10-04'), null)
assert.equal(addedToast('smart:today', null, null, '2026-10-04', '업무'), '업무에 추가했어요')
assert.equal(addedToast('list:work', '2026-10-12', null, '2026-10-04'), null)

// ── 33 §6.3 `[[ ]]` 보호·제안·기본함 + [[리스트]] ──
{
  const wl = [{ id: 'inbox', name: 'Inbox', kind: 'inbox' }, { id: 'cert', name: '자격증', kind: 'normal' }, { id: 'work', name: '업무', kind: 'normal' }]
  const wt = [{ id: 'study', name: '공부' }, { id: 'prof', name: '교수님', kind: 'person', aliases: '["지도교수님"]' }]
  // 링크 안 글자(3월)는 날짜가 아니고 제목에 남는다, 링크 밖 `내일 #공부`는 인식
  const x = recognizeWith('[[3월 SQLD]] 내일 #공부', wl, wt, [], now)
  assert.equal(x.title, '[[3월 SQLD]]')
  assert.equal(x.due_at!.slice(0, 10), '2026-10-05')
  assert.deepEqual(x.tag_ids, ['study'])
  assert.deepEqual(x.links, ['3월 SQLD'])
  assert.ok(x.ranges.some((g) => g.text === '[[3월 SQLD]]'), '링크도 하이라이트')
  assert.equal(segments('[[3월 SQLD]] 내일 #공부', x.ranges).map((g) => g.text).join(''), '[[3월 SQLD]] 내일 #공부')
  // 닫히지 않은 [[는 글
  assert.equal(recognizeWith('[[교수님 메일', wl, wt, [], now).links.length, 0)
  // [[ 제안: 태그 → 리스트 → 할 일, 별칭·초성
  const tr = activeTrigger('메일 [[ㄱㅅ')!
  assert.equal(tr.kind, '[[')
  assert.equal(tr.query, 'ㄱㅅ')
  assert.equal(tr.start, 3)
  assert.deepEqual(suggestions(tr, wt, wl).map((g) => g.key), ['tag:prof'])
  const al = suggestions(activeTrigger('[[지도')!, wt, wl)
  assert.equal(al[0].key, 'tag:prof')
  assert.equal(al[0].sub, '= 지도교수님')
  const all = suggestions(activeTrigger('[[')!, wt, wl, [{ id: 't1', title: '중간 보고' }])
  assert.deepEqual(all.map((g) => g.group), ['tag', 'tag', 'list', 'list'], '빈 질의 = 태그·리스트(기본함 빼고), 할 일은 글자를 쳐야')
  assert.deepEqual(suggestions(activeTrigger('[[중간')!, wt, wl, [{ id: 't1', title: '중간 보고', list: '업무' }]).map((g) => g.insert), ['[[중간 보고]]'])
  const ap = applySuggestion('[[교수', activeTrigger('[[교수')!, '[[교수님]]')
  assert.equal(ap.text, '[[교수님]] ')
  assert.equal(ap.cursor, 8)
  // 기본함 + [[리스트]] 하나 = 그 리스트, ~리스트·메뉴로 골랐거나 기본함이 아닌 보기면 그대로
  const lk = recognizeWith('기출 3회 [[자격증]]', wl, wt, [], now)
  assert.equal(linkListFor(lk, null, 'inbox', 'inbox', wt, wl), 'cert')
  assert.equal(linkListFor(lk, 'work', 'inbox', 'inbox', wt, wl), null)
  assert.equal(linkListFor(lk, null, 'work', 'inbox', wt, wl), null)
  assert.equal(linkListFor(recognizeWith('기출 [[자격증]] [[교수님]]', wl, wt, [], now), null, 'inbox', 'inbox', wt, wl), null, '링크 둘이면 안 옮김')
  assert.equal(linkListFor(recognizeWith('[[교수님]]께 메일', wl, wt, [], now), null, 'inbox', 'inbox', wt, wl), null, '태그 링크는 리스트 아님')
  assert.equal(linkListFor(recognizeWith('기출 [[자격증]] ~업무', wl, wt, [], now), null, 'inbox', 'inbox', wt, wl), null, '~리스트가 이긴다')
}

// 태그 화면에서 만들면 그 태그(33 §4.1)
assert.deepEqual(buildInput({ r: recognizeWith('메일 #업무', lists, tags, [], now), description: '', defaults: { list_id: 'inbox', due_at: null, tag_id: 'tr' } }).tag_ids, ['tw', 'tr'])
console.log('quickAddModel.test ok')
