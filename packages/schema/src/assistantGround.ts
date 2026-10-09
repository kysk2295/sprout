// 47 §8.2 근거 검사 + §7 후처리 — 답이 다 온 뒤(스트림 중엔 그대로 보이고 끝에 바뀔 수 있음). 모델이 쓴 문장이 도구 결과·사용자 말·날짜표에 없는
// 날짜·제목·숫자를 말하면 그 문장을 뺀다. 저장 말(넣었어…)인데 저장 없음 → '이렇게 넣을까?'. 별칭 id·한자 걷기. research 39 F4·F5·F7·F9가 근거.
import { dayGap, plusDays, weekdayOf, ymd } from './assistantTools.ts'
import type { AliasMap, Facts } from './assistantExec.ts'

export type GroundInput = {
  text: string
  /** 이 턴 도구 결과 사실(+ 앞 턴 이어 받을 것) */
  facts: Facts
  /** 사용자 말(이 턴) — 사용자가 말한 날짜·숫자·낱말은 허용 */
  user: string
  now: Date
  aliases: AliasMap
  /** 이 턴에 도구를 하나라도 불렀다 */
  usedTools: boolean
  /** 실제로 저장했다(이 턴에는 늘 false — 저장은 카드 넣기에서) */
  saved?: boolean
  /** 카드가 있다(다 빠지면 '찾은 건 카드에 있어.') */
  hasCards?: boolean
}
export type GroundResult = { text: string; hits: number; reasons: string[]; priceBlocked: boolean }

/** 마크다운·이모지 걷기(§7 후처리) */
export function tidyAnswer(s: string): string {
  return s
    .replace(/\*\*|__|`{1,3}/g, '')
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B50}\u{2B55}\u{2190}-\u{21FF}\u{2700}-\u{27BF}]/gu, '')
    // qwen이 토큰마다 띄우는 숫자 단위('8 월 31 일 (월) 에')를 붙인다
    .replace(/(\d)\s+(시간|월|일|시|분|번|회|개|명|년|주|살|레벨|XP)/g, '$1$2').replace(/(\d[월일])\s+\((\S)\)/g, '$1($2)').replace(/\)\s+(에|은|는|이|가|을|를|도|까지|부터|이야|야)(?=[\s,.!?]|$)/g, ')$1')
    // 높임 '-셨-'이 반말 사이에 새는 것(research 39 F6 · 실측 '가셨네')
    .replace(/(가|하|오|보|사|주|다녀오|끝내|자)셨/g, (_m, v: string) => ({ 가: '갔', 하: '했', 오: '왔', 보: '봤', 사: '샀', 주: '줬', 다녀오: '다녀왔', 끝내: '끝냈', 자: '잤' } as Record<string, string>)[v])
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 문장 나누기(마침표·물음표·느낌표·줄바꿈 뒤) */
export const sentences = (s: string) => s.split(/(?<=[.!?。…~])\s+|\n+/).map((x) => x.trim()).filter(Boolean)

const WD = '[일월화수목금토]'
const SAVE_RE = /(넣었어|넣어\s*뒀어|넣어놨어|저장했어|등록했어|추가했어|잡았어|잡아\s*뒀어|만들었어|완료했어|완료\s*처리했어|지웠어|삭제했어|옮겼어|미뤘어)/
const HAN = /[一-鿿㐀-䶿]+/g
const PRICE = /(\d[\d,.]*\s*(만\s*)?(원|달러|엔|위안|불)|\$\s*\d|\d[\d,.]*\s*(USD|KRW|BTC))/i
/** 날짜·제목·숫자를 검사하는 단위 — 이 뒤에 오는 숫자만 데이터 숫자로 본다(공부 계획의 '2시간' 같은 일반 말은 그대로) */
const COUNT_RE = /(\d+)\s*(개|번째|번|회|건|일\s*(?:지났|째|전|됐|남|동안|만에)|레벨|레벨이|XP|점|명|%)/g
const LV_RE = /(?:레벨|Lv\.?)\s*(\d+)/gi

/** '10월 11일' · '10/11' · '10-11' + 요일 → [YYYY-MM-DD, 말한 요일?] */
function datesIn(s: string, now: Date): { day: string; wd?: string; rel?: string }[] {
  const outs: { day: string; wd?: string; rel?: string }[] = []
  const y = now.getFullYear()
  const mk = (m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const re = new RegExp(`(오늘|내일|모레|어제)?\\s*\\(?\\s*(\\d{1,2})\\s*(?:월\\s*(\\d{1,2})\\s*일|/(\\d{1,2}))\\s*\\)?\\s*(?:\\(?(${WD})\\)?(?:요일)?)?`, 'g')
  for (const m of s.matchAll(re)) {
    const mo = Number(m[2]), d = Number(m[3] ?? m[4])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue
    outs.push({ day: mk(mo, d), ...(m[5] ? { wd: m[5] } : {}), ...(m[1] ? { rel: m[1] } : {}) })
  }
  return outs
}
const REL_GAP: Record<string, number> = { 어제: -1, 오늘: 0, 내일: 1, 모레: 2 }
/** '다음 주 일요일' · '이번 주 금요일' · '지난주 수요일' → 실제 날짜 */
function weekdayPhrases(s: string, now: Date): string[] {
  const out: string[] = []
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 - (now.getDay() || 7))
  for (const m of s.matchAll(/(다음\s*주|이번\s*주|지난\s*주|저번\s*주)\s*([일월화수목금토])요일/g)) {
    const shift = /다음/.test(m[1]) ? 7 : /지난|저번/.test(m[1]) ? -7 : 0
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + shift + ((['일', '월', '화', '수', '목', '금', '토'].indexOf(m[2]) + 6) % 7))
    out.push(ymd(d))
  }
  return out
}

/** 편집 거리(짧은 제목용) */
function edit(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export function ground(i: GroundInput): GroundResult {
  const reasons: string[] = []
  let priceBlocked = false
  const today = ymd(i.now)
  const allowedDates = new Set([...i.facts.dates, today, plusDays(today, 1), plusDays(today, 2), plusDays(today, -1)])
  for (const d of datesIn(i.user, i.now)) allowedDates.add(d.day)
  const userNums = new Set([...i.user.matchAll(/\d+/g)].map((m) => Number(m[0])))
  const nums = new Set([...i.facts.numbers, ...userNums])
  const titles = [...i.facts.titles, ...Object.values(i.aliases).map((a) => a.title)].filter(Boolean)
  const titleSet = new Set(titles.map(norm))
  const userNorm = norm(i.user)
  // 별칭 id(t6) → 제목, 한자 낱말 빼기
  let text = tidyAnswer(i.text).replace(/\b([tenp]\d{1,3})\b/g, (m) => { const a = i.aliases[m]; if (a) { reasons.push('alias'); return `‘${a.title}’` } return m })
  if (HAN.test(text)) { reasons.push('han'); text = text.replace(HAN, '').replace(/\s{2,}/g, ' ') }
  const keep: string[] = []
  for (const raw of sentences(text)) {
    let s = raw
    let drop = false
    // 1. 날짜: 결과·사용자 말·오늘±2에 없음, 또는 요일·상대 말이 실제와 다름
    for (const d of datesIn(s, i.now)) {
      if (!allowedDates.has(d.day) && i.usedTools) { drop = true; reasons.push('date') }
      if (d.wd && weekdayOf(d.day) !== d.wd) { drop = true; reasons.push('weekday') }
      if (d.rel && dayGap(today, d.day) !== REL_GAP[d.rel]) { drop = true; reasons.push('relative') }
    }
    // 1b. '다음 주 일요일'처럼 상대 요일: 결과 날짜와 다르면(research 39 F4 — 이번 주 일요일을 다음 주라고 함)
    if (i.usedTools) for (const d of weekdayPhrases(s, i.now)) if (!allowedDates.has(d)) { drop = true; reasons.push('weekday-phrase') }
    // 2. 따옴표 제목: 결과 제목과 다르면 가장 가까운 제목(편집 거리 ≤ 3), 아니면 문장 빼기
    if (!drop && i.usedTools) {
      s = s.replace(/[‘'“"]([^’'”"]{2,60})[’'”"]/g, (m, inner: string) => {
        const n = norm(inner)
        const parts = inner.split(/\s+/).filter(Boolean).map(norm)
        if (titleSet.has(n) || userNorm.includes(n) || titles.some((t) => norm(t).includes(n) || parts.every((w) => norm(t).includes(w)))) return m
        let best = '', bestD = 99
        for (const t of titles) { const d = edit(n, norm(t)); if (d < bestD) { bestD = d; best = t } }
        if (best && bestD <= 3) { reasons.push('title-fixed'); return m[0] + best + m[m.length - 1] }
        drop = true; reasons.push('title')
        return m
      })
    }
    // 3. 숫자(개수·일수·횟수·레벨): 결과·사용자 말에 없음
    if (!drop && i.usedTools) {
      for (const m of [...s.matchAll(COUNT_RE), ...s.matchAll(LV_RE)]) if (!nums.has(Number(m[1]))) { drop = true; reasons.push('number') }
    }
    // 3b. 도구를 안 불렀는데 '찾아봤는데 없어'·'기록에 없네'(사용자 데이터를 본 척) → 빼기
    if (!drop && !i.usedTools && (claimsSearched(s) || /(할\s*일|메모|일정|기록)[^.!?]{0,12}(없|있)/.test(s))) { drop = true; reasons.push('unfounded') }
    // 3c. 찾은 게 있는데 '기록은 없어'라고 함
    if (!drop && i.usedTools && i.facts.titles.length && /(기록|할\s*일|일정)[은는이가]?\s*없/.test(s)) { drop = true; reasons.push('false-empty') }
    // 4. 가격 숫자(인터넷 없음 — §8.3): 결과에 없는 가격이면 빼고 띠
    if (!drop && PRICE.test(s) && !i.facts.numbers.some((n) => s.includes(String(n)))) { drop = true; priceBlocked = true; reasons.push('price') }
    // 5. 저장 말인데 저장 없음 → '이렇게 넣을까?'
    if (!drop && !i.saved && SAVE_RE.test(s) && !/(까\?|까|래\?|줄까)/.test(s)) { s = '이렇게 넣을까?'; reasons.push('save') }
    if (!drop) keep.push(s)
  }
  let out = [...new Set(keep)].join(' ').trim()
  if (!out) out = i.hasCards ? '찾은 건 카드에 있어.' : '음, 잘 모르겠어.'
  return { text: out, hits: reasons.filter((r) => r !== 'title-fixed').length, reasons, priceBlocked }
}

/** 도구를 안 불렀는데 '찾아봤는데 없어'처럼 말함(§8.2 — 다시 부르기 근거) */
export const claimsSearched = (s: string) => /(찾아\s*봤|찾아보니|확인해\s*봤|확인해보니|기록에\s*없|찾을\s*수\s*없|못\s*찾았)/.test(s)
/** 도구를 부르는 대신 '찾아볼까?'라고 되묻기(research 39 F3) */
export const offersToSearch = (s: string) => /(찾아\s*볼까|확인해\s*볼까|알려\s*줄까|조회해\s*볼까|볼까\?)/.test(s)
