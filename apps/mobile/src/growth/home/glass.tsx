// 49 §6 · §7 캐릭터 화면 공용 조각(휴대폰): 유리 면(시안 character-v3 .glass) · 장면을 받침 자리에 맞춰 까는 계산 · 작은 3D 썸네일.
// 유리 = 반투명 면 + (iOS) 정지 장면 위 BlurView. 장면이 움직이지 않으므로 흐림은 한 번 그린 뒤 그대로다(39 §11).
// 썸네일 = 미리 구운 160 그림(ArtImage)을 칸에 맞게 자른다 — 옛 SVG(itemIcon·sceneIcon·decorIcon)는 쓰지 않는다.
import { BlurView } from 'expo-blur'
import { memo, type ReactNode } from 'react'
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { accIcon, bodyBox, DECOR3D, decorKey, layers3d, SCENE_OF_BG, SCENE_PX, SCENES3D, type Box } from '@sprout/schema/characterArt'
import type { Species } from '@sprout/schema/growth'
import type { Path } from '@sprout/schema/wardrobe'
import { ArtImage, artSource } from '../art/CharacterArt'

/** 유리 색(시안 --glass · --glass-line · --glass-ink). 라이트·다크는 앱 테마를 따른다 */
export function glassTone(dark: boolean) {
  const blur = Platform.OS === 'ios'
  return dark
    ? { bg: blur ? 'rgba(16,24,30,0.5)' : 'rgba(16,24,30,0.78)', line: 'rgba(255,255,255,0.12)', ink: '#EEF3F0', soft: 'rgba(255,255,255,0.08)', did: 'rgba(255,255,255,0.14)', track: 'rgba(127,127,127,0.24)', bubble: 'rgba(16,24,30,0.78)' }
    : { bg: blur ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.82)', line: 'rgba(255,255,255,0.7)', ink: '#13211B', soft: 'rgba(255,255,255,0.5)', did: 'rgba(255,255,255,0.55)', track: 'rgba(127,127,127,0.24)', bubble: 'rgba(255,255,255,0.86)' }
}
export type GlassTone = ReturnType<typeof glassTone>

/** 유리 면 — 모서리 radius, 안은 children */
export function Glass({ dark, radius = 26, style, children, intensity = 22 }: { dark: boolean; radius?: number; style?: StyleProp<ViewStyle>; children?: ReactNode; intensity?: number }) {
  const t = glassTone(dark)
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: Platform.OS === 'ios' ? 'transparent' : t.bg, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth }, style]}>
      {Platform.OS === 'ios' ? <BlurView intensity={intensity} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      {Platform.OS === 'ios' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} pointerEvents="none" /> : null}
      {children}
    </View>
  )
}

/** 장면을 w × H 화면에 깔 때, 받침(perch)이 화면 y = T에 오도록 SceneBackdrop의 top·height를 정한다.
 *  (장면 이미지는 세로로 길다 — 높이를 늘려 덮고, 위로 올려 받침을 맞춘다. 화면 위·아래가 비지 않게) */
export function fitScene(key: string, w: number, H: number, T: number) {
  const m = SCENES3D[key] ?? SCENES3D['scene-day'] ?? { perch: [0.5, 0.6], aspect: 2 }
  const pr = m.perch[1], a = m.aspect
  const height = Math.max(w * a, T / pr, (H - T) / (1 - pr))
  return { top: T - pr * height, height, perchX: w / 2 + (m.perch[0] - 0.5) * (height / a) }
}

/** 옷 칸 그림: 옷 층을 옷 자리로 확대해 자른 것(accIcon). 층이 없는 옷은 빈 칸 */
export const AccThumb = memo(function AccThumb({ id, size, tint }: { id: string; size: number; tint?: string }) {
  const ic = accIcon(id)
  if (!ic) return <View style={{ width: size, height: size }} />
  return <ArtImage artKey={ic.key} size={size} box={ic.box} px={160} tint={tint} />
})

/** 방 배경 칸: 그 장면을 받침 근처로 가운데 자른 정사각형 */
export const SceneThumb = memo(function SceneThumb({ bg, size, radius = 12, tint }: { bg: string; size: number; radius?: number; tint?: string }) {
  const key = SCENE_OF_BG[bg] ?? 'scene-day'
  const src = artSource(key, SCENE_PX)
  const m = SCENES3D[key] ?? { perch: [0.5, 0.6], aspect: 2 }
  const w = size * 1.15, h = w * m.aspect
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: tint ?? '#9CCBE4' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {src && !tint ? <Image source={src} style={{ position: 'absolute', width: w, height: h, left: (size - w) / 2, top: Math.min(0, Math.max(size - h, size * 0.62 - m.perch[1] * h)) }} fadeDuration={0} /> : null}
    </View>
  )
})

/** 장식 칸: 작은 3D 소품을 그려진 테두리로 꽉 채워 */
export const DecorThumb = memo(function DecorThumb({ id, size, tint }: { id: string; size: number; tint?: string }) {
  const key = decorKey(id)
  const bb = DECOR3D[key]
  if (!bb) return <View style={{ width: size, height: size }} />
  return <ArtImage artKey={key} size={size} box={squareOf(bb, 0.04)} px={256} tint={tint} />
})

/** 도감 칸 인형: 몸·얼굴(기본) 층을 160 그림으로, 그려진 테두리에 맞춰 자른다(한 화면 그림 메모리 ≤ 12 MB — 49 §12) */
export const DexFigure = memo(function DexFigure({ species, stage, path = 'a', seed = 0, size, tint, tintOpacity }: { species: Species; stage: number; path?: Path; seed?: number; size: number; tint?: string; tintOpacity?: number }) {
  const L = layers3d(species, stage, { path, seed, mood: 'default' }).filter((l) => l.kind !== 'acc')
  const box = bodyBox(L[0].key, 0.03)
  return (
    <View style={{ width: size, height: size, opacity: tint ? tintOpacity ?? 1 : 1 }}>
      {L.map((l) => <ArtImage key={l.key} artKey={l.key} size={size} box={box} px={160} tint={tint} style={StyleSheet.absoluteFill} />)}
    </View>
  )
})

function squareOf([x0, y0, x1, y1]: number[], pad: number): Box {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const side = Math.min(1, Math.max(x1 - x0, y1 - y0) + pad * 2)
  return { x: Math.min(1 - side, Math.max(0, cx - side / 2)), y: Math.min(1 - side, Math.max(0, cy - side / 2)), w: side, h: side }
}
