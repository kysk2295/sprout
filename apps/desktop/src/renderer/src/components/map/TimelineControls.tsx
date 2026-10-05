// 31 §2 타임라인 — ⋯ 메뉴 항목(배율 · 오늘로 · 막대 색 · 순서 선 · 할일 정렬 칸). 머리 조작은 2026-10-05 정리로 ⋯·키보드로 옮김. 상태는 기기 기억 sprout.map.timeline.
// WorkMapView는 useTimelineNav() 하나를 만들어 ⋯·TimelineView에 같이 넘긴다.
import { Check, PanelRight } from 'lucide-react'
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

/** ⋯ 메뉴(2026-10-05 정리 — 머리 세그먼트 대신): 배율 `일 · 주 · 월` [틱틱] · 오늘로. 키 1·2·3, T, ⇧← → 는 그대로 */
export function TimelineScaleItems({ nav, close }: { nav: TimelineNav; close: () => void }) {
  return (
    <>
      <SubMenu label="배율" trail={SCALE_LABEL[nav.scale]} width={140}>
        {SCALES.map((s, i) => (
          <MenuItem key={s} label={`${SCALE_LABEL[s]} (${i + 1})`} onClick={() => { close(); nav.set('scale', s) }} trail={nav.scale === s ? <Check className="map-check" /> : undefined} />
        ))}
      </SubMenu>
      <MenuItem label="오늘로 (T)" onClick={() => { close(); nav.today() }} />
    </>
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
