import { seedStatements } from '@sprout/schema/seed'
import { ensureInbox, INBOX_NAME, INBOX_SQL } from '@sprout/schema/inbox'
import { db } from './db'

// 기본함이 없으면(첫 실행) 공용 첫 실행 데이터를 넣는다. 개발 모드에서는 예시 데이터 포함.
export async function ensureSeed(withDemo: boolean): Promise<void> {
  const inbox = await renameOldInbox()
  if (inbox) return
  await db.writeTransaction(async (tx) => {
    for (const s of seedStatements(withDemo)) await tx.execute(s.sql, s.params)
  })
}

/** 2026-10-03: 틱틱 한국어 용어로 바꿈(받은함 → 기본함) — 이전에 만든 데이터도 맞춘다. 기본함(가장 오래된 것)을 돌려준다 */
async function renameOldInbox() {
  const inbox = await db.getOptional<{ id: string; name: string }>(INBOX_SQL)
  if (inbox && inbox.name === '받은함') await db.execute('UPDATE lists SET name = ? WHERE id = ?', [INBOX_NAME, inbox.id])
  return inbox
}

/** 로그인한 기기(첫 동기화 뒤): 기본함이 없으면 inbox-<userId>로 만든다(서버·다른 기기와 같은 id라 둘이 되지 않는다). 만들었으면 true */
export async function ensureSignedInInbox(userId: string): Promise<boolean> {
  await renameOldInbox()
  const r = await ensureInbox(
    { getAll: (sql, p = []) => db.getAll(sql, p), get: (sql, p = []) => db.getOptional(sql, p) },
    (stmts) => db.writeTransaction(async (tx) => { for (const s of stmts) await tx.execute(s.sql, s.params ?? []) }),
    { userId, ownerId: userId }
  )
  return r.created
}
