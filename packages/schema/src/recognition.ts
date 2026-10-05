import { addDays, dateKey, NATIVE_HOURS, parseTimeInput, TIME_PREFIXES, WEEKDAY_KO } from './time.ts'

const HOUR = `(?:\\d{1,2}|${NATIVE_HOURS.map(([w]) => w).join('|')})`
const TIME_RE = new RegExp(`(?:^|\\s)((?:(?:${TIME_PREFIXES.join('|')})\\s*)?(?:\\d{1,2}:\\d{2}|${HOUR}시(?:\\s*(?:반|정각|\\d{1,2}분))?))(?=\\s|$)`)

export interface Recognition {
  title: string
  due_at: string | null
  repeat_rule: string | null
  priority?: number
  list_id?: string
  tag_ids: string[]
  recognized: string[]
}
/** 보수적인 로컬 인식. 지원하지 않는 표현은 제목에 남긴다. 기준 시각을 주입해 자정·연말도 검증한다. */
export function recognize(raw: string, lists: { id: string; name: string }[] = [], tags: { id: string; name: string }[] = [], now = new Date()): Recognition {
  let title = raw
  const result: Recognition = { title: raw.trim(), due_at: null, repeat_rule: null, tag_ids: [], recognized: [] }
  const consume = (s: string) => { title = title.replace(s, ' '); result.recognized.push(s.trim()) }
  const today = dateKey(now)
  let date: string | null = null
  const weekday = title.match(/(?:^|\s)(매주|다음\s*주|이번\s*주)\s*([일월화수목금토])(?:요일)?(?=\s|$)/)
  if (weekday) {
    const target = WEEKDAY_KO.indexOf(weekday[2])
    const offset = weekday[1] === '매주' ? (target - now.getDay() + 7) % 7 : target - now.getDay() + (weekday[1].startsWith('다음') ? 7 : 0)
    date = addDays(today, offset)
    if (weekday[1] === '매주') result.repeat_rule = `FREQ=WEEKLY;BYDAY=${['SU','MO','TU','WE','TH','FR','SA'][target]}`
    consume(weekday[0])
  } else {
    const relative = title.match(/(?:^|\s)(오늘|내일|모레|매일)(?=\s|$)/)
    if (relative) {
      date = addDays(today, relative[1] === '내일' ? 1 : relative[1] === '모레' ? 2 : 0)
      if (relative[1] === '매일') result.repeat_rule = 'FREQ=DAILY'
      consume(relative[0])
    } else {
      const explicit = title.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/)
      if (explicit) {
        const parsed = new Date(`${explicit[1]}T12:00`)
        if (!Number.isNaN(parsed.getTime()) && dateKey(parsed) === explicit[1]) { date = explicit[1]; consume(explicit[0]) }
      } else {
        // 04 §1: 요일만 쓰면 가장 가까운 그 요일(오늘 포함). '월'처럼 한 글자는 다른 뜻이 많아 '요일'까지 쓴 것만
        const bare = title.match(/(?:^|\s)([일월화수목금토])요일(?=\s|$)/)
        if (bare) { date = addDays(today, (WEEKDAY_KO.indexOf(bare[1]) - now.getDay() + 7) % 7); consume(bare[0]) }
      }
    }
  }
  // 시각: "오후 3시", "3:30", "세시 반", "저녁 일곱시 20분", "3시 정각" — 고유어 한시~열두시와 앞말(오전·오후·아침·저녁·새벽·낮·밤)
  const time = title.match(TIME_RE)
  if (time) {
    const parsed = parseTimeInput(time[1])
    if (parsed) { result.due_at = `${date ?? today}T${parsed}`; consume(time[0]) }
  }
  if (!result.due_at) result.due_at = date
  const priority = title.match(/(?:^|\s)!(높음|중간|낮음|없음)(?=\s|$)/)
  if (priority) { result.priority = { 높음: 3, 중간: 2, 낮음: 1, 없음: 0 }[priority[1]]; consume(priority[0]) }
  for (const match of [...title.matchAll(/(?:^|\s)([#~^])([^\s]+)/g)]) {
    const item = (match[1] === '#' ? tags : lists).find((x) => x.name === match[2])
    if (!item) continue
    if (match[1] === '#') result.tag_ids.push(item.id)
    else result.list_id = item.id
    consume(match[0])
  }
  result.title = title.replace(/\s+/g, ' ').trim()
  result.tag_ids = [...new Set(result.tag_ids)]
  return result
}
