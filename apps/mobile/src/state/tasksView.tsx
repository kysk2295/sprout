// 할 일 탭의 기기 상태(21 §6 "기기에만"): 지금 보기(서랍에서 고른 목록), 묶음 접힘, 하위 펼침, 자세히 보기, 완료 보기, 서랍 열림.
// [다음] 앱을 다시 켜도 남게 저장(지금은 메모리 — 앱을 켜면 오늘부터)
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_VIEW, type ViewKey } from '../data/views'

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
  const [view, setViewRaw] = useState<ViewKey>(DEFAULT_VIEW)
  const [groups, setGroups] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showDetails, setShowDetails] = useState(false)
  const [showCompleted, setShowCompleted] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const setView = useCallback((v: ViewKey) => setViewRaw(v), [])
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
