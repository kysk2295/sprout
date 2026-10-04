// 17 틱틱에서 가져오기: 공식 Open API 응답 모양의 예제로 매핑·시간대·종일·우선순위·반복·알림·하위 태스크·체크 항목·태그·노트·다시 가져오기
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import {
  planImport, mapDates, mapRepeat, mapReminder, triggerMinutes, parseTT, wallClock, splitEmoji, mapPriority, mapStatus, fetchCompleted, createLimiter, isInboxProject,
  type TTBundle, type TTTask, type MapContext
} from '../src/shared/ticktick'
import { applyImport, buildContext, previewImport, organizeImported, importedOpenTaskIds } from '../src/renderer/src/data/ticktickImport'
import { insert, run } from '../src/renderer/src/data/mutations'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql:string, params:unknown[]=[]) => {const s=db.prepare(sql);s.bind(params as never);const r:Record<string,unknown>[]=[];while(s.step())r.push(s.getAsObject());s.free();return r}
const store = new Map<string,string>()
Object.assign(globalThis,{localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)},window:{sprout:{db:{getAll:async(sql:string,p?:unknown[])=>all(sql,p),get:async(sql:string,p?:unknown[])=>all(sql,p)[0]??null,transaction:async(stmts:{sql:string;params?:unknown[]}[])=>{db.run('BEGIN');try{for(const s of stmts)db.run(s.sql,s.params as never);db.run('COMMIT')}catch(e){db.run('ROLLBACK');throw e}}}}}})

// ── 작은 함수들 ──
assert.equal(parseTT('2019-11-13T03:00:00+0000')?.toISOString(), '2019-11-13T03:00:00.000Z')
assert.equal(parseTT('2026-03-04T23:58:20.000+0000')?.toISOString(), '2026-03-04T23:58:20.000Z')
assert.equal(parseTT('2026-10-05T09:00:00+09:00')?.toISOString(), '2026-10-05T00:00:00.000Z')
assert.equal(parseTT('2026-10-05T00:00:00Z')?.toISOString(), '2026-10-05T00:00:00.000Z')
assert.equal(parseTT('garbage'), null)
assert.equal(parseTT(undefined), null)
assert.equal(wallClock(new Date('2026-10-04T15:00:00Z'), 'Asia/Seoul'), '2026-10-05T00:00')
assert.equal(wallClock(new Date('2026-03-08T10:30:00Z'), 'America/Los_Angeles'), '2026-03-08T03:30', '서머타임 시작일')
assert.deepEqual([0, 1, 3, 5, undefined].map(mapPriority), [0, 1, 2, 3, 0])
assert.deepEqual([0, 2, -1, undefined].map(mapStatus), [0, 1, 2, 0])
assert.ok(isInboxProject('inbox118000123') && isInboxProject('inbox') && isInboxProject(undefined) && !isInboxProject('6226ff9877acee87727f6bca'))
assert.deepEqual(splitEmoji('🏠 집'), { emoji: '🏠', name: '집' })
assert.deepEqual(splitEmoji('👨‍👩‍👧 가족'), { emoji: '👨‍👩‍👧', name: '가족' })
assert.deepEqual(splitEmoji('Work'), { emoji: null, name: 'Work' })
assert.deepEqual(splitEmoji('🎯'), { emoji: null, name: '🎯' }, '이모지뿐이면 이름으로 둔다')

// 시간대 → floating
assert.deepEqual(mapDates({ startDate: '2026-10-05T00:30:00.000+0000', dueDate: '2026-10-05T00:30:00.000+0000', isAllDay: false, timeZone: 'Asia/Seoul' }, 'UTC'), { start_at: null, due_at: '2026-10-05T09:30', is_all_day: 0 })
assert.deepEqual(mapDates({ startDate: '2026-10-05T23:00:00+0000', dueDate: '2026-10-06T01:00:00+0000', isAllDay: false, timeZone: 'America/Los_Angeles' }, 'UTC'), { start_at: '2026-10-05T16:00', due_at: '2026-10-05T18:00', is_all_day: 0 })
assert.deepEqual(mapDates({ dueDate: '2026-10-05T00:30:00+0000', isAllDay: false }, 'Asia/Seoul'), { start_at: null, due_at: '2026-10-05T09:30', is_all_day: 0 }, '시간대 없으면 사용자 시간대')
assert.deepEqual(mapDates({ startDate: '2026-10-04T15:00:00.000+0000', dueDate: '2026-10-04T15:00:00.000+0000', isAllDay: true, timeZone: 'Asia/Seoul' }, 'UTC'), { start_at: null, due_at: '2026-10-05', is_all_day: 1 })
assert.deepEqual(mapDates({ startDate: '2026-10-04T15:00:00+0000', dueDate: '2026-10-05T15:00:00+0000', isAllDay: true, timeZone: 'Asia/Seoul' }, 'UTC'), { start_at: null, due_at: '2026-10-05', is_all_day: 1 }, '끝 미포함 하루짜리')
assert.deepEqual(mapDates({ startDate: '2026-10-09T15:00:00+0000', dueDate: '2026-10-12T15:00:00+0000', isAllDay: true, timeZone: 'Asia/Seoul' }, 'UTC'), { start_at: '2026-10-10', due_at: '2026-10-12', is_all_day: 1 }, '여러 날 종일')
assert.deepEqual(mapDates({ isAllDay: true }, 'UTC'), { start_at: null, due_at: null, is_all_day: 1 })
assert.deepEqual(mapDates({ startDate: '2026-10-04T15:00:00+0000', isAllDay: true, timeZone: 'Bad/Zone' }, 'Asia/Seoul'), { start_at: null, due_at: '2026-10-05', is_all_day: 1 }, '모르는 시간대는 대체')

// 반복
assert.equal(mapRepeat('RRULE:FREQ=DAILY;INTERVAL=1'), 'FREQ=DAILY')
assert.equal(mapRepeat('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=MO'), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
assert.equal(mapRepeat('RRULE:FREQ=MONTHLY;BYDAY=-1FR'), 'FREQ=MONTHLY;BYDAY=-1FR')
assert.equal(mapRepeat('RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14;UNTIL=20301231T000000Z'), 'FREQ=YEARLY;BYMONTHDAY=14;BYMONTH=3;UNTIL=20301231', 'sprout 표준 순서')
assert.equal(mapRepeat('RRULE:FREQ=DAILY;TT_SKIP=HOLIDAY'), 'FREQ=DAILY', '틱틱 전용 키는 버린다')
assert.equal(mapRepeat('RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR'), null, '의미가 바뀌는 키는 포기')
assert.equal(mapRepeat('ERRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1'), null, '음력')
assert.equal(mapRepeat('RRULE:FREQ=HOURLY'), null)
assert.equal(mapRepeat(''), null)

// 알림
assert.equal(triggerMinutes('TRIGGER:-PT15M'), -15)
assert.equal(triggerMinutes('TRIGGER:PT0S'), 0)
assert.equal(triggerMinutes('TRIGGER:P0DT9H0M0S'), 540)
assert.equal(triggerMinutes('TRIGGER:-P1DT15H0M0S'), -2340)
assert.equal(triggerMinutes('TRIGGER;VALUE=DATE-TIME:20261005T090000Z'), null)
assert.equal(mapReminder('TRIGGER:-PT15M', false), '-PT15M')
assert.equal(mapReminder('TRIGGER:PT0S', false), '-PT0M', '정각에')
assert.equal(mapReminder('TRIGGER:-P1D', false), '-P1D')
assert.equal(mapReminder('TRIGGER:-PT1H', false), '-PT1H')
assert.equal(mapReminder('TRIGGER:P0DT9H0M0S', true), 'PT9H', '종일 당일 9시')
assert.equal(mapReminder('TRIGGER:-P0DT15H0M0S', true), '-PT15H', '종일 하루 전 9시')
assert.equal(mapReminder('TRIGGER:-P1DT15H0M0S', true), '-P1DT15H')
assert.equal(mapReminder('TRIGGER:PT10M', false), null, '시작 뒤 알림은 없음')

// ── 완료 기록: 200개가 차면 기간을 반으로 나눈다 ──
{
  const base = Date.UTC(2020, 0, 1)
  const done: TTTask[] = Array.from({ length: 450 }, (_, i) => ({ id: `c${i}`, status: 2, completedTime: new Date(base + i * 86_400_000).toISOString().replace('Z', '+0000') }))
  let calls = 0
  const get = async (b: { startDate: string; endDate: string }) => {
    calls++
    const a = parseTT(b.startDate)!.getTime(), z = parseTT(b.endDate)!.getTime()
    return done.filter((t) => { const c = parseTT(t.completedTime)!.getTime(); return c >= a && c <= z }).slice(0, 200)
  }
  const got = await fetchCompleted(get, ['p1'], Date.UTC(2010, 0, 1), Date.UTC(2027, 0, 1))
  assert.equal(got.length, 450, '잘림 없이 전부')
  assert.equal(new Set(got.map((t) => t.id)).size, 450)
  assert.ok(calls < 40, `요청 수가 적당하다 (${calls})`)
}
// 요청 한도: 1분 3회로 줄이면 네 번째는 기다린다
{
  let t = 0
  const waits: number[] = []
  const limit = createLimiter(3, 100, { now: () => t, sleep: async (ms) => { waits.push(ms); t += ms } })
  for (let i = 0; i < 4; i++) await limit()
  assert.equal(waits.length, 1)
  assert.ok(t >= 60_000, '1분 창이 지나야 네 번째')
}

// ── 예제 묶음(공식 문서 응답 모양) ──
const bundle: TTBundle = {
  fetchedAt: '2026-10-04T12:00:00.000Z',
  timeZone: 'Asia/Seoul',
  projects: [
    { id: '6226ff9877acee87727f6bca', name: '🏠 집', color: '#f18181', closed: false, groupId: '6436176a47fd2e05f26ef56e', viewMode: 'list', permission: 'write', kind: 'TASK', sortOrder: 2 },
    { id: '6226ff9877acee87727f6bcb', name: '회사', color: '#4772FA', closed: false, groupId: '6436176a47fd2e05f26ef56e', viewMode: 'kanban', kind: 'TASK', sortOrder: 1 },
    { id: '6226ff9877acee87727f6bcc', name: '아이디어 노트', kind: 'NOTE', sortOrder: 3 },
    { id: '6226ff9877acee87727f6bcd', name: '옛 프로젝트', closed: true, kind: 'TASK', sortOrder: 4 }
  ],
  groups: [{ id: '6436176a47fd2e05f26ef56e', name: '생활', sortOrder: 0, showAll: true, viewMode: 'list' }, { id: 'unused-group', name: '빈 폴더', sortOrder: 1 }],
  tags: [
    { name: 'work', label: 'Work', sortOrder: 0, color: '#4772FA', type: 1 },
    { name: 'urgent', label: 'Urgent', sortOrder: 1, color: '#F18181', parent: 'work', type: 1 },
    { name: 'home', label: 'home', sortOrder: 2, type: 1 }
  ],
  data: {
    '6226ff9877acee87727f6bca': {
      project: { id: '6226ff9877acee87727f6bca', name: '🏠 집', kind: 'TASK' },
      tasks: [
        { id: 'a1', projectId: '6226ff9877acee87727f6bca', title: '주간 회고', content: '지난주 돌아보기', timeZone: 'Asia/Seoul', isAllDay: false, startDate: '2026-10-05T00:30:00.000+0000', dueDate: '2026-10-05T00:30:00.000+0000', priority: 5, status: 0, sortOrder: -1099511627776, reminders: ['TRIGGER:-PT15M', 'TRIGGER:PT0S', 'TRIGGER:-PT15M'], tags: ['work', 'urgent'], repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;WKST=MO', repeatFrom: '1', kind: 'TEXT' },
        { id: 'a2', projectId: '6226ff9877acee87727f6bca', title: '분리수거', isAllDay: true, timeZone: 'Asia/Seoul', startDate: '2026-10-04T15:00:00.000+0000', dueDate: '2026-10-04T15:00:00.000+0000', priority: 3, status: 0, reminders: ['TRIGGER:P0DT9H0M0S', 'TRIGGER:-P0DT15H0M0S'], tags: ['home'], kind: 'TEXT' },
        { id: 'a3', projectId: '6226ff9877acee87727f6bca', title: '제주 여행', isAllDay: true, timeZone: 'Asia/Seoul', startDate: '2026-10-09T15:00:00+0000', dueDate: '2026-10-12T15:00:00+0000', priority: 0, status: 0, kind: 'TEXT' },
        { id: 'a4', projectId: '6226ff9877acee87727f6bca', title: '캠핑 짐', desc: '준비물', content: '', kind: 'CHECKLIST', status: 0, priority: 1, items: [
          { id: 'i2', title: '랜턴', status: 1, completedTime: '2026-10-01T03:00:00.000+0000', sortOrder: 2 },
          { id: 'i1', title: '텐트', status: 0, sortOrder: 1, isAllDay: false, timeZone: 'Asia/Seoul' }
        ] },
        { id: 'a5', projectId: '6226ff9877acee87727f6bca', parentId: 'a1', title: '회고 자료 모으기', timeZone: 'America/Los_Angeles', isAllDay: false, startDate: '2026-10-05T23:00:00+0000', dueDate: '2026-10-06T01:00:00+0000', status: 0, priority: 0, kind: 'TEXT' },
        { id: 'a6', projectId: '6226ff9877acee87727f6bca', title: '설날', isAllDay: true, timeZone: 'Asia/Seoul', startDate: '2027-02-05T15:00:00+0000', dueDate: '2027-02-05T15:00:00+0000', repeatFlag: 'ERRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1', status: 0, kind: 'TEXT' },
        { id: 'a7', projectId: '6226ff9877acee87727f6bca', title: '월말 정산', isAllDay: true, timeZone: 'Asia/Seoul', startDate: '2026-10-29T15:00:00+0000', dueDate: '2026-10-29T15:00:00+0000', repeatFlag: 'RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR', status: 0, kind: 'TEXT' },
        { id: 'a8', projectId: '6226ff9877acee87727f6bca', title: '언젠가 읽기', reminders: ['TRIGGER:-PT5M'], tags: ['NewTag'], status: 0, kind: 'TEXT' },
        { id: 'orphan', projectId: '6226ff9877acee87727f6bca', parentId: 'gone', title: '부모가 없는 하위', status: 0, kind: 'TEXT' }
      ],
      columns: []
    },
    '6226ff9877acee87727f6bcb': {
      project: { id: '6226ff9877acee87727f6bcb', name: '회사', kind: 'TASK', viewMode: 'kanban' },
      tasks: [
        { id: 'b1', projectId: '6226ff9877acee87727f6bcb', columnId: 'col2', title: '주간 보고', content: '회의록', priority: 1, status: 0, kind: 'TEXT', createdTime: '2026-09-01T02:00:00.000+0000', modifiedTime: '2026-09-02T02:00:00.000+0000' }
      ],
      columns: [{ id: 'col2', projectId: '6226ff9877acee87727f6bcb', name: '진행 중', sortOrder: 1 }, { id: 'col1', projectId: '6226ff9877acee87727f6bcb', name: '할 일', sortOrder: 0 }]
    },
    '6226ff9877acee87727f6bcc': {
      project: { id: '6226ff9877acee87727f6bcc', name: '아이디어 노트', kind: 'NOTE' },
      tasks: [
        { id: 'n1', projectId: '6226ff9877acee87727f6bcc', title: '책 아이디어', content: '주인공은 고양이', kind: 'NOTE', status: 0 },
        { id: 'n2', projectId: '6226ff9877acee87727f6bcc', title: '', content: 'https://example.com/article', kind: 'NOTE', status: 0 },
        { id: 'n3', projectId: '6226ff9877acee87727f6bcc', title: '', content: '', kind: 'NOTE', status: 0 }
      ]
    },
    '6226ff9877acee87727f6bcd': { project: { id: '6226ff9877acee87727f6bcd', name: '옛 프로젝트', closed: true }, tasks: [] }
  },
  inbox: { tasks: [{ id: 'i-1', projectId: 'inbox118000123', title: '우유 사기', status: 0, priority: 0, kind: 'TEXT' }], columns: [] },
  completed: [
    { id: 'c1', projectId: '6226ff9877acee87727f6bca', title: '보일러 점검', status: 2, completedTime: '2026-09-30T11:00:00.000+0000', dueDate: '2026-09-29T15:00:00.000+0000', isAllDay: true, timeZone: 'Asia/Seoul', kind: 'TEXT', etag: 'x' } as TTTask,
    { id: 'c2', projectId: 'deleted-project', title: '지운 리스트의 일', status: 2, completedTime: '2026-08-01T00:00:00.000+0000', kind: 'TEXT' },
    { id: 'w1', projectId: '6226ff9877acee87727f6bca', title: '포기한 일', status: -1, kind: 'TEXT' }
  ],
  warnings: []
}

const ctx: MapContext = { scope: 'u1', inboxId: 'inbox-local', tagIdsByName: { home: 'tag-home' }, listSortBase: 5, folderSortBase: 0, tagSortBase: 2, now: '2026-10-04T12:00:00.000Z', createdFallback: '2026-09-30T23:59:59.000Z', deviceTimeZone: 'UTC' }
const plan = planImport(bundle, ctx)
const byId = <T extends { id?: unknown }>(rows: T[], id: string) => rows.find((r) => r.id === id)!
const task = (tt: string) => byId(plan.tasks, `tt-u1-task-${tt}`)

// 폴더·리스트
assert.deepEqual(plan.folders.map((f) => f.name), ['생활'], '쓰이는 폴더만')
const home = byId(plan.lists, 'tt-u1-list-6226ff9877acee87727f6bca')
assert.equal(home.name, '집'); assert.equal(home.emoji, '🏠'); assert.equal(home.color, '#F18181'); assert.equal(home.folder_id, 'tt-u1-folder-6436176a47fd2e05f26ef56e')
assert.deepEqual(plan.lists.map((l) => l.name), ['회사', '집', '옛 프로젝트'], '틱틱 순서, 노트 리스트는 리스트를 만들지 않는다')
assert.equal(plan.lists[0].sort_order, 6, '기존 리스트 뒤')
assert.ok(byId(plan.lists, 'tt-u1-list-6226ff9877acee87727f6bcd').archived_at, '닫힌 리스트는 보관')
assert.equal(byId(plan.lists, 'tt-u1-list-6226ff9877acee87727f6bcd').folder_id, null)
// 섹션(칸반 열)
assert.deepEqual(plan.sections.map((s) => [s.name, s.sort_order, s.list_id]), [['할 일', 0, 'tt-u1-list-6226ff9877acee87727f6bcb'], ['진행 중', 1, 'tt-u1-list-6226ff9877acee87727f6bcb']])
assert.equal(task('b1').section_id, 'tt-u1-section-col2')
// 할 일 필드
const a1 = task('a1')
assert.equal(a1.list_id, 'tt-u1-list-6226ff9877acee87727f6bca')
assert.equal(a1.due_at, '2026-10-05T09:30'); assert.equal(a1.start_at, null); assert.equal(a1.is_all_day, 0); assert.equal(a1.time_zone, 'floating')
assert.equal(a1.priority, 3); assert.equal(a1.status, 0); assert.equal(a1.content, '지난주 돌아보기'); assert.equal(a1.content_mode, 'text')
assert.equal(a1.repeat_rule, 'FREQ=WEEKLY;BYDAY=MO,WE'); assert.equal(a1.repeat_from, 'completion')
assert.equal(a1.sort_order, -1099511627776)
assert.equal(a1.created_at, ctx.createdFallback, '만든 시각이 없으면 대체값')
assert.deepEqual(plan.reminders.filter((r) => r.task_id === a1.id).map((r) => r.trigger).sort(), ['-PT0M', '-PT15M'], '중복 알림은 하나로')
const a2 = task('a2')
assert.equal(a2.due_at, '2026-10-05'); assert.equal(a2.is_all_day, 1); assert.equal(a2.priority, 2)
assert.deepEqual(plan.reminders.filter((r) => r.task_id === a2.id).map((r) => r.trigger).sort(), ['-PT15H', 'PT9H'])
assert.equal(a2.repeat_rule, null); assert.equal(a2.repeat_from, null)
assert.deepEqual([task('a3').start_at, task('a3').due_at], ['2026-10-10', '2026-10-12'])
// 체크 항목
const a4 = task('a4')
assert.equal(a4.content_mode, 'checklist'); assert.equal(a4.content, '준비물'); assert.equal(a4.priority, 1)
const items = plan.check_items.filter((c) => c.task_id === a4.id)
assert.deepEqual(items.map((c) => [c.title, c.done, c.sort_order]), [['텐트', 0, 0], ['랜턴', 1, 1]])
assert.equal(items[1].completed_at, '2026-10-01T03:00:00.000Z')
// 하위 태스크
assert.equal(task('a5').parent_id, a1.id)
assert.deepEqual([task('a5').start_at, task('a5').due_at], ['2026-10-05T16:00', '2026-10-05T18:00'], '할 일마다 자기 시간대')
assert.equal(task('orphan').parent_id, null, '부모가 가져오기에 없으면 맨 위 단계')
// 반복을 못 옮긴 것
assert.equal(task('a6').repeat_rule, null); assert.equal(task('a6').due_at, '2027-02-06')
assert.equal(task('a7').repeat_rule, null)
assert.equal(plan.stats.droppedRepeat, 2)
// 날짜 없는 할 일의 알림은 버린다
assert.equal(plan.reminders.filter((r) => r.task_id === task('a8').id).length, 0)
assert.ok(plan.stats.droppedReminders >= 1)
// 태그: 부모·기존 태그 재사용·목록에 없는 태그
const work = plan.tags.find((t) => t.name === 'Work')!
const urgent = plan.tags.find((t) => t.name === 'Urgent')!
assert.equal(urgent.parent_id, work.id); assert.equal(work.parent_id, null); assert.equal(work.color, '#4772FA')
assert.ok(!plan.tags.some((t) => t.name === 'home'), '같은 이름 태그가 있으면 새로 만들지 않는다')
assert.ok(plan.tags.some((t) => t.name === 'NewTag'))
assert.deepEqual(plan.task_tags.filter((t) => t.task_id === a1.id).map((t) => t.tag_id).sort(), [urgent.id, work.id].sort())
assert.deepEqual(plan.task_tags.filter((t) => t.task_id === a2.id).map((t) => t.tag_id), ['tag-home'])
// 받은함·완료·포기·모르는 리스트
assert.equal(task('i-1').list_id, 'inbox-local')
const c1 = task('c1')
assert.equal(c1.status, 1); assert.equal(c1.completed_at, '2026-09-30T11:00:00.000Z'); assert.equal(c1.due_at, '2026-09-30')
assert.equal(task('c2').list_id, 'inbox-local')
assert.ok(plan.warnings.some((w) => w.includes('기본함')))
assert.equal(task('w1').status, 2, '포기 → 하지 않음')
// 칸반 할 일의 만든·고친 시각
assert.equal(task('b1').created_at, '2026-09-01T02:00:00.000Z'); assert.equal(task('b1').modified_at, '2026-09-02T02:00:00.000Z')
// 노트 → 수집함(빈 노트는 버림)
assert.deepEqual(plan.notes.map((n) => [n.id, n.content]), [['tt-u1-note-n1', '책 아이디어\n\n주인공은 고양이'], ['tt-u1-note-n2', 'https://example.com/article']])
assert.ok(!plan.tasks.some((t) => String(t.id).includes('-task-n')), '노트는 할 일이 아니다')
// 통계
assert.equal(plan.stats.tasks, 14)
assert.equal(plan.stats.completed, 2); assert.equal(plan.stats.wontDo, 1); assert.equal(plan.stats.open, 11)
assert.equal(plan.stats.repeating, 1); assert.equal(plan.stats.notes, 2); assert.equal(plan.stats.lists, 3); assert.equal(plan.stats.subtasks, 1)
assert.equal(plan.stats.dated, 7)
// 결정적: 두 번 돌려도 같다
assert.deepEqual(planImport(bundle, ctx), plan)
// 범위가 다르면 id도 다르다(다른 sprout 사용자와 서버에서 부딪치지 않게)
assert.ok(planImport(bundle, { ...ctx, scope: 'u2' }).tasks.every((t) => String(t.id).startsWith('tt-u2-task-')))

// ── DB에 쓰기·다시 가져오기 ──
store.set('sprout.map.since', '2026-10-02T00:00:00.000Z')
await run(
  insert('lists', { id: 'inbox-local', name: '기본함', kind: 'inbox', sort_order: 0, pinned: 0, show_in_smart: 'all' }),
  insert('lists', { id: 'mine', name: '내 리스트', kind: 'normal', sort_order: 3, pinned: 0, show_in_smart: 'all' }),
  insert('tags', { id: 'tag-home', name: 'Home', sort_order: 1 })
)
const realCtx = await buildContext('2026-10-04T12:00:00.000Z')
assert.equal(realCtx.inboxId, 'inbox-local')
assert.equal(realCtx.listSortBase, 3)
assert.equal(realCtx.tagIdsByName!.home, 'tag-home')
assert.equal(realCtx.createdFallback, '2026-10-01T23:59:59.000Z', '자동 분류 기준 시각보다 앞')
const scope = realCtx.scope
const first = await previewImport(bundle, realCtx)
assert.equal(first.already, 0)
assert.deepEqual(first.counts, { lists: 3, tasks: 14, completed: 2, dated: 7, repeating: 1, notes: 2, already: 0 })
const progress: number[] = []
const res = await applyImport(first.plan, (d) => progress.push(d))
assert.equal(res.inserted.tasks, 14); assert.equal(res.inserted.notes, 2); assert.equal(res.inserted.lists, 3); assert.equal(res.inserted.folders, 1)
assert.equal(res.inserted.check_items, 2); assert.equal(res.inserted.sections, 2)
assert.equal(res.skipped, 0)
assert.equal(progress.at(-1), Object.values(res.inserted).reduce((a, b) => a + b, 0))
assert.equal(res.openTaskIds.length, 11)
assert.equal(all('SELECT count(*) AS n FROM tasks')[0].n, 14)
const homeTask = all('SELECT * FROM tasks WHERE id = ?', [`tt-${scope}-task-a2`])[0]
assert.equal(homeTask.due_at, '2026-10-05'); assert.equal(homeTask.owner_id, 'local')
assert.equal(all('SELECT tag_id FROM task_tags WHERE task_id = ?', [`tt-${scope}-task-a2`])[0].tag_id, 'tag-home', '기존 태그에 붙는다')
assert.equal(all('SELECT count(*) AS n FROM tags')[0].n, 4, 'Home + Work·Urgent·NewTag')
assert.equal(all('SELECT created_at FROM tasks WHERE id = ?', [`tt-${scope}-task-b1`])[0].created_at, '2026-09-01T02:00:00.000Z', '틱틱 만든 시각 유지')
assert.ok(all("SELECT count(*) AS n FROM tasks WHERE created_at > '2026-10-02T00:00:00.000Z'")[0].n === 0, '자동 분류 대상이 생기지 않는다')
const notes = all('SELECT * FROM notes ORDER BY id')
assert.deepEqual(notes.map((n) => [n.source, n.kind, n.ai_state]), [['ticktick_import', null, 'pending'], ['ticktick_import', 'link', 'done']], '수집함 규칙: 링크만 있으면 볼 것, 아니면 AI 대기')
assert.equal(notes[1].url, 'https://example.com/article')
assert.equal(notes[0].fingerprint, 'ticktick:n1')

// sprout에서 고친 뒤 다시 가져오기 → 겹치지 않고 덮어쓰지 않는다
await run({ sql: 'UPDATE tasks SET title = ? WHERE id = ?', params: ['내가 고친 제목', `tt-${scope}-task-a1`] })
const again = await previewImport(bundle, await buildContext('2026-10-05T12:00:00.000Z'))
assert.equal(again.already, 16)
const res2 = await applyImport(again.plan)
assert.equal(Object.values(res2.inserted).reduce((a, b) => a + b, 0), 0)
assert.equal(res2.skipped, 16)
for (const t of ['tasks', 'notes', 'lists', 'folders', 'sections', 'tags', 'check_items', 'task_tags', 'reminders']) {
  assert.equal(all(`SELECT count(*) AS n FROM ${t}`)[0].n, all(`SELECT count(DISTINCT id) AS n FROM ${t}`)[0].n)
}
assert.equal(all('SELECT count(*) AS n FROM tasks')[0].n, 14)
assert.equal(all('SELECT count(*) AS n FROM tags')[0].n, 4)
assert.equal(all('SELECT title FROM tasks WHERE id = ?', [`tt-${scope}-task-a1`])[0].title, '내가 고친 제목')
// 틱틱에 새 할 일이 생기면 그것만 들어온다
const more: TTBundle = { ...bundle, data: { ...bundle.data, '6226ff9877acee87727f6bca': { ...bundle.data['6226ff9877acee87727f6bca'], tasks: [...bundle.data['6226ff9877acee87727f6bca'].tasks!, { id: 'a9', projectId: '6226ff9877acee87727f6bca', title: '새 일', status: 0, kind: 'TEXT' }] } } }
const res3 = await applyImport((await previewImport(more)).plan)
assert.equal(res3.inserted.tasks, 1); assert.deepEqual(res3.openTaskIds, [`tt-${scope}-task-a9`])

// ── 작업 지도 AI 정리: 가져온 미완료 할 일만, 되돌리기 스냅숏 남김 ──
const open = await importedOpenTaskIds(scope)
assert.equal(open.length, 12)
let sent = 0
const chat = (async (input: { messages: { content: string }[] }) => {
  const payload = JSON.parse(input.messages[1].content) as { tasks: { id: string }[] }
  sent += payload.tasks.length
  return JSON.stringify({ items: payload.tasks.map((t) => ({ id: t.id, area: '생활', topic: '', confidence: 0.9 })), sequences: [], goals: [] })
}) as never
const org = await organizeImported(open, { signal: new AbortController().signal, chat })
assert.equal(org.total, 12); assert.equal(sent, 12)
assert.equal(all("SELECT count(*) AS n FROM task_areas WHERE area_id IS NOT NULL")[0].n, 12)
assert.ok(store.get('sprout.map.undo'), '정리 전 상태 보관')

console.log('ticktick.test.ts ok')
