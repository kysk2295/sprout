import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { TABLES } from '@sprout/schema'
import { seedStatements } from '@sprout/schema/seed'
import type { DbApi, Row } from './db'

// 브라우저 미리보기 전용 DB. 앱과 같은 테이블·같은 SQL을 쓰고, 쓰기가 끝나면 감시 중인 쿼리를 다시 돌린다.
export async function createWebDb(): Promise<DbApi> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const db = new SQL.Database()
  for (const [name, def] of Object.entries(TABLES)) {
    db.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${Object.keys(def.columns).join(', ')})`)
  }
  const clean = (p: unknown[] = []) => p.map((v) => (v === undefined ? null : v)) as (string | number | null)[]
  for (const s of seedStatements(true)) db.run(s.sql, clean(s.params))

  const all = (sql: string, params: unknown[] = []): Row[] => {
    const st = db.prepare(sql)
    st.bind(clean(params))
    const rows: Row[] = []
    while (st.step()) rows.push(st.getAsObject())
    st.free()
    return rows
  }
  const watchers = new Set<() => void>()
  return {
    getAll: async <T,>(sql: string, params?: unknown[]) => all(sql, params) as T[],
    get: async <T,>(sql: string, params?: unknown[]) => (all(sql, params)[0] ?? null) as T | null,
    transaction: async (stmts) => {
      db.run('BEGIN')
      try {
        for (const s of stmts) db.run(s.sql, clean(s.params))
        db.run('COMMIT')
      } catch (e) {
        db.run('ROLLBACK')
        throw e
      }
      watchers.forEach((w) => w())
    },
    watch: (sql, params, onRows, onError) => {
      const run = () => {
        try {
          onRows(all(sql, params))
        } catch (e) {
          onError?.(String(e))
        }
      }
      run()
      watchers.add(run)
      return () => watchers.delete(run)
    }
  }
}
