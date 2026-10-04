import { Paintbrush, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { SPECIES, STAGES, stageOf, XP, type Species } from '@sprout/schema/growth'
import {
  catchUpOf, DECOR, greetingLine, isSleepy, levelOfTotal, newlyUnlocked, readRoomOff, readSeenAt, renameCharacter, setGrowthStageActive, stageLines,
  takeGreeting, timeOfDay, writeRoomOff, writeSeenAt, type CharacterRow, type StageStats, type TimeOfDay, type XpRow
} from '../../data/growth'
import { dayKey } from '../../lib/dates'
import { CharacterArt, type CharacterMood } from './CharacterArt'
import { Confetti } from './Interactive'
import { DecorIcon, Scene } from './StageScene'

// 10 §3.2 캐릭터 중심 v3 — 무대(캐릭터 방): 상태 머신 · 말 걸기 · 먹이(XP 방울) · 레벨업·진화 연출 · 꾸미기
type Progress = { total: number; level: number; into: number; toNext: number; stage: number }
type Pt = { x: number; y: number }
type Reveal = { evolve: boolean; prev: number; level: number; phase: 'build' | 'show'; artStage?: number }

const EGG_LINES = ['톡톡… 누가 날 깨워 줄래?', '성향 조사를 하면 내가 깨어나!']
const center = (el: Element | null): Pt | null => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }

export function GrowthStage({ character, events, progress, ready, stats, reduced, onSurvey, onQuests, onDiary }: {
  character?: CharacterRow; events: XpRow[]; progress: Progress; ready: boolean; stats: StageStats; reduced: boolean
  onSurvey: () => void; onQuests: () => void; onDiary: () => void
}) {
  const species: Species | null = character?.species ?? null
  const name = species ? (character?.name || SPECIES[species].name) : '아직 모르는 알'
  const stageEl = useRef<HTMLDivElement>(null)
  const charEl = useRef<HTMLButtonElement>(null)
  const bowlEl = useRef<HTMLButtonElement>(null)

  // ── 시간 · 크기 ──
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => { const t = window.setInterval(() => setHour(new Date().getHours()), 60_000); return () => window.clearInterval(t) }, [])
  const tod: TimeOfDay = timeOfDay(hour)
  const [narrow, setNarrow] = useState(false)
  const [short, setShort] = useState(() => window.innerHeight < 760)
  useEffect(() => {
    const el = stageEl.current
    if (!el) return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 720))
    ro.observe(el)
    const onR = () => setShort(window.innerHeight < 760)
    window.addEventListener('resize', onR)
    return () => { ro.disconnect(); window.removeEventListener('resize', onR) }
  }, [])
  const [hidden, setHidden] = useState(document.hidden)
  useEffect(() => { const on = () => setHidden(document.hidden); document.addEventListener('visibilitychange', on); return () => document.removeEventListener('visibilitychange', on) }, [])

  // ── 표시용 XP(방울이 닿을 때마다 찬다) ──
  const [shownTotal, setShownTotal] = useState<number | null>(null)
  const settled = useRef(progress.total)
  const flying = useRef(0)
  useEffect(() => { if (shownTotal === null && flying.current === 0) settled.current = progress.total }, [progress.total, shownTotal])
  const shown = shownTotal === null ? progress : { ...levelOfTotal(shownTotal), total: shownTotal, stage: progress.stage }
  const stage = progress.stage
  const size = Math.round((230 + (stage - 1) * 12) * (narrow ? 0.8 : 1))

  // ── 반응 상태 ──
  const [react, setReact] = useState<{ mood: CharacterMood; id: number }>()
  const [act, setAct] = useState<{ name: string; id: number }>()
  const [bubble, setBubble] = useState<{ text: string; id: number }>()
  const [hearts, setHearts] = useState<{ id: number; dx: number }[]>([])
  const [woke, setWoke] = useState(false)
  const [curious, setCurious] = useState(false)
  const [cracks, setCracks] = useState(0)
  const [banner, setBanner] = useState<string>()
  const [reveal, setReveal] = useState<Reveal>()
  const [unlock, setUnlock] = useState<(typeof DECOR)[number]>()
  const [panel, setPanel] = useState(false)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [fx, setFx] = useState<{ ball: boolean; lamp: boolean; flowers: number; butterfly: number }>({ ball: false, lamp: false, flowers: 0, butterfly: 0 })
  const [bump, setBump] = useState(0)
  const [burst, setBurst] = useState(0)
  useEffect(() => { if (character) setOff(readRoomOff(character.id)) }, [character?.id])

  const timers = useRef(new Set<number>())
  const later = useCallback((fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.current.delete(t); fn() }, ms); timers.current.add(t); return t }, [])
  const orbs = useRef(new Set<HTMLElement>())
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); orbs.current.forEach((o) => o.remove()) }, [])

  const sleepy = !!species && isSleepy(hour, stats.idleDays) && !woke && !reveal
  const baseMood: CharacterMood = sleepy ? 'sleepy' : stats.todayTaskXp >= XP.taskDailyCap ? 'content' : stats.todayDone > 0 ? 'smile' : 'default'
  const mood = react?.mood ?? baseMood

  const feel = useCallback((m: CharacterMood, ms: number) => { const id = Date.now() + Math.random(); setReact({ mood: m, id }); later(() => setReact((r) => (r?.id === id ? undefined : r)), ms) }, [later])
  const play = useCallback((name: string, ms = 600) => { if (reduced) return; const id = Date.now() + Math.random(); setAct({ name, id }); later(() => setAct((a) => (a?.id === id ? undefined : a)), ms) }, [reduced, later])
  const say = useCallback((text: string) => { const id = Date.now(); setBubble({ text, id }); later(() => setBubble((b) => (b?.id === id ? undefined : b)), 2600) }, [later])
  const heart = useCallback((dx = 0) => { if (reduced) return; const id = Date.now() + Math.random(); setHearts((h) => [...h.slice(-5), { id, dx }]); later(() => setHearts((h) => h.filter((x) => x.id !== id)), 1100) }, [reduced, later])

  // 말풍선 문장: 실제 숫자, 바로 전 문장은 다시 안 고른다
  const lineIdx = useRef(0)
  const lastLine = useRef('')
  const nextLine = () => {
    const all = species ? stageLines({ ...stats, level: progress.level, into: progress.into, toNext: progress.toNext }) : EGG_LINES
    let l = all[lineIdx.current++ % all.length]
    if (l === lastLine.current && all.length > 1) l = all[lineIdx.current++ % all.length]
    lastLine.current = l
    return l
  }

  // ── 깜빡임 · 대기 동작 (보이지 않으면 쉰다) ──
  useEffect(() => {
    let t = 0
    const loop = () => {
      t = window.setTimeout(() => {
        const el = charEl.current
        if (el && !document.hidden) { el.classList.add('is-blink'); window.setTimeout(() => el.classList.remove('is-blink'), 140) }
        loop()
      }, 3000 + Math.random() * 3000)
    }
    loop()
    return () => window.clearTimeout(t)
  }, [])
  const idleRef = useRef({ sleepy, reduced, reveal: !!reveal, species })
  idleRef.current = { sleepy, reduced, reveal: !!reveal, species }
  useEffect(() => {
    let t = 0
    const loop = () => {
      t = window.setTimeout(() => {
        const s = idleRef.current
        if (!document.hidden && !s.reduced && !s.reveal) {
          if (!s.species) play('is-wobble', 800)
          else if (!s.sleepy) {
            const own = s.species === 'turtle' ? 'is-tilt' : s.species === 'squirrel' ? 'is-wag' : s.species === 'cat' ? 'is-stretch' : 'is-hop'
            const pool = ['is-look', 'is-stretch', 'is-hop', own]
            play(pool[Math.floor(Math.random() * pool.length)], 2000)
          }
        }
        loop()
      }, 12000 + Math.random() * 8000)
    }
    loop()
    return () => window.clearTimeout(t)
  }, [play])

  // ── 시선 ──
  const raf = useRef(0)
  const onMove = (e: React.PointerEvent) => {
    if (reduced) return
    const p = { x: e.clientX, y: e.clientY }
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const el = charEl.current
      const pupils = el?.querySelector('.character__pupils')
      if (!el || !pupils) return
      const r = el.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, (p.x - (r.left + r.width / 2)) / 300))
      const y = Math.max(-1, Math.min(1, (p.y - (r.top + r.height * 0.55)) / 200))
      pupils.setAttribute('transform', `translate(${x * 2.6} ${y * 2})`)
    })
  }
  const onLeave = () => { charEl.current?.querySelector('.character__pupils')?.setAttribute('transform', 'translate(0 0)') }

  // ── 먹이: XP 방울 ──
  const mouth = (): Pt => { const r = charEl.current?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.62 } : { x: 0, y: 0 } }
  const fly = useCallback((from: Pt, via: Pt | null, label: string, big: boolean, delay: number) => new Promise<void>((done) => {
    const o = document.createElement('div')
    o.className = `gs-orb${big ? ' is-big' : ''}`
    o.textContent = label
    document.body.appendChild(o)
    orbs.current.add(o)
    const to = mouth()
    const mid = (a: Pt, b: Pt, lift: number) => `translate(${(a.x + b.x) / 2}px, ${Math.min(a.y, b.y) - lift}px)`
    const kf: Keyframe[] = [{ transform: `translate(${from.x}px, ${from.y}px) scale(.4)`, opacity: 0 }]
    if (via) kf.push({ transform: `${mid(from, via, 90)} scale(1)`, opacity: 1 }, { transform: `translate(${via.x}px, ${via.y - 6}px) scale(.9)`, opacity: 1 })
    kf.push({ transform: `${mid(via ?? from, to, 70)} scale(1)`, opacity: 1 }, { transform: `translate(${to.x}px, ${to.y}px) scale(.3)`, opacity: 0.2 })
    const a = o.animate(kf, { duration: via ? 950 : 750, delay, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' })
    const end = () => { o.remove(); orbs.current.delete(o); done() }
    a.onfinish = end
    a.oncancel = end
  }), [])
  /** amounts: 방울마다 XP. from이 없으면 무대 왼쪽 가장자리에서 밥그릇을 거쳐 온다 */
  const feed = useCallback(async (amounts: number[], opts: { from?: Pt; viaBowl?: boolean; base?: number } = {}) => {
    if (!amounts.length) return
    const total = amounts.reduce((a, b) => a + b, 0)
    if (reduced || document.hidden) { feel('happy', 1500); return }
    const r = stageEl.current?.getBoundingClientRect()
    if (!r) return
    const from = opts.from ?? { x: r.left + 8, y: r.top + r.height * 0.45 }
    const via = opts.viaBowl === false ? null : center(bowlEl.current)
    const base = opts.base ?? settled.current
    setShownTotal((t) => t ?? base)
    flying.current += amounts.length
    await Promise.all(amounts.map((amt, i) => fly(from, via, `+${amt}`, amt >= 10, i * 120).then(() => {
      flying.current--
      setShownTotal((t) => (t ?? base) + amt)
      if (via) setBump((b) => b + 1)
      setReact({ mood: 'eat', id: -1 })
      window.setTimeout(() => setReact((x) => (x?.id === -1 ? undefined : x)), 150)
    })))
    feel('happy', 2500)
    play('is-hop', 600)
    later(() => { if (flying.current === 0) { setShownTotal(null); settled.current = base + total } }, 400)
  }, [reduced, fly, feel, play, later])

  // 자리 비운 사이 받은 XP + 하루 첫 인사 (화면에 들어올 때 한 번)
  const entered = useRef(false)
  useEffect(() => {
    if (!ready || !character || entered.current) return
    entered.current = true
    const since = readSeenAt(character.id)
    writeSeenAt(character.id)
    const c = catchUpOf(events, since)
    const greet = takeGreeting(dayKey())
    let wait = 600
    if (c.orbs.length) {
      setBanner(`자리 비운 사이 · ${c.tasks ? `할 일 ${c.tasks}개 ` : ''}+${c.xp} XP`)
      later(() => setBanner(undefined), 2600)
      settled.current = progress.total - c.xp
      later(() => void feed(c.orbs, { base: progress.total - c.xp }), 500)
      wait = 2200
    }
    if (greet && species) later(() => { say(greetingLine(tod, stats)); play('is-hop', 600) }, wait)
  }, [ready, character]) // eslint-disable-line react-hooks/exhaustive-deps

  // 앱 어디서든 XP가 들어오면 방울(목표 행이면 그 자리에서 큰 방울)
  const origin = useRef<{ pt: Pt; at: number } | undefined>(undefined)
  useEffect(() => {
    setGrowthStageActive(true)
    const onFeed = (e: Event) => { origin.current = { pt: (e as CustomEvent<Pt>).detail, at: Date.now() } }
    const onXp = (e: Event) => {
      const amount = (e as CustomEvent<number>).detail
      if (character) writeSeenAt(character.id)
      if (amount <= 0) return
      setWoke(true)
      const o = origin.current && Date.now() - origin.current.at < 2000 ? origin.current.pt : null
      origin.current = undefined
      if (o) { play('is-hop2', 1000); void feed([amount], { from: o, viaBowl: false }); return }
      const r = stageEl.current?.getBoundingClientRect()
      const many = amount > 10 ? [amount] : Array.from({ length: amount }, () => 1)
      void feed(many, r ? { from: { x: r.left + r.width / 2 + 60, y: r.top + 4 } } : {})
    }
    // 할 일 완료(XP가 없어도 — 하루 10을 넘은 뒤): 기뻐하기만 한다
    const onDone = () => { setWoke(true); feel('happy', 3000); play('is-hop', 600) }
    window.addEventListener('sprout:growth-feed', onFeed)
    window.addEventListener('sprout:xp', onXp)
    window.addEventListener('sprout:task-done', onDone)
    return () => {
      setGrowthStageActive(false)
      if (character) writeSeenAt(character.id)
      window.removeEventListener('sprout:growth-feed', onFeed)
      window.removeEventListener('sprout:xp', onXp)
      window.removeEventListener('sprout:task-done', onDone)
    }
  }, [character, feed, feel, play])
  useEffect(() => { if (!woke) return; const t = window.setTimeout(() => setWoke(false), 60_000); return () => window.clearTimeout(t) }, [woke])

  // ── 레벨업 · 진화 연출 (LevelUpWatcher가 무대에 넘긴다) ──
  const finishReveal = useCallback((r: Reveal) => {
    const st = STAGES.find((s) => s.stage === stageOf(r.level))!
    setReveal({ ...r, phase: 'show', artStage: undefined })
    setBanner(r.evolve ? `${st.name}${/[가-힣]$/.test(st.name) && (st.name.charCodeAt(st.name.length - 1) - 0xac00) % 28 ? '으로' : '로'} 자랐어요!` : `Lv ${r.level}!`)
    setBurst((b) => b + 1)
    feel('happy', 2200)
    play('is-grow', 500)
    later(() => {
      setReveal(undefined)
      setBanner(undefined)
      say(r.evolve ? '나 많이 컸지?' : '나 커졌지?')
      const u = newlyUnlocked(r.prev, r.level)
      if (u.length) setUnlock(u[u.length - 1])
    }, r.evolve ? 1600 : 1300)
  }, [feel, play, later, say])
  const startReveal = useCallback((prev: number, level: number) => {
    const evolve = stageOf(level) > stageOf(prev)
    const r: Reveal = { evolve, prev, level, phase: 'build' }
    if (reduced) { finishReveal(r); return }
    setReveal(r)
    if (evolve) {
      const oldS = stageOf(prev), newS = stageOf(level)
      for (let i = 0; i < 6; i++) later(() => setReveal((x) => x && { ...x, artStage: i % 2 ? oldS : newS }), 500 + i * 220)
      later(() => finishReveal(r), 500 + 6 * 220 + 200)
    } else later(() => finishReveal(r), 700)
  }, [reduced, later, finishReveal])
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ prev: number; level: number }>).detail; later(() => startReveal(d.prev, d.level), 900) }
    window.addEventListener('sprout:growth-reveal', on)
    return () => window.removeEventListener('sprout:growth-reveal', on)
  }, [startReveal, later])
  const skipReveal = () => {
    if (!reveal) return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current.clear()
    setReveal(undefined)
    setBanner(undefined)
    const u = newlyUnlocked(reveal.prev, reveal.level)
    if (u.length) setUnlock(u[u.length - 1])
  }
  useEffect(() => {
    if (!reveal) return
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') skipReveal() }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  })

  // ── 만지기 ──
  const press = useRef<{ timer: number; pet?: number; petting: boolean }>({ timer: 0, petting: false })
  const clicks = useRef<number[]>([])
  const dizzyAt = useRef(0)
  const onDown = () => {
    if (!species) return
    press.current.timer = window.setTimeout(() => {
      press.current.petting = true
      setReact({ mood: 'happy', id: -2 })
      let n = 0
      press.current.pet = window.setInterval(() => { if (n++ < 6) heart((Math.random() - 0.5) * 50) }, 300)
    }, 600)
  }
  const endPress = (spoke: boolean) => {
    window.clearTimeout(press.current.timer)
    window.clearInterval(press.current.pet)
    if (press.current.petting) {
      setReact((x) => (x?.id === -2 ? undefined : x))
      if (spoke) say('헤헤, 고마워')
    }
  }
  const onClick = () => {
    if (press.current.petting) { press.current.petting = false; return }
    if (reveal) { skipReveal(); return }
    if (!species) { setCracks((c) => Math.min(3, c + 1)); play('is-wobble', 800); say(nextLine()); return }
    if (sleepy) { setWoke(true); say('으음… 안 잤어!'); later(() => setWoke(false), 5000); return }
    const now = Date.now()
    clicks.current = [...clicks.current.filter((t) => now - t < 2000), now]
    if (clicks.current.length >= 5 && now - dizzyAt.current > 10_000) { dizzyAt.current = now; clicks.current = []; play('is-dizzy', 1000); say('어지러워~'); return }
    play('is-hop', 600)
    heart()
    feel('happy', 1500)
    say(nextLine())
  }

  // ── 장식 ──
  const toggleDecor = (id: string, on?: boolean) => {
    if (!character) return
    const next = new Set(off)
    if (on ?? next.has(id)) next.delete(id); else next.add(id)
    setOff(next)
    writeRoomOff(character.id, next)
  }
  const placed = useMemo(() => new Set(DECOR.filter((d) => d.lv <= progress.level && !off.has(d.id) && species).map((d) => d.id)), [progress.level, off, species])
  const onDeco = (id: string) => {
    if (reduced) return
    if (id === 'ball') setFx((f) => ({ ...f, ball: !f.ball }))
    if (id === 'lamp') setFx((f) => ({ ...f, lamp: !f.lamp }))
    if (id === 'flowers') setFx((f) => ({ ...f, flowers: f.flowers + 1 }))
    if (id === 'butterfly') setFx((f) => ({ ...f, butterfly: f.butterfly + 1 }))
  }

  const toNext = shown.toNext
  const C = 2 * Math.PI * 19
  const stName = STAGES.find((s) => s.stage === stage)!.name
  const artStage = reveal?.artStage ?? stage
  const goalsDone = stats.goals.filter((g) => g.achieved).length

  return (
    <div
      ref={stageEl}
      className={`gs-stage gs-stage--${tod}${narrow ? ' is-narrow' : ''}${short ? ' is-short' : ''}${hidden ? ' is-paused' : ''}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <span className="gs-cloud" aria-hidden />
      <span className="gs-cloud gs-cloud--2" aria-hidden />
      <Scene species={species} stage={stage} level={progress.level} tod={tod} name={name} placed={placed} fx={fx} onDeco={onDeco} />
      <div className={`gs-dim${reveal ? ' is-on' : ''}${reveal?.evolve ? ' is-deep' : ''}`} onClick={skipReveal} aria-hidden />

      {/* 무대 위 정보(HUD) */}
      <div className="gs-hud">
        <div className="gs-ring" title={`다음 레벨까지 ${toNext - shown.into} XP`}>
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden>
            <circle cx="22" cy="22" r="19" className="gs-ring__bg" />
            <circle cx="22" cy="22" r="19" className="gs-ring__fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - shown.into / toNext) }} />
          </svg>
          <span><small>Lv</small>{shown.level}</span>
        </div>
        <HudName name={name} editable={!!species} />
        <div className="gs-hud__type">{species ? `${SPECIES[species].name} · ${stName}` : '나와 닮은 친구를 찾으면 깨어나요'}</div>
        <div className="gs-hud__bar" role="progressbar" aria-label="다음 레벨까지" aria-valuenow={shown.into} aria-valuemax={toNext}><span style={{ width: `${(shown.into / toNext) * 100}%` }} /></div>
        <div className="gs-hud__hint"><b>{shown.into}</b> / {toNext} XP · 레벨업까지 {toNext - shown.into}</div>
        {!species && <button className="gs-btn gs-hud__survey" onClick={onSurvey}>나와 닮은 친구 찾기</button>}
      </div>
      <div className="gs-chips">
        {stats.streak >= 2 && (
          <span className="gs-chip" title="할 일을 끝낸 날이 이어진 수">
            <svg className="gs-flame" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
            <span><b>{stats.streak}</b>일 연속</span>
          </span>
        )}
        <span className="gs-chip" title={`할 일 XP는 하루 ${XP.taskDailyCap}까지 — 밥그릇이 가득 차면 오늘은 끝`}><span>밥그릇 <b>{Math.min(XP.taskDailyCap, stats.todayTaskXp)}</b>/{XP.taskDailyCap}</span></span>
      </div>
      {banner && !reveal && <div className="gs-catchup" role="status">{banner}</div>}

      {/* 밥그릇 · 퀘스트 팻말 */}
      <button ref={bowlEl} key={`bowl${bump}`} className={`gs-bowl${stats.todayTaskXp >= XP.taskDailyCap ? ' is-full' : ''}${bump ? ' is-bump' : ''}`}
        aria-label={`밥그릇: 오늘 할 일 XP ${Math.min(XP.taskDailyCap, stats.todayTaskXp)}/${XP.taskDailyCap}`}
        onClick={() => say(stats.todayTaskXp >= XP.taskDailyCap ? '오늘은 배불러! 남은 건 내일 먹을게' : `오늘 할 일로 ${Math.max(0, stats.todayTaskXp)} XP 먹었어. ${XP.taskDailyCap - Math.max(0, stats.todayTaskXp)} 더 먹을 수 있어`)}>
        <Bowl n={stats.todayTaskXp} />
      </button>
      <button className="gs-sign" aria-label={stats.goals.length ? `이번 주 퀘스트 ${goalsDone}/${stats.goals.length} — 퀘스트로 가기` : '이번 주 퀘스트 적기'} onClick={onQuests}>
        <svg viewBox="0 0 96 80" width="100%" aria-hidden>
          <rect x="44" y="40" width="8" height="40" fill="#9a7552" />
          <rect x="4" y="6" width="88" height="40" rx="6" fill="#f3e3c8" stroke="#c89c6d" strokeWidth="3" />
          <text x="48" y="23" textAnchor="middle" className="gs-sign__small">이번 주 퀘스트</text>
          <text x="48" y="39" textAnchor="middle" className="gs-sign__big">{stats.goals.length ? `${goalsDone} / ${stats.goals.length}` : '+ 적기'}</text>
        </svg>
      </button>

      {/* 캐릭터 */}
      <button
        ref={charEl}
        className={`gs-char${act ? ` ${act.name}` : ''}${curious && !sleepy && species ? ' is-curious' : ''}${sleepy ? ' is-sleepy' : ''}${reveal?.phase === 'build' ? (reveal.evolve ? ' is-silhouette' : ' is-glow') : ''}`}
        style={{ '--gs-size': `${size}px` } as CSSProperties}
        aria-label={species ? `${name}, Lv ${progress.level} ${stName}. 눌러서 말 걸기` : '아직 모르는 알. 눌러서 두드리기'}
        onClick={onClick}
        onPointerDown={onDown}
        onPointerUp={() => endPress(true)}
        onPointerEnter={() => setCurious(true)}
        onPointerLeave={() => { setCurious(false); endPress(false); press.current.petting = false }}
      >
        <span className="gs-char__act" key={act ? act.id : 'idle'}><span className="gs-char__breath"><CharacterArt species={species} stage={artStage} size={size} mood={mood} cracks={cracks} /></span></span>
        <span className="gs-char__q" aria-hidden>?</span>
        {sleepy && <span className="gs-char__zzz" aria-hidden>Zzz</span>}
        {hearts.map((h) => (
          <svg key={h.id} className="gs-heart" viewBox="0 0 24 24" style={{ '--dx': `${h.dx}px` } as CSSProperties} aria-hidden><path fill="currentColor" d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z" /></svg>
        ))}
      </button>
      {bubble && <div className="gs-bubble" key={bubble.id} style={{ bottom: 40 + size - 8 }} onClick={() => bubble.text.startsWith('일기') && onDiary()}>{bubble.text}</div>}
      <div className="gs-live" aria-live="polite">{bubble?.text}</div>
      {reveal?.phase === 'show' && banner && <div className="gs-banner" role="status">{banner}</div>}
      {reveal?.phase === 'show' && !reduced && <span className="gs-ringburst" style={{ bottom: 40 + size / 2 }} aria-hidden />}
      {burst > 0 && <span className="gs-burst" key={burst}><Confetti count={28} spread={170} /></span>}

      {unlock && (
        <div className="gs-unlock" role="status">
          <DecorIcon id={unlock.id} />
          <span>새 장식: <b>{unlock.name}</b></span>
          <button className="gs-btn" onClick={() => { toggleDecor(unlock.id, true); setUnlock(undefined) }}>놓기</button>
          <button className="gs-btn is-ghost" onClick={() => { toggleDecor(unlock.id, false); setUnlock(undefined) }}>나중에</button>
        </div>
      )}

      {/* 꾸미기 */}
      {species && <button className="gs-decobtn" onClick={() => setPanel(!panel)} aria-expanded={panel}><Paintbrush aria-hidden />꾸미기</button>}
      <aside className={`gs-panel${panel ? ' is-open' : ''}`} aria-label="방 꾸미기" aria-hidden={!panel}>
        <h4>방 꾸미기 <button className="icon-btn" aria-label="닫기" onClick={() => setPanel(false)} tabIndex={panel ? 0 : -1}><X /></button></h4>
        <div className="gs-panel__grid">
          {DECOR.map((d) => {
            const locked = d.lv > progress.level
            const on = !locked && !off.has(d.id)
            return (
              <button key={d.id} className={`gs-tile${locked ? ' is-locked' : ''}${on ? ' is-on' : ''}`} aria-disabled={locked} aria-pressed={on} tabIndex={panel ? 0 : -1}
                title={locked ? `Lv ${d.lv}에 열려요` : on ? '눌러서 치우기' : '눌러서 놓기'} onClick={() => !locked && toggleDecor(d.id)}>
                <DecorIcon id={d.id} />{d.name}{locked && <span className="gs-tile__lv">Lv {d.lv}</span>}
              </button>
            )
          })}
        </div>
        <p>레벨이 오르면 장식이 열려요. 누르면 놓고, 다시 누르면 치워요. 이 기기에만 저장돼요.</p>
      </aside>
    </div>
  )
}

function HudName({ name, editable }: { name: string; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input className="gs-hud__rename" autoFocus defaultValue={name}
        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) void renameCharacter(v); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        onBlur={() => setEditing(false)} />
    )
  }
  return <div className="gs-hud__name" title={editable ? '두 번 눌러 이름 바꾸기' : undefined} onDoubleClick={() => editable && setEditing(true)}>{name}</div>
}

/** 밥그릇: 오늘 할 일 XP 10칸 */
function Bowl({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 84 52" width="100%" aria-hidden>
      <ellipse cx="42" cy="48" rx="34" ry="4" fill="rgba(0,0,0,.1)" />
      {Array.from({ length: XP.taskDailyCap }, (_, i) => <circle key={i} className={`gs-kib${i < n ? ' is-on' : ''}`} cx={18 + (i % 5) * 12} cy={i < 5 ? 18 : 10} r="5.5" />)}
      <path className="gs-bowl__rim" d="M6 20 h72 a36 26 0 0 1 -72 0z" fill="#f2e6d8" stroke="#e0cfba" strokeWidth="2" />
      <path d="M14 30 h56" stroke="#e5d4bf" strokeWidth="2" />
    </svg>
  )
}

/** 무대 아랫단 진화 길(§3.2.1): 점 32 · 마우스를 올리면 그 단계 모습과 열리는 장식 */
export function StageRoad({ species, level, stage }: { species: Species | null; level: number; stage: number }) {
  return (
    <div className="gs-road">
      {STAGES.map((s, i) => {
        const state = s.stage < stage ? 'past' : s.stage === stage ? 'now' : 'future'
        const next = STAGES[i + 1]?.from ?? 99
        const unl = DECOR.filter((d) => d.lv >= s.from && d.lv < next).map((d) => d.name).join(' · ')
        return (
          <div key={s.stage} className="gs-road__item">
            {i > 0 && <span className={`gs-road__line${s.stage <= stage ? ' is-on' : ''}`} />}
            <div className={`gs-road__st is-${state}`} tabIndex={0} aria-label={`${s.name} 단계 Lv ${s.from}${state === 'future' ? ` · ${s.from - level}레벨 남음` : ''}`}>
              <span className="gs-road__dot"><CharacterArt species={species} stage={s.stage} size={30} /></span>
              <span className="gs-road__lab">{s.name}<small>Lv {s.from}</small></span>
              <div className="gs-road__tip" role="tooltip">
                <CharacterArt species={species} stage={s.stage} size={70} />
                <span>{state === 'future' ? `Lv ${s.from}에 만나요 · ${s.from - level}레벨 남음` : state === 'now' ? '지금 단계' : '지나온 단계'}</span>
                <span>열리는 장식: {unl || '—'}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
