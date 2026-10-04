// 보기(서랍에서 고른 목록)마다의 조회 조건·묶음·정렬 — 21 §2·§6, 02 §0·§3·§11·§14(데스크톱 data/views.ts와 같은 범위 규칙)
// 순수 모듈(시험: views.test.ts). 화면은 이 결과(묶음 카드 목록)를 그대로 그린다.
// 2026-10-05 모바일 전체 기능: 전체·계획 취소·태그·필터 보기, 묶기·정렬(view_settings 동기화 — 데스크톱과 같은 키·값)
import { datePart, hasTime } from '@sprout/schema/time'
import { dayKey, monthDay, timeGroup, TIME_GROUPS } from '../lib/dates.ts'
import { filterScope } from './filters.ts'

/**
 * 'smart:today' | 'smart:tomorrow' | 'smart:next7' | 'smart:inbox' | 'smart:all' | 'smart:completed' | 'smart:wontdo' | 'smart:trash'
 * | 'list:<id>' | 'folder:<id>' | 'tag:<id>' | 'filter:<id>'
 * | 'date:<YYYY-MM-DD>' 또는 'date:<YYYY-MM-DDTHH:mm>' — 캘린더 빈 칸에서 빠른 입력을 열 때 기본 날짜만(목록 보기는 아님)
 */
export type ViewKey = string
export const DEFAULT_VIEW: ViewKey = 'smart:today'
/** 첫 ':' 앞뒤로 나눈다(날짜 보기의 시각에 ':'가 들어 있다) */
export function splitView(view: ViewKey): [string, string] {
  const i = view.indexOf(':')
  return i < 0 ? [view, ''] : [view.slice(0, i), view.slice(i + 1)]
}

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
  /** 붙은 태그 id들(쉼표) — 태그 묶기·정렬·캘린더 색 */
  tag_ids?: string | null
}
export interface ListRow { id: string; name: string; emoji: string | null; color: string | null; kind: string; folder_id: string | null; sort_order: number }
export interface FolderRow { id: string; name: string; sort_order: number }
export interface SectionRow { id: string; list_id: string; name: string; sort_order: number }
export interface TagLite { id: string; name: string; color?: string | null; parent_id?: string | null }

export const SMART_IDS = ['today', 'tomorrow', 'next7', 'inbox', 'all', 'completed', 'wontdo', 'trash'] as const
const ARCHIVE = ['smart:completed', 'smart:wontdo', 'smart:trash']
export const isListView = (v: ViewKey) => v.startsWith('list:') || v === 'smart:inbox'
export const isArchive = (v: ViewKey) => ARCHIVE.includes(v)
/** 스마트 목록이면 행 아래 메타 줄에 리스트 이름(21 §2) */
export const showsListName = (v: ViewKey) => !isListView(v)

export const COLUMNS = `t.id, t.list_id, t.parent_id, t.section_id, t.title, t.content, t.content_mode, t.status, t.priority, t.start_at, t.due_at,
  t.is_all_day, t.sort_order, t.repeat_rule, t.pinned_at, t.created_at, t.completed_at, t.deleted_at,
  l.name AS list_name, l.emoji AS list_emoji, l.color AS list_color, l.kind AS list_kind,
  (SELECT count(*) FROM check_items c WHERE c.task_id = t.id) AS check_total,
  (SELECT count(*) FROM check_items c WHERE c.task_id = t.id AND c.done = 1) AS check_done,
  (SELECT count(*) FROM reminders r WHERE r.task_id = t.id) AS reminder_count,
  (SELECT group_concat(x.tag_id) FROM task_tags x WHERE x.task_id = t.id) AS tag_ids`

export const IN_SMART = "l.archived_at IS NULL AND COALESCE(l.show_in_smart, 'all') = 'all'"
const S = 'substr(COALESCE(t.start_at, t.due_at), 1, 10)'
const E = 'substr(t.due_at, 1, 10)'

/** 보기 범위. mode='open'은 미완료, 'done'은 아래 완료 묶음(02 §11 — 오늘·내일은 그날 마감인 것) */
export function scope(view: ViewKey, mode: 'open' | 'done', today: string): { where: string; params: unknown[] } {
  const [kind, id] = splitView(view)
  const d = (n: number) => dayKey(n, new Date(`${today}T00:00`))
  if (kind === 'list') return { where: 't.list_id = ?', params: [id] }
  if (kind === 'folder') return { where: 'l.folder_id = ? AND l.archived_at IS NULL', params: [id] }
  if (kind === 'tag') return { where: 'l.archived_at IS NULL AND EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)', params: [id] }
  if (kind === 'filter') return filterScope(id, today, d(1), d(6))
  switch (id) {
    case 'today':
      return mode === 'open' ? { where: `${IN_SMART} AND ${S} <= ?`, params: [today] } : { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [today, today] }
    case 'tomorrow': return { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [d(1), d(1)] }
    case 'next7': return { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [d(6), today] }
    case 'inbox': return { where: "l.kind = 'inbox'", params: [] }
    default: return { where: IN_SMART, params: [] } // all
  }
}

/** 미완료(+ 그 하위 할 일 전부 — 부모 아래 보이게, 02 §6). 완료·계획 취소·휴지통은 그 보관함 전체 */
export function openSql(view: ViewKey, today = dayKey()): { sql: string; params: unknown[] } {
  const from = `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id`
  if (view === 'smart:trash') return { sql: `${from} WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC LIMIT 500`, params: [] }
  if (view === 'smart:completed') return { sql: `${from} WHERE t.status = 1 AND t.deleted_at IS NULL ORDER BY t.completed_at DESC LIMIT 500`, params: [] }
  if (view === 'smart:wontdo') return { sql: `${from} WHERE t.status = 2 AND t.deleted_at IS NULL ORDER BY t.completed_at DESC LIMIT 500`, params: [] }
  const sc = scope(view, 'open', today)
  return {
    sql: `WITH RECURSIVE base(id) AS (
            SELECT t.id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND ${sc.where}),
          tree(id) AS (
            SELECT id FROM base UNION SELECT c.id FROM tasks c JOIN tree ON c.parent_id = tree.id WHERE c.status = 0 AND c.deleted_at IS NULL)
          ${from} WHERE t.id IN (SELECT id FROM tree)`,
    params: sc.params
  }
}
/** 완료 묶음(02 §11: 완료 + 계획 취소, 최근순) */
export function doneSql(view: ViewKey, today = dayKey()): { sql: string; params: unknown[] } {
  if (isArchive(view)) return { sql: 'SELECT NULL AS id WHERE 0', params: [] }
  const sc = scope(view, 'done', today)
  return { sql: `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status IN (1, 2) AND t.deleted_at IS NULL AND ${sc.where} ORDER BY t.completed_at DESC LIMIT 200`, params: sc.params }
}

// ── 묶기·정렬(02 §0 실측 값, view_settings로 기기 사이 동기화 — 데스크톱과 같은 키) ──
export type GroupBy = 'custom' | 'time' | 'tag' | 'priority' | 'list' | 'none'
export type SortBy = 'custom' | 'date' | 'title' | 'tag' | 'priority'
export interface ViewSettings { group_by: GroupBy; sort_by: SortBy }
export const GROUP_LABEL: Record<GroupBy, string> = { custom: '사용자 설정', time: '날짜', tag: '태그', priority: '우선 순위', list: '목록', none: '없음' }
export const SORT_LABEL: Record<SortBy, string> = { custom: '사용자 설정', date: '날짜', title: '제목', tag: '태그', priority: '우선 순위' }
export function defaultSettings(view: ViewKey): ViewSettings {
  if (isListView(view)) return { group_by: 'custom', sort_by: 'custom' }
  if (view.startsWith('folder:')) return { group_by: 'list', sort_by: 'date' }
  return { group_by: 'time', sort_by: 'date' }
}
export const groupOptions = (view: ViewKey): GroupBy[] => (isListView(view) ? ['custom', 'time', 'tag', 'priority', 'none'] : ['list', 'time', 'tag', 'priority', 'none'])
export const sortOptions = (view: ViewKey): SortBy[] => (isListView(view) ? ['custom', 'date', 'title', 'tag', 'priority'] : ['date', 'title', 'tag', 'priority'])
/** 저장된 값(데스크톱이 쓴 값 포함)을 이 보기에서 쓸 수 있는 값으로 */
export function settingsOf(view: ViewKey, row?: { group_by?: string | null; sort_by?: string | null } | null): ViewSettings {
  const d = defaultSettings(view)
  const g = row?.group_by as GroupBy | undefined
  const s = row?.sort_by as SortBy | undefined
  return { group_by: g && groupOptions(view).includes(g) ? g : d.group_by, sort_by: s && sortOptions(view).includes(s) ? s : d.sort_by }
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
  /** 섹션 묶음(길게 눌러 이름 바꾸기·삭제) */
  sectionId?: string
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
export function sorter(by: SortBy, tags: TagLite[] = []): (a: TaskRow, b: TaskRow) => number {
  const firstTag = (t: TaskRow) => {
    const ids = t.tag_ids?.split(',') ?? []
    const names = tags.filter((g) => ids.includes(g.id)).map((g) => g.name).sort()
    return names[0] ?? null
  }
  switch (by) {
    case 'custom': return byCustom
    case 'title': return (a, b) => a.title.localeCompare(b.title, 'ko') || byCustom(a, b)
    case 'priority': return (a, b) => b.priority - a.priority || bySmartDate(a, b)
    case 'tag': return (a, b) => {
      const x = firstTag(a)
      const y = firstTag(b)
      if (x !== y) return x === null ? 1 : y === null ? -1 : x.localeCompare(y, 'ko')
      return bySmartDate(a, b)
    }
    default: return bySmartDate
  }
}

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
const PRIORITY_GROUPS: [string, string][] = [['p3', '높은 우선순위'], ['p2', '중간 우선순위'], ['p1', '낮은 우선순위'], ['p0', '우선순위 없음']]

export function buildGroups(
  view: ViewKey,
  open: TaskRow[],
  done: TaskRow[],
  ctx: { today: string; sections?: SectionRow[]; lists?: ListRow[]; tags?: TagLite[]; settings?: ViewSettings }
): Group[] {
  const { today } = ctx
  const groups: Group[] = []
  const push = (id: string, title: string, nodes: Node[], extra: Partial<Group> = {}) => {
    if (nodes.length || extra.sectionId) groups.push({ id, title, rows: nodes, count: countOf(nodes), ...extra })
  }
  if (view === 'smart:trash') {
    push('trash', '휴지통', buildTree(open, () => 0))
    return groups
  }
  if (view === 'smart:completed' || view === 'smart:wontdo') {
    const byDay = new Map<string, TaskRow[]>()
    for (const t of open) {
      const d = t.completed_at ? dayKey(0, new Date(t.completed_at)) : '0000'
      byDay.set(d, [...(byDay.get(d) ?? []), t])
    }
    for (const [d, rows] of byDay) {
      const title = d === '0000' ? '날짜 없음' : d === today ? '오늘' : d === dayKey(-1, new Date(`${today}T00:00`)) ? '어제' : monthDay(d, today)
      push(`day:${d}`, title, rows.map((task) => ({ task, children: [] })))
    }
    return groups
  }
  const settings = ctx.settings ?? defaultSettings(view)
  const tags = ctx.tags ?? []
  const tree = buildTree(open, sorter(settings.sort_by, tags))
  const pinned = tree.filter((n) => n.task.pinned_at)
  const rest = tree.filter((n) => !n.task.pinned_at)
  push('pinned', '고정', pinned)
  switch (settings.group_by) {
    case 'custom': {
      // 섹션이 없으면 머리 없는 카드 하나, 있으면 미분류를 맨 앞(머리 없음) + 섹션마다 카드(빈 섹션도 머리는 보인다 — 02 §0)
      const sections = ctx.sections ?? []
      const known = new Set(sections.map((s) => s.id))
      push('s:none', '', rest.filter((n) => !n.task.section_id || !known.has(n.task.section_id)))
      for (const s of [...sections].sort((a, b) => a.sort_order - b.sort_order)) push(`s:${s.id}`, s.name, rest.filter((n) => n.task.section_id === s.id), { sectionId: s.id })
      break
    }
    case 'list': {
      const lists = ctx.lists ?? []
      const seen = new Set<string>()
      for (const l of lists) {
        seen.add(l.id)
        push(`l:${l.id}`, listTitle(l), rest.filter((n) => n.task.list_id === l.id))
      }
      // 서랍에 없는 리스트(보관 등)는 리스트 이름으로 뒤에
      const others = new Map<string, Node[]>()
      for (const n of rest) if (!seen.has(n.task.list_id ?? '')) others.set(n.task.list_id ?? '', [...(others.get(n.task.list_id ?? '') ?? []), n])
      for (const [id, nodes] of others) push(`l:${id}`, listTitle({ kind: nodes[0].task.list_kind, name: nodes[0].task.list_name }), nodes)
      break
    }
    case 'priority':
      for (const [id, name] of PRIORITY_GROUPS) push(id, name, rest.filter((n) => `p${n.task.priority}` === id))
      break
    case 'tag': {
      const first = (t: TaskRow) => {
        const ids = t.tag_ids?.split(',') ?? []
        return tags.find((g) => ids.includes(g.id))?.id ?? null
      }
      for (const g of tags) push(`tg:${g.id}`, g.name, rest.filter((n) => first(n.task) === g.id))
      push('tg:none', '태그 없음', rest.filter((n) => first(n.task) === null))
      break
    }
    case 'none':
      push('all', '', rest)
      break
    default:
      for (const [id, name] of TIME_GROUPS) push(id, name, rest.filter((n) => timeGroup(n.task, today) === id), id === 'overdue' ? { postpone: true } : {})
  }
  if (done.length) groups.push({ id: 'done', title: '완료', rows: done.map((task) => ({ task, children: [] })), count: done.length, collapsedByDefault: true, done: true })
  return groups
}

export const listTitle = (l: { kind: string | null; name: string | null; emoji?: string | null }) => (l.kind === 'inbox' ? '기본함' : l.name ?? '')

export const SMART_TITLES: Record<string, string> = {
  today: '오늘', tomorrow: '내일', next7: '다음 7일', inbox: '기본함', all: '전체', completed: '완료', wontdo: '계획 취소', trash: '휴지통'
}
export function viewTitle(
  view: ViewKey,
  lists: ListRow[],
  folders: FolderRow[],
  more: { tags?: TagLite[]; filters?: { id: string; name: string; emoji: string | null }[] } = {}
): { title: string; emoji?: string | null } {
  const [kind, id] = splitView(view)
  if (kind === 'list') {
    const l = lists.find((x) => x.id === id)
    return { title: l ? listTitle(l) : '', emoji: l?.emoji }
  }
  if (kind === 'folder') return { title: folders.find((f) => f.id === id)?.name ?? '' }
  if (kind === 'tag') return { title: `#${more.tags?.find((g) => g.id === id)?.name ?? ''}` }
  if (kind === 'filter') {
    const f = more.filters?.find((x) => x.id === id)
    return { title: f?.name ?? '', emoji: f?.emoji }
  }
  return { title: SMART_TITLES[id] ?? '' }
}

/** 새 할 일 기본값(02 §4): 지금 보기 조건을 따른다. 태그 보기는 그 태그를 붙인다 */
export function newTaskDefaults(view: ViewKey, inboxId: string, today = dayKey()): { list_id: string; due_at: string | null; tag_id?: string } {
  const [kind, id] = splitView(view)
  if (kind === 'list') return { list_id: id, due_at: null }
  if (kind === 'tag') return { list_id: inboxId, due_at: null, tag_id: id }
  if (kind === 'date') return { list_id: inboxId, due_at: id || null }
  if (id === 'today' || id === 'next7') return { list_id: inboxId, due_at: today }
  if (id === 'tomorrow') return { list_id: inboxId, due_at: dayKey(1, new Date(`${today}T00:00`)) }
  return { list_id: inboxId, due_at: null }
}

// ── 스마트 목록 표시(04 설정 · user_prefs.smart_list_visibility — 데스크톱과 같은 값) ──
export type Visibility = 'show' | 'hide' | 'auto'
export const VISIBILITY_KEYS: [string, string][] = [
  ['all', '전체'], ['today', '오늘'], ['tomorrow', '내일'], ['next7', '다음 7일'], ['inbox', '기본함'], ['filters', '필터'], ['tags', '태그'], ['completed', '완료'], ['wontdo', '계획 취소'], ['trash', '휴지통']
]
export function readVisibility(raw: string | null | undefined): Record<string, Visibility> {
  try {
    const v = JSON.parse(raw ?? '{}')
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x === 'show' || x === 'hide' || x === 'auto')) as Record<string, Visibility> : {}
  } catch {
    return {}
  }
}
/** 서랍에 보이나: 기본함은 항상, 'auto'는 비어 있지 않을 때만(개수를 모르면 보인다) */
export function smartVisible(id: string, vis: Record<string, Visibility>, count?: number): boolean {
  if (id === 'inbox') return true
  const v = vis[id] ?? 'show'
  if (v === 'hide') return false
  if (v === 'auto') return count === undefined || count > 0
  return true
}
