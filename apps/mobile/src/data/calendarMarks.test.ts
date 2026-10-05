// 06 §16 휴일 표시 설정 읽기·합치기(데스크톱과 같은 값)
import { markPrefsOf, mergeOptions } from './calendarMarks.ts'
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
eq('기본값', markPrefsOf(null), { holidays: true, lunar: false, weekNumbers: false })
eq('깨진 값', markPrefsOf('{'), { holidays: true, lunar: false, weekNumbers: false })
eq('데스크톱 값', markPrefsOf('{"view":"month","holidays":0,"lunar":1,"weekNumbers":1}'), { holidays: false, lunar: true, weekNumbers: true })
eq('다른 키 유지', JSON.parse(mergeOptions('{"view":"month","myColor":"#E9A23B"}', { holidays: 0 })), { view: 'month', myColor: '#E9A23B', holidays: 0 })
if (fail) { console.error(`${fail} failed`); process.exit(1) }
