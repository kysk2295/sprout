// 49 §5 만들기 흐름(데스크톱) — 시안 character-v3.html A를 가운데 카드(폭 440 · 높이 720)로.
// 0 시작 → 1 씨앗 고르기(끌기 18px당 한 컷 · ←/→) → 2 성향 카드 8장(1·2 키) → 3 세 번 두드려 깨우기 → 4 이름 → 5 첫 할 일 → 정원.
// 카드 바탕 = 3D 장면(라이트 새벽 · 다크 밤). 움직임은 transform · opacity만, 움직임 줄이기 = 페이드만.
// 저장: 씨앗 = characters.look_json.seed(setSeed — 기존 모습에 합침), 종·답·이름 = assignCharacter(옛 조사와 같은 칸),
// 첫 할 일 = 보통 할 일(createTask) + 보통 완료 경로(useTaskActions.complete → XP 10 §6 그대로).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { headTop3d, SEED_COUNT, SEED_FRAMES, SEED_NAMES, seedCrackKey, seedTurnKey } from '@sprout/schema/characterArt'
import { QUESTIONS, scoreSurvey, SPECIES, speciesFrom, XP, type Pick2, type Species } from '@sprout/schema/growth'
import { iGa } from '@sprout/schema/josa'
import { setSeed } from '@sprout/schema/wardrobe'
import { assignCharacter, useMotionReduced } from '../../data/growth'
import { saveLook, useRaise } from '../../data/raise'
import { createTask, taskListId } from '../../data/mutations'
import { OPEN_SCREEN } from '../../data/mapMoments'
import { useTaskActions } from '../../lib/taskActions'
import { dayKey } from '../../lib/dates'
import { artUrl } from './art3dUrls'
import { ArtImage, CharacterArt } from './CharacterArt'
import { onPerch, SceneBackdrop } from './Scene3D'
import './make.css'

export type MakeResult = { firstTask?: boolean; done?: boolean }

const MAIN = QUESTIONS.filter((q) => !q.tiebreak)
const PET: Record<Species, string> = { snail: '도토', bee: '꿀이', worm: '꼼지', frog: '퐁' }
const TASKS = ['물 한 잔 마시기', '책상 5분 정리', '내일 일정 보기']
const W = 440, H = 720
/** 이름 + 와/과 */
const wa = (w: string) => `${w}${iGa(w).slice(w.length) === '이' ? '과' : '와'}`

/** 구운 씨앗 그림 이름 — 아직 없는 컷(굽는 중)은 같은 씨앗의 첫 컷 → 흙빛 씨앗으로 */
export function seedKeyOf(seed: number, turn = 0, cracks = 0): string {
  const want = cracks > 0 ? seedCrackKey(seed, cracks) : seedTurnKey(seed, turn)
  if (artUrl(want, 320)) return want
  if (cracks > 0 && artUrl(seedCrackKey(0, cracks), 320)) return seedCrackKey(0, cracks)
  if (artUrl(seedTurnKey(seed, 0), 320)) return seedTurnKey(seed, 0)
  return seedTurnKey(0, 0)
}
export function SeedPic({ seed, turn = 0, cracks = 0, size, className }: { seed: number; turn?: number; cracks?: number; size: number; className?: string }) {
  return <ArtImage artKey={seedKeyOf(seed, turn, cracks)} size={size} px={320} className={className} />
}

/** 문서 테마가 다크인지(data-theme) */
export function useDocDark(): boolean {
  const read = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return dark
}

type Step = 0 | 1 | 2 | 3 | 4 | 5

export function MakeFlow({ onClose }: { onClose: (r?: MakeResult) => void }) {
  const reduced = useMotionReduced()
  const dark = useDocDark()
  const raise = useRaise()
  const actions = useTaskActions()
  const [step, setStep] = useState<Step>(0)
  const [seed, setSeedNo] = useState(() => raise.look.seed ?? 0)
  const [turn, setTurn] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Pick2>>({})
  const [qi, setQi] = useState(0)
  const [qAnim, setQAnim] = useState<'' | 'in' | 'out-l' | 'out-r'>('')
  const [taps, setTaps] = useState(0)
  const [born, setBorn] = useState(false)
  const [typeShown, setTypeShown] = useState(false)
  const [name, setName] = useState('')
  const [happy, setHappy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [task, setTask] = useState<{ id: string; title: string; done: boolean } | null>(null)
  const [own, setOwn] = useState('')
  const [scale, setScale] = useState(1)
  const timers = useRef<number[]>([])
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }, [])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  // 작은 창: 카드를 통째로 줄인다(배치는 440 × 720 그대로)
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 32) / H, (window.innerWidth - 32) / W))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  // 씨앗 48컷 미리 올림 — 돌릴 때 끊기지 않게
  useEffect(() => {
    for (let s = 0; s < SEED_COUNT; s++) for (let t = 0; t < SEED_FRAMES; t++) { const u = artUrl(seedTurnKey(s, t), 320); if (u) new Image().src = u }
    for (const c of [1, 2]) { const u = artUrl(seedCrackKey(seed, c), 320); if (u) new Image().src = u }
  }, [seed])

  // ── 성향 ──
  const score = useMemo(() => scoreSurvey(answers), [answers])
  const queue = useMemo(() => {
    const done = MAIN.every((q) => answers[q.id])
    return [...MAIN, ...(done ? QUESTIONS.filter((q) => q.tiebreak && score[q.axis].tie) : [])]
  }, [answers, score])
  const species: Species = speciesFrom(score) ?? 'snail'
  const typeCode = `${score.plan.leanA ? 'plan' : 'flow'}-${score.focus.leanA ? 'deep' : 'multi'}`

  // ── 움직임 도우미 ──
  const anim = (el: Element | null | undefined, frames: Keyframe[], o: KeyframeAnimationOptions) => { if (!reduced && el) el.animate(frames, o) }
  const hopEl = useRef<HTMLDivElement>(null)
  const hop = () => anim(hopEl.current, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.08,.9)', offset: 0.18 }, { transform: 'translateY(-22px) scale(.95,1.06)', offset: 0.45 }, { transform: 'translateY(0) scale(1.06,.94)', offset: 0.7 }, { transform: 'scale(1,1)' }], { duration: 520, easing: 'ease-out' })

  const go = (n: Step) => { setError(''); setStep(n) }
  const primary = useRef<HTMLElement | null>(null)
  const setPrimary = (el: HTMLElement | null) => { if (el) primary.current = el }
  useEffect(() => { const t = window.setTimeout(() => primary.current?.focus({ preventScroll: true }), 30); return () => window.clearTimeout(t) }, [step, born, task])

  // 1 씨앗: 들어오면 한 바퀴 저절로 돌아 "돌릴 수 있다"를 알려 준다
  const spun = useRef(false)
  useEffect(() => {
    if (step !== 1 || spun.current || reduced) return
    spun.current = true
    let n = 0
    const iv = window.setInterval(() => { setTurn((t) => (t + 1) % SEED_FRAMES); if (++n >= SEED_FRAMES) window.clearInterval(iv) }, 70)
    return () => window.clearInterval(iv)
  }, [step, reduced])
  const seedEl = useRef<HTMLElement | null>(null)
  const setSeedEl = (el: HTMLElement | null) => { if (el) seedEl.current = el }
  const drag = useRef<{ x0: number; t0: number } | null>(null)
  const pickSeed = (i: number) => { setSeedNo(i); setTurn(0); anim(seedEl.current, [{ transform: 'scale(.9)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' }) }
  const chooseSeed = () => { void saveLook(setSeed(raise.look, seed)).catch(() => undefined); setAnswers({}); setQi(0); setQAnim(''); go(2) }

  // 2 카드
  const pick = (p: Pick2) => {
    const q = queue[qi]
    if (!q || qAnim === 'out-l' || qAnim === 'out-r') return
    const next = { ...answers, [q.id]: p }
    setAnswers(next)
    setQAnim(p === 'A' ? 'out-l' : 'out-r')
    later(() => {
      const s = scoreSurvey(next)
      if (MAIN.every((x) => next[x.id]) && speciesFrom(s)) { setTaps(0); setBorn(false); setTypeShown(false); go(3); return }
      setQi((i) => i + 1)
      setQAnim('in')
      requestAnimationFrame(() => requestAnimationFrame(() => setQAnim('')))
    }, reduced ? 0 : 300)
  }

  // 3 부화: 1 = 흔들 + 금 한 줄 · 2 = 금 두 줄 · 3 = 빛 → 아기 → 유형 카드
  const flash = useRef<HTMLDivElement>(null)
  const halo = useRef<HTMLDivElement>(null)
  const rings = useRef<(HTMLDivElement | null)[]>([])
  const babyEl = useRef<HTMLDivElement>(null)
  const hatch = () => {
    setTaps(3)
    anim(flash.current, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' })
    later(() => {
      setBorn(true)
      requestAnimationFrame(() => {
        anim(babyEl.current, [{ transform: 'scale(.15)', opacity: 0 }, { transform: 'scale(1.16,.86)', opacity: 1, offset: 0.45 }, { transform: 'scale(.93,1.08)', offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 640, easing: 'cubic-bezier(.2,.8,.2,1)' })
        anim(halo.current, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)', offset: 0.4 }, { opacity: 0.55, transform: 'scale(1.05)' }], { duration: 1400, fill: 'forwards' })
        rings.current.forEach((r, i) => anim(r, [{ opacity: 0.9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(2.8)' }], { duration: 760, delay: i * 120, easing: 'ease-out' }))
      })
      later(() => setTypeShown(true), reduced ? 0 : 560)
    }, reduced ? 0 : 320)
  }
  const tap = () => {
    if (taps >= 3) return
    anim(seedEl.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-out' })
    if (taps < 2) { setTaps(taps + 1); return }
    hatch()
  }

  // 4 이름
  const happyFor = (ms: number) => { setHappy(true); later(() => setHappy(false), ms) }
  const toName = () => { setName((n) => n || PET[species]); go(4) }
  const saveName = async () => {
    const n = name.trim()
    if (!n || saving) return
    setSaving(true)
    try {
      await assignCharacter(species, typeCode, answers, n)
      await saveLook(setSeed(raise.look, seed))
      go(5)
    } catch { setError('저장하지 못했어요. 잠시 뒤 다시 시도하세요.') } finally { setSaving(false) }
  }

  // 5 첫 할 일
  const xpEl = useRef<HTMLDivElement>(null)
  const makeTask = async (title: string) => {
    const t = title.trim()
    if (!t || task) return
    try {
      const id = await createTask({ title: t, list_id: await taskListId(null), due_at: dayKey() })
      setTask({ id, title: t, done: false })
    } catch { setError('할 일을 만들지 못했어요. 잠시 뒤 다시 시도하세요.') }
  }
  const doneTask = () => {
    if (!task || task.done) return
    setTask({ ...task, done: true })
    void actions.complete([task.id])
    happyFor(2400)
    hop()
    anim(xpEl.current, [{ opacity: 0, transform: 'translateY(0)' }, { opacity: 1, transform: 'translateY(-10px)', offset: 0.25 }, { opacity: 0, transform: 'translateY(-34px)' }], { duration: 1000, easing: 'ease-out' })
  }
  const finish = () => {
    onClose({ firstTask: !!task?.done, done: true })
    // 성장 탭으로(App이 OPEN_SCREEN 'review'를 받으면 성장 탭으로 옮긴다 — 점검 요청은 남기지 않았으므로 점검은 열리지 않는다)
    window.dispatchEvent(new CustomEvent(OPEN_SCREEN, { detail: 'review' }))
  }

  // ── 키보드: Esc = 나중에 · ←/→ = 씨앗 돌리기(씨앗 칸에 있으면 씨앗 바꾸기) · 1·2 = 선택지 ──
  const latest = useRef({ step, pick, onClose })
  latest.current = { step, pick, onClose }
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const { step: s, pick: p, onClose: close } = latest.current
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      const inField = (e.target as HTMLElement | null)?.tagName === 'INPUT'
      if (s === 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const d = e.key === 'ArrowRight' ? 1 : -1
        if ((e.target as HTMLElement | null)?.closest?.('.mk-pick')) { e.preventDefault(); setSeedNo((x) => { const n = (x + d + SEED_COUNT) % SEED_COUNT; window.setTimeout(() => (document.querySelector(`.mk-pick button[data-i="${n}"]`) as HTMLElement | null)?.focus(), 0); return n }); setTurn(0); return }
        e.preventDefault(); setTurn((t) => (t + d + SEED_FRAMES) % SEED_FRAMES); return
      }
      if (s === 2 && !inField && (e.key === '1' || e.key === '2')) { e.preventDefault(); p(e.key === '1' ? 'A' : 'B') }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  const q = queue[qi]
  const sceneKey = dark ? 'scene-dusk' : 'scene-dawn'
  const sub = taps === 0 ? '세 번이면 깨어나요.' : taps === 1 ? '조금만 더…' : '거의 다 왔어요!'
  const wob = `${Math.max(0.5, 1.6 - qi * 0.14)}s`
  const babyMood = happy || (born && step === 3) ? 'happy' : 'default'

  return createPortal(
    <div className="modal-scrim mk-scrim">
      <div className={`mk${dark ? ' is-dark' : ''}${reduced ? ' is-reduced' : ''}`} style={{ transform: scale < 1 ? `scale(${scale})` : undefined }} role="dialog" aria-modal="true" aria-label="친구 만들기">
        <SceneBackdrop sceneKey={sceneKey} align="center" className="mk-bg">
          {(L) => {
            const at = (size: number, lift = 0): CSSProperties => { const p = onPerch(L, size); return { left: p.left, top: p.top - lift, width: size, height: size } }
            return (
              <>
                <ol className="mk-dots" aria-label={`${step + 1}/6단계`}>{[0, 1, 2, 3, 4, 5].map((i) => <li key={i} className={i === step ? 'is-on' : ''} />)}</ol>
                {step <= 2 && <button className="mk-later" onClick={() => onClose()}>나중에</button>}

                {step === 0 && (
                  <div className="mk-scr" key="s0">
                    <div className="mk-copy"><p className="mk-h">할 일을 끝낼 때마다<br />함께 자라는 친구</p><p className="mk-sub">씨앗 하나에서 시작해요. 무엇이 나올지는 당신이 일하는 방식이 정해요.</p></div>
                    <div className="mk-seed mk-bob" style={at(220, 30)} aria-hidden><span className="mk-shadow" /><SeedPic seed={seed} size={220} /></div>
                    <div className="mk-bottom"><button ref={setPrimary} className="mk-btn" onClick={() => go(1)}>씨앗 고르기</button></div>
                  </div>
                )}

                {step === 1 && (
                  <div className="mk-scr" key="s1">
                    <div className="mk-copy"><p className="mk-h">마음이 가는<br />씨앗을 골라요</p><p className="mk-sub">좌우로 끌어서 돌려 보세요. 껍질 무늬는 도감에 남아요.</p></div>
                    <div ref={setSeedEl} className="mk-seed is-drag" style={at(220, 46)} aria-hidden
                      onPointerDown={(e) => { drag.current = { x0: e.clientX, t0: turn }; e.currentTarget.setPointerCapture(e.pointerId) }}
                      onPointerMove={(e) => { const d = drag.current; if (!d) return; const k = Math.round((d.x0 - e.clientX) / (18 * scale)); setTurn((((d.t0 + k) % SEED_FRAMES) + SEED_FRAMES) % SEED_FRAMES) }}
                      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
                      <span className="mk-shadow" /><SeedPic seed={seed} turn={turn} size={220} />
                    </div>
                    <div className="mk-bottom">
                      <div className="mk-seedname">{SEED_NAMES[seed].name}<small>{SEED_NAMES[seed].line}</small></div>
                      <div className="mk-pick" role="radiogroup" aria-label="씨앗">
                        {SEED_NAMES.map((s, i) => (
                          <button key={i} data-i={i} role="radio" aria-checked={i === seed} tabIndex={i === seed ? 0 : -1} className={`mk-glass${i === seed ? ' is-on' : ''}`}
                            aria-label={`${s.name}, ${SEED_COUNT}개 중 ${i + 1}번째, 고르기`} onClick={() => pickSeed(i)}><SeedPic seed={i} size={46} /></button>
                        ))}
                      </div>
                      <button ref={setPrimary} className="mk-btn" onClick={chooseSeed}>이 씨앗으로</button>
                    </div>
                  </div>
                )}

                {step === 2 && q && (
                  <div className="mk-scr" key="s2">
                    <div className="mk-copy"><p className="mk-h is-sm">어떤 친구가 나올까요</p></div>
                    <div className="mk-mini" style={{ animationDuration: wob }} aria-hidden><SeedPic seed={seed} size={110} /></div>
                    <div className={`mk-q mk-glass${qAnim ? ` ${qAnim}` : ''}`} key={q.id}>
                      <div className="n">{qi + 1} / {queue.length}</div>
                      <h3>{q.text}</h3>
                      <button ref={setPrimary} className="mk-opt" onClick={() => pick('A')}><b>A</b><span>{q.a}</span><kbd>1</kbd></button>
                      <button className="mk-opt" onClick={() => pick('B')}><b>B</b><span>{q.b}</span><kbd>2</kbd></button>
                    </div>
                    {qi > 0 && <div className="mk-bottom"><button className="mk-btn ghost" onClick={() => setQi(qi - 1)}>‹ 이전</button></div>}
                  </div>
                )}

                {step === 3 && (
                  <div className="mk-scr" key="s3">
                    <div className={`mk-copy${taps >= 3 ? ' is-gone' : ''}`}><p className="mk-h">씨앗을 톡톡<br />두드려 주세요</p><p className="mk-sub" aria-live="polite">{sub}</p></div>
                    <div ref={halo} className="mk-halo" style={at(340, 40)} />
                    {[0, 1].map((i) => <div key={i} ref={(el) => { rings.current[i] = el }} className="mk-ring" style={at(150, 70)} />)}
                    {!born && (
                      <button ref={taps < 3 ? setPrimary : undefined} className={`mk-seed is-tap${taps >= 3 ? ' is-out' : ''}`} style={at(220, 46)} aria-label={`씨앗 두드리기, ${taps}/3`} onClick={tap}>
                        <span ref={setSeedEl} className="mk-seed-in"><span className="mk-shadow" /><SeedPic seed={seed} cracks={Math.min(2, taps)} size={220} /></span>
                      </button>
                    )}
                    {!born && taps < 3 && <button className="mk-sr" onClick={hatch}>씨앗 깨우기</button>}
                    {born && <div ref={babyEl} className="mk-ch" style={at(250)}><CharacterArt species={species} stage={1} size={250} seed={seed} mood={babyMood} wear={{ seed }} label={`아기 ${SPECIES[species].name}`} /></div>}
                    <div className={`mk-type mk-glass${typeShown ? '' : ' is-hide'}`} aria-live="polite">
                      {typeShown && (
                        <>
                          <div className="k">당신은</div><h3>{SPECIES[species].name}형</h3><div className="mk-sub">{SPECIES[species].line}</div>
                          <Axis left="계획" right="즉흥" ratio={score.plan.ratioA} />
                          <Axis left="몰입" right="멀티" ratio={score.focus.ratioA} />
                        </>
                      )}
                    </div>
                    {typeShown && <div className="mk-bottom"><button ref={setPrimary} className="mk-btn" onClick={toName}>이름 지어 주기</button></div>}
                  </div>
                )}

                {step === 4 && (
                  <div className="mk-scr" key="s4">
                    <div className="mk-copy"><p className="mk-h">이름을 지어 줄까요?</p><p className="mk-sub">나중에 성장 화면에서 바꿀 수 있어요.</p></div>
                    <div ref={hopEl} className="mk-ch" style={at(220, 70)}><CharacterArt species={species} stage={1} size={220} seed={seed} mood={happy ? 'happy' : 'default'} motion="idle" wear={{ seed }} /></div>
                    <div className="mk-bottom">
                      <label className="mk-name mk-glass">
                        <input ref={setPrimary} value={name} maxLength={10} aria-label="이름"
                          onChange={(e) => { setName(e.target.value); happyFor(900) }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void saveName() }} />
                        <span>{name.length}/10</span>
                      </label>
                      <div className="mk-chips">{[PET[species], '몽글', '새싹'].map((n) => <button key={n} className="mk-glass" onClick={() => { setName(n); happyFor(1200); hop() }}>{n}</button>)}</div>
                      {error && <p className="mk-err" role="alert">{error}</p>}
                      <button className="mk-btn" disabled={!name.trim() || saving} onClick={() => void saveName()}>좋아요</button>
                    </div>
                  </div>
                )}

                {step === 5 && (() => {
                  const top = at(170, 70), head = headTop3d(species, 1, 'a', seed)
                  return (
                    <div className="mk-scr" key="s5">
                      <div className="mk-copy"><p className="mk-h">{wa(name.trim() || PET[species])} 함께<br />첫 할 일 하나만</p><p className="mk-sub">끝내면 바로 자라요. 작아도 괜찮아요.</p></div>
                      <div ref={hopEl} className="mk-ch" style={top}><CharacterArt species={species} stage={1} size={170} seed={seed} mood={happy ? 'happy' : 'default'} motion="idle" wear={{ seed }} /></div>
                      <div className={`mk-say mk-glass${task?.done ? '' : ' is-hide'}`} style={{ top: (top.top as number) + head.y * 170 - 8 }} aria-live="polite">{task?.done ? '하나 끝! 같이 자랐어' : ''}</div>
                      <div ref={xpEl} className="mk-xp" style={{ left: (top.left as number) + 140, top: (top.top as number) + 20 }}>+{XP.task}</div>
                      <div className="mk-bottom">
                        {!task && (
                          <>
                            <div className="mk-chips">{TASKS.map((t) => <button key={t} className="mk-glass" onClick={() => void makeTask(t)}>{t}</button>)}</div>
                            <input className="mk-own mk-glass" placeholder="직접 적기" value={own} maxLength={200} onChange={(e) => setOwn(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void makeTask(own) }} />
                          </>
                        )}
                        {task && (
                          <button ref={task.done ? undefined : setPrimary} className={`mk-task mk-glass${task.done ? ' is-done' : ''}`} aria-pressed={task.done} aria-label={`${task.title}, ${task.done ? '완료함' : '눌러서 완료'}`} onClick={doneTask}>
                            <span className="cb" /><span className="t">{task.title}</span><small>오늘</small>
                          </button>
                        )}
                        {error && <p className="mk-err" role="alert">{error}</p>}
                        <button ref={task?.done ? setPrimary : undefined} className="mk-btn" disabled={!task?.done} onClick={finish}>정원으로 가기</button>
                      </div>
                    </div>
                  )
                })()}
                <div ref={flash} className="mk-flash" />
              </>
            )
          }}
        </SceneBackdrop>
      </div>
    </div>,
    document.body
  )
}

function Axis({ left, right, ratio }: { left: string; right: string; ratio: number }) {
  return (
    <div className="mk-axis"><span>{left}</span><div className="bar"><i style={{ width: `${Math.round(ratio * 100)}%` }} /></div><span>{right}</span></div>
  )
}
