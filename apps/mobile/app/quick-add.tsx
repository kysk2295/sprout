// 빠른 입력(22 확정 v1.0, 시안 E): + → 키보드에 붙은 카드. 제목(인식 글자 하이라이트) · 설명 · 도구 막대(날짜·우선순위·태그·리스트·⋯) · ↑ 보내기.
// - 인식은 데스크톱과 같은 recognize()(인식된 날짜 글자는 제목에서 빠진다 — 두 추가 경로 같음). 하이라이트를 누르면 인식 취소(22 §3.2)
// - 날짜를 정하면 날짜 아이콘이 "내일, 15:00" 칩으로. 날짜 시트는 키보드 대신 올라온다(22 §3.3)
// - # ~ ! 를 치면 키보드 위 제안 줄(태그·리스트·우선순위, 끝에 새 태그 만들기)
// - 33 §11: `[[` = 태그 → 리스트 → 할 일 제안, `[[ ]]`는 인식에서 보호되어 제목에 남음, 기본함 + `[[리스트]]` 하나 = 그 리스트에 만든다, 저장 뒤 그 할 일 링크 관계
// - 보내면 입력 창은 비운 채 열려 있다(연속 입력). 닫으면 쓴 글은 초안으로 남는다(22 §4)
// - 맨 위 `할 일 · 일정`(22 §3.5, 06 §14.4.2): 일정이면 장소 줄 + 날짜·"● 내 일정"만, 마지막으로 고른 쪽을 기기에 기억
import { useToast } from '../src/ui/Toast'
import { hx } from '../src/ui/haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowUp, Calendar, Ellipsis, Flag, Hash, Inbox, List as ListIcon, MapPin, Sparkles, Square, X } from 'lucide-react-native'
import { File, Paths } from 'expo-file-system'
import { MY_CAL_COLOR } from '@sprout/schema/events'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, SlideOutDown, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { DUR, EASE } from '../src/ui/motion'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLists } from '../src/data/lists'
import { syncTaskLinks, useLinkTaskCandidates, useTagMeta } from '../src/wiki/data'
import { KindGlyph } from '../src/wiki/RowBits'
import { tagShow } from '../src/data/emojiLead'
import { createEvent, useMyCalColor } from '../src/data/calEvents'
import { eventAddedToast, quickEventFields } from '../src/data/eventsModel'
import { createTag, createTask } from '../src/data/tasks'
import { newTaskDefaults } from '../src/data/views'
import { dayKey } from '../src/lib/dates'
import { ensurePermission } from '../src/notifications'
import { alpha, priorityColor } from '../src/theme/palette'
import { usePalette } from '../src/theme/ThemeProvider'
import { DateSheet } from '../src/ui/DateSheet'
import { chipLabel, EMPTY_SCHEDULE, type Schedule } from '../src/ui/dateSheetModel'
import { PopMenu, useAnchor } from '../src/ui/Menu'
import { PF } from '../src/calendars/device'
import { calHash, providerFor } from '../src/calendars/link'
import { myLinkAccount, setLastTarget, sourceName, targetCalendars, useDeviceCal } from '../src/calendars/store'
import { scheduleBridge } from '../src/calendars/bridge'
import { ChevronDown } from 'lucide-react-native'
import { Segmented } from '../src/ui/Segmented'
import { addToProject } from '../src/map/v2/plan'
import { useFocusChip } from '../src/map/v2/focus'
import { activeTrigger, addedToast, applySuggestion, buildInput, linkListFor, rangeAt, recognizeWith, segments, suggestions, type Trigger } from '../src/ui/quickAddModel'

/** 닫아도 남는 초안(22 §4 — 다음 + 때 그대로) */
const draft = { text: '', desc: '', place: '' }

/** 22 §3.5: 마지막으로 고른 `할 일 · 일정`(이 기기에만) */
type Kind = 'task' | 'event'
const kindFile = () => new File(Paths.document, 'sprout-quick-add-kind.txt')
function loadKind(): Kind {
  try { const f = kindFile(); return f.exists && f.textSync().trim() === 'event' ? 'event' : 'task' } catch { return 'task' }
}
function saveKind(k: Kind) {
  try { const f = kindFile(); if (!f.exists) f.create(); f.write(k) } catch { /* 기기 저장 실패는 무시 */ }
}

export default function QuickAdd() {
  // text = 47 확인 카드 [고치기]가 넘기는 글(제목 + 날짜 말) — 빠른 입력 인식이 다시 읽는다
  const { view = 'smart:today', text: initText } = useLocalSearchParams<{ view?: string; text?: string }>()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const win = useWindowDimensions()
  const lists = useLists()
  const tags = useTagMeta()
  const titleRef = useRef<TextInput>(null)
  const [text, setText] = useState(initText ?? draft.text)
  const [desc, setDesc] = useState(draft.desc)
  const [kind, setKindState] = useState<Kind>(loadKind)
  const setKind = (k: Kind) => { setKindState(k); saveKind(k) }
  const [place, setPlace] = useState(draft.place)
  const myColor = useMyCalColor() ?? MY_CAL_COLOR
  // 38 §2.4 캘린더 고르기: 내 일정 + 쓸 수 있고 켜 둔 휴대폰 캘린더. 기본 = 마지막으로 고른 것(사라졌으면 내 일정)
  const devCal = useDeviceCal()
  const targets = targetCalendars(devCal)
  const target = targets.find((c) => c.id === devCal.prefs.lastTarget) ?? null
  const calMenu = useAnchor()
  const isEvent = kind === 'event'
  const [cursor, setCursor] = useState((initText ?? draft.text).length)
  const [ignored, setIgnored] = useState<string[]>([])
  const [manual, setManual] = useState<Schedule | null>(null)
  const [priority, setPriority] = useState<number | null>(null)
  const [listId, setListId] = useState<string | null>(null)
  const [dateOpen, setDateOpen] = useState(false)
  const toast = useToast()
  const [flash, setFlash] = useState<{ msg: string; error?: boolean; id: number } | null>(null)
  const lastTyped = useRef(0)
  const flag = useAnchor()
  const listMenu = useAnchor()
  const more = useAnchor()

  useEffect(() => { draft.text = text; draft.desc = desc; draft.place = place }, [text, desc, place])
  // 키보드가 없을 때(하드웨어 키보드·키보드 내림) 도구 막대가 홈 표시줄·둥근 화면 모서리에 붙지 않게 아래 안전 영역만큼 띄운다
  const [kb, setKb] = useState(false)
  const keyboard = useAnimatedKeyboard()
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -keyboard.height.value }] }))
  // 덮개는 제자리에서 옅게 짙어진다(DUR.move) — 경로 화면 자체는 움직임 없이 뜬다
  const scrimK = useSharedValue(0)
  useEffect(() => { scrimK.value = withTiming(1, { duration: DUR.move, easing: EASE.out }) }, [scrimK])
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimK.value }))
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false))
    return () => { show.remove(); hide.remove() }
  }, [])
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash((f) => (f?.id === flash.id ? null : f)), 2000)
    return () => clearTimeout(t)
  }, [flash])

  const inbox = lists.find((l) => l.kind === 'inbox')
  const today = dayKey()
  const r = useMemo(() => recognizeWith(text, lists, tags, ignored), [text, lists, tags, ignored])
  // 새로 인식된 날짜가 생기면 시트에서 고른 값보다 그것이 이긴다(마지막 동작이 이김)
  const lastDue = useRef(r.due_at)
  useEffect(() => {
    if (r.due_at && r.due_at !== lastDue.current) setManual(null)
    lastDue.current = r.due_at
  }, [r.due_at])
  const defaults = newTaskDefaults(view, inbox?.id ?? '', today)
  const linkList = linkListFor(r, listId, defaults.list_id, inbox?.id, tags, lists) // 33 §6.3-4
  const input = buildInput({ r, description: desc, defaults, manual, priority, listId: listId ?? linkList })
  // 칩은 직접 정한 날짜(인식·시트)만 — 보기 기본값(오늘)은 칩으로 안 보인다(틱틱 캡처)
  const chip = manual ? chipLabel(manual, today) : r.due_at ? chipLabel({ start_at: null, due_at: r.due_at }, today) : null
  const trigger: Trigger | null = activeTrigger(text, cursor)
  const linkTasks = useLinkTaskCandidates(trigger?.kind === '[[' ? trigger.query : null)
  const sugg = trigger && !isEvent ? suggestions(trigger, tags, lists, linkTasks) : [] // 일정에는 태그·리스트·우선순위가 없다(22 §3.5)
  const list = lists.find((l) => l.id === input.list_id)
  // 31 §12.13.7 지금 집중 칩: 미리 붙음 · 누르면 이 할 일에서만 뗌 · 입력을 비우면 다시 붙음. 다른 곳이 분명하면(#다른 프로젝트·상관없는 ~리스트) 없음
  const focus = useFocusChip({ title: input.title, tag_ids: input.tag_ids, list_id: listId ?? r.list_id ?? null })
  const [focusOff, setFocusOff] = useState(false)
  useEffect(() => { if (!text.trim()) setFocusOff(false) }, [text])
  const focusOn = !!focus && !focusOff && !isEvent
  const canSend = !!input.title // 기본함이 아직 없어도 보낸다 — createTask가 기본함을 만든다(02 §14.1)

  // 39 §4.6: 닫힘 = 키보드와 같이 카드가 내려가고 덮개가 옅어진 뒤 화면을 내린다
  const closing = useRef(false)
  const close = () => {
    if (closing.current) return
    closing.current = true
    Keyboard.dismiss()
    scrimK.value = withTiming(0, { duration: DUR.base, easing: EASE.in })
    setTimeout(() => router.back(), DUR.keyboard)
  }
  const send = async () => {
    if (!canSend) return
    if (isEvent) return sendEvent()
    try {
      const newId = await createTask(input)
      if (focusOn) await addToProject([newId], focus!.id)
      if (r.links.length) void syncTaskLinks(newId)
      hx.tap()
      const msg = linkList && list ? `${list.name}에 추가했어요` : addedToast(view, input.due_at, input.start_at, today, !list || list.kind === 'inbox' ? '기본함' : list.name)
      // 2026-10-09 사용자 결정: 만들면 입력 창을 내린다(키보드와 함께) — 알림은 앱 아래 토스트로
      if (msg) toast.show(msg)
      if (input.reminders.length) void ensurePermission({ reminder: true })
      close()
    } catch {
      setFlash({ msg: '저장하지 못했어요. 다시 시도해 주세요', error: true, id: Date.now() })
    }
  }
  // 22 §3.5: 일정 한 행(eventSpan — 시각 하나면 1시간, 날짜 없으면 오늘 종일)
  const sendEvent = async () => {
    try {
      const f = quickEventFields(input, !!manual, today)
      const link = target ? { provider: providerFor(PF), account: await myLinkAccount(), calendar: calHash(target.id), color: target.color } : undefined
      await createEvent({ title: input.title, notes: desc, location: place, ...f, link })
      if (link) scheduleBridge(0)
      hx.tap()
      toast.show(eventAddedToast(f.start_at ?? f.due_at, today))
      if (f.reminders.length) void ensurePermission({ reminder: true })
      close()
    } catch {
      setFlash({ msg: '저장하지 못했어요. 다시 시도해 주세요', error: true, id: Date.now() })
    }
  }
  const pickSuggestion = async (sg: (typeof sugg)[number]) => {
    if (!trigger) return
    if (sg.create) await createTag(trigger.query)
    if (sg.priority !== undefined) setPriority(null)
    const next = applySuggestion(text, trigger, sg.insert)
    setText(next.text)
    setCursor(next.cursor)
  }
  const insertTrigger = (ch: '#' | '~') => {
    const next = text && !/\s$/.test(text) ? `${text} ${ch}` : `${text}${ch}`
    setText(next)
    setCursor(next.length)
    titleRef.current?.focus()
  }
  // 27 M-A1 ② · §7.1: 쓴 글(제목 + 설명)을 AI 비서 전체 화면 입력창으로 넘긴다. 넘긴 글은 초안에서 지운다
  const askAI = () => {
    const t = [text.trim(), desc.trim()].filter(Boolean).join('\n')
    Keyboard.dismiss()
    setText(''); setDesc(''); setCursor(0); setIgnored([]); setManual(null); setPriority(null); setListId(null)
    draft.text = ''; draft.desc = ''
    router.back()
    router.push(t ? { pathname: '/assistant', params: { draft: t } } : '/assistant')
  }
  const openDate = () => { Keyboard.dismiss(); setDateOpen(true) }
  const dateInitial: Schedule = manual ?? {
    ...EMPTY_SCHEDULE,
    due_at: input.due_at, is_all_day: input.is_all_day, repeat_rule: input.repeat_rule, repeat_from: input.repeat_from, reminders: input.reminders
  }

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="닫기" />
      </Animated.View>
      {/* 39 §4.6 · G11: 카드는 키보드 프레임을 UI 스레드에서 그대로 따라 키보드 바로 위에 붙어 오르내린다(KeyboardAvoidingView 대신) */}
      <Animated.View style={[{ flex: 1 }, liftStyle]} pointerEvents="box-none">
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        {flash ? (
          <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(160)} style={[s.flash, { backgroundColor: p.toastBg, borderColor: flash.error ? p.danger : 'transparent' }]}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{flash.msg}</Text>
          </Animated.View>
        ) : null}
        {!dateOpen ? (
          <View style={[s.card, { backgroundColor: p.sheetBg }]}>
            {/* 20 §3.2: 카드 오른쪽 위 작은 ✕(바깥 누르기·Android 뒤로와 같은 닫기 — 입력은 버린다) */}
            <View style={s.kindRow}>
              <Segmented small style={s.kind} value={kind} onChange={setKind} items={[{ key: 'task', label: '할 일' }, { key: 'event', label: '일정' }]} />
              <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={10} onPress={close} style={({ pressed }) => [s.close, { backgroundColor: p.bgSelected }, pressed && { opacity: 0.6 }]}>
                <X size={15} color={p.textSecondary} />
              </Pressable>
            </View>
            {/* 하이라이트: Fabric TextInput은 안쪽 Text 배경을 그리지 않아서, 같은 글꼴의 Text를 위에 겹치고(글자는 투명·누름 통과) 인식 구간만 반투명 강조색으로 칠한다 */}
            <View>
              <TextInput
                ref={titleRef}
                autoFocus
                value={text}
                onChangeText={(v) => { lastTyped.current = Date.now(); setText(v) }}
                onSelectionChange={(e) => {
                  const pos = e.nativeEvent.selection.end
                  setCursor(pos)
                  // 하이라이트를 누르면(입력이 아닌 커서 이동) 그 부분 인식 취소(22 §3.2)
                  if (Date.now() - lastTyped.current > 120 && e.nativeEvent.selection.start === pos) {
                    const hit = rangeAt(r.ranges, pos)
                    if (hit) setIgnored((x) => [...x, hit.text])
                  }
                }}
                placeholder={isEvent ? '일정 제목' : '무엇을 할까요?'}
                placeholderTextColor={p.textQuaternary}
                multiline
                scrollEnabled={false}
                submitBehavior="submit"
                returnKeyType="send"
                onSubmitEditing={() => void send()}
                style={[s.title, { color: p.textPrimary, backgroundColor: 'transparent' }]}
                accessibilityLabel={isEvent ? '일정 제목' : '할 일 제목'}
              />
              <Text style={[s.title, s.under]} pointerEvents="none" accessible={false}>
                {segments(text, r.ranges).map((g, i) => (
                  <Text key={i} style={g.hl ? { backgroundColor: alpha(p.accent, p.dark ? 0.3 : 0.16) } : undefined}>{g.text}</Text>
                ))}
              </Text>
            </View>
            {isEvent ? (
              <View style={s.place}>
                <MapPin size={15} color={p.textTertiary} />
                <TextInput value={place} onChangeText={setPlace} placeholder="장소" placeholderTextColor={p.textQuaternary} style={[s.desc, { flex: 1, marginTop: 0, color: p.textSecondary }]} accessibilityLabel="장소" />
              </View>
            ) : null}
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="설명"
              placeholderTextColor={p.textQuaternary}
              multiline
              style={[s.desc, { color: p.textSecondary }]}
              accessibilityLabel="설명"
            />
            {focus && !isEvent && text.trim() ? (
              <View style={s.focusRow}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: focusOn }} accessibilityLabel={focusOn ? `${focus.name}에 넣기, 누르면 빼요` : `${focus.name}에 넣지 않음, 누르면 넣어요`}
                  onPress={() => setFocusOff((v) => !v)} hitSlop={6}
                  style={[s.focusChip, focusOn ? { borderColor: p.accent, backgroundColor: alpha(p.accent, p.dark ? 0.22 : 0.1) } : { borderColor: p.borderDivider }]}>
                  <Text style={{ fontSize: 13, lineHeight: 18, color: focusOn ? p.accentInk : p.textTertiary }} numberOfLines={1}>🚀 {focus.name}</Text>
                  {focusOn ? <X size={12} color={p.accent} /> : null}
                </Pressable>
              </View>
            ) : null}
            <View style={s.bar}>
              {chip ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`날짜: ${chip}`} onPress={openDate} style={[s.dateChip, { borderColor: p.accent }]}>
                  <Calendar size={15} color={p.accent} />
                  <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: p.accentInk }}>{chip}</Text>
                </Pressable>
              ) : (
                <Tool label="날짜" onPress={openDate}><Calendar size={21} color={p.textSecondary} /></Tool>
              )}
              {isEvent ? (
                targets.length ? (
                  <View ref={calMenu.ref} collapsable={false}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`캘린더: ${target?.title ?? '내 일정'}, 바꾸기`} onPress={calMenu.open} style={s.myCal}>
                      <View style={[s.myDot, { backgroundColor: target?.color ?? myColor }]} />
                      <Text style={{ fontSize: 13, color: p.textSecondary, maxWidth: 140 }} numberOfLines={1}>{target?.title ?? '내 일정'}</Text>
                      <ChevronDown size={13} color={p.textTertiary} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={s.myCal} accessibilityLabel="캘린더: 내 일정">
                    <View style={[s.myDot, { backgroundColor: myColor }]} />
                    <Text style={{ fontSize: 13, color: p.textSecondary }}>내 일정</Text>
                  </View>
                )
              ) : (
                <>
                  <View ref={flag.ref} collapsable={false}>
                    <Tool label="우선순위" onPress={flag.open}><Flag size={21} color={input.priority ? priorityColor(p, input.priority) : p.textSecondary} fill={input.priority ? priorityColor(p, input.priority) : 'none'} /></Tool>
                  </View>
                  <Tool label="태그" onPress={() => insertTrigger('#')}><Hash size={21} color={input.tag_ids.length || trigger?.kind === '#' ? p.accent : p.textSecondary} /></Tool>
                  <View ref={listMenu.ref} collapsable={false}>
                    <Tool label="리스트" onPress={listMenu.open}><Inbox size={21} color={listId || r.list_id || linkList ? p.accent : p.textSecondary} /></Tool>
                  </View>
                  <View ref={more.ref} collapsable={false}>
                    <Tool label="더보기" onPress={more.open}><Ellipsis size={21} color={p.textSecondary} /></Tool>
                  </View>
                </>
              )}
              <View style={{ flex: 1 }} />
              {/* 27 §2.2: 도구 막대 ✦ AI에게. 날짜 칩이 자리를 차지하면 ✦만. 일정에는 없음(22 §3.5) */}
              {isEvent ? null : <Pressable accessibilityRole="button" accessibilityLabel="AI에게" onPress={askAI} hitSlop={4} style={({ pressed }) => [s.ai, { backgroundColor: p.accentSubtle }, pressed && { opacity: 0.6 }]}>
                <Sparkles size={15} color={p.accent} />
                {chip ? null : <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: p.accentInk }}>AI에게</Text>}
              </Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel="추가" disabled={!canSend} onPress={() => void send()} style={[s.send, { backgroundColor: p.accent, opacity: canSend ? 1 : 0.35 }]}>
                <ArrowUp size={19} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : null}
        {!dateOpen && sugg.length ? (
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: p.bgInput }} contentContainerStyle={s.sugg}>
            {sugg.map((sg, i) => (
              <Pressable key={sg.key} accessibilityRole="button" onPress={() => void pickSuggestion(sg)} style={[s.sChip, { backgroundColor: i === 0 && !sg.create ? p.accentSubtle : p.cardBg }]}>
                {trigger?.kind === '#' || sg.group === 'tag' ? <KindGlyph kind={sg.kind} name={sg.create ? undefined : sg.label} size={13} color={i === 0 && !sg.create ? p.accent : p.textSecondary} />
                  : trigger?.kind === '~' || sg.group === 'list' ? <ListIcon size={13} color={p.textSecondary} />
                  : sg.group === 'task' ? <Square size={13} color={p.textSecondary} />
                  : <Flag size={13} color={priorityColor(p, sg.priority)} />}
                <Text style={{ fontSize: 14, color: i === 0 && !sg.create ? p.accentInk : p.textPrimary, maxWidth: 200 }} numberOfLines={1}>{(trigger?.kind === '#' || sg.group === 'tag') && !sg.create ? tagShow({ name: sg.label }).name : sg.label}</Text>
                {sg.sub ? <Text style={{ fontSize: 12, color: p.textTertiary, maxWidth: 120 }} numberOfLines={1}>{sg.sub}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {!dateOpen && !kb ? <View style={{ height: insets.bottom, backgroundColor: sugg.length ? p.bgInput : p.sheetBg }} /> : null}
      </Animated.View>

      {/* 날짜 시트: 키보드 대신 올라온다(22 §3.3). ✓/빠른 날짜 → 칩에 반영하고 키보드로 돌아온다 */}
      {dateOpen ? (
        <>
          <Animated.View entering={FadeIn.duration(120)} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Pressable style={StyleSheet.absoluteFill} onPress={() => { setDateOpen(false); titleRef.current?.focus() }} accessibilityLabel="날짜 닫기" />
          </Animated.View>
          <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)} style={[s.dateSheet, { backgroundColor: p.sheetBg, height: Math.min(win.height * 0.86, win.height - insets.top - 20), paddingBottom: insets.bottom }]}>
            <View style={[s.grabber, { backgroundColor: p.textQuaternary }]} />
            <DateSheet
              initial={dateInitial}
              onClose={() => { setDateOpen(false); setTimeout(() => titleRef.current?.focus(), 50) }}
              onDone={(v) => { setManual(v.due_at ? v : { ...EMPTY_SCHEDULE }); setDateOpen(false); setTimeout(() => titleRef.current?.focus(), 50) }}
            />
          </Animated.View>
        </>
      ) : null}

      <PopMenu
        anchor={flag.rect}
        onClose={flag.close}
        align="left"
        width={200}
        items={([[3, '높음'], [2, '중간'], [1, '낮음'], [0, '없음']] as [number, string][]).map(([v, label]) => ({
          key: String(v), label, checked: input.priority === v,
          icon: <Flag size={18} color={priorityColor(p, v)} fill={v ? priorityColor(p, v) : 'none'} />,
          onPress: () => setPriority(v)
        }))}
      />
      <PopMenu
        anchor={calMenu.rect}
        onClose={calMenu.close}
        align="left"
        width={260}
        items={[
          { key: 'sprout', label: '내 일정', checked: !target, icon: <View style={[s.myDot, { backgroundColor: myColor }]} />, onPress: () => setLastTarget(null) },
          ...targets.map((c) => ({ key: c.id, label: `${c.title} · ${sourceName(c)}`, checked: target?.id === c.id, icon: <View style={[s.myDot, { backgroundColor: c.color }]} />, onPress: () => setLastTarget(c.id) }))
        ]}
      />
      <PopMenu
        anchor={listMenu.rect}
        onClose={listMenu.close}
        align="left"
        width={240}
        items={lists.slice(0, 12).map((l) => ({ key: l.id, label: l.kind === 'inbox' ? '기본함' : `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, checked: input.list_id === l.id, onPress: () => setListId(l.id) }))}
      />
      <PopMenu
        anchor={more.rect}
        onClose={more.close}
        width={220}
        items={[
          // 22 §2 ⋯: 노트로 바꾸기 · 전체 화면 · 도구 막대 설정 — 모바일 v1에서는 [다음]
          { key: 'note', label: '노트로 바꾸기', disabled: true, onPress: () => {} },
          { key: 'full', label: '전체 화면', disabled: true, onPress: () => {} },
          { key: 'bar', label: '도구 막대 설정', disabled: true, onPress: () => {} }
        ]}
      />
    </View>
  )
}

function Tool({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2} style={({ pressed }) => [s.tool, pressed && { opacity: 0.5 }]}>
      {children}
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  title: { fontSize: 16, lineHeight: 22, minHeight: 24, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 },
  under: { position: 'absolute', left: 0, right: 0, top: 0, color: 'transparent' },
  focusRow: { flexDirection: 'row', paddingTop: 8 },
  focusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth * 2 },
  desc: { fontSize: 14, lineHeight: 20, maxHeight: 80, marginTop: 4, paddingTop: 0, paddingBottom: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 12, height: 40 },
  tool: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, marginRight: 4 },
  ai: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15, marginRight: 8 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sugg: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  sChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15 },
  flash: { alignSelf: 'center', marginBottom: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  dateSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  kindRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  kind: { width: 132, height: 28 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  myCal: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 8 },
  myDot: { width: 8, height: 8, borderRadius: 4 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6, opacity: 0.5 }
})
