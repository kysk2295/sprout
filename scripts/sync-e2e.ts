// 동기화 끝에서 끝 시험(2026-10-24): 실제 운영 서버에 시험 계정을 만들고, 데스크톱과 같은 PowerSync(@powersync/node) 클라이언트 두 대(A·B)로
// 만들기·고치기·완료·지우기·동시에 다른 칸 고치기·오프라인 뒤 다시 붙기·토큰 새로 고침·여러 표·큰 묶음을 확인한다. 끝나면 시험 계정을 지운다.
// 실행: . scripts/node22.sh && node --experimental-strip-types --no-warnings scripts/sync-e2e.ts [--keep]
// 결과: 콘솔 표 + docs/verification/sync-e2e/<시각>.json
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { column, PowerSyncDatabase, Schema, Table, UpdateType, type AbstractPowerSyncDatabase, type PowerSyncBackendConnector } from '@powersync/node'
import { TABLES } from '../packages/schema/src/index.ts'

const API = process.env.SPROUT_API_URL ?? 'https://macmini.tail425c97.ts.net'
const SYNC = process.env.SPROUT_SYNC_URL ?? 'https://macmini.tail425c97.ts.net:8443'
const KEEP = process.argv.includes('--keep')
const WAIT = Number(process.env.SYNC_WAIT_MS ?? 30_000)

const col = { text: column.text, integer: column.integer, real: column.real } as const
const schema = new Schema(Object.fromEntries(Object.entries(TABLES).map(([n, d]) => [n, new Table(Object.fromEntries(Object.entries(d.columns).map(([c, t]) => [c, col[t as keyof typeof col]])))])))

type Tok = { user: { id: string; email: string }; access_token: string; refresh_token: string; expires_in: number }
async function api<T>(path: string, body?: unknown, token?: string, method?: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(`${path} ${r.status} ${(j as { error?: string }).error ?? ''}`), { status: r.status })
  return j as T
}

/** 데스크톱 sync.ts와 같은 연결자(토큰 새로 고침 한 번에 하나, 업로드 400은 한 건씩) */
function client(name: string, tok: Tok) {
  let s = { ...tok, expires_at: Date.now() + tok.expires_in * 1000 }
  let refreshing: Promise<string | null> | undefined
  const stats = { refresh: 0, refreshFail: 0, uploads: 0, uploadFail: 0 }
  const fresh = async () => {
    if (s.expires_at - Date.now() > 5 * 60_000) return s.access_token
    refreshing ??= (async () => {
      try { stats.refresh++; const r = await api<Tok>('/auth/refresh', { refresh_token: s.refresh_token }); s = { ...r, expires_at: Date.now() + r.expires_in * 1000 }; return s.access_token }
      catch { stats.refreshFail++; return null } finally { refreshing = undefined }
    })()
    return refreshing
  }
  const connector: PowerSyncBackendConnector = {
    async fetchCredentials() { const t = await fresh(); return t ? { endpoint: SYNC, token: t } : null },
    async uploadData(d: AbstractPowerSyncDatabase) {
      const b = await d.getCrudBatch(200)
      if (!b) return
      const t = await fresh()
      if (!t) throw new Error('no token')
      const ops = b.crud.map((o) => ({ op: o.op === UpdateType.PUT ? 'PUT' : o.op === UpdateType.PATCH ? 'PATCH' : 'DELETE', table: o.table, id: o.id, data: o.opData }))
      try { await api('/sync/upload', { batch: ops }, t); stats.uploads++ } catch (e) { stats.uploadFail++; throw e }
      await b.complete()
    }
  }
  const dir = mkdtempSync(join(tmpdir(), `sync-e2e-${name}-`))
  const db = new PowerSyncDatabase({ schema, database: { dbFilename: `sync-e2e-${name}.db`, dbLocation: dir } })
  return {
    name, db, stats, connector,
    connect: () => { if (process.env.SYNC_DEBUG) db.registerListener({ statusChanged: (st) => console.log(name, 'status', st.connected, st.connecting, st.hasSynced, st.dataFlowStatus.downloadError?.message ?? '', st.dataFlowStatus.uploadError?.message ?? '') }); return db.connect(connector) },
    /** 접근 토큰을 지금 끝난 것으로 → 다음 요청에서 새로 고침 */
    expire: () => { s = { ...s, expires_at: Date.now() - 1000 } },
    userId: tok.user.id
  }
}
type C = ReturnType<typeof client>

const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()
/** cond가 참이 될 때까지(최대 WAIT) — 걸린 ms, 안 되면 -1 */
async function until(c: C, sql: string, params: unknown[], ok: (rows: Record<string, unknown>[]) => boolean): Promise<number> {
  const t0 = Date.now()
  while (Date.now() - t0 < WAIT) {
    const rows = await c.db.getAll<Record<string, unknown>>(sql, params)
    if (ok(rows)) return Date.now() - t0
    await new Promise((r) => setTimeout(r, 250))
  }
  return -1
}
const results: { case: string; ok: boolean; ms: number; note?: string }[] = []
async function check(name: string, fn: () => Promise<number | { ms: number; note?: string }>) {
  try {
    const r = await fn()
    const ms = typeof r === 'number' ? r : r.ms
    results.push({ case: name, ok: ms >= 0, ms, note: typeof r === 'number' ? undefined : r.note })
  } catch (e) { results.push({ case: name, ok: false, ms: -1, note: (e as Error).message }) }
  const last = results.at(-1)!
  console.log(`${last.ok ? 'PASS' : 'FAIL'}  ${name}  ${last.ms >= 0 ? `${(last.ms / 1000).toFixed(1)}s` : ''} ${last.note ?? ''}`)
}
const task = (owner: string, title: string, extra: Record<string, unknown> = {}) => ({ id: uuid(), owner_id: owner, title, status: 0, list_id: '', sort_order: 0, priority: 0, created_at: now(), modified_at: now(), ...extra })
async function insert(c: C, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row).filter((k) => k === 'id' || k in (TABLES as Record<string, { columns: Record<string, string> }>)[table].columns)
  await c.db.execute(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => row[k]))
}

async function main() {
  const email = `e2e-sync-${Date.now()}@example.com`
  const password = `E2e!${crypto.randomUUID().slice(0, 12)}`
  // 끝나기 전에 멈춰도 나중에 지울 수 있게 계정을 적어 둔다(저장소 밖, 사용자 폴더) — 지우면 줄을 뺀다
  const ledger = join(process.env.HOME ?? '.', '.config/sprout/e2e-accounts.jsonl')
  try { mkdirSync(join(process.env.HOME ?? '.', '.config/sprout'), { recursive: true }); appendFileSync(ledger, JSON.stringify({ email, password, at: now() }) + '\n', { mode: 0o600 }) } catch { /* 적지 못해도 시험은 */ }
  const signup = await api<Tok>('/auth/signup', { email, password })
  const tokB = await api<Tok>('/auth/login', { email, password })
  const A = client('A', signup), B = client('B', tokB)
  const owner = signup.user.id
  console.log('시험 계정', email.replace(/\d{6}@/, '…@'), '— 서버', API)
  console.log('연결 시작')
  await Promise.all([A.connect(), B.connect()])
  console.log('연결 호출 끝')
  await check('A·B 첫 연결·첫 동기화', async () => { const t0 = Date.now(); await Promise.all([A.db.waitForFirstSync(), B.db.waitForFirstSync()]); return Date.now() - t0 })

  // 1 만들기 A → B
  const t1 = task(owner, '시험 1 만들기')
  await insert(A, 'tasks', t1)
  await check('할 일 만들기 A → B', () => until(B, 'SELECT id FROM tasks WHERE id = ?', [t1.id], (r) => r.length === 1))
  // 2 고치기 B → A
  await B.db.execute('UPDATE tasks SET title = ?, modified_at = ? WHERE id = ?', ['시험 1 고침', now(), t1.id])
  await check('제목 고치기 B → A', () => until(A, 'SELECT title FROM tasks WHERE id = ?', [t1.id], (r) => r[0]?.title === '시험 1 고침'))
  // 3 완료 A → B
  await A.db.execute('UPDATE tasks SET status = 1, completed_at = ?, modified_at = ? WHERE id = ?', [now(), now(), t1.id])
  await check('완료 A → B', () => until(B, 'SELECT status FROM tasks WHERE id = ?', [t1.id], (r) => r[0]?.status === 1))
  // 4 동시에 다른 칸(A 제목, B 우선순위) → 둘 다 남는가
  const t2 = task(owner, '시험 2 동시')
  await insert(A, 'tasks', t2)
  await until(B, 'SELECT id FROM tasks WHERE id = ?', [t2.id], (r) => r.length === 1)
  await Promise.all([
    A.db.execute('UPDATE tasks SET title = ?, modified_at = ? WHERE id = ?', ['시험 2 A가 고침', now(), t2.id]),
    B.db.execute('UPDATE tasks SET priority = 5, modified_at = ? WHERE id = ?', [now(), t2.id])
  ])
  await check('동시에 다른 칸 고치기 → 둘 다 남음', () => until(A, 'SELECT title, priority FROM tasks WHERE id = ?', [t2.id], (r) => r[0]?.title === '시험 2 A가 고침' && r[0]?.priority === 5).then(async (ms) => (ms < 0 ? ms : until(B, 'SELECT title, priority FROM tasks WHERE id = ?', [t2.id], (r) => r[0]?.title === '시험 2 A가 고침' && r[0]?.priority === 5))))
  // 5 지우기 B → A
  await B.db.execute('DELETE FROM tasks WHERE id = ?', [t2.id])
  await check('지우기 B → A', () => until(A, 'SELECT id FROM tasks WHERE id = ?', [t2.id], (r) => r.length === 0))
  // 6 오프라인: A 끊고 3건 만들기 + B가 t1 제목 고침 → A 다시 붙으면 둘 다 맞음
  await A.db.disconnect()
  const off = [task(owner, '오프 1'), task(owner, '오프 2'), task(owner, '오프 3')]
  for (const t of off) await insert(A, 'tasks', t)
  await B.db.execute('UPDATE tasks SET title = ?, modified_at = ? WHERE id = ?', ['온라인 B가 고침', now(), t1.id])
  await new Promise((r) => setTimeout(r, 3000))
  await A.connect()
  await check('오프라인 3건 → 다시 붙으면 B에 보임', () => until(B, `SELECT id FROM tasks WHERE id IN (${off.map(() => '?').join(',')})`, off.map((t) => t.id), (r) => r.length === 3))
  await check('오프라인 동안 B 변경 → A가 받음', () => until(A, 'SELECT title FROM tasks WHERE id = ?', [t1.id], (r) => r[0]?.title === '온라인 B가 고침'))
  // 7 토큰 새로 고침 뒤에도 계속(서버 2026-10-21: 리프레시 토큰을 바꾸지 않음)
  A.expire()
  const t3 = task(owner, '새로 고침 뒤')
  await insert(A, 'tasks', t3)
  await check('접근 토큰 만료 → 새로 고침 → 올라감', async () => { const ms = await until(B, 'SELECT id FROM tasks WHERE id = ?', [t3.id], (r) => r.length === 1); return { ms, note: `새로 고침 ${A.stats.refresh}회 · 실패 ${A.stats.refreshFail}` } })
  A.expire()
  await A.db.disconnect(); await A.connect()
  await check('두 번째 새로 고침(같은 리프레시 토큰)', async () => { const t4 = task(owner, '두 번째'); await insert(A, 'tasks', t4); const ms = await until(B, 'SELECT id FROM tasks WHERE id = ?', [t4.id], (r) => r.length === 1); return { ms, note: `새로 고침 ${A.stats.refresh}회 · 실패 ${A.stats.refreshFail}` } })
  // 8 여러 표
  const ev = { id: uuid(), owner_id: owner, title: '시험 일정', start_at: '2026-10-25T10:00', end_at: '2026-10-25T11:00', is_all_day: 0, created_at: now(), modified_at: now() }
  await insert(B, 'events', ev)
  await check('일정 B → A', () => until(A, 'SELECT id FROM events WHERE id = ?', [ev.id], (r) => r.length === 1))
  const note = { id: uuid(), owner_id: owner, content: '수집함 메모 시험', created_at: now(), modified_at: now() }
  await insert(A, 'notes', note)
  await check('메모(수집함) A → B', () => until(B, 'SELECT id FROM notes WHERE id = ?', [note.id], (r) => r.length === 1))
  const di = { id: `diary-2026-10-24-${owner}`, owner_id: owner, date: '2026-10-24', mood: 4, content: '## 21:00 ✎ — 시험\n\n일기 시험', private: 0, created_at: now(), modified_at: now() }
  await insert(B, 'diary_entries', di)
  await check('일기 B → A', () => until(A, 'SELECT content FROM diary_entries WHERE id = ?', [di.id], (r) => String(r[0]?.content ?? '').includes('일기 시험')))
  const list = { id: uuid(), owner_id: owner, name: '시험 리스트', sort_order: 1, created_at: now(), modified_at: now() }
  await insert(A, 'lists', list)
  const t5 = task(owner, '리스트 안', { list_id: list.id })
  await insert(A, 'tasks', t5)
  await check('리스트 + 그 안 할 일 A → B', () => until(B, 'SELECT t.id FROM tasks t JOIN lists l ON l.id = t.list_id WHERE t.id = ?', [t5.id], (r) => r.length === 1))
  // 8.5 사진 한 장(28 §10): A가 올리고 diary_photos 행 → B가 행을 받고 같은 사진을 내려받음(B 토큰), 남의 계정은 못 봄
  await check('사진 한 장 A → B(행 + 바이트)', async () => {
    const jpg = readFileSync('docs/verification/calendar-core/sprout-week-range.jpg')
    const up = await fetch(`${API}/media`, { method: 'POST', headers: { authorization: `Bearer ${signup.access_token}`, 'content-type': 'image/jpeg' }, body: jpg })
    if (up.status !== 201) return { ms: -1, note: `upload ${up.status}` }
    const { id: mediaId } = (await up.json()) as { id: string }
    const row = { id: uuid(), owner_id: owner, date: '2026-10-24', media_id: mediaId, width: 100, height: 100, sort_order: 0, created_at: now(), modified_at: now() }
    await insert(A, 'diary_photos', row)
    const ms = await until(B, 'SELECT media_id FROM diary_photos WHERE id = ?', [row.id], (r) => r[0]?.media_id === mediaId)
    if (ms < 0) return ms
    const got = await fetch(`${API}/media/${mediaId}`, { headers: { authorization: `Bearer ${tokB.access_token}` } })
    const same = got.ok && Buffer.from(await got.arrayBuffer()).equals(jpg)
    return same ? { ms, note: `${Math.round(jpg.length / 1024)}KB` } : { ms: -1, note: `download ${got.status}` }
  })
  // 9 큰 묶음(250건 — 업로드 묶음 200 넘김)
  const bulk = Array.from({ length: 250 }, (_, i) => task(owner, `묶음 ${i}`))
  await A.db.writeTransaction(async (tx) => { for (const t of bulk) await tx.execute('INSERT INTO tasks (id, owner_id, title, status, list_id, sort_order, priority, created_at, modified_at) VALUES (?,?,?,?,?,?,?,?,?)', [t.id, t.owner_id, t.title, 0, '', 0, 0, t.created_at, t.modified_at]) })
  await check('250건 한꺼번에 A → B', () => until(B, "SELECT count(*) AS n FROM tasks WHERE title LIKE '묶음 %'", [], (r) => Number(r[0]?.n) === 250))
  // 10 안 올라간 것이 남지 않았는가
  await check('A·B 올릴 것 0건', async () => { const t0 = Date.now(); const ms = await until(A, 'SELECT count(*) AS n FROM ps_crud', [], (r) => Number(r[0]?.n) === 0); const ms2 = await until(B, 'SELECT count(*) AS n FROM ps_crud', [], (r) => Number(r[0]?.n) === 0); return ms < 0 || ms2 < 0 ? -1 : Date.now() - t0 })

  console.log('통계 A', A.stats, 'B', B.stats)
  await A.db.disconnect(); await B.db.disconnect()
  if (!KEEP) {
    const fresh = await api<Tok>('/auth/login', { email, password })
    await api('/auth/account', { password }, fresh.access_token, 'DELETE').then(() => {
      console.log('시험 계정 지움')
      try { writeFileSync(ledger, readFileSync(ledger, 'utf8').split('\n').filter((l) => l && !l.includes(email)).map((l) => l + '\n').join(''), { mode: 0o600 }) } catch { /* 그만 */ }
    }).catch((e) => console.log('시험 계정 지우기 실패', (e as Error).message))
  }
  const dir = 'docs/verification/sync-e2e'
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ api: API, sync: SYNC, results, statsA: A.stats, statsB: B.stats }, null, 2))
  const fail = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - fail}/${results.length} 통과 · ${file}`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
