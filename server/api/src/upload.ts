// PowerSync 업로드: 기기의 CRUD 묶음을 Postgres에 적용한다.
// 규칙: 표에 정의된 테이블·칸만 받는다. owner_id는 서버가 로그인한 사용자로 강제한다. 남의 행은 건드리지 못한다.
import { TABLES, type TableName } from '../../../packages/schema/src/index.ts'

export type CrudOp = { op: 'PUT' | 'PATCH' | 'DELETE'; table: string; id: string; data?: Record<string, unknown> }
export type Stmt = { sql: string; params: unknown[] }

export class UploadError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const isTable = (t: string): t is TableName => Object.hasOwn(TABLES, t)

/** 한 연산을 SQL로 바꾼다. 허용하지 않는 테이블·칸이면 UploadError */
export function toStatement(op: CrudOp, userId: string): Stmt {
  if (!isTable(op.table)) throw new UploadError(`unknown table: ${op.table}`)
  if (typeof op.id !== 'string' || !op.id || op.id.length > 64) throw new UploadError('bad id')
  const allowed = TABLES[op.table].columns as Record<string, string>
  const data = Object.entries(op.data ?? {}).filter(([col]) => col !== 'owner_id' && col !== 'id')
  for (const [col] of data) if (!Object.hasOwn(allowed, col)) throw new UploadError(`unknown column: ${op.table}.${col}`)
  const t = op.table

  if (op.op === 'DELETE') return { sql: `DELETE FROM ${t} WHERE id = $1 AND owner_id = $2`, params: [op.id, userId] }

  if (op.op === 'PUT') {
    const cols = ['id', 'owner_id', ...data.map(([c]) => c)]
    const vals = [op.id, userId, ...data.map(([, v]) => v)]
    const ph = cols.map((_, i) => `$${i + 1}`)
    const set = data.map(([c]) => `${c} = EXCLUDED.${c}`)
    // 이미 있는 id가 남의 것이면 덮어쓰지 않는다(WHERE)
    return {
      sql: `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${ph.join(', ')})
            ON CONFLICT (id) DO UPDATE SET ${set.length ? set.join(', ') : 'id = EXCLUDED.id'} WHERE ${t}.owner_id = $2`,
      params: vals
    }
  }

  if (op.op === 'PATCH') {
    if (!data.length) return { sql: 'SELECT 1', params: [] }
    const set = data.map(([c], i) => `${c} = $${i + 3}`)
    return { sql: `UPDATE ${t} SET ${set.join(', ')} WHERE id = $1 AND owner_id = $2`, params: [op.id, userId, ...data.map(([, v]) => v)] }
  }

  throw new UploadError(`unknown op: ${(op as CrudOp).op}`)
}

export function toStatements(batch: unknown, userId: string): Stmt[] {
  if (!Array.isArray(batch)) throw new UploadError('batch must be an array')
  if (batch.length > 1000) throw new UploadError('batch too large', 413)
  return batch.map((op) => toStatement(op as CrudOp, userId))
}
