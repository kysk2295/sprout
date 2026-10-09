// 49 §6 · §8 장면(휴대폰) — 미리 구운 3D 정원 장면을 칸에 꽉 채워(cover) 깔고, 받침(perch) 위에 캐릭터를 세운다.
// 장면 = Image 한 장(39 §11: 그림 한 장 + transform·opacity만). 방 장식은 작은 3D 소품을 받침 기준 자리에(공용 DECOR_SPOTS).
// SceneBand = 할 일 화면 큰 제목 뒤 띠(49 §8.2 은은하게, 결정 ②): 위 = 하늘·언덕, 아래로 바탕색에 녹는다. 스크롤하면 부르는 쪽이 위로 밀어 없앤다.
// 49 §6.1 배경 고르기: sceneKey가 바뀌면 옛 장면을 위에 두고 opacity 1 → 0(fade ms) — 두 Image 교차(39 §11). 띠는 고른 장면을 BAND_CROP으로 가로로 잘라 깐다.
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { BAND_CROP, BAND_PX, DECOR3D, DECOR_SPOTS, SCENE_LOW_PX, SCENE_PX, SCENE_TINT, SCENES3D, bandKeyFor, decorKey, sceneLayout, standOnPerch } from '@sprout/schema/characterArt'
import { artSource, useArtPackVersion } from './CharacterArt'

export type SceneLayout = ReturnType<typeof sceneLayout>

/** 장면을 width × height 칸에 깐다. children(캐릭터 등)은 layout을 받아 받침 위에 놓는다 */
export const SceneBackdrop = memo(function SceneBackdrop({ sceneKey, width, height, align = 'bottom', decor, fade = 0, style, children }: {
  sceneKey: string; width: number; height: number; align?: 'bottom' | 'center'
  /** 켜진 방 장식 id(10 §3.2.7) */
  decor?: string[]
  /** 장면이 바뀔 때 교차 페이드 길이(ms) — 0 = 바로 바꿈. 옷장 배경 미리 보기 = 300 */
  fade?: number
  style?: StyleProp<ViewStyle>
  children?: (layout: SceneLayout) => ReactNode
}) {
  useArtPackVersion() // 배경 묶음(1170)을 다 받으면 390 미리보기를 바꿔 그린다
  const L = useMemo(() => sceneLayout(sceneKey, width, height, align), [sceneKey, width, height, align])
  const tint = SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-day']
  const src = artSource(sceneKey, SCENE_PX)
  // 교차 페이드: 옛 장면(그림·자리·바탕색)을 위에 두고 사라지게
  const [prev, setPrev] = useState<{ src: NonNullable<typeof src> | null; L: SceneLayout; bg: string } | null>(null)
  const last = useRef({ key: sceneKey, src, L, bg: tint.bottom })
  const o = useSharedValue(0)
  useEffect(() => {
    const was = last.current
    last.current = { key: sceneKey, src, L, bg: tint.bottom }
    if (was.key === sceneKey || !fade) return
    setPrev({ src: was.src, L: was.L, bg: was.bg })
    o.value = 1
    o.value = withTiming(0, { duration: fade }, (done) => { if (done) runOnJS(setPrev)(null) })
  }, [sceneKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const prevSt = useAnimatedStyle(() => ({ opacity: o.value }))
  const spots = useMemo(() => (decor ?? []).filter((d) => DECOR3D[decorKey(d)] && DECOR_SPOTS[d]).map((d) => {
    const sp = DECOR_SPOTS[d], w = sp.w * L.w
    return { id: d, w, left: L.perchX + sp.dx * L.w - w / 2, top: L.perchY + sp.dy * L.w - w * 0.9, back: sp.dy < 0 }
  }), [decor, L])
  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: tint.bottom }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.top, height: height * 0.5 }]} />
      {src ? <Image source={src} style={{ position: 'absolute', left: L.x, top: L.y, width: L.w, height: L.h }} fadeDuration={0} /> : null}
      {prev ? (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: prev.bg }, prevSt]} pointerEvents="none">
          {prev.src ? <Image source={prev.src} style={{ position: 'absolute', left: prev.L.x, top: prev.L.y, width: prev.L.w, height: prev.L.h }} fadeDuration={0} /> : null}
        </Animated.View>
      ) : null}
      {spots.filter((x) => x.back).map((x) => <Decor key={x.id} id={x.id} left={x.left} top={x.top} w={x.w} />)}
      {children ? children(L) : null}
      {spots.filter((x) => !x.back).map((x) => <Decor key={x.id} id={x.id} left={x.left} top={x.top} w={x.w} />)}
    </View>
  )
})

function Decor({ id, left, top, w }: { id: string; left: number; top: number; w: number }) {
  const src = artSource(decorKey(id), 256)
  if (!src) return null
  return <Image source={src} style={{ position: 'absolute', left, top, width: w, height: w }} fadeDuration={0} />
}

/** 캐릭터 상자(box)를 받침 위에 세우는 자리 */
export const onPerch = (L: SceneLayout, box: number) => standOnPerch(L.perchX, L.perchY, box)

/** 큰 제목 뒤 장면 띠 — 아래 fade 만큼 바탕색(bg)에 녹는다.
 *  sceneKey(내 배경 장면, 다크면 밤 짝)를 주면 그 세로 장면의 BAND_CROP 구간(하늘 끝 · 나무 · 언덕)을 가로로 잘라 깐다. 없으면 기본 띠(band-day/dusk) */
export const SceneBand = memo(function SceneBand({ dark, sceneKey, width, height = 200, bg, fade = 0.55, style }: { dark: boolean; sceneKey?: string | null; width: number; height?: number; bg: string; fade?: number; style?: StyleProp<ViewStyle> }) {
  useArtPackVersion()
  const sceneSrc = sceneKey ? artSource(sceneKey, SCENE_PX) : null
  const id = dark ? 'bandFadeD' : 'bandFadeL'
  let img: ReactNode = null
  if (sceneSrc && sceneKey) {
    const aspect = SCENES3D[sceneKey]?.aspect ?? 2
    const span = (BAND_CROP.y1 - BAND_CROP.y0) * aspect // 잘라 쓸 구간의 높이 / 폭
    const w = Math.max(width, height / span), h = w * aspect
    img = <Image source={sceneSrc} style={{ position: 'absolute', left: (width - w) / 2, top: height - BAND_CROP.y1 * h, width: w, height: h }} fadeDuration={0} />
  } else {
    const src = artSource(bandKeyFor(dark), BAND_PX)
    const imgH = Math.max(height, width * (420 / 1170))
    if (src) img = <Image source={src} style={{ position: 'absolute', left: (width - imgH * (1170 / 420)) / 2, top: height - imgH, width: imgH * (1170 / 420), height: imgH }} fadeDuration={0} />
  }
  const tint = sceneKey ? SCENE_TINT[sceneKey] : undefined
  return (
    <View style={[{ width, height, overflow: 'hidden' }, tint && sceneSrc ? { backgroundColor: tint.top } : null, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {img}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={bg} stopOpacity={0} />
            <Stop offset={String(1 - fade)} stopColor={bg} stopOpacity={0} />
            <Stop offset="1" stopColor={bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  )
})

/** 은은한 배경(49 §6.1 · §8.1 일기): 고른 장면의 390 미리보기를 흐리게(blurRadius) 깔고 바탕색 막을 덮어 글을 읽기 쉽게.
 *  작은 그림 하나 + 막 하나라 가볍다(39 §11). 화면 크기에 꽉 채운다(cover, 가운데) */
export const SoftScene = memo(function SoftScene({ sceneKey, width, height, veil, veilOpacity = 0.8, blur = 8 }: { sceneKey: string; width: number; height: number; veil: string; veilOpacity?: number; blur?: number }) {
  const src = artSource(sceneKey, SCENE_LOW_PX) ?? artSource(sceneKey, SCENE_PX)
  const tint = SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-day']
  const aspect = SCENES3D[sceneKey]?.aspect ?? 2
  const w = Math.max(width, height / aspect), h = w * aspect
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.bottom, overflow: 'hidden' }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {src ? <Image source={src} blurRadius={blur} style={{ position: 'absolute', left: (width - w) / 2, top: (height - h) / 2, width: w, height: h }} fadeDuration={0} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: veil, opacity: veilOpacity }]} />
    </View>
  )
})
