// Android 뒤로 가기 = 맨 위 층부터 닫기(UX 점검 P2-4 — 서랍 Drawer.tsx와 같은 규칙).
// 화면 안에 열린 것(캘린더 날짜 판·수집함 검색 등)이 있으면 그것을 닫고 뒤로 가기를 먹는다. 탭이 안 보일 때(다른 탭·위에 다른 화면)는 걸지 않는다.
// Modal(시트·메뉴)은 onRequestClose가 맡으므로 여기에 쓰지 않는다.
import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'
import { BackHandler, Platform } from 'react-native'

export function useBackClose(active: boolean, close: () => void) {
  const f = useRef(close)
  f.current = close
  useFocusEffect(useCallback(() => {
    if (!active || Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { f.current(); return true })
    return () => sub.remove()
  }, [active]))
}
