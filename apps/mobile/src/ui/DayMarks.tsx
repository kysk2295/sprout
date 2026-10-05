// 06 §16 / 20 §7.2 휴일 표시(자리는 틱틱/디다 모바일 실측 — research 17 §15.2, 색은 빨강 — 사용자 결정 2026-10-05): "휴" 원 배지는 사용자 결정(2026-10-05)으로 뺌,
// 월 칸은 숫자 아래 한 줄(휴일 이름 = 빨강, 주 번호·음력 = 회색). 공휴일 날짜 숫자도 빨강.
import type { DayMarks } from '@sprout/schema/holidays'
import { Text } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'

export function SideLabel({ marks, size = 8.5 }: { marks?: DayMarks; size?: number }) {
  const p = usePalette()
  if (!marks?.side) return null
  return (
    <Text numberOfLines={1} allowFontScaling={false} style={{ fontSize: size, lineHeight: size + 2.5, textAlign: 'center', color: marks.sideKind === 'holiday' ? p.holiday : p.textTertiary }}>{marks.side}</Text>
  )
}
