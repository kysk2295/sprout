// 묶음 카드(21 §2): 바닥 위 카드(좌우 16, 모서리 14, 사이 16 [영상 실측]). 머리 48 = 이름 15/600 · 오른쪽 개수 ⌄(3차, 접히면 ›).
// 만료됨 머리는 개수 앞에 "미루기"(강조색). 이름 없는 묶음(리스트의 미분류)은 머리 없이. 섹션 머리는 길게 눌러 메뉴(이름 바꾸기·삭제 — 02 §0)
// 펼침·접힘(39 §4.8 · §11.4, 2026-10-08 사용자 "만료됨·오늘 카드를 누르면 오래 걸리고 스무스하지 않다"):
// - 누른 그 손잡이에서 ⌄ 회전·행 옅어짐을 UI 스레드 값으로 바로 시작(React 그리기를 기다리지 않음).
// - 행은 한 번 펼친 뒤에는 접어도 그대로 둔다(높이 0 상자 + 카드 overflow hidden으로 가림) → 접고 펼 때 행을 새로 만들거나 지우지 않고,
//   행마다 들고 나는 전환도 없다. 움직이는 것은 카드 높이·아래 카드 자리(카드 몇 장의 레이아웃 전환 `groupLayout` 200ms 감속)와 행 묶음 opacity 하나뿐.
import { ChevronDown } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { groupLayout, type ListMotion } from './listMotion'
import { DUR, EASE, timing } from './motion'

type Props = { title: string; count: number; collapsed: boolean; /** 없으면 접지 않는 카드(캘린더 그날 목록 등) — 누름·카드 전환 없음 */ onToggle?: () => void; onPostpone?: () => void; onLongPress?: (e: GestureResponderEvent) => void; children?: ReactNode; motion?: ListMotion }

export function GroupCard(props: Props) {
  const p = usePalette()
  const { collapsed } = props
  // 한 번이라도 펼쳤으면 행을 계속 둔다(처음부터 접힌 묶음 — 완료 등 — 은 펼칠 때 처음 만든다)
  const [mounted, setMounted] = useState(!collapsed)
  if (!collapsed && !mounted) setMounted(true)
  const rot = useSharedValue(collapsed ? -90 : 0)
  const fade = useSharedValue(collapsed ? 0 : 1)
  const aim = useRef(collapsed)
  const animate = (to: boolean) => {
    if (aim.current === to) return
    aim.current = to
    rot.value = withTiming(to ? -90 : 0, timing(DUR.group))
    // 접을 때 행은 카드가 줄기 전에 빨리 옅어지고, 펼칠 때는 카드가 열리는 동안 나타난다
    fade.value = withTiming(to ? 0 : 1, to ? timing(DUR.fast, EASE.out) : timing(DUR.group))
  }
  // 밖에서 바뀐 경우(검색 등)도 같은 움직임 — 누른 경우는 이미 시작했으므로 건너뜀
  useEffect(() => { animate(collapsed) }) // eslint-disable-line react-hooks/exhaustive-deps
  const onPress = props.onToggle ? () => {
    animate(!collapsed)
    props.onToggle?.()
  } : undefined
  const chev = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))
  const body = useAnimatedStyle(() => ({ opacity: fade.value }))
  const m = props.motion
  // motion을 넘기지 않는 화면(수집함 등)은 늘 카드 전환, 할 일 목록은 첫 그림·보기 바꿈 때 끈다(listMotion)
  const layout = m ? m.card : props.onToggle ? groupLayout : undefined
  return (
    <Animated.View layout={layout} entering={m?.entering} exiting={m?.exiting} style={[s.card, { backgroundColor: p.cardBg }]}>
      {props.title ? (
        <Pressable accessibilityRole="button" accessibilityLabel={props.onToggle ? `${props.title} ${props.count}개, ${collapsed ? '펼치기' : '접기'}` : `${props.title} ${props.count}개`} onPress={onPress} onLongPress={props.onLongPress} delayLongPress={350} style={s.head}>
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
      {mounted ? (
        <Animated.View
          pointerEvents={collapsed ? 'none' : 'auto'}
          accessibilityElementsHidden={collapsed}
          importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
          style={[collapsed ? s.shut : null, body]}
        >
          {props.children}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}
const s = StyleSheet.create({
  card: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: M.radiusCard, overflow: 'hidden' },
  head: { height: M.groupH, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: M.rowPad - 2 },
  // 접힘: 행은 그대로 두고 높이만 0(넘친 행은 카드 overflow hidden이 가림)
  shut: { height: 0 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '500', marginRight: 6 }
})
