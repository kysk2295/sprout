// 49 §7.2 말풍선이 캐릭터 머리를 따라간다 — 순수 계산(UI 스레드 worklet). 캐릭터를 움직이는 같은 공유 값으로 머리 점을 구하고,
// 스프링으로 살짝 늦게 쫓고, 화면 안에 가둔다. 회전은 따라가지 않는다(말풍선은 늘 똑바로).

/** 감싸개 하나의 transform(RN 순서 = translate → rotate → scale, 점에는 scale → rotate → translate 순으로 걸린다) */
export type Tf = { tx: number; ty: number; rot: number; sx: number; sy: number }

/** 점(x, y)에 origin(ox, oy) 기준 transform을 건다 */
export function applyTf(x: number, y: number, ox: number, oy: number, tx: number, ty: number, rotDeg: number, sx: number, sy: number): { x: number; y: number } {
  'worklet'
  const vx = (x - ox) * sx, vy = (y - oy) * sy
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return { x: ox + vx * c - vy * s + tx, y: oy + vx * s + vy * c + ty }
}

/**
 * 성장 무대 머리 점이 쉬는 자리에서 얼마나 옮겨 갔나(상자 좌표, px). 안쪽부터:
 * 몸(만지기 y·rot·scale, 기준 = 50% · foot) → 만지기 감싸개(끌기 dx·dy·기울기, 기준 = 가운데) → 무대 감싸개(hopY·rot·scale, 기준 = 50% · 바닥)
 */
export function headShift(size: number, headY: number, foot: number,
  body: Tf, outer: Tf, wrap: Tf): { x: number; y: number } {
  'worklet'
  const hx = size / 2
  // 몸: translateY(y·size)는 부르는 쪽이 body.ty에 px로 넣는다
  const a = applyTf(hx, headY, hx, foot * size, body.tx, body.ty, body.rot, body.sx, body.sy)
  const b = applyTf(a.x, a.y, hx, size / 2, outer.tx, outer.ty, outer.rot, outer.sx, outer.sy)
  const c = applyTf(b.x, b.y, hx, size, wrap.tx, wrap.ty, wrap.rot, wrap.sx, wrap.sy)
  return { x: c.x - hx, y: c.y - headY }
}

/** 값 표(시험·문서용 — worklet 안에서는 같은 숫자를 직접 쓴다) */
export const FOLLOW = { k: 260, z: 0.7, maxDt: 1 / 30, edge: 12, tailIn: 18 } as const
/** 스프링 한 걸음(반암시 오일러). k = 강성 260, z = 감쇠비 0.7 — 약 0.12초 늦고 살짝 넘쳤다 돌아온다 */
// 기본 인자는 쓰지 않는다 — worklet 플러그인이 기본 인자 식의 바깥 값(FOLLOW)을 UI 스레드로 안 가져가서 Release에서 앱이 멈췄다
export function springStep(pos: number, vel: number, target: number, dt: number): { pos: number; vel: number } {
  'worklet'
  const k = 260, z = 0.7
  const d = Math.min(Math.max(dt, 0), 1 / 30)
  const c = 2 * z * Math.sqrt(k)
  const v = vel + ((target - pos) * k - vel * c) * d
  return { pos: pos + v * d, vel: v }
}

/**
 * 화면 안에 가두기(49 §7.2): 말풍선 가운데가 cx0 + ox일 때 좌우 edge 안쪽으로 가둔 ox와, 꼬리가 머리 쪽으로 옮겨 갈 양(tail).
 * 위로는 top0 + oy가 minTop보다 위면 내린다. bw·bh = 말풍선 크기(아직 모르면 0 → 가두지 않음).
 */
export function clampBubble(cx0: number, top0: number, ox: number, oy: number, bw: number, bh: number, screenW: number, minTop: number): { x: number; y: number; tail: number } {
  'worklet'
  let x = ox, y = oy, tail = 0
  if (bw > 0) {
    const edge = 12, tailIn = 18
    const lo = edge + bw / 2, hi = screenW - edge - bw / 2
    const want = cx0 + ox
    const got = lo > hi ? screenW / 2 : Math.min(hi, Math.max(lo, want))
    x = got - cx0
    const room = Math.max(0, bw / 2 - tailIn)
    tail = Math.min(room, Math.max(-room, want - got))
  }
  if (bh > 0 && top0 + y < minTop) y = minTop - top0
  return { x, y, tail }
}
