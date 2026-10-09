// 글자 로고 "꿈틀 / Kkumteul" — 45 결정 ④(2026-10-09 확정): 글꼴 조판이 아니라 직접 그린 획.
// 씨앗 친구 로고와 같은 말투: 굵은 한 굵기 선, 끝·꺾임을 모두 둥글게. ㄲ 두 번째 ㄱ의 세로획이 위로 뚫고 나와 새싹이 된다.
// 의존성 없음. 모든 좌표는 이 파일에서 새로 그린 것이다(글꼴 윤곽을 따오지 않았다).
//
//   import { wordKo, wordEn, lockup } from './wordmark.mjs'
//   node scripts/brand/wordmark.mjs   → docs/release/brand/kkumteul/wordmark-*.svg, lockup-*.svg

/** 꿈틀 — 글자 상자 x 0~224, y -26~136 (획 굵기 14) */
export const KO = { w: 14, box: [-9, -30, 242, 175] }
export function wordKo({ ink = '#13201C', leaf = '#3DB79B', leaf2 = leaf } = {}) {
  const w = KO.w
  const st = `fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`
  // 꿈: ㄲ(두 ㄱ) · ㅜ · ㅁ
  const kkum = [
    'M6 8 H35 Q41 8 41 14 V44', // ㄱ
    'M61 8 H90 Q96 8 96 14 V44', // ㄱ (세로획이 새싹 줄기로 이어진다 — 아래 sprout)
    'M2 64 H102', // ㅜ 가로
    'M52 64 V82', // ㅜ 내림
    'M22 96 H82 V130 H22 Z' // ㅁ
  ]
  // 틀: ㅌ · ㅡ · ㄹ
  const teul = [
    'M206 8 H128 V48 H208', // ㅌ 바깥(ㄷ)
    'M128 28 H200', // ㅌ 가운데
    'M120 68 H218', // ㅡ
    'M128 88 H204 Q210 88 210 94 V103 Q210 109 204 109 H134 Q128 109 128 115 V124 Q128 130 134 130 H210' // ㄹ
  ]
  // 새싹: ㄲ 두 번째 ㄱ의 꺾인 자리(96, 8)에서 위로
  const sprout = `<path d="M96 14 V-6" ${st}/>` +
    `<path transform="translate(96 -8) scale(1.25)" d="M-1 1 C-8 1 -15 -3 -17 -12 C-8 -13 -2 -8 -1 1 Z" fill="${leaf2}"/>` +
    `<path transform="translate(96 -8) scale(1.25)" d="M1 0 C2 -9 8 -15 18 -15 C18 -5 11 0 1 0 Z" fill="${leaf}"/>`
  return [...kkum, ...teul].map((d) => `<path d="${d}" ${st}/>`).join('') + sprout
}

/** Kkumteul — 기준선 y 72, x 높이 26(소문자 위 y 26), 대문자·올림 y 0. 획 굵기 11 */
export const EN = { w: 11, box: [-7, -7, 403, 86] }
export function wordEn({ ink = '#13201C' } = {}) {
  const st = `fill="none" stroke="${ink}" stroke-width="${EN.w}" stroke-linecap="round" stroke-linejoin="round"`
  const at = (x, d) => `<path transform="translate(${x} 0)" d="${d}" ${st}/>`
  return [
    at(0, 'M0 0 V72 M36 0 L6 36 M16 26 L40 72'), // K
    at(54, 'M0 0 V72 M30 26 L4 50 M13 43 L32 72'), // k
    at(102, 'M0 26 V52 C0 65 7 72 18 72 C29 72 36 65 36 52 V26 M36 52 V72'), // u
    at(154, 'M0 72 V26 M0 44 C0 32 6 26 15 26 C24 26 29 32 29 44 V72 M29 44 C29 32 35 26 44 26 C53 26 58 32 58 44 V72'), // m
    at(228, 'M9 4 V60 C9 68 13 72 20 72 H24 M0 28 H24'), // t
    at(266, 'M3 49 H41 C41 35 33 26 22 26 C10 26 3 36 3 49 C3 63 11 72 23 72 C30 72 36 69 40 63'), // e
    at(324, 'M0 26 V52 C0 65 7 72 18 72 C29 72 36 65 36 52 V26 M36 52 V72'), // u
    at(378, 'M0 0 V62 C0 68 3 72 9 72') // l
  ].join('')
}

const svg = (vb, body, w, h, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}"${w ? ` width="${w}" height="${h}"` : ''} role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`

export const koSvg = (o = {}) => svg(KO.box, wordKo(o), o.width, o.width ? Math.round((o.width * KO.box[3]) / KO.box[2]) : 0, '꿈틀')
export const enSvg = (o = {}) => svg(EN.box, wordEn(o), o.width, o.width ? Math.round((o.width * EN.box[3]) / EN.box[2]) : 0, 'Kkumteul')

/**
 * 가로 짝(아이콘 + 꿈틀 + 아래 Kkumteul) — icon: 100 판 아이콘 몸(svg 안쪽 문자열, viewBox 0 0 100 100)
 * 결과 viewBox는 0 0 W 200 (높이 200 단위)
 */
export function lockup({ icon, ink, sub, leaf, leaf2, en = true }) {
  const iconSize = 180
  const ko = `<g transform="translate(${iconSize + 46} ${en ? 34 : 50}) scale(${en ? 0.74 : 0.86})">${wordKo({ ink, leaf, leaf2 })}</g>`
  const enG = en ? `<g transform="translate(${iconSize + 50} 158) scale(.30)">${wordEn({ ink: sub })}</g>` : ''
  const W = iconSize + 46 + Math.ceil(232 * (en ? 0.74 : 0.86)) + 10
  return { w: W, h: 200, body: `<svg x="0" y="10" width="${iconSize}" height="${iconSize}" viewBox="0 0 100 100">${icon}</svg>${ko}${enG}` }
}
