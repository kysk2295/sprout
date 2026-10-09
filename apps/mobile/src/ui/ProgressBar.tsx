// 진행 막대(44 §4 프로젝트 카드): 할 일 자리에서 유일하게 강조 그라데이션(강조 → 막대 끝 accentHi)을 쓰는 곳. 높이 6 · 둥근 끝.
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { usePalette } from '../theme/ThemeProvider'

export function ProgressBar({ ratio, style, height = 6 }: { ratio: number; style?: ViewStyle; height?: number }) {
  const p = usePalette()
  const w = Math.max(0, Math.min(1, ratio))
  return (
    <View style={[{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: p.dark ? '#282e29' : '#e4eae5' }, style]}>
      {w > 0 ? (
        <View style={{ width: `${w * 100}%`, height, borderRadius: height / 2, overflow: 'hidden' }}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs><LinearGradient id="pb" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={p.accent} /><Stop offset="1" stopColor={p.accentHi} /></LinearGradient></Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#pb)" />
          </Svg>
        </View>
      ) : null}
    </View>
  )
}
