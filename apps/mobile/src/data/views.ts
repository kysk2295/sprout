// 보기(서랍에서 고른 목록)마다의 조회 조건·묶음·정렬 — 21 §2·§6, 02 §3·§14(데스크톱 data/views.ts와 같은 범위 규칙)
// 순수 모듈(시험: views.test.ts). 화면은 이 결과(묶음 카드 목록)를 그대로 그린다.
import { datePart, hasTime } from '@sprout/schema/time'
import { dayKey, monthDay, timeGroup, TIME_GROUPS } from '../lib/dates.ts'

export type ViewKey = string // 'smart:today' | 'smart:tomorrow' | 'smart:next7' | 'smart:inbox' | 'smart:completed' | 'smart:trash' | 'list:<id>' | 'folder:<id>'
export const DEFAULT_VIEW: ViewKey = 'smart:today'

export interface TaskRow {
  id: string
  list_id: string | null
  parent_id: string | null
  section_id: string | null
  title: string
  content: string | null
  content_mode: string | null
  status: number
  priority: number
  start_at: string | null
  due_at: string | null
  is_all_day: number | null
  sort_order: number | null
  repeat_rule: string | null
  pinned_at: string | null
  created_at: string | null
  completed_at: string | null
  deleted_at: string | null
  list_name: string | null
  list_emoji: string | null
  list_color: string | null
  list_kind: string | null
  check_total: number
  check_done: number
  reminder_count: number
}
export interface ListRow { id: string; name: string; emoji: string | null; color: string | null; kind: string; folder_id: string | null; sort_order: number }
export interface FolderRow { id: string; name: string; sort_order: number }
export interface SectionRow { id: string; list_id: string; name: string; sort_order: number }

export const isListView = (v: ViewKey) => v.startsWith('list:') || v === 'smart:inbox'
export const isArchive = (v: ViewKey) => v === 'smart:completed' || v === 'smart:trash'
/** 스마트 목록이면 행 아래 메타 줄에 리스트 이름(21 §2) */
export const showsListName = (v: ViewKey) => !isListView(v)

export const COLUMNS = `t.id, t.list_id, t.parent_id, t.section_id, t.title, t.content, t.content_mode, t.status, t.priority, t.start_at, t.due_at,
  t.is_all_day, t.sort_order, t.repeat_rule, t.pinned_at, t.created_at, t.completed_at, t.deleted_at,
  l.name AS list_name, l.emoji AS list_emoji, l.color AS list_color, l.kind AS list_kind,
  (SELECT count(*) FROM check_items c WHERE c.task_id = t.id) AS check_total,
  (SELECT count(*) FROM check_items c WHERE c.task_id = t.id AND c.done = 1) AS check_done,
  (SELECT count(*) FROM reminders r WHERE r.task_id = t.id) AS reminder_count`

const IN_SMART = "l.archived_at IS NULL AND COALESCE(l.show_in_smart, 'all') = 'all'"
const S = 'substr(COALESCE(t.start_at, t.due_at), 1, 10)'
const E = 'substr(t.due_at, 1, 10)'

function scope(view: ViewKey, mode: 'open' | 'done', today: string): { where: string; params: unknown[] } {
  const [kind, id] = view.split(':')
  const d = (n: number) => dayKey(n, new Date(`${today}T00:00`))
  if (kind === 'list') return { where: 't.list_id = ?', params: [id] }
  if (kind === 'folder') return { where: 'l.folder_id = ? AND l.archived_at IS NULL', params: [id] }
  switch (id) {
    case 'today':
      return mode === 'open' ? { where: `${IN_SMART} AND ${S} <= ?`, params: [today] } : { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [today, today] }
    case 'tomorrow': return { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [d(1), d(1)] }
    case 'next7': return { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [d(6), today] }
    case 'inbox': return { where: "l.kind = 'inbox'", params: [] }
    default: return { where: IN_SMART, params: [] }
  }
}

/** 미완료(+ 그 하위 할 일 전부 — 부모 아래 보이게, 02 §6) */
export function openSql(view: ViewKey, today = dayKey()): { sql: string; params: unknown[] } {
  if (view === 'smart:trash') return { sql: `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC LIMIT 300`, params: [] }
  if (view === 'smart:completed') return { sql: `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 1 AND t.deleted_at IS NULL ORDER BY t.completed_at DESC LIMIT 300`, params: [] }
  const sc = scope(view, 'open', today)
  return {
    sql: `WITH RECURSIVE base(id) AS (
            SELECT t.id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND ${sc.where}),
          tree(id) AS (
            SELECT id FROM base UNION SELECT c.id FROM tasks c JOIN tree ON c.parent_id = tree.id WHERE c.status = 0 AND c.deleted_at IS NULL)
          SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.id IN (SELECT id FROM tree)`,
    params: sc.params
  }
}
/** 완료 묶음(21 §6: 오늘 목록은 오늘 마감이면서 완료) */
export function doneSql(view: ViewKey, today = dayKey()): { sql: string; params: unknown[] } {
  if (isArchive(view)) return { sql: 'SELECT NULL AS id WHERE 0', params: [] }
  const sc = scope(view, 'done', today)
  return { sql: `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 1 AND t.deleted_at IS NULL AND ${sc.where} ORDER BY t.completed_at DESC LIMIT 200`, params: sc.params }
}

// ── 묶음 ──
export interface Node { task: TaskRow; children: Node[] }
export interface Group {
  id: string
  title: string
  rows: Node[]
  count: number
  /** 만료됨 머리의 "미루기"(21 §4.1) */
  postpone?: boolean
  /** 완료 묶음은 처음에 접힘(21 §3) */
  collapsedByDefault?: boolean
  done?: boolean
}

/** 스마트 목록 정렬(21 §2 [임시]): 날짜 → 같은 날은 시각 있는 것 시각순 → 종일 → 우선순위 높은 순 → sort_order */
export function bySmartDate(a: TaskRow, b: TaskRow): number {
  const ad = a.due_at ? datePart(a.start_at ?? a.due_at) : '9999'
  const bd = b.due_at ? datePart(b.start_at ?? b.due_at) : '9999'
  if (ad !== bd) return ad < bd ? -1 : 1
  const at = hasTime(a.start_at ?? a.due_at) ? 0 : 1
  const bt = hasTime(b.start_at ?? b.due_at) ? 0 : 1
  if (at !== bt) return at - bt
  if (!at) {
    const x = (a.start_at ?? a.due_at)!
    const y = (b.start_at ?? b.due_at)!
    if (x !== y) return x < y ? -1 : 1
  }
  if (a.priority !== b.priority) return b.priority - a.priority
  return (a.sort_order ?? 0) - (b.sort_order ?? 0)
}
export const byCustom = (a: TaskRow, b: TaskRow) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_at ?? '').localeCompare(b.created_at ?? '')

/** 행들을 부모-자식 트리로(같은 결과 안에 부모가 있으면 그 아래로) */
export function buildTree(rows: TaskRow[], sort: (a: TaskRow, b: TaskRow) => number): Node[] {
  const ids = new Set(rows.map((r) => r.id))
  const kids = new Map<string, TaskRow[]>()
  const roots: TaskRow[] = []
  for (const r of rows) {
    if (r.parent_id && ids.has(r.parent_id)) kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r])
    else roots.push(r)
  }
  const node = (t: TaskRow): Node => ({ task: t, children: (kids.get(t.id) ?? []).sort(byCustom).map(node) })
  return roots.sort(sort).map(node)
}
const countOf = (nodes: Node[]): number => nodes.reduce((n, x) => n + 1 + countOf(x.children), 0)

export function buildGroups(view: ViewKey, open: TaskRow[], done: TaskRow[], ctx: { today: string; sections?: SectionRow[]; lists?: ListRow[] }): Group[] {
  const { today } = ctx
  const groups: Group[] = []
  const push = (id: string, title: string, nodes: Node[], extra: Partial<Group> = {}) => {
    if (nodes.length) groups.push({ id, title, rows: nodes, count: countOf(nodes), ...extra })
  }
  if (view === 'smart:trash') {
    push('trash', '휴지통', buildTree(open, () => 0))
    return groups
  }
  if (view === 'smart:completed') {
    const byDay = new Map<string, TaskRow[]>()
    for (const t of open) {
      const d = t.completed_at ? dayKey(0, new Date(t.completed_at)) : '0000'
      byDay.set(d, [...(byDay.get(d) ?? []), t])
    }
    for (const [d, rows] of byDay) {
      const title = d === today ? '오늘' : d === dayKey(-1, new Date(`${today}T00:00`)) ? '어제' : monthDay(d, today)
      push(`day:${d}`, title, rows.map((task) => ({ task, children: [] })))
    }
    return groups
  }
  const listLike = isListView(view)
  const sort = listLike ? byCustom : bySmartDate
  const tree = buildTree(open, sort)
  const pinned = tree.filter((n) => n.task.pinned_at)
  const rest = tree.filter((n) => !n.task.pinned_at)
  push('pinned', '고정', pinned)
  if (listLike) {
    const sections = ctx.sections ?? []
    const known = new Set(sections.map((s) => s.id))
    const unsectioned = rest.filter((n) => !n.task.section_id || !known.has(n.task.section_id))
    // 섹션이 없으면 머리 없는 카드 하나, 있으면 미분류를 맨 앞(머리 없음) + 섹션마다 카드(02 §0)
    push('s:none', '', unsectioned)
    for (const s of [...sections].sort((a, b) => a.sort_order - b.sort_order)) push(`s:${s.id}`, s.name, rest.filter((n) => n.task.section_id === s.id))
  } else if (view.startsWith('folder:')) {
    for (const l of ctx.lists ?? []) push(`l:${l.id}`, listTitle(l), rest.filter((n) => n.task.list_id === l.id))
  } else {
    for (const [id, name] of TIME_GROUPS) push(id, name, rest.filter((n) => timeGroup(n.task, today) === id), id === 'overdue' ? { postpone: true } : {})
  }
  if (done.length) groups.push({ id: 'done', title: '완료', rows: done.map((task) => ({ task, children: [] })), count: done.length, collapsedByDefault: true, done: true })
  return groups
}

export const listTitle = (l: { kind: string | null; name: string | null; emoji?: string | null }) => (l.kind === 'inbox' ? '기본함' : l.name ?? '')

const SMART_TITLES: Record<string, string> = { today: '오늘', tomorrow: '내일', next7: '다음 7일', inbox: '기본함', completed: '완료', trash: '휴지통' }
export function viewTitle(view: ViewKey, lists: ListRow[], folders: FolderRow[]): { title: string; emoji?: string | null } {
  const [kind, id] = view.split(':')
  if (kind === 'list') {
    const l = lists.find((x) => x.id === id)
    return { title: l ? listTitle(l) : '', emoji: l?.emoji }
  }
  if (kind === 'folder') return { title: folders.find((f) => f.id === id)?.name ?? '' }
  return { title: SMART_TITLES[id] ?? '' }
}

/** 새 할 일 기본값(02 §4): 지금 보기 조건을 따른다 */
export function newTaskDefaults(view: ViewKey, inboxId: string, today = dayKey()): { list_id: string; due_at: string | null } {
  const [kind, id] = view.split(':')
  if (kind === 'list') return { list_id: id, due_at: null }
  if (id === 'today' || id === 'next7') return { list_id: inboxId, due_at: today }
  if (id === 'tomorrow') return { list_id: inboxId, due_at: dayKey(1, new Date(`${today}T00:00`)) }
  return { list_id: inboxId, due_at: null }
}
