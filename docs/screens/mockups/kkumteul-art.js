/* 꿈틀 그림 모듈 v2 — 44 시각 개편 · 42/43 캐릭터 다시 그리기 시안 공용
   character-raising-v2.html · visual-refresh.html 이 같은 그림을 쓴다(그림은 이 파일 하나).
   화풍: 말랑한 비닐 인형 — 면마다 빛이 왼쪽 위에서 오는 둥근 음영(radialGradient) + 같은 색 계열의 얇은 선 + 흰 하이라이트 + 바닥 그림자.
   캐릭터 = "꿈틀 정원 친구들": 씨앗 껍질에서 나와 자라는 달팽이·꿀벌·애벌레(→나비)·올챙이(→개구리). 머리 새싹은 모든 종에 같다(브랜드 실).
   좌표: viewBox 0 0 120 120, 발밑 y 108. 장면: 0 0 600 420(받침 아래 땅 120), 받침 윗면 y 300. */
(function () {
'use strict'
const NS = 'http://www.w3.org/2000/svg'
const f = (n) => +(+n).toFixed(2)

/* ───────── 색 ───────── */
function rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
function hex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('') }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t) }
const lit = (h, t) => mix(h, '#FFFFFF', t)
const SHADE = '#2B3352'                       // 그늘은 검정이 아니라 차가운 남회색으로 섞는다 → 색이 탁해지지 않는다
const drk = (h, t) => mix(h, SHADE, t)

/* ───────── 공용 defs (문서에 한 번) ───────── */
let defsEl = null
const made = new Set()
function defs() {
  if (defsEl) return defsEl
  const s = document.createElementNS(NS, 'svg')
  s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true')
  s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  s.innerHTML = `<defs>
    <radialGradient id="kk-gloss" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="kk-ao" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1D2B22" stop-opacity=".34"/><stop offset=".6" stop-color="#1D2B22" stop-opacity=".12"/><stop offset="1" stop-color="#1D2B22" stop-opacity="0"/></radialGradient>
    <radialGradient id="kk-cheek" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FF7E9C" stop-opacity=".75"/><stop offset="1" stop-color="#FF7E9C" stop-opacity="0"/></radialGradient>
    <radialGradient id="kk-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>`
  ;(document.body || document.documentElement).prepend(s)
  defsEl = s.firstElementChild
  return defsEl
}
function addDef(id, html) { if (made.has(id)) return; made.add(id); defs().insertAdjacentHTML('beforeend', html) }
/** 말랑한 둥근 음영: 빛 왼쪽 위. 모양마다 objectBoundingBox라 어떤 도형에도 맞는다 */
function V(h) {
  const id = 'kv' + h.replace('#', '').toLowerCase()
  addDef(id, `<radialGradient id="${id}" cx=".4" cy=".32" r=".78" fx=".34" fy=".22"><stop offset="0" stop-color="${lit(h, .46)}"/><stop offset=".34" stop-color="${lit(h, .14)}"/><stop offset=".7" stop-color="${h}"/><stop offset="1" stop-color="${drk(h, .3)}"/></radialGradient>`)
  return `url(#${id})`
}
/** 세로 그라데이션(하늘·언덕) */
function LG(a, b, id) { id = id || 'kl' + a.slice(1) + b.slice(1); addDef(id, `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`); return `url(#${id})` }
/** 옆으로 둥근 언덕용: 위가 밝고 아래가 진한 둥근 음영 */
function HV(h) { const id = 'kh' + h.slice(1); addDef(id, `<radialGradient id="${id}" cx=".45" cy=".05" r="1" fx=".4" fy="0"><stop offset="0" stop-color="${lit(h, .32)}"/><stop offset=".55" stop-color="${h}"/><stop offset="1" stop-color="${drk(h, .22)}"/></radialGradient>`); return `url(#${id})` }

const line = (h, w = 1, o = .5) => ` stroke="${drk(h, .45)}" stroke-opacity="${o}" stroke-width="${w}"`
/** 음영 타원·원·패스 */
const E = (cx, cy, rx, ry, h, ex = '') => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${V(h)}"${line(h, .9)} ${ex}/>`
const C = (cx, cy, r, h, ex = '') => E(cx, cy, r, r, h, ex)
const P = (d, h, ex = '') => `<path d="${d}" fill="${V(h)}"${line(h, .9)} stroke-linejoin="round" ${ex}/>`
const Ef = (cx, cy, rx, ry, fill, ex = '') => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${ex}/>`
const gloss = (cx, cy, rx, ry, o = .8, rot = -20) => `<ellipse class="c-gl" cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#kk-gloss)" opacity="${o}" transform="rotate(${rot} ${f(cx)} ${f(cy)})"/>`
const rot = (a, x, y) => `transform="rotate(${a} ${f(x)} ${f(y)})"`
const star5 = (x, y, r, fill, ex = '') => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .48 : r; p += (i ? 'L' : 'M') + f(x + rr * Math.cos(a)) + ' ' + f(y + rr * Math.sin(a)) } return `<path d="${p}Z" fill="${fill}" stroke="${fill}" stroke-width="${f(r * .3)}" stroke-linejoin="round" ${ex}/>` }
const crescent = (x, y, r, fill) => `<path d="M${f(x)} ${f(y - r)} A${f(r)} ${f(r)} 0 1 0 ${f(x)} ${f(y + r)} A${f(r * 1.2)} ${f(r * 1.2)} 0 0 1 ${f(x)} ${f(y - r)}Z" fill="${fill}"/>`

/* ───────── 데이터 (43 그대로 + 새 종) ───────── */
const INK = '#25222E', LEAF = '#4FBF6A', LEAF2 = '#2E9E55', GOLD = '#F2B53A', PINK = '#FF8FB1'
const SPECIES = {
  snail: { name: '달팽이', full: '꾸준한 달팽이', pet: '느리', old: 'turtle', why: '느려도 정한 길을 끝까지 간다 — 등 껍데기에 정원이 자란다' },
  bee:   { name: '꿀벌',   full: '차곡차곡 꿀벌', pet: '모아', old: 'squirrel', why: '여러 꽃을 빠짐없이 돌며 꿀을 모은다 — 꿀단지가 차오른다' },
  worm:  { name: '애벌레', full: '몰두하는 애벌레', pet: '꿈틀', old: 'cat', why: '한 잎에 푹 빠져 먹다 고치를 짓고 나비가 된다 — 몰입이 날개가 된다' },
  frog:  { name: '개구리', full: '재주 많은 개구리', pet: '퐁', old: 'otter', why: '여기저기 뛰며 물방울을 저글링한다 — 올챙이에서 개구리로' }
}
const STAGES = [null, { name: '아기', from: 1 }, { name: '꼬마', from: 3 }, { name: '친구', from: 6 }, { name: '단짝', from: 10 }, { name: '전설', from: 15 }]
const stageOf = (lv) => lv >= 15 ? 5 : lv >= 10 ? 4 : lv >= 6 ? 3 : lv >= 3 ? 2 : 1
const need = (lv) => 40 + 20 * (lv - 1)
const PATHS = {
  snail: { a: { name: '이끼 정원', line: '껍데기에 이끼와 흰 꽃이 자라', t: ['이끼 달팽이', '정원 달팽이', '숲지기 달팽이'] }, b: { name: '꽃 정원', line: '껍데기에 분홍 꽃이 피어', t: ['꽃 달팽이', '꽃밭 달팽이', '벚나무 달팽이'] } },
  bee:   { a: { name: '해바라기 길', line: '꿀단지를 들고, 해바라기 관', t: ['꿀단지 꿀벌', '목도리 꿀벌', '해바라기관 꿀벌'] }, b: { name: '들꽃 길', line: '꽃바구니를 들고, 데이지 관', t: ['꽃바구니 꿀벌', '하늘목도리 꿀벌', '데이지관 꿀벌'] } },
  worm:  { a: { name: '밤하늘 날개', line: '남색 날개에 별무늬', t: ['실타래 애벌레', '밤날개 나비', '별날개 나비'] }, b: { name: '노을 날개', line: '주황 날개에 노을 띠', t: ['꽃잎 애벌레', '노을날개 나비', '노을빛 나비'] } },
  frog:  { a: { name: '물방울', line: '물방울 목걸이, 연꽃 관', t: ['물방울 개구리', '저글링 개구리', '연꽃관 개구리'] }, b: { name: '산딸기', line: '산딸기 목걸이, 산딸기 관', t: ['산딸기 개구리', '산딸기 저글링 개구리', '산딸기관 개구리'] } }
}
const TITLE12 = { snail: ['아기 달팽이', '꼬마 달팽이'], bee: ['아기 꿀벌', '꿀방울 꿀벌'], worm: ['아기 애벌레', '잎사귀 애벌레'], frog: ['아기 올챙이', '꼬마 올챙이'] }
const titleOf = (sp, st, path = 'a') => st <= 2 ? TITLE12[sp][st - 1] : PATHS[sp][path].t[st - 3]
const MARK = { snail: '주근깨', bee: '주근깨', worm: '노란 점', frog: '물방울 점' }
const SLOTS = [['hat', '모자'], ['neck', '목'], ['hand', '손'], ['back', '등'], ['room', '방']]
const ITEMS = [
  { id: 'grass', slot: 'bg', name: '풀밭', rule: { lv: 1 } },
  { id: 'acorn-cap', slot: 'hat', name: '도토리 모자', rule: { lv: 2 } },
  { id: 'ribbon', slot: 'neck', name: '빨간 리본', rule: { lv: 3 }, why: '꼬마 진화 선물' },
  { id: 'pencil', slot: 'hand', name: '몽당연필', rule: { lv: 4 } },
  { id: 'leaf-hat', slot: 'hat', name: '잎사귀 모자', rule: { lv: 5 } },
  { id: 'sunset', slot: 'bg', name: '노을 언덕', rule: { lv: 6 }, why: '친구 진화 선물' },
  { id: 'bandana', slot: 'neck', name: '노랑 반다나', rule: { lv: 7 } },
  { id: 'straw', slot: 'hat', name: '밀짚모자', rule: { lv: 8 } },
  { id: 'backpack', slot: 'back', name: '작은 배낭', rule: { lv: 9 } },
  { id: 'night', slot: 'bg', name: '밤하늘', rule: { lv: 10 }, why: '단짝 진화 선물' },
  { id: 'bowtie', slot: 'neck', name: '나비넥타이', rule: { lv: 11 } },
  { id: 'beanie', slot: 'hat', name: '방울 털모자', rule: { lv: 12 } },
  { id: 'balloon', slot: 'hand', name: '풍선', rule: { lv: 13 } },
  { id: 'wings', slot: 'back', name: '잎 날개', rule: { lv: 15 }, why: '전설 진화 선물' },
  { id: 'mug', slot: 'hand', name: '머그컵', rule: { days: 7 } },
  { id: 'lantern', slot: 'back', name: '초롱', rule: { days: 30 } },
  { id: 'lei', slot: 'neck', name: '꽃목걸이', rule: { reviews: 4 } },
  { id: 'flag', slot: 'hand', name: '작은 깃발', rule: { projects: 1 } },
  { id: 'songpyeon', slot: 'hand', name: '송편', rule: { season: 'chuseok' } },
  { id: 'moon', slot: 'bg', name: '보름달 밤', rule: { season: 'chuseok' } },
  { id: 'santa', slot: 'hat', name: '산타 모자', rule: { season: 'xmas' } },
  { id: 'snow', slot: 'bg', name: '눈 오는 날', rule: { season: 'xmas' } },
  { id: 'bok', slot: 'hand', name: '복주머니', rule: { season: 'seollal' } }
]
const DECOR = [
  { id: 'pot', name: '꽃 화분', lv: 2 }, { id: 'fence', name: '나무 울타리', lv: 3 }, { id: 'mushlamp', name: '버섯 등', lv: 4 },
  { id: 'butterfly', name: '나비', lv: 5 }, { id: 'ball', name: '공', lv: 6 }, { id: 'bunting', name: '깃발 줄', lv: 8 },
  { id: 'tent', name: '작은 텐트', lv: 10 }, { id: 'firefly', name: '반딧불', lv: 12 }, { id: 'arch', name: '꽃 아치', lv: 15 }
]
const SEASON = { chuseok: '추석 앞뒤 7일', xmas: '12/18–12/31', seollal: '설 앞뒤 7일' }
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]))
const budsOf = (lv) => Math.min(3, lv - STAGES[stageOf(lv)].from)
const marksOf = (lv) => Math.min(6, Math.floor(lv / 2))

/* 종 색 (44 §5 캐릭터 색 토큰) */
const PAL0 = {
  snail: { skin: '#F6E4B8', shell: '#EE9B5C', shellL: '#B9622E', moss: '#5FBF66', moss2: '#8ED67A', flower: '#FFFFFF', canopy: '#56B964', blossom: '#FF9DB8', tint: '#DDF2CF', mark: '#E0A574' },
  bee:   { skin: '#FFD452', stripe: '#5A3F2E', wing: '#E4F4FF', ruff: '#FFF4D6', pot: '#F0A63C', scarf: '#F5874B', crown: '#FFC21F', crownC: '#8A5A2B', tint: '#FFEDB0', mark: '#E39A3A' },
  worm:  { skin: '#93DC6C', dot: '#FFE27A', belly: '#DDF6C8', cocoon: '#F5EEDF', wing: '#4361B0', wing2: '#7E9BE0', pat: '#FFD45C', tint: '#D5E1FF', mark: '#FFE27A' },
  frog:  { skin: '#7ED3EC', belly: '#EAFAFF', dark: '#3E9FC4', drop: '#A8E4FF', neck: '#C6F0FF', crown: '#FFB3C8', crownC: '#FFE07A', tint: '#C8EEF8', mark: '#4FB0D3' }
}
function pal(sp, path, st) {
  const p = { ...PAL0[sp] }
  if (path !== 'b' || st < 3) return p
  if (sp === 'snail') Object.assign(p, { moss: '#FF9DB8', moss2: '#FFC4D4', flower: '#FFFFFF', canopy: '#FFAFC6', blossom: '#FFFFFF', tint: '#FFE1EA' })
  if (sp === 'bee') Object.assign(p, { pot: '#D9A867', scarf: '#86C5F2', crown: '#FFFFFF', crownC: '#FFD452', tint: '#E3F2FF' })
  if (sp === 'worm') Object.assign(p, { wing: '#F2774E', wing2: '#FFB05C', pat: '#FFE08A', tint: '#FFE0CC' })
  if (sp === 'frog') Object.assign(p, { neck: '#F2546B', crown: '#E8455A', crownC: '#5DBB63', drop: '#F2546B', tint: '#FFE0E4' })
  return p
}

/* 단계 몸 비율 (42 §3.1 그대로) */
const GEO = {
  1: { hy: 66, hr: 28, by: 96, brx: 22, bry: 12, e: 5.6 },
  2: { hy: 58, hr: 27, by: 89, brx: 21, bry: 17, e: 5.2 },
  3: { hy: 52, hr: 26, by: 86, brx: 23, bry: 21, e: 4.9 },
  4: { hy: 47, hr: 25.5, by: 83, brx: 25, bry: 24, e: 4.7 },
  5: { hy: 45, hr: 25.5, by: 82, brx: 26, bry: 25, e: 4.7 }
}
function anchors(st) {
  const g = GEO[st]
  return { cx: 60, top: g.hy - g.hr, hy: g.hy, hr: g.hr, ny: st === 1 ? 80 : g.hy + g.hr - 4, hx: 60, hy2: st === 1 ? 79 : g.by - 3, by: g.by, brx: g.brx, bry: g.bry, st }
}

/* ───────── 부품 ───────── */
function leaf(x, y, k, side, h = LEAF) { // side -1 왼쪽 1 오른쪽
  const s = side
  return `<path d="M${f(x)} ${f(y)} c${f(s * 4 * k)} ${f(-8 * k)} ${f(s * 13 * k)} ${f(-9 * k)} ${f(s * 15 * k)} ${f(-3 * k)} c${f(-s * 3 * k)} ${f(5 * k)} ${f(-s * 10 * k)} ${f(6 * k)} ${f(-s * 15 * k)} ${f(3 * k)}z" fill="${V(h)}"${line(h, .7, .45)}/><path d="M${f(x)} ${f(y)} q${f(s * 7 * k)} ${f(-4 * k)} ${f(s * 13 * k)} ${f(-3.5 * k)}" stroke="${lit(h, .45)}" stroke-width="${f(.8 * k + .2)}" fill="none" stroke-linecap="round" opacity=".8"/>`
}
function sprout(st, x, y, nb = 0) {
  const h = [0, 8, 10, 11, 12, 12][st], t = y - h + 2
  let s = `<g class="c-sprout" style="transform-origin:${x}px ${y}px"><path d="M${x} ${y} V${y - h}" stroke="${LEAF2}" stroke-width="3" stroke-linecap="round" fill="none"/>`
  for (let i = 0; i < nb; i++) { const yy = y - 2.5 - i * 2.6; s += leaf(i % 2 ? x - 1 : x + 1, yy, .55, i % 2 ? -1 : 1, LEAF2) }
  if (st === 1) s += leaf(x, t, .85, -1)
  else if (st <= 3) s += leaf(x, t, st === 2 ? .95 : 1.1, -1) + leaf(x, t - 1, st === 2 ? .95 : 1.1, 1)
  else if (st === 4) s += leaf(x, t, 1.15, -1) + leaf(x, t - 1, 1.15, 1) + leaf(x, y - h / 2 + 1, .72, 1, LEAF2)
  else {
    s += leaf(x, t + 2, 1, -1) + leaf(x, t + 1, 1, 1)
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; s += C(x + 3.8 * Math.cos(a), y - h - 2 + 3.8 * Math.sin(a), 2.9, PINK) }
    s += C(x, y - h - 2, 2.2, '#FFD45C')
  }
  return s + '</g>'
}
function marks(sp, p, cx, cy, hr, n) {
  if (!n) return ''
  const k = hr / 26
  const pos = sp === 'worm' || sp === 'frog' ? [[-9, -16], [10, -14], [0, -20], [-16, -6], [16, -5], [4, -11]] : [[-16, 6], [16, 6], [-13, 8.5], [13, 8.5], [-17.5, 9.8], [17.5, 9.8]]
  const r = sp === 'worm' || sp === 'frog' ? 2.6 : 1.3
  return pos.slice(0, n).map(([x, y]) => `<circle cx="${f(cx + x * k)}" cy="${f(cy + y * k)}" r="${r}" fill="${p.mark}" opacity="${sp === 'frog' ? .55 : .85}"/>`).join('')
}
function eye(x, y, e) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(e * .86)}" ry="${f(e * 1.04)}" fill="${INK}"/><ellipse cx="${f(x)}" cy="${f(y + e * .5)}" rx="${f(e * .55)}" ry="${f(e * .32)}" fill="#5B4F7A" opacity=".55"/><circle cx="${f(x + e * .3)}" cy="${f(y - e * .42)}" r="${f(e * .36)}" fill="#fff"/><circle cx="${f(x - e * .34)}" cy="${f(y + e * .34)}" r="${f(e * .15)}" fill="#fff" opacity=".85"/>`
}
function face(sp, cx, cy, e, mood, st) {
  const k = GEO[st].hr / 26, frogUp = sp === 'frog' && st >= 3, dx = frogUp ? GEO[st].hr * .5 : 10.5 * k, lx = cx - dx, rx = cx + dx, ey = frogUp ? cy - GEO[st].hr * .74 : cy + 1
  let s = ''
  if (mood === 'sleepy' || mood === 'pet') s += `<path d="M${f(lx - 5)} ${f(ey)} q5 ${mood === 'pet' ? -5 : 4} 10 0 M${f(rx - 5)} ${f(ey)} q5 ${mood === 'pet' ? -5 : 4} 10 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
  else if (mood === 'happy' || mood === 'giggle') s += `<path d="M${f(lx - 5)} ${f(ey + 1)} q5 -6.5 10 0 M${f(rx - 5)} ${f(ey + 1)} q5 -6.5 10 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
  else if (mood === 'wow') s += `<g class="c-eyes" style="transform-origin:${cx}px ${ey}px">${eye(lx, ey, e * 1.12)}${eye(rx, ey, e * 1.12)}</g>`
  else s += `<g class="c-eyes" style="transform-origin:${cx}px ${ey}px">${eye(lx, ey, e)}${eye(rx, ey, e)}</g>`
  s += `<ellipse cx="${f(cx - 18.5 * k)}" cy="${f(cy + 10)}" rx="6.4" ry="4.4" fill="url(#kk-cheek)"/><ellipse cx="${f(cx + 18.5 * k)}" cy="${f(cy + 10)}" rx="6.4" ry="4.4" fill="url(#kk-cheek)"/>`
  const my = frogUp ? cy + 5 : cy + 9.5
  if (mood === 'eat') s += Ef(cx, my + 2, 4.5, 5, '#8E3B4A')
  else if (mood === 'giggle') s += `<path d="M${f(cx - 6)} ${f(my - 1)} q6 9.5 12 0 Z" fill="#8E3B4A" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${f(cx - 3)} ${f(my + 3.6)} q3 -2 6 0" fill="#FF8FA3"/>`
  else if (mood === 'happy' || mood === 'smile' || mood === 'pet') s += `<path d="M${f(cx - 6)} ${f(my - .5)} q6 7 12 0" stroke="${INK}" stroke-width="2.1" fill="none" stroke-linecap="round"/>`
  else if (mood === 'sleepy') s += Ef(cx, my + 1.5, 2, 2.2, INK, 'opacity=".75"')
  else if (mood === 'wow') s += Ef(cx, my + 1.5, 2.9, 3.6, '#8E3B4A')
  else s += `<path d="M${f(cx - 4.6)} ${f(my - .3)} q2.3 2.8 4.6 0 q2.3 2.8 4.6 0" stroke="${INK}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`
  return s
}
/* 씨앗 껍질(아기 단계) — 알 대신 씨앗에서 나온다(브랜드: 새싹) */
const HUSK = '#D99A5B'
const huskBottom = () => `<path d="M28 84 L35 78.5 L41 85 L48 78.5 L54 85 L60 78.5 L66 85 L72 78.5 L79 85 L85 78.5 L92 84 C92 99 79 109 60 109 C41 109 28 99 28 84 Z" fill="${V(HUSK)}"${line(HUSK, 1.1, .55)} stroke-linejoin="round"/><path d="M36 95 q24 9 48 0" stroke="${lit(HUSK, .4)}" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/><path d="M42 101 q18 6 36 0" stroke="${drk(HUSK, .2)}" stroke-width="1.2" fill="none" opacity=".45" stroke-linecap="round"/>${gloss(42, 90, 6, 3, .55, -15)}`
const huskTop = () => `<path d="M60 22 C82 22 92 58 92 84 L85 78.5 L79 85 L72 78.5 L66 85 L60 78.5 L54 85 L48 78.5 L41 85 L35 78.5 L28 84 C28 58 38 22 60 22 Z" fill="${V(HUSK)}"${line(HUSK, 1.1, .55)} stroke-linejoin="round"/>${gloss(46, 42, 7, 13, .6, 20)}<path d="M60 26 C64 40 64 60 60 76" stroke="${drk(HUSK, .18)}" stroke-width="1.4" fill="none" opacity=".4"/>`

function spiral(cx, cy, r, col) {
  let d = ''; const turns = 2.1, n = 40
  for (let i = 0; i <= n; i++) { const t = i / n, a = -Math.PI / 2 + t * turns * 2 * Math.PI, rr = r * (1 - t * .9); d += (i ? 'L' : 'M') + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a)) }
  return `<path d="${d}" stroke="${col}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".75"/>`
}
function daisy(x, y, r, petal, center) { let s = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; s += Ef(x + r * .62 * Math.cos(a), y + r * .62 * Math.sin(a), r * .48, r * .48, petal) } return s + C(x, y, r * .42, center) }

/* 공통 몸(2단계부터): 발 · 몸 · 배 · 팔 */
function feetOf(g, h, wide = 1) { return E(48, g.by + g.bry - 2, 7.5 * wide, 4.8, h) + E(72, g.by + g.bry - 2, 7.5 * wide, 4.8, h) }
function bodyOf(g, h, bellyH) {
  let s = E(60, g.by, g.brx, g.bry, h)
  if (bellyH) s += Ef(60, g.by + g.bry * .22, g.brx * .62, g.bry * .62, V(bellyH))
  return s + gloss(60 - g.brx * .45, g.by - g.bry * .35, g.brx * .22, g.bry * .14, .6)
}
function armsOf(g, h, st) {
  const y = g.by - g.bry * (st >= 3 ? .15 : .35), x = g.brx + 1
  return `<g class="c-arm-l" style="transform-origin:${f(60 - x + 3)}px ${f(y - 4)}px">${E(60 - x + 1, y, 5, 7.5, h, rot(28, 60 - x + 1, y))}</g><g class="c-arm-r" style="transform-origin:${f(60 + x - 3)}px ${f(y - 4)}px">${E(60 + x - 1, y, 5, 7.5, h, rot(-28, 60 + x - 1, y))}</g>`
}
function headOf(g, h) { return C(60, g.hy, g.hr, h) + gloss(60 - g.hr * .42, g.hy - g.hr * .5, g.hr * .32, g.hr * .17, .85) }

/* 종마다: 반환 { back, ears, head, pattern, crown, neck, held, front, body, wingsFront } */
const SP = {
  snail(st, g, p, path) {
    const L = { back: '', ears: '', head: headOf(g, p.skin), pattern: '', crown: '', neck: '', held: '', front: '', body: '' }
    // 눈 더듬이(머리 뒤)
    const stalk = st === 1 ? 7 : 10 + st
    for (const s of [-1, 1]) {
      const bx = 60 + s * g.hr * .42, by = g.hy - g.hr * .78, tx = 60 + s * g.hr * .66, ty = by - stalk
      L.ears += `<g class="c-ear-${s < 0 ? 'l' : 'r'}" style="transform-origin:${f(bx)}px ${f(by)}px"><path d="M${f(bx)} ${f(by)} Q${f(bx + s * 1)} ${f(ty + 4)} ${f(tx)} ${f(ty)}" stroke="${drk(p.skin, .12)}" stroke-width="4.2" stroke-linecap="round" fill="none"/>${C(tx, ty, 3.8, p.skin)}</g>`
    }
    if (st === 1) {
      L.back += C(86, 74, 11, p.shell) + spiral(86, 74, 7, p.shellL)
      return L
    }
    const sx = 85 + st * .6, sy = g.by - g.bry * .35, sr = 15 + st * 2.2
    L.back += C(sx, sy, sr, p.shell) + spiral(sx, sy, sr * .72, p.shellL) + gloss(sx - sr * .35, sy - sr * .45, sr * .3, sr * .16, .8)
    if (st === 5) L.back += `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(sr)}" fill="none" stroke="${GOLD}" stroke-width="2.4"/>`
    const topY = sy - sr
    if (st >= 3) { // 껍데기 위 정원
      L.back += E(sx - 2, topY + 3, 11, 5, p.moss) + E(sx + 7, topY + 4, 7, 4, p.moss2)
      if (path === 'b') L.back += daisy(sx - 4, topY - 1, 4.2, p.moss, '#FFF3B0') + (st >= 4 ? daisy(sx + 7, topY + 1, 3.4, p.moss2, '#FFF3B0') : '')
      else L.back += daisy(sx - 3, topY, 3.6, '#FFFFFF', '#FFD45C')
    }
    if (st >= 4) { // 버섯 + 지팡이
      L.back += `<rect x="${f(sx + 9)}" y="${f(topY - 2)}" width="3" height="7" rx="1.5" fill="#F5EBDD"/>` + P(`M${f(sx + 5)} ${f(topY - 1)} Q${f(sx + 10.5)} ${f(topY - 10)} ${f(sx + 16)} ${f(topY - 1)} Z`, '#E8574B') + Ef(sx + 9, topY - 4, 1.2, 1, '#fff') + Ef(sx + 12.5, topY - 3, 1, .9, '#fff')
      if (st === 4) L.held = `<path d="M40 ${g.by + g.bry - 2} L44 ${g.by - 22}" stroke="#9B6A3E" stroke-width="3.2" stroke-linecap="round"/>${leaf(44, g.by - 22, .55, 1, LEAF2)}`
    }
    if (st === 5) { // 등에 자란 나무
      const tx = sx - 2, ty = topY - 2
      L.back += `<g class="c-tree" style="transform-origin:${f(tx)}px ${f(ty)}px"><path d="M${f(tx)} ${f(ty)} C${f(tx - 1)} ${f(ty - 10)} ${f(tx + 2)} ${f(ty - 16)} ${f(tx)} ${f(ty - 22)}" stroke="#93613A" stroke-width="4" fill="none" stroke-linecap="round"/>` +
        C(tx - 8, ty - 26, 10, p.canopy) + C(tx + 8, ty - 27, 10, p.canopy) + C(tx, ty - 34, 11, p.canopy) +
        [[-10, -28], [6, -33], [10, -24], [-3, -38]].map(([x, y]) => C(tx + x, ty + y, 2.2, p.blossom)).join('') + '</g>'
    }
    // 배발(한 덩어리 발) + 꼬리
    L.body = `<g class="c-tail" style="transform-origin:${f(60 - g.brx)}px ${f(g.by + g.bry - 3)}px">${E(60 - g.brx - 6, g.by + g.bry - 3.5, 16, 6, lit(p.skin, .05), rot(-6, 60 - g.brx - 6, g.by + g.bry - 3.5))}</g>` + E(60, g.by + g.bry - 2.5, g.brx + 6, 6.5, drk(p.skin, .04)) + bodyOf(g, p.skin, lit(p.skin, .5)) + armsOf(g, p.skin, st)
    return L
  },
  bee(st, g, p, path) {
    const L = { back: '', ears: '', head: headOf(g, p.skin), pattern: '', crown: '', neck: '', held: '', front: '', body: '' }
    const an = st === 1 ? 8 : 11 + st
    for (const s of [-1, 1]) {
      const bx = 60 + s * g.hr * .38, by = g.hy - g.hr * .86, tx = 60 + s * (g.hr * .62 + 4), ty = by - an
      L.ears += `<g class="c-ear-${s < 0 ? 'l' : 'r'}" style="transform-origin:${f(bx)}px ${f(by)}px"><path d="M${f(bx)} ${f(by)} Q${f(bx + s * 1)} ${f(ty + 2)} ${f(tx)} ${f(ty)}" stroke="${p.stripe}" stroke-width="2.4" stroke-linecap="round" fill="none"/>${C(tx, ty, 3.4, p.stripe)}</g>`
    }
    // 머리 앞머리 줄
    L.pattern = `<path d="M${f(60 - g.hr * .55)} ${f(g.hy - g.hr * .78)} q${f(g.hr * .55)} -5 ${f(g.hr * 1.1)} 0" stroke="${drk(p.skin, .18)}" stroke-width="2" fill="none" opacity=".35" stroke-linecap="round"/>`
    const wr = st === 1 ? 0 : [0, 0, 9, 11.5, 14, 16.5][st]
    if (wr) for (const s of [-1, 1]) {
      const x = 60 + s * (g.brx + wr * .45), y = g.by - g.bry - wr * .2
      L.back += `<g class="c-flap ${s > 0 ? 'r' : ''}" style="transform-origin:${f(60 + s * g.brx * .6)}px ${f(g.by - g.bry * .4)}px;--fl:${s * 8}deg">${E(x, y, wr, wr * .78, p.wing, `opacity=".92" ${rot(s * 25, x, y)}`)}${E(x + s * wr * .35, y + wr * .75, wr * .6, wr * .45, p.wing, `opacity=".9" ${rot(s * 40, x + s * wr * .35, y + wr * .75)}`)}${gloss(x - s * wr * .3, y - wr * .3, wr * .35, wr * .18, .9)}${st === 5 ? `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(wr)}" ry="${f(wr * .78)}" fill="none" stroke="${GOLD}" stroke-width="1.6" ${rot(s * 25, x, y)}/>` : ''}</g>`
    }
    if (st === 1) return L
    let stripes = ''
    for (const t of [-.18, .32]) {
      const yy = g.by + g.bry * t, w = g.brx * Math.sqrt(1 - t * t) - 1
      stripes += `<path d="M${f(60 - w)} ${f(yy - 2)} Q60 ${f(yy + 3)} ${f(60 + w)} ${f(yy - 2)} L${f(60 + w * .97)} ${f(yy + 3)} Q60 ${f(yy + 8)} ${f(60 - w * .97)} ${f(yy + 3)} Z" fill="${p.stripe}" opacity=".88"/>`
    }
    L.body = feetOf(g, p.stripe) + E(60, g.by, g.brx, g.bry, p.skin) + stripes + gloss(60 - g.brx * .45, g.by - g.bry * .4, g.brx * .22, g.bry * .14, .6) + armsOf(g, p.skin, st)
    if (st >= 3) { // 목 털
      let ruff = ''; for (let i = 0; i < 7; i++) { const t = i / 6, x = 60 - 15 + 30 * t, y = g.hy + g.hr - 4 + 3 * Math.sin(Math.PI * t); ruff += C(x, y, 4.2, p.ruff) }
      L.neck += ruff
    }
    if (st >= 4) L.neck += P(`M${f(60 - 18)} ${f(g.hy + g.hr - 6)} Q60 ${f(g.hy + g.hr + 2)} ${f(60 + 18)} ${f(g.hy + g.hr - 6)} L${f(60 + 17)} ${f(g.hy + g.hr)} Q60 ${f(g.hy + g.hr + 8)} ${f(60 - 17)} ${f(g.hy + g.hr)} Z`, p.scarf) + `<g class="c-scarf" style="transform-origin:${f(60 + 12)}px ${f(g.hy + g.hr + 2)}px">${P(`M${f(60 + 10)} ${f(g.hy + g.hr + 1)} l4 13 l7 -2 l-4 -12 Z`, p.scarf)}</g>`
    const hx = 60, hy = g.by - 2
    if (st === 2) L.held = P(`M${hx} ${hy - 9} C${hx + 6} ${hy - 2} ${hx + 6} ${hy + 5} ${hx} ${hy + 5} C${hx - 6} ${hy + 5} ${hx - 6} ${hy - 2} ${hx} ${hy - 9} Z`, '#FFB627') + gloss(hx - 2, hy - 1, 1.6, 2.6, .9, 0)
    if (st >= 3) {
      if (path === 'b') L.held = P(`M${hx - 11} ${hy - 4} h22 l-3 13 h-16 Z`, p.pot) + `<path d="M${hx - 10} ${hy} h20 M${hx - 9} ${hy + 4} h18" stroke="${drk(p.pot, .25)}" stroke-width="1" opacity=".5"/>` + daisy(hx - 5, hy - 6, 3.4, '#fff', '#FFD452') + daisy(hx + 4, hy - 7, 3.8, '#fff', '#FFD452') + `<path d="M${hx - 9} ${hy - 4} Q${hx} ${hy - 20} ${hx + 9} ${hy - 4}" stroke="${drk(p.pot, .2)}" stroke-width="1.8" fill="none"/>`
      else L.held = E(hx, hy + 2, 10, 9, p.pot) + `<rect x="${hx - 7}" y="${hy - 9}" width="14" height="5" rx="2.5" fill="${V(drk(p.pot, .1))}"/>` + P(`M${hx - 7} ${hy - 5} q2 6 4 1 q2 7 5 0 q3 5 5 0 l0 -1 Z`, '#FFC93B') + `<rect x="${hx - 5}" y="${hy}" width="10" height="6" rx="1.5" fill="#FFF4D6" opacity=".9"/>` + gloss(hx - 5, hy - 1, 2, 3.5, .8, 0)
    }
    if (st === 5) { // 꽃 관
      const cy = g.hy - g.hr + 3; let c = ''
      for (let i = 0; i < 9; i++) { const a = Math.PI + Math.PI * (i / 8), x = 60 + (g.hr - 2) * Math.cos(a), y = cy + 8 + 10 * Math.sin(a) * .9; c += E(x, y - 3, 3.4, 5.2, p.crown, rot(a * 180 / Math.PI + 90, x, y - 3)) }
      for (let i = 0; i < 5; i++) { const a = Math.PI + Math.PI * ((i + .5) / 5), x = 60 + (g.hr - 4) * Math.cos(a), y = cy + 8 + 10 * Math.sin(a) * .9; c += C(x, y - 1, 2.2, p.crownC) }
      L.crown = c
    }
    return L
  },
  worm(st, g, p, path) {
    const L = { back: '', ears: '', head: headOf(g, p.skin), pattern: '', crown: '', neck: '', held: '', front: '', body: '' }
    const an = st <= 2 ? 6 : st === 3 ? 9 : 14
    for (const s of [-1, 1]) {
      const bx = 60 + s * g.hr * .36, by = g.hy - g.hr * .88, tx = 60 + s * (g.hr * .5 + (st >= 4 ? 6 : 2)), ty = by - an
      const tip = st >= 4 ? `<path d="M${f(tx)} ${f(ty)} q${f(s * 4)} -2 ${f(s * 3)} 3" stroke="${drk(p.skin, .4)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` : C(tx, ty, 2.8, drk(p.skin, .25))
      L.ears += `<g class="c-ear-${s < 0 ? 'l' : 'r'}" style="transform-origin:${f(bx)}px ${f(by)}px"><path d="M${f(bx)} ${f(by)} Q${f(bx + s * 2)} ${f(ty + 3)} ${f(tx)} ${f(ty)}" stroke="${drk(p.skin, .4)}" stroke-width="2.2" stroke-linecap="round" fill="none"/>${tip}</g>`
    }
    if (st === 1) { L.pattern = C(60 - 11, g.hy - 17, 2.4, p.dot) + C(60 + 12, g.hy - 15, 2, p.dot); return L }
    if (st <= 3) { // 마디 몸(꿈틀)
      const segs = st === 2 ? [[51, g.by - 1, 13], [67, g.by + 7, 12], [80, g.by + 13, 7.5]] : [[50, g.by - 4, 15], [68, g.by + 5, 14], [82, g.by + 14, 9.5]]
      let b = ''
      segs.slice().reverse().forEach(([x, y, r], i) => {
        b += `<g class="c-seg s${i}" style="transform-origin:${x}px ${y}px">` + E(x - r + 1, y + r * .55, 3.2, 2.4, drk(p.skin, .18)) + E(x + r - 1, y + r * .55, 3.2, 2.4, drk(p.skin, .18)) + C(x, y, r, p.skin) + C(x - r * .35, y - r * .2, r * .2, p.dot) + C(x + r * .4, y + r * .1, r * .14, p.dot) + gloss(x - r * .4, y - r * .45, r * .3, r * .15, .7) + '</g>'
      })
      L.body = b
      if (st === 2) L.held = `<g ${rot(-18, 60, g.by - 4)}>${P(`M52 ${g.by - 2} C52 ${g.by - 16} 66 ${g.by - 20} 70 ${g.by - 18} C70 ${g.by - 8} 62 ${g.by} 52 ${g.by - 2} Z`, '#6CCB62')}<circle cx="69" cy="${g.by - 15}" r="3.2" fill="${V(p.skin)}" opacity="0"/><path d="M53 ${g.by - 3} Q61 ${g.by - 11} 68 ${g.by - 17}" stroke="${LEAF2}" stroke-width="1" fill="none"/></g>` + `<path d="M66 ${g.by - 19} a3 3 0 0 0 4 3" stroke="#fff" stroke-width="2.6" fill="none"/>`
      if (st === 3) { // 고치 망토 + 날개 싹
        for (const s of [-1, 1]) L.back += E(60 + s * 20, g.by - 14, 8, 6, p.wing, rot(s * 30, 60 + s * 20, g.by - 14))
        L.neck = P(`M${f(60 - 20)} ${f(g.by - 15)} Q60 ${f(g.by - 4)} ${f(60 + 20)} ${f(g.by - 15)} Q${f(60 + 24)} ${f(g.by + 6)} ${f(60 + 14)} ${f(g.by + 14)} Q60 ${f(g.by + 8)} ${f(60 - 14)} ${f(g.by + 14)} Q${f(60 - 24)} ${f(g.by + 6)} ${f(60 - 20)} ${f(g.by - 15)} Z`, p.cocoon) + `<path d="M${f(60 - 15)} ${f(g.by - 4)} q15 6 30 0 M${f(60 - 16)} ${f(g.by + 4)} q16 6 32 0" stroke="${drk(p.cocoon, .15)}" stroke-width="1.1" fill="none" opacity=".6"/>` + C(60, g.by - 9, 3, p.wing)
        L.held = path === 'b' ? `<g ${rot(-25, 60, g.by - 2)}>${P(`M60 ${g.by - 12} C67 ${g.by - 9} 66 ${g.by} 60 ${g.by + 2} C54 ${g.by} 53 ${g.by - 9} 60 ${g.by - 12} Z`, '#FFA7BE')}</g>` : C(60, g.by - 1, 7, '#F2E5CF') + `<path d="M55 ${g.by - 4} q5 5 10 0 M54 ${g.by} q6 5 12 0" stroke="#D9C5A2" stroke-width="1.1" fill="none"/>`
      }
    } else { // 나비
      const wy = g.by - g.bry * .55, big = st === 5 ? 1.22 : 1
      for (const s of [-1, 1]) {
        const ux = 60 + s * 24 * big, uy = wy - 9 * big, lx = 60 + s * 19 * big, ly = wy + 15 * big
        let w = E(ux, uy, 19 * big, 15 * big, p.wing, rot(s * -22, ux, uy)) + E(lx, ly, 12 * big, 10 * big, p.wing2, rot(s * 28, lx, ly))
        w += C(ux + s * 4 * big, uy - 2, 5.2 * big, lit(p.wing, .35)) + C(ux + s * 4 * big, uy - 2, 2.6 * big, p.pat)
        if (st === 5) {
          if (path === 'b') w += `<path d="M${f(ux - s * 12)} ${f(uy + 8)} q${f(s * 14)} -14 ${f(s * 30)} -10" stroke="${p.pat}" stroke-width="3" fill="none" opacity=".75" stroke-linecap="round"/><path d="M${f(ux - s * 8)} ${f(uy + 12)} q${f(s * 12)} -10 ${f(s * 25)} -6" stroke="#FFE3B8" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/>`
          else w += star5(ux - s * 8, uy + 4, 2.6, p.pat) + star5(ux + s * 10, uy + 7, 2, p.pat) + star5(lx + s * 3, ly + 2, 2.2, p.pat)
          w += `<ellipse cx="${f(ux)}" cy="${f(uy)}" rx="${f(19 * big)}" ry="${f(15 * big)}" fill="none" stroke="${GOLD}" stroke-width="1.8" ${rot(s * -22, ux, uy)}/>`
        }
        w += gloss(ux - s * 6, uy - 6, 5, 2.6, .7, s * -22)
        L.back += `<g class="c-flap ${s > 0 ? 'r' : ''}" style="transform-origin:${f(60 + s * 6)}px ${f(wy)}px;--fl:${s * 10}deg">${w}</g>`
      }
      L.body = feetOf(g, drk(p.skin, .12)) + bodyOf(g, p.skin, p.belly) + armsOf(g, p.skin, st)
      L.pattern = C(60 - 10, g.hy - 16, 2.4, p.dot) + C(60 + 11, g.hy - 14, 1.9, p.dot)
      if (st === 5) L.crown = path === 'b' ? `<g transform="translate(${f(60 + g.hr * .55)} ${f(g.hy - g.hr * .62)})">${C(0, 0, 5, '#FFB627')}${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4; return `<path d="M${f(7 * Math.cos(a))} ${f(7 * Math.sin(a))} L${f(9.5 * Math.cos(a))} ${f(9.5 * Math.sin(a))}" stroke="#FFB627" stroke-width="2" stroke-linecap="round"/>` }).join('')}</g>` : `<g transform="translate(${f(60 + g.hr * .55)} ${f(g.hy - g.hr * .62)})">${crescent(0, 0, 6.5, GOLD)}</g>`
    }
    return L
  },
  frog(st, g, p, path) {
    const L = { back: '', ears: '', head: headOf(g, p.skin), pattern: '', crown: '', neck: '', held: '', front: '', body: '' }
    if (st <= 2) { // 올챙이 꼬리
      const tx = st === 1 ? 88 : 60 + g.brx - 2, ty = st === 1 ? 92 : g.by + 2
      L.back += `<g class="c-tail" style="transform-origin:${f(tx)}px ${f(ty)}px">${P(`M${f(tx - 4)} ${f(ty - 6)} C${f(tx + 14)} ${f(ty - 14)} ${f(tx + 26)} ${f(ty - 2)} ${f(tx + 22)} ${f(ty + 8)} C${f(tx + 14)} ${f(ty + 2)} ${f(tx + 4)} ${f(ty + 6)} ${f(tx - 4)} ${f(ty + 4)} Z`, lit(p.skin, .15), 'opacity=".95"')}</g>`
    }
    if (st >= 3) for (const s of [-1, 1]) { // 눈 언덕
      const x = 60 + s * g.hr * .5, y = g.hy - g.hr * .78
      L.ears += C(x, y, g.hr * .36, p.skin) + gloss(x - 2, y - 3, 3, 1.6, .8)
    }
    if (st === 1) return L
    const wide = st >= 3 ? 1.35 : 1
    L.body = (st >= 3 ? feetOf(g, p.dark, wide) : '') + bodyOf(g, p.skin, p.belly) + armsOf(g, p.skin, st)
    L.pattern = C(60 - 13, g.hy - 12, 2.6, p.dark, 'opacity=".35"') + C(60 + 14, g.hy - 9, 2, p.dark, 'opacity=".35"')
    if (st === 2) L.held = P(`M60 ${g.by - 13} C66 ${g.by - 5} 66 ${g.by + 2} 60 ${g.by + 2} C54 ${g.by + 2} 54 ${g.by - 5} 60 ${g.by - 13} Z`, p.drop, 'opacity=".95"') + gloss(58, g.by - 4, 1.6, 3, .95, 0)
    if (st >= 3) { // 목걸이
      let n = ''; for (let i = 0; i < 7; i++) { const t = i / 6, x = 60 - 15 + 30 * t, y = g.hy + g.hr - 3 + 8 * Math.sin(Math.PI * t); n += C(x, y, path === 'b' ? 3 : 2.8, p.neck) + (path === 'b' ? Ef(x - .8, y - 1, .8, .8, '#fff', 'opacity=".8"') : gloss(x - .8, y - 1, 1.2, .8, .9)) }
      L.neck = n
    }
    if (st >= 4) { // 저글링
      const items = [0, 1, 2].map((i) => `<g class="c-pb${i + 1}"><g transform="translate(${[-g.hr * .95, 0, g.hr * .95][i]} ${[10, -2, 10][i]})">${path === 'b' ? C(60, g.hy - g.hr - 10, 4.2, '#E8455A') + Ef(60, g.hy - g.hr - 14, 2.4, 1.2, LEAF) : P(`M60 ${g.hy - g.hr - 16} C64 ${g.hy - g.hr - 11} 64 ${g.hy - g.hr - 6} 60 ${g.hy - g.hr - 6} C56 ${g.hy - g.hr - 6} 56 ${g.hy - g.hr - 11} 60 ${g.hy - g.hr - 16} Z`, p.drop)}</g></g>`).join('')
      L.front = `<g class="c-juggle" style="--jx:${f(g.hr * .9)}px;--jy:${f(g.hr * .8)}px">${items}</g>`
    }
    if (st === 5) {
      const cy = g.hy - g.hr + 2; let c = ''
      if (path === 'b') { for (let i = 0; i < 5; i++) { const x = 60 - 12 + i * 6, y = cy - 2 + Math.abs(i - 2) * 1.6; c += leaf(x, y + 2, .45, i % 2 ? 1 : -1, LEAF) + C(x, y - 1, 3.4, '#E8455A') } }
      else { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * .42, x = 60 + 8 * Math.cos(a), y = cy + 4 + 8 * Math.sin(a); c += E(x, y - 3, 3.6, 7, p.crown, rot((i - 2) * 24, x, y - 3)) } c += C(60, cy + 2, 3, p.crownC) }
      L.crown = c
    }
    return L
  }
}

/* ───────── 옷 (43 §5 기준점에 붙는다) ───────── */
const HAT = {
  'acorn-cap': (A) => { const w = A.hr, y = A.top + 6
    return { svg: P(`M${f(60 - w * .82)} ${y} Q60 ${f(y - w * 1.08)} ${f(60 + w * .82)} ${y} Z`, '#8E5D35') + `<path d="M${f(60 - w * .45)} ${y - 3} l6 -8 M${f(60 - w * .1)} ${y - 2} l7 -10 M${f(60 + w * .3)} ${y - 3} l5 -7" stroke="#B5844F" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>` + `<rect x="${f(60 - w * .88)}" y="${y - 2}" width="${f(w * 1.76)}" height="6.5" rx="3.2" fill="${V('#6E4A2A')}"/>`, tip: f(y - w * .5) } },
  'leaf-hat': (A) => { const y = A.top + 4, r = A.hr
    return { svg: P(`M${f(60 - r)} ${y + 4} C${f(60 - r * .6)} ${y - 16} ${f(60 + r * .7)} ${y - 18} ${f(60 + r * 1.05)} ${y + 2} C${f(60 + r * .3)} ${y + 6} ${f(60 - r * .4)} ${y + 8} ${f(60 - r)} ${y + 4} Z`, '#6FCB6A') + `<path d="M${f(60 - r * .9)} ${y + 3} Q60 ${y - 5} ${f(60 + r)} ${y + 1}" stroke="${LEAF2}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`, tip: y - 7 } },
  straw: (A) => { const w = A.hr, y = A.top + 7
    return { svg: E(60, y, w * 1.3, 5.6, '#EBC777') + P(`M${f(60 - w * .64)} ${y} C${f(60 - w * .64)} ${y - 15} ${f(60 + w * .64)} ${y - 15} ${f(60 + w * .64)} ${y} Z`, '#F5DA94') + `<path d="M${f(60 - w * .64)} ${y - 4} h${f(w * 1.28)} v3.8 h${f(-w * 1.28)}z" fill="${V('#E8574B')}"/>`, tip: y - 12 } },
  beanie: (A) => { const w = A.hr, y = A.top + 9
    return { svg: P(`M${f(60 - w * .93)} ${y} C${f(60 - w * .93)} ${f(y - w * .96)} ${f(60 + w * .93)} ${f(y - w * .96)} ${f(60 + w * .93)} ${y} Z`, '#6E93E0') + `<path d="M${f(60 - w * .4)} ${y - 2} v-10 M60 ${y - 2} v-13 M${f(60 + w * .4)} ${y - 2} v-10" stroke="#5679C8" stroke-width="1.5" stroke-linecap="round" opacity=".8"/><rect x="${f(60 - w * .97)}" y="${y - 3}" width="${f(w * 1.94)}" height="7.5" rx="3.6" fill="${V('#5575C2')}"/>` + C(60, y - w * .76, 5.4, '#F7F7F7'), tip: f(y - w * .76 - 4) } },
  santa: (A) => { const w = A.hr, y = A.top + 7
    return { svg: P(`M${f(60 - w * .88)} ${y} C${f(60 - w * .6)} ${f(y - w)} ${f(60 + w * .5)} ${f(y - w * 1.1)} ${f(60 + w * 1.05)} ${f(y - w * .35)} L${f(60 + w * .88)} ${y} Z`, '#E04A3D') + `<rect x="${f(60 - w * .96)}" y="${y - 3}" width="${f(w * 1.92)}" height="7.5" rx="3.6" fill="${V('#F7F4EE')}"/>` + C(60 + w * 1.05, y - w * .35, 4.8, '#F7F4EE'), tip: f(y - w * .62) } }
}
const NECK = {
  ribbon: (A) => P(`M60 ${A.ny + 3} l-10 -6 v12 z`, '#E8574B') + P(`M60 ${A.ny + 3} l10 -6 v12 z`, '#E8574B') + C(60, A.ny + 3, 3.3, '#C9443D'),
  bandana: (A) => P(`M43 ${A.ny - 2} Q60 ${A.ny + 3} 77 ${A.ny - 2} L60 ${A.ny + 14} Z`, '#F7C548') + `<circle cx="55" cy="${A.ny + 3}" r="1.3" fill="#fff"/><circle cx="64" cy="${A.ny + 2}" r="1.3" fill="#fff"/><circle cx="60" cy="${A.ny + 8}" r="1.3" fill="#fff"/>`,
  lei: (A) => { let s = ''; const cols = ['#FF8FB1', '#FFFFFF', '#FFD45C', '#FF8FB1', '#FFFFFF', '#FFD45C', '#FF8FB1']; for (let i = 0; i < 7; i++) { const t = i / 6, x = 43 + 34 * t, y = A.ny - 2 + 10 * Math.sin(Math.PI * t); s += C(x, y, 3.4, cols[i]) + C(x, y, 1.1, '#F2B84B') } return s },
  bowtie: (A) => P(`M60 ${A.ny + 3} l-9 -5 v10 z`, '#4361B0') + P(`M60 ${A.ny + 3} l9 -5 v10 z`, '#4361B0') + `<rect x="57.6" y="${A.ny + .6}" width="4.8" height="4.8" rx="1.4" fill="#2E4880"/>`
}
const HAND = {
  pencil: (A) => { const x = A.hx, y = A.hy2; return `<g transform="rotate(-38 ${x} ${y})"><rect x="${x - 3}" y="${y - 16}" width="6" height="24" rx="1.2" fill="${V('#F7C548')}"/><path d="M${x - 3} ${y + 8} L${x} ${y + 14} L${x + 3} ${y + 8} Z" fill="#F5DDB0"/><path d="M${x - 1} ${y + 11.5} L${x} ${y + 14} L${x + 1} ${y + 11.5}Z" fill="#444"/><rect x="${x - 3}" y="${y - 20}" width="6" height="5" rx="1.5" fill="${V('#FF9DB8')}"/></g>` },
  flag: (A) => { const x = A.hx + 6, y = A.hy2 + 6; return `<path d="M${x} ${y} V${y - 34}" stroke="#8B6B4A" stroke-width="2.4" stroke-linecap="round"/>${P(`M${x} ${y - 34} l15 5 l-15 5 z`, '#2BAE66')}` },
  songpyeon: (A) => { const x = A.hx, y = A.hy2; return E(x, y + 4, 13, 3.6, '#F7F4EE') + P(`M${x - 11} ${y + 3} q4 -9 8 0 z`, '#F9C6D3') + P(`M${x - 4} ${y + 2} q4 -10 8 0 z`, '#C9E8B4') + P(`M${x + 3} ${y + 3} q4 -9 8 0 z`, '#FBF6EA') },
  mug: (A) => { const x = A.hx, y = A.hy2; return `<path d="M${x + 6} ${y - 3} q5 0 5 4 q0 4 -5 4" stroke="#D9D2C4" stroke-width="2.2" fill="none"/>` + `<rect x="${x - 6}" y="${y - 6}" width="12" height="13" rx="2.5" fill="${V('#F7F4EE')}"${line('#F7F4EE', .8)}/><rect x="${x - 6}" y="${y - 2}" width="12" height="3" fill="#2BAE66" opacity=".85"/><path d="M${x - 2} ${y - 9} q-2 -3 0 -6 M${x + 2} ${y - 9} q2 -3 0 -6" stroke="#BDBDBD" stroke-width="1.4" fill="none" stroke-linecap="round"/>` },
  balloon: (A) => { const x = A.hx + 4, y = A.hy2, bx = x + 20, by = y - 52; return `<path d="M${x} ${y} Q${x + 14} ${y - 20} ${bx} ${by + 13}" stroke="#9A9A9A" stroke-width="1.1" fill="none"/><g class="c-bob" style="transform-origin:${bx}px ${by + 13}px">${E(bx, by, 10, 12, '#F47C7C')}<path d="M${bx - 2} ${by + 12} h4 l-2 2.5z" fill="#D9605F"/>${gloss(bx - 3.5, by - 5, 2.6, 4, .9, 15)}</g>` },
  bok: (A) => { const x = A.hx, y = A.hy2; return P(`M${x - 8} ${y - 2} q-2 12 8 12 q10 0 8 -12 z`, '#E04A3D') + P(`M${x - 8} ${y - 2} q8 -5 16 0 q-3 -4 -8 -4 q-5 0 -8 4z`, '#EF6A5C') + `<path d="M${x - 6} ${y - 2} h12" stroke="#F7C548" stroke-width="2" stroke-linecap="round"/>` + C(x, y + 4, 2.4, '#F7C548') }
}
const BACK = {
  backpack: (A) => { const { brx, bry, by } = A
    return { behind: `<rect x="${f(60 - brx - 4)}" y="${f(by - bry + 1)}" width="${f(2 * brx + 8)}" height="${f(bry * 1.55)}" rx="9" fill="${V('#EA7A5C')}"${line('#EA7A5C', .9)}/><rect x="${f(60 - brx - 4)}" y="${f(by - bry + 1)}" width="${f(2 * brx + 8)}" height="7" rx="3.5" fill="${V('#C9634A')}"/>`,
      front: `<path d="M${f(60 - brx * .62)} ${f(by - bry + 3)} Q${f(60 - brx * .75)} ${f(by)} ${f(60 - brx * .55)} ${f(by + bry * .5)} M${f(60 + brx * .62)} ${f(by - bry + 3)} Q${f(60 + brx * .75)} ${f(by)} ${f(60 + brx * .55)} ${f(by + bry * .5)}" stroke="#B95A43" stroke-width="3.4" fill="none" stroke-linecap="round"/>` } },
  wings: (A) => { const { brx, bry, by } = A, y = by - bry + 6
    const w = (m) => { const x = 60 + m * (brx - 4); return `<g class="c-flap ${m > 0 ? 'r' : ''}" style="transform-origin:${f(x)}px ${f(y + 6)}px;--fl:${m * 7}deg">${P(`M${f(x)} ${f(y + 6)} C${f(x + m * 10)} ${f(y - 14)} ${f(x + m * 28)} ${f(y - 18)} ${f(x + m * 30)} ${f(y - 6)} C${f(x + m * 26)} ${f(y + 6)} ${f(x + m * 12)} ${f(y + 12)} ${f(x)} ${f(y + 6)} Z`, '#8FD18A')}<path d="M${f(x)} ${f(y + 6)} Q${f(x + m * 16)} ${f(y - 4)} ${f(x + m * 28)} ${f(y - 7)}" stroke="${LEAF2}" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>` }
    return { behind: w(-1) + w(1), front: '' } },
  lantern: (A) => { const { brx, bry, by } = A, x0 = 60 + brx - 6, y0 = by + 2, x1 = x0 + 16, y1 = by - bry - 26
    return { behind: `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="#8B6B4A" stroke-width="2.6" stroke-linecap="round"/><g class="c-swing" style="transform-origin:${f(x1)}px ${f(y1)}px"><path d="M${f(x1)} ${f(y1)} v5" stroke="#8B6B4A" stroke-width="1.4"/><rect x="${f(x1 - 6.5)}" y="${f(y1 + 5)}" width="13" height="3" rx="1.2" fill="#8B5A2B"/>${E(x1, y1 + 14, 8, 7.5, '#F7994A')}<ellipse cx="${f(x1)}" cy="${f(y1 + 14)}" rx="12" ry="11" fill="url(#kk-glow)" opacity=".5"/><rect x="${f(x1 - 6.5)}" y="${f(y1 + 20)}" width="13" height="3" rx="1.2" fill="#8B5A2B"/></g>`, front: '' } }
}
/* 4·5단계 배경(원판 + 떠다니는 것). 이제 부드러운 빛 원판(44 §5.3) */
function aura(sp, st, p) {
  if (st === 4) return `<ellipse class="c-mat" cx="60" cy="109" rx="44" ry="7.5" fill="${p.tint}" opacity=".9"/>`
  if (st < 5) return ''
  const id = 'ka' + p.tint.slice(1)
  addDef(id, `<radialGradient id="${id}" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="${p.tint}"/><stop offset="1" stop-color="${p.tint}" stop-opacity="0"/></radialGradient>`)
  let s = `<g class="c-aura"><circle class="c-disc" cx="60" cy="62" r="56" fill="url(#${id})"/>`
  if (sp === 'snail') s += `<g class="c-float">${leaf(18, 46, .8, -1)}</g><g class="c-float d2">${leaf(96, 86, .7, 1, LEAF2)}</g><g class="c-float d3">${C(16, 84, 2.8, p.blossom)}</g>`
  if (sp === 'bee') s += [[18, 34, 0], [102, 40, 2], [14, 74, 3]].map(([x, y, d]) => `<g class="c-float ${d ? 'd' + d : ''}"><path d="M${x} ${y - 5} l4.3 2.5 v5 l-4.3 2.5 l-4.3 -2.5 v-5z" fill="${V(GOLD)}"${line(GOLD, .7)}/></g>`).join('')
  if (sp === 'worm') s += `<g>${crescent(22, 30, 9, '#F7E3A0')}</g><g class="c-twinkle">${star5(104, 30, 3.4, '#F7C948')}</g><g class="c-twinkle d2">${star5(14, 70, 2.8, '#F7C948')}</g><g class="c-twinkle d3">${star5(106, 76, 2.6, '#F7C948')}</g>`
  if (sp === 'frog') s += `<path d="M6 100 q8 -6 16 0 t16 0 M82 100 q8 -6 16 0 t16 0" stroke="#6CC0E6" stroke-width="2.6" fill="none" stroke-linecap="round"/>` + [[18, 60, 3.4, ''], [102, 50, 2.6, 'd2'], [108, 74, 3, 'd3']].map(([x, y, r, d]) => `<g class="c-rise ${d}"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#kk-glow)" stroke="#6CC0E6" stroke-width="1.3"/></g>`).join('')
  return s + '</g>'
}

/** 캐릭터 그림. o: { lv, path, eq, mood, detail, size, crop, live, sil, wave, calm, noAura } */
function art(sp, st, o = {}) {
  sp = SPECIES[sp] ? sp : 'worm'
  const path = o.path || 'a', p = pal(sp, path, st), g = GEO[st], mood = o.mood || 'default'
  const d = o.detail && o.detail !== 'auto' ? o.detail : (o.size && o.size <= 40 ? 'small' : 'full')
  const crop = o.crop || (o.size && o.size <= 40 ? 'bust' : 'full')
  const small = o.size && o.size < 64
  const eq = o.eq || {}, A = anchors(st), lv = o.lv || STAGES[st].from
  const L = SP[sp](st, g, p, path)
  const hat = eq.hat && HAT[eq.hat] ? HAT[eq.hat](A) : null
  const sproutY = hat ? hat.tip : g.hy - g.hr + 2
  const wave = o.wave ? `<g class="c-wave" style="transform-origin:${f(60 + g.hr - 4)}px ${f(st === 1 ? 80 : g.by - 6)}px">${E(60 + g.hr + 3, st === 1 ? 70 : g.hy + 6, 5, 7.5, p.skin, rot(-30, 60 + g.hr + 3, st === 1 ? 70 : g.hy + 6))}</g>` : ''
  const headG = `<g class="c-head" style="transform-origin:60px ${g.hy + g.hr}px">${L.ears}${L.head}${L.pattern}${d === 'full' ? marks(sp, p, 60, g.hy, g.hr, marksOf(lv)) : ''}${face(sp, 60, g.hy, g.e, mood, st)}${hat ? hat.svg : L.crown}${sprout(st, 60, sproutY, budsOf(lv))}</g>`
  const handI = !small && eq.hand && HAND[eq.hand] ? HAND[eq.hand](A) : null
  let inner
  if (st === 1) {
    const paw = sp === 'bee' ? p.skin : sp === 'frog' ? p.skin : p.skin
    inner = L.back + headG + huskBottom() + (handI || '') + C(47, 81, 4.8, paw) + C(73, 81, 4.8, paw) + wave
  } else {
    const backI = !small && eq.back && BACK[eq.back] ? BACK[eq.back](A) : null
    const neckI = !small && eq.neck && NECK[eq.neck] ? NECK[eq.neck](A) : null
    const keepBack = sp === 'worm' && st >= 4 // 나비 날개는 몸이라 등 옷과 같이 보인다(44 §5.2)
    const backLayer = backI ? (keepBack ? L.back : '') + backI.behind : L.back
    inner = backLayer + L.body + (backI ? backI.front : '') + headG + (neckI ?? L.neck) + (handI ?? L.held) + L.front + wave
  }
  const auraS = d === 'full' && crop === 'full' && !o.noAura ? aura(sp, st, p) : ''
  let vb = '0 0 120 120'
  if (crop === 'bust') { const t = g.hy - g.hr - 18, b = g.hy + g.hr + 10, h = b - t; vb = `${f(60 - h / 2)} ${f(t)} ${f(h)} ${f(h)}` }
  const cls = `chr sp-${sp} st-${st}${o.live ? ' live' : ''}${o.sil ? ' sil' : ''}${o.calm ? ' calm' : ''}`
  const sz = o.size ? ` width="${o.size}" height="${o.size}"` : ''
  return `<svg class="${cls}" viewBox="${vb}"${sz} role="img" aria-label="${SPECIES[sp].name} ${STAGES[st].name}">${auraS}<ellipse class="c-shadow" cx="60" cy="110" rx="${st === 1 ? 30 : 24 + st * 3}" ry="5.5" fill="url(#kk-ao)"/><g class="c-hop"><g class="c-sway"><g class="c-breath">${inner}</g></g></g></svg>`
}
function hatchTop() { return huskTop() }

/* 옷 아이콘(캐릭터 없이, 친구 단계 기준점) */
function itemIcon(id, locked) {
  const it = byId[id]; const A = anchors(3); let body = '', vb = '20 20 80 80'
  if (it.slot === 'hat') { const h = HAT[id](A); body = h.svg; vb = '26 0 68 68' }
  else if (it.slot === 'neck') { body = NECK[id](A); vb = '36 60 48 48' }
  else if (it.slot === 'hand') { body = HAND[id](A); vb = id === 'balloon' ? '48 20 60 70' : id === 'flag' ? '44 48 40 40' : '36 60 48 48' }
  else if (it.slot === 'back') { const b = BACK[id](A); body = b.behind + b.front; vb = id === 'lantern' ? '62 30 56 66' : id === 'backpack' ? '24 52 72 72' : '14 14 92 92' }
  else return sceneIcon(id, locked)
  return `<svg viewBox="${vb}" class="${locked ? 'lock' : ''}" aria-hidden="true">${body}</svg>`
}

/* ───────── 장면 (방 = 무대) ───────── */
const BG = {
  grass:  { sky: ['#A9DFFF', '#E6F7EC'], hills: ['#B5E59C', '#86D47A', '#5BBF66'], ground: '#62C46C', dirt: '#B9875A' },
  sunset: { sky: ['#FFB892', '#FFE8C4'], hills: ['#C6D98A', '#99C774', '#6FAF5E'], ground: '#7CBB62', dirt: '#B07E54', sun: '#FFE07A' },
  night:  { sky: ['#14244A', '#2E5065'], hills: ['#3C6E57', '#2E5E48', '#234D3B'], ground: '#2F6A4A', dirt: '#5C4636', stars: true },
  moon:   { sky: ['#1C2D55', '#3B5F78'], hills: ['#46775D', '#365F4D', '#284E3E'], ground: '#356F50', dirt: '#5C4636', stars: true, moon: true },
  snow:   { sky: ['#CFE3F2', '#F4F9FD'], hills: ['#FFFFFF', '#EEF5FB', '#E2EDF6'], ground: '#F4F8FC', dirt: '#B8C7D4', snow: true }
}
function sky(bg, night) {
  const B = BG[bg] || BG.grass
  const sk = night && !B.stars ? ['#162A4A', '#2D4D63'] : B.sky
  let s = `<rect x="0" y="-80" width="600" height="440" fill="${LG(sk[0], sk[1])}"/>`
  if (B.sun && !night) s += `<circle cx="430" cy="150" r="70" fill="url(#kk-glow)" opacity=".8"/>${C(430, 150, 30, B.sun)}`
  if (B.stars || night) s += [[60, 40], [130, 80], [210, 30], [380, 60], [470, 34], [540, 90], [300, 24], [90, 120], [520, 140]].map(([x, y], i) => `<circle class="${i % 3 ? '' : 'c-twinkle'}" cx="${x}" cy="${y}" r="${i % 2 ? 1.4 : 2}" fill="#FFF6D6" opacity=".9"/>`).join('')
  if (B.moon) s += `<circle cx="470" cy="90" r="64" fill="url(#kk-glow)" opacity=".55"/>${C(470, 90, 30, '#FFF0B8')}<circle cx="460" cy="84" r="5" fill="#EBD891" opacity=".6"/><circle cx="480" cy="100" r="3.5" fill="#EBD891" opacity=".6"/>`
  else if (night || bg === 'night') s += `<g>${crescent(110, 70, 22, '#FFF0B8')}</g>`
  if (!B.stars && !night) s += cloud(110, 70, 1) + cloud(470, 50, .8)
  if (B.snow) s += Array.from({ length: 18 }, (_, i) => `<circle class="c-snow d${i % 4}" cx="${(i * 37) % 600}" cy="${(i * 53) % 220}" r="${1.6 + (i % 3)}" fill="#fff"/>`).join('')
  return s
}
function cloud(x, y, k) { return `<g opacity=".95">${C(x, y, 20 * k, '#FFFFFF')}${C(x + 22 * k, y - 8 * k, 24 * k, '#FFFFFF')}${C(x + 46 * k, y, 18 * k, '#FFFFFF')}${Ef(x + 22 * k, y + 10 * k, 42 * k, 10 * k, '#fff')}</g>` }
function hills(bg, night) {
  const B = BG[bg] || BG.grass
  const h = night && !B.stars ? ['#365E49', '#2B5040', '#204234'] : B.hills
  return `<ellipse cx="90" cy="300" rx="190" ry="110" fill="${HV(h[0])}"/><ellipse cx="520" cy="290" rx="210" ry="120" fill="${HV(h[0])}"/>` +
    `<ellipse cx="260" cy="330" rx="230" ry="95" fill="${HV(h[1])}"/><ellipse cx="560" cy="340" rx="150" ry="80" fill="${HV(h[1])}"/>` +
    `<ellipse cx="300" cy="380" rx="420" ry="80" fill="${HV(h[2])}"/><rect x="-10" y="372" width="620" height="60" fill="${drk(h[2], .08)}"/>` + (night || B.snow ? '' : [[60, 392], [130, 404], [470, 396], [540, 408], [250, 410], [360, 400]].map(([x, y], i) => `<path d="M${x - 6} ${y} q2 -9 4 -12 M${x} ${y} q0 -10 1 -14 M${x + 6} ${y} q-1 -8 -4 -11" stroke="${lit(h[2], .22)}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>${i % 2 ? daisy(x + 10, y - 6, 3.4, '#FFFFFF', '#FFD45C') : ''}`).join(''))
}
/** 받침 = 둥근 풀 둔덕(캐릭터가 서는 곳) */
function mound(bg, night) {
  const B = BG[bg] || BG.grass
  const top = night && !B.stars ? '#2F6A4A' : B.ground
  let blades = ''
  for (let i = 0; i < 16; i++) { const x = 196 + i * 13.5, y = 300 + Math.sin(i) * 2; blades += `<path d="M${x} ${y} q${(i % 2 ? 2 : -2)} -7 ${(i % 2 ? 4 : -3)} -10" stroke="${lit(top, .25)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` }
  return `<path d="M178 302 C178 330 220 348 300 348 C380 348 422 330 422 302 Z" fill="${HV(B.dirt)}"/>` +
    `<ellipse cx="300" cy="300" rx="122" ry="26" fill="${V(top)}"/>` + (B.snow ? '' : blades) +
    `<ellipse cx="258" cy="292" rx="34" ry="5" fill="#fff" opacity=".18"/>` +
    C(196, 318, 5, '#C9C2B4') + C(408, 322, 4, '#C9C2B4')
}
function decorSvg(id) {
  switch (id) {
    case 'pot': return `<g transform="translate(140 296)">${P('M-14 0 h28 l-4 22 h-20 Z', '#E58A5C')}<rect x="-16" y="-4" width="32" height="7" rx="3" fill="${V('#D9774A')}"/>${leaf(0, -4, 1, -1)}${leaf(0, -6, 1, 1)}${daisy(-6, -16, 4.6, PINK, '#FFD45C')}${daisy(7, -19, 4, '#FFFFFF', '#FFD45C')}</g>`
    case 'fence': return `<g transform="translate(60 278)">${[0, 22, 44].map((x) => P(`M${x} 40 v-34 l6 -6 l6 6 v34 Z`, '#D7A46E')).join('')}<rect x="-4" y="12" width="66" height="6" rx="2" fill="${V('#C48F5A')}"/><rect x="-4" y="26" width="66" height="6" rx="2" fill="${V('#C48F5A')}"/></g>`
    case 'mushlamp': return `<g transform="translate(150 330)"><circle cx="0" cy="-22" r="26" fill="url(#kk-glow)" opacity=".55"/><rect x="-4" y="-16" width="8" height="18" rx="3" fill="${V('#F5EBDD')}"/>${P('M-16 -14 Q0 -40 16 -14 Z', '#F2C24E')}${Ef(-6, -24, 2.4, 2, '#fff')}${Ef(5, -20, 2, 1.8, '#fff')}</g>`
    case 'butterfly': return `<g class="c-float" transform="translate(170 190)">${E(-7, -4, 8, 6, '#FFB86B', rot(-20, -7, -4))}${E(7, -4, 8, 6, '#FFB86B', rot(20, 7, -4))}${E(-5, 5, 5, 4, '#FFD68A')}${E(5, 5, 5, 4, '#FFD68A')}<rect x="-1.4" y="-8" width="2.8" height="16" rx="1.4" fill="#5A3F2E"/></g>`
    case 'ball': return `<g transform="translate(400 300)">${C(0, -10, 11, '#FF8C7A')}<path d="M-11 -10 q11 6 22 0" stroke="#fff" stroke-width="2.4" fill="none"/></g>`
    case 'bunting': return `<g><path d="M150 140 Q300 175 450 140" stroke="#9B7B5A" stroke-width="1.6" fill="none"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const t = (i + .5) / 8, x = 150 + 300 * t, y = 140 + 35 * 4 * t * (1 - t) * .9; return P(`M${f(x - 8)} ${f(y)} h16 l-8 14 z`, ['#FF8FB1', '#FFD45C', '#7ED3EC', '#8ED67A'][i % 4]) }).join('')}</g>`
    case 'tent': return `<g transform="translate(470 330)">${P('M-34 0 L0 -50 L34 0 Z', '#F7A36A')}${P('M-8 0 L0 -26 L8 0 Z', '#7A4B2E')}<path d="M0 -50 v-8" stroke="#7A4B2E" stroke-width="2"/>${P('M0 -58 l10 3 l-10 3z', '#FF8FB1')}</g>`
    case 'firefly': return [[150, 220], [430, 200], [380, 250], [210, 170]].map(([x, y], i) => `<g class="c-twinkle d${i % 3 + 1}"><circle cx="${x}" cy="${y}" r="9" fill="url(#kk-glow)"/><circle cx="${x}" cy="${y}" r="2.6" fill="#FFF3A0"/></g>`).join('')
    case 'arch': return `<g><path d="M200 300 C200 160 400 160 400 300" stroke="#7CC576" stroke-width="7" fill="none"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const t = i / 8, a = Math.PI - Math.PI * t, x = 300 + 100 * Math.cos(a), y = 300 - 105 * Math.sin(a) - 0; return daisy(x, y, 5, i % 2 ? PINK : '#FFFFFF', '#FFD45C') }).join('')}</g>`
  }
  return ''
}
function shelf(trophies) {
  if (!trophies || !trophies.length) return ''
  let s = `<g class="shelf"><rect x="436" y="236" width="104" height="7" rx="3" fill="${V('#C48F5A')}"/><rect x="436" y="282" width="104" height="7" rx="3" fill="${V('#C48F5A')}"/><rect x="440" y="236" width="5" height="64" rx="2" fill="#A8774A"/><rect x="531" y="236" width="5" height="64" rx="2" fill="#A8774A"/>`
  trophies.slice(-6).forEach((t, i) => {
    const x = 458 + (i % 3) * 30, y = i < 3 ? 236 : 282
    let g = ''
    if (t.k === 'cup') g = P(`M-9 -24 h18 q0 14 -9 16 q-9 -2 -9 -16z`, GOLD) + `<rect x="-2" y="-8" width="4" height="5" fill="#D9A23A"/><rect x="-7" y="-3" width="14" height="3" rx="1.5" fill="${V('#D9A23A')}"/>` + gloss(-4, -19, 2, 4, .9, 0)
    if (t.k === 'medal') g = `<path d="M-5 -26 l5 8 l5 -8" stroke="#4E75F2" stroke-width="3.4" fill="none"/>` + C(0, -11, 8, GOLD) + `<text x="0" y="-8" text-anchor="middle" font-size="8" font-weight="800" fill="#8A5A1C">${t.n || 7}</text>`
    if (t.k === 'stamp') g = C(0, -11, 9, '#E3F6EA') + `<path d="M-4 -11 l3 3 l6 -7" stroke="#22A45D" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    s += `<g class="trophy" data-i="${i}" transform="translate(${x} ${y})" style="cursor:pointer">${g}</g>`
  })
  return s + '</g>'
}
/** o: { bg, night, decor:[], trophies, preview } */
function scene(o = {}) {
  const bg = o.bg || 'grass', night = !!o.night
  return `<svg class="scene-svg" viewBox="0 0 600 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${sky(bg, night)}${hills(bg, night)}${(o.decor || []).filter((d) => d === 'bunting' || d === 'arch').map(decorSvg).join('')}${mound(bg, night)}${(o.decor || []).filter((d) => d !== 'bunting' && d !== 'arch').map(decorSvg).join('')}${o.preview ? '' : shelf(o.trophies)}</svg>`
}
function sceneIcon(id, locked) { return `<svg viewBox="140 110 320 200" class="${locked ? 'lock' : ''}" style="border-radius:10px" aria-hidden="true">${sky(id)}${hills(id)}${mound(id)}</svg>` }
function decorIcon(id, locked) {
  const vb = { pot: '96 250 48 60', fence: '30 255 85 60', mushlamp: '440 255 60 50', butterfly: '150 175 40 32', ball: '384 276 32 32', bunting: '150 130 300 60', tent: '480 238 80 66', firefly: '140 160 300 110', arch: '190 180 220 130' }[id]
  return `<svg viewBox="${vb}" class="${locked ? 'lock' : ''}" aria-hidden="true">${decorSvg(id)}</svg>`
}

/* ───────── 앱 그림: 로고 · 말랑 아이콘 · 빈 상태 ───────── */
function logo(size = 28, mono) {
  const id = 'klogo'
  addDef(id, `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5CD08F"/><stop offset="1" stop-color="#1F9455"/></linearGradient><mask id="${id}m" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="1400"><rect x="-200" y="-200" width="1400" height="1400" fill="#fff"/><rect x="100" y="318" width="800" height="48" fill="#000"/><path d="M500 800 L500 615" stroke="#000" stroke-width="74" stroke-linecap="round"/><path d="M492 660 C 400 660 300 605 290 478 C 420 470 496 548 492 660 Z" fill="#000"/><path d="M508 618 C 520 500 610 428 725 428 C 728 548 630 624 508 618 Z" fill="#000"/></mask>`)
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 1024 1024" aria-label="꿈틀"><rect width="1024" height="1024" rx="230" fill="${mono ? 'currentColor' : `url(#${id})`}"/><g transform="translate(115.2 115.2) scale(0.7943)"><g mask="url(#${id}m)"><rect x="130" y="205" width="740" height="690" rx="150" fill="#fff"/><rect x="290" y="105" width="104" height="200" rx="52" fill="#fff"/><rect x="606" y="105" width="104" height="200" rx="52" fill="#fff"/></g></g></svg>`
}
/** 말랑 아이콘 — 리스트·스마트 목록·빈 상태·카테고리용(탭 막대의 선 아이콘은 틱틱 그대로) */
function icon(name, size = 28) {
  let b = ''
  switch (name) {
    case 'inbox': b = P('M8 18 L13 7 h22 L40 18 v14 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z', '#7CC4F5') + P('M8 19 h10 q2 5 6 5 q4 0 6 -5 h10 v13 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z', '#4E9DE8'); break
    case 'today': b = `<rect x="7" y="9" width="34" height="31" rx="8" fill="${V('#FFFFFF')}"${line('#DDE3DE', 1, 1)}/><path d="M7 17 a8 8 0 0 1 8 -8 h18 a8 8 0 0 1 8 8 v2 H7 Z" fill="${V('#2BAE66')}"/><rect x="15" y="5" width="4" height="9" rx="2" fill="${V('#1F7F4A')}"/><rect x="29" y="5" width="4" height="9" rx="2" fill="${V('#1F7F4A')}"/><text x="24" y="35" text-anchor="middle" font-size="14" font-weight="800" fill="#1F7F4A" font-family="Pretendard,-apple-system,sans-serif">9</text>`; break
    case 'week': b = `<rect x="7" y="9" width="34" height="31" rx="8" fill="${V('#FFFFFF')}"${line('#DDE3DE', 1, 1)}/><path d="M7 17 a8 8 0 0 1 8 -8 h18 a8 8 0 0 1 8 8 v2 H7 Z" fill="${V('#8B7CF6')}"/>${[0, 1, 2, 3].map((i) => `<rect x="${12 + i * 6.5}" y="24" width="4.5" height="${[8, 5, 10, 7][i]}" rx="2" fill="#B9AEFA"/>`).join('')}`; break
    case 'calendar': b = `<rect x="7" y="9" width="34" height="31" rx="8" fill="${V('#FFFFFF')}"${line('#DDE3DE', 1, 1)}/><path d="M7 17 a8 8 0 0 1 8 -8 h18 a8 8 0 0 1 8 8 v2 H7 Z" fill="${V('#FF8C7A')}"/>${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<circle cx="${14 + c * 6.6}" cy="${25 + r * 5.5}" r="1.7" fill="${r === 1 && c === 2 ? '#FF8C7A' : '#D6DCD8'}"/>`).join('')).join('')}`; break
    case 'project': b = P('M6 14 a4 4 0 0 1 4 -4 h9 l4 4 h15 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 Z', '#FFC93D') + P('M6 19 h36 v15 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 Z', '#FFD966') + leaf(24, 30, .7, -1) + leaf(24, 29, .7, 1); break
    case 'habit': b = C(24, 25, 15, '#FF8FB1') + `<path d="M17 25 l5 5 l9 -10" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; break
    case 'ai': b = P('M8 14 a7 7 0 0 1 7 -7 h18 a7 7 0 0 1 7 7 v10 a7 7 0 0 1 -7 7 h-9 l-7 6 v-6 h-2 a7 7 0 0 1 -7 -7 Z', '#7ED3EC') + `<circle cx="17" cy="19" r="2.2" fill="${INK}"/><circle cx="31" cy="19" r="2.2" fill="${INK}"/><path d="M20 24 q4 3 8 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` + leaf(24, 7, .6, -1) + leaf(24, 6.5, .6, 1); break
    case 'growth': b = P('M14 34 h20 l-3 9 h-14 Z', '#E58A5C') + `<rect x="12" y="30" width="24" height="6" rx="3" fill="${V('#D9774A')}"/>` + `<path d="M24 31 V18" stroke="${LEAF2}" stroke-width="3" stroke-linecap="round"/>` + leaf(24, 22, 1.1, -1) + leaf(24, 19, 1.2, 1); break
    case 'trophy': b = P('M13 8 h22 q0 17 -11 19 q-11 -2 -11 -19z', GOLD) + `<rect x="21.5" y="27" width="5" height="6" fill="#D9A23A"/>` + `<rect x="15" y="33" width="18" height="5" rx="2.5" fill="${V('#D9A23A')}"/>` + `<path d="M13 11 h-4 q0 7 6 8 M35 11 h4 q0 7 -6 8" stroke="${GOLD}" stroke-width="2.4" fill="none"/>`; break
    case 'settings': b = C(24, 24, 15, '#C9D2CC') + C(24, 24, 6.5, '#F5F7F6'); break
    case 'bell': b = P('M24 7 a10 10 0 0 1 10 10 v8 l4 6 H10 l4 -6 v-8 a10 10 0 0 1 10 -10 Z', '#FFC93D') + C(24, 35, 4, '#F0A63C'); break
    case 'note': b = `<rect x="10" y="7" width="28" height="34" rx="6" fill="${V('#FFFFFF')}"${line('#DDE3DE', 1, 1)}/><path d="M16 17 h16 M16 23 h16 M16 29 h10" stroke="#C9D2CC" stroke-width="2.4" stroke-linecap="round"/>`; break
    case 'heart': b = P('M24 39 C10 30 6 23 6 17 C6 11 10 8 15 8 C19 8 22 10 24 13 C26 10 29 8 33 8 C38 8 42 11 42 17 C42 23 38 30 24 39 Z', '#FF8FB1'); break
    case 'book': b = P('M8 10 q8 -3 16 2 v28 q-8 -5 -16 -2 Z', '#7CC4F5') + P('M40 10 q-8 -3 -16 2 v28 q8 -5 16 -2 Z', '#4E9DE8'); break
    case 'home': b = P('M8 22 L24 8 L40 22 v14 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z', '#FFC93D') + `<rect x="20" y="28" width="8" height="12" rx="2" fill="${V('#E59A2F')}"/>`; break
    case 'run': b = P('M10 30 q0 -8 8 -10 l10 -6 q6 0 8 6 l4 10 q0 4 -4 4 H14 q-4 0 -4 -4 Z', '#FF8C7A') + `<path d="M12 34 h28" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`; break
    case 'seed': b = E(24, 29, 13, 12, HUSK) + `<path d="M12 28 l3 -2.6 l3 2.6 l3 -2.6 l3 2.6 l3 -2.6 l3 2.6 l3 -2.6 l3 2.6" stroke="${lit(HUSK, .45)}" stroke-width="1.6" fill="none" stroke-linejoin="round"/>` + gloss(19, 23, 3.4, 2, .7) + `<path d="M24 18 V11" stroke="${LEAF2}" stroke-width="2.4" stroke-linecap="round"/>` + leaf(24, 13, .62, -1) + leaf(24, 12.5, .62, 1); break
  }
  return `<svg class="soft-ic" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${b}</svg>`
}

window.KK = { f, mix, lit, drk, V, LG, HV, E, C, P, Ef, gloss, star5, crescent, leaf, daisy, INK, LEAF, LEAF2, GOLD, PINK,
  SPECIES, STAGES, stageOf, need, PATHS, TITLE12, titleOf, MARK, SLOTS, ITEMS, DECOR, SEASON, byId, budsOf, marksOf, PAL0, pal, GEO, anchors,
  art, hatchTop, itemIcon, scene, sky, hills, mound, decorSvg, decorIcon, sceneIcon, shelf, logo, icon, BG }
})()
