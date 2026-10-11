// 27 D1 AI 비서 전체 화면(더보기 › AI 비서, 반 시트 ↗): 둥근 ‹ · 가운데 `AI 비서` + 상태 알약 · 오른쪽 연필(새 대화 — 13의 ⌘N 자리).
// 탭 바 없음(루트 스택 위 화면). 키보드가 올라오면 입력창이 키보드 위로.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, SquarePen } from 'lucide-react-native'
import { useEffect } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { sceneGlass } from '@sprout/schema/characterArt'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { GlassButton } from '../ui/Glass'
import { AssistantChat, StatusPill, useChatScene } from './AssistantChat'
import { clear, setDraft, useAssistant } from './store'

export default function AssistantScreen() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const a = useAssistant()
  // 빠른 입력 ✦ "AI에게": /assistant?draft=… 로 쓴 글을 넘긴다(27 M-A1 ②)
  const { draft } = useLocalSearchParams<{ draft?: string }>()
  useEffect(() => { if (draft) setDraft(draft) }, [draft])
  // 49 §8 표: 빈 대화는 장면이 상태 막대·머리 뒤부터 홈 표시줄까지 끝까지 깔린다 — 머리는 투명(선 없음), 글자는 장면 밝기 색
  const sc = useChatScene(a)
  const ink = sc.tone.ink // 장면이 늘 깔린다(대화 중에도) — 머리 글자는 장면 밝기 색
  const bottom = Math.max(insets.bottom, 8)
  // 머리 버튼 = 장면 유리(어두운 장면 = 짙은 유리 + 흰 아이콘) — 앱 기본 유리는 장면과 안 맞았다(사용자)
  const g = sceneGlass(sc.sceneKey)
  const btn = { backgroundColor: g.fill, borderColor: g.line }
  // 스크롤로 지난 대화를 보면 머리를 위로 숨긴다(장면이 머리 뒤까지 깔려 있어 빈 띠 없음)
  const hide = useSharedValue(0)
  const navSt = useAnimatedStyle(() => ({ opacity: 1 - hide.value, transform: [{ translateY: -hide.value * (insets.top + M.navH) }] }))
  const onHeader = (show: boolean) => { const v = show ? 0 : 1; if (hide.value !== v) hide.value = withTiming(v, { duration: 220 }) }
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.cardBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={[s.nav, { marginTop: insets.top, borderBottomColor: 'transparent' }, navSt]}>
        <GlassButton label="뒤로" style={btn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><ChevronLeft size={22} color={g.ink} /></GlassButton>
        <View style={s.mid}>
          <Text style={[FONT.nav, { color: ink }]}>AI 비서</Text>
          <StatusPill a={a} />
        </View>
        <GlassButton label="새 대화" disabled={a.busy || !a.messages.length} onPress={clear} style={{ ...btn, ...(a.busy || !a.messages.length ? { opacity: 0.4 } : null) }}>
          <SquarePen size={19} color={g.ink} />
        </GlassButton>
      </Animated.View>
      <View style={{ flex: 1, paddingBottom: bottom, zIndex: 1 }}>
        <AssistantChat a={a} variant="full" bleed={{ top: insets.top + M.navH, bottom }} onHeader={onHeader} />
      </View>
    </KeyboardAvoidingView>
  )
}
const s = StyleSheet.create({
  nav: { zIndex: 2, height: M.navH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  mid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }
})
