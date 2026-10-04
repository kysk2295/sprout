// 성장 탭 자리(23 — 캐릭터 방·주간 목표·리포트는 다음 작업이 만든다). 지금은 XP 원장으로 계산한 레벨만 보여 준다.
import { useQuery } from '@powersync/react-native'
import { progressFromEvents, SPECIES, STAGES, type Species } from '@sprout/schema/growth'
import { StyleSheet, Text, View } from 'react-native'
import { M } from '../../src/theme/palette'
import { usePalette } from '../../src/theme/ThemeProvider'
import { SproutPot } from '../../src/ui/EmptyState'
import { BigTitle, NavRow } from '../../src/ui/Header'

export default function Growth() {
  const p = usePalette()
  const events = useQuery<{ amount: number; created_at: string }>('SELECT amount, created_at FROM xp_events').data
  const ch = useQuery<{ species: Species | null; name: string | null }>('SELECT species, name FROM characters ORDER BY species IS NULL, assessed_at DESC LIMIT 1').data[0]
  const g = progressFromEvents(events)
  const stage = STAGES.find((s) => s.stage === g.stage)!
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow />
      <BigTitle title="성장" />
      <View style={[s.card, { backgroundColor: p.cardBg }]}>
        <SproutPot size={120} />
        <Text style={[s.lv, { color: p.textPrimary }]}>Lv {g.level} · {stage.name}</Text>
        {ch?.species ? <Text style={{ color: p.textSecondary }}>{ch.name ?? SPECIES[ch.species].name}</Text> : null}
        <View style={[s.track, { backgroundColor: p.bgSelected }]}>
          <View style={[s.fill, { backgroundColor: p.accent, width: `${Math.min(100, (g.into / g.toNext) * 100)}%` }]} />
        </View>
        <Text style={{ color: p.textTertiary, fontSize: 12 }}>{g.into} / {g.toNext} XP · 누적 {g.total} XP</Text>
        <Text style={{ color: p.textTertiary, fontSize: 12, marginTop: 10 }}>캐릭터 방·주간 목표는 곧 이 탭에 생겨요</Text>
      </View>
    </View>
  )
}
const s = StyleSheet.create({
  card: { marginHorizontal: M.cardInset, borderRadius: M.radiusCard, padding: 20, alignItems: 'center', gap: 6 },
  lv: { fontSize: 20, fontWeight: '700', marginTop: 6 },
  track: { alignSelf: 'stretch', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  fill: { height: 8, borderRadius: 4 }
})
