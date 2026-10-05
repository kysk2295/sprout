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
// 33 관계 위키: 새 칸·새 표 relations를 받는다
assert.ok(toStatement({ op: 'PUT', table: 'relations', id: 'rel-1', data: { from_type: 'task', from_id: 't', to_type: 'tag', to_id: 'g', source: 'link', state: 'accepted', field: 'title' } }, me).sql.startsWith('INSERT INTO relations'))
assert.ok(toStatement({ op: 'PATCH', table: 'task_tags', id: 'tt', data: { source: 'ai', state: 'dismissed', confidence: 92, run_id: 'r' } }, me).sql.startsWith('UPDATE task_tags'))
assert.ok(toStatement({ op: 'PATCH', table: 'tags', id: 'g', data: { kind: 'person', aliases: '["지도교수님"]', description: 'd', topic_id: 'w', home_type: 'folder', home_id: 'f', source: 'ai', run_id: 'r' } }, me).sql.startsWith('UPDATE tags'))
assert.ok(toStatement({ op: 'PATCH', table: 'lists', id: 'l', data: { description: '설명' } }, me).sql.startsWith('UPDATE lists'))
console.log('upload: ok')
