import type { MouseEvent } from 'react'
import type { CalItem } from '../../lib/calendar'

// 캘린더 보기(주·일·월)가 CalendarView에 알리는 것
export interface Draft { start_at: string | null; due_at: string | null }
export type Rect = { left: number; top: number; right: number; bottom: number }
export type Change = { id: string; start_at: string | null; due_at: string | null }
export interface CalHandlers {
  selection: string[]
  pending?: Draft
  colorOf: (it: CalItem) => string
  itemsById: (ids: string[]) => CalItem[]
  onSelect: (id: string, toggle: boolean) => void
  onOpen: (it: CalItem, rect: Rect) => void
  onContext: (it: CalItem, e: MouseEvent) => void
  onToggle: (it: CalItem) => void
  onCreate: (draft: Draft, rect: Rect) => void
  onMove: (changes: Change[], duplicate: boolean) => void
  onMoveToList: (ids: string[], listId: string) => void
  onEdgeShift: (n: number) => void
}
