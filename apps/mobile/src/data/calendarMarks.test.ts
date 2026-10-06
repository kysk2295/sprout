// 06 §16 휴일 표시 설정 읽기·합치기(데스크톱과 같은 값)
import { markPrefsOf, mergeOptions } from './calendarMarks.ts'
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
eq('기본값', markPrefsOf(null), { holidays: true, lunar: false, weekNumbers: false, weekStart: 0 })
eq('깨진 값', markPrefsOf('{'), { holidays: true, lunar: false, weekNumbers: false, weekStart: 0 })
eq('데스크톱 값', markPrefsOf('{"view":"month","holidays":0,"lunar":1,"weekNumbers":1}'), { holidays: false, lunar: true, weekNumbers: true, weekStart: 0 })
eq('주 시작 월요일(06 §16.1)', markPrefsOf('{"weekStart":1}').weekStart, 1)
eq('주 시작 토요일', markPrefsOf('{"weekStart":6}').weekStart, 6)
eq('모르는 주 시작 = 일요일', markPrefsOf('{"weekStart":3}').weekStart, 0)
eq('주 시작 저장도 다른 키 유지', JSON.parse(mergeOptions('{"holidays":0}', { weekStart: 6 })), { holidays: 0, weekStart: 6 })
eq('다른 키 유지', JSON.parse(mergeOptions('{"view":"month","myColor":"#E9A23B"}', { holidays: 0 })), { view: 'month', myColor: '#E9A23B', holidays: 0 })
if (fail) { console.error(`${fail} failed`); process.exit(1) }
