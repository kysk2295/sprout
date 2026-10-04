import assert from 'node:assert/strict'
import { toStatement, toStatements, UploadError } from './upload.ts'

const me = '00000000-0000-0000-0000-000000000001'

// PUT: owner_id는 기기가 보낸 값 대신 로그인한 사용자로 강제
{
  const s = toStatement({ op: 'PUT', table: 'tasks', id: 't1', data: { title: 'a', owner_id: 'someone-else', priority: 3 } }, me)
  assert.match(s.sql, /^INSERT INTO tasks \(id, owner_id, title, priority\)/)
  assert.deepEqual(s.params, ['t1', me, 'a', 3])
  assert.match(s.sql, /WHERE tasks\.owner_id = \$2/, '남의 행은 덮어쓰지 않는다')
}
// PATCH / DELETE는 owner_id 조건
{
  const p = toStatement({ op: 'PATCH', table: 'lists', id: 'l1', data: { name: 'x' } }, me)
  assert.equal(p.sql, 'UPDATE lists SET name = $3 WHERE id = $1 AND owner_id = $2')
  assert.deepEqual(p.params, ['l1', me, 'x'])
  const d = toStatement({ op: 'DELETE', table: 'lists', id: 'l1' }, me)
  assert.deepEqual(d.params, ['l1', me])
}
// 모르는 테이블·칸·연산은 거절(SQL 주입 차단)
assert.throws(() => toStatement({ op: 'PUT', table: 'users', id: 'u', data: {} }, me), (e: UploadError) => e.status === 409)
assert.throws(() => toStatement({ op: 'PUT', table: 'tasks', id: 'x', data: { 'title; DROP TABLE tasks': 1 } }, me), (e: UploadError) => e.status === 409)
assert.throws(() => toStatement({ op: 'PUT', table: 'tasks', id: '', data: {} }, me), (e: UploadError) => e.status === 400)
assert.throws(() => toStatement({ op: 'NOPE' as never, table: 'tasks', id: 'x' }, me), UploadError)
assert.throws(() => toStatements('nope', me), UploadError)
assert.equal(toStatement({ op: 'PATCH', table: 'tasks', id: 'x', data: {} }, me).sql, 'SELECT 1')
console.log('upload: ok')
