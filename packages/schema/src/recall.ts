// 13 §3.1 AI 비서 "기록 묻기" — "미용실 간 지 얼마나 지났지"(마지막으로 한 날) · "이번 달 운동 몇 번 했지"(횟수).
// 데스크톱·휴대폰이 같이 쓰는 순수 함수: 말 → 물음(앞에서 정해진 규칙, 모델보다 먼저), 할 일·일정 행 → 답(캐릭터 한 줄 + 카드 자료).
// 한 줄은 앱이 고른다(40 §3.2 — 모델이 쓰지 않는다). 날짜·숫자는 결과에서만 가져온다. 시험: recall.test.ts.
import { eulReul, eunNeun, iGa } from './josa.ts'

export type RecallMode = 'last' | 'count'
export type RecallAsk = {
  mode: RecallMode
  /** 찾을 말(조사 뗀 것). 제목에 모두 들어 있어야 한다 */
  words: string[]
  /** 한 줄에 쓸 말: '미용실 간' · '운동한' · '치과에 간'. 동사가 없으면 '미용실' */
  phrase: string
  /** 물음에 동사가 있었는지(있으면 '마지막으로 ~ 건', 없으면 '마지막 ~은') */
  verb: boolean
  /** 횟수 답의 끝말: '했어' · '갔어' */
  past: string
  /** 횟수 기간(포함). 없으면 지금까지 */
  from?: string
  to?: string
  scope?: string
}

// ── 날짜 ───────────────────────────────────────────────
const p2 = (n: number) => String(n).padStart(2, '0')
export const ymdOf = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const daysBetween = (from: string, to: string) => Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000)
/** '9월 20일' — 올해가 아니면 '2025년 10월 25일' */
export function dayWord(ymd: string, now: Date) {
  const m = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8, 10))
  return Number(ymd.slice(0, 4)) === now.getFullYear() ? `${m}월 ${d}일` : `${ymd.slice(0, 4)}년 ${m}월 ${d}일`
}

/** 횟수 기간 말 → [from, to](포함, 주는 월요일 시작). 없으면 null */
export function periodOf(text: string, now: Date): { scope: string; from: string; to: string } | null {
  const t = text.replace(/\s+/g, '')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monday = addDays(today, 1 - (today.getDay() || 7))
  const month = (shift: number) => { const a = new Date(today.getFullYear(), today.getMonth() + shift, 1); const b = new Date(a.getFullYear(), a.getMonth() + 1, 0); return [ymdOf(a), ymdOf(b)] }
  const table: [RegExp, string, () => string[]][] = [
    [/오늘/, '오늘', () => [ymdOf(today), ymdOf(today)]],
    [/어제/, '어제', () => [ymdOf(addDays(today, -1)), ymdOf(addDays(today, -1))]],
    [/이번주/, '이번 주', () => [ymdOf(monday), ymdOf(addDays(monday, 6))]],
    [/(지난|저번)주/, '지난 주', () => [ymdOf(addDays(monday, -7)), ymdOf(addDays(monday, -1))]],
    [/이번달/, '이번 달', () => month(0)],
    [/(지난|저번)달/, '지난 달', () => month(-1)],
    [/올해|금년/, '올해', () => [`${today.getFullYear()}-01-01`, `${today.getFullYear()}-12-31`]],
    [/작년|지난해/, '작년', () => [`${today.getFullYear() - 1}-01-01`, `${today.getFullYear() - 1}-12-31`]]
  ]
  for (const [re, scope, range] of table) if (re.test(t)) { const [from, to] = range(); return { scope, from, to } }
  return null
}

// ── 말 → 물음 ───────────────────────────────────────────
const PAST = '[했갔봤왔였었았샀줬났켰췄웠렸졌셨됐]'
/** 마지막으로 한 날을 묻는다 */
const LAST_RE = new RegExp(`얼마나\\s*(지났|됐|되었|오래)|며칠\\s*(지났|됐|되었|째)|몇\\s*(일|달|개월|주|년)\\s*(지났|됐|되었|째)|(마지막|최근)(으로|에)?.*(언제|며칠|몇\\s*일)|언제\\s*(였|이었|마지막)|언제\\s*\\S*${PAST}`)
/** 몇 번 했는지 묻는다 */
const COUNT_RE = /몇\s*(번|회)/
const WRITE_RE = /(등록|추가|잡아|만들어|넣어|예약해)\s*(해|해\s*줘|줘|주세요|줄래)?/
const FUTURE_RE = /(해야|할까|하자|할래|갈까|가자|갈래|할\s*거|갈\s*거)/

/** 받침 ㄴ으로 끝나는 말(간·한·본·다녀온) — 뒤에 '지·게·건·거'가 오면 지난 일을 꾸미는 동사 */
const nieun = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 === 4 }
/** '갔지' → '간'(지난 동사를 꾸밈 꼴로). 모르면 '' */
const PAST_TO_REL: [RegExp, string][] = [[/다녀왔$/, '다녀온'], [/갔$/, '간'], [/했$/, '한'], [/봤$/, '본'], [/왔$/, '온'], [/샀$/, '산'], [/먹었$/, '먹은'], [/만났$/, '만난'], [/받았$/, '받은'], [/잘랐$/, '자른'], [/탔$/, '탄']]
/** '간' → '갔어'(횟수 답 끝말) */
const REL_TO_PAST: [RegExp, string][] = [[/다녀온$/, '다녀왔어'], [/간$/, '갔어'], [/한$/, '했어'], [/본$/, '봤어'], [/온$/, '왔어'], [/산$/, '샀어'], [/먹은$/, '먹었어'], [/만난$/, '만났어'], [/받은$/, '받았어'], [/자른$/, '잘랐어'], [/탄$/, '탔어']]
const STOP = new Set(['내가', '나', '난', '내', '제가', '저', '우리', '그', '그거', '혹시', '대체', '도대체', '좀', '한번', '지', '게', '건', '거', '걸', '것', '거야', '건가', '기록', '지금까지', '여태', '여태까지', '그동안', '요즘', '정도', '쯤', '번', '회', '동안', '이번', '지난', '저번', '올해', '작년', '금년', '오늘', '어제', '달', '주', '이번달', '지난달', '저번달', '이번주', '지난주', '저번주', '다', '했어', '했지', '했나', '했더라', '해', '거지', '건지', '이야', '야', '돼', '됐어', '됐지'])
const SKIP_RE = /몇|얼마|며칠|언제|마지막|최근/
/** 끝 조사: 맞추기용(전부 뗌) · 한 줄용(을/를/은/는/이/가만 뗌) */
const JOSA_ALL = /(에서|에게|한테|께서|이랑|하고|까지|부터|으로|을|를|은|는|이|가|에|께|랑|도|의|로|만)$/
const JOSA_SUBJ = /(을|를|은|는|이|가)$/
const strip = (w: string, re: RegExp) => { const s = w.replace(re, ''); return s.length >= 2 || (s.length === 1 && w.length - s.length >= 2) ? s : w }

/** 13 §3.1: 앞에서 정한 규칙으로 '기록 묻기'인지 본다(모델보다 먼저). 찾을 말이 없으면 null(모델에 맡긴다) */
export function recallAsk(text: string, now: Date): RecallAsk | null {
  const t = text.trim()
  if (WRITE_RE.test(t) && /(등록|추가|잡아|넣어|예약해)/.test(t)) return null
  const last = LAST_RE.test(t)
  const count = !last && COUNT_RE.test(t) && !FUTURE_RE.test(t)
  if (!last && !count) return null
  const tokens = t.replace(/[?？!.,~…"'“”]/g, ' ').split(/\s+/).filter(Boolean)
  const nouns: { match: string; show: string }[] = []
  let rel = '' // 꾸밈 동사(간 · 운동한)
  let relNoun = '' // '운동한' → '운동'
  let past = ''
  const pastVerb = new RegExp(`^(.*${PAST})(지|어|나|니|냐|더라|는지|어요|지요|던가|었나)?$`)
  const elapsed = /(지났|됐|되었)/
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const next = tokens[i + 1] ?? ''
    if (STOP.has(tok) || SKIP_RE.test(tok)) { if (!past && !SKIP_RE.test(tok) && !elapsed.test(tok) && pastVerb.test(tok)) past = tok; continue }
    // 꾸밈 동사: '간지' · '한게' · '간 게' · '운동한 지'
    const glued = /^(.+?)(지|게|건|거|걸)$/.exec(tok)
    const verbRel = glued && nieun(glued[1]) ? glued[1] : nieun(tok) && /^(지|게|건|거|걸|것|적)/.test(next) ? tok : ''
    if (verbRel) {
      rel = verbRel
      const m = /^(.{2,})(한|된)$/.exec(verbRel) // '운동한' = 명사 + 한 → 찾을 말 '운동'
      if (m) relNoun = m[1]
      continue
    }
    if (elapsed.test(tok)) continue
    // 지난 동사(갔지 · 했어 · 다녀왔더라) — 찾을 말이 아니다
    const verb = pastVerb.exec(tok)
    if (verb) { if (!past) past = tok; if (!rel) rel = PAST_TO_REL.find(([re]) => re.test(verb[1]))?.[1] ?? ''; continue }
    if (STOP.has(tok.replace(JOSA_ALL, ''))) continue
    const match = strip(tok, JOSA_ALL)
    if (!match || STOP.has(match)) continue
    nouns.push({ match, show: strip(tok, JOSA_SUBJ) })
  }
  const words = [...nouns.map((n) => n.match), ...(relNoun ? [relNoun] : [])].filter((w, i, a) => a.indexOf(w) === i)
  if (!words.length) return null
  const show = nouns.map((n) => n.show).join(' ')
  const phrase = rel ? (relNoun && !show ? rel : `${show} ${rel}`.trim()) : show || words.join(' ')
  const pastWord = past.replace(/(지|나|니|냐|더라|는지|어요|지요|던가)$/, '')
  const pastEnd = pastWord ? (/어$/.test(pastWord) ? pastWord : `${pastWord}어`) : (REL_TO_PAST.find(([re]) => re.test(rel))?.[1] ?? '했어')
  const ask: RecallAsk = { mode: last ? 'last' : 'count', words, phrase, verb: !!rel, past: pastEnd }
  if (!last) { const p = periodOf(t, now); if (p) Object.assign(ask, p) }
  return ask
}

/** 모델 지시문에 붙이는 규칙(앞 규칙이 놓친 말을 모델이 잡으면 message에 표시 → 앱이 같은 답을 만든다) */
export const RECALL_RULE = `If the user asks when they last did something or how long it has been (e.g. "미용실 간 지 얼마나 지났지", "마지막으로 치과 간 게 언제야", "운동한 지 며칠 됐지"), return action "query", status "completed", keyword = only the thing (e.g. "미용실"), message "recall:last". If the user asks how many times they did something (e.g. "이번 달 운동 몇 번 했지"), return action "query", status "completed", keyword = only the thing, from/to = the period if any, message "recall:count". Never treat a future plan as done.`

/** 모델이 recall:last·recall:count로 답했을 때 물음을 만든다(찾을 말 = keyword) */
export function recallFromModel(intent: { message: string; keyword: string; from: string; to: string }, text: string, now: Date): RecallAsk | null {
  const m = /^recall:(last|count)$/.exec(intent.message.trim())
  const keyword = intent.keyword.trim()
  if (!m || !keyword) return null
  const ask: RecallAsk = { mode: m[1] as RecallMode, words: keyword.split(/\s+/).map((w) => strip(w, JOSA_ALL)).filter(Boolean), phrase: keyword, verb: false, past: '했어' }
  if (ask.mode === 'count') {
    const p = periodOf(text, now)
    if (p) Object.assign(ask, p)
    else if (intent.from && intent.to) Object.assign(ask, { from: intent.from, to: intent.to, scope: `${dayWord(intent.from, now)}부터 ${dayWord(intent.to, now)}까지` })
  }
  return ask
}

// ── 행 → 답 ─────────────────────────────────────────────
/** 찾을 행(할 일 · 꿈틀 일정 · 연결된 캘린더 일정). open = 누르면 열 키('ev:<id>' 일정, 'day:<날짜>' 그날 캘린더) */
export type RecallRow = {
  id: string
  title: string
  source: 'task' | 'event' | 'external'
  /** 할 일만: 0 남음 · 1 완료 · 2 취소 */
  status?: number
  completed_at?: string | null
  start_at?: string | null
  due_at?: string | null
  open?: string
}
export type RecallHit = { id: string; title: string; source: RecallRow['source']; date: string; open: string }
export type RecallResult = { mode: RecallMode; phrase: string; last?: RecallHit; next?: RecallHit; days?: number; count?: number; hits?: RecallHit[]; scope?: string }

/** '다음에 미용실 갈 때 …' 같은 앞으로의 메모 — 다녀온 기록이 아니다 */
export const PLAN_RE = /(다음에|다음번|나중에|언젠가|담에|(갈|할|올|볼|살|탈|만날|먹을)\s*때|가면\s|하면\s|가기\s*전|하기\s*전|가서\s*(물어|말|얘기|부탁))/
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
/** 완료 시각(UTC ISO)은 이 기기 날짜로 */
const localDay = (iso: string) => { if (!iso.includes('T') || !/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) return iso.slice(0, 10); const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : ymdOf(d) }

/** 행 하나가 언제 '한 일'인지(past) · 언제 '할 일'인지(future). 둘 다 아니면 null */
export function occurrenceOf(r: RecallRow, now: Date): { when: 'past' | 'future'; date: string } | null {
  const today = ymdOf(now)
  if (r.source === 'task') {
    if (r.status === 2) return null
    const planned = r.due_at || r.start_at
    if (r.status === 1) { const date = r.completed_at ? localDay(r.completed_at) : planned?.slice(0, 10); return date && date <= today ? { when: 'past', date } : null }
    return planned && planned.slice(0, 10) >= today ? { when: 'future', date: planned.slice(0, 10) } : null
  }
  const start = r.start_at
  if (!start) return null
  const date = start.slice(0, 10)
  if (date < today) return { when: 'past', date }
  if (date > today) return { when: 'future', date }
  // 오늘 일정: 시작 시각이 지났으면 한 일
  if (start.includes('T')) return new Date(start.length === 16 ? `${start}:00` : start).getTime() <= now.getTime() ? { when: 'past', date } : { when: 'future', date }
  return { when: 'future', date }
}

/** 찾을 말이 제목에 모두 들어 있는 행(계획 메모 뺌). 같은 날 같은 제목은 하나로(꿈틀 일정이 연결된 캘린더에도 있을 때) */
export function recallMatches(ask: RecallAsk, rows: RecallRow[]) {
  const words = ask.words.map(norm).filter(Boolean)
  const seen = new Set<string>()
  return rows.filter((r) => {
    const title = norm(r.title ?? '')
    if (!words.length || !words.every((w) => title.includes(w)) || PLAN_RE.test(r.title ?? '')) return false
    const key = `${title}|${(r.start_at || r.due_at || r.completed_at || '').slice(0, 10)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const hitOf = (r: RecallRow, date: string): RecallHit => ({ id: r.id, title: r.title, source: r.source, date, open: r.open ?? r.id })

export function recallResult(ask: RecallAsk, rows: RecallRow[], now: Date): RecallResult {
  const found = recallMatches(ask, rows).map((r) => ({ r, o: occurrenceOf(r, now) })).filter((x): x is { r: RecallRow; o: { when: 'past' | 'future'; date: string } } => !!x.o)
  const past = found.filter((x) => x.o.when === 'past').sort((a, b) => (a.o.date < b.o.date ? 1 : a.o.date > b.o.date ? -1 : (b.r.completed_at ?? b.r.start_at ?? '').localeCompare(a.r.completed_at ?? a.r.start_at ?? '')))
  const future = found.filter((x) => x.o.when === 'future').sort((a, b) => (a.o.date < b.o.date ? -1 : a.o.date > b.o.date ? 1 : 0))
  const next = future[0] ? hitOf(future[0].r, future[0].o.date) : undefined
  if (ask.mode === 'count') {
    const inRange = past.filter((x) => (!ask.from || x.o.date >= ask.from) && (!ask.to || x.o.date <= ask.to))
    return { mode: 'count', phrase: ask.phrase, count: inRange.length, hits: inRange.map((x) => hitOf(x.r, x.o.date)), scope: ask.scope, ...(next ? { next } : {}) }
  }
  const top = past[0]
  if (!top) return { mode: 'last', phrase: ask.phrase, ...(next ? { next } : {}) }
  return { mode: 'last', phrase: ask.phrase, last: hitOf(top.r, top.o.date), days: daysBetween(top.o.date, ymdOf(now)), ...(next ? { next } : {}) }
}

const ya = (w: string) => `${w}${iGa(w).endsWith('이') ? '이야' : '야'}`
/** 지난 날 수 → '19일 지났어.' · '하루 지났어.' · '두 달 넘게'는 '3달 넘게 지났어.' */
export function agoLine(days: number) {
  if (days <= 0) return ''
  if (days === 1) return '하루 지났어.'
  if (days < 60) return `${days}일 지났어.`
  if (days < 365) return `${Math.floor(days / 30)}달 넘게 지났어.`
  return `${Math.floor(days / 365)}년 넘게 지났어.`
}
/** 다녀오는 곳 동사(간 · 갔)는 '다녀온'으로 */
const visitVerb = (ask: RecallAsk) => /(^|\s)(간|온|다녀온)$/.test(ask.phrase)

/** 캐릭터 한 줄(40 §3.2 — 앱이 고른다) */
export function recallLine(ask: RecallAsk, r: RecallResult, now: Date): string {
  const nextWord = r.next ? ` 다음 예정은 ${ya(dayWord(r.next.date, now))}.` : ''
  if (r.mode === 'count') {
    const scope = r.scope ?? '지금까지'
    const thing = ask.verb ? ask.phrase.replace(/\s*\S+$/, '') || ask.words.join(' ') : ask.phrase
    if (!r.count) return `${scope === '지금까지' ? '기록에서' : eunNeun(scope)} ${thing} 기록을 못 찾았어.`
    return `${scope} ${thing} ${r.count}번 ${ask.past}.`
  }
  if (!r.last) {
    const what = ask.verb ? (visitVerb(ask) ? `${ask.phrase.replace(/\s*\S+$/, '')} 다녀온 걸` : `${ask.phrase} 걸`) : eulReul(ask.phrase)
    return `기록에서 ${what} 못 찾았어.${nextWord}`
  }
  const days = r.days ?? 0
  const when = days === 0 ? '오늘' : days === 1 ? '어제' : dayWord(r.last.date, now)
  const head = ask.verb ? `마지막으로 ${ask.phrase} 건 ${ya(when)}.` : `마지막 ${eunNeun(ask.phrase)} ${ya(when)}.`
  const ago = agoLine(days)
  return `${head}${ago ? ' ' + ago : ''}`
}

// ── 찾기 SQL(앱이 만든다 — 모델은 SQL을 만들지 않는다) ─────
/** 찾을 말 중 하나라도 제목에 있는 행. 정확한 거르기(모두 포함·계획 메모)는 recallMatches */
export function recallSql(ask: RecallAsk): { tasks: { sql: string; args: string[] }; events: { sql: string; args: string[] } } {
  const words = ask.words.length ? ask.words : ['']
  const cond = words.map(() => 'instr(lower(title), lower(?)) > 0').join(' OR ')
  return {
    tasks: { sql: `SELECT id, title, status, completed_at, start_at, due_at FROM tasks WHERE deleted_at IS NULL AND status <> 2 AND (${cond}) LIMIT 500`, args: words },
    events: { sql: `SELECT id, title, start_at, end_at FROM events WHERE deleted_at IS NULL AND start_at IS NOT NULL AND (${cond}) LIMIT 500`, args: words }
  }
}
/** 연결된 캘린더를 읽을 기간: 400일 전 ~ 1년 뒤 */
export function externalRange(now: Date) { return { from: ymdOf(addDays(now, -400)), to: ymdOf(addDays(now, 365)) } }
