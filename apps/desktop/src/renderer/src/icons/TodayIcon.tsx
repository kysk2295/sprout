// 틱틱처럼 오늘 날짜 숫자가 들어간 달력 아이콘. 아이콘 원본은 쓰지 않고 직접 그린다.
export function TodayIcon({ size = 20 }: { size?: number }) {
  const day = new Date().getDate()
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.75" y="3.75" width="14.5" height="13.5" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 2v3M13.5 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text x="10" y="14.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fontFamily="-apple-system, sans-serif">
        {day}
      </text>
    </svg>
  )
}
