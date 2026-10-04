// + 버튼(FAB, 20 §3 지름 56 · 탭 알약 위 14 · 오른쪽 18). 할 일·캘린더 탭이 같이 쓴다.
// 화면이 가려지면(빠른 입력·상세 시트·검색 등 위에 다른 화면이 올라오면) 숨긴다 — 틱틱처럼 시트 위로 + 가 비쳐 보이지 않게.
// 보이는 동안은 fabShown 이 true 라서 토스트가 + 버튼 위로 올라간다(21 §2 "탭 바·+ 버튼 위").
import { useIsFocused } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { useEffect, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { useTabBarSpace } from './tabBarSpace'

let shown = 0
const subs = new Set<() => void>()
const bump = (d: number) => { shown += d; subs.forEach((f) => f()) }
/** 지금 + 버튼이 화면에 떠 있나(토스트 위치용) */
export function useFabShown() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => shown > 0)
}

export function Fab({ onPress, label = '할 일 추가' }: { onPress: () => void; label?: string }) {
  const p = usePalette()
  const space = useTabBarSpace()
  const focused = useIsFocused()
  useEffect(() => {
    if (!focused) return
    bump(1)
    return () => bump(-1)
  }, [focused])
  if (!focused) return null
  return (
    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} style={[s.wrap, { bottom: space.fabBottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [s.fab, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1, shadowOpacity: p.dark ? 0.5 : 0.22 }]}
      >
        <Plus size={28} color="#fff" strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  )
}
const s = StyleSheet.create({
  wrap: { position: 'absolute', right: 18 },
  fab: { width: M.fab, height: M.fab, borderRadius: M.fab / 2, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 8 }
})
