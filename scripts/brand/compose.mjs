// 기호(glyphs.mjs)를 쓰임새별 SVG로 조립한다. 의존성 없음(Node 22).
//   node scripts/brand/compose.mjs            → docs/release/brand/concepts/<id>-<variant>.svg 전부
// build-icons.mjs도 이 모듈의 variantSvg()로 렌더링할 SVG를 만든다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { CONCEPTS, PALETTE, SEED_COLORS, MONO } from './glyphs.mjs'

const C = 1024 // 출력 캔버스

/** 기호의 실제 픽셀 경계(measure.mjs가 잰 값, 1000 상자 기준) */
const BOUNDS = JSON.parse(readFileSync(new URL('./glyph-bounds.json', import.meta.url), 'utf8'))
/** 시각 보정: 꽉 찬 사각형(달력)은 같은 크기여도 커 보여서 조금 줄인다 */
const OPTICAL = { a: 1.0, b: 0.9, c: 0.96 }

/** fit = 기호의 긴 변이 캔버스(1024)에서 차지할 비율 */
function glyph(concept, fg, fit, uid, { cx = C / 2, cy = C / 2, small = false } = {}) {
  const b = BOUNDS[concept.id]
  const gx = (b.x0 + b.x1) / 2
  const gy = (b.y0 + b.y1) / 2
  const s = +((fit * C * (OPTICAL[concept.id] ?? 1)) / Math.max(b.x1 - b.x0, b.y1 - b.y0)).toFixed(4)
  const tx = cx - s * gx
  const ty = cy - s * gy
  const shape = (small && concept.shapeSmall ? concept.shapeSmall : concept.shape).replaceAll('{FG}', fg)
  return `
  <mask id="m${uid}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="1400">
    <rect x="-200" y="-200" width="1400" height="1400" fill="#fff"/>${concept.cut}
  </mask>
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s})">
    <g mask="url(#m${uid})">${shape}
    </g>
  </g>`
}

const lightBg = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.light.bgTop}"/><stop offset="1" stop-color="${PALETTE.light.bgBottom}"/></linearGradient>`
const darkBg = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.dark.bgTop}"/><stop offset="1" stop-color="${PALETTE.dark.bgBottom}"/></linearGradient>`
const darkFg = (id) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="900"><stop offset="0" stop-color="${PALETTE.dark.fgTop}"/><stop offset="1" stop-color="${PALETTE.dark.fgBottom}"/></linearGradient>`

const wrap = (body, defs = '', note = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${C}" height="${C}" viewBox="0 0 ${C} ${C}">${note ? `\n  <!-- ${note} -->` : ''}
  <defs>${defs}</defs>${body}
</svg>
`

/** 쓰임새 목록. 숫자 = 기호 긴 변이 1024 캔버스에서 차지하는 비율 */
export const VARIANTS = {
  // iOS·스토어 원본: 꽉 찬 정사각형(모서리는 OS가 깎는다), 투명 없음
  'ios-light': (k) => wrap(`<rect width="${C}" height="${C}" fill="url(#bg)"/>${glyph(k, PALETTE.light.fg, 0.56, 'l')}`, lightBg('bg'), 'iOS·App Store·Play 512 원본 — 꽉 찬 사각형'),
  // iOS 18 다크 아이콘: HIG 권장대로 배경 투명(시스템이 어두운 배경을 깐다)
  'ios-dark': (k) => wrap(glyph(k, 'url(#fg)', 0.56, 'd'), darkFg('fg'), 'iOS 18 다크 아이콘 — 배경 투명'),
  // iOS 18 색조(tinted) 아이콘: 회색조. 검은 배경 + 흰 기호
  'ios-tinted': (k) => wrap(`<rect width="${C}" height="${C}" fill="#000"/>${glyph(k, '#FFFFFF', 0.56, 't')}`, '', 'iOS 18 색조 아이콘 — 회색조'),
  // 미리보기·다크 배경 포함 버전(브랜드 시트·스토어 다크 이미지용)
  'square-dark': (k) => wrap(`<rect width="${C}" height="${C}" fill="url(#bg)"/>${glyph(k, 'url(#fg)', 0.56, 's')}`, darkBg('bg') + darkFg('fg'), '다크 정사각형'),
  // macOS(Big Sur 이후 격자): 824 본체, 여백 100, 반경 185, 그림자
  'mac-light': (k) =>
    wrap(
      `<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)" filter="url(#sh)"/>${glyph(k, PALETTE.light.fg, 0.46, 'ml')}`,
      lightBg('bg') + `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.22"/></filter>`,
      'macOS 앱 아이콘 — 1024 캔버스, 본체 824'
    ),
  'mac-dark': (k) =>
    wrap(
      `<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)" filter="url(#sh)"/>${glyph(k, 'url(#fg)', 0.46, 'md')}`,
      darkBg('bg') + darkFg('fg') + `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.3"/></filter>`,
      'macOS 다크 앱 아이콘'
    ),
  // Android 적응형: 108dp 캔버스 중 안전 원(지름 66dp ≈ 61%) 안에 기호
  'android-fg': (k) => wrap(glyph(k, PALETTE.light.fg, 0.40, 'af'), '', 'Android 적응형 전경 — 안전 원 61% 안'),
  'android-bg': () => wrap(`<rect width="${C}" height="${C}" fill="url(#bg)"/>`, lightBg('bg'), 'Android 적응형 배경'),
  'android-mono': (k) => wrap(glyph(k, '#000000', 0.40, 'am'), '', 'Android 13+ 테마 아이콘(단색) — 알파만 쓰인다'),
  // Android 옛 아이콘(API 25 이하): 둥근 사각·원형
  'legacy-round': (k) => wrap(`<circle cx="512" cy="512" r="480" fill="url(#bg)"/>${glyph(k, PALETTE.light.fg, 0.5, 'lr')}`, lightBg('bg'), 'Android 옛 원형 아이콘'),
  // Play 그래픽 이미지(1024×500)는 build-icons.mjs가 따로 만든다
  // 단색 기호: 메뉴 막대 템플릿·알림 작은 아이콘·인쇄용. 캔버스를 꽉 채운다
  mono: (k) => wrap(glyph(k, PALETTE.mono, 0.98, 'mo'), '', '단색 — 메뉴 막대 템플릿(검정+알파), Android 알림 아이콘(흰색으로 바꿔 씀)'),
  'mono-white': (k) => wrap(glyph(k, '#FFFFFF', 0.98, 'mw'), '', '단색 흰색 — Android 알림 작은 아이콘'),
  // 32px 이하 전용(기호에 shapeSmall이 있으면 단순한 모양) — 메뉴 막대·파비콘·ICO 작은 칸
  'mono-small': (k) => wrap(glyph(k, PALETTE.mono, 0.98, 'mos', { small: true }), '', '단색 작은 크기(≤32px)'),
  'mono-white-small': (k) => wrap(glyph(k, '#FFFFFF', 0.98, 'mws', { small: true }), '', '단색 흰색 작은 크기'),
  'favicon-small': (k) => wrap(`<rect width="${C}" height="${C}" rx="230" fill="url(#bg)"/>${glyph(k, PALETTE.light.fg, 0.72, 'fvs', { small: true })}`, lightBg('bg'), '파비콘 작은 크기(≤32px)'),
  // 파비콘·작은 크기: 둥근 사각 + 기호를 크게
  favicon: (k) => wrap(`<rect width="${C}" height="${C}" rx="230" fill="url(#bg)"/>${glyph(k, PALETTE.light.fg, 0.68, 'fv')}`, lightBg('bg'), '파비콘·Windows 작은 크기 — 기호를 크게'),
  // 스플래시: 투명 배경 기호(배경색은 설정의 backgroundColor)
  'splash-light': (k) => wrap(glyph(k, PALETTE.light.fg, 0.86, 'sl'), '', `스플래시(라이트) — 배경 ${PALETTE.brand}`),
  'splash-dark': (k) => wrap(glyph(k, 'url(#fg)', 0.86, 'sd'), darkFg('fg'), `스플래시(다크) — 배경 ${PALETTE.brandDark}`)
}

// ── 여러 색 기호(mark 함수, 100 판) — 45 씨앗 친구 ─────────────────────────
const L = SEED_COLORS.light
const D = SEED_COLORS.dark
const grad = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient>`
/** 100 판 단위로 그린 몸(body)을 1024 캔버스에 */
const wrap100 = (body, defs = '', note = '', vb = '0 0 100 100') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${C}" height="${C}" viewBox="${vb}">${note ? `\n  <!-- ${note} -->` : ''}
  <defs>${defs}</defs>${body}
</svg>
`
/** 단색 기호 — 흰 = 칠함, 검정 = 구멍(눈) */
const monoMark = (k, color, uid, small = false, frame = '0 0 100 100') =>
  `<mask id="${uid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><rect x="-20" y="-20" width="140" height="140" fill="#000"/>${k.mark(MONO, small)}</mask>` +
  `<rect x="-20" y="-20" width="140" height="140" fill="${color}" mask="url(#${uid})"/>`
const boxVb = (k) => k.box.join(' ')
/** Android 적응형 108 판: 보이는 곳 72(가운데), 안전 원 66 → 기호 판 100을 0.66배로 가운데에 */
const place108 = (inner) => `<g transform="translate(54 54) scale(.66) translate(-50 -50)">${inner}</g>`
/** 둥근 네모(초타원 비슷) — 시안 sq() */
const sq = (x, y, w, r) => {
  const q = r * 1.28
  return `M${x + q} ${y} H${x + w - q} C${x + w - r * 0.2} ${y} ${x + w} ${y + r * 0.2} ${x + w} ${y + q} V${y + w - q} C${x + w} ${y + w - r * 0.2} ${x + w - r * 0.2} ${y + w} ${x + w - q} ${y + w} H${x + q} C${x + r * 0.2} ${y + w} ${x} ${y + w - r * 0.2} ${x} ${y + w - q} V${y + q} C${x} ${y + r * 0.2} ${x + r * 0.2} ${y} ${x + q} ${y} Z`
}
const shadowF = (op) => `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.0" stdDeviation="1.2" flood-color="#000" flood-opacity="${op}"/></filter>`
/** 맥 아이콘: 1024 캔버스 = 124.27 판 단위(824 본체 = 100), 여백 12.14 */
const MAC_VB = '-12.136 -12.136 124.272 124.272'
const zoom = (inner, f) => `<g transform="translate(50 50) scale(${f}) translate(-50 -50)">${inner}</g>`

export const MARK_VARIANTS = {
  'ios-light': (k) => wrap100(`<rect width="100" height="100" fill="url(#bg)"/>${k.mark(L)}`, grad('bg', L), 'iOS·App Store·Play 512 원본 — 꽉 찬 사각형(모서리는 OS가 깎는다)'),
  // iOS 18 다크: 배경 투명(시스템이 어두운 판을 깐다) — 다크 색 기호
  'ios-dark': (k) => wrap100(k.mark(D), '', 'iOS 18 다크 아이콘 — 배경 투명'),
  // iOS 18 색조: 회색조(검은 판 + 흰 기호, 눈은 구멍). 시스템이 밝기로 색을 입힌다
  'ios-tinted': (k) => wrap100(`<rect width="100" height="100" fill="#000"/>${monoMark(k, '#FFFFFF', 'mt')}`, '', 'iOS 18 색조 아이콘 — 회색조'),
  'square-dark': (k) => wrap100(`<rect width="100" height="100" fill="url(#bg)"/>${k.mark(D)}`, grad('bg', D), '다크 정사각형(미리보기·스토어 다크 이미지)'),
  'mac-light': (k) =>
    wrap100(`<g filter="url(#sh)"><path d="${sq(0, 0, 100, 22.4)}" fill="url(#bg)"/></g><clipPath id="cl"><path d="${sq(0, 0, 100, 22.4)}"/></clipPath><g clip-path="url(#cl)">${k.mark(L)}</g>`, grad('bg', L) + shadowF(0.22), 'macOS 앱 아이콘 — 1024 캔버스, 본체 824', MAC_VB),
  'mac-dark': (k) =>
    wrap100(`<g filter="url(#sh)"><path d="${sq(0, 0, 100, 22.4)}" fill="url(#bg)"/></g><path d="${sq(0.4, 0.4, 99.2, 22.3)}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width=".5"/><clipPath id="cl"><path d="${sq(0, 0, 100, 22.4)}"/></clipPath><g clip-path="url(#cl)">${k.mark(D)}</g>`, grad('bg', D) + shadowF(0.3), 'macOS 다크 앱 아이콘', MAC_VB),
  'android-fg': (k) => wrap100(place108(k.mark(L)), '', 'Android 적응형 전경 — 안전 원 66dp 안', '0 0 108 108'),
  'android-bg': () => wrap100(`<rect width="108" height="108" fill="url(#bg)"/>`, grad('bg', L), 'Android 적응형 배경', '0 0 108 108'),
  'android-mono': (k) => wrap100(place108(monoMark(k, '#000000', 'am')), '', 'Android 13+ 테마 아이콘(단색) — 알파만 쓰인다, 눈은 구멍', '0 0 108 108'),
  'legacy-round': (k) => wrap100(`<circle cx="50" cy="50" r="47" fill="url(#bg)"/><clipPath id="cl"><circle cx="50" cy="50" r="47"/></clipPath><g clip-path="url(#cl)">${zoom(k.mark(L), 0.9)}</g>`, grad('bg', L), 'Android 옛 원형 아이콘'),
  mono: (k) => wrap100(monoMark(k, PALETTE.mono, 'mo'), '', '단색 — 메뉴 막대 템플릿(검정+알파)', boxVb(k)),
  'mono-white': (k) => wrap100(monoMark(k, '#FFFFFF', 'mw'), '', '단색 흰색 — Android 알림 작은 아이콘', boxVb(k)),
  'mono-small': (k) => wrap100(monoMark(k, PALETTE.mono, 'mos', true), '', '단색 작은 크기(≤32px) — 눈을 키우고 입을 뺐다', boxVb(k)),
  'mono-white-small': (k) => wrap100(monoMark(k, '#FFFFFF', 'mws', true), '', '단색 흰색 작은 크기', boxVb(k)),
  favicon: (k) => wrap100(`<path d="${sq(0, 0, 100, 22.4)}" fill="url(#bg)"/><clipPath id="cl"><path d="${sq(0, 0, 100, 22.4)}"/></clipPath><g clip-path="url(#cl)">${k.mark(L)}</g>`, grad('bg', L), '파비콘·Windows·웹 아이콘 — 둥근 네모'),
  // 16·32px: 작은 그림(s) + 기호를 판에 더 꽉
  'favicon-small': (k) => wrap100(`<path d="${sq(0, 0, 100, 22.4)}" fill="url(#bg)"/><clipPath id="cl"><path d="${sq(0, 0, 100, 22.4)}"/></clipPath><g clip-path="url(#cl)">${zoom(k.mark(L, true), 1.12)}</g>`, grad('bg', L), '파비콘 작은 크기(≤32px)'),
  'splash-light': (k) => wrap100(k.mark(L), '', `스플래시(라이트) — 배경 ${PALETTE.brand}`, boxVb(k)),
  'splash-dark': (k) => wrap100(k.mark(D), '', `스플래시(다크) — 배경 ${PALETTE.brandDark}`, boxVb(k))
}

export function variantSvg(conceptId, variant) {
  const k = CONCEPTS[conceptId]
  if (!k) throw new Error(`없는 후보: ${conceptId}`)
  const fn = (k.mark ? MARK_VARIANTS : VARIANTS)[variant]
  if (!fn) throw new Error(`없는 쓰임새: ${variant}`)
  return fn(k)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const out = join(root, 'docs', 'release', 'brand', 'concepts')
  mkdirSync(out, { recursive: true })
  let n = 0
  for (const id of Object.keys(CONCEPTS)) {
    for (const v of Object.keys(CONCEPTS[id].mark ? MARK_VARIANTS : VARIANTS)) {
      writeFileSync(join(out, `${id}-${v}.svg`), variantSvg(id, v))
      n++
    }
  }
  console.log(`SVG ${n}개 → ${out}`)
}
