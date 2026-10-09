// 47 시험·실측용 합성 데이터(research 39와 같은 사람·같은 날, 실제 사용자 데이터 없음) — 오늘 = 2026-10-09(금).
// assistantAgent.test.ts(모델 없이)와 scripts/assistant-eval.mjs(Mac mini 모델)가 같이 쓴다. sql.js 같은 run(sql, params)만 받는다.
import { TABLES } from './index.ts'
import { keyDateRelId } from './planView.ts'

export const FIXTURE_NOW = new Date(2026, 9, 9, 10, 0)
const iso = (day: string, h = 21) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h).toISOString()

export function createTables(run: (sql: string, params?: unknown[]) => void) {
  for (const [name, def] of Object.entries(TABLES)) run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
}

export function seedFixture(run: (sql: string, params?: unknown[]) => void) {
  const ins = (table: string, row: Record<string, unknown>) => run(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`, Object.values(row))
  const made = '2026-08-02T01:00:00.000Z'
  for (const [id, name, kind] of [['in', 'Inbox', 'inbox'], ['study', '공부', null], ['life', '생활', null], ['contest', '공모전', null], ['club', '동아리', null]]) ins('lists', { id, name, kind, created_at: made, sort_order: 0 })
  const task = (id: string, title: string, list: string, o: Record<string, unknown> = {}) => ins('tasks', { id, title, list_id: list, status: 0, priority: 0, is_all_day: 1, created_at: made, modified_at: made, ...o })
  // 남은 할 일(research 39 t1~t7)
  task('t-stat3', '통계학 과제 3장', 'study', { due_at: '2026-10-10', priority: 3 })
  task('t-report', '보고서 최종본 제출', 'contest', { due_at: '2026-10-11', priority: 2 })
  task('t-rent', '자취방 월세 이체', 'life', { due_at: '2026-10-10' })
  task('t-plan', '공모전 기획서 초안', 'contest', { due_at: '2026-10-12', priority: 2 })
  task('t-os', '운영체제 중간고사 공부', 'study', { due_at: '2026-10-14', priority: 3 })
  task('t-club', '동아리 회비 정리', 'club', { priority: 1 })
  task('t-laundry', '빨래', 'life', { due_at: '2026-10-09' })
  // 끝낸 일: 미용실 4번(3/21 · 5/30 · 7/12 · 8/31), 헬스장 운동 올해 23번(마지막 10/7), 통계학 과제 2장
  for (const d of ['2026-03-21', '2026-05-30', '2026-07-12', '2026-08-31']) task(`t-hair-${d}`, '미용실 가기', 'life', { status: 1, due_at: d, completed_at: iso(d, 14) })
  const gym: string[] = []
  for (let i = 0; i < 23; i++) { const d = new Date(2026, 0, 6 + i * 12); gym.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) }
  gym[gym.length - 1] = '2026-10-07'
  gym.forEach((d, i) => task(`t-gym-${i}`, '헬스장 운동', 'life', { status: 1, due_at: d, completed_at: iso(d, 20) }))
  task('t-stat2', '통계학 과제 2장', 'study', { status: 1, due_at: '2026-10-03', completed_at: iso('2026-10-03') })
  // 이번 주 완료(성장 '이번 주 완료' = 헬스장 10/7 + 11개 + 프로젝트 2개 = 14)
  for (let i = 0; i < 11; i++) task(`t-week-${i}`, `이번 주 정리 ${i + 1}`, 'life', { status: 1, due_at: '2026-10-08', completed_at: iso('2026-10-08', 9 + (i % 10)) })
  // 꿈틀 일정: 다음 주 수요일 팀 회의
  ins('events', { id: 'ev-team', title: '팀 회의', start_at: '2026-10-14T19:00', end_at: '2026-10-14T20:00', is_all_day: 0, created_at: made, modified_at: made })
  // 메모
  ins('notes', { id: 'n-kickoff', content: '회의록 10/2 공모전 킥오프\n역할 나누기, 기획서는 10/12까지', kind: 'memo', created_at: '2026-10-02T03:00:00.000Z', modified_at: '2026-10-02T03:00:00.000Z' })
  // 프로젝트 '공모전 출품작': 14개 중 5개 끝냄, 핵심 날짜 10/21
  ins('tags', { id: 'tag-contest', name: '🏆 공모전 출품작', kind: 'project', source: 'user', created_at: made })
  const members = ['t-report', 't-plan']
  for (let i = 0; i < 12; i++) { const id = `t-pj-${i}`; task(id, i === 0 ? '공모전 출품작 최종 제출' : `공모전 작업 ${i}`, 'contest', i < 5 ? { status: 1, due_at: '2026-10-0' + (1 + (i % 8)), completed_at: iso('2026-10-0' + (1 + (i % 8))) } : { due_at: i === 0 ? '2026-10-21' : `2026-10-${String(13 + i).padStart(2, '0')}` }); members.push(id) }
  run("UPDATE tasks SET status = 0, completed_at = NULL, due_at = '2026-10-21' WHERE id = 't-pj-0'")
  run("UPDATE tasks SET status = 1, completed_at = ? WHERE id = 't-pj-5'", [iso('2026-10-06')])
  members.forEach((id, i) => ins('task_tags', { id: `tt-${i}`, task_id: id, tag_id: 'tag-contest', source: 'user', state: 'accepted' }))
  ins('relations', { id: keyDateRelId('tag-contest'), from_type: 'tag', from_id: 'tag-contest', to_type: 'task', to_id: 't-pj-0', field: 'deadline', state: 'accepted' })
  // 성장: 도토리 Lv 8(누적 700 + 150)
  ins('characters', { id: 'ch', name: '도토리', species: 'snail', created_at: made })
  ins('xp_events', { id: 'xp-base', kind: 'task', amount: 850, ref_id: 'seed', day: '2026-10-01', created_at: '2026-10-01T00:00:00.000Z' })
  // 일기(동의 시험용): 10/6 보통 날, 10/7 나만 보기(절대 안 나옴)
  ins('diary_entries', { id: 'diary-2026-10-06', date: '2026-10-06', mood: 2, content: '과제가 너무 많아서 힘들었다. 그래도 저녁은 맛있었다.', private: 0, created_at: made })
  ins('diary_entries', { id: 'diary-2026-10-07', date: '2026-10-07', mood: 1, content: '비밀 이야기 — 아무에게도 안 보여 줄 날', private: 1, created_at: made })
  ins('diary_messages', { id: 'dm-1', entry_id: 'diary-2026-10-06', role: 'me', content: '대화 원문은 비서가 보면 안 됨', safety: 0 })
}
