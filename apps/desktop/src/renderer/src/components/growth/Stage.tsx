import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bitSvg, headTop3d, MASCOT, MASCOT_LINES, MASCOT_NAME, SCENES3D, sceneDark, sceneGlass, sceneKeyFor, titleOf } from '@sprout/schema/characterArt'
import { SPECIES, STAGES, stageOf, XP, type Species } from '@sprout/schema/growth'
import { addDays } from '@sprout/schema/time'
import { cheerLine, cheerStamp, cheerToShow, streakOf } from '@sprout/schema/streak'
import {
  activeDayList, dayJustDone, decorOn, equipItem, giftsAt, isBusy, isNight, ITEM_BY_ID, momentLine, pickDayMoment, tapLines,
  TOUCH, TOUCH_LINES, type CharacterItemRow, type DayMoment, type Item, type Path
} from '@sprout/schema/wardrobe'
import { catchUpOf, isSleepy, levelOfTotal, readSeenAt, renameCharacter, setGrowthStageActive, stageLines, thisWeek, writeSeenAt, type CharacterRow, type StageStats, type XpRow } from '../../data/growth'
import { isProjectDeadlineToday, RAISE_FRESH, RAISE_PANEL, saveLook, useRaise } from '../../data/raise'
import { dayKey } from '../../lib/dates'
import { CharacterArt, type CharacterMood } from './CharacterArt'
import { PlayableCharacter, type PlayHandle } from './PlayableCharacter'
import { EvolutionMoment } from './EvolutionMoment'
import { SeedPic, useDocDark } from './MakeFlow'
import { ItemPic, LOOKS, RaisePanel } from './RaisePanel'
import { SceneBackdrop } from './Scene3D'
import { StreakChip } from './Flame'
import { clampBubble, springStep } from './follow'
import './raise.css'

// 10 §3.2 무대(캐릭터 방) + 43 키우기 + 49 §6 v3: 3D 정원 장면이 끝까지(입은 배경 · 다크/늦은 밤 = 밤) · 이끼 돌 받침 위 캐릭터(숨쉬기) ·
// 유리 주 달력 띠 · 유리 HUD(Lv 배지 · 이름 · 단계 이름 · 큰 % · 꼬리 칩 · 막대 14px · 옷장/도감/이번 주) · 방 장식 = 장면 위 3D 소품.
// 만지기(누르기·쓰다듬기·간지럼·끌기·부르기) · 하루 장면 5 · 레벨업 → 선물 카드 → 입혀 보기 · 진화 순간(+두 갈래) · 옷장·도감 패널.
// 칩 = 연속 불꽃(43 §19, 해금은 누적) · 말풍선은 머리를 따라간다(49 §7.2 — rAF가 따라가기 층 transform만, 다시 그리기 없음).
// 트로피 선반은 장면에서 빼고 도감 트로피 목록에 남긴다. 움직임은 transform · opacity만(WAAPI). 만지기는 아무것도 주지 않는다(43 §1).
type Progress = { total: number; level: number; into: number; toNext: number; stage: number }
type Pt = { x: number; y: number }
type Evo = { from: number; to: number; level: number; prev: number }

// 성향 조사 전 마스코트(아기 달팽이, 49 §15)의 말
const EGG_LINES = MASCOT_LINES
const HUD_W = 340, PANEL_W = 312
/** 무대 배치: 장면 그림을 칸보다 넓게 깔고(가로로 밀 여유) 받침이 캐릭터 발밑 자리에 오게 한다.
 *  넓은 칸 = 캐릭터가 HUD 오른쪽 빈 곳 가운데, 좁은 칸 = 가운데(HUD는 아래 전체), 옷장·도감이 열리면 패널 왼쪽 가운데 */
function stageGeo(w: number, h: number, sceneKey: string, panel: boolean) {
  const m = SCENES3D[sceneKey] ?? { perch: [0.5, 0.6], aspect: 2 }
  const narrow = w < 720
  const box = narrow ? 200 : 260
  const xClosed = narrow ? w / 2 : Math.max(w / 2, (18 + HUD_W + w) / 2)
  const xOpen = Math.max(box / 2 + 8, (w - PANEL_W) / 2)
  const footY = narrow ? Math.max(box * 0.95, h - 238) : Math.round(h * 0.76)
  const maxShift = Math.max(Math.abs(xClosed - w / 2), Math.abs(xOpen - w / 2))
  const imgW = Math.max(w + 2 * maxShift, 420), imgH = imgW * m.aspect
  const shift = (panel ? xOpen : xClosed) - w / 2
  return { narrow, box, footY, shift, img: { left: w / 2 - m.perch[0] * imgW, top: footY - m.perch[1] * imgH, width: imgW, height: imgH } }
}
const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* */ } } }
const f = (n: number) => +n.toFixed(2)
const rowsToItems = (rows: CharacterItemRow[]) => rows.map((r) => ITEM_BY_ID[r.item_id]).filter((x): x is Item => !!x)

export function GrowthStage({ character, events, progress, ready, stats, reduced, onSurvey, onQuests, onDiary }: {
  character?: CharacterRow; events: XpRow[]; progress: Progress; ready: boolean; stats: StageStats; reduced: boolean
  onSurvey: () => void; onQuests?: () => void; onDiary: () => void
}) {
  const raise = useRaise()
  const species: Species | null = raise.species
  const name = species ? (character?.name || SPECIES[species].name) : MASCOT_NAME
  const stageEl = useRef<HTMLDivElement>(null)
  const charEl = useRef<HTMLElement | null>(null)
  const pc = useRef<PlayHandle>(null)

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

  // ── 표시용 XP(방울이 닿을 때마다 찬다) ──
  const [shownTotal, setShownTotal] = useState<number | null>(null)
  const settled = useRef(progress.total)
  const flying = useRef(0)
  useEffect(() => { if (shownTotal === null && flying.current === 0) settled.current = progress.total }, [progress.total, shownTotal])
  const shown = shownTotal === null ? progress : { ...levelOfTotal(shownTotal), total: shownTotal, stage: progress.stage }
  const stage = progress.stage
  const level = progress.level

  // ── 반응 상태 ──
  const [mood, setMood] = useState<{ m: CharacterMood; id: number }>()
  const [wave, setWave] = useState(false)
  const [tempHand, setTempHand] = useState<string | null>(null)
  const [woke, setWoke] = useState(false)
  const [banner, setBanner] = useState<string>()
  const [evo, setEvo] = useState<Evo>()
  const [toast, setToast] = useState<{ items: Item[]; why: string; id: number }>()
  const [panel, setPanel] = useState<'ward' | 'dex' | null>(null)
  /** 옷장 배경 탭에서 미리 보는 배경(49 §6.1) — 적용 전이라 저장하지 않는다. 옷장을 닫거나 도감으로 가면 원래대로 */
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => { if (panel !== 'ward') setPreview(null) }, [panel])
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
  const anim = useCallback((frames: Keyframe[], o: KeyframeAnimationOptions) => { const el = pc.current?.inner; if (reduced || !el) return; el.animate(frames, o) }, [reduced])
  /** 깡충(49 §7.1 HOP — 움직임 줄이기면 맥박) · 작은 깡충 */
  const hop = useCallback((small?: number) => pc.current?.play(small ? 'minihop' : 'hop'), [])
  const floatEl = useCallback((html: string, cls: string, ms = 900, dx = 0) => {
    const host = charEl.current
    if (!host) return
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html; if (dx) d.style.marginLeft = `${dx}px`; host.appendChild(d)
    const a = reduced ? d.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: ms }) : d.animate([{ opacity: 0, transform: 'translateY(6px) scale(.8)' }, { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.2 }, { opacity: 0, transform: 'translateY(-30px) scale(1)' }], { duration: ms, easing: 'ease-out' })
    a.onfinish = () => d.remove()
  }, [reduced])
  // ── 말풍선 따라가기(49 §7.2): 따라가기 층(.gs2-follow)을 머리 점으로 스프링(살짝 늦게), 무대 안에 가둠, 꼬리는 머리 쪽으로 ──
  const followEl = useRef<HTMLDivElement>(null)
  const geoRef = useRef({ left: 0, top: 0, box: 0, headY: 0.2, w: 0, still: false })
  const fol = useRef({ raf: 0, last: 0, snap: true, x: 0, y: 0, vx: 0, vy: 0, bw: 0, bh: 0, tail: 0 })
  const followTick = useCallback((now: number) => {
    const F = fol.current, el = followEl.current, b = el?.querySelector<HTMLElement>('.gs2-say')
    if (!el || !b) { F.raf = 0; F.last = 0; if (el) el.style.transform = ''; return }
    const d = pc.current?.headShift() ?? { x: 0, y: 0 }
    const dt = F.last ? (now - F.last) / 1000 : 0
    F.last = now
    if (F.snap || geoRef.current.still) { F.x = d.x; F.y = d.y; F.vx = 0; F.vy = 0; F.snap = false }
    else { const a = springStep(F.x, F.vx, d.x, dt), c = springStep(F.y, F.vy, d.y, dt); F.x = a.pos; F.vx = a.vel; F.y = c.pos; F.vy = c.vel }
    const G = geoRef.current
    const c = clampBubble(G.left + G.box / 2, G.top + G.headY * G.box - 6 - F.bh, F.x, F.y, F.bw, G.w, 8)
    el.style.transform = `translate3d(${f(c.x)}px, ${f(c.y)}px, 0)`
    if (Math.abs(c.tail - F.tail) > 0.4) { F.tail = c.tail; b.style.setProperty('--tail', `${f(c.tail)}px`) }
    F.raf = requestAnimationFrame(followTick)
  }, [])
  useEffect(() => () => { if (fol.current.raf) cancelAnimationFrame(fol.current.raf) }, [])
  const say = useCallback((text: string, ms: number = TOUCH.sayMs) => {
    const host = followEl.current ?? charEl.current
    if (!host) return
    host.querySelectorAll('.gs2-say').forEach((s) => s.remove())
    const b = document.createElement('div'); b.className = 'gs2-say'; b.textContent = text; host.appendChild(b)
    if (host === followEl.current) {
      const F = fol.current
      F.bw = b.offsetWidth; F.bh = b.offsetHeight; F.tail = 0
      if (!F.raf) { F.snap = true; F.last = 0; F.raf = requestAnimationFrame(followTick) }
    }
    setLive(text)
    if (text.startsWith('일기')) b.onclick = (e) => { e.stopPropagation(); onDiary() }
    b.animate(reduced ? [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }] : [{ opacity: 0, transform: 'translateX(-50%) translateY(6px) scale(.9)', easing: 'cubic-bezier(.34,1.56,.64,1)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.08 }, { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.88 }, { opacity: 0, transform: 'translateX(-50%) scale(1)' }], { duration: ms }).onfinish = () => b.remove() // 튀는 곡선은 나타날 때만(전체에 걸면 0.9초 만에 사라졌다)
  }, [reduced, onDiary, followTick])
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

  // ── 만지기(43 §4.1 · 49 §7.1 v3) — 움직임은 PlayableCharacter(깡충 · 한 바퀴 · 간지럼 · 쓰다듬기 · 끌기 · 딴짓), 여기서는 말풍선 · 씨앗 · 졸음 ──
  const intercept = () => {
    if (!species) { hop(); say(nextLine()); return true }
    if (sleepy) { setWoke(true); feel('default', TOUCH.wakeMs); hop(8); say(TOUCH_LINES.wake); return true }
    return false
  }
  const onReact = (kind: string) => {
    if (kind === 'giggle') { feel('giggle', 1800); say(TOUCH_LINES.tickle); return }
    feel('happy', 1500)
    say(nextLine())
  }
  const onPetEnd = () => { say(TOUCH_LINES.pet); feel('happy', 1500) }
  const onDrop = (far: boolean) => { feel('happy', 1600); later(() => say(far ? TOUCH_LINES.dropFar : TOUCH_LINES.drop), 500) }
  const callName = () => {
    if (!species) return
    setWave(true); feel('smile', TOUCH.callMs)
    anim([{ transform: 'none' }, { transform: 'rotate(-5deg)', offset: 0.3 }, { transform: 'rotate(-5deg)', offset: 0.7 }, { transform: 'none' }], { duration: 1400 })
    say(TOUCH_LINES.call)
    later(() => setWave(false), TOUCH.callMs)
  }
  const wearNow = (it: Item) => {
    void saveLook(equipItem(raise.look, it.id))
    setToast(undefined)
    feel('happy', 2000); hop(); say(it.slot === 'bg' ? TOUCH_LINES.bg : TOUCH_LINES.wear)
  }

  // ── 장면(49 §6) ──
  const docDark = useDocDark()
  const bg = preview ?? raise.worn.bg
  // '자동'은 시각이 장면을 정한다(늦은 밤 = 별밤). 다른 배경은 다크 테마·늦은 밤에 밤 짝
  const sceneKey = sceneKeyFor(bg, docDark || (bg !== 'auto' && night), hour)
  const dark = sceneDark(sceneKey)
  const glass = sceneGlass(sceneKey)
  // 장면이 바뀌면(미리 보기·적용·시각) 0.3초 교차 페이드: 옛 장면을 아래에 잠깐 남긴다
  const [sc, setSc] = useState<{ cur: string; prev: string | null }>({ cur: sceneKey, prev: null })
  if (sc.cur !== sceneKey) setSc({ cur: sceneKey, prev: sc.cur })
  useEffect(() => {
    if (!sc.prev) return
    const t = window.setTimeout(() => setSc((x) => ({ ...x, prev: null })), 320)
    return () => window.clearTimeout(t)
  }, [sc.prev, sc.cur])
  const geo = stageGeo(dims.w, dims.h, sceneKey, !!panel)
  const box = geo.box
  const footX = dims.w / 2 + geo.shift
  const eq = tempHand ? { ...raise.worn, hand: tempHand } : raise.worn
  const seed = raise.look.seed ?? 0
  const head = species ? headTop3d(species, stage, raise.look.path, seed) : headTop3d(MASCOT.sp, MASCOT.st, 'a', MASCOT.seed)
  geoRef.current = { left: dims.w / 2 - box / 2 + geo.shift, top: geo.footY - box * 0.9, box, headY: head.y, w: dims.w, still: reduced }

  // ── 연속 불꽃(43 §19): 오늘 아직이면 어제까지. 이정표 3·7·14·30은 오늘 닿은 날 한 번(기기 저장) — 칩 톡 + 반짝이 + 깡충 + 한 줄 ──
  const streak = useMemo(() => streakOf(activeDayList(events), dayKey()), [events, hour]) // eslint-disable-line react-hooks/exhaustive-deps
  const chipEl = useRef<HTMLSpanElement>(null)
  const cheer = useCallback((n: number) => {
    const chip = chipEl.current
    if (chip && !reduced) {
      chip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.3 }, { transform: 'scale(.97)', offset: 0.65 }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' })
      for (let i = 0; i < 5; i++) {
        const d = document.createElement('i'); d.className = 'gs3-spark'; d.style.background = i % 2 ? '#FFD36B' : '#FF9A45'; chip.appendChild(d)
        const a = -Math.PI / 2 + (i - 2) * 0.55, r = 20 + (i % 2) * 8
        d.animate([{ transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translate(calc(-50% + ${f(Math.cos(a) * r)}px), calc(-50% + ${f(Math.sin(a) * r)}px)) scale(.6)`, opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both' }).onfinish = () => d.remove()
      }
    }
    feel('happy', 2200); hop(); say(cheerLine(n), 3200)
  }, [reduced, feel, hop, say])
  useEffect(() => {
    if (!ready || !character || !species || evo) return
    const today = dayKey(), key = `sprout.streakCheer.${character.id}`
    const n = cheerToShow(streak, today, ls.get(key))
    if (!n) return
    ls.set(key, cheerStamp(today, n))
    later(() => cheer(n), 1600)
  }, [ready, character, species, evo, streak, later, cheer])

  // HUD
  const toNext = shown.toNext
  const pct = Math.floor(Math.min(100, (shown.into / toNext) * 100))
  const tasksLeft = Math.max(1, Math.ceil((toNext - shown.into) / XP.task))
  const stName = STAGES[stage - 1].name
  const t0 = toast?.items[0]
  const looksSeen = LOOKS.filter(([s]) => s <= stage).length
  // 주 달력 띠: 오늘 = 강조색 원, 할 일을 한 날 = 옅은 원(43 누적 그대로)
  const today = dayKey()
  const week = thisWeek()
  const didDays = new Set(events.filter((e) => e.kind === 'task' && e.amount > 0).map((e) => e.day))
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const shiftStyle = { transform: `translateX(${Math.round(geo.shift)}px)` }
  const decor = species ? decorOn(level, raise.look) : []
  const prevGeo = sc.prev ? stageGeo(dims.w, dims.h, sc.prev, !!panel) : null
  // 유리 HUD · 글자 톤을 장면마다(49 §6.1 sceneGlass)
  const toneStyle = {
    ['--g-glass' as string]: glass.fill, ['--g-line' as string]: glass.line, ['--g-ink' as string]: glass.ink, ['--g-sub' as string]: glass.sub,
    ['--glass' as string]: glass.fill, ['--glass-ink' as string]: glass.ink, ['--glass-line' as string]: glass.line
  }

  return (
    <div ref={stageEl} className={`gs2-stage gs3${dark ? ' is-dark' : ''}${reduced ? ' is-still' : ''}${geo.narrow ? ' is-narrow' : ''}${panel ? ' is-panel' : ''}`} style={toneStyle}>
      {sc.prev && prevGeo && dims.w > 0 && (
        <div className="gs3-scene" style={shiftStyle} aria-hidden="true">
          <SceneBackdrop sceneKey={sc.prev} decor={decor} style={{ position: 'absolute', ...prevGeo.img }} />
        </div>
      )}
      <div key={sceneKey} className={`gs3-scene${sc.prev ? ' is-in' : ''}`} style={shiftStyle}>
        {dims.w > 0 && <SceneBackdrop sceneKey={sceneKey} decor={decor} style={{ position: 'absolute', ...geo.img }} />}
      </div>

      {/* 유리 주 달력 띠 */}
      <div className="gs3-week gs3-glass" aria-label="이번 주">
        {days.map((d) => {
          const x = new Date(`${d}T00:00`)
          return (
            <div key={d}><b>{'일월화수목금토'[x.getDay()]}</b><span className={d === today ? 'is-today' : didDays.has(d) ? 'is-did' : d > today ? 'is-future' : ''} aria-label={`${x.getMonth() + 1}월 ${x.getDate()}일${d === today ? ' 오늘' : didDays.has(d) ? ' 할 일 한 날' : ''}`}>{x.getDate()}</span></div>
          )
        })}
      </div>
      <div className="gs3-chips">
        <StreakChip ref={chipEl} streak={streak} />
        <span className="gs3-pill gs3-glass" title={`할 일 XP는 하루 ${XP.taskDailyCap}까지`}>오늘 <b>{stats.todayDone}</b>/{stats.todayDone + stats.todayOpen}</span>
      </div>
      {banner && <div className="gs2-banner" role="status">{banner}</div>}

      {/* 유리 HUD(49 §6) */}
      <div className="gs3-hud gs3-glass" aria-hidden={!!panel}>
        <div className="lv"><em>Lv {shown.level}</em><HudName name={name} editable={!!species} onCall={callName} /><span className="ttl">{species ? `· ${titleOf(species, stage, raise.look.path)}` : "· 안내 달팽이"}</span></div>
        {species ? (
          <>
            <div className="row2">
              <div className="big">{pct}<small>%</small></div>
              <div className="tail">할 일 {tasksLeft}개 더 하면 Lv {shown.level + 1}</div>
            </div>
            <div className="cap"><span>다음 레벨까지</span><span>{shown.into} / {toNext} XP</span></div>
            <div className="bar" role="progressbar" aria-label="다음 레벨까지" aria-valuenow={shown.into} aria-valuemin={0} aria-valuemax={toNext}><i style={{ width: `${pct}%` }} /></div>
            <div className="quick">
              <button onClick={() => setPanel('ward')} tabIndex={panel ? -1 : 0}><CharacterArt species={species} stage={stage} size={34} crop="bust" wear={{ path: raise.look.path, eq: raise.worn, seed }} />옷장</button>
              <button onClick={() => setPanel('dex')} tabIndex={panel ? -1 : 0}><CharacterArt species={species} stage={Math.min(5, stage + 1)} size={34} crop="bust" lock wear={{ path: raise.look.path, seed }} />도감 {looksSeen}/{LOOKS.length}</button>
              <button onClick={() => onQuests?.()} tabIndex={panel ? -1 : 0}><SeedPic seed={seed} size={34} />이번 주</button>
            </div>
          </>
        ) : (
          <>
            <p className="egg">씨앗을 깨우면 나와 닮은 친구가 태어나요. 할 일을 끝낼 때마다 함께 자라요.</p>
            <button className="gs2-btn pri gs3-wake" onClick={onSurvey}>씨앗 깨우기</button>
          </>
        )}
      </div>

      {/* 캐릭터(받침 위) */}
      <div className="gs2-pos" style={{ left: dims.w / 2 - box / 2, top: geo.footY - box * 0.9, width: box, height: box, visibility: evo ? 'hidden' : undefined, ...shiftStyle }}>
        <PlayableCharacter
          level="full" handle={pc} hostRef={charEl} reduced={reduced} disabled={!!evo}
          buttonClass="gs2-char" innerClass="gs2-char__in"
          style={{ ['--head' as string]: `${Math.round((1 - head.y) * 100)}%` }}
          buttonLabel={species ? `${name}, Lv ${level} ${stName}. 눌러서 말 걸기` : `${MASCOT_NAME}, 꿈틀 안내 달팽이. 눌러서 말 걸기`}
          intercept={intercept} onReact={onReact} onPetEnd={onPetEnd} onDrop={onDrop}
          species={species} stage={stage} size={box} mood={curMood} motion="idle" calm={calm} wave={wave}
          wear={{ lv: level, path: raise.look.path, eq, seed }} label={`${name} ${stName}`}
        />
        <div ref={followEl} className="gs2-follow" style={{ ['--head' as string]: `${Math.round((1 - head.y) * 100)}%` }} aria-hidden="true" />
      </div>
      <div className="gs-live" aria-live="polite">{live}</div>

      {evo && species && (
        <EvolutionMoment species={species} from={evo.from} to={evo.to} path={raise.look.path} eq={raise.worn} seed={seed} reduced={reduced} size={box} foot={{ x: footX, y: geo.footY }}
          onPath={(p: Path) => void saveLook({ ...raise.look, path: p })}
          onDone={() => { const e = evo; setEvo(undefined); later(() => afterReveal(e.prev, e.level), 50) }} />
      )}

      {toast && t0 && (
        <div className="gs2-toast" role="status" key={toast.id}>
          <span className="ico"><ItemPic id={t0.id} size={40} /></span>
          <div className="tx"><b>{t0.name}{toast.items.length > 1 ? ` 외 ${toast.items.length - 1}개` : ''}</b>{toast.why}</div>
          <div className="bt">
            <button className="gs2-btn pri sm" onClick={() => wearNow(t0)}>{t0.slot === 'bg' ? '깔아 보기' : '입혀 보기'}</button>
            <button className="gs2-btn sm" onClick={() => setToast(undefined)}>나중에</button>
          </div>
        </div>
      )}

      {species && <RaisePanel raise={raise} open={!!panel} tab={panel ?? 'ward'} onTab={(t) => setPanel(t)} onClose={() => setPanel(null)} onWorn={() => hop(8)} preview={preview} onPreview={setPreview} />}
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
