// 41 (31 §12.14) 프로젝트 직접 고치기 — 순수 계산: 한 줄 인식 · ⚑ 핵심 날짜 = 마감 · 줄 = 태그(+1) · 옮기기 · 미루기(간격 그대로) · 끝 끌기 · 동기화 설정 왕복.
// mapShared.test.ts가 불러서 돈다(package.json 시험 줄을 늘리지 않으려고).
import assert from 'node:assert/strict'
import {
  buildPlanView, chipResize, dDay, encodeProjectsShared, findDayRange, keyDateRelId, keyTaskTitle, keyWordOf, laneMove, laneRelId, mergeProjectsShared, NO_LANE,
  parseProjectLine, parseProjectSettings, patchProjectSettings, projectLanes, projectSettingsId, projectSettingsMap, projectTaskInput, retitleKeyTask, shiftDates, starterFor, takeDayRange,
  type LinkRow, type PTaskRow, type TagRow
} from './planView.ts'

const today = '2026-10-06'
// ── 한 줄 인식 ──
{
  const l = parseProjectLine('투자자산운용사 시험 11/23', today)
  assert.equal(l.name, '투자자산운용사 시험')
  assert.equal(l.day, '2026-11-23')
  assert.equal(l.word, '시험')
  assert.equal(l.icon, '📜')
  assert.equal(l.keyTitle, '투자자산운용사 시험일', '이름이 날짜 이름으로 끝나면 + 일')
  assert.equal(dDay(l.day!, today), 'D-48')
  assert.equal(parseProjectLine('K 데이터 공모전 11월 3일', today).keyTitle, 'K 데이터 공모전 제출일')
  assert.equal(parseProjectLine('K 데이터 공모전 11/3', today, '발표').keyTitle, 'K 데이터 공모전 발표일', '고른 날짜 이름')
  assert.equal(parseProjectLine('🎓 졸업작품', today).emoji, '🎓')
  assert.equal(parseProjectLine('🎓 졸업작품', today).name, '졸업작품')
  assert.equal(parseProjectLine('부산 이사', today).day, null)
  assert.equal(parseProjectLine('워크숍 10/12~10/18', today).day, '2026-10-18', '기간이면 끝날')
  assert.equal(parseProjectLine('신년 계획 1/3', today).day, '2027-01-03', '90일 넘게 지난 날은 내년')
  assert.equal(starterFor('하반기 취업').ask?.add, '회사')
  assert.deepEqual(starterFor('K 데이터 공모전').ask?.lanes, ['회의', '조사', '개발', '제출'])
  assert.equal(starterFor('SQLD').icon, '📜')
  assert.equal(starterFor('부산 이사').ask, null)
  assert.equal(keyTaskTitle('토익', '시험'), '토익 시험일')
  assert.equal(keyWordOf('투자자산운용사 시험일'), '시험')
  assert.equal(keyWordOf('K 공모전 제출일'), '제출')
  assert.equal(keyWordOf('그냥 할 일'), '마감')
  assert.equal(retitleKeyTask('K 공모전 제출일', '제출', '발표'), 'K 공모전 발표일')
  assert.equal(retitleKeyTask('사람이 고친 제목', '제출', '발표'), '사람이 고친 제목')
  // 기간 떼기(빠른 추가 앞)
  assert.deepEqual(takeDayRange('1과목 1회독 10/12~10/18', today), { rest: '1과목 1회독', start: '2026-10-12', end: '2026-10-18' })
  assert.deepEqual(takeDayRange('세제 암기 카드 10/20', today), { rest: '세제 암기 카드', start: null, end: '2026-10-20' })
  assert.deepEqual(takeDayRange('정리 10/12~18', today), { rest: '정리', start: '2026-10-12', end: '2026-10-18' })
  assert.equal(takeDayRange('내일 자료 정리', today), null, '오늘·내일은 빠른 추가 인식기에 맡긴다')
  assert.equal(findDayRange('13/40 문제', today), null)
  const qi = projectTaskInput({ title: '1과목 1회독', due_at: '2026-10-18', start_at: '2026-10-12' }, { mainList: null, laneTag: 'g1' })!
  assert.equal(qi.start_at, '2026-10-12')
  assert.deepEqual(qi.tag_ids, ['g1'], '줄 태그가 붙는다')
  assert.deepEqual(projectTaskInput({ title: 'x', due_at: null, tag_ids: ['g2'] }, { mainList: null, laneTag: 'g1' })!.tag_ids, ['g2'], '#다른태그를 적으면 그 줄로')
}

// ── 줄 = 태그 · +1 · 옮기기 ──
const T = (id: string, title: string, due: string | null = null, extra: Partial<PTaskRow> = {}): PTaskRow => ({ id, title, list_id: 'l', status: 0, priority: 0, due_at: due, start_at: null, created_at: '2026-10-01T00:00:00Z', ...extra })
const tag = (id: string, name: string, kind: string | null = 'topic'): TagRow => ({ id, name, kind, aliases: null, source: 'user', home_type: null, home_id: null, topic_id: null })
const link = (task: string, tagId: string, state: string | null = null): LinkRow => ({ id: `${task}-${tagId}`, task_id: task, tag_id: tagId, source: 'user', state })
{
  const tags = [tag('p', '투자자산운용사 시험', 'project'), tag('fin', '금융상품'), tag('law', '법규'), tag('inv', '투자운용'), tag('min', '민수', 'person'), tag('old', '기출')]
  const members = [T('a', '1과목 1회독'), T('b', '세제 암기 카드'), T('c', '법규 정리'), T('d', '원서 접수'), T('e', '두 줄 태그')]
  const links = [link('a', 'fin'), link('b', 'fin'), link('c', 'law'), link('c', 'min'), link('e', 'law'), link('e', 'fin'), link('d', 'old', 'dismissed')]
  const r = projectLanes(members, { tags, links, manual: [{ tag_id: 'inv', created_at: '2026-10-02' }, { tag_id: 'law', created_at: '2026-10-01' }], order: ['fin'] })
  assert.deepEqual(r.lanes.map((l) => l.id), ['fin', 'law', 'inv', NO_LANE], '손 순서 → 만든 줄(만든 순) → 태그 없음 맨 끝')
  assert.deepEqual(r.lanes.find((l) => l.id === 'inv')!.items, [], '빈 줄도 남는다')
  assert.equal(r.laneOf.get('e'), 'fin', '줄 태그 둘 = 앞 줄에만')
  assert.equal(r.more.get('e'), 1, '+1')
  assert.equal(r.laneOf.get('c'), 'law', '사람 태그는 줄이 아니다')
  assert.equal(r.laneOf.get('d'), NO_LANE, '뗀(dismissed) 태그는 줄이 아니다')
  assert.ok(!r.more.has('a'))
  assert.deepEqual(laneMove(r.tagsOf.get('e')!, 'fin', 'inv'), { remove: ['fin'], add: ['inv'] }, '앞 줄 태그만 바뀜')
  assert.deepEqual(laneMove(r.tagsOf.get('e')!, 'fin', 'law'), { remove: ['fin'], add: [] }, '이미 붙은 태그 줄로 옮기면 떼기만')
  assert.deepEqual(laneMove(r.tagsOf.get('e')!, 'fin', NO_LANE), { remove: ['fin', 'law'], add: [] }, '태그 없음 = 줄 태그 모두 뗌')
  assert.deepEqual(laneMove([], NO_LANE, 'law'), { remove: [], add: ['law'] })
  // 손 순서 없음 → 만든 줄 → 구성원 많은 순
  const r2 = projectLanes(members, { tags, links, manual: [] })
  assert.deepEqual(r2.lanes.map((l) => l.id), ['fin', 'law', NO_LANE])
}

// ── 미루기·날짜 고르기: 간격 그대로 · 끝낸 일·날짜 없는 일은 그대로 ──
{
  const ts = [T('a', 'a', '2026-10-18', { start_at: '2026-10-12' }), T('b', 'b', '2026-10-20T15:00'), T('c', 'c'), T('d', 'd', '2026-10-09', { status: 1 })]
  assert.deepEqual(shiftDates(ts, { days: 7 }), [
    { id: 'a', start_at: '2026-10-19', due_at: '2026-10-25' },
    { id: 'b', start_at: null, due_at: '2026-10-27T15:00' }
  ], '일주일 미루기 — 기간·시각 그대로')
  assert.deepEqual(shiftDates(ts, { anchor: '2026-11-02' }), [
    { id: 'a', start_at: '2026-11-02', due_at: '2026-11-08' },
    { id: 'b', start_at: null, due_at: '2026-11-10T15:00' }
  ], '가장 이른 일이 그날로, 나머지는 간격 그대로(10/12→11/2 = 21일)')
  assert.deepEqual(shiftDates([T('c', 'c')], { days: 1 }), [])
  // 끝 끌기
  assert.deepEqual(chipResize(T('x', 'x', '2026-10-12'), 'end', '2026-10-19'), { id: 'x', start_at: '2026-10-12', due_at: '2026-10-19' }, '점 → 막대')
  assert.deepEqual(chipResize(T('x', 'x', '2026-10-19', { start_at: '2026-10-12' }), 'end', '2026-10-01'), { id: 'x', start_at: null, due_at: '2026-10-12' }, '끝날은 시작 앞으로 안 감 → 같아지면 점')
  assert.deepEqual(chipResize(T('x', 'x', '2026-10-19', { start_at: '2026-10-12' }), 'start', '2026-10-10'), { id: 'x', start_at: '2026-10-10', due_at: '2026-10-19' })
  assert.equal(chipResize(T('x', 'x'), 'end', '2026-10-10'), null)
}

// ── ⚑ 핵심 날짜 = 프로젝트 마감 · 팀원 · 설정 → buildPlanView ──
{
  const tags = [tag('p', '📜 투자자산운용사 시험', 'project'), tag('law', '법규'), tag('min', '민수', 'person')]
  const tasks = [T('k', '투자자산운용사 시험일', '2026-11-23'), T('a', '법규 정리', '2026-10-20'), T('z', '최종 제출', '2026-12-01')]
  const links = [link('k', 'p'), link('a', 'p'), link('z', 'p'), link('a', 'law')]
  const base = { tasks, tags, links, lists: [{ id: 'l', name: '공부', emoji: null, folder_id: null, kind: null }], folders: [], seq: [], pstore: { dismissed: [], confirmed: {} }, today, suggest: false }
  const off = buildPlanView(base).projects[0]
  assert.equal(off.deadline?.taskId, 'z', '이음이 없으면 강한 마감 말(제출)')
  assert.equal(off.laneBy, 'kind', '설정 없는 원래 프로젝트는 일의 종류')
  const v = buildPlanView({
    ...base,
    deadlines: [{ tag_id: 'p', task_id: 'k' }],
    lanes: [{ project_id: 'p', tag_id: 'law' }],
    settings: [{ view_key: 'project:p', options_json: patchProjectSettings(null, { by: 'tag' }) }],
    team: [{ project_id: 'p', tag_id: 'min', name: '민수' }]
  }).projects[0]
  assert.deepEqual(v.deadline, { day: '2026-11-23', word: '시험', taskId: 'k' }, '⚑ 할 일 날짜가 마감 · 이름은 제목에서')
  assert.equal(v.keyTask?.id, 'k')
  assert.equal(v.laneBy, 'tag')
  assert.deepEqual(v.team, [{ id: 'min', name: '민수' }])
  assert.deepEqual(v.tagLanes.lanes.map((l) => l.id), ['law', NO_LANE])
  // ⚑ 할 일을 옮기면(같은 행) 마감도 같이
  const moved = buildPlanView({ ...base, tasks: tasks.map((t) => (t.id === 'k' ? { ...t, due_at: '2026-11-08' } : t)), deadlines: [{ tag_id: 'p', task_id: 'k' }] }).projects[0]
  assert.equal(moved.deadline?.day, '2026-11-08')
  // ⚑ 할 일이 지워지면(질의에 없음) 다시 제목 규칙
  assert.equal(buildPlanView({ ...base, tasks: tasks.filter((t) => t.id !== 'k'), deadlines: [{ tag_id: 'p', task_id: 'k' }] }).projects[0].deadline?.taskId, 'z')
  assert.ok(keyDateRelId('p').startsWith('rel-') && keyDateRelId('p') !== keyDateRelId('q'))
  assert.notEqual(laneRelId('p', 'law'), laneRelId('p', 'fin'))
}

// ── 동기화 설정 왕복(view_settings options_json) — 기기 A가 쓰고 기기 B가 읽는다 ──
{
  // 프로젝트 설정: 같은 id(두 기기가 따로 만들어도 한 행) · 모르는 칸은 남긴다
  assert.equal(projectSettingsId('p'), projectSettingsId('p'))
  assert.notEqual(projectSettingsId('p'), projectSettingsId('q'))
  const a1 = patchProjectSettings(null, { by: 'tag', order: ['fin', 'law'] })
  const a2 = patchProjectSettings(JSON.stringify({ ...JSON.parse(a1), future: 1 }), { starterSeen: true, view: 'timeline', zoom: 'month' })
  assert.deepEqual(JSON.parse(a2).future, 1, '새 앱이 더한 칸을 지우지 않는다')
  const onB = projectSettingsMap([{ view_key: 'project:p', options_json: a2 }, { view_key: 'calendar', options_json: '{}' }])
  assert.deepEqual(onB.get('p'), { by: 'tag', order: ['fin', 'law'], starterSeen: true, view: 'timeline', zoom: 'month' })
  assert.equal(onB.size, 1)
  assert.deepEqual(parseProjectSettings('{"by":"weird","order":[1,"x"]}'), { order: ['x'] }, '깨진 값은 버린다')
  assert.deepEqual(parseProjectSettings('not json'), {})
  // 보드 공통 기억: 두 기기가 따로 만든 행 → 합침
  const A = encodeProjectsShared({ dismissed: ['블로그'], confirmed: { p: 3 }, skip: ['t1'] })
  const B = encodeProjectsShared({ dismissed: ['여행'], confirmed: { p: 5, q: 1 }, skip: [], auto: false })
  assert.deepEqual(mergeProjectsShared([{ options_json: A }, { options_json: B }]), { dismissed: ['블로그', '여행'], confirmed: { p: 5, q: 1 }, skip: ['t1'], auto: false })
  assert.deepEqual(mergeProjectsShared([]), { dismissed: [], confirmed: {}, skip: [] })
}
console.log('project direct ok')
