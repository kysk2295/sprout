// 빠른 입력(22 확정 v1.0, 시안 E): + → 키보드에 붙은 카드. 제목(인식 글자 하이라이트) · 설명 · 도구 막대(날짜·우선순위·태그·리스트·⋯) · ↑ 보내기.
// - 인식은 데스크톱과 같은 recognize()(인식된 날짜 글자는 제목에서 빠진다 — 두 추가 경로 같음). 하이라이트를 누르면 인식 취소(22 §3.2)
// - 날짜를 정하면 날짜 아이콘이 "내일, 15:00" 칩으로. 날짜 시트는 키보드 대신 올라온다(22 §3.3)
// - # ~ ! 를 치면 키보드 위 제안 줄(태그·리스트·우선순위, 끝에 새 태그 만들기)
// - 보내면 입력 창은 비운 채 열려 있다(연속 입력). 닫으면 쓴 글은 초안으로 남는다(22 §4)
import * as Haptics from 'expo-haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowUp, Calendar, Ellipsis, Flag, Hash, Inbox, List as ListIcon, Sparkles } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLists, useTags } from '../src/data/lists'
import { createTag, createTask } from '../src/data/tasks'
import { newTaskDefaults } from '../src/data/views'
import { dayKey } from '../src/lib/dates'
import { ensurePermission } from '../src/notifications'
import { alpha, priorityColor } from '../src/theme/palette'
import { usePalette } from '../src/theme/ThemeProvider'
import { DateSheet } from '../src/ui/DateSheet'
import { chipLabel, EMPTY_SCHEDULE, type Schedule } from '../src/ui/dateSheetModel'
import { PopMenu, useAnchor } from '../src/ui/Menu'
import { activeTrigger, addedToast, applySuggestion, buildInput, rangeAt, recognizeWith, segments, suggestions, type Trigger } from '../src/ui/quickAddModel'

/** 닫아도 남는 초안(22 §4 — 다음 + 때 그대로) */
const draft = { text: '', desc: '' }

export default function QuickAdd() {
  const { view = 'smart:today' } = useLocalSearchParams<{ view?: string }>()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const win = useWindowDimensions()
  const lists = useLists()
  const tags = useTags()
  const titleRef = useRef<TextInput>(null)
  const [text, setText] = useState(draft.text)
  const [desc, setDesc] = useState(draft.desc)
  const [cursor, setCursor] = useState(draft.text.length)
  const [ignored, setIgnored] = useState<string[]>([])
  const [manual, setManual] = useState<Schedule | null>(null)
  const [priority, setPriority] = useState<number | null>(null)
  const [listId, setListId] = useState<string | null>(null)
  const [dateOpen, setDateOpen] = useState(false)
  const [flash, setFlash] = useState<{ msg: string; error?: boolean; id: number } | null>(null)
  const lastTyped = useRef(0)
  const flag = useAnchor()
  const listMenu = useAnchor()
  const more = useAnchor()

  useEffect(() => { draft.text = text; draft.desc = desc }, [text, desc])
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
  const input = buildInput({ r, description: desc, defaults, manual, priority, listId })
  // 칩은 직접 정한 날짜(인식·시트)만 — 보기 기본값(오늘)은 칩으로 안 보인다(틱틱 캡처)
  const chip = manual ? chipLabel(manual, today) : r.due_at ? chipLabel({ start_at: null, due_at: r.due_at }, today) : null
  const trigger: Trigger | null = activeTrigger(text, cursor)
  const sugg = trigger ? suggestions(trigger, tags, lists) : []
  const list = lists.find((l) => l.id === input.list_id)
  const canSend = !!input.title && !!inbox

  const close = () => { Keyboard.dismiss(); router.back() }
  const send = async () => {
    if (!canSend) return
    try {
      await createTask(input)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const msg = addedToast(view, input.due_at, input.start_at, today, list?.kind === 'inbox' ? '기본함' : list?.name)
      if (msg) setFlash({ msg, id: Date.now() })
      setText(''); setDesc(''); setCursor(0); setIgnored([]); setManual(null); setPriority(null); setListId(null)
      titleRef.current?.focus()
      if (input.reminders.length) void ensurePermission()
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
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }]} onPress={close} accessibilityLabel="닫기" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} pointerEvents="box-none">
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        {flash ? (
          <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(160)} style={[s.flash, { backgroundColor: p.toastBg, borderColor: flash.error ? p.danger : 'transparent' }]}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{flash.msg}</Text>
          </Animated.View>
        ) : null}
        {!dateOpen ? (
          <View style={[s.card, { backgroundColor: p.sheetBg }]}>
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
                placeholder="무엇을 할까요?"
                placeholderTextColor={p.textQuaternary}
                multiline
                scrollEnabled={false}
                submitBehavior="submit"
                returnKeyType="send"
                onSubmitEditing={() => void send()}
                style={[s.title, { color: p.textPrimary, backgroundColor: 'transparent' }]}
                accessibilityLabel="할 일 제목"
              />
              <Text style={[s.title, s.under]} pointerEvents="none" accessible={false}>
                {segments(text, r.ranges).map((g, i) => (
                  <Text key={i} style={g.hl ? { backgroundColor: alpha(p.accent, p.dark ? 0.3 : 0.16) } : undefined}>{g.text}</Text>
                ))}
              </Text>
            </View>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="설명"
              placeholderTextColor={p.textQuaternary}
              multiline
              style={[s.desc, { color: p.textSecondary }]}
              accessibilityLabel="설명"
            />
            <View style={s.bar}>
              {chip ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`날짜: ${chip}`} onPress={openDate} style={[s.dateChip, { borderColor: p.accent }]}>
                  <Calendar size={15} color={p.accent} />
                  <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: p.accent }}>{chip}</Text>
                </Pressable>
              ) : (
                <Tool label="날짜" onPress={openDate}><Calendar size={21} color={p.textSecondary} /></Tool>
              )}
              <View ref={flag.ref} collapsable={false}>
                <Tool label="우선순위" onPress={flag.open}><Flag size={21} color={input.priority ? priorityColor(p, input.priority) : p.textSecondary} fill={input.priority ? priorityColor(p, input.priority) : 'none'} /></Tool>
              </View>
              <Tool label="태그" onPress={() => insertTrigger('#')}><Hash size={21} color={input.tag_ids.length || trigger?.kind === '#' ? p.accent : p.textSecondary} /></Tool>
              <View ref={listMenu.ref} collapsable={false}>
                <Tool label="리스트" onPress={listMenu.open}><Inbox size={21} color={listId || r.list_id ? p.accent : p.textSecondary} /></Tool>
              </View>
              <View ref={more.ref} collapsable={false}>
                <Tool label="더보기" onPress={more.open}><Ellipsis size={21} color={p.textSecondary} /></Tool>
              </View>
              <View style={{ flex: 1 }} />
              {/* 27 §2.2: 도구 막대 ✦ AI에게. 날짜 칩이 자리를 차지하면 ✦만 */}
              <Pressable accessibilityRole="button" accessibilityLabel="AI에게" onPress={askAI} hitSlop={4} style={({ pressed }) => [s.ai, { backgroundColor: p.accentSubtle }, pressed && { opacity: 0.6 }]}>
                <Sparkles size={15} color={p.accent} />
                {chip ? null : <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: p.accent }}>AI에게</Text>}
              </Pressable>
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
                {trigger?.kind === '#' ? <Hash size={13} color={i === 0 && !sg.create ? p.accent : p.textSecondary} /> : trigger?.kind === '~' ? <ListIcon size={13} color={p.textSecondary} /> : <Flag size={13} color={priorityColor(p, sg.priority)} />}
                <Text style={{ fontSize: 14, color: i === 0 && !sg.create ? p.accent : p.textPrimary }}>{sg.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>

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
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6, opacity: 0.5 }
})
