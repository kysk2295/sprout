// 한국 공휴일·음력·주 번호 테스트(06 §16): npm test -w @sprout/schema
// 기대값 출처: 우주항공청·한국천문연구원 월력요항(2024~2027 발표), 공휴일법 개정(제헌절 2026-01-29, 노동절 2026-03-31) — research 17 §15.4
import * as H from './holidays.ts'
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
const subs = (y: number) => H.holidaysOfYear(y).filter((h) => h.kind === 'substitute').map((h) => h.date)
const dates = (y: number, name: string) => H.holidaysOfYear(y).filter((h) => h.name === name).map((h) => h.date)

// ── 음력 날짜(월력요항 설날·부처님오신날·추석) ──
eq('설날 2024', dates(2024, '설날'), ['2024-02-09', '2024-02-10', '2024-02-11'])
eq('설날 2025', dates(2025, '설날'), ['2025-01-28', '2025-01-29', '2025-01-30'])
eq('설날 2026', dates(2026, '설날'), ['2026-02-16', '2026-02-17', '2026-02-18'])
eq('설날 2027', dates(2027, '설날'), ['2027-02-06', '2027-02-07', '2027-02-08'])
eq('설날 2028(한국은 중국보다 하루 늦은 1/27)', dates(2028, '설날'), ['2028-01-26', '2028-01-27', '2028-01-28'])
eq('추석 2025', dates(2025, '추석'), ['2025-10-05', '2025-10-06', '2025-10-07'])
eq('추석 2026', dates(2026, '추석'), ['2026-09-24', '2026-09-25', '2026-09-26'])
eq('추석 2027', dates(2027, '추석'), ['2027-09-14', '2027-09-15', '2027-09-16'])
eq('부처님오신날 2024~2030', [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => dates(y, '부처님오신날')[0]), ['2024-05-15', '2025-05-05', '2026-05-24', '2027-05-13', '2028-05-02', '2029-05-20', '2030-05-09'])

// ── 대체공휴일(월력요항 · 관공서 규정 제3조) ──
eq('대체 2024', subs(2024), ['2024-02-12', '2024-05-06'])
eq('대체 2025', subs(2025), ['2025-03-03', '2025-05-06', '2025-10-08'])
eq('대체 2026', subs(2026), ['2026-03-02', '2026-05-25', '2026-08-17', '2026-10-05'])
eq('대체 2027(노동절·제헌절 포함)', subs(2027), ['2027-02-09', '2027-05-03', '2027-07-19', '2027-08-16', '2027-10-04', '2027-10-11', '2027-12-27'])
eq('대체 2028(추석·개천절 겹침)', subs(2028), ['2028-10-05'])
eq('대체 2029', subs(2029), ['2029-05-07', '2029-05-21', '2029-09-24'])
eq('대체 2030', subs(2030), ['2030-02-05', '2030-05-06'])

// ── 하루하루 ──
eq('2025-10-03 개천절', H.holidayLabel('2025-10-03'), '개천절')
eq('2025-10-05~08 추석+대체', ['2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08'].map(H.holidayLabel), ['추석', '추석', '추석', '대체공휴일'])
eq('2025-10-09 한글날', H.holidayLabel('2025-10-09'), '한글날')
eq('2025-05-05 겹침', H.holidayLabel('2025-05-05'), '어린이날·부처님오신날')
eq('2026-10-03 개천절(토)', H.holidayLabel('2026-10-03'), '개천절')
eq('2026-10-05 대체', H.holidayLabel('2026-10-05'), '대체공휴일')
eq('2026-06-06 현충일(토) 대체 없음', H.holidayLabel('2026-06-08'), null)
eq('2026-09-26 추석(토) 대체 없음', subs(2026).some((d) => d.startsWith('2026-09')), false)
eq('2026-06-03 지방선거', H.holidayLabel('2026-06-03'), '지방선거')
eq('2026-05-01 노동절', H.holidayLabel('2026-05-01'), '노동절')
eq('2026-07-17 제헌절', H.holidayLabel('2026-07-17'), '제헌절')
eq('2025-07-17 제헌절 아직 아님', H.holidayLabel('2025-07-17'), null)
eq('2025-05-01 노동절 아직 아님', H.holidayLabel('2025-05-01'), null)
eq('2025-06-03 대통령 선거', H.holidayLabel('2025-06-03'), '대통령 선거')
eq('2025-01-27 임시공휴일', H.holidayLabel('2025-01-27'), '임시공휴일')
eq('2024-10-01 임시공휴일', H.holidayLabel('2024-10-01'), '임시공휴일')
eq('2024-04-10 국회의원 선거', H.holidayLabel('2024-04-10'), '국회의원 선거')
eq('평일', H.holidayLabel('2026-10-06'), null)
eq('데이터 밖 해', H.holidaysOfYear(2031), [])
// 관공서 공휴일 수(일요일 + 공휴일, 겹치면 한 번) — 월력요항 발표 숫자와 맞춰 본다
const offDays = (y: number) => {
  const s = new Set<string>()
  for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) if (d.getDay() === 0) s.add(`${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  for (const h of H.holidaysOfYear(y)) s.add(h.date)
  return s.size
}
// 2025 월력요항 68일 + 뒤에 정한 임시공휴일(1/27)·대통령 선거(6/3)
eq('2025 관공서 공휴일 68+2일', offDays(2025), 70)
// 2026 월력요항 70일(지방선거 포함) + 뒤에 법으로 정한 노동절·제헌절
eq('2026 관공서 공휴일 70+2일', offDays(2026), 72)
eq('2027 관공서 공휴일 72일', offDays(2027), 72)
eq('holidayMap 10월', [...H.holidayMap('2026-10-01', '2026-10-31')], [['2026-10-03', '개천절'], ['2026-10-05', '대체공휴일'], ['2026-10-09', '한글날']])

// ── 음력 표(ICU dangi와 맞춰 본다) ──
const f = new Intl.DateTimeFormat('ko-KR-u-ca-dangi', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })
let lunarBad = 0
for (let d = new Date('2024-01-01T12:00:00+09:00'); d < new Date('2031-01-01T12:00:00+09:00'); d = new Date(d.getTime() + 86400000)) {
  const iso = new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10)
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  const want = `${p.month}.${p.day}`
  if (H.lunarLabel(iso) !== want) { lunarBad++; if (lunarBad < 4) console.log('  lunar', iso, H.lunarLabel(iso), want) }
}
eq('음력 2024~2030 하루하루 ICU와 같음', lunarBad, 0)
eq('음력 2026-09-25 = 8.15', H.lunarLabel('2026-09-25'), '8.15')
eq('음력 윤6월', H.lunarLabel('2025-07-25'), '윤6.1')

// ── 주 번호(ISO) ──
eq('W41 2026-10-05', H.weekLabel('2026-10-05'), 'W41')
eq('W1 2025-12-29(ISO 2026-W01)', H.isoWeek('2025-12-29'), 1)
eq('W49 2025-12-01', H.isoWeek('2025-12-01'), 49)
eq('W53 2026-12-31', H.isoWeek('2026-12-31'), 53)

// ── 칸 오른쪽 한 자리 ──
const all = { holidays: true, lunar: true, weekNumbers: true }
eq('marks 공휴일 우선', H.dayMarks('2026-10-05', all, true), { holiday: '대체공휴일', side: '대체공휴일', sideKind: 'holiday' })
eq('marks 주 번호', H.dayMarks('2026-10-12', all, true), { holiday: null, side: 'W42', sideKind: 'week' })
eq('marks 음력', H.dayMarks('2026-10-13', all, false), { holiday: null, side: '9.3', sideKind: 'lunar' })
eq('marks 휴일 끔', H.dayMarks('2026-10-03', { holidays: false, lunar: false, weekNumbers: false }, false), { holiday: null, side: null, sideKind: null })

if (fail) { console.error(`${fail} failed`); process.exit(1) }
