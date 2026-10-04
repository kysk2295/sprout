// 27 D1 AI 비서 전체 화면(더보기 › AI 비서, 반 시트 ↗): 둥근 ‹ · 가운데 `AI 비서` + 상태 알약 · 오른쪽 연필(새 대화 — 13의 ⌘N 자리).
// 탭 바 없음(루트 스택 위 화면). 키보드가 올라오면 입력창이 키보드 위로.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, SquarePen } from 'lucide-react-native'
import { useEffect } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { GlassButton } from '../ui/Glass'
import { AssistantChat, StatusPill } from './AssistantChat'
import { clear, setDraft, useAssistant } from './store'

export default function AssistantScreen() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const a = useAssistant()
  // 빠른 입력 ✦ "AI에게": /assistant?draft=… 로 쓴 글을 넘긴다(27 M-A1 ②)
  const { draft } = useLocalSearchParams<{ draft?: string }>()
  useEffect(() => { if (draft) setDraft(draft) }, [draft])
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.cardBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.nav, { marginTop: insets.top, borderBottomColor: p.borderDivider }]}>
        <GlassButton label="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <View style={s.mid}>
          <Text style={[FONT.nav, { color: p.textPrimary }]}>AI 비서</Text>
          <StatusPill a={a} />
        </View>
        <GlassButton label="새 대화" disabled={a.busy || !a.messages.length} onPress={clear} style={a.busy || !a.messages.length ? { opacity: 0.4 } : undefined}>
          <SquarePen size={19} color={p.accent} />
        </GlassButton>
      </View>
      <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 8) }}>
        <AssistantChat a={a} variant="full" />
      </View>
    </KeyboardAvoidingView>
  )
}
const s = StyleSheet.create({
  nav: { height: M.navH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  mid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }
})
