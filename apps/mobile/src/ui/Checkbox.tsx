// 체크박스 18(모서리 4, 테두리 = 우선순위 색, 안쪽 8% 같은 색), 누르는 칸 44(21 §2·§3)
import { Check } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import { alpha, priorityColor } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'

export function Checkbox(props: { priority: number; done: boolean; onPress?: () => void; size?: number; label?: string; disabled?: boolean; flash?: boolean }) {
  const p = usePalette()
  const size = props.size ?? 18
  const color = priorityColor(p, props.priority)
  const box = props.done
    ? { backgroundColor: props.flash ? color : p.textQuaternary, borderColor: props.flash ? color : p.textQuaternary }
    : { borderColor: color, backgroundColor: props.priority ? alpha(color, 0.08) : 'transparent' }
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.done, disabled: props.disabled }}
      accessibilityLabel={props.label ?? '완료'}
      disabled={props.disabled || !props.onPress}
      onPress={props.onPress}
      style={s.hit}
      hitSlop={6}
    >
      <View style={[s.box, { width: size, height: size }, box]}>{props.done ? <Check size={size - 6} color="#fff" strokeWidth={3} /> : null}</View>
    </Pressable>
  )
}
const s = StyleSheet.create({
  hit: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6, marginRight: -6 },
  box: { borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }
})
