// 세그먼트(시안 키트 .m-seg, 44 §4): 칸 면 트랙 + 고른 칸 흰 칸 + sh-1(다크 = 한 단계 밝은 칸). 일기 쓰기·돌아보기, 작업 지도 목록·보드, 월·연.
// 44 §4.1(2026-10-10): 트랙 = 글자색 반투명(라이트 10% · 다크 12%) + 머리카락 테두리 — 회색 바닥(pageBg)에서도 흰 카드에서도 보이게.
// 예전 segTrack(#EBEFEA)은 바닥 #F3F5F1과 대비 1.06으로 거의 안 보였다. 고른 칸 = 라이트 흰 칸 + 그림자·테두리, 다크 = 글자색 22%를 카드 면에 섞은 불투명 칸.
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { alpha, mix, type Palette } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

/** 세그먼트 색(트랙·고른 칸) — 공용(수집함 세그먼트도 같은 값) */
export function segColors(p: Palette) {
  return {
    track: alpha(p.textPrimary, p.dark ? 0.12 : 0.1),
    trackLine: alpha(p.textPrimary, p.dark ? 0.06 : 0.05),
    on: p.dark ? mix(p.textPrimary, p.cardBg, 0.22) : p.segOn, // 다크 = 불투명 한 단계 밝은 칸(반투명이면 iOS 그림자가 비쳐 탁해짐)
    onLine: alpha(p.textPrimary, p.dark ? 0.1 : 0.07),
    shadow: { shadowColor: p.dark ? '#000' : '#12281a', shadowOpacity: p.dark ? 0.35 : 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }
  }
}

export function Segmented<T extends string>({ items, value, onChange, style, small, disabled }: {
  items: { key: T; label: string }[]; value: T; onChange: (v: T) => void; style?: ViewStyle; small?: boolean
  /** 누를 수 없는 칸(흐리게) — 주간 점검의 아직 안 간 단계 */
  disabled?: readonly T[]
}) {
  const p = usePalette()
  const c = segColors(p)
  return (
    <View accessibilityRole="tablist" style={[s.track, { backgroundColor: c.track, borderColor: c.trackLine, height: small ? 30 : 34 }, style]}>
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
            style={[s.item, off && { opacity: 0.4 }, on && { backgroundColor: c.on, borderColor: c.onLine, ...c.shadow }]}
          >
            <Text style={{ fontSize: small ? 13 : 14, fontWeight: on ? '600' : '500', color: on ? p.textPrimary : p.textSecondary }}>{it.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
const s = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 12, padding: 2, borderWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }
})
