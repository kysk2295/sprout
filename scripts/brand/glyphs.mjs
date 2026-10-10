// sprout 로고 후보 3종의 "기호(glyph)" 정의 — 직접 그린 원본(틱틱 자산 아님).
// 좌표계: 1000×1000 상자, 기호는 대략 100~900 안에 있다. compose.mjs가 앱 아이콘·트레이·파비콘 크기로 옮긴다.
//   shape: 전경색({FG})으로 칠하는 부분
//   cut:   전경에서 파내는 부분(마스크) — 배경이 비쳐 보인다. 단색·투명 배경에서도 그대로 동작한다.
// 16px에서 읽히도록 선 굵기는 상자 대비 9% 이상, 파낸 틈은 7% 이상으로 둔다.

export const CONCEPTS = {
  a: {
    id: 'a',
    name: '새싹 체크 (Check Sprout)',
    nameEn: 'Check Sprout',
    idea: '체크 표시의 긴 획이 그대로 줄기가 되어 잎을 틔운다 — "끝낸 일이 자라난다".',
    shape: `
      <path d="M150 560 L370 770 C 450 650 520 545 600 440" fill="none" stroke="{FG}" stroke-width="130" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M585 470 C 585 290 700 150 895 120 C 912 310 790 450 585 470 Z" fill="{FG}"/>
      <path d="M560 455 C 450 450 372 375 356 262 C 480 258 560 340 560 455 Z" fill="{FG}"/>`,
    // 32px 이하: 왼쪽 작은 잎이 뭉개져 덩어리처럼 보여서 뺀다(체크 + 큰 잎)
    shapeSmall: `
      <path d="M150 560 L370 770 C 450 650 520 545 600 440" fill="none" stroke="{FG}" stroke-width="140" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M585 470 C 585 290 700 150 895 120 C 912 310 790 450 585 470 Z" fill="{FG}"/>`,
    cut: ``
  },
  b: {
    id: 'b',
    name: '달력 새싹 (Calendar Seedling)',
    nameEn: 'Calendar Seedling',
    idea: '달력 한 장에서 새싹이 돋는다 — "할 일·캘린더 + 성장".',
    shape: `
      <rect x="130" y="205" width="740" height="690" rx="150" fill="{FG}"/>
      <rect x="290" y="105" width="104" height="200" rx="52" fill="{FG}"/>
      <rect x="606" y="105" width="104" height="200" rx="52" fill="{FG}"/>`,
    cut: `
      <rect x="100" y="318" width="800" height="48" fill="#000"/>
      <path d="M500 800 L500 615" stroke="#000" stroke-width="74" stroke-linecap="round"/>
      <path d="M492 660 C 400 660 300 605 290 478 C 420 470 496 548 492 660 Z" fill="#000"/>
      <path d="M508 618 C 520 500 610 428 725 428 C 728 548 630 624 508 618 Z" fill="#000"/>`
  },
  c: {
    id: 'c',
    name: '잎 체크 (Leaf Check)',
    nameEn: 'Leaf Check',
    idea: '한 장의 잎, 잎맥 자리가 체크 표시 — 가장 단순해서 16px에서도 또렷하다.',
    shape: `
      <path d="M135 865 C 105 470 420 150 880 120 C 905 560 600 890 135 865 Z" fill="{FG}"/>`,
    cut: `
      <path d="M318 548 L452 682 L705 382" fill="none" stroke="#000" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>`
  }
}

// ── 45 확정(2026-10-09, 사용자 "추천대로"): B 씨앗 친구 × 깊은 숲 ─────────────────
// 위 a·b·c는 예전 후보(기록용)다. 씨앗 친구는 여러 색이 겹치는 그림이라 1000 상자 shape/cut 대신
// 100 × 100 판 위의 mark(c, small) 함수로 그린다(시안 docs/screens/mockups/brand-identity.html LOGOS b와 같은 좌표).
//   c = 색 자리(husk 씨앗 껍질 · eye 눈·입 · cheek 볼 · leaf/leaf2 잎). c.mono면 단색 마스크(흰 = 칠함, 검정 = 구멍).
//   small = 32px 이하: 눈을 키우고 볼·입·빛을 뺀다, 새싹을 조금 키운다.
const sproutAt = (x, y, k, c, w) =>
  `<path d="M${x} ${y + 10 * k} V${y + 1}" stroke="${c.leaf}" stroke-width="${w}" stroke-linecap="round"/>` +
  `<path transform="translate(${x} ${y}) scale(${k})" d="M-1 1 C-8 1 -15 -3 -17 -12 C-8 -13 -2 -8 -1 1 Z" fill="${c.leaf2}"/>` +
  `<path transform="translate(${x} ${y}) scale(${k})" d="M1 0 C2 -9 8 -15 18 -15 C18 -5 11 0 1 0 Z" fill="${c.leaf}"/>`

CONCEPTS.seed = {
  id: 'seed',
  name: '씨앗 친구 (Seed Buddy)',
  nameEn: 'Seed Buddy',
  idea: '머리에 새싹 난 씨앗 얼굴 — 앱의 주인공(캐릭터)이 곧 로고. 작은 크기에서도 눈 두 개가 남는다.',
  mark: (c, s = false) =>
    `<g transform="translate(0 2)"><path d="M50 31 C69 31 81 45 81 61 C81 77 67 87 50 87 C33 87 19 77 19 61 C19 45 31 31 50 31 Z" fill="${c.husk}"/>` +
    (c.mono || s ? '' : `<ellipse cx="35" cy="45" rx="7.5" ry="4" transform="rotate(-32 35 45)" fill="#fff" opacity=".5"/>`) +
    (c.mono || s ? '' : `<ellipse cx="31" cy="69" rx="5.6" ry="3.4" fill="${c.cheek}" opacity=".8"/><ellipse cx="69" cy="69" rx="5.6" ry="3.4" fill="${c.cheek}" opacity=".8"/>`) +
    `<ellipse cx="39.5" cy="60" rx="${s ? 5.6 : 4.4}" ry="${s ? 6.6 : 5.4}" fill="${c.eye}"/><ellipse cx="60.5" cy="60" rx="${s ? 5.6 : 4.4}" ry="${s ? 6.6 : 5.4}" fill="${c.eye}"/>` +
    (s ? '' : `<circle cx="41.2" cy="58" r="1.6" fill="#fff"/><circle cx="62.2" cy="58" r="1.6" fill="#fff"/>`) +
    (s ? '' : `<path d="M45.5 68.5 Q50 73 54.5 68.5" stroke="${c.eye}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`) +
    sproutAt(50, 21, s ? 1.15 : 1, c, s ? 6 : 4.8) +
    '</g>',
  // 단색 기호를 정사각에 담을 때의 상자(100 판 단위) — 껍데기 19~81, 잎 끝 ~5, 아래 ~89
  box: [7, 4, 86, 86]
}

// ── 45 v1.1 확정(2026-10-10, 사용자 "D안으로"): 알껍질 아기 달팽이 = 꿈틀 마스코트 ─────────────
// 3D 그림 snail-1s0(달팽이 1단계 · 흙빛 씨앗)을 평면 + 부드러운 명암으로 옮겼다. 32px 이하(small)는 알껍질을 빼고 몸을 키운다(시안 F).
// 시안: docs/screens/mockups/brand-tadpole.html (scripts/brand/tadpole-mockup.mjs)
export const SN = { body1: '#FFF6E6', body2: '#F3DDBF', body3: '#D8B791', shell1: '#F0A88E', shell2: '#C9705C', cup1: '#E9AE80', cup2: '#C27F55', eye: '#221A14', sprout: { stem: '#9ED8A6', leaf: '#A9E3B0', leaf2: '#D2F2C4' } }
export const SN_DARK = { ...SN, body1: '#F2E6D2', body2: '#E0C7A6', body3: '#BF9C77', cup1: '#D69C70', cup2: '#A86A44' }

const leafPair = (x, y, k, c, w) =>
  `<path d="M${x} ${y + 9 * k} V${y + 1}" stroke="${c.stem}" stroke-width="${w}" stroke-linecap="round"/>` +
  `<path transform="translate(${x} ${y}) scale(${k})" d="M-1 1 C-8 1 -15 -3 -17 -12 C-8 -13 -2 -8 -1 1 Z" fill="${c.leaf2}"/>` +
  `<path transform="translate(${x} ${y}) scale(${k})" d="M1 0 C2 -9 8 -15 18 -15 C18 -5 11 0 1 0 Z" fill="${c.leaf}"/>`
let uid = 0
export /** 아기 달팽이 — 몸 중심 (48, 60) r 21. cup = 아래 깨진 알껍질 컵 */
function snail(c, { small = false, mono = false, cup = true } = {}) {
  const s = c.sn
  const id = `s${++uid}`
  const W = '#fff', K = '#000'
  const defs = mono ? '' : `<defs>
    <radialGradient id="${id}b" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${s.body1}"/><stop offset=".6" stop-color="${s.body2}"/><stop offset="1" stop-color="${s.body3}"/></radialGradient>
    <radialGradient id="${id}s" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${s.shell1}"/><stop offset="1" stop-color="${s.shell2}"/></radialGradient>
    <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.cup1}"/><stop offset="1" stop-color="${s.cup2}"/></linearGradient></defs>`
  const body = mono ? W : `url(#${id}b)`
  const sw = small ? 3.6 : 2.6
  const stalk = (x1, y1, x2, y2) =>
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${mono ? W : s.body2}" stroke-width="${sw}" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="${small ? 4.4 : 3.6}" fill="${mono ? W : s.body1}"/>`
  const er = small ? [3.2, 3.9] : [2.3, 2.9]
  const ink = mono ? K : s.eye
  // 깨진 알껍질 컵: 들쭉날쭉한 윗선 + 둥근 바닥
  const cupD = 'M18 70 L23 66.5 L27 70.5 L32 67 L36 71 L42 68 L47 72 L53 68.5 L58 72 L63 67.5 L68 71 L73 66.5 L77 70 L82 67 C83 80 70 90 50 90 C30 90 17 81 18 70 Z'
  return defs +
    (mono ? '' : `<circle cx="70" cy="45" r="10" fill="url(#${id}s)"/>`) +
    (mono ? `<circle cx="70" cy="45" r="10" fill="${W}"/>` : '') +
    stalk(41, 44, 31, 35.5) + stalk(55, 44, 65, 35.5) +
    `<circle cx="48" cy="60" r="21" fill="${body}"/>` +
    (mono || small ? '' : `<ellipse cx="39" cy="49" rx="6" ry="3.4" transform="rotate(-30 39 49)" fill="#fff" opacity=".45"/>`) +
    `<ellipse cx="40.5" cy="61" rx="${er[0]}" ry="${er[1]}" fill="${ink}"/><ellipse cx="55.5" cy="61" rx="${er[0]}" ry="${er[1]}" fill="${ink}"/>` +
    (mono || small ? '' : `<circle cx="41.3" cy="59.8" r=".85" fill="#fff"/><circle cx="56.3" cy="59.8" r=".85" fill="#fff"/>`) +
    (small ? '' : `<path d="M45.5 67.5 Q48 70 50.5 67.5" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`) +
    (cup ? (mono ? `<path d="${cupD}" fill="${K}" stroke="${K}" stroke-width="4" stroke-linejoin="round"/><path d="${cupD}" fill="${W}"/>`
      : `<path d="${cupD}" fill="url(#${id}c)"/><path d="M24 75 C30 83 40 86 50 86" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round" fill="none"/>`) : '') +
    leafPair(48, 31.5, small ? 0.95 : 0.78, mono ? { stem: W, leaf: W, leaf2: W } : s.sprout, small ? 4.6 : 3.6)
}

CONCEPTS.snail = {
  id: 'snail',
  name: '아기 달팽이 (Baby Snail)',
  nameEn: 'Baby Snail',
  idea: '깨진 알껍질에서 막 나온 아기 달팽이 — 앱 마스코트(성향 조사 전 기본 캐릭터)가 곧 로고.',
  mark: (c, s = false) => (s
    ? `<g transform="translate(-12 -16) scale(1.26)">${snail(c, { small: true, mono: !!c.mono, cup: false })}</g>`
    : snail(c, { mono: !!c.mono, cup: true })),
  box: [10, 12, 80, 80]
}

export const RECOMMENDED = 'snail'

/** 45 §3 깊은 숲 — 아이콘 판·기호 색(시안 PALS forest ic / icd) */
export const SEED_COLORS = {
  light: { bg1: '#167762', bg2: '#0A4337', husk: '#F5C487', eye: '#2B1F18', cheek: '#FF8B86', leaf: '#8EE6A6', leaf2: '#C6F5A6', sn: SN },
  dark: { bg1: '#12261F', bg2: '#07110D', husk: '#E8B474', eye: '#1B140F', cheek: '#E0706E', leaf: '#6FDCA0', leaf2: '#B3EE8F', sn: SN_DARK }
}
export const MONO = { husk: '#fff', leaf: '#fff', leaf2: '#fff', eye: '#000', cheek: 'none', mono: true }

// 색 — 45 깊은 숲. 앱 기본 테마 강조색(--color-accent #12715E)과 같은 집안이다.
export const PALETTE = {
  light: { bgTop: SEED_COLORS.light.bg1, bgBottom: SEED_COLORS.light.bg2, fg: '#FFFFFF' },
  dark: { bgTop: SEED_COLORS.dark.bg1, bgBottom: SEED_COLORS.dark.bg2, fgTop: '#6FDCA0', fgBottom: '#3CC4A2' },
  mono: '#000000',
  brand: '#12715E', // 단색 배경(스플래시·알림 색·사이트 theme_color)
  brandDark: '#0A100E', // 다크 스플래시 = 앱 다크 바닥
  honey: '#F2B84B',
  apricot: '#F08A5D'
}
