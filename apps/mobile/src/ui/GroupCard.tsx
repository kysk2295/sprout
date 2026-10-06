// 묶음 카드(21 §2): 바닥 위 카드(좌우 16, 모서리 14, 사이 16 [영상 실측]). 머리 48 = 이름 15/600 · 오른쪽 개수 ⌄(3차, 접히면 ›).
// 만료됨 머리는 개수 앞에 "미루기"(강조색). 머리를 누르면 접힘/펼침 — ⌄가 돌고 행이 옅게 들고 나며 카드 높이·아래 카드가 250ms 감속으로 움직인다(39 §4.8).
// 이름 없는 묶음(리스트의 미분류)은 머리 없이. 섹션 머리는 길게 눌러 메뉴(이름 바꾸기·삭제 — 02 §0)
import { ChevronDown } from 'lucide-react-native'
import { useEffect, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import type { ListMotion } from './listMotion'
import { DUR, timing } from './motion'

export function GroupCard(props: { title: string; count: number; collapsed: boolean; onToggle: () => void; onPostpone?: () => void; onLongPress?: (e: GestureResponderEvent) => void; children?: ReactNode; motion?: ListMotion }) {
  const p = usePalette()
  const rot = useSharedValue(props.collapsed ? -90 : 0)
  useEffect(() => { rot.value = withTiming(props.collapsed ? -90 : 0, timing(DUR.base)) }, [props.collapsed, rot])
  const chev = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))
  const m = props.motion ?? {}
  return (
    <Animated.View layout={m.layout} entering={m.entering} exiting={m.exiting} style={[s.card, { backgroundColor: p.cardBg }]}>
      {props.title ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${props.title} ${props.count}개, ${props.collapsed ? '펼치기' : '접기'}`} onPress={props.onToggle} onLongPress={props.onLongPress} delayLongPress={350} style={s.head}>
          <Text style={[FONT.group, { color: p.textPrimary }]}>{props.title}</Text>
          <View style={{ flex: 1 }} />
          {props.onPostpone ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={props.onPostpone}>
              <Text style={[s.link, { color: p.accent }]}>미루기</Text>
            </Pressable>
          ) : null}
          <Text style={[FONT.sub, { color: p.textTertiary }]}>{props.count}</Text>
          <Animated.View style={chev}>
            <ChevronDown size={15} color={p.textTertiary} />
          </Animated.View>
        </Pressable>
      ) : null}
      {props.collapsed ? null : props.children}
    </Animated.View>
  )
}
const s = StyleSheet.create({
  card: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: M.radiusCard, overflow: 'hidden' },
  head: { height: M.groupH, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: M.rowPad - 2 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '500', marginRight: 6 }
})
