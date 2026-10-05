// 기본함(lists.kind = 'inbox') 규칙 — 모든 계정에 언제나 하나 있다(2026-10-05 사용자 결정 "기본함은 있어야지. 이걸 디폴트로 해줘").
// - 서버: 계정을 만들 때(이메일 가입·구글·애플 첫 로그인) 같은 트랜잭션에서 id = inbox-<userId> 로 만든다(server/api/src/defaultInbox.ts).
// - 앱: 로그인한 기기가 첫 동기화 뒤에도 기본함이 없으면 같은 id로 만든다 → 서버·다른 기기와 겹쳐도 같은 행이라 둘이 되지 않는다.
// - 혹시 둘 이상이면(예전 데이터) 가장 오래된 것(created_at, 그다음 id)을 기본함으로 쓴다. 지우지 않는다(보기는 kind='inbox' 전부를 보여 준다).
// - 할 일을 만들 때 list_id가 비었거나 없는 리스트면 기본함으로 넣는다(resolveListId). 기본함도 없으면 만든다.
// 02 §14.1 · 08 §8.1
import type { CoreDb, Stmt } from './taskCore.ts'

export const INBOX_NAME = '기본함'
/** 로그인한 계정의 기본함 id(서버·모든 기기 공통). 로그인 전 로컬 기본함은 무작위 uuid → 첫 로그인 때 이 id로 옮긴다 */
export const inboxIdFor = (userId: string) => `inbox-${userId}`

/** 기본함 행(name·kind·정렬). owner_id·시각은 부르는 쪽 규칙을 따른다 */
export function inboxRow(id: string, ownerId: string, at = new Date().toISOString()): Record<string, unknown> {
  return { id, owner_id: ownerId, created_at: at, modified_at: at, name: INBOX_NAME, kind: 'inbox', sort_order: 0, pinned: 0, show_in_smart: 'all' }
}

/** 가장 오래된 기본함부터(created_at 없는 행은 뒤로, 같으면 id) */
export const INBOX_SQL = "SELECT id, name, created_at FROM lists WHERE kind = 'inbox' ORDER BY created_at IS NULL, created_at, id"
/** 목록에서 고를 때 같은 규칙. 없으면 undefined */
export function pickInbox<T extends { id: string; kind?: string | null; created_at?: string | null }>(lists: readonly T[]): T | undefined {
  let best: T | undefined
  for (const l of lists) {
    if (l.kind !== 'inbox') continue
    if (!best) { best = l; continue }
    const a = l.created_at ?? null
    const b = best.created_at ?? null
    if (a !== null && (b === null || a < b || (a === b && l.id < best.id))) best = l
    else if (a === null && b === null && l.id < best.id) best = l
  }
  return best
}

const insertSql = (row: Record<string, unknown>): Stmt => {
  const cols = Object.keys(row)
  return { sql: `INSERT INTO lists (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, params: Object.values(row) }
}

export type InboxCtx = { userId: string | null; ownerId: string; now?: () => string; uuid?: () => string }

/** 기본함이 있으면 그 id, 없으면 만들고 id. 로그인했으면 inbox-<userId>(겹치지 않게), 아니면 uuid */
export async function ensureInbox(db: CoreDb, run: (stmts: Stmt[]) => Promise<unknown>, ctx: InboxCtx): Promise<{ id: string; created: boolean }> {
  const found = await db.get<{ id: string }>(INBOX_SQL)
  if (found) return { id: found.id, created: false }
  const id = ctx.userId ? inboxIdFor(ctx.userId) : (ctx.uuid ?? (() => globalThis.crypto.randomUUID()))()
  // 같은 id 행이 이미 있으면(종류가 바뀐 이상한 경우) 기본함으로 되돌린다
  const same = await db.get<{ id: string }>('SELECT id FROM lists WHERE id = ?', [id])
  const at = ctx.now?.() ?? new Date().toISOString()
  await run([same
    ? { sql: "UPDATE lists SET kind = 'inbox', archived_at = NULL, modified_at = ? WHERE id = ?", params: [at, id] }
    : insertSql(inboxRow(id, ctx.ownerId, at))])
  return { id, created: !same }
}

/** 할 일을 넣을 리스트: 받은 id가 있고 실제 리스트면 그대로, 아니면 기본함(없으면 만든다) */
export async function resolveListId(db: CoreDb, run: (stmts: Stmt[]) => Promise<unknown>, listId: string | null | undefined, ctx: InboxCtx): Promise<string> {
  if (listId && (await db.get<{ id: string }>('SELECT id FROM lists WHERE id = ?', [listId]))) return listId
  return (await ensureInbox(db, run, ctx)).id
}

/**
 * 첫 로그인(서버에 내 데이터 없음 → 이 기기 데이터를 올림) 직전: 로컬 기본함(무작위 id)을 inbox-<userId>로 옮긴다.
 * 서버가 계정을 만들 때 이미 inbox-<userId>를 만들었으므로, 그대로 올리면 기본함이 둘이 된다.
 * 할 일·섹션의 list_id를 바꾸고 옛 행을 지운다. 돌려주는 문은 부르는 쪽이 한 트랜잭션으로 실행한다.
 */
export async function planAdoptInbox(db: CoreDb, userId: string, ownerId: string, at = new Date().toISOString()): Promise<Stmt[]> {
  const target = inboxIdFor(userId)
  const inboxes = await db.getAll<Record<string, unknown> & { id: string }>("SELECT * FROM lists WHERE kind = 'inbox' ORDER BY created_at IS NULL, created_at, id")
  const others = inboxes.filter((l) => l.id !== target)
  if (!others.length) return []
  const out: Stmt[] = []
  if (!inboxes.some((l) => l.id === target)) {
    const keep = others[0]
    out.push(insertSql({ ...inboxRow(target, ownerId, at), created_at: keep.created_at ?? at, sort_order: keep.sort_order ?? 0, show_in_smart: keep.show_in_smart ?? 'all' }))
  }
  for (const old of others) {
    out.push({ sql: 'UPDATE tasks SET list_id = ?, modified_at = ? WHERE list_id = ?', params: [target, at, old.id] })
    out.push({ sql: 'UPDATE sections SET list_id = ?, modified_at = ? WHERE list_id = ?', params: [target, at, old.id] })
    out.push({ sql: 'DELETE FROM lists WHERE id = ?', params: [old.id] })
  }
  return out
}
