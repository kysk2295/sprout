// + 버튼(FAB — 지름 60 · 탭 알약 위 17 · 오른쪽 20 [영상 실측 research 34]). 할 일·캘린더 탭이 같이 쓴다.
// 화면이 가려지면(빠른 입력·상세 시트·검색 등 위에 다른 화면이 올라오면) 숨긴다 — 틱틱처럼 시트 위로 + 가 비쳐 보이지 않게.
// 보이는 동안은 fabShown 이 true 라서 토스트가 + 버튼 위로 올라간다(21 §2 "탭 바·+ 버튼 위").
import { useIsFocused } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { useEffect, useSyncExternalStore } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'
import { M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { useTabBarSpace } from './tabBarSpace'
import { DUR, popIn, PRESS } from './motion'

const appear = popIn(0.8)
import { PressableScale } from './Pressables'

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
    // 39 §4.9: 나타날 때 0.8 → 1 + 옅게, 누르면 0.92로 눌렸다 스프링
    <Animated.View entering={appear} exiting={FadeOut.duration(DUR.fast)} style={[s.wrap, { bottom: space.fabBottom }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        scale={PRESS.fab}
        style={[s.fab, { backgroundColor: p.accent, shadowOpacity: p.dark ? 0.5 : 0.22 }]}
      >
        <Plus size={28} color="#fff" strokeWidth={2.4} />
      </PressableScale>
    </Animated.View>
  )
}
const s = StyleSheet.create({
  wrap: { position: 'absolute', right: M.fabRight },
  fab: { width: M.fab, height: M.fab, borderRadius: M.fab / 2, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 8 }
})
