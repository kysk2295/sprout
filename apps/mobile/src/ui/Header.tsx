// 머리(21 §2): 1줄 = 둥근 유리 버튼(☰ · ⋯, 52) / 2줄 = 큰 제목 28/700 + 옆 작은 날짜(48)
// 39 §4.10: 스크롤하면 큰 제목이 옅어지고 머리 줄 가운데 작은 제목(17/600)이 32~48 구간에서 나타남 — useCollapsingTitle
import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Animated, { interpolate, Extrapolation, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type AnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

/** 큰 제목 접힘: 스크롤 핸들러 + 큰 제목·작은 제목 스타일 */
export function useCollapsingTitle() {
  const y = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y })
  const big = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, M.titleH * 0.8], [1, 0], Extrapolation.CLAMP) }))
  const small = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [32, M.titleH], [0, 1], Extrapolation.CLAMP) }))
  return { onScroll, big, small, y }
}

export function NavRow(props: { left?: ReactNode; right?: ReactNode; title?: string; /** 접힌 큰 제목(스크롤하면 나타남) */ smallTitle?: string; smallStyle?: StyleProp<AnimatedStyle<TextStyle>> }) {
  const insets = useSafeAreaInsets()
  const p = usePalette()
  return (
    <View style={[s.nav, { marginTop: insets.top }]}>
      <View style={s.side}>{props.left}</View>
      {props.title ? <Text style={[FONT.nav, s.navTitle, { color: p.textPrimary }]} numberOfLines={1}>{props.title}</Text>
        : props.smallTitle ? <Animated.Text style={[FONT.nav, s.navTitle, { color: p.textPrimary }, props.smallStyle]} numberOfLines={1}>{props.smallTitle}</Animated.Text>
        : <View style={{ flex: 1 }} />}
      <View style={[s.side, { justifyContent: 'flex-end' }]}>{props.right}</View>
    </View>
  )
}
export function BigTitle(props: { title: string; sub?: string; emoji?: string | null; style?: StyleProp<AnimatedStyle<ViewStyle>> }) {
  const p = usePalette()
  return (
    <Animated.View style={[s.title, props.style]}>
      {props.emoji ? <Text style={{ fontSize: 24, marginRight: 8 }}>{props.emoji}</Text> : null}
      <Text style={[FONT.title, { color: p.textPrimary }]} numberOfLines={1}>{props.title}</Text>
      {props.sub ? <Text style={[FONT.meta, { color: p.textTertiary, marginLeft: 8, alignSelf: 'flex-end', paddingBottom: 8 }]}>{props.sub}</Text> : null}
    </Animated.View>
  )
}
const s = StyleSheet.create({
  nav: { height: M.navH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  side: { minWidth: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navTitle: { flex: 1, textAlign: 'center' },
  title: { height: M.titleH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: M.gutter }
})
