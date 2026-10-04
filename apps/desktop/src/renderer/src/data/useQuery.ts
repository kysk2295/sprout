import { useEffect, useState } from 'react'
import { getDb } from './db'

/** SQL 결과를 감시한다. 데이터가 바뀌면 자동으로 다시 그린다(서버를 기다리지 않음 — 01 §10). */
export function useQuery<T>(sql: string, params: unknown[] = []): T[] | undefined {
  const [rows, setRows] = useState<T[]>()
  const key = JSON.stringify(params)
  useEffect(() => {
    let alive = true
    let stop: (() => void) | undefined
    getDb().then((db) => {
      if (!alive) return
      stop = db.watch(sql, JSON.parse(key), (r) => setRows(r as T[]), (e) => console.error('[useQuery]', e, sql))
    })
    return () => {
      alive = false
      stop?.()
    }
  }, [sql, key])
  return rows
}
