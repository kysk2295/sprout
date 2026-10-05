import type { DayMarks } from '@sprout/schema/holidays'
import './holidays.css'

// 06 §16 날짜 숫자 곁의 표시(틱틱/디다 실측 — research 17 §15.2):
// "휴" 배지 = 날짜 숫자 오른쪽 위에 붙는 작은 원(숫자 버튼 안에 둔다), 오른쪽 글자 = 휴일 이름 · 주 번호(회색) · 음력(회색).
// 휴일 색 = 빨강 --color-holiday(사용자 결정 2026-10-05, 틱틱/디다는 초록)
export function RestBadge({ marks }: { marks?: DayMarks }) {
  return marks?.holiday ? <span className="cal-rest" aria-label={`휴일: ${marks.holiday}`}>휴</span> : null
}
export function SideLabel({ marks, className }: { marks?: DayMarks; className: string }) {
  return marks?.side ? <span className={`cal-sidelabel ${className} is-${marks.sideKind}`} title={marks.side}>{marks.side}</span> : null
}
