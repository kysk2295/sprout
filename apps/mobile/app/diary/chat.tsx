// 28 §2.2 캐릭터와 이야기(E2·E3): ‹ 일기 · 가운데 캐릭터 + "도토리와 이야기" · ⋯(기억하기 · 오늘은 혼자 · 이 날 대화 지우기)
// 접힌 일기 줄 → 말풍선(받는 중 글자가 늘어남) → 할 일로 칩 → 한계 안내(처음 5번) → 입력창.
// 보내기: 내 말 저장 → /ai/diary 스트림.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowUp, Check, ChevronDown, ChevronLeft, ChevronUp, MoreHorizontal, Plus } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MoodFace } from '../../src/diary/art'
import { buddyReply, clearMessages, sendMessage, taskFromChip, useBuddy, useEntry, useExistingTitles, useMessages } from '../../src/diary/data'
import { josa, mayCallAi, parseBuddyReply } from '../../src/diary/logic'
import { BuddyArt } from '../../src/diary/parts'
import { setMemory, setSolo, takeNotice, useDiaryPrefs } from '../../src/diary/prefs'
import { CharacterArt } from '../../src/growth/art/CharacterArt'
import { useMotionReduced } from '../../src/growth/motion'
import { dayKey } from '../../src/lib/dates'
import { usePalette } from '../../src/theme/ThemeProvider'
import { GlassButton } from '../../src/ui/Glass'
import { PopMenu, useAnchor } from '../../src/ui/Menu'
import { useToast } from '../../src/ui/Toast'

export default function DiaryChat() {
  const { date: param } = useLocalSearchParams<{ date?: string }>()
  const date = param ?? dayKey()
  const p = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const reduced = useMotionReduced()
  const buddy = useBuddy()
  const entry = useEntry(date)
  const messages = useMessages(date)
  const prefs = useDiaryPrefs()
  const more = useAnchor()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [streaming, setStreaming] = useState<{ text: string; queue?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState(false)
  // 한계 안내는 처음 5번만 — 기기 값 쓰기는 그리기가 끝난 뒤(다른 화면이 같은 설정을 구독한다)
  useEffect(() => { setNotice(takeNotice()) }, [])
  const scroll = useRef<ScrollView>(null)
  const abort = useRef<AbortController | null>(null)
  const solo = prefs.isSolo(date)
  const allowed = mayCallAi({ consent: prefs.consent, private: entry?.private, solo })
  const chips = messages.filter((m) => m.role === 'buddy' && !m.safety).map((m) => parseBuddyReply(m.content).task).filter((t): t is string => !!t)
  const made = useExistingTitles(chips)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: !reduced }), 60); return () => clearTimeout(t) }, [messages.length, streaming?.text, reduced])

  const run = async (fn: (signal: AbortSignal) => Promise<unknown>) => {
    const ctrl = new AbortController()
    abort.current = ctrl
    setError(null)
    setStreaming({ text: '' })
    try { await fn(ctrl.signal) } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e)) } finally { if (abort.current === ctrl) setStreaming(null) }
  }
  const opts = (signal: AbortSignal) => ({ buddy, signal, onDelta: (t: string) => setStreaming({ text: t }), onQueue: (q: number) => setStreaming((s) => (s ? { ...s, queue: q } : s)) })
  const send = () => {
    const t = draft.trim()
    if (!t || streaming || !allowed) return
    setDraft('')
    void run((signal) => sendMessage(date, t, opts(signal)))
  }
  const retry = () => void run((signal) => buddyReply(date, opts(signal)))
  const addTask = async (title: string) => {
    try { await taskFromChip(title); toast.show('할 일에 넣었어요') } catch (e) { toast.show(e instanceof Error ? e.message : '할 일을 만들지 못했어요', { error: true }) }
  }
  const name = buddy.name
  const firstLine = (entry?.content ?? '').split('\n').find((l) => l.trim())?.trim() ?? ''

  return (
    <View style={{ flex: 1, backgroundColor: p.pageBg }}>
      <View style={[s.nav, { marginTop: insets.top, borderBottomColor: p.borderDivider }]}>
        <GlassButton label="일기로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>
        <View style={s.mid}>
          <CharacterArt species={buddy.species} stage={buddy.stage} size={28} mood="smile" />
          <Text style={[s.navTitle, { color: p.textPrimary }]} numberOfLines={1}>{josa(name, '와', '과')} 이야기</Text>
        </View>
        <GlassButton label="대화 메뉴" onPress={more.open}><View ref={more.ref} collapsable={false}><MoreHorizontal size={20} color={p.textPrimary} /></View></GlassButton>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: 16, gap: 12 }}>
          {entry && (firstLine || entry.mood) ? (
            <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={open ? '일기 접기' : '일기 펼치기'} style={[s.excerpt, { backgroundColor: p.bgSelected }]}>
              {entry.mood ? <MoodFace mood={entry.mood} size={22} /> : null}
              <Text style={{ flex: 1, color: p.textSecondary, fontSize: 14, lineHeight: 20 }} numberOfLines={open ? undefined : 1}>{open ? entry.content : firstLine}</Text>
              {open ? <ChevronUp size={16} color={p.textTertiary} /> : <ChevronDown size={16} color={p.textTertiary} />}
            </Pressable>
          ) : null}

          {messages.map((m) => {
            if (m.role === 'me') {
              return <Animated.View key={m.id} entering={reduced ? FadeIn.duration(150) : FadeInDown.duration(200)} style={[s.me, { backgroundColor: p.accentSubtle }]}><Text style={[s.msg, { color: p.textPrimary }]}>{m.content}</Text></Animated.View>
            }
            if (m.safety) return null // 예전 위기 카드 행(기능 제외, 2026-10-05)
            const r = parseBuddyReply(m.content)
            return (
              <Animated.View key={m.id} entering={reduced ? FadeIn.duration(150) : FadeInDown.duration(200)} style={s.buddyRow}>
                <CharacterArt species={buddy.species} stage={buddy.stage} size={30} mood="smile" />
                <View style={[s.buddy, { backgroundColor: p.cardBg }]}>
                  <Text style={[s.msg, { color: p.textPrimary }]}>{r.text}</Text>
                  {r.task ? (
                    <Pressable accessibilityRole="button" disabled={made.has(r.task)} onPress={() => void addTask(r.task!)} style={[s.chip, { borderColor: p.accent }]}>
                      {made.has(r.task) ? <Check size={14} color={p.accent} /> : <Plus size={14} color={p.accent} />}
                      <Text style={{ color: p.accentInk, fontSize: 13, fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>{made.has(r.task) ? '할 일에 넣었어요' : `할 일로: ${r.task}`}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>
            )
          })}

          {streaming ? (
            <View style={s.buddyRow}>
              <BuddyArt buddy={buddy} stage={buddy.stage} size={30} mood="smile" still={reduced} />
              <View style={[s.buddy, { backgroundColor: p.cardBg }]}>
                <Text style={[s.msg, { color: streaming.text ? p.textPrimary : p.textTertiary }]}>{streaming.text || (streaming.queue ? `차례를 기다리는 중… (앞에 ${streaming.queue}명)` : '· · ·')}</Text>
              </View>
            </View>
          ) : null}
          {error ? (
            <View style={[s.err, { backgroundColor: p.cardBg }]}>
              <Text style={{ color: p.textSecondary, fontSize: 14, lineHeight: 20 }}>지금은 {josa(name, '가', '이')} 쉬고 있어요. 일기는 그대로 저장돼요</Text>
              <Pressable onPress={retry} accessibilityRole="button" hitSlop={6}><Text style={{ color: p.accentInk, fontWeight: '600' }}>다시 시도</Text></Pressable>
            </View>
          ) : null}
          {!messages.length && !streaming && !error && allowed ? (
            <Pressable onPress={retry} accessibilityRole="button" style={[s.err, { backgroundColor: p.cardBg }]}>
              <Text style={{ color: p.textSecondary, fontSize: 14 }}>{josa(name, '가', '이')} 오늘 일기를 읽고 먼저 말을 걸어요</Text>
              <Text style={{ color: p.accentInk, fontWeight: '600' }}>읽어 달라고 하기</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {notice && allowed ? <Text style={[s.limit, { color: p.textTertiary }]}>{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요</Text> : null}
        {allowed ? (
          <View style={[s.composer, { marginBottom: insets.bottom + 8, backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`${name}에게 이야기하기…`}
              placeholderTextColor={p.textTertiary}
              multiline
              accessibilityLabel="보낼 말"
              style={[s.input, { color: p.textPrimary }]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="보내기" disabled={!draft.trim() || !!streaming} onPress={send} style={[s.send, { backgroundColor: draft.trim() && !streaming ? p.accent : p.bgSelected }]}>
              <ArrowUp size={18} color={draft.trim() && !streaming ? '#fff' : p.textTertiary} />
            </Pressable>
          </View>
        ) : (
          <Text style={[s.limit, { color: p.textTertiary, marginBottom: insets.bottom + 16 }]}>
            {entry?.private ? `🔒 이 날은 ${josa(name, '가', '이')} 읽지 않아요` : solo ? '오늘은 혼자 쓰는 날이에요 · ⋯에서 다시 켤 수 있어요' : `일기 ⋯ 메뉴에서 ${josa(name, '와', '과')} 나누기를 켜면 이야기할 수 있어요`}
          </Text>
        )}
      </KeyboardAvoidingView>

      <PopMenu anchor={more.rect} onClose={more.close} items={[
        { key: 'memory', label: '기억하기', checked: prefs.memory, onPress: () => { setMemory(!prefs.memory); toast.show(prefs.memory ? '이 날 일기만 보고 이야기해요' : '최근 7일 일기 요약도 같이 봐요') } },
        { key: 'solo', label: solo ? `${josa(name, '와', '과')} 이야기하기` : '오늘은 혼자 쓸게', onPress: () => { setSolo(date, !solo); if (!solo) abort.current?.abort() } },
        { key: 'clear', label: '이 날 대화 지우기', danger: true, disabled: !messages.length, onPress: () => { abort.current?.abort(); void clearMessages(date).then(() => toast.show('대화를 지웠어요')) } }
      ]} />
    </View>
  )
}
const s = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  mid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  navTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  excerpt: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  me: { alignSelf: 'flex-end', maxWidth: '82%', borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 13, paddingVertical: 9 },
  buddyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '90%' },
  buddy: { flexShrink: 1, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 13, paddingVertical: 9, gap: 8 },
  msg: { fontSize: 15.5, lineHeight: 22 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  err: { borderRadius: 14, padding: 12, gap: 8 },
  limit: { fontSize: 12, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', marginHorizontal: 12, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14, paddingRight: 5, paddingVertical: 5, gap: 6 },
  input: { flex: 1, fontSize: 16, lineHeight: 21, maxHeight: 120, paddingTop: 7, paddingBottom: 7 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }
})
