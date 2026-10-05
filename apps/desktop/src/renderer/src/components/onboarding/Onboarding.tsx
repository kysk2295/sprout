import { CalendarDays, Check, ChevronLeft, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  advance, autoSkip, back, calendarAvailability, calendarsApi, connectCalendar, connectedCalendars, progress, skipAll, STEPS,
  type CalendarAvailability, type CalendarProvider, type OnboardingState, type Step
} from '../../data/onboarding'
import { ensureCharacter, useGrowth } from '../../data/growth'
import { createTask, taskListId } from '../../data/mutations'
import { dayKey } from '../../lib/dates'
import { CharacterArt } from '../growth/CharacterArt'
import { SurveyDialog } from '../growth/SurveyDialog'
import './onboarding.css'

type Props = { state: OnboardingState; ready: boolean; onChange: (s: OnboardingState) => void; onHide: () => void; onOpenCalendar?: () => void }

// 18 §3 첫 실행 안내: 환영 → 캘린더 연결 → 성향 조사 → 첫 할 일. 모든 단계는 건너뛸 수 있다.
export function Onboarding({ state, ready, onChange, onHide, onOpenCalendar }: Props) {
  const { character } = useGrowth()
  const hasSpecies = !!character?.species
  const [survey, setSurvey] = useState(false)
  const [busy, setBusy] = useState(false) // 브라우저 연결처럼 기다리는 중에는 Esc·건너뛰기를 막는다

  // 이미 한 단계(성향 조사 끝남)는 들어서는 순간 넘긴다
  useEffect(() => {
    const next = autoSkip(state, (s) => s === 'survey' && hasSpecies)
    if (next !== state) onChange(next)
  }, [state, hasSpecies, onChange])

  const go = (outcome: 'done' | 'skip') => onChange(advance(state, outcome))
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (survey || busy || document.querySelector('.modal-scrim, .dialog-scrim')) return // 위에 다른 창(가져오기·조사)이 열려 있으면 그쪽 몫
      if (e.key === 'Escape') { e.preventDefault(); onHide() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [survey, busy, onHide])

  const { index, total } = progress(state)
  const step = state.step
  return createPortal(
    <div className="onb-scrim">
      <div className="onb" role="dialog" aria-modal="true" aria-label="꿈틀 시작하기">
        <header className="onb__top">
          {index > 0 ? (
            <button className="onb__back icon-btn" aria-label="이전" disabled={busy} onClick={() => onChange(back(state))}><ChevronLeft size={18} /></button>
          ) : <span className="onb__back" />}
          <ol className="onb__dots" aria-label={`${index + 1}/${total}단계`}>
            {STEPS.map((s, i) => <li key={s} className={i === index ? 'is-on' : i < index ? 'is-past' : ''} />)}
          </ol>
          <button className="onb__close icon-btn" aria-label="닫기(다음에 이어서)" title="닫기 — 다음에 이어서 볼 수 있어요" disabled={busy} onClick={onHide}><X size={16} /></button>
        </header>
        {step === 'welcome' && <Welcome onStart={() => go('done')} onSkipAll={() => onChange(skipAll(state))} />}
        {step === 'calendar' && <CalendarStep onBusy={setBusy} onNext={(any) => go(any ? 'done' : 'skip')} onSkip={() => go('skip')} onOpenCalendar={onOpenCalendar} />}
        {step === 'survey' && (
          <SurveyStep ready={ready} onStart={() => void ensureCharacter().then(() => setSurvey(true))} onSkip={() => go('skip')} />
        )}
        {step === 'first-task' && <FirstTaskStep ready={ready} onFinish={(made) => go(made ? 'done' : 'skip')} />}
      </div>
      {survey && <SurveyDialog onClose={() => setSurvey(false)} />}
    </div>,
    document.body
  )
}

function Foot({ children }: { children: ReactNode }) {
  return <footer className="onb__foot">{children}</footer>
}

// ── 1. 환영 ──
function Welcome({ onStart, onSkipAll }: { onStart: () => void; onSkipAll: () => void }) {
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => { primary.current?.focus() }, [])
  return (
    <section className="onb__body onb__body--center">
      <SproutMark />
      <h2 className="onb__title">꿈틀에 오신 걸 환영해요</h2>
      <p className="onb__lead">할 일을 끝낼수록 함께 자라는 친구가 생겨요.<br />시작하기 전에 1분만 준비해요.</p>
      <ul className="onb__list">
        <li><CalendarDays size={16} /> 쓰던 캘린더 일정을 할 일과 한 화면에</li>
        <li><Sparkles size={16} /> 나와 닮은 캐릭터 찾기</li>
      </ul>
      <Foot>
        <button className="onb__primary" ref={primary} onClick={onStart}>시작하기</button>
        <button className="onb__link" onClick={onSkipAll}>건너뛰고 바로 쓰기</button>
      </Foot>
    </section>
  )
}

// ── 2. 캘린더 연결 (16 — 캘린더 모듈의 연결 흐름을 그대로 부른다) ──
type ConnState = 'idle' | 'connecting' | 'connected' | 'error'
function CalendarStep({ onNext, onSkip, onBusy, onOpenCalendar }: { onNext: (any: boolean) => void; onSkip: () => void; onBusy: (b: boolean) => void; onOpenCalendar?: () => void }) {
  const [avail, setAvail] = useState<CalendarAvailability>()
  const [conn, setConn] = useState<Record<CalendarProvider, ConnState>>({ google: 'idle', apple: 'idle' })
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void calendarAvailability().then((a) => alive && setAvail(a))
    void connectedCalendars().then((list) => alive && setConn((c) => ({ google: list.includes('google') ? 'connected' : c.google, apple: list.includes('apple') ? 'connected' : c.apple })))
    return () => { alive = false }
  }, [])
  const connecting = conn.google === 'connecting' || conn.apple === 'connecting'
  useEffect(() => { onBusy(connecting); return () => onBusy(false) }, [connecting, onBusy])
  const connect = async (p: CalendarProvider) => {
    setError('')
    setConn((c) => ({ ...c, [p]: 'connecting' }))
    const r = await connectCalendar(p)
    setConn((c) => ({ ...c, [p]: r.ok ? 'connected' : 'error' }))
    if (!r.ok) setError(r.error)
  }
  const any = conn.google === 'connected' || conn.apple === 'connected'
  const row = (p: CalendarProvider, name: string, hint: string) => {
    const a = avail?.[p]
    const s = conn[p]
    return (
      <div className={`onb__row${s === 'connected' ? ' is-done' : ''}`}>
        <span className="onb__row-icon"><CalendarDays size={18} /></span>
        <span className="onb__row-text"><b>{name}</b><small>{s === 'connecting' ? (p === 'google' ? '브라우저에서 구글 로그인과 권한 허용을 마쳐 주세요.' : '캘린더 접근을 허용해 주세요.') : a && !a.usable ? a.reason : hint}</small></span>
        {s === 'connected' ? <span className="onb__ok"><Check size={14} /> 연결됨</span>
          : s === 'connecting' ? <button className="onb__ghost" onClick={() => void calendarsApi()?.cancel()}>취소</button>
          : <button className="onb__ghost" disabled={!a?.usable || connecting} onClick={() => void connect(p)}>{s === 'error' ? '다시 연결' : '연결'}</button>}
      </div>
    )
  }
  return (
    <section className="onb__body">
      <h2 className="onb__title">캘린더를 연결할까요?</h2>
      <p className="onb__lead">일정과 할 일을 한 화면에서 봐요. 일정은 읽기만 하고 이 기기에만 저장해요.</p>
      <div className="onb__rows">
        {row('google', 'Google 캘린더', 'Google 계정의 일정')}
        {row('apple', 'Apple 캘린더', 'Mac 캘린더 앱의 일정(iCloud 포함)')}
      </div>
      {error && <p className="onb__error" role="alert">{error}</p>}
      <p className="onb__note">나중에 설정 › 캘린더{onOpenCalendar ? '나 달력 화면' : ''}에서도 연결할 수 있어요.</p>
      <Foot>
        <button className="onb__primary" disabled={connecting} onClick={() => (any ? onNext(true) : onSkip())}>{any ? '다음' : '건너뛰기'}</button>
      </Foot>
    </section>
  )
}

// ── 3. 성향 조사 (10 §2.2 — 조사 창은 성장 화면과 같은 것) ──
function SurveyStep({ ready, onStart, onSkip }: { ready: boolean; onStart: () => void; onSkip: () => void }) {
  // 조사를 마치면(캐릭터 생김) 위 autoSkip이 이 단계를 '함'으로 넘긴다 — 결과 축하는 조사 창의 결과 화면이 맡는다
  return (
    <section className="onb__body onb__body--center">
      <div className="onb__lineup">{(['turtle', 'squirrel', 'cat', 'otter'] as const).map((s) => <CharacterArt key={s} species={s} size={64} />)}</div>
      <h2 className="onb__title">나와 닮은 친구를 찾아볼까요?</h2>
      <p className="onb__lead">할 일을 다루는 방식을 8가지만 물어요(1분).<br />결과에 맞는 친구를 키우게 돼요.</p>
      <Foot>
        <button className="onb__primary" disabled={!ready} onClick={onStart}>{ready ? '시작하기' : '계정 준비 중…'}</button>
        <button className="onb__link" onClick={onSkip}>나중에</button>
      </Foot>
    </section>
  )
}

// ── 4. 첫 할 일 ──
function FirstTaskStep({ ready, onFinish }: { ready: boolean; onFinish: (made: boolean) => void }) {
  const [title, setTitle] = useState('')
  const [made, setMade] = useState<string[]>([])
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [ready])
  const add = async () => {
    const t = title.trim()
    if (!t || !ready) return
    try {
      await createTask({ title: t, list_id: await taskListId(null), due_at: dayKey() }) // 기본함(없으면 만든다, 02 §14.1)
      setMade((m) => [...m, t])
      setTitle('')
      setError('')
    } catch { setError('할 일을 만들지 못했어요. 잠시 뒤 다시 시도하세요.') }
  }
  return (
    <section className="onb__body">
      <h2 className="onb__title">오늘 할 일 하나를 적어 볼까요?</h2>
      <p className="onb__lead">적고 Enter를 누르면 "오늘"에 들어가요. 끝내면 친구에게 첫 경험치가 가요.</p>
      <input
        ref={input}
        className="onb__input"
        placeholder={ready ? '예: 메일 답장하기' : '계정 준비 중…'}
        value={title}
        maxLength={200}
        disabled={!ready}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void add() } }}
      />
      {error && <p className="onb__error" role="alert">{error}</p>}
      {made.length > 0 && <ul className="onb__made">{made.map((t, i) => <li key={i}><Check size={14} /> {t}</li>)}</ul>}
      <ul className="onb__tips">
        <li><kbd>⌘N</kbd> 어디서나 할 일 추가 — "내일 오후 3시"처럼 쓰면 날짜가 잡혀요</li>
        <li><kbd>⌃⇧A</kbd> 다른 앱을 쓰다가도 빠른 추가</li>
        <li><kbd>⌘K</kbd> 명령 메뉴 — "시작 안내"로 이 화면을 다시 열 수 있어요</li>
      </ul>
      <Foot>
        <button className="onb__primary" onClick={() => onFinish(made.length > 0)}>{made.length ? '꿈틀 시작하기' : '건너뛰고 시작하기'}</button>
      </Foot>
    </section>
  )
}

/** sprout 로고(후보 B 달력 새싹 — docs/release/brand/out/b/svg/favicon.svg와 같은 모양) */
function SproutMark() {
  return (
    <svg className="onb__mark" width="72" height="72" viewBox="0 0 1024 1024" aria-hidden>
      <defs>
        <linearGradient id="onb-mark-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5CD08F" /><stop offset="1" stopColor="#1F9455" /></linearGradient>
        <mask id="onb-mark-cut" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="1400">
          <rect x="-200" y="-200" width="1400" height="1400" fill="#fff" />
          <rect x="100" y="318" width="800" height="48" fill="#000" />
          <path d="M500 800 L500 615" stroke="#000" strokeWidth="74" strokeLinecap="round" />
          <path d="M492 660 C 400 660 300 605 290 478 C 420 470 496 548 492 660 Z" fill="#000" />
          <path d="M508 618 C 520 500 610 428 725 428 C 728 548 630 624 508 618 Z" fill="#000" />
        </mask>
      </defs>
      <rect width="1024" height="1024" rx="230" fill="url(#onb-mark-bg)" />
      <g transform="translate(115.2 115.2) scale(0.7943)">
        <g mask="url(#onb-mark-cut)" fill="#fff">
          <rect x="130" y="205" width="740" height="690" rx="150" />
          <rect x="290" y="105" width="104" height="200" rx="52" />
          <rect x="606" y="105" width="104" height="200" rx="52" />
        </g>
      </g>
    </svg>
  )
}
