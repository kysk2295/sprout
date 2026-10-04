// 세그먼트(시안 키트 .m-seg): 회색 트랙 + 고른 칸 흰 알약. 일기 쓰기·돌아보기, 작업 지도 목록·보드, 월·연.
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'

export function Segmented<T extends string>({ items, value, onChange, style, small }: {
  items: { key: T; label: string }[]; value: T; onChange: (v: T) => void; style?: ViewStyle; small?: boolean
}) {
  const p = usePalette()
  return (
    <View accessibilityRole="tablist" style={[s.track, { backgroundColor: p.segTrack, height: small ? 30 : 34 }, style]}>
      {items.map((it) => {
        const on = it.key === value
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it.key)}
            style={[s.item, on && { backgroundColor: p.segOn, shadowColor: '#000', shadowOpacity: p.dark ? 0.4 : 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
          >
            <Text style={{ fontSize: small ? 13 : 14, fontWeight: on ? '600' : '500', color: on ? p.textPrimary : p.textSecondary }}>{it.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
const s = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  item: { flex: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }
})
