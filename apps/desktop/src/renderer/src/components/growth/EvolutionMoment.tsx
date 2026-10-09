// 42 §10.6 진화 순간(약 2.5초, transform · opacity만) + 43 §9 친구 단계 두 갈래 고르기 + 부화(씨앗 → 아기, 종마다 뚜껑).
// 시안 character-raising-v2.html makeEvo를 그대로 옮겼다: 웅크림 → 흰 실루엣 꿀렁 3번 → 빛 방울(1.18초, 꼬마 → 친구는 여기서 멈추고 고른다)
// → 고리 두 겹 + 새 모습 톡 · 통통 → 종 조각 16개 → 이름 카드(전 → 후 작은 카드). 누르면 끝 장면. 움직임 줄이기 = 0.3초 페이드 + 카드.
// speed < 1이면 같은 순서를 빠르게(레벨업 창 1.3초 — 42 결정 ④).
import { useEffect, useRef, useState } from 'react'
import { art, bitSvg, hatchTop, newPartOf, PATHS, RING, titleOf } from '@sprout/schema/characterArt'
import { STAGES, type Species } from '@sprout/schema/growth'
import { evolutionGift, type Equip, type Path } from '@sprout/schema/wardrobe'
import './evolution.css'

export type EvoProps = {
  species: Species
  /** 0 = 씨앗(부화) */
  from: number
  to: number
  path: Path
  eq?: Partial<Equip>
  size?: number
  reduced: boolean
  /** 꼬마 → 친구에서 두 갈래 고르기(기본 켬) */
  choose?: boolean
  speed?: number
  onPath?: (p: Path) => void
  onDone: () => void
}

const f = (n: number) => +n.toFixed(2)

export function EvolutionMoment({ species: sp, from, to, path: path0, eq = {}, size = 260, reduced, choose = true, speed = 1, onPath, onDone }: EvoProps) {
  const root = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const dim = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [ask, setAsk] = useState<((p: Path) => void) | null>(null)
  const ctl = useRef<{ finish: () => void }>({ finish: () => {} })
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const pathRef = useRef(onPath)
  pathRef.current = onPath

  useEffect(() => {
    const B = box.current!, D = dim.current!, CARD = card.current!
    const anims: Animation[] = []
    const timers: number[] = []
    let path: Path = path0
    let ended = false
    let pending = false
    const k = speed
    const layer = (html: string, cls = 'evl') => { const d = document.createElement('div'); d.className = cls; if (cls === 'evl') d.style.cssText = `width:${size}px;height:${size}px;margin-left:${-size / 2}px`; d.innerHTML = html; B.appendChild(d); return d }
    const tl = (el: HTMLElement, frames: [number, Keyframe][], total: number, extra: KeyframeAnimationOptions = {}) => {
      const a = el.animate(frames.map(([t, p]) => ({ ...p, offset: Math.min(1, t / total) })), { duration: total * k, fill: 'forwards', ...extra })
      anims.push(a); return a
    }
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms * k)) }
    const burst = (n: number, dist: number, big = true) => {
      if (reduced) return
      for (let i = 0; i < n; i++) {
        const b = document.createElement('div'); b.className = 'evo-bit' + (big ? ' big' : ''); b.innerHTML = bitSvg(sp, i); B.appendChild(b)
        const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.2 : -0.1), r = dist * (0.7 + (i % 3) * 0.17), fall = sp === 'frog' ? -30 : sp === 'bee' ? 30 : 18
        const an = b.animate([{ transform: 'translate(0,0) scale(.4) rotate(0)', opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `translate(${f(Math.cos(a) * r * 0.8)}px,${f(Math.sin(a) * r * 0.8)}px) scale(1) rotate(${i * 40}deg)`, opacity: 1, offset: 0.55 }, { transform: `translate(${f(Math.cos(a) * r)}px,${f(Math.sin(a) * r + fall)}px) scale(.9) rotate(${i * 70}deg)`, opacity: 0 }], { duration: (big ? 1100 : 780) * k, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both' })
        anims.push(an); an.onfinish = () => b.remove()
      }
    }
    const art1 = (st: number, o: Parameters<typeof art>[2] = {}) => art(sp, st, { path, eq, fit: false, ...o })
    const fillCard = (st: number, at: number) => {
      CARD.querySelector('.k')!.textContent = st === 1 ? '태어났어요' : `${STAGES[st - 1].name}${st === 4 ? '으로' : '로'} 자랐어요`
      CARD.querySelector('.n')!.textContent = titleOf(sp, st, path)
      const gift = evolutionGift(st)
      CARD.querySelector('.f')!.textContent = '+ ' + newPartOf(sp, st, path) + (gift ? ` · 선물 ${gift.name}` : '')
      CARD.querySelector('.ba')!.innerHTML = from ? `<span class="bi">${art(sp, from, { path, size: 52, mood: 'smile', noAura: true, fit: false })}<em>${titleOf(sp, from, path)}</em></span><b>→</b><span class="bi now">${art(sp, st, { path, size: 52, mood: 'happy', noAura: true, fit: false })}<em>${titleOf(sp, st, path)}</em></span>` : ''
      tl(CARD, [[0, { opacity: 0, transform: `translate(-50%, ${reduced ? 0 : 14}px)` }], [at, { opacity: 0, transform: `translate(-50%, ${reduced ? 0 : 14}px)` }], [at + 320, { opacity: 1, transform: 'translate(-50%, 0)' }], [at + 3600, { opacity: 1, transform: 'translate(-50%, 0)' }], [at + 3900, { opacity: 0, transform: 'translate(-50%, 0)' }]], at + 3900, { easing: 'cubic-bezier(.34,1.56,.64,1)' })
    }
    const end = () => {
      if (ended) return
      ended = true
      timers.forEach(clearTimeout)
      anims.forEach((a) => { try { a.cancel() } catch { /* */ } })
      B.innerHTML = ''
      layer(art1(to, { live: true, mood: 'smile', lv: STAGES[to - 1].from }))
      D.style.opacity = '0'
      CARD.style.opacity = '1'; CARD.style.transform = 'translate(-50%,0)'
      if (!CARD.querySelector('.n')!.textContent) fillCard(to, 0)
      timers.push(window.setTimeout(() => { CARD.style.opacity = '0'; doneRef.current() }, 2600))
    }
    const fin = (ms: number) => later(end, ms)
    ctl.current.finish = () => { if (pending) return; end() }

    const pop = () => {
      const Bs = layer(art1(to, { sil: true })), N = layer(art1(to, { mood: 'happy', lv: STAGES[to - 1].from }))
      if (reduced) { Bs.remove(); tl(N, [[0, { opacity: 0 }], [300, { opacity: 1 }]], 300); fillCard(to, 200); fin(520); return }
      const bounce: [number, Keyframe][] = [[0, { transform: 'scale(.12)' }], [150, { transform: 'scale(1.24,.84)' }], [280, { transform: 'scale(.9,1.12)' }], [400, { transform: 'scale(1.06,.96)' }], [500, { transform: 'none' }]]
      tl(Bs, [[0, { opacity: 1, transform: 'scale(.12)' }], [150, { opacity: 1, transform: 'scale(1.24,.84)' }], [280, { opacity: 1, transform: 'scale(.9,1.12)' }], [400, { opacity: 0.35, transform: 'scale(1.06,.96)' }], [500, { opacity: 0, transform: 'none' }]], 500, { easing: 'cubic-bezier(.3,.7,.4,1)' })
      tl(N, bounce.map(([t, p]) => [t, { ...p, opacity: t < 260 ? 0 : 1 }]), 500, { easing: 'cubic-bezier(.3,.7,.4,1)' })
      for (const i of [0, 1]) { const R = layer('', 'evring' + (i ? ' two' : '')); R.style.setProperty('--rc', RING[sp]); tl(R, [[0, { opacity: 0, transform: 'scale(.2)' }], [40 + i * 70, { opacity: 1, transform: 'scale(.3)' }], [520 + i * 90, { opacity: 0, transform: `scale(${2.6 + i * 0.6})` }]], 520 + i * 90, { easing: 'cubic-bezier(.2,.8,.3,1)' }) }
      burst(16, 150)
      fillCard(to, 480)
      tl(D, [[0, { opacity: 1 }], [900, { opacity: 1 }], [1300, { opacity: 0 }]], 1300)
      fin(1340)
    }
    const askPath = (go: () => void) => {
      if (!choose || to !== 3 || from !== 2) return go()
      pending = true
      setAsk(() => (p: Path) => { pending = false; setAsk(null); path = p; pathRef.current?.(p); go() })
    }

    if (from === 0) {
      const N = layer(art(sp, 1, { mood: 'wow', path, fit: false })), T = layer(hatchTop(sp))
      if (reduced) { tl(T, [[0, { opacity: 1 }], [300, { opacity: 0 }]], 300); fillCard(1, 200); fin(520) }
      else {
        tl(D, [[0, { opacity: 0 }], [200, { opacity: 1 }], [1500, { opacity: 1 }], [1900, { opacity: 0 }]], 1900)
        tl(T, [[0, { transform: 'none' }], [180, { transform: 'rotate(-6deg)' }], [360, { transform: 'rotate(6deg)' }], [540, { transform: 'rotate(-8deg)' }], [720, { transform: 'rotate(8deg)' }], [900, { transform: 'none', opacity: 1 }], [1200, sp === 'frog' ? { transform: 'scale(1.3)', opacity: 0 } : { transform: 'translate(40px,-120px) rotate(40deg)', opacity: 0 }]], 1200)
        tl(N, [[0, { transform: 'none' }], [900, { transform: 'none' }], [1050, { transform: 'translateY(-10px) scale(.96,1.06)' }], [1200, { transform: 'scale(1.04,.96)' }], [1300, { transform: 'none' }]], 1300)
        later(() => burst(12, 120), 900); fillCard(1, 1000)
        fin(1700)
      }
    } else {
      const A = layer(art1(from, { lv: STAGES[to - 1].from - 1, mood: 'wow' }))
      if (reduced) { tl(A, [[0, { opacity: 1 }], [300, { opacity: 0 }]], 300); askPath(pop) }
      else {
        const As = layer(art1(from, { sil: true })), orb = layer('', 'evorb')
        tl(D, [[0, { opacity: 0 }], [250, { opacity: 1 }]], 250)
        tl(A, [[0, { opacity: 1, transform: 'none' }], [140, { transform: 'scale(1.07,.9)' }], [260, { transform: 'scale(.97,1.04)' }], [380, { opacity: 1, transform: 'none' }], [460, { opacity: 0, transform: 'none' }]], 460)
        tl(As, [[0, { opacity: 0, transform: 'none' }], [260, { opacity: 0, transform: 'none' }], [440, { opacity: 1, transform: 'none' }], [600, { transform: 'scale(1.12,.88)' }], [760, { transform: 'scale(.92,1.14)' }], [910, { transform: 'scale(1.2,.84)' }], [1080, { opacity: 1, transform: 'scale(.16)' }], [1140, { opacity: 0, transform: 'scale(.1)' }]], 1140, { easing: 'ease-in-out' })
        tl(orb, [[0, { opacity: 0, transform: 'scale(.2)' }], [1000, { opacity: 0, transform: 'scale(.2)' }], [1100, { opacity: 1, transform: 'scale(.62)' }], [1180, { opacity: 1, transform: 'scale(.48)' }]], 1180)
        later(() => askPath(() => { tl(orb, [[0, { opacity: 1, transform: 'scale(.48)' }], [90, { opacity: 1, transform: 'scale(.9)' }], [260, { opacity: 0, transform: 'scale(1.8)' }]], 260); pop() }), 1180)
      }
    }
    return () => { ended = true; timers.forEach(clearTimeout); anims.forEach((a) => { try { a.cancel() } catch { /* */ } }) }
    // 한 번 재생(같은 진화는 다시 그리지 않는다)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') ctl.current.finish() }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])

  const P = PATHS[sp]
  return (
    <div ref={root} className="evo" onClick={() => ctl.current.finish()} role="dialog" aria-label="진화">
      <div ref={dim} className="evo-dim" />
      <div className="evo-glow" />
      <div ref={box} className="evo-box" style={{ top: `calc(50% - ${size * 0.62}px)`, ['--h' as string]: `${size / 2}px` }} />
      <div ref={card} className="evo-card" aria-live="polite"><div className="k" /><div className="n" /><div className="ba" /><div className="f" /></div>
      {ask && (
        <div className="evo-choice" onClick={(e) => e.stopPropagation()}>
          <div className="q">어떤 친구로 자랄까?</div>
          <div className="opts">
            {(['a', 'b'] as Path[]).map((p) => (
              <button key={p} className="opt" onClick={() => ask(p)}>
                <span dangerouslySetInnerHTML={{ __html: art(sp, 3, { path: p, size: 116, mood: 'smile', live: !reduced, fit: true }) }} />
                <b>{P[p].name}</b>
                <span>{P[p].line}<br />→ {P[p].t[2]}</span>
              </button>
            ))}
          </div>
          <button className="later" onClick={() => ask('a')}>나중에 고를래</button>
        </div>
      )}
      {!ask && <button className="evo-skip" onClick={(e) => { e.stopPropagation(); ctl.current.finish() }}>건너뛰기</button>}
    </div>
  )
}
