// iOS 휠 모양 고르기(시안 E .wheel): 가운데 줄이 선택, 위아래 2줄씩 흐리게. 끌어서 멈춘 칸이 값.
// 네이티브 의존성 없이 ScrollView 스냅으로 만든다(Android도 같은 모양).
import { hx } from './haptics'
import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { usePalette } from '../theme/ThemeProvider'

const ITEM = 36
const VISIBLE = 5

function Column({ items, index, onChange, width, label }: { items: string[]; index: number; onChange: (i: number) => void; width: number; label: string }) {
  const p = usePalette()
  const ref = useRef<ScrollView>(null)
  const current = useRef(index)
  useEffect(() => {
    if (current.current !== index) {
      current.current = index
      ref.current?.scrollTo({ y: index * ITEM, animated: true })
    }
  }, [index])
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM)))
    if (i !== current.current) {
      current.current = i
      hx.tick()
      onChange(i)
    }
  }
  return (
    <ScrollView
      ref={ref}
      style={{ width, height: ITEM * VISIBLE }}
      contentOffset={{ x: 0, y: index * ITEM }}
      contentContainerStyle={{ paddingVertical: ITEM * 2 }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      nestedScrollEnabled
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) settle(e) }}
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index] }}
      accessibilityRole="adjustable"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const i = Math.max(0, Math.min(items.length - 1, index + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))
        if (i !== index) onChange(i)
      }}
    >
      {items.map((it, i) => (
        // 위아래 칸을 눌러도 그 값으로(iOS 휠과 같음)
        <Pressable key={`${it}-${i}`} style={s.item} accessibilityLabel={`${label} ${it}`} onPress={() => { if (i !== current.current) { current.current = i; ref.current?.scrollTo({ y: i * ITEM, animated: true }); hx.tick(); onChange(i) } }}>
          <Text style={[s.text, i === index ? { color: p.textPrimary, fontWeight: '500' } : { color: p.textQuaternary }]}>{it}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

/** 여러 열 휠. columns[i].index는 지금 고른 칸 */
export function Wheel({ columns }: { columns: { items: string[]; index: number; onChange: (i: number) => void; width?: number; label: string }[] }) {
  const p = usePalette()
  return (
    <View style={s.wrap}>
      <View pointerEvents="none" style={[s.band, { backgroundColor: p.bgSelected }]} />
      {columns.map((c) => <Column key={c.label} {...c} width={c.width ?? 70} />)}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  band: { position: 'absolute', left: 10, right: 10, top: 6 + ITEM * 2, height: ITEM, borderRadius: 9 },
  item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 19, lineHeight: 24 }
})
