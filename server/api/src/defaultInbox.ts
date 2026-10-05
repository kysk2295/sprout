// 기본함(lists.kind = 'inbox')은 모든 계정에 언제나 하나 있다(2026-10-05 사용자 결정, 08 §8.1·02 §14.1).
// - 계정을 만드는 모든 길(이메일 가입·구글·애플 첫 로그인)은 CREATE_USER_SQL 한 문으로 사용자 + 기본함을 같이 만든다(한 문 = 원자적).
// - id = 'inbox-' || 사용자 id(앱 packages/schema/src/inbox.ts inboxIdFor와 같다) → 앱이 같은 id로 만들어도 둘이 되지 않는다.
// - 로그인·리프레시 때도 ENSURE_INBOX_SQL로 없으면 만든다(예전 계정 자가 치유). 이미 있으면 아무것도 안 한다.
// - GET /auth/me의 has_data는 이 자동 기본함만 있는 계정을 "데이터 없음"으로 본다 → 첫 기기가 로컬 데이터를 올린다.

/** 앱 seed와 같은 ISO 문자열(…T…Z) */
const NOW_ISO = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
const COLS = '(id, owner_id, created_at, modified_at, name, kind, sort_order, pinned, show_in_smart)'
/** 사용자 표 별칭 u의 각 행에 대해 기본함 행. fromWhere = "FROM … u WHERE …" */
const inboxSelect = (fromWhere: string) => `SELECT 'inbox-' || u.id::text, u.id, ${NOW_ISO}, ${NOW_ISO}, '기본함', 'inbox', 0, 0, 'all' ${fromWhere}`
const NO_INBOX = `NOT EXISTS (SELECT 1 FROM lists x WHERE x.owner_id = u.id AND x.kind = 'inbox')`

export const inboxIdFor = (userId: string) => `inbox-${userId}`

/** $1 이메일, $2 비밀번호 해시(소셜은 NULL). 같은 이메일이 있으면 0행(기본함도 안 만든다) */
export const CREATE_USER_SQL =
  `WITH u AS (INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email),
        l AS (INSERT INTO lists ${COLS} ${inboxSelect('FROM u')} ON CONFLICT (id) DO NOTHING)
   SELECT id, email FROM u`

/** $1 사용자 id: 기본함이 하나도 없을 때만 만든다 */
export const ENSURE_INBOX_SQL = `INSERT INTO lists ${COLS} ${inboxSelect(`FROM users u WHERE u.id = $1 AND ${NO_INBOX}`)} ON CONFLICT (id) DO NOTHING`

/** 마이그레이션(server/db/migrations/20261009-default-inbox.sql)과 같은 일: 기본함이 없는 모든 사용자 */
export const BACKFILL_INBOX_SQL = `INSERT INTO lists ${COLS} ${inboxSelect(`FROM users u WHERE ${NO_INBOX}`)} ON CONFLICT (id) DO NOTHING`

/** $1 사용자 id, $2 자동 기본함 id. 자동 기본함 하나만 있으면 false(그 기본함에 할 일이 있으면 true) */
export const HAS_DATA_SQL =
  `SELECT EXISTS (SELECT 1 FROM lists WHERE owner_id = $1 AND id <> $2)
       OR EXISTS (SELECT 1 FROM tasks WHERE owner_id = $1)
       OR EXISTS (SELECT 1 FROM notes WHERE owner_id = $1)
       OR EXISTS (SELECT 1 FROM events WHERE owner_id = $1) AS has`

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>

/** 사용자 + 기본함을 한 문으로. 같은 이메일이 이미 있으면 null */
export async function createUserWithInbox(q: Q, email: string, passwordHash: string | null): Promise<{ id: string; email: string } | null> {
  const r = await q(CREATE_USER_SQL, [email, passwordHash])
  return r.rows[0] ?? null
}
export async function ensureDefaultInbox(q: Q, userId: string): Promise<boolean> {
  const r = await q(ENSURE_INBOX_SQL, [userId])
  return (r.rowCount ?? 0) > 0
}
export async function hasData(q: Q, userId: string): Promise<boolean> {
  const r = await q(HAS_DATA_SQL, [userId, inboxIdFor(userId)])
  return !!r.rows[0]?.has
}
