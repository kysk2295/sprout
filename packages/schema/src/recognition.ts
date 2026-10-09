import { addDays, addMinutes, dateKey, NATIVE_HOURS, parseTimeInput, TIME_PREFIXES, WEEKDAY_KO } from './time.ts'

const HOUR = `(?:\\d{1,2}|${NATIVE_HOURS.map(([w]) => w).join('|')})`
const CLOCK = `(?:(?:${TIME_PREFIXES.join('|')})\\s*)?(?:\\d{1,2}:\\d{2}|${HOUR}시(?:\\s*(?:반|정각|\\d{1,2}분))?)`
/** 시각 뒤 조사(47 §2.2 · research 39 §5): '3시에' · '2시로' · '3시부터' · '7시쯤' — 조사까지 같이 걷는다 */
const TIME_JOSA = '(?:에|로|으로|부터|까지|쯤에?|경에?)?'
const TIME_RE = new RegExp(`(?:^|\\s)(${CLOCK})${TIME_JOSA}(?=\\s|$)`)
/** 47 길이·범위(비서만): '3시부터 5시까지' · '3시~5시' · '오후 3시-4시 반' */
const RANGE_RE = new RegExp(`(?:^|\\s)(${CLOCK})\\s*(?:부터\\s*|~\\s*|〜\\s*|-\\s*|–\\s*)(${CLOCK})(?:까지)?(?:에|로)?(?=\\s|$)`)
const NUM_WORD: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 }
/** '한 시간' · '1시간 반' · '두시간 동안' · '30분' · '90분짜리' */
const DURATION_RE = /(?:^|\s)(?:(한|두|세|네|다섯|여섯|\d{1,2})\s*시간(\s*반)?(?:\s*(\d{1,2})분)?|(\d{1,3})\s*분)(?:\s*(?:동안|간|짜리|정도))?(?=\s|$)/
const DATE_JOSA = '(?:에|까지|로)?'

export interface Recognition {
  title: string
  due_at: string | null
  repeat_rule: string | null
  priority?: number
  list_id?: string
  tag_ids: string[]
  recognized: string[]
  /** 47 비서(assistant): 범위('3시부터 5시까지')면 시작, due_at = 끝 */
  start_at?: string | null
  /** 47 비서: 말한 길이(분). 없으면 undefined(길이를 만들지 않는다 — 13 부록 A) */
  duration_min?: number
  /** 47 비서: 오전/오후 없는 1–7시를 오후로 읽었다(확인 카드에 그대로 보인다) */
  assumed_pm?: boolean
}
export type RecognizeOptions = {
  /** 47 AI 비서 길잡이: 오전/오후 없는 1–7시 = 오후, 길이·범위 읽기. 빠른 추가(04)는 끔 — '3시 반 미팅' = 03:30 그대로 */
  assistant?: boolean
}
/** 보수적인 로컬 인식. 지원하지 않는 표현은 제목에 남긴다. 기준 시각을 주입해 자정·연말도 검증한다. */
export function recognize(raw: string, lists: { id: string; name: string }[] = [], tags: { id: string; name: string }[] = [], now = new Date(), opts: RecognizeOptions = {}): Recognition {
  let title = raw
  const result: Recognition = { title: raw.trim(), due_at: null, repeat_rule: null, tag_ids: [], recognized: [] }
  const consume = (s: string) => { title = title.replace(s, ' '); result.recognized.push(s.trim()) }
  const today = dateKey(now)
  let date: string | null = null
  const weekday = title.match(new RegExp(`(?:^|\\s)(매주|다음\\s*주|이번\\s*주)\\s*([일월화수목금토])(?:요일)?${DATE_JOSA}(?=\\s|$)`))
  if (weekday) {
    const target = WEEKDAY_KO.indexOf(weekday[2])
    const offset = weekday[1] === '매주' ? (target - now.getDay() + 7) % 7 : target - now.getDay() + (weekday[1].startsWith('다음') ? 7 : 0)
    date = addDays(today, offset)
    if (weekday[1] === '매주') result.repeat_rule = `FREQ=WEEKLY;BYDAY=${['SU','MO','TU','WE','TH','FR','SA'][target]}`
    consume(weekday[0])
  } else {
    const relative = title.match(new RegExp(`(?:^|\\s)(오늘|내일|모레|매일)${DATE_JOSA}(?=\\s|$)`))
    if (relative) {
      date = addDays(today, relative[1] === '내일' ? 1 : relative[1] === '모레' ? 2 : 0)
      if (relative[1] === '매일') result.repeat_rule = 'FREQ=DAILY'
      consume(relative[0])
    } else {
      const explicit = title.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/)
      const monthDay = title.match(new RegExp(`(?:^|\\s)(\\d{1,2})월\\s*(\\d{1,2})일${DATE_JOSA}(?=\\s|$)`))
      if (explicit) {
        const parsed = new Date(`${explicit[1]}T12:00`)
        if (!Number.isNaN(parsed.getTime()) && dateKey(parsed) === explicit[1]) { date = explicit[1]; consume(explicit[0]) }
      } else if (monthDay) {
        // 'M월 D일' — 올해 그날, 이미 지났으면 내년(지난 날짜로 새 일을 만들지 않는다)
        const m = Number(monthDay[1]), d = Number(monthDay[2])
        const make = (y: number) => { const x = new Date(y, m - 1, d, 12); return x.getMonth() === m - 1 && x.getDate() === d ? dateKey(x) : null }
        const thisYear = make(now.getFullYear())
        const day = thisYear && thisYear < today ? make(now.getFullYear() + 1) : thisYear
        if (day) { date = day; consume(monthDay[0]) }
      } else {
        // 04 §1: 요일만 쓰면 가장 가까운 그 요일(오늘 포함). '월'처럼 한 글자는 다른 뜻이 많아 '요일'까지 쓴 것만
        const bare = title.match(new RegExp(`(?:^|\\s)([일월화수목금토])요일${DATE_JOSA}(?=\\s|$)`))
        if (bare) { date = addDays(today, (WEEKDAY_KO.indexOf(bare[1]) - now.getDay() + 7) % 7); consume(bare[0]) }
      }
    }
  }
  // 오전/오후 없는 1–7시는 오후(47 §2.2 — 비서만). 앞말(아침·새벽·오전…)이나 13시 이상이면 그대로
  const contextual = (clock: string, parsed: string) => {
    const h = Number(parsed.slice(0, 2))
    if (!opts.assistant || /^(오전|오후|아침|저녁|새벽|낮|밤)|am|pm/i.test(clock.trim()) || h < 1 || h > 7) return parsed
    result.assumed_pm = true
    return `${String(h + 12).padStart(2, '0')}${parsed.slice(2)}`
  }
  const range = opts.assistant ? title.match(RANGE_RE) : null
  if (range) {
    // 끝에 앞말이 없으면 시작의 앞말을 따른다('오후 3시부터 5시까지')
    const PRE = /^(오전|오후|아침|저녁|새벽|낮|밤)/
    const pre = PRE.exec(range[1].trim())?.[1]
    const endClock = PRE.test(range[2].trim()) || !pre ? range[2] : `${pre} ${range[2]}`
    const rs = parseTimeInput(range[1]), re = parseTimeInput(endClock)
    if (rs && re) {
      const start = contextual(range[1], rs)
      let end = contextual(endClock, re)
      if (end <= start && Number(end.slice(0, 2)) < 12) end = `${String(Number(end.slice(0, 2)) + 12).padStart(2, '0')}${end.slice(2)}`
      if (end > start) {
        result.start_at = `${date ?? today}T${start}`
        result.due_at = `${date ?? today}T${end}`
        result.duration_min = (Number(end.slice(0, 2)) * 60 + Number(end.slice(3))) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)))
        consume(range[0])
      }
    }
  }
  // 시각: "오후 3시", "3:30", "세시 반", "저녁 일곱시 20분", "3시 정각", "3시에" — 고유어 한시~열두시와 앞말(오전·오후·아침·저녁·새벽·낮·밤)
  const time = result.due_at ? null : title.match(TIME_RE)
  if (time) {
    const parsed = parseTimeInput(time[1])
    if (parsed) { result.due_at = `${date ?? today}T${contextual(time[1], parsed)}`; consume(time[0]) }
  }
  if (opts.assistant && !result.start_at) {
    const dur = title.match(DURATION_RE)
    if (dur) {
      const hours = dur[1] ? (NUM_WORD[dur[1]] ?? Number(dur[1])) : 0
      const minutes = dur[1] ? hours * 60 + (dur[2] ? 30 : 0) + Number(dur[3] ?? 0) : Number(dur[4])
      if (minutes > 0 && minutes <= 24 * 60) {
        result.duration_min = minutes
        consume(dur[0])
        // 시각이 있으면 시작 = 그 시각, 끝 = 시작 + 길이(13 부록 A: 말한 길이만)
        if (result.due_at?.includes('T')) { result.start_at = result.due_at; result.due_at = addMinutes(result.due_at, minutes) }
      }
    }
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
