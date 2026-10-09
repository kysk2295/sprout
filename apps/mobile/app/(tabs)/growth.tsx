// 성장 탭(23 · 43 §18.2 v0.2/v0.3, 시안 character-raising-v2 A): 장면이 화면 위 끝까지 + 큰 제목·유리 칩 + 받침 위 캐릭터 + 유리 HUD →
// 흰 시트(위 모서리 26): 옷장 · 도감 · 트로피 + 이번 주 목표 · 진화 길 · 이번 주 XP · 점검 · 리포트.
// 레벨업(무대에서 1.3초) · 진화(전체 화면 2.5초, 꼬마 → 친구 고르기)는 앱이 앞으로 올 때·이 탭을 열 때 확인한다(23 §4) → 0.7초 뒤 새 옷 카드.
// 하루 장면(43 §4.2)은 이 탭을 그날 처음 볼 때 한 번. 연속 칩은 없다(한 날 누적 칩만). 휴대폰은 AI·주간 마감을 하지 않는다(M-G2).
import { ReviewEntry } from '../../src/map/v2/ReviewEntry'
import { useStatus } from '@powersync/react-native'
import { loadProjectDeadlineToday } from '@sprout/schema/raiseCore'
import { SPECIES, type Species } from '@sprout/schema/growth'
import { dayJustDone, equipItem, isBusy, isNight, ITEM_BY_ID, momentLine, pickDayMoment, tapLines, TOUCH_LINES, trophyLine, type CharacterItemRow, type DayMoment } from '@sprout/schema/wardrobe'
import { addDays } from '@sprout/schema/time'
import { useIsFocused, useRouter } from 'expo-router'
import { MoreHorizontal } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { currentUserId, syncNow } from '../../src/data/auth'
import { coreDb } from '../../src/data/db'
import { taskDone, xpGained } from '../../src/data/events'
import { useLiveQuery } from '../../src/data/rows'
import { CharacterArt } from '../../src/growth/art/CharacterArt'
import { EvolutionRoad, GoalsCard, ReportsCard, TodayCard, XpCard } from '../../src/growth/Cards'
import { useGrowthData } from '../../src/growth/data'
import { EvolutionMoment, type Evolution } from '../../src/growth/EvolutionMoment'
import { levelChange, minutesToday } from '../../src/growth/logic'
import { useMotionReduced, writeMotionPref } from '../../src/growth/motion'
import { NewItemToast } from '../../src/growth/NewItemToast'
import { onFresh, saveLook, takeFresh, useRaise } from '../../src/growth/raise'
import { RenameModal } from '../../src/growth/RenameModal'
import { RaiseStage, type StageHandle } from '../../src/growth/Stage'
import { KEY, keysFor, preload, read, write } from '../../src/growth/store'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { PopMenu, useAnchor } from '../../src/ui/Menu'
import { SoftIcon } from '../../src/ui/SoftIcon'
import { useTabBarSpace } from '../../src/ui/tabBarSpace'
import { useToast } from '../../src/ui/Toast'

/** 새 옷 카드 순서: 레벨 선물 먼저, 그중 높은 레벨(방금 오른 레벨 · 진화 선물)부터 — 나머지(한 날·계절…)는 `외 N개` */
const giftLv = (r: CharacterItemRow) => { const rule = ITEM_BY_ID[r.item_id]?.rule; return rule && 'lv' in rule ? rule.lv : 0 }
const giftOrder = (a: CharacterItemRow, b: CharacterItemRow) => giftLv(b) - giftLv(a)

export default function Growth() {
  const p = usePalette()
  const space = useTabBarSpace()
  const ins = useSafeAreaInsets()
  const router = useRouter()
  const focused = useIsFocused()
  const status = useStatus()
  const reduced = useMotionReduced()
  const appToast = useToast()

  // 오늘·지금 시(자정·앞으로 올 때 다시)
  const [today, setToday] = useState(dayKey)
  const [hour, setHour] = useState(() => new Date().getHours())
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { setActive(st === 'active'); if (st === 'active') { setToday(dayKey()); setHour(new Date().getHours()) } })
    const t = setInterval(() => { setToday(dayKey()); setHour(new Date().getHours()) }, 60_000)
    return () => { sub.remove(); clearInterval(t) }
  }, [])
  useEffect(() => { if (focused) setToday(dayKey()) }, [focused])

  const g = useGrowthData(today)
  const raise = useRaise()
  const species: Species | null = raise.species
  const cid = raise.character?.id
  const lv = g.progress.level
  const name = species ? (raise.character?.name || SPECIES[species].name.split(' ').pop()!) : '씨앗'

  // 오늘 마감(하루 장면·칩) · 일정 합
  const dueTotal = useLiveQuery<{ n: number }>('SELECT count(*) n FROM tasks WHERE deleted_at IS NULL AND status IN (0, 1) AND due_at >= ? AND due_at < ?', [today, addDays(today, 1)]).data[0]?.n ?? 0
  const dueOpen = g.stats.todayOpen
  const evRows = useLiveQuery<{ start_at: string; end_at: string }>('SELECT start_at, end_at FROM events WHERE deleted_at IS NULL AND is_all_day = 0 AND start_at < ? AND end_at > ?', [addDays(today, 1), today]).data
  const eventMinutes = minutesToday(evRows, today)

  // 기기에 둔 값(본 레벨·하루 장면·움직임)을 먼저 읽는다
  const [storeReady, setStoreReady] = useState<string | null>(null)
  const uid = currentUserId()
  const readyKey = `${uid ?? ''}|${cid ?? ''}|${today}`
  useEffect(() => { let alive = true; void preload(keysFor(cid, today, uid)).then(() => { if (alive) setStoreReady(readyKey) }); return () => { alive = false } }, [cid, today, uid, readyKey])
  const ready = storeReady === readyKey && g.loaded
  const live = focused && active
  const stage = useRef<StageHandle>(null)

  // ── 새 옷 카드(43 §5.5) ──
  const [toast, setToast] = useState<CharacterItemRow[] | null>(null)
  const [evo, setEvo] = useState<Evolution | null>(null)
  const evoOn = useRef(false)
  const showFresh = useCallback(() => {
    if (evoOn.current) return
    const rows = takeFresh()
    if (!rows.length) return
    const trophy = rows.find((r) => r.kind === 'trophy')
    if (trophy) { stage.current?.say(TOUCH_LINES.trophy); stage.current?.hop() }
    // 레벨 선물이 먼저(레벨업 바로 뒤 카드가 그 레벨 옷이게), 나머지(한 날·계절…)는 `외 N개`
    const items = rows.filter((r) => r.kind === 'item').sort(giftOrder)
    // 카드가 떠 있는 중에 또 열리면(한 날 7일 → 곧 레벨업) 합쳐서 `외 N개`로, 같은 자리의 완료 토스트는 치운다
    if (items.length) setTimeout(() => { appToast.hide(); setToast((prev) => { const all = [...items, ...(prev ?? []).filter((r) => !items.some((x) => x.id === r.id))]; return all.sort(giftOrder) }) }, 700)
    else if (trophy) setTimeout(() => stage.current?.say(trophyLine(trophy)), 2700)
  }, [appToast])
  useEffect(() => { if (!live) return; showFresh(); return onFresh(() => showFresh()) }, [live, showFresh])
  const wear = (itemId: string) => {
    setToast(null)
    if (!cid) return
    void saveLook(cid, equipItem(raise.look, itemId))
    stage.current?.feel('happy', 2000); stage.current?.hop()
    stage.current?.say(ITEM_BY_ID[itemId]?.slot === 'bg' ? TOUCH_LINES.bg : TOUCH_LINES.wear)
  }

  // ── 레벨업 · 진화(23 §4): 처음 보는 기기는 기준만. 첫 동기화 전에는 보지 않는다 ──
  useEffect(() => {
    if (!ready || !focused || !active || !status.hasSynced || evo) return
    const key = cid ?? 'none'
    const seenRaw = read(KEY.seenLevel(key))
    const ch = levelChange(seenRaw ? Number(seenRaw) : null, lv)
    const stamp = () => { write(KEY.seenLevel(key), String(lv)); write(KEY.seenLevelAt(key), new Date().toISOString()) }
    if (ch.kind === 'baseline') stamp()
    else if (ch.kind === 'evolve' && species) {
      stamp(); evoOn.current = true
      setEvo({ species, from: ch.prevStage, to: ch.stage, path: raise.look.path, eq: raise.worn, choose: ch.prevStage < 3 && ch.stage >= 3 })
    } else if (ch.kind === 'levelup' || ch.kind === 'evolve') { stamp(); stage.current?.levelUp(lv) }
  }, [ready, focused, active, status.hasSynced, lv, cid, species, evo]) // eslint-disable-line react-hooks/exhaustive-deps
  const evoDone = () => { setEvo(null); evoOn.current = false; stage.current?.levelUp(lv); showFresh() }

  // ── 하루 장면(43 §4.2): 그날 처음 이 탭을 볼 때 한 번 ──
  const [calm, setCalm] = useState(false)
  const night = isNight(hour)
  const playMoment = (m: DayMoment) => {
    const st = stage.current
    if (!st) return
    const line = momentLine(m, { dueOpen })
    if (m === 'morning') st.wave(line)
    if (m === 'busy') { setCalm(true); st.feel('smile'); st.say(line, 3200) }
    if (m === 'deadline') { st.holdFor('flag', 3400); st.hop(2); st.say(line, 3200) }
    if (m === 'dayDone') { st.feel('happy', 2600); st.hop(2); st.burst(14, 120); st.say(line, 3000) }
  }
  useEffect(() => {
    if (!ready || !live || !species || evo) return
    if (read(KEY.dayMoment(today, cid))) { setCalm(isBusy({ dueTotal, eventMinutes })); return }
    let alive = true
    void loadProjectDeadlineToday(coreDb, today).catch(() => false).then((projectDeadline) => {
      if (!alive) return
      const m = pickDayMoment({ hour, dueOpen, dueTotal, eventMinutes, projectDeadline, shownToday: !!read(KEY.dayMoment(today, cid)) })
      if (!m) return
      write(KEY.dayMoment(today, cid), m)
      setTimeout(() => playMoment(m), 700)
    })
    return () => { alive = false }
  }, [ready, live, species, today, evo]) // eslint-disable-line react-hooks/exhaustive-deps
  // 하루 다 함: 오늘 마감을 모두 끝낸 순간(0개인 날은 장면 없음)
  const prevDue = useRef({ dueOpen, dueTotal })
  useEffect(() => {
    const before = prevDue.current
    prevDue.current = { dueOpen, dueTotal }
    if (!ready || !live || !species || read(KEY.dayDone(today, cid))) return
    if (dayJustDone(before, { dueOpen })) { write(KEY.dayDone(today, cid), '1'); setTimeout(() => playMoment('dayDone'), 900) }
  }, [dueOpen, dueTotal]) // eslint-disable-line react-hooks/exhaustive-deps

  // 보는 중에 들어온 XP · 할 일 완료 → 캐릭터 반응
  useEffect(() => {
    if (!focused) return
    const offXp = xpGained.on((n) => stage.current?.xp(n))
    const offDone = taskDone.on(() => { stage.current?.feel('happy', 2200); stage.current?.hop() })
    return () => { offXp(); offDone() }
  }, [focused])

  // 누르기 말풍선(43 §3.2 · 10 §3.2.4)
  const lineN = useRef(0)
  const lines = useCallback(() => {
    const all = tapLines({ level: lv, dueOpen, xpLeft: g.progress.toNext - g.progress.into, busy: calm })
    return all[lineN.current++ % all.length]
  }, [lv, dueOpen, g.progress, calm])

  // 첫 실행: 캐릭터가 없으면 성향 조사를 한 번 권한다(B5)
  const [laterCard, setLaterCard] = useState(false)
  useEffect(() => {
    if (!ready || !uid || !focused || !status.hasSynced || species || read(KEY.surveyOffered(uid)) === '1') return
    write(KEY.surveyOffered(uid), '1')
    router.push('/growth/survey')
  }, [ready, uid, focused, status.hasSynced, species, router])

  const menu = useAnchor()
  const [rename, setRename] = useState(false)
  const [road, setRoad] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = async () => { setRefreshing(true); try { await syncNow() } finally { setRefreshing(false) } }
  const freshDot = raise.fresh.size > 0

  return (
    <View style={{ flex: 1, backgroundColor: p.cardBg }}>
      <PopMenu anchor={menu.rect} onClose={menu.close} items={[
        { key: 'rename', label: '캐릭터 이름 바꾸기', disabled: !species, onPress: () => setTimeout(() => setRename(true), 350) },
        { key: 'decorate', label: '꾸미기', disabled: !species, onPress: () => router.push('/growth/decorate') },
        { key: 'dex', label: '도감', disabled: !species, onPress: () => router.push({ pathname: '/growth/decorate', params: { tab: 'dex' } }) },
        { key: 'rules', label: 'XP 규칙 보기', onPress: () => router.push('/growth/rules') },
        { key: 'survey', label: species ? '성향 다시 조사하기' : '성향 조사하기', onPress: () => router.push('/growth/survey') },
        { key: 'motion', label: '움직임 줄이기', checked: reduced, onPress: () => writeMotionPref(!reduced) }
      ]} />
      <ScrollView
        style={{ backgroundColor: p.cardBg }}
        onScrollBeginDrag={() => setRoad(null)}
        contentContainerStyle={{ paddingBottom: space.pad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={ins.top} />}
      >
        <RaiseStage ref={stage} p={p} raise={raise} name={name} topInset={ins.top} reduced={reduced} live={live && !evo}
          night={night} calm={calm} todayDone={dueTotal - dueOpen} todayTotal={dueTotal} lines={lines} onEgg={() => router.push('/growth/survey')} />
        <View style={[s.sheet, { backgroundColor: p.cardBg }]}>
          {species ? (
            <View style={s.quick}>
              {([['ward', '옷장', 'growth'], ['dex', '도감', 'book'], ['tro', '트로피', 'trophy']] as const).map(([k, label, icon]) => (
                <Pressable key={k} style={({ pressed }) => [s.qb, { backgroundColor: p.bgSelected }, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityRole="button" accessibilityLabel={label}
                  onPress={() => router.push(k === 'ward' ? '/growth/decorate' : { pathname: '/growth/decorate', params: k === 'dex' ? { tab: 'dex' } : { tab: 'dex', focus: 'trophy' } })}>
                  <SoftIcon name={icon} size={30} />
                  <Text style={[s.qbT, { color: p.textPrimary }]}>{label}</Text>
                  {k === 'ward' && freshDot ? <View style={[s.qbDot, { backgroundColor: p.accent }]} /> : null}
                </Pressable>
              ))}
            </View>
          ) : !laterCard ? (
            <View style={[s.surveyCard, { backgroundColor: p.bgSelected }]}>
              <View style={s.sils}>{(['snail', 'bee', 'worm', 'frog'] as Species[]).map((sp) => <CharacterArt key={sp} species={sp} stage={2} size={40} silhouette={p.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'} />)}</View>
              <Text style={[s.surveyTitle, { color: p.textPrimary }]}>나와 닮은 친구를 찾아볼까요?</Text>
              <Text style={[s.surveySub, { color: p.textSecondary }]}>할 일을 다루는 방식을 8가지만 물어볼게요. 조사 전에도 XP는 그대로 쌓여요.</Text>
              <Pressable style={[s.surveyBtn, { backgroundColor: p.accent }]} onPress={() => router.push('/growth/survey')} accessibilityRole="button"><Text style={s.surveyBtnText}>시작하기</Text></Pressable>
              <Pressable onPress={() => setLaterCard(true)} hitSlop={8} accessibilityRole="button"><Text style={[s.later, { color: p.textTertiary }]}>나중에</Text></Pressable>
            </View>
          ) : null}
          {ready ? (
            <>
              {species ? <TodayCard p={p} today={today} /> : null}
              <GoalsCard p={p} today={today} week={g.week} goals={g.goals} xpIds={g.xpIds} drafts={g.drafts} draftUsed={g.draftUsed} reduced={reduced} />
              <EvolutionRoad p={p} species={species} level={lv} stage={g.progress.stage} open={road} onOpen={setRoad} />
              <XpCard p={p} events={g.events} week={g.week} today={today} />
              <ReviewEntry />
              <ReportsCard p={p} reports={g.reports} />
            </>
          ) : null}
        </View>
      </ScrollView>
      <View ref={menu.ref} collapsable={false} style={[s.menuBtn, { top: ins.top + 6 }]}>
        <GlassButton label="성장 메뉴" onPress={menu.open}><MoreHorizontal size={20} color={p.textPrimary} /></GlassButton>
      </View>
      {toast ? <NewItemToast rows={toast} level={lv} bottom={space.clear + 12} reduced={reduced} onWear={wear} onClose={() => setToast(null)} /> : null}
      <EvolutionMoment evo={evo} reduced={reduced} onPick={(path) => { if (cid) void saveLook(cid, { ...raise.look, path }) }} onDone={evoDone} />
      <RenameModal p={p} visible={rename} initial={name} today={today} onClose={() => setRename(false)} />
    </View>
  )
}

const s = StyleSheet.create({
  sheet: { marginTop: -12, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 16 },
  menuBtn: { position: 'absolute', right: 14 },
  quick: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 4 },
  qb: { flex: 1, borderRadius: 16, paddingTop: 10, paddingBottom: 9, alignItems: 'center', gap: 5 },
  qbT: { fontSize: 12.5, fontWeight: '600' },
  qbDot: { position: 'absolute', top: 8, right: 14, width: 7, height: 7, borderRadius: 4 },
  surveyCard: { marginHorizontal: 12, borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
  sils: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  surveyTitle: { fontSize: 17, fontWeight: '700' },
  surveySub: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  surveyBtn: { alignSelf: 'stretch', height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  surveyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  later: { fontSize: 14, paddingVertical: 6 }
})
