// 성장 ⋯ → XP 규칙 보기(23 §2 머리 · 10 §6). 숫자는 공용 XP 상수에서.
import { STAGES, XP } from '@sprout/schema/growth'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'

export default function Rules() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const rows: [string, string][] = [
    ['할 일 완료', `+${XP.task} · 하루 ${XP.taskDailyCap}까지(밥그릇이 가득 차면 끝)`],
    ['같은 날 완료 취소', `−${XP.task} · 다음 날 취소는 그대로`],
    ['이번 주 목표 달성', `+${XP.kpi} · 한 주 ${XP.kpiXpLimit}개까지`],
    ['목표 2개 이상 모두 달성', `+${XP.kpiAll} 보너스`],
    ['같은 주에 목표 체크 풀기', '받은 XP를 되돌려요']
  ]
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.nav, { marginTop: insets.top }]}>
        <GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <Text style={[s.navTitle, { color: p.textPrimary }]}>XP 규칙</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        <View style={[s.card, { backgroundColor: p.cardBg }]}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
              <Text style={[s.k, { color: p.textPrimary }]}>{k}</Text>
              <Text style={[s.v, { color: p.textSecondary }]}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={[s.title, { color: p.textTertiary }]}>레벨과 단계</Text>
        <View style={[s.card, { backgroundColor: p.cardBg }]}>
          <View style={s.row}><Text style={[s.v, { color: p.textSecondary }]}>다음 레벨까지 40 + 20 × (레벨 − 1) XP. XP가 줄어도 레벨은 내려가지 않아요.</Text></View>
          {STAGES.map((st) => (
            <View key={st.stage} style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.borderRow }]}>
              <Text style={[s.k, { color: p.textPrimary }]}>{st.name}</Text>
              <Text style={[s.v, { color: p.textSecondary }]}>Lv {st.from}부터</Text>
            </View>
          ))}
        </View>
        <Text style={[s.foot, { color: p.textTertiary }]}>목표 새로 적기·주간 리포트 만들기는 컴퓨터의 성장 화면에서 해요. 휴대폰은 체크하고 읽어요.</Text>
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, overflow: 'hidden' },
  row: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, gap: 2, justifyContent: 'center' },
  k: { fontSize: 16 },
  v: { fontSize: 13, lineHeight: 18 },
  title: { fontSize: 13, paddingTop: 18, paddingHorizontal: 26 },
  foot: { fontSize: 12, lineHeight: 17, paddingHorizontal: 26, paddingTop: 12 }
})
