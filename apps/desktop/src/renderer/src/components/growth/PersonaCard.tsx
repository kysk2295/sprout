import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { MASCOT_NAME } from '@sprout/schema/characterArt'
import { QUESTIONS, scoreSurvey, SPECIES, type Species } from '@sprout/schema/growth'
import { personaIdOf, personaOf } from '@sprout/schema/persona'
import { CharacterArt, type CharacterWear } from './CharacterArt'
import './persona.css'

// 50 §8 성장 화면 캐릭터 소개 — HUD 종·단계 글 + 정보 아이콘(한 단추) → 유리 팝오버. 읽기만(50 §8.4)
const CARD_W = 320, GAP = 8, EDGE = 12

/** answers_json → 축 비율(A = 계획·몰입). 기록이 없거나 깨졌으면 null(예전 계정 — 50 §8.2-3 숨김) */
function surveyRatios(json: string | null | undefined) {
  if (!json) return null
  let ans: unknown
  try { ans = JSON.parse(json) } catch { return null }
  if (!ans || typeof ans !== 'object' || Array.isArray(ans)) return null
  const a = ans as Record<string, unknown>
  const has = (axis: 'plan' | 'focus') => QUESTIONS.some((q) => q.axis === axis && !q.tiebreak && (a[q.id] === 'A' || a[q.id] === 'B'))
  if (!has('plan') || !has('focus')) return null
  const s = scoreSurvey(a as Parameters<typeof scoreSurvey>[0])
  return { plan: Math.round(s.plan.ratioA * 100), focus: Math.round(s.focus.ratioA * 100) }
}

export function PersonaTitle({ species, stage, title, name, wear, answersJson, toneStyle, dark, reduced, disabled }: {
  species: Species | null; stage: number; title: string; name: string; wear: CharacterWear
  answersJson?: string | null; toneStyle: CSSProperties; dark: boolean; reduced: boolean; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null)
  const id = useId()

  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus() }, [])
  const shown = !!pos

  // 50 §8.3 단추 아래 8px 왼쪽 맞춤. HUD는 무대 아래쪽이라 아래가 모자라면 위로 뒤집는다(창 안에 가둠)
  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect(), c = card.current
    if (!b || !c) return
    const vh = window.innerHeight, vw = window.innerWidth
    const maxH = Math.max(200, vh - 120)
    const h = Math.min(c.scrollHeight, maxH)
    const left = Math.min(Math.max(EDGE, b.left), vw - CARD_W - EDGE)
    const below = b.bottom + GAP
    const top = below + h <= vh - EDGE ? below : Math.max(EDGE, b.top - GAP - h)
    setPos({ left, top, maxH })
  }, [])
  useLayoutEffect(() => { if (open) place(); else setPos(null) }, [open, place])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true) } }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (card.current?.contains(t) || btn.current?.contains(t)) return
      // 바깥 클릭 — 누른 곳이 포커스를 받을 수 있으면 거기에 두고, 아니면 단추로(누름의 기본 blur 뒤에)
      setOpen(false)
      if (!(t instanceof HTMLElement && t.closest('button, a, input, textarea, select, [tabindex]'))) window.setTimeout(() => btn.current?.focus(), 0)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', place) }
  }, [open, close, place])
  // 포커스는 자리가 정해져 보인 뒤에 카드로(50 §8.3 — 숨긴 채로는 focus가 안 된다)
  useEffect(() => { if (open && shown) card.current?.focus({ preventScroll: true }) }, [open, shown])
  // 옷장·도감이 열리면(HUD가 숨음) 같이 닫는다
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const p = personaOf(personaIdOf(species))
  const ratios = useMemo(() => (species ? surveyRatios(answersJson) : null), [species, answersJson])

  return (
    <>
      <button ref={btn} type="button" className="ttl gs-persona-btn" title="캐릭터 소개" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        tabIndex={disabled ? -1 : 0} onClick={() => (open ? close(true) : setOpen(true))}>
        <span className="tx">{title}</span><Info size={14} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div ref={card} id={id} role="dialog" aria-label="캐릭터 소개" tabIndex={-1}
          className={`gs-persona gs3-glass${dark ? ' is-dark' : ''}${reduced ? ' is-still' : ''}`}
          style={{ ...toneStyle, left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: pos?.maxH, visibility: pos ? undefined : 'hidden' }}>
          <div className="hd">
            <span className="pic"><CharacterArt species={species} stage={stage} size={64} crop="bust" wear={species ? wear : undefined} /></span>
            <div className="who">
              <b>{species ? name : MASCOT_NAME}</b>
              <span>{species ? `${SPECIES[species].name} · ${p.ui.kind}` : `${MASCOT_NAME} · ${p.ui.kind}`}</span>
            </div>
          </div>
          <p className="intro">{p.ui.intro}</p>
          {ratios && (
            <div className="axes">
              <Axis a="계획" b="즉흥" pct={ratios.plan} />
              <Axis a="몰입" b="멀티" pct={ratios.focus} />
            </div>
          )}
          <section><h4>말투</h4><p>{p.ui.toneLabel}</p></section>
          <section><h4>좋아하는 것</h4><div className="chips">{p.likes.map((l) => <span key={l}>{l}</span>)}</div></section>
          {/* 마스코트의 help는 바닥 문구와 같은 글이라 바닥만 둔다 */}
          {species && <section><h4>이렇게 도와줘요</h4><p>{p.ui.help}</p></section>}
          <section>
            <h4>이런 식으로 말해요</h4>
            <div className="talk">
              <div className="me">{p.example.user}</div>
              <div className="it">{p.example.reply}</div>
            </div>
          </section>
          {!species && <p className="foot">씨앗을 깨우면 너를 닮은 친구가 태어나요</p>}
        </div>,
        document.body
      )}
    </>
  )
}

/** 성향 막대 한 줄 — 채운 쪽 = A(계획·몰입) */
function Axis({ a, b, pct }: { a: string; b: string; pct: number }) {
  return (
    <div className="ax">
      <div className="lb">{a} {pct}% · {b} {100 - pct}%</div>
      <div className="track" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
