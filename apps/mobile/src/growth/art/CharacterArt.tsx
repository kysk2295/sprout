// 49 캐릭터 v3(휴대폰) — 미리 구운 3D 스프라이트(packages/schema/art3d/*.webp)를 층으로 겹친다.
// 층 순서·이름·자르기는 공용 @sprout/schema/art3d(layers3d · cropBox)가 정한다 — 데스크톱 CharacterArt·위젯·사이트와 같은 그림.
// 성능(39 §11): 그림은 Image 하나씩, 움직임은 부르는 쪽 감싸개의 transform·opacity만. 깜빡임 = 미리 올린 '졸림' 얼굴 층의 opacity 교차(디코드 끊김 없음).
// 실루엣(진화 연출)·잠김(도감) = 같은 층을 tintColor 한 색으로(따로 구운 그림·필터 없음).
// 입힌 옷: wear를 넘기지 않으면 CharacterWearProvider(내 캐릭터 모습)를 쓴다 — 같은 종·같은 단계일 때만.
import { createContext, createElement, memo, useContext, useEffect, useMemo, type ReactNode, type Ref } from 'react'
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg'
import { parseSvg, rnProps, type SvgNode } from '@sprout/schema/svgTree'
import { BIG_PX, MID_PX, SCENE_LOW_PX, SCENE_PX, SEED_PX, SMALL_PX, artFile, cropBox, layers3d, pickPx, seedCrackKey, seedTurnKey, type Box, type Crop, type Detail } from '@sprout/schema/characterArt'
import { normalizeSpecies, stageOf, type Species } from '@sprout/schema/growth'
import type { Equip, Path as LookPath } from '@sprout/schema/wardrobe'
import { ART_FILES } from './art3dFiles'
import { ensurePack, ensureScene, packUri, useArtPackVersion } from './art3dPacks'

export type CharacterWear = { lv?: number; path?: LookPath; eq?: Partial<Equip>; seed?: number }
type WearCtx = { species: Species | null; level: number; wear: CharacterWear } | null
const WearContext = createContext<WearCtx>(null)
/** 내 캐릭터의 모습을 아래 모든 CharacterArt에 준다(앱 맨 위에서 한 번). 종을 알면 그 종 묶음(512)을 뒤에서 받아 둔다(49 §4.4) */
export function CharacterWearProvider({ value, children }: { value: WearCtx; children: ReactNode }) {
  const sp = value?.species ?? null
  const seed = value?.wear.seed ?? 0
  useEffect(() => { if (sp) void ensurePack(sp, seed) }, [sp, seed])
  return <WearContext.Provider value={value}>{children}</WearContext.Provider>
}
export const useCharacterWear = () => useContext(WearContext)

/** 그림 출처: 앱 안 기본 묶음(require) → 내려받은 종 묶음(file://) → 다른 크기(512가 아직 없으면 160으로 대신). 없으면 null */
export function artSource(key: string, px: number): number | { uri: string } | null {
  const f = artFile(key, px)
  if (ART_FILES[f]) return ART_FILES[f]
  if (px === BIG_PX || px === SCENE_PX || /-spin$/.test(key)) { const u = packUri(f); if (u) return { uri: u } } // 종 묶음(768·회전 띠) · 배경 묶음(장면 1170)
  if (key.startsWith('scene-')) { if (px === SCENE_PX) void ensureScene(key); return ART_FILES[artFile(key, SCENE_LOW_PX)] ?? null } // 받는 동안 390 미리보기
  // 아직 없으면 앱 안의 다른 크기로(큰 것부터 — 384가 160보다 덜 흐리다)
  return ART_FILES[artFile(key, BIG_PX)] ?? ART_FILES[artFile(key, MID_PX)] ?? ART_FILES[artFile(key, SMALL_PX)] ?? null
}
export { useArtPackVersion }

/** 그림 한 장을 상자(box, 캔버스 비율)만큼 확대해 size 칸에 보여 준다 — 옷 칸·장식·장면 아이콘 */
export const ArtImage = memo(function ArtImage({ artKey, size, box, px, tint, style }: { artKey: string; size: number; box?: Box; px?: number; tint?: string; style?: StyleProp<ViewStyle> }) {
  useArtPackVersion()
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 }
  const full = size / b.w
  const src = artSource(artKey, px ?? pickPx(full))
  if (!src) return <View style={[{ width: size, height: size }, style]} />
  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* tintColor를 뺄 때는 다시 만든다 — iOS RN Image는 tintColor를 지워도 템플릿 그리기가 남아 시스템 파랑으로 칠한다(도감 `나` 칸이 파랗던 것) */}
      <Image key={tint ? 'tint' : 'plain'} source={src} style={{ position: 'absolute', width: full, height: full, left: -b.x * full, top: -b.y * full, ...(tint ? { tintColor: tint } : null) } as ImageStyle} fadeDuration={0} />
    </View>
  )
})

const EL: Record<string, any> = { g: G, path: Path, circle: Circle, ellipse: Ellipse, rect: Rect, defs: Defs, radialGradient: RadialGradient, linearGradient: LinearGradient, stop: Stop, text: SvgText }
function toEl(n: SvgNode, key: number | string): ReactNode {
  const C = EL[n.tag]
  if (!C) return null
  const kids = n.children.map((c, i) => toEl(c, i))
  return createElement(C, { key, ...rnProps(n.attrs) }, ...(n.text ? [n.text] : []), ...kids)
}
/** 그림 글 하나를 그린다(트로피·말랑 아이콘·조각 같은 작은 SVG에 남는다). width·height는 size가 이긴다 */
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

export type CharacterArtProps = {
  species: Species | string | null; stage?: number; size?: number
  /** 표정(옛 11종 이름도 받는다 → 5종으로 — 49 결정 ④) */
  mood?: string
  look?: { x: number; y: number }
  /** 눈 감기(깜빡임) — 졸림 얼굴 층을 겹쳐 두고 opacity로 바꾼다 */
  blink?: boolean
  /** 씨앗(종을 모를 때): 금 0~2 · 회전 컷 0~11 · 껍질 0~3 */
  cracks?: number; turn?: number; seed?: number
  /** 한 색 실루엣(진화 연출) — 색 글 또는 true(흰색) */
  silhouette?: string | boolean
  /** [없어짐] 위젯 굽기는 WidgetArtBaker가 그림 파일을 바로 쓴다 */
  svgRef?: Ref<Svg>
  tight?: boolean; crop?: Crop; detail?: Detail
  /** 잠긴 칸(도감) — 회색 한 색 */
  lock?: boolean | string
  /** [호환] v3는 늘 같은 상자를 채운다 */
  fit?: boolean
  /** 입힌 모습(없으면 Provider 값) — null이면 아무것도 입히지 않는다 */
  wear?: CharacterWear | null
  noAura?: boolean; wave?: boolean; calm?: boolean
  style?: StyleProp<ViewStyle>
}

const LOCK = '#C9D0CB'

export const CharacterArt = memo(function CharacterArt({ species, stage = 1, size = 120, mood = 'default', blink, cracks, turn, seed, silhouette, tight, crop, lock, wear, style }: CharacterArtProps) {
  const ctx = useContext(WearContext)
  useArtPackVersion() // 종 묶음이 들어오면 160 대신 512로 다시 그린다
  const sp = normalizeSpecies(species ?? null)
  const st = Math.min(5, Math.max(1, stage))
  const w = wear === null ? undefined : wear ?? (ctx && sp && ctx.species === sp && stageOf(ctx.level) === st ? { ...ctx.wear, lv: ctx.wear.lv ?? ctx.level } : undefined)
  const seedNo = seed ?? w?.seed ?? (ctx?.wear.seed ?? 0)
  const cr = tight ? 'bust' : crop === 'bust' || (crop !== 'full' && size <= 40) ? 'bust' : 'full'
  const tint = silhouette ? (typeof silhouette === 'string' ? silhouette : '#FFFFFF') : lock ? (typeof lock === 'string' ? lock : LOCK) : undefined
  const { keys, box, sleepy } = useMemo(() => {
    if (!sp) {
      const k = cracks ? seedCrackKey(seedNo, cracks) : seedTurnKey(seedNo, turn ?? 0)
      return { keys: [k], box: cr === 'bust' ? { x: 0.12, y: 0.06, w: 0.76, h: 0.76 } : { x: 0, y: 0, w: 1, h: 1 }, sleepy: null as string | null }
    }
    const L = layers3d(sp, st, { path: w?.path, seed: seedNo, eq: w?.eq, mood, size })
    const sl = blink !== undefined && !tint ? L.find((l) => l.kind === 'face')!.key.replace(/-face-[a-z]+$/, '-face-sleepy') : null
    return { keys: L.map((l) => l.key), box: cropBox(sp, st, cr, w?.path, seedNo), sleepy: sl }
  }, [sp, st, w?.path, w?.eq?.hat, w?.eq?.neck, w?.eq?.hand, w?.eq?.back, seedNo, mood, size, cracks, turn, cr, blink !== undefined, !!tint]) // eslint-disable-line react-hooks/exhaustive-deps
  const full = size / box.w
  const px = sp ? pickPx(full) : SEED_PX
  const sleepySrc = sleepy ? artSource(sleepy, px) : null
  const img = { position: 'absolute', width: full, height: full, left: -box.x * full, top: -box.y * full, ...(tint ? { tintColor: tint } : null) } as ImageStyle
  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      {keys.map((k) => {
        const src = artSource(k, px)
        if (!src) return null
        const isFace = /-face-/.test(k)
        return <Image key={`${k}${tint ? '-t' : ''}`} source={src} style={[img, isFace && sleepy && blink ? s.hide : null]} fadeDuration={0} />
      })}
      {sleepySrc ? <Image source={sleepySrc} style={[img, blink ? null : s.hide]} fadeDuration={0} /> : null}
    </View>
  )
})

/** 아직 모르는 씨앗(만들기 흐름 전) */
export function Egg({ size, cracks = 0, seed, turn }: { size: number; cracks?: number; seed?: number; turn?: number; svgRef?: Ref<Svg>; viewBox?: string }) {
  return <CharacterArt species={null} size={size} cracks={cracks} seed={seed} turn={turn} />
}
/** [호환] 부화 뚜껑 — v3 부화는 씨앗 금 컷 → 빛 → 아기라 뚜껑 그림이 없다 */
export function HatchTop({ size }: { species: Species; size: number; fit?: boolean }) {
  return <View style={{ width: size, height: size }} />
}

const s = StyleSheet.create({ hide: { opacity: 0 } })
