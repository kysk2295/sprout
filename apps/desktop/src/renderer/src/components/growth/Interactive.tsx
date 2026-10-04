import { Heart, Lock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { SPECIES, STAGES, type Species } from '@sprout/schema/growth'
import { addDays } from '@sprout/schema/time'
import type { CharacterRow, XpRow } from '../../data/growth'
import { thisWeek } from '../../data/growth'
import { dayKey } from '../../lib/dates'
import { CharacterArt } from './CharacterArt'

// 10 §3.1 인터랙션 v2 — 살아 있는 캐릭터
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 색종이 한 번 터뜨리기(1.2초 뒤 사라진다) */
export function Confetti({ count = 18, spread = 120 }: { count?: number; spread?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4
    const d = spread * (0.5 + Math.random() * 0.5)
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, r: Math.random() * 360, c: ['#FFD166', '#FF8FA3', '#7BD389', '#7CA7FF', '#C49BFF'][i % 5] }
  }), [count, spread])
  if (reduced()) return null
  return (
    <span className="confetti" aria-hidden>
      {bits.map((b, i) => <i key={i} style={{ '--x': `${b.x}px`, '--y': `${b.y}px`, '--r': `${b.r}deg`, background: b.c } as CSSProperties} />)}
    </span>
  )
}

export type RoomStats = { todayXp: number; todayTasks: number; weekDone: number; goalsDone: number; goalsTotal: number; streak: number; idleDays: number }

function timeOfDay(h = new Date().getHours()) {
  return h < 6 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 20 ? 'evening' : 'night'
}

/** 말풍선 문장: 진행 상황에 맞춰 고른다 */
function lines(name: string, s: RoomStats): string[] {
  const out: string[] = []
  if (s.todayTasks >= 3) out.push(`오늘 ${s.todayTasks}개나 끝냈네! 최고야`)
  else if (s.todayTasks > 0) out.push('오늘도 한 걸음 자랐어')
  else out.push('오늘 첫 할 일, 같이 끝내 볼까?')
  if (s.goalsTotal && s.goalsDone < s.goalsTotal) out.push(`이번 주 목표 ${s.goalsTotal - s.goalsDone}개 남았어, 응원할게`)
  if (s.goalsTotal && s.goalsDone === s.goalsTotal) out.push('이번 주 목표 다 이뤘다! 대단해')
  if (s.streak >= 2) out.push(`${s.streak}일 연속이야! 계속 가 보자`)
  out.push(`${name}${/[가-힣]$/.test(name) && (name.charCodeAt(name.length - 1) - 0xac00) % 28 ? '이' : ''}는 네가 끝낸 일만큼 자라`, '쓰다듬어 줘서 고마워!', '잠깐 쉬어도 괜찮아')
  return out
}

/** 캐릭터 방: 시간대 배경 · 소품 · 숨쉬기 · 깜빡임 · 시선 · 쓰다듬기 · XP 방울 · 레벨업 색종이 */
export function CharacterRoom({ character, level, stage, into, toNext, stats, ready }: { character?: CharacterRow; level: number; stage: number; into: number; toNext: number; stats: RoomStats; ready: boolean }) {
  const species = character?.species ?? null
  const name = species ? (character?.name || SPECIES[species].name) : '알'
  const room = useRef<HTMLDivElement>(null)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const [blink, setBlink] = useState(false)
  const [hop, setHop] = useState(0)
  const [hearts, setHearts] = useState<number[]>([])
  const [bubble, setBubble] = useState<string>()
  const [orb, setOrb] = useState<{ id: number; amount: number }>()
  const [burst, setBurst] = useState(0)
  const lineIdx = useRef(0)
  const prevLevel = useRef(Infinity)
  const mood = hop || hearts.length ? 'happy' : stats.idleDays >= 2 ? 'sleepy' : stats.todayXp > 0 ? 'happy' : 'default'

  // 눈 깜빡임: 3~6초마다
  useEffect(() => {
    if (reduced()) return
    let t: number
    const loop = () => { t = window.setTimeout(() => { setBlink(true); window.setTimeout(() => setBlink(false), 140); loop() }, 3000 + Math.random() * 3000) }
    loop()
    return () => window.clearTimeout(t)
  }, [])
  // XP가 들어오면 깡충 + "+N" 방울
  useEffect(() => {
    const on = (e: Event) => {
      const amount = (e as CustomEvent<number>).detail
      setHop((h) => h + 1)
      setOrb({ id: Date.now(), amount })
    }
    window.addEventListener('sprout:xp', on)
    return () => window.removeEventListener('sprout:xp', on)
  }, [])
  useEffect(() => { if (!orb) return; const t = window.setTimeout(() => setOrb(undefined), 900); return () => window.clearTimeout(t) }, [orb])
  useEffect(() => { if (!hop) return; const t = window.setTimeout(() => setHop(0), 600); return () => window.clearTimeout(t) }, [hop])
  // 레벨이 오르면 색종이
  // 레벨이 오르면 색종이(불러오는 중의 1 → 실제 레벨 변화는 무시)
  const wasReady = useRef(false)
  useEffect(() => {
    if (ready && wasReady.current && level > prevLevel.current) setBurst((b) => b + 1)
    prevLevel.current = level
    wasReady.current = ready
  }, [level, ready])
  useEffect(() => { if (!bubble) return; const t = window.setTimeout(() => setBubble(undefined), 2600); return () => window.clearTimeout(t) }, [bubble])

  const onMove = (e: React.MouseEvent) => {
    const r = room.current?.getBoundingClientRect()
    if (!r) return
    const cx = r.left + r.width / 2
    const cy = r.top + r.height * 0.55
    setLook({ x: Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2))), y: Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2))) })
  }
  const pet = () => {
    setHop((h) => h + 1)
    const id = Date.now()
    setHearts((hs) => [...hs.slice(-4), id])
    window.setTimeout(() => setHearts((hs) => hs.filter((x) => x !== id)), 1100)
    const all = species ? lines(name, stats) : ['톡톡… 누가 날 깨워 줄래?', '성향 조사를 하면 내가 깨어나!']
    setBubble(all[lineIdx.current % all.length])
    lineIdx.current++
  }
  const ringPct = into / toNext

  return (
    <div ref={room} className={`room room--${timeOfDay()} room--${species ?? 'egg'}`} onMouseMove={onMove} onMouseLeave={() => setLook({ x: 0, y: 0 })}>
      <RoomProps species={species} />
      <div className="room__level" title={`다음 레벨까지 ${toNext - into} XP`}>
        <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden>
          <circle cx="22" cy="22" r="19" className="room__ring-bg" />
          <circle cx="22" cy="22" r="19" className="room__ring" style={{ strokeDasharray: `${2 * Math.PI * 19}`, strokeDashoffset: `${2 * Math.PI * 19 * (1 - ringPct)}` }} />
        </svg>
        <span><small>Lv</small>{level}</span>
      </div>
      {stats.streak >= 2 && <div className="room__streak" title="할 일을 끝낸 날이 이어진 수">🔥 {stats.streak}일 연속</div>}
      <button className={`room__char${hop ? ' is-hop' : ''}`} key={hop ? `h${hop}` : 'idle'} onClick={pet} aria-label={`${name} 쓰다듬기`}>
        <span className="room__breath"><CharacterArt species={species} stage={stage} size={150} mood={mood} look={look} blink={blink} /></span>
        {hearts.map((h) => <Heart key={h} className="room__heart" fill="currentColor" />)}
        {mood === 'sleepy' && !bubble && <span className="room__zzz">Zzz</span>}
      </button>
      {bubble && <div className="room__bubble">{bubble}</div>}
      {orb && <span className="room__orb" key={orb.id}>+{orb.amount}</span>}
      {burst > 0 && <span className="room__burst" key={burst}><Confetti count={28} spread={170} /></span>}
    </div>
  )
}

/** 캐릭터마다 다른 방 소품(직접 그린 단순 벡터) */
function RoomProps({ species }: { species: Species | null }) {
  return (
    <svg className="room__props" viewBox="0 0 640 280" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <ellipse cx="320" cy="300" rx="420" ry="70" className="room__ground" />
      {species === 'turtle' && (<><ellipse cx="420" cy="250" rx="60" ry="14" fill="#8FD3F2" opacity="0.75" /><ellipse cx="402" cy="246" rx="14" ry="5" fill="#7BC47F" /><ellipse cx="440" cy="252" rx="10" ry="3.5" fill="#7BC47F" /><circle cx="214" cy="236" r="5" fill="#FFD166" /><path d="M214 241 v14" stroke="#7BC47F" strokeWidth="2" /></>)}
      {species === 'squirrel' && (<><rect x="424" y="140" width="16" height="118" rx="6" fill="#B5835A" /><circle cx="432" cy="126" r="40" fill="#8ED081" /><circle cx="414" cy="116" r="5" fill="#C98E5B" /><circle cx="446" cy="132" r="5" fill="#B5764A" /><ellipse cx="214" cy="252" rx="8" ry="6" fill="#B5764A" /><ellipse cx="232" cy="255" rx="8" ry="6" fill="#C98E5B" /></>)}
      {species === 'cat' && (<><ellipse cx="320" cy="262" rx="90" ry="14" fill="#F4B6C2" opacity="0.85" /><circle cx="430" cy="246" r="13" fill="#9FB8FF" /><path d="M419 246 q11 -10 22 0 M421 251 q9 -6 18 0" stroke="#fff" strokeWidth="2" fill="none" /><path d="M443 250 q14 4 10 14" stroke="#9FB8FF" strokeWidth="2" fill="none" /></>)}
      {species === 'otter' && (<><path d="M0 250 q40 -10 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 V280 H0 Z" fill="#8FD3F2" opacity="0.6" /><circle cx="410" cy="240" r="8" fill="#B8B2A7" /><circle cx="428" cy="244" r="6" fill="#CFC9BE" /><circle cx="444" cy="239" r="7" fill="#A9A397" /></>)}
      {!species && (<><circle cx="220" cy="70" r="3" fill="#fff" opacity="0.8" /><circle cx="430" cy="50" r="2.5" fill="#fff" opacity="0.8" /><circle cx="400" cy="110" r="2" fill="#fff" opacity="0.6" /></>)}
    </svg>
  )
}

/** 진화 로드맵: 지난 단계 · 지금(빛남) · 앞 단계(실루엣 + 자물쇠) */
export function Roadmap({ species, level, stage }: { species: Species | null; level: number; stage: number }) {
  const [hover, setHover] = useState<number>()
  return (
    <div className="roadmap">
      {STAGES.map((s, i) => {
        const state = s.stage < stage ? 'past' : s.stage === stage ? 'now' : 'future'
        return (
          <div key={s.stage} className="roadmap__step-wrap">
            {i > 0 && <span className={`roadmap__line${s.stage <= stage ? ' is-on' : ''}`} />}
            <button className={`roadmap__step is-${state}`} onMouseEnter={() => setHover(s.stage)} onMouseLeave={() => setHover(undefined)} aria-label={`${s.name} 단계 Lv ${s.from}`}>
              <span className="roadmap__art"><CharacterArt species={species} stage={s.stage} size={44} /></span>
              {state === 'future' && <Lock className="roadmap__lock" />}
            </button>
            <span className="roadmap__label">{s.name}<small>Lv {s.from}</small></span>
            {hover === s.stage && state === 'future' && (
              <div className="roadmap__preview"><CharacterArt species={species} stage={s.stage} size={84} /><span>Lv {s.from}에 만나요{level < s.from ? ` · ${s.from - level}레벨 남음` : ''}</span></div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 이번 주 7일 XP 막대 */
export function WeekChart({ events }: { events: XpRow[] }) {
  const start = thisWeek()
  const today = dayKey()
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const totals = days.map((d) => Math.max(0, events.filter((e) => e.day === d).reduce((s, e) => s + e.amount, 0)))
  const max = Math.max(10, ...totals)
  const [hover, setHover] = useState<number>()
  return (
    <div className="weekchart">
      {days.map((d, i) => (
        <div key={d} className="weekchart__col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(undefined)}>
          {hover === i && <span className="weekchart__tip">{totals[i]} XP</span>}
          <div className="weekchart__track"><span className={`weekchart__bar${d === today ? ' is-today' : ''}${d > today ? ' is-future' : ''}`} style={{ height: `${(totals[i] / max) * 100}%`, animationDelay: `${i * 40}ms` }} /></div>
          <span className={`weekchart__day${d === today ? ' is-today' : ''}`}>{['일', '월', '화', '수', '목', '금', '토'][i]}</span>
        </div>
      ))}
    </div>
  )
}

/** 연속 일수: 오늘(없으면 어제)부터 거꾸로 할 일 XP가 있는 날이 이어진 수 */
export function streakOf(events: XpRow[], today = dayKey()): number {
  const days = new Set(events.filter((e) => e.kind === 'task' && e.amount > 0).map((e) => e.day))
  let d = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(d)) { n++; d = addDays(d, -1) }
  return n
}
