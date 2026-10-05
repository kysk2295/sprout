// 31 §12 v2 모드 자리(slot). 계획은 components/map/plan/**, 점검은 review/**, 정리는 tidy/** 가 각자 채운다.
// WorkMapView는 이 파일만 안다 — 점검·정리 담당은 WorkMapView를 고치지 않고 자기 폴더의 컴포넌트만 고친다.
import type { ListRow } from '../../data/types'
import { ReviewMode } from './review'
import { TidyMode } from './tidy'

export type ModeSlotProps = {
  lists: ListRow[]
  /** 할 일 상세 열기(지도 오른쪽 상세 패널) */
  onSelectTask: (taskId: string) => void
  /** 다른 모드로 옮기기 */
  onMode: (mode: 'plan' | 'review' | 'tidy') => void
  /** 지도 전체 토스트(되돌리기 버튼 선택) */
  notify: (text: string, action?: { label: string; run: () => void }) => void
  /** 같이 계획 짜기 대화 열기(큰 할 일 id가 있으면 그 일부터) */
  openPlanChat: (taskId?: string) => void
}

/** 점검 자리 — review/index.tsx의 ReviewMode가 ModeSlotProps를 받는다(남는 값은 무시해도 됨). */
export function ReviewSlot(props: ModeSlotProps) {
  return <ReviewMode {...props} onClose={() => props.onMode('plan')} />
}

/** 정리 자리 — tidy/index.tsx의 TidyMode가 ModeSlotProps를 받는다. */
export function TidySlot(props: ModeSlotProps) {
  return <TidyMode {...props} onClose={() => props.onMode('plan')} />
}
