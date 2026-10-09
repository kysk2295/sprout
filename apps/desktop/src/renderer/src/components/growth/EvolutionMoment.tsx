// 42 §10.6 진화 순간(약 2.5초, transform · opacity만) + 43 §9 친구 단계 두 갈래 고르기 + 부화(씨앗 → 아기). 49 §7: 그림은 미리 구운 3D 층.
// 순서: 어두워짐 + 웅크림 → 흰 실루엣 꿀렁 3번 → 빛 방울(1.18초, 꼬마 → 친구는 여기서 멈추고 고른다) → 고리 두 겹 + 새 실루엣 톡 → 색 그림 → 이름 카드(전 → 후).
// 부화 = 씨앗 금 한 줄 → 두 줄 → 빛 → 아기. 실루엣은 같은 층을 한 색으로(CharacterArt silhouette — CSS mask, 필터 없음).
// 층은 React로 다 그려 두고(처음엔 투명) 시각표대로 WAAPI. 누르면·Esc면 끝 장면. 움직임 줄이기 = 0.3초 페이드 + 카드. speed < 1이면 빠르게(레벨업 창).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { bitSvg, newPartOf, PATHS, RING, titleOf } from '@sprout/schema/characterArt'
import { STAGES, type Species } from '@sprout/schema/growth'
import { evolutionGift, type Equip, type Path } from '@sprout/schema/wardrobe'
import { CharacterArt } from './CharacterArt'
import { SeedPic } from './MakeFlow'
import './evolution.css'

export type EvoProps = {
  species: Species
  /** 0 = 씨앗(부화) */
  from: number
  to: number
  path: Path
  eq?: Partial<Equip>
  /** 씨앗 껍질(0~3) */
  seed?: number
  size?: number
  /** 캐릭터 발밑 자리(px, 덮개 기준) — 무대 위에서 같은 자리로 겹친다. 없으면 가운데 */
  foot?: { x: number; y: number }
  reduced: boolean
  /** 꼬마 → 친구에서 두 갈래 고르기(기본 켬) */
  choose?: boolean
  speed?: number
  onPath?: (p: Path) => void
  onDone: () => void
}

const f = (n: number) => +n.toFixed(2)
type Card = { k: string; n: string; f: string }

export function EvolutionMoment({ species: sp, from, to, path: path0, eq = {}, seed = 0, size = 260, foot, reduced, choose = true, speed = 1, onPath, onDone }: EvoProps) {
  const box = useRef<HTMLDivElement>(null)
  const dim = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const L = useRef<Record<string, HTMLDivElement | null>>({})
  const [path, setPath] = useState<Path>(path0)
  const [cracks, setCracks] = useState(0)
  const [info, setInfo] = useState<Card | null>(null)
  const [ended, setEnded] = useState(false)
  const [ask, setAsk] = useState<((p: Path) => void) | null>(null)
  const ctl = useRef<{ finish: () => void }>({ finish: () => {} })
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const pathRef = useRef(onPath)
  pathRef.current = onPath
  const ref = (k: string) => (el: HTMLDivElement | null) => { L.current[k] = el }

  useEffect(() => {
    const B = box.current!, D = dim.current!, CARD = card.current!, q = (k: string) => L.current[k]!
    const anims: Animation[] = []
    const timers: number[] = []
    let p: Path = path0
    let over = false
    let pending = false
    const k = speed
    const tl = (el: HTMLElement, frames: [number, Keyframe][], total: number, extra: KeyframeAnimationOptions = {}) => {
      const a = el.animate(frames.map(([t, fr]) => ({ ...fr, offset: Math.min(1, t / total) })), { duration: total * k, fill: 'forwards', ...extra })
      anims.push(a); return a
    }
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms * k)) }
    const burst = (n: number, dist: number) => {
      if (reduced) return
      for (let i = 0; i < n; i++) {
        const b = document.createElement('div'); b.className = 'evo-bit big'; b.innerHTML = bitSvg(sp, i); B.appendChild(b)
        const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.2 : -0.1), r = dist * (0.7 + (i % 3) * 0.17), fall = sp === 'frog' ? -30 : sp === 'bee' ? 30 : 18
        const an = b.animate([{ transform: 'translate(0,0) scale(.4) rotate(0)', opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `translate(${f(Math.cos(a) * r * 0.8)}px,${f(Math.sin(a) * r * 0.8)}px) scale(1) rotate(${i * 40}deg)`, opacity: 1, offset: 0.55 }, { transform: `translate(${f(Math.cos(a) * r)}px,${f(Math.sin(a) * r + fall)}px) scale(.9) rotate(${i * 70}deg)`, opacity: 0 }], { duration: 1100 * k, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both' })
        anims.push(an); an.onfinish = () => b.remove()
      }
    }
    const fillCard = (st: number, at: number) => {
      const gift = evolutionGift(st)
      setInfo({ k: st === 1 ? '씨앗이 깨어났어요' : `${STAGES[st - 1].name}${st === 4 ? '으로' : '로'} 자랐어요`, n: titleOf(sp, st, p), f: '+ ' + newPartOf(sp, st, p) + (gift ? ` · 선물 ${gift.name}` : '') })
      tl(CARD, [[0, { opacity: 0, transform: `translate(-50%, ${reduced ? 0 : 26}px)` }], [at, { opacity: 0, transform: `translate(-50%, ${reduced ? 0 : 26}px)` }], [at + 360, { opacity: 1, transform: 'translate(-50%, -4px)' }], [at + 520, { opacity: 1, transform: 'translate(-50%, 0)' }], [at + 3600, { opacity: 1, transform: 'translate(-50%, 0)' }], [at + 3900, { opacity: 0, transform: 'translate(-50%, 0)' }]], at + 3900)
    }
    const end = () => {
      if (over) return
      over = true
      timers.forEach(clearTimeout)
      anims.forEach((a) => { try { a.cancel() } catch { /* */ } })
      B.querySelectorAll('.evo-bit').forEach((b) => b.remove())
      for (const key of ['old', 'oldSil', 'seed', 'newSil', 'orb', 'r1', 'r2', 'halo']) q(key) && (q(key).style.opacity = '0')
      q('new').style.opacity = '1'
      D.style.opacity = '0'
      CARD.style.opacity = '1'; CARD.style.transform = 'translate(-50%,0)'
      setInfo((c) => c ?? { k: to === 1 ? '씨앗이 깨어났어요' : `${STAGES[to - 1].name}${to === 4 ? '으로' : '로'} 자랐어요`, n: titleOf(sp, to, p), f: '+ ' + newPartOf(sp, to, p) })
      setEnded(true)
      timers.push(window.setTimeout(() => { CARD.style.opacity = '0'; doneRef.current() }, 2600))
    }
    const fin = (ms: number) => later(end, ms)
    ctl.current.finish = () => { if (!pending) end() }

    const rings = () => {
      for (const [r, i] of [['r1', 0], ['r2', 1]] as const) tl(q(r), [[0, { opacity: 0, transform: 'scale(.2)' }], [40 + i * 80, { opacity: 0.9, transform: 'scale(.4)' }], [700 + i * 60, { opacity: 0, transform: `scale(${2.6 + i * 0.6})` }]], 700 + i * 60, { easing: 'cubic-bezier(.2,.8,.3,1)' })
    }
    // 새 모습: 흰 실루엣이 톡 → 통통 → 색 그림(1.45초 자리)
    const pop = () => {
      const S = q('newSil'), N = q('new')
      if (reduced) { tl(N, [[0, { opacity: 0 }], [300, { opacity: 1 }]], 300); fillCard(to, 200); fin(520); return }
      tl(S, [[0, { opacity: 1, transform: 'scale(.12)' }], [256, { opacity: 1, transform: 'scale(1.24,.84)' }], [416, { opacity: 1, transform: 'scale(.9,1.12)' }], [512, { opacity: 1, transform: 'scale(1)' }], [640, { opacity: 0, transform: 'scale(1)' }]], 640, { easing: 'cubic-bezier(.3,.7,.4,1)' })
      tl(N, [[0, { opacity: 0, transform: 'scale(.9)' }], [260, { opacity: 0, transform: 'scale(.9)' }], [520, { opacity: 1, transform: 'scale(1)' }]], 520)
      tl(q('halo'), [[0, { opacity: 0, transform: 'scale(.3)' }], [400, { opacity: 1, transform: 'scale(1)' }], [900, { opacity: 0.5, transform: 'scale(1.05)' }], [1300, { opacity: 0, transform: 'scale(1.05)' }]], 1300)
      rings()
      burst(16, size * 0.58)
      fillCard(to, 480)
      tl(D, [[0, { opacity: 0.55 }], [920, { opacity: 0.55 }], [1320, { opacity: 0 }]], 1320)
      fin(1340)
    }
    const askPath = (go: () => void) => {
      if (!choose || to !== 3 || from !== 2) return go()
      pending = true
      setAsk(() => (np: Path) => { pending = false; setAsk(null); p = np; setPath(np); pathRef.current?.(np); go() })
    }

    if (from === 0) {
      const SE = q('seed')
      SE.style.opacity = '1'
      if (reduced) { tl(SE, [[0, { opacity: 1 }], [300, { opacity: 0 }]], 300); tl(q('new'), [[0, { opacity: 0 }], [300, { opacity: 1 }]], 300); fillCard(1, 200); fin(520) }
      else {
        tl(D, [[0, { opacity: 0 }], [200, { opacity: 0.55 }], [1500, { opacity: 0.55 }], [1900, { opacity: 0 }]], 1900)
        later(() => setCracks(1), 200); later(() => setCracks(2), 520)
        tl(SE, [[0, { transform: 'none', opacity: 1 }], [180, { transform: 'rotate(-6deg)' }], [360, { transform: 'rotate(6deg)' }], [540, { transform: 'rotate(-8deg)' }], [720, { transform: 'rotate(8deg)' }], [880, { transform: 'none', opacity: 1 }], [1000, { transform: 'scale(1.06)', opacity: 0 }]], 1000)
        tl(q('halo'), [[0, { opacity: 0, transform: 'scale(.3)' }], [820, { opacity: 0, transform: 'scale(.3)' }], [1100, { opacity: 1, transform: 'scale(1)' }], [1700, { opacity: 0, transform: 'scale(1.05)' }]], 1700)
        tl(q('new'), [[0, { opacity: 0, transform: 'scale(.15)' }], [900, { opacity: 0, transform: 'scale(.15)' }], [1190, { opacity: 1, transform: 'scale(1.16,.86)' }], [1350, { transform: 'scale(.93,1.08)' }], [1540, { opacity: 1, transform: 'none' }]], 1540, { easing: 'cubic-bezier(.2,.8,.2,1)' })
        later(() => { rings(); burst(12, size * 0.46) }, 900)
        fillCard(1, 1100)
        fin(1800)
      }
    } else {
      const A = q('old')
      A.style.opacity = '1'
      if (reduced) { tl(A, [[0, { opacity: 1 }], [300, { opacity: 0 }]], 300); askPath(pop) }
      else {
        const As = q('oldSil'), orb = q('orb')
        tl(D, [[0, { opacity: 0 }], [250, { opacity: 0.55 }]], 250)
        tl(A, [[0, { opacity: 1, transform: 'none' }], [125, { transform: 'scale(1.07,.9)' }], [250, { transform: 'none' }], [440, { opacity: 1 }], [460, { opacity: 0, transform: 'none' }]], 460)
        tl(As, [[0, { opacity: 0, transform: 'none' }], [260, { opacity: 0, transform: 'none' }], [440, { opacity: 1, transform: 'none' }], [600, { transform: 'scale(1.12,.88)' }], [760, { transform: 'scale(.92,1.14)' }], [910, { transform: 'scale(1.2,.84)' }], [1080, { opacity: 1, transform: 'scale(.16)' }], [1140, { opacity: 0, transform: 'scale(.1)' }]], 1140, { easing: 'ease-in-out' })
        tl(orb, [[0, { opacity: 0, transform: 'scale(.2)' }], [1000, { opacity: 0, transform: 'scale(.2)' }], [1100, { opacity: 1, transform: 'scale(.62)' }], [1180, { opacity: 1, transform: 'scale(.48)' }]], 1180)
        later(() => askPath(() => { tl(orb, [[0, { opacity: 1, transform: 'scale(.48)' }], [90, { opacity: 1, transform: 'scale(.9)' }], [260, { opacity: 0, transform: 'scale(1.8)' }]], 260); pop() }), 1180)
      }
    }
    return () => { over = true; timers.forEach(clearTimeout); anims.forEach((a) => { try { a.cancel() } catch { /* */ } }) }
    // 한 번 재생(같은 진화는 다시 그리지 않는다)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') ctl.current.finish() }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])

  const P = PATHS[sp]
  const pos: CSSProperties = foot ? { left: foot.x - size / 2, top: foot.y - size * 0.9, width: size, height: size } : { left: '50%', top: `calc(50% - ${size * 0.62}px)`, marginLeft: -size / 2, width: size, height: size }
  const wearFrom = { path, eq, seed }
  const wearTo = { path, eq, seed, lv: STAGES[to - 1].from }
  return (
    <div className="evo" onClick={() => ctl.current.finish()} role="dialog" aria-label={from === 0 ? '부화' : '진화'}>
      <div ref={dim} className="evo-dim" />
      <div ref={box} className="evo-box" style={{ ...pos, ['--rc' as string]: RING[sp] }}>
        <div ref={ref('halo')} className="evo-halo" />
        {from === 0
          ? <div ref={ref('seed')} className="evl evo-seed"><SeedPic seed={seed} cracks={cracks} size={size * 0.78} /></div>
          : <>
            <div ref={ref('old')} className="evl"><CharacterArt species={sp} stage={from} size={size} mood="wow" wear={wearFrom} /></div>
            <div ref={ref('oldSil')} className="evl"><CharacterArt species={sp} stage={from} size={size} silhouette wear={wearFrom} /></div>
          </>}
        <div ref={ref('orb')} className="evorb" />
        <div ref={ref('newSil')} className="evl"><CharacterArt species={sp} stage={to} size={size} silhouette wear={wearTo} /></div>
        <div ref={ref('new')} className="evl"><CharacterArt species={sp} stage={to} size={size} mood={ended ? 'smile' : 'happy'} motion={ended && !reduced ? 'idle' : 'still'} wear={wearTo} /></div>
        <div ref={ref('r1')} className="evring" /><div ref={ref('r2')} className="evring two" />
      </div>
      <div ref={card} className="evo-card" aria-live="polite">
        {info && (
          <>
            <div className="k">{info.k}</div>
            <div className="n">{info.n}</div>
            {from > 0 && (
              <div className="ba">
                <span className="bi"><CharacterArt species={sp} stage={from} size={52} mood="smile" wear={wearFrom} /><em>{titleOf(sp, from, path)}</em></span>
                <b>→</b>
                <span className="bi now"><CharacterArt species={sp} stage={to} size={52} mood="happy" wear={wearTo} /><em>{titleOf(sp, to, path)}</em></span>
              </div>
            )}
            <div className="f">{info.f}</div>
          </>
        )}
      </div>
      {ask && (
        <div className="evo-choice" onClick={(e) => e.stopPropagation()}>
          <div className="q">어떤 친구로 자랄까?</div>
          <div className="opts">
            {(['a', 'b'] as Path[]).map((pp) => (
              <button key={pp} className="opt" onClick={() => ask(pp)}>
                <span><CharacterArt species={sp} stage={3} size={116} mood="smile" wear={{ path: pp, seed }} /></span>
                <b>{P[pp].name}</b>
                <span>{P[pp].line}<br />→ {P[pp].t[2]}</span>
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
