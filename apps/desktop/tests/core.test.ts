// e2e-core: 새 사용자 핵심 흐름 — 추가 입력 자연어 인식(02 §4·04)과 태그 만들기(05)
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { TABLES } from '@sprout/schema'
import { parseAdd } from '../src/renderer/src/lib/addParse'
import { ensureTags } from '../src/renderer/src/data/organization'

const SQL = await initSqlJs()
const db = new SQL.Database()
for (const [name, def] of Object.entries(TABLES)) db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
const all = (sql: string, params: unknown[] = []) => { const s = db.prepare(sql); s.bind(params as never); const r: Record<string, unknown>[] = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
Object.assign(globalThis, { window: { sprout: { db: {
  getAll: async (sql: string, p?: unknown[]) => all(sql, p),
  get: async (sql: string, p?: unknown[]) => all(sql, p)[0] ?? null,
  transaction: async (stmts: { sql: string; params?: unknown[] }[]) => { db.run('BEGIN'); try { for (const s of stmts) db.run(s.sql, s.params as never); db.run('COMMIT') } catch (e) { db.run('ROLLBACK'); throw e } }
} } } })

const now = new Date('2026-10-04T10:00:00')
const lists = [{ id: 'l-work', name: '업무' }, { id: 'l-inbox', name: '기본함' }]
const tags = [{ id: 't-imp', name: '중요' }]

// 추가 바·빠른 추가 모두 날짜 문구와 기호 토큰을 제목에서 뺀다(02 §0, 2026-10-05 사용자 결정 "틱틱처럼")
{
  const r = parseAdd('내일 오후 3시 회의 #중요 #회의록 !높음 ~업무', lists, tags, { keepDate: false, now })
  assert.equal(r.title, '회의')
  assert.equal(r.due_at, '2026-10-05T15:00')
  assert.equal(r.priority, 3)
  assert.equal(r.list_id, 'l-work')
  assert.deepEqual(r.tag_ids, ['t-imp'])
  assert.deepEqual(r.newTags, ['회의록'])
  assert.ok(r.tokens.includes('#회의록') && r.tokens.includes('내일'))
}
// 빠른 추가(keepDate 아님): 날짜 문구도 뺀다. 없는 리스트(~없는)는 제목에 남는다
{
  const r = parseAdd('모레 장보기 ~없는리스트 #새태그', lists, tags, { keepDate: false, now })
  assert.equal(r.title, '장보기 ~없는리스트')
  assert.equal(r.due_at, '2026-10-06')
  assert.deepEqual(r.newTags, ['새태그'])
  assert.equal(r.list_id, undefined)
}
// 단어 중간의 #은 태그가 아니다
{
  const r = parseAdd('C#공부', lists, tags, { keepDate: true, now })
  assert.equal(r.title, 'C#공부')
  assert.deepEqual(r.newTags, [])
}
// ensureTags: 없으면 만들고, 있으면 같은 id(중복 생성 없음)
{
  const [a] = await ensureTags(['집안일'])
  const [b, c] = await ensureTags(['집안일', ' '])
  assert.equal(a, b)
  assert.equal(c, undefined)
  assert.equal(all("SELECT count(*) AS n FROM tags WHERE name='집안일'")[0].n, 1)
}
console.log('core tests ok')
