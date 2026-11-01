// 47 §20.3 서버 AI 비서 턴의 도구 DB — 기기 SQLite용 도구 SQL(사용자 조건 없음)을 Postgres에서 "그 사용자 행만" 읽게 한다.
// 쿼리마다 READ ONLY 트랜잭션 + set_config('sprout.user_id') + search_path = assistant_scope(보기만, migrations/20261101-assistant-scope.sql).
// 사용자 값이 없으면 보기가 오류를 낸다(아무것도 안 보임). SELECT 한 문장만, public.·pg_·; 가 있으면 거절.
import pg from 'pg'
import type { AssistantDb } from '../../../packages/schema/src/assistantExec.ts'

type Client = { query(q: unknown, values?: unknown[]): Promise<{ rows: any[] }>; release(): void }
export type ConnectPool = { connect(): Promise<Client> }

/** SQLite 자리표 ? → $1, $2 … (따옴표 안은 그대로) */
export function toPg(sql: string): string {
  let out = '', n = 0, quote: string | null = null
  for (const ch of sql) {
    if (quote) { if (ch === quote) quote = null; out += ch; continue }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue }
    out += ch === '?' ? `$${++n}` : ch
  }
  return out
}

export class AssistantQueryRejected extends Error { constructor() { super('assistant query rejected'); this.name = 'AssistantQueryRejected' } }
/** 도구 SQL만 통과: SELECT 한 문장, 다른 스키마·시스템 카탈로그 이름 없음 */
export function checkQuery(sql: string) {
  if (!/^\s*SELECT\b/i.test(sql) || /;|\bpublic\s*\.|\bpg_|\binformation_schema\b|\bassistant_scope\s*\./i.test(sql)) throw new AssistantQueryRejected()
}

// COUNT(*) 등 bigint·numeric은 SQLite처럼 숫자로(pg 기본은 문자열)
const NUMERIC = new Set([20, 1700])
const types = { getTypeParser: (oid: number, format?: any) => (NUMERIC.has(oid) ? (v: string) => Number(v) : pg.types.getTypeParser(oid, format)) }

export function scopedDb(pool: ConnectPool, userId: string): AssistantDb {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('invalid user id')
  return {
    async getAll<T = any>(sql: string, args: unknown[] = []): Promise<T[]> {
      checkQuery(sql)
      const c = await pool.connect()
      try {
        await c.query('BEGIN READ ONLY')
        await c.query("SELECT set_config('sprout.user_id', $1, true), set_config('search_path', 'assistant_scope, pg_catalog', true)", [userId])
        const r = await c.query({ text: toPg(sql), values: args, types })
        await c.query('COMMIT')
        return r.rows as T[]
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        c.release()
      }
    }
  }
}

/** API 시작 때: 보기를 지금 표 모양으로 다시 만든다. 마이그레이션 전이면 false(서버 턴 꺼짐) */
export async function prepareAssistantScope(pool: { query(sql: string): Promise<unknown> }): Promise<boolean> {
  try { await pool.query('SELECT assistant_scope.refresh()'); return true } catch { return false }
}
