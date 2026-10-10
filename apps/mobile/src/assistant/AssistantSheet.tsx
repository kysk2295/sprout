// 27 D3 빠른 진입: 오늘 머리 오른쪽 둥근 ✦(강조색) → 반 시트(키보드 위 약 300, 끌어 올리면 전체).
// 머리 `AI 비서` + 상태 알약 · ↗(전체 화면) · ×. 대화·초안은 전체 화면과 같다(store). 닫아도 요청은 계속(13 §4 Esc).
// 쓰는 법(오늘 머리 담당): <AssistantButton /> 를 머리 오른쪽에 두면 된다. 버튼이 시트를 직접 띄운다(루트 경로 등록 불필요).
import { useRouter } from 'expo-router'
import { Maximize2, Sparkles, X } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '../theme/ThemeProvider'
import { BottomSheet } from '../ui/BottomSheet'
import { GlassButton } from '../ui/Glass'
import { AssistantChat, StatusPill } from './AssistantChat'
import { useAssistant } from './store'

export function AssistantSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const p = usePalette()
  const router = useRouter()
  const a = useAssistant()
  const insets = useSafeAreaInsets()
  // 키보드가 없으면 입력창을 홈 표시줄(iOS)·제스처 막대(Android) 위로 올린다. 키보드가 있으면 시트가 키보드 위에 붙는다
  const [kb, setKb] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false))
    return () => { show.remove(); hide.remove() }
  }, [])
  const head = (
    <View style={s.head}>
      <Text style={[s.title, { color: p.textPrimary }]}>AI 비서</Text>
      <StatusPill a={a} />
      <View style={{ flex: 1 }} />
      <GlassButton label="전체 화면" plain onPress={() => { onClose(); router.push('/assistant') }}><Maximize2 size={18} color={p.textSecondary} /></GlassButton>
      <GlassButton label="닫기" plain onPress={onClose}><X size={20} color={p.textSecondary} /></GlassButton>
    </View>
  )
  return (
    <BottomSheet visible={visible} onClose={onClose} mid={0.62} head={head} label="AI 비서">
      <View style={{ flex: 1, paddingBottom: kb ? 10 : Math.max(insets.bottom, 10) }}>
        <AssistantChat a={a} variant="sheet" autoFocus bleed={{ bottom: kb ? 10 : Math.max(insets.bottom, 10) }} />
      </View>
    </BottomSheet>
  )
}

/** 오늘 머리 ✦ 버튼(강조색) — 누르면 반 시트 */
export function AssistantButton({ plain }: { plain?: boolean } = {}) {
  const p = usePalette()
  const [open, setOpen] = useState(false)
  return (
    <>
      <GlassButton plain={plain} label="AI 비서" onPress={() => setOpen(true)}><Sparkles size={19} color={p.accent} /></GlassButton>
      <AssistantSheet visible={open} onClose={() => setOpen(false)} />
    </>
  )
}
const s = StyleSheet.create({
  head: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700' }
})
