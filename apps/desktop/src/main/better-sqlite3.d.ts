// better-sqlite3(13)은 타입을 함께 주지 않는다 — main/calendars.ts가 쓰는 만큼만 선언(16 캘린더 캐시)
declare module 'better-sqlite3' {
  namespace Database {
    interface Statement { run(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] }
    interface Database {
      prepare(sql: string): Statement
      exec(sql: string): void
      pragma(sql: string): unknown
      transaction<T>(fn: () => T): () => T
      close(): void
      readonly inTransaction: boolean
    }
  }
  const Database: { new (file: string): Database.Database }
  export default Database
}
