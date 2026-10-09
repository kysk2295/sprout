// 한국 공휴일 · 한국 음력 · 주 번호 — 06 §16 / 20 §7.2 (틱틱 "휴일 표시"·"추가 달력"·"주 번호 표시", research 17 §15).
// 앱(데스크톱 렌더러·모바일)이 함께 쓴다. 네트워크 없이 동작한다(데이터를 이 파일에 묶어 둔다).
//
// 근거(출처는 research 17 §15.4에 링크):
// - 공휴일 종류·대체공휴일 규칙: 「공휴일에 관한 법률」(2021 제정, 2026-01-29 제헌절·2026-03-31 노동절 개정) +
//   「관공서의 공휴일에 관한 규정」 제2조·제3조. 1월 1일·현충일·선거일·임시공휴일은 대체공휴일이 없다.
//   설날·추석 연휴는 "일요일 또는 다른 공휴일"과 겹칠 때만(토요일은 아님), 나머지는 토·일·다른 공휴일과 겹칠 때.
// - 음력 날짜(설날·부처님오신날·추석): 한국천문연구원(우주항공청) 월력요항 기준. 아래 LUNAR_MONTHS 표는
//   ICU 'dangi'(한국 음력, UTC+9) 달력으로 만들었고, 테스트가 월력요항에 발표된 날짜와 맞춰 본다.
// - 선거일: 공직선거법 제34조(임기만료 선거일 계산 · 앞뒤 날이 공휴일이면 다음 주 수요일). 2024·2025·2026은 확정,
//   2028·2030은 법으로 계산한 예정일(tentative) — 월력요항이 나오면 확인한다.
// - 임시공휴일: 국무회의 의결된 것만(2024-10-01 국군의 날, 2025-01-27).

import { addDays, toDate } from './time.ts'
import { mondayOfRow, type WeekStart } from './weekStart.ts'

export type HolidayKind = 'holiday' | 'substitute' | 'election' | 'temporary'
export interface Holiday {
  date: string // YYYY-MM-DD
  name: string
  kind: HolidayKind
  /** 법으로 계산한 예정일(아직 공고 전) */
  tentative?: boolean
}

/** 데이터가 있는 해(이 밖의 해는 공휴일을 그리지 않는다) */
export const HOLIDAY_YEARS = { from: 2024, to: 2030 } as const

// ── 한국 음력 ──
/** 음력 달 첫날(양력) · 달(음수 = 윤달). 2023-12 ~ 2031-02, ICU dangi로 만든 표 */
const LUNAR_MONTHS: [string, number][] = [
  ['2023-12-13', 11], ['2024-01-11', 12], ['2024-02-10', 1], ['2024-03-10', 2], ['2024-04-09', 3], ['2024-05-08', 4], ['2024-06-06', 5], ['2024-07-06', 6], ['2024-08-04', 7], ['2024-09-03', 8], ['2024-10-03', 9], ['2024-11-01', 10], ['2024-12-01', 11], ['2024-12-31', 12],
  ['2025-01-29', 1], ['2025-02-28', 2], ['2025-03-29', 3], ['2025-04-28', 4], ['2025-05-27', 5], ['2025-06-25', 6], ['2025-07-25', -6], ['2025-08-23', 7], ['2025-09-22', 8], ['2025-10-21', 9], ['2025-11-20', 10], ['2025-12-20', 11], ['2026-01-19', 12],
  ['2026-02-17', 1], ['2026-03-19', 2], ['2026-04-17', 3], ['2026-05-17', 4], ['2026-06-15', 5], ['2026-07-14', 6], ['2026-08-13', 7], ['2026-09-11', 8], ['2026-10-11', 9], ['2026-11-09', 10], ['2026-12-09', 11], ['2027-01-08', 12],
  ['2027-02-07', 1], ['2027-03-08', 2], ['2027-04-07', 3], ['2027-05-06', 4], ['2027-06-05', 5], ['2027-07-04', 6], ['2027-08-02', 7], ['2027-09-01', 8], ['2027-09-30', 9], ['2027-10-29', 10], ['2027-11-28', 11], ['2027-12-28', 12],
  ['2028-01-27', 1], ['2028-02-25', 2], ['2028-03-26', 3], ['2028-04-25', 4], ['2028-05-24', 5], ['2028-06-23', -5], ['2028-07-22', 6], ['2028-08-20', 7], ['2028-09-19', 8], ['2028-10-18', 9], ['2028-11-16', 10], ['2028-12-16', 11], ['2029-01-15', 12],
  ['2029-02-13', 1], ['2029-03-15', 2], ['2029-04-14', 3], ['2029-05-13', 4], ['2029-06-12', 5], ['2029-07-12', 6], ['2029-08-10', 7], ['2029-09-08', 8], ['2029-10-08', 9], ['2029-11-06', 10], ['2029-12-05', 11], ['2030-01-04', 12],
  ['2030-02-03', 1], ['2030-03-04', 2], ['2030-04-03', 3], ['2030-05-02', 4], ['2030-06-01', 5], ['2030-07-01', 6], ['2030-07-30', 7], ['2030-08-29', 8], ['2030-09-27', 9], ['2030-10-27', 10], ['2030-11-25', 11], ['2030-12-25', 12],
  ['2031-01-23', 1], ['2031-02-22', 2]
]
const LUNAR_END = '2031-03-23' // 표 마지막 달의 끝(다음 달 첫날 전까지만 믿는다)

export interface LunarDate { month: number; day: number; leap: boolean }
/** 양력 → 한국 음력. 표 밖이면 null */
export function lunarOf(date: string): LunarDate | null {
  if (date < LUNAR_MONTHS[0][0] || date >= LUNAR_END) return null
  let i = LUNAR_MONTHS.length - 1
  while (i > 0 && LUNAR_MONTHS[i][0] > date) i--
  const [start, m] = LUNAR_MONTHS[i]
  const day = diff(start, date) + 1
  if (day > 30) return null
  return { month: Math.abs(m), day, leap: m < 0 }
}
/** 칸에 쓰는 음력 표기: 초하루는 `윤6.1`·`9.1`, 나머지는 `8.15` [제안 — 틱틱 한국 음력 표기 미확인, research 17 §15.3] */
export function lunarLabel(date: string): string | null {
  const l = lunarOf(date)
  return l ? `${l.leap ? '윤' : ''}${l.month}.${l.day}` : null
}
/** 그해(양력 year)에 있는 음력 달·날의 양력 날짜(윤달 아님). 표 범위 밖이면 null — 43 계절 옷(설·추석)도 쓴다 */
export function solarOfLunar(year: number, month: number, day: number): string | null {
  for (const [start, m] of LUNAR_MONTHS) {
    if (m !== month) continue
    const d = addDays(start, day - 1)
    if (Number(d.slice(0, 4)) === year) return d
  }
  return null
}

// ── 공휴일 ──
const diff = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
const dow = (d: string) => toDate(d).getDay() // 0 = 일

type Base = { date: string; name: string; kind: 'holiday' | 'election' | 'temporary'; sub: 'none' | 'any' | 'lunar'; group?: string; tentative?: boolean }

/** 선거일(공직선거법) — 확정 + 법정 계산 예정일 */
const ELECTIONS: Base[] = [
  { date: '2024-04-10', name: '국회의원 선거', kind: 'election', sub: 'none' },
  { date: '2025-06-03', name: '대통령 선거', kind: 'election', sub: 'none' },
  { date: '2026-06-03', name: '지방선거', kind: 'election', sub: 'none' },
  // 제22대 국회 임기만료(2028-05-29) 전 50일 이후 첫 수요일
  { date: '2028-04-12', name: '국회의원 선거', kind: 'election', sub: 'none', tentative: true },
  // 제21대 대통령 임기만료(2030-06-03) 전 70일 이후 첫 수요일
  { date: '2030-03-27', name: '대통령 선거', kind: 'election', sub: 'none', tentative: true },
  // 지방 임기만료(2030-06-30) 전 30일 이후 첫 수요일 = 6/5, 다음 날이 현충일이라 다음 주 수요일
  { date: '2030-06-12', name: '지방선거', kind: 'election', sub: 'none', tentative: true }
]
/** 임시공휴일(국무회의 의결) */
const TEMPORARY: Base[] = [
  { date: '2024-10-01', name: '임시공휴일', kind: 'temporary', sub: 'none' }, // 국군의 날
  { date: '2025-01-27', name: '임시공휴일', kind: 'temporary', sub: 'none' }
]

function baseOf(year: number): Base[] {
  const y = String(year)
  const fixed = (md: string, name: string, sub: Base['sub'] = 'any'): Base => ({ date: `${y}-${md}`, name, kind: 'holiday', sub })
  const out: Base[] = [
    fixed('01-01', '신정', 'none'),
    fixed('03-01', '3·1절'),
    fixed('05-05', '어린이날'),
    fixed('06-06', '현충일', 'none'),
    fixed('08-15', '광복절'),
    fixed('10-03', '개천절'),
    fixed('10-09', '한글날'),
    fixed('12-25', '성탄절')
  ]
  if (year >= 2026) out.push(fixed('05-01', '노동절'), fixed('07-17', '제헌절'))
  const seol = solarOfLunar(year, 1, 1)
  if (seol) for (const n of [-1, 0, 1]) out.push({ date: addDays(seol, n), name: '설날', kind: 'holiday', sub: 'lunar', group: 'seol' })
  const buddha = solarOfLunar(year, 4, 8)
  if (buddha) out.push({ date: buddha, name: '부처님오신날', kind: 'holiday', sub: 'any' })
  const chuseok = solarOfLunar(year, 8, 15)
  if (chuseok) for (const n of [-1, 0, 1]) out.push({ date: addDays(chuseok, n), name: '추석', kind: 'holiday', sub: 'lunar', group: 'chuseok' })
  out.push(...ELECTIONS.filter((e) => e.date.startsWith(y)), ...TEMPORARY.filter((e) => e.date.startsWith(y)))
  return out
}

const cache = new Map<number, Holiday[]>()
/** 그해 공휴일 전부(대체공휴일 포함, 날짜순). 같은 날 두 공휴일이면 둘 다 들어 있다 */
export function holidaysOfYear(year: number): Holiday[] {
  if (year < HOLIDAY_YEARS.from || year > HOLIDAY_YEARS.to) return []
  const hit = cache.get(year)
  if (hit) return hit
  // 연말 대체공휴일이 다음 해로 넘어갈 수 있어 전후 해의 기본 공휴일도 막는 날로 본다
  const base = baseOf(year)
  const blocked = new Set([...base, ...(year > HOLIDAY_YEARS.from ? baseOf(year - 1) : []), ...(year < HOLIDAY_YEARS.to ? baseOf(year + 1) : [])].map((b) => b.date))
  const byDate = new Map<string, Base[]>()
  for (const b of base) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b])
  const subs: Holiday[] = []
  const taken = new Set<string>()
  const nextFree = (after: string) => {
    let d = addDays(after, 1)
    while (dow(d) === 0 || dow(d) === 6 || blocked.has(d) || taken.has(d)) d = addDays(d, 1)
    taken.add(d)
    return d
  }
  // 날마다 몇 개의 대체공휴일이 필요한지 센다(관공서 규정 제3조)
  const need: { after: string; n: number }[] = []
  for (const [date, hs] of [...byDate].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const eligible = hs.filter((h) => h.sub !== 'none')
    if (!eligible.length) continue
    const others = hs.length - 1 // 같은 날 겹친 공휴일 수
    const w = dow(date)
    let n: number
    if (w === 0) n = eligible.length
    else if (w === 6) n = eligible.some((h) => h.sub === 'any') ? eligible.length : Math.min(eligible.length, others)
    else n = Math.min(eligible.length, others)
    if (!n) continue
    // 설날·추석은 연휴 마지막 날 다음부터 찾는다
    const g = eligible.find((h) => h.group)?.group
    const after = g ? base.filter((b) => b.group === g).map((b) => b.date).sort().at(-1)! : date
    need.push({ after, n })
  }
  for (const { after, n } of need) for (let i = 0; i < n; i++) subs.push({ date: nextFree(after), name: '대체공휴일', kind: 'substitute' })
  const all: Holiday[] = [
    ...base.map(({ date, name, kind, tentative }) => (tentative ? { date, name, kind, tentative } : { date, name, kind })),
    ...subs.filter((s) => s.date.startsWith(String(year)))
  ]
  // 앞 해 연말의 대체공휴일이 이 해로 넘어온 경우
  if (year > HOLIDAY_YEARS.from) for (const s of holidaysOfYear(year - 1).filter((h) => h.kind === 'substitute' && h.date.startsWith(String(year)))) all.push(s)
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  cache.set(year, all)
  return all
}

/** 그날 공휴일(겹치면 여러 개). 없으면 빈 배열 */
export function holidaysOn(date: string): Holiday[] {
  return holidaysOfYear(Number(date.slice(0, 4))).filter((h) => h.date === date)
}
/** 칸에 쓸 이름(겹치면 `어린이날·부처님오신날`). 공휴일이 아니면 null */
export function holidayLabel(date: string): string | null {
  const hs = holidaysOn(date)
  return hs.length ? [...new Set(hs.map((h) => h.name))].join('·') : null
}
/** 범위 안 공휴일 지도(date → 이름). 화면이 한 번에 받아 쓴다 */
export function holidayMap(from: string, to: string): Map<string, string> {
  const m = new Map<string, string>()
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysOfYear(y)) {
      if (h.date < from || h.date > to) continue
      const prev = m.get(h.date)
      m.set(h.date, prev && !prev.split('·').includes(h.name) ? `${prev}·${h.name}` : prev ?? h.name)
    }
  }
  return m
}

// ── 주 번호(ISO 8601 — 월요일 시작, 1월 4일이 든 주가 W1) ──
export function isoWeek(date: string): number {
  const d = toDate(date)
  const day = (d.getDay() + 6) % 7 // 월 = 0
  d.setDate(d.getDate() - day + 3) // 그 주 목요일
  const jan4 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}
/** 틱틱 표기 `W41`(research 24 §월 보기 실측). 캘린더 줄은 주 시작 설정(weekStart.ts)을 따르므로 그 줄 안 월요일의 ISO 주로 센다(일요일 시작 → 일요일은 다음 날 주) */
export const weekLabel = (date: string, ws: WeekStart = 0) => `W${isoWeek(mondayOfRow(date, ws))}`

// ── 날짜 칸 오른쪽 글자 한 자리(틱틱/디다 실측: 공휴일·절기 이름 > 주 번호 > 음력 — research 17 §15.2) ──
export interface DayMarks { holiday: string | null; side: string | null; sideKind: 'holiday' | 'week' | 'lunar' | null }
export interface MarkPrefs { holidays: boolean; lunar: boolean; weekNumbers: boolean; /** 주 번호를 셀 줄의 주 시작(없으면 일요일) */ weekStart?: WeekStart }
/** firstOfRow = 그 줄(주)의 첫 칸이면 주 번호를 쓴다 */
export function dayMarks(date: string, prefs: MarkPrefs, firstOfRow: boolean, holidays?: Map<string, string>): DayMarks {
  const holiday = prefs.holidays ? (holidays ? holidays.get(date) ?? null : holidayLabel(date)) : null
  if (holiday) return { holiday, side: holiday, sideKind: 'holiday' }
  if (prefs.weekNumbers && firstOfRow) return { holiday, side: weekLabel(date, prefs.weekStart ?? 0), sideKind: 'week' }
  const l = prefs.lunar ? lunarLabel(date) : null
  return { holiday, side: l, sideKind: l ? 'lunar' : null }
}
