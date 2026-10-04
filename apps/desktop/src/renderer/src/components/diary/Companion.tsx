import { ArrowUp, Check, Lock, Phone, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { STAGES } from '@sprout/schema/growth'
import { useQuery } from '../../data/useQuery'
import { isUnavailable } from '../../data/ai'
import {
  buddyLine, buddyReply, CRISIS_CARD, josa, MESSAGES_BY_DATE_SQL, parseBuddyReply, sendMessage, skyOf, taskFromChip, takeNotice,
  type Buddy, type DiaryMessage
} from '../../data/diary'
import { CharacterArt, type CharacterMood } from '../growth/CharacterArt'
import { useToast } from '../Toast'
import { SkyIcon } from './MoodFace'

// 15 §9.4 곁자리 — 작은 무대(캐릭터가 페이지 옆에 앉아 있다) + 캐릭터와 이야기 + 위기 카드

/** Editor가 보내는 캐릭터 반응 하나(기분 고름·나만 보기 등). id가 바뀔 때마다 한 번 재생 */
export type Cue = { id: number; line: string; face?: CharacterMood; hop?: boolean; heart?: boolean }
export type CompanionMode = 'talk' | 'consent' | 'private' | 'solo'

const STAGE_RING = ['#9fd39f', '#7cc472', '#5DBB63', '#f4c542', '#ff8fa3']
const hourNow = () => new Date().getHours()

type Props = {
  date: string; content: string; buddy: Buddy; stage: number; memory: boolean; mode: CompanionMode; inline: boolean
  reduced: boolean; typing: boolean; cue?: Cue; doneLine: string
  onActivity: () => void; onConsent: () => void; onPrivateOff: () => void; onSoloOff: () => void
}
export function Companion({ date, content, buddy, stage, memory, mode, inline, reduced, typing, cue, doneLine, onActivity, onConsent, onPrivateOff, onSoloOff }: Props) {
  const name = buddy.name
  const status = mode === 'talk' ? '같이 읽는 중' : mode === 'consent' ? '나만 봐요' : mode === 'private' ? '나만 보기' : '혼자 쓰는 중'
  const [crisis, setCrisis] = useState(false)
  return (
    <section className={`diary-comp${inline ? ' is-inline' : ''}`} aria-label={`${josa(name, '와', '과')} 이야기`}>
      <MiniStage buddy={buddy} stage={stage} inline={inline} reduced={reduced} typing={typing} cue={cue} asleep={mode === 'private'} still={crisis} />
      <div className="diary-comp__talk">
        <div className="diary-comp__head">
          {josa(name, '와', '과')} 이야기
          <span className={`diary-comp__status${mode === 'talk' ? '' : ' is-off'}`}><i />{status}</span>
        </div>
        {mode === 'consent' && (
          <>
            <div className="diary-pane">
              <b>{josa(name, '와', '과')} 일기를 나눠 볼래?</b>
              <span>나누면 {josa(name, '가', '이')} 일기를 읽고 공감하며 이야기를 들어 줘요. 나만 보기 날은 보내지 않아요.</span>
              <button className="diary-btn" onClick={onConsent}>나누기 켜기</button>
            </div>
            <div className="diary-pane diary-pane--row">
              <CharacterArt species={buddy.species} stage={stage} size={44} mood="happy" />
              <span className="diary-pane__say">{doneLine}</span>
            </div>
          </>
        )}
        {mode === 'private' && (
          <div className="diary-pane">
            <Lock className="diary-pane__icon" />
            <b>이 날은 {josa(name, '가', '이')} 읽지 않아요</b>
            <span>나만 보기 날은 AI에게 보내지 않고, 기억하기 요약에도 넣지 않아요.</span>
            <button className="diary-btn is-ghost" onClick={onPrivateOff}>나만 보기 끄기</button>
          </div>
        )}
        {mode === 'solo' && (
          <div className="diary-pane">
            <b>오늘은 혼자 쓰는 날</b>
            <span>필요하면 언제든 불러 줘요.</span>
            <button className="diary-btn is-ghost" onClick={onSoloOff}>{josa(name, '와', '과')} 이야기하기</button>
          </div>
        )}
        {mode === 'talk' && <Talk date={date} content={content} buddy={buddy} stage={stage} memory={memory} inline={inline} onActivity={onActivity} onCrisis={setCrisis} />}
      </div>
    </section>
  )
}

// ── 작은 무대(168) — 성장 무대(10 §3.2.2)를 작게: 시간대 하늘 + 땅, 장식·HUD 없음 ──
function MiniStage({ buddy, stage, inline, reduced, typing, cue, asleep, still }: { buddy: Buddy; stage: number; inline: boolean; reduced: boolean; typing: boolean; cue?: Cue; asleep: boolean; still: boolean }) {
  const [hour, setHour] = useState(hourNow)
  useEffect(() => { const t = window.setInterval(() => setHour(hourNow()), 60_000); return () => window.clearInterval(t) }, [])
  const sky = skyOf(hour)
  const charRef = useRef<HTMLButtonElement>(null)
  const [bubble, setBubble] = useState<{ text: string; id: number }>()
  const [face, setFace] = useState<CharacterMood>()
  const [act, setAct] = useState<string>()
  const [hearts, setHearts] = useState<number[]>([])
  const timers = useRef(new Set<number>())
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.current.delete(t); fn() }, ms); timers.current.add(t) }
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const say = (text: string, ms = 2600) => { const id = Date.now() + Math.random(); setBubble({ text, id }); later(() => setBubble((b) => (b?.id === id ? undefined : b)), ms) }
  const play = (name: string, ms = 600) => { if (reduced) return; const id = `${name} ${Date.now()}`; setAct(id); later(() => setAct((a) => (a === id ? undefined : a)), ms) }
  const run = (c: Cue) => {
    say(c.line, c.heart ? 3000 : 2600)
    if (c.face) { const f = c.face; setFace(f); later(() => setFace((x) => (x === f ? undefined : x)), 3000) }
    if (c.hop) play('is-hop')
    if (c.heart && !reduced) { const id = Date.now(); setHearts((h) => [...h.slice(-2), id]); later(() => setHearts((h) => h.filter((x) => x !== id)), 2300) }
  }
  // 처음 열면 인사 한 번
  useEffect(() => { const t = window.setTimeout(() => say(asleep ? buddyLine({ kind: 'private' }) : buddyLine({ kind: 'open', hour: hourNow() })), 500); return () => window.clearTimeout(t) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 새 반응만 재생한다(폭이 바뀌어 다시 그려질 때 지난 반응을 되풀이하지 않게)
  const seenCue = useRef(cue?.id)
  useEffect(() => { if (cue && cue.id !== seenCue.current) { seenCue.current = cue.id; run(cue) } }, [cue?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 쓰는 중: 4초에 한 번 작게 끄덕(움직임 줄이기면 없음)
  useEffect(() => {
    if (!typing || reduced) return
    play('is-nod', 500)
    const t = window.setInterval(() => { if (!document.hidden) play('is-nod', 500) }, 4000)
    return () => window.clearInterval(t)
  }, [typing, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  // 깜빡임(움직임 줄이기에도 둔다 — 얼굴 바꾸기, 10 §3.2.11). 창이 안 보이면 쉰다
  useEffect(() => {
    let t = 0
    const loop = () => { t = window.setTimeout(() => { const el = charRef.current; if (el && !document.hidden) { el.classList.add('is-blink'); window.setTimeout(() => el.classList.remove('is-blink'), 140) } loop() }, 3000 + Math.random() * 3000) }
    loop()
    return () => window.clearTimeout(t)
  }, [])

  const mood: CharacterMood = asleep ? 'sleepy' : face ?? (typing ? 'smile' : 'default')
  const size = inline ? 92 : 122
  const name = buddy.name
  const stageName = buddy.species ? STAGES[Math.max(0, stage - 1)]?.name : '알'
  return (
    <div className={`diary-mstage diary-sky--${sky}`}>
      {!inline && <span className="diary-mstage__sun"><SkyIcon sky={sky} /></span>}
      {!inline && <span className="diary-mstage__tag"><b>{name}</b> · {stageName}</span>}
      <svg className="diary-mstage__ground" viewBox="0 0 320 60" preserveAspectRatio="none" aria-hidden="true"><ellipse className="g2" cx="60" cy="62" rx="160" ry="34" /><ellipse className="g1" cx="200" cy="74" rx="260" ry="40" /></svg>
      {bubble && <div key={bubble.id} className="diary-mstage__bubble" role="status" aria-live="polite">{bubble.text}</div>}
      {hearts.map((id) => <svg key={id} className="diary-mstage__heart" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z" /></svg>)}
      <button
        ref={charRef}
        className={`diary-char${act ? ` ${act.split(' ')[0]}` : ''}${still || reduced ? ' is-still' : ''}`}
        aria-label={`${name}, ${stageName}. 눌러서 말 걸기`}
        onClick={() => { play('is-hop'); say(asleep ? buddyLine({ kind: 'private' }) : buddyLine({ kind: 'open', hour: hourNow() })) }}
      >
        <span className="diary-char__act"><span className="diary-char__breath"><CharacterArt species={buddy.species} stage={stage} size={size} mood={mood} look={typing && !asleep ? { x: -0.8, y: 0.3 } : undefined} /></span></span>
        {asleep && <span className="diary-char__lock"><Lock /></span>}
      </button>
    </div>
  )
}

// ── 캐릭터와 이야기(§3.1 동작 그대로, 모양만 §9.4) ──
const chipsMade = new Set<string>()
let noticeShown: boolean | undefined
function Talk({ date, content, buddy, stage, memory, inline, onActivity, onCrisis }: { date: string; content: string; buddy: Buddy; stage: number; memory: boolean; inline: boolean; onActivity: () => void; onCrisis: (on: boolean) => void }) {
  const toast = useToast()
  const messages = useQuery<DiaryMessage>(MESSAGES_BY_DATE_SQL, [date])
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<'down' | 'fail' | null>(null)
  const [draft, setDraft] = useState('')
  const [, bump] = useState(0)
  const [notice] = useState(() => (noticeShown ??= takeNotice()))
  const ctrl = useRef<AbortController>(undefined)
  const listRef = useRef<HTMLDivElement>(null)
  const busy = pending !== null
  const name = buddy.name
  // 이미 만든 칩은 다시 열어도(앱을 껐다 켜도) "할 일에 넣었어요" — 같은 할 일을 두 번 만들지 않게
  const chipTitles = useMemo(() => (messages ?? []).filter((m) => m.role === 'buddy').map((m) => parseBuddyReply(m.content).task).filter((t): t is string => !!t), [messages])
  const madeTitles = useQuery<{ title: string }>(`SELECT title FROM tasks WHERE deleted_at IS NULL AND title IN (${chipTitles.map(() => '?').join(',') || "''"})`, chipTitles)
  const made = (title: string) => (madeTitles ?? []).some((t) => t.title === title.trim().slice(0, 200))
  const hasCrisis = !!messages?.some((m) => m.safety)
  useEffect(() => { onCrisis(hasCrisis) }, [hasCrisis]) // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async (fn: (signal: AbortSignal) => Promise<unknown>) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setError(null); setPending('')
    onActivity()
    try { await fn(c.signal) } catch (e) {
      if (!c.signal.aborted) setError(isUnavailable(e) ? 'down' : 'fail')
    } finally { if (ctrl.current === c) setPending(null) }
  }
  const opts = (signal: AbortSignal) => ({ buddy, memoryOn: memory, signal, onDelta: (t: string) => setPending(t) })
  useEffect(() => () => ctrl.current?.abort(), [])

  // 첫 답: 저장(0.6초) 뒤 3초 동안 더 쓰지 않으면 캐릭터가 먼저 한 번(§7 그대로)
  useEffect(() => {
    if (!messages || messages.length || busy || error || content.trim().length < 10) return
    const t = window.setTimeout(() => void ask((s) => buddyReply(date, opts(s))), 3600)
    return () => window.clearTimeout(t)
  }, [content, messages?.length, busy, error]) // eslint-disable-line react-hooks/exhaustive-deps

  // 새 말이 오면 아래로(위기 카드는 화면 안으로)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const card = el.querySelector('.diary-crisis:last-of-type')
    if (card) card.scrollIntoView({ block: 'nearest' })
    else if (!inline) el.scrollTop = el.scrollHeight
  }, [messages?.length, pending, inline])

  const send = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void ask((s) => sendMessage(date, text, opts(s)))
  }
  const makeTask = async (m: DiaryMessage, title: string) => {
    try { await taskFromChip(title); chipsMade.add(m.id); bump((n) => n + 1); toast.show(`"${title}" 할 일을 기본함에 넣었어요`) } catch { toast.show('할 일을 만들지 못했어요. 다시 시도해 주세요.') }
  }
  if (!messages) return <div className="diary-msgs" />
  const avatar = (mood: CharacterMood = 'smile') => <span className="diary-msg__av" style={{ '--ring': STAGE_RING[Math.max(0, stage - 1)] } as React.CSSProperties}><CharacterArt species={buddy.species} stage={stage} size={30} mood={mood} /></span>

  return (
    <>
      <div ref={listRef} className="diary-msgs" aria-live="polite">
        {!messages.length && !busy && !error && (
          <p className="diary-msgs__hint">{content.trim().length >= 10 ? `잠깐 쉬면 ${josa(name, '가', '이')} 읽고 말을 걸어요` : `일기를 쓰면 ${josa(name, '가', '이')} 읽고 이야기해 줘요`}</p>
        )}
        {messages.map((m) => {
          if (m.role === 'me') return <div key={m.id} className="diary-msg is-me"><div className="diary-msg__bb">{m.content}</div></div>
          if (m.safety) return <CrisisCard key={m.id} buddy={buddy} stage={stage} alert />
          const p = parseBuddyReply(m.content)
          return (
            <div key={m.id} className="diary-msg">
              {avatar()}
              <div className="diary-msg__bb">
                {p.text}
                {p.task && (chipsMade.has(m.id) || made(p.task)
                  ? <span className="diary-chip is-done"><Check />할 일에 넣었어요</span>
                  : <button className="diary-chip" onClick={() => void makeTask(m, p.task!)}><SproutMark />할 일로: {p.task}</button>)}
              </div>
            </div>
          )
        })}
        {busy && (
          <div className="diary-msg is-busy">
            {avatar('default')}
            <div className="diary-msg__bb">{pending || <span className="diary-typing"><i /><i /><i /></span>}</div>
          </div>
        )}
        {error && (
          <div className="diary-talk__error" role="status">
            {error === 'down' ? `지금은 ${josa(name, '가', '이')} 쉬고 있어요. 일기는 그대로 저장돼요` : '답을 받지 못했어요.'}
            <button onClick={() => void ask((s) => buddyReply(date, opts(s)))}>다시 시도</button>
          </div>
        )}
      </div>
      <div className="diary-talk__in">
        <textarea
          rows={1}
          value={draft}
          placeholder={`${name}에게 이야기하기…`}
          aria-label={`${name}에게 이야기하기`}
          onChange={(e) => { setDraft(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 96)}px` }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
        />
        {busy
          ? <button className="diary-talk__send" aria-label="멈추기" onClick={() => { ctrl.current?.abort(); setPending(null) }}><X /></button>
          : <button className="diary-talk__send" aria-label="보내기" disabled={!draft.trim()} onClick={send}><ArrowUp /></button>}
      </div>
      {notice && <p className="diary-talk__notice">{josa(name, '는', '은')} 친구처럼 들어 주지만 전문 상담은 아니에요</p>}
    </>
  )
}

function SproutMark() {
  return <svg className="diary-chip__leaf" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M12 14c-5-1-6-6-4-7 3 0 4 3 4 7Zm0-2c1-5 5-6 7-5 0 3-3 5-7 5Z" fill="currentColor" /></svg>
}

/** 위기 안내 카드(§3.1·§9.4): 차분한 색, 109가 맨 위, 번호 크게 + 복사. 움직임 없음 */
export function CrisisCard({ buddy, stage, alert }: { buddy: Buddy; stage: number; alert?: boolean }) {
  const [copied, setCopied] = useState<string>()
  const copy = (n: string) => { void navigator.clipboard?.writeText(n.replace(/\s/g, '')).catch(() => {}); setCopied(n) }
  return (
    <div className="diary-crisis" role={alert ? 'alert' : undefined}>
      <div className="diary-crisis__title"><CharacterArt species={buddy.species} stage={stage} size={30} />{CRISIS_CARD.title}</div>
      <ul>
        {CRISIS_CARD.lines.map((l, i) => (
          <li key={l.number} className={i === 0 ? 'is-first' : ''}>
            <span className="diary-crisis__ph"><Phone /></span>
            <span className="diary-crisis__name">{l.label}<small>{l.note}</small></span>
            <span className="diary-crisis__num"><b>{l.number}</b><button onClick={() => copy(l.number)}>{copied === l.number ? '복사했어요' : '번호 복사'}</button></span>
          </li>
        ))}
      </ul>
      <p className="diary-crisis__hope">{CRISIS_CARD.hope}</p>
      <p>{CRISIS_CARD.footer}</p>
    </div>
  )
}
