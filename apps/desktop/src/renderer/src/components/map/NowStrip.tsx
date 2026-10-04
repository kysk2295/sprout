// 31 작업 지도 v3 §1.2 지금 띠 — 머리·제안 카드 아래 44px. `⚡ 지금 할 수 있는 일 N` · 알약 최대 5개 · `N개 더`(= 지금 집중) · ▴ 접기.
// 세 보기(그래프·보드·타임라인) 공통. 계산은 data/mapNow.ts(동기) — 로딩 자리 없음.
import { Check, ChevronUp, Zap } from 'lucide-react'
import { type MouseEvent } from 'react'
import { checkboxColor } from '../../lib/priority'
import type { MapTask } from '../../data/map'
import type { MapActions } from './parts'
import type { MapData } from './useMapData'

export function NowStrip({ data, actions, onReveal, onMore, onFold, onMenu }: {
  data: MapData; actions: MapActions
  /** 알약 클릭 → 그 할 일로 화면 이동 + 상세 */
  onReveal: (taskId: string) => void
  onMore: () => void
  onFold: () => void
  onMenu: (task: MapTask, e: MouseEvent) => void
}) {
  const { items, total } = data.strip
  if (!total) return null
  return (
    <div className="map-now" role="region" aria-label="지금 할 수 있는 일">
      <span className="map-now__label"><Zap />지금 할 수 있는 일 <b>{total}</b></span>
      <div className="map-now__pills">
        {items.map(({ task, reason }) => {
          const checking = actions.checking.has(task.id)
          return (
            <div key={task.id} className={`map-pill${actions.selected === task.id ? ' is-selected' : ''}${actions.flash.has(task.id) ? ' is-flash' : ''}${checking ? ' is-leaving' : ''}`}
              onClick={() => onReveal(task.id)} onContextMenu={(e) => { e.preventDefault(); onMenu(task, e) }} title={task.title}>
              <button className={`checkbox${checking ? ' is-checked' : ''}`} style={{ ['--checkbox-color' as string]: checkboxColor(task.priority) }} aria-label="완료"
                onClick={(e) => { e.stopPropagation(); if (!checking) actions.complete(task.id) }}>
                {checking && <Check strokeWidth={3} />}
              </button>
              <span className="map-pill__title">{task.title}</span>
              {reason.label && <span className={`map-pill__why is-${reason.kind}`}>{reason.label}</span>}
            </div>
          )
        })}
        {total > items.length && <button className="map-btn map-btn--text map-now__more" onClick={onMore}>{total - items.length}개 더</button>}
      </div>
      <button className="icon-btn map-now__fold" aria-label="지금 띠 접기" title="접기" onClick={onFold}><ChevronUp /></button>
    </div>
  )
}
