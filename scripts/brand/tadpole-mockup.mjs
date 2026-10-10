// 45 v1.1 시안 — 방울 올챙이(사용자 2026-10-10 "이 친구를 로고로"). 직접 그린 원본.
// 100 × 100 판. 지금 씨앗 친구(CONCEPTS.seed)와 나란히 놓고 고르기 위한 시안이다(아이콘 파일은 덮어쓰지 않음).
//   node scripts/brand/tadpole-mockup.mjs → docs/screens/mockups/brand-tadpole.html
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONCEPTS, SEED_COLORS, SN, SN_DARK, snail } from './glyphs.mjs'
import { wordKo, wordEn } from './wordmark.mjs'

const here = dirname(fileURLToPath(import.meta.url))
let uid = 0

// 올챙이 몸: 둥근 머리 + 오른쪽 짧은 꼬리(사진처럼 살짝 위로)
const BODY = 'M46 42 C55 42 61 46 64.5 51.5 C68 49 74 48.5 76.5 52 C79 56 74 60.5 67 61.5 C66.5 72.5 58 81 46 81 C34 81 26.5 72.5 26.5 61.5 C26.5 50.5 35 42 46 42 Z'

const leafPair = (x, y, k, c, w) =>
  `<path d="M${x} ${y + 9 * k} V${y + 1}" stroke="${c.stem}" stroke-width="${w}" stroke-linecap="round"/>` +
  `<path transform="translate(${x} ${y}) scale(${k})" d="M-1 1 C-8 1 -15 -3 -17 -12 C-8 -13 -2 -8 -1 1 Z" fill="${c.leaf2}"/>` +
  `<path transform="translate(${x} ${y}) scale(${k})" d="M1 0 C2 -9 8 -15 18 -15 C18 -5 11 0 1 0 Z" fill="${c.leaf}"/>`

/** 올챙이 하나 — small: 32px 이하(눈 키우고 빛·입 뺌) */
function tadpole(c, { small = false, mono = false } = {}) {
  const id = `t${++uid}`
  const fill = mono ? '#fff' : `url(#${id}b)`
  const defs = mono ? '' : `<defs><radialGradient id="${id}b" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${c.body1}"/><stop offset=".65" stop-color="${c.body2}"/><stop offset="1" stop-color="${c.body3}"/></radialGradient></defs>`
  const er = small ? [3.4, 4.2] : [2.5, 3.1]
  return defs + `<path d="${BODY}" fill="${fill}"/>` +
    (mono || small ? '' : `<ellipse cx="37" cy="50" rx="6" ry="3.2" transform="rotate(-28 37 50)" fill="#fff" opacity=".35"/>`) +
    `<ellipse cx="39" cy="63" rx="${er[0]}" ry="${er[1]}" fill="${mono ? '#000' : c.eye}"/><ellipse cx="55" cy="63" rx="${er[0]}" ry="${er[1]}" fill="${mono ? '#000' : c.eye}"/>` +
    (mono || small ? '' : `<circle cx="39.9" cy="61.8" r=".9" fill="#fff"/><circle cx="55.9" cy="61.8" r=".9" fill="#fff"/>`) +
    (small ? '' : `<path d="M44.5 70 Q47 72.4 49.5 70" stroke="${mono ? '#000' : c.eye}" stroke-width="1.7" stroke-linecap="round" fill="none"/>`)
}

/** 방울: 반투명 면 + 테두리 + 오른쪽 위 빛 줄 */
function bubble(c, { small = false, mono = false } = {}) {
  const id = `b${++uid}`
  if (mono) return `<circle cx="50" cy="57" r="32" fill="none" stroke="#fff" stroke-width="${small ? 6 : 4}"/>`
  return `<defs><radialGradient id="${id}" cx=".5" cy=".45" r=".55"><stop offset=".7" stop-color="#fff" stop-opacity="${c.bubbleIn}"/><stop offset="1" stop-color="#fff" stop-opacity="${c.bubbleEdge}"/></radialGradient></defs>` +
    `<circle cx="50" cy="57" r="32" fill="url(#${id})"/>` +
    `<circle cx="50" cy="57" r="32" fill="none" stroke="#fff" stroke-opacity="${c.rim}" stroke-width="${small ? 3 : 1.6}"/>` +
    (small ? '' : `<path d="M63 31.5 C71 35.5 77 43 79 52" stroke="#fff" stroke-opacity=".75" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="76.5" cy="58" r="1.6" fill="#fff" opacity=".7"/>`)
}

// 안별 마크(100 판) ------------------------------------------------------------
const MARKS = {
  // A: 사진 그대로 — 방울 + 올챙이 + 방울 위 새싹
  bubble: (c, o = {}) => bubble(c, o) + `<g transform="translate(3.5 -3) scale(.93)">${tadpole(c, o)}</g>` + leafPair(50, 17, o.small ? 1.1 : 0.95, c, o.small ? 5 : 3.8) + (o.mono ? '' : ''),
  // B: 방울 없이 올챙이를 크게, 새싹은 머리 위(다른 캐릭터처럼)
  solo: (c, o = {}) => `<g transform="translate(-10 -14) scale(1.25)">${tadpole(c, o)}</g>` + leafPair(47.5, 30, o.small ? 1.15 : 1, c, o.small ? 5.5 : 4.4),
  // D: 알껍질 속 아기 달팽이(사용자 2026-10-10 두 번째 사진) — 껍질 컵 + 크림 몸 + 더듬이 + 등 껍데기 + 새싹
  snail: (c, o = {}) => snail(c, { ...o, cup: true }),
  // E: 껍질 컵 없이 달팽이만 크게
  snailSolo: (c, o = {}) => `<g transform="translate(-12 -16) scale(1.26)">${snail(c, { ...o, cup: false })}</g>`,
  // 지금 아이콘(비교용)
  seed: (c, o = {}) => CONCEPTS.seed.mark(o.mono ? { husk: '#fff', leaf: '#fff', leaf2: '#fff', eye: '#000', mono: true } : c.seedC, !!o.small)
}


// 판 색 -----------------------------------------------------------------------
const C = {
  forest: { bg: ['#167762', '#0A4337'], body1: '#C7EDD2', body2: '#9BD3AE', body3: '#6FAE8A', eye: '#1B2A22', leaf: '#B9EBC4', leaf2: '#DDF7CF', stem: '#B9EBC4', bubbleIn: .06, bubbleEdge: .28, rim: .6, seedC: SEED_COLORS.light, sn: SN },
  forestDark: { bg: ['#12261F', '#07110D'], body1: '#B3E3C2', body2: '#86C39C', body3: '#5C9877', eye: '#101A14', leaf: '#8FDCA9', leaf2: '#C2EDB2', stem: '#8FDCA9', bubbleIn: .05, bubbleEdge: .2, rim: .45, seedC: SEED_COLORS.dark, sn: SN_DARK },
  charcoal: { bg: ['#222927', '#121716'], sn: SN },
  meadow: { bg: ['#DCEFD9', '#A6D2AE'], body1: '#B5E2C3', body2: '#86C59E', body3: '#5E9F7B', eye: '#1B2A22', leaf: '#9ED8AE', leaf2: '#CDEFC0', stem: '#9ED8AE', bubbleIn: .12, bubbleEdge: .55, rim: .9, seedC: SEED_COLORS.light }
}

const VARIANTS = [
  { key: 'B', mark: 'solo', pal: 'forest', title: 'B · 올챙이만', sub: '앞서 고른 안 (비교용)' },
  { key: 'D', mark: 'snail', pal: 'forest', title: 'D · 알껍질 아기 달팽이', sub: '사진 그대로 — 깨진 알껍질 컵 + 더듬이 + 새싹, 깊은 숲 판' },
  { key: 'E', mark: 'snail', pal: 'charcoal', title: 'E · 알껍질 아기 달팽이 · 숯 판', sub: '사진의 어두운 판. 크림색 몸이 가장 또렷하게 뜸' },
  { key: 'F', mark: 'snailSolo', pal: 'forest', title: 'F · 달팽이만', sub: '알껍질 빼고 크게 — 작은 크기·단색에 가장 강함' }
]

function icon(v, size, { dark = false, small = size <= 32, rounded = true } = {}) {
  const pal = C[dark ? 'forestDark' : v.pal]
  const id = `g${++uid}`
  const r = rounded ? 22.37 : 0
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.bg[0]}"/><stop offset="1" stop-color="${pal.bg[1]}"/></linearGradient><clipPath id="${id}c"><rect width="100" height="100" rx="${r}"/></clipPath></defs><g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id})"/>${MARKS[v.mark](pal, { small })}</g></svg>`
}

function mono(v, size) {
  const id = `m${++uid}`
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><defs><mask id="${id}"><rect width="100" height="100" fill="#000"/>${MARKS[v.mark](C.forest, { mono: true, small: size <= 32 })}</mask></defs><rect width="100" height="100" fill="currentColor" mask="url(#${id})"/></svg>`
}

function lockupSvg(v, dark) {
  const ink = dark ? '#EAF4EF' : '#13201C'
  const sub = dark ? '#8FB3A5' : '#5B6E66'
  return `<svg viewBox="0 0 470 200" height="96"><svg x="0" y="10" width="180" height="180" viewBox="0 0 100 100">${icon(v, 100, { dark }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg><g transform="translate(226 34) scale(.74)">${wordKo({ ink, leaf: '#3DB79B', leaf2: '#8EE6A6' })}</g><g transform="translate(230 158) scale(.30)">${wordEn({ ink: sub })}</g></svg>`
}

const homeApps = ['#F2B84B', '#4169E8', '#D9343A', '#8C8C8C']
function homeRow(v, dark) {
  const others = homeApps.map((c) => `<div class="app"><div class="ph" style="background:${c}"></div><span>앱</span></div>`).join('')
  return `<div class="home ${dark ? 'home--dark' : ''}"><div class="app">${icon(v, 60, { dark })}<span>꿈틀</span></div>${others}</div>`
}

const cols = VARIANTS.map((v) => `
<section class="col${v.key === 'now' ? ' col--now' : ''}">
  <h2>${v.title}</h2><p class="sub">${v.sub}</p>
  <div class="big">${icon(v, 220)}</div>
  <div class="row">${icon(v, 220, { dark: true }).replace('width="220" height="220"', 'width="100" height="100"')}<div class="lbl">다크 아이콘</div></div>
  <div class="sizes">${[120, 60, 40, 29, 20, 16].map((s) => `<div>${icon(v, s, { rounded: s > 20 })}<small>${s}</small></div>`).join('')}</div>
  ${homeRow(v, false)}${homeRow(v, true)}
  <div class="mono"><div class="m1">${mono(v, 64)}</div><div class="m2">${mono(v, 24)}</div><div class="m3">${mono(v, 64)}</div><small>단색(iOS 색조 · Android 알림 · 트레이)</small></div>
  <div class="lock">${lockupSvg(v, false)}</div>
  <div class="lock lock--dark">${lockupSvg(v, true)}</div>
</section>`).join('')

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>꿈틀 로고 시안 v1.1</title>
<style>
:root{--bg:#F4F7F5;--card:#fff;--ink:#13201C;--sub:#5B6E66;--line:#E1E8E4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,"Pretendard",sans-serif;padding:28px}
h1{font-size:24px;margin:0 0 4px}.lead{color:var(--sub);margin:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(260px,1fr));gap:16px}
.col{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:14px}
.col--now{background:#FAFBFA}
h2{font-size:16px;margin:0}.sub{color:var(--sub);margin:-10px 0 0;font-size:12.5px;min-height:38px}
.big{display:flex;justify-content:center}.big svg{filter:drop-shadow(0 8px 18px rgba(10,67,55,.25))}
.row{display:flex;align-items:center;gap:12px}.lbl{color:var(--sub);font-size:12px}
.sizes{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}.sizes div{display:flex;flex-direction:column;align-items:center;gap:3px}.sizes small{color:var(--sub);font-size:10px}
.home{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:12px 8px;border-radius:12px;background:linear-gradient(160deg,#BFD6F2,#E8D5F0)}
.home--dark{background:linear-gradient(160deg,#1B2333,#2A1F33)}
.app{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:9.5px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35)}
.app svg,.app .ph{width:38px;height:38px}.app .ph{border-radius:8.5px;opacity:.9}
.mono{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mono small{color:var(--sub);font-size:11px;width:100%}
.m1{color:#12715E}.m2{color:#13201C}.m3{color:#fff;background:#1F2A26;border-radius:14px;padding:4px}
.lock{padding:10px 12px;border-radius:12px;border:1px solid var(--line)}.lock--dark{background:#0A100E;border-color:#0A100E}
.lock svg{max-width:100%}
</style></head><body>
<h1>꿈틀 로고 시안 v1.1 — 아기 달팽이 마스코트</h1>
<p class="lead">45 브랜드 명세 v1.1 후보. 각 열: 앱 아이콘(라이트·다크) · 크기별(120 → 16) · 홈 화면 · 단색 · 글자 로고 짝. 직접 그린 평면+부드러운 명암(3D 렌더 아님 — 16px·단색 아이콘 때문).</p>
<div class="grid">${cols}</div>
</body></html>`

const out = join(here, '../../docs/screens/mockups/brand-tadpole.html')
writeFileSync(out, html)
console.log(out)
