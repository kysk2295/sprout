import { splitEmoji } from '../../../shared/emoji'
export interface TaskRow {
  id: string
  list_id: string | null
  parent_id: string | null
  section_id?: string | null
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
  repeat_from: string | null
  repeat_origin_id: string | null
  pinned_at: string | null
  created_at: string | null
  modified_at: string | null
  completed_at: string | null
  deleted_at: string | null
  list_name: string | null
  list_emoji: string | null
  list_color: string | null
  list_kind: string | null
  tag_ids: string | null
  check_total: number
  check_done: number
  reminder_count: number
}
export interface ListRow {
  id: string
  name: string
  emoji: string | null
  color: string | null
  kind: string
  sort_order: number
}
export interface TagRow {
  id: string
  name: string
  color: string | null
}
export interface CheckItemRow {
  id: string
  task_id: string
  title: string
  done: number
  sort_order: number
}
/** 리스트 아이콘·이름(30 §A.4): 이모지 칸이 비었는데 이름이 이모지로 시작하면(`💰가계부`) 그 이모지를 아이콘으로 쓰고 이름에서 뗀다 — ≡ + 💰가계부 두 아이콘 겹침 방지 */
export const listView = (l: { name: string | null; emoji?: string | null }): { emoji: string | null; name: string } =>
  l.emoji ? { emoji: l.emoji, name: l.name ?? '' } : splitEmoji(l.name ?? '')
export const listLabel = (l: { kind: string | null; name: string | null; emoji?: string | null }) =>
  l.kind === 'inbox' ? '기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name ?? ''}`

export interface SectionRow { id: string; name: string; sort_order: number }
