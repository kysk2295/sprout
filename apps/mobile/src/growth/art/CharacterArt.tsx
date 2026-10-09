// 42 §5.2 · 43 §5 캐릭터 그림(휴대폰) — 공용 그림 데이터(@sprout/schema/characterArt, 시안 kkumteul-art.js v3)를 react-native-svg 요소로 그린다.
// 데스크톱 components/growth/CharacterArt.tsx · 맥 위젯 · 사이트와 같은 그림 글이다(두 곳에 따로 그린 도형 없음).
// 그림 글 → 나무(@sprout/schema/svgTree) → <Svg>/<G>/<Path>… — ref가 진짜 Svg라 위젯 PNG 굽기(toDataURL)도 그대로 된다.
// 움직임은 감싸개 전체만(39 §11 싸게: transform·opacity) — 부품 움직임(c-…)은 데스크톱만.
// 입힌 옷: wear를 넘기지 않으면 CharacterWearProvider(내 캐릭터 모습)를 쓴다 — 같은 종·같은 단계일 때만.
// 크기(43 결정 ⑨): 기본은 상자를 꽉 채운다(fit). 성장 무대·도감·진화는 fit={false}로 단계 배율 그대로.
import { createContext, createElement, memo, useContext, useMemo, type ReactNode, type Ref } from 'react'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg'
import { art, hatchTop, seedArt, type ArtMood, type Crop, type Detail } from '@sprout/schema/characterArt'
import { normalizeSpecies, stageOf, type Species } from '@sprout/schema/growth'
import { parseSvg, rnProps, type SvgNode } from '@sprout/schema/svgTree'
import type { Equip, Path as LookPath } from '@sprout/schema/wardrobe'

export type CharacterWear = { lv?: number; path?: LookPath; eq?: Partial<Equip> }
type WearCtx = { species: Species | null; level: number; wear: CharacterWear } | null
const WearContext = createContext<WearCtx>(null)
/** 내 캐릭터의 모습을 아래 모든 CharacterArt에 준다(앱 맨 위에서 한 번) */
export function CharacterWearProvider({ value, children }: { value: WearCtx; children: ReactNode }) {
  return <WearContext.Provider value={value}>{children}</WearContext.Provider>
}
export const useCharacterWear = () => useContext(WearContext)

const EL: Record<string, any> = { g: G, path: Path, circle: Circle, ellipse: Ellipse, rect: Rect, defs: Defs, radialGradient: RadialGradient, linearGradient: LinearGradient, stop: Stop, text: SvgText }
function toEl(n: SvgNode, key: number | string): ReactNode {
  const C = EL[n.tag]
  if (!C) return null
  const kids = n.children.map((c, i) => toEl(c, i))
  return createElement(C, { key, ...rnProps(n.attrs) }, ...(n.text ? [n.text] : []), ...kids)
}
/** 그림 글 하나를 그린다(장면·아이콘·트로피에도 쓴다). width·height는 size가 이긴다 */
export const SvgString = memo(function SvgString({ svg, size, width, height, svgRef, preserveAspectRatio }: { svg: string; size?: number; width?: number | string; height?: number | string; svgRef?: Ref<Svg>; preserveAspectRatio?: string }) {
  const tree = useMemo(() => parseSvg(svg), [svg])
  const a = tree.attrs
  return (
    <Svg ref={svgRef} width={size ?? width ?? a.width ?? '100%'} height={size ?? height ?? a.height ?? '100%'} viewBox={a.viewBox} preserveAspectRatio={preserveAspectRatio ?? a.preserveAspectRatio}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {tree.children.map((c, i) => toEl(c, i))}
    </Svg>
  )
})

/** 40 §6 [호환] — 이제 crop='bust'가 대신한다 */
export const tightViewBox = (_species: Species | null, _stage = 1) => '0 0 120 120'

export function CharacterArt({ species, stage = 1, size = 120, mood = 'default', look, blink, cracks, silhouette, svgRef, tight, crop, detail = 'auto', lock, fit = true, wear, noAura, wave, calm }: {
  species: Species | string | null; stage?: number; size?: number; mood?: ArtMood; look?: { x: number; y: number }; blink?: boolean; cracks?: number
  /** 한 색 실루엣(진화 연출·앞 단계) — 색 글 또는 true(흰색) */
  silhouette?: string | boolean
  svgRef?: Ref<Svg>; tight?: boolean; crop?: Crop; detail?: Detail; lock?: boolean
  /** 단계 배율을 끄고 상자를 채운다. 기본 true(무대·도감·진화는 false) */
  fit?: boolean
  /** 입힌 모습(없으면 Provider 값) — null이면 아무것도 입히지 않는다 */
  wear?: CharacterWear | null
  noAura?: boolean; wave?: boolean; calm?: boolean
}) {
  const ctx = useContext(WearContext)
  const sp = normalizeSpecies(species ?? null)
  const st = Math.min(5, Math.max(1, stage))
  const w = wear === null ? undefined : wear ?? (ctx && sp && ctx.species === sp && stageOf(ctx.level) === st ? { ...ctx.wear, lv: ctx.wear.lv ?? ctx.level } : undefined)
  const svg = useMemo(() => {
    if (!sp) return seedArt({ size, cracks, rn: true, crop: tight ? 'bust' : crop })
    return art(sp, st, { size, mood, look, blink, detail, crop: tight ? 'bust' : crop, sil: silhouette, lock, fit, noAura, wave, calm, rn: true, lv: w?.lv, path: w?.path, eq: w?.eq })
  }, [sp, st, size, mood, look?.x, look?.y, blink, detail, crop, tight, silhouette, lock, fit, noAura, wave, calm, cracks, w?.lv, w?.path, w?.eq?.hat, w?.eq?.neck, w?.eq?.hand, w?.eq?.back])
  return <SvgString svg={svg} size={size} svgRef={svgRef} />
}

/** 아직 모르는 씨앗(성향 조사 전) */
export function Egg({ size, cracks = 0, svgRef }: { size: number; cracks?: number; svgRef?: Ref<Svg>; viewBox?: string }) {
  return <CharacterArt species={null} size={size} cracks={cracks} svgRef={svgRef} />
}
/** 부화 뚜껑(진화 연출 알 깨기) */
export function HatchTop({ species, size, fit }: { species: Species; size: number; fit?: boolean }) {
  const svg = useMemo(() => hatchTop(species, { rn: true, fit }), [species, fit])
  return <SvgString svg={svg} size={size} />
}
