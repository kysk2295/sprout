// 28 모바일 일기 계산 시험 — 데스크톱 tests/diary.test.ts와 같은 규칙
import assert from 'node:assert/strict'
import {
  averageMood, buddyLine, buddyOf, buildBuddyMessages, buildSummaryMessages, dayTitle, entryId, highlightsOf,
  insightOf, josa, longestStreak, mayCallAi, memoryOf, monthGrid, moodFaceOf, moodShare, moodTrend, parseBuddyReply, previewOf, promptFor, searchEntries,
  skyOf, streakOf, WEEK_DAYS, weekdayIdx, weekOf, wantsFirstReply, yearMosaic
} from './logic.ts'

// ── 나만 보기·동의 ──
const buddy = { name: '도토리', species: 'bee' as const }
assert.equal(buildBuddyMessages({ buddy, entry: { date: '2026-10-04', mood: 4, content: '비밀', private: 1 }, messages: [] }), null)
assert.equal(buildSummaryMessages({ content: '비밀', private: 1 }, []), null)
assert.equal(buildSummaryMessages({ content: '  ', private: 0 }, []), null)
assert.equal(mayCallAi({ consent: null, private: 0 }), false)
assert.equal(mayCallAi({ consent: false, private: 0 }), false)
assert.equal(mayCallAi({ consent: true, private: 1 }), false)
assert.equal(mayCallAi({ consent: true, private: 0, solo: true }), false)
assert.equal(mayCallAi({ consent: true, private: 0 }), true)
// 기억하기: 나만 보기 날·7일 넘은 날·요약 없는 날 제외
const mem = memoryOf([
  { date: '2026-10-03', summary: '면접 걱정', private: 0 },
  { date: '2026-10-02', summary: '비밀 요약', private: 1 },
  { date: '2026-10-01', summary: '', private: 0 },
  { date: '2026-09-20', summary: '오래됨', private: 0 },
  { date: '2026-10-04', summary: '오늘', private: 0 }
], '2026-10-04')
assert.deepEqual(mem, [{ date: '2026-10-03', summary: '면접 걱정' }])
const chat = buildBuddyMessages({ buddy, entry: { date: '2026-10-04', mood: 4, content: '기획서를 반쯤 썼다', private: 0 }, messages: [{ role: 'me', content: '안녕', safety: 0 }, { role: 'buddy', content: 'x', safety: 1 }], memory: mem })!
assert.equal(chat[0].role, 'system')
assert.match(chat[0].content, /도토리/)
assert.match(chat[1].content, /<diary>\n기획서를 반쯤 썼다\n<\/diary>/)
assert.match(chat[1].content, /<memory>\n2026-10-03: 면접 걱정/)
assert.doesNotMatch(chat[1].content, /비밀/)
// 예전 위기 카드 행(safety=1)은 건너뛴다(기능 제외, 2026-10-05)
assert.equal(chat.length, 2)
assert.ok(chat.at(-1)!.content.endsWith('\n\n안녕'))
assert.ok(!JSON.stringify(chat).includes('"x"'))
// 시스템 지시: [[SAFETY]] 없음, 자해 방법·의료 조언 금지 한 줄
assert.doesNotMatch(chat[0].content, /SAFETY/)
assert.match(chat[0].content, /자해 방법이나 진단·치료·약 같은 의료 조언은 절대 하지 마/)
// 같은 쪽 말은 합친다
assert.equal(chat.filter((m) => m.role === 'user').length, 1)
// 하이라이트·미리보기도 나만 보기를 숨김
assert.deepEqual(highlightsOf([{ date: '2026-10-01', mood: 5, content: '비밀', private: 1 }, { date: '2026-10-02', mood: 4, content: '좋은 날', private: 0 }], '2026-10'), [{ date: '2026-10-02', mood: 4, content: '좋은 날', private: 0 }])
assert.equal(previewOf({ content: '비밀\n두 줄', private: 1 }), '🔒 나만 보기')
assert.equal(previewOf({ content: '비밀\n두 줄', private: 1 }, { search: true }), '비밀')
assert.equal(previewOf({ content: '\n첫 줄', private: 0 }), '첫 줄')

// ── 답 해석 ──
assert.deepEqual(parseBuddyReply('같이 해 보자.\n할 일: 운동화 꺼내 두기.'), { text: '같이 해 보자.', task: '운동화 꺼내 두기' })
assert.deepEqual(parseBuddyReply('같이 해 보자.\n할'), { text: '같이 해 보자.', task: undefined })

// ── 첫 답 조건 ──
assert.equal(wantsFirstReply('짧다', 0), false)
assert.equal(wantsFirstReply('열 글자가 넘는 일기야', 0), true)
assert.equal(wantsFirstReply('열 글자가 넘는 일기야', 1), false)

// ── 캐릭터·말 ──
assert.deepEqual(buddyOf(undefined), { name: '새싹', species: null })
assert.equal(buddyOf({ name: null, species: 'snail' }).name, '달팽이')
assert.equal(josa('도토리', '와', '과'), '도토리와')
assert.equal(josa('거북', '와', '과'), '거북과')
assert.equal(buddyLine({ kind: 'mood', mood: 1 }), '곁에 있을게')
assert.equal(moodFaceOf(2), 'default')
assert.equal(skyOf(23), 'night')

// ── 날짜·달력(일요일 시작, 2026-10-06) ──
assert.equal(WEEK_DAYS[0], '일')
assert.equal(weekdayIdx('2026-10-04'), 0) // 일
assert.equal(weekdayIdx('2026-10-10'), 6) // 토
assert.deepEqual(weekOf('2026-10-10'), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
const grid = monthGrid('2026-10')
assert.equal(grid.length, 42)
assert.equal(grid[0], '2026-09-27')
assert.equal(dayTitle('2026-10-04'), '10월 4일 일요일')
assert.equal(moodTrend([{ date: '2026-10-02', mood: 3 }], '2026-10').length, 31)

// ── 연속·통계 ──
assert.deepEqual(streakOf(new Set(['2026-10-02', '2026-10-03']), '2026-10-04'), { days: 2, today: false })
assert.deepEqual(streakOf(new Set(['2026-10-03', '2026-10-04']), '2026-10-04'), { days: 2, today: true })
assert.equal(longestStreak(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06']), 3)
assert.equal(averageMood([{ mood: 4 }, { mood: 5 }]), null)
assert.equal(averageMood([{ mood: 4 }, { mood: 5 }, { mood: 3 }]), 4)
assert.deepEqual(moodShare([{ mood: 4 }, { mood: 4 }, { mood: 3 }, { mood: null }]).map((r) => [r.mood, r.n]), [[4, 2], [3, 1]])
assert.equal(insightOf([{ date: 'a', mood: 4 }], new Map()), '기분을 며칠 더 남기면 할 일 기록과 같이 살펴볼게요')
assert.equal(promptFor('2026-10-04'), promptFor('2026-10-04'))

// ── 연 모자이크 ──
const y = yearMosaic(2026, [{ date: '2026-10-01', mood: 4, content: '' }, { date: '2026-10-02', mood: null, content: '글' }, { date: '2026-10-03', mood: null, content: '' }], '2026-10-04')
assert.equal(y.length, 12)
assert.equal(y[1][28], null) // 2월 29일 없음
assert.equal(y[9][0]!.kind, 'mood')
assert.equal(y[9][1]!.kind, 'plain')
assert.equal(y[9][2]!.kind, 'empty') // 기분·글 다 없는 행은 안 쓴 날
assert.equal(y[9][10]!.kind, 'future')

// ── 검색·id ──
assert.deepEqual(searchEntries([{ date: '2026-10-01', content: '면접 준비' }, { date: '2026-10-03', content: '면접 끝' }, { date: '2026-10-02', content: '산책' }], '면접').map((e) => e.date), ['2026-10-03', '2026-10-01'])
assert.equal(entryId('2026-10-04', 'u1'), 'diary-2026-10-04-u1')

console.log('diary logic ok')
