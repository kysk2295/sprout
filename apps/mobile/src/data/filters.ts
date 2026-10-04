// 사용자 필터(07) — 데스크톱 apps/desktop/src/renderer/src/data/filters.ts와 같은 규칙·같은 rule_json(순수 모듈, 시험: org.test.ts)
// 같은 종류 여러 선택은 OR, 종류 사이 AND. 빈 선택은 전체. 키워드는 제목·본문 부분 일치(%, _도 글자로). 보관 리스트 제외.
export type FilterDate = 'all' | 'today' | 'tomorrow' | 'next7' | 'overdue' | 'none'
export interface FilterRule { lists: string[]; tags: string[]; date: FilterDate; priorities: number[]; keyword: string }
export interface FilterRow { id: string; name: string; emoji: string | null; rule_json: string; sort_order?: number }
export const EMPTY_FILTER: FilterRule = { lists: [], tags: [], date: 'all', priorities: [], keyword: '' }
export const FILTER_DATES: [FilterDate, string][] = [['all', '전체'], ['today', '오늘'], ['tomorrow', '내일'], ['next7', '다음 7일'], ['overdue', '만료됨'], ['none', '날짜 없음']]
const DATES = FILTER_DATES.map(([d]) => d)

/** 저장값을 읽는다 — 잘못된 값은 버리고, 깨진 JSON은 빈 조건(= 전체가 아니라 저장 전 상태)으로 */
export function readFilter(raw: string | null | undefined): FilterRule {
  try {
    const r = JSON.parse(raw ?? '')
    const strings = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])
    return {
      lists: strings(r.lists),
      tags: strings(r.tags),
      date: DATES.includes(r.date) ? r.date : 'all',
      priorities: Array.isArray(r.priorities) ? r.priorities.filter((x: unknown) => [0, 1, 2, 3].includes(x as number)) : [],
      keyword: typeof r.keyword === 'string' ? r.keyword : ''
    }
  } catch {
    return EMPTY_FILTER
  }
}
export const writeFilter = (r: FilterRule) => JSON.stringify({ lists: r.lists, tags: r.tags, date: r.date, priorities: r.priorities, keyword: r.keyword.trim() })

/** 저장된 JSON은 값으로만 쓴다: SQL 이름·연산자가 되지 않는다(데스크톱과 같은 문장) */
export function filterScope(id: string, today: string, tomorrow: string, last: string): { where: string; params: unknown[] } {
  const start = 'substr(COALESCE(t.start_at,t.due_at),1,10)'
  const end = 'substr(t.due_at,1,10)'
  return {
    where: `l.archived_at IS NULL AND EXISTS (SELECT 1 FROM filters f WHERE f.id=? AND json_valid(f.rule_json) AND
 (COALESCE(json_array_length(f.rule_json,'$.lists'),0)=0 OR t.list_id IN (SELECT value FROM json_each(f.rule_json,'$.lists'))) AND
 (COALESCE(json_array_length(f.rule_json,'$.tags'),0)=0 OR EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id=t.id AND tt.tag_id IN (SELECT value FROM json_each(f.rule_json,'$.tags')))) AND
 (COALESCE(json_array_length(f.rule_json,'$.priorities'),0)=0 OR t.priority IN (SELECT value FROM json_each(f.rule_json,'$.priorities'))) AND
 (COALESCE(json_extract(f.rule_json,'$.keyword'),'')='' OR instr(lower(t.title),lower(json_extract(f.rule_json,'$.keyword')))>0 OR instr(lower(COALESCE(t.content,'')),lower(json_extract(f.rule_json,'$.keyword')))>0) AND
 CASE COALESCE(json_extract(f.rule_json,'$.date'),'all') WHEN 'all' THEN 1 WHEN 'none' THEN t.due_at IS NULL WHEN 'today' THEN ${start}<=? AND ${end}>=? WHEN 'tomorrow' THEN ${start}<=? AND ${end}>=? WHEN 'next7' THEN ${start}<=? AND ${end}>=? WHEN 'overdue' THEN ${end}<? ELSE 0 END)`,
    params: [id, today, today, tomorrow, tomorrow, last, today, today]
  }
}

/** 같은 규칙을 JS로(시험·미리 보기 개수용). 태그는 task의 tag_ids(쉼표) */
export function matchesFilter(
  r: FilterRule,
  t: { list_id: string | null; tag_ids?: string | null; priority: number; title: string; content: string | null; start_at: string | null; due_at: string | null },
  days: { today: string; tomorrow: string; last: string }
): boolean {
  if (r.lists.length && !r.lists.includes(t.list_id ?? '')) return false
  const tags = t.tag_ids?.split(',').filter(Boolean) ?? []
  if (r.tags.length && !r.tags.some((x) => tags.includes(x))) return false
  if (r.priorities.length && !r.priorities.includes(t.priority)) return false
  const k = r.keyword.trim().toLowerCase()
  if (k && !t.title.toLowerCase().includes(k) && !(t.content ?? '').toLowerCase().includes(k)) return false
  const s = (t.start_at ?? t.due_at)?.slice(0, 10)
  const e = t.due_at?.slice(0, 10)
  switch (r.date) {
    case 'none': return !t.due_at
    case 'today': return !!s && !!e && s <= days.today && e >= days.today
    case 'tomorrow': return !!s && !!e && s <= days.tomorrow && e >= days.tomorrow
    case 'next7': return !!s && !!e && s <= days.last && e >= days.today
    case 'overdue': return !!e && e < days.today
    default: return true
  }
}

/** 필터 편집 아래 요약 한 줄("업무 · #운동 · 오늘 · 높음") */
export function filterSummary(r: FilterRule, names: { lists: Record<string, string>; tags: Record<string, string> }): string {
  const parts: string[] = []
  if (r.lists.length) parts.push(r.lists.map((id) => names.lists[id] ?? '?').join(', '))
  if (r.tags.length) parts.push(r.tags.map((id) => `#${names.tags[id] ?? '?'}`).join(', '))
  if (r.date !== 'all') parts.push(FILTER_DATES.find(([d]) => d === r.date)![1])
  if (r.priorities.length) parts.push(r.priorities.map((p) => ['없음', '낮음', '중간', '높음'][p]).join(', '))
  if (r.keyword.trim()) parts.push(`"${r.keyword.trim()}"`)
  return parts.join(' · ') || '모든 할 일'
}
