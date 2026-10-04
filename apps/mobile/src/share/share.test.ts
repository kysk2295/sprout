// 24 공유 시험: ① 링크 판정이 데스크톱 collect.ts와 같다 ② 업로드 형식 ③ 대기열 비우기는 몇 번 돌려도 한 줄
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { firstUrl, isBareLink, TASK_HINT, URL_RE } from './link.ts'
import { composeContent, parseItem, shareRow, uploadBody, type ShareItem } from './row.ts'
import { drainQueue, type QueueIO } from './queue.ts'

// ── ① 데스크톱과 같은 규칙: 정규식 원문이 그대로이고, 예시 결과가 같다 ──
const desktop = readFileSync(new URL('../../../desktop/src/shared/collect.ts', import.meta.url), 'utf8')
assert.ok(desktop.includes(`const URL_RE = ${URL_RE.toString()}`), 'URL_RE가 데스크톱과 다르다')
assert.ok(desktop.includes(`const TASK_HINT = ${TASK_HINT.toString()}`), 'TASK_HINT가 데스크톱과 다르다')
assert.ok(desktop.includes(`export const firstUrl = (text: string) => text.match(URL_RE)?.[0]?.replace(/[.,!?。]+$/, '') ?? null`), 'firstUrl 본문이 다르다')
assert.ok(desktop.includes(`const rest = text.replace(url, '').trim()\n  return rest.length <= 40 && !TASK_HINT.test(rest)`), 'isBareLink 본문이 다르다')
const vectors = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8')) as { cases: { text: string; url: string | null; bare: boolean }[] }
for (const c of vectors.cases) {
  assert.equal(firstUrl(c.text), c.url, `firstUrl: ${c.text}`)
  assert.equal(isBareLink(c.text), c.bare, `isBareLink: ${c.text}`)
}

// ── ② 행·업로드 형식 ──
assert.equal(composeContent('  금요일까지 보기 ', '\nhttps://youtu.be/x\n'), '금요일까지 보기\nhttps://youtu.be/x')
assert.equal(composeContent('', '글만'), '글만')
const at = '2026-10-05T01:02:03.000Z'
const link = shareRow('https://youtu.be/k7Gs1aBcD2e', at)
assert.deepEqual(link, {
  content: 'https://youtu.be/k7Gs1aBcD2e', task_id: null, url: 'https://youtu.be/k7Gs1aBcD2e', kind: 'link', kind_source: 'ai', ai_state: 'done',
  source: 'app', captured_at: at, fingerprint: null, created_at: at, modified_at: at
})
const memo = shareRow(composeContent('금요일까지 보기', 'https://youtu.be/k7Gs1aBcD2e'), at)
assert.equal(memo.kind, null)
assert.equal(memo.ai_state, 'pending')
assert.equal(memo.url, 'https://youtu.be/k7Gs1aBcD2e')
const text = shareRow('내일 3시 치과', at)
assert.equal(text.url, null)
assert.equal(text.ai_state, 'pending')
const item: ShareItem = { v: 1, id: '6f1c2c1e-0000-4000-8000-000000000001', content: '내일 3시 치과', captured_at: at, user_id: 'u1' }
const body = uploadBody(item)
assert.deepEqual(Object.keys(body), ['batch'])
assert.equal(body.batch.length, 1)
assert.equal(body.batch[0].op, 'PUT')
assert.equal(body.batch[0].table, 'notes')
assert.equal(body.batch[0].id, item.id)
assert.ok(!('owner_id' in body.batch[0].data) && !('id' in body.batch[0].data), 'owner_id·id는 data에 넣지 않는다(서버가 강제)')
// 서버가 받는 칸만(@sprout/schema notes)
const { TABLES } = await import('../../../../packages/schema/src/index.ts')
for (const col of Object.keys(body.batch[0].data)) assert.ok(Object.hasOwn(TABLES.notes.columns, col), `notes에 없는 칸: ${col}`)
// 대기열 파일 읽기: 망가진 것·빈 내용은 버림
assert.deepEqual(parseItem(JSON.stringify(item)), item)
assert.equal(parseItem('{'), null)
assert.equal(parseItem(JSON.stringify({ ...item, content: '  ' })), null)
assert.equal(parseItem(JSON.stringify({ ...item, v: 2 })), null)
assert.equal(parseItem(JSON.stringify({ ...item, user_id: undefined }))?.user_id, null)

// ── ③ 대기열 비우기: 같은 id는 한 번만, 몇 번 돌려도 같다 ──
function fakeIO(files: Record<string, string>, local: Map<string, unknown>, failInsert = false): QueueIO {
  return {
    list: async () => Object.keys(files),
    read: async (n) => files[n],
    remove: async (n) => { delete files[n] },
    exists: async (id) => local.has(id),
    insert: async (id, row) => { if (failInsert) throw new Error('db'); if (local.has(id)) throw new Error('dup'); local.set(id, row) }
  }
}
const local = new Map<string, unknown>()
const a = { ...item, id: 'a' }, b = { ...item, id: 'b', content: 'https://a.com' }
const files: Record<string, string> = {
  'a.json': JSON.stringify(a),
  'a-copy.json': JSON.stringify(a), // 같은 id가 두 파일에(확장이 두 번 쓴 경우)
  'b.json': JSON.stringify(b),
  'broken.json': '{',
  'other.json': JSON.stringify({ ...item, id: 'c', user_id: 'someone-else' }),
  'note.txt': 'x'
}
const r1 = await drainQueue(fakeIO(files, local), 'u1')
assert.deepEqual(r1, { inserted: 2, skipped: 1, dropped: 2, failed: 0 })
assert.deepEqual([...local.keys()].sort(), ['a', 'b'])
assert.equal((local.get('b') as { kind: string }).kind, 'link')
assert.deepEqual(Object.keys(files), ['note.txt'])
// 확장이 이미 올려 동기화로 내려온 항목 + 남은 파일 → 넣지 않고 지움
files['a.json'] = JSON.stringify(a)
const r2 = await drainQueue(fakeIO(files, local), 'u1')
assert.deepEqual(r2, { inserted: 0, skipped: 1, dropped: 0, failed: 0 })
assert.equal(local.size, 2)
// 넣기 실패 → 파일을 남겨 다음에 다시
files['d.json'] = JSON.stringify({ ...item, id: 'd' })
const warn = console.warn
console.warn = () => {} // 일부러 낸 실패라 경고를 숨긴다
const r3 = await drainQueue(fakeIO(files, local, true), 'u1')
console.warn = warn
assert.equal(r3.failed, 1)
assert.ok('d.json' in files)
const r4 = await drainQueue(fakeIO(files, local), 'u1')
assert.equal(r4.inserted, 1)
assert.ok(!('d.json' in files))
// user_id 없는 항목(옛 형식)은 지금 사용자로
files['e.json'] = JSON.stringify({ ...item, id: 'e', user_id: null })
assert.equal((await drainQueue(fakeIO(files, local), 'u1')).inserted, 1)

console.log('share: ok')
