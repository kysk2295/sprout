// 28 §9 v3 오늘 일기 = 캐릭터에게 톡하면 일기가 된다(시안 diary-v6 C~H·J). 사용자 스킬 conversational-journal-to-wiki의 대화·옮기기 규칙은 §8.10 그대로.
// 무대: 고른 배경 장면 끝까지 + 받침 위 캐릭터(Scene.tsx), 말풍선은 장면 위 유리. 아래 덩어리(기분·칩·입력창)는 키보드 바로 위(keyboard.ts).
// 흐름: (처음 한 번) 이야기할지·혼자 쓸지 → 정해진 인사 + 기분 5개(누르기만 해도 기록) → 자유 이야기(AI). 보내자마자 기기에서 반응(💚·🫂·✨ + 끄덕) → 공감 답이 흘러나옴.
//   칩: 오늘 끝낸 할 일 · 그냥 들어줘(질문·조언 없이) · 더 있어 · 여기까지(2번 주고받은 뒤). "이제 잘게" 류 말도 끝.
//   끝 = 일기로 옮겨 **자동 저장**(저장 단추 없음) → 저장한 장 카드(고치기·다시 옮기기) + 정해진 한 줄 + 깡충. 대화가 5분 멈추거나 화면을 떠나도 저절로(data.autoFinish).
//   AI가 쉬면(오류·한도) 정해진 공감 말로 이어 가고 끝은 내 말 그대로. 동의를 끈 사람은 정해진 질문 3개 → 내 말 그대로(AI 0).
import { Check, Plus, RotateCcw, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import { GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { sceneDark } from '@sprout/schema/characterArt'
import { normalizeTag, parseSections, type Section } from '@sprout/schema/diaryPrompts'
import { createTextStream, nearBottom, partialDistill, replyFaceOf } from '@sprout/schema/diaryTalk'
import { useCharacterWear } from '../growth/art/CharacterArt'
import { Glass, myScene, sceneTone } from '../growth/home/glass'
import { timeoutSignal } from '../lib/timeoutSignal'
import { alpha } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { hx } from '../ui/haptics'
import { useToast } from '../ui/Toast'
import { MoodFace } from './art'
import { AiUnavailable, distillQuota, type Quota } from './ai'
import { BuddyRow, ChipRow, Composer, MeRow, MoodRow, TypingDots, moodFaceArt, type Chip } from './chatParts'
import { addScripted, autoFinish, chatTurn, distillSession, isFinishing, replaceSection, saveSection, taskFromChip, useDayStats, useExistingTitles, useMessages } from './data'
import { useKeyboardHeight, useKeyboardLift } from './keyboard'
import { dayTitle, josa, mayCallAi, moodOf, parseBuddyReply, type Buddy, type DiaryEntry } from './logic'
import { DiaryScene, type BuddyState, type SceneHandle } from './Scene'
import { paperOf } from './SoloWrite'
import { DistillCard, StreamText } from './Stream'
import { setConsent, setMet, useDiaryPrefs } from './prefs'
import {
  asksEnd, AUTO_FINISH_MS, BYE_BUDDY, BYE_ME, clock, composeDraft, doneChipsOf, END_BUDDY, END_ME, greetingOf, introLine, isSkip, isWarm, LISTEN_ME,
  localReplyOf, MORE_LINE, nextLines, nudgeOf, ownWords, questionOf, reactionOf, replay, restLineOf, SCRIPTED, sessionOf, SKIP, TIME_LABEL, timeOfDay, warmLineOf
} from './talk'

type Props = {
  date: string
  today: string
  entry: DiaryEntry | undefined
  buddy: Buddy & { stage: number; level: number }
  reduced: boolean
  swipe: GestureType
  /** 혼자 쓰기로: 지금까지 한 말로 만든 글·기분을 넘긴다 */
  onFree: (prefill: { text: string; mood: number | null }) => void
}

/** 화면을 떠난 뒤 저절로 마무리(28 §9 G) — 다시 열면 지운다 */
const autoTimers = new Map<string, ReturnType<typeof setTimeout>>()
export const forgetDraft = (date: string) => { clearTimeout(autoTimers.get(date)); autoTimers.delete(date) }
/** 28 §8.11: reading = 기다림(started false, 생각 얼굴) → 받는 중 · landing = 다 받아 저장 중 · error = 멈춤·끊김(받은 글 partial, 저장 안 함) */
type Ai = { kind: 'idle' } | { kind: 'reading'; started: boolean; queue?: number; since: string } | { kind: 'landing'; since: string } | { kind: 'error'; message: string; partial: string; stopped?: boolean }
const STALL_MS = 20_000
/** 이번 실행에서 마무리한 장: 다시 옮기기에 쓸 대화(앱을 다시 켜면 없음 — 고치기만) */
const finished = new Map<string, { index: number; lines: { who: 'me' | 'buddy'; text: string }[]; mood: number | null }>()

export function Conversation({ date, today, entry, buddy, reduced, swipe, onFree }: Props) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const messages = useMessages(date)
  const stats = useDayStats(date)
  const prefs = useDiaryPrefs()
  const past = date !== today
  const name = buddy.name

  // ── 지금 편(마지막 저장 한 줄 뒤) ──
  const all = useMemo(() => messages.filter((m) => m.safety !== 1), [messages])
  const session = useMemo(() => sessionOf(all), [all])
  const S = session.rows
  const sections = useMemo(() => parseSections(entry?.content), [entry?.content])
  const aiFlow = mayCallAi({ consent: prefs.consent, private: entry?.private, solo: false })
  const scriptedMine = S.filter((m) => m.safety === SCRIPTED && m.role === 'me' && m.content !== BYE_ME && m.content !== END_ME && m.content !== LISTEN_ME).map((m) => m.content)
  const r = useMemo(() => replay(scriptedMine), [scriptedMine.join('\u0001')]) // eslint-disable-line react-hooks/exhaustive-deps
  const myTalk = S.filter((m) => m.role === 'me' && !m.safety)
  const myAll = S.filter((m) => m.role === 'me' && m.content !== END_ME && m.content !== BYE_ME)
  const started = scriptedMine.length > 0 || S.some((m) => m.role === 'buddy' && m.content === MORE_LINE) || myAll.length > 0
  const ended = S.some((m) => m.role === 'buddy' && m.content === END_BUDDY)
  const bye = S.some((m) => m.role === 'buddy' && m.content === BYE_BUDDY)
  const asked = S.filter((m) => m.role === 'buddy' && m.safety === SCRIPTED).map((m) => m.content)
  const consentPending = prefs.consent === null && !entry?.private
  const sessionMood = r.answers.mood ?? null

  const [again, setAgain] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const typing = hidden.size > 0
  const [ai, setAi] = useState<Ai>({ kind: 'idle' })
  const [aiDown, setAiDown] = useState(false) // AI가 쉬는 중 — 이번 화면 동안 정해진 공감 말
  const [listen, setListen] = useState(false) // 그냥 들어줘
  const [finishing, setFinishing] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [quota, setQuota] = useState<Quota>(null)
  const [editAt, setEditAt] = useState<number | null>(null)
  const [distillTry, setDistillTry] = useState(1)
  const [reacts, setReacts] = useState<Map<string, string>>(() => new Map())
  const localN = useRef(0)
  const stream = useMemo(createTextStream, [])
  const dstream = useMemo(createTextStream, [])
  const pinned = useRef(true)
  const abort = useRef<AbortController | null>(null)
  const scene = useRef<SceneHandle>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    if (!aiFlow) return
    const ctrl = new AbortController()
    void distillQuota(ctrl.signal).then(setQuota)
    return () => ctrl.abort()
  }, [aiFlow])

  // ── 단계 ──
  type Phase = 'consent' | 'mood' | 'talk' | 'q1' | 'q2' | 'q3' | 'own' | 'finishing' | 'after' | 'end'
  const scriptedFlow = !aiFlow && !consentPending
  const phase: Phase = finishing || (ended && !isWarmAfterEnd(S)) ? 'finishing'
    : !started ? (consentPending ? 'consent' : bye ? 'end' : (session.boundaries || sections.length) && !again ? 'after' : 'mood')
    : aiFlow ? 'talk'
    : r.step === 'draft' ? 'own' : r.step === 'mood' ? 'q1' : r.step

  // ── 동작 ──
  const reveal = useCallback((ids: string[]) => {
    if (!ids.length) return
    setHidden(new Set(ids))
    setTimeout(() => setHidden(new Set()), reduced ? 150 : 650)
  }, [reduced])
  const tapLock = useRef(false)
  const guard = () => { if (tapLock.current || typing) return false; tapLock.current = true; setTimeout(() => { tapLock.current = false }, 300); return true }
  const firstSession = !session.boundaries && !sections.length
  const react = (t: string) => { setReacts((m) => new Map(m).set(t, reactionOf(t, sessionMood ?? entry?.mood ?? null))); hx.tap(); scene.current?.nod() }
  /** 기분(또는 글로 한 첫 답) */
  const answerMood = async (a: { mood?: number; text?: string }) => {
    if (!guard()) return
    hx.tick()
    setAgain(false)
    if (a.text) react(a.text)
    const follow = aiFlow ? 'open' : 'q1'
    const lines = nextLines({ mine: [], answer: a, date, today, hour: new Date().getHours(), stats, name, intro: !prefs.met && firstSession, follow, greet: firstSession })
    if (!lines.length) return
    const firstMe = lines.findIndex((l) => l.role === 'me')
    reveal((await addScripted(date, lines)).slice(firstMe + 1))
    if (!prefs.met) setMet()
    scene.current?.nod()
  }
  const answerScripted = async (text: string) => {
    if (!guard()) return
    hx.tick()
    if (!isSkip(text)) react(text)
    const lines = nextLines({ mine: scriptedMine, answer: { text }, date, today, hour: new Date().getHours(), stats, name, intro: false })
    if (!lines.length) return
    reveal((await addScripted(date, lines)).slice(1))
  }
  const opts = (signal: AbortSignal) => ({
    buddy, signal, listen,
    onDelta: (t: string) => { stream.set(t); if (t) setAi((x) => (x.kind === 'reading' && !x.started ? { ...x, started: true } : x)) },
    onQueue: (q: number) => setAi((x) => (x.kind === 'reading' && x.queue !== q ? { ...x, queue: q } : x)),
    settle: () => stream.whenShown(800)
  })
  /** AI 없이 정해진 공감 말로 한 턴(쉬는 중·한도) */
  const localTurn = async (t: string, withMine: boolean) => {
    const line = localReplyOf(t, sessionMood ?? entry?.mood ?? null, localN.current++)
    const ids = await addScripted(date, withMine ? [{ role: 'me', content: t }, { role: 'buddy', content: line }] : [{ role: 'buddy', content: line }])
    reveal(withMine ? ids.slice(1) : ids)
  }
  const runAi = async (t: string | null) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    stream.reset()
    const since = new Date().toISOString()
    pinned.current = true
    setAi({ kind: 'reading', started: false, since })
    try {
      const res = await chatTurn(date, t, opts(ctrl.signal))
      if (!ctrl.signal.aborted) setAi(res === 'reply' ? { kind: 'landing', since } : { kind: 'idle' })
    } catch (e) {
      if (ctrl.signal.aborted) return
      const partial = stream.get().text
      // 글을 받다 끊겼으면 다시 시도(받은 글 그대로), 처음부터 안 되면(쉬는 중·한도) 정해진 공감 말로 이어 간다(28 §9 J)
      if (partial) { setAi({ kind: 'error', message: e instanceof Error ? e.message : String(e), partial }); return }
      setAi({ kind: 'idle' })
      setAiDown(true)
      await localTurn(t ?? '', false)
    }
  }
  const landed = ai.kind === 'landing' && all.some((m) => m.role === 'buddy' && !m.safety && m.created_at >= ai.since)
  useEffect(() => {
    if (ai.kind !== 'landing') return
    if (landed) { setAi({ kind: 'idle' }); return }
    const t = setTimeout(() => setAi({ kind: 'idle' }), 1500)
    return () => clearTimeout(t)
  }, [ai.kind, landed])
  const busy = ai.kind === 'reading' || (ai.kind === 'landing' && !landed)
  const stop = () => {
    hx.tap()
    abort.current?.abort()
    if (ai.kind === 'reading') setAi({ kind: 'error', message: '', partial: stream.get().text, stopped: true })
    setDistilling(false)
  }
  /** 보내기: 끝내는 말이면 마무리, 아니면 반응 + 캐릭터 한 턴 */
  const say = (t: string) => {
    if (busy || finishing) return
    if (asksEnd(t)) { void finish(t); return }
    react(t)
    if (aiDown) { void localTurn(t, true); return }
    void runAi(t)
  }
  const retry = () => void runAi(null)
  const nudge = async () => {
    const q = nudgeOf(asked, { mood: sessionMood, past, stats })
    if (!q) return
    reveal(await addScripted(date, [{ role: 'buddy', content: q.q }]))
  }
  const [typed, setTyped] = useState(0)
  const [drafting, setDrafting] = useState(false)
  const lastRow = S.at(-1)
  useEffect(() => {
    // 막힐 때만(이야기 초반 — 두 번 주고받은 뒤엔 묻지 않는다, 계속 물으면 숙제 같아짐)
    if (phase !== 'talk' || ai.kind !== 'idle' || typing || finishing || !lastRow || lastRow.role !== 'buddy' || myTalk.length >= 2) return
    const t = setTimeout(() => { void nudge() }, STALL_MS)
    return () => clearTimeout(t)
  }, [phase, ai.kind, typing, finishing, lastRow?.id, typed]) // eslint-disable-line react-hooks/exhaustive-deps

  const sessionLines = () => S.filter((m) => m.content !== BYE_ME && m.content !== END_ME && m.content !== END_BUDDY).map((m) => ({ who: (m.role === 'me' ? 'me' : 'buddy') as 'me' | 'buddy', text: parseBuddyReply(m.content).text }))
  const ownBody = () => (scriptedFlow ? composeDraft(r.answers, { past }) : ownWords(myAll.filter((m) => m.content !== LISTEN_ME).map((m) => m.content)))
  /** 마무리(28 §9 G): 끝 말 → 일기로 옮겨(되면) 자동 저장 → 저장 한 줄 + 깡충. 안 되면 내 말 그대로 */
  const finish = async (said?: string) => {
    if (finishing || isFinishing(date)) return
    forgetDraft(date)
    setFinishing(true)
    hx.tap()
    try {
      const lines = sessionLines()
      const mood = sessionMood ?? entry?.mood ?? null
      if (!ended) reveal((await addScripted(date, [{ role: 'me', content: said?.trim() || END_ME }, { role: 'buddy', content: END_BUDDY }])).slice(1))
      const index = sections.length
      let sec: Section = { time: clock(), title: '', tags: [], body: ownBody() }
      const left = quota ? quota.limit - quota.used : 1
      if (aiFlow && !aiDown && left > 0 && myTalk.length) {
        const d = await distillLive(lines, mood)
        if (d) sec = { ...sec, title: d.title, tags: d.tags, body: d.entry }
      }
      if (!sec.body.trim() && !mood) return
      await saveSection(date, { ...sec, body: sec.body.trim() || '(기분만 남겼어요)' }, mood)
      finished.set(date, { index, lines, mood })
      reveal(await addScripted(date, [{ role: 'buddy', content: warmLineOf({ mood, past, done: stats.done }) }]))
      hx.success()
      setTimeout(() => scene.current?.hop(), 300)
      setListen(false)
    } finally { setFinishing(false) }
  }
  /** 옮기기(스트림 카드). 실패·한도면 null(내 말 그대로) */
  const distillLive = async (lines: { who: 'me' | 'buddy'; text: string }[], mood: number | null) => {
    const ctrl = new AbortController()
    abort.current?.abort()
    abort.current = ctrl
    setDistilling(true)
    dstream.reset()
    setDistillTry(1)
    pinned.current = true
    try {
      const d = await distillSession(date, lines, mood, ctrl.signal, (raw, n) => {
        setDistillTry((x) => (x === n ? x : n))
        const pd = partialDistill(raw)
        dstream.set(pd.entry ?? '', pd.title ?? '')
      })
      if (ctrl.signal.aborted) return null
      await dstream.whenShown(600)
      setQuota((q) => (q ? { ...q, used: q.used + 1 } : q))
      return d
    } catch (e) {
      if (ctrl.signal.aborted) return null
      const capped = e instanceof AiUnavailable && e.code === 'daily'
      if (capped) setQuota((q) => (q ? { ...q, used: q.limit } : { used: 5, limit: 5 }))
      toast.show(capped ? '오늘 정리는 다 썼어요. 내 말 그대로 남겼어요' : '지금은 옮기지 못했어요. 내 말 그대로 남겼어요', { error: true })
      return null
    } finally { if (abort.current === ctrl) setDistilling(false) }
  }
  /** 저장한 장 다시 옮기기(이번 실행에서 마무리한 장만) */
  const redo = async (k: number) => {
    const f = finished.get(date)
    if (!f || f.index !== k || distilling) return
    const sec = sections[k]
    const d = await distillLive(f.lines, f.mood)
    if (d && sec) { await replaceSection(date, k, { ...sec, title: d.title, tags: d.tags, body: d.entry }); toast.show('다시 옮겼어요') }
  }
  // 동의를 끈 사람: 질문 3개를 다 답하면 내 말 그대로 저절로 저장
  const ownSaving = useRef(false)
  useEffect(() => {
    if (phase !== 'own' || ownSaving.current) return
    ownSaving.current = true
    void finish().finally(() => { ownSaving.current = false })
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
  // 끝 말까지 남기고 앱이 꺼졌으면(저장 한 줄 없음) 열 때 이어서 마무리
  useEffect(() => { if (phase === 'finishing' && !finishing && !isFinishing(date)) void finish() }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
  // 대화가 5분 멈추면 저절로 마무리(열려 있을 때). 다시 열었을 때 이미 5분 지났으면 바로
  useEffect(() => {
    clearTimeout(autoTimers.get(date)); autoTimers.delete(date)
    if (phase !== 'talk' || busy || finishing || typing || !myTalk.length || !lastRow) return
    const age = Date.now() - Date.parse(lastRow.created_at)
    const t = setTimeout(() => { void finish() }, Math.max(1500, AUTO_FINISH_MS - age))
    return () => clearTimeout(t)
  }, [phase, busy, finishing, typing, myTalk.length, lastRow?.id, typed]) // eslint-disable-line react-hooks/exhaustive-deps
  // 화면을 떠나면: 남은 시간 뒤 화면 밖에서 마무리(앱이 켜져 있는 동안). 앱이 꺼졌으면 다음에 열 때 위 효과가 한다
  const leave = useRef({ need: false, at: 0 })
  leave.current = { need: phase === 'talk' && myTalk.length > 0 && !finishing, at: lastRow ? Date.parse(lastRow.created_at) : 0 }
  useEffect(() => () => {
    if (!leave.current.need) return
    const wait = Math.max(5_000, AUTO_FINISH_MS - (Date.now() - leave.current.at))
    autoTimers.set(date, setTimeout(() => { autoTimers.delete(date); void autoFinish(date, timeoutSignal(180_000)).catch(() => {}) }, wait))
  }, [date])

  const consentYes = () => { hx.tap(); setConsent(true) }
  const consentNo = () => { hx.tap(); setConsent(false); onFree({ text: '', mood: entry?.mood ?? null }) }
  const sayBye = async () => { hx.tap(); const ids = await addScripted(date, [{ role: 'me', content: BYE_ME }, { role: 'buddy', content: BYE_BUDDY }]); reveal(ids.slice(1)) }
  const composerRef = useRef<TextInput>(null)
  const more = async () => {
    hx.tap()
    if (aiFlow) reveal(await addScripted(date, [{ role: 'buddy', content: MORE_LINE }]))
    else setAgain(true)
    setTimeout(() => composerRef.current?.focus(), 120)
  }
  const listenOn = async () => {
    hx.tap()
    setListen(true)
    react(LISTEN_ME)
    reveal(await addScripted(date, [{ role: 'me', content: LISTEN_ME }, { role: 'buddy', content: '응, 그냥 들을게. 편하게 말해.' }]).then((ids) => ids.slice(1)))
  }
  const addTask = async (title: string) => {
    try { await taskFromChip(title); toast.show('할 일에 넣었어요') } catch (e) { toast.show(e instanceof Error ? e.message : '할 일을 만들지 못했어요', { error: true }) }
  }

  // ── 무대 ──
  const wear = useCharacterWear()
  const sceneKey = myScene(wear?.species ? wear.wear.eq?.bg : null, p.dark)
  const tone = sceneTone(sceneKey)
  const [area, setArea] = useState({ w: 0, h: 0 })
  const fullH = useRef(0)
  const kbH = useKeyboardHeight()
  if (!kbH && area.h > fullH.current) fullH.current = area.h
  const lift = useKeyboardLift(insets.bottom)
  const [dockH, setDockH] = useState(140)
  const onDock = (e: LayoutChangeEvent) => setDockH(Math.round(e.nativeEvent.layout.height))
  const kbLift = Math.max(0, kbH - insets.bottom)
  const buddySize = kbH ? 72 : 124
  const perchY = area.h - dockH - kbLift - 6
  const buddyRoom = buddySize * 0.9 + 18

  // ── 그리기 ──
  const scroll = useRef<ScrollView>(null)
  const toEnd = useCallback(() => scroll.current?.scrollToEnd({ animated: !reduced }), [reduced])
  useEffect(() => { if (kbH) setTimeout(toEnd, 60) }, [kbH, toEnd])
  const followEnd = useCallback(() => { if (pinned.current) toEnd() }, [toEnd])
  const openedAt = useRef(new Date().toISOString()).current
  const enter = (createdAt: string) => (createdAt < openedAt ? undefined : reduced ? FadeIn.duration(150) : FadeInDown.duration(220))
  const taskChips = useMemo(() => all.filter((m) => m.role === 'buddy' && !m.safety).map((m) => parseBuddyReply(m.content).task).filter((t): t is string => !!t), [all])
  const made = useExistingTitles(taskChips)

  const visible = all.filter((m) => !hidden.has(m.id))
  const lastBuddy = [...visible].reverse().find((m) => m.role === 'buddy')
  const face = aiDown ? 'sleepy' : (lastBuddy && !lastBuddy.safety && replyFaceOf(lastBuddy.content)) || moodFaceArt(sessionMood ?? entry?.mood)
  const virtualStart = !all.length && !sections.length
  const greet = virtualStart ? greetingOf({ date, today, hour: new Date().getHours(), stats }) : null
  const streaming = busy && (ai.kind === 'landing' || (ai.kind === 'reading' && ai.started))
  const bstate: BuddyState = (ai.kind === 'reading' && !ai.started) || distilling ? 'think' : streaming ? 'talk' : drafting ? 'listen' : 'idle'

  const warmCount = visible.filter((m) => m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)).length
  const extra = Math.max(0, sections.length - warmCount)
  const paper = paperOf(p.dark, p.cardBg)
  const f = finished.get(date)
  const savedCard = (k: number) => {
    const sec = sections[k]
    if (!sec) return null
    return (
      <SavedCard key={`sec-${k}`} section={sec} date={date} past={past} mood={entry?.mood ?? null} editing={editAt === k} paper={paper}
        canRedo={!!f && f.index === k && !sec.solo && aiFlow && !aiDown && (quota ? quota.used < quota.limit : true)} redoing={distilling}
        onRedo={() => void redo(k)} onEdit={() => setEditAt(k)} onCancel={() => setEditAt(null)}
        onSave={(s) => { void replaceSection(date, k, s).then(() => { setEditAt(null); toast.show('고쳐서 저장했어요') }) }} />
    )
  }
  const rows: React.ReactNode[] = []
  for (let k = 0; k < extra; k++) rows.push(savedCard(k))
  let warmK = 0
  visible.forEach((m) => {
    const isAi = !m.safety
    const warm = m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)
    if (warm) { rows.push(savedCard(extra + warmK)); warmK++ }
    if (m.role === 'me') {
      const mood = m.safety === SCRIPTED ? replay([m.content]).answers.mood : null
      const rx = m.created_at >= openedAt ? reacts.get(m.content) : undefined
      rows.push(<Animated.View key={m.id} entering={enter(m.created_at)}><MeRow text={m.content} mood={mood} skip={m.safety === SCRIPTED && isSkip(m.content)} react={rx} scene still={reduced} /></Animated.View>)
    } else {
      const parsed = isAi ? parseBuddyReply(m.content) : { text: m.content, task: undefined }
      rows.push(
        <Animated.View key={m.id} entering={isAi ? undefined : enter(m.created_at)}>
          <BuddyRow buddy={buddy} avatar={false} live={false} still={reduced} tone={tone} ai={isAi}>
            <Text style={[st.msg, { color: tone.ink }]}>{parsed.text}</Text>
            {parsed.task ? (
              <Pressable accessibilityRole="button" disabled={made.has(parsed.task)} onPress={() => void addTask(parsed.task!)} hitSlop={6} style={[st.taskChip, { borderColor: tone.line, backgroundColor: tone.soft }]}>
                {made.has(parsed.task) ? <Check size={14} color={tone.ink} /> : <Plus size={14} color={tone.ink} />}
                <Text style={{ color: tone.ink, fontSize: 13, fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>{made.has(parsed.task) ? '할 일에 넣었어요' : `할 일로: ${parsed.task}`}</Text>
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
  const low = (sessionMood ?? entry?.mood ?? 3) <= 2
  const exchanges = myTalk.length + (aiDown ? myAll.filter((m) => m.safety === SCRIPTED).length : 0)
  const doneChips = doneChipsOf(stats.doneTitles, myAll.map((m) => m.content))
  const listenChip: Chip[] = !listen && lastRow?.role === 'buddy' && exchanges ? [{ key: 'listen', label: LISTEN_ME, onPress: () => void listenOn() }] : []
  const chips: Chip[] = phase === 'talk' ? [
    ...(low ? listenChip : []),
    ...(nudgeNow ? nudgeNow.chips.map((c) => ({ key: c, label: c, onPress: () => say(c) })) : doneChips.map((t) => ({ key: `done-${t}`, label: `✓ ${t}`, onPress: () => say(`${t} 했어`) }))),
    ...(!low ? listenChip : []),
    ...(!nudgeNow && !exchanges && nudgeOf(asked, qo) ? [{ key: 'nudge', label: '뭘 말할지 모르겠어', tone: 'mute' as const, onPress: () => void nudge() }] : []),
    ...(exchanges >= 2 ? [{ key: 'end', label: '여기까지 ✓', tone: 'acc' as const, onPress: () => void finish() }] : [])
  ]
    : (phase === 'q1' || phase === 'q2' || phase === 'q3') ? [...questionOf(phase, qo).chips.map((c) => ({ key: c, label: c, onPress: () => void answerScripted(c) })), { key: SKIP, label: SKIP, tone: 'mute' as const, onPress: () => void answerScripted(SKIP) }]
    : phase === 'after' ? [{ key: 'more', label: aiFlow ? '더 이야기하기' : '하나 더 남기기', tone: 'acc' as const, onPress: () => void more() }, { key: 'bye', label: BYE_ME, tone: 'mute' as const, onPress: () => void sayBye() }]
    : []
  const line = phase === 'end' ? (past ? '그날 일기를 저장했어요' : '오늘 일기를 저장했어요')
    : phase === 'finishing' ? `${josa(name, '가', '이')} 일기로 옮기는 중이에요`
    : aiDown && phase === 'talk' ? restLineOf(name)
    : (phase === 'q1' || phase === 'q2' || phase === 'q3') ? `혼자 쓰는 중이에요 · ⋯에서 ${josa(name, '와', '과')} 나누기를 켤 수 있어요`
    : null
  const showComposer = phase === 'mood' || phase === 'talk' || phase === 'q1' || phase === 'q2' || phase === 'q3'
  const placeholder = phase === 'talk' ? (exchanges ? '더 말해 줘도 돼' : `${name}에게 편하게 이야기하기…`) : phase === 'mood' ? '아니면 그냥 말해 줘' : '직접 써도 돼 — 한 줄이면 충분해'

  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setArea((o) => (o.w === width && o.h === height ? o : { w: width, h: height })) }}>
      {area.w ? (
        <DiaryScene ref={scene} sceneKey={sceneKey} width={area.w} height={Math.max(area.h, fullH.current)} perchY={perchY} size={buddySize}
          buddy={buddy} state={bstate} mood={(ai.kind === 'reading' && !ai.started) || distilling ? 'think' : face} reduced={reduced} />
      ) : null}
      <GestureDetector gesture={swipe}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={followEnd}
          onScroll={(e) => { pinned.current = nearBottom({ scrollTop: e.nativeEvent.contentOffset.y, scrollHeight: e.nativeEvent.contentSize.height, clientHeight: e.nativeEvent.layoutMeasurement.height }) }}
          scrollEventThrottle={32}
          contentContainerStyle={[st.chat, { paddingBottom: dockH + kbLift + buddyRoom }]}
        >
          <Text style={[st.daysep, { color: tone.sub }]}>{dayTitle(date)}{past ? '' : ` · ${TIME_LABEL[timeOfDay(new Date().getHours())]}`}</Text>
          {virtualStart && !prefs.met ? <BuddyRow buddy={buddy} avatar={false} live={false} still={reduced} tone={tone}><Text style={[st.msg, { color: tone.ink }]}>{introLine(name)}</Text></BuddyRow> : null}
          {greet ? <BuddyRow buddy={buddy} avatar={false} live={false} still={reduced} tone={tone}><Text style={[st.msg, { color: tone.ink }]}>{greet}</Text></BuddyRow> : null}
          {rows}
          {typing ? <BuddyRow buddy={buddy} avatar={false} live={false} still={reduced} tone={tone}><TypingDots still={reduced} /></BuddyRow> : null}
          {phase === 'consent' && !typing ? (
            <Animated.View entering={reduced ? FadeIn.duration(150) : FadeInDown.duration(220)} style={[st.card, { backgroundColor: paper, borderColor: p.borderDivider }]}>
              <Text style={[st.cardTitle, { color: p.textPrimary }]}>{josa(name, '와', '과')} 이야기하고 일기로 남길까?</Text>
              {[`이야기하면 ${josa(name, '가', '이')} 공감해 주고, 끝나면 내 말로 일기를 써서 저장해요`, '그러려면 꿈틀 AI가 대화를 읽어요 — 꿈틀 서버에서만, 원문은 남기지 않아요', '싫으면 혼자 쓰기 — AI 없이 메모장처럼 써요'].map((f2) => (
                <Text key={f2} style={[st.fact, { color: p.textSecondary }]}>· {f2}</Text>
              ))}
              <View style={st.btns}>
                <Pressable accessibilityRole="button" onPress={consentNo} style={[st.btn, { backgroundColor: p.bgSelected }]}><Text style={[st.btnText, { color: p.textPrimary }]}>혼자 쓰기</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={consentYes} style={[st.btn, { backgroundColor: p.accent }]}><Text style={[st.btnText, { color: p.onAccent }]}>이야기하기</Text></Pressable>
              </View>
              <Text style={[st.small, { color: p.textTertiary }]}>{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요 · ⋯에서 언제든 바꿔요</Text>
            </Animated.View>
          ) : null}
          {ai.kind === 'reading' && !ai.started ? (
            <BuddyRow buddy={buddy} avatar={false} live={false} still={reduced} tone={tone} ai>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`${name} 생각하는 중`}>
                {ai.queue ? <Text style={{ color: tone.sub, fontSize: 14 }}>{`차례 기다리는 중 (앞에 ${ai.queue}명)`}</Text> : null}<TypingDots still={reduced} />
              </View>
            </BuddyRow>
          ) : null}
          {streaming ? (
            <BuddyRow buddy={buddy} avatar={false} live={false} still={reduced} tone={tone} ai>
              <StreamText stream={stream} reduced={reduced} style={[st.msg, { color: tone.ink }]} />
            </BuddyRow>
          ) : null}
          {ai.kind === 'error' ? (
            <>
              {ai.partial ? (
                <BuddyRow buddy={buddy} avatar={false} live={false} still={reduced} tone={tone} ai dim>
                  <Text style={[st.msg, { color: tone.sub }]}>{parseBuddyReply(ai.partial).text}</Text>
                </BuddyRow>
              ) : null}
              <View style={st.retryRow}>
                <Text style={{ color: tone.sub, fontSize: 13 }}>{ai.stopped ? '멈췄어.' : '연결이 끊겼어.'}</Text>
                <Pressable onPress={retry} accessibilityRole="button" hitSlop={8} style={[st.retryChip, { backgroundColor: 'rgba(255,255,255,0.94)' }]}><RotateCcw size={14} color="#12715E" /><Text style={{ color: '#12715E', fontWeight: '600', fontSize: 14 }}>다시 시도</Text></Pressable>
              </View>
            </>
          ) : null}
          {distilling ? <DistillCard stream={dstream} buddy={buddy} name={name} again={distillTry > 1} reduced={reduced} onStop={stop} /> : null}
        </ScrollView>
      </GestureDetector>

      <Animated.View onLayout={onDock} style={[st.dock, { paddingBottom: insets.bottom + 8 }, lift]} pointerEvents="box-none">
        {phase === 'mood' ? (
          <Glass dark={sceneDark(sceneKey)} radius={24} style={st.moodGlass}>
            <MoodRow onPick={(v) => void answerMood({ mood: v })} disabled={typing} ink={tone.ink} />
          </Glass>
        ) : null}
        <ChipRow chips={chips} disabled={typing || busy || finishing} tone={tone} />
        {line ? <Text style={[st.dockline, { color: tone.sub }]}>{line}</Text> : null}
        {showComposer ? (
          <Composer
            ref={composerRef}
            ai={phase === 'talk' && !aiDown}
            disabled={typing || busy || finishing}
            onStop={ai.kind === 'reading' || distilling ? stop : undefined}
            placeholder={placeholder}
            onTyping={() => { setTyped((n) => n + 1); setDrafting(true) }}
            onSend={(t) => { setDrafting(false); Keyboard.dismiss(); (phase === 'talk' ? say(t) : phase === 'mood' ? void answerMood({ text: t }) : void answerScripted(t)) }}
          />
        ) : null}
      </Animated.View>
    </View>
  )
}

/** 끝 말 뒤 아직 저장 한 줄이 없으면 마무리 중(앱이 꺼졌다 켜진 경우 포함 — 위 autoFinish가 이어서 저장) */
function isWarmAfterEnd(rows: { role: string; content: string }[]): boolean {
  const i = rows.findIndex((m) => m.role === 'buddy' && m.content === END_BUDDY)
  return i < 0 || rows.slice(i + 1).some((m) => m.role === 'buddy' && isWarm(m.content))
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

/** 저장한 장(28 §9 H): 종이 카드 — 기분 띠 · 시각 · 제목 · 태그 · 본문 · ✓ 저장됨 · 고치기 · 다시 옮기기(방금 마무리한 장) */
function SavedCard({ section, date, past, mood, editing, paper, canRedo, redoing, onRedo, onEdit, onCancel, onSave }: {
  section: Section; date: string; past: boolean; mood: number | null; editing: boolean; paper: string; canRedo: boolean; redoing: boolean
  onRedo: () => void; onEdit: () => void; onCancel: () => void; onSave: (s: Section) => void
}) {
  const p = usePalette()
  const [d, setD] = useState(section)
  useEffect(() => { if (editing) setD(section) }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = moodOf(mood)
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={[st.paper, { backgroundColor: paper, shadowOpacity: p.dark ? 0 : 0.16 }]}>
      <View style={[st.band, { backgroundColor: m?.color ?? p.accent }]} />
      <View style={st.pin}>
        <View style={st.dh}>
          {m ? <MoodFace mood={m.value} size={24} /> : null}
          <Text style={{ color: p.textTertiary, fontSize: 12, flex: 1 }} numberOfLines={1}>{m ? `${m.label} · ` : ''}{section.time ?? (past ? '그날' : '오늘')} · {Number(date.slice(5, 7))}월 {Number(date.slice(8))}일</Text>
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
          <Text style={[st.dt, { color: p.textPrimary }]}>{section.body}</Text>
          <View style={st.da}>
            <Check size={14} color={p.accentInk} /><Text style={{ color: p.accentInk, fontSize: 12.5, fontWeight: '700' }}>저장됨</Text>
            <View style={{ flex: 1 }} />
            {canRedo ? <Pressable accessibilityRole="button" disabled={redoing} onPress={onRedo} style={[st.dbtn, { backgroundColor: alpha(p.textTertiary, 0.12) }]}><Text style={{ color: p.textSecondary, fontSize: 13.5, fontWeight: '600' }}>{redoing ? '옮기는 중…' : '다시 옮기기'}</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={onEdit} style={[st.dbtn, { backgroundColor: alpha(p.textTertiary, 0.12) }]}><Text style={{ color: p.textSecondary, fontSize: 13.5, fontWeight: '600' }}>고치기</Text></Pressable>
          </View>
        </>}
      </View>
    </Animated.View>
  )
}

const st = StyleSheet.create({
  chat: { paddingHorizontal: 12, paddingTop: 4, gap: 8 },
  daysep: { alignSelf: 'center', fontSize: 11.5, fontWeight: '600', paddingTop: 8, paddingBottom: 4 },
  msg: { fontSize: 15, lineHeight: 22 },
  taskChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, minHeight: 32 },
  card: { borderRadius: 22, padding: 16, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontSize: 16, fontWeight: '800', lineHeight: 22, marginBottom: 2 },
  fact: { fontSize: 13, lineHeight: 19 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  small: { fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  retryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 14, borderRadius: 18 },
  paper: { marginVertical: 4, borderRadius: 22, overflow: 'hidden', shadowColor: '#0B2A22', shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  band: { height: 5 },
  pin: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 6 },
  dh: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, paddingVertical: 2, minHeight: 30 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 9, minHeight: 28 },
  tagInput: { borderWidth: 1, minWidth: 100, fontSize: 12.5, paddingVertical: 0 },
  dt: { fontSize: 15.5, lineHeight: 26 },
  dtEdit: { fontSize: 15.5, lineHeight: 25, minHeight: 120, borderRadius: 12, borderWidth: 2, padding: 10, textAlignVertical: 'top' },
  da: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  dbtn: { height: 38, paddingHorizontal: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  ghost: { borderWidth: 1, backgroundColor: 'transparent' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 6 },
  moodGlass: { marginHorizontal: 10, marginBottom: 8, paddingTop: 10 },
  dockline: { textAlign: 'center', fontSize: 12, lineHeight: 16, paddingHorizontal: 20, paddingVertical: 8 }
})
