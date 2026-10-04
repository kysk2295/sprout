// 한국어 조사: 앞말의 받침에 맞춰 이/가, 은/는, 을/를, (으)로를 고른다. 숫자는 읽는 소리로 판단한다.
const DIGIT_BATCHIM = [true, true, false, true, false, false, true, true, true, false] // 영 일 이 삼 사 오 육 칠 팔 구
function lastSound(word: string): { batchim: boolean; rieul: boolean } {
  const ch = word.trim().slice(-1)
  if (/\d/.test(ch)) return { batchim: DIGIT_BATCHIM[Number(ch)], rieul: ch === '1' || ch === '7' || ch === '8' }
  const code = ch.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return { batchim: false, rieul: false }
  const jong = code % 28
  return { batchim: jong !== 0, rieul: jong === 8 }
}
export const iGa = (w: string) => `${w}${lastSound(w).batchim ? '이' : '가'}`
export const eunNeun = (w: string) => `${w}${lastSound(w).batchim ? '은' : '는'}`
export const eulReul = (w: string) => `${w}${lastSound(w).batchim ? '을' : '를'}`
export const ro = (w: string) => { const s = lastSound(w); return `${w}${s.batchim && !s.rieul ? '으로' : '로'}` }
