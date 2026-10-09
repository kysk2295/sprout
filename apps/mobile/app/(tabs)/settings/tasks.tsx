// 설정 › 할 일(48): 만료 2주 지난 할 일 자동 정리 스위치 + 마지막 자동 정리 되돌리기. 값은 동기화되는 view_settings('autoTrash') —
// 데스크톱 설정 › 할 일과 같은 행. 옮기기는 서버가 하루 한 번(사용자 시간대) 한다.
import { lastBatch, parseAutoTrashSettings, SETTING_HINT, SETTING_LABEL, undoneText } from '@sprout/schema/autoTrash'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, Switch, Text, View } from 'react-native'
import { BATCHES_SQL, saveAutoTrash, SETTINGS_SQL, undoBatches, type VsRow } from '../../../src/data/autoTrash'
import { useLiveQuery } from '../../../src/data/rows'
import { FONT } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { GlassButton } from '../../../src/ui/Glass'
import { NavRow } from '../../../src/ui/Header'
import { useTabBarSpace } from '../../../src/ui/tabBarSpace'
import { useToast } from '../../../src/ui/Toast'

export default function TaskSettings() {
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const toast = useToast()
  const settings = parseAutoTrashSettings(useLiveQuery<VsRow>(SETTINGS_SQL).data[0]?.options_json)
  const last = lastBatch(useLiveQuery<VsRow>(BATCHES_SQL).data)
  const [busy, setBusy] = useState(false)
  const lastText = last ? `${Number(last.day.slice(5, 7))}월 ${Number(last.day.slice(8, 10))}일 · ${last.count}개` : '없음'
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow title="할 일" left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} right={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: space.pad }}>
        <Cells>
          <Cell first label={SETTING_LABEL} right={<Switch accessibilityLabel={SETTING_LABEL} value={settings.on} onValueChange={(v) => void saveAutoTrash(v)} trackColor={{ true: p.accent }} />} />
          <Cell
            label="마지막 자동 정리 되돌리기"
            value={lastText}
            chevron={false}
            onPress={last && !busy ? async () => { setBusy(true); try { toast.show(undoneText(await undoBatches([last.id]))) } finally { setBusy(false) } } : undefined}
          />
        </Cells>
        <Text style={[FONT.sub, { color: p.textTertiary, marginHorizontal: 30, marginTop: -6 }]}>
          {SETTING_HINT} 휴지통에서 언제든 되살릴 수 있어요. 컴퓨터와 같은 설정이에요.
        </Text>
      </ScrollView>
    </View>
  )
}
