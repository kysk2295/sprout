// 19 밀린 일 정리: 나이별 묶음(시간대·날짜만 vs 시각) · 같은 일 찾기·정규화 · 반복 제안 · 스냅숏/모두 되돌리기 · XP 없음 · 오늘 접기 기준 · AI 꼬리표
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { planCompleteNoXp } from '@sprout/schema/taskCore'
import {
  applyCleanup, beginCleanupSession, isFolded, isOverdue, isPastEvent, mergeSnapshot, normalizeTitle, overdueDays, parseAiTags, planOverdue, readSnapshot,
  snapshotValid, suggestRepeat, thisFriday, undoCleanup, characterLine, runAutoNoDate, KEYS, OVERDUE, type OTask
} from '../src/renderer/src/data/overdue'
import { insert, run } from '../src/renderer/src/data/mutations'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
const store = new Map<string, string>()
const fakeDb = {
  getAll: async (sql: string, p?: unknown[]) => all(sql, p),
  get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
  transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
}
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  window: { sprout: { db: fakeDb }, dispatchEvent: () => true }
})

const T = '2026-10-05' // 월요일
const t = (id: string, due: string | null, extra: Partial<OTask> = {}): OTask => ({ id, title: id, due_at: due, start_at: null, is_all_day: due && due.includes('T') ? 0 : 1, ...extra })

// ── 만료 판정: 날짜만 vs 시각, 기간 ──
assert.ok(isOverdue(t('a', '2026-10-04'), T))
assert.ok(!isOverdue(t('a', '2026-10-05'), T), '오늘 마감은 만료 아님')
assert.ok(isOverdue(t('a', '2026-10-04T23:30'), T), '어제 밤 시각 일정은 만료')
assert.ok(!isOverdue(t('a', '2026-10-05T00:10'), T), '오늘 새벽 시각(이미 지남)은 오늘 그룹 — 만료 아님')
assert.ok(!isOverdue(t('a', '2026-10-06', { start_at: '2026-09-01' }), T), '진행 중 기간은 만료 아님')
assert.ok(!isOverdue(t('a', null), T))
assert.equal(overdueDays(t('a', '2026-10-04'), T), 1)
assert.equal(overdueDays(t('a', '2026-07-05T09:00'), T), 92)
assert.ok(isPastEvent(t('m', '2026-09-30T14:00'), T), '시각 있는 지난 일 = 지난 일정')
assert.ok(!isPastEvent(t('m', '2026-09-30'), T), '날짜만 있는 일은 일정 아님')
assert.ok(!isPastEvent(t('m', '2026-09-30T14:00', { is_all_day: 1 }), T), '종일 표시면 일정 아님')
assert.ok(isPastEvent(t('m', '2026-09-30T15:00', { start_at: '2026-09-30T14:00' }), T), '기간 일정')

// 시간대: floating 저장(벽시계)이라 기기 시간대가 바뀌어도 같은 판정
for (const tz of ['America/Los_Angeles', 'Asia/Seoul', 'Pacific/Kiritimati', 'UTC']) {
  process.env.TZ = tz
  assert.equal(thisFriday(T), '2026-10-09', tz)
  assert.ok(isPastEvent(t('m', '2026-10-04T23:59'), T), tz)
  assert.equal(overdueDays(t('a', '2026-03-08'), '2026-03-09'), 1, `서머타임 경계 ${tz}`)
}
process.env.TZ = 'Asia/Seoul'

// ── 이번 주 금요일 ──
assert.equal(thisFriday('2026-10-05'), '2026-10-09') // 월
assert.equal(thisFriday('2026-10-09'), '2026-10-09') // 금 = 그날
assert.equal(thisFriday('2026-10-10'), '2026-10-16') // 토 → 다음 주
assert.equal(thisFriday('2026-10-11'), '2026-10-16') // 일 → 다음 주(월요일 시작 주)

// ── 오늘 접기 기준(7일 넘으면) ──
assert.ok(!isFolded(t('a', '2026-09-28'), T), '7일 전은 펼침')
assert.ok(isFolded(t('a', '2026-09-27'), T), '8일 전은 접음')
assert.ok(!isFolded(t('a', '2026-10-05'), T))

// ── 제목 정규화 ──
assert.equal(normalizeTitle('토익 공부'), normalizeTitle('토익공부!'))
assert.notEqual(normalizeTitle('토익공부 3회차'), normalizeTitle('토익공부 4회차'), '차례 번호는 다른 일')
assert.equal(normalizeTitle('Daily Standup'), normalizeTitle('daily-standup.'))
assert.equal(normalizeTitle('ＡＢＣ'), 'abc', '전각 → 반각')
assert.notEqual(normalizeTitle('근무'), normalizeTitle('근무 정리'))
assert.equal(normalizeTitle('!!!'), '')

// ── 나누기 ──
const rows: OTask[] = [
  ...['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((d, i) => t(`toeic${i}`, d, { title: i % 2 ? '토익 공부' : '토익공부' })),
  t('meet1', '2026-09-30T14:00', { title: '마케팅 미팅' }), t('meet2', '2026-08-30T14:00', { title: '마케팅 미팅' }), // 2개 → 같은 일 아님, 지난 일정
  t('dent', '2026-05-01T10:00', { title: '치과' }), // 오래됐어도 시각 있음 → 지난 일정
  t('old1', '2026-06-01'), t('old2', '2025-12-31'),
  t('mid1', '2026-08-01'), t('mid2', '2026-09-04'), // 31일 → 1~3달
  t('rec1', '2026-09-05'), t('rec2', '2026-10-04'), // 30일 → 하나씩
  t('kid', '2026-01-01', { parent_id: 'old1' }), // 부모와 함께
  t('orphanKid', '2026-01-01', { parent_id: 'notOverdue' }),
  t('today', '2026-10-05'), t('future', '2026-11-01'), t('nodate', null)
]
const plan = planOverdue(rows, T)
assert.equal(plan.total, 14, '부모가 같이 만료인 하위는 빼고 센다')
assert.deepEqual(plan.dups.map((g) => [g.title, g.tasks.length]), [['토익 공부', 4]])
assert.equal(plan.dups[0].tasks[0].id, 'toeic3', '같은 일은 최근 것부터')
assert.deepEqual(plan.buckets.events.map((x) => x.id), ['dent', 'meet2', 'meet1'])
assert.deepEqual(plan.buckets.old.map((x) => x.id), ['old2', 'orphanKid', 'old1'])
assert.deepEqual(plan.buckets.mid.map((x) => x.id), ['mid1', 'mid2'])
assert.deepEqual(plan.recent.map((x) => x.id), ['rec2', 'rec1'], '하나씩은 최근 것부터')
assert.equal(planOverdue(rows.filter((r) => r.id.startsWith('toeic')).slice(0, 2), T).dups.length, 0, '2번은 같은 일 아님')

// ── 반복 제안 ──
assert.equal(suggestRepeat(['2026-09-07', '2026-09-14', '2026-09-28'])?.rule, 'FREQ=WEEKLY;BYDAY=MO', '같은 요일 → 매주 그 요일(빠진 주가 있어도)')
assert.equal(suggestRepeat(['2026-09-07', '2026-09-14', '2026-09-28'])?.label, '매주 월요일')
assert.equal(suggestRepeat(['2026-08-31', '2026-09-14', '2026-09-28'])?.rule, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', '격주')
assert.equal(suggestRepeat(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])?.rule, 'FREQ=DAILY', '연속 → 매일')
assert.equal(suggestRepeat(['2026-09-21', '2026-09-23', '2026-09-28', '2026-09-30'])?.rule, 'FREQ=WEEKLY;BYDAY=MO,WE', '월·수')
assert.equal(suggestRepeat(['2026-07-15', '2026-08-15', '2026-09-15'])?.rule, 'FREQ=MONTHLY;BYMONTHDAY=15', '매월 15일')
assert.equal(suggestRepeat(['2026-09-01', '2026-09-04', '2026-09-07'])?.rule, 'FREQ=DAILY;INTERVAL=3', '3일마다')
assert.equal(suggestRepeat(['2026-09-01T09:00', '2026-09-08T09:00', '2026-09-08T18:00'])?.rule, 'FREQ=WEEKLY;BYDAY=TU', '시각은 무시, 같은 날은 한 번')
assert.equal(suggestRepeat(['2026-09-01']), null)

// ── 스냅숏(순수) ──
const s1 = mergeSnapshot(null, [{ id: 'a', status: 0 }], '2026-10-05T00:00:00.000Z')
const s2 = mergeSnapshot(s1, [{ id: 'a', status: 2 }, { id: 'b', status: 0 }], '2026-10-05T01:00:00.000Z')
assert.deepEqual(s2.rows, [{ id: 'a', status: 0 }, { id: 'b', status: 0 }], '처음 값만 남긴다')
assert.equal(s2.at, '2026-10-05T00:00:00.000Z')
assert.ok(snapshotValid(s2, '2026-10-05T23:59:00.000Z'))
assert.ok(!snapshotValid(s2, '2026-10-06T00:00:01.000Z'), '24시간 지나면 무효')
assert.ok(!snapshotValid(null, '2026-10-05T00:00:00.000Z'))

// ── AI 꼬리표: 엄격하게 읽고 틀리면 비움 ──
const items = [t('x', '2026-10-01'), t('y', '2026-10-02')]
assert.deepEqual(parseAiTags('{"items":[{"i":0,"tag":"event"},{"i":1,"tag":"week"},{"i":5,"tag":"repeat"},{"i":1.5,"tag":"repeat"}]}', items), { x: 'event', y: 'week' })
assert.deepEqual(parseAiTags('생각: ...\n{"items":[{"i":1,"tag":"repeat"},{"i":0,"tag":"bogus"}]} 끝', items), { y: 'repeat' })
assert.deepEqual(parseAiTags('not json', items), {})
assert.deepEqual(parseAiTags('{"items":"x"}', items), {})

// ── 끝 화면 한마디(벌하지 않음) ──
assert.match(characterLine({}, 10), /괜찮아/)
assert.match(characterLine({ wontdo: 3 }, 0), /넓어졌다/)

// ── DB: 정리 동작 · XP 없음 · 모두 되돌리기 ──
const task = (id: string, row: Record<string, unknown>) => insert('tasks', { id, list_id: 'L', title: id, status: 0, priority: 0, is_all_day: 1, sort_order: 0, ...row })
await run(
  insert('lists', { id: 'L', name: '기본함', kind: 'inbox', sort_order: 0 }),
  task('d1', { due_at: '2026-09-30T14:00', is_all_day: 0 }),
  task('d1c', { parent_id: 'd1', due_at: null }),
  task('w1', { due_at: '2026-05-01' }),
  task('n1', { due_at: '2026-08-01', start_at: '2026-07-30', repeat_rule: 'FREQ=DAILY', repeat_from: 'due' }),
  task('tr', { due_at: '2026-04-01' }), task('trc', { parent_id: 'tr', due_at: null }),
  task('mv', { due_at: '2026-09-20T09:30', is_all_day: 0 }),
  task('rp', { due_at: '2026-09-28T07:00', is_all_day: 0 }),
  task('rep', { due_at: '2026-09-21', repeat_rule: 'FREQ=WEEKLY;BYDAY=MO', repeat_from: 'due' }),
  task('fin', { due_at: '2026-09-01', repeat_rule: 'FREQ=DAILY;COUNT=1' })
)
const before = all('SELECT * FROM tasks ORDER BY id')
const env = { today: T, now: () => '2026-10-05T03:00:00.000Z' }
const noXp = await planCompleteNoXp(fakeDb, ['d1', 'rep', 'fin'], env)
assert.deepEqual(noXp.open.sort(), ['d1', 'd1c'])
assert.ok(noXp.stmts.every((s) => !/xp_events/.test(s.sql)), 'XP 문 없음')

beginCleanupSession('2026-10-05T00:00:00.000Z')
await applyCleanup(['d1', 'rep', 'fin'], { kind: 'done' }, T)
await applyCleanup(['w1'], { kind: 'wontdo' }, T)
await applyCleanup(['n1'], { kind: 'nodate' }, T)
await applyCleanup(['tr'], { kind: 'trash' }, T)
await applyCleanup(['mv'], { kind: 'date', date: '2026-10-09' }, T)
await applyCleanup(['rp'], { kind: 'repeat', rule: 'FREQ=WEEKLY;BYDAY=MO' }, T)
await applyCleanup(['w1'], { kind: 'nodate' }, T) // 같은 행 두 번(← 이전 카드로 돌아가 다시 정함)
const get = (id: string) => all('SELECT * FROM tasks WHERE id = ?', [id])[0]
assert.equal(all('SELECT count(*) AS n FROM xp_events')[0].n, 0, '정리 완료로 XP가 생기지 않는다')
assert.equal(get('d1').status, 1); assert.equal(get('d1c').status, 1, '하위도 함께 완료')
assert.equal(get('rep').status, 0); assert.equal(get('rep').due_at, '2026-10-05', '반복은 기록 없이 오늘 이후 첫 회차(오늘 월요일)')
assert.equal(all("SELECT count(*) AS n FROM tasks WHERE repeat_origin_id IS NOT NULL")[0].n, 0, '완료 기록을 만들지 않는다')
assert.equal(get('fin').status, 1, '남은 회차가 없으면 완료')
assert.equal(get('w1').status, 2); assert.equal(get('w1').due_at, null)
assert.deepEqual([get('n1').due_at, get('n1').start_at, get('n1').repeat_rule], [null, null, null], '날짜 빼기 = 반복도 지움')
assert.ok(get('tr').deleted_at && get('trc').deleted_at, '휴지통은 하위와 함께')
assert.equal(get('mv').due_at, '2026-10-09T09:30', '날짜만 바꾸고 시각 유지')
assert.deepEqual([get('rp').repeat_rule, get('rp').due_at], ['FREQ=WEEKLY;BYDAY=MO', '2026-10-05T07:00'], '반복으로 바꾸면 오늘 이후 첫 회차(시각 유지)')
assert.equal(readSnapshot()!.rows.length, 10, '건드린 행(하위 포함) 처음 값만')

assert.equal(await undoCleanup(), 10)
const after = all('SELECT * FROM tasks ORDER BY id')
const strip = (r: Record<string, unknown>) => { const { modified_at: _m, ...rest } = r; return rest }
assert.deepEqual(after.map(strip), before.map(strip), '모두 되돌리기 = 정리 전과 같음')
assert.equal(await undoCleanup(), 0, '두 번은 안 됨')

// 다음 정리를 시작하고 처음 바꿀 때 지난 스냅숏을 버린다(마지막 1회분)
beginCleanupSession('2026-10-05T05:00:00.000Z')
await applyCleanup(['w1'], { kind: 'wontdo' }, T)
assert.deepEqual(readSnapshot()!.rows.map((r) => r.id), ['w1'])
await undoCleanup()

// ── 자동 규칙(기본 꺼짐) ──
assert.deepEqual((await runAutoNoDate(T)).ids, [], '꺼져 있으면 아무것도 안 함')
store.set(KEYS.auto, '1')
const auto = await runAutoNoDate(T)
assert.deepEqual(auto.ids.sort(), ['fin', 'n1', 'tr', 'w1'].sort(), `만료 ${OVERDUE.autoDays}일 넘은 것만`)
assert.equal(get('w1').due_at, null)
assert.deepEqual((await runAutoNoDate(T)).ids, [], '하루 한 번')

console.log('overdue ok')
