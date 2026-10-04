// id로 태스크 행(목록과 같은 열)을 읽는 쿼리
const COLUMNS = `t.id, t.list_id, t.parent_id, t.section_id, t.title, t.content, t.content_mode, t.status, t.priority, t.due_at, t.is_all_day,
  t.start_at, t.sort_order, t.repeat_rule, t.repeat_from, t.repeat_origin_id, t.pinned_at, t.created_at, t.modified_at, t.completed_at, t.deleted_at,
  l.name AS list_name, l.emoji AS list_emoji, l.color AS list_color, l.kind AS list_kind,
  (SELECT group_concat(tt.tag_id) FROM task_tags tt WHERE tt.task_id = t.id) AS tag_ids,
  (SELECT count(*) FROM check_items c WHERE c.task_id = t.id) AS check_total,
  (SELECT count(*) FROM check_items c WHERE c.task_id = t.id AND c.done = 1) AS check_done,
  (SELECT count(*) FROM reminders r WHERE r.task_id = t.id) AS reminder_count`
export function openTasksSqlById(ids: string[]) {
  return {
    sql: `SELECT ${COLUMNS} FROM tasks t LEFT JOIN lists l ON l.id = t.list_id WHERE t.id IN (${ids.map(() => '?').join(',') || 'NULL'}) ORDER BY t.sort_order`,
    params: ids
  }
}
export const TASK_COLUMNS = COLUMNS
