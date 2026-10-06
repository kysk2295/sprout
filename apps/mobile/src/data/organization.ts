// 리스트·폴더·태그·필터·섹션 만들기·고치기·지우기(05·07, 02 §0 섹션) + 보기 설정·스마트 목록 표시(04) — 데스크톱 data/organization.ts와 같은 규칙.
// - 리스트 삭제 = 안의 할 일을 휴지통으로 + 리스트는 보관(복원하면 소속 유지). 기본함은 삭제·보관 금지
// - 폴더 삭제(그룹 해제) = 리스트를 맨 위로 옮기고 폴더만 지움. 태그 삭제 = 할 일은 두고 연결만 지움, 하위 태그는 맨 위로
// - 태그는 최대 2단계(자기 자신·하위 있는 태그를 부모로 못 고름)
import { COUNT_THROTTLE, useRows } from './rows'
import { deleteStmt, type Stmt } from '@sprout/schema/taskCore'
import { File, Paths } from 'expo-file-system'
import { db, run } from './db'
import { readFilter, type FilterRow } from './filters'
import { insert, update } from './tasks'
import { IN_SMART, readVisibility, settingsOf, type ListRow, type SectionRow, type ViewSettings, type Visibility } from './views'

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const nextOrder = async (table: string) => ((await db.getOptional<{ m: number | null }>(`SELECT max(sort_order) AS m FROM ${table}`))?.m ?? 0) + 1

export interface TagFull { id: string; name: string; color: string | null; parent_id: string | null; pinned: number | null; sort_order: number; kind?: string | null }
export interface ListFull extends ListRow { pinned: number | null; show_in_smart: string | null; archived_at: string | null }

// ── 읽기 ──
export function useTagsFull(): TagFull[] {
  return useRows<TagFull>('SELECT id, name, color, parent_id, pinned, sort_order, kind FROM tags ORDER BY COALESCE(pinned, 0) DESC, sort_order, name').data
}
export function useFilters(): FilterRow[] {
  return useRows<FilterRow>('SELECT id, name, emoji, rule_json, sort_order FROM filters ORDER BY sort_order, name').data
}
/** 서랍용: 보관 안 된 리스트(고정 먼저) */
export function useListsFull(): ListFull[] {
  return useRows<ListFull>("SELECT id, name, emoji, color, kind, folder_id, sort_order, pinned, show_in_smart, archived_at FROM lists WHERE archived_at IS NULL ORDER BY kind = 'inbox' DESC, COALESCE(pinned, 0) DESC, sort_order, name").data
}
export function useArchivedLists(): ListFull[] {
  return useRows<ListFull>('SELECT id, name, emoji, color, kind, folder_id, sort_order, pinned, show_in_smart, archived_at FROM lists WHERE archived_at IS NOT NULL ORDER BY archived_at DESC').data
}
export function useListFull(id: string | null): ListFull | undefined {
  return useRows<ListFull>('SELECT id, name, emoji, color, kind, folder_id, sort_order, pinned, show_in_smart, archived_at FROM lists WHERE id = ?', [id ?? '']).data[0]
}
/** 서랍 개수 중 lists.ts에 없는 것: 전체·태그별(미완료) */
export function useOrgCounts(): { all: number; tags: Record<string, number> } {
  const all = useRows<{ n: number }>(`SELECT count(*) AS n FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND ${IN_SMART}`, [], COUNT_THROTTLE).data[0]?.n ?? 0
  const per = useRows<{ tag_id: string; n: number }>(
    "SELECT tt.tag_id, count(DISTINCT tt.task_id) AS n FROM task_tags tt JOIN tasks t ON t.id = tt.task_id LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND l.archived_at IS NULL AND COALESCE(tt.state,'accepted') = 'accepted' GROUP BY tt.tag_id", [], COUNT_THROTTLE).data
  return { all, tags: Object.fromEntries(per.map((r) => [r.tag_id, r.n])) }
}
/** 완료·계획 취소·휴지통 개수('auto' 표시용) */
export function useArchiveCounts(): { completed: number; wontdo: number; trash: number } {
  const r = useRows<{ completed: number; wontdo: number; trash: number }>(
    `SELECT (SELECT count(*) FROM tasks WHERE status = 1 AND deleted_at IS NULL) AS completed,
            (SELECT count(*) FROM tasks WHERE status = 2 AND deleted_at IS NULL) AS wontdo,
            (SELECT count(*) FROM tasks WHERE deleted_at IS NOT NULL) AS trash`, [], COUNT_THROTTLE).data[0]
  return { completed: r?.completed ?? 0, wontdo: r?.wontdo ?? 0, trash: r?.trash ?? 0 }
}

// ── 스마트 목록 표시(user_prefs.smart_list_visibility, 데스크톱 설정과 같은 값) ──
const PREFS = 'SELECT id, smart_list_visibility FROM user_prefs ORDER BY created_at LIMIT 1'
export function useSmartVisibility(): Record<string, Visibility> {
  return readVisibility(useRows<{ smart_list_visibility: string | null }>(PREFS).data[0]?.smart_list_visibility)
}
export async function setSmartVisibility(id: string, v: Visibility) {
  const row = await db.getOptional<{ id: string; smart_list_visibility: string | null }>(PREFS)
  const next = JSON.stringify({ ...readVisibility(row?.smart_list_visibility), [id]: v })
  await run([row ? update('user_prefs', row.id, { smart_list_visibility: next }) : insert('user_prefs', { id: uuid(), smart_list_visibility: next })])
}

// ── 보기 설정(view_settings, 데스크톱과 같은 view_key·값) ──
export function useViewSettings(view: string): ViewSettings {
  const row = useRows<{ group_by: string | null; sort_by: string | null }>('SELECT group_by, sort_by FROM view_settings WHERE view_key = ?', [view]).data[0]
  return settingsOf(view, row)
}
export async function saveViewSettings(view: string, patch: Partial<ViewSettings>) {
  const row = await db.getOptional<{ id: string }>('SELECT id FROM view_settings WHERE view_key = ?', [view])
  await run([row ? update('view_settings', row.id, patch) : insert('view_settings', { id: uuid(), view_key: view, sort_dir: 'asc', show_completed: 1, show_details: 0, ...patch })])
}

// ── 리스트 ──
export interface ListInput { name: string; emoji: string | null; color: string | null; folder_id: string | null; show_in_smart: 'all' | 'none' }
export async function saveList(id: string | null, v: ListInput): Promise<string> {
  const name = v.name.trim()
  if (!name) throw new Error('이름을 입력해 주세요.')
  const data = { ...v, name, emoji: v.emoji?.trim() || null }
  if (id) {
    await run([update('lists', id, data)])
    return id
  }
  const next = uuid()
  await run([insert('lists', { id: next, kind: 'normal', pinned: 0, sort_order: await nextOrder('lists'), ...data })])
  return next
}
export async function pinList(id: string, on: boolean) { await run([update('lists', id, { pinned: on ? 1 : 0 })]) }
export async function archiveList(id: string, on: boolean) {
  const row = await db.getOptional<{ kind: string }>('SELECT kind FROM lists WHERE id = ?', [id])
  if (row?.kind === 'inbox') throw new Error('기본함은 보관할 수 없어요.')
  await run([update('lists', id, { archived_at: on ? now() : null })])
}
/** 리스트 삭제: 할 일은 휴지통으로, 리스트는 보관 상태로 남긴다(05 데이터 보존 규칙) */
export async function deleteList(id: string) {
  const row = await db.getOptional<{ kind: string }>('SELECT kind FROM lists WHERE id = ?', [id])
  if (!row || row.kind === 'inbox') throw new Error('기본함은 삭제할 수 없어요.')
  const tasks = await db.getAll<{ id: string }>('SELECT id FROM tasks WHERE list_id = ? AND deleted_at IS NULL', [id])
  const at = now()
  await run([...tasks.map((t) => update('tasks', t.id, { deleted_at: at })), update('lists', id, { archived_at: at })])
}

// ── 폴더 ──
export async function saveFolder(id: string | null, name: string, listIds?: string[]): Promise<string> {
  const v = name.trim()
  if (!v) throw new Error('이름을 입력해 주세요.')
  const fid = id ?? uuid()
  const stmts: Stmt[] = [id ? update('folders', id, { name: v }) : insert('folders', { id: fid, name: v, sort_order: await nextOrder('folders') })]
  for (const l of listIds ?? []) stmts.push(update('lists', l, { folder_id: fid }))
  await run(stmts)
  return fid
}
/** 그룹 해제: 리스트를 맨 위로 옮기고 폴더만 지운다 */
export async function ungroupFolder(id: string) {
  const lists = await db.getAll<{ id: string }>('SELECT id FROM lists WHERE folder_id = ?', [id])
  await run([...lists.map((l) => update('lists', l.id, { folder_id: null })), deleteStmt('folders', id)])
}

// ── 태그 ──
export async function saveTag(id: string | null, v: { name: string; color: string | null; parent_id: string | null }): Promise<string> {
  const name = v.name.trim().replace(/^#/, '')
  if (!name) throw new Error('이름을 입력해 주세요.')
  if (/[\s#,]/.test(name)) throw new Error('태그 이름에는 띄어쓰기·#·쉼표를 쓸 수 없어요.')
  if (v.parent_id) {
    const parent = await db.getOptional<{ parent_id: string | null }>('SELECT parent_id FROM tags WHERE id = ?', [v.parent_id])
    const children = id ? await db.getAll('SELECT id FROM tags WHERE parent_id = ?', [id]) : []
    if (!parent || parent.parent_id || v.parent_id === id || children.length) throw new Error('태그는 최대 2단계로 정리할 수 있어요.')
  }
  const dup = await db.getOptional<{ id: string }>('SELECT id FROM tags WHERE name = ? AND id != ?', [name, id ?? ''])
  if (dup) throw new Error('같은 이름의 태그가 있어요.')
  if (id) {
    await run([update('tags', id, { ...v, name })])
    return id
  }
  const next = uuid()
  await run([insert('tags', { id: next, pinned: 0, sort_order: await nextOrder('tags'), ...v, name })])
  return next
}
export async function pinTag(id: string, on: boolean) { await run([update('tags', id, { pinned: on ? 1 : 0 })]) }
export async function deleteTag(id: string) {
  const links = await db.getAll<{ id: string }>('SELECT id FROM task_tags WHERE tag_id = ?', [id])
  const kids = await db.getAll<{ id: string }>('SELECT id FROM tags WHERE parent_id = ?', [id])
  await run([...links.map((t) => deleteStmt('task_tags', t.id)), ...kids.map((t) => update('tags', t.id, { parent_id: null })), deleteStmt('tags', id)])
}

// ── 필터 ──
export async function saveFilter(id: string | null, v: { name: string; emoji: string | null; rule_json: string }): Promise<string> {
  const name = v.name.trim()
  if (!name) throw new Error('이름을 입력해 주세요.')
  readFilter(v.rule_json) // 형식 확인
  const data = { name, emoji: v.emoji?.trim() || null, rule_json: v.rule_json }
  if (id) {
    await run([update('filters', id, data)])
    return id
  }
  const next = uuid()
  await run([insert('filters', { id: next, sort_order: await nextOrder('filters'), ...data })])
  return next
}
export async function deleteFilter(id: string) { await run([deleteStmt('filters', id)]) }

// ── 섹션(02 §0: 새 섹션은 맨 위, 삭제하면 할 일은 미분류로) ──
export async function addSection(listId: string, name: string): Promise<string> {
  const v = name.trim()
  if (!v) throw new Error('섹션 이름을 입력해 주세요.')
  const min = (await db.getOptional<{ m: number | null }>('SELECT min(sort_order) AS m FROM sections WHERE list_id = ?', [listId]))?.m
  const id = uuid()
  await run([insert('sections', { id, list_id: listId, name: v, sort_order: (min ?? 1) - 1 })])
  return id
}
export async function renameSection(id: string, name: string) {
  const v = name.trim()
  if (!v) throw new Error('섹션 이름을 입력해 주세요.')
  await run([update('sections', id, { name: v })])
}
export async function deleteSection(id: string) {
  const tasks = await db.getAll<{ id: string }>('SELECT id FROM tasks WHERE section_id = ?', [id])
  await run([...tasks.map((t) => update('tasks', t.id, { section_id: null })), deleteStmt('sections', id)])
}
export async function moveSection(sections: SectionRow[], id: string, dir: -1 | 1) {
  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order)
  const i = sorted.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sorted.length) return
  await run([update('sections', sorted[i].id, { sort_order: sorted[j].sort_order }), update('sections', sorted[j].id, { sort_order: sorted[i].sort_order })])
}

// ── 날짜 없는 할 일 일정 잡기(06 §9 할일 정렬 패널의 휴대폰판) ──
export async function scheduleOn(id: string, due: string) {
  await run([update('tasks', id, { start_at: null, due_at: due, is_all_day: due.includes('T') ? 0 : 1 })])
}

// ── 최근 검색(기기에만 — 시안 H-1) ──
const recentFile = () => new File(Paths.document, 'sprout-recent-search.json')
export function loadRecent(): string[] {
  try {
    const f = recentFile()
    if (!f.exists) return []
    const v = JSON.parse(f.textSync())
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : []
  } catch {
    return []
  }
}
export function saveRecent(list: string[]) {
  try {
    const f = recentFile()
    if (!f.exists) f.create()
    f.write(JSON.stringify(list))
  } catch { /* 기기 저장 실패는 무시 — 다음 검색에서 다시 */ }
}

