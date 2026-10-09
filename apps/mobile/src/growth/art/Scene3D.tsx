// 49 §6 · §8 장면(휴대폰) — 미리 구운 3D 정원 장면을 칸에 꽉 채워(cover) 깔고, 받침(perch) 위에 캐릭터를 세운다.
// 장면 = Image 한 장(39 §11: 그림 한 장 + transform·opacity만). 방 장식은 작은 3D 소품을 받침 기준 자리에(공용 DECOR_SPOTS).
// SceneBand = 할 일 화면 큰 제목 뒤 띠(49 §8.2 은은하게, 결정 ②): 위 = 하늘·언덕, 아래로 바탕색에 녹는다. 스크롤하면 부르는 쪽이 위로 밀어 없앤다.
import { memo, useMemo, type ReactNode } from 'react'
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { BAND_PX, DECOR3D, DECOR_SPOTS, SCENE_PX, SCENE_TINT, bandKeyFor, decorKey, sceneLayout, standOnPerch } from '@sprout/schema/characterArt'
import { artSource } from './CharacterArt'

export type SceneLayout = ReturnType<typeof sceneLayout>

/** 장면을 width × height 칸에 깐다. children(캐릭터 등)은 layout을 받아 받침 위에 놓는다 */
export const SceneBackdrop = memo(function SceneBackdrop({ sceneKey, width, height, align = 'bottom', decor, style, children }: {
  sceneKey: string; width: number; height: number; align?: 'bottom' | 'center'
  /** 켜진 방 장식 id(10 §3.2.7) */
  decor?: string[]
  style?: StyleProp<ViewStyle>
  children?: (layout: SceneLayout) => ReactNode
}) {
  const L = useMemo(() => sceneLayout(sceneKey, width, height, align), [sceneKey, width, height, align])
  const tint = SCENE_TINT[sceneKey] ?? SCENE_TINT['scene-day']
  const src = artSource(sceneKey, SCENE_PX)
  const spots = useMemo(() => (decor ?? []).filter((d) => DECOR3D[decorKey(d)] && DECOR_SPOTS[d]).map((d) => {
    const sp = DECOR_SPOTS[d], w = sp.w * L.w
    return { id: d, w, left: L.perchX + sp.dx * L.w - w / 2, top: L.perchY + sp.dy * L.w - w * 0.9, back: sp.dy < 0 }
  }), [decor, L])
  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: tint.bottom }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.top, height: height * 0.5 }]} />
      {src ? <Image source={src} style={{ position: 'absolute', left: L.x, top: L.y, width: L.w, height: L.h }} fadeDuration={0} /> : null}
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

/** 큰 제목 뒤 장면 띠 — 아래 fade 만큼 바탕색(bg)에 녹는다 */
export const SceneBand = memo(function SceneBand({ dark, width, height = 200, bg, fade = 0.55, style }: { dark: boolean; width: number; height?: number; bg: string; fade?: number; style?: StyleProp<ViewStyle> }) {
  const key = bandKeyFor(dark)
  const src = artSource(key, BAND_PX)
  const imgH = Math.max(height, width * (420 / 1170))
  const id = dark ? 'bandFadeD' : 'bandFadeL'
  return (
    <View style={[{ width, height, overflow: 'hidden' }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {src ? <Image source={src} style={{ position: 'absolute', left: (width - imgH * (1170 / 420)) / 2, top: height - imgH, width: imgH * (1170 / 420), height: imgH }} fadeDuration={0} /> : null}
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
