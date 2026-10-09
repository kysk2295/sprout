import { ArrowUp, Check, RotateCcw, Square } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ART_SPECIES } from '@sprout/schema/characterArt'
import { normalizeSpecies, STAGES } from '@sprout/schema/growth'
import { parseSections, transcriptOf, wantsTranscript } from '@sprout/schema/diaryPrompts'
import {
  asksDistill, BYE_BUDDY, BYE_ME, clock, composeDraft, greetingOf, introLine, isSkip, isWarm, leadingSections, MORE_LINE, nextLines, nudgeOf, OPEN_LINE,
  ownWords, questionOf, replay, SCRIPTED, sessionLinesOf, SKIP, SOLO_LINE, talkPhase, talkStateOf, TIME_LABEL, timeOfDay, warmLineOf, type Phase
} from '@sprout/schema/diaryTalk'
import { useQuery } from '../../data/useQuery'
import {
  addScripted, chatTurn, distillQuota, distillSession, hasMet, isDailyCap, isSolo, josa, mayCallAi, MESSAGES_BY_DATE_SQL, moodOf, MOODS, parseBuddyReply,
  replaceSection, saveSection, setConsent, setMet, taskFromChip, useDayStats, type Buddy, type DiaryEntry, type DiaryMessage
} from '../../data/diary'
import { CharacterArt, type CharacterMood } from '../growth/CharacterArt'
import { useToast } from '../Toast'
import { MoodFace } from './MoodFace'
import { DraftCard, SavedCard, type Draft } from './Sections'

// 15 §10 · 28 §8.10 오늘 일기 = 캐릭터와 이야기하고, 그 이야기를 일기로 옮긴다(사용자 스킬 conversational-journal-to-wiki를 따름).
// 정해진 인사(시간대 + 그날 할 일) → 기분 빠른 답 → (동의 전이면 대화 안 카드) → AI와 자유 대화 / 혼자 쓰기·나만 보기는 정해진 질문 3개
// → `일기로 정리해 줘` → 초안(제목·태그·1인칭) → 저장 = 그날 글 끝에 `## HH:MM — 제목` 편. 계산은 packages/schema/diaryTalk(휴대폰과 같음).
// 상태는 useTalk 한 곳 — 가운데 대화(Talk)와 오른쪽 열(DayPanel)이 같이 본다.

export type FullBuddy = Buddy & { stage: number; level: number }
/** 저장 전 초안(앱 실행 동안만 — 다시 열면 대화에서 다시 만든다, 28 §8.6) */
const drafts = new Map<string, Draft>()
type Ai = { kind: 'idle' } | { kind: 'reading'; text: string; queue?: number } | { kind: 'error'; message: string }
const STALL_MS = 20_000
const CHAT_LIMIT_LINE = '오늘은 이야기를 많이 나눴네. 지금까지 이야기로 일기를 정리해 둘까?'
export type Chip = { key: string; label: string; tone?: 'acc' | 'mute'; onPress: () => void }

export function useTalk({ date, today, entry, buddy, consent, onConsent, reduced, onFree }: {
  date: string; today: string; entry: DiaryEntry | undefined; buddy: FullBuddy; consent: boolean | null; onConsent: (on: boolean) => void; reduced: boolean
  /** 그냥 쓸래요: 지금까지 한 말로 만든 글·기분을 넘긴다 */
  onFree: (prefill: { text: string; mood: number | null }) => void
}) {
  const toast = useToast()
  const rows = useQuery<DiaryMessage>(MESSAGES_BY_DATE_SQL, [date])
  const loaded = rows !== undefined
  const messages = useMemo(() => rows ?? [], [rows])
  const stats = useDayStats(date)
  const past = date !== today
  const name = buddy.name
  const st = useMemo(() => talkStateOf(messages), [messages])
  const S = st.S
  const sections = useMemo(() => parseSections(entry?.content), [entry?.content])
  const [solo, setSoloState] = useState(() => isSolo(date))
  useEffect(() => setSoloState(isSolo(date)), [date])
  const aiFlow = mayCallAi({ consent, private: entry?.private, solo })
  const consentPending = consent === null && !entry?.private && !solo
  const scriptedFlow = !aiFlow && !consentPending
  const sessionMood = st.mood

  const [again, setAgain] = useState(false) // 혼자 쓰기: 하나 더 남기기(기분부터)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const typing = hidden.size > 0
  const [ai, setAi] = useState<Ai>({ kind: 'idle' })
  const [draft, setDraftState] = useState<Draft | null>(() => drafts.get(date) ?? null)
  const [distilling, setDistilling] = useState(false)
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [chatCapped, setChatCapped] = useState(false)
  const [editAt, setEditAt] = useState<number | null>(null)
  const [met] = useState(hasMet)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const setDraft = (d: Draft | null) => { setDraftState(d); if (d) drafts.set(date, d); else drafts.delete(date) }

  // 혼자 쓰기: 질문 3개를 다 답하면 내 말 그대로 초안(자동)
  useEffect(() => {
    if (loaded && scriptedFlow && st.r.step === 'draft' && !draft) setDraft({ time: null, title: '', tags: [], body: composeDraft(st.r.answers, { past }), source: 'own' })
  }, [loaded, scriptedFlow, st.r.step]) // eslint-disable-line react-hooks/exhaustive-deps
  // 옮기기 남은 횟수(예전 서버면 모름)
  useEffect(() => { if (aiFlow) void distillQuota().then(setQuota) }, [aiFlow])

  const phase: Phase = talkPhase({ draft: !!draft, started: st.started, bye: st.bye, boundaries: st.boundaries, sections: sections.length, again, consentPending, aiFlow, step: st.r.step })

  const reveal = useCallback((ids: string[]) => {
    if (!ids.length) return
    setHidden(new Set(ids))
    window.setTimeout(() => setHidden(new Set()), reduced ? 150 : 650)
  }, [reduced])
  const busy = useRef(false)
  const guard = () => { if (busy.current || typing || !loaded) return false; busy.current = true; window.setTimeout(() => { busy.current = false }, 300); return true }
  const firstSession = !st.boundaries && !sections.length
  /** 기분(또는 글로 한 첫 답) */
  const answerMood = async (a: { mood?: number; text?: string }) => {
    if (!guard()) return
    setAgain(false)
    const follow = aiFlow ? 'open' : consentPending ? 'none' : 'q1'
    const lines = nextLines({ mine: [], answer: a, date, today, hour: new Date().getHours(), stats, name, intro: !met && firstSession, follow, greet: firstSession })
    if (!lines.length) return
    const firstMe = lines.findIndex((l) => l.role === 'me')
    reveal((await addScripted(date, lines)).slice(firstMe + 1))
    setMet()
  }
  /** 혼자 쓰기의 질문 답 */
  const answerScripted = async (text: string) => {
    if (!guard()) return
    const lines = nextLines({ mine: st.scriptedMine, answer: { text }, date, today, hour: new Date().getHours(), stats, name, intro: false })
    if (!lines.length) return
    reveal((await addScripted(date, lines)).slice(1))
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
    try { await fn(ctrl.signal); if (!ctrl.signal.aborted) setAi({ kind: 'idle' }) } catch (e) {
      if (ctrl.signal.aborted) return
      if (isDailyCap(e)) { setAi({ kind: 'idle' }); setChatCapped(true); reveal(await addScripted(date, [{ role: 'buddy', content: CHAT_LIMIT_LINE }])); return }
      setAi({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }
  const stop = () => { abort.current?.abort(); setAi({ kind: 'idle' }); setDistilling(false) }
  const sessionLines = () => sessionLinesOf(S)
  const ownDraft = (): Draft => ({ time: null, title: '', tags: [], body: ownWords(S.filter((m) => m.role === 'me').map((m) => m.content)), source: 'own' })
  /** 일기로 옮기기(서버 distill). 실패·한도면 내 말 그대로 */
  const distill = async (redo?: boolean) => {
    if (distilling) return
    const left = quota ? quota.limit - quota.used : 1
    if (left <= 0) { setDraft(ownDraft()); toast.show('오늘 정리는 다 썼어요. 내 말 그대로 묶었어요'); return }
    const ctrl = new AbortController()
    abort.current?.abort()
    abort.current = ctrl
    setDistilling(true)
    if (!redo) setDraft(null)
    try {
      const d = await distillSession(date, sessionLines(), sessionMood ?? entry?.mood ?? null, ctrl.signal)
      if (ctrl.signal.aborted) return
      setDraft({ time: null, title: d.title, tags: d.tags, body: d.entry, source: 'ai' })
      setQuota((q) => (q ? { ...q, used: q.used + 1 } : q))
    } catch (e) {
      if (ctrl.signal.aborted) return
      const capped = isDailyCap(e)
      if (capped) setQuota((q) => (q ? { ...q, used: q.limit } : { used: 5, limit: 5 }))
      if (!redo) setDraft(ownDraft())
      toast.show(capped ? '오늘 정리는 다 썼어요. 내 말 그대로 묶었어요' : '지금은 정리하지 못했어요. 내 말 그대로 묶었어요')
    } finally { if (abort.current === ctrl) setDistilling(false) }
  }
  const makeTranscript = () => setDraft({ time: null, title: draft?.title ?? '', tags: draft?.tags ?? [], body: transcriptOf(sessionLines(), name), source: 'transcript' })
  /** AI와 이야기: 보내기 = 내 말 + 캐릭터 한 턴. "일기로 정리해 줘"·"대화 그대로 저장"은 바로 초안 */
  const say = (t: string) => {
    if (ai.kind === 'reading' || !loaded) return
    if (wantsTranscript(t)) { makeTranscript(); return }
    if (asksDistill(t) && st.myTalk.length) { void distill(); return }
    if (chatCapped) { void addScripted(date, [{ role: 'me', content: t }]); return }
    void runAi((signal) => chatTurn(date, t, opts(signal)))
  }
  const retry = () => void runAi((signal) => chatTurn(date, null, opts(signal)))
  const nudge = async () => {
    const q = nudgeOf(st.asked, { mood: sessionMood, past, stats })
    if (!q) return
    reveal(await addScripted(date, [{ role: 'buddy', content: q.q }]))
  }
  // 머뭇거리면(마지막이 캐릭터 말이고 20초 동안 아무것도 안 씀) 질문 하나 — 편마다 3번까지
  const [typed, setTyped] = useState(0)
  const lastRow = S.at(-1)
  useEffect(() => {
    if (phase !== 'talk' || ai.kind !== 'idle' || typing || distilling || !lastRow || lastRow.role !== 'buddy') return
    const t = window.setTimeout(() => { void nudge() }, STALL_MS)
    return () => window.clearTimeout(t)
  }, [phase, ai.kind, typing, distilling, lastRow?.id, typed]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!draft) return
    const body = draft.body.trim()
    const mood = sessionMood ?? entry?.mood ?? null
    if (!body && !mood) return
    await saveSection(date, { time: clock(), title: draft.title.trim(), tags: draft.tags, body: body || '(기분만 남겼어요)' }, mood)
    setDraft(null)
    reveal(await addScripted(date, [{ role: 'buddy', content: warmLineOf({ mood, past, done: stats.done }) }]))
  }
  const consentYes = async () => { onConsent(true); setConsent(true); reveal(await addScripted(date, [{ role: 'buddy', content: OPEN_LINE }])) }
  const consentNo = async () => {
    onConsent(false); setConsent(false)
    reveal(await addScripted(date, [{ role: 'buddy', content: SOLO_LINE }, { role: 'buddy', content: questionOf('q1', { mood: sessionMood, past, stats }).q }]))
  }
  const sayBye = async () => { const ids = await addScripted(date, [{ role: 'me', content: BYE_ME }, { role: 'buddy', content: BYE_BUDDY }]); reveal(ids.slice(1)) }
  const [focusN, setFocusN] = useState(0) // 입력창에 커서를 두라는 신호
  const more = async () => {
    if (aiFlow) reveal(await addScripted(date, [{ role: 'buddy', content: MORE_LINE }]))
    else setAgain(true)
    setFocusN((n) => n + 1)
  }
  const addTask = async (title: string) => {
    try { await taskFromChip(title); toast.show(`"${title}" 할 일을 기본함에 넣었어요`) } catch { toast.show('할 일을 만들지 못했어요. 다시 시도해 주세요.') }
  }
  const goFree = () => onFree({ text: draft?.body ?? (scriptedFlow ? composeDraft(st.r.answers, { past }) : ownWords(S.filter((m) => m.role === 'me').map((m) => m.content))), mood: sessionMood ?? entry?.mood ?? null })
  const editSaved = async (k: number, s: Parameters<typeof replaceSection>[2]) => { await replaceSection(date, k, s); setEditAt(null); toast.show('고쳐서 저장했어요') }
  /** ⌘Enter: 초안 저장, 없으면 정리(AI 흐름) */
  const commit = () => {
    if (draft) { void save(); return true }
    if (phase === 'talk' && st.myTalk.length && !distilling) { void distill(); return true }
    return false
  }

  // 아래 덩어리
  const qo = { mood: sessionMood, past, stats }
  const nudgeNow = phase === 'talk' && lastRow?.role === 'buddy' && lastRow.safety === SCRIPTED ? (['q1', 'q2', 'q3'] as const).map((s) => questionOf(s, qo)).find((q) => q.q === lastRow.content) : undefined
  const chips: Chip[] = phase === 'mood'
    ? [{ key: 'free', label: '그냥 쓸래요', tone: 'mute', onPress: goFree }]
    : phase === 'talk' ? [
      ...(nudgeNow ? nudgeNow.chips.map((c) => ({ key: c, label: c, onPress: () => say(c) })) : []),
      ...(st.myTalk.length ? [{ key: 'distill', label: distilling ? '정리하는 중…' : '일기로 정리해 줘', tone: 'acc' as const, onPress: () => void distill() }] : []),
      ...(!nudgeNow && nudgeOf(st.asked, qo) ? [{ key: 'nudge', label: '뭘 말할지 모르겠어', tone: 'mute' as const, onPress: () => void nudge() }] : []),
      ...(st.myTalk.length ? [] : [{ key: 'free', label: '그냥 쓸래요', tone: 'mute' as const, onPress: goFree }])
    ]
      : (phase === 'q1' || phase === 'q2' || phase === 'q3') ? [...questionOf(phase, qo).chips.map((c) => ({ key: c, label: c, onPress: () => void answerScripted(c) })), { key: SKIP, label: SKIP, tone: 'mute' as const, onPress: () => void answerScripted(SKIP) }]
        : phase === 'after' ? [{ key: 'more', label: aiFlow ? '더 이야기하기' : '하나 더 남기기', tone: 'acc' as const, onPress: () => void more() }, { key: 'bye', label: BYE_ME, tone: 'mute' as const, onPress: () => void sayBye() }]
          : phase === 'end' ? [{ key: 'more', label: aiFlow ? '더 이야기하기' : '하나 더 남기기', tone: 'mute' as const, onPress: () => void more() }]
            : []
  const line = phase === 'draft' ? '초안을 고치고, 다 되면 저장 (⌘↵)'
    : phase === 'end' ? (past ? '그날 일기를 저장했어요' : '오늘 일기를 저장했어요')
      : (phase === 'after' || phase === 'q1' || phase === 'q2' || phase === 'q3') && entry?.private ? `🔒 나만 보기 — ${josa(name, '는', '은')} 정해진 말만 하고, 일기는 어디로도 보내지 않아요`
        : (phase === 'q1' || phase === 'q2' || phase === 'q3') && consent === false ? `혼자 쓰는 중이에요 · ⋯에서 ${josa(name, '와', '과')} 나누기를 켤 수 있어요`
          : (phase === 'q1' || phase === 'q2' || phase === 'q3') && solo ? `오늘은 혼자 쓰는 날 — ${josa(name, '는', '은')} 정해진 말만 해요`
            : null
  const showComposer = phase === 'mood' || phase === 'talk' || phase === 'q1' || phase === 'q2' || phase === 'q3'
  const placeholder = phase === 'talk' ? `${name}에게 편하게 이야기하기…` : phase === 'mood' ? '직접 써도 돼' : '직접 써도 돼 — 한 줄이면 충분해'
  const send = (t: string) => (phase === 'talk' ? say(t) : phase === 'mood' ? void answerMood({ text: t }) : void answerScripted(t))
  /** 지금 쓰는 편(오른쪽 열 "내 말이 모이는 중") — 앱이 보여 주기만, 저장 안 함 */
  const forming = scriptedFlow ? composeDraft(st.r.answers, { past }) : ownWords(S.filter((m) => m.role === 'me').map((m) => m.content))

  return {
    date, today, past, entry, buddy, name, reduced, loaded, messages: st.all, S, sections, stats, phase, aiFlow, consentPending, solo, setSolo: setSoloState,
    typing, hidden, ai, draft, setDraft, distilling, quota, editAt, setEditAt, editSaved, chips, line, showComposer, placeholder, met, forming,
    sessionMood, answerMood, send, retry, stop, distill, makeTranscript, save, consentYes, consentNo, addTask, commit, focusN,
    onType: () => setTyped((n) => n + 1), canTranscript: aiFlow && S.some((m) => m.role === 'me')
  }
}
export type TalkState = ReturnType<typeof useTalk>

const STAGE_RING = ['#9fd39f', '#7cc472', '#5DBB63', '#f4c542', '#ff8fa3']
const moodFace = (mood: number | null | undefined): CharacterMood => (!mood ? 'smile' : mood >= 4 ? 'happy' : mood === 3 ? 'smile' : 'default')

/** 가운데 대화 칸(§10.1). inline = 좁은 창 — 초안·저장한 편 카드가 대화 안에 */
export function Talk({ t, inline }: { t: TalkState; inline: boolean }) {
  const { buddy, name, reduced, phase, ai, typing } = t
  const scroll = useRef<HTMLDivElement>(null)
  const [openedAt] = useState(() => new Date().toISOString())
  const visible = t.messages.filter((m) => !t.hidden.has(m.id))
  const lastBuddyId = [...visible].reverse().find((m) => m.role === 'buddy')?.id
  const face = moodFace(t.sessionMood ?? t.entry?.mood)
  const virtualStart = t.loaded && !t.messages.length && !t.sections.length
  const greet = virtualStart ? greetingOf({ date: t.date, today: t.today, hour: new Date().getHours(), stats: t.stats }) : null
  const sp = normalizeSpecies(buddy.species)
  const taskTitles = useMemo(() => t.messages.filter((m) => m.role === 'buddy' && !m.safety).map((m) => parseBuddyReply(m.content).task).filter((x): x is string => !!x), [t.messages])
  const madeRows = useQuery<{ title: string }>(`SELECT title FROM tasks WHERE deleted_at IS NULL AND title IN (${taskTitles.map(() => '?').join(',') || "''"})`, taskTitles)
  const made = new Set((madeRows ?? []).map((r) => r.title))

  // 새 말이 오면 아래로
  useLayoutEffect(() => {
    const el = scroll.current
    if (el) el.scrollTop = el.scrollHeight // 바로 맨 아래로(부드러운 스크롤은 받는 중 다시 그릴 때 끊겨 중간에 멈췄다)
  }, [visible.length, ai.kind === 'reading' ? ai.text.length : -1, t.draft?.source, t.distilling, phase, typing, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  const av = (id: string | null, mood: CharacterMood = 'smile') => (
    <span className="dmsg__av" style={{ '--ring': STAGE_RING[Math.max(0, buddy.stage - 1)] } as React.CSSProperties}>
      <CharacterArt species={buddy.species} stage={buddy.stage} size={30} mood={id && id === lastBuddyId ? face : mood} crop="bust" motion={id && id === lastBuddyId && !reduced ? 'idle' : 'still'} />
    </span>
  )
  const fresh = (createdAt: string) => (createdAt >= openedAt ? ' is-new' : '')
  const savedCard = (k: number) => {
    const sec = t.sections[k]
    if (!sec) return null
    return <div key={`sec-${k}`} className="dmsg is-card"><SavedCard section={sec} date={t.date} past={t.past} clamp editing={t.editAt === k} onEdit={() => t.setEditAt(k)} onCancel={() => t.setEditAt(null)} onSave={(s) => void t.editSaved(k, s)} /></div>
  }
  const items: React.ReactNode[] = []
  const warmCount = visible.filter((m) => m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)).length
  const extra = inline ? leadingSections(t.sections.length, warmCount) : 0
  for (let k = 0; k < extra; k++) items.push(savedCard(k))
  let warmK = 0
  visible.forEach((m, i) => {
    const prev = visible[i - 1]
    const isAi = !m.safety
    const warm = m.safety === SCRIPTED && m.role === 'buddy' && isWarm(m.content)
    if (warm && inline) { items.push(savedCard(extra + warmK)); warmK++ }
    if (m.role === 'me') {
      const mood = m.safety === SCRIPTED ? replay([m.content]).answers.mood : null
      const skip = m.safety === SCRIPTED && isSkip(m.content)
      items.push(
        <div key={m.id} className={`dmsg is-me${fresh(m.created_at)}`}>
          <div className={`dmsg__bb${skip ? ' is-skip' : ''}`}>{mood ? <span className="dmsg__mood"><MoodFace mood={mood} size={22} />{m.content}</span> : m.content}</div>
        </div>
      )
      return
    }
    const parsed = isAi ? parseBuddyReply(m.content) : { text: m.content, task: undefined }
    const showAv = !prev || prev.role !== 'buddy' || warm
    items.push(
      <div key={m.id} className={`dmsg${showAv ? '' : ' is-cont'}${fresh(m.created_at)}`}>
        {showAv ? av(m.id) : <span className="dmsg__gap" />}
        <div className="dmsg__bb">
          {parsed.text}
          {parsed.task && (made.has(parsed.task.trim().slice(0, 200))
            ? <span className="dchip-task is-done"><Check />할 일에 넣었어요</span>
            : <button className="dchip-task" onClick={() => void t.addTask(parsed.task!)}>＋ 할 일로: {parsed.task}</button>)}
        </div>
      </div>
    )
  })

  return (
    <div ref={scroll} className="dtalk" aria-live="polite">
      <div className="dtalk__col">
        {virtualStart && !typing && (
          <div className="dtalk__intro">
            <CharacterArt species={buddy.species} stage={buddy.stage} size={96} mood="smile" motion={reduced ? 'still' : 'idle'} />
            <b>{name}</b>
            <span>{sp ? ART_SPECIES[sp].full : '정원 친구'} · Lv {buddy.level} {STAGES[Math.min(5, Math.max(1, buddy.stage)) - 1].name}</span>
          </div>
        )}
        <div className="dtalk__sep">{dayHead(t.date)}{t.past ? '' : ` · ${TIME_LABEL[timeOfDay(new Date().getHours())]}`}</div>
        {virtualStart && !t.met && <div className="dmsg">{av(null)}<div className="dmsg__bb">{introLine(name)}</div></div>}
        {greet && <div className="dmsg">{t.met ? av('greet', 'smile') : <span className="dmsg__gap" />}<div className="dmsg__bb">{greet}</div></div>}
        {items}
        {typing && <div className="dmsg">{av(null, 'default')}<div className="dmsg__bb"><Dots /></div></div>}
        {phase === 'consent' && !typing && (
          <div className="dcard is-in">
            <b>{josa(name, '와', '과')} 편하게 이야기하고 일기로 정리할까?</b>
            <p>대화를 일기로 정리하려면 꿈틀 AI가 읽어야 해요.</p>
            <ul>
              <li>꿈틀 서버(우리 Mac mini)에서만 처리하고, 원문은 남기지 않아요</li>
              <li>나만 보기로 둔 날은 보내지 않아요</li>
              <li>혼자 쓰면 {josa(name, '가', '이')} 정해진 질문만 하고, 일기는 내 말 그대로 남아요</li>
            </ul>
            <div className="dcard__btns">
              <button className="dbtn is-ghost" onClick={() => void t.consentNo()}>혼자 쓸게요</button>
              <button className="dbtn is-primary" onClick={() => void t.consentYes()}>나누기</button>
            </div>
            <small>{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요 · ⋯에서 언제든 바꿔요</small>
          </div>
        )}
        {ai.kind === 'reading' && (
          <div className="dmsg">{av(null, 'think')}<div className="dmsg__bb">{ai.text ? parseBuddyReply(ai.text).text : <span className="dmsg__wait"><Dots />{ai.queue ? `차례를 기다리는 중… (앞에 ${ai.queue}명)` : `${josa(name, '가', '이')} 듣는 중`}</span>}</div></div>
        )}
        {ai.kind === 'error' && (
          <div className="dcard is-in is-error" role="status">
            <p>지금은 {josa(name, '가', '이')} 쉬고 있어요. 한 말은 그대로 남아 있어요</p>
            <button className="dbtn is-link" onClick={t.retry}><RotateCcw />다시 시도</button>
          </div>
        )}
        {t.distilling && (!t.draft || !inline) && (
          <div className="dmsg">{av(null, 'think')}<div className="dmsg__bb"><span className="dmsg__wait"><Dots />네 말로 일기를 정리하는 중</span></div></div>
        )}
        {inline && t.draft && !typing && (
          <div className="dmsg is-card">
            <DraftCard draft={t.draft} date={t.date} past={t.past} name={name} mood={t.sessionMood ?? t.entry?.mood ?? null} aiFlow={t.aiFlow} distilling={t.distilling}
              left={t.quota ? Math.max(0, t.quota.limit - t.quota.used) : null} canTranscript={t.canTranscript}
              onChange={(d) => t.setDraft({ ...t.draft!, ...d })} onRedo={() => void t.distill(true)} onTranscript={t.makeTranscript} onSave={() => void t.save()} onBack={t.aiFlow ? () => t.setDraft(null) : undefined} />
          </div>
        )}
        {!inline && t.draft && !typing && <p className="dtalk__aside">오른쪽 {t.past ? '그날' : '오늘'} 일기에서 초안을 고치고 저장해요 →</p>}
      </div>
    </div>
  )
}

/** 아래 고정: 기분 얼굴 줄 · 빠른 답 칩 · 상태 줄 · 입력 */
export function Dock({ t }: { t: TalkState }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const { phase } = t
  const disabled = t.typing || t.ai.kind === 'reading' || t.distilling
  useEffect(() => { if (t.focusN) window.setTimeout(() => ref.current?.focus(), 60) }, [t.focusN])
  useEffect(() => { const el = ref.current; if (!el) return; el.style.height = ''; if (text) el.style.height = `${Math.min(el.scrollHeight, 132)}px` }, [text])
  const send = () => {
    const v = text.trim()
    if (!v || disabled) return
    setText('')
    t.send(v)
  }
  return (
    <div className="ddock">
      <div className="ddock__col">
        {phase === 'mood' && (
          <div className="dmoods" role="radiogroup" aria-label={t.past ? '그날 기분' : '오늘 기분'}>
            {MOODS.map((m, i) => (
              <button key={m.value} role="radio" aria-checked={false} aria-label={m.label} disabled={t.typing} title={`${m.label} (${i + 1})`} onClick={() => void t.answerMood({ mood: m.value })}>
                <MoodFace mood={m.value} size={40} />
                <small>{m.label.replace('그저 그랬어요', '그저 그래').replace(/였어요$|었어요$/, '')}</small>
              </button>
            ))}
          </div>
        )}
        {t.chips.length > 0 && (
          <div className="dchips">
            {t.chips.map((c) => <button key={c.key} className={`dchip${c.tone ? ` is-${c.tone}` : ''}`} disabled={disabled} onClick={c.onPress}>{c.label}{c.key === 'distill' && <kbd>⌘↵</kbd>}</button>)}
          </div>
        )}
        {t.line && <p className="ddock__line">{t.line}</p>}
        {t.showComposer && (
          <div className={`dcomposer${phase === 'talk' ? ' is-ai' : ''}`}>
            <textarea
              ref={ref}
              rows={1}
              value={text}
              placeholder={t.placeholder}
              aria-label={t.placeholder}
              onChange={(e) => { setText(e.target.value); t.onType() }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
                if (e.key === 'Escape' && text) { e.stopPropagation(); setText('') }
              }}
            />
            {t.ai.kind === 'reading' || t.distilling
              ? <button className="dcomposer__send" aria-label="멈추기" onClick={t.stop}><Square /></button>
              : <button className="dcomposer__send" aria-label="보내기 (Enter)" disabled={!text.trim() || disabled} onClick={send}><ArrowUp /></button>}
          </div>
        )}
      </div>
    </div>
  )
}

function Dots() {
  return <span className="ddots" aria-label="입력 중"><i /><i /><i /></span>
}
const dayHead = (date: string) => {
  const d = new Date(`${date}T00:00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`
}
export const moodLabel = (v: number | null | undefined) => moodOf(v)?.label ?? ''
