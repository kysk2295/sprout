// 49 §7.1 만지기 v3(휴대폰) — PlayableCharacter의 순수 계산. 움직임 키·누르기 판정은 공용 @sprout/schema/charPlay, 여기는 휴대폰에서 그걸 돌리는 방법만:
// 반응이 겹칠 때 고르기 · reanimated withSequence에 넣을 [값, ms] · 회전 띠 컷 번호(UI 스레드 worklet) · 착지 흙·잎 조각과 쓰다듬기 조각 자리.
import { HOP, type Motion, type PlayKind } from '@sprout/schema/charPlay'

/** 반응 우선순위 — 진행 중인 것보다 높아야 끊고 새로 시작한다(같거나 낮으면 판정만 하고 버림 — 겹치지 않게) */
export const PRIORITY: Record<PlayKind, number> = {
  look: 0, stretch: 0, blink: 0, minihop: 0,
  hop: 1, pulse: 1,
  spin: 2,
  giggle: 3, pet: 3, wobble: 3, dizzy: 3
}
export const shouldStart = (cur: PlayKind | null, next: PlayKind): boolean => cur === null || PRIORITY[next] > PRIORITY[cur]

/** 띠가 없으면(종 묶음 전·아직 안 구움) 한 바퀴 대신 깡충 */
export const withStrip = (m: Motion, hasStrip: boolean): Motion => (m.kind === 'spin' && !hasStrip ? HOP : m)

/** 한 값의 키 → [{v, ms}]. loop면 끝에 기본값을 덧붙이지 않는다(쓰다듬기 되풀이). 키가 없으면 기본값으로 짧게 돌아간다 */
export function steps(m: Motion, f: 'y' | 'sx' | 'sy' | 'rot', d: number, loop = false): { v: number; ms: number }[] {
  const ks = m.keys.filter((k) => k[f] !== undefined)
  if (!ks.length) return [{ v: d, ms: 120 }]
  const out: { v: number; ms: number }[] = []
  let last = 0
  for (const k of ks) { out.push({ v: k[f]!, ms: Math.max(0, Math.round((k.t - last) * m.ms)) }); last = k.t }
  if (!loop && out[out.length - 1].v !== d) out.push({ v: d, ms: Math.round((1 - last) * m.ms) || 60 })
  return out
}

/** 회전 띠 컷 번호 — 돌지 않으면 -1(그때는 층 그림을 보인다). UI 스레드에서 부른다 */
export function spinCut(t: number, from: number, to: number, frames: number): number {
  'worklet'
  if (frames <= 0 || t <= from || t >= to) return -1
  return Math.min(frames - 1, Math.floor(((t - from) / (to - from)) * frames + 1e-6))
}

/** 얼굴을 바꿔 두는 시간 — 움직임보다 조금 길게(맥박처럼 짧으면 0.7초는 보이게) */
export const faceHoldMs = (m: Motion) => Math.max(m.ms + 80, 700)

export type Dust = { dx: number; dy: number; rot: number; w: number; h: number; color: string; leaf: boolean }
const SOIL = ['#A7825A', '#8E6C47', '#B9946A']
const LEAF = ['#7DB86A', '#94C77E']
/** 착지 때 발밑 흙·잎 조각 4~6개(seed로 정해짐) — dx·dy는 상자 크기 비율(옆으로 퍼지고 살짝 위로) */
export function dustBits(seed: number): Dust[] {
  const n = 4 + (Math.abs(Math.floor(seed)) % 3)
  return Array.from({ length: n }, (_, i) => {
    const side = i % 2 ? 1 : -1
    const r = ((seed * 7 + i * 13) % 10) / 10
    const leaf = i % 3 === 2
    return {
      dx: side * (0.12 + 0.16 * r + 0.04 * Math.floor(i / 2)),
      dy: -(0.03 + 0.05 * ((i * 5 + seed) % 4) / 3),
      rot: side * (20 + 40 * r),
      w: leaf ? 7 : 4 + (i % 2) * 1.5,
      h: leaf ? 4 : 4 + (i % 2) * 1.5,
      color: leaf ? LEAF[i % 2] : SOIL[i % 3],
      leaf
    }
  })
}

/** 쓰다듬기 조각(i번째): 하트와 반짝이 번갈아, 머리 위 좌우로 — dx는 상자 크기 비율 */
export const petBit = (i: number): { kind: 'heart' | 'spark'; dx: number } => ({ kind: i % 2 ? 'spark' : 'heart', dx: (i % 2 ? 1 : -1) * (0.06 + 0.04 * (i % 3)) })
export const PET_EVERY_MS = 350
export const PET_MAX = 6
export const PET_HOLD_MS = 500
