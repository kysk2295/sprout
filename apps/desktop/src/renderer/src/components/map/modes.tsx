// 사용자 결정 2026-10-05 "작업 지도 = 프로젝트 한 화면": 점검·정리는 지도 모드가 아니다.
//  · 점검(review/**)  → 성장 탭 › 주간 점검(GrowthView가 ReviewScreen을 띄운다)
//  · 정리(tidy/**)    → 정리 화면(App이 TidyScreen을 본문 자리에 띄운다 — 기본함 카드 `정리하기`, ⌘K `기본함 정리하기`)
// 두 컴포넌트는 그대로 두고(ModeSlotProps) 여기서 틀만 준다: 머리(제목·닫기) + 오른쪽 할 일 상세 + 알림 줄.
import { ChevronLeft, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { openMap, openReview, openTidy } from '../../data/mapMoments'
import { useQuery } from '../../data/useQuery'
import type { ListRow, TagRow } from '../../data/types'
import { useTaskActions } from '../../lib/taskActions'
import { DetailPane } from '../DetailPane'
import { Resizer } from '../Resizer'
import { ReviewMode } from './review'
import { TidyMode } from './tidy'
import './map.css'

export type ModeSlotProps = {
  lists: ListRow[]
  /** 할 일 상세 열기(오른쪽 상세 패널) */
  onSelectTask: (taskId: string) => void
  /** 다른 화면으로: plan = 작업 지도, review = 성장 › 주간 점검, tidy = 정리 화면 */
  onMode: (mode: 'plan' | 'review' | 'tidy') => void
  /** 화면 알림 줄(되돌리기 버튼 선택) */
  notify: (text: string, action?: { label: string; run: () => void }) => void
  /** 같이 계획 짜기 대화 열기(큰 할 일 id가 있으면 그 일부터) — 작업 지도로 옮겨 연다 */
  openPlanChat: (taskId?: string) => void
}

type Notice = { id: number; text: string; action?: { label: string; run: () => void } }
const DETAIL = { def: 298, min: 260, max: 560 }

function ScreenFrame({ title, back, onClose, lists, className, children }: {
  title: string; back?: string; onClose: () => void; lists: ListRow[]; className?: string
  children: (slot: ModeSlotProps) => ReactNode
}) {
  const taskActions = useTaskActions()
  const tags = useQuery<TagRow>('SELECT id, name, color FROM tags ORDER BY sort_order') ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const [detailW, setDetailW] = useState(DETAIL.def)
  const [notice, setNotice] = useState<Notice>()
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(undefined), 4000)
    return () => window.clearTimeout(t)
  }, [notice])
  const notify = useCallback((text: string, action?: Notice['action']) => setNotice({ id: Date.now(), text, action }), [])
  const slot: ModeSlotProps = {
    lists, notify,
    onSelectTask: setSelected,
    onMode: (m) => (m === 'plan' ? openMap({}) : m === 'review' ? openReview() : openTidy()),
    openPlanChat: (taskId) => openMap({ task: taskId, plan: true })
  }
  return (
    <main className={`workspace map side-screen${className ? ` ${className}` : ''}`}>
      <div className="map__main">
        <header className="pane-header map-head">
          {back && <button className="icon-btn" aria-label={`${back}(으)로`} onClick={onClose}><ChevronLeft /></button>}
          <h1 className="pane-header__title map-head__title">{title}</h1>
          {!back && <button className="icon-btn" aria-label="닫기" onClick={onClose}><X /></button>}
        </header>
        {children(slot)}
        {notice && (
          <div className="map-notice" key={notice.id} role="status">
            <Sparkles className="map-banner__icon" /><span>{notice.text}</span>
            {notice.action && <button className="map-btn map-btn--text" onClick={() => { notice.action!.run(); setNotice(undefined) }}>{notice.action.label}</button>}
            <button className="icon-btn map-notice__close" aria-label="닫기" onClick={() => setNotice(undefined)}><X /></button>
          </div>
        )}
      </div>
      {selected && (
        <div className="app__detail map__detail" style={{ width: detailW }}>
          <Resizer side="left" width={detailW} min={DETAIL.min} max={DETAIL.max} defaultWidth={DETAIL.def} onChange={setDetailW} />
          <DetailPane taskId={selected} lists={lists} tags={tags} actions={taskActions} onSelect={setSelected} onClose={() => setSelected(null)} onHide={() => setSelected(null)} />
        </div>
      )}
    </main>
  )
}

/** 성장 › 주간 점검(31 §12 점검 3단계 — 화면 자리만 성장 탭으로) */
export function ReviewScreen({ lists, onClose }: { lists: ListRow[]; onClose: () => void }) {
  return (
    <ScreenFrame title="주간 점검" back="성장" onClose={onClose} lists={lists} className="side-screen--review">
      {(slot) => <ReviewMode {...slot} onMode={(m) => (m === 'review' ? undefined : slot.onMode(m))} onClose={onClose} />}
    </ScreenFrame>
  )
}

/** 정리 화면(31 §12 정리 = 분류 책상). 다 정리한 뒤 `계획 보러 가기`는 작업 지도로 */
export function TidyScreen({ lists, onClose }: { lists: ListRow[]; onClose: () => void }) {
  return (
    <ScreenFrame title="정리" onClose={onClose} lists={lists} className="side-screen--tidy">
      {(slot) => <TidyMode {...slot} onMode={(m) => (m === 'tidy' ? undefined : slot.onMode(m))} onClose={onClose} />}
    </ScreenFrame>
  )
}
