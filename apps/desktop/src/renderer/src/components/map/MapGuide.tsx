// 34 작업 지도 사용법 — 첫 둘러보기(코치 마크 4단계) · 머리 `?` 사용법 창(빈 상태 한 줄 안내는 2026-10-05 정리로 뺌 — 점검 띠·타임라인 빈 상태·사용법 창과 겹침).
// 기기 기억 sprout.map.guide = { tour: 'new' | 'done', hints: 닫은 안내 id[] }. ✕·Esc로 닫은 둘러보기는 이번 실행 동안만 안 뜬다.
import { HelpCircle, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Popover } from '../Popover'
import { useStored } from './useMapData'
import './guide.css'

export type GuideState = { tour: 'new' | 'done'; hints: string[] }
const INITIAL: GuideState = { tour: 'new', hints: [] }
/** ✕ · Esc = 이번 실행 동안만 닫기(18 §4와 같은 규칙) */
let closedThisRun = false

export type GuideSection = 'what' | 'now' | 'seq' | 'goal' | 'split' | 'views'
export type Recipe = 'split' | 'morning' | 'goal'

export function useMapGuide(loaded: boolean) {
  const [state, setState] = useStored<GuideState>('guide', INITIAL)
  const [tour, setTour] = useState(false)
  const [panel, setPanel] = useState<{ section?: GuideSection; n: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // 처음 열고 자료가 다 읽힌 뒤 0.6초(그래프 노드가 놓일 시간). 다른 창·팝오버·첫 실행 안내가 떠 있으면 기다린다
  useEffect(() => {
    if (!loaded || state.tour === 'done' || closedThisRun || tour) return
    let timer = 0
    const tryOpen = () => {
      if (document.querySelector('.popover,[aria-modal="true"],.onb-scrim')) { timer = window.setTimeout(tryOpen, 800); return }
      setTour(true)
    }
    timer = window.setTimeout(tryOpen, 600)
    return () => window.clearTimeout(timer)
  }, [loaded, state.tour, tour])

  return useMemo(() => ({
    state, btnRef, tour, panel,
    startTour: () => { setPanel(null); setTour(true) },
    closeTour: () => { closedThisRun = true; setTour(false) },
    finishTour: () => { setState((s) => ({ ...s, tour: 'done' })); setTour(false) },
    openPanel: (section?: GuideSection) => setPanel((p) => ({ section, n: (p?.n ?? 0) + 1 })),
    closePanel: () => setPanel(null)
  }), [state, setState, tour, panel])
}
export type MapGuide = ReturnType<typeof useMapGuide>

/** 머리 `?` 버튼(거름틀 왼쪽) */
export function MapGuideButton({ guide }: { guide: MapGuide }) {
  return (
    <span className="map-tip" data-tip="작업 지도 사용법">
      <button ref={guide.btnRef} className={`icon-btn${guide.panel ? ' is-on' : ''}`} aria-label="작업 지도 사용법" aria-expanded={!!guide.panel}
        onClick={() => (guide.panel ? guide.closePanel() : guide.openPanel())}><HelpCircle /></button>
    </span>
  )
}

// ── 그림(직접 그린 단순 선화 — 토큰 색만) ──
const Ill = ({ children, label }: { children: ReactNode; label: string }) => (
  <svg className="mg-ill" viewBox="0 0 64 44" role="img" aria-label={label} fill="none" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const Card = ({ x, y, w = 18, h = 8, on }: { x: number; y: number; w?: number; h?: number; on?: boolean }) => (
  <rect x={x} y={y} width={w} height={h} rx={2} className={on ? 'mg-ill__card is-on' : 'mg-ill__card'} />
)
export const ILLUS: Record<GuideSection, ReactNode> = {
  what: <Ill label="폴더에서 리스트, 할 일로 펼쳐지는 나무">
    <Card x={23} y={3} w={18} /><path className="mg-ill__line" d="M32 11v4M14 15h36M14 15v3M50 15v3" />
    <Card x={5} y={18} /><Card x={41} y={18} />
    <path className="mg-ill__line" d="M14 26v3M50 26v3" /><Card x={7} y={29} w={14} h={6} on /><Card x={43} y={29} w={14} h={6} /><Card x={7} y={37} w={14} h={5} /></Ill>,
  now: <Ill label="지금 할 수 있는 일 띠">
    <rect x={2} y={6} width={60} height={12} rx={3} className="mg-ill__band" />
    <path className="mg-ill__accent-fill" d="M7 8.5l-2 4h2.4l-1 3.2 3.4-4.6H7.4l1.2-2.6z" />
    <Card x={13} y={9} w={14} h={6} on /><Card x={30} y={9} w={14} h={6} on /><Card x={47} y={9} w={12} h={6} />
    <Card x={6} y={26} w={18} on /><Card x={28} y={26} w={14} /><Card x={46} y={26} w={14} /><Card x={6} y={36} w={18} /></Ill>,
  seq: <Ill label="점을 끌어 두 할 일을 잇기">
    <Card x={4} y={6} w={22} h={10} on /><circle cx={15} cy={16} r={2.4} className="mg-ill__accent-fill" />
    <path className="mg-ill__accent" d="M15 18c0 10 16 6 25 12" strokeDasharray="2 2.4" /><path className="mg-ill__accent" d="M37 27.5l3.4 2.6-4 1" />
    <Card x={38} y={30} w={22} h={10} />
    <path className="mg-ill__cursor" d="M47 15l0 8 2-2 1.6 3 1.4-.7-1.6-3 2.8-.2z" /></Ill>,
  goal: <Ill label="목표에 할 일을 연결하고 진행 고리로 보기">
    <circle cx={14} cy={22} r={9} className="mg-ill__ring" /><path className="mg-ill__goal" d="M14 13a9 9 0 0 1 8.6 11.6" /><text x={14} y={25.5} className="mg-ill__emoji">🎯</text>
    <path className="mg-ill__goal" d="M23 18L38 10M23 22h15M23 26l15 8" />
    <Card x={39} y={6} w={20} h={7} on /><Card x={39} y={18.5} w={20} h={7} on /><Card x={39} y={31} w={20} h={7} /></Ill>,
  split: <Ill label="큰 할 일을 AI가 작은 단계로 쪼개기">
    <Card x={3} y={15} w={22} h={14} /><path className="mg-ill__accent-fill" d="M31 17l1.4 3.6L36 22l-3.6 1.4L31 27l-1.4-3.6L26 22l3.6-1.4z" />
    <Card x={41} y={5} w={20} h={7} on /><Card x={41} y={18.5} w={20} h={7} /><Card x={41} y={32} w={20} h={7} />
    <path className="mg-ill__line" d="M51 12v6.5M51 25.5V32" /></Ill>,
  views: <Ill label="그래프, 보드, 타임라인 세 가지 보기">
    <circle cx={10} cy={10} r={3} className="mg-ill__dot" /><circle cx={5} cy={22} r={3} className="mg-ill__dot" /><circle cx={15} cy={22} r={3} className="mg-ill__dot" /><path className="mg-ill__line" d="M9 13l-3 6M11 13l3 6" />
    <rect x={24} y={6} width={6} height={20} rx={1.5} className="mg-ill__card" /><rect x={32} y={6} width={6} height={14} rx={1.5} className="mg-ill__card" />
    <rect x={44} y={8} width={14} height={4} rx={2} className="mg-ill__card is-on" /><rect x={48} y={15} width={12} height={4} rx={2} className="mg-ill__card" /><rect x={46} y={22} width={8} height={4} rx={2} className="mg-ill__card" />
    <text x={11} y={40} className="mg-ill__cap">그래프</text><text x={31} y={40} className="mg-ill__cap">보드</text><text x={52} y={40} className="mg-ill__cap">타임라인</text></Ill>
}

const SECTIONS: { id: GuideSection; title: string; body: ReactNode }[] = [
  { id: 'what', title: '무엇을 보여 주나요', body: <>폴더 › 리스트 › 할 일을 나무처럼 펼쳐 보여 줘요. 리스트 정리는 AI가 맡고, 카드를 다른 리스트로 끌면 사이드바에도 그대로 옮겨져요.</> },
  { id: 'now', title: '지금 할 수 있는 일', body: <>먼저 끝내야 할 일이 남은 할 일은 빼고, 바로 시작할 수 있는 일만 위 띠에 올려요. 기한 지남 → 오늘 마감 → 다음 일을 많이 열어 주는 일 순이에요. 띠의 <kbd>⚡ 지금 할 수 있는 일</kbd>(또는 <kbd>N</kbd>)을 누르면 지도에서도 그 일만 밝아져요. 계획 모드에서 보여요.</> },
  { id: 'seq', title: '순서 선 잇기', body: <>그래프에서 할 일 아래 작은 점을 끌어 다른 할 일에 놓으면 '먼저 해야 함' 선이 생겨요. 앞 일을 끝내면 "이제 … 시작할 수 있어요"라고 알려 드려요. 선을 오른쪽 클릭하면 끊을 수 있어요.</> },
  { id: 'goal', title: '목표로 묶기', body: <><b>점검</b> 모드에서는 이번 주 목표 아래로 할 일이 모여요. 🎯 위 점을 끌어 할 일에 놓거나, 할 일 오른쪽 클릭 › 목표에 연결. 연결한 일을 다 끝내면 달성을 제안해요.</> },
  { id: 'split', title: '✦ AI로 쪼개기', body: <>막막한 큰 일은 오른쪽 클릭 › AI로 쪼개기. 미리 보기에서 단계를 고치고 만들면 하위 할 일과 순서 선이 생겨요. 24시간 안에는 ⋯ › AI 쪼개기 되돌리기로 되돌릴 수 있어요.</> },
  { id: 'views', title: '세 가지 모드와 보기', body: <>모드 <b>계획</b>(무엇부터) · <b>점검</b>(목표 고리 + 이번 주 7칸 + 밀린 일 다음 주로) · <b>정리</b>(옮길 곳 제안). 오늘 목록의 ⚡ 줄, 큰 일 칩, 일요일 저녁 카드, 기본함 카드가 알맞은 모드로 열어 줘요. 보기는 모드가 정해요 — 계획 그래프(오른쪽 위 아이콘으로 보드), 점검 타임라인(배율·할일 정렬 칸은 ⋯), 정리 구조 그래프.</> }
]
const RECIPES: { id: Recipe; title: string; steps: string[]; cta: string }[] = [
  { id: 'split', title: '큰 일이 막막할 때', steps: ['할 일 행의 ✦ 지도에서 쪼개기(또는 오른쪽 클릭 › AI로 쪼개기)', '미리 보기에서 고치고 만들기', '지금 띠에서 첫 단계부터 하나씩'], cta: '계획 모드로' },
  { id: 'morning', title: '매일 아침 3분', steps: ['작업 지도 열기', '⚡ 띠에서 기한 지남·오늘 마감부터', '하나 끝내면 다음 일이 열려요'], cta: '⚡ 켜 보기' },
  { id: 'goal', title: '이번 주 진행 확인', steps: ['머리 모드 › 점검(일요일 저녁엔 오늘 목록 카드로)', '목표 고리·이번 주 7칸 보기', '밀린 일은 다음 주로'], cta: '점검 모드로' }
]

/** 머리 `?`·⋯에서 여는 사용법 창 — 틱틱 팁 글처럼 절마다 작은 그림 + 두세 줄 */
export function MapGuidePanel({ guide, aiOk, onTry }: { guide: MapGuide; aiOk: boolean | null; onTry: (r: Recipe) => void }) {
  const body = useRef<HTMLDivElement>(null)
  const section = guide.panel?.section
  const n = guide.panel?.n
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
          <h2>작업 지도 사용법</h2>
          <p>할 일이 많을 때 무엇부터 할지 보여 주는 곳이에요.</p>
        </div>
        <button className="icon-btn" aria-label="닫기" onClick={guide.closePanel}><X /></button>
      </div>
      <div className="mg-panel__body" ref={body}>
        {SECTIONS.map((s) => (
          <section key={s.id} className="mg-sec" data-section={s.id}>
            {ILLUS[s.id]}
            <div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              {s.id === 'split' && aiOk === false && <p className="mg-sec__off">지금은 AI를 쓸 수 없어요</p>}
            </div>
          </section>
        ))}
        <h3 className="mg-recipes__title">이렇게 쓰면 좋아요</h3>
        {RECIPES.map((r) => (
          <div key={r.id} className="mg-recipe">
            <div className="mg-recipe__head"><b>{r.title}</b>
              <button className="map-btn map-btn--text" onClick={() => { guide.closePanel(); onTry(r.id) }}>{r.cta}</button>
            </div>
            <ol>{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
        ))}
      </div>
      <div className="mg-panel__foot">
        <button className="map-btn map-btn--text" onClick={guide.startTour}>둘러보기 다시 하기</button>
        <span><kbd>N</kbd> 지금 집중</span>
      </div>
    </Popover>
  )
}

// ── 첫 둘러보기 ──
type Step = { targets: string[]; title: string; body: ReactNode; ill?: GuideSection }
const STEPS: Step[] = [
  { targets: ['.map-canvas', '.map-board', '.map__main .tl', '.map-empty'], title: '작업 지도는 할 일의 큰 그림이에요',
    body: <>폴더 › 리스트 › 할 일을 나무처럼 펼쳐 보여 줘요. 리스트는 알아서 정리되니, 여기서는 <b>무엇부터 할지</b>만 보면 돼요.</> },
  { targets: ['.map-now', '.map-head__title .map-mode'], title: '지금 할 수 있는 일',
    body: <>먼저 끝내야 할 일이 남은 할 일은 빼고, 지금 바로 시작할 수 있는 일만 골라 띠에 올려요. <kbd>⚡ 지금 할 수 있는 일</kbd>(또는 <kbd>N</kbd>)을 누르면 지도에서도 그 일만 밝아져요.</> },
  { targets: ['@seq', '.map-canvas', '.map-board', '.map__main .tl'], title: '순서를 이어 주세요', ill: 'seq',
    body: <>할 일 아래 작은 점을 끌어 다른 할 일에 놓으면 '먼저 해야 함' 선이 생겨요. 큰 일은 오른쪽 클릭 › <b>✦ AI로 쪼개기</b>로 단계를 받아요.</> },
  { targets: ['.map-head__title .map-mode'], title: '필요할 때 맞는 모드로 열려요',
    body: <><b>계획</b>은 무엇부터, <b>점검</b>은 한 주 돌아보기, <b>정리</b>는 어디에 둘지예요. 큰 일·주간 점검·기본함 정리 때 앱이 알맞은 모드로 열어 줘요. 모드가 보기도 정해요(계획은 오른쪽 위 아이콘으로 그래프 ⇄ 보드). 사용법은 머리의 <b>?</b> 버튼에서 언제든 다시 볼 수 있어요.</> }
]
type Box = { left: number; top: number; width: number; height: number }
const visible = (r: DOMRect) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
function findTarget(targets: string[]): Box | null {
  for (const sel of targets) {
    let el: Element | null = null
    if (sel === '@seq') {
      // 화면 안에 보이는 할 일 노드 하나(점이 있는 것)
      const canvas = document.querySelector('.map-canvas')?.getBoundingClientRect()
      for (const h of document.querySelectorAll('.map-handle--seq')) {
        const node = h.closest('.react-flow__node') ?? h
        const r = node.getBoundingClientRect()
        if (canvas && visible(r) && r.top > canvas.top + 8 && r.bottom < canvas.bottom - 8 && r.left > canvas.left && r.right < canvas.right) { el = node; break }
      }
    } else el = document.querySelector(sel)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (visible(r)) return { left: r.left, top: r.top, width: r.width, height: r.height }
  }
  return null
}
const same = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5)

export function MapTour({ guide }: { guide: MapGuide }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number }>()
  const card = useRef<HTMLDivElement>(null)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  useEffect(() => { if (guide.tour) setI(0) }, [guide.tour])
  // 가리키는 곳을 다시 잰다(창 크기·지도 이동·노드 배치가 바뀌어도 따라감)
  useEffect(() => {
    if (!guide.tour) return
    const measure = () => setBox((b) => { const n = findTarget(step.targets); return same(b, n) ? b : n })
    measure()
    const t = window.setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => { window.clearInterval(t); window.removeEventListener('resize', measure) }
  }, [guide.tour, step])
  useLayoutEffect(() => {
    const c = card.current
    if (!c) return
    const w = c.offsetWidth, h = c.offsetHeight, W = window.innerWidth, H = window.innerHeight, gap = 14
    let left: number, top: number
    if (!box) { left = (W - w) / 2; top = (H - h) / 2 }
    else {
      left = box.left + box.width / 2 - w / 2
      if (box.top + box.height + gap + h < H - 8) top = box.top + box.height + gap
      else if (box.top - gap - h > 8) top = box.top - gap - h
      else top = box.top + box.height - h - 28 // 큰 영역(지도 본문)은 안쪽 아래 — 노드는 보통 위쪽에 놓인다
    }
    setCardPos({ left: Math.max(8, Math.min(left, W - w - 8)), top: Math.max(8, Math.min(top, H - h - 8)) })
  }, [box, i])

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

  if (!guide.tour) return null
  const pad = 6
  return createPortal(
    <div className="mg-tour" onMouseDown={(e) => e.preventDefault()}>
      {box
        ? <div className="mg-tour__hole" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
        : <div className="mg-tour__scrim" />}
      <div ref={card} className="mg-tour__card" key={i} role="dialog" aria-modal="true" aria-label={`작업 지도 둘러보기 — ${STEPS.length}단계 중 ${i + 1}단계`}
        style={{ left: cardPos?.left ?? -9999, top: cardPos?.top ?? -9999 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mg-tour__top">
          <ol className="mg-tour__dots" aria-hidden>{STEPS.map((_, k) => <li key={k} className={k === i ? 'is-on' : k < i ? 'is-past' : ''} />)}</ol>
          <span className="mg-tour__count">{i + 1} / {STEPS.length}</span>
          <button className="icon-btn mg-tour__close" aria-label="둘러보기 닫기" onClick={guide.closeTour}><X /></button>
        </div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        {step.ill && <div className="mg-tour__ill">{ILLUS[step.ill]}</div>}
        <div className="mg-tour__foot">
          <button className="mg-tour__never" onClick={guide.finishTour}>다시 보지 않기</button>
          {i > 0 && <button className="map-btn" onClick={prev}>이전</button>}
          <button className="map-btn map-btn--primary" data-autofocus onClick={next}>{last ? '시작하기' : '다음'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
