import { filterScope } from './filters'
import { dayKey, moveToDate, TIME_GROUPS, timeGroup } from '../lib/dates'
import type { ListRow, SectionRow, TagRow, TaskRow } from './types'
import { TASK_COLUMNS as COLUMNS } from './taskQueries'

// 보기(사이드바 선택)마다의 조회 조건·그룹·정렬·기본값 — 01 §4.1, 02 §3·§4·§11·§14
export type ViewKey = string // 'smart:today' | 'list:<id>' | 'tag:<id>' ...
export type GroupBy = 'custom' | 'time' | 'tag' | 'priority' | 'list' | 'none'
export type SortBy = 'custom' | 'date' | 'title' | 'tag' | 'priority' | 'created' | 'modified'
export interface ViewSettings {
  group_by: GroupBy
  sort_by: SortBy
  sort_dir: 'asc' | 'desc'
  show_completed: number
  show_details: number
}

const ARCHIVE = ['smart:completed', 'smart:wontdo', 'smart:trash']
export const viewIsArchive = (view: ViewKey) => ARCHIVE.includes(view)
export const viewIsList = (view: ViewKey) => view.startsWith('list:')
export const viewShowsListName = (view: ViewKey) => !viewIsList(view)

/** 02 §3 기본값: 일반 리스트 = Custom(섹션 — 아직 없으므로 None)/Date, 나머지 = Time/Date. Show Completed 기본 켬. */
export function defaultSettings(view: ViewKey): ViewSettings {
  // 02 §0 실측: 일반 리스트 기본 정렬은 사용자 지정(새 태스크가 맨 위)
  return { group_by: viewIsList(view) ? 'custom' : 'time', sort_by: viewIsList(view) ? 'custom' : 'date', sort_dir: 'asc', show_completed: 1, show_details: 0 }
}
/** 02 §0 실측: 메뉴에 보이는 그룹·정렬 값(일반 리스트 / 스마트 리스트) */
export const groupOptions = (view: ViewKey): GroupBy[] => (viewIsList(view) ? ['custom', 'time', 'tag', 'priority', 'none'] : ['list', 'time', 'tag', 'priority', 'none'])
export const sortOptions = (view: ViewKey): SortBy[] => (viewIsList(view) ? ['custom', 'date', 'title', 'tag', 'priority'] : ['date', 'title', 'tag', 'priority'])
export const isDefaultSettings = (view: ViewKey, s: ViewSettings) => { const d = defaultSettings(view); return s.group_by === d.group_by && s.sort_by === d.sort_by }

const IN_SMART = "l.archived_at IS NULL AND COALESCE(l.show_in_smart, 'all') = 'all'"
// 03 §4: 기간 태스크는 [시작, 끝] 범위로 본다
const S = 'substr(COALESCE(t.start_at, t.due_at), 1, 10)'
const E = 'substr(t.due_at, 1, 10)'

/** 보기 범위. mode='open'은 미완료 목록, 'done'은 아래 완료 & 계획 취소 영역(02 §11). */
function scope(view: ViewKey, mode: 'open' | 'done', today: string): { where: string; params: unknown[] } {
  const [kind, id] = view.split(':')
  if (kind === 'filter') return filterScope(id,today,dayKey(1,new Date(`${today}T00:00`)),dayKey(6,new Date(`${today}T00:00`)))
  if (kind === 'folder') return { where: 'l.folder_id = ? AND l.archived_at IS NULL', params: [id] }
  if (kind === 'list') return { where: 't.list_id = ?', params: [id] }
  if (kind === 'tag') return { where: 'EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)', params: [id] }
  switch (id) {
    case 'today':
      return mode === 'open'
        ? { where: `${IN_SMART} AND ${S} <= ?`, params: [today] }
        : { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [today, today] }
    case 'tomorrow': return { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [dayKey(1), dayKey(1)] }
    case 'next7': return { where: `${IN_SMART} AND ${S} <= ? AND ${E} >= ?`, params: [dayKey(6), today] }
    case 'inbox': return { where: "l.kind = 'inbox'", params: [] }
    default: return { where: IN_SMART, params: [] } // all
  }
}


function orderBy(s: ViewSettings): string {
  const dir = s.sort_dir === 'desc' ? 'DESC' : 'ASC'
  const byDate = 'CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at'
  switch (s.sort_by) {
    case 'priority': return `t.priority DESC, ${byDate}, t.sort_order`
    case 'created': return `t.created_at ${dir}`
    case 'modified': return `t.modified_at ${dir}`
    case 'custom': return 't.sort_order, t.created_at'
    case 'title': return `t.title COLLATE NOCASE ${dir}, t.sort_order`
    case 'tag': {
      const first = '(SELECT MIN(tg.name) FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id = t.id)'
      return `${first} IS NULL, ${first}, ${byDate}, t.sort_order`
    }
    default: return `${byDate}, t.priority DESC, t.sort_order`
  }
}

/** 미완료 목록(하위 태스크 포함 — 트리는 화면에서 만든다) */
export function openTasksSql(view: ViewKey, s: ViewSettings, today = dayKey()) {
  if (viewIsArchive(view)) {
    const where = view === 'smart:trash' ? 't.deleted_at IS NOT NULL' : `t.status = ${view === 'smart:completed' ? 1 : 2} AND t.deleted_at IS NULL`
    const order = view === 'smart:trash' ? 't.deleted_at DESC' : 't.completed_at DESC'
    return { sql: `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE ${where} ORDER BY ${order}`, params: [] }
  }
  const sc = scope(view, 'open', today)
  // 조건에 드는 태스크 + 그 하위 태스크 전부(부모 아래에 보이도록 — 02 §6)
  return {
    sql: `WITH RECURSIVE base(id) AS (
            SELECT t.id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.status = 0 AND t.deleted_at IS NULL AND ${sc.where}),
          tree(id) AS (
            SELECT id FROM base UNION SELECT c.id FROM tasks c JOIN tree ON c.parent_id = tree.id WHERE c.status = 0 AND c.deleted_at IS NULL)
          SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
          WHERE t.id IN (SELECT id FROM tree) ORDER BY ${orderBy(s)}`,
    params: sc.params
  }
}

/** 02 §11 완료 & 계획 취소 영역 */
export function doneTasksSql(view: ViewKey, today = dayKey()) {
  const sc = scope(view, 'done', today)
  return {
    sql: `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
          WHERE t.status IN (1, 2) AND t.deleted_at IS NULL AND ${sc.where} ORDER BY t.completed_at DESC`,
    params: sc.params
  }
}

// ── 그룹 ──
export interface GroupDef { id: string; name: string; keep?: boolean } // keep: 비어도 머리를 보인다(섹션)
const PRIORITY_GROUPS: GroupDef[] = [
  { id: 'p3', name: '높은 우선순위' }, { id: 'p2', name: '중간 우선순위' }, { id: 'p1', name: '낮은 우선순위' }, { id: 'p0', name: '우선순위 없음' }
]
export const PINNED_GROUP: GroupDef = { id: 'pinned', name: '고정됨' }

/** 그룹 순서 목록과, 태스크가 어느 그룹에 드는지 */
export function grouping(by: GroupBy, lists: ListRow[], today: string, tags: TagRow[] = [], sections?: SectionRow[]): { defs: GroupDef[]; of: (t: TaskRow) => string } {
  switch (by) {
    // 02 §0 섹션: 섹션이 있거나 만드는 중이면(sections 배열) 섹션들 + 미분류, 아니면 머리 없이 한 덩어리
    case 'custom':
      if (!sections) return { defs: [{ id: 'all', name: '' }], of: () => 'all' }
      return {
        defs: [...sections.map((x) => ({ id: `s:${x.id}`, name: x.name, keep: true })), { id: 's:none', name: '미분류' }],
        of: (t) => (t.section_id && sections.some((x) => x.id === t.section_id) ? `s:${t.section_id}` : 's:none')
      }
    // 태그 순서상 첫 태그로 묶는다 + 태그 없음 [임시]
    case 'tag': return {
      defs: [...tags.map((g) => ({ id: `tg:${g.id}`, name: g.name })), { id: 'tg:none', name: '태그 없음' }],
      of: (t) => { const ids = t.tag_ids?.split(',') ?? []; const first = tags.find((g) => ids.includes(g.id)); return first ? `tg:${first.id}` : 'tg:none' }
    }
    case 'time': return { defs: TIME_GROUPS.map(([id, name]) => ({ id, name })), of: (t) => timeGroup(t, today) }
    case 'priority': return { defs: PRIORITY_GROUPS, of: (t) => `p${t.priority}` }
    case 'list': return {
      defs: lists.map((l) => ({ id: `l:${l.id}`, name: l.kind === 'inbox' ? '기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name}` })),
      of: (t) => `l:${t.list_id}`
    }
    default: return { defs: [{ id: 'all', name: '' }], of: () => 'all' }
  }
}

/** 02 §8: 다른 그룹으로 끌어 놓으면 그 그룹 값으로 바꾼다. 바꿀 필드를 돌려준다(없으면 null). */
export function groupDropPatch(groupId: string, t: TaskRow, today: string): Record<string, unknown> | null {
  if (groupId === 'pinned') return { pinned_at: new Date().toISOString() }
  const day = (n: number) => dayKey(n, new Date(`${today}T00:00`))
  switch (groupId) {
    case 'overdue': return null
    case 'today': return moveToDate(t, day(0))
    case 'tomorrow': return moveToDate(t, day(1))
    case 'next7': return moveToDate(t, day(2))
    case 'later': return moveToDate(t, day(7))
    case 'nodate': return moveToDate(t, null)
  }
  if (/^p\d$/.test(groupId)) return { priority: Number(groupId[1]) }
  if (groupId.startsWith('l:')) return { list_id: groupId.slice(2), parent_id: null }
  if (groupId.startsWith('s:')) return { section_id: groupId === 's:none' ? null : groupId.slice(2) }
  return null
}

const SMART_TITLES: Record<string, string> = {
  all: '전체', today: '오늘', tomorrow: '내일', next7: '다음 7일', inbox: '기본함', completed: '완료', wontdo: '계획 취소', trash: '휴지통'
}
export function viewTitle(view: ViewKey, lists: ListRow[] = [], tags: TagRow[] = []): string {
  const [kind, id] = view.split(':')
  if (kind === 'list') {
    const l = lists.find((x) => x.id === id)
    return l ? `${l.emoji ? `${l.emoji} ` : ''}${l.name}` : ''
  }
  if (kind === 'tag') return tags.find((x) => x.id === id)?.name ?? ''
  return SMART_TITLES[id] ?? ''
}

/** 02 §4 새 태스크 기본값: 현재 목록 조건을 따른다 */
export function newTaskDefaults(view: ViewKey, inboxId: string): { list_id: string; due_at: string | null; tag_id?: string } {
  const [kind, id] = view.split(':')
  if (kind === 'list') return { list_id: id, due_at: null }
  if (kind === 'tag') return { list_id: inboxId, due_at: null, tag_id: id }
  if (id === 'today' || id === 'next7') return { list_id: inboxId, due_at: dayKey() }
  if (id === 'tomorrow') return { list_id: inboxId, due_at: dayKey(1) }
  return { list_id: inboxId, due_at: null }
}
// 02 §0 실측: 일반 리스트 "할 일 추가"(띄어 씀), 스마트 리스트 "기본함"에 할일 추가(붙여 씀) — 실제 앱 문구 그대로
export const addbarPlaceholder = (view: ViewKey) => (viewIsList(view) ? '할 일 추가' : '"기본함"에 할일 추가')

/** 01 §4.6: 사이드바에 태스크를 놓았을 때 */
export type SidebarDrop = { kind: 'list'; id: string } | { kind: 'tag'; id: string } | { kind: 'due'; date: string }
export function sidebarDropOf(key: string, inboxId?: string): SidebarDrop | null {
  const [kind, id] = key.split(':')
  if (kind === 'list') return { kind: 'list', id }
  if (kind === 'tag') return { kind: 'tag', id }
  if (key === 'smart:inbox' && inboxId) return { kind: 'list', id: inboxId }
  if (key === 'smart:today') return { kind: 'due', date: dayKey() }
  if (key === 'smart:tomorrow') return { kind: 'due', date: dayKey(1) }
  if (key === 'smart:next7') return { kind: 'due', date: dayKey(2) }
  return null
}
