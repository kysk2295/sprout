// 더보기 탭(시안 mobile-sprout A1, 20 §2 개정 2026-10-05): 맨 위 캐릭터 카드(→ 성장) → 기능(일기 · AI 비서 · 작업 지도 · 검색) → 앱(설정).
// 일기·작업 지도·AI 비서 화면은 각 담당 작업의 경로(app/diary · app/map · app/assistant)로 연다.
// [다음] 탭 바 고르기(틱틱처럼 5칸까지 켜고 끄기·끌어서 순서) — 20 §2
import { useQuery } from '@powersync/react-native'
import { progressFromEvents, SPECIES, STAGES, type Species } from '@sprout/schema/growth'
import { useRouter, type Href } from 'expo-router'
import { BookHeart, ChevronRight, Network, Search, Settings, Sparkles } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CharacterArt } from '../../../src/growth/art/CharacterArt'
import { dayKey } from '../../../src/lib/dates'
import { FONT, M } from '../../../src/theme/palette'
import { usePalette } from '../../../src/theme/ThemeProvider'
import { Cell, Cells } from '../../../src/ui/Cells'
import { SproutPot } from '../../../src/ui/EmptyState'
import { BigTitle, NavRow } from '../../../src/ui/Header'
import { tabBarBottom } from '../../../src/ui/Toast'

export default function More() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const events = useQuery<{ amount: number; created_at: string }>('SELECT amount, created_at FROM xp_events').data
  const ch = useQuery<{ name: string | null; species: Species | null }>('SELECT name, species FROM characters WHERE species IS NOT NULL LIMIT 1').data[0]
  const wrote = useQuery<{ n: number }>("SELECT count(*) AS n FROM diary_entries WHERE date = ? AND COALESCE(content, '') != ''", [dayKey()]).data[0]?.n ?? 0
  const prog = progressFromEvents(events)
  const stageName = STAGES.find((s) => s.stage === prog.stage)?.name ?? ''
  const white = { size: 17, color: '#fff' }
  const go = (href: string) => router.push(href as Href)
  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <NavRow />
      <BigTitle title="더보기" />
      <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarBottom(insets.bottom) + M.tabH + 30 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="성장 보기" onPress={() => router.navigate('/growth')} style={({ pressed }) => [s.card, { backgroundColor: pressed ? p.bgSelected : p.cardBg }]}>
          {ch?.species ? <CharacterArt species={ch.species} stage={prog.stage} size={46} mood="happy" /> : <SproutPot size={46} />}
          <View style={{ flex: 1 }}>
            <Text style={[FONT.bodyStrong, { color: p.textPrimary }]} numberOfLines={1}>
              {ch?.name || (ch?.species ? SPECIES[ch.species].name : '나와 닮은 친구')}
              <Text style={[FONT.meta, { color: p.textTertiary }]}>{`  Lv ${prog.level}${ch?.species ? ` · ${stageName}` : ''}`}</Text>
            </Text>
            <View style={[s.bar, { backgroundColor: p.bgSelected }]}>
              <View style={[s.fill, { backgroundColor: p.accent, width: `${Math.round((prog.into / Math.max(1, prog.toNext)) * 100)}%` }]} />
            </View>
          </View>
          <ChevronRight size={16} color={p.textQuaternary} />
        </Pressable>

        <Cells title="기능">
          <Cell first label="일기" value={wrote ? '오늘 썼어요' : '오늘 아직 안 씀'} icon={<BookHeart {...white} />} iconBg="#e5739b" onPress={() => go('/diary')} />
          <Cell label="AI 비서" icon={<Sparkles {...white} />} iconBg="#4e75f2" onPress={() => go('/assistant')} />
          <Cell label="작업 지도" icon={<Network {...white} />} iconBg="#3fb950" onPress={() => go('/map')} />
          <Cell label="검색" icon={<Search {...white} />} iconBg="#2bb3c0" onPress={() => go('/search')} />
        </Cells>
        <Cells title="앱">
          <Cell first label="설정" icon={<Settings {...white} />} iconBg="#8a8f99" onPress={() => router.navigate('/settings')} />
        </Cells>
      </ScrollView>
    </View>
  )
}
const s = StyleSheet.create({
  card: { marginHorizontal: M.cardInset, marginBottom: 6, borderRadius: M.radiusCard, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { height: 6, borderRadius: 3, marginTop: 7, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 }
})
