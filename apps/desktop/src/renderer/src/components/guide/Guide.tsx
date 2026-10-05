// 37 탭 사용법 공통 — 첫 둘러보기(코치 마크 3단계까지) · 머리 `?` 사용법 창 · 레일 도움말로 열기.
// 탭은 useGuide(tab, { ready })로 상태를 얻고, 머리에 <GuideButton>, 아무 곳에 <GuidePanel>·<GuideTour>를 둔다.
// 규칙(34 §2와 같음): 그 탭 자료가 다 읽힌 뒤 0.6초에 한 번. 다른 창·팝오버·첫 실행 안내·다른 둘러보기가 있으면 기다린다.
// ✕ · Esc · 막 누르기 = 이번 실행 동안만 닫기, `다시 보지 않기` · 마지막 `시작하기` = 끝(기기 기억).
import { HelpCircle, X } from 'lucide-react'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Popover } from '../Popover'
import {
  BLOCKERS, INTERRUPTERS, OPEN_GUIDE, OPEN_SHORTCUTS, claimTour, loadSeen, markClosed, pickTarget, placeTourCard, releaseTour, saveSeen, shouldAutoTour, wasClosed,
  activeTour, type GuideTab, type OpenGuideDetail, type Seen, type TourBox
} from './core'
import { GUIDES } from './content'
import { ILLUS } from './illustrations'
import './guide.css'

/** `**굵게**` · `` `키` `` 만 아는 작은 글 그리기 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b>
    : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <kbd key={i}>{p.slice(1, -1)}</kbd> : <Fragment key={i}>{p}</Fragment>)}</>
}

type Options = {
  /** 그 탭 자료가 다 읽혔나(빈 화면에 둘러보기를 띄우지 않게) */ ready: boolean
  /** 탭별 추가 조건(작업 지도 = 계획 화면일 때만). 거짓이 되면 떠 있던 둘러보기를 조용히 접는다 */ allowed?: boolean
  /** `둘러보기 다시 하기` 전에 가리킬 화면으로(작업 지도 = 프로젝트 화면) */ beforeTour?: () => void
}

export function useGuide(tab: GuideTab, { ready, allowed = true, beforeTour }: Options) {
  const [seen, setSeenState] = useState<Seen>(() => loadSeen(tab))
  const [tour, setTour] = useState(false)
  const [panel, setPanel] = useState<{ section?: string; n: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const before = useRef(beforeTour)
  before.current = beforeTour

  // 처음 열고 자료가 다 읽힌 뒤 0.6초. 다른 창·팝오버·첫 실행 안내·다른 둘러보기가 있으면 0.8초마다 다시 본다
  useEffect(() => {
    if (!shouldAutoTour({ ready, done: seen.tour === 'done', closedThisRun: wasClosed(tab), open: tour, allowed })) return
    let timer = 0
    const tryOpen = () => {
      if (document.querySelector(BLOCKERS) || (activeTour() && activeTour() !== tab)) { timer = window.setTimeout(tryOpen, 800); return }
      setTour(true) // 자리(claimTour)는 아래 효과가 잡는다
    }
    timer = window.setTimeout(tryOpen, 600)
    return () => window.clearTimeout(timer)
  }, [tab, ready, seen.tour, tour, allowed])
  // 한 번에 하나 — 떠 있는 동안 자리를 잡고, 닫히거나 탭을 떠나면 놓는다
  useEffect(() => {
    if (!tour) return
    claimTour(tab)
    return () => releaseTour(tab)
  }, [tab, tour])
  useEffect(() => { if (tour && !allowed) setTour(false) }, [tour, allowed])

  // 레일 도움말 · ⌘K → 지금 탭 사용법 창(머리 `?`가 화면에 있을 때만)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<OpenGuideDetail>).detail
      if (d?.tab !== tab || !btnRef.current?.isConnected) return
      d.handled = true
      setTour(false)
      setPanel((p) => ({ n: (p?.n ?? 0) + 1 }))
    }
    window.addEventListener(OPEN_GUIDE, on)
    return () => window.removeEventListener(OPEN_GUIDE, on)
  }, [tab])

  const finish = useCallback(() => { const s: Seen = { tour: 'done' }; saveSeen(tab, s); setSeenState(s); setTour(false) }, [tab])
  return useMemo(() => ({
    tab, content: GUIDES[tab], seen, btnRef, tour, panel,
    startTour: () => { setPanel(null); before.current?.(); setTour(true) },
    closeTour: () => { markClosed(tab); setTour(false) },
    /** 다른 창이 끼어들면 조용히 접는다 — 닫힌 뒤 다시 뜬다 */
    suspendTour: () => setTour(false),
    finishTour: finish,
    openPanel: (section?: string) => { setTour(false); setPanel((p) => ({ section, n: (p?.n ?? 0) + 1 })) },
    closePanel: () => setPanel(null)
  }), [tab, seen, tour, panel, finish])
}
export type Guide = ReturnType<typeof useGuide>

/** 머리 `?` 버튼(⋯ 왼쪽, 모든 탭 같은 자리). tip = 감싸는 쪽이 툴팁을 그리면 false */
export function GuideButton({ guide, tip = true }: { guide: Guide; tip?: boolean }) {
  const label = guide.content.title
  return (
    <button ref={guide.btnRef} className={`icon-btn guide-btn${guide.panel ? ' is-on' : ''}`} aria-label={label} title={tip ? label : undefined} aria-expanded={!!guide.panel} data-guide={guide.tab}
      onClick={() => (guide.panel ? guide.closePanel() : guide.openPanel())}><HelpCircle /></button>
  )
}

/** 사용법 창 — 틱틱 팁 글처럼 절마다 작은 그림 + 두세 줄, 아래 "이렇게 쓰면 좋아요" 해 보기 */
export function GuidePanel({ guide, onTry, aiOk = null }: { guide: Guide; onTry: (recipe: string) => void; aiOk?: boolean | null }) {
  const body = useRef<HTMLDivElement>(null)
  const section = guide.panel?.section
  const n = guide.panel?.n
  const c = guide.content
  useEffect(() => {
    if (!section) return
    const el = body.current?.querySelector<HTMLElement>(`[data-section="${section}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    el.classList.add('is-flash')
    const t = window.setTimeout(() => el.classList.remove('is-flash'), 1200)
    return () => window.clearTimeout(t)
  }, [section, n])
  if (!guide.panel) return null
  return (
    <Popover anchor={guide.btnRef.current} align="end" width={380} onClose={guide.closePanel} className="mg-panel">
      <div className="mg-panel__head">
        <div>
          <h2>{c.title}</h2>
          <p>{c.lead}</p>
        </div>
        <button className="icon-btn" aria-label="닫기" onClick={guide.closePanel}><X /></button>
      </div>
      <div className="mg-panel__body" ref={body}>
        {c.sections.map((s) => (
          <section key={s.id} className="mg-sec" data-section={s.id}>
            {ILLUS[s.ill]}
            <div>
              <h3>{s.title}</h3>
              <p><Rich text={s.body} /></p>
              {s.aiOff && aiOk === false && <p className="mg-sec__off">{s.aiOff}</p>}
            </div>
          </section>
        ))}
        <h3 className="mg-recipes__title">이렇게 쓰면 좋아요</h3>
        {c.recipes.map((r) => (
          <div key={r.id} className="mg-recipe" data-recipe={r.id}>
            <div className="mg-recipe__head"><b>{r.title}</b>
              <button className="mg-btn mg-btn--text" onClick={() => { guide.closePanel(); onTry(r.id) }}>{r.cta}</button>
            </div>
            <ol>{r.steps.map((s) => <li key={s}><Rich text={s} /></li>)}</ol>
          </div>
        ))}
      </div>
      <div className="mg-panel__foot">
        <button className="mg-btn mg-btn--text" onClick={guide.startTour}>둘러보기 다시 하기</button>
        {c.foot ? <span><Rich text={c.foot} /></span>
          : <button className="mg-panel__foot-btn" onClick={() => { guide.closePanel(); window.dispatchEvent(new Event(OPEN_SHORTCUTS)) }}><kbd>?</kbd> 단축키 모음</button>}
      </div>
    </Popover>
  )
}

const domQuery = (sel: string): TourBox[] => {
  try {
    return [...document.querySelectorAll(sel)].filter((el) => !el.closest('.mg-tour')).map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    })
  } catch { return [] }
}
const same = (a: TourBox | null, b: TourBox | null) => a === b || (!!a && !!b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5)

/** 첫 둘러보기 — 막 + 가리키는 곳 구멍 + 카드. 가리킬 곳이 없으면 카드는 화면 가운데(막만 남지 않음) */
export function GuideTour({ guide }: { guide: Guide }) {
  const steps = guide.content.steps
  const [i, setI] = useState(0)
  const [box, setBox] = useState<TourBox | null>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number }>()
  const card = useRef<HTMLDivElement>(null)
  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1

  useEffect(() => { if (guide.tour) setI(0) }, [guide.tour])
  // 가리키는 곳을 다시 잰다(창 크기·화면 움직임을 따라감). 다른 창이 끼어들면 조용히 접는다
  useEffect(() => {
    if (!guide.tour) return
    const measure = () => {
      if (document.querySelector(INTERRUPTERS)) { guide.suspendTour(); return }
      const n = pickTarget(step.targets, domQuery, { W: window.innerWidth, H: window.innerHeight })
      setBox((b) => (same(b, n) ? b : n))
    }
    measure()
    const t = window.setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => { window.clearInterval(t); window.removeEventListener('resize', measure) }
  }, [guide, step])
  // guide.tour도 의존 — 대상이 처음부터 없으면(box null 그대로) 카드가 자리를 못 잡던 버그(34, 2026-10-05)
  useLayoutEffect(() => {
    const c = card.current
    if (!c) return
    setCardPos(placeTourCard(box, { w: c.offsetWidth, h: c.offsetHeight }, { W: window.innerWidth, H: window.innerHeight }))
  }, [box, i, guide.tour])
  useEffect(() => { if (!guide.tour) setCardPos(undefined) }, [guide.tour])

  const next = useCallback(() => { if (last) guide.finishTour(); else setI((x) => x + 1) }, [last, guide])
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), [])
  useEffect(() => {
    if (!guide.tour) return
    card.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); guide.closeTour() }
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !(e.target as HTMLElement).closest?.('button:not([data-autofocus])'))) { e.preventDefault(); e.stopImmediatePropagation(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); prev() }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [guide, next, prev, i])

  if (!guide.tour || !step) return null
  const pad = 6
  const total = steps.length
  return createPortal(
    <div className="mg-tour" data-guide={guide.tab} onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { if (!card.current?.contains(e.target as Node)) guide.closeTour() }}>
      {box
        ? <div className="mg-tour__hole" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
        : <div className="mg-tour__scrim" />}
      <div ref={card} className="mg-tour__card" key={i} role="dialog" aria-modal="true" aria-label={`${guide.content.title.replace(/ 사용법$/, '')} 둘러보기 — ${total}단계 중 ${i + 1}단계`}
        style={cardPos ? { left: cardPos.left, top: cardPos.top } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mg-tour__top">
          <ol className="mg-tour__dots" aria-hidden>{steps.map((_, k) => <li key={k} className={k === i ? 'is-on' : k < i ? 'is-past' : ''} />)}</ol>
          <span className="mg-tour__count">{i + 1} / {total}</span>
          <button className="icon-btn mg-tour__close" aria-label="둘러보기 닫기" onClick={guide.closeTour}><X /></button>
        </div>
        <h2>{step.title}</h2>
        <p><Rich text={step.body} /></p>
        {step.ill && <div className="mg-tour__ill">{ILLUS[step.ill]}</div>}
        <div className="mg-tour__foot">
          <button className="mg-tour__never" onClick={guide.finishTour}>다시 보지 않기</button>
          {i > 0 && <button className="mg-btn" onClick={prev}>이전</button>}
          <button className="mg-btn mg-btn--primary" data-autofocus onClick={next}>{last ? '시작하기' : '다음'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** 한 탭에 필요한 것 셋을 한 번에(머리 `?`는 탭이 직접 둔다) */
export function GuideLayer({ guide, onTry, aiOk }: { guide: Guide; onTry: (recipe: string) => void; aiOk?: boolean | null }): ReactNode {
  return <><GuidePanel guide={guide} onTry={onTry} aiOk={aiOk} /><GuideTour guide={guide} /></>
}
