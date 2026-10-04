// 29 §2.1 목표 줄 → 목표별 묶음: 이번 주 목표(성장 kpis) 이름 = 묶음 머리, 아래 연결된 할 일
import { useRouter } from 'expo-router'
import { ChevronLeft, Target } from 'lucide-react-native'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMapData, useMapOptions } from '../../src/map/data'
import { MapTaskRow } from '../../src/map/parts'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { BigTitle, NavRow } from '../../src/ui/Header'

export default function MapGoals() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [o] = useMapOptions()
  const data = useMapData({ ...o, period: 'all', showDone: true })
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        <BigTitle title="이번 주 목표" />
        {data.goals.map((g) => {
          const tasks = data.links.filter((l) => l.kind === 'goal' && l.state === 'accepted' && l.from_id === g.id).map((l) => data.byId.get(l.to_id)).filter((t) => !!t)
          return (
            <View key={g.id} style={{ marginBottom: 12 }}>
              <View style={s.head}><Target size={16} color="#e8a23a" /><Text style={{ color: p.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 }} numberOfLines={1}>{g.title}</Text><Text style={{ color: p.textTertiary, fontSize: 13 }}>{g.status === 'achieved' ? '달성' : `${tasks.filter((t) => t.status === 1).length}/${tasks.length}`}</Text></View>
              <View style={[s.card, { backgroundColor: p.cardBg }]}>
                {tasks.map((t, i) => <MapTaskRow key={t.id} task={t} data={data} first={i === 0} />)}
                {!tasks.length ? <Text style={{ color: p.textTertiary, padding: 14, fontSize: 13 }}>연결된 할 일이 없어요 · 할 일을 길게 눌러 연결해요</Text> : null}
              </View>
            </View>
          )
        })}
        {!data.goals.length ? <Text style={{ color: p.textTertiary, textAlign: 'center', marginTop: 40 }}>이번 주 목표가 없어요</Text> : null}
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 6 },
  card: { marginHorizontal: 12, borderRadius: 14, overflow: 'hidden' }
})
