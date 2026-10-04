import { seedStatements } from '@sprout/schema/seed'
import { db } from './db'

// 기본함이 없으면(첫 실행) 공용 첫 실행 데이터를 넣는다. 개발 모드에서는 예시 데이터 포함.
export async function ensureSeed(withDemo: boolean): Promise<void> {
  const inbox = await db.getOptional<{ id: string; name: string }>("SELECT id, name FROM lists WHERE kind = 'inbox' LIMIT 1")
  // 2026-10-03: 틱틱 한국어 용어로 바꿈(받은함 → 기본함) — 이전에 만든 데이터도 맞춘다
  if (inbox && inbox.name === '받은함') await db.execute('UPDATE lists SET name = ? WHERE id = ?', ['기본함', inbox.id])
  if (inbox) return
  await db.writeTransaction(async (tx) => {
    for (const s of seedStatements(withDemo)) await tx.execute(s.sql, s.params)
  })
}
