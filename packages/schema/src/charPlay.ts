// 49 §5.3 만지기 v3 — 캐릭터를 누르면 깡충·한 바퀴·간지럼·쓰다듬기, 가만히 있으면 가끔 딴짓. 휴대폰·데스크톱이 같이 쓰는 순수 규칙(시간·순서·움직임 키).
// 움직임은 모두 transform(위로 y · 가로세로 늘임 sx/sy · 기울기 rot)과 회전 띠 컷 번호뿐이다(39 §11). 보상 없음(43 §4.1 — 만지기는 아무것도 주지 않는다).
// 단위: y = 캐릭터 상자 높이에 대한 비율(위로 음수), 시간 = ms, 키 t = 0~1.

export type PlayKind = 'hop' | 'spin' | 'giggle' | 'pet' | 'wobble' | 'dizzy' | 'look' | 'stretch' | 'blink' | 'minihop' | 'pulse'
export type Key = { t: number; y?: number; sx?: number; sy?: number; rot?: number }
export type Motion = { kind: PlayKind; ms: number; keys: Key[]; face?: 'happy' | 'wow' | 'think' | 'sleepy'; spin?: { from: number; to: number } }

/** 깡충 ≈ 500ms: 웅크림(준비) → 위로 늘어나며 뜸 → 착지 눌림 → 제자리. 착지 때 흙·잎 조각 */
export const HOP: Motion = {
  kind: 'hop', ms: 520, face: 'happy',
  keys: [
    { t: 0, y: 0, sx: 1, sy: 1 }, { t: 0.16, y: 0, sx: 1.1, sy: 0.88 }, { t: 0.42, y: -0.16, sx: 0.93, sy: 1.09 },
    { t: 0.66, y: 0, sx: 1.12, sy: 0.86 }, { t: 0.82, y: 0, sx: 0.97, sy: 1.03 }, { t: 1, y: 0, sx: 1, sy: 1 }
  ]
}
/** 한 바퀴 ≈ 900ms: 웅크림 → 높이 뛰어(0.3) 공중에서 회전 띠 0 → 12컷 → 착지 눌림. 회전 동안 옷 층은 숨긴다 */
export const SPIN: Motion = {
  kind: 'spin', ms: 900, face: 'happy', spin: { from: 0.22, to: 0.72 },
  keys: [
    { t: 0, y: 0, sx: 1, sy: 1 }, { t: 0.14, y: 0, sx: 1.12, sy: 0.86 }, { t: 0.3, y: -0.26, sx: 0.94, sy: 1.08 },
    { t: 0.5, y: -0.32, sx: 1, sy: 1 }, { t: 0.72, y: -0.06, sx: 1, sy: 1 }, { t: 0.8, y: 0, sx: 1.13, sy: 0.85 },
    { t: 0.9, y: 0, sx: 0.97, sy: 1.04 }, { t: 1, y: 0, sx: 1, sy: 1 }
  ]
}
/** 간지럼 720ms: 웃음 + 좌우로 비틀기 ±7° 7번 */
export const GIGGLE: Motion = {
  kind: 'giggle', ms: 720, face: 'happy',
  keys: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ t: i / 7, rot: i === 0 || i === 7 ? 0 : i % 2 ? -7 : 7, sx: 1, sy: i % 2 ? 0.97 : 1.02, y: 0 }))
}
/** 쓰다듬기(누르고 있는 동안 되풀이) 1.6s: 웃음 + 느린 좌우 흔들림 ±4° + 살짝 눌림 */
export const PET: Motion = {
  kind: 'pet', ms: 1600, face: 'happy',
  keys: [{ t: 0, rot: 0, sy: 0.97, sx: 1.02 }, { t: 0.25, rot: -4, sy: 0.96, sx: 1.03 }, { t: 0.75, rot: 4, sy: 0.96, sx: 1.03 }, { t: 1, rot: 0, sy: 0.97, sx: 1.02 }]
}
/** 끌었다 놓기 680ms: 놀람 → 출렁 → 통통 → 제자리 */
export const WOBBLE: Motion = {
  kind: 'wobble', ms: 680, face: 'wow',
  keys: [{ t: 0, y: -0.06, rot: 0 }, { t: 0.25, y: 0, sx: 1.12, sy: 0.86, rot: -6 }, { t: 0.45, y: -0.05, sx: 0.95, sy: 1.06, rot: 5 }, { t: 0.65, y: 0, sx: 1.05, sy: 0.95, rot: -3 }, { t: 0.82, rot: 1.5, sx: 1, sy: 1 }, { t: 1, y: 0, rot: 0, sx: 1, sy: 1 }]
}
/** 흔들기(휴대폰): 어지러움 1100ms — 생각 얼굴 + 크게 휘청 */
export const DIZZY: Motion = {
  kind: 'dizzy', ms: 1100, face: 'think',
  keys: [{ t: 0, rot: 0 }, { t: 0.15, rot: -10, sx: 1.03, sy: 0.97 }, { t: 0.35, rot: 9 }, { t: 0.55, rot: -7 }, { t: 0.75, rot: 4 }, { t: 0.9, rot: -2 }, { t: 1, rot: 0, sx: 1, sy: 1 }]
}
/** 딴짓(8~15초마다, 화면에 보일 때만) */
export const IDLE: Record<'look' | 'stretch' | 'blink' | 'minihop', Motion> = {
  look: { kind: 'look', ms: 1400, face: 'think', keys: [{ t: 0, rot: 0 }, { t: 0.25, rot: -3 }, { t: 0.6, rot: 3 }, { t: 1, rot: 0 }] },
  stretch: { kind: 'stretch', ms: 1300, face: 'sleepy', keys: [{ t: 0, sx: 1, sy: 1 }, { t: 0.45, sx: 0.95, sy: 1.07 }, { t: 0.7, sx: 0.95, sy: 1.07 }, { t: 1, sx: 1, sy: 1 }] },
  blink: { kind: 'blink', ms: 160, face: 'sleepy', keys: [{ t: 0 }, { t: 1 }] },
  minihop: { ...HOP, kind: 'minihop', ms: 420, face: undefined, keys: HOP.keys.map((k) => ({ ...k, y: (k.y ?? 0) * 0.45, sx: 1 + ((k.sx ?? 1) - 1) * 0.6, sy: 1 + ((k.sy ?? 1) - 1) * 0.6 })) }
}
/** 움직임 줄이기: 뛰기·돌기 없이 얼굴 + 아주 작은 맥박(1 → 1.04 → 1) */
export const PULSE: Motion = { kind: 'pulse', ms: 260, keys: [{ t: 0, sx: 1, sy: 1 }, { t: 0.5, sx: 1.04, sy: 1.04 }, { t: 1, sx: 1, sy: 1 }] }

/** 시간 t(0~1)의 값 — 키 사이를 부드럽게(smoothstep) 잇는다. 데스크톱 rAF·시험용(휴대폰은 같은 키를 reanimated withSequence로) */
export function sample(m: Motion, t: number): Required<Omit<Key, 't'>> {
  const ks = m.keys
  const get = (f: 'y' | 'sx' | 'sy' | 'rot', d: number) => {
    let a: Key | null = null, b: Key | null = null
    for (const k of ks) { if (k[f] === undefined) continue; if (k.t <= t) a = k; if (k.t >= t && !b) b = k }
    if (!a && !b) return d
    if (!a) return b![f]!
    if (!b || b === a) return a[f]!
    const u = (t - a.t) / Math.max(1e-6, b.t - a.t), s = u * u * (3 - 2 * u)
    return a[f]! + (b[f]! - a[f]!) * s
  }
  return { y: get('y', 0), sx: get('sx', 1), sy: get('sy', 1), rot: get('rot', 0) }
}
/** 회전 띠 컷 번호(0 ~ frames-1, 끝나면 0) */
export function spinFrame(m: Motion, t: number, frames: number): number {
  if (!m.spin || t <= m.spin.from || t >= m.spin.to) return 0
  return Math.floor(((t - m.spin.from) / (m.spin.to - m.spin.from)) * frames) % frames
}
/** 키 사이 시간(ms) 목록 — reanimated withSequence에 그대로: [{ value, ms }] */
export function track(m: Motion, f: 'y' | 'sx' | 'sy' | 'rot', d: number): { v: number; ms: number }[] {
  const ks = m.keys.filter((k) => k[f] !== undefined)
  if (!ks.length) return []
  const out: { v: number; ms: number }[] = []
  let last = 0
  for (const k of ks) { out.push({ v: k[f]!, ms: Math.max(0, Math.round((k.t - last) * m.ms)) }); last = k.t }
  if (out[out.length - 1].v !== d) out.push({ v: d, ms: Math.round((1 - last) * m.ms) || 60 })
  return out
}

/* ───────── 누르기 판정 ───────── */
export type TapState = { taps: number[]; count: number; lastSpin: number; coolUntil: number }
export const newTapState = (): TapState => ({ taps: [], count: 0, lastSpin: -1e9, coolUntil: 0 })
export const DOUBLE_MS = 300, RAPID_MS = 1200, RAPID_N = 4, GIGGLE_COOL = 4000, SPIN_EVERY = 3
/** 누를 때마다: 빠르게 4번 이상 = 간지럼(그 뒤 4초 쉼 — 쉬는 동안은 깡충만), 두 번 연달아 또는 3번째마다 = 한 바퀴, 나머지 = 깡충.
 *  움직임 줄이기면 모두 맥박. 반환: 움직임 + 다음 상태(순수 함수) */
export function onTap(s: TapState, now: number, reduced = false): { motion: Motion; state: TapState } {
  const taps = [...s.taps.filter((t) => now - t < RAPID_MS), now]
  const count = s.count + 1
  let motion: Motion
  let coolUntil = s.coolUntil, lastSpin = s.lastSpin
  const cooling = now < s.coolUntil
  if (reduced) motion = PULSE
  else if (!cooling && taps.length >= RAPID_N) { motion = GIGGLE; coolUntil = now + GIGGLE_COOL }
  else if (cooling) motion = HOP
  else if ((taps.length >= 2 && now - taps[taps.length - 2] < DOUBLE_MS) || count % SPIN_EVERY === 0) { motion = SPIN; lastSpin = now }
  else motion = HOP
  return { motion, state: { taps: motion.kind === 'giggle' ? [] : taps, count: motion.kind === 'spin' || motion.kind === 'giggle' ? 0 : count, lastSpin, coolUntil } }
}
/** 다음 딴짓까지(8~15초) — rnd는 0~1 */
export const nextIdleMs = (rnd: number) => 8000 + Math.round(rnd * 7000)
/** 딴짓 고르기(둘러보기 · 기지개 · 깜빡 · 작은 깡충) — 움직임 줄이기면 깜빡만 */
export function pickIdle(rnd: number, reduced = false): Motion {
  if (reduced) return IDLE.blink
  const order: (keyof typeof IDLE)[] = ['look', 'blink', 'stretch', 'minihop']
  return IDLE[order[Math.min(3, Math.floor(rnd * 4))]]
}
/** 착지 시각(ms, 진동·흙먼지) — 키 중 처음으로 y가 0으로 돌아오며 눌리는 때 */
export function landAt(m: Motion): number | null {
  let air = false
  for (const k of m.keys) {
    if ((k.y ?? 0) < -0.02) air = true
    else if (air && (k.sy ?? 1) < 0.95) return Math.round(k.t * m.ms)
  }
  return null
}
