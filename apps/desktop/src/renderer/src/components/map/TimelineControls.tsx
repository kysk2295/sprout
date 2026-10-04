// 31 §2 타임라인 — 머리 오른쪽 조작(일·주·월 · 오늘 · ‹ ›)과 보기 옵션·⋯ 메뉴 항목. 상태는 기기 기억 sprout.map.timeline.
// WorkMapView는 useTimelineNav() 하나를 만들어 머리·보기 옵션·⋯·TimelineView에 같이 넘긴다.
import { Check, ChevronLeft, ChevronRight, PanelRight } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { ColorBy } from '../../lib/calendar'
import { SCALES, SCALE_LABEL, ROW_HEAD, type Scale } from '../../lib/timeline'
import { MenuItem, SubMenu } from '../Popover'
import { useStored } from './useMapData'

export type TimelineSettings = { scale: Scale; colorBy: ColorBy; arrows: boolean; panel: boolean; rowHead: number }
export const TIMELINE_DEFAULTS: TimelineSettings = { scale: 'week', colorBy: 'list', arrows: true, panel: true, rowHead: ROW_HEAD.def }
/** 머리 버튼이 타임라인에 보내는 한 번짜리 명령(오늘로 · 한 화면 앞뒤) */
export type TimelineCmd = { id: number; kind: 'today' } | { id: number; kind: 'page'; dir: 1 | -1 }

export function useTimelineNav() {
  const [settings, setSettings] = useStored<TimelineSettings>('timeline', TIMELINE_DEFAULTS)
  const [cmd, setCmd] = useState<TimelineCmd>()
  const set = useCallback(<K extends keyof TimelineSettings>(k: K, v: TimelineSettings[K]) => setSettings((s) => ({ ...s, [k]: v })), [setSettings])
  const today = useCallback(() => setCmd({ id: Date.now(), kind: 'today' }), [])
  const page = useCallback((dir: 1 | -1) => setCmd({ id: Date.now(), kind: 'page', dir }), [])
  return useMemo(() => ({ ...settings, set, cmd, today, page }), [settings, set, cmd, today, page])
}
export type TimelineNav = ReturnType<typeof useTimelineNav>

/** 머리 오른쪽: `일 · 주 · 월` [틱틱] · `오늘` · `‹ ›` (31 §2.1) */
export function TimelineHeadControls({ nav }: { nav: TimelineNav }) {
  return (
    <span className="tl-head">
      <span className="map-seg" role="tablist" aria-label="배율">
        {SCALES.map((s, i) => (
          <button key={s} role="tab" aria-selected={nav.scale === s} className={nav.scale === s ? 'is-on' : ''} title={`${SCALE_LABEL[s]} (${i + 1})`} onClick={() => nav.set('scale', s)}>{SCALE_LABEL[s]}</button>
        ))}
      </span>
      <button className="tl-head__today" title="오늘 (T)" onClick={nav.today}>오늘</button>
      <button className="icon-btn" aria-label="이전" title="이전 (⇧←)" onClick={() => nav.page(-1)}><ChevronLeft /></button>
      <button className="icon-btn" aria-label="다음" title="다음 (⇧→)" onClick={() => nav.page(1)}><ChevronRight /></button>
    </span>
  )
}

const COLOR_LABEL: Record<ColorBy, string> = { list: '리스트', tag: '태그', priority: '우선순위' }
/** 보기 옵션(거름틀)에 붙는 타임라인 항목: 막대 색 · 순서 선 보이기 (31 §5) */
export function TimelineOptionItems({ nav }: { nav: TimelineNav }) {
  return (
    <>
      <SubMenu label="막대 색" trail={COLOR_LABEL[nav.colorBy]} width={160}>
        {(['list', 'tag', 'priority'] as ColorBy[]).map((c) => (
          <MenuItem key={c} label={COLOR_LABEL[c]} onClick={() => nav.set('colorBy', c)} trail={nav.colorBy === c ? <Check className="map-check" /> : undefined} />
        ))}
      </SubMenu>
      <MenuItem label="순서 선 보이기" onClick={() => nav.set('arrows', !nav.arrows)} trail={nav.arrows ? <Check className="map-check" /> : undefined} />
    </>
  )
}
/** ⋯ 메뉴: 할일 정렬 칸 켜고 끄기 */
export function TimelineMoreItems({ nav, close }: { nav: TimelineNav; close: () => void }) {
  return <MenuItem icon={<PanelRight />} label="할일 정렬" onClick={() => { close(); nav.set('panel', !nav.panel) }} trail={nav.panel ? <Check className="map-check" /> : undefined} />
}
