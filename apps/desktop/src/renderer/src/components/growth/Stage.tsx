import { Shirt } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { art, bitSvg, HEART_SVG, itemIcon, scene, sceneGround, sceneIsDark, standBottom, titleOf } from '@sprout/schema/characterArt'
import { SPECIES, STAGES, stageOf, XP, type Species } from '@sprout/schema/growth'
import {
  cmOf, dayJustDone, decorOn, equipItem, evolutionHint, giftsAt, growthTags, isBusy, isNight, ITEM_BY_ID, momentLine, pickDayMoment, stageBoxSize, tapLines,
  TOUCH, TOUCH_LINES, trophyLine, trophyShape, type CharacterItemRow, type DayMoment, type Item, type Path
} from '@sprout/schema/wardrobe'
import { catchUpOf, isSleepy, levelOfTotal, readSeenAt, renameCharacter, setGrowthStageActive, stageLines, writeSeenAt, type CharacterRow, type StageStats, type XpRow } from '../../data/growth'
import { isProjectDeadlineToday, RAISE_FRESH, RAISE_PANEL, saveLook, useRaise } from '../../data/raise'
import { dayKey } from '../../lib/dates'
import { CharacterArt, type CharacterMood } from './CharacterArt'
import { EvolutionMoment } from './EvolutionMoment'
import { RaisePanel } from './RaisePanel'
import './raise.css'

// 10 §3.2 무대(캐릭터 방) + 43 키우기(v0.3): 장면이 끝까지 · 왼쪽 위 유리 HUD(큰 % · 다음 선물 · 막대 · 태그) · 레벨마다 자라는 상자 ·
// 만지기(누르기·쓰다듬기·간지럼·끌기·부르기·트로피) · 하루 장면 5 · 레벨업 → 선물 카드 → 입혀 보기 · 진화 순간(+두 갈래) · 옷장·도감 패널.
// 움직임은 transform · opacity만(WAAPI). 만지기는 아무것도 주지 않는다(43 §1).
type Progress = { total: number; level: number; into: number; toNext: number; stage: number }
type Pt = { x: number; y: number }
type Evo = { from: number; to: number; level: number; prev: number }

const EGG_LINES = ['톡톡… 누가 날 깨워 줄래?', '성향 조사를 하면 내가 깨어나!']
const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* */ } } }
const f = (n: number) => +n.toFixed(2)
const rowsToItems = (rows: CharacterItemRow[]) => rows.map((r) => ITEM_BY_ID[r.item_id]).filter((x): x is Item => !!x)

export function GrowthStage({ character, events, progress, ready, stats, reduced, onSurvey, onDiary }: {
  character?: CharacterRow; events: XpRow[]; progress: Progress; ready: boolean; stats: StageStats; reduced: boolean
  onSurvey: () => void; onQuests?: () => void; onDiary: () => void
}) {
  const raise = useRaise()
  const species: Species | null = raise.species
  const name = species ? (character?.name || SPECIES[species].name) : '아직 모르는 씨앗'
  const stageEl = useRef<HTMLDivElement>(null)
  const charEl = useRef<HTMLButtonElement>(null)
  const inEl = useRef<HTMLSpanElement>(null)

  // ── 시간 · 크기 ──
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => { const t = window.setInterval(() => setHour(new Date().getHours()), 60_000); return () => window.clearInterval(t) }, [])
  const [dims, setDims] = useState({ w: 900, h: 520 })
  useEffect(() => {
    const el = stageEl.current
    if (!el) return
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const narrow = dims.w < 720

  // ── 표시용 XP(방울이 닿을 때마다 찬다) ──
  const [shownTotal, setShownTotal] = useState<number | null>(null)
  const settled = useRef(progress.total)
  const flying = useRef(0)
  useEffect(() => { if (shownTotal === null && flying.current === 0) settled.current = progress.total }, [progress.total, shownTotal])
  const shown = shownTotal === null ? progress : { ...levelOfTotal(shownTotal), total: shownTotal, stage: progress.stage }
  const stage = progress.stage
  const level = progress.level
  const box = Math.round(stageBoxSize(level) * (narrow ? 0.8 : 1))
  const bottom = standBottom(dims.w, dims.h, box)

  // ── 반응 상태 ──
  const [mood, setMood] = useState<{ m: CharacterMood; id: number }>()
  const [wave, setWave] = useState(false)
  const [tempHand, setTempHand] = useState<string | null>(null)
  const [woke, setWoke] = useState(false)
  const [cracks, setCracks] = useState(0)
  const [banner, setBanner] = useState<string>()
  const [evo, setEvo] = useState<Evo>()
  const [toast, setToast] = useState<{ items: Item[]; why: string; id: number }>()
  const [panel, setPanel] = useState<'ward' | 'dex' | null>(null)
  const [look, setLookEye] = useState<{ x: number; y: number }>()
  const [calm, setCalm] = useState(false)
  const [live, setLive] = useState('')

  const timers = useRef(new Set<number>())
  const later = useCallback((fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.current.delete(t); fn() }, ms); timers.current.add(t); return t }, [])
  const orbs = useRef(new Set<HTMLElement>())
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); orbs.current.forEach((o) => o.remove()) }, [])

  const night = isNight(hour)
  const sleepy = !!species && isSleepy(hour, stats.idleDays) && !woke && !evo
  const baseMood: CharacterMood = sleepy ? 'sleepy' : stats.todayTaskXp >= XP.taskDailyCap ? 'content' : stats.todayDone > 0 ? 'smile' : 'default'
  const curMood = mood?.m ?? baseMood

  const feel = useCallback((m: CharacterMood, ms?: number) => { const id = Date.now() + Math.random(); setMood({ m, id }); if (ms) later(() => setMood((r) => (r?.id === id ? undefined : r)), ms) }, [later])
  const anim = useCallback((frames: Keyframe[], o: KeyframeAnimationOptions) => { if (reduced || !inEl.current) return; inEl.current.animate(frames, o) }, [reduced])
  const hop = useCallback((h = 14) => anim([{ transform: 'none' }, { transform: 'scale(1.06,.93)', offset: 0.15 }, { transform: `translateY(-${h}px) scale(.96,1.05)`, offset: 0.45 }, { transform: 'scale(1.05,.95)', offset: 0.75 }, { transform: 'none' }], { duration: 440, easing: 'cubic-bezier(.3,.7,.4,1)' }), [anim])
  const floatEl = useCallback((html: string, cls: string, ms = 900, dx = 0) => {
    const host = charEl.current
    if (!host) return
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html; if (dx) d.style.marginLeft = `${dx}px`; host.appendChild(d)
    const a = reduced ? d.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: ms }) : d.animate([{ opacity: 0, transform: 'translateY(6px) scale(.8)' }, { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.2 }, { opacity: 0, transform: 'translateY(-30px) scale(1)' }], { duration: ms, easing: 'ease-out' })
    a.onfinish = () => d.remove()
  }, [reduced])
  const say = useCallback((text: string, ms: number = TOUCH.sayMs) => {
    const host = charEl.current
    if (!host) return
    host.querySelectorAll('.gs2-say').forEach((s) => s.remove())
    const b = document.createElement('div'); b.className = 'gs2-say'; b.textContent = text; host.appendChild(b)
    setLive(text)
    if (text.startsWith('일기')) b.onclick = (e) => { e.stopPropagation(); onDiary() }
    b.animate(reduced ? [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }] : [{ opacity: 0, transform: 'translateX(-50%) translateY(6px) scale(.9)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.08 }, { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.88 }, { opacity: 0, transform: 'translateX(-50%) scale(1)' }], { duration: ms, easing: 'cubic-bezier(.34,1.56,.64,1)' }).onfinish = () => b.remove()
  }, [reduced, onDiary])
  const burst = useCallback((n: number, dist: number) => {
    const host = charEl.current
    if (reduced || !host || !species) return
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div'); b.className = 'gs2-bit'; b.innerHTML = bitSvg(species, i); host.appendChild(b)
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.2 : -0.1), r = dist * (0.7 + (i % 3) * 0.17), fall = species === 'frog' ? -30 : species === 'bee' ? 30 : 18
      b.animate([{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `translate(${f(Math.cos(a) * r * 0.8)}px,${f(Math.sin(a) * r * 0.8)}px) scale(1) rotate(${i * 40}deg)`, opacity: 1, offset: 0.55 }, { transform: `translate(${f(Math.cos(a) * r)}px,${f(Math.sin(a) * r + fall)}px) scale(.9) rotate(${i * 70}deg)`, opacity: 0 }], { duration: 780, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both' }).onfinish = () => b.remove()
    }
  }, [reduced, species])

  // ── 말풍선 문장(실제 숫자) ──
  const lineIdx = useRef(0)
  const nextLine = () => {
    if (!species) return EGG_LINES[lineIdx.current++ % EGG_LINES.length]
    const busy = isBusy({ dueTotal: stats.dueTotal ?? 0, eventMinutes: stats.eventMinutes ?? 0 })
    const own = tapLines({ level, dueOpen: stats.todayOpen, xpLeft: progress.toNext - progress.into, busy })
    const old = stageLines({ ...stats, level, into: progress.into, toNext: progress.toNext }).filter((l) => l.startsWith('일기') || l.includes('퀘스트') || l.includes('배불러'))
    const all = [...old.slice(0, 1), ...own, ...old.slice(1)]
    return all[lineIdx.current++ % all.length]
  }

  // ── 시선(마우스) — 반 칸씩 끊어 다시 그리기를 줄인다 ──
  const drag = useRef({ on: false, down: false, sx: 0, sy: 0, x: 0, y: 0, pet: false, petT: 0, heartT: 0 })
  const raf = useRef(0)
  const onMove = (e: React.PointerEvent) => {
    if (reduced || drag.current.on) return
    const p = { x: e.clientX, y: e.clientY }
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const r = charEl.current?.getBoundingClientRect()
      if (!r) return
      const q = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 2) / 2
      const n = { x: q((p.x - (r.left + r.width / 2)) / 300), y: q((p.y - (r.top + r.height * 0.45)) / 200) }
      setLookEye((o) => (o && o.x === n.x && o.y === n.y ? o : n))
    })
  }

  // ── 먹이: XP 방울 ──
  const mouth = (): Pt => { const r = charEl.current?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.5 } : { x: 0, y: 0 } }
  const fly = useCallback((from: Pt, label: string, big: boolean, delay: number) => new Promise<void>((done) => {
    const o = document.createElement('div')
    o.className = `gs-orb${big ? ' is-big' : ''}`
    o.textContent = label
    document.body.appendChild(o)
    orbs.current.add(o)
    const to = mouth()
    const a = o.animate([{ transform: `translate(${from.x}px, ${from.y}px) scale(.4)`, opacity: 0 }, { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - 70}px) scale(1)`, opacity: 1 }, { transform: `translate(${to.x}px, ${to.y}px) scale(.3)`, opacity: 0.2 }], { duration: 750, delay, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' })
    const end = () => { o.remove(); orbs.current.delete(o); done() }
    a.onfinish = end
    a.oncancel = end
  }), [])
  const feed = useCallback(async (amounts: number[], opts: { from?: Pt; base?: number } = {}) => {
    if (!amounts.length) return
    const total = amounts.reduce((a, b) => a + b, 0)
    if (reduced || document.hidden) { feel('happy', 1500); floatEl(`+${total} XP`, 'gs2-xp'); return }
    const r = stageEl.current?.getBoundingClientRect()
    if (!r) return
    const from = opts.from ?? { x: r.left + r.width / 2 + 60, y: r.top + 4 }
    const base = opts.base ?? settled.current
    setShownTotal((t) => t ?? base)
    flying.current += amounts.length
    await Promise.all(amounts.map((amt, i) => fly(from, `+${amt}`, amt >= 10, i * 120).then(() => {
      flying.current--
      setShownTotal((t) => (t ?? base) + amt)
      feel('eat', 150)
    })))
    feel('happy', 2200)
    hop()
    floatEl(`+${total} XP`, 'gs2-xp')
    later(() => { if (flying.current === 0) { setShownTotal(null); settled.current = base + total } }, 400)
  }, [reduced, fly, feel, hop, floatEl, later])

  // ── 레벨업 · 진화 → 선물 카드(43 §5.5) ──
  const busyReveal = useRef(false)
  const pendingFresh = useRef<Item[]>([])
  const showToast = useCallback((items: Item[], why: string) => {
    if (!items.length) return
    const id = Date.now()
    setToast({ items, why, id })
    later(() => setToast((t) => (t?.id === id ? undefined : t)), 9000)
  }, [later])
  const afterReveal = useCallback((prev: number, lv: number) => {
    busyReveal.current = false
    burst(10, 90)
    floatEl(`Lv ${lv}`, 'gs2-chiplv', 1600)
    const g: Item[] = []
    for (let l = prev + 1; l <= lv; l++) g.push(...giftsAt(l))
    const rest = pendingFresh.current
    pendingFresh.current = []
    later(() => {
      if (g.length) showToast([...g, ...rest], `Lv ${lv} 선물이야. ${g[0].why ?? '할 일을 끝내서 받았어'}`)
      else if (rest.length) showToast(rest, '할 일을 끝내서 받았어')
    }, 700)
  }, [burst, floatEl, later, showToast])
  const startReveal = useCallback((prev: number, lv: number) => {
    if (!species) return
    busyReveal.current = true
    const from = stageOf(prev), to = stageOf(lv)
    feel('happy', 2200)
    if (to > from) { setEvo({ from, to, prev, level: lv }); return }
    anim([{ transform: 'none' }, { transform: 'scale(.94,1.05)', offset: 0.2 }, { transform: 'translateY(-12px) scale(1.12)', offset: 0.5 }, { transform: 'scale(.98,1.02)', offset: 0.8 }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.2,1.2,.4,1)' })
    later(() => afterReveal(prev, lv), reduced ? 0 : 640)
  }, [species, feel, anim, later, afterReveal, reduced])
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ prev: number; level: number }>).detail; later(() => startReveal(d.prev, d.level), 900) }
    window.addEventListener('sprout:growth-reveal', on)
    return () => window.removeEventListener('sprout:growth-reveal', on)
  }, [startReveal, later])
  // 레벨이 아닌 해금(한 날 · 점검 · 계절 · 프로젝트) — 레벨업 연출 중이면 그 뒤에. 트로피는 말 한 줄
  useEffect(() => {
    const on = (e: Event) => {
      const rows = (e as CustomEvent<CharacterItemRow[]>).detail
      if (rows.some((r) => r.kind === 'trophy')) later(() => { hop(); feel('happy', 2000); say(TOUCH_LINES.trophy) }, 1200)
      const items = rowsToItems(rows.filter((r) => r.kind === 'item' && r.source !== 'level'))
      if (!items.length) return
      if (busyReveal.current) { pendingFresh.current.push(...items); return }
      later(() => showToast(items, '할 일을 끝내서 받았어'), 700)
    }
    window.addEventListener(RAISE_FRESH, on)
    return () => window.removeEventListener(RAISE_FRESH, on)
  }, [later, hop, feel, say, showToast])

  // ── 하루 장면(43 §4.2) — 성장 화면을 열 때 하루 한 번 ──
  const playMoment = useCallback((m: DayMoment) => {
    const line = momentLine(m, { dueOpen: stats.todayOpen })
    if (m === 'morning') { setWave(true); feel('smile', TOUCH.callMs); later(() => setWave(false), TOUCH.callMs); say(line) }
    if (m === 'busy') { setCalm(true); feel('smile', 3200); say(line, 3200) }
    if (m === 'deadline') { setTempHand('flag'); hop(); later(() => hop(), 460); say(line, 3200); later(() => setTempHand(null), 3400) }
    if (m === 'dayDone') { feel('happy', 2600); hop(); later(() => hop(), 460); burst(14, 120); say(line, 3000) }
    if (m === 'night' && !reduced) for (let i = 0; i < 3; i++) later(() => floatEl('Z', 'gs2-zz', 1600, i * 6), 500 * i)
  }, [stats.todayOpen, feel, later, say, hop, burst, floatEl, reduced])
  const entered = useRef(false)
  useEffect(() => {
    if (!ready || !character || entered.current) return
    entered.current = true
    const since = readSeenAt(character.id)
    writeSeenAt(character.id)
    const c = catchUpOf(events, since)
    let wait = 700
    if (c.orbs.length) {
      setBanner(`자리 비운 사이 · ${c.tasks ? `할 일 ${c.tasks}개 ` : ''}+${c.xp} XP`)
      later(() => setBanner(undefined), 2600)
      settled.current = progress.total - c.xp
      later(() => void feed(c.orbs, { base: progress.total - c.xp }), 500)
      wait = 2400
    }
    if (!species) return
    const today = dayKey()
    if (isBusy({ dueTotal: stats.dueTotal ?? 0, eventMinutes: stats.eventMinutes ?? 0 })) setCalm(true)
    if (isNight(hour)) { later(() => playMoment('night'), wait); return }
    void isProjectDeadlineToday(today).then((deadline) => {
      const m = pickDayMoment({ hour, dueOpen: stats.todayOpen, dueTotal: stats.dueTotal ?? 0, eventMinutes: stats.eventMinutes ?? 0, projectDeadline: deadline, shownToday: ls.get(`sprout.dayMoment.${today}`) === '1' })
      if (!m) return
      ls.set(`sprout.dayMoment.${today}`, '1')
      later(() => playMoment(m), wait)
    }).catch(() => undefined)
  }, [ready, character]) // eslint-disable-line react-hooks/exhaustive-deps
  // 하루 다 함: 오늘 마감이 1개 이상이었고 방금 모두 끝냈을 때 하루 한 번(0개인 날은 아무 말도 없다)
  const prevDue = useRef<{ dueOpen: number; dueTotal: number } | null>(null)
  useEffect(() => {
    const cur = { dueOpen: stats.todayOpen, dueTotal: stats.dueTotal ?? 0 }
    const before = prevDue.current
    prevDue.current = cur
    if (!before || !species) return
    const key = `sprout.dayDone.${dayKey()}`
    if (dayJustDone(before, cur) && ls.get(key) !== '1') { ls.set(key, '1'); later(() => playMoment('dayDone'), 900) }
  }, [stats.todayOpen, stats.dueTotal, species, later, playMoment])

  // 앱 어디서든 XP가 들어오면 방울
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
      void feed(amount > 10 || o ? [amount] : Array.from({ length: amount }, () => 1), o ? { from: o } : {})
    }
    const onDone = () => { setWoke(true); feel('happy', 3000); hop() }
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
  }, [character, feed, feel, hop])
  useEffect(() => { if (!woke) return; const t = window.setTimeout(() => setWoke(false), 60_000); return () => window.clearTimeout(t) }, [woke])
  useEffect(() => {
    const on = (e: Event) => setPanel(((e as CustomEvent<'ward' | 'dex'>).detail) ?? 'ward')
    window.addEventListener(RAISE_PANEL, on)
    return () => window.removeEventListener(RAISE_PANEL, on)
  }, [])

  // ── 만지기(43 §4.1) ──
  const taps = useRef<number[]>([])
  const tickleUntil = useRef(0)
  const tap = () => {
    if (!species) { setCracks((c) => Math.min(3, c + 1)); anim([0, -6, 6, -4, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 600 }); say(nextLine()); return }
    if (sleepy) { setWoke(true); feel('default', TOUCH.wakeMs); hop(8); say(TOUCH_LINES.wake); return }
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < TOUCH.tickleWindowMs), now]
    if (taps.current.length >= TOUCH.tickleTaps && now > tickleUntil.current) {
      tickleUntil.current = now + TOUCH.tickleCooldownMs
      taps.current = []
      feel('giggle', 1800)
      anim([0, -7, 7, -6, 6, -4, 4, 0].map((r, i) => ({ transform: `rotate(${r}deg) ${i % 2 ? 'scale(1.03,.97)' : ''}` })), { duration: 720, easing: 'ease-in-out' })
      say(TOUCH_LINES.tickle)
      return
    }
    hop()
    if (!reduced) floatEl(HEART_SVG, 'gs2-heart', 1000)
    feel('happy', 1500)
    say(nextLine())
  }
  const onDown = (e: React.PointerEvent) => {
    if (evo || e.button !== 0) return
    const d = drag.current
    Object.assign(d, { down: true, on: false, pet: false, sx: e.clientX, sy: e.clientY, x: 0, y: 0 })
    try { charEl.current?.setPointerCapture(e.pointerId) } catch { /* */ }
    if (!species) return
    d.petT = window.setTimeout(() => {
      if (d.on || !d.down) return
      d.pet = true
      feel('pet')
      let n = 0
      d.heartT = window.setInterval(() => { if (n++ >= 6) return; if (!reduced) floatEl(HEART_SVG, 'gs2-heart', 1100, (n % 2 ? -1 : 1) * (8 + n * 4)) }, 300)
    }, TOUCH.petMs)
  }
  const onPMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.down || d.pet || !species) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.on && Math.hypot(dx, dy) > TOUCH.dragStartPx) { d.on = true; window.clearTimeout(d.petT); feel('wow') }
    if (d.on && charEl.current) {
      const r = Math.hypot(dx, dy), k = r > TOUCH.dragRadius ? TOUCH.dragRadius / r : 1
      d.x = dx * k; d.y = Math.min(dy * k, TOUCH.dragDown)
      charEl.current.style.transform = `translate(${d.x}px,${d.y}px)${reduced ? '' : ` rotate(${f(d.x / 9)}deg)`}`
    }
  }
  const onUp = () => {
    const d = drag.current
    if (!d.down) return
    d.down = false
    window.clearTimeout(d.petT); window.clearInterval(d.heartT)
    const el = charEl.current
    if (d.on && el) {
      const { x, y } = d, far = Math.hypot(x, y) > TOUCH.dropFarPx
      el.style.transform = ''
      if (reduced) el.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'none' }], { duration: 160 })
      else el.animate([{ transform: `translate(${x}px,${y}px) rotate(${f(x / 9)}deg)` }, { transform: `translate(${f(x * 0.35)}px,${f(Math.min(y, 0) - (far ? 34 : 16))}px) rotate(${f(-x / 14)}deg)`, offset: 0.34 }, { transform: 'translate(0,0) scale(1.08,.89)', offset: 0.6 }, { transform: 'translateY(-9px) scale(.97,1.04)', offset: 0.78 }, { transform: 'scale(1.02,.98)', offset: 0.9 }, { transform: 'none' }], { duration: 680, easing: 'cubic-bezier(.3,.7,.4,1)' })
      feel('happy', 1600)
      later(() => say(far ? TOUCH_LINES.dropFar : TOUCH_LINES.drop), 500)
      d.on = false
      return
    }
    if (d.pet) { d.pet = false; say(TOUCH_LINES.pet); feel('happy', 1500); return }
    tap()
  }
  const callName = () => {
    if (!species) return
    setWave(true); feel('smile', TOUCH.callMs)
    anim([{ transform: 'none' }, { transform: 'rotate(-5deg)', offset: 0.3 }, { transform: 'rotate(-5deg)', offset: 0.7 }, { transform: 'none' }], { duration: 1400 })
    say(TOUCH_LINES.call)
    later(() => setWave(false), TOUCH.callMs)
  }
  const onSceneClick = (e: React.MouseEvent) => {
    const t = (e.target as Element).closest('.trophy') as SVGGElement | null
    if (!t) return
    const tr = raise.trophies.slice(-6)[Number(t.dataset.i)]
    if (tr) { hop(8); say(trophyLine(tr)) }
  }

  const wearNow = (it: Item) => {
    void saveLook(equipItem(raise.look, it.id))
    setToast(undefined)
    feel('happy', 2000); hop(); say(it.slot === 'bg' ? TOUCH_LINES.bg : TOUCH_LINES.wear)
  }

  // ── 장면 ──
  const bg = raise.worn.bg
  const sceneHtml = useMemo(() => scene({ bg, night, decor: species ? decorOn(level, raise.look) : [], trophies: raise.trophies.map(trophyShape), uid: 'gstage' }), [bg, night, species, level, raise.look, raise.trophies])
  const dark = sceneIsDark(bg, night)
  const eq = tempHand ? { ...raise.worn, hand: tempHand } : raise.worn

  // HUD
  const toNext = shown.toNext
  const pct = Math.floor(Math.min(100, (shown.into / toNext) * 100))
  const nx = giftsAt(level + 1)[0]
  const giftHtml = useMemo(() => (nx ? itemIcon(nx.id) : species ? art(species, stageOf(level + 1), { lv: level + 1, path: raise.look.path, crop: 'bust', detail: 'small' }) : ''), [nx, species, level, raise.look.path])
  const stName = STAGES[stage - 1].name
  const t0 = toast?.items[0]

  return (
    <div ref={stageEl} className={`gs2-stage${dark ? ' is-dark' : ''}${reduced ? ' is-still' : ''}`} style={{ background: sceneGround(bg, night) } as CSSProperties} onPointerMove={onMove} onPointerLeave={() => setLookEye(undefined)}>
      <div className="gs2-scene" onClick={onSceneClick} dangerouslySetInnerHTML={{ __html: sceneHtml }} />

      {/* 유리 HUD(43 §18.2) */}
      <div className="gs2-hud">
        <div className="who">
          <HudName name={name} editable={!!species} onCall={callName} />
          <span className="lvb">Lv {shown.level}</span>
          <span className="ttl">{species ? `${titleOf(species, stage, raise.look.path)} · 키 ${cmOf(level)}cm` : '나와 닮은 친구를 찾으면 깨어나요'}</span>
        </div>
        <div className="mid">
          <div>
            <div className="num">{pct}<small>%</small></div>
            <div className="lbl">Lv {level + 1}까지 · {evolutionHint(level)}</div>
          </div>
          {species && (
            <div className="gift">
              <span className="tip">{nx ? `Lv ${level + 1}에 ${nx.name}` : `Lv ${level + 1} 모습`}</span>
              <span className="ico" dangerouslySetInnerHTML={{ __html: giftHtml }} />
            </div>
          )}
        </div>
        <div className="bar" role="progressbar" aria-label="다음 레벨까지" aria-valuenow={shown.into} aria-valuemax={toNext}><i style={{ width: `${pct}%` }} /></div>
        <div className="xpline"><span>{shown.into} / {toNext} XP</span><span>레벨업까지 {toNext - shown.into}</span></div>
        {species ? <div className="tags">{growthTags(level + 1, species).map((t) => <span key={t}>{t}</span>)}</div>
          : <button className="gs2-btn pri" onClick={onSurvey}>나와 닮은 친구 찾기</button>}
      </div>
      <div className="gs2-chips">
        <span className="gs2-chip" title="할 일을 한 날 누적(끊겨도 줄지 않아요)">한 날 <b>{stats.activeDays ?? raise.state.days}</b>일</span>
        <span className="gs2-chip" title={`할 일 XP는 하루 ${XP.taskDailyCap}까지`}>오늘 <b>{stats.todayDone}</b>/{stats.todayDone + stats.todayOpen}</span>
      </div>
      {banner && <div className="gs2-banner" role="status">{banner}</div>}

      {/* 캐릭터 */}
      <div className="gs2-pos" style={{ bottom, width: box, height: box, marginLeft: -box / 2, visibility: evo ? 'hidden' : undefined }}>
        <button
          ref={charEl}
          className="gs2-char"
          aria-label={species ? `${name}, Lv ${level} ${stName}. 눌러서 말 걸기` : '아직 모르는 씨앗. 눌러서 두드리기'}
          onPointerDown={onDown} onPointerMove={onPMove} onPointerUp={onUp} onPointerCancel={onUp}
          onClick={(e) => { if (e.detail === 0) tap() }}
        >
          <span ref={inEl} className="gs2-char__in">
            <CharacterArt species={species} stage={stage} size={box} mood={curMood} look={look} cracks={cracks} fit={false} motion="idle" calm={calm} wave={wave}
              wear={{ lv: level, path: raise.look.path, eq }} label={species ? `${name} ${stName}` : undefined} />
          </span>
        </button>
      </div>
      <div className="gs-live" aria-live="polite">{live}</div>

      {evo && species && (
        <EvolutionMoment species={species} from={evo.from} to={evo.to} path={raise.look.path} eq={raise.worn} reduced={reduced} size={Math.min(270, box)}
          onPath={(p: Path) => void saveLook({ ...raise.look, path: p })}
          onDone={() => { const e = evo; setEvo(undefined); later(() => afterReveal(e.prev, e.level), 50) }} />
      )}

      {toast && t0 && (
        <div className="gs2-toast" role="status" key={toast.id}>
          <span className="ico" dangerouslySetInnerHTML={{ __html: itemIcon(t0.id) }} />
          <div className="tx"><b>{t0.name}{toast.items.length > 1 ? ` 외 ${toast.items.length - 1}개` : ''}</b>{toast.why}</div>
          <div className="bt">
            <button className="gs2-btn pri sm" onClick={() => wearNow(t0)}>{t0.slot === 'bg' ? '깔아 보기' : '입혀 보기'}</button>
            <button className="gs2-btn sm" onClick={() => setToast(undefined)}>나중에</button>
          </div>
        </div>
      )}

      {species && <button className="gs2-btn glass gs2-deco" onClick={() => setPanel(panel ? null : 'ward')} aria-expanded={!!panel}><Shirt aria-hidden />꾸미기</button>}
      {species && <RaisePanel raise={raise} open={!!panel} tab={panel ?? 'ward'} onTab={(t) => setPanel(t)} onClose={() => setPanel(null)} onWorn={() => hop(8)} />}
    </div>
  )
}

function HudName({ name, editable, onCall }: { name: string; editable: boolean; onCall: () => void }) {
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const on = () => editable && setEditing(true)
    window.addEventListener('sprout:growth-rename', on)
    return () => window.removeEventListener('sprout:growth-rename', on)
  }, [editable])
  if (editing) {
    return (
      <input className="gs2-rename" autoFocus defaultValue={name}
        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) void renameCharacter(v); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        onBlur={() => setEditing(false)} />
    )
  }
  return <button className="nm" title={editable ? '눌러서 부르기 · 두 번 눌러 이름 바꾸기' : undefined} onClick={onCall} onDoubleClick={() => editable && setEditing(true)}>{name}</button>
}

/** 진화 길(42px 전신 fit — 43 §18.5): 지나온 = 색, 지금 = 강조, 앞으로 = 실루엣 */
export function StageRoad({ species, level, stage }: { species: Species | null; level: number; stage: number }) {
  const raise = useRaise()
  return (
    <div className="gs-road">
      {STAGES.map((s, i) => {
        const state = s.stage < stage ? 'past' : s.stage === stage ? 'now' : 'future'
        return (
          <div key={s.stage} className="gs-road__item">
            {i > 0 && <span className={`gs-road__line${s.stage <= stage ? ' is-on' : ''}`} />}
            <div className={`gs-road__st is-${state}`} tabIndex={0} aria-label={`${s.name} 단계 Lv ${s.from}${state === 'future' ? ` · ${s.from - level}레벨 남음` : ''}`}>
              <span className="gs-road__dot gs2-road-dot"><CharacterArt species={species} stage={s.stage} size={40} crop="full" lock={state === 'future'} noAura mood="smile" wear={state === 'now' ? undefined : { path: raise.look.path }} /></span>
              <span className="gs-road__lab">{species ? titleOf(species, s.stage, raise.look.path) : s.name}<small>{s.name} · Lv {s.from}</small></span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
