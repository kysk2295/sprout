import { app } from 'electron'
import { column, PowerSyncDatabase, Schema, Table } from '@powersync/node'
import { TABLES } from '@sprout/schema'

// @sprout/schema의 정의로 PowerSync 스키마를 만든다. M1~M2는 서버에 연결하지 않고 로컬 DB로만 쓴다(M3에서 connect).
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

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'sprout.db', dbLocation: app.getPath('userData') }
})
