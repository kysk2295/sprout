// 묶음 카드(21 §2): 회색 바닥 위 흰 카드(좌우 12, 모서리 14, 사이 10). 머리 44 = 이름 15/600 · 오른쪽 개수 ⌄(3차).
// 만료됨 머리는 개수 앞에 "미루기"(강조색). 머리를 누르면 접힘/펼침. 이름 없는 묶음(리스트의 미분류)은 머리 없이.
import { ChevronDown } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

export function GroupCard(props: { title: string; count: number; collapsed: boolean; onToggle: () => void; onPostpone?: () => void; children?: ReactNode }) {
  const p = usePalette()
  return (
    <View style={[s.card, { backgroundColor: p.cardBg }]}>
      {props.title ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${props.title} ${props.count}개, ${props.collapsed ? '펼치기' : '접기'}`} onPress={props.onToggle} style={s.head}>
          <Text style={[FONT.group, { color: p.textPrimary }]}>{props.title}</Text>
          <View style={{ flex: 1 }} />
          {props.onPostpone ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={props.onPostpone}>
              <Text style={[s.link, { color: p.accent }]}>미루기</Text>
            </Pressable>
          ) : null}
          <Text style={[FONT.sub, { color: p.textTertiary }]}>{props.count}</Text>
          <View style={{ transform: [{ rotate: props.collapsed ? '-90deg' : '0deg' }] }}>
            <ChevronDown size={15} color={p.textTertiary} />
          </View>
        </Pressable>
      ) : null}
      {props.collapsed ? null : props.children}
    </View>
  )
}
const s = StyleSheet.create({
  card: { marginHorizontal: M.cardInset, marginBottom: M.cardGap, borderRadius: M.radiusCard, overflow: 'hidden' },
  head: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '500', marginRight: 6 }
})
