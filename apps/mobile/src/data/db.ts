// 로컬 SQLite(PowerSync) — 스키마는 @sprout/schema TABLES 하나에서 만든다(데스크톱 main/db.ts와 같은 변환).
import { column, PowerSyncDatabase, Schema, SyncStreamConnectionMethod, Table } from '@powersync/react-native'
import { Platform } from 'react-native'
import { TABLES } from '@sprout/schema'
import type { CoreDb, Stmt } from '@sprout/schema/taskCore'

const columnOf = { text: column.text, integer: column.integer, real: column.real } as const

export const AppSchema = new Schema(
  Object.fromEntries(
    Object.entries(TABLES).map(([name, def]) => [
      name,
      new Table(
        Object.fromEntries(Object.entries(def.columns).map(([col, type]) => [col, columnOf[type]])),
        'indexes' in def ? { indexes: def.indexes } : undefined
      )
    ])
  )
)

export const db = new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename: 'sprout.db' } })

/** 공용 taskCore가 읽는 최소 인터페이스 */
export const coreDb: CoreDb = {
  getAll: <T,>(sql: string, params?: unknown[]) => db.getAll<T>(sql, params ?? []),
  get: <T,>(sql: string, params?: unknown[]) => db.getOptional<T>(sql, params ?? [])
}

/** 문 목록을 한 트랜잭션으로 실행한다(로컬에 바로 기록 → PowerSync가 서버로 올린다) */
export async function run(stmts: Stmt[]): Promise<void> {
  if (!stmts.length) return
  await db.writeTransaction(async (tx) => {
    for (const s of stmts) await tx.execute(s.sql, (s.params ?? []) as never[])
  })
}
export type { Stmt }

/** 연결 방식(2026-10-05 Android 확인): Android에서는 HTTP 스트리밍(expo/fetch)이 `connecting`에서 멈춰 내려받기가 시작되지 않는다
 *  → Android만 WebSocket으로 연결한다(같은 PowerSync 서비스, Tailscale Funnel에서 동작 확인). iOS는 기본(HTTP 스트리밍) 그대로 */
export const CONNECT_OPTIONS = Platform.OS === 'android' ? { connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET } : undefined
