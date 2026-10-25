// 28 §8·§9 일기: 머리 한 줄(‹ · 가운데 날짜 + 상태 → 기분 달력 · [오늘][✎ 또는 💬][📅][⋯]) + 그날 본문.
// 오늘 = 캐릭터와 대화(기본, Conversation) 또는 혼자 쓰기(SoloWrite — 메모장 + 저장, 머리는 자기 것). 마지막에 쓴 방식을 기억한다.
// 그날의 장들(PastDay) = 지난 날, 그리고 혼자 쓰기를 저장한 뒤. 나만 보기는 없앴다(§9.7 ⑥).
// 화면을 좌우로 밀면 전날·다음 날(오른쪽 = 전날, 오늘 다음은 막힘). 동의는 열 때 묻지 않는다 — 기분을 고른 뒤 대화 안 카드(§8.10).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CalendarDays, ChevronLeft, MessageCircle, MoreHorizontal, PenLine } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { addDays } from '@sprout/schema/time'
import { Conversation, forgetDraft } from '../../src/diary/Conversation'
import { clearScripted, deleteEntry, flushSummaries, useBuddy, useEntry, useMessages } from '../../src/diary/data'
import { dropSoloDraft, hasSoloDraft, seedSoloDraft, SoloWrite } from '../../src/diary/SoloWrite'
import { dayTitle, isWritten, josa } from '../../src/diary/logic'
import { PastDay } from '../../src/diary/PastDay'
import { setConsent, setMemory, setWriteMode, useDiaryPrefs } from '../../src/diary/prefs'
import { clearWant, diaryToday, openDay, useDiaryState } from '../../src/diary/state'
import { getDiaryNudge, setDiaryNudge } from '../../src/notifications/diary'
import { BYE_ME, composeDraft, replay, SCRIPTED } from '../../src/diary/talk'
import { KEY, preload } from '../../src/growth/store'
import { useMotionReduced } from '../../src/growth/motion'
import { SoftScene } from '../../src/growth/art/Scene3D'
import { useCharacterWear } from '../../src/growth/art/CharacterArt'
import { myScene, sceneTone } from '../../src/growth/home/glass'
import { SCENE_EDGE, sceneDark } from '@sprout/schema/characterArt'
import { StatusBar } from 'expo-status-bar'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton, GlassGroup } from '../../src/ui/Glass'
import { hx } from '../../src/ui/haptics'
import { SlideSheet } from '../../src/ui/SlideSheet'
import { useToast } from '../../src/ui/Toast'

type View_ = 'chat' | 'solo' | 'card'

export default function Diary() {
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { date: param } = useLocalSearchParams<{ date?: string }>()
  useEffect(() => { if (param) openDay(param) }, [param])
  const { date, want } = useDiaryState()
  const today = diaryToday()
  const past = date !== today
  const entry = useEntry(date)
  const messages = useMessages(date)
  const buddy = useBuddy()
  const prefs = useDiaryPrefs()
  const reduced = useMotionReduced()
  const name = buddy.name
  useEffect(() => { void preload([KEY.motion]) }, [])
  useEffect(() => () => flushSummaries(), [])

  // ── 그날 무엇을 보이나 ──
  const [chosen, setChosen] = useState<Record<string, View_>>({})
  const written = !!entry && isWritten(entry)
  const hasScripted = messages.some((m) => m.safety === SCRIPTED)
  const view: View_ = chosen[date] ?? (past
    ? (!written && hasScripted ? 'chat' : 'card')
    : prefs.mode === 'solo' ? (hasSoloDraft(date) || !written ? 'solo' : 'card') : 'chat')
  const choose = (v: View_) => setChosen((c) => ({ ...c, [date]: v }))
  // 혼자 쓰기: 고칠 장(null = 새 장)
  const [soloIndex, setSoloIndex] = useState<number | null>(null)
  const toSolo = useCallback((index: number | null = null, given?: { text: string; mood: number | null }) => {
    if (!past) setWriteMode('solo')
    // 대화에서 넘어오면: 지금까지 한 답으로 새 장을 채워 둔다
    if (index === null) {
      const r = replay(messages.filter((m) => m.safety === SCRIPTED && m.role === 'me' && m.content !== BYE_ME).map((m) => m.content))
      seedSoloDraft(date, given?.text ?? (written ? '' : composeDraft(r.answers, { past })))
    }
    setSoloIndex(index)
    choose('solo')
  }, [past, written, date, messages]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (want) { setChosen((c) => ({ ...c, [date]: want === 'free' ? 'solo' : want })); clearWant() } }, [want, date])
  const toChat = () => { hx.tick(); if (!past) setWriteMode('chat'); choose('chat') }

  // ── 좌우로 밀어 날 넘기기(transform·opacity만, 39 §11) ──
  const tx = useSharedValue(0)
  const op = useSharedValue(1)
  const dateRef = useRef(date)
  dateRef.current = date
  const go = useCallback((dir: 1 | -1) => {
    const next = addDays(dateRef.current, dir)
    if (next > diaryToday()) { toast.show('내일은 아직 오지 않았어요'); tx.value = withSpring(0); return }
    hx.tick()
    openDay(next)
    tx.value = reduced ? 0 : dir * 60
    op.value = reduced ? 1 : 0
    tx.value = withTiming(0, { duration: reduced ? 0 : 240 })
    op.value = withTiming(1, { duration: reduced ? 120 : 240 })
  }, [reduced, toast, tx, op])
  const toToday = () => {
    hx.tick()
    openDay(diaryToday())
    tx.value = reduced ? 0 : 60
    op.value = reduced ? 1 : 0
    tx.value = withTiming(0, { duration: reduced ? 0 : 240 })
    op.value = withTiming(1, { duration: reduced ? 120 : 240 })
  }
  const swipe = useMemo(() => Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onUpdate((e) => { tx.value = e.translationX * 0.5 })
    .onEnd((e) => {
      if (Math.abs(e.translationX) < 70 && Math.abs(e.velocityX) < 800) { tx.value = withSpring(0); return }
      scheduleOnRN(go, e.translationX > 0 ? -1 : 1)
    }), [go, tx])
  const body = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], opacity: op.value }))

  // ── 시트 ──
  const [menu, setMenu] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const act = (fn: () => void) => () => { setMenu(false); setTimeout(fn, 200) }
  // 28 §9 A 저녁 알림(기기 설정)
  const [nudge, setNudge] = useState<string | null | undefined>(undefined)
  useEffect(() => { if (menu) void getDiaryNudge().then(setNudge) }, [menu])

  const status = written ? '저장됨 ✓' : past ? '지난 일기' : '오늘 일기'

  // 49 §6.1: 고른 배경 장면을 은은하게(흐리게 + 바탕색 막 80%) — 글 읽기가 먼저
  const win = useWindowDimensions()
  const wear = useCharacterWear()
  const soft = wear?.species ? myScene(wear.wear.eq?.bg, p.dark) : null
  if (view === 'solo') {
    return <SoloWrite key={`${date}:${soloIndex}`} date={date} entry={entry} index={soloIndex} onBack={() => router.back()} onChat={toChat} onSaved={() => choose('card')} />
  }
  // 28 §9: 대화는 장면 위 — 머리도 장면 윗줄 색 위에(띠 없이), 글자색은 장면 밝기로
  const chatScene = view === 'chat' ? myScene(wear?.species ? wear.wear.eq?.bg : null, p.dark) : null
  const tone = chatScene ? sceneTone(chatScene) : null
  const ink = tone?.ink ?? p.textPrimary
  return (
    <View style={{ flex: 1, backgroundColor: chatScene ? SCENE_EDGE[chatScene] ?? p.pageBg : p.pageBg }}>
      {chatScene ? <StatusBar style={sceneDark(chatScene) ? 'light' : 'dark'} /> : null}
      {soft && !chatScene ? <SoftScene sceneKey={soft} width={win.width} height={win.height} veil={p.pageBg} veilOpacity={p.dark ? 0.78 : 0.8} /> : null}
      <View style={[s.hdr, { marginTop: insets.top }]}>
        <GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <Pressable style={s.mid} onPress={() => router.push('/diary/calendar')} accessibilityRole="button" accessibilityLabel={`${dayTitle(date)}, ${status}. 기분 달력 열기`}>
          <Text style={[s.midTitle, { color: ink }]} numberOfLines={1}>{dayTitle(date)}</Text>
          <View style={s.midSub}>
            <Text style={{ color: tone?.sub ?? p.textTertiary, fontSize: 12 }}>{status}</Text>
          </View>
        </Pressable>
        <GlassGroup>
          {past ? (
            <Pressable accessibilityRole="button" accessibilityLabel="오늘로" onPress={toToday} style={s.today} hitSlop={2}>
              <Text style={{ color: p.accentInk, fontSize: 13, fontWeight: '700' }}>오늘</Text>
            </Pressable>
          ) : null}
          {view === 'chat'
            ? <GlassButton plain label="혼자 쓰기" onPress={() => { hx.tick(); toSolo(null) }}><PenLine size={18} color={p.textPrimary} /></GlassButton>
            : <GlassButton plain label={`${josa(name, '와', '과')} 이야기하기`} onPress={toChat}><MessageCircle size={19} color={p.textPrimary} /></GlassButton>}
          <GlassButton plain label="기분 달력" onPress={() => router.push('/diary/calendar')}><CalendarDays size={19} color={p.textPrimary} /></GlassButton>
          <GlassButton plain label="일기 메뉴" onPress={() => setMenu(true)}><MoreHorizontal size={20} color={p.textPrimary} /></GlassButton>
        </GlassGroup>
      </View>

      <Animated.View key={date} style={[{ flex: 1 }, body]}>
        {view === 'card'
          ? <PastDay date={date} entry={entry} buddy={buddy} reduced={reduced} swipe={swipe} onChat={toChat} onSolo={(i) => toSolo(i)} />
          : <Conversation date={date} today={today} entry={entry} buddy={buddy} reduced={reduced} swipe={swipe} onFree={(x) => toSolo(null, x)} />}
      </Animated.View>

      {/* ⋯ 아래 동작 시트(§8.2 확인 = 아래 시트) */}
      <SlideSheet visible={menu} onClose={() => { setMenu(false); setAskDelete(false) }} label="일기 메뉴" style={[s.sheet, { backgroundColor: p.sheetBg, paddingBottom: insets.bottom + 12 }]}>
        <View style={[s.grab, { backgroundColor: p.borderStrong }]} />
        {askDelete ? <>
          <Text style={[s.sheetTitle, { color: p.textPrimary }]}>이 날 일기를 지울까요?</Text>
          <Text style={[s.sheetBody, { color: p.textSecondary }]}>글·기분·대화가 모든 기기에서 지워져요.</Text>
          <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setAskDelete(false); forgetDraft(date); dropSoloDraft(date); void deleteEntry(date).then(() => toast.show('일기를 지웠어요')) }} style={[s.cancel, { backgroundColor: p.cardBg }]}>
            <Text style={{ color: p.danger, fontSize: 16, fontWeight: '700' }}>지우기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setAskDelete(false) }} style={[s.cancel, { backgroundColor: p.cardBg }]}><Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600' }}>취소</Text></Pressable>
        </> : <>
        <View style={[s.group, { backgroundColor: p.cardBg }]}>
          {prefs.consent ? <Item label="기억하기" note={prefs.memory ? '켜짐' : undefined} onPress={act(() => { setMemory(!prefs.memory); toast.show(prefs.memory ? '이 날 일기만 보고 이야기해요' : '최근 7일 일기 요약도 같이 봐요') })} /> : null}
          {view === 'chat' && hasScripted && !written ? <Item label="처음부터 다시 묻기" onPress={act(() => { forgetDraft(date); void clearScripted(date) })} /> : null}
          {nudge !== undefined ? <Item label={nudge ? '저녁 알림 끄기' : '저녁 알림 켜기'} note={nudge ?? undefined} onPress={act(() => { const v = nudge ? null : '21:00'; void setDiaryNudge(v).then(() => toast.show(v ? `밤 9시에 ${josa(name, '가', '이')} 하루를 물어볼게요` : '저녁 알림을 껐어요')) })} /> : null}
          <Item label="일기 검색" onPress={act(() => router.push('/diary/search'))} />
          <Item label="이 날 일기 지우기" danger last onPress={() => { hx.warn(); setAskDelete(true) }} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => setMenu(false)} style={[s.cancel, { backgroundColor: p.cardBg }]}><Text style={{ color: p.textPrimary, fontSize: 16, fontWeight: '600' }}>취소</Text></Pressable>
        </>}
      </SlideSheet>


    </View>
  )
}

function Item({ label, note, danger, last, onPress }: { label: string; note?: string; danger?: boolean; last?: boolean; onPress: () => void }): ReactNode {
  const p = usePalette()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.item, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.borderDivider }, pressed && { backgroundColor: p.bgSelected }]}>
      <Text style={{ flex: 1, color: danger ? p.danger : p.textPrimary, fontSize: 16 }}>{label}</Text>
      {note ? <Text style={{ color: p.accentInk, fontSize: 13, fontWeight: '600' }}>{note}</Text> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  hdr: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  mid: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  midTitle: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  midSub: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  today: { height: 42, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 12, paddingTop: 8, gap: 10 },
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 4 },
  group: { borderRadius: 16, overflow: 'hidden' },
  item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  cancel: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  sheetBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 4 },
  half: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }
})
