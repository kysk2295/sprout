// 28 §8 오늘 일기 = 캐릭터와 대화로 쓰기. 정해진 말(talk.ts, AI 없음) → 초안 카드(내 말 그대로) → 저장 → 정해진 한 줄 → (동의) AI 첫 답 → 이어서 이야기.
// 아래 덩어리(빠른 답·입력창)는 키보드 바로 위(keyboard.ts, transform만). 캐릭터는 마지막 말의 얼굴 하나만 움직인다. 39 §11: 쿼리는 data/rows, 행 수가 적어 ScrollView.
import { Check, Pencil, Plus, RotateCcw } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import { GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ART_SPECIES } from '@sprout/schema/characterArt'
import { normalizeSpecies, STAGES } from '@sprout/schema/growth'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from '../ui/haptics'
import { useToast } from '../ui/Toast'
import { MoodFace } from './art'
import { AiUnavailable, polishQuota, type PolishQuota } from './ai'
import { BuddyRow, ChipRow, Composer, MeRow, MoodRow, TypingDots, moodFaceArt, type Chip } from './chatParts'
import { addScripted, buddyReply, polishDraft, saveEntry, sendMessage, taskFromChip, touchEntry, useDayStats, useExistingTitles, useMessages } from './data'
import { useKeyboardHeight, useKeyboardLift } from './keyboard'
import { dayTitle, isWritten, josa, mayCallAi, moodOf, parseBuddyReply, type Buddy, type DiaryEntry } from './logic'
import { BuddyArt } from './parts'
import { setConsent, setMet, useDiaryPrefs } from './prefs'
import {
  BYE_BUDDY, BYE_ME, composeDraft, DRAFT_LINE, DRAFT_LINE_EMPTY, greetingOf, introLine, isSkip, nextLines, questionOf, replay, SCRIPTED, SKIP, SOLO_LINE,
  TIME_LABEL, timeOfDay, warmLineOf
} from './talk'

type Props = {
  date: string
  today: string
  entry: DiaryEntry | undefined
  buddy: Buddy & { stage: number; level: number }
  reduced: boolean
  swipe: GestureType
  /** 그냥 쓸래요: 지금까지 답으로 만든 글·기분을 넘긴다 */
  onFree: (prefill: { text: string; mood: number | null }) => void
  /** 다듬어 줘를 동의 전에 처음 누름 → 아래 시트(나누고 다듬기면 then) */
  askPolishConsent: (then: () => void) => void
}

const DRAFT_LINES = new Set([DRAFT_LINE, DRAFT_LINE_EMPTY])
/** 저장 전 초안을 고친 글·다듬기 전 글(앱 실행 동안만 — 다시 열면 대화에서 다시 만든다, §8.6) */
const drafts = new Map<string, { text: string; orig?: string }>()
export const forgetDraft = (date: string) => drafts.delete(date)
type Ai = { kind: 'idle' } | { kind: 'wait' } | { kind: 'reading'; text: string; queue?: number } | { kind: 'error'; message: string }

export function Conversation({ date, today, entry, buddy, reduced, swipe, onFree, askPolishConsent }: Props) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const messages = useMessages(date)
  const stats = useDayStats(date)
  const prefs = useDiaryPrefs()
  const past = date !== today
  const name = buddy.name
  const sp = normalizeSpecies(buddy.species)

  // ── 대화 상태(저장된 행에서 다시 만든다) ──
  const scripted = useMemo(() => messages.filter((m) => m.safety === SCRIPTED), [messages])
  const mine = useMemo(() => scripted.filter((m) => m.role === 'me' && m.content !== BYE_ME).map((m) => m.content), [scripted])
  const r = useMemo(() => replay(mine), [mine])
  const saved = !!entry && isWritten(entry)
  const solo = prefs.isSolo(date)
  const allowed = mayCallAi({ consent: prefs.consent, private: entry?.private, solo })
  const aiMsgs = useMemo(() => messages.filter((m) => !m.safety), [messages])
  const lastAiAt = aiMsgs.at(-1)?.created_at ?? ''
  const bye = scripted.some((m) => m.role === 'buddy' && m.content === BYE_BUDDY && m.created_at > lastAiAt)

  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const typing = hidden.size > 0
  const [ai, setAi] = useState<Ai>({ kind: 'idle' })
  const [talk, setTalk] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState<string | null>(() => drafts.get(date)?.text ?? null)
  const [orig, setOrig] = useState<string | undefined>(() => drafts.get(date)?.orig)
  const [polishing, setPolishing] = useState(false)
  const [quota, setQuota] = useState<PolishQuota>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  // 초안 = 내 답 그대로(고치기 전). 고친 글이 있으면 그것
  const composed = useMemo(() => composeDraft(r.answers, { past }), [r.answers, past])
  const draft = draftText ?? (saved ? entry?.content ?? '' : composed)
  const keepDraft = (text: string, o?: string) => { setDraftText(text); setOrig(o); drafts.set(date, { text, orig: o }) }

  // 다듬기 한도(서버 /ai/status — 배포 전 서버면 null → 다듬기 버튼 없음)
  const polishable = prefs.consent !== false && !entry?.private && !solo
  useEffect(() => {
    if (!polishable || (saved && !editing) || (r.step !== 'draft' && !editing)) return
    const ctrl = new AbortController()
    void polishQuota(ctrl.signal).then(setQuota)
    return () => ctrl.abort()
  }, [polishable, saved, editing, r.step])

  // ── 단계 ──
  type Phase = 'mood' | 'q1' | 'q2' | 'q3' | 'draft' | 'private' | 'consent' | 'solo' | 'reading' | 'error' | 'ask' | 'after' | 'more' | 'end'
  const phase: Phase = !saved ? r.step
    : entry!.private ? 'private'
    : prefs.consent === null ? 'consent'
    : !allowed ? 'solo'
    : ai.kind === 'reading' || ai.kind === 'wait' ? 'reading'
    : ai.kind === 'error' ? 'error'
    : !aiMsgs.length ? 'ask'
    : bye ? 'end'
    : talk || aiMsgs.some((m) => m.role === 'me') ? 'more'
    : 'after'

  // ── 동작 ──
  const reveal = useCallback((ids: string[]) => {
    if (!ids.length) return
    setHidden(new Set(ids))
    setTimeout(() => setHidden(new Set()), reduced ? 150 : 650)
  }, [reduced])
  const busy = useRef(false)
  const answer = async (a: { mood?: number; text?: string }) => {
    if (busy.current || typing || r.step === 'draft' || saved) return
    busy.current = true
    setTimeout(() => { busy.current = false }, 300)
    hx.tick()
    const lines = nextLines({ mine, answer: a, date, today, hour: new Date().getHours(), stats, name, intro: !prefs.met })
    if (!lines.length) return
    // 첫 답이면 인사·소개도 이때 같이 남긴다(열기만 한 날은 빈 행을 만들지 않게)
    const firstMe = lines.findIndex((l) => l.role === 'me')
    const ids = await addScripted(date, lines)
    reveal(ids.slice(firstMe + 1))
    if (!prefs.met) setMet()
  }
  const opts = (signal: AbortSignal) => ({
    buddy, signal,
    onDelta: (t: string) => setAi({ kind: 'reading', text: t }),
    onQueue: (q: number) => setAi((x) => (x.kind === 'reading' ? { ...x, queue: q } : x))
  })
  const runAi = async (fn: (signal: AbortSignal) => Promise<unknown>) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setAi({ kind: 'reading', text: '' })
    try { await fn(ctrl.signal); if (!ctrl.signal.aborted) setAi({ kind: 'idle' }) }
    catch (e) { if (!ctrl.signal.aborted) setAi({ kind: 'error', message: e instanceof Error ? e.message : String(e) }) }
  }
  const firstReply = () => void runAi((signal) => buddyReply(date, opts(signal)))
  const save = async () => {
    const wasSaved = saved
    const text = draft.trim()
    const mood = r.answers.mood ?? entry?.mood ?? null
    if (!text && !mood) return
    hx.tap()
    await saveEntry(date, wasSaved ? { content: text } : { content: text, mood })
    touchEntry(date)
    setEditing(false)
    setDraftText(null); setOrig(undefined); drafts.delete(date)
    if (wasSaved) { toast.show('고쳐서 저장했어요'); return }
    const ids = await addScripted(date, [{ role: 'buddy', content: warmLineOf({ mood, past, done: stats.done }) }])
    reveal(ids)
    // 동의했고 나만 보기·혼자 쓰기가 아니면 바로 첫 답(§8.3 8). 동의 전이면 대화 안 카드(아래)
    if (mayCallAi({ consent: prefs.consent, private: entry?.private, solo })) { setAi({ kind: 'wait' }); setTimeout(firstReply, reduced ? 200 : 750) }
  }
  const doPolish = async () => {
    const text = draft.trim()
    if (!text || polishing) return
    const ctrl = new AbortController()
    abort.current?.abort()
    abort.current = ctrl
    setPolishing(true)
    try {
      const out = await polishDraft(text, ctrl.signal)
      if (ctrl.signal.aborted) return
      keepDraft(out, orig ?? text)
      setQuota((q) => (q ? { ...q, used: q.used + 1 } : q))
    } catch (e) {
      if (ctrl.signal.aborted) return
      if (e instanceof AiUnavailable && e.code === 'daily') setQuota((q) => (q ? { ...q, used: q.limit } : { used: 3, limit: 3 }))
      else toast.show(e instanceof Error ? e.message : '다듬지 못했어요', { error: true })
    } finally { if (abort.current === ctrl) setPolishing(false) }
  }
  const polish = () => {
    if (prefs.consent === true) void doPolish()
    else askPolishConsent(() => { void doPolish() })
  }
  const unpolish = () => { if (orig !== undefined) keepDraft(orig, undefined) }
  const consentYes = () => { hx.tap(); setConsent(true); if (!entry?.private && !solo) setTimeout(firstReply, 50) }
  const consentNo = async () => { hx.tap(); setConsent(false); reveal(await addScripted(date, [{ role: 'buddy', content: SOLO_LINE }])) }
  const sayBye = async () => { hx.tap(); setTalk(false); const ids = await addScripted(date, [{ role: 'me', content: BYE_ME }, { role: 'buddy', content: BYE_BUDDY }]); reveal(ids.slice(1)) }
  const sendTalk = (t: string) => { if (ai.kind === 'reading') return; hx.tap(); void runAi((signal) => sendMessage(date, t, opts(signal))) }
  const addTask = async (title: string) => {
    try { await taskFromChip(title); toast.show('할 일에 넣었어요') } catch (e) { toast.show(e instanceof Error ? e.message : '할 일을 만들지 못했어요', { error: true }) }
  }
  const goFree = () => onFree({ text: saved ? entry?.content ?? '' : draft, mood: r.answers.mood ?? entry?.mood ?? null })

  // ── 그리기 ──
  const scroll = useRef<ScrollView>(null)
  const kbH = useKeyboardHeight()
  const lift = useKeyboardLift(insets.bottom)
  const [dockH, setDockH] = useState(120)
  const onDock = (e: LayoutChangeEvent) => setDockH(Math.round(e.nativeEvent.layout.height))
  const toEnd = useCallback(() => scroll.current?.scrollToEnd({ animated: !reduced }), [reduced])
  useEffect(() => { if (kbH) setTimeout(toEnd, 60) }, [kbH, toEnd])
  const composerRef = useRef<TextInput>(null)
  // 열 때 이미 있던 말은 그대로, 이번에 새로 생긴 말만 들어오는 움직임(39 §11 규칙 8)
  const openedAt = useRef(new Date().toISOString()).current
  const enter = (createdAt: string) => (createdAt < openedAt ? undefined : reduced ? FadeIn.duration(150) : FadeInDown.duration(220))
  const chips = useMemo(() => aiMsgs.filter((m) => m.role === 'buddy').map((m) => parseBuddyReply(m.content).task).filter((t): t is string => !!t), [aiMsgs])
  const made = useExistingTitles(chips)

  const visible = messages.filter((m) => !hidden.has(m.id) && m.safety !== 1)
  const lastBuddyId = [...visible].reverse().find((m) => m.role === 'buddy')?.id
  const face = moodFaceArt(r.answers.mood ?? entry?.mood)
  const virtualStart = !scripted.length && !saved
  const showHero = virtualStart && !typing
  const greet = virtualStart ? greetingOf({ date, today, hour: new Date().getHours(), stats }) : null
  const draftAt = visible.findIndex((m) => m.safety === SCRIPTED && m.role === 'buddy' && DRAFT_LINES.has(m.content))
  const cardAtTop = saved && draftAt < 0
  const moodLabel = moodOf(r.answers.mood ?? entry?.mood)?.label

  const card = (r.step === 'draft' || saved) ? (
    <DraftCard
      key="draft"
      saved={saved && !editing}
      editing={editing}
      text={draft}
      mood={r.answers.mood ?? entry?.mood ?? null}
      date={date}
      past={past}
      name={name}
      polished={orig !== undefined}
      polishing={polishing}
      quota={polishable ? quota : null}
      onEdit={() => { setEditing(true); if (draftText === null) keepDraft(draft, orig) }}
      onChange={(t) => keepDraft(t, orig)}
      onPolish={polish}
      onUnpolish={unpolish}
      onSave={() => void save()}
      onCancelEdit={saved ? () => { setEditing(false); setDraftText(null); setOrig(undefined); drafts.delete(date) } : undefined}
    />
  ) : null

  const rows: React.ReactNode[] = []
  if (cardAtTop) rows.push(card)
  visible.forEach((m, i) => {
    const prev = visible[i - 1]
    const isAi = !m.safety
    if (m.role === 'me') {
      const first = m.safety === SCRIPTED && m.id === scripted.find((x) => x.role === 'me')?.id
      const mood = first ? replay([m.content]).answers.mood : null
      rows.push(<Animated.View key={m.id} entering={enter(m.created_at)}><MeRow text={m.content} mood={mood} skip={m.safety === SCRIPTED && isSkip(m.content)} /></Animated.View>)
    } else {
      const parsed = isAi ? parseBuddyReply(m.content) : { text: m.content, task: undefined }
      rows.push(
        <Animated.View key={m.id} entering={isAi ? undefined : enter(m.created_at)}>
          <BuddyRow buddy={buddy} avatar={!prev || prev.role !== 'buddy' || i - 1 === draftAt} live={m.id === lastBuddyId && !typing && ai.kind !== 'reading'} still={reduced} face={m.id === lastBuddyId ? face : 'smile'} ai={isAi}>
            <Text style={[st.msg, { color: p.textPrimary }]}>{parsed.text}</Text>
            {parsed.task ? (
              <Pressable accessibilityRole="button" disabled={made.has(parsed.task)} onPress={() => void addTask(parsed.task!)} hitSlop={6} style={[st.taskChip, { borderColor: p.accent }]}>
                {made.has(parsed.task) ? <Check size={14} color={p.accentInk} /> : <Plus size={14} color={p.accentInk} />}
                <Text style={{ color: p.accentInk, fontSize: 13, fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>{made.has(parsed.task) ? '할 일에 넣었어요' : `할 일로: ${parsed.task}`}</Text>
              </Pressable>
            ) : null}
          </BuddyRow>
        </Animated.View>
      )
    }
    if (i === draftAt) rows.push(card)
  })

  // 아래 덩어리
  const qChips: Chip[] = (phase === 'q1' || phase === 'q2' || phase === 'q3')
    ? [...questionOf(phase, { mood: r.answers.mood, past, stats }).chips.map((c) => ({ key: c, label: c, onPress: () => void answer({ text: c }) })), { key: SKIP, label: SKIP, tone: 'mute' as const, onPress: () => void answer({ text: SKIP }) }]
    : phase === 'ask' ? [{ key: 'ask', label: `${josa(name, '가', '이')} 읽고 답해 주기`, tone: 'acc' as const, onPress: () => { hx.tap(); firstReply() } }]
    : phase === 'after' ? [
      { key: 'more', label: '이어서 이야기할래', tone: 'acc' as const, onPress: () => { hx.tap(); setTalk(true); setTimeout(() => composerRef.current?.focus(), 80) } },
      { key: 'bye', label: BYE_ME, tone: 'mute' as const, onPress: () => void sayBye() }
    ]
    : phase === 'more' ? [{ key: 'bye', label: BYE_ME, tone: 'mute' as const, onPress: () => void sayBye() }]
    : phase === 'mood' ? [{ key: 'free', label: '그냥 쓸래요', tone: 'mute' as const, icon: <Pencil size={14} color={p.textSecondary} />, onPress: goFree }]
    : []
  const line = phase === 'draft' ? '카드를 눌러 고치고, 다 되면 저장'
    : phase === 'private' ? `🔒 나만 보기 — ${josa(name, '는', '은')} 정해진 말만 하고, 일기는 어디로도 보내지 않아요`
    : phase === 'solo' ? (solo ? '오늘은 혼자 쓰는 날이에요 · ⋯에서 다시 켤 수 있어요' : `혼자 쓰는 중이에요 · ⋯에서 ${josa(name, '와', '과')} 나누기를 켤 수 있어요`)
    : phase === 'end' ? (past ? '그날 일기를 저장했어요' : '오늘 일기를 저장했어요')
    : null
  const showComposer = phase === 'mood' || phase === 'q1' || phase === 'q2' || phase === 'q3' || phase === 'more'

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={swipe}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={toEnd}
          contentContainerStyle={[st.chat, { paddingBottom: dockH + Math.max(0, kbH - insets.bottom) + 12 }]}
        >
          {showHero ? (
            <View style={st.intro}>
              <BuddyArt buddy={buddy} stage={buddy.stage} size={96} mood="smile" still={reduced} />
              <Text style={[st.introName, { color: p.textPrimary }]}>{name}</Text>
              <Text style={[st.introSub, { color: p.textTertiary }]}>{sp ? ART_SPECIES[sp].full : '정원 친구'} · Lv {buddy.level} {STAGES[Math.min(5, Math.max(1, buddy.stage)) - 1].name}</Text>
            </View>
          ) : null}
          <Text style={[st.daysep, { color: p.textTertiary }]}>{dayTitle(date)}{past ? '' : ` · ${TIME_LABEL[timeOfDay(new Date().getHours())]}`}</Text>
          {virtualStart && !prefs.met ? <BuddyRow buddy={buddy} avatar live={false} still={reduced}><Text style={[st.msg, { color: p.textPrimary }]}>{introLine(name)}</Text></BuddyRow> : null}
          {greet ? <BuddyRow buddy={buddy} avatar={prefs.met} live still={reduced}><Text style={[st.msg, { color: p.textPrimary }]}>{greet}</Text></BuddyRow> : null}
          {rows}
          {typing ? <BuddyRow buddy={buddy} avatar live still={reduced}><TypingDots still={reduced} /></BuddyRow> : null}
          {phase === 'consent' && !typing ? (
            <Animated.View entering={reduced ? FadeIn.duration(150) : FadeInDown.duration(220)} style={[st.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
              <Text style={[st.cardTitle, { color: p.textPrimary }]}>{josa(name, '가', '이')} 일기를 읽고 답해 줄까?</Text>
              {['저장한 일기를 읽고 한마디 해 줘요', '나만 보기로 둔 날은 보내지 않아요', '꿈틀 서버에서 처리하고 원문은 남기지 않아요'].map((f) => (
                <Text key={f} style={[st.fact, { color: p.textSecondary }]}>· {f}</Text>
              ))}
              <View style={st.btns}>
                <Pressable accessibilityRole="button" onPress={() => void consentNo()} style={[st.btn, { backgroundColor: p.bgSelected }]}><Text style={[st.btnText, { color: p.textPrimary }]}>혼자 쓸게요</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={consentYes} style={[st.btn, { backgroundColor: p.accent }]}><Text style={[st.btnText, { color: p.onAccent }]}>나누기</Text></Pressable>
              </View>
              <Text style={[st.small, { color: p.textTertiary }]}>{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요 · ⋯에서 언제든 바꿔요</Text>
            </Animated.View>
          ) : null}
          {ai.kind === 'reading' ? (
            <BuddyRow buddy={buddy} avatar live still={reduced} ai>
              {ai.text ? <Text style={[st.msg, { color: p.textPrimary }]}>{parseBuddyReply(ai.text).text}</Text>
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><TypingDots still={reduced} /><Text style={{ color: p.textTertiary, fontSize: 13 }}>{ai.queue ? `차례를 기다리는 중… (앞에 ${ai.queue}명)` : `${josa(name, '가', '이')} 읽는 중`}</Text></View>}
            </BuddyRow>
          ) : null}
          {ai.kind === 'error' ? (
            <View style={[st.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
              <Text style={{ color: p.textSecondary, fontSize: 14, lineHeight: 20 }}>지금은 {josa(name, '가', '이')} 쉬고 있어요. 일기는 그대로 저장돼요</Text>
              <Pressable onPress={firstReply} accessibilityRole="button" hitSlop={8} style={st.retry}><RotateCcw size={14} color={p.accentInk} /><Text style={{ color: p.accentInk, fontWeight: '600', fontSize: 14 }}>다시 시도</Text></Pressable>
            </View>
          ) : null}
        </ScrollView>
      </GestureDetector>

      <Animated.View onLayout={onDock} style={[st.dock, { paddingBottom: insets.bottom + 8, backgroundColor: p.pageBg }, lift]}>
        {phase === 'mood' ? <MoodRow onPick={(v) => void answer({ mood: v })} disabled={typing} /> : null}
        <ChipRow chips={qChips} disabled={typing || ai.kind === 'reading'} />
        {line ? <Text style={[st.dockline, { color: p.textTertiary }]}>{line}</Text> : null}
        {showComposer ? (
          <Composer
            ref={composerRef}
            ai={phase === 'more'}
            disabled={typing || ai.kind === 'reading'}
            placeholder={phase === 'more' ? `${name}에게 이야기하기…` : phase === 'mood' ? '직접 써도 돼' : '직접 써도 돼 — 한 줄이면 충분해'}
            onSend={(t) => (phase === 'more' ? sendTalk(t) : void answer({ text: t }))}
          />
        ) : null}
      </Animated.View>
    </View>
  )
}

/** 초안 카드(28 §8.4): 기분 얼굴 + `오늘 일기` + 날짜·기분 → 글(누르면 고침) → 작은 줄 → [고치기] [다듬어 줘] … [저장]. 저장 뒤 = 글 3줄 + ✓ 저장했어요 · 고치기 */
function DraftCard(props: {
  saved: boolean; editing: boolean; text: string; mood: number | null; date: string; past: boolean; name: string
  polished: boolean; polishing: boolean; quota: PolishQuota
  onEdit: () => void; onChange: (t: string) => void; onPolish: () => void; onUnpolish: () => void; onSave: () => void; onCancelEdit?: () => void
}) {
  const p = usePalette()
  const m = moodOf(props.mood)
  const left = props.quota ? Math.max(0, props.quota.limit - props.quota.used) : 0
  const canSave = !!props.text.trim() || !!props.mood
  return (
    <View style={[st.draft, { backgroundColor: p.cardBg, borderColor: p.borderDivider, shadowOpacity: p.dark ? 0 : props.saved ? 0.05 : 0.1 }]}>
      <View style={st.dh}>
        {m ? <MoodFace mood={m.value} size={28} /> : null}
        <Text style={[st.dhTitle, { color: p.textPrimary }]}>{props.past ? '그날 일기' : '오늘 일기'}</Text>
        <Text style={{ color: p.textTertiary, fontSize: 12, flex: 1 }} numberOfLines={1}>{Number(props.date.slice(5, 7))}월 {Number(props.date.slice(8))}일{m ? ` · ${m.label}` : ''}</Text>
      </View>
      {props.editing ? (
        <TextInput
          value={props.text}
          onChangeText={props.onChange}
          multiline
          autoFocus
          accessibilityLabel="일기 고치기"
          style={[st.dtEdit, { color: p.textPrimary, backgroundColor: p.bgSelected, borderColor: p.accent }]}
        />
      ) : (
        <Pressable disabled={props.saved} onPress={props.onEdit} accessibilityRole="button" accessibilityLabel="초안 고치기" accessibilityHint="눌러서 그 자리에서 고쳐요">
          <Text style={[st.dt, { color: props.saved ? p.textSecondary : p.textPrimary }]} numberOfLines={props.saved ? 3 : undefined}>{props.text.trim() || '(기분만 남겼어요)'}</Text>
        </Pressable>
      )}
      {!props.saved ? (
        <Text style={[st.dn, { color: p.textTertiary }]}>
          {props.polished ? <>{josa(props.name, '가', '이')} 문장만 다듬었어요 · <Text onPress={props.onUnpolish} style={{ color: p.accentInk, fontWeight: '700' }} accessibilityRole="button">원래대로</Text></> : '내가 한 말 그대로예요.'}
          {props.quota && !props.polished ? ` 다듬기는 AI가 문장만 고쳐요 · 오늘 ${left}번 남음` : ''}
        </Text>
      ) : null}
      {props.saved ? (
        <View style={st.da}>
          <Check size={14} color={p.accentInk} /><Text style={{ color: p.accentInk, fontSize: 12.5, fontWeight: '700' }}>저장했어요</Text>
          <Pressable accessibilityRole="button" onPress={props.onEdit} style={[st.dbtn, st.ghost, { marginLeft: 'auto', borderColor: p.borderStrong }]}><Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '600' }}>고치기</Text></Pressable>
        </View>
      ) : (
        <View style={st.da}>
          {props.editing && props.onCancelEdit ? <Pressable accessibilityRole="button" onPress={props.onCancelEdit} style={[st.dbtn, st.ghost, { borderColor: p.borderStrong }]}><Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '600' }}>취소</Text></Pressable> : null}
          {!props.editing ? <Pressable accessibilityRole="button" onPress={props.onEdit} style={[st.dbtn, st.ghost, { borderColor: p.borderStrong }]}><Pencil size={14} color={p.textPrimary} /><Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '600' }}>고치기</Text></Pressable> : null}
          {props.quota && props.text.trim() ? (
            left > 0 ? (
              <Pressable accessibilityRole="button" disabled={props.polishing || props.polished} onPress={props.onPolish} style={[st.dbtn, { backgroundColor: alpha(p.accent, 0.12), opacity: props.polished ? 0.4 : 1 }]}>
                <Text style={{ color: p.accentInk, fontSize: 14, fontWeight: '700' }}>{props.polishing ? '다듬는 중…' : '다듬어 줘'}</Text>
              </Pressable>
            ) : <View style={[st.dbtn, { backgroundColor: p.bgSelected, opacity: 0.6 }]}><Text style={{ color: p.textTertiary, fontSize: 14, fontWeight: '600' }}>오늘은 다 썼어요</Text></View>
          ) : null}
          <Pressable accessibilityRole="button" disabled={!canSave || props.polishing} onPress={props.onSave} style={[st.dbtn, { marginLeft: 'auto', backgroundColor: p.accent, opacity: canSave && !props.polishing ? 1 : 0.4 }]}>
            <Text style={{ color: p.onAccent, fontSize: 14, fontWeight: '700' }}>저장</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  chat: { paddingHorizontal: 14, paddingTop: 4, gap: 8 },
  intro: { alignItems: 'center', gap: 2, paddingTop: 18, paddingBottom: 4 },
  introName: { fontSize: 15, fontWeight: '700', marginTop: 6 },
  introSub: { fontSize: 12 },
  daysep: { alignSelf: 'center', fontSize: 11.5, fontWeight: '600', paddingTop: 8, paddingBottom: 4 },
  msg: { fontSize: 15, lineHeight: 22 },
  taskChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, minHeight: 32 },
  card: { marginLeft: 38, borderRadius: 20, padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 2 },
  fact: { fontSize: 13, lineHeight: 18 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  small: { fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
  draft: { marginLeft: 38, marginVertical: 4, borderRadius: 20, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#0B2A22', shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  dh: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dhTitle: { fontSize: 15, fontWeight: '800' },
  dt: { fontSize: 15.5, lineHeight: 25 },
  dtEdit: { fontSize: 15.5, lineHeight: 25, minHeight: 120, borderRadius: 12, borderWidth: 2, padding: 10, textAlignVertical: 'top' },
  dn: { fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  da: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  dbtn: { height: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  ghost: { borderWidth: 1, backgroundColor: 'transparent' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 6 },
  dockline: { textAlign: 'center', fontSize: 12, lineHeight: 16, paddingHorizontal: 20, paddingVertical: 8 }
})
