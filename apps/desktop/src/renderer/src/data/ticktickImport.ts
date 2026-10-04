// 17 틱틱에서 가져오기 — 화면 쪽 데이터: 매핑 계획 만들기 · 이미 가져온 것 세기 · 묶음으로 쓰기 · 가져온 할 일만 작업 지도 AI 정리
// 다시 가져와도 겹치지 않는다: 모든 행 id가 틱틱 id에서 정해지고(tt-<사용자>-<종류>-<틱틱 id>), 이미 있는 id는 건너뛴다(sprout에서 고친 내용을 덮어쓰지 않는다).
import { planImport, shortHash, type ImportPlan, type MapContext, type TTBundle } from '../../../shared/ticktick'
import { itemRow } from './collect'
import { getDb, type Stmt } from './db'
import { classifierBaseline, classifyTasks, LIMITS, pruneEmptyAiStmts, readMap, saveSnapshot, serial, takeSnapshot } from './map'
import { insert, now, run, uuid } from './mutations'

const TABLE_ORDER = ['folders', 'lists', 'sections', 'tags', 'tasks', 'check_items', 'task_tags', 'reminders'] as const
type PlanTable = (typeof TABLE_ORDER)[number]
const BATCH = 200
const CHUNK = 500

/** 이 sprout 사용자 범위(로그인 사용자 id 해시). 로그인 전이면 'local' */
export async function importScope(): Promise<string> {
  let user = 'local'
  try { user = (await window.sprout?.auth?.state())?.user?.id ?? 'local' } catch { /* 웹 미리보기 등 */ }
  return shortHash(user, 6)
}

export async function buildContext(at = now()): Promise<MapContext> {
  const db = await getDb()
  const inbox = await db.get<{ id: string }>("SELECT id FROM lists WHERE kind = 'inbox' ORDER BY created_at LIMIT 1")
  if (!inbox) throw new Error('기본함을 찾지 못했어요. 앱을 다시 열어 주세요.')
  const tags = await db.getAll<{ id: string; name: string }>('SELECT id, name FROM tags')
  const max = async (table: string) => (await db.get<{ m: number | null }>(`SELECT max(sort_order) AS m FROM ${table}`))?.m ?? 0
  // 만든 시각이 없는 행은 작업 지도 자동 분류 기준 시각보다 앞으로 — 가져온 수천 개가 5초마다 AI로 가지 않게(정리는 [AI로 정리하기]로)
  const base = Date.parse(classifierBaseline())
  const fallback = new Date(Math.min(Number.isFinite(base) ? base - 1000 : Date.parse(at), Date.parse(at))).toISOString()
  return {
    scope: await importScope(),
    inboxId: inbox.id,
    tagIdsByName: Object.fromEntries(tags.filter((t) => t.name).map((t) => [t.name.trim().toLowerCase(), t.id])),
    listSortBase: Math.max(0, await max('lists')),
    folderSortBase: Math.max(0, await max('folders')),
    tagSortBase: Math.max(0, await max('tags')),
    now: at,
    createdFallback: fallback,
    deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
}

async function existingIds(table: string, ids: string[]): Promise<Set<string>> {
  const db = await getDb()
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK)
    for (const r of await db.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE id IN (${part.map(() => '?').join(',')})`, part)) found.add(r.id)
  }
  return found
}

export interface Preview { plan: ImportPlan; already: number; counts: { lists: number; tasks: number; completed: number; dated: number; repeating: number; notes: number; already: number } }
/** 미리보기: 계획 + 이미 가져온 것(할 일·노트) 수 */
export async function previewImport(bundle: TTBundle, ctx?: MapContext): Promise<Preview> {
  const plan = planImport(bundle, ctx ?? (await buildContext()))
  const already = (await existingIds('tasks', plan.tasks.map((t) => t.id as string))).size + (await existingIds('notes', plan.notes.map((n) => n.id))).size
  const s = plan.stats
  return { plan, already, counts: { lists: s.lists, tasks: s.tasks, completed: s.completed, dated: s.dated, repeating: s.repeating, notes: s.notes, already } }
}

export interface ImportResult { inserted: Record<PlanTable | 'notes', number>; skipped: number; openTaskIds: string[]; datedNew: number; notesPending: number }
/** 쓰기: 테이블 순서대로, 이미 있는 id는 건너뛰고 200줄씩 한 트랜잭션 */
export async function applyImport(plan: ImportPlan, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const stmts: Stmt[] = []
  const inserted = { folders: 0, lists: 0, sections: 0, tags: 0, tasks: 0, check_items: 0, task_tags: 0, reminders: 0, notes: 0 }
  let skipped = 0
  const newTaskIds = new Set<string>()
  for (const table of TABLE_ORDER) {
    const rows = plan[table]
    const have = await existingIds(table, rows.map((r) => r.id as string))
    for (const row of rows) {
      if (have.has(row.id as string)) { if (table === 'tasks') skipped++; continue }
      stmts.push(insert(table, row))
      inserted[table]++
      if (table === 'tasks') newTaskIds.add(row.id as string)
    }
  }
  const haveNotes = await existingIds('notes', plan.notes.map((n) => n.id))
  let notesPending = 0
  for (const n of plan.notes) {
    if (haveNotes.has(n.id)) { skipped++; continue }
    // 수집함 규칙 그대로(링크만 있으면 볼 것, 아니면 자동 분류 설정에 따라 AI 대기). source만 틱틱으로
    const row = itemRow(n.content, { source: 'ticktick_import' as string, captured_at: n.captured_at, fingerprint: n.fingerprint, created_at: n.created_at, modified_at: n.modified_at })
    if (row.ai_state === 'pending') notesPending++
    stmts.push(insert('notes', { id: n.id, ...row }))
    inserted.notes++
  }
  onProgress?.(0, stmts.length)
  for (let i = 0; i < stmts.length; i += BATCH) {
    await run(...stmts.slice(i, i + BATCH))
    onProgress?.(Math.min(stmts.length, i + BATCH), stmts.length)
  }
  const fresh = plan.tasks.filter((t) => newTaskIds.has(t.id as string))
  return {
    inserted,
    skipped,
    openTaskIds: fresh.filter((t) => t.status === 0 && String(t.title ?? '').trim()).map((t) => t.id as string),
    datedNew: fresh.filter((t) => t.due_at).length,
    notesPending
  }
}

/** 이 범위에서 가져온 미완료 할 일 id(다시 열었을 때 [AI로 정리하기]용) */
export async function importedOpenTaskIds(scope?: string): Promise<string[]> {
  const s = scope ?? (await importScope())
  const rows = await (await getDb()).getAll<{ id: string }>("SELECT id FROM tasks WHERE id LIKE ? AND status = 0 AND deleted_at IS NULL AND title != '' ORDER BY created_at", [`tt-${s}-task-%`])
  return rows.map((r) => r.id)
}

/** 가져온 할 일만 작업 지도 AI로 나눈다(14 ✦ 다시 정리와 같은 방식: 정리 전 상태 보관 → 되돌리기 가능, 직접 옮긴 것은 건드리지 않음) */
export async function organizeImported(taskIds: string[], opts: { signal: AbortSignal; onProgress?: (done: number, total: number) => void; chat?: Parameters<typeof classifyTasks>[1]['chat'] }): Promise<{ runId: string; count: number; total: number }> {
  return serial(async () => {
    const before = await readMap()
    const runId = uuid()
    saveSnapshot(takeSnapshot(before.areas, before.taskAreas, runId))
    const user = new Set(before.taskAreas.filter((r) => r.source === 'user').map((r) => r.task_id))
    const ids = taskIds.filter((id) => !user.has(id))
    let count = 0
    opts.onProgress?.(0, ids.length)
    for (let i = 0; i < ids.length; i += LIMITS.batch) {
      if (opts.signal.aborted) break
      const r = await classifyTasks(ids.slice(i, i + LIMITS.batch), { signal: opts.signal, runId, chat: opts.chat })
      count += r.assigned.length + r.review
      opts.onProgress?.(Math.min(ids.length, i + LIMITS.batch), ids.length)
    }
    const after = await readMap()
    await run(...pruneEmptyAiStmts(after.areas, after.taskAreas))
    return { runId, count, total: ids.length }
  })
}
