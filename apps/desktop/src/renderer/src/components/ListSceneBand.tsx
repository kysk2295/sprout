// 49 §8.2 할 일 화면 "은은하게"(결정 ②) — 큰 제목 뒤 장면 띠. 자리를 차지하지 않는 배경이라 목록 첫 줄 높이는 그대로다.
// 49 §6.1: 띠 = 내 배경 장면(look.eq.bg)을 BAND_CROP으로 가로로 자른 것. 낮 짝·밤 짝(sceneKeyFor(bg, true))을 둘 다 깔고 테마(data-theme)로 하나만 보인다(다크 = 밤). 스크롤하면 띠가 위로 밀리며 옅어진다 — transform·opacity만, 리렌더 없음.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { SCENE_LOW_PX, SCENE_PX, SCENE_TINT, SCENES3D, sceneDark, sceneKeyFor } from '@sprout/schema/characterArt'
import { artUrl } from './growth/art3dUrls'
import { useRaise } from '../data/raise'
import { SceneBand } from './growth/Scene3D'
import './listScene.css'

export const LIST_BAND_HEIGHT = 176

/** 내 배경의 낮 짝 · 밤 짝 장면 키. '자동'은 시각을 따르므로 10분마다 다시 잰다 */
function useBandScenes() {
  const bg = useRaise().worn.bg
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    if (bg !== 'auto') return
    const t = window.setInterval(() => setHour(new Date().getHours()), 10 * 60_000)
    return () => window.clearInterval(t)
  }, [bg])
  return { day: sceneKeyFor(bg, false, hour), night: sceneKeyFor(bg, true, hour) }
}

export function ListSceneBand({ scrollRef, height = LIST_BAND_HEIGHT }: { scrollRef: RefObject<HTMLElement | null>; height?: number }) {
  const band = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sc = scrollRef.current
    const el = band.current
    if (!sc || !el) return
    let raf = 0
    const apply = () => {
      raf = 0
      const y = Math.min(sc.scrollTop, height)
      el.style.transform = y ? `translate3d(0, ${-y}px, 0)` : ''
      el.style.opacity = y ? String(Math.max(0, 1 - y / (height * 0.6))) : ''
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply) }
    sc.addEventListener('scroll', onScroll, { passive: true })
    apply()
    return () => { sc.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [scrollRef, height])
  const sc = useBandScenes()
  return (
    <div ref={band} className="lband" style={{ height }} aria-hidden="true">
      <SceneBand dark={false} height={height} className="lband__day" sceneKey={sc.day} />
      <SceneBand dark height={height} className="lband__night" sceneKey={sc.night} />
    </div>
  )
}

/** 캘린더 머리(월 이름 뒤) — 같은 띠를 얕게. 머리 칸 안에서 아래로 녹는다(스크롤 없음) */
export function HeaderSceneBand() {
  const sc = useBandScenes()
  return (
    <div className="lband lband--head" aria-hidden="true">
      <SceneBand dark={false} height={0} className="lband__day" sceneKey={sc.day} />
      <SceneBand dark height={0} className="lband__night" sceneKey={sc.night} />
    </div>
  )
}

/** 캐릭터 뒤 장면 띠(49 §6.1 · §8.1 AI 비서 빈 대화) — 내 배경(낮·밤 짝)을 높이 height로 깔고 아래로 녹는다. 스크롤 따라가기 없음 */
export function BackSceneBand({ height, className }: { height: number; className?: string }) {
  const sc = useBandScenes()
  return (
    <div className={`lband lband--back${className ? ` ${className}` : ''}`} style={{ height }} aria-hidden="true">
      <SceneBand dark={false} height={height} className="lband__day" sceneKey={sc.day} />
      <SceneBand dark height={height} className="lband__night" sceneKey={sc.night} />
    </div>
  )
}

/** 은은한 배경(49 §6.1 · 일기): 내 배경 장면(낮·밤 짝)의 작은 미리보기를 흐리게 깔고, 부르는 쪽 면이 반투명 바탕색으로 덮는다(글 읽기 먼저) */
export function SoftSceneBack({ className }: { className?: string }) {
  const sc = useBandScenes()
  const day = artUrl(sc.day, SCENE_LOW_PX) ?? artUrl(sc.day, SCENE_PX)
  const night = artUrl(sc.night, SCENE_LOW_PX) ?? artUrl(sc.night, SCENE_PX)
  return (
    <div className={`softscene${className ? ` ${className}` : ''}`} aria-hidden="true">
      {day ? <img className="lband__day" src={day} alt="" draggable={false} /> : null}
      {night ? <img className="lband__night" src={night} alt="" draggable={false} /> : null}
    </div>
  )
}

/** 49 §8 표 AI 비서 빈 대화: 칸 전체에 깐 장면(로그인 LoginScene과 같은 계산 — 세로 장면을 넓은 칸에 cover로 깔면 나무만 크게 보이므로
 *  하늘~받침이 칸 높이에 들어오게 가운데 선명한 한 장 + 뒤에 같은 장면을 흐리게 cover로). 낮 짝·밤 짝을 둘 다 깔고 테마로 하나만 보인다.
 *  라이트에서 고른 장면이 어두우면(별밤 등) 글자가 묻혀서 새벽 장면으로 둔다(띠 규칙과 같음) */
export function CoverScene({ foot = 0.62 }: { foot?: number }) {
  const sc = useBandScenes()
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const day = sceneDark(sc.day) ? 'scene-dawn' : sc.day
  return (
    <div ref={ref} className="cscene" aria-hidden="true">
      {box.w ? <><CoverLayer sceneKey={day} box={box} foot={foot} className="lband__day" /><CoverLayer sceneKey={sc.night} box={box} foot={foot} className="lband__night" /></> : null}
    </div>
  )
}
function CoverLayer({ sceneKey, box, foot, className }: { sceneKey: string; box: { w: number; h: number }; foot: number; className: string }) {
  const m = SCENES3D[sceneKey]
  const url = artUrl(sceneKey, SCENE_PX)
  const tint = SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-dawn']
  if (!m || !url) return <div className={`cscene__layer ${className}`} style={{ background: `linear-gradient(${tint.top}, ${tint.bottom})` }} />
  const top0 = 0.16
  const h = (box.h * foot) / (m.perch[1] - top0), w = h / m.aspect
  const cw = Math.max(w, box.w), ch = cw * m.aspect
  return (
    <div className={`cscene__layer ${className}`} style={{ background: tint.bottom }}>
      <img className="cscene__blur" src={url} alt="" draggable={false} style={{ width: cw, height: ch, left: (box.w - cw) / 2, top: box.h * foot - m.perch[1] * ch }} />
      <img className={`cscene__img${w < box.w ? ' is-faded' : ''}`} src={url} alt="" draggable={false} style={{ width: w, height: h, left: (box.w - w) / 2, top: box.h * foot - m.perch[1] * h }} />
    </div>
  )
}
