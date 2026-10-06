// 세그먼트(시안 키트 .m-seg): 회색 트랙 + 고른 칸 흰 알약. 일기 쓰기·돌아보기, 작업 지도 목록·보드, 월·연.
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'

export function Segmented<T extends string>({ items, value, onChange, style, small, disabled }: {
  items: { key: T; label: string }[]; value: T; onChange: (v: T) => void; style?: ViewStyle; small?: boolean
  /** 누를 수 없는 칸(흐리게) — 주간 점검의 아직 안 간 단계 */
  disabled?: readonly T[]
}) {
  const p = usePalette()
  return (
    <View accessibilityRole="tablist" style={[s.track, { backgroundColor: p.segTrack, height: small ? 30 : 34 }, style]}>
      {items.map((it) => {
        const on = it.key === value
        const off = !on && !!disabled?.includes(it.key)
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: off }}
            disabled={off}
            onPress={() => onChange(it.key)}
            style={[s.item, off && { opacity: 0.4 }, on && { backgroundColor: p.segOn, shadowColor: '#000', shadowOpacity: p.dark ? 0.4 : 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
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
