import { ipcMain, type MessagePortMain } from 'electron'
import { db } from './db'

// 렌더러 ↔ 로컬 DB 다리. SQL은 렌더러의 data 계층에서 만들고, 여기서는 실행만 한다.
type Stmt = { sql: string; params?: unknown[] }

export function registerDbIpc(): void {
  ipcMain.handle('db:getAll', (_e, sql: string, params: unknown[] = []) => db.getAll(sql, params))
  ipcMain.handle('db:get', (_e, sql: string, params: unknown[] = []) => db.getOptional(sql, params))
  ipcMain.handle('db:transaction', async (_e, stmts: Stmt[]) => {
    await db.writeTransaction(async (tx) => {
      for (const s of stmts) await tx.execute(s.sql, s.params ?? [])
    })
  })

  // watch: 렌더러가 MessagePort를 넘기면, 쿼리 결과가 바뀔 때마다 그 포트로 행을 보낸다. 포트를 닫으면 감시 종료.
  ipcMain.on('db:watch', (event, payload: Stmt) => {
    const [port] = event.ports as MessagePortMain[]
    const abort = new AbortController()
    port.on('close', () => abort.abort())
    port.start()
    db.watchWithCallback(
      payload.sql,
      payload.params ?? [],
      {
        onResult: (r) => port.postMessage({ rows: r.rows?._array ?? [] }),
        onError: (err) => port.postMessage({ error: String(err) })
      },
      { signal: abort.signal }
    )
  })
}
