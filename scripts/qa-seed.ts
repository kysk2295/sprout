// 출시 전 QA용 시험 계정 + 실제 사용자 같은 데이터(2026-10-25). 운영 서버에 계정을 만들고 PowerSync 클라이언트로 데이터를 올린다.
// 계정은 ~/.config/sprout/e2e-accounts.jsonl에 적어 두고 QA가 끝나면 지운다(scripts/qa-cleanup은 따로).
// 실행: . scripts/node22.sh && node --experimental-strip-types --no-warnings scripts/qa-seed.ts
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { column, PowerSyncDatabase, Schema, Table, UpdateType, type AbstractPowerSyncDatabase } from '@powersync/node'
import { TABLES } from '../packages/schema/src/index.ts'

const API = 'https://macmini.tail425c97.ts.net'
const SYNC = 'https://macmini.tail425c97.ts.net:8443'
const col = { text: column.text, integer: column.integer, real: column.real } as const
const schema = new Schema(Object.fromEntries(Object.entries(TABLES).map(([n, d]) => [n, new Table(Object.fromEntries(Object.entries(d.columns).map(([c, t]) => [c, col[t as keyof typeof col]])))])))
type Tok = { user: { id: string; email: string }; access_token: string; refresh_token: string; expires_in: number }
async function api<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`)
  return j as T
}

const email = `qa-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}@example.com`
const password = `Qa!${crypto.randomUUID().slice(0, 10)}`
mkdirSync(join(process.env.HOME!, '.config/sprout'), { recursive: true })
appendFileSync(join(process.env.HOME!, '.config/sprout/e2e-accounts.jsonl'), JSON.stringify({ email, password, at: new Date().toISOString(), qa: true }) + '\n', { mode: 0o600 })
const tok = await api<Tok>('/auth/signup', { email, password })
const owner = tok.user.id
const inbox = `inbox-${owner}`

const db = new PowerSyncDatabase({ schema, database: { dbFilename: `qa-seed-${Date.now()}.db`, dbLocation: mkdtempSync(join(tmpdir(), 'qa-seed-')) } })
await db.connect({
  fetchCredentials: async () => ({ endpoint: SYNC, token: tok.access_token }),
  async uploadData(d: AbstractPowerSyncDatabase) {
    const b = await d.getCrudBatch(200); if (!b) return
    await api('/sync/upload', { batch: b.crud.map((o) => ({ op: o.op === UpdateType.PUT ? 'PUT' : o.op === UpdateType.PATCH ? 'PATCH' : 'DELETE', table: o.table, id: o.id, data: o.opData })) }, tok.access_token)
    await b.complete()
  }
})
await db.waitForFirstSync()

const now = new Date()
const iso = now.toISOString()
const base = { owner_id: owner, created_at: iso, modified_at: iso }
const day = (o: number) => { const d = new Date(now); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const at = (o: number, hm: string) => `${day(o)}T${hm}`
const ago = (o: number, hm = '20:00') => new Date(`${day(o)}T${hm}:00`).toISOString()
const id = () => crypto.randomUUID()
const rows: [string, Record<string, unknown>][] = []
const put = (t: string, r: Record<string, unknown>) => { rows.push([t, { ...base, ...r }]); return r.id as string }

// 리스트·폴더·태그
const fWork = put('folders', { id: id(), name: '일', sort_order: 1 })
const work = put('lists', { id: id(), name: '업무', emoji: '💼', color: '#7F9EC7', folder_id: fWork, kind: 'normal', sort_order: 1, pinned: 0, show_in_smart: 'all' })
const proj = put('lists', { id: id(), name: '포트폴리오 사이트', emoji: '🌐', color: '#62BF7E', folder_id: fWork, kind: 'normal', sort_order: 2, pinned: 0, show_in_smart: 'all' })
const study = put('lists', { id: id(), name: '공부', emoji: '📚', color: '#F2B84B', kind: 'normal', sort_order: 3, pinned: 0, show_in_smart: 'all' })
const life = put('lists', { id: id(), name: '생활', emoji: '🏠', color: '#E4A0A0', kind: 'normal', sort_order: 4, pinned: 0, show_in_smart: 'all' })
const tImp = put('tags', { id: id(), name: '중요', color: '#D6828A', sort_order: 0, pinned: 0 })
const tQuick = put('tags', { id: id(), name: '5분', color: '#8EC1D6', sort_order: 1, pinned: 0 })

// 할 일(기한 지남·오늘·내일·이번 주·날짜 없음·반복·하위·체크리스트·우선순위·완료)
let order = 0
const task = (title: string, list: string, due: string | null, x: Record<string, unknown> = {}) =>
  put('tasks', { id: id(), list_id: list, title, content: '', content_mode: 'text', status: 0, priority: 0, due_at: due, is_all_day: due && due.includes('T') ? 0 : 1, time_zone: 'floating', sort_order: order++, ...x })
task('분기 보고서 초안', work, day(-2), { priority: 5 })
task('세탁소 맡기기', life, day(-1))
const t1 = task('기획 회의 자료 정리', work, at(0, '10:00'), { priority: 3 })
task('기업경제학 퀴즈 3', study, at(0, '14:00'), { priority: 5 })
task('운동 30분', life, day(0), { repeat_rule: 'RRULE:FREQ=DAILY' })
task('물 2L 마시기', life, day(0), { repeat_rule: 'RRULE:FREQ=DAILY' })
const parent = task('포트폴리오 메인 페이지', proj, day(1), { priority: 3 })
task('히어로 문구 쓰기', proj, day(1), { parent_id: parent })
task('작업 사진 고르기', proj, day(1), { parent_id: parent })
task('영어 단어 50개', study, day(2))
task('엄마 생신 선물', life, day(4), { priority: 3 })
task('독서 모임 책 읽기', study, day(6))
task('이사 견적 받기', inbox, null)
task('노트북 정리', inbox, null)
put('task_tags', { id: id(), task_id: t1, tag_id: tImp })
put('check_items', { id: id(), task_id: t1, title: '지난 회의록 보기', done: 1, sort_order: 0 })
put('check_items', { id: id(), task_id: t1, title: '슬라이드 3장', done: 0, sort_order: 1 })
put('reminders', { id: id(), task_id: t1, trigger: '-PT15M' })
// 오늘·지난 며칠 완료(장면 카드·앨범 재료)
const done = (title: string, list: string, o: number, hm: string) => task(title, list, day(o), { status: 1, completed_at: ago(o, hm) })
done('이메일 정리', work, 0, '09:20'); done('빨래 개기', life, 0, '11:05')
for (let i = 1; i <= 12; i++) { done(['주간 회의', '스트레칭 10분', '장보기', '과제 제출', '방 청소', '친구 생일 축하'][i % 6], [work, life, life, study, life, life][i % 6], -i, '18:30') }
put('task_tags', { id: id(), task_id: parent, tag_id: tQuick })

// 일정
const ev = (title: string, s: string, e: string, x: Record<string, unknown> = {}) => put('events', { id: id(), title, start_at: s, end_at: e, is_all_day: s.includes('T') ? 0 : 1, time_zone: 'floating', ...x })
ev('팀 스탠드업', at(0, '09:30'), at(0, '09:45'), { repeat_rule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR' })
ev('저녁 약속 — 성수', at(0, '19:00'), at(0, '21:00'), { location: '성수역' })
ev('치과 정기검진', at(2, '11:00'), at(2, '11:30'))
ev('제주 여행', day(10), day(12))
ev('친구 결혼식', at(-3, '13:00'), at(-3, '15:00'))

// 수집함
put('notes', { id: id(), content: '다음 달 독서 모임 책 후보: 데미안, 아몬드', kind: 'memo', source: 'app', captured_at: iso })
put('notes', { id: id(), content: 'https://ko.wikipedia.org/wiki/달팽이', kind: 'link', url: 'https://ko.wikipedia.org/wiki/달팽이', source: 'app', captured_at: iso })

// 일기(지난 날 — 대화로 만든 장 · 혼자 쓴 장 · 기분만), 1년 전 오늘
const diary = (o: number, mood: number | null, content: string) => put('diary_entries', { id: `diary-${day(o)}-${owner}`, date: day(o), mood, content, private: 0 })
diary(-1, 4, '## 21:10 — 오랜만의 저녁 약속\n#감정/즐거움 #영역/관계\n\n친구랑 성수에서 저녁을 먹었다. 이야기하다 보니 시간 가는 줄 몰랐다.')
diary(-2, 2, '## 23:40 ✎ — 잠이 안 온 밤\n\n보고서 생각에 잠이 안 왔다. 내일은 일찍 시작하자.')
diary(-3, 5, '## 22:00 — 친구 결혼식\n#사건/결혼식\n\n친구가 결혼했다. 축사하면서 울컥했다.')
diary(-5, 3, '## 09:00\n\n(기분만 남겼어요)')
diary(-8, 4, '## 20:30 ✎ — 한강 산책\n\n바람이 시원했다. 이번 주에 미뤄 둔 일들이 정리됐다.')
put('diary_entries', { id: `diary-${(() => { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) })()}-${owner}`, date: (() => { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(), mood: 4, content: '## 21:00 — 처음 혼자 본 영화\n\n생각보다 편했다. 다음엔 조조로.', private: 0 })

// 사진 한 장(어제)
const jpg = readFileSync('docs/verification/calendar-core/sprout-week-range.jpg')
const up = await fetch(`${API}/media`, { method: 'POST', headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'image/jpeg' }, body: jpg })
if (up.ok) { const { id: mid } = (await up.json()) as { id: string }; put('diary_photos', { id: id(), date: day(-1), media_id: mid, width: 1200, height: 800, sort_order: 0 }) }

await db.writeTransaction(async (tx) => {
  for (const [t, r] of rows) {
    const cols = Object.keys(r).filter((k) => k === 'id' || k in (TABLES as Record<string, { columns: Record<string, string> }>)[t].columns)
    await tx.execute(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => r[k]))
  }
})
for (let i = 0; i < 120; i++) { const n = (await db.get<{ n: number }>('SELECT count(*) AS n FROM ps_crud')).n; if (!n) break; await new Promise((r) => setTimeout(r, 500)) }
console.log(`QA 계정 ${email} · ${rows.length}행 올림`)
await db.disconnect()
process.exit(0)
