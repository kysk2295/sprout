// 48 만료 2주 지난 할 일 자동 정리 — 휴대폰: 설정 행 읽기·쓰기, 서버가 만든 묶음 행 알림·되돌리기(데스크톱 data/autoTrash.ts와 같은 규칙).
// 옮기기 자체는 서버(server/api/src/autoTrash.ts). 규칙·모양은 @sprout/schema/autoTrash.
import { AUTO_TRASH, autoTrashSettingsId, autoTrashSettingsJson, batchJson, parseAutoTrashSettings, parseBatch } from '@sprout/schema/autoTrash'
import { currentUserId } from './auth'
import { db, run, type Stmt } from './db'
import { insert, update } from './tasks'

export type VsRow = { id: string; options_json: string | null }
export const SETTINGS_SQL = `SELECT id, options_json FROM view_settings WHERE view_key = '${AUTO_TRASH.viewKey}' ORDER BY modified_at DESC LIMIT 1`
export const BATCHES_SQL = `SELECT id, options_json FROM view_settings WHERE view_key = '${AUTO_TRASH.batchKey}' ORDER BY created_at DESC`
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')
const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null } }

/** 스위치: 켬/끔 + 이 휴대폰 시간대 */
export async function saveAutoTrash(on: boolean): Promise<void> {
  const row = await db.getOptional<VsRow>(SETTINGS_SQL)
  const options_json = autoTrashSettingsJson({ on, tz: deviceTz() ?? parseAutoTrashSettings(row?.options_json).tz })
  if (row) return run([update('view_settings', row.id, { options_json })])
  return run([insert('view_settings', { id: autoTrashSettingsId(currentUserId()), view_key: AUTO_TRASH.viewKey, sort_dir: 'asc', show_completed: 1, show_details: 0, options_json })])
}

export async function markBatchesSeen(ids: string[]): Promise<void> {
  if (!ids.length) return
  const rows = await db.getAll<VsRow>(`SELECT id, options_json FROM view_settings WHERE id IN (${marks(ids.length)})`, ids)
  await run(rows.flatMap((r) => { const b = parseBatch(r.options_json); return b && !b.seen ? [update('view_settings', r.id, { options_json: batchJson({ ...b, seen: true }) })] : [] }))
}

/** 그 묶음만 되돌리기: 아직 그 묶음 시각으로 휴지통에 있는 할 일만. 되돌린 개수 */
export async function undoBatches(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const rows = await db.getAll<VsRow>(`SELECT id, options_json FROM view_settings WHERE id IN (${marks(ids.length)})`, ids)
  const stmts: Stmt[] = []
  let n = 0
  for (const r of rows) {
    const b = parseBatch(r.options_json)
    if (!b || b.undone) continue
    const still = b.ids.length ? await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE deleted_at = ? AND id IN (${marks(b.ids.length)})`, [b.at, ...b.ids]) : []
    n += still.length
    stmts.push(...still.map((t) => update('tasks', t.id, { deleted_at: null })))
    stmts.push(update('view_settings', r.id, { options_json: batchJson({ ...b, seen: true, undone: true }) }))
  }
  await run(stmts)
  return n
}
