// 45 확정 브랜드(씨앗 친구 × 깊은 숲)의 원본 SVG와 글자 로고가 들어간 그림을 만든다.
//   . scripts/node22.sh && node scripts/brand/build-marketing.mjs
// 만드는 것(모두 git에 넣는다):
//   docs/release/brand/kkumteul/*.svg      아이콘·기호·글자 로고·가로 짝 원본
//   docs/readme/banner-{light,dark}.png      README 배너 1600×560
//   docs/release/store/play-assets/feature-graphic-1024x500.png   Play 그래픽 이미지(투명 없음)
// 소개 문장은 Pretendard(OFL, 앱에 같이 넣은 글꼴)로 조판하고, 로고 글자(꿈틀·Kkumteul)는 wordmark.mjs의 직접 그린 획이다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONCEPTS, MONO, PALETTE, RECOMMENDED, SEED_COLORS } from './glyphs.mjs'
import { variantSvg } from './compose.mjs'
import { chromePath } from './render.mjs'
import { execFileSync } from 'node:child_process'
import { EN, KO, enSvg, koSvg, wordEn, wordKo } from './wordmark.mjs'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const k = CONCEPTS[RECOMMENDED]
const L = SEED_COLORS.light
const D = SEED_COLORS.dark
const INK = '#13201C'
const INK_D = '#ECF4F0'
const font = `"Pretendard", "Pretendard Variable", "Apple SD Gothic Neo", sans-serif`
const fontFace = `@font-face{font-family:"Pretendard Variable";src:url("file://${join(root, 'apps/desktop/src/renderer/src/assets/fonts/PretendardVariable.woff2')}") format("woff2");font-weight:100 900}`

const out = (p, text) => (mkdirSync(dirname(join(root, p)), { recursive: true }), writeFileSync(join(root, p), text), p)
const made = []

/** 100 판 아이콘 몸 — 둥근 네모 판 + 기호 */
const sq = (r = 22.4) => {
  const x = 0, y = 0, w = 100, q = r * 1.28
  return `M${x + q} ${y} H${x + w - q} C${x + w - r * 0.2} ${y} ${x + w} ${y + r * 0.2} ${x + w} ${y + q} V${y + w - q} C${x + w} ${y + w - r * 0.2} ${x + w - r * 0.2} ${y + w} ${x + w - q} ${y + w} H${x + q} C${x + r * 0.2} ${y + w} ${x} ${y + w - r * 0.2} ${x} ${y + w - q} V${y + q} C${x} ${y + r * 0.2} ${x + r * 0.2} ${y} ${x + q} ${y} Z`
}
let uid = 0
const iconBody = (c = L) => {
  const id = `ib${++uid}`
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient><clipPath id="${id}c"><path d="${sq()}"/></clipPath></defs><path d="${sq()}" fill="url(#${id})"/><g clip-path="url(#${id}c)">${k.mark(c)}</g>`
}
const monoGlyph = (color) => {
  const id = `mg${++uid}`
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><rect x="-20" y="-20" width="140" height="140" fill="#000"/>${k.mark(MONO)}</mask><rect x="-20" y="-20" width="140" height="140" fill="${color}" mask="url(#${id})"/>`
}

// ── 1) 원본 SVG ───────────────────────────────────────
const dir = 'docs/release/brand/kkumteul'
for (const [v, name] of [['ios-light', 'icon'], ['ios-dark', 'icon-ios-dark'], ['ios-tinted', 'icon-ios-tinted'], ['mac-light', 'icon-mac'], ['mac-dark', 'icon-mac-dark'], ['favicon', 'icon-rounded'], ['favicon-small', 'icon-rounded-small'], ['android-fg', 'android-foreground'], ['android-bg', 'android-background'], ['android-mono', 'android-monochrome'], ['mono', 'glyph-mono'], ['mono-small', 'glyph-mono-small'], ['splash-light', 'glyph-color'], ['splash-dark', 'glyph-color-dark']])
  made.push(out(`${dir}/${name}.svg`, variantSvg(RECOMMENDED, v)))
made.push(out(`${dir}/wordmark-ko.svg`, koSvg({ ink: INK, leaf: '#3DB79B', leaf2: '#8EE6A6' })))
made.push(out(`${dir}/wordmark-ko-white.svg`, koSvg({ ink: '#FFFFFF', leaf: '#8EE6A6', leaf2: '#C6F5A6' })))
made.push(out(`${dir}/wordmark-ko-mono.svg`, koSvg({ ink: '#000000', leaf: '#000000' })))
made.push(out(`${dir}/wordmark-en.svg`, enSvg({ ink: INK })))
made.push(out(`${dir}/wordmark-en-white.svg`, enSvg({ ink: '#FFFFFF' })))

/** 가로 짝: 아이콘 180 + 꿈틀 + 아래 Kkumteul (높이 200 단위) */
function lockupSvg({ dark = false, mono = null } = {}) {
  const ink = mono ?? (dark ? INK_D : INK)
  const sub = mono ?? (dark ? '#A0B0A9' : '#56655F')
  const icon = mono ? monoGlyph(mono) : iconBody(L)
  const ks = 0.66
  const koW = KO.box[2] * ks
  const W = Math.round(180 + 40 + koW + 8)
  const body =
    `<svg x="0" y="10" width="180" height="180" viewBox="${mono ? k.box.join(' ') : '0 0 100 100'}">${icon}</svg>` +
    `<g transform="translate(${220 - KO.box[0] * ks} ${16 - KO.box[1] * ks}) scale(${ks})">${wordKo({ ink, leaf: mono ?? (dark ? '#6EE0C2' : '#3DB79B'), leaf2: mono ?? (dark ? '#B3EE8F' : '#8EE6A6') })}</g>` +
    `<g transform="translate(${222} ${150}) scale(.27)">${wordEn({ ink: sub })}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 200" role="img" aria-label="꿈틀 Kkumteul"><title>꿈틀 Kkumteul</title>${body}</svg>\n`
}
made.push(out(`${dir}/lockup.svg`, lockupSvg()))
made.push(out(`${dir}/lockup-dark.svg`, lockupSvg({ dark: true })))
made.push(out(`${dir}/lockup-mono.svg`, lockupSvg({ mono: '#000000' })))

// ── 2) README 배너 1600×560 ───────────────────────────
function banner(dark) {
  const bg = dark ? '#0A100E' : '#F3F5F1'
  const ink = dark ? INK_D : INK
  const sub = dark ? '#A0B0A9' : '#56655F'
  const chipBg = dark ? '#141B18' : '#FFFFFF'
  const chipLine = dark ? '#2E3934' : '#DCE5DF'
  const dot = dark ? '#3CC4A2' : '#12715E'
  const chips = ['AI 자동 정리', '작업 지도', '성장 캐릭터', 'macOS · Windows · iOS · Android']
  const ks = 0.82
  return `<!doctype html><meta charset="utf-8"><style>${fontFace}
html,body{margin:0;width:1600px;height:560px;overflow:hidden;background:${bg};font-family:${font}}
.icon{position:absolute;left:150px;top:160px;width:240px;height:240px;filter:drop-shadow(0 18px 30px rgba(10,67,55,${dark ? 0.5 : 0.22}))}
.ko{position:absolute;left:486px;top:52px}.en{position:absolute;left:${486 + 232 * ks + 22}px;top:${52 + 175 * ks - 86 * 0.42 - 22}px}
.tag{position:absolute;left:494px;top:236px;font-size:36px;line-height:50px;font-weight:600;color:${sub};letter-spacing:-.02em}
.chips{position:absolute;left:492px;top:360px;width:760px;display:flex;flex-wrap:wrap;gap:16px}
.chip{display:flex;align-items:center;gap:12px;height:54px;padding:0 24px;border-radius:27px;background:${chipBg};border:2px solid ${chipLine};font-size:24px;font-weight:650;color:${ink}}
.chip i{width:11px;height:11px;border-radius:50%;background:${dot}}
.leaf{position:absolute;right:120px;top:60px;width:320px;height:440px;opacity:${dark ? 0.9 : 1}}
</style>
<svg class="icon" viewBox="0 0 100 100">${iconBody()}</svg>
<svg class="ko" width="${232 * ks}" height="${175 * ks}" viewBox="${KO.box.join(' ')}">${wordKo({ ink, leaf: dark ? '#6EE0C2' : '#3DB79B', leaf2: dark ? '#B3EE8F' : '#8EE6A6' })}</svg>
<svg class="en" width="${403 * 0.42}" height="${86 * 0.42}" viewBox="${EN.box.join(' ')}">${wordEn({ ink: '#8D9A94' })}</svg>
<div class="tag">할 일을 끝낼수록 캐릭터가 자라는<br>할 일 · 캘린더 앱</div>
<div class="chips">${chips.map((t) => `<div class="chip"><i></i>${t}</div>`).join('')}</div>`
}
// ── 3) Play 그래픽 이미지 1024×500 ────────────────────
function feature() {
  const ks = 0.86
  return `<!doctype html><meta charset="utf-8"><style>${fontFace}
html,body{margin:0;width:1024px;height:500px;overflow:hidden;font-family:${font};background:linear-gradient(160deg,${L.bg1},${L.bg2})}
.g{position:absolute;left:150px;top:96px;width:300px;height:300px;filter:drop-shadow(0 16px 26px rgba(0,0,0,.25))}
.ko{position:absolute;left:496px;top:96px}
.tag{position:absolute;left:504px;top:${96 + 175 * ks + 14}px;font-size:30px;font-weight:650;color:#E4F5EE;letter-spacing:-.02em}
.dots{position:absolute;left:0;top:0;width:1024px;height:500px}
</style>
<svg class="dots" viewBox="0 0 1024 500"><circle cx="930" cy="70" r="120" fill="#fff" opacity=".05"/><circle cx="60" cy="470" r="160" fill="#fff" opacity=".04"/><circle cx="890" cy="430" r="10" fill="${PALETTE.honey}" opacity=".9"/><circle cx="930" cy="400" r="6" fill="${PALETTE.apricot}" opacity=".9"/></svg>
<svg class="g" viewBox="${k.box.join(' ')}">${k.mark(L)}</svg>
<svg class="ko" width="${232 * ks}" height="${175 * ks}" viewBox="${KO.box.join(' ')}">${wordKo({ ink: '#FFFFFF', leaf: '#8EE6A6', leaf2: '#C6F5A6' })}</svg>
<div class="tag">할 일을 끝낼수록 자라는 플래너</div>`
}

const tmp = join(root, 'docs/release/brand/out/marketing')
mkdirSync(tmp, { recursive: true })
function shoot(html, png, w, h) {
  const f = join(tmp, `${png.split('/').pop()}.html`)
  writeFileSync(f, html)
  // HTML을 그대로 찍는다(render.mjs는 SVG용이라 여기서 Chrome을 직접 부른다)
  renderHtml(f, join(root, png), w, h)
  made.push(png)
}
function renderHtml(file, outPng, w, h) {
  execFileSync(chromePath(), ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=2000', `--window-size=${w},${h}`, `--screenshot=${outPng}`, `file://${file}`], { stdio: 'ignore' })
}
shoot(banner(false), 'docs/readme/banner-light.png', 1600, 560)
shoot(banner(true), 'docs/readme/banner-dark.png', 1600, 560)
shoot(feature(), 'docs/release/store/play-assets/feature-graphic-1024x500.png', 1024, 500)
{
  // Play: 투명 없음
  const p = join(root, 'docs/release/store/play-assets/feature-graphic-1024x500.png')
  const img = PNG.sync.read(readFileSync(p))
  writeFileSync(p, PNG.sync.write(img, { colorType: 2, inputHasAlpha: true, bgColor: { red: 18, green: 113, blue: 94 } }))
}
console.log(made.map((m) => `- ${m}`).join('\n'))
