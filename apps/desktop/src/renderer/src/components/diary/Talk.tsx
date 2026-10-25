import { ArrowUp, Check, Plus, RotateCcw, Square } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { sceneDark, sceneGlass, sceneKeyFor } from '@sprout/schema/characterArt'
import { parseSections, type Section } from '@sprout/schema/diaryPrompts'
import {
  asksEnd, AUTO_FINISH_MS, BYE_BUDDY, BYE_ME, clock, composeDraft, createTextStream, doneChipsOf, END_BUDDY, END_ME, greetingOf, introLine, isSkip, isWarm, LISTEN_ME,
  localReplyOf, MORE_LINE, moodShort, nearBottom, nextLines, nudgeOf, ownWords, partialDistill, questionOf, reactionOf, replay, replyFaceOf, restLineOf, SCRIPTED, sessionOf, SKIP,
  TIME_LABEL, timeOfDay, warmLineOf
} from '@sprout/schema/diaryTalk'
import { useQuery } from '../../data/useQuery'
import { useRaise } from '../../data/raise'
import {
  addScripted, autoFinish, chatTurn, distillQuota, distillSession, hasMet, isDailyCap, isFinishing, josa, markFinishing, mayCallAi, MESSAGES_BY_DATE_SQL, moodOf, MOODS,
  parseBuddyReply, replaceSection, saveEntry, saveSection, setConsent, setMet, taskFromChip, useDayStats, usePhotos, type Buddy, type DiaryEntry, type DiaryMessage
} from '../../data/diary'
import { useDocDark } from '../growth/MakeFlow'
import { useToast } from '../Toast'
import { MoodFace } from './MoodFace'
import { DiaryScene, type BuddyState, type SceneHandle } from './Scene'
import { TagEditor, Tags } from './Sections'
import { DistillCard, StreamText } from './Stream'

// 15 §11 · 28 §9 v3 오늘 일기(데스크톱) = 캐릭터에게 톡하면 일기가 된다. 휴대폰 src/diary/Conversation.tsx와 같은 흐름·같은 계산(packages/schema diaryTalk).
// 무대: 고른 배경 장면 + 받침 위 캐릭터(Scene.tsx), 말풍선은 장면 위 유리 — 가운데 560 기둥. 아래 덩어리(기분·칩·입력창)는 캐릭터 아래 고정, 높이를 재서 대화 칸 아래 여백으로(겹치지 않음).
// 흐름: (처음 한 번) 이야기할지·혼자 쓸지 → 정해진 인사 + 기분 5개(누르기만 해도 기록) → 자유 이야기(AI). 보내자마자 기기에서 반응(💚·🫂·✨ + 끄덕) → 공감 답이 흘러나옴.
//   칩: 📷 사진 한 장 · 오늘 끝낸 할 일 · 그냥 들어줘(질문·조언 없이) · 여기까지 ✓(2번 주고받은 뒤). "이제 잘게" 류 말도 끝.
//   끝 = 일기로 옮겨 **자동 저장**(저장 단추 없음) → 종이 카드(고치기·다시 옮기기) + 정해진 한 줄 + 깡충. 대화가 5분 멈추거나 화면을 떠나도 저절로(data.autoFinish).
//   AI가 쉬면(오류·한도) 정해진 공감 말로 이어 가고 끝은 내 말 그대로. 혼자 쓰기를 고른 사람은 정해진 질문 3개 → 내 말 그대로(AI 0).

export type FullBuddy = Buddy & { stage: number; level: number }
/** 화면을 떠난 뒤 저절로 마무리(28 §9 G) — 다시 열면 지운다 */
const autoTimers = new Map<string, number>()
export const forgetAuto = (date: string) => { window.clearTimeout(autoTimers.get(date)); autoTimers.delete(date) }
/** 28 §8.11: reading = 기다림(started false, 생각 얼굴) → 받는 중 · landing = 다 받아 저장 중 · error = 멈춤·끊김(받은 글 partial, 저장 안 함) */
type Ai = { kind: 'idle' } | { kind: 'reading'; started: boolean; queue?: number; since: string } | { kind: 'landing'; since: string } | { kind: 'error'; message: string; partial: string; stopped?: boolean }
/** 이번 실행에서 마무리한 장: 다시 옮기기에 쓸 대화(앱을 다시 켜면 없음 — 고치기만) */
const finished = new Map<string, { index: number; lines: { who: 'me' | 'buddy'; text: string }[]; mood: number | null }>()
type Chip = { key: string; label: string; tone?: 'acc' | 'mute' | 'glass'; onPress: () => void }
type Phase = 'consent' | 'mood' | 'talk' | 'q1' | 'q2' | 'q3' | 'own' | 'finishing' | 'after' | 'end'
const moodFaceArt = (mood: number | null | undefined) => (!mood ? 'smile' : mood >= 4 ? 'happy' : mood === 3 ? 'smile' : 'default')

/** 끝 말 뒤 아직 저장 한 줄이 없으면 마무리 중(앱이 꺼졌다 켜진 경우 포함 — 열 때 이어서 저장) */
function isWarmAfterEnd(rows: { role: string; content: string }[]): boolean {
  const i = rows.findIndex((m) => m.role === 'buddy' && m.content === END_BUDDY)
  return i < 0 || rows.slice(i + 1).some((m) => m.role === 'buddy' && isWarm(m.content))
}

/** 장면 위 유리 색(머리·말풍선·칩이 같이 쓴다) */
export function glassVars(sceneKey: string): React.CSSProperties {
  const g = sceneGlass(sceneKey)
  return { ['--g-fill' as string]: g.fill, ['--g-line' as string]: g.line, ['--g-ink' as string]: g.ink, ['--g-sub' as string]: g.sub, colorScheme: sceneDark(sceneKey) ? 'dark' : 'light' }
}
/** 대화 장면 키 = 내 배경(look.eq.bg) + 다크 테마면 밤 짝(성장 홈과 같은 규칙) */
export function useTalkScene(): string {
  const bg = useRaise().worn.bg
  const dark = useDocDark()
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => { const t = window.setInterval(() => setHour(new Date().getHours()), 10 * 60_000); return () => window.clearInterval(t) }, [])
  return sceneKeyFor(bg, dark || (bg !== 'auto' && (hour >= 23 || hour < 6)), hour)
}

export function Talk({ date, today, entry, buddy, reduced, consent, onConsent, onSolo, onPhoto, photoBusy }: {
  date: string; today: string; entry: DiaryEntry | undefined; buddy: FullBuddy; reduced: boolean
  consent: boolean | null; onConsent: (on: boolean) => void
  /** 혼자 쓰기로: 지금까지 한 말로 만든 글·기분을 넘긴다 */
  onSolo: (prefill: { text: string; mood: number | null }) => void
  /** 📷 사진 한 장(파일 고르기) — 붙으면 true */
  onPhoto: () => Promise<boolean>
  photoBusy: boolean
}) {
  const toast = useToast()
  const rows = useQuery<DiaryMessage>(MESSAGES_BY_DATE_SQL, [date])
  const loaded = rows !== undefined
  const messages = useMemo(() => rows ?? [], [rows])
  const stats = useDayStats(date)
  const past = date !== today
  const name = buddy.name
  const photos = usePhotos(date)

  // ── 지금 편(마지막 저장 한 줄 뒤) ──
  const all = useMemo(() => messages.filter((m) => m.safety !== 1), [messages])
  const session = useMemo(() => sessionOf(all), [all])
  const S = session.rows
  const sections = useMemo(() => parseSections(entry?.content), [entry?.content])
  const aiFlow = mayCallAi({ consent, private: entry?.private, solo: false })
  const scriptedMine = S.filter((m) => m.safety === SCRIPTED && m.role === 'me' && m.content !== BYE_ME && m.content !== END_ME && m.content !== LISTEN_ME).map((m) => m.content)
  const r = useMemo(() => replay(scriptedMine), [scriptedMine.join('\u0001')]) // eslint-disable-line react-hooks/exhaustive-deps
  const myTalk = S.filter((m) => m.role === 'me' && !m.safety)
  const myAll = S.filter((m) => m.role === 'me' && m.content !== END_ME && m.content !== BYE_ME)
  const started = scriptedMine.length > 0 || S.some((m) => m.role === 'buddy' && m.content === MORE_LINE) || myAll.length > 0
  const ended = S.some((m) => m.role === 'buddy' && m.content === END_BUDDY)
  const bye = S.some((m) => m.role === 'buddy' && m.content === BYE_BUDDY)
  const asked = S.filter((m) => m.role === 'buddy' && m.safety === SCRIPTED).map((m) => m.content)
  const consentPending = consent === null && !entry?.private
  const sessionMood = r.answers.mood ?? null
  const [met] = useState(hasMet)

  const [again, setAgain] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const typing = hidden.size > 0
  const [ai, setAi] = useState<Ai>({ kind: 'idle' })
  const [aiDown, setAiDown] = useState(false) // AI가 쉬는 중 — 이번 화면 동안 정해진 공감 말
  const [listen, setListen] = useState(false) // 그냥 들어줘
  const [finishing, setFinishing] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [editAt, setEditAt] = useState<number | null>(null)
  const [distillTry, setDistillTry] = useState(1)
  const [reacts, setReacts] = useState<Map<string, string>>(() => new Map())
  const [justSaved, setJustSaved] = useState<number | null>(null)
  const localN = useRef(0)
  const stream = useMemo(createTextStream, [])
  const dstream = useMemo(createTextStream, [])
  const pinned = useRef(true)
  const abort = useRef<AbortController | null>(null)
  const scene = useRef<SceneHandle>(null)
  const [openedAt] = useState(() => new Date().toISOString())
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { if (aiFlow) void distillQuota().then(setQuota) }, [aiFlow])

  // ── 단계 ──
  const scriptedFlow = !aiFlow && !consentPending
  const phase: Phase = finishing || (ended && !isWarmAfterEnd(S)) ? 'finishing'
    : !started ? (consentPending ? 'consent' : bye ? 'end' : (session.boundaries || sections.length) && !again ? 'after' : 'mood')
      : aiFlow ? 'talk'
        : r.step === 'draft' ? 'own' : r.step === 'mood' ? 'q1' : r.step

  // ── 동작 ──
  const reveal = useCallback((ids: string[]) => {
    if (!ids.length) return
    setHidden(new Set(ids))
    window.setTimeout(() => setHidden(new Set()), reduced ? 150 : 650)
  }, [reduced])
  const tapLock = useRef(false)
  const guard = () => { if (tapLock.current || typing || !loaded) return false; tapLock.current = true; window.setTimeout(() => { tapLock.current = false }, 300); return true }
  const firstSession = !session.boundaries && !sections.length
  const react = (t: string) => { setReacts((m) => new Map(m).set(t, reactionOf(t, sessionMood ?? entry?.mood ?? null))); scene.current?.nod() }
  /** 기분(또는 글로 한 첫 답) */
  const answerMood = async (a: { mood?: number; text?: string }) => {
    if (!guard()) return
    setAgain(false)
    if (a.text) react(a.text)
    const lines = nextLines({ mine: [], answer: a, date, today, hour: new Date().getHours(), stats, name, intro: !met && firstSession, follow: aiFlow ? 'open' : 'q1', greet: firstSession })
    if (!lines.length) return
    const firstMe = lines.findIndex((l) => l.role === 'me')
    pinned.current = true
    // 2026-10-25 사용자 결정: 대화 = 늘 AI. 기분을 고르지 않고 바로 쓰면 인사만 남기고 그 말에 AI가 답한다(정해진 반응·질문 없이)
    if (a.text) { if (firstMe > 0) await addScripted(date, lines.slice(0, firstMe)); say(a.text); setMet(); return }
    reveal((await addScripted(date, lines)).slice(firstMe + 1))
    if (a.mood) await saveEntry(date, { mood: a.mood }) // 28 §9: 기분은 누르기만 해도 그날 기록(장면 카드·달력에 바로, 대화를 안 끝내도 남는다)
    setMet()
    scene.current?.nod()
  }
  const answerScripted = async (text: string) => {
    if (!guard()) return
    if (!isSkip(text)) react(text)
    const lines = nextLines({ mine: scriptedMine, answer: { text }, date, today, hour: new Date().getHours(), stats, name, intro: false })
    if (!lines.length) return
    pinned.current = true
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
      if (isDailyCap(e)) toast.show('오늘 이야기는 많이 나눴어요. 짧게 답할게요')
      await localTurn(t ?? '', false)
    }
  }
  const landed = ai.kind === 'landing' && all.some((m) => m.role === 'buddy' && !m.safety && m.created_at >= ai.since)
  useEffect(() => {
    if (ai.kind !== 'landing') return
    if (landed) { setAi({ kind: 'idle' }); return }
    const t = window.setTimeout(() => setAi({ kind: 'idle' }), 1500)
    return () => window.clearTimeout(t)
  }, [ai.kind, landed])
  const busy = ai.kind === 'reading' || (ai.kind === 'landing' && !landed)
  const stop = () => {
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
  // 2026-10-25 사용자 결정: 20초 멈추면 정해진 질문을 끼워 넣던 것 없앰(AI 답 뒤에도 쌓여 형식적으로 보였다) — 막히면 `뭘 말할지 모르겠어` 칩만

  const sessionLines = () => S.filter((m) => m.content !== BYE_ME && m.content !== END_ME && m.content !== END_BUDDY).map((m) => ({ who: (m.role === 'me' ? 'me' : 'buddy') as 'me' | 'buddy', text: parseBuddyReply(m.content).text }))
  const ownBody = () => (scriptedFlow ? composeDraft(r.answers, { past }) : ownWords(myAll.filter((m) => m.content !== LISTEN_ME).map((m) => m.content)))
  /** 마무리(28 §9 G): 끝 말 → 일기로 옮겨(되면) 자동 저장 → 저장 한 줄 + 깡충. 안 되면 내 말 그대로 */
  const finish = async (said?: string) => {
    if (finishing || isFinishing(date)) return
    forgetAuto(date)
    setFinishing(true)
    markFinishing(date, true)
    try {
      const lines = sessionLines()
      const mood = sessionMood ?? entry?.mood ?? null
      pinned.current = true
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
      setJustSaved(index)
      reveal(await addScripted(date, [{ role: 'buddy', content: warmLineOf({ mood, past, done: stats.done }) }]))
      window.setTimeout(() => scene.current?.hop(), 300)
      setListen(false)
    } finally { setFinishing(false); markFinishing(date, false) }
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
      const capped = isDailyCap(e)
      if (capped) setQuota((q) => (q ? { ...q, used: q.limit } : { used: 5, limit: 5 }))
      toast.show(capped ? '오늘 정리는 다 썼어요. 내 말 그대로 남겼어요' : '지금은 옮기지 못했어요. 내 말 그대로 남겼어요')
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
  // 혼자 쓰기를 고른 사람: 질문 3개를 다 답하면 내 말 그대로 저절로 저장
  const ownSaving = useRef(false)
  useEffect(() => {
    if (phase !== 'own' || ownSaving.current) return
    ownSaving.current = true
    void finish().finally(() => { ownSaving.current = false })
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
  // 휴대폰 알림에서 답장했으면(내 말이 마지막인데 답이 없음) 열자마자 캐릭터가 이어서 답한다(28 §9 A)
  const answered = useRef(false)
  useEffect(() => {
    if (answered.current || phase !== 'talk' || ai.kind !== 'idle' || !lastRow || lastRow.role !== 'me' || lastRow.safety || lastRow.created_at >= openedAt) return
    answered.current = true
    if (aiDown) void localTurn(lastRow.content, false); else void runAi(null)
  }, [phase, lastRow?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // 끝 말까지 남기고 앱이 꺼졌으면(저장 한 줄 없음) 열 때 이어서 마무리
  useEffect(() => { if (loaded && phase === 'finishing' && !finishing && !isFinishing(date)) void finish() }, [phase, loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  // 대화가 5분 멈추면 저절로 마무리(열려 있을 때). 다시 열었을 때 이미 5분 지났으면 바로
  useEffect(() => {
    forgetAuto(date)
    if (phase !== 'talk' || busy || finishing || typing || drafting || !myTalk.length || !lastRow) return
    const age = Date.now() - Date.parse(lastRow.created_at)
    const t = window.setTimeout(() => { void finish() }, Math.max(1500, AUTO_FINISH_MS - age))
    return () => window.clearTimeout(t)
  }, [phase, busy, finishing, typing, drafting, myTalk.length, lastRow?.id, typed]) // eslint-disable-line react-hooks/exhaustive-deps
  // 화면을 떠나면(다른 날·혼자 쓰기·다른 탭): 남은 시간 뒤 화면 밖에서 마무리(앱이 켜져 있는 동안)
  const leave = useRef({ need: false, at: 0 })
  leave.current = { need: phase === 'talk' && myTalk.length > 0 && !finishing, at: lastRow ? Date.parse(lastRow.created_at) : 0 }
  useEffect(() => () => {
    if (!leave.current.need) return
    const wait = Math.max(5_000, AUTO_FINISH_MS - (Date.now() - leave.current.at))
    autoTimers.set(date, window.setTimeout(() => { autoTimers.delete(date); void autoFinish(date, AbortSignal.timeout(180_000)).catch(() => {}) }, wait))
  }, [date])

  const photoChipPress = async () => {
    if (await onPhoto()) { reveal(await addScripted(date, [{ role: 'buddy', content: '사진 고마워! 오늘 장면에 붙여 뒀어.' }])); window.setTimeout(() => scene.current?.hop(), 250) }
  }
  const consentYes = () => { setConsent(true); onConsent(true) }
  const consentNo = () => { setConsent(false); onConsent(false); onSolo({ text: '', mood: entry?.mood ?? null }) }
  const sayBye = async () => { const ids = await addScripted(date, [{ role: 'me', content: BYE_ME }, { role: 'buddy', content: BYE_BUDDY }]); reveal(ids.slice(1)) }
  const composer = useRef<HTMLTextAreaElement>(null)
  const more = async () => {
    if (aiFlow) reveal(await addScripted(date, [{ role: 'buddy', content: MORE_LINE }]))
    else setAgain(true)
    window.setTimeout(() => composer.current?.focus(), 120)
  }
  const listenOn = async () => {
    setListen(true)
    react(LISTEN_ME)
    reveal((await addScripted(date, [{ role: 'me', content: LISTEN_ME }, { role: 'buddy', content: '응, 그냥 들을게. 편하게 말해.' }])).slice(1))
  }
  const addTask = async (title: string) => {
    try { await taskFromChip(title); toast.show('할 일에 넣었어요') } catch (e) { toast.show(e instanceof Error ? e.message : '할 일을 만들지 못했어요') }
  }
  // 대화 중 ✎(⌘N) — 지금까지 한 말로 새 장 시작(DiaryView가 부른다)
  const soloPrefill = () => ({ text: written(entry) ? '' : ownBody(), mood: sessionMood ?? entry?.mood ?? null })
  soloRef.current = soloPrefill
  // ⌘1~5 = 기분(기분 줄이 보일 때)
  const moodKey = useRef<(v: number) => void>(() => {})
  moodKey.current = (v) => { if (phase === 'mood') void answerMood({ mood: v }) }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !/^[1-5]$/.test(e.key) || document.querySelector('.desktop-dialog, .popover, [role="dialog"]')) return
      e.preventDefault(); e.stopPropagation(); moodKey.current(Number(e.key))
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  // ── 무대 ──
  const sceneKey = useTalkScene()
  const box = useRef<HTMLDivElement>(null)
  const dockEl = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  const [dockH, setDockH] = useState(140)
  useLayoutEffect(() => {
    const el = box.current, d = dockEl.current
    if (!el || !d) return
    const ro = new ResizeObserver(() => {
      setArea((o) => (o.w === el.clientWidth && o.h === el.clientHeight ? o : { w: el.clientWidth, h: el.clientHeight }))
      setDockH(Math.round(d.offsetHeight))
    })
    ro.observe(el); ro.observe(d)
    return () => ro.disconnect()
  }, [])
  const buddySize = area.h && area.h < 640 ? 104 : 136
  const perchY = area.h - dockH - 4
  const buddyRoom = Math.round(buddySize * 0.9 + 16)

  // ── 그리기 ──
  const scroll = useRef<HTMLDivElement>(null)
  const toEnd = () => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight }
  useEffect(() => {
    const el = scroll.current
    const col = el?.firstElementChild
    if (!el || !col) return
    const ro = new ResizeObserver(() => { if (pinned.current) toEnd() })
    ro.observe(col); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const taskTitles = useMemo(() => all.filter((m) => m.role === 'buddy' && !m.safety).map((m) => parseBuddyReply(m.content).task).filter((x): x is string => !!x), [all])
  const madeRows = useQuery<{ title: string }>(`SELECT title FROM tasks WHERE deleted_at IS NULL AND title IN (${taskTitles.map(() => '?').join(',') || "''"})`, taskTitles)
  const made = new Set((madeRows ?? []).map((x) => x.title))

  const visible = all.filter((m) => !hidden.has(m.id))
  const lastBuddy = [...visible].reverse().find((m) => m.role === 'buddy')
  const face = aiDown ? 'sleepy' : (lastBuddy && !lastBuddy.safety && replyFaceOf(lastBuddy.content)) || moodFaceArt(sessionMood ?? entry?.mood)
  const virtualStart = loaded && !all.length && !sections.length
  const greet = virtualStart ? greetingOf({ date, today, hour: new Date().getHours(), stats }) : null
  const streaming = busy && (ai.kind === 'landing' || (ai.kind === 'reading' && ai.started))
  const thinking = (ai.kind === 'reading' && !ai.started) || distilling
  const bstate: BuddyState = thinking ? 'think' : streaming ? 'talk' : drafting ? 'listen' : 'idle'
  const fresh = (createdAt: string) => (createdAt >= openedAt ? ' is-new' : '')

  // 저장 한 줄(잘 남겼어)마다 그 대화로 만든 장. 혼자 쓴 장(✎)과 저장 한 줄이 없는 예전 장은 맨 위에
  const warmCount = visible.filter((m) => m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)).length
  const talkIdx = sections.map((s, i) => (s.solo ? -1 : i)).filter((i) => i >= 0)
  const oldTalk = Math.max(0, talkIdx.length - warmCount)
  const leading = sections.map((_, i) => i).filter((i) => sections[i].solo || talkIdx.indexOf(i) < oldTalk)
  const f = finished.get(date)
  const savedCard = (k: number) => {
    const sec = sections[k]
    if (!sec) return null
    return (
      <PaperCard key={`sec-${k}`} section={sec} date={date} past={past} mood={entry?.mood ?? null} editing={editAt === k} name={name} fresh={justSaved === k}
        canRedo={!!f && f.index === k && !sec.solo && aiFlow && !aiDown && (quota ? quota.used < quota.limit : true)} redoing={distilling}
        onRedo={() => void redo(k)} onEdit={() => setEditAt(k)} onCancel={() => setEditAt(null)}
        onSave={(s) => { void replaceSection(date, k, s).then(() => { setEditAt(null); toast.show('고쳐서 저장했어요') }) }} />
    )
  }
  const items: React.ReactNode[] = []
  for (const k of leading) items.push(savedCard(k))
  let warmK = 0
  visible.forEach((m) => {
    const isAi = !m.safety
    const warm = m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)
    if (warm) { const k = talkIdx[oldTalk + warmK]; if (k !== undefined) items.push(savedCard(k)); warmK++ }
    if (m.role === 'me') {
      const mood = m.safety === SCRIPTED ? replay([m.content]).answers.mood : null
      const rx = m.created_at >= openedAt ? reacts.get(m.content) : undefined
      const skip = m.safety === SCRIPTED && isSkip(m.content)
      items.push(
        <div key={m.id} className={`dmsg is-me${fresh(m.created_at)}`}>
          <div className={`dmsg__bb${skip ? ' is-skip' : ''}`}>
            {mood ? <span className="dmsg__mood"><MoodFace mood={mood} size={22} />{m.content}</span> : m.content}
            {rx && <span className="dmsg__rx" aria-label={`반응 ${rx}`}>{rx}</span>}
          </div>
        </div>
      )
      return
    }
    const parsed = isAi ? parseBuddyReply(m.content) : { text: m.content, task: undefined }
    items.push(
      <div key={m.id} className={`dmsg${isAi ? '' : fresh(m.created_at)}`}>
        <div className="dmsg__bb">
          {parsed.text}
          {parsed.task && (made.has(parsed.task.trim().slice(0, 200))
            ? <span className="dchip-task is-done"><Check />할 일에 넣었어요</span>
            : <button className="dchip-task" onClick={() => void addTask(parsed.task!)}><Plus />할 일로: {parsed.task}</button>)}
        </div>
      </div>
    )
  })

  // 아래 덩어리
  const qo = { mood: sessionMood, past, stats }
  const nudgeNow = phase === 'talk' && lastRow?.role === 'buddy' && lastRow.safety === SCRIPTED ? (['q1', 'q2', 'q3'] as const).map((s) => questionOf(s, qo)).find((q) => q.q === lastRow.content) : undefined
  const low = (sessionMood ?? entry?.mood ?? 3) <= 2
  const exchanges = myTalk.length + (aiDown ? myAll.filter((m) => m.safety === SCRIPTED).length : 0)
  const doneChips = doneChipsOf(stats.doneTitles, myAll.map((m) => m.content))
  const listenChip: Chip[] = !listen && lastRow?.role === 'buddy' && exchanges ? [{ key: 'listen', label: LISTEN_ME, onPress: () => void listenOn() }] : []
  const photoChip: Chip = { key: 'photo', label: photoBusy ? '📷 붙이는 중…' : photos.length ? `📷 사진 ${photos.length}` : '📷 사진 한 장', onPress: () => void photoChipPress() }
  const chips: Chip[] = phase === 'mood' ? [photoChip] : phase === 'talk' ? [
    photoChip,
    ...(low ? listenChip : []),
    ...(nudgeNow ? nudgeNow.chips.map((c) => ({ key: c, label: c, onPress: () => say(c) })) : doneChips.map((t) => ({ key: `done-${t}`, label: `✓ ${t}`, tone: 'glass' as const, onPress: () => say(`${t} 했어`) }))),
    ...(!low ? listenChip : []),
    ...(!nudgeNow && !exchanges && nudgeOf(asked, qo) ? [{ key: 'nudge', label: '뭘 말할지 모르겠어', tone: 'mute' as const, onPress: () => void nudge() }] : []),
    ...(exchanges >= 2 ? [{ key: 'end', label: '여기까지 ✓', tone: 'acc' as const, onPress: () => void finish() }] : [])
  ]
    : (phase === 'q1' || phase === 'q2' || phase === 'q3') ? [...questionOf(phase, qo).chips.map((c) => ({ key: c, label: c, onPress: () => void answerScripted(c) })), { key: SKIP, label: SKIP, tone: 'mute' as const, onPress: () => void answerScripted(SKIP) }]
      : phase === 'after' ? [{ key: 'more', label: aiFlow ? '더 이야기하기' : '하나 더 남기기', tone: 'acc' as const, onPress: () => void more() }, { key: 'bye', label: BYE_ME, tone: 'mute' as const, onPress: () => void sayBye() }]
        : phase === 'end' ? [{ key: 'more', label: aiFlow ? '더 이야기하기' : '하나 더 남기기', tone: 'mute' as const, onPress: () => void more() }]
          : []
  const line = phase === 'end' ? (past ? '그날 일기를 저장했어요' : '오늘 일기를 저장했어요')
    : phase === 'finishing' ? `${josa(name, '가', '이')} 일기로 옮기는 중이에요`
      : aiDown && phase === 'talk' ? restLineOf(name)
        : (phase === 'q1' || phase === 'q2' || phase === 'q3') ? `혼자 쓰는 중이에요 · ⋯에서 ${josa(name, '와', '과')} 나누기를 켤 수 있어요`
          : null
  const showComposer = phase === 'mood' || phase === 'talk' || phase === 'q1' || phase === 'q2' || phase === 'q3'
  const placeholder = phase === 'talk' ? (exchanges ? '더 말해 줘도 돼 · ↵ 보내기 · ⇧↵ 줄 바꿈' : `${name}에게 편하게 이야기하기… · ↵ 보내기`) : phase === 'mood' ? '아니면 그냥 말해 줘' : '직접 써도 돼 — 한 줄이면 충분해'
  const send = (t: string) => { setDrafting(false); if (phase === 'talk') say(t); else if (phase === 'mood') void answerMood({ text: t }); else void answerScripted(t) }
  const disabled = typing || busy || finishing

  return (
    <div ref={box} className="dconv">
      {area.w > 0 && (
        <DiaryScene ref={scene} sceneKey={sceneKey} width={area.w} height={area.h} perchY={perchY} size={buddySize} buddy={buddy} state={bstate}
          mood={thinking ? 'think' : face} reduced={reduced} />
      )}
      <div ref={scroll} className="dconv__scroll" aria-live="polite" onScroll={(e) => { pinned.current = nearBottom(e.currentTarget) }} style={{ paddingBottom: dockH + buddyRoom }}>
        <div className="dconv__col">
          <div className="dconv__sep">{dayHead(date)}{past ? '' : ` · ${TIME_LABEL[timeOfDay(new Date().getHours())]}`}</div>
          {virtualStart && !met && <div className="dmsg"><div className="dmsg__bb">{introLine(name)}</div></div>}
          {greet && <div className="dmsg"><div className="dmsg__bb">{greet}</div></div>}
          {items}
          {typing && <div className="dmsg"><div className="dmsg__bb"><Dots /></div></div>}
          {phase === 'consent' && !typing && (
            <div className="dchoice">
              <b>{josa(name, '와', '과')} 이야기하고 일기로 남길까?</b>
              <ul>
                <li>이야기하면 {josa(name, '가', '이')} 공감해 주고, 끝나면 내 말로 일기를 써서 저장해요</li>
                <li>그러려면 꿈틀 AI가 대화를 읽어요 — 꿈틀 서버에서만, 원문은 남기지 않아요</li>
                <li>싫으면 혼자 쓰기 — AI 없이 메모장처럼 써요</li>
              </ul>
              <div className="dchoice__btns">
                <button className="dbtn is-ghost" onClick={consentNo}>✎ 혼자 쓰기</button>
                <button className="dbtn is-primary" data-autofocus onClick={consentYes}>💬 이야기하기</button>
              </div>
              <small>{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요 · ⋯에서 언제든 바꿔요</small>
            </div>
          )}
          {ai.kind === 'reading' && !ai.started && (
            <div className="dmsg is-wait"><div className="dmsg__bb" aria-label={`${name} 생각하는 중`}>{ai.queue ? <span className="dmsg__wait">차례 기다리는 중 (앞에 {ai.queue}명)</span> : null}<Dots /></div></div>
          )}
          {streaming && <div className="dmsg is-stream"><div className="dmsg__bb"><StreamText stream={stream} reduced={reduced} /></div></div>}
          {ai.kind === 'error' && (
            <>
              {ai.partial && <div className="dmsg is-partial"><div className="dmsg__bb">{parseBuddyReply(ai.partial).text}</div></div>}
              <div className="dretry" role="status">
                <span>{ai.stopped ? '멈췄어.' : '연결이 끊겼어.'}</span>
                <button className="dchip" onClick={retry}><RotateCcw />다시 시도</button>
              </div>
            </>
          )}
          {distilling && <div className="dmsg is-card"><DistillCard stream={dstream} buddy={buddy} name={name} again={distillTry > 1} reduced={reduced} onStop={stop} /></div>}
        </div>
      </div>

      <div ref={dockEl} className="ddock">
        {phase === 'mood' && (
          <div className="dmoods" role="radiogroup" aria-label={past ? '그날 기분' : '오늘 기분'}>
            {MOODS.map((m, i) => (
              <button key={m.value} role="radio" aria-checked={entry?.mood === m.value} aria-label={m.label} disabled={typing} title={`${m.label} (⌘${i + 1})`} className={entry?.mood === m.value ? 'is-on' : ''} onClick={() => void answerMood({ mood: m.value })}>
                <MoodFace mood={m.value} size={40} faded={!!entry?.mood && entry.mood !== m.value} />
                <small>{moodShort(m.value)}</small>
              </button>
            ))}
          </div>
        )}
        {chips.length > 0 && (
          <div className="dchips">
            {chips.map((c) => <button key={c.key} className={`dchip${c.tone ? ` is-${c.tone}` : ''}`} disabled={disabled || (c.key === 'photo' && photoBusy)} onClick={c.onPress}>{c.label}</button>)}
          </div>
        )}
        {line && <p className="ddock__line">{line}</p>}
        {showComposer && (
          <Composer ref={composer} placeholder={placeholder} disabled={disabled} ai={phase === 'talk' && !aiDown}
            onStop={ai.kind === 'reading' || distilling ? stop : undefined} onTyping={() => { setTyped((n) => n + 1); setDrafting(true) }} onSend={send} />
        )}
      </div>
    </div>
  )
}
/** DiaryView가 ⌘N·✎ 누를 때 대화의 지금 말을 가져간다 */
export const soloRef: { current: () => { text: string; mood: number | null } } = { current: () => ({ text: '', mood: null }) }
const written = (e: DiaryEntry | undefined) => !!e?.content?.trim()

const Composer = ({ ref, placeholder, disabled, ai, onStop, onTyping, onSend }: {
  ref: React.Ref<HTMLTextAreaElement>; placeholder: string; disabled: boolean; ai: boolean; onStop?: () => void; onTyping: () => void; onSend: (t: string) => void
}) => {
  const [text, setText] = useState('')
  const el = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { const a = el.current; if (!a) return; a.style.height = ''; if (text) a.style.height = `${Math.min(a.scrollHeight, 110)}px` }, [text])
  const send = () => {
    const v = text.trim()
    if (!v || disabled) return
    setText('')
    onSend(v)
  }
  return (
    <div className={`dcomposer${ai ? ' is-ai' : ''}`}>
      <textarea
        ref={(n) => { el.current = n; if (typeof ref === 'function') ref(n); else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = n }}
        rows={1}
        value={text}
        placeholder={placeholder}
        aria-label="답 쓰기"
        maxLength={2000}
        onChange={(e) => { setText(e.target.value); onTyping() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
          if (e.key === 'Escape' && text) { e.stopPropagation(); setText('') }
        }}
      />
      {onStop
        ? <button className="dcomposer__send is-stop" aria-label="멈추기" onClick={onStop}><Square /></button>
        : <button className="dcomposer__send" aria-label="보내기 (Enter)" disabled={!text.trim() || disabled} onClick={send}><ArrowUp /></button>}
    </div>
  )
}

/** 저장한 장(28 §9 H): 종이 카드 — 기분 띠 · 시각 · 제목 · 태그 · 본문 · ✓ 저장됨 · 고치기 · 다시 옮기기(방금 마무리한 장) */
function PaperCard({ section, date, past, mood, editing, name, fresh, canRedo, redoing, onRedo, onEdit, onCancel, onSave }: {
  section: Section; date: string; past: boolean; mood: number | null; editing: boolean; name: string; fresh: boolean; canRedo: boolean; redoing: boolean
  onRedo: () => void; onEdit: () => void; onCancel: () => void; onSave: (s: Section) => void
}) {
  const [d, setD] = useState(section)
  useEffect(() => { if (editing) setD(section) }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const body = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = body.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 120)}px` } }, [d.body, editing])
  const m = moodOf(mood)
  return (
    <section className={`dpaper${fresh ? ' is-fresh' : ''}`} aria-label={section.title || '저장한 장'}
      onKeyDown={editing ? (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); onSave(d) } } : undefined}>
      <span className="dpaper__band" style={{ background: m?.color ?? 'var(--color-accent)' }} />
      <div className="dpaper__meta">
        {m && <MoodFace mood={m.value} size={22} />}
        <span>{section.solo ? '✎ 혼자' : `💬 ${josa(name, '와', '과')} 이야기`} · {section.time ?? (past ? '그날' : '오늘')} · {Number(date.slice(5, 7))}월 {Number(date.slice(8))}일{m ? ` · ${m.label}` : ''}</span>
      </div>
      {editing ? <>
        <input className="ddraft__title" value={d.title} placeholder="제목" aria-label="일기 제목" autoFocus onChange={(e) => setD({ ...d, title: e.target.value })} />
        <TagEditor tags={d.tags} onChange={(tags) => setD({ ...d, tags })} />
        <textarea ref={body} className="ddraft__body" value={d.body} aria-label="일기 고치기" onChange={(e) => setD({ ...d, body: e.target.value })} />
        <div className="ddraft__acts">
          <button className="dbtn is-ghost" onClick={onCancel}>취소</button>
          <button className="dbtn is-primary" onClick={() => onSave(d)}>저장<kbd>⌘↵</kbd></button>
        </div>
      </> : <>
        {section.title && <b className="dpaper__title">{section.title}</b>}
        {section.tags.length > 0 && <Tags tags={section.tags} />}
        <p className="dpaper__body">{section.body || '(기분만 남겼어요)'}</p>
        <div className="ddraft__acts">
          <span className="ddraft__ok"><svg className="dpaper__check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg>저장됨</span>
          <span className="dpaper__sp" />
          {canRedo && <button className="dbtn is-soft is-sm" disabled={redoing} onClick={onRedo}>{redoing ? '옮기는 중…' : '다시 옮기기'}</button>}
          <button className="dbtn is-ghost is-sm" onClick={onEdit}>고치기</button>
        </div>
      </>}
    </section>
  )
}

function Dots() {
  return <span className="ddots" aria-label="입력 중"><i /><i /><i /></span>
}
const dayHead = (date: string) => {
  const d = new Date(`${date}T00:00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`
}
