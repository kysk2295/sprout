// 34 §2 첫 둘러보기 — 공통 규칙은 guide/core.ts(37)로 옮겼다. 작업 지도만의 조건(계획 모드에서만 저절로)은 여기.
// 2026-10-05 버그: 점검·정리 모드에서 1단계 대상이 없으면 카드가 -9999px에 놓이고 막만 남아 지도 전체가 막혔다.
import type { MapMode } from '../../data/mapMoments'
import { shouldAutoTour as autoTour } from '../guide/core'

export { placeTourCard, type TourBox } from '../guide/core'

/** 저절로 뜨는 조건 — 계획 모드 화면(v2 프로젝트 보드)에서만. 점검·정리에는 가리킬 곳이 없다 */
export function shouldAutoTour(o: { loaded: boolean; done: boolean; closedThisRun: boolean; open: boolean; mode: MapMode }): boolean {
  return autoTour({ ready: o.loaded, done: o.done, closedThisRun: o.closedThisRun, open: o.open, allowed: o.mode === 'plan' })
}
