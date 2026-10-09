// 성장 탭(23 확정 v1.0, 시안 B1·B2): 머리 ⋯ + 큰 제목 "성장"(스크롤하면 가운데 작은 제목) →
// ① 캐릭터 방 ② XP 줄 ③ 요약 칩 ④ 진화 길 ⑤ 이번 주 목표 ⑥ 이번 주 XP ⑦ 주간 리포트.
// 레벨업·진화(23 §4)는 앱이 앞으로 올 때·이 탭을 열 때 확인한다. 휴대폰은 AI·주간 마감을 하지 않는다(M-G2).
import { ReviewEntry } from '../../src/map/v2/ReviewEntry'
import { useStatus } from '@powersync/react-native'
import { SPECIES, type Species } from '@sprout/schema/growth'
import { useIsFocused, useRouter } from 'expo-router'
import { MoreHorizontal } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { syncNow } from '../../src/data/auth'
import { CharacterArt } from '../../src/growth/art/CharacterArt'
import { EvolutionRoad, GoalsCard, ReportsCard, SummaryChips, XpCard } from '../../src/growth/Cards'
import { useGrowthData } from '../../src/growth/data'
import { LevelUpModal, type Shown } from '../../src/growth/LevelUp'
import { gainedSince, levelChange } from '../../src/growth/logic'
import { useMotionReduced, writeMotionPref } from '../../src/growth/motion'
import { RenameModal } from '../../src/growth/RenameModal'
import { GrowthRoom, ROOM_H } from '../../src/growth/Room'
import { KEY, keysFor, preload, read, write } from '../../src/growth/store'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { BigTitle, NavRow } from '../../src/ui/Header'
import { PopMenu, useAnchor } from '../../src/ui/Menu'
import { useTabBarSpace } from '../../src/ui/tabBarSpace'

export default function Growth() {
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const focused = useIsFocused()
  const status = useStatus()
  const reduced = useMotionReduced()

  // 오늘(자정·앞으로 올 때 다시)
  const [today, setToday] = useState(dayKey)
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { setActive(st === 'active'); if (st === 'active') setToday(dayKey()) })
    const t = setInterval(() => setToday(dayKey()), 60_000)
    return () => { sub.remove(); clearInterval(t) }
  }, [])
  useEffect(() => { if (focused) setToday(dayKey()) }, [focused])

  const g = useGrowthData(today)
  const species: Species | null = g.character?.species ?? null
  const cid = g.character?.id

  // 기기에 둔 값(본 레벨·본 때·장식·움직임)을 먼저 읽는다
  const [storeReady, setStoreReady] = useState<string | null>(null)
  useEffect(() => { let alive = true; void preload(keysFor(cid)).then(() => { if (alive) setStoreReady(cid ?? '') }); return () => { alive = false } }, [cid])
  const ready = storeReady === (cid ?? '') && g.loaded

  // 레벨업 · 진화(23 §4): 처음 보는 기기는 기준만 잡는다. 첫 동기화 전에는 보지 않는다(내려받는 XP를 레벨업으로 착각하지 않게)
  const [shown, setShown] = useState<Shown | null>(null)
  useEffect(() => {
    if (!ready || !focused || !active || !status.hasSynced || shown) return
    const key = cid ?? 'none'
    const seenRaw = read(KEY.seenLevel(key))
    const ch = levelChange(seenRaw ? Number(seenRaw) : null, g.progress.level)
    const stamp = () => { write(KEY.seenLevel(key), String(g.progress.level)); write(KEY.seenLevelAt(key), new Date().toISOString()) }
    if (ch.kind === 'baseline') stamp()
    else if (ch.kind === 'levelup' || ch.kind === 'evolve') {
      setShown({ ...ch, gained: gainedSince(g.events, ch.prev, read(KEY.seenLevelAt(key))) })
      stamp()
    }
  }, [ready, focused, active, status.hasSynced, g.progress.level, cid, g.events, shown])

  // 첫 실행: 캐릭터가 없으면 성향 조사를 한 번 권한다(B5 — "나중에"를 누르면 방에 알 + 카드가 남는다)
  const [laterCard, setLaterCard] = useState(false)
  useEffect(() => {
    if (!ready || !focused || !status.hasSynced || species || read(KEY.surveyOffered) === '1') return
    write(KEY.surveyOffered, '1')
    router.push('/growth/survey')
  }, [ready, focused, status.hasSynced, species, router])

  // 머리
  const menu = useAnchor()
  const [rename, setRename] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [road, setRoad] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = async () => { setRefreshing(true); try { await syncNow() } finally { setRefreshing(false) } }
  const name = species ? (g.character?.name || SPECIES[species].name) : '알'

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={scrolled ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.borderDivider } : undefined}>
        <NavRow
          title={scrolled ? '성장' : undefined}
          right={<View ref={menu.ref} collapsable={false}><GlassButton label="성장 메뉴" onPress={menu.open}><MoreHorizontal size={20} color={p.textPrimary} /></GlassButton></View>}
        />
      </View>
      <PopMenu anchor={menu.rect} onClose={menu.close} items={[
        { key: 'rename', label: '캐릭터 이름 바꾸기', disabled: !species, onPress: () => setTimeout(() => setRename(true), 350) },
        { key: 'rules', label: 'XP 규칙 보기', onPress: () => router.push('/growth/rules') },
        { key: 'survey', label: species ? '성향 다시 조사하기' : '성향 조사하기', onPress: () => router.push('/growth/survey') },
        { key: 'motion', label: '움직임 줄이기', checked: reduced, onPress: () => writeMotionPref(!reduced) }
      ]} />
      <ScrollView
        scrollEventThrottle={32}
        onScroll={(e) => { const y = e.nativeEvent.contentOffset.y; if (y > 40 !== scrolled) setScrolled(y > 40) }}
        onScrollBeginDrag={() => setRoad(null)}
        contentContainerStyle={{ paddingBottom: space.pad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.textTertiary} />}
      >
        <View style={s.wrap}>
          <BigTitle title="성장" />
          {!ready ? <Skeleton bg={p.cardBg} line={p.bgSelected} /> : (
            <>
              <GrowthRoom p={p} character={g.character} events={g.events} progress={g.progress} stats={g.stats} reduced={reduced} focused={focused} loaded={g.loaded} />
              {!species && !laterCard ? (
                <View style={[s.surveyCard, { backgroundColor: p.cardBg }]}>
                  <View style={s.sils}>{(['snail', 'bee', 'worm', 'frog'] as Species[]).map((sp) => <CharacterArt key={sp} species={sp} size={40} silhouette={p.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'} />)}</View>
                  <Text style={[s.surveyTitle, { color: p.textPrimary }]}>나와 닮은 친구를 찾아볼까요?</Text>
                  <Text style={[s.surveySub, { color: p.textSecondary }]}>할 일을 다루는 방식을 8가지만 물어볼게요. 조사 전에도 XP는 그대로 쌓여요.</Text>
                  <Pressable style={[s.surveyBtn, { backgroundColor: p.accent }]} onPress={() => router.push('/growth/survey')} accessibilityRole="button"><Text style={s.surveyBtnText}>시작하기</Text></Pressable>
                  <Pressable onPress={() => setLaterCard(true)} hitSlop={8} accessibilityRole="button"><Text style={[s.later, { color: p.textTertiary }]}>나중에</Text></Pressable>
                </View>
              ) : null}
              <SummaryChips p={p} weekDone={g.weekDone} streak={g.stats.streak} total={g.progress.total} />
              <EvolutionRoad p={p} species={species} level={g.progress.level} stage={g.progress.stage} open={road} onOpen={setRoad} />
              <GoalsCard p={p} today={today} week={g.week} goals={g.goals} xpIds={g.xpIds} drafts={g.drafts} draftUsed={g.draftUsed} reduced={reduced} />
              <XpCard p={p} events={g.events} week={g.week} today={today} />
              <ReviewEntry />
              <ReportsCard p={p} reports={g.reports} />
            </>
          )}
        </View>
      </ScrollView>
      <LevelUpModal p={p} shown={shown} species={species} reduced={reduced} onClose={() => setShown(null)} />
      <RenameModal p={p} visible={rename} initial={name} today={today} onClose={() => setRename(false)} />
    </View>
  )
}

/** 불러오는 중: 카드 자리 회색 막대(23 §3) */
function Skeleton({ bg, line }: { bg: string; line: string }) {
  return (
    <View>
      <View style={[s.skRoom, { backgroundColor: bg }]} />
      {[0, 1].map((i) => (
        <View key={i} style={[s.skCard, { backgroundColor: bg }]}>
          <View style={[s.skLine, { backgroundColor: line, width: '40%' }]} />
          <View style={[s.skLine, { backgroundColor: line, width: '80%' }]} />
          <View style={[s.skLine, { backgroundColor: line, width: '65%' }]} />
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  surveyCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
  sils: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  surveyTitle: { fontSize: 17, fontWeight: '700' },
  surveySub: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  surveyBtn: { alignSelf: 'stretch', height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  surveyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  later: { fontSize: 14, paddingVertical: 6 },
  skRoom: { height: ROOM_H, marginHorizontal: 12, borderRadius: 16 },
  skCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 14, gap: 10 },
  skLine: { height: 12, borderRadius: 6 }
})
