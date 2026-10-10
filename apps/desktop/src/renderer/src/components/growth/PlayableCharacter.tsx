// 49 §7.1 만지기 v3(데스크톱) — CharacterArt를 감싸 깡충·한 바퀴·간지럼·쓰다듬기·끌었다 놓기·딴짓.
// 규칙·시간·움직임 키는 공용 @sprout/schema/charPlay(휴대폰과 같은 값). 보상 없음(43 §4.1 — 만지기는 아무것도 주지 않고 세지 않는다).
// 성능(39 §11): React 다시 그리기 없이 rAF에서 감싸개 style.transform과 회전 띠 컷 위치(translateX)만 쓴다. 얼굴만 움직임 시작·끝에 한 번씩 바뀐다.
// 한 바퀴 = 공중에서 미리 구운 12컷 회전 띠 한 장을 translateX로 넘긴다(도는 동안 CharacterArt 층은 숨김). 띠가 아직 없으면 깡충.
// 움직임 줄이기(OS · .is-still · html[data-growth-still]) = 맥박(PULSE) + 얼굴만. 딴짓은 화면에 보일 때만(창 숨김·다른 탭·스크롤 밖이면 멈춤).
// level 'full' = 전부(성장 홈 · 만들기 흐름) · 'light' = 누르기 = 깡충만(AI 비서 빈 대화처럼 캐릭터가 큰 자리 — 딴짓 없음).
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type Ref } from 'react'
import { GIGGLE, HOP, IDLE, landAt, newTapState, nextIdleMs, onTap, PET, pickIdle, PULSE, sample, SPIN, spinFrame, WOBBLE, type Motion, type PlayKind } from '@sprout/schema/charPlay'
import { HEART_SVG, headTop3d, spinOf } from '@sprout/schema/characterArt'
import { normalizeSpecies, stageOf } from '@sprout/schema/growth'
import { TOUCH } from '@sprout/schema/wardrobe'
import { artUrl } from './art3dUrls'
import { applyEl } from './follow'
import { CharacterArt, useCharacterWear, type CharacterArtProps } from './CharacterArt'
import './playable.css'

export type PlayHandle = {
  /** 움직임 하나를 한 번(이름 또는 charPlay 움직임) */
  play: (m: Motion | PlayKind) => void
  /** 누르기와 똑같이(키보드·바깥 버튼) */
  tap: () => void
  /** 바깥 요소(말풍선·조각을 붙이는 자리) */
  readonly host: HTMLElement | null
  /** 부모가 WAAPI로 따로 움직일 감싸개(레벨업·부르기 등 — rAF 감싸개와 겹치지 않게 한 겹 바깥) */
  readonly inner: HTMLElement | null
  /** 49 §7.2 머리 꼭대기가 쉬는 자리에서 지금 얼마나 옮겨 갔나(px, 감싸개 부모 좌표) — 만지기 rAF 자세 + 감싸개·끌기의 지금 transform(WAAPI 포함) */
  headShift: () => { x: number; y: number }
}

const NAMED: Partial<Record<PlayKind, Motion>> = { hop: HOP, spin: SPIN, giggle: GIGGLE, pet: PET, wobble: WOBBLE, pulse: PULSE, ...IDLE }
const PET_MS = 500
const BLEND_MS = 90
const SPARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0.5 C7.6 4.6 9.4 6.4 13.5 7 C9.4 7.6 7.6 9.4 7 13.5 C6.4 9.4 4.6 7.6 0.5 7 C4.6 6.4 6.4 4.6 7 0.5Z" fill="#FFD36B"/></svg>'
const DUST = ['#A67C52', '#8E6A45', '#C49A6C', '#7FA36B', '#97B97E', '#B58A5E']
type Pose = { y: number; sx: number; sy: number; rot: number }
const REST: Pose = { y: 0, sx: 1, sy: 1, rot: 0 }
const f = (n: number) => +n.toFixed(3)

export type PlayableCharacterProps = CharacterArtProps & {
  level?: 'full' | 'light'
  /** 바깥이 이미 아는 움직임 줄이기(없으면 OS·.is-still·html[data-growth-still]를 직접 본다) */
  reduced?: boolean
  /** 바깥 감싸개: button(혼자 누르기를 받음) · span(바깥 버튼 안 — handle.tap으로) */
  as?: 'button' | 'span'
  /** 누르기 전에 바깥이 먼저 — true를 돌려주면 움직임 없이 끝(씨앗 두드리기·졸음 깨우기 등) */
  intercept?: () => boolean
  /** 누르기 움직임이 정해졌을 때(말풍선 문장 등) */
  onReact?: (kind: PlayKind) => void
  onPetEnd?: () => void
  onDrop?: (far: boolean) => void
  /** 입력 받지 않기(진화 연출 중 등) */
  disabled?: boolean
  /** 캐릭터 그림 대신 그릴 것(씨앗) — 이때는 끌기·쓰다듬기·딴짓·한 바퀴 없음 */
  custom?: ReactNode
  buttonLabel?: string
  buttonClass?: string
  innerClass?: string
  style?: CSSProperties
  hostRef?: MutableRefObject<HTMLElement | null>
  handle?: Ref<PlayHandle>
  children?: ReactNode
}

export function PlayableCharacter(props: PlayableCharacterProps) {
  const { level = 'full', reduced: reducedProp, as = 'button', intercept, onReact, onPetEnd, onDrop, disabled, custom, buttonLabel, buttonClass, innerClass, style, hostRef, handle, children, ...art } = props
  const { species, stage = 1, size = 120, mood, wear, seed, crop, tight } = art
  const full = level === 'full'
  const ctx = useCharacterWear()
  const sp = custom ? null : normalizeSpecies(species ?? null)
  const st = Math.min(5, Math.max(1, stage))
  const w = wear === null ? undefined : wear ?? (ctx && sp && ctx.species === sp && stageOf(ctx.level) === st ? ctx.wear : undefined)
  const seedNo = seed ?? w?.seed ?? ctx?.wear.seed ?? 0
  const fullCrop = !tight && crop !== 'bust' && (crop === 'full' || size > 40)
  const spin = useMemo(() => (full && sp && fullCrop ? spinOf(sp, st, w?.path, seedNo) : null), [full, sp, fullCrop, st, w?.path, seedNo])
  const spinUrl = spin ? artUrl(spin.key, spin.px) : null
  const head = sp ? headTop3d(sp, st, w?.path, seedNo) : { x: 0.5, y: 0.2 }

  const hostEl = useRef<HTMLElement | null>(null)
  const innerEl = useRef<HTMLSpanElement>(null)
  const moveEl = useRef<HTMLSpanElement>(null)
  const artEl = useRef<HTMLSpanElement>(null)
  const spinEl = useRef<HTMLSpanElement>(null)
  const spinImg = useRef<HTMLImageElement>(null)
  const fxEl = useRef<HTMLSpanElement>(null)
  const [face, setFace] = useState<string | null>(null)

  // 최신 값(rAF·타이머 안에서 다시 그리기 없이 읽는다)
  const live = useRef({ size, spinOn: !!spinUrl, frames: spin?.frames ?? 12, reducedProp, intercept, onReact, onPetEnd, onDrop, disabled, sp })
  live.current = { size, spinOn: !!spinUrl, frames: spin?.frames ?? 12, reducedProp, intercept, onReact, onPetEnd, onDrop, disabled, sp }

  const isReduced = useCallback(() => {
    if (live.current.reducedProp) return true
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return true
    if (document.documentElement.hasAttribute('data-growth-still')) return true
    return !!hostEl.current?.closest('.is-still')
  }, [])

  // ── 얼굴(움직임의 face로 잠깐) ──
  const faceT = useRef(0)
  const showFace = useCallback((m: string | undefined, ms: number) => {
    window.clearTimeout(faceT.current)
    if (!m) { setFace(null); return }
    setFace(m)
    faceT.current = window.setTimeout(() => setFace(null), ms)
  }, [])

  // ── 조각(흙·잎 · 하트·반짝) — DOM에 붙였다가 끝나면 뗀다(transform·opacity만) ──
  const dust = useCallback(() => {
    const fx = fxEl.current
    if (!fx) return
    const n = 4 + Math.floor(Math.random() * 3), s = live.current.size
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i')
      d.className = `ply-dust${i % 3 === 2 ? ' is-leaf' : ''}`
      d.style.background = DUST[(i * 2 + (i % 3 === 2 ? 3 : 0)) % DUST.length]
      fx.appendChild(d)
      const side = i % 2 ? 1 : -1, dx = side * s * (0.12 + Math.random() * 0.16), dy = -s * (0.04 + Math.random() * 0.07)
      d.animate([
        { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
        { transform: `translate(calc(-50% + ${f(dx * 0.6)}px), calc(-50% + ${f(dy)}px)) scale(1) rotate(${side * 40}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${f(dx)}px), calc(-50% + ${f(dy * 0.2)}px)) scale(.8) rotate(${side * 90}deg)`, opacity: 0 }
      ], { duration: 420, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both' }).onfinish = () => d.remove()
    }
  }, [])
  const petBit = useCallback((i: number) => {
    const fx = fxEl.current
    if (!fx) return
    const d = document.createElement('i')
    d.className = 'ply-pet'
    d.innerHTML = i % 3 === 1 ? SPARK_SVG : HEART_SVG
    const s = live.current.size, dx = (i % 2 ? 1 : -1) * s * (0.05 + (i % 3) * 0.06)
    d.style.marginLeft = `${f(dx)}px`
    fx.appendChild(d)
    d.animate([
      { transform: 'translate(-50%, 0) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, -6px) scale(1)', opacity: 1, offset: 0.25 },
      { transform: `translate(-50%, ${-Math.round(s * 0.16)}px) scale(.9)`, opacity: 0 }
    ], { duration: 1000, easing: 'ease-out', fill: 'both' }).onfinish = () => d.remove()
  }, [])

  // ── rAF: 움직임 하나 ──
  const run = useRef<{ m: Motion; t0: number; from: Pose | null; landed: boolean; loop: boolean } | null>(null)
  const pose = useRef<Pose>(REST)
  const raf = useRef(0)
  const spinShown = useRef(false)
  const setSpin = useCallback((on: boolean, k = 0) => {
    if (on !== spinShown.current) {
      spinShown.current = on
      if (spinEl.current) spinEl.current.style.opacity = on ? '1' : '0'
      if (artEl.current) artEl.current.style.opacity = on ? '0' : ''
    }
    if (on && spinImg.current) spinImg.current.style.transform = `translateX(${-k * live.current.size}px)`
  }, [])
  const write = useCallback((p: Pose) => {
    pose.current = p
    const el = moveEl.current
    if (!el) return
    const s = live.current.size
    el.style.transform = p.y === 0 && p.sx === 1 && p.sy === 1 && p.rot === 0 ? '' : `translate3d(0, ${f(p.y * s)}px, 0) rotate(${f(p.rot)}deg) scale(${f(p.sx)}, ${f(p.sy)})`
  }, [])
  const tick = useCallback((now: number) => {
    const r = run.current
    if (!r) { raf.current = 0; return }
    const el = now - r.t0
    let t = el / r.m.ms
    if (t >= 1) {
      if (r.loop) { r.t0 = now; r.landed = false; t = 0 } else {
        run.current = null; raf.current = 0
        setSpin(false); write(REST)
        return
      }
    }
    let p: Pose = sample(r.m, t)
    if (r.from && el < BLEND_MS) {
      const u = el / BLEND_MS, a = r.from
      p = { y: a.y + (p.y - a.y) * u, sx: a.sx + (p.sx - a.sx) * u, sy: a.sy + (p.sy - a.sy) * u, rot: a.rot + (p.rot - a.rot) * u }
    }
    write(p)
    if (r.m.spin && live.current.spinOn) {
      const inSpin = t > r.m.spin.from && t < r.m.spin.to
      setSpin(inSpin, inSpin ? spinFrame(r.m, t, live.current.frames) : 0)
    }
    const land = landAt(r.m)
    if (!r.landed && land !== null && el >= land) { r.landed = true; if (r.m.kind !== 'minihop') dust() }
    raf.current = requestAnimationFrame(tick)
  }, [write, setSpin, dust])

  const play = useCallback((mm: Motion | PlayKind, loop = false) => {
    let m = typeof mm === 'string' ? NAMED[mm] : mm
    if (!m) return
    const reduced = isReduced()
    if (reduced && m.kind !== 'blink') m = PULSE
    if (m.kind === 'spin' && !live.current.spinOn) m = HOP
    // 얼굴: 움직임의 face(줄이기면 맥박에 웃음) — 짧은 맥박에서도 보이게 0.9초는 둔다
    const fm = typeof mm === 'string' ? NAMED[mm]?.face : mm.face
    const asked = typeof mm === 'string' ? mm : mm.kind
    showFace(fm ?? (reduced && asked !== 'pulse' && !asked.startsWith('mini') ? 'happy' : undefined), loop ? 1e9 : Math.max(m.ms, reduced ? 900 : m.ms))
    const busy = !!run.current
    run.current = { m, t0: performance.now(), from: busy ? { ...pose.current } : null, landed: false, loop: loop && !reduced }
    setSpin(false)
    if (!raf.current) raf.current = requestAnimationFrame(tick)
  }, [isReduced, showFace, setSpin, tick])
  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0; run.current = null
    setSpin(false); write(REST)
  }, [setSpin, write])
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); window.clearTimeout(faceT.current) }, [])

  // ── 누르기 ──
  const tapState = useRef(newTapState())
  const tap = useCallback(() => {
    const L = live.current
    if (L.disabled) return
    if (L.intercept?.()) return
    // 판정은 늘 보통 규칙으로(간지럼 문장 등은 줄이기에서도 같다) — 움직임만 play가 맥박으로 바꾼다
    let m: Motion = HOP
    if (full && L.sp) {
      const r = onTap(tapState.current, Date.now(), false)
      tapState.current = r.state
      m = r.motion
    }
    play(m)
    L.onReact?.(m.kind === 'spin' && !L.spinOn ? 'hop' : m.kind)
  }, [full, play])

  const headY = useRef(head.y)
  headY.current = head.y
  const headShift = useCallback(() => {
    const s = live.current.size, p = pose.current
    const x0 = s / 2, y0 = headY.current * s, oy = 0.9 * s
    // 몸(.ply-move, 기준 50% 90%): scale → rotate → translateY
    const vx = 0, vy = (y0 - oy) * p.sy, r = (p.rot * Math.PI) / 180
    let q = { x: x0 + vx * Math.cos(r) - vy * Math.sin(r), y: oy + vx * Math.sin(r) + vy * Math.cos(r) + p.y * s }
    q = applyEl(innerEl.current, q.x, q.y, x0, oy) // 바깥 WAAPI(레벨업 통통·부르기), 기준 50% 90%
    q = applyEl(hostEl.current, q.x, q.y, x0, s / 2) // 끌기·놓기(기준 가운데)
    return { x: q.x - x0, y: q.y - y0 }
  }, [])
  useImperativeHandle(handle, () => ({
    play: (m) => play(m),
    tap,
    headShift,
    get host() { return hostEl.current },
    get inner() { return innerEl.current }
  }), [play, tap, headShift])

  // ── 누르고 있기(쓰다듬기) · 끌었다 놓기 ──
  const drag = useRef({ down: false, on: false, pet: false, sx: 0, sy: 0, x: 0, y: 0, petT: 0, bitT: 0, n: 0 })
  const canTouch = full && !!sp
  const endPet = () => {
    const d = drag.current
    window.clearTimeout(d.petT); window.clearInterval(d.bitT)
  }
  const onDown = (e: React.PointerEvent) => {
    if (live.current.disabled || e.button !== 0) return
    const d = drag.current
    Object.assign(d, { down: true, on: false, pet: false, sx: e.clientX, sy: e.clientY, x: 0, y: 0, n: 0 })
    if (!canTouch) return
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* */ }
    d.petT = window.setTimeout(() => {
      if (d.on || !d.down) return
      d.pet = true
      play(PET, true)
      if (isReduced()) return
      d.bitT = window.setInterval(() => { if (d.n >= 6) return; petBit(d.n++) }, 350)
    }, PET_MS)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.down || d.pet || !canTouch) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.on && Math.hypot(dx, dy) > TOUCH.dragStartPx) { d.on = true; endPet(); stop(); showFace('wow', 1e9) }
    if (d.on && hostEl.current) {
      const r = Math.hypot(dx, dy), k = r > TOUCH.dragRadius ? TOUCH.dragRadius / r : 1
      d.x = dx * k; d.y = Math.min(dy * k, TOUCH.dragDown)
      hostEl.current.style.transform = `translate(${f(d.x)}px,${f(d.y)}px)${isReduced() ? '' : ` rotate(${f(d.x / 9)}deg)`}`
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.down) return
    d.down = false
    endPet()
    const host = hostEl.current
    if (d.on && host) {
      d.on = false
      const { x, y } = d, far = Math.hypot(x, y) > TOUCH.dropFarPx, reduced = isReduced()
      host.style.transform = ''
      host.animate([{ transform: `translate(${f(x)}px,${f(y)}px)${reduced ? '' : ` rotate(${f(x / 9)}deg)`}` }, { transform: 'none' }], { duration: reduced ? 160 : 260, easing: 'cubic-bezier(.3,.7,.4,1)' })
      play(WOBBLE)
      live.current.onDrop?.(far)
      return
    }
    if (d.pet) { d.pet = false; stop(); showFace('happy', 1500); live.current.onPetEnd?.(); return }
    if (e.type === 'pointercancel') return
    tap()
  }

  // ── 딴짓(8~15초마다, 보일 때만) ──
  const seen = useRef(true)
  useEffect(() => {
    const el = hostEl.current
    if (!full || !sp || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => { seen.current = es.some((x) => x.isIntersecting) })
    io.observe(el)
    return () => io.disconnect()
  }, [full, sp])
  useEffect(() => {
    if (!full || !sp) return
    let t = 0
    const next = () => {
      t = window.setTimeout(() => {
        const html = document.documentElement
        const visible = document.visibilityState === 'visible' && !html.hasAttribute('data-hidden') && seen.current
        if (visible && !run.current && !drag.current.down && !live.current.disabled) play(pickIdle(Math.random(), isReduced()))
        next()
      }, nextIdleMs(Math.random()))
    }
    next()
    return () => window.clearTimeout(t)
  }, [full, sp, play, isReduced])

  const setHost = (el: HTMLElement | null) => { hostEl.current = el; if (hostRef) hostRef.current = el }
  const vars = { '--pc-head': `${Math.round(head.y * 100)}%`, width: size, height: size, ...style } as CSSProperties
  const body = (
    <span ref={innerEl} className={`ply-in${innerClass ? ` ${innerClass}` : ''}`}>
      <span ref={moveEl} className="ply-move">
        <span ref={artEl} className="ply-art">{custom ?? <CharacterArt {...art} mood={face ?? mood} />}</span>
        {spinUrl && spin ? (
          <span ref={spinEl} className="ply-spin" aria-hidden="true">
            <img ref={spinImg} src={spinUrl} alt="" draggable={false} decoding="async" style={{ width: size * spin.frames, height: size }} />
          </span>
        ) : null}
      </span>
      <span ref={fxEl} className="ply-fx" aria-hidden="true" />
    </span>
  )
  const cls = `ply pc-${level}${buttonClass ? ` ${buttonClass}` : ''}`
  if (as === 'span') return <span ref={setHost} className={cls} style={vars}>{body}{children}</span>
  return (
    <button ref={setHost} type="button" className={`${cls} ply-btn`} style={vars} aria-label={buttonLabel} disabled={disabled}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onClick={(e) => { if (e.detail === 0) tap() /* Enter · Space(키보드 누르기) — 마우스는 pointerup에서 */ }}>
      {body}{children}
    </button>
  )
}
