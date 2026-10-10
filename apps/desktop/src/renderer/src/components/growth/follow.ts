// 49 §7.2 말풍선 따라가기(데스크톱) — 휴대폰 src/growth/art/follow.ts와 같은 식: 스프링 한 걸음 · 화면(무대) 안에 가두기.
// 머리 점은 PlayableCharacter handle.headPoint()가 지금 걸린 transform(감싸개·WAAPI·만지기 rAF)으로 계산한다.
export const FOLLOW = { k: 260, z: 0.7, maxDt: 1 / 30, edge: 12, tailIn: 18 } as const

/** 스프링 한 걸음(반암시 오일러) — 260 · 0.7이면 약 0.12초 늦고 살짝 넘쳤다 돌아온다 */
export function springStep(pos: number, vel: number, target: number, dt: number): { pos: number; vel: number } {
  const d = Math.min(Math.max(dt, 0), FOLLOW.maxDt)
  const c = 2 * FOLLOW.z * Math.sqrt(FOLLOW.k)
  const v = vel + ((target - pos) * FOLLOW.k - vel * c) * d
  return { pos: pos + v * d, vel: v }
}

/** 가운데 cx0 · 위끝 top0인 말풍선을 (ox, oy)만큼 옮길 때 무대 [0, w] 좌우 edge 안 · 위 minTop 아래로 가둔 값 + 꼬리 옮김 */
export function clampBubble(cx0: number, top0: number, ox: number, oy: number, bw: number, w: number, minTop: number): { x: number; y: number; tail: number } {
  const lo = FOLLOW.edge + bw / 2, hi = w - FOLLOW.edge - bw / 2
  const want = cx0 + ox
  const got = lo > hi ? w / 2 : Math.min(hi, Math.max(lo, want))
  const room = Math.max(0, bw / 2 - FOLLOW.tailIn)
  return { x: got - cx0, y: top0 + oy < minTop ? minTop - top0 : oy, tail: Math.min(room, Math.max(-room, want - got)) }
}

/** 요소의 지금 transform(애니메이션 포함)을 origin 기준으로 점에 건다 */
export function applyEl(el: Element | null, x: number, y: number, ox: number, oy: number): { x: number; y: number } {
  if (!el) return { x, y }
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return { x, y }
  const m = new DOMMatrixReadOnly(t)
  const p = m.transformPoint(new DOMPoint(x - ox, y - oy))
  return { x: p.x + ox, y: p.y + oy }
}
