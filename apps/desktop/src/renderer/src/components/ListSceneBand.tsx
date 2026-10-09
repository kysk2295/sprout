// 49 §8.2 할 일 화면 "은은하게"(결정 ②) — 큰 제목 뒤 장면 띠. 자리를 차지하지 않는 배경이라 목록 첫 줄 높이는 그대로다.
// 낮 띠·밤 띠를 둘 다 깔고 테마(data-theme)로 하나만 보인다(다크 = 밤). 스크롤하면 띠가 위로 밀리며 옅어진다 — transform·opacity만, 리렌더 없음.
import { useEffect, useRef, type RefObject } from 'react'
import { SceneBand } from './growth/Scene3D'
import './listScene.css'

export const LIST_BAND_HEIGHT = 176

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
  return (
    <div ref={band} className="lband" style={{ height }} aria-hidden="true">
      <SceneBand dark={false} height={height} className="lband__day" />
      <SceneBand dark height={height} className="lband__night" />
    </div>
  )
}

/** 캘린더 머리(월 이름 뒤) — 같은 띠를 얕게. 머리 칸 안에서 아래로 녹는다(스크롤 없음) */
export function HeaderSceneBand() {
  return (
    <div className="lband lband--head" aria-hidden="true">
      <SceneBand dark={false} height={0} className="lband__day" />
      <SceneBand dark height={0} className="lband__night" />
    </div>
  )
}
