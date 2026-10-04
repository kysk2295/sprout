import { ArrowUpDown, CalendarDays, ChartGantt, Check, Columns3, List, Rows3, SquareCheck, ChevronDown, Layers, MoreHorizontal, PanelLeft, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { useQuery } from '../data/useQuery'
import type { Stmt } from '../data/db'
import { createTask, run, setTag, setViewSetting, snapshot, update, updateTask, withDescendants } from '../data/mutations'
import { ensureTags } from '../data/organization'
import { parseAdd } from '../lib/addParse'
import { highlightRecognized } from './DesktopEntry'
import type { ListRow, SectionRow, TagRow, TaskRow } from '../data/types'
import { createSection, deleteSection, renameSection } from '../data/sections'
import {
  addbarPlaceholder, defaultSettings, doneTasksSql, groupDropPatch, grouping, groupOptions, isDefaultSettings, newTaskDefaults, sortOptions, viewIsList, openTasksSql, PINNED_GROUP,
  sidebarDropOf, viewIsArchive, viewShowsListName, type GroupBy, type SortBy, type ViewKey, type ViewSettings
} from '../data/views'
import { calendarDropAt, scheduledDrop, type CalendarDrop } from '../lib/calendarDrop'
import { dayKey, rowDateLabel } from '../lib/dates'
import { datePart } from '@sprout/schema/time'
import { checkboxColor } from '../lib/priority'
import type { TaskActions } from '../lib/taskActions'
import { childrenMap, flattenTree, MAX_DEPTH, type FlatRow } from '../lib/tree'
import { EmptyState } from './EmptyState'
import { MenuItem, Popover, SubMenu } from './Popover'
import { PriorityRow } from './Pickers'
import { flagColor } from '../lib/priority'
import { TaskMenu } from './TaskMenu'
import { DatePicker, EMPTY_SCHEDULE } from './DatePicker'
import { loadSchedule } from '../data/schedule'
import type { Schedule } from '../lib/taskActions'
import { INDENT, TaskRowView } from './TaskRow'
import { useToast } from './Toast'
import { FoldRow, OverdueCard, useFoldSetting, YesterdayBand } from './overdue/OverdueBits'
import { isFolded } from '../data/overdue'

// 02-task-list §3~§12: 머리 · 추가 바 · 그룹 · 행 · 선택/키보드 · 끌어 놓기 · 우클릭 메뉴 · 완료 영역 · 빈 상태
type Props = {
  view: ViewKey
  title: string
  lists: ListRow[]
  tags: TagRow[]
  inboxId?: string
  selection: string[]
  onSelectionChange: (ids: string[]) => void
  actions: TaskActions
  onToggleSidebar: () => void
}
type Group = { id: string; name: string; rows: FlatRow[]; count: number; folded?: number }
type MenuState = { ids: string[]; point?: { x: number; y: number }; anchor?: HTMLElement }
type DropTarget =
  | { kind: 'calendar'; target: CalendarDrop }
  | { kind: 'list'; index: number; depth: number; parentId: string | null; groupId: string; prevSib?: TaskRow; nextSib?: TaskRow; lineY: number }
  | { kind: 'sidebar'; key: string }
type DragState = { ids: string[]; x: number; y: number; target?: DropTarget }

const LONG_PRESS = 200 // 02 §8 행을 길게 누른 뒤 끈다
const DONE_PREVIEW = 5 // 02 §11 처음 5개 + 더 보기
const GROUP_LABEL: Record<GroupBy, string> = { custom: '사용자 설정', time: '날짜', tag: '태그', priority: '우선 순위', list: '목록', none: '없음' }
const SORT_LABEL: Record<SortBy, string> = { custom: '사용자 설정', date: '날짜', title: '제목', tag: '태그', priority: '우선 순위', created: '만든 시간', modified: '수정한 시간' }

// 기기에만 저장하는 접힘 상태(02 §14)
function useLocalSet(key: string): [Set<string>, (id: string) => void, (id: string, on: boolean) => void] {
  const read = () => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]')) } catch { return new Set<string>() }
  }
  const [set, setSet] = useState(read)
  useEffect(() => setSet(read()), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const write = (next: Set<string>) => {
    setSet(next)
    try { localStorage.setItem(key, JSON.stringify([...next])) } catch { /* 저장 못 해도 동작에는 영향 없음 */ }
  }
  const toggle = (id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); write(n) }
  const put = (id: string, on: boolean) => { if (set.has(id) === on) return; const n = new Set(set); if (on) n.add(id); else n.delete(id); write(n) }
  return [set, toggle, put]
}

export function TaskListView(props: Props) {
  const { view, title, lists, tags, inboxId, selection, onSelectionChange, actions, onToggleSidebar } = props
  const mainRef = useRef<HTMLElement>(null)
  const today = dayKey()
  const archive = viewIsArchive(view)
  const toast = useToast()

  // ── 데이터 ──
  const settingsRow = useQuery<Partial<ViewSettings>>('SELECT group_by, sort_by, sort_dir, show_completed, show_details FROM view_settings WHERE view_key = ?', [view])?.[0]
  const settings: ViewSettings = useMemo(() => {
    const d = defaultSettings(view)
    const r = settingsRow ?? {}
    return {
      group_by: (r.group_by as GroupBy) ?? d.group_by, sort_by: (r.sort_by as SortBy) ?? d.sort_by, sort_dir: r.sort_dir ?? d.sort_dir,
      show_completed: r.show_completed ?? d.show_completed, show_details: r.show_details ?? d.show_details
    }
  }, [settingsRow, view])
  const openQ = useMemo(() => openTasksSql(view, settings, today), [view, settings, today])
  const tasks = useQuery<TaskRow>(openQ.sql, openQ.params)
  const showDone = !archive && settings.show_completed === 1
  const doneQ = useMemo(() => (showDone ? doneTasksSql(view, today) : { sql: 'SELECT 1 WHERE 0', params: [] }), [showDone, view, today])
  const doneTasks = useQuery<TaskRow>(doneQ.sql, doneQ.params) ?? []

  // ── 화면 상태 ──
  const [collapsedGroups, toggleGroup] = useLocalSet(`sprout.collapsed.groups.${view}`)
  const [collapsedTasks, toggleTask, putTask] = useLocalSet('sprout.collapsed.tasks')
  const [editing, setEditing] = useState<{ id: string; chain: boolean }>()
  const [menu, setMenu] = useState<MenuState>()
  const [picker, setPicker] = useState<{ ids: string[]; initial: Schedule; point?: { x: number; y: number }; anchor?: HTMLElement | null }>()
  const [headerMenu, setHeaderMenu] = useState<'sort' | 'more'>()
  const [doneMore, setDoneMore] = useState(false)
  const [drag, setDrag] = useState<DragState>()
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number }>()
  const sortRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowEls = useRef(new Map<string, HTMLDivElement>())
  const anchor = useRef<string>(undefined)
  const cursor = useRef<string>(undefined)
  const suppressClick = useRef(false)

  // ── 섹션(02 §0): 일반 리스트의 사용자 설정 그룹 ──
  const listId = viewIsList(view) ? view.slice(5) : ''
  const sectionRows = useQuery<SectionRow>('SELECT id, name, sort_order FROM sections WHERE list_id = ? ORDER BY sort_order', [listId])
  const [addingSection, setAddingSection] = useState(false)
  const sections = listId && (sectionRows?.length || addingSection) ? sectionRows ?? [] : undefined
  const [sectionMenu, setSectionMenu] = useState<{ id: string; anchor: HTMLElement }>()
  const [renamingSection, setRenamingSection] = useState<string>()

  // ── 그룹 · 트리 ──
  // 19 §4: 오늘 화면에서 7일 넘은 만료는 한 줄로 접는다(설정 › 할 일, 기본 켬)
  const [foldSetting] = useFoldSetting()
  const fold = foldSetting && view === 'smart:today' && settings.group_by === 'time'
  const { groups, flat, overdueIds } = useMemo(() => {
    if (!tasks) return { groups: [] as Group[], flat: [] as FlatRow[], overdueIds: [] as string[] }
    const { roots, kids } = childrenMap(tasks)
    const g = archive ? grouping('none', lists, today) : grouping(settings.group_by, lists, today, tags, sections)
    const out: Group[] = []
    const push = (id: string, name: string, rs: TaskRow[], keep = false, folded = 0) => {
      if (!rs.length && !keep && !folded) return
      const all = flattenTree(rs, kids, id, new Set())
      out.push({ id, name, rows: collapsedGroups.has(id) ? [] : flattenTree(rs, kids, id, collapsedTasks), count: all.length + folded, folded })
    }
    if (!archive) push(PINNED_GROUP.id, PINNED_GROUP.name, roots.filter((r) => r.pinned_at))
    for (const d of g.defs) {
      const rs = roots.filter((r) => (archive || !r.pinned_at) && g.of(r) === d.id)
      if (d.id === 'overdue' && fold) {
        const old = rs.filter((r) => isFolded(r, today))
        push(d.id, d.name, rs.filter((r) => !isFolded(r, today)), d.keep, old.length)
      } else push(d.id, d.name, rs, d.keep)
    }
    // 만료됨 머리 "미루기"는 접힌 것·접힌 묶음까지 만료 전부를 옮긴다(19 §2)
    const overdueIds = settings.group_by === 'time' && !archive ? roots.filter((r) => !r.pinned_at && g.of(r) === 'overdue').map((r) => r.id) : []
    return { groups: out, flat: out.flatMap((x) => x.rows), overdueIds }
  }, [tasks, archive, settings.group_by, lists, tags, sections, today, collapsedGroups, collapsedTasks, fold])
  const groupOf = useMemo(() => {
    const g = grouping(settings.group_by, lists, today, tags, sections)
    return (t: TaskRow) => (t.pinned_at ? PINNED_GROUP.id : g.of(t))
  }, [settings.group_by, lists, tags, sections, today])
  const doneShown = doneMore ? doneTasks : doneTasks.slice(0, DONE_PREVIEW)
  const doneCollapsed = collapsedGroups.has('done')
  const visible = useMemo(() => [...flat.map((r) => r.task), ...(showDone && !doneCollapsed ? doneShown : [])], [flat, showDone, doneCollapsed, doneShown])
  const visibleIds = useMemo(() => visible.map((t) => t.id), [visible])
  const byId = useMemo(() => new Map(visible.map((t) => [t.id, t])), [visible])

  // ── 선택(02 §7) ──
  const select = useCallback((id: string, e?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
    const mod = e?.metaKey || e?.ctrlKey
    if (mod) {
      onSelectionChange(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id])
      anchor.current = id
    } else if (e?.shiftKey && anchor.current && visibleIds.includes(anchor.current)) {
      const a = visibleIds.indexOf(anchor.current)
      const b = visibleIds.indexOf(id)
      onSelectionChange(visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1))
    } else {
      onSelectionChange([id])
      anchor.current = id
    }
    cursor.current = id
  }, [selection, visibleIds, onSelectionChange])

  // ── 완료 ──
  const toggleDone = (t: TaskRow) => {
    if (t.deleted_at) return
    if (t.status !== 0) {
      void actions.reopen([t.id])
      return
    }
    // 02 §0 실측: 지연 없이 바로 완료 영역으로
    void actions.complete([t.id])
  }

  // ── 하위 태스크 추가: 빈 행을 만들고 바로 제목 입력(Enter = 같은 단계에 하나 더) ──
  const addSubtask = async (parentId: string) => {
    putTask(parentId, false)
    const id = await actions.addSubtask(parentId)
    onSelectionChange([id])
    setEditing({ id, chain: true })
  }
  const endEdit = async (t: TaskRow, value: string | null, viaEnter: boolean) => {
    const chain = editing?.chain
    setEditing(undefined)
    const v = value?.trim() ?? ''
    if (!v) {
      if (!t.title) await actions.deleteForever([t.id]) // 만들다 만 빈 하위 태스크
      return
    }
    if (v !== t.title) await updateTask(t.id, { title: v })
    if (chain && viaEnter && t.parent_id) await addSubtask(t.parent_id)
  }

  // ── 키보드(02 §7) — 입력 중이 아닐 때만 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('.cal') && !mainRef.current?.contains(e.target as Node)) return
      const el = e.target as HTMLElement
      if (e.defaultPrevented || (mainRef.current?.closest('.calendar-split') && !mainRef.current.contains(el))) return
      if (el.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return
      if (document.querySelector('.popover, [role=dialog]')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        if (toast.undoLast()) e.preventDefault()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const from = cursor.current && visibleIds.includes(cursor.current) ? visibleIds.indexOf(cursor.current) : -1
        const next = visibleIds[Math.min(visibleIds.length - 1, Math.max(0, from + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (!next) return
        if (e.shiftKey && anchor.current) {
          const a = visibleIds.indexOf(anchor.current)
          const b = visibleIds.indexOf(next)
          onSelectionChange(visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1))
          cursor.current = next
        } else select(next)
        rowEls.current.get(next)?.scrollIntoView({ block: 'nearest' })
        return
      }
      if (!selection.length) return
      if (e.key === 'Escape') {
        onSelectionChange([])
      } else if (e.key === 'Enter' && selection.length === 1 && !archive) {
        e.preventDefault()
        setEditing({ id: selection[0], chain: false })
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !archive) {
        e.preventDefault()
        const last = Math.max(...selection.map((id) => visibleIds.indexOf(id)))
        const next = visibleIds.slice(last + 1).find((id) => !selection.includes(id)) ?? visibleIds.slice(0, last).reverse().find((id) => !selection.includes(id))
        void actions.trash(selection)
        onSelectionChange(next ? [next] : [])
      } else if (mod && e.key === '0' && !archive) {
        e.preventDefault()
        void actions.moveDates(selection, today, '오늘로 옮겼어요')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── 우클릭 메뉴(02 §9) ──
  const openMenu = (t: TaskRow, at: { point?: { x: number; y: number }; anchor?: HTMLElement }) => {
    const ids = selection.includes(t.id) ? selection : [t.id]
    if (!selection.includes(t.id)) select(t.id)
    setMenu({ ids, ...at })
  }

  // ── 끌어 놓기(02 §8, 01 §4.6) ──
  const pending = useRef<{ id: string; x: number; y: number; timer?: number; armed: boolean; active: boolean; originDepth: number } | undefined>(undefined)
  const dragRef = useRef<DragState | undefined>(undefined)
  const dropHover = useRef<HTMLElement | null>(null)

  const computeTarget = (x: number, y: number, ids: string[]): DropTarget | undefined => {
    const cal = calendarDropAt(x,y)
    if(cal)return {kind:'calendar',target:cal}
    const hit = document.elementFromPoint(x, y) as HTMLElement | null
    const side = hit?.closest<HTMLElement>('[data-drop]')
    if (side) return { kind: 'sidebar', key: side.dataset.drop! }
    const sc = scrollRef.current
    if (!sc || !hit || !sc.contains(hit)) return undefined
    // 끄는 태스크와 그 하위는 빼고 계산
    const skip = new Set<string>()
    flat.forEach((r, i) => {
      if (!ids.includes(r.task.id)) return
      skip.add(r.task.id)
      for (let k = i + 1; k < flat.length && flat[k].depth > r.depth; k++) skip.add(flat[k].task.id)
    })
    const rows = flat.filter((r) => !skip.has(r.task.id))
    // 빈 그룹(예: 새 섹션) 위에 놓으면 그 그룹 맨 위로
    const grpEl = hit.closest<HTMLElement>('[data-group]')
    const gi = groups.findIndex((g) => g.id === grpEl?.dataset.group)
    if (grpEl && gi >= 0 && !rows.some((r) => r.groupId === groups[gi].id)) {
      const order = new Map(groups.map((g, k) => [g.id, k]))
      const idx = rows.filter((r) => (order.get(r.groupId) ?? 0) < gi).length
      const head = grpEl.querySelector('.group__header')?.getBoundingClientRect() ?? grpEl.getBoundingClientRect()
      const scTop0 = sc.getBoundingClientRect().top - sc.scrollTop
      return { kind: 'list', index: idx, depth: 0, parentId: null, groupId: groups[gi].id, prevSib: undefined, nextSib: undefined, lineY: head.bottom - scTop0 }
    }
    const rects = rows.map((r) => rowEls.current.get(r.task.id)!.getBoundingClientRect())
    let i = rects.findIndex((rc) => y < rc.top + rc.height / 2)
    if (i < 0) i = rows.length
    let prev: FlatRow | undefined = rows[i - 1]
    let next: FlatRow | undefined = rows[i]
    if (prev && next && prev.groupId !== next.groupId) {
      if (y > (rects[i - 1].bottom + rects[i].top) / 2) prev = undefined
      else next = undefined
    }
    const groupId = prev?.groupId ?? next?.groupId ?? groups[0]?.id ?? 'all'
    const p = pending.current!
    const projected = p.originDepth + Math.round((x - p.x) / INDENT)
    const max = prev ? Math.min(prev.depth + 1, MAX_DEPTH) : 0
    const min = next ? next.depth : 0
    const depth = Math.max(min, Math.min(max, projected))
    const idx = prev ? rows.indexOf(prev) + 1 : next ? rows.indexOf(next) : rows.length
    let parentId: string | null = null
    if (depth > 0) for (let k = idx - 1; k >= 0; k--) if (rows[k].depth === depth - 1) { parentId = rows[k].task.id; break }
    let prevSib: TaskRow | undefined
    for (let k = idx - 1; k >= 0 && rows[k].groupId === groupId && rows[k].depth >= depth; k--) if (rows[k].depth === depth) { prevSib = rows[k].task; break }
    let nextSib: TaskRow | undefined
    for (let k = idx; k < rows.length && rows[k].groupId === groupId && rows[k].depth >= depth; k++) if (rows[k].depth === depth) { nextSib = rows[k].task; break }
    const scTop = sc.getBoundingClientRect().top - sc.scrollTop
    const lineY = (prev ? rects[rows.indexOf(prev)].bottom : next ? rects[rows.indexOf(next)].top : sc.getBoundingClientRect().top + 8) - scTop
    return { kind: 'list', index: idx, depth, parentId, groupId, prevSib, nextSib, lineY }
  }

  const drop = async (d: DragState) => {
    const t = d.target
    if (!t) return
    const tasksDragged = d.ids.map((id) => byId.get(id)).filter(Boolean) as TaskRow[]
    // 끄는 것 중 다른 끄는 태스크의 하위는 부모를 따라간다
    const dragged = new Set(d.ids)
    const underAnother = (x: TaskRow) => {
      for (let p = x.parent_id ? byId.get(x.parent_id) : undefined; p; p = p.parent_id ? byId.get(p.parent_id) : undefined) if (dragged.has(p.id)) return true
      return false
    }
    const tops = tasksDragged.filter((x) => !underAnother(x))
    const ids = tops.map((x) => x.id)
    if(t.kind==='calendar'){await actions.reschedule(tops.map(task=>scheduledDrop(task,t.target)));return}
    if (t.kind === 'sidebar') {
      const target = sidebarDropOf(t.key, inboxId)
      if (!target) return
      if (target.kind === 'list') {
        const l = lists.find((x) => x.id === target.id)
        if (l) await actions.move(ids, l)
      } else if (target.kind === 'tag') {
        await actions.toggleTag(ids, target.id, true)
        toast.show(`${tags.find((x) => x.id === target.id)?.name ?? '태그'} 태그를 붙였어요`)
      } else {
        await actions.moveDates(ids, target.date)
      }
      return
    }
    const parent = t.parentId ? (byId.get(t.parentId) ?? null) : null
    const sameParent = tops.every((x) => (x.parent_id ?? null) === t.parentId)
    const sameGroup = t.depth > 0 || tops.every((x) => groupOf(x) === t.groupId)
    const all = await withDescendants(ids)
    const restore = await snapshot(all, ['parent_id', 'sort_order', 'due_at', 'is_all_day', 'priority', 'list_id', 'pinned_at'])
    const stmts: Stmt[] = []
    // 순서만 바꾸는데 정렬이 사용자 지정이 아니면: 지금 보이는 순서를 sort_order로 굳힌 뒤 사용자 지정으로 바꾼다(02 §3 [임시])
    if (sameParent && sameGroup && settings.sort_by !== 'custom') {
      const order = flat.map((r) => r.task.id).filter((id) => !all.includes(id))
      order.splice(Math.min(t.index, order.length), 0, ...ids)
      // t.index는 끄는 행을 뺀 목록 기준이라 그대로 쓴다
      order.forEach((id, k) => stmts.push(update('tasks', id, { sort_order: k })))
      await setViewSetting(view, { sort_by: 'custom' })
    } else {
      const lo = t.prevSib?.sort_order ?? null
      const hi = t.nextSib?.sort_order ?? null
      const n = tops.length
      tops.forEach((x, k) => {
        const so = lo !== null && hi !== null ? lo + ((hi - lo) * (k + 1)) / (n + 1) : lo !== null ? lo + k + 1 : hi !== null ? hi - (n - k) : k
        const patch: Record<string, unknown> = { parent_id: t.parentId, sort_order: so }
        if (parent) patch.list_id = parent.list_id
        if (t.depth === 0 && groupOf(x) !== t.groupId) {
          if (x.pinned_at && t.groupId !== PINNED_GROUP.id) patch.pinned_at = null
          Object.assign(patch, groupDropPatch(t.groupId, x, today) ?? {})
        }
        stmts.push(update('tasks', x.id, patch))
      })
      // 하위 태스크는 부모와 같은 리스트로
      const listId = parent?.list_id ?? (t.groupId.startsWith('l:') && t.depth === 0 ? t.groupId.slice(2) : null)
      if (listId) all.filter((id) => !ids.includes(id)).forEach((id) => stmts.push(update('tasks', id, { list_id: listId })))
    }
    await run(...stmts)
    if (t.parentId) putTask(t.parentId, false)
    if (!sameParent) toast.show(t.parentId ? '하위 태스크로 옮겼어요' : '부모 연결을 풀었어요', restore)
    else if (!sameGroup) toast.show('옮겼어요', restore)
  }

  const endPointer = useRef<() => void>(() => {})
  const startPointer = (e: RPointerEvent, t: TaskRow, depth: number, immediate: boolean) => {
    if (e.button !== 0 || archive || editing) return
    pending.current = { id: t.id, x: e.clientX, y: e.clientY, armed: immediate, active: false, originDepth: depth }
    if (!immediate) pending.current.timer = window.setTimeout(() => { if (pending.current) pending.current.armed = true }, LONG_PRESS)
    const move = (ev: PointerEvent) => {
      const p = pending.current
      if (!p) return
      const dist = Math.hypot(ev.clientX - p.x, ev.clientY - p.y)
      if (!p.active) {
        if (dist < 4) return
        if (!p.armed) { cleanup(); return } // 길게 누르기 전에 움직이면 끌기가 아님
        p.active = true
        const ids = selection.includes(p.id) ? visibleIds.filter((id) => selection.includes(id) && flat.some((r) => r.task.id === id)) : [p.id]
        if (!selection.includes(p.id)) onSelectionChange([p.id])
        document.body.classList.add('is-dragging')
        dragRef.current = { ids, x: ev.clientX, y: ev.clientY }
      }
      const d = dragRef.current!
      d.x = ev.clientX
      d.y = ev.clientY
      d.target = computeTarget(ev.clientX, ev.clientY, d.ids)
      const side = d.target?.kind === 'sidebar' ? document.querySelector<HTMLElement>(`[data-drop="${d.target.key}"]`) : null
      if (dropHover.current !== side) {
        dropHover.current?.classList.remove('is-drop-target')
        side?.classList.add('is-drop-target')
        dropHover.current = side
      }
      setDrag({ ...d })
    }
    const up = () => {
      const d = pending.current?.active ? dragRef.current : undefined
      cleanup()
      if (d) {
        suppressClick.current = true
        window.setTimeout(() => { suppressClick.current = false }, 0)
        void drop(d)
      }
    }
    const cleanup = () => {
      window.clearTimeout(pending.current?.timer)
      pending.current = undefined
      dragRef.current = undefined
      dropHover.current?.classList.remove('is-drop-target')
      dropHover.current = null
      document.body.classList.remove('is-dragging')
      setDrag(undefined)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    endPointer.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  useEffect(() => () => endPointer.current(), [])

  // ── 박스 선택(02 §7: 빈 곳에서 드래그) ──
  const startBox = (e: RPointerEvent) => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    if (el.closest('.row, .group__header, .done__header, button, input')) return
    const base = e.metaKey || e.ctrlKey ? selection : []
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return
      moved = true
      const r = { x0, y0, x1: ev.clientX, y1: ev.clientY }
      setBox(r)
      const top = Math.min(y0, ev.clientY)
      const bottom = Math.max(y0, ev.clientY)
      const hits = visibleIds.filter((id) => {
        const rc = rowEls.current.get(id)?.getBoundingClientRect()
        return rc && rc.bottom > top && rc.top < bottom
      })
      onSelectionChange([...new Set([...base, ...hits])])
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setBox(undefined)
      if (!moved) onSelectionChange([])
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const empty = tasks && tasks.length === 0 && (!showDone || doneTasks.length === 0)
  const allDone = tasks && tasks.length === 0 && showDone && doneTasks.length > 0
  const menuTasks = menu ? (menu.ids.map((id) => byId.get(id)).filter(Boolean) as TaskRow[]) : []
  const dragTitle = drag ? (drag.ids.length > 1 ? `${drag.ids.length}개 태스크` : (byId.get(drag.ids[0])?.title ?? '')) : ''

  const renderRow = (r: FlatRow) => {
    const t = r.task
    return (
      <TaskRowView
        key={t.id}
        task={t}
        depth={r.depth}
        hasChildren={r.hasChildren}
        collapsed={collapsedTasks.has(t.id)}
        tags={tags}
        today={today}
        showList={viewShowsListName(view)}
        showDetails={settings.show_details === 1}
        selected={selection.includes(t.id)}
        done={t.status === 1}
        editing={editing?.id === t.id}
        dragSource={!!drag?.ids.includes(t.id)}
        rowRef={(el) => { if (el) rowEls.current.set(t.id, el); else rowEls.current.delete(t.id) }}
        onRowClick={(e) => { if (!suppressClick.current) select(t.id, e) }}
        onTitleClick={(e) => {
          e.stopPropagation()
          if (suppressClick.current) return
          if (e.metaKey || e.ctrlKey || e.shiftKey || archive || selection.length > 1 && selection.includes(t.id)) select(t.id, e)
          else { select(t.id); setEditing({ id: t.id, chain: false }) }
        }}
        onContextMenu={(e: RMouseEvent) => { e.preventDefault(); openMenu(t, { point: { x: e.clientX, y: e.clientY } }) }}
        onToggle={() => toggleDone(t)}
        onExpand={() => toggleTask(t.id)}
        onEditEnd={(v, enter) => void endEdit(t, v, enter)}
        onGripDown={(e) => startPointer(e, t, r.depth, true)}
        onRowDown={(e) => startPointer(e, t, r.depth, false)}
      />
    )
  }

  return (
    <main ref={mainRef} tabIndex={-1} onPointerDownCapture={(e)=>{if(!(e.target as HTMLElement).closest('input,textarea,select,[contenteditable],button'))mainRef.current?.focus({preventScroll:true})}} className="list" data-list-target={view.startsWith('list:')?view.slice(5):undefined}>
      <header className="pane-header">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="사이드바 접기 (⌘\)"><PanelLeft /></button>
        <h1 className="pane-header__title">{title}</h1>
        {!archive && (
          <div className="pane-header__actions">
            <button ref={sortRef} className="icon-btn" aria-label="그룹·정렬" onClick={() => setHeaderMenu(headerMenu === 'sort' ? undefined : 'sort')}><ArrowUpDown /></button>
            <button ref={moreRef} className="icon-btn" aria-label="리스트 메뉴" onClick={() => setHeaderMenu(headerMenu === 'more' ? undefined : 'more')}><MoreHorizontal /></button>
          </div>
        )}
      </header>
      {headerMenu === 'sort' && (
        <Popover anchor={sortRef.current} onClose={() => setHeaderMenu(undefined)} align="end" width={197} className="menu">
          {/* 02 §0 실측: 그룹화하기 · 정렬하기 (오른쪽에 현재 값), 스마트 리스트는 기본 순서로 되돌리기 */}
          <SubMenu icon={<Layers />} label="그룹화하기" trail={GROUP_LABEL[settings.group_by]} width={140}>
            {groupOptions(view).map((g) => (
              <MenuItem key={g} label={GROUP_LABEL[g]} active={settings.group_by === g} trail={settings.group_by === g ? <Check className="menu__check" /> : undefined} onClick={() => { setHeaderMenu(undefined); void setViewSetting(view, { group_by: g }) }} />
            ))}
          </SubMenu>
          <SubMenu icon={<ArrowUpDown />} label="정렬하기" trail={SORT_LABEL[settings.sort_by]} width={140}>
            {sortOptions(view).map((o) => (
              <MenuItem key={o} label={SORT_LABEL[o]} active={settings.sort_by === o} trail={settings.sort_by === o ? <Check className="menu__check" /> : undefined} onClick={() => { setHeaderMenu(undefined); void setViewSetting(view, { sort_by: o, sort_dir: 'asc' }) }} />
            ))}
          </SubMenu>
          {!viewIsList(view) && (
            <>
              <div className="menu__divider" />
              <button className="menu__note" disabled={isDefaultSettings(view, settings)} onClick={() => { setHeaderMenu(undefined); const d = defaultSettings(view); void setViewSetting(view, { group_by: d.group_by, sort_by: d.sort_by, sort_dir: d.sort_dir }) }}>기본 날짜 순서로 진행</button>
            </>
          )}
        </Popover>
      )}
      {headerMenu === 'more' && (
        <Popover anchor={moreRef.current} onClose={() => setHeaderMenu(undefined)} align="end" width={162} className="menu">
          {/* 02 §0 실측: 뷰(목록 · 칸반 · 타임라인 — 칸반·타임라인은 [후보]) / 완료된 할일 숨기기·보기 · 자세히 보기 */}
          <div className="menu__caption">뷰</div>
          <div className="menu__flags">
            <button className="menu__flag is-on" title="목록" aria-label="목록"><Rows3 /></button>
            <button className="menu__flag" title="칸반" aria-label="칸반" disabled><Columns3 /></button>
            <button className="menu__flag" title="타임라인" aria-label="타임라인" disabled><ChartGantt /></button>
          </div>
          <div className="menu__divider" />
          <MenuItem icon={<SquareCheck />} label={settings.show_completed ? '완료된 할일 숨기기' : '완료된 할일 보기'} onClick={() => { setHeaderMenu(undefined); void setViewSetting(view, { show_completed: settings.show_completed ? 0 : 1 }) }} />
          <MenuItem icon={<List />} label="자세히 보기" trail={settings.show_details ? <Check className="menu__check" /> : undefined} onClick={() => { setHeaderMenu(undefined); void setViewSetting(view, { show_details: settings.show_details ? 0 : 1 }) }} />
          {viewIsList(view) && (
            <>
              <div className="menu__divider" />
              {/* 02 §0: "새로운 열" = 섹션 추가. 그룹이 사용자 설정이 아니면 사용자 설정으로 바꾼다 [임시] */}
              <MenuItem icon={<Plus />} label="새로운 열" onClick={() => { setHeaderMenu(undefined); if (settings.group_by !== 'custom') void setViewSetting(view, { group_by: 'custom' }); setAddingSection(true) }} />
            </>
          )}
        </Popover>
      )}
      {sectionMenu && (
        <Popover anchor={sectionMenu.anchor} align="end" width={140} className="menu" onClose={() => setSectionMenu(undefined)}>
          <MenuItem label="이름 바꾸기" onClick={() => { setRenamingSection(sectionMenu.id); setSectionMenu(undefined) }} />
          <MenuItem label="삭제" onClick={() => { const id = sectionMenu.id; setSectionMenu(undefined); void deleteSection(id, (tasks ?? []).filter((t) => t.section_id === id).map((t) => t.id)) }} />
        </Popover>
      )}
      {!archive && (inboxId || view.startsWith('list:')) && (
        <AddBar
          placeholder={addbarPlaceholder(view)}
          lists={lists}
          tags={tags}
          onCreate={async (title, content, schedule, priority, extra) => {
            const defaults = newTaskDefaults(view, inboxId ?? '')
            const id = await createTask({ title, ...defaults, ...(extra?.list_id ? { list_id: extra.list_id } : {}), priority })
            if (content) await updateTask(id, { content })
            if (schedule?.due_at) await actions.applySchedule([id], schedule)
            for (const tagId of extra?.tag_ids ?? []) if (tagId !== defaults.tag_id) await setTag([id], tagId, true)
          }}
        />
      )}
      {addingSection && listId && (
        <SectionInput
          onCancel={() => setAddingSection(false)}
          onCreate={async (name) => {
            const top = sectionRows?.length ? Math.min(...sectionRows.map((x) => x.sort_order)) - 1 : 0
            await createSection(listId, name, top)
            setAddingSection(false)
          }}
        />
      )}
      <div className="list__scroll" ref={scrollRef} onPointerDown={startBox}>
        {empty && (
        {view === 'smart:today' && <YesterdayBand today={today} onMove={(ids) => void actions.moveDates(ids, today, `어제 못 한 ${ids.length}개를 오늘로 옮겼어요`)} />}
          view === 'smart:today' ? <EmptyState title="오늘 할 일이 없어요" hint="입력창을 눌러 추가하세요" />
            : archive ? <EmptyState title={view === 'smart:trash' ? '휴지통이 비어 있어요' : '태스크가 없어요'} />
              : <EmptyState title="할 일이 없어요" hint="입력창을 눌러 추가하세요" />
        )}
        {allDone && <EmptyState variant="done" title="모두 완료했어요" />}
        {groups.map((g) => (
          <section key={g.id} className="group" data-group={g.id}>
            {g.name && (
              <div className="group__header" onClick={() => toggleGroup(g.id)}>
                <ChevronDown className={`group__chevron${collapsedGroups.has(g.id) ? ' is-collapsed' : ''}`} />
                {renamingSection === g.id.slice(2) ? (
                  <input
                    className="group__rename"
                    autoFocus
                    defaultValue={g.name}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return
                      if (e.key === 'Escape') setRenamingSection(undefined)
                      if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) void renameSection(g.id.slice(2), v); setRenamingSection(undefined) }
                    }}
                    onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== g.name) void renameSection(g.id.slice(2), v); setRenamingSection(undefined) }}
                  />
                ) : (
                  <span className="group__name">{g.name}</span>
                )}
                <span className="group__count">{g.count}</span>
                {g.id === 'overdue' && <PostponeLink ids={overdueIds} today={today} actions={actions} />}
                {g.id.startsWith('s:') && g.id !== 's:none' && (
                  <button className="group__more" aria-label="섹션 메뉴" onClick={(e) => { e.stopPropagation(); setSectionMenu({ id: g.id.slice(2), anchor: e.currentTarget }) }}><MoreHorizontal /></button>
                )}
              </div>
            )}
            {g.rows.map(renderRow)}
          </section>
            {g.id === 'overdue' && (view === 'smart:today' || view === 'smart:all') && !collapsedGroups.has(g.id) && <OverdueCard today={today} />}
        ))}
            {g.id === 'overdue' && !!g.folded && !collapsedGroups.has(g.id) && <FoldRow count={g.folded} />}
        {showDone && doneTasks.length > 0 && (
          <section className="group done">
            <div className="group__header done__header" onClick={() => toggleGroup('done')}>
              <ChevronDown className={`group__chevron${doneCollapsed ? ' is-collapsed' : ''}`} />
              <span className="group__name">완료</span>
              <span className="group__count">{doneTasks.length}</span>
            </div>
            {!doneCollapsed && doneShown.map((t) => (
              <div
                key={t.id}
                ref={(el) => { if (el) rowEls.current.set(t.id, el); else rowEls.current.delete(t.id) }}
                className={`row is-done-row${selection.includes(t.id) ? ' is-selected' : ''}${t.status === 2 ? ' is-wontdo' : ' is-done'}`}
                onClick={(e) => select(t.id, e)}
                onContextMenu={(e) => { e.preventDefault(); openMenu(t, { point: { x: e.clientX, y: e.clientY } }) }}
              >
                <button
                  className="checkbox"
                  style={{ ['--checkbox-color' as string]: checkboxColor(0) }}
                  onClick={(e) => { e.stopPropagation(); toggleDone(t) }}
                  aria-label="완료 취소"
                >
                  {t.status === 2 ? <X strokeWidth={3} /> : <Check strokeWidth={3} />}
                </button>
                <span className="row__title">{t.title || '제목 없음'}</span>
                <span className="row__meta"><span className="row__date">{rowDateLabel(t, today)?.label ?? completedLabel(t.completed_at)}</span></span>
              </div>
            ))}
            {!doneCollapsed && !doneMore && doneTasks.length > DONE_PREVIEW && (
              <button className="done__more" onClick={() => setDoneMore(true)}>더 보기</button>
            )}
          </section>
        )}
        {drag?.target?.kind === 'list' && (
          <div className="drop-line" style={{ top: drag.target.lineY - 1, left: 16 + 8 + drag.target.depth * INDENT }} />
        )}
      </div>
      {drag && <div className="drag-ghost" style={{ left: drag.x + 14, top: drag.y + 10 }}>{dragTitle || '제목 없음'}</div>}
      {box && (
        <div className="box-select" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />
      )}
      {menu && menuTasks.length > 0 && (
        <TaskMenu
          tasks={menuTasks}
          lists={lists}
          tags={tags}
          actions={actions}
          point={menu.point}
          anchor={menu.anchor}
          onClose={() => setMenu(undefined)}
          onAddSubtask={(id) => void addSubtask(id)}
          onPickDate={async (ids, at) => setPicker({ ids, initial: ids.length === 1 ? await loadSchedule(ids[0]) : EMPTY_SCHEDULE, ...at })}
        />
      )}
      {picker && (
        <DatePicker initial={picker.initial} point={picker.point} anchor={picker.anchor} onSave={(s) => void actions.applySchedule(picker.ids, s)} onClose={() => setPicker(undefined)} />
      )}
    </main>
  )
}

const completedLabel = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/**
 * 02 §5 · 19 §2 [틱틱] 만료됨 "미루기": 누르면 만료 전부를 오늘로(시각 유지) + 토스트 되돌리기.
 * 우클릭하면 내일로 · 다음 주로 · 날짜 지정 메뉴 [sprout]
 */
function PostponeLink({ ids, today, actions }: { ids: string[]; today: string; actions: TaskActions }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(false)
  const to = async (offset: number, label: string) => {
    setOpen(false)
    if (ids.length) await actions.moveDates(ids, dayKey(offset, new Date(`${today}T00:00`)), label)
  }
  return (
    <>
      <button ref={ref} className="group__action" title="만료된 할 일을 모두 오늘로 (우클릭: 다른 날)"
        onClick={(e) => { e.stopPropagation(); void to(0, `${ids.length}개를 오늘로 미뤘어요`) }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}>미루기</button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} align="end" width={160} className="menu">
          <MenuItem label="오늘로" onClick={() => void to(0, '오늘로 미뤘어요')} />
          <MenuItem label="내일로" onClick={() => void to(1, '내일로 미뤘어요')} />
          <MenuItem label="다음 주로" onClick={() => void to(7, '다음 주로 미뤘어요')} />
          <MenuItem label="날짜 지정" onClick={() => { setOpen(false); setPick(true) }} />
        </Popover>
      )}
      {pick && (
        <DatePicker
          variant="date-only"
          initial={{ ...EMPTY_SCHEDULE, due_at: today }}
          anchor={ref.current}
          onSave={(s) => { if (s.due_at && ids.length) void actions.moveDates(ids, datePart(s.due_at), '미뤘어요') }}
          onClose={() => setPick(false)}
        />
      )}
    </>
  )
}

/** 02 §4·§0 추가 바: 포커스되면 강조색 테두리 + 오른쪽 📅(날짜 선택기) · ⌄(우선순위).
 *  자연어 인식(02 §4): 날짜·시각 문구 하이라이트 + 결과 칩(문구는 제목에 남김), #태그(없으면 새로 만듦) · ~리스트 · !우선순위 */
type AddExtra = { list_id?: string; tag_ids?: string[] }
function AddBar({ placeholder, lists, tags, onCreate }: { placeholder: string; lists: ListRow[]; tags: TagRow[]; onCreate: (title: string, content?: string, schedule?: Schedule, priority?: number, extra?: AddExtra) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const desc = useRef<HTMLTextAreaElement>(null)
  const dateBtn = useRef<HTMLButtonElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const saving = useRef(false)
  const [raw, setRaw] = useState('')
  const [scroll, setScroll] = useState(0)
  const [recognition, setRecognition] = useState(true)
  const [descOpen, setDescOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [schedule, setSchedule] = useState<Schedule>()
  const [priority, setPriority] = useState(0)
  const [pop, setPop] = useState<'date' | 'priority'>()
  const parsed = useMemo(() => parseAdd(raw, lists.map((l) => ({ id: l.id, name: l.kind === 'inbox' ? '기본함' : l.name })), tags, { keepDate: false }), [raw, lists, tags]) // 날짜 문구도 제목에서 뺀다(빠른 추가와 같게, 2026-10-05 사용자 결정)
  const p = recognition ? parsed : undefined
  const inferred: Schedule | undefined = p?.due_at
    ? { ...EMPTY_SCHEDULE, due_at: p.due_at, is_all_day: p.due_at.includes('T') ? 0 : 1, repeat_rule: p.repeat_rule, repeat_from: p.repeat_rule ? 'due' : null, reminders: p.due_at.includes('T') ? ['-PT0M'] : [] }
    : undefined
  const chip = !schedule && inferred ? rowDateLabel({ due_at: inferred.due_at }, dayKey()) : null
  const submit = async () => {
    const title = p ? p.title : raw.trim()
    if (!title || saving.current) return
    saving.current = true
    try {
      const tagIds = p ? [...p.tag_ids, ...(await ensureTags(p.newTags))] : []
      await onCreate(title, desc.current?.value.trim() || undefined, schedule ?? inferred, priority || p?.priority || undefined, { list_id: p?.list_id, tag_ids: tagIds })
    } finally { saving.current = false }
    setRaw('')
    setScroll(0)
    setRecognition(true)
    if (desc.current) desc.current.value = ''
    setDescOpen(false)
    setSchedule(undefined)
    setPriority(0)
    input.current?.focus() // 02 §4: Enter 연속 입력
  }
  const active = focused || !!pop || descOpen
  return (
    <div
      className={`addbar${descOpen ? ' has-desc' : ''}${active ? ' is-active' : ''}`}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false) }}
    >
      <div className="addbar__line">
        <Plus className="addbar__icon" />
        <span className="addbar__field">
          {p && p.tokens.length > 0 && (
            <span className="addbar__highlight" aria-hidden="true"><span style={{ transform: `translateX(-${scroll}px)` }}>{highlightRecognized(raw, p.tokens)}</span></span>
          )}
          <input
            ref={input}
            className="addbar__input"
            spellCheck={false}
            placeholder={placeholder}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return // 한글 조합 중 Enter 무시
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                setDescOpen(true)
                requestAnimationFrame(() => desc.current?.focus())
              } else if (e.key === 'Enter') void submit()
              else if (e.key === 'Escape') {
                setRaw('')
                setRecognition(true)
                setDescOpen(false)
                e.currentTarget.blur()
              }
            }}
          />
        </span>
        {chip && (
          <button className={`addbar__chip is-${chip.tone}`} title="눌러서 인식 해제" onMouseDown={(e) => e.preventDefault()} onClick={() => { setRecognition(false); input.current?.focus() }}>
            <CalendarDays />{chip.label}
          </button>
        )}
        {active && (
          <span className="addbar__tools">
            <button ref={dateBtn} className={`addbar__tool${(schedule ?? inferred)?.due_at ? ' is-set' : ''}`} aria-label="날짜" onMouseDown={(e) => e.preventDefault()} onClick={() => setPop(pop === 'date' ? undefined : 'date')}><CalendarDays /></button>
            <button ref={moreBtn} className="addbar__tool" aria-label="우선순위" style={priority || p?.priority ? { color: flagColor(priority || p?.priority || 0) } : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => setPop(pop === 'priority' ? undefined : 'priority')}><ChevronDown /></button>
          </span>
        )}
      </div>
      {descOpen && (
        <textarea
          ref={desc}
          className="addbar__desc"
          placeholder="설명 (⌘Enter로 만들기)"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
            else if (e.key === 'Escape') {
              setDescOpen(false)
              input.current?.focus()
            }
          }}
        />
      )}
      {pop === 'date' && (
        <DatePicker initial={schedule ?? inferred ?? EMPTY_SCHEDULE} anchor={dateBtn.current} onSave={(s) => setSchedule(s)} onClose={() => { setPop(undefined); input.current?.focus() }} />
      )}
      {pop === 'priority' && (
        <Popover anchor={moreBtn.current} align="end" onClose={() => { setPop(undefined); input.current?.focus() }} className="menu">
          <PriorityRow value={priority || p?.priority || 0} onPick={(v) => { setPriority(v); setPop(undefined); input.current?.focus() }} />
        </Popover>
      )}
    </div>
  )
}

/** 02 §0 섹션 만들기: 추가 바 아래 이름 입력 줄. Enter = 만들기, Esc·빈 채로 벗어나기 = 취소 */
function SectionInput({ onCreate, onCancel }: { onCreate: (name: string) => Promise<void>; onCancel: () => void }) {
  return (
    <div className="section-input">
      <ChevronDown className="section-input__chevron" />
      <input
        autoFocus
        placeholder="섹션 이름을 입력하십시오. 만들려면 Enter 키를 누르십시오."
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) void onCreate(v); else onCancel() }
        }}
        onBlur={(e) => { if (!e.currentTarget.value.trim()) onCancel() }}
      />
    </div>
  )
}
