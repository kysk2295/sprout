export interface TaskRow {
  id: string
  list_id: string | null
  parent_id: string | null
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
export const listLabel = (l: { kind: string | null; name: string | null; emoji?: string | null }) =>
  l.kind === 'inbox' ? '기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name ?? ''}`
