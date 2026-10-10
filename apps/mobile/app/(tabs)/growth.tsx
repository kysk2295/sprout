// 성장 탭(49 §6 성장 홈, 시안 character-v3 B): 3D 정원 장면이 상태 막대 뒤까지 끝까지 + 유리 머리·주 달력 띠 + 받침 위 캐릭터 + 유리 카드
// (Lv · 큰 % · 꼬리 칩 · 막대 · 옷장·도감·이번 주). v1.2(49 §6.0): 이 화면은 한 장 고정(스크롤·시트 없음). 나머지는 단추로 여는 팝업 시트:
// 이번 주 칸 = 이번 주 목표, Lv 카드 = 진화 길, 머리 `기록` = 이번 주 XP · 점검 · 리포트. 오늘 할 일 목록은 뺐다(할 일 탭과 같은 목록).
// 레벨업(무대에서 1.3초) · 진화(전체 화면 2.5초, 꼬마 → 친구 고르기)는 앱이 앞으로 올 때·이 탭을 열 때 확인한다(23 §4) → 0.7초 뒤 새 옷 카드.
// 하루 장면(43 §4.2)은 이 탭을 그날 처음 볼 때 한 번. 머리 알약 = 연속 불꽃(43 §19 — 해금은 누적 그대로), 이정표 3·7·14·30은 하루 한 번 작은 축하. 휴대폰은 AI·주간 마감을 하지 않는다(M-G2).
import { ReviewEntry } from '../../src/map/v2/ReviewEntry'
import { useStatus } from '@powersync/react-native'
import { loadProjectDeadlineToday } from '@sprout/schema/raiseCore'
import { MASCOT_NAME, sceneDark } from '@sprout/schema/characterArt'
import { SPECIES, type Species } from '@sprout/schema/growth'
import { activeDayList, dayJustDone, equipItem, isBusy, isNight, ITEM_BY_ID, momentLine, pickDayMoment, tapLines, TOUCH_LINES, trophyLine, type CharacterItemRow, type DayMoment } from '@sprout/schema/wardrobe'
import { addDays } from '@sprout/schema/time'
import { cheerLine, cheerStamp, cheerToShow, streakOf } from '@sprout/schema/streak'
import { useIsFocused, useRouter } from 'expo-router'
import { MoreHorizontal, ScrollText } from 'lucide-react-native'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { currentUserId } from '../../src/data/auth'
import { coreDb } from '../../src/data/db'
import { taskDone } from '../../src/data/events'
import { useLiveQuery } from '../../src/data/rows'
import { EvolutionRoad, ReportsCard, XpCard } from '../../src/growth/Cards'
import { GoalsSheet } from '../../src/growth/GoalsSheet'
import { goalsRatio } from '@sprout/schema/goalCore'
import { BottomSheet } from '../../src/ui/BottomSheet'
import { SheetHead } from '../../src/ui/SheetHead'
import { useGrowthData } from '../../src/growth/data'
import { EvolutionMoment, type Evolution } from '../../src/growth/EvolutionMoment'
import { dexCount } from '../../src/growth/home/dex'
import { glassTone, myScene } from '../../src/growth/home/glass'
import { levelChange, minutesToday, weekStartOf, WEEKDAY_KO } from '../../src/growth/logic'
import { useMotionReduced, writeMotionPref } from '../../src/growth/motion'
import { NewItemToast } from '../../src/growth/NewItemToast'
import { onFresh, saveLook, takeFresh, useRaise } from '../../src/growth/raise'
import { RenameModal } from '../../src/growth/RenameModal'
import { RaiseStage, type StageHandle, type WeekCell } from '../../src/growth/Stage'
import { KEY, keysFor, preload, read, write } from '../../src/growth/store'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { PopMenu, useAnchor } from '../../src/ui/Menu'
import { useTabBarSpace } from '../../src/ui/tabBarSpace'
import { useShake } from '../../src/growth/useShake'
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
  const night = isNight(hour)
  const sceneKey = myScene(raise.worn.bg, p.dark, hour)
  const species: Species | null = raise.species
  const cid = raise.character?.id
  const lv = g.progress.level
  const name = species ? (raise.character?.name || SPECIES[species].name.split(' ').pop()!) : MASCOT_NAME

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
  // 49 §7.1 흔들기 → 어지러움(성장 탭이 보이고 앱이 앞에 있을 때만 가속도계를 켠다. 움직임 줄이기면 맥박 + 생각 얼굴)
  useShake(live && !!species && !evo, () => { stage.current?.play('dizzy'); stage.current?.say(TOUCH_LINES.dizzy, 1800) })
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
      setEvo({ species, from: ch.prevStage, to: ch.stage, path: raise.look.path, eq: raise.worn, seed: raise.look.seed ?? 0, scene: sceneKey, choose: ch.prevStage < 3 && ch.stage >= 3 })
    } else if (ch.kind === 'levelup' || ch.kind === 'evolve') { stamp(); stage.current?.levelUp(lv) }
  }, [ready, focused, active, status.hasSynced, lv, cid, species, evo]) // eslint-disable-line react-hooks/exhaustive-deps
  const evoDone = () => { setEvo(null); evoOn.current = false; stage.current?.levelUp(lv); showFresh() }

  // ── 하루 장면(43 §4.2): 그날 처음 이 탭을 볼 때 한 번 ──
  const [calm, setCalm] = useState(false)
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

  // 들어온 XP → 머리 위 +N · 막대가 0.8초 동안 찬다(49 §6). 다른 탭에서 할 일을 끝내고 돌아와도(본 총 XP와 비교) 보인다
  const seenTotal = useRef<number | null>(null)
  useEffect(() => {
    if (!focused || !ready || !status.hasSynced) return
    const total = g.progress.total
    const before = seenTotal.current
    seenTotal.current = total
    if (before !== null && total > before) { const n = total - before; setTimeout(() => stage.current?.xp(n), 350) }
  }, [focused, ready, status.hasSynced, g.progress.total])
  useEffect(() => {
    if (!focused) return
    return taskDone.on(() => { stage.current?.feel('happy', 2200); stage.current?.hop() })
  }, [focused])

  // 누르기 말풍선(43 §3.2 · 10 §3.2.4)
  const lineN = useRef(0)
  const lines = useCallback(() => {
    const all = tapLines({ level: lv, dueOpen, xpLeft: g.progress.toNext - g.progress.into, busy: calm })
    return all[lineN.current++ % all.length]
  }, [lv, dueOpen, g.progress, calm])

  // 첫 실행: 캐릭터가 없으면 성향 조사를 한 번 권한다(B5)
  useEffect(() => {
    if (!ready || !uid || !focused || !status.hasSynced || species || read(KEY.surveyOffered(uid)) === '1') return
    write(KEY.surveyOffered(uid), '1')
    router.push('/growth/survey')
  }, [ready, uid, focused, status.hasSynced, species, router])

  const menu = useAnchor()
  const [rename, setRename] = useState(false)
  const [road, setRoad] = useState<number | null>(null)
  const freshDot = raise.fresh.size > 0

  // 장면(49 §6): 입은 배경 + 밤(다크 테마 또는 늦은 밤). 상태 막대 글자색은 장면 밝기에 따라, 시트를 열면 테마 그대로
  const win = useWindowDimensions()
  const H = win.height
  // 49 §6.0 팝업(누르면 열리는 시트 — 39 §4.4 BottomSheet: 아래로 끌기·바깥 누르기·✕로 닫힘)
  const [pop, setPop] = useState<'week' | 'road' | 'log' | null>(null)
  const [weekEmpty, setWeekEmpty] = useState(false) // 고정 칸이 `+ 목표 만들기`였으면 팝업을 열자마자 입력 커서
  const darkTop = sceneDark(sceneKey)
  const tone = glassTone(sceneDark(sceneKey)) // 49 §6.1 유리 톤 = 장면 밝기

  // 주 달력 띠: 이번 주(월~일) · 한 날(할 일 XP가 1 이상인 날 — 43 누적과 같은 계산)
  const week: WeekCell[] = useMemo(() => {
    const did = new Set(activeDayList(g.events))
    const start = weekStartOf(today)
    return Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return { day: d, label: WEEKDAY_KO[new Date(`${d}T12:00`).getDay()], num: Number(d.slice(8)), did: did.has(d), today: d === today } })
  }, [g.events, today])

  // 43 §19 연속 불꽃(오늘 아직이면 어제까지) — 이정표는 오늘 닿은 날 이 탭을 볼 때 한 번(기기 저장)
  const streak = useMemo(() => streakOf(activeDayList(g.events), today), [g.events, today])
  useEffect(() => {
    if (!ready || !live || !species || evo || !cid || !status.hasSynced) return
    const n = cheerToShow(streak, today, read(KEY.streakCheer(cid)))
    if (!n) return
    write(KEY.streakCheer(cid), cheerStamp(today, n))
    const t = setTimeout(() => stage.current?.cheer(cheerLine(n)), 900)
    return () => clearTimeout(t)
  }, [ready, live, species, evo, cid, status.hasSynced, streak, today])

  const menuBtn = (
    <View ref={menu.ref} collapsable={false} style={{ flexDirection: 'row', gap: 8 }}>
      {species ? (
        <Pressable onPress={() => setPop('log')} hitSlop={8} accessibilityRole="button" accessibilityLabel="기록 — 이번 주 XP · 주간 점검 · 리포트"
          style={({ pressed }) => [s.menuBtn, { backgroundColor: tone.bg, borderColor: tone.line }, pressed && { transform: [{ scale: 0.94 }] }]}>
          <ScrollText size={17} color={tone.ink} />
        </Pressable>
      ) : null}
      <Pressable onPress={menu.open} hitSlop={8} accessibilityRole="button" accessibilityLabel="성장 메뉴"
        style={({ pressed }) => [s.menuBtn, { backgroundColor: tone.bg, borderColor: tone.line }, pressed && { transform: [{ scale: 0.94 }] }]}>
        <MoreHorizontal size={18} color={tone.ink} />
      </Pressable>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: p.cardBg }}>
      {focused ? <StatusBar style={darkTop ? 'light' : 'dark'} /> : null}
      <PopMenu anchor={menu.rect} onClose={menu.close} items={[
        { key: 'rename', label: '캐릭터 이름 바꾸기', disabled: !species, onPress: () => setTimeout(() => setRename(true), 350) },
        { key: 'decorate', label: '꾸미기', disabled: !species, onPress: () => router.push('/growth/decorate') },
        { key: 'dex', label: '도감', disabled: !species, onPress: () => router.push({ pathname: '/growth/decorate', params: { tab: 'dex' } }) },
        { key: 'rules', label: 'XP 규칙 보기', onPress: () => router.push('/growth/rules') },
        { key: 'survey', label: species ? '성향 다시 조사하기' : '성향 조사하기', onPress: () => router.push('/growth/survey') },
        { key: 'motion', label: '움직임 줄이기', checked: reduced, onPress: () => writeMotionPref(!reduced) }
      ]} />
      {/* 49 §6.0 고정 화면 한 장 — 스크롤·시트 없음 */}
      <RaiseStage ref={stage} p={p} raise={raise} name={name} width={win.width} height={H} topInset={ins.top} bottomClear={space.clear} sceneKey={sceneKey}
        reduced={reduced} live={live && !evo && !pop} night={night} calm={calm} lines={lines} onEgg={() => router.push('/growth/survey')}
        week={week} dexN={dexCount(species, g.progress.stage)} freshDot={freshDot} streak={streak} menu={menuBtn}
        goals={{ done: g.goals.filter((x) => x.status === 'achieved').length, total: g.goals.length, ratio: goalsRatio(g.goals) }}
        onWard={() => router.push('/growth/decorate')}
        onDex={() => router.push({ pathname: '/growth/decorate', params: { tab: 'dex' } })}
        onWeek={() => { setWeekEmpty(!g.goals.length); setPop('week') }} onRoad={() => setPop('road')} />
      {/* 10 §4.6 `이번 주` 팝업 = 목표 편집기(만들기·이름·목표 수·세는 방법·삭제 되돌리기·순서) */}
      <GoalsSheet p={p} visible={pop === 'week' && ready} onClose={() => setPop(null)} today={today} week={g.week} drafts={g.drafts} draftUsed={g.draftUsed} reduced={reduced} focusAdd={weekEmpty} />
      <BottomSheet visible={pop === 'road' || pop === 'log'} onClose={() => { setPop(null); setRoad(null) }} mid={pop === 'log' ? 0.72 : 0.6}
        label={pop === 'road' ? '진화 길' : '기록'}
        head={<SheetHead compact title={pop === 'road' ? '진화 길' : '기록'} onClose={() => { setPop(null); setRoad(null) }} />}>
        <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: ins.bottom + 24 }} onScrollBeginDrag={() => setRoad(null)}>
          {ready && pop && pop !== 'week' ? (
            pop === 'road' ? <EvolutionRoad p={p} species={species} level={lv} stage={g.progress.stage} open={road} onOpen={setRoad} />
                : <>
                  <XpCard p={p} events={g.events} week={g.week} today={today} />
                  <ReviewEntry />
                  <ReportsCard p={p} reports={g.reports} />
                </>
          ) : null}
        </ScrollView>
      </BottomSheet>
      {toast ? <NewItemToast rows={toast} level={lv} bottom={space.clear + 12} reduced={reduced} onWear={wear} onClose={() => setToast(null)} /> : null}
      <EvolutionMoment evo={evo} reduced={reduced} onPick={(path) => { if (cid) void saveLook(cid, { ...raise.look, path }) }} onDone={evoDone} />
      <RenameModal p={p} visible={rename} initial={name} today={today} onClose={() => setRename(false)} />
    </View>
  )
}

const s = StyleSheet.create({
  menuBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth }
})
