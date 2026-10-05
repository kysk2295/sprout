// 34 §2 첫 둘러보기 — DOM 없이 시험할 수 있는 순수 규칙(언제 뜨나 · 카드 자리).
// 2026-10-05 버그: 점검·정리 모드에서 1단계 대상이 없으면 카드가 -9999px에 놓이고 막만 남아 지도 전체가 막혔다.
import type { MapMode } from '../../data/mapMoments'

export type TourBox = { left: number; top: number; width: number; height: number }

/** 저절로 뜨는 조건 — 계획 모드 화면(v2 프로젝트 보드)에서만. 점검·정리에는 가리킬 곳이 없다 */
export function shouldAutoTour(o: { loaded: boolean; done: boolean; closedThisRun: boolean; open: boolean; mode: MapMode }): boolean {
  return o.loaded && !o.done && !o.closedThisRun && !o.open && o.mode === 'plan'
}

/** 카드 자리 — 대상 아래(자리 없으면 위, 그것도 없으면 안쪽 아래), 대상이 없으면 화면 가운데. 언제나 화면 안 */
export function placeTourCard(box: TourBox | null, card: { w: number; h: number }, view: { W: number; H: number }, gap = 14): { left: number; top: number } {
  const { w, h } = card, { W, H } = view
  let left: number, top: number
  if (!box) { left = (W - w) / 2; top = (H - h) / 2 }
  else {
    left = box.left + box.width / 2 - w / 2
    if (box.top + box.height + gap + h < H - 8) top = box.top + box.height + gap
    else if (box.top - gap - h > 8) top = box.top - gap - h
    else top = box.top + box.height - h - 28 // 큰 영역(본문)은 안쪽 아래
  }
  return { left: Math.max(8, Math.min(left, W - w - 8)), top: Math.max(8, Math.min(top, H - h - 8)) }
}
