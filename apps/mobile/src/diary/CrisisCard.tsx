// 위기 안내 카드(28 §2.3 E3 + 15 §9.4 차분한 모양): 빨간 경고가 아니라 옅은 라벤더 카드. 움직임 없음, 화면 읽기 프로그램에 바로 알림.
// 번호 줄을 누르면 tel: → OS 전화 확인(28 M-D4). 전화를 못 거는 기기(시뮬레이터·아이패드)는 번호를 크게 보여 주는 토스트.
import { Phone } from 'lucide-react-native'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { CharacterArt } from '../growth/art/CharacterArt'
import { usePalette } from '../theme/ThemeProvider'
import { useToast } from '../ui/Toast'
import { diaryColors } from './art'
import { CRISIS_CARD, josa, type Buddy } from './logic'

export async function callNumber(n: string): Promise<boolean> {
  const url = `tel:${n}`
  try {
    // canOpenURL은 Info.plist 선언이 필요할 수 있어 바로 열고, 못 열면(시뮬레이터 등) 거부를 받는다
    await Linking.openURL(url)
    return true
  } catch { return false }
}

export function CrisisCard({ buddy, stage }: { buddy: Buddy; stage: number }) {
  const p = usePalette()
  const c = diaryColors(p)
  const toast = useToast()
  const call = async (n: string, label: string) => {
    if (!(await callNumber(n))) toast.show(`이 기기에서는 전화를 걸 수 없어요 · ${label} ${n}`, { duration: 5000 })
  }
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[s.card, { backgroundColor: c.calm, borderColor: c.calmEdge }]}>
      <View style={s.head}>
        <CharacterArt species={buddy.species} stage={stage} size={44} mood="default" />
        <Text style={[s.title, { color: p.textPrimary }]}>{CRISIS_CARD.title}</Text>
      </View>
      <Text style={[s.body, { color: p.textSecondary }]}>{CRISIS_CARD.intro}</Text>
      {CRISIS_CARD.lines.map((l, i) => (
        <View key={l.number} style={[s.line, { backgroundColor: i === 0 ? (p.dark ? '#ffffff1a' : '#ffffff') : (p.dark ? '#ffffff0d' : '#ffffffb3') }]}>
          <View style={{ flex: 1 }}>
            <Text selectable style={[s.num, { color: p.textPrimary }]}>{l.number}</Text>
            <Text style={[s.note, { color: p.textSecondary }]}>{l.label} · {l.note}</Text>
          </View>
          {l.tel.map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`${n === '15770199' ? '1577-0199' : n}에 전화 걸기`}
              onPress={() => void call(n, l.label)}
              style={({ pressed }) => [s.phone, { backgroundColor: l.tel.length > 1 ? p.danger : '#3fb950' }, pressed && { opacity: 0.7 }]}
            >
              {l.tel.length > 1 ? <Text style={s.phoneText}>{n}</Text> : <Phone size={18} color="#fff" />}
            </Pressable>
          ))}
        </View>
      ))}
      <Text style={[s.foot, { color: p.textTertiary }]}>{josa(buddy.name, '는', '은')} 상담사가 아니라서 진단이나 치료 이야기는 할 수 없어. 그래도 여기 있을게.</Text>
      <Text style={[s.hope, { color: p.textSecondary }]}>{CRISIS_CARD.hope}</Text>
    </View>
  )
}
const s = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderLeftWidth: 3, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  line: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  num: { fontSize: 18, lineHeight: 23, fontWeight: '800' },
  note: { fontSize: 12.5, lineHeight: 17 },
  phone: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  phoneText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  foot: { fontSize: 12.5, lineHeight: 18 },
  hope: { fontSize: 13, lineHeight: 19, fontWeight: '600' }
})
