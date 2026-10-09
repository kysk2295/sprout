// 28 §8.10 오늘 일기 = 캐릭터와 이야기하고, 그 이야기를 일기로 옮긴다(사용자 스킬 conversational-journal-to-wiki를 따름).
// 시작은 쉽게: 정해진 인사(시간대 + 그날 할 일) → 기분 빠른 답. 그다음은
//   · AI와 이야기(동의 + 나만 보기 아님): 친구에게 메신저 하듯 자유롭게. 캐릭터는 들은 말을 짚어 알아주고, 묻지 않으면 조언하지 않는다(서버·schema 지시).
//     머뭇거리면(20초) 정해진 질문 하나를 살짝. `일기로 정리해 줘` → 1인칭 일기 + 제목 + 감정/사건/영역 태그 초안(캐릭터 말은 빠짐).
//   · 혼자 쓰기·나만 보기·동의 전 거절: 정해진 질문 3개 → 내 말 그대로 초안(AI 0).
// 저장 = 그날 글 끝에 `## 21:40 — 제목` 편으로 이어 붙임(앞 편 그대로). 저장 한 줄("잘 남겼어.")이 편의 끝 — 뒤에서 더 이야기하면 새 편.
// 아래 덩어리(빠른 답·입력창)는 키보드 바로 위(keyboard.ts, transform만). 캐릭터는 마지막 말의 얼굴 하나만 움직인다. 39 §11: 쿼리는 data/rows.
import { Check, Plus, RotateCcw, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import { GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ART_SPECIES } from '@sprout/schema/characterArt'
import { normalizeSpecies, STAGES } from '@sprout/schema/growth'
import { normalizeTag, parseSections, transcriptOf, wantsTranscript, type Section } from '@sprout/schema/diaryPrompts'
import { createTextStream, nearBottom, partialDistill, replyFaceOf } from '@sprout/schema/diaryTalk'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from '../ui/haptics'
import { useToast } from '../ui/Toast'
import { MoodFace } from './art'
import { AiUnavailable, distillQuota, type Quota } from './ai'
import { BuddyRow, ChipRow, Composer, MeRow, MoodRow, TypingDots, moodFaceArt, type Chip } from './chatParts'
import { addScripted, chatTurn, distillSession, replaceSection, saveSection, taskFromChip, useDayStats, useExistingTitles, useMessages } from './data'
import { useKeyboardHeight, useKeyboardLift } from './keyboard'
import { dayTitle, josa, mayCallAi, moodOf, parseBuddyReply, type Buddy, type DiaryEntry } from './logic'
import { BuddyArt } from './parts'
import { DistillCard, StreamText } from './Stream'
import { setConsent, setMet, useDiaryPrefs } from './prefs'
import {
  asksDistill, BYE_BUDDY, BYE_ME, clock, composeDraft, greetingOf, introLine, isSkip, isWarm, MORE_LINE, nextLines, nudgeOf, OPEN_LINE, ownWords,
  questionOf, replay, SCRIPTED, sessionOf, SKIP, SOLO_LINE, TIME_LABEL, timeOfDay, warmLineOf
} from './talk'

type Props = {
  date: string
  today: string
  entry: DiaryEntry | undefined
  buddy: Buddy & { stage: number; level: number }
  reduced: boolean
  swipe: GestureType
  /** 그냥 쓸래요: 지금까지 한 말로 만든 글·기분을 넘긴다 */
  onFree: (prefill: { text: string; mood: number | null }) => void
}

type Draft = Section & { source: 'ai' | 'own' | 'transcript' }
/** 저장 전 초안(앱 실행 동안만 — 다시 열면 대화에서 다시 만든다, §8.6) */
const drafts = new Map<string, Draft>()
export const forgetDraft = (date: string) => drafts.delete(date)
/** 28 §8.11: reading = 기다림(started false, 생각 얼굴) → 받는 중 · landing = 다 받아 저장 중(저장된 행이 보이면 내림) · error = 멈춤·오류(받은 글 partial, 저장 안 함) */
type Ai = { kind: 'idle' } | { kind: 'reading'; started: boolean; queue?: number; since: string } | { kind: 'landing'; since: string } | { kind: 'error'; message: string; partial: string; stopped?: boolean }
const STALL_MS = 20_000
const CHAT_LIMIT_LINE = '오늘은 이야기를 많이 나눴네. 지금까지 이야기로 일기를 정리해 둘까?'

export function Conversation({ date, today, entry, buddy, reduced, swipe, onFree }: Props) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const messages = useMessages(date)
  const stats = useDayStats(date)
  const prefs = useDiaryPrefs()
  const past = date !== today
  const name = buddy.name
  const sp = normalizeSpecies(buddy.species)

  // ── 지금 편(마지막 저장 한 줄 뒤) ──
  const all = useMemo(() => messages.filter((m) => m.safety !== 1), [messages])
  const session = useMemo(() => sessionOf(all), [all])
  const S = session.rows
  const sections = useMemo(() => parseSections(entry?.content), [entry?.content])
  const solo = prefs.isSolo(date)
  const aiFlow = mayCallAi({ consent: prefs.consent, private: entry?.private, solo })
  const scriptedMine = S.filter((m) => m.safety === SCRIPTED && m.role === 'me' && m.content !== BYE_ME).map((m) => m.content)
  const r = useMemo(() => replay(scriptedMine), [scriptedMine.join('\u0001')]) // eslint-disable-line react-hooks/exhaustive-deps
  const myTalk = S.filter((m) => m.role === 'me' && !m.safety)
  const started = scriptedMine.length > 0 || S.some((m) => m.role === 'buddy' && m.content === MORE_LINE) || myTalk.length > 0
  const bye = S.some((m) => m.role === 'buddy' && m.content === BYE_BUDDY)
  const asked = S.filter((m) => m.role === 'buddy' && m.safety === SCRIPTED).map((m) => m.content)
  const consentPending = prefs.consent === null && !entry?.private && !solo
  const scriptedFlow = !aiFlow && !consentPending
  const sessionMood = r.answers.mood ?? null

  const [again, setAgain] = useState(false) // 혼자 쓰기: 하나 더 남기기(기분부터)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const typing = hidden.size > 0
  const [ai, setAi] = useState<Ai>({ kind: 'idle' })
  const [draft, setDraftState] = useState<Draft | null>(() => drafts.get(date) ?? null)
  const [distilling, setDistilling] = useState(false)
  const [quota, setQuota] = useState<Quota>(null)
  const [chatCapped, setChatCapped] = useState(false)
  const [editAt, setEditAt] = useState<number | null>(null) // 저장한 편 고치기
  const [distillTry, setDistillTry] = useState(1)
  // 받는 글 저장소 — 받는 말풍선·옮기는 중 카드만 구독(39 §11: 글이 붙을 때 대화 전체를 다시 그리지 않음)
  const stream = useMemo(createTextStream, [])
  const dstream = useMemo(createTextStream, [])
  const pinned = useRef(true)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const setDraft = (d: Draft | null) => { setDraftState(d); if (d) drafts.set(date, d); else drafts.delete(date) }

  // 혼자 쓰기: 질문 3개를 다 답하면 내 말 그대로 초안(자동)
  useEffect(() => {
    if (scriptedFlow && r.step === 'draft' && !draft) setDraft({ time: null, title: '', tags: [], body: composeDraft(r.answers, { past }), source: 'own' })
  }, [scriptedFlow, r.step]) // eslint-disable-line react-hooks/exhaustive-deps
  // 옮기기 남은 횟수(배포 전 서버면 모름)
  useEffect(() => {
    if (!aiFlow) return
    const ctrl = new AbortController()
    void distillQuota(ctrl.signal).then(setQuota)
    return () => ctrl.abort()
  }, [aiFlow])

  // ── 단계 ──
  type Phase = 'mood' | 'consent' | 'talk' | 'q1' | 'q2' | 'q3' | 'draft' | 'after' | 'end'
  const phase: Phase = draft ? 'draft'
    : !started ? (bye ? 'end' : (session.boundaries || sections.length) && !again ? 'after' : 'mood')
    : consentPending ? 'consent'
    : aiFlow ? 'talk'
    : r.step === 'draft' ? 'draft' : r.step === 'mood' ? 'q1' : r.step

  // ── 동작 ──
  const reveal = useCallback((ids: string[]) => {
    if (!ids.length) return
    setHidden(new Set(ids))
    setTimeout(() => setHidden(new Set()), reduced ? 150 : 650)
  }, [reduced])
  const tapLock = useRef(false)
  const guard = () => { if (tapLock.current || typing) return false; tapLock.current = true; setTimeout(() => { tapLock.current = false }, 300); return true }
  const firstSession = !session.boundaries && !sections.length
  /** 기분(또는 글로 한 첫 답) */
  const answerMood = async (a: { mood?: number; text?: string }) => {
    if (!guard()) return
    hx.tick()
    setAgain(false)
    const follow = aiFlow ? 'open' : consentPending ? 'none' : 'q1'
    const lines = nextLines({ mine: [], answer: a, date, today, hour: new Date().getHours(), stats, name, intro: !prefs.met && firstSession, follow, greet: firstSession })
    if (!lines.length) return
    const firstMe = lines.findIndex((l) => l.role === 'me')
    reveal((await addScripted(date, lines)).slice(firstMe + 1))
    if (!prefs.met) setMet()
  }
  /** 혼자 쓰기의 질문 답 */
  const answerScripted = async (text: string) => {
    if (!guard()) return
    hx.tick()
    const lines = nextLines({ mine: scriptedMine, answer: { text }, date, today, hour: new Date().getHours(), stats, name, intro: false })
    if (!lines.length) return
    reveal((await addScripted(date, lines)).slice(1))
  }
  const opts = (signal: AbortSignal) => ({
    buddy, signal,
    // 글은 저장소에만(받는 말풍선만 다시 그림), 화면 상태는 첫 글자에 한 번만 바꾼다
    onDelta: (t: string) => { stream.set(t); if (t) setAi((x) => (x.kind === 'reading' && !x.started ? { ...x, started: true } : x)) },
    onQueue: (q: number) => setAi((x) => (x.kind === 'reading' && x.queue !== q ? { ...x, queue: q } : x)),
    settle: () => stream.whenShown(800)
  })
  const runAi = async (fn: (signal: AbortSignal) => Promise<unknown>) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    stream.reset()
    const since = new Date().toISOString()
    pinned.current = true
    setAi({ kind: 'reading', started: false, since })
    try {
      const r = await fn(ctrl.signal)
      if (!ctrl.signal.aborted) setAi(r === 'reply' ? { kind: 'landing', since } : { kind: 'idle' })
    } catch (e) {
      if (ctrl.signal.aborted) return
      if (e instanceof AiUnavailable && e.code === 'daily') { setAi({ kind: 'idle' }); setChatCapped(true); reveal(await addScripted(date, [{ role: 'buddy', content: CHAT_LIMIT_LINE }])); return }
      setAi({ kind: 'error', message: e instanceof Error ? e.message : String(e), partial: stream.get().text })
    }
  }
  // 다 받은 답이 저장된 행으로 보이면 받는 말풍선을 내린다(같은 그리기에서 바뀌어 깜빡임 없음)
  const landed = ai.kind === 'landing' && all.some((m) => m.role === 'buddy' && !m.safety && m.created_at >= ai.since)
  useEffect(() => {
    if (ai.kind !== 'landing') return
    if (landed) { setAi({ kind: 'idle' }); return }
    const t = setTimeout(() => setAi({ kind: 'idle' }), 1500)
    return () => clearTimeout(t)
  }, [ai.kind, landed])
  const busy = ai.kind === 'reading' || (ai.kind === 'landing' && !landed)
  /** ■ 멈추기: 받은 글은 흐린 말풍선 + 다시 시도(저장 안 함). 옮기기면 취소 */
  const stop = () => {
    hx.tap()
    abort.current?.abort()
    if (ai.kind === 'reading') setAi({ kind: 'error', message: '', partial: stream.get().text, stopped: true })
    setDistilling(false)
  }
  /** AI와 이야기: 보내기 = 내 말 + 캐릭터 한 턴. "일기로 정리해 줘"·"대화 그대로 저장"은 바로 초안 */
  const say = (t: string) => {
    if (busy) return
    hx.tap()
    if (wantsTranscript(t)) { makeTranscript(); return }
    if (asksDistill(t) && myTalk.length) { void distill(); return }
    if (chatCapped) { void addScripted(date, [{ role: 'me', content: t }]); return }
    void runAi((signal) => chatTurn(date, t, opts(signal)))
  }
  const retry = () => void runAi((signal) => chatTurn(date, null, opts(signal)))
  const nudge = async () => {
    const q = nudgeOf(asked, { mood: sessionMood, past, stats })
    if (!q) return
    reveal(await addScripted(date, [{ role: 'buddy', content: q.q }]))
  }
  // 머뭇거리면(마지막이 캐릭터 말이고 20초 동안 아무것도 안 씀) 질문 하나 — 편마다 3번까지
  const [typed, setTyped] = useState(0)
  const lastRow = S.at(-1)
  useEffect(() => {
    if (phase !== 'talk' || ai.kind !== 'idle' || typing || distilling || !lastRow || lastRow.role !== 'buddy') return
    const t = setTimeout(() => { void nudge() }, STALL_MS)
    return () => clearTimeout(t)
  }, [phase, ai.kind, typing, distilling, lastRow?.id, typed]) // eslint-disable-line react-hooks/exhaustive-deps
  const sessionLines = () => S.filter((m) => m.content !== BYE_ME).map((m) => ({ who: (m.role === 'me' ? 'me' : 'buddy') as 'me' | 'buddy', text: parseBuddyReply(m.content).text }))
  const ownDraft = (): Draft => ({ time: null, title: '', tags: [], body: ownWords(S.filter((m) => m.role === 'me').map((m) => m.content)), source: 'own' })
  /** 일기로 옮기기(서버 distill). 실패·한도면 내 말 그대로 */
  const distill = async (redo?: boolean) => {
    if (distilling) return
    const left = quota ? quota.limit - quota.used : 1
    if (left <= 0) { setDraft(ownDraft()); toast.show('오늘 정리는 다 썼어요. 내 말 그대로 묶었어요'); return }
    hx.tap()
    const ctrl = new AbortController()
    abort.current?.abort()
    abort.current = ctrl
    setDistilling(true)
    dstream.reset()
    setDistillTry(1)
    pinned.current = true
    if (!redo) setDraft(null)
    try {
      // 받는 중인 JSON에서 제목·본문 글만 뽑아 옮기는 중 카드에(28 §8.11)
      const d = await distillSession(date, sessionLines(), sessionMood ?? entry?.mood ?? null, ctrl.signal, (raw, n) => {
        setDistillTry((x) => (x === n ? x : n))
        const pd = partialDistill(raw)
        dstream.set(pd.entry ?? '', pd.title ?? '')
      })
      if (ctrl.signal.aborted) return
      await dstream.whenShown(600)
      if (ctrl.signal.aborted) return
      setDraft({ time: null, title: d.title, tags: d.tags, body: d.entry, source: 'ai' })
      setQuota((q) => (q ? { ...q, used: q.used + 1 } : q))
    } catch (e) {
      if (ctrl.signal.aborted) return
      const capped = e instanceof AiUnavailable && e.code === 'daily'
      if (capped) setQuota((q) => (q ? { ...q, used: q.limit } : { used: 5, limit: 5 }))
      if (!redo) setDraft(ownDraft())
      toast.show(capped ? '오늘 정리는 다 썼어요. 내 말 그대로 묶었어요' : '지금은 정리하지 못했어요. 내 말 그대로 묶었어요', { error: true })
    } finally { if (abort.current === ctrl) setDistilling(false) }
  }
  const makeTranscript = () => setDraft({ time: null, title: draft?.title ?? '', tags: draft?.tags ?? [], body: transcriptOf(sessionLines(), name), source: 'transcript' })
  const save = async () => {
    if (!draft) return
    const body = draft.body.trim()
    const mood = sessionMood ?? entry?.mood ?? null
    if (!body && !mood) return
    hx.tap()
    await saveSection(date, { time: clock(), title: draft.title.trim(), tags: draft.tags, body: body || '(기분만 남겼어요)' }, mood)
    setDraft(null)
    reveal(await addScripted(date, [{ role: 'buddy', content: warmLineOf({ mood, past, done: stats.done }) }]))
  }
  const consentYes = async () => { hx.tap(); setConsent(true); reveal(await addScripted(date, [{ role: 'buddy', content: OPEN_LINE }])) }
  const consentNo = async () => {
    hx.tap()
    setConsent(false)
    reveal(await addScripted(date, [{ role: 'buddy', content: SOLO_LINE }, { role: 'buddy', content: questionOf('q1', { mood: sessionMood, past, stats }).q }]))
  }
  const sayBye = async () => { hx.tap(); const ids = await addScripted(date, [{ role: 'me', content: BYE_ME }, { role: 'buddy', content: BYE_BUDDY }]); reveal(ids.slice(1)) }
  const composerRef = useRef<TextInput>(null)
  const more = async () => {
    hx.tap()
    if (aiFlow) reveal(await addScripted(date, [{ role: 'buddy', content: MORE_LINE }]))
    else setAgain(true)
    setTimeout(() => composerRef.current?.focus(), 120)
  }
  const addTask = async (title: string) => {
    try { await taskFromChip(title); toast.show('할 일에 넣었어요') } catch (e) { toast.show(e instanceof Error ? e.message : '할 일을 만들지 못했어요', { error: true }) }
  }
  const goFree = () => onFree({ text: draft?.body ?? (scriptedFlow ? composeDraft(r.answers, { past }) : ownWords(S.filter((m) => m.role === 'me').map((m) => m.content))), mood: sessionMood ?? entry?.mood ?? null })

  // ── 그리기 ──
  const scroll = useRef<ScrollView>(null)
  const kbH = useKeyboardHeight()
  const lift = useKeyboardLift(insets.bottom)
  const [dockH, setDockH] = useState(120)
  const onDock = (e: LayoutChangeEvent) => setDockH(Math.round(e.nativeEvent.layout.height))
  const toEnd = useCallback(() => scroll.current?.scrollToEnd({ animated: !reduced }), [reduced])
  useEffect(() => { if (kbH) setTimeout(toEnd, 60) }, [kbH, toEnd])
  // 따라 내려가기(28 §8.11): 맨 아래 64px 안이면 내용이 자랄 때 따라가고, 위로 올려 읽는 중이면 멈춘다
  const followEnd = useCallback(() => { if (pinned.current) toEnd() }, [toEnd])
  const openedAt = useRef(new Date().toISOString()).current
  const enter = (createdAt: string) => (createdAt < openedAt ? undefined : reduced ? FadeIn.duration(150) : FadeInDown.duration(220))
  const taskChips = useMemo(() => all.filter((m) => m.role === 'buddy' && !m.safety).map((m) => parseBuddyReply(m.content).task).filter((t): t is string => !!t), [all])
  const made = useExistingTitles(taskChips)

  const visible = all.filter((m) => !hidden.has(m.id))
  const lastBuddy = [...visible].reverse().find((m) => m.role === 'buddy')
  const lastBuddyId = lastBuddy?.id
  // 따뜻한 답이면 마지막 얼굴 happy(28 §8.11), 아니면 기분 얼굴
  const face = (lastBuddy && !lastBuddy.safety && replyFaceOf(lastBuddy.content)) || moodFaceArt(sessionMood ?? entry?.mood)
  const virtualStart = !all.length && !sections.length
  const greet = virtualStart ? greetingOf({ date, today, hour: new Date().getHours(), stats }) : null

  // 저장한 편 카드: k번째 저장 한 줄 앞에 k번째 편(대화 없이 쓴 편이 더 많으면 맨 위에)
  const warmCount = visible.filter((m) => m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)).length
  const extra = Math.max(0, sections.length - warmCount)
  const savedCard = (k: number) => {
    const sec = sections[k]
    if (!sec) return null
    return (
      <SavedCard key={`sec-${k}`} section={sec} date={date} past={past} mood={entry?.mood ?? null} editing={editAt === k}
        onEdit={() => setEditAt(k)} onCancel={() => setEditAt(null)}
        onSave={(s) => { void replaceSection(date, k, s).then(() => { setEditAt(null); toast.show('고쳐서 저장했어요') }) }} />
    )
  }
  const rows: React.ReactNode[] = []
  for (let k = 0; k < extra; k++) rows.push(savedCard(k))
  let warmK = 0
  visible.forEach((m, i) => {
    const prev = visible[i - 1]
    const isAi = !m.safety
    const warm = m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)
    if (warm) { rows.push(savedCard(extra + warmK)); warmK++ }
    if (m.role === 'me') {
      const mood = m.safety === SCRIPTED ? replay([m.content]).answers.mood : null
      rows.push(<Animated.View key={m.id} entering={enter(m.created_at)}><MeRow text={m.content} mood={mood} skip={m.safety === SCRIPTED && isSkip(m.content)} /></Animated.View>)
    } else {
      const parsed = isAi ? parseBuddyReply(m.content) : { text: m.content, task: undefined }
      rows.push(
        <Animated.View key={m.id} entering={isAi ? undefined : enter(m.created_at)}>
          <BuddyRow buddy={buddy} avatar={!prev || prev.role !== 'buddy' || warm} live={m.id === lastBuddyId && !typing && !busy && !distilling} still={reduced} face={m.id === lastBuddyId ? face : 'smile'} ai={isAi}>
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
  })

  // 아래 덩어리
  const qo = { mood: sessionMood, past, stats }
  const nudgeNow = phase === 'talk' && lastRow?.role === 'buddy' && lastRow.safety === SCRIPTED ? (['q1', 'q2', 'q3'] as const).map((s) => questionOf(s, qo)).find((q) => q.q === lastRow.content) : undefined
  const leftDistill = quota ? Math.max(0, quota.limit - quota.used) : null
  const chips: Chip[] = phase === 'mood'
    ? [{ key: 'free', label: '그냥 쓸래요', tone: 'mute', onPress: goFree }]
    : phase === 'talk' ? [
      ...(nudgeNow ? nudgeNow.chips.map((c) => ({ key: c, label: c, onPress: () => say(c) })) : []),
      ...(myTalk.length ? [{ key: 'distill', label: distilling ? '정리하는 중…' : '일기로 정리해 줘', tone: 'acc' as const, onPress: () => void distill() }] : []),
      ...(!nudgeNow && nudgeOf(asked, qo) ? [{ key: 'nudge', label: '뭘 말할지 모르겠어', tone: 'mute' as const, onPress: () => void nudge() }] : []),
      ...(myTalk.length ? [] : [{ key: 'free', label: '그냥 쓸래요', tone: 'mute' as const, onPress: goFree }])
    ]
    : (phase === 'q1' || phase === 'q2' || phase === 'q3') ? [...questionOf(phase, qo).chips.map((c) => ({ key: c, label: c, onPress: () => void answerScripted(c) })), { key: SKIP, label: SKIP, tone: 'mute' as const, onPress: () => void answerScripted(SKIP) }]
    : phase === 'after' ? [{ key: 'more', label: aiFlow ? '더 이야기하기' : '하나 더 남기기', tone: 'acc' as const, onPress: () => void more() }, { key: 'bye', label: BYE_ME, tone: 'mute' as const, onPress: () => void sayBye() }]
    : []
  const line = phase === 'draft' ? '카드를 눌러 고치고, 다 되면 저장'
    : phase === 'end' ? (past ? '그날 일기를 저장했어요' : '오늘 일기를 저장했어요')
    : (phase === 'after' || phase === 'q1' || phase === 'q2' || phase === 'q3') && entry?.private ? `🔒 나만 보기 — ${josa(name, '는', '은')} 정해진 말만 하고, 일기는 어디로도 보내지 않아요`
    : (phase === 'q1' || phase === 'q2' || phase === 'q3') && prefs.consent === false ? `혼자 쓰는 중이에요 · ⋯에서 ${josa(name, '와', '과')} 나누기를 켤 수 있어요`
    : null
  const showComposer = phase === 'mood' || phase === 'talk' || phase === 'q1' || phase === 'q2' || phase === 'q3'
  const placeholder = phase === 'talk' ? `${name}에게 편하게 이야기하기…` : phase === 'mood' ? '직접 써도 돼' : '직접 써도 돼 — 한 줄이면 충분해'

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={swipe}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={followEnd}
          onScroll={(e) => { pinned.current = nearBottom({ scrollTop: e.nativeEvent.contentOffset.y, scrollHeight: e.nativeEvent.contentSize.height, clientHeight: e.nativeEvent.layoutMeasurement.height }) }}
          scrollEventThrottle={32}
          contentContainerStyle={[st.chat, { paddingBottom: dockH + Math.max(0, kbH - insets.bottom) + 12 }]}
        >
          {virtualStart && !typing ? (
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
              <Text style={[st.cardTitle, { color: p.textPrimary }]}>{josa(name, '와', '과')} 편하게 이야기하고 일기로 정리할까?</Text>
              <Text style={[st.fact, { color: p.textSecondary }]}>대화를 일기로 정리하려면 꿈틀 AI가 읽어야 해요.</Text>
              {['꿈틀 서버(우리 Mac mini)에서만 처리하고, 원문은 남기지 않아요', '나만 보기로 둔 날은 보내지 않아요', `혼자 쓰면 ${josa(name, '가', '이')} 정해진 질문만 하고, 일기는 내 말 그대로 남아요`].map((f) => (
                <Text key={f} style={[st.fact, { color: p.textSecondary }]}>· {f}</Text>
              ))}
              <View style={st.btns}>
                <Pressable accessibilityRole="button" onPress={() => void consentNo()} style={[st.btn, { backgroundColor: p.bgSelected }]}><Text style={[st.btnText, { color: p.textPrimary }]}>혼자 쓸게요</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => void consentYes()} style={[st.btn, { backgroundColor: p.accent }]}><Text style={[st.btnText, { color: p.onAccent }]}>나누기</Text></Pressable>
              </View>
              <Text style={[st.small, { color: p.textTertiary }]}>{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요 · ⋯에서 언제든 바꿔요</Text>
            </Animated.View>
          ) : null}
          {ai.kind === 'reading' && !ai.started ? (
            <BuddyRow buddy={buddy} avatar live think still={reduced} ai>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`${name} 생각하는 중`}>
                <Text style={{ color: p.textSecondary, fontSize: 15 }}>{ai.queue ? `차례를 기다리는 중… (앞에 ${ai.queue}명)` : '음…'}</Text><TypingDots still={reduced} />
              </View>
            </BuddyRow>
          ) : null}
          {busy && (ai.kind === 'landing' || (ai.kind === 'reading' && ai.started)) ? (
            <BuddyRow buddy={buddy} avatar live still={reduced} ai>
              <StreamText stream={stream} reduced={reduced} style={[st.msg, { color: p.textPrimary }]} />
            </BuddyRow>
          ) : null}
          {ai.kind === 'error' ? (ai.partial || ai.stopped ? (
            <>
              {ai.partial ? (
                <BuddyRow buddy={buddy} avatar live={false} still={reduced} face={ai.stopped ? 'smile' : 'sleepy'} ai dim>
                  <Text style={[st.msg, { color: p.textSecondary }]}>{parseBuddyReply(ai.partial).text}</Text>
                </BuddyRow>
              ) : null}
              <View style={st.retryRow}>
                <Text style={{ color: p.textTertiary, fontSize: 13 }}>{ai.stopped ? '멈췄어.' : '연결이 끊겼어.'}</Text>
                <Pressable onPress={retry} accessibilityRole="button" hitSlop={8} style={[st.retryChip, { borderColor: p.accent }]}><RotateCcw size={14} color={p.accentInk} /><Text style={{ color: p.accentInk, fontWeight: '600', fontSize: 14 }}>다시 시도</Text></Pressable>
              </View>
            </>
          ) : (
            <View style={[st.card, { backgroundColor: p.cardBg, borderColor: p.borderDivider }]}>
              <Text style={{ color: p.textSecondary, fontSize: 14, lineHeight: 20 }}>지금은 {josa(name, '가', '이')} 쉬고 있어요. 한 말은 그대로 남아 있어요</Text>
              <Pressable onPress={retry} accessibilityRole="button" hitSlop={8} style={st.retry}><RotateCcw size={14} color={p.accentInk} /><Text style={{ color: p.accentInk, fontWeight: '600', fontSize: 14 }}>다시 시도</Text></Pressable>
            </View>
          )) : null}
          {distilling ? <DistillCard stream={dstream} buddy={buddy} name={name} again={distillTry > 1} reduced={reduced} onStop={stop} /> : null}
          {draft && !typing && !distilling ? (
            <DraftCard
              draft={draft} date={date} past={past} name={name} mood={sessionMood ?? entry?.mood ?? null}
              aiFlow={aiFlow} distilling={distilling} left={leftDistill} canTranscript={aiFlow && S.some((m) => m.role === 'me')}
              onChange={(d) => setDraft({ ...draft, ...d })}
              onRedo={() => void distill(true)}
              onTranscript={makeTranscript}
              onSave={() => void save()}
              onBack={aiFlow ? () => setDraft(null) : undefined}
            />
          ) : null}
        </ScrollView>
      </GestureDetector>

      <Animated.View onLayout={onDock} style={[st.dock, { paddingBottom: insets.bottom + 8, backgroundColor: p.pageBg }, lift]}>
        {phase === 'mood' ? <MoodRow onPick={(v) => void answerMood({ mood: v })} disabled={typing} /> : null}
        <ChipRow chips={chips} disabled={typing || busy || distilling} />
        {line ? <Text style={[st.dockline, { color: p.textTertiary }]}>{line}</Text> : null}
        {showComposer ? (
          <Composer
            ref={composerRef}
            ai={phase === 'talk'}
            disabled={typing || busy || distilling}
            onStop={ai.kind === 'reading' || distilling ? stop : undefined}
            placeholder={placeholder}
            onTyping={() => setTyped((n) => n + 1)}
            onSend={(t) => (phase === 'talk' ? say(t) : phase === 'mood' ? void answerMood({ text: t }) : void answerScripted(t))}
          />
        ) : null}
      </Animated.View>
    </View>
  )
}

/** 태그 줄: 칩(✕로 빼기) + `＋ 태그`(감정/사건/영역 꼴) */
function TagEditor({ tags, onChange, editable }: { tags: string[]; onChange?: (t: string[]) => void; editable: boolean }) {
  const p = usePalette()
  const [adding, setAdding] = useState(false)
  const [v, setV] = useState('')
  const add = () => {
    const t = v.trim() ? normalizeTag(v.includes('/') ? v : `감정/${v}`) : null
    if (t && !tags.includes(t)) onChange?.([...tags, t])
    setV(''); setAdding(false)
  }
  if (!tags.length && !editable) return null
  return (
    <View style={st.tags}>
      {tags.map((t) => (
        <Pressable key={t} accessibilityRole="button" accessibilityLabel={editable ? `${t} 빼기` : t} disabled={!editable} onPress={() => onChange?.(tags.filter((x) => x !== t))} hitSlop={6}
          style={[st.tag, { backgroundColor: alpha(p.accent, 0.1) }]}>
          <Text style={{ color: p.accentInk, fontSize: 12.5, fontWeight: '600' }}>{t}</Text>
          {editable ? <X size={12} color={p.accentInk} /> : null}
        </Pressable>
      ))}
      {editable ? (adding ? (
        <TextInput autoFocus value={v} onChangeText={setV} onSubmitEditing={add} onBlur={add} placeholder="감정/설렘" placeholderTextColor={p.textTertiary}
          accessibilityLabel="태그 더하기" style={[st.tag, st.tagInput, { color: p.textPrimary, borderColor: p.borderStrong }]} />
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="태그 더하기" onPress={() => setAdding(true)} hitSlop={8} style={[st.tag, { borderWidth: 1, borderColor: p.borderStrong }]}>
          <Plus size={12} color={p.textSecondary} /><Text style={{ color: p.textSecondary, fontSize: 12.5, fontWeight: '600' }}>태그</Text>
        </Pressable>
      )) : null}
    </View>
  )
}

/** 초안 카드: 제목(고칠 수 있음) · 태그 칩 · 본문(눌러서 고침) · 작은 줄 · [다시 정리] [대화 그대로] [더 이야기] … [저장] */
function DraftCard(props: {
  draft: Draft; date: string; past: boolean; name: string; mood: number | null; aiFlow: boolean; distilling: boolean; left: number | null; canTranscript: boolean
  onChange: (d: Partial<Draft>) => void; onRedo: () => void; onTranscript: () => void; onSave: () => void; onBack?: () => void
}) {
  const p = usePalette()
  const { draft } = props
  const m = moodOf(props.mood)
  const [editing, setEditing] = useState(false)
  const canSave = !!draft.body.trim() || !!props.mood
  const note = draft.source === 'ai' ? `내가 한 말로 정리했어요. ${props.name}의 말과 조언은 넣지 않았어요.`
    : draft.source === 'transcript' ? `대화를 그대로 남겨요(나 · ${props.name}).`
    : '내가 한 말 그대로예요.'
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[st.draft, { backgroundColor: p.cardBg, borderColor: p.borderDivider, shadowOpacity: p.dark ? 0 : 0.1 }]}>
      <View style={st.dh}>
        {m ? <MoodFace mood={m.value} size={28} /> : null}
        <Text style={{ color: p.textTertiary, fontSize: 12, flex: 1 }} numberOfLines={1}>{props.past ? '그날 일기' : '오늘 일기'} · {Number(props.date.slice(5, 7))}월 {Number(props.date.slice(8))}일{m ? ` · ${m.label}` : ''}</Text>
      </View>
      <TextInput value={draft.title} onChangeText={(t) => props.onChange({ title: t })} placeholder="제목(없어도 돼요)" placeholderTextColor={p.textTertiary}
        accessibilityLabel="일기 제목" maxLength={40} style={[st.title, { color: p.textPrimary }]} />
      <TagEditor tags={draft.tags} editable onChange={(tags) => props.onChange({ tags })} />
      {editing ? (
        <TextInput value={draft.body} onChangeText={(t) => props.onChange({ body: t })} multiline autoFocus accessibilityLabel="일기 고치기"
          style={[st.dtEdit, { color: p.textPrimary, backgroundColor: p.bgSelected, borderColor: p.accent }]} />
      ) : (
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="일기 본문 고치기" accessibilityHint="눌러서 그 자리에서 고쳐요">
          <Text style={[st.dt, { color: p.textPrimary }]}>{draft.body.trim() || '(기분만 남겼어요)'}</Text>
        </Pressable>
      )}
      <Text style={[st.dn, { color: p.textTertiary }]}>{note}{props.aiFlow && props.left !== null ? ` · 오늘 정리 ${props.left}번 남음` : ''}</Text>
      <View style={st.da}>
        {props.aiFlow && draft.source !== 'transcript' ? (
          props.left === 0 ? <View style={[st.dbtn, { backgroundColor: p.bgSelected, opacity: 0.6 }]}><Text style={{ color: p.textTertiary, fontSize: 14, fontWeight: '600' }}>오늘은 다 썼어요</Text></View>
            : <Pressable accessibilityRole="button" disabled={props.distilling} onPress={props.onRedo} style={[st.dbtn, { backgroundColor: alpha(p.accent, 0.12) }]}><Text style={{ color: p.accentInk, fontSize: 14, fontWeight: '700' }}>{props.distilling ? '정리하는 중…' : draft.source === 'ai' ? '다시 정리' : '다듬어 줘'}</Text></Pressable>
        ) : null}
        {props.canTranscript && draft.source !== 'transcript' ? <Pressable accessibilityRole="button" onPress={props.onTranscript} style={[st.dbtn, st.ghost, { borderColor: p.borderStrong }]}><Text style={{ color: p.textSecondary, fontSize: 13.5, fontWeight: '600' }}>대화 그대로</Text></Pressable> : null}
        {props.onBack ? <Pressable accessibilityRole="button" onPress={props.onBack} style={[st.dbtn, st.ghost, { borderColor: p.borderStrong }]}><Text style={{ color: p.textSecondary, fontSize: 13.5, fontWeight: '600' }}>더 이야기</Text></Pressable> : null}
        <Pressable accessibilityRole="button" disabled={!canSave || props.distilling} onPress={props.onSave} style={[st.dbtn, { marginLeft: 'auto', backgroundColor: p.accent, opacity: canSave && !props.distilling ? 1 : 0.4 }]}>
          <Text style={{ color: p.onAccent, fontSize: 14, fontWeight: '700' }}>저장</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

/** 저장한 편: 시각 · 제목 · 태그 · 본문 3줄 · ✓ 저장했어요 · 고치기(그 편만) */
function SavedCard({ section, date, past, mood, editing, onEdit, onCancel, onSave }: { section: Section; date: string; past: boolean; mood: number | null; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: (s: Section) => void }) {
  const p = usePalette()
  const [d, setD] = useState(section)
  useEffect(() => { if (editing) setD(section) }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = moodOf(mood)
  return (
    <View style={[st.draft, { backgroundColor: p.cardBg, borderColor: p.borderDivider, shadowOpacity: p.dark ? 0 : 0.05 }]}>
      <View style={st.dh}>
        {m ? <MoodFace mood={m.value} size={24} /> : null}
        <Text style={{ color: p.textTertiary, fontSize: 12, flex: 1 }} numberOfLines={1}>{section.time ?? (past ? '그날' : '오늘')} · {Number(date.slice(5, 7))}월 {Number(date.slice(8))}일</Text>
      </View>
      {editing ? <>
        <TextInput value={d.title} onChangeText={(t) => setD({ ...d, title: t })} placeholder="제목" placeholderTextColor={p.textTertiary} accessibilityLabel="일기 제목" style={[st.title, { color: p.textPrimary }]} />
        <TagEditor tags={d.tags} editable onChange={(tags) => setD({ ...d, tags })} />
        <TextInput value={d.body} onChangeText={(t) => setD({ ...d, body: t })} multiline autoFocus accessibilityLabel="일기 고치기" style={[st.dtEdit, { color: p.textPrimary, backgroundColor: p.bgSelected, borderColor: p.accent }]} />
        <View style={st.da}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={[st.dbtn, st.ghost, { borderColor: p.borderStrong }]}><Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '600' }}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => onSave(d)} style={[st.dbtn, { marginLeft: 'auto', backgroundColor: p.accent }]}><Text style={{ color: p.onAccent, fontSize: 14, fontWeight: '700' }}>저장</Text></Pressable>
        </View>
      </> : <>
        {section.title ? <Text style={[st.title, { color: p.textPrimary }]}>{section.title}</Text> : null}
        <TagEditor tags={section.tags} editable={false} />
        <Text style={[st.dt, { color: p.textSecondary }]} numberOfLines={3}>{section.body}</Text>
        <View style={st.da}>
          <Check size={14} color={p.accentInk} /><Text style={{ color: p.accentInk, fontSize: 12.5, fontWeight: '700' }}>저장했어요</Text>
          <Pressable accessibilityRole="button" onPress={onEdit} style={[st.dbtn, st.ghost, { marginLeft: 'auto', borderColor: p.borderStrong }]}><Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '600' }}>고치기</Text></Pressable>
        </View>
      </>}
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
  retryRow: { marginLeft: 38, flexDirection: 'row', alignItems: 'center', gap: 10 },
  retryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  draft: { marginLeft: 38, marginVertical: 4, borderRadius: 20, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#0B2A22', shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, gap: 6 },
  dh: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '800', paddingVertical: 2, minHeight: 30 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 9, minHeight: 28 },
  tagInput: { borderWidth: 1, minWidth: 100, fontSize: 12.5, paddingVertical: 0 },
  dt: { fontSize: 15.5, lineHeight: 25 },
  dtEdit: { fontSize: 15.5, lineHeight: 25, minHeight: 120, borderRadius: 12, borderWidth: 2, padding: 10, textAlignVertical: 'top' },
  dn: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  da: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  dbtn: { height: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  ghost: { borderWidth: 1, backgroundColor: 'transparent' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 6 },
  dockline: { textAlign: 'center', fontSize: 12, lineHeight: 16, paddingHorizontal: 20, paddingVertical: 8 }
})
