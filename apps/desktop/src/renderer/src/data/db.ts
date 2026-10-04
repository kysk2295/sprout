// 로컬 DB 접근. Electron에서는 preload가 연 PowerSync 다리(window.sprout.db)를 쓰고,
// 브라우저 미리보기에서는 같은 스키마의 sql.js DB를 쓴다(화면 비교용).
export type Row = Record<string, unknown>
export type Stmt = { sql: string; params?: unknown[] }
export interface DbApi {
  getAll<T = Row>(sql: string, params?: unknown[]): Promise<T[]>
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | null>
  transaction(stmts: Stmt[]): Promise<void>
  watch(sql: string, params: unknown[], onRows: (rows: Row[]) => void, onError?: (e: string) => void): () => void
}

let dbPromise: Promise<DbApi> | undefined
export function getDb(): Promise<DbApi> {
  dbPromise ??= window.sprout?.db
    ? Promise.resolve(window.sprout.db)
    : __WEB_PREVIEW__
      ? import('./webdb').then((m) => m.createWebDb())
      : Promise.reject(new Error('preload DB bridge missing'))
  return dbPromise
}
