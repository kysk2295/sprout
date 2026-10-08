// 34 작업 지도 사용법 — 2026-10-05부터 37 탭 사용법 공통 체계(components/guide) 위에서 돈다. 글·단계는 guide/content.ts `map`.
// 본 기억은 계정 단위(guide/seen.ts — 기기 키는 예전 그대로 sprout.map.guide). 저절로 뜨는 건 계획(프로젝트) 화면에서 평생 한 번.
import { GuideButton, GuidePanel, GuideTour, useGuide, type Guide } from '../guide/Guide'
import type { MapMode } from '../../data/mapMoments'

export type Recipe = 'split' | 'morning' | 'goal'
export type MapGuide = Guide

/** mode: 저절로 뜨는 건 계획 모드에서만(34 §2.1 v2). toPlan: 둘러보기 다시 하기 전에 계획 모드 화면으로 */
export function useMapGuide(loaded: boolean, mode: MapMode, toPlan?: () => void) {
  return useGuide('map', { ready: loaded, allowed: mode === 'plan', beforeTour: toPlan })
}

/** 머리 `?` 버튼(⋯ 왼쪽) — 툴팁은 지도 머리 공통 말풍선(.map-tip) */
export function MapGuideButton({ guide }: { guide: MapGuide }) {
  return <span className="map-tip" data-tip="작업 지도 사용법"><GuideButton guide={guide} tip={false} /></span>
}

export function MapGuidePanel({ guide, aiOk, onTry }: { guide: MapGuide; aiOk: boolean | null; onTry: (r: Recipe) => void }) {
  return <GuidePanel guide={guide} aiOk={aiOk} onTry={(r) => onTry(r as Recipe)} />
}

export function MapTour({ guide }: { guide: MapGuide }) {
  return <GuideTour guide={guide} />
}
