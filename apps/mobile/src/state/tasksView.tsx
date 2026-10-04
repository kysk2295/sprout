// 할 일 탭의 기기 상태(21 §6 "기기에만"): 지금 보기(서랍에서 고른 목록), 묶음 접힘, 하위 펼침, 자세히 보기, 완료 보기, 서랍 열림.
// 지금 보기는 모듈 저장소 — 탭 밖(딥 링크 sprout://today, 검색 결과의 리스트·태그, 캘린더)에서도 바꿀 수 있다.
// [다음] 앱을 다시 켜도 남게 저장(지금은 메모리 — 앱을 켜면 오늘부터)
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { DEFAULT_VIEW, type ViewKey } from '../data/views'

let current: ViewKey = DEFAULT_VIEW
const subs = new Set<() => void>()
/** 할 일 탭 보기를 바꾼다(탭 이동은 부르는 쪽이 router로) */
export function setTasksView(v: ViewKey) {
  if (v === current) return
  current = v
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useTasksViewSetter = () => setTasksView
export const useCurrentTasksView = () => useSyncExternalStore(subscribe, () => current)

type State = {
  view: ViewKey
  setView: (v: ViewKey) => void
  isCollapsed: (groupId: string, byDefault?: boolean) => boolean
  toggleGroup: (groupId: string, byDefault?: boolean) => void
  isExpanded: (taskId: string) => boolean
  toggleExpand: (taskId: string) => void
  showDetails: boolean
  setShowDetails: (on: boolean) => void
  showCompleted: boolean
  setShowCompleted: (on: boolean) => void
  drawerOpen: boolean
  setDrawerOpen: (on: boolean) => void
}
const Ctx = createContext<State | null>(null)

export function TasksViewProvider({ children }: { children: ReactNode }) {
  const view = useCurrentTasksView()
  const [groups, setGroups] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showDetails, setShowDetails] = useState(false)
  const [showCompleted, setShowCompleted] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const setView = useCallback((v: ViewKey) => setTasksView(v), [])
  const isCollapsed = useCallback((g: string, byDefault = false) => groups[`${view}|${g}`] ?? byDefault, [groups, view])
  const toggleGroup = useCallback((g: string, byDefault = false) => setGroups((s) => ({ ...s, [`${view}|${g}`]: !(s[`${view}|${g}`] ?? byDefault) })), [view])
  const isExpanded = useCallback((id: string) => !!expanded[id], [expanded])
  const toggleExpand = useCallback((id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] })), [])
  const value = useMemo(
    () => ({ view, setView, isCollapsed, toggleGroup, isExpanded, toggleExpand, showDetails, setShowDetails, showCompleted, setShowCompleted, drawerOpen, setDrawerOpen }),
    [view, setView, isCollapsed, toggleGroup, isExpanded, toggleExpand, showDetails, showCompleted, drawerOpen]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export function useTasksView() {
  const v = useContext(Ctx)
  if (!v) throw new Error('TasksViewProvider 밖')
  return v
}
