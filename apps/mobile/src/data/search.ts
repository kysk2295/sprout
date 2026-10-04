// 검색(시안 H, 04 §검색 데스크톱 규칙): 로컬 SQLite LIKE(와일드카드 글자 그대로), 삭제한 것 제외, 완료는 따로 표시.
// 범위: 할 일(제목·설명·체크 항목) · 수집함(내용·링크 제목) · 일기(나만 보기 제외 — 15) · 리스트 · 태그 · 필터. 순수 모듈(시험: org.test.ts)
export type SearchKind = 'task' | 'note' | 'diary' | 'list' | 'tag' | 'filter'
export const SEARCH_KINDS: [SearchKind, string][] = [['task', '할 일'], ['note', '수집함'], ['diary', '일기'], ['list', '리스트'], ['tag', '태그'], ['filter', '필터']]

export const likeOf = (q: string) => `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`

export function searchSql(kind: SearchKind, q: string): { sql: string; params: unknown[] } {
  const like = likeOf(q)
  const E = "ESCAPE '\\'"
  switch (kind) {
    case 'task':
      return {
        sql: `SELECT t.id FROM tasks t LEFT JOIN lists l ON l.id = t.list_id
              WHERE t.deleted_at IS NULL AND (t.title LIKE ? ${E} OR t.content LIKE ? ${E}
                OR EXISTS (SELECT 1 FROM check_items c WHERE c.task_id = t.id AND c.title LIKE ? ${E}))
              ORDER BY t.status, CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.modified_at DESC LIMIT 200`,
        params: [like, like, like]
      }
    case 'note':
      return { sql: `SELECT id, content, link_title, url, kind, created_at FROM notes WHERE (content LIKE ? ${E} OR link_title LIKE ? ${E} OR url LIKE ? ${E}) ORDER BY COALESCE(captured_at, created_at) DESC LIMIT 100`, params: [like, like, like] }
    case 'diary':
      return { sql: `SELECT id, date, content FROM diary_entries WHERE COALESCE(private, 0) = 0 AND content LIKE ? ${E} ORDER BY date DESC LIMIT 100`, params: [like] }
    case 'list':
      return { sql: `SELECT id, name, emoji, color, kind FROM lists WHERE archived_at IS NULL AND (name LIKE ? ${E} OR (kind = 'inbox' AND '기본함' LIKE ? ${E})) ORDER BY sort_order LIMIT 100`, params: [like, like] }
    case 'tag':
      return { sql: `SELECT id, name, color FROM tags WHERE name LIKE ? ${E} ORDER BY sort_order, name LIMIT 100`, params: [like] }
    case 'filter':
      return { sql: `SELECT id, name, emoji FROM filters WHERE name LIKE ? ${E} ORDER BY sort_order LIMIT 100`, params: [like] }
  }
}

/** 맞는 글자 칠하기: [글, 맞음?] 조각들(대소문자 무시) */
export function highlight(text: string, q: string): [string, boolean][] {
  const k = q.trim().toLowerCase()
  if (!k) return [[text, false]]
  const out: [string, boolean][] = []
  const low = text.toLowerCase()
  let i = 0
  for (;;) {
    const j = low.indexOf(k, i)
    if (j < 0) break
    if (j > i) out.push([text.slice(i, j), false])
    out.push([text.slice(j, j + k.length), true])
    i = j + k.length
  }
  if (i < text.length) out.push([text.slice(i), false])
  return out
}
/** 설명에서 맞으면 앞뒤 글(시안 H-2 "…다음 회의 전에…") */
export function snippet(text: string | null | undefined, q: string, around = 14): string | null {
  if (!text) return null
  const k = q.trim().toLowerCase()
  const flat = text.replace(/\s+/g, ' ')
  const j = flat.toLowerCase().indexOf(k)
  if (!k || j < 0) return null
  const a = Math.max(0, j - around)
  const b = Math.min(flat.length, j + k.length + around)
  return `${a > 0 ? '…' : ''}${flat.slice(a, b)}${b < flat.length ? '…' : ''}`
}

/** 최근 검색(기기에만): 맨 앞에 넣고 같은 말은 빼고 최대 10개 */
export function pushRecent(list: string[], q: string, max = 10): string[] {
  const v = q.trim()
  if (!v) return list
  return [v, ...list.filter((x) => x !== v)].slice(0, max)
}
