// 키보드 피하기(2026-10-25 UX 점검 P1-2 · P2-1): 아래쪽 입력칸·단추가 키보드에 가리지 않게.
// iOS = KeyboardAvoidingView padding(그대로).
// Android = 전체 화면 그리기라 adjustResize여도 창이 줄지 않는다 → 키보드 높이 + 아래 제스처 막대만큼 아래 여백을 직접 둔다
// (BottomSheet · settings/account와 같은 보정 — Android 키보드 높이에는 제스처 막대가 빠져 있다).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const android = Platform.OS === 'android'

/** Android에서만 키보드가 덮는 높이(키보드 + 제스처 막대). iOS는 0 — KeyboardAvoidingView가 맡는다 */
export function useAndroidKeyboardPad(): number {
  const insets = useSafeAreaInsets()
  const bottom = useRef(insets.bottom)
  bottom.current = insets.bottom
  const [h, setH] = useState(0)
  useEffect(() => {
    if (!android) return
    const show = Keyboard.addListener('keyboardDidShow', (e) => setH(e.endCoordinates.height + bottom.current))
    const hide = Keyboard.addListener('keyboardDidHide', () => setH(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  return h
}

/** KeyboardAvoidingView 대신 — 두 플랫폼 모두 아래 여백으로 키보드를 피한다 */
export function KeyboardAvoid({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const pad = useAndroidKeyboardPad()
  if (!android) return <KeyboardAvoidingView behavior="padding" style={style}>{children}</KeyboardAvoidingView>
  return <View style={[style, pad ? { paddingBottom: pad } : null]}>{children}</View>
}
