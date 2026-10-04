import type { SVGProps } from 'react'

/** 다음 주(+7일) 아이콘: 달력 안에 "+7". lucide 선 굵기·크기 규칙을 따른 자체 아이콘 */
export function CalendarPlus7(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2.5v3M16 2.5v3" />
      <text x="12" y="18.2" textAnchor="middle" fontSize="8" fontWeight="600" fill="currentColor" stroke="none" fontFamily="var(--font-family)">+7</text>
    </svg>
  )
}
