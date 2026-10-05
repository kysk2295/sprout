import type { DayMarks } from '@sprout/schema/holidays'
import './holidays.css'

// 06 §16 날짜 숫자 곁의 표시(틱틱/디다 실측 — research 17 §15.2):
// 오른쪽 글자 = 휴일 이름 · 주 번호(회색) · 음력(회색). 틱틱/디다의 "휴" 원 배지는 사용자 결정(2026-10-05 "거슬려")으로 뺐다 —
// 공휴일은 빨간 날짜 숫자 + 휴일 이름(작은 달력은 마우스를 올리면 이름)으로만 알린다.
// 휴일 색 = 빨강 --color-holiday(사용자 결정 2026-10-05, 틱틱/디다는 초록)
export function SideLabel({ marks, className }: { marks?: DayMarks; className: string }) {
  return marks?.side ? <span className={`cal-sidelabel ${className} is-${marks.sideKind}`} title={marks.side}>{marks.side}</span> : null
}
