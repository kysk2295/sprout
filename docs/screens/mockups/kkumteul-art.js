/* 꿈틀 그림 모듈 v3 — 44 시각 개편 · 42 §11 / 43 §19 "더 귀엽게, 진화마다 크게" 시안 공용
   character-raising-v2.html · visual-refresh.html 이 같은 그림을 쓴다(그림은 이 파일 하나). 이전 그림(v2.0)은 kkumteul-art-v1.js(KK1)에 그대로 둔다.
   화풍: 말랑한 비닐 인형 — 면마다 빛이 왼쪽 위에서 오는 둥근 음영(radialGradient) + 같은 색 계열의 얇은 선 + 흰 하이라이트 + 바닥 그림자.
   귀엽게: 아기 비율(머리가 몸보다 크다), 큰 눈 + 빛점 둘 + 아래 푸른 반사, 볼 번짐, 작은 입(ω·웃음·벌린 입), 짧고 통통한 팔다리, 파스텔이지만 채도 있게.
   캐릭터 = "꿈틀 정원 친구들" 4종 × 5단계. 단계마다 실루엣 자체가 바뀌고(알·칸·물방울 → 몸 → 탈바꿈), 크기가 0.7 → 1.0 → 1.15 → 1.3 → 1.45배로 자란다(SCALE).
   종 표시: 달팽이 하트 나선 · 꿀벌 솜털 목도리 · 애벌레 방울 더듬이 · 올챙이 잎 모자. 머리 새싹은 모든 종에 같다(브랜드 실).
   좌표: viewBox 0 0 120 120, 발밑 y 108. 그림은 전설 크기로 그리고 단계마다 발밑(60,108)을 중심으로 줄인다. 장면: 0 0 600 420, 받침 윗면 y 300. */
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
const INK = '#2A2433', LEAF = '#4FBF6A', LEAF2 = '#2E9E55', GOLD = '#F2B53A', PINK = '#FF8FB1'
const SPECIES = {
  snail: { name: '달팽이', full: '꾸준한 달팽이', pet: '느리', old: 'turtle', why: '느려도 정한 길을 끝까지 간다 — 껍데기가 꽃밭이 되고, 집이 되고, 나무집이 된다' },
  bee:   { name: '꿀벌',   full: '차곡차곡 꿀벌', pet: '모아', old: 'squirrel', why: '여러 꽃을 빠짐없이 돌며 꿀을 모은다 — 벌집 칸에서 나와 수정 날개 꿀벌이 된다' },
  worm:  { name: '애벌레', full: '몰두하는 애벌레', pet: '꿈틀', old: 'cat', why: '한 잎에 푹 빠져 먹다 고치를 짓고 나비가 된다 — 몰입이 날개가 된다' },
  frog:  { name: '개구리', full: '재주 많은 개구리', pet: '퐁', old: 'otter', why: '여기저기 뛰며 물방울을 모은다 — 물방울 알 → 올챙이 → 연잎 양산 개구리' }
}
const STAGES = [null, { name: '아기', from: 1 }, { name: '꼬마', from: 3 }, { name: '친구', from: 6 }, { name: '단짝', from: 10 }, { name: '전설', from: 15 }]
const stageOf = (lv) => lv >= 15 ? 5 : lv >= 10 ? 4 : lv >= 6 ? 3 : lv >= 3 ? 2 : 1
const need = (lv) => 40 + 20 * (lv - 1)
/** 단계마다 그림 크기(기준 상자에 대한 배율) 0.7 → 1.0 → 1.15 → 1.3 → 1.45. 그림은 전설(1.45)이 상자를 꽉 채우게 그리고 단계마다 줄인다 */
const SCALE_X = [0, .7, 1, 1.15, 1.3, 1.45]
const SCALE = SCALE_X.map((x) => +(x / 1.45).toFixed(3))
const PATHS = {
  snail: { a: { name: '이끼 정원', line: '흰 꽃 껍데기 → 이끼 집 → 나무 집', t: ['꽃 달팽이', '이끼집 달팽이', '나무집 달팽이'] }, b: { name: '꽃 정원', line: '분홍 꽃 껍데기 → 꽃 오두막 → 유리 온실', t: ['분홍꽃 달팽이', '꽃집 달팽이', '온실 달팽이'] } },
  bee:   { a: { name: '해바라기 길', line: '꿀단지 → 해바라기 관 → 꿀 등불', t: ['꿀단지 꿀벌', '해바라기 여왕벌', '꿀등불 꿀벌'] }, b: { name: '들꽃 길', line: '꽃바구니 → 데이지 관 → 꽃 등불', t: ['꽃바구니 꿀벌', '데이지 여왕벌', '꽃등불 꿀벌'] } },
  worm:  { a: { name: '밤하늘 날개', line: '잎 가방 → 남색 고치 → 별무늬 나비', t: ['잎가방 애벌레', '밤빛 고치', '별날개 나비'] }, b: { name: '노을 날개', line: '꽃잎 가방 → 주황 고치 → 노을 띠 나비', t: ['꽃잎가방 애벌레', '노을빛 고치', '노을날개 나비'] } },
  frog:  { a: { name: '연꽃 길', line: '물방울 목걸이 → 연잎 → 연잎 양산 · 연꽃 관', t: ['물방울 올챙이', '연잎 개구리', '연잎 왕자 개구리'] }, b: { name: '산딸기 길', line: '산딸기 목걸이 → 산딸기 → 꽃잎 양산 · 산딸기 관', t: ['산딸기 올챙이', '산딸기 개구리', '산딸기 공주 개구리'] } }
}
const TITLE12 = { snail: ['씨앗알 달팽이', '아기 달팽이'], bee: ['벌집 아기', '솜털 꿀벌'], worm: ['잎 위의 알', '아기 애벌레'], frog: ['물방울 알', '아기 올챙이'] }
const titleOf = (sp, st, path = 'a') => st <= 2 ? TITLE12[sp][st - 1] : PATHS[sp][path].t[st - 3]
/** 단계마다 새로 생기는 것(진화 카드 한 줄) */
const NEWPART = {
  snail: ['', '씨앗알에서 눈 더듬이가 쏙', '배발 · 하트 나선 껍데기', '껍데기에 꽃이 피었어', '껍데기가 창문 달린 집이 됐어', '등에 작은 집이 생겼어'],
  bee:   ['', '벌집 칸에서 꼼지락', '솜털 목도리 · 작은 날개', '꽃가루 주머니 · 들 것', '큰 날개 넷 · 꽃 관', '수정 날개 · 등불'],
  worm:  ['', '잎 위의 알에 얼굴이', '마디 몸 · 방울 더듬이', '길어진 몸 · 잎 가방', '고치 속에서 날개 준비', '나비가 됐어'],
  frog:  ['', '물방울 속 알', '꼬리 · 잎 모자', '작은 다리가 났어', '꼬리가 사라지고 개구리!', '연잎 양산 · 관']
}
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
function leaf(x, y, k, side, h = LEAF) { // side -1 왼쪽 1 오른쪽
  const s = side
  return `<path d="M${f(x)} ${f(y)} c${f(s * 4 * k)} ${f(-8 * k)} ${f(s * 13 * k)} ${f(-9 * k)} ${f(s * 15 * k)} ${f(-3 * k)} c${f(-s * 3 * k)} ${f(5 * k)} ${f(-s * 10 * k)} ${f(6 * k)} ${f(-s * 15 * k)} ${f(3 * k)}z" fill="${V(h)}"${line(h, .7, .45)}/><path d="M${f(x)} ${f(y)} q${f(s * 7 * k)} ${f(-4 * k)} ${f(s * 13 * k)} ${f(-3.5 * k)}" stroke="${lit(h, .45)}" stroke-width="${f(.8 * k + .2)}" fill="none" stroke-linecap="round" opacity=".8"/>`
}

/* 종 색 (44 §5 캐릭터 색 토큰) — 파스텔이지만 채도 있게. 단계가 오를수록 한 칸씩 진해진다(…By 배열은 단계 1~5) */
const PAL0 = {
  snail: { skin: '#FFE2A6', foot: '#F6CB86', shell: '#FF9466', shellBy: ['', '#FFB784', '#FFA676', '#FF9466', '#F98457', '#F2774C'], heart: '#FF5C8D', moss: '#7CCB6B', moss2: '#A9DE86', flower: '#FFFFFF', flowerC: '#FFCF4A', roof: '#EF6F5E', wood: '#D9A066', glass: '#CDEFFF', canopy: '#5FBF66', fruit: '#FF7A7A', tint: '#DDF2CF', mark: '#E9A56F' },
  bee:   { skin: '#FFD046', skinBy: ['', '#FFF2D6', '#FFDA5C', '#FFD046', '#FFC634', '#FFBC22'], stripe: '#5B3A2C', wing: '#E3F5FF', crystal: '#BFEFFF', ruff: '#FFF6DC', pollen: '#FFA53C', pot: '#F0A63C', comb: '#F6BE47', crown: '#FFC21F', crownC: '#8A5A2B', gem: '#FF9F1C', tint: '#FFEDB0', mark: '#E39A3A' },
  worm:  { skin: '#97DD72', skinBy: ['', '#FFF6E4', '#AEE688', '#97DD72', '#97DD72', '#86D466'], dot: '#FFE27A', belly: '#E3F7CF', pom: '#FF8FB1', pack: '#5DBB63', egg: '#FFF6E4', eggDot: '#C9EBA8', cocoon: '#E4E9FA', wing: '#4A66CA', wing2: '#86A0EE', pat: '#FFD95C', tint: '#D5E1FF', mark: '#FFE27A' },
  frog:  { skin: '#55BFE2', skinBy: ['', '#8BD7F0', '#8BD7F0', '#6CCBEA', '#55BFE2', '#45B2DA'], belly: '#ECFAFF', pad: '#6CC46A', hat: '#7CCB6B', drop: '#A8E4FF', neck: '#BDEFFF', crown: '#FFB3C8', crownC: '#FFE07A', cape: '#3FA0D8', para: '#6CC46A', tint: '#C8EEF8', mark: '#3E9FC4' }
}
function pal(sp, path, st) {
  const p = { ...PAL0[sp] }
  if (p.shellBy) p.shell = p.shellBy[st]
  if (p.skinBy) p.skin = p.skinBy[st]
  if (path !== 'b' || st < 3) return p
  if (sp === 'snail') Object.assign(p, { shell: ['', '', '', '#FF9FC0', '#F78BB2', '#EE7AA6'][st], heart: '#D93C72', moss: '#FFB6CD', moss2: '#FFD6E3', flower: '#FF7FA6', flowerC: '#FFF1A8', roof: '#FF8FB1', canopy: '#FFB0C8', fruit: '#FFFFFF', tint: '#FFE1EA' })
  if (sp === 'bee') Object.assign(p, { pot: '#D9A867', crown: '#FFFFFF', crownC: '#FFD452', crystal: '#D3ECFF', gem: '#9FD8FF', tint: '#E3F2FF' })
  if (sp === 'worm') Object.assign(p, { pack: '#FF9EB8', cocoon: '#FCE5D4', wing: '#F2774E', wing2: '#FFB25C', pat: '#FFE08A', tint: '#FFE0CC' })
  if (sp === 'frog') Object.assign(p, { neck: '#F2546B', crown: '#E8455A', crownC: '#5DBB63', drop: '#F2546B', cape: '#FF7FA6', para: '#FF9EC0', tint: '#FFE0E4' })
  return p
}

/* ───────── 공용 부품 ───────── */
const Lb = () => ({ under: '', back: '', pack: '', body: '', ears: '', head: '', pattern: '', crown: '', neck: '', held: '', front: '', over: '', F: null, A: null, sx: 60, sy: null })
/** 둥근 머리(살짝 옆으로 넓은 찹쌀떡) */
function headB(cx, cy, r, h, w = 1.05, hh = .96) { const rx = r * w, ry = r * hh; return E(cx, cy, rx, ry, h) + gloss(cx - rx * .4, cy - ry * .52, rx * .3, ry * .15, .85) }
/** 짧고 통통한 팔다리 */
const nub = (x, y, rx, ry, h, a = 0) => E(x, y, rx, ry, h, a ? rot(a, x, y) : '')
/** 얼굴 자리: 눈은 머리 아래쪽 반에, 넓게(아기 비율) */
function fg(hy, hr, o = {}) { return { cx: 60, ey: hy + hr * .14, dx: hr * .42, e: hr * .25, my: hy + hr * .5, chx: hr * .7, chy: hy + hr * .38, ...o } }
function eye(x, y, e) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(e * .8)}" ry="${f(e)}" fill="${INK}"/>` +
    `<ellipse cx="${f(x)}" cy="${f(y + e * .46)}" rx="${f(e * .52)}" ry="${f(e * .3)}" fill="#7B93D6" opacity=".55"/>` +
    `<circle cx="${f(x + e * .24)}" cy="${f(y - e * .36)}" r="${f(e * .37)}" fill="#fff"/>` +
    `<circle cx="${f(x - e * .3)}" cy="${f(y + e * .38)}" r="${f(e * .15)}" fill="#fff" opacity=".92"/>`
}
function face(F, mood, small) {
  const { cx, ey, dx, e, my, chx, chy } = F, lx = cx - dx, rx = cx + dx, w = e * .78, sw = f(Math.max(1.7, e * .34))
  let s = `<ellipse cx="${f(cx - chx)}" cy="${f(chy)}" rx="${f(e * 1.08)}" ry="${f(e * .68)}" fill="url(#kk-cheek)"/><ellipse cx="${f(cx + chx)}" cy="${f(chy)}" rx="${f(e * 1.08)}" ry="${f(e * .68)}" fill="url(#kk-cheek)"/>`
  if (!small && (mood === 'happy' || mood === 'pet' || mood === 'giggle')) for (const sd of [-1, 1]) s += `<path d="M${f(cx + sd * chx - 2.4)} ${f(chy - 1.4)} l-1.4 2.6 M${f(cx + sd * chx + .6)} ${f(chy - 1.4)} l-1.4 2.6" stroke="#FF6F93" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`
  const arc = (dy) => `<path d="M${f(lx - w)} ${f(ey)} q${f(w)} ${f(dy)} ${f(2 * w)} 0 M${f(rx - w)} ${f(ey)} q${f(w)} ${f(dy)} ${f(2 * w)} 0" stroke="${INK}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`
  if (mood === 'sleepy') s += arc(w * .8)
  else if (mood === 'happy' || mood === 'pet' || mood === 'giggle') s += arc(-w * 1.25)
  else { const ee = mood === 'wow' ? e * 1.16 : e; s += `<g class="c-eyes" style="transform-origin:${f(cx)}px ${f(ey)}px">${eye(lx, ey, ee)}${eye(rx, ey, ee)}</g>` }
  const m = e * .5
  if (mood === 'happy' || mood === 'giggle') {
    const mw = mood === 'giggle' ? m * 1.35 : m * 1.1
    s += `<path d="M${f(cx - mw)} ${f(my - m * .3)} Q${f(cx)} ${f(my + m * (mood === 'giggle' ? 2.3 : 1.9))} ${f(cx + mw)} ${f(my - m * .3)} Z" fill="#B8475A" stroke="${INK}" stroke-width="${f(sw * .6)}" stroke-linejoin="round"/><ellipse cx="${f(cx)}" cy="${f(my + m * .75)}" rx="${f(mw * .5)}" ry="${f(m * .38)}" fill="#FF9AAE"/>`
  } else if (mood === 'eat') s += Ef(cx, my + m * .4, m * .8, m * .95, '#B8475A')
  else if (mood === 'wow') s += Ef(cx, my + m * .3, m * .62, m * .8, '#B8475A')
  else if (mood === 'sleepy') s += Ef(cx, my + m * .2, m * .38, m * .42, INK, 'opacity=".7"')
  else if (mood === 'smile') s += `<path d="M${f(cx - m * .95)} ${f(my - m * .1)} q${f(m * .95)} ${f(m * 1.1)} ${f(m * 1.9)} 0" stroke="${INK}" stroke-width="${f(sw * .85)}" fill="none" stroke-linecap="round"/>`
  else s += `<path d="M${f(cx - m * 1.1)} ${f(my - m * .2)} q${f(m * .55)} ${f(m * .8)} ${f(m * 1.1)} 0 q${f(m * .55)} ${f(m * .8)} ${f(m * 1.1)} 0" stroke="${INK}" stroke-width="${f(sw * .8)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  return s
}
function sprout(st, x, y, nb = 0) {
  const h = [0, 7, 9, 10, 11, 11][st], t = y - h + 2
  let s = `<g class="c-sprout" style="transform-origin:${f(x)}px ${f(y)}px"><path d="M${f(x)} ${f(y)} V${f(y - h)}" stroke="${LEAF2}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`
  for (let i = 0; i < nb; i++) { const yy = y - 2.5 - i * 2.4; s += leaf(i % 2 ? x - 1 : x + 1, yy, .5, i % 2 ? -1 : 1, LEAF2) }
  if (st === 1) s += leaf(x, t, .8, -1) + leaf(x, t - .5, .6, 1)
  else if (st <= 3) s += leaf(x, t, st === 2 ? .9 : 1, -1) + leaf(x, t - 1, st === 2 ? .9 : 1, 1)
  else if (st === 4) s += leaf(x, t, 1.05, -1) + leaf(x, t - 1, 1.05, 1) + leaf(x, y - h / 2 + 1, .66, 1, LEAF2)
  else {
    s += leaf(x, t + 2, .95, -1) + leaf(x, t + 1, .95, 1)
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; s += C(x + 3.6 * Math.cos(a), y - h - 2 + 3.6 * Math.sin(a), 2.7, PINK) }
    s += C(x, y - h - 2, 2.1, '#FFD45C')
  }
  return s + '</g>'
}
function marks(sp, F, hy, hr, n) {
  if (!n || !F) return ''
  if (sp === 'snail' || sp === 'bee') {
    const pos = [[-1, -3], [1, -3], [-1, 2], [1, 2], [-1, -.5], [1, -.5]], off = [[-2.4, 0], [2.4, 0], [-.6, 0], [.6, 0], [-4, 1.2], [4, 1.2]]
    return pos.slice(0, n).map(([s, dy], i) => `<circle cx="${f(F.cx + s * F.chx + off[i][0] * .8)}" cy="${f(F.chy - F.e * .9 + dy * .5)}" r="1.1" fill="${sp === 'snail' ? '#E9A56F' : '#E39A3A'}" opacity=".8"/>`).join('')
  }
  const pos = [[-10, 0], [10, 2], [0, -5], [-17, 8], [17, 9], [5, 4]], c = sp === 'worm' ? '#FFE27A' : '#2F92BC'
  return pos.slice(0, n).map(([x, y]) => `<circle cx="${f(60 + x * hr / 26)}" cy="${f(hy - hr * .62 + y)}" r="2.3" fill="${c}" opacity="${sp === 'frog' ? .4 : .9}"/>`).join('')
}
const heart = (x, y, s, fill, ex = '') => `<path d="M${f(x)} ${f(y + s * .85)} C${f(x - s * 1.35)} ${f(y - s * .05)} ${f(x - s * .8)} ${f(y - s * 1.1)} ${f(x)} ${f(y - s * .42)} C${f(x + s * .8)} ${f(y - s * 1.1)} ${f(x + s * 1.35)} ${f(y - s * .05)} ${f(x)} ${f(y + s * .85)} Z" fill="${fill}" ${ex}/>`
function spiral(cx, cy, r, col, w = 2.2) {
  let d = ''; const turns = 1.85, n = 44
  for (let i = 0; i <= n; i++) { const t = i / n, a = -Math.PI * .65 + t * turns * 2 * Math.PI, rr = r * (1 - t * .7); d += (i ? 'L' : 'M') + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a)) }
  return `<path d="${d}" stroke="${col}" stroke-width="${f(w)}" fill="none" stroke-linecap="round" opacity=".7"/>`
}
function daisy(x, y, r, petal, center) { let s = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; s += E(x + r * .62 * Math.cos(a), y + r * .62 * Math.sin(a), r * .48, r * .48, petal) } return s + C(x, y, r * .42, center) }
function sunflower(x, y, r, petal, center) { let s = ''; for (let i = 0; i < 9; i++) { const a = i * Math.PI * 2 / 9; s += E(x + r * .7 * Math.cos(a), y + r * .7 * Math.sin(a), r * .42, r * .22, petal, rot(a * 180 / Math.PI, x + r * .7 * Math.cos(a), y + r * .7 * Math.sin(a))) } return s + C(x, y, r * .45, center) }
/** 납작 위 육각형(벌집 칸) */
function hexPts(cx, cy, r, flat = true) { const o = flat ? 0 : -Math.PI / 2; return Array.from({ length: 6 }, (_, i) => [cx + r * Math.cos(o + i * Math.PI / 3), cy + r * Math.sin(o + i * Math.PI / 3)]) }
const hexD = (cx, cy, r, flat = true) => 'M' + hexPts(cx, cy, r, flat).map(([x, y]) => f(x) + ' ' + f(y)).join(' L') + ' Z'
const hexC = (cx, cy, r, h, flat = true, ex = '') => `<path d="${hexD(cx, cy, r, flat)}" fill="${V(h)}"${line(h, 1, .55)} stroke-linejoin="round" ${ex}/>`
/** 더듬이·눈 더듬이(끝에 방울) */
function stalks(L, hy, hr, len, col, tip, tipR, o = {}) {
  for (const s of [-1, 1]) {
    const bx = 60 + s * hr * (o.bx || .38), by = hy - hr * (o.by || .8), tx = 60 + s * hr * (o.tx || .58), ty = by - len
    const tipS = o.curl ? `<path d="M${f(tx)} ${f(ty)} q${f(s * 4.5)} -3 ${f(s * 4)} 2.4" stroke="${col}" stroke-width="${o.w || 3}" fill="none" stroke-linecap="round"/>${C(tx + s * 4, ty + 3, tipR, tip)}` : C(tx, ty, tipR, tip) + `<circle cx="${f(tx - tipR * .3)}" cy="${f(ty - tipR * .35)}" r="${f(tipR * .3)}" fill="#fff" opacity=".7"/>`
    L.ears += `<g class="c-ear-${s < 0 ? 'l' : 'r'}" style="transform-origin:${f(bx)}px ${f(by)}px"><path d="M${f(bx)} ${f(by)} Q${f(bx + s * 1.5)} ${f(ty + len * .35)} ${f(tx)} ${f(ty)}" stroke="${col}" stroke-width="${o.w || 4}" stroke-linecap="round" fill="none"/>${tipS}</g>`
  }
}
/* 씨앗 껍질(달팽이 아기) */
const HUSK = '#D99A5B'
const huskBottom = () => `<path d="M28 84 L35 78.5 L41 85 L48 78.5 L54 85 L60 78.5 L66 85 L72 78.5 L79 85 L85 78.5 L92 84 C92 99 79 109 60 109 C41 109 28 99 28 84 Z" fill="${V(HUSK)}"${line(HUSK, 1.1, .55)} stroke-linejoin="round"/><path d="M36 95 q24 9 48 0" stroke="${lit(HUSK, .4)}" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/>${heart(60, 99, 3.2, lit(HUSK, .35), 'opacity=".8"')}${gloss(42, 90, 6, 3, .55, -15)}`
const huskTop = () => `<path d="M60 26 C82 26 92 58 92 84 L85 78.5 L79 85 L72 78.5 L66 85 L60 78.5 L54 85 L48 78.5 L41 85 L35 78.5 L28 84 C28 58 38 26 60 26 Z" fill="${V(HUSK)}"${line(HUSK, 1.1, .55)} stroke-linejoin="round"/>${gloss(46, 44, 7, 13, .6, 20)}<path d="M60 30 C64 44 64 62 60 76" stroke="${drk(HUSK, .18)}" stroke-width="1.4" fill="none" opacity=".4"/>`

/* ───────── 종마다 (단계마다 실루엣이 바뀐다) ─────────
   반환 L: under(맨 뒤 바닥 쪽) · back(등 — 껍데기·날개, 등 옷을 입어도 남음) · pack(등 소품 — 등 옷이 덮음) · body · ears · head · pattern · crown · neck · held · front · over
   L.A = 옷 기준점(43 §5): top(머리 꼭대기) hy hr ny(목) hx hy2(손) by brx bry(등)  ·  L.F = 얼굴 자리 */
const SP = {
  /* 달팽이: 씨앗알 → 아기(하트 나선) → 꽃 껍데기 → 이끼 집 / 꽃 오두막 → 나무 집 / 유리 온실 */
  snail(st, p, path) {
    const L = Lb()
    if (st === 1) {
      const hy = 64, hr = 24
      L.back = shellG(86, 70, 11, p)
      stalks(L, hy, hr, 6, p.skin, p.skin, 3.6, { w: 4 })
      L.head = headB(60, hy, hr, p.skin)
      L.front = huskBottom() + C(46, 81, 4.6, p.skin) + C(74, 81, 4.6, p.skin)
      L.F = fg(hy, hr, { ey: hy + 2, my: hy + 11, chy: hy + 8 })
      L.A = { top: hy - hr, hy, hr, ny: 80, hx: 60, hy2: 80, by: 92, brx: 20, bry: 12 }
      return L
    }
    const [hy, hr, sx, sy, sr, x1, ft] = { 2: [58, 26, 82, 80, 19, 110, 92], 3: [54, 26, 85, 72, 22, 113, 90], 4: [52, 26, 87, 65, 25, 116, 89], 5: [50, 26.5, 88, 62, 26, 117, 88] }[st]
    const ny = hy + hr * .96
    // 배발(한 덩어리 발) + 꼬리 끝
    L.under = `<g class="c-tail" style="transform-origin:${f(x1 - 14)}px 104px">${E(x1 - 6, 104, 10, 4.6, p.foot, rot(-14, x1 - 6, 104))}</g>` +
      P(`M19 104 C19 ${ft + 3} 32 ${ft} 50 ${ft + 1} C${x1 - 30} ${ft + 2} ${x1 - 8} ${ft + 7} ${x1} 106 C${x1 - 16} 110 32 111 19 104 Z`, p.foot) +
      `<path d="M28 ${ft + 5} Q50 ${ft + 2} ${x1 - 14} ${ft + 8}" stroke="${lit(p.foot, .5)}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`
    L.back = shellG(sx, sy, sr, p, st === 5)
    const top = sy - sr
    if (st === 3) { // 껍데기에 꽃
      L.back += leaf(sx - 2, top + 3, .9, -1) + leaf(sx + 3, top + 2, .8, 1, LEAF2)
      ;[[-160, 6.2], [-112, 7.4], [-62, 6.4], [-18, 5]].forEach(([a, r]) => { const x = sx + sr * .9 * Math.cos(a * Math.PI / 180), y = sy + sr * .9 * Math.sin(a * Math.PI / 180); L.back += daisy(x, y, r, p.flower, p.flowerC) })
    }
    if (st === 4) { // 껍데기 = 창문 달린 집
      const step = (2 * sr + 2) / 4
      L.back += `<g class="c-float d3"><circle cx="${f(sx + 14)}" cy="${f(top - 16)}" r="2.8" fill="#fff" opacity=".85"/><circle cx="${f(sx + 18)}" cy="${f(top - 22)}" r="2" fill="#fff" opacity=".7"/></g>`
      L.back += `<rect x="${f(sx + 10)}" y="${f(top - 10)}" width="7" height="13" rx="1.6" fill="${V(path === 'b' ? '#F6B9CB' : '#C9765A')}"${line('#C9765A', .7)}/><rect x="${f(sx + 9)}" y="${f(top - 11)}" width="9" height="3" rx="1.2" fill="${V(drk(path === 'b' ? '#F6B9CB' : '#C9765A', .1))}"/>`
      L.back += P(`M${f(sx - sr - 1)} ${f(sy - 1)} C${f(sx - sr - 1)} ${f(top - 11)} ${f(sx + sr + 1)} ${f(top - 11)} ${f(sx + sr + 1)} ${f(sy - 1)} q${f(-step / 2)} 6 ${f(-step)} 0 q${f(-step / 2)} 6 ${f(-step)} 0 q${f(-step / 2)} 6 ${f(-step)} 0 q${f(-step / 2)} 6 ${f(-step)} 0 Z`, p.moss)
      L.back += Ef(sx - 6, top - 1, 9, 3.4, lit(p.moss, .35), 'opacity=".7"')
      if (path === 'b') L.back += daisy(sx - 10, top + 1, 4.2, p.flower, p.flowerC) + daisy(sx + 3, top - 3, 4.8, '#FFFFFF', p.flowerC) + daisy(sx + 16, top + 4, 3.8, p.flower, p.flowerC)
      else L.back += `<rect x="${f(sx - 15)}" y="${f(top - 1)}" width="3" height="6" rx="1.4" fill="#F5EBDD"/>` + P(`M${f(sx - 19)} ${f(top)} Q${f(sx - 13.5)} ${f(top - 9)} ${f(sx - 8)} ${f(top)} Z`, '#E8574B') + Ef(sx - 15, top - 3, 1.1, .9, '#fff') + Ef(sx - 11.5, top - 2, .9, .8, '#fff') + daisy(sx + 4, top - 2, 3.4, '#FFFFFF', '#FFD45C')
      const wx = sx + 9, wy = sy + 8
      L.back += path === 'b' ? heart(wx, wy, 8.4, V(p.wood)) + heart(wx, wy + .4, 6, '#FFE7A0') + `<path d="M${wx} ${wy - 3} v8 M${wx - 4.5} ${wy + 1} h9" stroke="${p.wood}" stroke-width="1.3"/>`
        : C(wx, wy, 7.6, p.wood) + C(wx, wy, 5.6, '#FFE7A0') + `<path d="M${wx} ${wy - 5.6} v11.2 M${wx - 5.6} ${wy} h11.2" stroke="${p.wood}" stroke-width="1.4"/>` + gloss(wx - 2, wy - 2.5, 1.6, 1, .9)
      L.held = `<path d="M40 ${f(ny + 22)} L44 ${f(ny - 6)}" stroke="#9B6A3E" stroke-width="3.2" stroke-linecap="round"/>${leaf(44, ny - 6, .62, 1, LEAF2)}${leaf(44, ny - 4, .5, -1)}`
    }
    if (st === 5) { // 등에 작은 집: 나무 집 / 유리 온실
      if (path === 'b') {
        L.back += P(`M${f(sx - 13)} ${f(top + 3)} V${f(top - 8)} A14 14 0 0 1 ${f(sx + 15)} ${f(top - 8)} V${f(top + 3)} Z`, p.glass, 'opacity=".9"')
        L.back += daisy(sx - 6, top - 1, 4, p.flower, p.flowerC) + daisy(sx + 6, top - 4, 4.6, '#FFFFFF', p.flowerC) + leaf(sx + 1, top + 2, .6, -1) + leaf(sx + 10, top + 2, .55, 1)
        L.back += `<path d="M${f(sx + 1)} ${f(top - 22)} V${f(top + 3)} M${f(sx - 13)} ${f(top - 7)} Q${f(sx + 1)} ${f(top - 12)} ${f(sx + 15)} ${f(top - 7)}" stroke="#fff" stroke-width="1.4" fill="none" opacity=".9"/>` + gloss(sx - 7, top - 13, 2.2, 5, .9, 15)
        L.back += `<path d="M${f(sx + 1)} ${f(top - 22)} v-5" stroke="#B88A5A" stroke-width="1.6"/>` + heart(sx + 1, top - 30, 3.2, '#FF5C8D')
        for (let i = 0; i < 4; i++) { const a = (200 + i * 28) * Math.PI / 180; L.back += C(sx + sr * Math.cos(a), sy + sr * Math.sin(a), 2.4, i % 2 ? p.flower : '#fff') }
      } else {
        L.back += `<g class="c-tree" style="transform-origin:${f(sx + 12)}px ${f(top - 4)}px"><path d="M${f(sx + 12)} ${f(top + 2)} C${f(sx + 11)} ${f(top - 8)} ${f(sx + 14)} ${f(top - 14)} ${f(sx + 13)} ${f(top - 20)}" stroke="#93613A" stroke-width="4" fill="none" stroke-linecap="round"/>` +
          C(sx + 4, top - 26, 9.5, p.canopy) + C(sx + 21, top - 22, 9, p.canopy) + C(sx + 13, top - 31, 10.5, p.canopy) + [[1, -27], [13, -35], [22, -20], [9, -24]].map(([x, y]) => C(sx + x, top + y, 1.9, p.fruit)).join('') + '</g>'
        L.back += `<rect x="${f(sx - 9)}" y="${f(top - 2)}" width="26" height="4" rx="2" fill="${V('#A9774A')}"/>` + `<rect x="${f(sx - 6)}" y="${f(top - 14)}" width="18" height="13" rx="2.4" fill="${V(p.wood)}"${line(p.wood, .8)}/>` + P(`M${f(sx - 9)} ${f(top - 13)} L${f(sx + 3)} ${f(top - 24)} L${f(sx + 15)} ${f(top - 13)} Z`, p.roof) + C(sx + 3, top - 8, 3.2, '#FFE7A0') + `<path d="M${f(sx + 3)} ${f(top - 11)} v6 M${f(sx)} ${f(top - 8)} h6" stroke="${drk(p.wood, .2)}" stroke-width="1"/>`
      }
      // 머리에 작은 화관
      let w = ''
      for (let i = 0; i < 5; i++) { const a = (205 + i * 32.5) * Math.PI / 180, x = 60 + hr * .98 * Math.cos(a), y = hy + hr * .92 * Math.sin(a); w += path === 'b' ? daisy(x, y, 3.6, i % 2 ? '#FFFFFF' : p.flower, p.flowerC) : leaf(x, y + 1.5, .55, i < 2 ? -1 : 1, i % 2 ? LEAF2 : LEAF) + (i % 2 ? '' : C(x, y, 2.2, '#FFFFFF')) }
      L.crown = w
    }
    L.body = E(60, ny + 5, 15, 9.5, p.skin) + nub(45, ny + 10, 4.6, 6.2, p.skin, 24) + nub(75, ny + 11, 4.6, 6.2, p.skin, -24)
    stalks(L, hy, hr, 6 + st * 2, p.skin, p.skin, 4.2, { w: 4.4 })
    L.head = headB(60, hy, hr, p.skin)
    L.F = fg(hy, hr)
    L.A = { top: hy - hr, hy, hr, ny, hx: 60, hy2: ny + 10, by: ny + 8, brx: 18, bry: 12, dx: -10 }
    return L
  },

  /* 꿀벌: 벌집 칸 아기 → 솜털 꿀벌(목 털) → 꽃가루 주머니 + 꿀단지 / 꽃바구니 → 큰 날개 넷 + 꽃 관 → 수정 날개 + 등불 */
  bee(st, p, path) {
    const L = Lb()
    if (st === 1) {
      const hy = 62, hr = 23
      L.under = hexC(21, 98, 13.5, lit(p.comb, .18)) + hexC(99, 98, 13.5, lit(p.comb, .18)) + `<path d="${hexD(21, 98, 8.5)}" fill="${drk(p.comb, .12)}" opacity=".5"/><path d="${hexD(99, 98, 8.5)}" fill="${drk(p.comb, .12)}" opacity=".5"/>`
      L.back = hexC(60, 86, 27, drk(p.comb, .2))
      stalks(L, hy, hr, 5, p.stripe, p.stripe, 2.6, { w: 2.2, bx: .3, tx: .45 })
      L.head = headB(60, hy, hr, p.skin) + `<path d="M${60 - 13} ${hy - 12} q13 -5 26 0" stroke="${drk(p.skin, .12)}" stroke-width="1.6" fill="none" opacity=".4" stroke-linecap="round"/>`
      L.front = P('M37 79 L83 79 L87 86 L73.5 109 L46.5 109 L33 86 Z', p.comb) + `<path d="M38 80.5 H82" stroke="${lit(p.comb, .55)}" stroke-width="2.4" stroke-linecap="round"/>` +
        P('M66 79.5 h8 v6.5 a4 4 0 0 1 -8 0 Z', '#FFB21E') + gloss(68.6, 84, 1.2, 2, .9, 0) + gloss(44, 92, 5, 2.4, .5, -10) + C(47, 79, 4.3, p.skin) + C(76, 79, 4.3, p.skin)
      L.F = fg(hy, hr, { ey: hy + 2, my: hy + 10.5, chy: hy + 7.5 })
      L.A = { top: hy - hr, hy, hr, ny: 79, hx: 60, hy2: 80, by: 92, brx: 20, bry: 12 }
      return L
    }
    const [hy, hr, by, brx, bry] = { 2: [52, 26, 92, 19, 15], 3: [50, 26, 90, 21, 17], 4: [48, 26, 88, 22, 19], 5: [47, 26, 87, 23, 20] }[st]
    const ny = hy + hr * .92
    // 날개
    for (const s of [-1, 1]) {
      let w = ''
      if (st <= 3) {
        const wr = st === 2 ? 9.5 : 13.5, x = 60 + s * (brx + wr * .45), y = by - bry - wr * .25
        w = E(x, y, wr, wr * .76, p.wing, `opacity=".92" ${rot(s * 28, x, y)}`) + E(x + s * wr * .2, y + wr * .78, wr * .55, wr * .42, p.wing, `opacity=".9" ${rot(s * 50, x + s * wr * .2, y + wr * .78)}`) + gloss(x - s * wr * .25, y - wr * .3, wr * .35, wr * .16, .9, s * 28)
      } else if (st === 4) {
        const x = 60 + s * (brx + 10), y = by - bry - 8
        w = E(x, y, 21, 14, p.wing, `opacity=".92" ${rot(s * 30, x, y)}`) + E(60 + s * (brx + 5), by - bry + 11, 13, 8.5, p.wing, `opacity=".9" ${rot(s * 48, 60 + s * (brx + 5), by - bry + 11)}`) +
          `<path d="M${f(60 + s * 14)} ${f(by - bry + 2)} Q${f(x)} ${f(y - 2)} ${f(x + s * 15)} ${f(y - 8)}" stroke="#fff" stroke-width="1.3" fill="none" opacity=".9"/>` + gloss(x - s * 6, y - 5, 6, 2.4, .9, s * 30)
      } else {
        const up = [[14, 72], [36, 34], [56, 42], [54, 66], [30, 80]].map(([x, y]) => [60 + s * x, y]), lo = [[16, 84], [44, 86], [38, 102], [20, 98]].map(([x, y]) => [60 + s * x, y])
        const dd = (pts) => 'M' + pts.map(([x, y]) => f(x) + ' ' + f(y)).join(' L') + ' Z'
        w = `<path d="${dd(up)}" fill="${V(p.crystal)}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" opacity=".92"/><path d="${dd(lo)}" fill="${V(p.crystal)}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" opacity=".9"/>` +
          `<path d="M${f(60 + s * 32)} ${f(58)} L${f(up[1][0])} ${f(up[1][1])} M${f(60 + s * 32)} ${f(58)} L${f(up[2][0])} ${f(up[2][1])} M${f(60 + s * 32)} ${f(58)} L${f(up[3][0])} ${f(up[3][1])} M${f(60 + s * 32)} ${f(58)} L${f(up[0][0])} ${f(up[0][1])} M${f(60 + s * 30)} ${f(92)} L${f(lo[1][0])} ${f(lo[1][1])}" stroke="#fff" stroke-width="1" opacity=".8"/>` +
          `<path d="M${f(60 + s * 40)} ${f(45)} L${f(60 + s * 50)} ${f(48)} L${f(60 + s * 46)} ${f(58)} Z" fill="#fff" opacity=".55"/>` + C(60 + s * 44, 66, 1.4, '#fff') + C(60 + s * 26, 46, 1.1, '#fff')
      }
      L.back += `<g class="c-flap ${s > 0 ? 'r' : ''}" style="transform-origin:${f(60 + s * brx * .5)}px ${f(by - bry * .5)}px;--fl:${s * (st === 5 ? 5 : 8)}deg">${w}</g>`
    }
    // 몸 + 줄무늬 + 발 + 팔
    let stripes = ''
    for (const t of st <= 3 ? [-.2, .32] : [-.36, .06, .46]) {
      const yy = by + bry * t, wd = brx * Math.sqrt(1 - t * t) - .8, th = st <= 3 ? 4.6 : 4
      stripes += `<path d="M${f(60 - wd)} ${f(yy - th * .45)} Q60 ${f(yy + th * .7)} ${f(60 + wd)} ${f(yy - th * .45)} L${f(60 + wd * .97)} ${f(yy + th * .6)} Q60 ${f(yy + th * 1.8)} ${f(60 - wd * .97)} ${f(yy + th * .6)} Z" fill="${p.stripe}" opacity=".9"/>`
    }
    L.body = nub(49, by + bry - 2, 6.4, 4.4, p.stripe) + nub(71, by + bry - 2, 6.4, 4.4, p.stripe) + E(60, by, brx, bry, p.skin) + stripes + gloss(60 - brx * .45, by - bry * .45, brx * .22, bry * .13, .6) +
      (st >= 3 ? C(60 - brx * .62, by + bry - 4, 5, p.pollen) + C(60 + brx * .62, by + bry - 4, 5, p.pollen) + gloss(60 - brx * .62 - 1.4, by + bry - 6, 1.6, 1, .9) + gloss(60 + brx * .62 - 1.4, by + bry - 6, 1.6, 1, .9) : '') +
      `<g class="c-arm-l">${nub(60 - brx - .5, by - bry * .2, 4.6, 6.6, p.skin, 30)}</g><g class="c-arm-r">${nub(60 + brx + .5, by - bry * .2, 4.6, 6.6, p.skin, -30)}</g>`
    // 솜털 목도리(꿀벌 표시)
    const n = st === 2 ? 7 : 8, rr = st === 2 ? 4.6 : 5.2, wd = hr * .66
    for (let i = 0; i < n; i++) { const t = i / (n - 1), x = 60 - wd + 2 * wd * t, y = ny + 2.6 * Math.sin(Math.PI * t) - 1; L.neck += C(x, y, rr, p.ruff) }
    L.neck += gloss(60 - wd * .5, ny - 2, 3, 1.2, .9, 0)
    stalks(L, hy, hr, 8 + st * 1.6, p.stripe, p.stripe, 3.6, { w: 2.4, bx: .34, tx: .6 })
    L.head = headB(60, hy, hr, p.skin) + `<path d="M${f(60 - hr * .5)} ${f(hy - hr * .74)} q${f(hr * .5)} -5 ${f(hr)} 0" stroke="${drk(p.skin, .14)}" stroke-width="2" fill="none" opacity=".3" stroke-linecap="round"/>`
    const hx = 60, hyy = by - 1
    if (st === 3) {
      if (path === 'b') L.held = P(`M${hx - 11} ${hyy - 4} h22 l-3 13 h-16 Z`, p.pot) + `<path d="M${hx - 10} ${hyy} h20 M${hx - 9} ${hyy + 4} h18" stroke="${drk(p.pot, .25)}" stroke-width="1" opacity=".5"/>` + daisy(hx - 5, hyy - 6, 3.6, '#fff', '#FFD452') + daisy(hx + 4, hyy - 7, 4, '#FF9EB8', '#FFF1A8') + `<path d="M${hx - 9} ${hyy - 4} Q${hx} ${hyy - 20} ${hx + 9} ${hyy - 4}" stroke="${drk(p.pot, .2)}" stroke-width="1.8" fill="none"/>`
      else L.held = E(hx, hyy + 2, 10, 9, p.pot) + `<rect x="${hx - 7}" y="${hyy - 9}" width="14" height="5" rx="2.5" fill="${V(drk(p.pot, .1))}"/>` + P(`M${hx - 7} ${hyy - 5} q2 6 4 1 q2 7 5 0 q3 5 5 0 l0 -1 Z`, '#FFC93B') + heart(hx, hyy + 3, 3.2, '#FFF4D6', 'opacity=".9"') + gloss(hx - 5, hyy - 1, 2, 3.5, .8, 0)
    }
    if (st === 4) L.held = `<path d="M${hx + 16} ${by + 8} L${hx + 22} ${by - 22}" stroke="#A8743F" stroke-width="3" stroke-linecap="round"/>` + E(hx + 22.6, by - 26, 5.4, 7, '#FFB627') + `<path d="M${hx + 17.6} ${by - 28} h10 M${hx + 17.2} ${by - 25} h10.8 M${hx + 17.8} ${by - 22} h9.6" stroke="#D98A12" stroke-width="1.1" opacity=".8"/>` + P(`M${hx + 22} ${by - 19.5} q1.5 3 0 5 q-1.5 -2 0 -5Z`, '#FFB627')
    if (st === 5) {
      const lx = hx + 26, ly = by - 20
      L.held = `<path d="M${hx + 16} ${by + 6} L${lx} ${ly - 14}" stroke="#A8743F" stroke-width="2.8" stroke-linecap="round"/><g class="c-swing" style="transform-origin:${lx}px ${ly - 14}px"><path d="M${lx} ${ly - 14} v5" stroke="#8B6B4A" stroke-width="1.3"/><ellipse cx="${lx}" cy="${ly + 1}" rx="17" ry="17" fill="url(#kk-glow)" opacity=".75"/>${hexC(lx, ly + 1, 9, path === 'b' ? '#FFD6E3' : '#FFC93B', false)}<path d="${hexD(lx, ly + 1, 5.6, false)}" fill="${path === 'b' ? '#FFF1F5' : '#FFF3B0'}"/>${path === 'b' ? daisy(lx, ly + 1, 3.4, '#FF8FB1', '#FFE07A') : heart(lx, ly + 1.6, 2.6, '#FFB21E')}<rect x="${lx - 5}" y="${ly - 10}" width="10" height="3" rx="1.4" fill="#A8743F"/></g>`
    }
    if (st >= 4) { // 꽃 관(4) · 금 관(5)
      let c = ''
      if (st === 5) c += `<path d="M${f(60 - hr * .72)} ${f(hy - hr * .62)} Q60 ${f(hy - hr * .9)} ${f(60 + hr * .72)} ${f(hy - hr * .62)} L${f(60 + hr * .6)} ${f(hy - hr * .82)} L${f(60 + hr * .32)} ${f(hy - hr * .74)} L60 ${f(hy - hr * 1.12)} L${f(60 - hr * .32)} ${f(hy - hr * .74)} L${f(60 - hr * .6)} ${f(hy - hr * .82)} Z" fill="${V(GOLD)}"${line(GOLD, .8)} stroke-linejoin="round"/>` + `<path d="${hexD(60, hy - hr * .88, 3.6, false)}" fill="${V(p.gem)}"/>` + gloss(58.8, hy - hr * .92, 1, 1.4, .9, 0)
      const ang = st === 5 ? [208, 332] : [205, 237, 270, 303, 335]
      ang.forEach((d, i) => { const a = d * Math.PI / 180, x = 60 + hr * .9 * Math.cos(a), y = hy + hr * .86 * Math.sin(a), r = (st === 4 && i === 2) ? 6.4 : 5; c += path === 'b' ? daisy(x, y, r, '#FFFFFF', '#FFD452') : sunflower(x, y, r, '#FFC21F', '#8A5A2B') })
      L.crown = c
      if (st === 4) L.sy = hy - hr * .86 * .96 - 6
    }
    L.F = fg(hy, hr)
    L.A = { top: hy - hr, hy, hr, ny, hx: 60, hy2: by - 2, by, brx, bry }
    return L
  },

  /* 애벌레: 잎 위의 알 → 아기 애벌레 → 긴 몸 + 잎 가방 → 고치(얼굴 빼꼼) → 나비 */
  worm(st, p, path) {
    const L = Lb()
    const poms = (hy, hr, len, o = {}) => stalks(L, hy, hr, len, drk(p.skin === p.egg ? '#9BD97A' : p.skin, .35), p.pom, o.r || 4.6, { w: 2.4, bx: .3, tx: .5, ...o })
    if (st === 1) {
      const hy = 72, hr = 25
      L.under = P('M8 104 C22 88 64 86 113 97 C92 113 32 115 8 104 Z', '#7CCB6B') + `<path d="M12 104 Q60 96 108 98" stroke="${lit('#7CCB6B', .45)}" stroke-width="1.6" fill="none" opacity=".8"/><path d="M34 101 l6 -5 M58 99 l7 -6 M82 98 l7 -5" stroke="${lit('#7CCB6B', .35)}" stroke-width="1.2" opacity=".7"/>`
      poms(hy, hr, 13, { by: 1.05, bx: .22, tx: .42, r: 4.4 })
      L.head = E(60, hy, hr, 31, p.egg) + gloss(48, 52, 5, 9, .7, 20) + C(42, 66, 3.2, p.eggDot) + C(78, 60, 2.6, p.eggDot) + C(76, 90, 3.4, p.eggDot) + C(45, 93, 2.4, p.eggDot)
      L.pattern = `<path d="M44 50 l4 3.6 l4 -3.6 l4 3.6 l4 -3.6 l4 3.6 l4 -3.6 l4 3.6" stroke="${drk(p.egg, .3)}" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity=".6"/>`
      L.front = nub(37, 86, 4.6, 6, p.egg, 30) + nub(83, 86, 4.6, 6, p.egg, -30)
      L.F = fg(hy, hr, { ey: hy + 3, my: hy + 13, chy: hy + 10, dx: 10.5 })
      L.A = { top: hy - 31, hy, hr, ny: 96, hx: 60, hy2: 92, by: 96, brx: 20, bry: 10 }
      L.sy = hy - 30
      return L
    }
    const segs = (list, sz) => list.slice().reverse().map(([x, y, r], i) => `<g class="c-seg s${i % 3}" style="transform-origin:${f(x)}px ${f(y)}px">` + nub(x - r * .45, y + r * .82, r * .26, r * .2, drk(p.skin, .2)) + nub(x + r * .4, y + r * .84, r * .26, r * .2, drk(p.skin, .2)) + C(x, y, r, p.skin) + C(x - r * .3, y - r * .28, r * .19, p.dot) + C(x + r * .42, y + r * .05, r * .13, p.dot) + gloss(x - r * .42, y - r * .48, r * .3, r * .14, .7) + '</g>').join('')
    if (st === 2 || st === 3) {
      const hy = st === 2 ? 56 : 52, hr = 26
      if (st === 2) L.under = segs([[64, 91, 15], [82, 96, 12.5], [97, 100, 10], [109, 103, 7]])
      else {
        L.under = segs([[60, 92, 15.5], [76, 85, 14], [92, 79, 13.5], [105, 86, 12], [113, 97, 9.5], [117, 105, 6]])
        // 잎 가방(등 옷이 덮는다)
        L.pack = `<g class="c-swing" style="transform-origin:90px 76px">${P('M84 76 C79 58 92 44 108 41 C111 59 102 73 84 76 Z', p.pack)}<path d="M85 74 Q95 60 106 45" stroke="${lit(p.pack, .45)}" stroke-width="1.4" fill="none"/><path d="M80 82 Q91 72 103 80" stroke="${drk(p.pack, .3)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>${path === 'b' ? C(97, 56, 2.2, '#FFF1A8') : ''}</g>`
      }
      L.body = `<g class="c-arm-l">${nub(46, hy + 36, 4.6, 6.2, p.skin, 26)}</g><g class="c-arm-r">${nub(74, hy + 35, 4.6, 6.2, p.skin, -26)}</g>`
      poms(hy, hr, st === 2 ? 11 : 13)
      L.head = headB(60, hy, hr, p.skin)
      L.F = fg(hy, hr)
      L.A = { top: hy - hr, hy, hr, ny: hy + hr * .92, hx: 60, hy2: hy + 34, by: hy + 36, brx: 17, bry: 14 }
      return L
    }
    if (st === 4) { // 고치
      const hy = 50, hr = 23
      for (const s of [-1, 1]) L.back += `<g class="c-flap ${s > 0 ? 'r' : ''}" style="transform-origin:${60 + s * 18}px 74px;--fl:${s * 6}deg">${E(60 + s * 28, 72, 11, 16, p.wing, rot(s * 22, 60 + s * 28, 72))}${C(60 + s * 30, 70, 3.6, p.pat)}</g>`
      L.under = nub(52, 106, 6, 3.6, drk(p.cocoon, .15)) + nub(68, 106, 6, 3.6, drk(p.cocoon, .15))
      L.body = P('M60 20 C88 20 93 46 91 66 C89 88 76 104 60 107 C44 104 31 88 29 66 C27 46 32 20 60 20 Z', p.cocoon) +
        `<path d="M34 76 Q60 66 86 80 M38 88 Q60 80 82 92 M46 99 Q60 94 74 101 M31 62 Q46 58 54 61" stroke="${drk(p.cocoon, .14)}" stroke-width="1.5" fill="none" opacity=".7" stroke-linecap="round"/>` + gloss(41, 72, 4, 12, .6, 10)
      L.head = `<ellipse cx="60" cy="${hy}" rx="${hr + 3.4}" ry="${hr + 1.6}" fill="${drk(p.cocoon, .1)}"/>` + headB(60, hy + 1, hr, p.skinBy[3])
      poms(hy, hr, 12, { by: .95 })
      L.front = nub(50, 82, 4.4, 5.4, p.skinBy[3]) + nub(70, 82, 4.4, 5.4, p.skinBy[3])
      L.F = fg(hy + 1, hr, { my: hy + 12, chy: hy + 9 })
      L.A = { top: hy - hr - 4, hy, hr: 26, ny: 76, hx: 60, hy2: 82, by: 82, brx: 24, bry: 20 }
      return L
    }
    // 나비
    const hy = 48, hr = 26, wy = 64
    for (const s of [-1, 1]) {
      const ux = 60 + s * 31, uy = wy - 4, lx = 60 + s * 23, ly = wy + 30
      let w = E(ux, uy, 27, 22, p.wing, rot(s * -18, ux, uy)) + E(lx, ly, 17, 13.5, p.wing2, rot(s * 24, lx, ly))
      w += E(ux + s * 2, uy + 2, 17, 13, lit(p.wing, .28), `${rot(s * -18, ux + s * 2, uy + 2)} opacity=".7"`)
      if (path === 'b') w += `<path d="M${f(ux - s * 18)} ${f(uy + 8)} q${f(s * 16)} -16 ${f(s * 36)} -12" stroke="${p.pat}" stroke-width="3.4" fill="none" opacity=".85" stroke-linecap="round"/><path d="M${f(ux - s * 14)} ${f(uy + 14)} q${f(s * 14)} -12 ${f(s * 30)} -8" stroke="#FFE3B8" stroke-width="2.2" fill="none" opacity=".75" stroke-linecap="round"/>` + C(lx + s * 3, ly + 1, 4.4, p.pat)
      else w += star5(ux - s * 8, uy + 4, 3, p.pat) + star5(ux + s * 10, uy - 6, 2.2, p.pat) + star5(ux + s * 12, uy + 9, 1.8, '#FFFFFF') + star5(lx + s * 3, ly + 2, 2.6, p.pat)
      w += `<ellipse cx="${f(ux)}" cy="${f(uy)}" rx="27" ry="22" fill="none" stroke="${lit(p.wing, .5)}" stroke-width="1.6" opacity=".8" ${rot(s * -18, ux, uy)}/>` + gloss(ux - s * 8, uy - 10, 6, 2.8, .7, s * -18)
      L.back += `<g class="c-flap ${s > 0 ? 'r' : ''}" style="transform-origin:${f(60 + s * 6)}px ${f(wy + 6)}px;--fl:${s * 10}deg">${w}</g>`
    }
    L.body = nub(52, 104, 5.6, 3.8, drk(p.skin, .2)) + nub(68, 104, 5.6, 3.8, drk(p.skin, .2)) + E(60, 88, 16, 17, p.skin) + Ef(60, 92, 10, 11, V(p.belly)) + gloss(52, 80, 3.4, 2, .6) +
      `<g class="c-arm-l">${nub(44, 86, 4.4, 6.2, p.skin, 30)}</g><g class="c-arm-r">${nub(76, 86, 4.4, 6.2, p.skin, -30)}</g>`
    poms(hy, hr, 16, { curl: true, tx: .62 })
    L.head = headB(60, hy, hr, p.skin)
    L.crown = `<g transform="translate(${f(60 + hr * .62)} ${f(hy - hr * .6)})">` + (path === 'b' ? C(0, 0, 4.6, '#FFB627') + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4; return `<path d="M${f(6.4 * Math.cos(a))} ${f(6.4 * Math.sin(a))} L${f(9 * Math.cos(a))} ${f(9 * Math.sin(a))}" stroke="#FFB627" stroke-width="2" stroke-linecap="round"/>` }).join('') : crescent(0, 0, 6.2, GOLD)) + '</g>'
    L.F = fg(hy, hr)
    L.A = { top: hy - hr, hy, hr, ny: hy + hr * .92, hx: 60, hy2: 88, by: 88, brx: 16, bry: 17 }
    return L
  },

  /* 올챙이 → 개구리: 물방울 알 → 아기 올챙이(잎 모자) → 다리 난 올챙이 → 연잎 위 개구리 → 연잎 양산 왕자 / 꽃잎 양산 공주 */
  frog(st, p, path) {
    const L = Lb()
    const leafHat = (x, y, r, a = -12) => `<g ${rot(a, x, y)}>${P(`M${f(x - r)} ${f(y)} C${f(x - r)} ${f(y - r * .62)} ${f(x + r)} ${f(y - r * .62)} ${f(x + r)} ${f(y)} C${f(x + r * .5)} ${f(y + r * .3)} ${f(x + r * .18)} ${f(y + r * .18)} ${f(x)} ${f(y - r * .1)} C${f(x - r * .18)} ${f(y + r * .18)} ${f(x - r * .5)} ${f(y + r * .3)} ${f(x - r)} ${f(y)} Z`, p.hat)}<path d="M${f(x)} ${f(y - r * .1)} L${f(x)} ${f(y - r * .4)} M${f(x)} ${f(y - r * .2)} L${f(x - r * .55)} ${f(y - r * .25)} M${f(x)} ${f(y - r * .2)} L${f(x + r * .55)} ${f(y - r * .25)}" stroke="${lit(p.hat, .45)}" stroke-width="1" opacity=".9"/></g>`
    const pad = (cx, cy, rx, ry) => `<path d="M${cx} ${cy} L${f(cx + rx * .32)} ${f(cy - ry)} A${rx} ${ry} 0 1 1 ${f(cx - rx * .12)} ${f(cy - ry)} Z" fill="${V(p.pad)}"${line(p.pad, .9)} stroke-linejoin="round"/><path d="M${cx} ${cy} L${f(cx - rx * .7)} ${f(cy + ry * .1)} M${cx} ${cy} L${f(cx + rx * .7)} ${f(cy + ry * .2)} M${cx} ${cy} L${f(cx - rx * .4)} ${f(cy + ry * .7)} M${cx} ${cy} L${f(cx + rx * .4)} ${f(cy + ry * .75)}" stroke="${lit(p.pad, .35)}" stroke-width="1.1" opacity=".7"/>`
    const bub = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#E6F7FF" fill-opacity=".5" stroke="#8FD3EE" stroke-width="1.1"/><circle cx="${f(x - r * .35)}" cy="${f(y - r * .35)}" r="${f(r * .25)}" fill="#fff"/>`
    if (st === 1) {
      const hy = 80, hr = 19
      L.under = pad(60, 106, 32, 6.6)
      L.back = `<g class="c-tail" style="transform-origin:76px 88px">${P('M74 84 C86 80 92 88 90 96 C86 92 80 92 74 94 Z', lit(p.skin, .1))}</g>`
      L.head = headB(60, hy, hr, p.skin, 1.04, 1)
      L.crown = leafHat(61, hy - hr + 1, 9, -10)
      L.over = `<circle cx="60" cy="72" r="32" fill="#DDF5FF" fill-opacity=".38" stroke="#93D8F2" stroke-width="1.5"/><path d="M36 60 A27 27 0 0 1 52 44" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".9"/><circle cx="34" cy="68" r="2" fill="#fff" opacity=".9"/>` + `<g class="c-rise">${bub(98, 44, 3.4)}</g><g class="c-rise d2">${bub(22, 52, 2.6)}</g>`
      L.F = fg(hy, hr, { ey: hy + 2, my: hy + 9.5, chy: hy + 7, e: 5.2, dx: 8 })
      L.A = { top: 40, hy, hr: 24, ny: 96, hx: 60, hy2: 96, by: 96, brx: 18, bry: 10 }
      L.sy = hy - hr - 1
      return L
    }
    if (st <= 3) { // 올챙이
      const hy = st === 2 ? 66 : 58, rx = 30, ry = st === 2 ? 28 : 27
      const tx = st === 2 ? 80 : 76, ty = st === 2 ? 84 : 92
      const tail = st === 2 ? `M${tx - 4} ${ty - 10} C${tx + 14} ${ty - 14} ${tx + 26} ${ty - 28} ${tx + 34} ${ty - 40} C${tx + 38} ${ty - 22} ${tx + 26} ${ty + 2} ${tx - 2} ${ty + 6} Z` : `M${tx - 4} ${ty - 6} C${tx + 10} ${ty - 8} ${tx + 20} ${ty - 16} ${tx + 28} ${ty - 24} C${tx + 32} ${ty - 10} ${tx + 22} ${ty + 6} ${tx - 2} ${ty + 8} Z`
      L.back = `<g class="c-tail" style="transform-origin:${tx}px ${ty}px">${P(tail, lit(p.skin, .12), 'opacity=".96"')}<path d="M${tx} ${ty - 2} Q${tx + (st === 2 ? 20 : 14)} ${ty - (st === 2 ? 14 : 8)} ${tx + (st === 2 ? 32 : 26)} ${ty - (st === 2 ? 36 : 20)}" stroke="${lit(p.skin, .5)}" stroke-width="1.4" fill="none" opacity=".8"/></g>`
      if (st === 3) {
        L.under = nub(40, 104, 7.6, 3.2, p.skin) + nub(80, 104, 7.6, 3.2, p.skin)
        L.body = nub(45, 97, 7, 9, p.skin, 30) + nub(75, 97, 7, 9, p.skin, -30) + E(60, 92, 18, 13.5, p.skin) + Ef(60, 94, 12, 9, V(p.belly)) +
          `<g class="c-arm-l">${nub(46, 88, 3.6, 5.4, p.skin, 24)}</g><g class="c-arm-r">${nub(74, 88, 3.6, 5.4, p.skin, -24)}</g>`
        let nk = ''; for (let i = 0; i < 7; i++) { const t = i / 6, x = 46 + 28 * t, y = hy + ry * .92 - 1 + 6 * Math.sin(Math.PI * t); nk += path === 'b' ? C(x, y, 2.9, p.neck) + Ef(x - .8, y - 1, .8, .8, '#fff', 'opacity=".8"') : P(`M${f(x)} ${f(y - 3.6)} C${f(x + 2.6)} ${f(y - .6)} ${f(x + 2.6)} ${f(y + 2.4)} ${f(x)} ${f(y + 2.4)} C${f(x - 2.6)} ${f(y + 2.4)} ${f(x - 2.6)} ${f(y - .6)} ${f(x)} ${f(y - 3.6)} Z`, p.drop) }
        L.neck = nk
      } else L.body = `<g class="c-arm-l">${nub(36, 80, 4, 6, p.skin, 40)}</g><g class="c-arm-r">${nub(84, 80, 4, 6, p.skin, -40)}</g>`
      L.head = E(60, hy, rx, ry, p.skin) + Ef(60, hy + ry * .42, rx * .64, ry * .44, V(p.belly)) + gloss(60 - rx * .42, hy - ry * .5, rx * .3, ry * .15, .85)
      L.crown = leafHat(63, hy - ry + 2, st === 2 ? 11 : 12.5)
      L.over = `<g class="c-rise">${bub(24, hy - 16, 3)}</g><g class="c-rise d3">${bub(102, hy - 30, 2.4)}</g>`
      L.F = fg(hy, 26, { ey: hy + 3, my: hy + 13, chy: hy + 10, dx: 12, chx: 19, e: 6.8 })
      L.A = { top: hy - ry, hy, hr: 27, ny: hy + ry * .9, hx: 60, hy2: st === 2 ? hy + 26 : 92, by: st === 2 ? hy + 24 : 92, brx: 19, bry: 13 }
      L.sy = hy - ry - 1
      return L
    }
    // 개구리
    const hy = st === 4 ? 58 : 56, rx = st === 4 ? 32 : 33, ry = 24, ey = hy - 20
    L.under = pad(60, 104, st === 4 ? 44 : 46, 8)
    if (st === 5) L.back = P(`M44 ${hy + 18} C38 ${hy + 34} 34 ${hy + 46} 36 ${hy + 50} Q60 ${hy + 56} 84 ${hy + 50} C86 ${hy + 46} 82 ${hy + 34} 76 ${hy + 18} Z`, p.cape) + `<path d="M40 ${hy + 48} Q60 ${hy + 53} 80 ${hy + 48}" stroke="${lit(p.cape, .4)}" stroke-width="2" fill="none"/>`
    const by = hy + 30
    L.body = nub(36, by + 6, 11, 9, p.skin, 30) + nub(84, by + 6, 11, 9, p.skin, -30) +
      [-1, 1].map((s) => C(60 + s * 26, by + 15, 3.2, p.skin) + C(60 + s * 31, by + 14, 3.2, p.skin) + C(60 + s * 35, by + 12, 3, p.skin)).join('') +
      E(60, by, 22, 16, p.skin) + Ef(60, by + 3, 15, 11, V(p.belly)) +
      `<g class="c-arm-l">${nub(46, by + 6, 4.4, 6.4, p.skin, 20)}</g><g class="c-arm-r">${nub(74, by + 6, 4.4, 6.4, p.skin, -20)}</g>`
    for (const s of [-1, 1]) L.ears += C(60 + s * 16, ey, 11, p.skin) + gloss(60 + s * 16 - 4, ey - 5, 3.4, 1.8, .85)
    L.head = E(60, hy, rx, ry, p.skin) + Ef(60, hy + 10, rx * .62, ry * .38, V(p.belly)) + gloss(60 - rx * .5, hy - ry * .45, rx * .22, ry * .14, .75)
    let nk = ''; for (let i = 0; i < 7; i++) { const t = i / 6, x = 44 + 32 * t, y = hy + ry - 2 + 6 * Math.sin(Math.PI * t); nk += path === 'b' ? C(x, y, 3, p.neck) + Ef(x - .8, y - 1, .8, .8, '#fff', 'opacity=".8"') : P(`M${f(x)} ${f(y - 3.6)} C${f(x + 2.6)} ${f(y - .6)} ${f(x + 2.6)} ${f(y + 2.4)} ${f(x)} ${f(y + 2.4)} C${f(x - 2.6)} ${f(y + 2.4)} ${f(x - 2.6)} ${f(y - .6)} ${f(x)} ${f(y - 3.6)} Z`, p.drop) }
    L.neck = nk
    if (st === 4) {
      L.crown = leafHat(60, ey - 8, 9.5, 8)
      L.held = path === 'b' ? C(74, by + 3, 4.8, '#E8455A') + C(72.6, by + 1.6, 1, '#fff') + leaf(74, by - 1.5, .5, 1, LEAF) : P(`M74 ${by - 6} C79 ${by - 2} 79 ${by + 6} 74 ${by + 8} C69 ${by + 6} 69 ${by - 2} 74 ${by - 6} Z`, '#FFC2D3') + P(`M74 ${by - 2} C77 ${by + 1} 77 ${by + 6} 74 ${by + 8} C71 ${by + 6} 71 ${by + 1} 74 ${by - 2} Z`, '#FF8FB1') + `<path d="M74 ${by + 8} v6" stroke="${LEAF2}" stroke-width="2"/>`
      L.sy = ey - 10
    } else {
      let c = ''
      if (path === 'b') { for (let i = 0; i < 5; i++) { const x = 48 + i * 6, y = ey - 9 + Math.abs(i - 2) * 1.6; c += leaf(x, y + 2, .42, i % 2 ? 1 : -1, LEAF) + C(x, y - 1, 3.3, p.crown) + Ef(x - 1, y - 2, .8, .8, '#fff', 'opacity=".8"') } }
      else { for (let i = 0; i < 5; i++) { const a = (i - 2) * .42, x = 60 + 8 * Math.sin(a), y = ey - 4 - 8 * Math.cos(a); c += E(x, y - 3, 3.6, 7, p.crown, rot((i - 2) * 24, x, y - 3)) } c += C(60, ey - 2, 3, p.crownC) }
      L.crown = c
      L.sy = ey - 14
      // 양산: 연잎(왕자) / 꽃잎(공주)
      const px = 96, py = 30
      L.held = `<path d="M76 ${by + 6} L${px} ${py}" stroke="#7A5638" stroke-width="2.6" stroke-linecap="round"/><g class="c-bob" style="transform-origin:${px}px ${py + 8}px">` +
        (path === 'b' ? P(`M${px - 22} ${py + 4} Q${px} ${py - 22} ${px + 22} ${py + 4} q-5.5 -4 -11 0 q-5.5 -4 -11 0 q-5.5 -4 -11 0 q-5.5 -4 -11 0 Z`, p.para) + `<path d="M${px} ${py - 9} L${px - 11} ${py + 3} M${px} ${py - 9} L${px + 11} ${py + 3}" stroke="${lit(p.para, .45)}" stroke-width="1.2"/>` + C(px, py - 10, 2.4, '#FFE07A')
          : P(`M${px - 23} ${py + 4} Q${px} ${py - 22} ${px + 23} ${py + 4} L${px + 4} ${py + 1} L${px} ${py + 6} L${px - 4} ${py + 1} Z`, p.para) + `<path d="M${px} ${py - 9} L${px - 14} ${py + 2} M${px} ${py - 9} L${px + 14} ${py + 2} M${px} ${py - 9} V${py + 2}" stroke="${lit(p.para, .4)}" stroke-width="1.2"/>` + C(px, py - 10, 2, '#FFB3C8')) +
        gloss(px - 10, py - 4, 4, 1.6, .8, -20) + '</g>'
    }
    L.F = { cx: 60, ey: ey + 1, dx: 16, e: 6.4, my: hy + 7, chx: 24, chy: hy + 4 }
    L.A = { top: ey - 11, hy, hr: 28, ny: hy + ry - 2, hx: 60, hy2: by + 4, by, brx: 22, bry: 16 }
    return L
  }
}
function shellG(cx, cy, r, p, gold) {
  let s = C(cx, cy, r, p.shell) + spiral(cx, cy, r * .82, drk(p.shell, .32), Math.max(1.6, r * .1)) + heart(cx + r * .04, cy + r * .06, r * .2, p.heart) + gloss(cx - r * .38, cy - r * .48, r * .3, r * .15, .85)
  if (gold) s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${GOLD}" stroke-width="2.4"/>`
  return s
}
/** 옷 기준점(43 §5). 종·단계·갈래마다 몸 모양이 달라서 그림 함수가 돌려준 값을 쓴다 */
function anchors(st, sp = 'bee', path = 'a') { return { cx: 60, st, ...SP[sp](st, pal(sp, path, st), path).A } }

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
/* 4단계 = 발밑 원판, 5단계 = 부드러운 장면(빛 원판 + 종 장면 조각). 캐릭터 자리에서만 빛(결정 ⑦) */
function aura(sp, st, p, path) {
  if (st === 4) return `<ellipse class="c-mat" cx="60" cy="109" rx="46" ry="7.5" fill="${p.tint}" opacity=".9"/>`
  if (st < 5) return ''
  const id = 'ka' + p.tint.slice(1)
  addDef(id, `<radialGradient id="${id}" cx=".5" cy=".46" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="${p.tint}"/><stop offset="1" stop-color="${p.tint}" stop-opacity="0"/></radialGradient>`)
  let s = `<g class="c-aura"><circle class="c-disc" cx="60" cy="60" r="60" fill="url(#${id})"/>`
  const tuft = (x, y, c) => `<path d="M${x - 5} ${y} q1 -7 3 -10 M${x} ${y} q0 -9 1 -12 M${x + 5} ${y} q-1 -7 -3 -9" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
  if (sp === 'snail') s += tuft(10, 108, LEAF) + tuft(112, 108, LEAF2) + `<g class="c-float">${leaf(14, 46, .8, -1)}</g><g class="c-float d2">${path === 'b' ? C(106, 34, 2.8, '#FF9DB8') + C(102, 30, 2.2, '#FFFFFF') : leaf(104, 34, .7, 1, LEAF2)}</g><g class="c-float d3">${C(16, 80, 2.6, path === 'b' ? '#FF9DB8' : '#FFFFFF')}</g>` + C(8, 104, 3.4, '#C9C2B4') + C(116, 106, 2.8, '#C9C2B4')
  if (sp === 'bee') s += [[10, 26, 0], [110, 30, 2], [8, 64, 3]].map(([x, y, d]) => `<g class="c-float ${d ? 'd' + d : ''}">${hexC(x, y, 5, GOLD, false)}</g>`).join('') + `<path d="M8 108 V96 M112 108 V94" stroke="${LEAF2}" stroke-width="2" stroke-linecap="round"/>` + daisy(8, 94, 4.4, path === 'b' ? '#FFFFFF' : '#FFC21F', path === 'b' ? '#FFD452' : '#8A5A2B') + daisy(112, 92, 5, '#FF9EB8', '#FFF1A8')
  if (sp === 'worm') s += path === 'b' ? `<circle cx="16" cy="24" r="9" fill="${V('#FFC069')}"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4; return `<path d="M${f(16 + 12 * Math.cos(a))} ${f(24 + 12 * Math.sin(a))} L${f(16 + 15 * Math.cos(a))} ${f(24 + 15 * Math.sin(a))}" stroke="#FFC069" stroke-width="2" stroke-linecap="round"/>` }).join('')}<g class="c-float d2">${C(102, 22, 5, '#FFFFFF')}${C(108, 20, 6, '#FFFFFF')}${C(114, 23, 4.4, '#FFFFFF')}</g>`
    : `<g>${crescent(16, 24, 9, '#F7E3A0')}</g><g class="c-twinkle">${star5(108, 18, 3.4, '#F7C948')}</g><g class="c-twinkle d2">${star5(10, 62, 2.8, '#F7C948')}</g><g class="c-twinkle d3">${star5(112, 62, 2.6, '#F7C948')}</g>`
  if (sp === 'frog') {
    const mini = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .32}" fill="${V('#6CC46A')}"/>`
    s += `<path d="M0 106 q7 -5 14 0 t14 0 M92 106 q7 -5 14 0 t14 0" stroke="#6CC0E6" stroke-width="2.4" fill="none" stroke-linecap="round"/>` + mini(12, 96, 9) + mini(110, 98, 8) + [[16, 56, 3.4, ''], [112, 66, 2.6, 'd2'], [8, 80, 3, 'd3']].map(([x, y, r, d]) => `<g class="c-rise ${d}"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#kk-glow)" stroke="#6CC0E6" stroke-width="1.2"/></g>`).join('')
  }
  return s + '</g>'
}

/** 캐릭터 그림. o: { lv, path, eq, mood, detail, size, crop, live, sil, wave, calm, noAura, fit }
 *  fit: 단계 크기 배율을 쓰지 않고 상자를 꽉 채운다(로그인 씨앗처럼 크기 비교가 필요 없는 곳) */
function art(sp, st, o = {}) {
  sp = SPECIES[sp] ? sp : 'worm'
  const path = o.path || 'a', p = pal(sp, path, st), mood = o.mood || 'default'
  const d = o.detail && o.detail !== 'auto' ? o.detail : (o.size && o.size <= 40 ? 'small' : 'full')
  const crop = o.crop || (o.size && o.size <= 40 ? 'bust' : 'full')
  const small = o.size && o.size < 64
  const eq = o.eq || {}, lv = o.lv || STAGES[st].from
  const L = SP[sp](st, p, path), A = { cx: 60, st, dx: 0, ...L.A }
  const T = (x) => A.dx && x ? `<g transform="translate(${A.dx} 0)">${x}</g>` : x   // 달팽이처럼 머리가 가운데에서 비켜난 종: 머리 쪽 층만 옮긴다(옷 기준점은 그대로)
  const k = o.fit ? 1 : SCALE[st]
  const hat = eq.hat && HAT[eq.hat] ? HAT[eq.hat](A) : null
  const sproutY = hat ? hat.tip : (L.sy ?? A.top + 2)
  const wy = st === 1 ? A.hy + 6 : A.hy + A.hr * .5
  const wave = o.wave ? `<g class="c-wave" style="transform-origin:${f(60 + A.hr - 2)}px ${f(wy + 10)}px">${E(60 + A.hr + 4, wy, 5, 7.5, p.skin, rot(-30, 60 + A.hr + 4, wy))}</g>` : ''
  const headG = `<g class="c-head" style="transform-origin:60px ${f(A.ny)}px">${L.ears}${L.head}${L.pattern}${d === 'full' ? marks(sp, L.F, A.hy, A.hr, marksOf(lv)) : ''}${face(L.F, mood, d !== 'full')}${hat ? hat.svg : L.crown}${sprout(st, L.sx, sproutY, budsOf(lv))}</g>`
  const handI = !small && eq.hand && HAND[eq.hand] ? HAND[eq.hand](A) : null
  let inner
  if (st === 1) inner = L.under + L.back + L.body + headG + L.front + (handI || '') + L.over + wave
  else {
    const backI = !small && eq.back && BACK[eq.back] ? BACK[eq.back](A) : null
    const neckI = !small && eq.neck && NECK[eq.neck] ? NECK[eq.neck](A) : null
    inner = L.under + L.back + T(backI ? backI.behind : '') + (backI ? '' : L.pack) + T(L.body + (backI ? backI.front : '') + headG + (neckI ?? L.neck) + (handI ?? L.held)) + L.front + L.over + T(wave)
  }
  const auraS = d === 'full' && crop === 'full' && !o.noAura ? aura(sp, st, p, path) : ''
  const sy = (y) => 108 - (108 - y) * k
  let vb = '0 0 120 120'
  if (crop === 'bust') { const t = sy(A.hy - A.hr - 13), b = sy(A.hy + A.hr + 8), h = b - t; vb = `${f(60 + A.dx * k - h / 2)} ${f(t)} ${f(h)} ${f(h)}` }
  const cls = `chr sp-${sp} st-${st}${o.live ? ' live' : ''}${o.sil ? ' sil' : ''}${o.calm ? ' calm' : ''}`
  const sz = o.size ? ` width="${o.size}" height="${o.size}"` : ''
  const shW = st === 1 ? 30 : sp === 'snail' ? 44 + st * 2 : 24 + st * 3
  return `<svg class="${cls}" viewBox="${vb}"${sz} role="img" aria-label="${SPECIES[sp].name} ${STAGES[st].name}"><g class="c-scale" transform="translate(60 108) scale(${k}) translate(-60 -108)">${auraS}<ellipse class="c-shadow" cx="${sp === 'snail' && st > 1 ? 70 : 60}" cy="109.5" rx="${shW}" ry="5.5" fill="url(#kk-ao)"/><g class="c-hop"><g class="c-sway"><g class="c-breath">${inner}</g></g></g></g></svg>`
}
/** 아기 단계를 덮는 뚜껑(부화 전 모습): 달팽이 씨앗 윗껍질 · 꿀벌 밀랍 뚜껑 · 애벌레 알 윗부분 · 올챙이 물방울 막 */
function hatchTop(sp = 'snail', fit = false) {
  const k = fit ? 1 : SCALE[1]
  let s
  if (sp === 'bee') s = hexC(60, 64, 27.5, '#F7CB62') + `<path d="${hexD(60, 64, 20)}" fill="none" stroke="${lit('#F7CB62', .5)}" stroke-width="2" opacity=".8"/>` + gloss(48, 52, 5, 9, .7, 20) + heart(60, 66, 4, '#E7A93A', 'opacity=".6"')
  else if (sp === 'worm') s = `<path d="M33 62 C33 34 46 24 60 24 C74 24 87 34 87 62 L82 58 L77 62 L72 58 L67 62 L62 58 L57 62 L52 58 L47 62 L42 58 L37 62 Z" fill="${V('#FFF6E4')}"${line('#FFF6E4', 1.1, .7)} stroke-linejoin="round"/>` + C(46, 44, 3, '#C9EBA8') + C(72, 38, 2.4, '#C9EBA8') + gloss(47, 38, 5, 8, .7, 20)
  else if (sp === 'frog') s = `<circle cx="60" cy="72" r="33" fill="#E6F7FF" fill-opacity=".92" stroke="#93D8F2" stroke-width="1.6"/><path d="M36 60 A27 27 0 0 1 52 44" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="60" cy="80" r="10" fill="#BCE8F7" opacity=".7"/>`
  else s = huskTop()
  return `<g transform="translate(60 108) scale(${k}) translate(-60 -108)">${s}</g>`
}
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
  SPECIES, STAGES, stageOf, need, PATHS, TITLE12, titleOf, MARK, SLOTS, ITEMS, DECOR, SEASON, byId, budsOf, marksOf, PAL0, pal, anchors, SCALE, SCALE_X, NEWPART, hexC, heart, sunflower,
  art, hatchTop, itemIcon, scene, sky, hills, mound, decorSvg, decorIcon, sceneIcon, shelf, logo, icon, BG }
})()
