// 설정 › AI 비서(47 §8.4 결정 ③): `AI 비서가 일기도 볼 수 있게` — 기본 꺼짐, 이 기기에만(동기화 안 함).
// 일기에서 캐릭터와 나누기(일기 AI 동의, 28 §5)를 켠 기기에서만 켤 수 있다. 켜도 나만 보기 날·일기 대화 원문은 보내지 않는다.
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { ScrollView, Switch, Text, View } from 'react-native'
import { ASSISTANT_DIARY_HINT, ASSISTANT_DIARY_LABEL, ASSISTANT_DIARY_NEEDS } from '../../../src/assistant/core'
import { setAssistantDiary, useDiaryPrefs } from '../../../src/diary/prefs'
import { FONT } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'

export default function AssistantSettings() {
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const prefs = useDiaryPrefs()
  const consent = prefs.consent === true
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="AI 비서" left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} right={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: space.pad }}>
        <Cells>
          <Cell first label={ASSISTANT_DIARY_LABEL} right={<Switch accessibilityLabel={ASSISTANT_DIARY_LABEL} disabled={!consent} value={consent && prefs.assistantDiary} onValueChange={setAssistantDiary} trackColor={{ true: p.accent }} />} />
        </Cells>
        <Text style={[FONT.sub, { color: p.textTertiary, marginHorizontal: 30, marginTop: -6 }]}>
          {consent ? ASSISTANT_DIARY_HINT : `${ASSISTANT_DIARY_NEEDS}. ${ASSISTANT_DIARY_HINT}`} 이 기기에만 저장돼요.
        </Text>
      </ScrollView>
    </View>
  )
}
