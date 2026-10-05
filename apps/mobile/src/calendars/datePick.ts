// 38 §2.3 날짜 시트(app/date.tsx?device=) → 열려 있는 휴대폰 일정 시트로 고른 값을 넘긴다(범위 대화는 시트가 띄운다)
import type { Schedule } from '../ui/dateSheetModel'

export const deviceDatePick: { fn: ((s: Schedule) => void) | null } = { fn: null }
