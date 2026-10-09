// 49 §6 · §8 장면(데스크톱) — 미리 구운 3D 정원 장면을 칸에 꽉 채워(cover) 깔고 받침(perch) 위에 캐릭터를 세운다.
// 칸 크기는 ResizeObserver로 재고, 배치는 공용 sceneLayout(휴대폰과 같은 계산). 방 장식 = 받침 기준 작은 3D 소품(DECOR_SPOTS).
// SceneBand = 할 일 화면 큰 제목 뒤 띠(49 §8.2 은은하게): 아래로 바탕색에 녹는다(CSS mask).
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { BAND_PX, DECOR3D, DECOR_SPOTS, SCENE_PX, SCENE_TINT, bandKeyFor, decorKey, sceneLayout, standOnPerch } from '@sprout/schema/characterArt'
import { artUrl } from './art3dUrls'
import './scene3d.css'

export type SceneLayout = ReturnType<typeof sceneLayout>

export function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** 칸을 꽉 채우는 장면. children(layout)으로 받침 위 캐릭터를 놓는다 */
export const SceneBackdrop = memo(function SceneBackdrop({ sceneKey, align = 'bottom', decor, className, style, children }: {
  sceneKey: string; align?: 'bottom' | 'center'; decor?: string[]; className?: string; style?: CSSProperties
  children?: (layout: SceneLayout, size: { w: number; h: number }) => ReactNode
}) {
  const [ref, size] = useBoxSize<HTMLDivElement>()
  const L = useMemo(() => sceneLayout(sceneKey, size.w || 1, size.h || 1, align), [sceneKey, size.w, size.h, align])
  const tint = SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-day']
  const url = artUrl(sceneKey, SCENE_PX)
  const spots = (decor ?? []).filter((d) => DECOR3D[decorKey(d)] && DECOR_SPOTS[d]).map((d) => {
    const sp = DECOR_SPOTS[d], w = sp.w * L.w
    return { id: d, w, left: L.perchX + sp.dx * L.w - w / 2, top: L.perchY + sp.dy * L.w - w * 0.9, back: sp.dy < 0 }
  })
  const deco = (x: (typeof spots)[number]) => { const u = artUrl(decorKey(x.id), 256); return u ? <img key={x.id} className="s3-decor" src={u} alt="" style={{ left: x.left, top: x.top, width: x.w, height: x.w }} draggable={false} /> : null }
  return (
    <div ref={ref} className={`s3${className ? ` ${className}` : ''}`} style={{ background: `linear-gradient(${tint.top}, ${tint.top} 50%, ${tint.bottom} 50%)`, ...style }}>
      {url && size.w > 0 ? <img className="s3-img" src={url} alt="" draggable={false} style={{ left: L.x, top: L.y, width: L.w, height: L.h }} /> : null}
      {size.w > 0 && spots.filter((x) => x.back).map(deco)}
      {size.w > 0 && children ? children(L, size) : null}
      {size.w > 0 && spots.filter((x) => !x.back).map(deco)}
    </div>
  )
})

/** 캐릭터 상자(box)를 받침 위에 세우는 자리 */
export const onPerch = (L: SceneLayout, box: number) => standOnPerch(L.perchX, L.perchY, box)

/** 큰 제목 뒤 장면 띠(높이 height) — 스크롤하면 부르는 쪽이 함께 밀어 올린다 */
export function SceneBand({ dark, height = 168, className }: { dark: boolean; height?: number; className?: string }) {
  const url = artUrl(bandKeyFor(dark), BAND_PX)
  if (!url) return null
  return <div className={`s3-band${className ? ` ${className}` : ''}`} style={{ height, backgroundImage: `url("${url}")` }} aria-hidden="true" />
}
