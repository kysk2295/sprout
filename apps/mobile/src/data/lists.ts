// 리스트·폴더·섹션·태그 읽기 + 서랍 개수(20 §2 서랍)
import { useQuery } from '@powersync/react-native'
import { dayKey } from '../lib/dates'
import type { FolderRow, ListRow, SectionRow } from './views'

export interface TagRow { id: string; name: string; color: string | null }

export function useLists(): ListRow[] {
  return useQuery<ListRow>("SELECT id, name, emoji, color, kind, folder_id, sort_order FROM lists WHERE archived_at IS NULL ORDER BY kind = 'inbox' DESC, sort_order, name").data
}
export function useFolders(): FolderRow[] {
  return useQuery<FolderRow>('SELECT id, name, sort_order FROM folders ORDER BY sort_order, name').data
}
export function useSections(listId: string | null): SectionRow[] {
  return useQuery<SectionRow>('SELECT id, list_id, name, sort_order FROM sections WHERE list_id = ? ORDER BY sort_order', [listId ?? '']).data
}
export function useTags(): TagRow[] {
  return useQuery<TagRow>('SELECT id, name, color FROM tags ORDER BY sort_order, name').data
}

const OPEN = 't.status = 0 AND t.deleted_at IS NULL'
const IN_SMART = "l.archived_at IS NULL AND COALESCE(l.show_in_smart, 'all') = 'all'"
const S = 'substr(COALESCE(t.start_at, t.due_at), 1, 10)'
const E = 'substr(t.due_at, 1, 10)'
const FROM = 'FROM tasks t LEFT JOIN lists l ON l.id = t.list_id'

/** 서랍 오른쪽 개수(미완료) */
export function useDrawerCounts(today = dayKey()): { smart: Record<string, number>; lists: Record<string, number> } {
  const d1 = dayKey(1, new Date(`${today}T00:00`))
  const d6 = dayKey(6, new Date(`${today}T00:00`))
  const smart = useQuery<{ today: number; tomorrow: number; next7: number; inbox: number }>(
    `SELECT
      (SELECT count(*) ${FROM} WHERE ${OPEN} AND ${IN_SMART} AND ${S} <= ?) AS today,
      (SELECT count(*) ${FROM} WHERE ${OPEN} AND ${IN_SMART} AND ${S} <= ? AND ${E} >= ?) AS tomorrow,
      (SELECT count(*) ${FROM} WHERE ${OPEN} AND ${IN_SMART} AND ${S} <= ? AND ${E} >= ?) AS next7,
      (SELECT count(*) ${FROM} WHERE ${OPEN} AND l.kind = 'inbox') AS inbox`,
    [today, d1, d1, d6, today]
  ).data[0]
  const per = useQuery<{ list_id: string; n: number }>(`SELECT t.list_id, count(*) AS n FROM tasks t WHERE ${OPEN} GROUP BY t.list_id`).data
  return {
    smart: { today: smart?.today ?? 0, tomorrow: smart?.tomorrow ?? 0, next7: smart?.next7 ?? 0, inbox: smart?.inbox ?? 0 },
    lists: Object.fromEntries(per.map((r) => [r.list_id, r.n]))
  }
}
