// 말랑 아이콘(44 §4 "말랑 아이콘") — 스마트 목록·빈 상태·설정 행 앞에만 쓴다. 탭 막대·도구 막대는 가는 선 아이콘 그대로(틱틱).
// 직접 그린 그림 데이터(시안 docs/screens/mockups/kkumteul-art.js icon()을 옮김). 외부·틱틱 자산 없음.
// 화풍(44 §5.2): 면마다 빛이 왼쪽 위에서 오는 둥근 음영 + 같은 색 계열 얇은 선 + 흰 하이라이트.
// 데스크톱(DOM SVG)과 휴대폰(react-native-svg)이 같은 데이터를 그린다 — 렌더러는 각 앱의 SoftIcon.
// 좌표: viewBox 0 0 48 48.

export type SoftPaint = string | { shade: string } | 'gloss'
export type SoftShape =
  | { t: 'path'; d: string; fill: SoftPaint; stroke?: string; sw?: number; so?: number; op?: number; cap?: boolean }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: SoftPaint; stroke?: string; sw?: number; so?: number; op?: number; rot?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: SoftPaint; stroke?: string; sw?: number; so?: number; op?: number }
  | { t: 'text'; x: number; y: number; size: number; text: string; fill: string }

/* ── 색 계산(시안 kkumteul-art.js와 같은 식) ── */
const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
const hex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const mixHex = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)) }
const SHADE = '#2B3352' // 그늘은 검정이 아니라 차가운 남회색
export const lit = (h: string, t: number) => mixHex(h, '#FFFFFF', t)
export const drk = (h: string, t: number) => mixHex(h, SHADE, t)
/** 둥근 음영 단계(radialGradient cx .4 cy .32 r .78 fx .34 fy .22) */
export const shadeStops = (h: string): [number, string][] => [[0, lit(h, 0.46)], [0.34, lit(h, 0.14)], [0.7, h], [1, drk(h, 0.3)]]
export const SHADE_GEOM = { cx: 0.4, cy: 0.32, r: 0.78, fx: 0.34, fy: 0.22 }

/* ── 모양 도우미 ── */
const ln = (h: string, w = 0.9, o = 0.5) => ({ stroke: drk(h, 0.45), sw: w, so: o })
const P = (d: string, h: string): SoftShape => ({ t: 'path', d, fill: { shade: h }, ...ln(h) })
const E = (cx: number, cy: number, rx: number, ry: number, h: string): SoftShape => ({ t: 'ellipse', cx, cy, rx, ry, fill: { shade: h }, ...ln(h) })
const C = (cx: number, cy: number, r: number, h: string) => E(cx, cy, r, r, h)
const flat = (cx: number, cy: number, r: number, fill: string): SoftShape => ({ t: 'ellipse', cx, cy, rx: r, ry: r, fill })
const gloss = (cx: number, cy: number, rx: number, ry: number, op = 0.8, rot = -20): SoftShape => ({ t: 'ellipse', cx, cy, rx, ry, fill: 'gloss', op, rot })
const strokePath = (d: string, stroke: string, sw: number, op?: number): SoftShape => ({ t: 'path', d, fill: 'none', stroke, sw, cap: true, op })
const r2 = (n: number) => Math.round(n * 100) / 100
function leaf(x: number, y: number, k: number, s: -1 | 1, h = LEAF): SoftShape[] {
  return [
    { t: 'path', d: `M${r2(x)} ${r2(y)} c${r2(s * 4 * k)} ${r2(-8 * k)} ${r2(s * 13 * k)} ${r2(-9 * k)} ${r2(s * 15 * k)} ${r2(-3 * k)} c${r2(-s * 3 * k)} ${r2(5 * k)} ${r2(-s * 10 * k)} ${r2(6 * k)} ${r2(-s * 15 * k)} ${r2(3 * k)}z`, fill: { shade: h }, ...ln(h, 0.7, 0.45) },
    strokePath(`M${r2(x)} ${r2(y)} q${r2(s * 7 * k)} ${r2(-4 * k)} ${r2(s * 13 * k)} ${r2(-3.5 * k)}`, lit(h, 0.45), r2(0.8 * k + 0.2), 0.8)
  ]
}
const card = (top: string): SoftShape[] => [
  { t: 'rect', x: 7, y: 9, w: 34, h: 31, r: 8, fill: { shade: '#FFFFFF' }, ...ln('#DDE3DE', 1, 1) },
  P('M7 17 a8 8 0 0 1 8 -8 h18 a8 8 0 0 1 8 8 v2 H7 Z', top)
]
const rings = (c: string): SoftShape[] => [
  { t: 'rect', x: 15, y: 5, w: 4, h: 9, r: 2, fill: { shade: c } },
  { t: 'rect', x: 29, y: 5, w: 4, h: 9, r: 2, fill: { shade: c } }
]

const INK = '#2A2433'
const LEAF = '#4FBF6A'
const LEAF2 = '#2E9E55'
const GOLD = '#F2B53A'
const HUSK = '#D99A5B'
const check = (stroke = '#fff', w = 3.6): SoftShape => strokePath('M17 25 l5 5 l9 -10', stroke, w)

/** 이름 → 모양들. 사용자가 리스트에 이모지를 고르면 이모지가 앞선다(44 §4) */
export const SOFT_ICONS = {
  inbox: [P('M8 18 L13 7 h22 L40 18 v14 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z', '#7CC4F5'), P('M8 19 h10 q2 5 6 5 q4 0 6 -5 h10 v13 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z', '#4E9DE8')],
  today: [...card('#2BAE66'), ...rings('#1F7F4A')],
  tomorrow: [...card('#FFB23E'), ...rings('#C9781E'), C(24, 31, 5.5, '#FFC93D'), strokePath('M15 31 h-2.5 M35.5 31 H33 M24 22.5 V20.5', '#F0A63C', 2.2)],
  week: [...card('#8B7CF6'), ...[0, 1, 2, 3].map((i): SoftShape => ({ t: 'rect', x: 12 + i * 6.5, y: 24, w: 4.5, h: [8, 5, 10, 7][i], r: 2, fill: '#B9AEFA' }))],
  calendar: [...card('#FF8C7A'), ...[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => flat(14 + c * 6.6, 25 + r * 5.5, 1.7, r === 1 && c === 2 ? '#FF8C7A' : '#D6DCD8')))],
  all: [{ t: 'rect', x: 11, y: 8, w: 26, h: 8, r: 4, fill: { shade: '#B9AEFA' } }, { t: 'rect', x: 8, y: 17, w: 32, h: 9, r: 4.5, fill: { shade: '#8B7CF6' } }, { t: 'rect', x: 6, y: 27, w: 36, h: 13, r: 6, fill: { shade: '#6C5CE0' } }, gloss(15, 31, 4, 2, 0.6)],
  done: [C(24, 24, 16, '#4FBF6A'), check('#fff', 3.8), gloss(17, 15, 5, 3, 0.55)],
  cancel: [C(24, 24, 16, '#C9D2CC'), strokePath('M18 18 L30 30 M30 18 L18 30', '#fff', 3.6)],
  trash: [P('M12 15 h24 l-2 23 a4 4 0 0 1 -4 3.6 H18 a4 4 0 0 1 -4 -3.6 Z', '#B7C2BB'), { t: 'rect', x: 9, y: 10, w: 30, h: 6, r: 3, fill: { shade: '#9AA79F' } }, { t: 'rect', x: 20, y: 6, w: 8, h: 5, r: 2, fill: { shade: '#9AA79F' } }, strokePath('M20 22 v12 M28 22 v12', '#fff', 2.2, 0.8)],
  tag: [P('M8 10 a2 2 0 0 1 2 -2 h13 l17 17 a3 3 0 0 1 0 4.2 L29.2 40 a3 3 0 0 1 -4.2 0 L8 23 Z', '#5AB4F0'), flat(16, 16, 3, '#fff')],
  filter: [P('M8 10 h32 l-12 14 v12 l-8 4 v-16 Z', '#5AB4F0')],
  list: [{ t: 'rect', x: 8, y: 8, w: 32, h: 32, r: 9, fill: { shade: '#FFFFFF' }, ...ln('#DDE3DE', 1, 1) }, flat(16, 18, 2.6, '#4FBF6A'), flat(16, 26, 2.6, '#FFB927'), flat(16, 34, 2.6, '#5AB4F0'), strokePath('M22 18 h11 M22 26 h11 M22 34 h8', '#C9D2CC', 2.4)],
  project: [P('M6 14 a4 4 0 0 1 4 -4 h9 l4 4 h15 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 Z', '#FFC93D'), P('M6 19 h36 v15 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 Z', '#FFD966'), ...leaf(24, 30, 0.7, -1), ...leaf(24, 29, 0.7, 1)],
  map: [P('M6 12 l11 -4 l14 4 l11 -4 v28 l-11 4 l-14 -4 l-11 4 Z', '#9ADB8A'), P('M17 8 l14 4 v28 l-14 -4 Z', '#7FCB72'), strokePath('M11 26 q6 -8 12 -2 t13 -6', '#fff', 2.2, 0.9)],
  habit: [C(24, 25, 15, '#FF8FB1'), check('#fff', 3.6)],
  ai: [P('M8 14 a7 7 0 0 1 7 -7 h18 a7 7 0 0 1 7 7 v10 a7 7 0 0 1 -7 7 h-9 l-7 6 v-6 h-2 a7 7 0 0 1 -7 -7 Z', '#7ED3EC'), flat(17, 19, 2.2, INK), flat(31, 19, 2.2, INK), strokePath('M20 24 q4 3 8 0', INK, 1.8), ...leaf(24, 7, 0.6, -1), ...leaf(24, 6.5, 0.6, 1)],
  growth: [P('M14 34 h20 l-3 9 h-14 Z', '#E58A5C'), { t: 'rect', x: 12, y: 30, w: 24, h: 6, r: 3, fill: { shade: '#D9774A' } }, strokePath('M24 31 V18', LEAF2, 3), ...leaf(24, 22, 1.1, -1), ...leaf(24, 19, 1.2, 1)],
  trophy: [P('M13 8 h22 q0 17 -11 19 q-11 -2 -11 -19z', GOLD), { t: 'rect', x: 21.5, y: 27, w: 5, h: 6, r: 0, fill: '#D9A23A' }, { t: 'rect', x: 15, y: 33, w: 18, h: 5, r: 2.5, fill: { shade: '#D9A23A' } }, strokePath('M13 11 h-4 q0 7 6 8 M35 11 h4 q0 7 -6 8', GOLD, 2.4)],
  settings: [C(24, 24, 15, '#C9D2CC'), C(24, 24, 6.5, '#F5F7F6')],
  bell: [P('M24 7 a10 10 0 0 1 10 10 v8 l4 6 H10 l4 -6 v-8 a10 10 0 0 1 10 -10 Z', '#FFC93D'), C(24, 35, 4, '#F0A63C')],
  note: [{ t: 'rect', x: 10, y: 7, w: 28, h: 34, r: 6, fill: { shade: '#FFFFFF' }, ...ln('#DDE3DE', 1, 1) }, strokePath('M16 17 h16 M16 23 h16 M16 29 h10', '#C9D2CC', 2.4)],
  heart: [P('M24 39 C10 30 6 23 6 17 C6 11 10 8 15 8 C19 8 22 10 24 13 C26 10 29 8 33 8 C38 8 42 11 42 17 C42 23 38 30 24 39 Z', '#FF8FB1')],
  book: [P('M8 10 q8 -3 16 2 v28 q-8 -5 -16 -2 Z', '#7CC4F5'), P('M40 10 q-8 -3 -16 2 v28 q8 -5 16 -2 Z', '#4E9DE8')],
  home: [P('M8 22 L24 8 L40 22 v14 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z', '#FFC93D'), { t: 'rect', x: 20, y: 28, w: 8, h: 12, r: 2, fill: { shade: '#E59A2F' } }],
  palette: [P('M24 7 C14 7 7 14.5 7 23.5 C7 32 13.5 40 22 40 c3 0 4 -2 3 -4 c-1.6 -3 0 -5.5 3.2 -5.5 H33 c4.5 0 8 -3.4 8 -8 C41 14 33.5 7 24 7 Z', '#FFD966'), flat(16, 21, 3, '#FF8FB1'), flat(22, 14.5, 3, '#5AB4F0'), flat(31, 15.5, 3, '#4FBF6A'), flat(34.5, 22.5, 2.6, '#8B7CF6')],
  person: [C(24, 17, 8, '#7ED3EC'), P('M9 40 c0 -8 6.5 -13 15 -13 s15 5 15 13 Z', '#5AB4F0')],
  sync: [C(24, 24, 15, '#7ED3EC'), strokePath('M16 22 a8 8 0 0 1 14 -4 M32 26 a8 8 0 0 1 -14 4', '#fff', 2.8), P('M29 14 l3.5 4.5 l-5.5 0.8 Z', '#FFFFFF'), P('M19 34 l-3.5 -4.5 l5.5 -0.8 Z', '#FFFFFF')],
  help: [C(24, 24, 15, '#B9AEFA'), strokePath('M19.5 19.5 a4.5 4.5 0 1 1 6.5 4 c-1.6 .9 -2 2 -2 3.5', '#fff', 3), flat(24, 32.5, 2, '#fff')],
  lock: [strokePath('M17 21 v-4 a7 7 0 0 1 14 0 v4', '#9AA79F', 3.4), { t: 'rect', x: 11, y: 20, w: 26, h: 20, r: 6, fill: { shade: '#FFC93D' } }, flat(24, 29, 2.6, '#C9781E')],
  search: [C(21, 21, 11, '#7ED3EC'), C(21, 21, 6.5, '#E9F7FC'), { t: 'path', d: 'M29 29 l9 9', fill: 'none', stroke: '#4E9DE8', sw: 5, cap: true }],
  run: [P('M10 30 q0 -8 8 -10 l10 -6 q6 0 8 6 l4 10 q0 4 -4 4 H14 q-4 0 -4 -4 Z', '#FF8C7A'), strokePath('M12 34 h28', '#fff', 2.4)],
  seed: [E(24, 29, 13, 12, HUSK), strokePath('M12 28 l3 -2.6 l3 2.6 l3 -2.6 l3 2.6 l3 -2.6 l3 2.6 l3 -2.6 l3 2.6', lit(HUSK, 0.45), 1.6), gloss(19, 23, 3.4, 2, 0.7), strokePath('M24 18 V11', LEAF2, 2.4), ...leaf(24, 13, 0.62, -1), ...leaf(24, 12.5, 0.62, 1)],
  sun: [C(24, 24, 10, '#FFC93D'), strokePath('M24 6 v4 M24 38 v4 M6 24 h4 M38 24 h4 M11.3 11.3 l2.8 2.8 M33.9 33.9 l2.8 2.8 M11.3 36.7 l2.8 -2.8 M33.9 14.1 l2.8 -2.8', '#F0A63C', 2.6)],
  moon: [P('M30 8 A16 16 0 1 0 40 32 A13 13 0 0 1 30 8 Z', '#B9AEFA'), flat(33, 14, 1.4, '#FFD966'), flat(38, 20, 1, '#FFD966')]
} satisfies Record<string, SoftShape[]>

export type SoftIconName = keyof typeof SOFT_ICONS
export const softIcon = (name: SoftIconName): SoftShape[] => SOFT_ICONS[name]
/** 한 아이콘에 쓰인 음영 색(그라데이션 정의를 한 번씩만 만들려고) */
export function shadesOf(shapes: SoftShape[]): string[] {
  const s = new Set<string>()
  for (const sh of shapes) if (sh.t !== 'text' && typeof sh.fill === 'object') s.add(sh.fill.shade)
  return [...s]
}
export const shadeId = (h: string) => `soft-${h.replace('#', '').toLowerCase()}`
// 'today' 칸의 날짜 숫자는 그 날 날짜라 렌더러가 덧그린다(시안 9). 색 = 진한 초록
export const TODAY_DIGIT = { x: 24, y: 35, size: 14, fill: '#1F7F4A' }
