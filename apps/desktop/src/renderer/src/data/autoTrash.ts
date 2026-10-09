// 48 만료 2주 지난 할 일 자동 정리 — 앱 쪽: 설정 행 읽기·쓰기, 서버가 만든 묶음 행 보기·되돌리기. 옮기기 자체는 서버(server/api/src/autoTrash.ts).
import { AUTO_TRASH, autoTrashSettingsId, autoTrashSettingsJson, batchJson, parseAutoTrashSettings, parseBatch, type AutoTrashSettings } from '@sprout/schema/autoTrash'
import { getDb, type Stmt } from './db'
import { inboxCtx, insert, run, update } from './mutations'

export type VsRow = { id: string; options_json: string | null }
export const SETTINGS_SQL = `SELECT id, options_json FROM view_settings WHERE view_key = '${AUTO_TRASH.viewKey}' ORDER BY modified_at DESC LIMIT 1`
export const BATCHES_SQL = `SELECT id, options_json FROM view_settings WHERE view_key = '${AUTO_TRASH.batchKey}' ORDER BY created_at DESC`

const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null } }

/** 스위치: 켬/끔 + 이 기기 시간대를 같이 저장(서버가 그 시간대의 날짜로 센다) */
export async function saveAutoTrash(on: boolean): Promise<void> {
  const db = await getDb()
  const row = await db.get<VsRow>(SETTINGS_SQL)
  const next: AutoTrashSettings = { on, tz: deviceTz() ?? parseAutoTrashSettings(row?.options_json).tz }
  const options_json = autoTrashSettingsJson(next)
  if (row) { await run(update('view_settings', row.id, { options_json })); return }
  const { userId } = await inboxCtx()
  await run(insert('view_settings', { id: autoTrashSettingsId(userId ?? 'local'), view_key: AUTO_TRASH.viewKey, sort_dir: 'asc', show_completed: 1, show_details: 0, options_json }))
}

/** 묶음들을 본 것으로(다른 기기에서도 다시 안 뜬다) */
export async function markBatchesSeen(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await getDb()
  const rows = await db.getAll<VsRow>(`SELECT id, options_json FROM view_settings WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  await run(...rows.flatMap((r) => { const b = parseBatch(r.options_json); return b && !b.seen ? [update('view_settings', r.id, { options_json: batchJson({ ...b, seen: true }) })] : [] }))
}

/** 그 묶음만 되돌린다: 아직 그 묶음 시각으로 휴지통에 있는 할 일만 꺼낸다. 되돌린 개수 */
export async function undoBatches(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const db = await getDb()
  const rows = await db.getAll<VsRow>(`SELECT id, options_json FROM view_settings WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  let n = 0
  const stmts: Stmt[] = []
  for (const r of rows) {
    const b = parseBatch(r.options_json)
    if (!b || b.undone) continue
    const still = b.ids.length ? await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE deleted_at = ? AND id IN (${b.ids.map(() => '?').join(',')})`, [b.at, ...b.ids]) : []
    n += still.length
    stmts.push(...still.map((t) => update('tasks', t.id, { deleted_at: null })))
    stmts.push(update('view_settings', r.id, { options_json: batchJson({ ...b, seen: true, undone: true }) }))
  }
  await run(...stmts)
  return n
}
