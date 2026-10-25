// 28 §10 v7 사진: 형식 확인 · 내 것만 · 하루 상한 · 크기 상한
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createMedia, MEDIA_MAX, sniff, type MediaStore } from './media.ts'

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)])
assert.equal(sniff(JPEG), 'image/jpeg')
assert.equal(sniff(PNG), 'image/png')
assert.equal(sniff(Buffer.from('hello')), null)

const rows = new Map<string, { owner: string; mime: string; bytes: Buffer }>()
const store: MediaStore = {
  async countToday(owner) { return [...rows.values()].filter((r) => r.owner === owner).length },
  async insert(owner, mime, bytes) { const id = crypto.randomUUID(); rows.set(id, { owner, mime, bytes }); return id },
  async get(owner, id) { const r = rows.get(id); return r && r.owner === owner ? r : null },
  async remove(owner, id) { const r = rows.get(id); if (r && r.owner === owner) { rows.delete(id); return true } return false },
  async cleanup() { return 0 }
}
const media = createMedia({ store, auth: async (req) => { const u = req.headers.authorization?.slice(7); if (!u) throw Object.assign(new Error('unauthorized'), { status: 401 }); return u }, log: () => {} })
const srv = createServer(async (req, res) => { if (!(await media.handle(req, res, (req.url ?? '/').split('?')[0]))) { res.writeHead(404); res.end() } })
await new Promise<void>((r) => srv.listen(0, r))
const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`
const up = (user: string, body: Buffer, type = 'image/jpeg') => fetch(`${base}/media`, { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': type }, body })

let r = await up('alice', JPEG)
assert.equal(r.status, 201)
const { id } = await r.json() as { id: string }
r = await fetch(`${base}/media/${id}`, { headers: { authorization: 'Bearer alice' } })
assert.equal(r.status, 200)
assert.equal(r.headers.get('content-type'), 'image/jpeg')
assert.deepEqual(Buffer.from(await r.arrayBuffer()), JPEG)
// 남의 것은 안 보임
assert.equal((await fetch(`${base}/media/${id}`, { headers: { authorization: 'Bearer bob' } })).status, 404)
// 로그인 없음
assert.equal((await fetch(`${base}/media/${id}`)).status, 401)
// 형식이 말과 다름 · 이미지 아님 · 지원 안 함
assert.equal((await up('alice', PNG, 'image/jpeg')).status, 400)
assert.equal((await up('alice', Buffer.from('not image'), 'image/png')).status, 400)
assert.equal((await up('alice', JPEG, 'image/gif')).status, 415)
// 크기 상한
assert.equal((await up('alice', Buffer.concat([JPEG, Buffer.alloc(MEDIA_MAX)]))).status, 413)
// 하루 상한(10)
for (let i = 0; i < 9; i++) assert.equal((await up('alice', JPEG)).status, 201)
assert.equal((await up('alice', JPEG)).status, 429)
// 지우기(내 것만)
assert.equal((await fetch(`${base}/media/${id}`, { method: 'DELETE', headers: { authorization: 'Bearer bob' } })).status, 204)
assert.ok(rows.has(id))
assert.equal((await fetch(`${base}/media/${id}`, { method: 'DELETE', headers: { authorization: 'Bearer alice' } })).status, 204)
assert.ok(!rows.has(id))
assert.equal((await fetch(`${base}/media/not-a-uuid`, { headers: { authorization: 'Bearer alice' } })).status, 404)
srv.close()
console.log('media: ok')
